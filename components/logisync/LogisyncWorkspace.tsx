import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  Bot,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Moon,
  Pencil,
  Plus,
  Save,
  Shield,
  SlidersHorizontal,
  Sun,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { clsx } from "clsx";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { fetchWithAuth } from "../../utils/authFetch";
import { showToast } from "../../utils/toast";

type SectionKey = "dashboard" | "conciliacao" | "integracao" | "admin";
type RuleScope = "all" | "carriers";

type FreightRule = {
  id: string;
  name: string;
  description: string;
  scope: RuleScope;
  carriers: string[];
  percentAdd: number;
  fixedAdd: number;
  active: boolean;
};

type FreightOrder = {
  pedido: string;
  transportadora: string;
  freteCotado: number;
  freteCobradoPago: number;
};

type CompanyOption = {
  id: string;
  name: string;
};

const SECTION_TABS: Record<SectionKey, Array<{ key: string; label: string }>> = {
  dashboard: [
    { key: "visao-geral", label: "Visao Geral" },
    { key: "comparativos", label: "Comparativos por Mes" },
    { key: "alertas", label: "Alertas" },
  ],
  conciliacao: [
    { key: "regras-inteligentes", label: "Regras Inteligentes" },
    { key: "resumo", label: "Resumo" },
    { key: "pedidos", label: "Pedidos" },
  ],
  integracao: [
    { key: "status", label: "Status Integracoes" },
    { key: "latencia", label: "Latencia APIs" },
    { key: "automacoes", label: "Automacoes" },
  ],
  admin: [
    { key: "usuarios", label: "Usuarios" },
    { key: "governanca", label: "Governanca" },
  ],
};

const BASE_ORDERS: FreightOrder[] = [
  { pedido: "#980211", transportadora: "Jadlog", freteCotado: 121.4, freteCobradoPago: 136.2 },
  { pedido: "#980244", transportadora: "Correios", freteCotado: 58.9, freteCobradoPago: 57.1 },
  { pedido: "#980301", transportadora: "SSW", freteCotado: 210.3, freteCobradoPago: 238.8 },
  { pedido: "#980327", transportadora: "Intelipost", freteCotado: 92.0, freteCobradoPago: 91.5 },
  { pedido: "#980355", transportadora: "Jadlog", freteCotado: 71.3, freteCobradoPago: 88.4 },
  { pedido: "#980380", transportadora: "Azul Cargo", freteCotado: 143.8, freteCobradoPago: 143.2 },
  { pedido: "#980441", transportadora: "Correios", freteCotado: 84.1, freteCobradoPago: 102.9 },
  { pedido: "#980468", transportadora: "SSW", freteCotado: 130.0, freteCobradoPago: 147.0 },
];

const MONTHLY_DATA = [
  { month: "Jan", cotado: 118000, cobradoPago: 123200, deveria: 114000 },
  { month: "Fev", cotado: 121200, cobradoPago: 125900, deveria: 118400 },
  { month: "Mar", cotado: 129400, cobradoPago: 137000, deveria: 126300 },
  { month: "Abr", cotado: 134300, cobradoPago: 145900, deveria: 130100 },
  { month: "Mai", cotado: 140100, cobradoPago: 149200, deveria: 136900 },
  { month: "Jun", cotado: 146500, cobradoPago: 154000, deveria: 143500 },
];

const API_LATENCY_DATA = [
  { slot: "08h", tray: 420, intelipost: 280, correios: 360 },
  { slot: "10h", tray: 460, intelipost: 260, correios: 330 },
  { slot: "12h", tray: 490, intelipost: 310, correios: 350 },
  { slot: "14h", tray: 455, intelipost: 295, correios: 340 },
  { slot: "16h", tray: 430, intelipost: 285, correios: 320 },
  { slot: "18h", tray: 410, intelipost: 270, correios: 305 },
];

const INTEGRATIONS = [
  { name: "Tray", status: "Online", sync: "1 min atras", accuracy: "98.9%" },
  { name: "Intelipost", status: "Online", sync: "2 min atras", accuracy: "99.4%" },
  { name: "Correios", status: "Atencao", sync: "9 min atras", accuracy: "95.2%" },
  { name: "SSW", status: "Online", sync: "3 min atras", accuracy: "97.1%" },
];

const AUTOMATIONS = [
  {
    title: "Reconciliacao automatica diaria",
    status: "Ativa",
    description: "Executa comparativo de frete cotado x cobrado/pago as 06:00 e 18:00.",
  },
  {
    title: "Alerta de prejuizo por transportadora",
    status: "Ativa",
    description: "Dispara quando divergencia media ultrapassa 8% no dia.",
  },
  {
    title: "Reprocessamento de notas fiscais",
    status: "Aguardando",
    description: "Fila de validacao para pedidos com inconsistencias fiscais.",
  },
];

const ADMIN_USERS = [
  { name: "Logisync Admin", email: "logisync@admin.com.br", role: "ADMIN_SUPER", lastAccess: "Hoje 08:12" },
  { name: "Analista Frete 1", email: "analista1@logisync.com.br", role: "ANALYST", lastAccess: "Hoje 07:48" },
  { name: "Analista Frete 2", email: "analista2@logisync.com.br", role: "ANALYST", lastAccess: "Ontem 18:21" },
];

const INITIAL_RULES: FreightRule[] = [];

const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);

const formatPercent = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;

const LOGISYNC_COMPANY_STORAGE_KEY = "logisync:selectedCompanyId";

const statusTone = (status: "Conciliado" | "Prejuizo" | "Economia") => {
  if (status === "Prejuizo") return "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300";
  if (status === "Economia") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300";
  return "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200";
};

export const LogisyncWorkspace: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const isAdminProfile = isSuperAdmin || user?.role === "ADMIN";

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>("dashboard");
  const [activeSubtab, setActiveSubtab] = useState<string>(SECTION_TABS.dashboard[0].key);

  const [rules, setRules] = useState<FreightRule[]>(INITIAL_RULES);
  const [ruleName, setRuleName] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [ruleScope, setRuleScope] = useState<RuleScope>("all");
  const [ruleCarriers, setRuleCarriers] = useState<string[]>([]);
  const [rulePercent, setRulePercent] = useState("");
  const [ruleFixed, setRuleFixed] = useState("");
  const [ruleError, setRuleError] = useState("");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleDraft, setEditingRuleDraft] = useState<{
    name: string;
    description: string;
    scope: RuleScope;
    carriers: string[];
    percentAdd: string;
    fixedAdd: string;
  } | null>(null);
  const [conciliationOrders, setConciliationOrders] =
    useState<FreightOrder[]>(BASE_ORDERS);
  const [isLoadingConciliationOrders, setIsLoadingConciliationOrders] =
    useState(false);
  const [mindMapCarrier, setMindMapCarrier] = useState("");

  const navSections = useMemo(() => {
    const sections: Array<{ key: SectionKey; label: string; icon: React.ElementType }> = [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { key: "conciliacao", label: "Conciliacao", icon: Wallet },
      { key: "integracao", label: "Integracao", icon: Link2 },
    ];
    if (isSuperAdmin) {
      sections.push({ key: "admin", label: "Admin", icon: Shield });
    }
    return sections;
  }, [isSuperAdmin]);

  const loadRules = useCallback(async (companyId: string) => {
    const normalizedCompanyId = String(companyId || "").trim();
    if (!normalizedCompanyId) {
      setRules(INITIAL_RULES);
      return;
    }

    setIsLoadingRules(true);
    try {
      const response = await fetchWithAuth(
        `/api/logisync/rules?companyId=${encodeURIComponent(normalizedCompanyId)}`,
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setRules(Array.isArray(data.rules) ? (data.rules as FreightRule[]) : []);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar as regras inteligentes.";
      showToast({
        tone: "error",
        title: "Logisync",
        message,
      });
      setRules(INITIAL_RULES);
    } finally {
      setIsLoadingRules(false);
    }
  }, []);

  const loadConciliationOrders = useCallback(async (companyId: string) => {
    const normalizedCompanyId = String(companyId || "").trim();
    if (!normalizedCompanyId) {
      setConciliationOrders(BASE_ORDERS);
      return;
    }

    setIsLoadingConciliationOrders(true);
    try {
      const response = await fetchWithAuth(
        `/api/logisync/rules/context?companyId=${encodeURIComponent(normalizedCompanyId)}`,
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const orders = Array.isArray(data.orders)
        ? (data.orders as FreightOrder[])
        : [];

      setConciliationOrders(orders.length > 0 ? orders : BASE_ORDERS);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar os pedidos de conciliacao.";
      showToast({
        tone: "warning",
        title: "Logisync",
        message,
      });
      setConciliationOrders(BASE_ORDERS);
    } finally {
      setIsLoadingConciliationOrders(false);
    }
  }, []);

  const loadCompanies = useCallback(async () => {
    setIsLoadingCompanies(true);
    try {
      const response = await fetchWithAuth("/api/companies");
      const data = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const availableCompanies = (Array.isArray(data) ? data : [])
        .map((company: any) => ({
          id: String(company?.id || ""),
          name: String(company?.name || ""),
        }))
        .filter((company: CompanyOption) => company.id && company.name);

      setCompanies(availableCompanies);

      const savedCompanyId =
        typeof window !== "undefined"
          ? String(window.localStorage.getItem(LOGISYNC_COMPANY_STORAGE_KEY) || "")
          : "";
      const preferredCompany = availableCompanies.find(
        (company) => company.id === savedCompanyId,
      );

      const nextCompanyId = preferredCompany?.id || availableCompanies[0]?.id || "";
      setSelectedCompanyId(nextCompanyId);
    } catch (error) {
      setCompanies([]);
      setSelectedCompanyId("");
      showToast({
        tone: "error",
        title: "Logisync",
        message: "Nao foi possivel carregar as empresas para as regras inteligentes.",
      });
    } finally {
      setIsLoadingCompanies(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (selectedCompanyId) {
        window.localStorage.setItem(
          LOGISYNC_COMPANY_STORAGE_KEY,
          selectedCompanyId,
        );
      } else {
        window.localStorage.removeItem(LOGISYNC_COMPANY_STORAGE_KEY);
      }
    }

    if (!selectedCompanyId) {
      setRules(INITIAL_RULES);
      setConciliationOrders(BASE_ORDERS);
      return;
    }

    void loadRules(selectedCompanyId);
    void loadConciliationOrders(selectedCompanyId);
  }, [selectedCompanyId, loadConciliationOrders, loadRules]);

  const carrierOptions = useMemo(
    () =>
      Array.from(new Set(conciliationOrders.map((row) => row.transportadora))).sort(),
    [conciliationOrders],
  );

  useEffect(() => {
    if (carrierOptions.length === 0) {
      setMindMapCarrier("");
      return;
    }

    setMindMapCarrier((current) =>
      carrierOptions.includes(current) ? current : carrierOptions[0],
    );
  }, [carrierOptions]);

  const activeRules = useMemo(
    () => rules.filter((rule) => rule.active),
    [rules],
  );

  const ruleLinkMatrix = useMemo(() => {
    return carrierOptions.map((carrier) => {
      const linkedRules = activeRules.filter(
        (rule) =>
          rule.scope === "all" ||
          (rule.scope === "carriers" && rule.carriers.includes(carrier)),
      );
      const percentFactor = linkedRules.reduce(
        (accumulator, rule) => accumulator * (1 + rule.percentAdd / 100),
        1,
      );
      const fixedTotal = linkedRules.reduce(
        (accumulator, rule) => accumulator + rule.fixedAdd,
        0,
      );

      return {
        carrier,
        linkedRules,
        percentFactor,
        fixedTotal,
      };
    });
  }, [activeRules, carrierOptions]);

  const mindMapCarrierData = useMemo(() => {
    if (ruleLinkMatrix.length === 0) {
      return null;
    }

    return (
      ruleLinkMatrix.find((row) => row.carrier === mindMapCarrier) ||
      ruleLinkMatrix[0]
    );
  }, [mindMapCarrier, ruleLinkMatrix]);

  const mindMapNodes = useMemo(() => {
    if (!mindMapCarrierData || mindMapCarrierData.linkedRules.length === 0) {
      return [] as Array<{ rule: FreightRule; x: number; y: number }>;
    }

    const radius = 34;
    const total = mindMapCarrierData.linkedRules.length;

    return mindMapCarrierData.linkedRules.map((rule, index) => {
      const angle = (2 * Math.PI * index) / Math.max(total, 1) - Math.PI / 2;
      return {
        rule,
        x: 50 + Math.cos(angle) * radius,
        y: 50 + Math.sin(angle) * radius,
      };
    });
  }, [mindMapCarrierData]);

  const getApplicableRules = (carrier: string) =>
    rules.filter(
      (rule) =>
        rule.active &&
        (rule.scope === "all" || (rule.scope === "carriers" && rule.carriers.includes(carrier))),
    );

  const calculateFreightShouldBeCharged = (freightPaid: number, carrier: string) => {
    const applicableRules = getApplicableRules(carrier);
    const percentFactor = applicableRules.reduce(
      (accumulator, rule) => accumulator * (1 + rule.percentAdd / 100),
      1,
    );
    const fixedTotal = applicableRules.reduce((accumulator, rule) => accumulator + rule.fixedAdd, 0);
    const normalizedPaid = Math.max(0, freightPaid - fixedTotal);
    return percentFactor > 0 ? normalizedPaid / percentFactor : normalizedPaid;
  };

  const ordersWithConciliation = useMemo(() => {
    return conciliationOrders.map((order) => {
      const appliedRules = getApplicableRules(order.transportadora);
      const freteDeveriaSerCobrado = calculateFreightShouldBeCharged(
        order.freteCobradoPago,
        order.transportadora,
      );
      const gapVersusCotado = freteDeveriaSerCobrado - order.freteCotado;
      const extraFromRules = order.freteCobradoPago - freteDeveriaSerCobrado;
      const status: "Conciliado" | "Prejuizo" | "Economia" =
        Math.abs(gapVersusCotado) <= 1
          ? "Conciliado"
          : gapVersusCotado > 1
            ? "Prejuizo"
            : "Economia";

      return {
        ...order,
        freteDeveriaSerCobrado,
        gapVersusCotado,
        extraFromRules,
        status,
        appliedRulesCount: appliedRules.length,
      };
    });
  }, [conciliationOrders, rules]);

  const summary = useMemo(() => {
    const totalPaid = ordersWithConciliation.reduce(
      (accumulator, order) => accumulator + order.freteCobradoPago,
      0,
    );
    const totalShould = ordersWithConciliation.reduce(
      (accumulator, order) => accumulator + order.freteDeveriaSerCobrado,
      0,
    );
    const totalQuoted = ordersWithConciliation.reduce(
      (accumulator, order) => accumulator + order.freteCotado,
      0,
    );
    const totalRulesExtra = ordersWithConciliation.reduce(
      (accumulator, order) => accumulator + order.extraFromRules,
      0,
    );
    const totalPrejuizo = ordersWithConciliation.reduce(
      (accumulator, order) => accumulator + Math.max(0, order.gapVersusCotado),
      0,
    );
    const divergentCount = ordersWithConciliation.filter(
      (order) => Math.abs(order.gapVersusCotado) > 1,
    ).length;

    return {
      totalPaid,
      totalShould,
      totalQuoted,
      totalRulesExtra,
      totalPrejuizo,
      divergentCount,
      conciliatedCount: ordersWithConciliation.length - divergentCount,
    };
  }, [ordersWithConciliation]);

  const carrierConciliationData = useMemo(() => {
    const base: Record<
      string,
      { transportadora: string; prejuizo: number; economia: number; divergencias: number }
    > = {};

    for (const order of ordersWithConciliation) {
      if (!base[order.transportadora]) {
        base[order.transportadora] = {
          transportadora: order.transportadora,
          prejuizo: 0,
          economia: 0,
          divergencias: 0,
        };
      }

      base[order.transportadora].prejuizo += Math.max(0, order.gapVersusCotado);
      base[order.transportadora].economia += Math.max(0, -order.gapVersusCotado);
      if (Math.abs(order.gapVersusCotado) > 1) {
        base[order.transportadora].divergencias += 1;
      }
    }

    return Object.values(base);
  }, [ordersWithConciliation]);

  const alertCards = useMemo(
    () => [
      {
        level: "alto",
        title: "Prejuizo potencial acumulado",
        description: "Pedidos com frete acima do cotado apos aplicar as regras ativas.",
        impact: `Impacto atual: ${currency(summary.totalPrejuizo)}`,
      },
      {
        level: "medio",
        title: "Divergencias em transportadoras",
        description: `${summary.divergentCount} pedidos com variacao relevante de conciliacao.`,
        impact: "Revisar regras e custos adicionais ativos",
      },
      {
        level: "baixo",
        title: "Regra global ativa",
        description:
          "Quando houver acrescimo geral, o sistema remove percentual e fixo para calcular a base.",
        impact: "Formula: (Frete Cobrado/Pago - fixo) / fator percentual",
      },
    ],
    [summary.divergentCount, summary.totalPrejuizo],
  );

  const cardBase =
    "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111524]";

  const sectionTitle =
    activeSection === "dashboard"
      ? "Dashboard Executivo"
      : activeSection === "conciliacao"
        ? "Conciliacao de Frete"
        : activeSection === "integracao"
          ? "Integracoes"
          : "Admin Super";
  const isRuleFormDisabled =
    !selectedCompanyId || isSavingRule || isLoadingRules || isLoadingCompanies;

  const handleRuleCarrierToggle = (carrier: string) => {
    setRuleCarriers((current) =>
      current.includes(carrier)
        ? current.filter((item) => item !== carrier)
        : [...current, carrier],
    );
  };

  const handleEditRuleCarrierToggle = (carrier: string) => {
    setEditingRuleDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        carriers: current.carriers.includes(carrier)
          ? current.carriers.filter((item) => item !== carrier)
          : [...current.carriers, carrier],
      };
    });
  };

  const startRuleInlineEdit = (rule: FreightRule) => {
    setEditingRuleId(rule.id);
    setEditingRuleDraft({
      name: rule.name,
      description: rule.description,
      scope: rule.scope,
      carriers: [...rule.carriers],
      percentAdd: String(rule.percentAdd),
      fixedAdd: String(rule.fixedAdd),
    });
    setRuleError("");
  };

  const cancelRuleInlineEdit = () => {
    setEditingRuleId(null);
    setEditingRuleDraft(null);
  };

  const saveRuleInlineEdit = async (ruleId: string) => {
    if (!selectedCompanyId) {
      setRuleError("Selecione uma empresa para salvar as regras.");
      return;
    }

    if (!editingRuleDraft) {
      return;
    }

    const name = editingRuleDraft.name.trim();
    const description =
      editingRuleDraft.description.trim() || "Regra criada manualmente.";
    const scope = editingRuleDraft.scope;
    const carriers =
      scope === "all"
        ? []
        : Array.from(
            new Set(
              editingRuleDraft.carriers
                .map((carrier) => carrier.trim())
                .filter(Boolean),
            ),
          );
    const percentAdd = Number.parseFloat(editingRuleDraft.percentAdd || "0");
    const fixedAdd = Number.parseFloat(editingRuleDraft.fixedAdd || "0");
    const normalizedPercent = Number.isFinite(percentAdd) ? percentAdd : 0;
    const normalizedFixed = Number.isFinite(fixedAdd) ? fixedAdd : 0;

    if (!name) {
      setRuleError("Informe um nome para a regra.");
      return;
    }

    if (scope === "carriers" && carriers.length === 0) {
      setRuleError("Selecione ao menos uma transportadora para a regra.");
      return;
    }

    if (normalizedPercent <= 0 && normalizedFixed <= 0) {
      setRuleError("Informe ao menos um adicional percentual ou fixo.");
      return;
    }

    setIsSavingRule(true);
    try {
      const response = await fetchWithAuth(
        `/api/logisync/rules/${encodeURIComponent(ruleId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            rule: {
              name,
              description,
              scope,
              carriers,
              percentAdd: normalizedPercent,
              fixedAdd: normalizedFixed,
            },
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setRules(Array.isArray(data.rules) ? (data.rules as FreightRule[]) : []);
      setEditingRuleId(null);
      setEditingRuleDraft(null);
      showToast({
        tone: "success",
        title: "Logisync",
        message: "Regra atualizada com sucesso.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar a regra.";
      setRuleError(message);
      showToast({
        tone: "error",
        title: "Logisync",
        message,
      });
    } finally {
      setIsSavingRule(false);
    }
  };

  const handleCreateRule = async () => {
    setRuleError("");
    if (!selectedCompanyId) {
      setRuleError("Selecione uma empresa para salvar as regras.");
      return;
    }

    const parsedPercent = Number.parseFloat(rulePercent || "0");
    const parsedFixed = Number.parseFloat(ruleFixed || "0");
    const percentAdd = Number.isFinite(parsedPercent) ? parsedPercent : 0;
    const fixedAdd = Number.isFinite(parsedFixed) ? parsedFixed : 0;

    if (!ruleName.trim()) {
      setRuleError("Informe um nome para a regra.");
      return;
    }
    if (percentAdd <= 0 && fixedAdd <= 0) {
      setRuleError("Informe ao menos um adicional percentual ou fixo.");
      return;
    }
    if (ruleScope === "carriers" && ruleCarriers.length === 0) {
      setRuleError("Selecione ao menos uma transportadora para a regra.");
      return;
    }

    setIsSavingRule(true);
    try {
      const response = await fetchWithAuth("/api/logisync/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          rule: {
            name: ruleName.trim(),
            description: ruleDescription.trim() || "Regra criada manualmente.",
            scope: ruleScope,
            carriers: ruleScope === "all" ? [] : ruleCarriers,
            percentAdd,
            fixedAdd,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setRules(Array.isArray(data.rules) ? (data.rules as FreightRule[]) : []);
      setRuleName("");
      setRuleDescription("");
      setRuleScope("all");
      setRuleCarriers([]);
      setRulePercent("");
      setRuleFixed("");
      showToast({
        tone: "success",
        title: "Logisync",
        message: "Regra inteligente salva para a empresa selecionada.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar a regra inteligente.";
      setRuleError(message);
      showToast({
        tone: "error",
        title: "Logisync",
        message,
      });
    } finally {
      setIsSavingRule(false);
    }
  };

  const toggleRuleStatus = async (ruleId: string) => {
    if (!selectedCompanyId) {
      return;
    }

    const targetRule = rules.find((rule) => rule.id === ruleId);
    if (!targetRule) {
      return;
    }

    setIsSavingRule(true);
    try {
      const response = await fetchWithAuth(
        `/api/logisync/rules/${encodeURIComponent(ruleId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            rule: {
              active: !targetRule.active,
            },
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setRules(Array.isArray(data.rules) ? (data.rules as FreightRule[]) : []);
      if (editingRuleId === ruleId) {
        setEditingRuleId(null);
        setEditingRuleDraft(null);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar o status da regra.";
      showToast({
        tone: "error",
        title: "Logisync",
        message,
      });
    } finally {
      setIsSavingRule(false);
    }
  };

  const removeRule = async (ruleId: string) => {
    if (!selectedCompanyId) {
      return;
    }

    setIsSavingRule(true);
    try {
      const response = await fetchWithAuth(
        `/api/logisync/rules/${encodeURIComponent(ruleId)}?companyId=${encodeURIComponent(selectedCompanyId)}`,
        {
          method: "DELETE",
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setRules(Array.isArray(data.rules) ? (data.rules as FreightRule[]) : []);
      if (editingRuleId === ruleId) {
        setEditingRuleId(null);
        setEditingRuleDraft(null);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel remover a regra.";
      showToast({
        tone: "error",
        title: "Logisync",
        message,
      });
    } finally {
      setIsSavingRule(false);
    }
  };

  const renderDashboard = () => (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={cardBase}>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Frete Cobrado/Pago
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {currency(summary.totalPaid)}
          </p>
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-300">
            <ArrowUpRight className="h-3 w-3" /> Valor faturado na operacao atual
          </div>
        </div>

        <div className={cardBase}>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Frete Deveria Ser Cobrado
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {currency(summary.totalShould)}
          </p>
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-300">
            <SlidersHorizontal className="h-3 w-3" /> Sem acrescimos de regras ativas
          </div>
        </div>

        <div className={cardBase}>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Diferenca vs Cotado
          </p>
          <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-300">
            {currency(summary.totalPrejuizo)}
          </p>
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-300">
            <ArrowDownRight className="h-3 w-3" /> Prejuizo potencial conciliado
          </div>
        </div>

        <div className={cardBase}>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Impacto das Regras
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {currency(summary.totalRulesExtra)}
          </p>
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-300">
            <ArrowUpRight className="h-3 w-3" /> Acrescimos percentuais e fixos ativos
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className={clsx(cardBase, "xl:col-span-2")}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
            Comparativo Mensal
          </h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MONTHLY_DATA}>
                <defs>
                  <linearGradient id="logiCotado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="logiCobradoPago" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#33415533" />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={(value) => currency(value)} />
                <Tooltip formatter={(value: number | undefined) => (value === undefined ? "-" : currency(value))} />
                <Legend />
                <Area type="monotone" dataKey="cotado" stroke="#2563eb" fill="url(#logiCotado)" strokeWidth={2} name="Frete Cotado" />
                <Area type="monotone" dataKey="cobradoPago" stroke="#f97316" fill="url(#logiCobradoPago)" strokeWidth={2} name="Frete Cobrado/Pago" />
                <Line type="monotone" dataKey="deveria" stroke="#22c55e" strokeWidth={2.2} name="Frete Deveria Ser Cobrado" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardBase}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
            Alertas de Atencao
          </h3>
          <div className="space-y-3">
            {alertCards.map((alert) => (
              <div
                key={alert.title}
                className={clsx(
                  "rounded-xl border px-3 py-3",
                  alert.level === "alto"
                    ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
                    : alert.level === "medio"
                      ? "border-orange-200 bg-orange-50 dark:border-orange-500/30 dark:bg-orange-500/10"
                      : "border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10",
                )}
              >
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{alert.title}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{alert.description}</p>
                <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{alert.impact}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderRulesPanel = () => (
    <div className={cardBase}>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
        Regras Inteligentes de Custo Adicional
      </h3>

      {!selectedCompanyId && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Selecione uma empresa para carregar e salvar as regras inteligentes.
        </div>
      )}

      {(isLoadingRules || isLoadingCompanies) && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          Carregando regras da empresa selecionada...
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={ruleName}
          onChange={(event) => setRuleName(event.target.value)}
          disabled={isRuleFormDisabled}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          placeholder="Nome da regra"
        />
        <input
          value={ruleDescription}
          onChange={(event) => setRuleDescription(event.target.value)}
          disabled={isRuleFormDisabled}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          placeholder="Descricao da regra"
        />
        <select
          value={ruleScope}
          onChange={(event) => setRuleScope(event.target.value as RuleScope)}
          disabled={isRuleFormDisabled}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
        >
          <option value="all">Geral (todas as transportadoras)</option>
          <option value="carriers">Por transportadora</option>
        </select>
        <input
          value={rulePercent}
          onChange={(event) => setRulePercent(event.target.value)}
          type="number"
          step="0.1"
          disabled={isRuleFormDisabled}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          placeholder="Adicional percentual (%)"
        />
        <input
          value={ruleFixed}
          onChange={(event) => setRuleFixed(event.target.value)}
          type="number"
          step="0.01"
          disabled={isRuleFormDisabled}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          placeholder="Adicional fixo (R$)"
        />
        <button
          type="button"
          onClick={handleCreateRule}
          disabled={isRuleFormDisabled}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-orange-500 px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          {isSavingRule ? "Salvando..." : "Adicionar regra"}
        </button>
      </div>

      {ruleScope === "carriers" && (
        <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            Transportadoras da regra
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {carrierOptions.map((carrier) => (
              <button
                key={carrier}
                type="button"
                onClick={() => handleRuleCarrierToggle(carrier)}
                disabled={isRuleFormDisabled}
                className={clsx(
                  "rounded-lg border px-2 py-1.5 text-xs text-left transition-colors",
                  ruleCarriers.includes(carrier)
                    ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-300 dark:bg-blue-500/20 dark:text-blue-200"
                    : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10",
                )}
              >
                {carrier}
              </button>
            ))}
          </div>
        </div>
      )}

      {ruleError && <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{ruleError}</p>}

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-white/10 dark:bg-white/5">
        <p className="font-semibold text-slate-700 dark:text-slate-200">Formula aplicada:</p>
        <p className="mt-1 text-slate-600 dark:text-slate-300">
          Frete que deveria ser cobrado = (Frete Cobrado/Pago - soma dos fixos) / produto dos fatores percentuais.
        </p>
        <p className="mt-1 text-slate-600 dark:text-slate-300">
          Exemplo: regra geral 30 por cento, frete base = Frete Cobrado/Pago / 1,30.
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          Ligacao Inteligente (Mapa Mental)
        </p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          O sistema combina todas as regras ativas gerais + regras por transportadora para calcular o frete base sem acrescimo.
        </p>
        <div className="mt-3 grid gap-3 xl:grid-cols-[260px_1fr]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-[#0d1220]">
            <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Transportadora alvo
            </label>
            <select
              value={mindMapCarrier}
              onChange={(event) => setMindMapCarrier(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:outline-none dark:border-white/10 dark:bg-[#111524] dark:text-slate-200"
            >
              {carrierOptions.map((carrier) => (
                <option key={carrier} value={carrier}>
                  {carrier}
                </option>
              ))}
            </select>
            <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              <p>
                Regras ativas ligadas:{" "}
                <strong>{mindMapCarrierData?.linkedRules.length || 0}</strong>
              </p>
              <p>
                Fator % acumulado:{" "}
                <strong>
                  {(mindMapCarrierData?.percentFactor || 1)
                    .toFixed(4)
                    .replace(".", ",")}
                </strong>
              </p>
              <p>
                Total fixo acumulado:{" "}
                <strong>{currency(mindMapCarrierData?.fixedTotal || 0)}</strong>
              </p>
            </div>
          </div>

          <div className="relative h-[340px] overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12),transparent_62%)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.12),transparent_62%)]">
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {mindMapNodes.map((node) => (
                <line
                  key={`line-${node.rule.id}`}
                  x1={50}
                  y1={50}
                  x2={node.x}
                  y2={node.y}
                  stroke="rgba(59,130,246,0.55)"
                  strokeWidth="0.45"
                />
              ))}
            </svg>

            <div className="absolute left-1/2 top-1/2 w-[170px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-center text-xs text-blue-800 dark:border-blue-400/40 dark:bg-blue-500/20 dark:text-blue-200">
              <p className="font-bold">{mindMapCarrierData?.carrier || "Transportadora"}</p>
              <p className="mt-1">Frete base = (Cobrado - fixo) / fator %</p>
            </div>

            {mindMapNodes.map((node) => (
              <div
                key={node.rule.id}
                className="absolute w-[170px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] text-slate-700 shadow-sm dark:border-white/10 dark:bg-[#111524] dark:text-slate-200"
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                }}
              >
                <p className="font-semibold">{node.rule.name}</p>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  {node.rule.scope === "all"
                    ? "Regra geral"
                    : `Transportadoras: ${node.rule.carriers.join(", ")}`}
                </p>
                <p className="mt-1">
                  +{formatPercent(node.rule.percentAdd)} e {currency(node.rule.fixedAdd)}
                </p>
              </div>
            ))}

            {mindMapCarrierData && mindMapCarrierData.linkedRules.length === 0 && (
              <div className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-500 dark:border-white/20 dark:bg-[#111524] dark:text-slate-400">
                Sem regras ativas ligadas para esta transportadora
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {ruleLinkMatrix.map((row) => (
            <div key={row.carrier} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{row.carrier}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {row.linkedRules.length} regra(s) ativa(s) ligada(s)
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Fator % acumulado: {row.percentFactor.toFixed(4).replace(".", ",")}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Total fixo acumulado: {currency(row.fixedTotal)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {rules.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-white/20 dark:text-slate-400">
            Nenhuma regra cadastrada para esta empresa.
          </div>
        )}
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={clsx(
              "rounded-xl border px-3 py-3",
              rule.active
                ? "border-blue-200 bg-blue-50/60 dark:border-blue-400/30 dark:bg-blue-500/10"
                : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5",
            )}
          >
            {editingRuleId === rule.id && editingRuleDraft ? (
              <div className="space-y-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    value={editingRuleDraft.name}
                    onChange={(event) =>
                      setEditingRuleDraft((current) =>
                        current
                          ? { ...current, name: event.target.value }
                          : current,
                      )
                    }
                    disabled={isSavingRule}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5"
                    placeholder="Nome da regra"
                  />
                  <input
                    value={editingRuleDraft.description}
                    onChange={(event) =>
                      setEditingRuleDraft((current) =>
                        current
                          ? { ...current, description: event.target.value }
                          : current,
                      )
                    }
                    disabled={isSavingRule}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5"
                    placeholder="Descricao da regra"
                  />
                  <select
                    value={editingRuleDraft.scope}
                    onChange={(event) =>
                      setEditingRuleDraft((current) =>
                        current
                          ? {
                              ...current,
                              scope: event.target.value as RuleScope,
                              carriers:
                                event.target.value === "all"
                                  ? []
                                  : current.carriers,
                            }
                          : current,
                      )
                    }
                    disabled={isSavingRule}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5"
                  >
                    <option value="all">Geral</option>
                    <option value="carriers">Por transportadora</option>
                  </select>
                  <input
                    value={editingRuleDraft.percentAdd}
                    onChange={(event) =>
                      setEditingRuleDraft((current) =>
                        current
                          ? { ...current, percentAdd: event.target.value }
                          : current,
                      )
                    }
                    type="number"
                    step="0.1"
                    disabled={isSavingRule}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5"
                    placeholder="Adicional %"
                  />
                  <input
                    value={editingRuleDraft.fixedAdd}
                    onChange={(event) =>
                      setEditingRuleDraft((current) =>
                        current
                          ? { ...current, fixedAdd: event.target.value }
                          : current,
                      )
                    }
                    type="number"
                    step="0.01"
                    disabled={isSavingRule}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5"
                    placeholder="Adicional R$"
                  />
                </div>

                {editingRuleDraft.scope === "carriers" && (
                  <div className="rounded-lg border border-slate-200 p-2 dark:border-white/10">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      Transportadoras da regra
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {carrierOptions.map((carrier) => (
                        <button
                          key={`${rule.id}-${carrier}`}
                          type="button"
                          onClick={() => handleEditRuleCarrierToggle(carrier)}
                          disabled={isSavingRule}
                          className={clsx(
                            "rounded-lg border px-2 py-1 text-xs text-left transition-colors",
                            editingRuleDraft.carriers.includes(carrier)
                              ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-300 dark:bg-blue-500/20 dark:text-blue-200"
                              : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10",
                          )}
                        >
                          {carrier}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveRuleInlineEdit(rule.id)}
                    disabled={isSavingRule || !selectedCompanyId}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-400/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                  >
                    <Save className="h-4 w-4" />
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={cancelRuleInlineEdit}
                    disabled={isSavingRule}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {rule.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {rule.description}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Escopo: {rule.scope === "all" ? "Geral" : rule.carriers.join(", ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Adicional: {formatPercent(rule.percentAdd)} e {currency(rule.fixedAdd)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startRuleInlineEdit(rule)}
                    disabled={isSavingRule || !selectedCompanyId}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-300 px-2 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-400/30 dark:text-blue-300 dark:hover:bg-blue-500/10"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleRuleStatus(rule.id)}
                    disabled={isSavingRule || !selectedCompanyId}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    {rule.active ? (
                      <ToggleRight className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-slate-400" />
                    )}
                    {rule.active ? "Ativa" : "Inativa"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRule(rule.id)}
                    disabled={isSavingRule || !selectedCompanyId}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2 py-1 text-xs text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-400/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderConciliationTable = () => (
    <div className={cardBase}>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
        Pedidos em Conciliacao
      </h3>
      {isLoadingConciliationOrders ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-4 text-sm text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          Carregando pedidos de conciliacao da empresa selecionada...
        </div>
      ) : ordersWithConciliation.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-white/20 dark:text-slate-400">
          Nenhum pedido disponivel para conciliacao nesta empresa.
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500 dark:border-white/10 dark:text-slate-400">
              <th className="py-3 pr-4">Pedido</th>
              <th className="py-3 pr-4">Transportadora</th>
              <th className="py-3 pr-4">Frete Cotado</th>
              <th className="py-3 pr-4">Frete Cobrado/Pago</th>
              <th className="py-3 pr-4">Frete Deveria Ser Cobrado</th>
              <th className="py-3 pr-4">Regras</th>
              <th className="py-3 pr-4">Gap vs Cotado</th>
              <th className="py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {ordersWithConciliation.map((order) => (
              <tr key={order.pedido} className="border-b border-slate-100 dark:border-white/5">
                <td className="py-3 pr-4 font-semibold text-slate-800 dark:text-slate-100">{order.pedido}</td>
                <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{order.transportadora}</td>
                <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{currency(order.freteCotado)}</td>
                <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{currency(order.freteCobradoPago)}</td>
                <td className="py-3 pr-4 font-semibold text-blue-700 dark:text-blue-300">
                  {currency(order.freteDeveriaSerCobrado)}
                </td>
                <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{order.appliedRulesCount}</td>
                <td className={clsx("py-3 pr-4 font-semibold", order.gapVersusCotado > 0 ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300")}>
                  {order.gapVersusCotado > 0 ? "+" : ""}
                  {currency(order.gapVersusCotado)}
                </td>
                <td className="py-3">
                  <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", statusTone(order.status))}>
                    {order.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );

  const renderConciliacao = () => {
    if (activeSubtab === "regras-inteligentes") {
      return (
        <div className="space-y-5">
          {renderRulesPanel()}
          <div className={cardBase}>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              Resumo por Transportadora com Regras Ativas
            </h3>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={carrierConciliationData}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#33415533" />
                  <XAxis dataKey="transportadora" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip formatter={(value: number | undefined) => (value === undefined ? "-" : currency(value))} />
                  <Legend />
                  <Bar dataKey="prejuizo" fill="#f97316" radius={[8, 8, 0, 0]} name="Prejuizo" />
                  <Bar dataKey="economia" fill="#22c55e" radius={[8, 8, 0, 0]} name="Economia" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      );
    }

    if (activeSubtab === "pedidos") {
      return <div className="space-y-5">{renderConciliationTable()}</div>;
    }

    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-4">
          <div className={cardBase}>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Frete Cobrado/Pago</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{currency(summary.totalPaid)}</p>
          </div>
          <div className={cardBase}>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Frete Deveria Ser Cobrado</p>
            <p className="mt-2 text-2xl font-bold text-blue-700 dark:text-blue-300">{currency(summary.totalShould)}</p>
          </div>
          <div className={cardBase}>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Pedidos Divergentes</p>
            <p className="mt-2 text-2xl font-bold text-orange-600 dark:text-orange-300">{summary.divergentCount}</p>
          </div>
          <div className={cardBase}>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Prejuizo Potencial</p>
            <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-300">{currency(summary.totalPrejuizo)}</p>
          </div>
        </div>

        <div className={cardBase}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
            Divergencias por Transportadora
          </h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={carrierConciliationData}>
                <CartesianGrid strokeDasharray="4 4" stroke="#33415533" />
                <XAxis dataKey="transportadora" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip formatter={(value: number | undefined) => (value === undefined ? "-" : currency(value))} />
                <Legend />
                <Bar dataKey="divergencias" fill="#2563eb" radius={[8, 8, 0, 0]} name="Qtd divergencias" />
                <Bar dataKey="prejuizo" fill="#f97316" radius={[8, 8, 0, 0]} name="Prejuizo" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {renderConciliationTable()}
      </div>
    );
  };

  const renderIntegracao = () => (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {INTEGRATIONS.map((integration) => (
          <div key={integration.name} className={cardBase}>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{integration.name}</p>
            <p
              className={clsx(
                "mt-2 text-lg font-bold",
                integration.status === "Online"
                  ? "text-emerald-600 dark:text-emerald-300"
                  : "text-orange-600 dark:text-orange-300",
              )}
            >
              {integration.status}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sync: {integration.sync}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Acuracia: {integration.accuracy}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className={clsx(cardBase, "xl:col-span-2")}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
            Latencia de APIs (ms)
          </h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={API_LATENCY_DATA}>
                <CartesianGrid strokeDasharray="4 4" stroke="#33415533" />
                <XAxis dataKey="slot" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="tray" stroke="#2563eb" strokeWidth={2.2} name="Tray" />
                <Line type="monotone" dataKey="intelipost" stroke="#f97316" strokeWidth={2.2} name="Intelipost" />
                <Line type="monotone" dataKey="correios" stroke="#14b8a6" strokeWidth={2.2} name="Correios" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardBase}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
            Automacoes
          </h3>
          <div className="space-y-3">
            {AUTOMATIONS.map((automation) => (
              <div key={automation.title} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{automation.title}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{automation.description}</p>
                <p
                  className={clsx(
                    "mt-2 text-xs font-semibold",
                    automation.status === "Ativa"
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-orange-600 dark:text-orange-300",
                  )}
                >
                  {automation.status}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAdmin = () => {
    if (!isSuperAdmin) {
      return (
        <div className={cardBase}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Esta area esta disponivel apenas para admin super.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className={cardBase}>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Usuarios ativos</p>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">18</p>
          </div>
          <div className={cardBase}>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Admins super</p>
            <p className="mt-2 text-3xl font-bold text-blue-600 dark:text-blue-300">2</p>
          </div>
          <div className={cardBase}>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Regras ativas</p>
            <p className="mt-2 text-3xl font-bold text-orange-600 dark:text-orange-300">{rules.filter((rule) => rule.active).length}</p>
          </div>
        </div>

        <div className={cardBase}>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
            Governanca de Usuarios
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <th className="py-3 pr-4">Nome</th>
                  <th className="py-3 pr-4">E-mail</th>
                  <th className="py-3 pr-4">Perfil</th>
                  <th className="py-3">Ultimo acesso</th>
                </tr>
              </thead>
              <tbody>
                {ADMIN_USERS.map((adminUser) => (
                  <tr key={adminUser.email} className="border-b border-slate-100 dark:border-white/5">
                    <td className="py-3 pr-4 font-semibold text-slate-800 dark:text-slate-100">{adminUser.name}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{adminUser.email}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{adminUser.role}</td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">{adminUser.lastAccess}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (activeSection === "dashboard") return renderDashboard();
    if (activeSection === "conciliacao") return renderConciliacao();
    if (activeSection === "integracao") return renderIntegracao();
    return renderAdmin();
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-[#070a12] dark:text-slate-100">
      {mobileSidebarOpen && (
        <button
          className="fixed inset-0 z-20 bg-slate-900/40 backdrop-blur-[1px] md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-label="Fechar menu"
        />
      )}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-slate-200 bg-white/95 backdrop-blur-xl transition-all duration-300 dark:border-white/10 dark:bg-[#0e1320]/95",
          sidebarCollapsed ? "w-20" : "w-72",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-white/10">
          <div className={clsx("flex items-center gap-3", sidebarCollapsed && "justify-center")}>
            <img src="/logisync.png" alt="Logisync" className="h-9 w-auto object-contain" />
            {!sidebarCollapsed && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Logisync
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Freight Intelligence
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            className="hidden rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 md:block dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label="Recolher menu"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.key;
            return (
              <div key={section.key} className="mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection(section.key);
                    setActiveSubtab(SECTION_TABS[section.key][0]?.key || "");
                    setMobileSidebarOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center rounded-xl px-3 py-3 text-left transition-all",
                    sidebarCollapsed ? "justify-center" : "justify-between",
                    isActive
                      ? "bg-[linear-gradient(90deg,rgba(37,99,235,0.14),rgba(249,115,22,0.14))] text-slate-900 dark:text-white"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
                  )}
                >
                  <div className={clsx("flex items-center", !sidebarCollapsed && "gap-3")}>
                    <Icon className="h-4 w-4" />
                    {!sidebarCollapsed && <span className="text-sm font-semibold">{section.label}</span>}
                  </div>
                </button>

                {!sidebarCollapsed && isActive && (
                  <div className="ml-9 mt-2 flex flex-col gap-1">
                    {SECTION_TABS[section.key].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveSubtab(tab.key)}
                        className={clsx(
                          "rounded-md px-2 py-1 text-left text-xs transition-colors",
                          activeSubtab === tab.key
                            ? "bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200",
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 dark:border-white/10">
          {!sidebarCollapsed && (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5">
              <p className="font-semibold text-slate-700 dark:text-slate-200">{user?.name}</p>
              <p className="mt-1 text-slate-500 dark:text-slate-400">{isSuperAdmin ? "ADMIN_SUPER" : user?.role}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {!sidebarCollapsed && "Tema"}
            </button>
            <button
              type="button"
              onClick={logout}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-400/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <LogOut className="h-4 w-4" />
              {!sidebarCollapsed && "Sair"}
            </button>
          </div>
        </div>
      </aside>

      <div className={clsx("transition-all duration-300", sidebarCollapsed ? "md:ml-20" : "md:ml-72")}>
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/92 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#0c1120]/92 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-white/10"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Abrir menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Modulo Logisync
                </p>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">{sectionTitle}</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {SECTION_TABS[activeSection].find((tab) => tab.key === activeSubtab)?.label || ""}
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-3 md:flex">
              {isAdminProfile && (
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  <span className="uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    Empresa
                  </span>
                  <select
                    value={selectedCompanyId}
                    onChange={(event) => setSelectedCompanyId(event.target.value)}
                    disabled={isLoadingCompanies || companies.length === 0}
                    className="min-w-[220px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none dark:border-white/10 dark:bg-[#111524] dark:text-slate-200"
                  >
                    {companies.length === 0 ? (
                      <option value="">
                        {isLoadingCompanies
                          ? "Carregando empresas..."
                          : "Nenhuma empresa"}
                      </option>
                    ) : (
                      companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                <BellRing className="h-3.5 w-3.5" />
                {summary.divergentCount} alertas de conciliacao
              </div>
            </div>
          </div>
        </header>

        <main className="space-y-5 p-4 md:p-6">
          <section className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-500/30 dark:bg-blue-500/10">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                <Truck className="h-3.5 w-3.5" /> Operacao
              </div>
              <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
                {ordersWithConciliation.length} pedidos monitorados na conciliacao.
              </p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-500/30 dark:bg-orange-500/10">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-700 dark:text-orange-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Atencao
              </div>
              <p className="mt-2 text-sm text-orange-800 dark:text-orange-200">
                {summary.divergentCount} pedidos com divergencia acima da tolerancia.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">
                <Bot className="h-3.5 w-3.5" /> Inteligencia de regras
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                {rules.filter((rule) => rule.active).length} regras ativas para calculo inteligente.
              </p>
            </div>
          </section>

          {renderContent()}
        </main>
      </div>
    </div>
  );
};
