import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { TrayIntegrationStatus } from "../types";
import { LOGO_URL } from "../constants";
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
  Mail,
  Send,
  Sparkles,
  Filter,
} from "lucide-react";
import { clsx } from "clsx";
import { fetchWithAuth } from "../utils/authFetch";

// Types for local state
interface Company {
  id: string;
  name: string;
  cnpj?: string;
  trayIntegrationEnabled?: boolean;
  intelipostIntegrationEnabled?: boolean;
  sswRequireEnabled?: boolean;
  correiosIntegrationEnabled?: boolean;
  intelipostClientId?: string | null;
  sswRequireCnpjs?: string[];
  integrationCarrierExceptions?: string[];
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
): "users" | "companies" | "integration" | "patch-notes" => {
  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab");

  if (requestedTab === "integration") {
    return "integration";
  }

  if (canManageAdminPanel && requestedTab === "patch-notes") {
    return "patch-notes";
  }

  if (canManageAdminPanel && requestedTab === "companies") {
    return "companies";
  }

  return canManageAdminPanel ? "users" : "integration";
};

interface PatchNotesFormData {
  version: string;
  title: string;
  summary: string;
  newFeatures: string;
  adjustments: string;
}

const CLEAR_STATUS_OPTIONS = [
  { value: "ALL", label: "Todos os status" },
  { value: "PENDING", label: "Pendente" },
  { value: "CREATED", label: "Criado" },
  { value: "SHIPPED", label: "Em transito" },
  { value: "DELIVERY_ATTEMPT", label: "Saiu para entrega" },
  { value: "DELIVERED", label: "Entregue" },
  { value: "FAILURE", label: "Falha na entrega" },
  { value: "RETURNED", label: "Devolvido" },
  { value: "CANCELED", label: "Cancelado" },
  { value: "CHANNEL_LOGISTICS", label: "Logistica do canal" },
] as const;

const CLEAR_PERIOD_OPTIONS = [
  { value: "ALL", label: "Todos" },
  { value: "7_DAYS", label: "7 dias" },
  { value: "15_DAYS", label: "15 dias" },
  { value: "30_DAYS", label: "30 dias" },
  { value: "CUSTOM", label: "Personalizado" },
] as const;

const normalizeIntegrationSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const INTEGRATION_LOGO_CLASS =
  "mt-3 h-8 w-auto object-contain rounded-lg px-2 py-1 dark:bg-white/5 dark:ring-1 dark:ring-white/10 dark:drop-shadow-[0_0_10px_rgba(255,255,255,0.22)]";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const renderParagraph = (value: string, fallback: string) =>
  escapeHtml(value.trim() || fallback).replace(/\n/g, "<br />");

const buildPatchNotesList = (items: string[], emptyLabel: string) => {
  if (items.length === 0) {
    return `<p style="margin:0;color:#64748b;font-size:14px;">${escapeHtml(emptyLabel)}</p>`;
  }

  return `
    <ul style="margin:0;padding-left:20px;color:#0f172a;font-size:14px;line-height:1.7;">
      ${items
        .map((item) => `<li style="margin-bottom:8px;">${escapeHtml(item)}</li>`)
        .join("")}
    </ul>
  `;
};

const buildPatchNotesPreviewHtml = (input: PatchNotesFormData) => {
  const newFeatures = splitLines(input.newFeatures);
  const adjustments = splitLines(input.adjustments);

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(input.title || "Release Notes Avantracking")}</title>
      </head>
      <body style="margin:0;padding:32px 16px;background:#e2e8f0;font-family:Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;margin:0 auto;">
          <tr>
            <td>
              <div style="border-radius:28px;overflow:hidden;background:#0f172a;box-shadow:0 24px 80px rgba(15,23,42,0.28);">
                <div style="padding:28px 32px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);text-align:center;">
                  <img src="${LOGO_URL}" alt="Avantracking" style="max-width:240px;width:100%;height:auto;display:block;margin:0 auto 20px;" />
                  <div style="display:inline-block;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,0.14);color:#dbeafe;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                    Release Notes ${escapeHtml(input.version || "Nova versao")}
                  </div>
                  <h1 style="margin:18px 0 0;font-size:30px;line-height:1.2;color:#ffffff;">${escapeHtml(input.title || "Nova atualizacao da plataforma")}</h1>
                </div>
                <div style="padding:32px;background:#ffffff;">
                  <div style="padding:22px;border-radius:22px;background:#f8fafc;border:1px solid #e2e8f0;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#2563eb;">Resumo da versao</div>
                    <p style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#0f172a;">${renderParagraph(input.summary, "Descreva aqui o resumo principal da versao.")}</p>
                  </div>
                  <div style="display:grid;gap:18px;margin-top:24px;">
                    <div style="padding:22px;border-radius:22px;background:#eff6ff;border:1px solid #bfdbfe;">
                      <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;">Novas funcionalidades</div>
                      <div style="margin-top:14px;">
                        ${buildPatchNotesList(newFeatures, "Nenhuma funcionalidade nova informada nesta versao.")}
                      </div>
                    </div>
                    <div style="padding:22px;border-radius:22px;background:#f8fafc;border:1px solid #e2e8f0;">
                      <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0f172a;">Ajustes e melhorias</div>
                      <div style="margin-top:14px;">
                        ${buildPatchNotesList(adjustments, "Nenhum ajuste adicional informado nesta versao.")}
                      </div>
                    </div>
                  </div>
                  <div style="margin-top:28px;padding:18px 20px;border-radius:18px;background:#0f172a;color:#cbd5e1;font-size:13px;line-height:1.7;">
                    Este comunicado foi enviado pelo time Avantracking para informar a nova versao da plataforma.
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

export const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  const canManageAdminPanel = user?.email === "admin@avantracking.com.br";

  const [activeTab, setActiveTab] = useState<
    "users" | "companies" | "integration" | "patch-notes"
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
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [integrationSearch, setIntegrationSearch] = useState("");
  const [trayIntegrationEnabled, setTrayIntegrationEnabled] = useState(true);
  const [intelipostIntegrationEnabled, setIntelipostIntegrationEnabled] =
    useState(true);
  const [sswRequireEnabled, setSswRequireEnabled] = useState(true);
  const [correiosIntegrationEnabled, setCorreiosIntegrationEnabled] =
    useState(true);
  const [intelipostClientId, setIntelipostClientId] = useState("");
  const [sswRequireCnpjs, setSswRequireCnpjs] = useState<string[]>([""]);
  const [integrationCarrierExceptions, setIntegrationCarrierExceptions] = useState<string[]>([""]);
  const [isSavingIntelipost, setIsSavingIntelipost] = useState(false);
  const [isSavingSswRequire, setIsSavingSswRequire] = useState(false);
  const [isSavingCarrierExceptions, setIsSavingCarrierExceptions] = useState(false);
  const [isSavingIntegrationToggle, setIsSavingIntegrationToggle] = useState(false);
  const [patchNotesForm, setPatchNotesForm] = useState<PatchNotesFormData>({
    version: "",
    title: "",
    summary: "",
    newFeatures: "",
    adjustments: "",
  });
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientCompanyFilter, setRecipientCompanyFilter] = useState("all");
  const [isSendingReleaseNotes, setIsSendingReleaseNotes] = useState(false);

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
  const [clearType, setClearType] = useState<"ALL" | "DELIVERED_7_DAYS" | "FILTERED">("ALL");
  const [clearCompanyId, setClearCompanyId] = useState("");
  const [clearPassword, setClearPassword] = useState("");
  const [clearStatus, setClearStatus] = useState<"ALL" | "PENDING" | "CREATED" | "SHIPPED" | "DELIVERY_ATTEMPT" | "DELIVERED" | "FAILURE" | "RETURNED" | "CANCELED" | "CHANNEL_LOGISTICS">("ALL");
  const [clearPeriod, setClearPeriod] = useState<"ALL" | "7_DAYS" | "15_DAYS" | "30_DAYS" | "CUSTOM">("ALL");
  const [clearCustomStartDate, setClearCustomStartDate] = useState("");
  const [clearCustomEndDate, setClearCustomEndDate] = useState("");
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

  const fetchCurrentCompany = async () => {
    try {
      const response = await fetchWithAuth("/api/companies/current");
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Nao foi possivel carregar a empresa atual.",
        );
      }

      setCurrentCompany(data);
      setTrayIntegrationEnabled(data.trayIntegrationEnabled !== false);
      setIntelipostIntegrationEnabled(data.intelipostIntegrationEnabled !== false);
      setSswRequireEnabled(data.sswRequireEnabled !== false);
      setCorreiosIntegrationEnabled(data.correiosIntegrationEnabled !== false);
      setIntelipostClientId(data.intelipostClientId || "");
      setSswRequireCnpjs(
        Array.isArray(data.sswRequireCnpjs) && data.sswRequireCnpjs.length > 0
          ? data.sswRequireCnpjs
          : [""],
      );
      setIntegrationCarrierExceptions(
        Array.isArray(data.integrationCarrierExceptions) &&
          data.integrationCarrierExceptions.length > 0
          ? data.integrationCarrierExceptions
          : [""],
      );
    } catch {
      setCurrentCompany(null);
      setTrayIntegrationEnabled(true);
      setIntelipostIntegrationEnabled(true);
      setSswRequireEnabled(true);
      setCorreiosIntegrationEnabled(true);
      setIntelipostClientId("");
      setSswRequireCnpjs([""]);
      setIntegrationCarrierExceptions([""]);
    }
  };

  useEffect(() => {
    if (canManageAdminPanel) {
      const params = new URLSearchParams(window.location.search);
      const requestedTab = params.get("tab");

      if (
        requestedTab !== "integration" &&
        requestedTab !== "companies" &&
        requestedTab !== "patch-notes"
      ) {
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
    fetchCurrentCompany();
    const interval = window.setInterval(fetchTrayStatus, 30000);

    return () => window.clearInterval(interval);
  }, [activeTab, user?.companyId]);

  useEffect(() => {
    if (!canManageAdminPanel || users.length === 0) return;

    setSelectedRecipientIds((currentIds) => {
      if (currentIds.length === 0) {
        return users.map((userItem) => userItem.id);
      }

      return currentIds.filter((id) =>
        users.some((userItem) => userItem.id === id),
      );
    });
  }, [canManageAdminPanel, users]);

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

  const handleSaveIntelipost = async () => {
    const normalizedId = intelipostClientId.trim();

    if (!normalizedId) {
      alert("Informe o ID padrao da Intelipost para a empresa.");
      return;
    }

    setIsSavingIntelipost(true);
    try {
      const response = await fetchWithAuth("/api/companies/current/integration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intelipostClientId: normalizedId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Nao foi possivel salvar o ID da Intelipost.",
        );
      }

      setCurrentCompany(data.company || null);
      setIntelipostClientId(data.company?.intelipostClientId || normalizedId);
      alert(data.message || "ID da Intelipost atualizado com sucesso.");
    } catch (err: any) {
      alert(err.message || "Erro ao salvar ID da Intelipost.");
    } finally {
      setIsSavingIntelipost(false);
    }
  };

  const handleAddSswRequireCnpj = () => {
    setSswRequireCnpjs((currentValues) => [...currentValues, ""]);
  };

  const handleChangeSswRequireCnpj = (index: number, value: string) => {
    const normalized = value.replace(/\D/g, "");
    setSswRequireCnpjs((currentValues) =>
      currentValues.map((item, itemIndex) =>
        itemIndex === index ? normalized : item,
      ),
    );
  };

  const handleRemoveSswRequireCnpj = (index: number) => {
    setSswRequireCnpjs((currentValues) => {
      const nextValues = currentValues.filter((_, itemIndex) => itemIndex !== index);
      return nextValues.length > 0 ? nextValues : [""];
    });
  };

  const handleSaveSswRequire = async () => {
    const normalizedCnpjs = Array.from(
      new Set(
        sswRequireCnpjs
          .map((value) => value.replace(/\D/g, "").trim())
          .filter(Boolean),
      ),
    );

    if (normalizedCnpjs.some((cnpj) => cnpj.length !== 14)) {
      alert("Todos os CNPJs do SSW devem conter 14 digitos sem pontuacao.");
      return;
    }

    setIsSavingSswRequire(true);
    try {
      const response = await fetchWithAuth("/api/companies/current/integration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sswRequireCnpjs: normalizedCnpjs }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Nao foi possivel salvar os CNPJs do SSW Require.",
        );
      }

      setCurrentCompany(data.company || null);
      setSswRequireCnpjs(
        Array.isArray(data.company?.sswRequireCnpjs) &&
          data.company.sswRequireCnpjs.length > 0
          ? data.company.sswRequireCnpjs
          : [""],
      );
      alert(data.message || "CNPJs do SSW Require atualizados com sucesso.");
    } catch (err: any) {
      alert(err.message || "Erro ao salvar os CNPJs do SSW Require.");
    } finally {
      setIsSavingSswRequire(false);
    }
  };

  const handleAddCarrierException = () => {
    setIntegrationCarrierExceptions((currentValues) => [...currentValues, ""]);
  };

  const handleChangeCarrierException = (index: number, value: string) => {
    setIntegrationCarrierExceptions((currentValues) =>
      currentValues.map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    );
  };

  const handleRemoveCarrierException = (index: number) => {
    setIntegrationCarrierExceptions((currentValues) => {
      const nextValues = currentValues.filter((_, itemIndex) => itemIndex !== index);
      return nextValues.length > 0 ? nextValues : [""];
    });
  };

  const handleSaveCarrierExceptions = async () => {
    const normalizedExceptions = Array.from(
      new Set(
        integrationCarrierExceptions
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );

    setIsSavingCarrierExceptions(true);
    try {
      const response = await fetchWithAuth("/api/companies/current/integration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationCarrierExceptions: normalizedExceptions,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Nao foi possivel salvar as excecoes de transportadora.",
        );
      }

      setCurrentCompany(data.company || null);
      setIntegrationCarrierExceptions(
        Array.isArray(data.company?.integrationCarrierExceptions) &&
          data.company.integrationCarrierExceptions.length > 0
          ? data.company.integrationCarrierExceptions
          : [""],
      );
      alert(data.message || "Excecoes de transportadora atualizadas com sucesso.");
    } catch (err: any) {
      alert(err.message || "Erro ao salvar as excecoes de transportadora.");
    } finally {
      setIsSavingCarrierExceptions(false);
    }
  };

  const handleSaveIntegrationToggle = async (
    field:
      | "trayIntegrationEnabled"
      | "intelipostIntegrationEnabled"
      | "sswRequireEnabled"
      | "correiosIntegrationEnabled",
    value: boolean,
  ) => {
    if (!currentCompany) return;

    setIsSavingIntegrationToggle(true);
    try {
      const response = await fetchWithAuth("/api/companies/current/integration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [field]: value,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Nao foi possivel atualizar o status da integracao.",
        );
      }

      setCurrentCompany(data.company || null);
      setTrayIntegrationEnabled(data.company?.trayIntegrationEnabled !== false);
      setIntelipostIntegrationEnabled(
        data.company?.intelipostIntegrationEnabled !== false,
      );
      setSswRequireEnabled(data.company?.sswRequireEnabled !== false);
      setCorreiosIntegrationEnabled(
        data.company?.correiosIntegrationEnabled !== false,
      );
    } catch (err: any) {
      alert(err.message || "Erro ao atualizar a integracao.");
      await fetchCurrentCompany();
    } finally {
      setIsSavingIntegrationToggle(false);
    }
  };

  const handlePatchNotesFieldChange = (
    field: keyof PatchNotesFormData,
    value: string,
  ) => {
    setPatchNotesForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleToggleRecipient = (userId: string) => {
    setSelectedRecipientIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((id) => id !== userId)
        : [...currentIds, userId],
    );
  };

  const handleSelectVisibleRecipients = (visibleUserIds: string[]) => {
    setSelectedRecipientIds((currentIds) => {
      const nextIds = new Set(currentIds);
      visibleUserIds.forEach((id) => nextIds.add(id));
      return Array.from(nextIds);
    });
  };

  const handleClearVisibleRecipients = (visibleUserIds: string[]) => {
    const visibleIds = new Set(visibleUserIds);
    setSelectedRecipientIds((currentIds) =>
      currentIds.filter((id) => !visibleIds.has(id)),
    );
  };

  const handleSendReleaseNotes = async () => {
    if (!patchNotesForm.version.trim()) {
      alert("Informe a versao do release notes.");
      return;
    }

    if (!patchNotesForm.title.trim()) {
      alert("Informe o titulo do release notes.");
      return;
    }

    if (!patchNotesForm.summary.trim()) {
      alert("Informe o texto principal do release notes.");
      return;
    }

    if (selectedRecipientIds.length === 0) {
      alert("Selecione pelo menos um destinatario.");
      return;
    }

    setIsSendingReleaseNotes(true);
    try {
      const response = await fetchWithAuth("/api/release-notes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...patchNotesForm,
          recipientUserIds: selectedRecipientIds,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel enviar o release notes.");
      }

      alert(data.message || "Release notes enviado com sucesso.");
    } catch (err: any) {
      alert(err.message || "Erro ao enviar release notes.");
    } finally {
      setIsSendingReleaseNotes(false);
    }
  };

  const handleClearDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clearPassword !== "172839") {
      alert("Senha incorreta.");
      return;
    }

    if (!clearCompanyId) {
      alert("Selecione a empresa que terá os pedidos excluídos.");
      return;
    }

    setIsClearing(true);
    try {
      const response = await fetchWithAuth("/api/orders/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: clearType,
          password: clearPassword,
          companyId: clearCompanyId,
          status: clearStatus,
          period: clearPeriod,
          customStartDate: clearCustomStartDate,
          customEndDate: clearCustomEndDate,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao limpar banco de dados");
      }

      const result = await response.json();
      alert(result.message || "Operação realizada com sucesso!");
      resetClearDatabaseModal();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsClearing(false);
    }
  };

  const resetClearDatabaseModal = () => {
    setIsClearModalOpen(false);
    setClearCompanyId("");
    setClearPassword("");
    setClearStatus("ALL");
    setClearPeriod("ALL");
    setClearCustomStartDate("");
    setClearCustomEndDate("");
  };

  const clearModalActionLabel =
    clearType === "ALL"
      ? "APAGAR TODOS OS PEDIDOS"
      : clearType === "DELIVERED_7_DAYS"
        ? "APAGAR PEDIDOS ENTREGUES HA MAIS DE 7 DIAS"
        : "APAGAR PEDIDOS FILTRADOS POR STATUS E PERIODO";

  if (loading)
    return (
      <div className="flex justify-center items-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );

  const filteredRecipientUsers = users.filter((userItem) => {
    const normalizedSearch = recipientSearch.trim().toLowerCase();
    const matchesSearch =
      !normalizedSearch ||
      userItem.name.toLowerCase().includes(normalizedSearch) ||
      userItem.email.toLowerCase().includes(normalizedSearch);

    const matchesCompany =
      recipientCompanyFilter === "all" ||
      userItem.companyId === recipientCompanyFilter;

    return matchesSearch && matchesCompany;
  });

  const filteredRecipientIds = filteredRecipientUsers.map(
    (userItem) => userItem.id,
  );

  const normalizedIntegrationSearch = normalizeIntegrationSearchText(
    integrationSearch,
  );
  const integrationCardMatches = (...terms: string[]) => {
    if (!normalizedIntegrationSearch) {
      return true;
    }

    return terms.some((term) =>
      normalizeIntegrationSearchText(term).includes(normalizedIntegrationSearch),
    );
  };
  const hasVisibleIntegrations =
    integrationCardMatches("tray integracao principal pedidos loja autorizacao") ||
    integrationCardMatches("intelipost tracking externo client id rastreio") ||
    integrationCardMatches("ssw require tracking nf cnpj rastreio") ||
    integrationCardMatches("correios api rastro codigo objeto rastreio pac sedex") ||
    integrationCardMatches("excecao de transportadora regras importacao ignorar") ||
    integrationCardMatches("bling erp implementacao futuro") ||
    integrationCardMatches("sysemp shopping de precos implementacao futuro") ||
    integrationCardMatches("magazord implementacao futuro");

  const IntegrationToggle: React.FC<{
    enabled: boolean;
    disabled?: boolean;
    onChange?: (nextValue: boolean) => void;
  }> = ({ enabled, disabled = false, onChange }) => (
    <button
      type="button"
      onClick={() => !disabled && onChange?.(!enabled)}
      disabled={disabled}
      className={clsx(
        "relative inline-flex h-7 w-12 items-center rounded-full border transition-all",
        enabled
          ? "border-emerald-400 bg-emerald-500/90"
          : "border-slate-300 bg-slate-300 dark:border-white/10 dark:bg-white/10",
        disabled && "cursor-not-allowed opacity-60",
      )}
      aria-pressed={enabled}
    >
      <span
        className={clsx(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
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
              <button
                onClick={() => setActiveTab("patch-notes")}
                className={clsx(
                  "px-4 py-2 rounded-md text-sm font-medium transition-all",
                  activeTab === "patch-notes"
                    ? "bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
                )}
              >
                Patch Notes
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

      {canManageAdminPanel && activeTab === "patch-notes" && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="glass-card rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
              <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
                <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Release Notes
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Estruture a versao, monte o HTML e envie o comunicado de atualizacao por e-mail.
                </p>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Versao
                    </label>
                    <input
                      type="text"
                      value={patchNotesForm.version}
                      onChange={(e) =>
                        handlePatchNotesFieldChange("version", e.target.value)
                      }
                      placeholder="v2.4.0"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Titulo
                    </label>
                    <input
                      type="text"
                      value={patchNotesForm.title}
                      onChange={(e) =>
                        handlePatchNotesFieldChange("title", e.target.value)
                      }
                      placeholder="Nova atualizacao da plataforma"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Texto principal
                  </label>
                  <textarea
                    rows={5}
                    value={patchNotesForm.summary}
                    onChange={(e) =>
                      handlePatchNotesFieldChange("summary", e.target.value)
                    }
                    placeholder="Descreva aqui o resumo principal da nova versao."
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none resize-y"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Novas funcionalidades
                  </label>
                  <textarea
                    rows={6}
                    value={patchNotesForm.newFeatures}
                    onChange={(e) =>
                      handlePatchNotesFieldChange("newFeatures", e.target.value)
                    }
                    placeholder={"Uma funcionalidade por linha\nNova aba de integracao\nSync automatico por empresa"}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none resize-y"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Ajustes e melhorias
                  </label>
                  <textarea
                    rows={6}
                    value={patchNotesForm.adjustments}
                    onChange={(e) =>
                      handlePatchNotesFieldChange("adjustments", e.target.value)
                    }
                    placeholder={"Um ajuste por linha\nMelhoria no sync da Tray\nCorrecao de filtros do dashboard"}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none resize-y"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-white">
                      Destinatarios selecionados: {selectedRecipientIds.length}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      O envio usara o sender configurado no Brevo.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendReleaseNotes}
                    disabled={isSendingReleaseNotes}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    {isSendingReleaseNotes ? "Enviando..." : "Enviar Release Notes"}
                  </button>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
              <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
                <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Destinatarios
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Selecione quais usuarios receberao o release notes.
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    type="text"
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    placeholder="Buscar por nome ou e-mail"
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                  />

                  <select
                    value={recipientCompanyFilter}
                    onChange={(e) => setRecipientCompanyFilter(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                  >
                    <option value="all">Todas as empresas</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleSelectVisibleRecipients(filteredRecipientIds)
                    }
                    className="px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
                  >
                    Selecionar visiveis
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleClearVisibleRecipients(filteredRecipientIds)
                    }
                    className="px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-red-500 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                  >
                    Limpar visiveis
                  </button>
                </div>

                <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                  {filteredRecipientUsers.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/10 px-4 py-8 text-center text-sm text-slate-400">
                      Nenhum usuario encontrado com os filtros atuais.
                    </div>
                  ) : (
                    filteredRecipientUsers.map((userItem) => {
                      const isSelected = selectedRecipientIds.includes(
                        userItem.id,
                      );

                      return (
                        <label
                          key={userItem.id}
                          className={clsx(
                            "flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors",
                            isSelected
                              ? "border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10"
                              : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleRecipient(userItem.id)}
                            className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 dark:text-white truncate">
                              {userItem.name}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                              {userItem.email}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              {userItem.company?.name || "Sem empresa"}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
            <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-white">
                  Previa do e-mail HTML
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  A previa acompanha os campos de versao, texto, funcionalidades e ajustes.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 px-3 py-1 text-xs font-semibold border border-blue-200 dark:border-blue-500/20">
                Logo no topo
              </span>
            </div>

            <div className="bg-slate-200 dark:bg-slate-900 p-4">
              <iframe
                title="Previa do e-mail de patch notes"
                srcDoc={buildPatchNotesPreviewHtml(patchNotesForm)}
                className="w-full h-[820px] rounded-xl bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === "integration" && (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
            <div className="p-5 bg-[linear-gradient(135deg,#fff7ed_0%,#f8fafc_45%,#eff6ff_100%)] dark:bg-[linear-gradient(135deg,rgba(240,90,61,0.12),rgba(15,23,42,0.92),rgba(37,99,235,0.12))] border-b border-slate-200 dark:border-white/10">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200">
                    Integracoes
                  </p>
                  <h3 className="mt-3 text-xl font-bold text-slate-800 dark:text-white">
                    Central de Integracao
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                    Cada integracao fica no proprio card, com status, configuracoes e um toggle claro para ativar ou desativar o recurso da empresa.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300 min-w-[280px]">
                  <p className="font-semibold text-slate-700 dark:text-white">
                    Empresa atual: {currentCompany?.name || "Nao vinculada"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    As configuracoes abaixo sao compartilhadas por todos os usuarios desta empresa.
                  </p>
                  <div className="mt-3">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 mb-2">
                      Buscar integracao
                    </label>
                    <input
                      type="text"
                      value={integrationSearch}
                      onChange={(e) => setIntegrationSearch(e.target.value)}
                      placeholder="Tray, Intelipost, SSW, Correios..."
                      className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!hasVisibleIntegrations && (
            <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/10 p-6 text-sm text-slate-500 dark:text-slate-400">
              Nenhuma integracao encontrada para a busca informada.
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {integrationCardMatches("tray integracao principal pedidos loja autorizacao") && (
            <div className="glass-card rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
              <div className="p-5 border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Integracao principal</p>
                    <img
                      src="/logo-tray.png"
                      alt="Tray"
                      className={INTEGRATION_LOGO_CLASS}
                    />
                    <h4 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">Tray</h4>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Autorize a loja, acompanhe o status e controle o uso da integracao de pedidos da Tray.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <IntegrationToggle
                      enabled={trayIntegrationEnabled}
                      disabled={isSavingIntegrationToggle || !currentCompany}
                      onChange={(nextValue) =>
                        handleSaveIntegrationToggle("trayIntegrationEnabled", nextValue)
                      }
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {trayIntegrationEnabled ? "Ativa" : "Desativada"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-300">
                  Voce pode informar a URL da loja ou a URL completa com <span className="font-semibold">/web_api</span>. O sistema normaliza a URL antes de redirecionar para a Tray.
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-3">
                    <div
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                        !trayIntegrationEnabled
                          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
                          : trayStatus.status === "online"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300"
                            : "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
                      )}
                    >
                      <span
                        className={clsx(
                          "h-2 w-2 rounded-full",
                          !trayIntegrationEnabled
                            ? "bg-amber-500"
                            : trayStatus.status === "online"
                              ? "bg-emerald-500"
                              : "bg-slate-400",
                        )}
                      />
                      {!trayIntegrationEnabled
                        ? "Desativada"
                        : isCheckingTrayStatus
                          ? "Verificando"
                          : trayStatus.status === "online"
                            ? "Online"
                            : "Offline"}
                    </div>

                    <button
                      type="button"
                      onClick={fetchTrayStatus}
                      disabled={!trayIntegrationEnabled}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white transition-colors"
                    >
                      Atualizar status
                    </button>
                  </div>

                  <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-white">
                    {trayStatus.storeName || trayStatus.storeId || "Nenhuma loja conectada"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {trayIntegrationEnabled
                      ? trayStatus.message
                      : "A integracao da Tray esta desativada para esta empresa."}
                  </p>
                  {trayStatus.updatedAt && trayIntegrationEnabled && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Ultima validacao: {new Date(String(trayStatus.updatedAt)).toLocaleString()}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">URL da loja Tray</label>
                  <input
                    type="text"
                    value={trayStoreUrl}
                    onChange={(e) => setTrayStoreUrl(e.target.value)}
                    placeholder="https://www.sualoja.com.br/web_api"
                    disabled={!trayIntegrationEnabled}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none disabled:opacity-50"
                  />
                  <p className="text-[11px] text-slate-400 mt-2">Exemplo aceito: https://www.sualoja.com.br/web_api</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleConnectTray}
                    disabled={!trayIntegrationEnabled}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Link2 className="w-4 h-4" />
                    Conectar Tray
                  </button>
                </div>
              </div>
            </div>
            )}

            {integrationCardMatches("intelipost tracking externo client id rastreio") && (
            <div className="glass-card rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
              <div className="p-5 border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Tracking externo</p>
                    <img
                      src="/intelipost.png"
                      alt="Intelipost"
                      className={INTEGRATION_LOGO_CLASS}
                    />
                    <h4 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">Intelipost</h4>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Define o client ID usado nas consultas manuais e nos fluxos de rastreio que passam pela Intelipost.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <IntegrationToggle
                      enabled={intelipostIntegrationEnabled}
                      disabled={isSavingIntegrationToggle || !currentCompany}
                      onChange={(nextValue) =>
                        handleSaveIntegrationToggle("intelipostIntegrationEnabled", nextValue)
                      }
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {intelipostIntegrationEnabled ? "Ativa" : "Desativada"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Client ID Intelipost</label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={intelipostClientId}
                      onChange={(e) => setIntelipostClientId(e.target.value)}
                      placeholder="40115"
                      disabled={!intelipostIntegrationEnabled}
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={handleSaveIntelipost}
                      disabled={isSavingIntelipost || !currentCompany || !intelipostIntegrationEnabled}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                      {isSavingIntelipost ? "Salvando..." : "Salvar Intelipost"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">Exemplo: a Drossi Interiores permanece com o ID padrao 40115.</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  <p className="font-semibold text-slate-700 dark:text-white">Uso atual</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Quando desativada, a empresa deixa de usar a Intelipost para consulta de rastreio e geracao de links.
                  </p>
                </div>
              </div>
            </div>
            )}

            {integrationCardMatches("ssw require tracking nf cnpj rastreio") && (
            <div className="glass-card rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
              <div className="p-5 border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Tracking por NF</p>
                    <img
                      src="/ssw.png"
                      alt="SSW"
                      className={INTEGRATION_LOGO_CLASS}
                    />
                    <h4 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">SSW Require</h4>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Mantem os CNPJs usados para montar links de rastreio no formato SSW por NF.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <IntegrationToggle
                      enabled={sswRequireEnabled}
                      disabled={isSavingIntegrationToggle || !currentCompany}
                      onChange={(nextValue) =>
                        handleSaveIntegrationToggle("sswRequireEnabled", nextValue)
                      }
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {sswRequireEnabled ? "Ativa" : "Desativada"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-white">CNPJs permitidos</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Inserir CNPJ sem pontuacao. O sistema tenta os CNPJs cadastrados para montar o rastreio SSW da NF.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddSswRequireCnpj}
                    disabled={!sswRequireEnabled}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar CNPJ
                  </button>
                </div>

                <div className="space-y-3">
                  {sswRequireCnpjs.map((cnpj, index) => (
                    <div key={`${index}-${cnpj}`} className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="text"
                        value={cnpj}
                        onChange={(e) => handleChangeSswRequireCnpj(index, e.target.value)}
                        placeholder="12345678000199"
                        disabled={!sswRequireEnabled}
                        className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSswRequireCnpj(index)}
                        disabled={!sswRequireEnabled || sswRequireCnpjs.length === 1}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remover
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-400">Todos os usuarios da empresa compartilham esta configuracao.</p>

                  <button
                    type="button"
                    onClick={handleSaveSswRequire}
                    disabled={isSavingSswRequire || !currentCompany || !sswRequireEnabled}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    {isSavingSswRequire ? "Salvando..." : "Salvar SSW Require"}
                  </button>
                </div>
              </div>
            </div>
            )}

            {integrationCardMatches("correios api rastro codigo objeto rastreio pac sedex") && (
            <div className="glass-card rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
              <div className="p-5 border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Tracking por codigo de objeto</p>
                    <img
                      src="/correios.png"
                      alt="Correios"
                      className={INTEGRATION_LOGO_CLASS}
                    />
                    <h4 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">Correios</h4>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Ativa o rastreio pela API Rastro dos Correios usando o codigo de objeto padronizado no campo de rastreio do pedido.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <IntegrationToggle
                      enabled={correiosIntegrationEnabled}
                      disabled={isSavingIntegrationToggle || !currentCompany}
                      onChange={(nextValue) =>
                        handleSaveIntegrationToggle("correiosIntegrationEnabled", nextValue)
                      }
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {correiosIntegrationEnabled ? "Ativa" : "Desativada"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-300">
                  Esta integracao consulta a API dos Correios apenas quando a transportadora do pedido for <span className="font-semibold">PAC</span>, <span className="font-semibold">SEDEX</span> ou <span className="font-semibold">Correios</span>.
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  <p className="font-semibold text-slate-700 dark:text-white">Regra de uso</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Quando ativa, o Avantracking usa o codigo de envio recebido da plataforma como codigo de objeto dos Correios. Quando desativada, a API nao e consultada para essa empresa.
                  </p>
                </div>
              </div>
            </div>
            )}

            {integrationCardMatches("excecao de transportadora regras importacao ignorar") && (
            <div className="glass-card rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
              <div className="p-5 border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Regras de importacao</p>
                    <h4 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">Excecao de transportadora</h4>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Controle fino para ignorar pedidos da plataforma por nome exato de transportadora nesta empresa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCarrierException}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-3">
                {integrationCarrierExceptions.map((carrierName, index) => (
                  <div key={`${index}-${carrierName}`} className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={carrierName}
                      onChange={(e) => handleChangeCarrierException(index, e.target.value)}
                      placeholder="Nome exato da transportadora"
                      className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveCarrierException(index)}
                      disabled={integrationCarrierExceptions.length === 1}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remover
                    </button>
                  </div>
                ))}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-400">A comparacao usa o texto normalizado exato recebido da plataforma.</p>

                  <button
                    type="button"
                    onClick={handleSaveCarrierExceptions}
                    disabled={isSavingCarrierExceptions || !currentCompany}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    {isSavingCarrierExceptions ? "Salvando..." : "Salvar excecoes"}
                  </button>
                </div>
              </div>
            </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {integrationCardMatches("bling erp implementacao futuro") && (
            <div className="glass-card rounded-2xl overflow-hidden border border-dashed border-slate-300 dark:border-white/10">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Em implementacao</p>
                    <img
                      src="/bling.png"
                      alt="Bling ERP"
                      className={INTEGRATION_LOGO_CLASS}
                    />
                    <h4 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">Bling ERP</h4>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Card reservado para a futura integracao com ERP, com foco em pedidos, faturamento e operacao.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <IntegrationToggle enabled={false} disabled={true} />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Em implementacao</span>
                  </div>
                </div>
              </div>
            </div>
            )}

            {integrationCardMatches("sysemp shopping de precos implementacao futuro") && (
            <div className="glass-card rounded-2xl overflow-hidden border border-dashed border-slate-300 dark:border-white/10">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Em implementacao</p>
                    <img
                      src="/sysemp.png"
                      alt="SYSEMP"
                      className={INTEGRATION_LOGO_CLASS}
                    />
                    <h4 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">SYSEMP - Shopping de Precos</h4>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Espaco preparado para a futura integracao com comparador de precos e operacao comercial.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <IntegrationToggle enabled={false} disabled={true} />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Em implementacao</span>
                  </div>
                </div>
              </div>
            </div>
            )}

            {integrationCardMatches("magazord implementacao futuro") && (
            <div className="glass-card rounded-2xl overflow-hidden border border-dashed border-slate-300 dark:border-white/10">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Em implementacao</p>
                    <img
                      src="/magazord.png"
                      alt="Magazord"
                      className={INTEGRATION_LOGO_CLASS}
                    />
                    <h4 className="mt-2 text-lg font-bold text-slate-800 dark:text-white">Magazord</h4>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Espaco preparado para futura integracao com a plataforma Magazord.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <IntegrationToggle enabled={false} disabled={true} />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Em implementacao</span>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "integration" && false && (
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
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              <p className="font-semibold text-slate-700 dark:text-white">
                Empresa atual: {currentCompany?.name || "Nao vinculada"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                O ID da Intelipost desta empresa sera usado no rastreio manual e na sincronizacao com a Intelipost.
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-300">
              Você pode informar a URL da loja ou a URL completa com{" "}
              <span className="font-semibold">/web_api</span>. O sistema
              normaliza a URL antes de redirecionar para a Tray.
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                INTELIPOST
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={intelipostClientId}
                  onChange={(e) => setIntelipostClientId(e.target.value)}
                  placeholder="40115"
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveIntelipost}
                  disabled={isSavingIntelipost || !currentCompany}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {isSavingIntelipost ? "Salvando..." : "Salvar Intelipost"}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Exemplo: a Drossi Interiores permanece com o ID padrao 40115.
              </p>
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-700 dark:text-white">
                    SSW Require
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Inserir CNPJ sem pontuacao (12345678000199). O sistema usa esses CNPJs para montar o rastreio
                    {" "}`https://ssw.inf.br/app/tracking/{"{CNPJ}"}/{"{NF}"}` com a NF do pedido. Se nao localizar no primeiro,
                    tenta os demais cadastrados na mesma empresa.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddSswRequireCnpj}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  TEM MAIS DE UM CNPJ PARA NF?
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {sswRequireCnpjs.map((cnpj, index) => (
                  <div key={`${index}-${cnpj}`} className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={cnpj}
                      onChange={(e) =>
                        handleChangeSswRequireCnpj(index, e.target.value)
                      }
                      placeholder="12345678000199"
                      className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSswRequireCnpj(index)}
                      disabled={sswRequireCnpjs.length === 1}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remover
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-slate-400">
                  Sempre um cadastro por empresa. Todos os usuarios da mesma empresa compartilham os mesmos CNPJs,
                  sem conflito com as demais empresas.
                </p>

                <button
                  type="button"
                  onClick={handleSaveSswRequire}
                  disabled={isSavingSswRequire || !currentCompany}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {isSavingSswRequire ? "Salvando..." : "Salvar SSW Require"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-700 dark:text-white">
                    Excecao de transportadora
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Informe o nome exato da transportadora. Pedidos importados da plataforma com esse mesmo nome
                    serao ignorados durante a importacao desta empresa.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddCarrierException}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar excecao
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {integrationCarrierExceptions.map((carrierName, index) => (
                  <div key={`${index}-${carrierName}`} className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={carrierName}
                      onChange={(e) =>
                        handleChangeCarrierException(index, e.target.value)
                      }
                      placeholder="Nome exato da transportadora"
                      className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveCarrierException(index)}
                      disabled={integrationCarrierExceptions.length === 1}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remover
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-slate-400">
                  A comparacao usa o texto exato normalizado da transportadora recebida da plataforma.
                </p>

                <button
                  type="button"
                  onClick={handleSaveCarrierExceptions}
                  disabled={isSavingCarrierExceptions || !currentCompany}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {isSavingCarrierExceptions ? "Salvando..." : "Salvar excecoes"}
                </button>
              </div>
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
                  Última validação: {new Date(String(trayStatus.updatedAt)).toLocaleString()}
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
              setClearCompanyId(companies[0]?.id || "");
              setClearPassword("");
              setClearStatus("DELIVERED");
              setClearPeriod("7_DAYS");
              setClearCustomStartDate("");
              setClearCustomEndDate("");
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
              setClearCompanyId(companies[0]?.id || "");
              setClearPassword("");
              setClearStatus("ALL");
              setClearPeriod("ALL");
              setClearCustomStartDate("");
              setClearCustomEndDate("");
              setIsClearModalOpen(true);
            }}
            className="flex-1 bg-red-500/10 text-red-600 border border-red-500/20 px-4 py-3 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Limpar banco de dados de pedidos (TUDO)
          </button>

          <button
            onClick={() => {
              setClearType("FILTERED");
              setClearCompanyId(companies[0]?.id || "");
              setClearPassword("");
              setClearStatus("ALL");
              setClearPeriod("ALL");
              setClearCustomStartDate("");
              setClearCustomEndDate("");
              setIsClearModalOpen(true);
            }}
            className="flex-1 bg-orange-500/10 text-orange-600 border border-orange-500/20 px-4 py-3 rounded-lg text-sm font-medium hover:bg-orange-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <Filter className="w-4 h-4" />
            Excluir pedidos específicos
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
                onClick={resetClearDatabaseModal}
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

            {clearType === "FILTERED" && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                Filtro atual: {clearModalActionLabel}
              </div>
            )}

            <form onSubmit={handleClearDatabase} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Empresa
                </label>
                <select
                  required
                  value={clearCompanyId}
                  onChange={(e) => setClearCompanyId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-red-200 dark:border-red-900/30 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-red-500 outline-none"
                >
                  <option value="">Selecione a empresa...</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              {clearType === "FILTERED" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Status
                      </label>
                      <select
                        value={clearStatus}
                        onChange={(e) =>
                          setClearStatus(
                            e.target.value as
                              | "ALL"
                              | "PENDING"
                              | "CREATED"
                              | "SHIPPED"
                              | "DELIVERY_ATTEMPT"
                              | "DELIVERED"
                              | "FAILURE"
                              | "RETURNED"
                              | "CANCELED"
                              | "CHANNEL_LOGISTICS",
                          )
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-red-200 dark:border-red-900/30 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-red-500 outline-none"
                      >
                        {CLEAR_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Periodo
                      </label>
                      <select
                        value={clearPeriod}
                        onChange={(e) =>
                          setClearPeriod(
                            e.target.value as
                              | "ALL"
                              | "7_DAYS"
                              | "15_DAYS"
                              | "30_DAYS"
                              | "CUSTOM",
                          )
                        }
                        className="w-full bg-slate-50 dark:bg-white/5 border border-red-200 dark:border-red-900/30 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-red-500 outline-none"
                      >
                        {CLEAR_PERIOD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {clearPeriod === "CUSTOM" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Data inicial
                        </label>
                        <input
                          type="date"
                          required
                          value={clearCustomStartDate}
                          onChange={(e) => setClearCustomStartDate(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-white/5 border border-red-200 dark:border-red-900/30 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-red-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Data final
                        </label>
                        <input
                          type="date"
                          required
                          value={clearCustomEndDate}
                          onChange={(e) => setClearCustomEndDate(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-white/5 border border-red-200 dark:border-red-900/30 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-red-500 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2 text-xs text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300">
                    O periodo considera a ultima atualizacao do pedido no sistema.
                  </div>
                </>
              )}

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
                  onClick={resetClearDatabaseModal}
                  className="flex-1 px-4 py-2 rounded-lg font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isClearing || !clearPassword || !clearCompanyId}
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
