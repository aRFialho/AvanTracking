import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { TrayIntegrationStatus } from "../types";
import {
  Shield,
  Users,
  Database,
  Key,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Power,
  X,
  Edit,
  Link2,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { clsx } from "clsx";
import { fetchWithAuth } from "../utils/authFetch";

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
  role: "ADMIN" | "USER";
  status?: "Active" | "Inactive"; // Backend doesn't have status yet, but UI does
  createdAt: string;
  companyId?: string;
  company?: Company;
}

const getInitialTab = (
  canManageAdminPanel: boolean,
): "users" | "companies" | "integration" => {
  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab");

  if (requestedTab === "integration") {
    return "integration";
  }

  if (canManageAdminPanel && requestedTab === "companies") {
    return "companies";
  }

  return canManageAdminPanel ? "users" : "integration";
};

export const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  const canManageAdminPanel = user?.email === "admin@avantracking.com.br";

  const [activeTab, setActiveTab] = useState<
    "users" | "companies" | "integration"
  >(() => getInitialTab(canManageAdminPanel));
  const [users, setUsers] = useState<UserData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trayStoreUrl, setTrayStoreUrl] = useState("");
  const [trayStatus, setTrayStatus] = useState<TrayIntegrationStatus>({
    authorized: false,
    status: "offline",
    storeId: null,
    storeName: null,
    updatedAt: null,
    message: "Nenhuma integracao Tray autorizada.",
  });
  const [isCheckingTrayStatus, setIsCheckingTrayStatus] = useState(false);

  // User Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);

  // Company Modal State
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [companyFormData, setCompanyFormData] = useState({
    name: "",
    cnpj: "",
  });

  // Limpeza de DB States
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearType, setClearType] = useState<"ALL" | "DELIVERED_7_DAYS">("ALL");
  const [clearPassword, setClearPassword] = useState("");
  const [isClearing, setIsClearing] = useState(false);

  // Form State (User)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "USER" as "ADMIN" | "USER",
    companyId: "",
    password: "",
  });

  // Fetch Users & Companies
  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, companiesRes] = await Promise.all([
        fetchWithAuth("/api/users"),
        fetchWithAuth("/api/companies"),
      ]);

      console.log("Users response:", usersRes.status, usersRes.ok);
      console.log("Companies response:", companiesRes.status, companiesRes.ok);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        console.log("Usuários carregados:", usersData.length);
        setUsers(usersData);
      } else {
        const errorData = await usersRes.json().catch(() => ({}));
        console.error("Erro ao carregar usuários:", usersRes.status, errorData);
        setError(
          `Erro ao carregar usuários: ${errorData.error || usersRes.status}`,
        );
      }

      if (companiesRes.ok) {
        const companiesData = await companiesRes.json();
        console.log("Empresas carregadas:", companiesData.length);
        setCompanies(companiesData);
      } else {
        const errorData = await companiesRes.json().catch(() => ({}));
        console.error(
          "Erro ao carregar empresas:",
          companiesRes.status,
          errorData,
        );
      }
    } catch (err) {
      console.error("Erro geral:", err);
      setError("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const fetchTrayStatus = async () => {
    setIsCheckingTrayStatus(true);

    try {
      const response = await fetchWithAuth("/api/tray/status");
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel consultar a integracao Tray.");
      }

      setTrayStatus({
        authorized: Boolean(data.authorized),
        status: data.status === "online" ? "online" : "offline",
        storeId: data.storeId || null,
        storeName: data.storeName || null,
        updatedAt: data.updatedAt || null,
        message:
          data.message ||
          (data.authorized
            ? "Integracao Tray online."
            : "Nenhuma integracao Tray autorizada."),
      });
    } catch (err: any) {
      setTrayStatus({
        authorized: false,
        status: "offline",
        storeId: null,
        storeName: null,
        updatedAt: null,
        message: err.message || "Nao foi possivel consultar a integracao Tray.",
      });
    } finally {
      setIsCheckingTrayStatus(false);
    }
  };

  useEffect(() => {
    if (canManageAdminPanel) {
      const params = new URLSearchParams(window.location.search);
      const requestedTab = params.get("tab");

      if (requestedTab !== "integration" && requestedTab !== "companies") {
        setActiveTab((currentTab) =>
          currentTab === "integration" ? "users" : currentTab,
        );
      }

      fetchData();
      return;
    }

    setLoading(false);
    setUsers([]);
    setCompanies([]);
    setError("");
    setActiveTab("integration");
  }, [canManageAdminPanel]);

  useEffect(() => {
    if (activeTab !== "integration") return;

    fetchTrayStatus();
    const interval = window.setInterval(fetchTrayStatus, 30000);

    return () => window.clearInterval(interval);
  }, [activeTab]);

  // Actions
  const handleOpenModal = (userToEdit?: UserData) => {
    if (userToEdit) {
      setEditingUser(userToEdit);
      setFormData({
        name: userToEdit.name,
        email: userToEdit.email,
        role: userToEdit.role,
        companyId: userToEdit.companyId || "",
        password: "", // Don't show existing password
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: "",
        email: "",
        role: "USER",
        companyId: "",
        password: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetchWithAuth("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyFormData),
      });

      if (response.ok) {
        fetchData();
        setIsCompanyModalOpen(false);
        setCompanyFormData({ name: "", cnpj: "" });
      } else {
        alert("Erro ao criar empresa");
      }
    } catch (err) {
      alert("Erro ao criar empresa");
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (!window.confirm("Tem certeza? Isso pode afetar usuários vinculados."))
      return;
    await fetchWithAuth(`/api/companies/${id}`, { method: "DELETE" });
    fetchData();
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
      const method = editingUser ? "PUT" : "POST";

      const body: any = { ...formData };
      if (!editingUser || !body.password) delete body.password;

      const response = await fetchWithAuth(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save user");
      }

      const result = await response.json();
      setIsModalOpen(false);
      if (!editingUser && result?.message) {
        alert(result.message);
      }
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja remover este usuário?")) return;

    try {
      const response = await fetchWithAuth(`/api/users/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete user");
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Erro ao deletar usuário");
    }
  };

  const handleConnectTray = async () => {
    const normalizedUrl = trayStoreUrl.trim();

    if (!normalizedUrl) {
      alert("Informe a URL da loja ou a URL /web_api da Tray.");
      return;
    }

    try {
      const params = new URLSearchParams({
        url: normalizedUrl,
      });

      const response = await fetchWithAuth(`/api/tray/connect?${params.toString()}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel iniciar a integracao Tray.");
      }

      if (!data.authUrl) {
        throw new Error("A URL de autorizacao da Tray nao foi retornada.");
      }

      window.open(data.authUrl, "_blank");
    } catch (err: any) {
      alert(err.message || "Erro ao iniciar a integracao Tray.");
    }
  };

  const handleClearDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clearPassword !== "172839") {
      alert("Senha incorreta.");
      return;
    }

    setIsClearing(true);
    try {
      const response = await fetchWithAuth("/api/orders/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: clearType, password: clearPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao limpar banco de dados");
      }

      const result = await response.json();
      alert(result.message || "Operação realizada com sucesso!");
      setIsClearModalOpen(false);
      setClearPassword("");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsClearing(false);
    }
  };

  if (loading)
    return (
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
          {canManageAdminPanel ? "Painel Administrativo" : "Integração"}
        </h2>

        <div className="flex gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
          {canManageAdminPanel && (
            <>
              <button
                onClick={() => setActiveTab("users")}
                className={clsx(
                  "px-4 py-2 rounded-md text-sm font-medium transition-all",
                  activeTab === "users"
                    ? "bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
                )}
              >
                Usuários
              </button>
              <button
                onClick={() => setActiveTab("companies")}
                className={clsx(
                  "px-4 py-2 rounded-md text-sm font-medium transition-all",
                  activeTab === "companies"
                    ? "bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
                )}
              >
                Empresas
              </button>
            </>
          )}
          <button
            onClick={() => setActiveTab("integration")}
            className={clsx(
              "px-4 py-2 rounded-md text-sm font-medium transition-all",
              activeTab === "integration"
                ? "bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
            )}
          >
            Integração
          </button>
        </div>
      </div>

      {canManageAdminPanel && activeTab === "users" && (
        <div className="glass-card rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
          <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 flex justify-between items-center">
            <h3 className="font-semibold text-slate-800 dark:text-white">
              Controle de Usuários
            </h3>
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
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      {error ? (
                        <div>
                          <p className="text-red-500 font-medium">{error}</p>
                          <p className="text-xs mt-2">
                            Verifique o console para mais detalhes
                          </p>
                        </div>
                      ) : (
                        "Nenhum usuário encontrado"
                      )}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                        {u.name}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                        {u.email}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={clsx(
                            "px-2 py-1 rounded-full text-xs font-semibold border",
                            u.role === "ADMIN"
                              ? "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800"
                              : "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
                          )}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                        {u.company?.name || (
                          <span className="text-slate-300 italic">
                            Sem empresa
                          </span>
                        )}
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canManageAdminPanel && activeTab === "companies" && (
        <div className="glass-card rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
          <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 flex justify-between items-center">
            <h3 className="font-semibold text-slate-800 dark:text-white">
              Gerenciamento de Empresas
            </h3>
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
                    <td
                      colSpan={3}
                      className="px-6 py-8 text-center text-slate-400"
                    >
                      Nenhuma empresa cadastrada.
                    </td>
                  </tr>
                ) : (
                  companies.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                        {c.name}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                        {c.cnpj || "-"}
                      </td>
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

      {activeTab === "integration" && (
        <div className="glass-card rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
          <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white">
                Integração Tray
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Inicie a autorização da loja Tray em uma nova aba. Se a Tray já
                estiver logada no navegador, o id e o usuário serão reconhecidos
                automaticamente no fluxo de autorização.
              </p>
            </div>

            <div className="flex items-center gap-3 self-start">
              <div
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                  trayStatus.status === "online"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300"
                    : "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
                )}
              >
                <span
                  className={clsx(
                    "h-2 w-2 rounded-full",
                    trayStatus.status === "online"
                      ? "bg-emerald-500"
                      : "bg-slate-400",
                  )}
                />
                {isCheckingTrayStatus
                  ? "Verificando"
                  : trayStatus.status === "online"
                    ? "Online"
                    : "Offline"}
              </div>

              <button
                type="button"
                onClick={fetchTrayStatus}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                Atualizar status
              </button>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-300">
              Você pode informar a URL da loja ou a URL completa com{" "}
              <span className="font-semibold">/web_api</span>. O sistema
              normaliza a URL antes de redirecionar para a Tray.
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                URL da loja Tray
              </label>
              <input
                type="text"
                value={trayStoreUrl}
                onChange={(e) => setTrayStoreUrl(e.target.value)}
                placeholder="https://www.sualoja.com.br/web_api"
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-2">
                Exemplo aceito: https://www.sualoja.com.br/web_api
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              <p className="font-semibold text-slate-700 dark:text-white">
                {trayStatus.storeName || trayStatus.storeId || "Nenhuma loja conectada"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {trayStatus.message}
              </p>
              {trayStatus.updatedAt && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Última validação: {new Date(trayStatus.updatedAt).toLocaleString()}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleConnectTray}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                <Link2 className="w-4 h-4" />
                Conectar Tray
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DB Management */}
      {canManageAdminPanel && (
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
              setClearType("DELIVERED_7_DAYS");
              setIsClearModalOpen(true);
            }}
            className="flex-1 bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 px-4 py-3 rounded-lg text-sm font-medium hover:bg-yellow-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            Limpar pedidos com status Entregue há mais de 7 dias
          </button>

          <button
            onClick={() => {
              setClearType("ALL");
              setIsClearModalOpen(true);
            }}
            className="flex-1 bg-red-500/10 text-red-600 border border-red-500/20 px-4 py-3 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Limpar banco de dados de pedidos (TUDO)
          </button>
        </div>
      </div>
      )}

      {/* Add/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-card bg-white dark:bg-dark-card w-full max-w-md rounded-xl p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                {editingUser ? "Editar Usuário" : "Novo Usuário"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Empresa
                </label>
                <select
                  value={formData.companyId}
                  onChange={(e) =>
                    setFormData({ ...formData, companyId: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                >
                  <option value="">Selecione uma empresa...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Se não selecionar, o usuário não terá acesso a pedidos.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Função
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value as any })
                    }
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                  >
                    <option value="USER">Usuário</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>

                {editingUser ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Nova Senha (opcional)
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                        placeholder="Manter atual"
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-3 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-300">
                    Ao salvar, o usuario sera criado e recebera um convite por
                    e-mail para cadastrar a propria senha.
                  </div>
                )}
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
                  {editingUser ? "Salvar Usuario" : "Criar e Enviar Convite"}
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
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                Nova Empresa
              </h3>
              <button
                onClick={() => setIsCompanyModalOpen(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Nome da Empresa
                </label>
                <input
                  type="text"
                  required
                  value={companyFormData.name}
                  onChange={(e) =>
                    setCompanyFormData({
                      ...companyFormData,
                      name: e.target.value,
                    })
                  }
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  CNPJ (Opcional)
                </label>
                <input
                  type="text"
                  value={companyFormData.cnpj}
                  onChange={(e) =>
                    setCompanyFormData({
                      ...companyFormData,
                      cnpj: e.target.value,
                    })
                  }
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
              <button
                onClick={() => {
                  setIsClearModalOpen(false);
                  setClearPassword("");
                }}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              Você está prestes a{" "}
              <strong>
                {clearType === "ALL"
                  ? "APAGAR TODOS OS PEDIDOS"
                  : "APAGAR PEDIDOS ENTREGUES HÁ MAIS DE 7 DIAS"}
              </strong>{" "}
              do banco de dados. Esta ação não pode ser desfeita.
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
                    onChange={(e) => setClearPassword(e.target.value)}
                    placeholder="Senha de segurança"
                    className="w-full bg-slate-50 dark:bg-white/5 border border-red-200 dark:border-red-900/30 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-red-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsClearModalOpen(false);
                    setClearPassword("");
                  }}
                  className="flex-1 px-4 py-2 rounded-lg font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isClearing || !clearPassword}
                  className="flex-1 px-4 py-2 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {isClearing ? "Apagando..." : "Confirmar Exclusão"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
