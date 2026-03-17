
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Users, Database, Key, CheckCircle, XCircle, Plus, Trash2, Power, X, Edit, Lock, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

// Types for local state
interface Company {
    id: string;
    name: string;
    cnpj?: string;
    createdAt: string;
}

interface UserData {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'USER';
    status?: 'Active' | 'Inactive'; // Backend doesn't have status yet, but UI does
    createdAt: string;
    companyId?: string;
    company?: Company;
}

export const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'users' | 'companies'>('users');
  const [users, setUsers] = useState<UserData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // User Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  
  // Company Modal State
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [companyFormData, setCompanyFormData] = useState({ name: '', cnpj: '' });

  // Limpeza de DB States
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearType, setClearType] = useState<'ALL' | 'DELIVERED_7_DAYS'>('ALL');
  const [clearPassword, setClearPassword] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  
  // Form State (User)
  const [formData, setFormData] = useState({
      name: '',
      email: '',
      role: 'USER' as 'ADMIN' | 'USER',
      companyId: '',
      password: ''
  });

  // Fetch Users & Companies
  const fetchData = async () => {
      setLoading(true);
      try {
          const [usersRes, companiesRes] = await Promise.all([
              fetch('/api/users'),
              fetch('/api/companies')
          ]);

          if (usersRes.ok) setUsers(await usersRes.json());
          if (companiesRes.ok) setCompanies(await companiesRes.json());
          
      } catch (err) {
          console.error(err);
          setError('Erro ao carregar dados');
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      if (user?.email === 'admin@avantracking.com.br') {
          fetchData();
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
              companyId: userToEdit.companyId || '',
              password: '' // Don't show existing password
          });
      } else {
          setEditingUser(null);
          setFormData({
              name: '',
              email: '',
              role: 'USER',
              companyId: '',
              password: ''
          });
      }
      setIsModalOpen(true);
  };
  
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        const response = await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(companyFormData)
        });
        
        if (response.ok) {
            fetchData();
            setIsCompanyModalOpen(false);
            setCompanyFormData({ name: '', cnpj: '' });
        } else {
            alert('Erro ao criar empresa');
        }
    } catch (err) {
        alert('Erro ao criar empresa');
    }
  };

  const handleDeleteCompany = async (id: string) => {
      if (!window.confirm('Tem certeza? Isso pode afetar usuários vinculados.')) return;
      await fetch(`/api/companies/${id}`, { method: 'DELETE' });
      fetchData();
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
              const error = await response.json();
              throw new Error(error.error || 'Failed to save user');
          }

          setIsModalOpen(false);
          fetchData();
      } catch (err: any) {
          alert(err.message);
      }
  };

  const handleDeleteUser = async (id: string) => {
      if (!window.confirm('Tem certeza que deseja remover este usuário?')) return;
      
      try {
          const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
          if (!response.ok) throw new Error('Failed to delete user');
          fetchData();
      } catch (err) {
          console.error(err);
          alert('Erro ao deletar usuário');
      }
  };

  const handleClearDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clearPassword !== '172839') {
        alert('Senha incorreta.');
        return;
    }

    setIsClearing(true);
    try {
        const response = await fetch('/api/orders/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: clearType, password: clearPassword })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Erro ao limpar banco de dados');
        }

        const result = await response.json();
        alert(result.message || 'Operação realizada com sucesso!');
        setIsClearModalOpen(false);
        setClearPassword('');
    } catch (error: any) {
        alert(error.message);
    } finally {
        setIsClearing(false);
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

  if (loading) return (
    <div className="flex justify-center items-center p-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header Tabs */}
      <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Painel Administrativo
          </h2>
          
          <div className="flex gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
              <button
                  onClick={() => setActiveTab('users')}
                  className={clsx(
                      "px-4 py-2 rounded-md text-sm font-medium transition-all",
                      activeTab === 'users' ? "bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                  )}
              >
                  Usuários
              </button>
              <button
                  onClick={() => setActiveTab('companies')}
                  className={clsx(
                      "px-4 py-2 rounded-md text-sm font-medium transition-all",
                      activeTab === 'companies' ? "bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                  )}
              >
                  Empresas
              </button>
          </div>
      </div>

      {activeTab === 'users' && (
        <div className="glass-card rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
            <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 flex justify-between items-center">
            <h3 className="font-semibold text-slate-800 dark:text-white">Controle de Usuários</h3>
            <button 
                onClick={() => handleOpenModal()}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
                <Plus className="w-4 h-4" /> Novo Usuário
            </button>
            </div>
            
            <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                <tr>
                    <th className="px-6 py-3">Nome</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">Função</th>
                    <th className="px-6 py-3">Empresa</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                </tr>
                </thead>
                <tbody>
                {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{u.name}</td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{u.email}</td>
                    <td className="px-6 py-4">
                        <span className={clsx(
                        "px-2 py-1 rounded-full text-xs font-semibold border",
                        u.role === 'ADMIN' 
                            ? "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800"
                            : "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
                        )}>
                        {u.role}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                        {u.company?.name || <span className="text-slate-300 italic">Sem empresa</span>}
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                        Ativo
                        </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                        <button 
                            onClick={() => handleOpenModal(u)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        >
                            <Edit className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        </div>
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        </div>
      )}

      {activeTab === 'companies' && (
        <div className="glass-card rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
            <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 flex justify-between items-center">
                <h3 className="font-semibold text-slate-800 dark:text-white">Gerenciamento de Empresas</h3>
                <button 
                    onClick={() => setIsCompanyModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-4 h-4" /> Nova Empresa
                </button>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                        <tr>
                            <th className="px-6 py-3">Nome da Empresa</th>
                            <th className="px-6 py-3">CNPJ</th>
                            <th className="px-6 py-3 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {companies.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                                    Nenhuma empresa cadastrada.
                                </td>
                            </tr>
                        ) : (
                            companies.map((c) => (
                                <tr key={c.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{c.name}</td>
                                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{c.cnpj || '-'}
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => handleDeleteCompany(c.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* DB Management */}
      <div className="glass-card rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 mt-6">
        <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
          <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-red-500" />
            Manutenção de Banco de Dados
          </h3>
        </div>
        <div className="p-6 flex flex-col md:flex-row gap-4">
          <button
            onClick={() => {
              setClearType('DELIVERED_7_DAYS');
              setIsClearModalOpen(true);
            }}
            className="flex-1 bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 px-4 py-3 rounded-lg text-sm font-medium hover:bg-yellow-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            Limpar pedidos com status Entregue há mais de 7 dias
          </button>

          <button
            onClick={() => {
              setClearType('ALL');
              setIsClearModalOpen(true);
            }}
            className="flex-1 bg-red-500/10 text-red-600 border border-red-500/20 px-4 py-3 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Limpar banco de dados de pedidos (TUDO)
          </button>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-card bg-white dark:bg-dark-card w-full max-w-md rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
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
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Email</label>
                <input 
                  type="email" 
                  required
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Empresa</label>
                <select
                  value={formData.companyId}
                  onChange={e => setFormData({...formData, companyId: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                >
                    <option value="">Selecione uma empresa...</option>
                    {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Se não selecionar, o usuário não terá acesso a pedidos.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Função</label>
                  <select 
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value as any})}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                  >
                    <option value="USER">Usuário</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    {editingUser ? 'Nova Senha (opcional)' : 'Senha'}
                  </label>
                  <div className="relative">
                    <input 
                      type="password" 
                      required={!editingUser}
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      placeholder={editingUser ? "Manter atual" : "******"}
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-3 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-2 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  Salvar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Company Modal */}
      {isCompanyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-card bg-white dark:bg-dark-card w-full max-w-md rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Nova Empresa</h3>
              <button onClick={() => setIsCompanyModalOpen(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5"/></button>
            </div>
            
            <form onSubmit={handleSaveCompany} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Nome da Empresa</label>
                <input 
                  type="text" 
                  required
                  value={companyFormData.name}
                  onChange={e => setCompanyFormData({...companyFormData, name: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">CNPJ (Opcional)</label>
                <input 
                  type="text" 
                  value={companyFormData.cnpj}
                  onChange={e => setCompanyFormData({...companyFormData, cnpj: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsCompanyModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-2 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  Criar Empresa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* DB Clear Confirmation Modal */}
      {isClearModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="glass-card bg-white dark:bg-dark-card w-full max-w-md rounded-xl p-6 shadow-2xl animate-in zoom-in-95 border border-red-500/20">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5" />
                          Atenção: Ação Destrutiva
                      </h3>
                      <button onClick={() => { setIsClearModalOpen(false); setClearPassword(''); }} className="text-slate-500 hover:text-white"><X className="w-5 h-5"/></button>
                  </div>
                  
                  <div className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                      Você está prestes a <strong>{clearType === 'ALL' ? 'APAGAR TODOS OS PEDIDOS' : 'APAGAR PEDIDOS ENTREGUES HÁ MAIS DE 7 DIAS'}</strong> do banco de dados. 
                      Esta ação não pode ser desfeita.
                  </div>

                  <form onSubmit={handleClearDatabase} className="space-y-4">
                      <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                              Digite a senha de segurança para confirmar:
                          </label>
                          <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input 
                                  type="password" 
                                  required
                                  value={clearPassword}
                                  onChange={e => setClearPassword(e.target.value)}
                                  placeholder="Senha de segurança"
                                  className="w-full bg-slate-50 dark:bg-white/5 border border-red-200 dark:border-red-900/30 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-red-500 outline-none"
                              />
                          </div>
                      </div>

                      <div className="pt-4 flex gap-3">
                          <button 
                              type="button" 
                              onClick={() => { setIsClearModalOpen(false); setClearPassword(''); }}
                              className="flex-1 px-4 py-2 rounded-lg font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
                          >
                              Cancelar
                          </button>
                          <button 
                              type="submit" 
                              disabled={isClearing || !clearPassword}
                              className="flex-1 px-4 py-2 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                          >
                              {isClearing ? 'Apagando...' : 'Confirmar Exclusão'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

    </div>
  );
};
