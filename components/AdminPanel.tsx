
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Users, Database, Key, CheckCircle, XCircle, Plus, Trash2, Power, X, Edit, Lock } from 'lucide-react';
import { clsx } from 'clsx';

// Types for local state
interface UserData {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'USER';
    status?: 'Active' | 'Inactive'; // Backend doesn't have status yet, but UI does
    createdAt: string;
}

export const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
      name: '',
      email: '',
      role: 'USER' as 'ADMIN' | 'USER',
      password: ''
  });

  // Fetch Users
  const fetchUsers = async () => {
      try {
          const response = await fetch('/api/users');
          if (!response.ok) throw new Error('Failed to fetch users');
          const data = await response.json();
          setUsers(data);
      } catch (err) {
          console.error(err);
          setError('Erro ao carregar usuários');
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      if (user?.email === 'admin@avantracking.com.br') {
          fetchUsers();
      }
  }, [user]);

  // Actions
  const handleOpenModal = (userToEdit?: UserData) => {
      if (userToEdit) {
          setEditingUser(userToEdit);
          setFormData({
              name: userToEdit.name,
              email: userToEdit.email,
              role: userToEdit.role,
              password: '' // Don't show existing password
          });
      } else {
          setEditingUser(null);
          setFormData({
              name: '',
              email: '',
              role: 'USER',
              password: ''
          });
      }
      setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
      e.preventDefault();
      
      try {
          const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
          const method = editingUser ? 'PUT' : 'POST';
          
          const body: any = { ...formData };
          if (!body.password && editingUser) delete body.password; // Don't send empty password on update

          const response = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
          });

          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to save user');
          }

          await fetchUsers();
          setIsModalOpen(false);
      } catch (err: any) {
          alert(err.message);
      }
  };

  const handleDeleteUser = async (id: string) => {
      if (!window.confirm('Tem certeza que deseja remover este usuário?')) return;
      
      try {
          const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
          if (!response.ok) throw new Error('Failed to delete user');
          await fetchUsers();
      } catch (err) {
          console.error(err);
          alert('Erro ao deletar usuário');
      }
  };

  // Access Control: Only specific admin email
  if (user?.email !== 'admin@avantracking.com.br') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
        <Shield className="w-16 h-16 mb-4 text-red-500 opacity-50" />
        <h2 className="text-2xl font-bold">Acesso Negado</h2>
        <p>Apenas o administrador principal pode gerenciar usuários.</p>
        <p className="text-sm mt-2">Logado como: {user?.email}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-neon-purple" />
            Painel Administrativo
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Gerenciamento de acessos e configurações do sistema.</p>
        </div>
        <button 
            onClick={() => handleOpenModal()}
            className="bg-neon-purple/10 text-neon-purple border border-neon-purple/20 px-4 py-2 rounded-lg text-sm font-medium hover:bg-neon-purple/20 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4"/> Novo Usuário
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-xl relative overflow-hidden group">
           <div className="absolute right-0 top-0 w-24 h-24 bg-blue-500/10 rounded-bl-full transition-transform group-hover:scale-110"></div>
           <Users className="w-8 h-8 text-blue-500 mb-2" />
           <h3 className="text-3xl font-bold text-slate-800 dark:text-white">{users.length}</h3>
           <p className="text-slate-500 text-sm">Usuários Cadastrados</p>
        </div>
        <div className="glass-card p-6 rounded-xl relative overflow-hidden group">
           <div className="absolute right-0 top-0 w-24 h-24 bg-green-500/10 rounded-bl-full transition-transform group-hover:scale-110"></div>
           <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
           <h3 className="text-3xl font-bold text-slate-800 dark:text-white">{users.filter(u => u.role === 'ADMIN').length}</h3>
           <p className="text-slate-500 text-sm">Administradores</p>
        </div>
        <div className="glass-card p-6 rounded-xl relative overflow-hidden group">
           <div className="absolute right-0 top-0 w-24 h-24 bg-purple-500/10 rounded-bl-full transition-transform group-hover:scale-110"></div>
           <Database className="w-8 h-8 text-purple-500 mb-2" />
           <h3 className="text-3xl font-bold text-slate-800 dark:text-white">Postgres</h3>
           <p className="text-slate-500 text-sm">Status do Banco de Dados</p>
        </div>
      </div>

      {/* User Table */}
      <div className="glass-card rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
        <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
          <h3 className="font-semibold text-slate-800 dark:text-white">Controle de Usuários</h3>
        </div>
        
        {loading ? (
            <div className="p-8 text-center text-slate-500">Carregando usuários...</div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-white/5">
                    <tr>
                      <th className="px-6 py-3">Usuário</th>
                      <th className="px-6 py-3">Email</th>
                      <th className="px-6 py-3">Função</th>
                      <th className="px-6 py-3">Criado em</th>
                      <th className="px-6 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{u.name}</td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{u.email}</td>
                        <td className="px-6 py-4">
                          <span className={clsx(
                            "px-2 py-1 rounded-full text-xs font-bold",
                            u.role === 'ADMIN' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          )}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                           {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                                onClick={() => handleOpenModal(u)}
                                className="text-slate-400 hover:text-accent p-2 tooltip" title="Editar / Alterar Senha"
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                            {u.email !== 'admin@avantracking.com.br' && (
                                <button 
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="text-slate-400 hover:text-red-500 p-2" title="Remover"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
        )}
      </div>

      {/* Add/Edit User Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="glass-card bg-white dark:bg-dark-card w-full max-w-md rounded-xl p-6 shadow-2xl animate-in zoom-in-95 border border-slate-200 dark:border-white/10">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                          {editingUser ? 'Editar Usuário' : 'Adicionar Novo Usuário'}
                      </h3>
                      <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5"/></button>
                  </div>
                  
                  <form onSubmit={handleSaveUser} className="space-y-4">
                      <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Nome Completo</label>
                          <input 
                              type="text" 
                              required
                              value={formData.name}
                              onChange={e => setFormData({...formData, name: e.target.value})}
                              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:border-neon-purple outline-none"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Email</label>
                          <input 
                              type="email" 
                              required
                              disabled={!!editingUser} // Cannot change email
                              value={formData.email}
                              onChange={e => setFormData({...formData, email: e.target.value})}
                              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:border-neon-purple outline-none disabled:opacity-50"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                              Senha {editingUser && '(Deixe em branco para manter a atual)'}
                          </label>
                          <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input 
                                  type="text" 
                                  required={!editingUser}
                                  value={formData.password}
                                  onChange={e => setFormData({...formData, password: e.target.value})}
                                  placeholder={editingUser ? "••••••••" : "Digite a senha"}
                                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-neon-purple outline-none"
                              />
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Permissão</label>
                          <select 
                              value={formData.role}
                              onChange={e => setFormData({...formData, role: e.target.value as 'ADMIN' | 'USER'})}
                              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:border-neon-purple outline-none"
                          >
                              <option value="USER">Usuário (Visualização)</option>
                              <option value="ADMIN">Administrador (Total)</option>
                          </select>
                      </div>

                      <div className="pt-4 flex gap-3">
                          <button 
                              type="button" 
                              onClick={() => setIsModalOpen(false)}
                              className="flex-1 px-4 py-2 border border-slate-200 dark:border-white/10 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                          >
                              Cancelar
                          </button>
                          <button 
                              type="submit"
                              className="flex-1 px-4 py-2 bg-neon-purple hover:bg-purple-600 text-white rounded-lg font-medium shadow-lg shadow-purple-500/20"
                          >
                              {editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};
