import React, { useMemo, useState } from "react";
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
  Shield,
  Sun,
  Truck,
  Wallet,
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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { clsx } from "clsx";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";

type SectionKey = "dashboard" | "conciliacao" | "integracao" | "admin";

const SECTION_TABS: Record<SectionKey, Array<{ key: string; label: string }>> = {
  dashboard: [
    { key: "visao-geral", label: "Visao Geral" },
    { key: "comparativos", label: "Comparativos" },
    { key: "alertas", label: "Alertas" },
  ],
  conciliacao: [
    { key: "resumo", label: "Resumo" },
    { key: "transportadoras", label: "Transportadoras" },
    { key: "pedidos", label: "Pedidos" },
  ],
  integracao: [
    { key: "status", label: "Status" },
    { key: "latencia", label: "Latencia APIs" },
    { key: "automacoes", label: "Automacoes" },
  ],
  admin: [
    { key: "usuarios", label: "Usuarios" },
    { key: "regras", label: "Regras" },
  ],
};

const MONTHLY_DATA = [
  { month: "Jan", cotado: 118000, cobrado: 123200, reconciliado: 91 },
  { month: "Fev", cotado: 121200, cobrado: 125900, reconciliado: 92 },
  { month: "Mar", cotado: 129400, cobrado: 137000, reconciliado: 89 },
  { month: "Abr", cotado: 134300, cobrado: 145900, reconciliado: 87 },
  { month: "Mai", cotado: 140100, cobrado: 149200, reconciliado: 90 },
  { month: "Jun", cotado: 146500, cobrado: 154000, reconciliado: 93 },
];

const CARRIER_LOSS_DATA = [
  { carrier: "Correios", prejuizo: 4200, divergencias: 19 },
  { carrier: "Jadlog", prejuizo: 6900, divergencias: 28 },
  { carrier: "Intelipost", prejuizo: 2800, divergencias: 11 },
  { carrier: "SSW", prejuizo: 5100, divergencias: 17 },
  { carrier: "Azul Cargo", prejuizo: 1600, divergencias: 8 },
];

const STATUS_DONUT_DATA = [
  { name: "Conciliado", value: 72, fill: "#2563eb" },
  { name: "Em analise", value: 18, fill: "#f97316" },
  { name: "Risco", value: 10, fill: "#ef4444" },
];

const API_LATENCY_DATA = [
  { slot: "08h", tray: 420, intelipost: 280, correios: 360 },
  { slot: "10h", tray: 460, intelipost: 260, correios: 330 },
  { slot: "12h", tray: 490, intelipost: 310, correios: 350 },
  { slot: "14h", tray: 455, intelipost: 295, correios: 340 },
  { slot: "16h", tray: 430, intelipost: 285, correios: 320 },
  { slot: "18h", tray: 410, intelipost: 270, correios: 305 },
];

const CONCILIATION_ROWS = [
  { pedido: "#980211", transportadora: "Jadlog", cotado: 121.4, cobrado: 136.2, status: "Prejuizo" },
  { pedido: "#980244", transportadora: "Correios", cotado: 58.9, cobrado: 57.1, status: "Economia" },
  { pedido: "#980301", transportadora: "SSW", cotado: 210.3, cobrado: 238.8, status: "Prejuizo" },
  { pedido: "#980327", transportadora: "Intelipost", cotado: 92.0, cobrado: 91.5, status: "Conciliado" },
  { pedido: "#980355", transportadora: "Jadlog", cotado: 71.3, cobrado: 88.4, status: "Prejuizo" },
  { pedido: "#980380", transportadora: "Azul Cargo", cotado: 143.8, cobrado: 143.2, status: "Conciliado" },
];

const ALERTS = [
  {
    level: "alto",
    title: "Pico de prejuizo na Jadlog",
    description: "Divergencia media de 14,3% nas ultimas 48h.",
    impact: "Risco estimado: R$ 6.900",
  },
  {
    level: "medio",
    title: "Falha intermitente na API Tray",
    description: "3 timeouts detectados na sincronizacao do periodo.",
    impact: "Atraso potencial em 27 pedidos",
  },
  {
    level: "baixo",
    title: "Regra de cubagem sem revisao",
    description: "Tabela vigente ha 63 dias sem recalculo.",
    impact: "Revisar para reduzir perdas operacionais",
  },
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
    description: "Executa comparativo de frete cotado x cobrado as 06:00 e 18:00.",
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

const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);

const currencyFine = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const percent = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;

export const LogisyncWorkspace: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isSuperAdmin = Boolean(user?.isSuperAdmin);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>("dashboard");
  const [activeSubtab, setActiveSubtab] = useState<string>(SECTION_TABS.dashboard[0].key);

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

  const totals = useMemo(() => {
    const cotado = MONTHLY_DATA.reduce((acc, row) => acc + row.cotado, 0);
    const cobrado = MONTHLY_DATA.reduce((acc, row) => acc + row.cobrado, 0);
    const prejuizo = Math.max(0, cobrado - cotado);
    const mediaReconciliacao =
      MONTHLY_DATA.reduce((acc, row) => acc + row.reconciliado, 0) / MONTHLY_DATA.length;
    return { cotado, cobrado, prejuizo, mediaReconciliacao };
  }, []);

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

  const renderDashboard = () => (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={cardBase}>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Frete Cotado (6m)</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{currency(totals.cotado)}</p>
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-300">
            <ArrowUpRight className="h-3 w-3" /> +5,2% vs periodo anterior
          </div>
        </div>

        <div className={cardBase}>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Frete Cobrado (6m)</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{currency(totals.cobrado)}</p>
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-300">
            <AlertTriangle className="h-3 w-3" /> +7,1% vs periodo anterior
          </div>
        </div>

        <div className={cardBase}>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Prejuizo Acumulado</p>
          <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-300">{currency(totals.prejuizo)}</p>
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-300">
            <ArrowDownRight className="h-3 w-3" /> Prioridade alta de ajuste
          </div>
        </div>

        <div className={cardBase}>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Taxa Media Conciliada</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{percent(totals.mediaReconciliacao)}</p>
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-300">
            <ArrowUpRight className="h-3 w-3" /> +2,8pp no ultimo ciclo
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className={clsx(cardBase, "xl:col-span-2")}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
            Comparativo Mensal: Cotado x Cobrado
          </h3>
          <div className="h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MONTHLY_DATA}>
                <defs>
                  <linearGradient id="logiCotado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="logiCobrado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#33415533" />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={(value) => currency(value)} />
                <Tooltip formatter={(value: number) => currency(value)} />
                <Legend />
                <Area type="monotone" dataKey="cotado" stroke="#2563eb" fill="url(#logiCotado)" strokeWidth={2.2} name="Frete Cotado" />
                <Area type="monotone" dataKey="cobrado" stroke="#f97316" fill="url(#logiCobrado)" strokeWidth={2.2} name="Frete Cobrado" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardBase}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
            Status da Conciliacao
          </h3>
          <div className="h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={STATUS_DONUT_DATA} dataKey="value" nameKey="name" innerRadius={62} outerRadius={94} paddingAngle={4} />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className={clsx(cardBase, "xl:col-span-2")}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
            Prejuizo por Transportadora
          </h3>
          <div className="h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={CARRIER_LOSS_DATA}>
                <CartesianGrid strokeDasharray="4 4" stroke="#33415533" />
                <XAxis dataKey="carrier" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={(value) => currency(value)} />
                <Tooltip formatter={(value: number) => currency(value)} />
                <Legend />
                <Bar dataKey="prejuizo" fill="#f97316" radius={[8, 8, 0, 0]} name="Prejuizo" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardBase}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
            Alertas de Atencao
          </h3>
          <div className="space-y-3">
            {ALERTS.map((alert) => (
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

  const renderConciliacao = () => (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className={cardBase}>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Pedidos Conciliados</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">1.928</p>
        </div>
        <div className={cardBase}>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Em Divergencia</p>
          <p className="mt-2 text-3xl font-bold text-orange-600 dark:text-orange-300">182</p>
        </div>
        <div className={cardBase}>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Impacto Financeiro Atual</p>
          <p className="mt-2 text-3xl font-bold text-rose-600 dark:text-rose-300">{currency(20600)}</p>
        </div>
      </div>

      <div className={cardBase}>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
          Divergencias por Transportadora
        </h3>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={CARRIER_LOSS_DATA}>
              <CartesianGrid strokeDasharray="4 4" stroke="#33415533" />
              <XAxis dataKey="carrier" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Legend />
              <Bar dataKey="divergencias" fill="#2563eb" radius={[8, 8, 0, 0]} name="Qtd divergencias" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={cardBase}>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
          Pedidos em Conciliacao
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500 dark:border-white/10 dark:text-slate-400">
                <th className="py-3 pr-4">Pedido</th>
                <th className="py-3 pr-4">Transportadora</th>
                <th className="py-3 pr-4">Cotado</th>
                <th className="py-3 pr-4">Cobrado</th>
                <th className="py-3 pr-4">Diferenca</th>
                <th className="py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {CONCILIATION_ROWS.map((row) => {
                const diff = row.cobrado - row.cotado;
                return (
                  <tr key={row.pedido} className="border-b border-slate-100 dark:border-white/5">
                    <td className="py-3 pr-4 font-semibold text-slate-800 dark:text-slate-100">{row.pedido}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{row.transportadora}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{currencyFine(row.cotado)}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{currencyFine(row.cobrado)}</td>
                    <td className={clsx("py-3 pr-4 font-semibold", diff > 0 ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300")}>
                      {diff > 0 ? "+" : ""}
                      {currencyFine(diff)}
                    </td>
                    <td className="py-3">
                      <span
                        className={clsx(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                          row.status === "Prejuizo"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                            : row.status === "Economia"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200",
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderIntegracao = () => (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {INTEGRATIONS.map((integration) => (
          <div key={integration.name} className={cardBase}>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{integration.name}</p>
            <p
              className={clsx(
                "mt-2 text-lg font-bold",
                integration.status === "Online" ? "text-emerald-600 dark:text-emerald-300" : "text-orange-600 dark:text-orange-300",
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
                    automation.status === "Ativa" ? "text-emerald-600 dark:text-emerald-300" : "text-orange-600 dark:text-orange-300",
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
          <p className="text-sm text-slate-600 dark:text-slate-300">Esta area esta disponivel apenas para admin super.</p>
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
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Regras automatizadas</p>
            <p className="mt-2 text-3xl font-bold text-orange-600 dark:text-orange-300">14</p>
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
        <button className="fixed inset-0 z-20 bg-slate-900/40 backdrop-blur-[1px] md:hidden" onClick={() => setMobileSidebarOpen(false)} aria-label="Fechar menu" />
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Logisync</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Freight Intelligence</p>
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Modulo Logisync</p>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">{sectionTitle}</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">{SECTION_TABS[activeSection].find((tab) => tab.key === activeSubtab)?.label || ""}</p>
              </div>
            </div>

            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 md:flex dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              <BellRing className="h-3.5 w-3.5" />
              3 alertas ativos
            </div>
          </div>
        </header>

        <main className="space-y-5 p-4 md:p-6">
          <section className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-500/30 dark:bg-blue-500/10">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
                <Truck className="h-3.5 w-3.5" /> Operacao
              </div>
              <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">284 pedidos em acompanhamento no ciclo atual.</p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-500/30 dark:bg-orange-500/10">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-700 dark:text-orange-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Atencao
              </div>
              <p className="mt-2 text-sm text-orange-800 dark:text-orange-200">2 transportadoras acima do limite de prejuizo.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">
                <Bot className="h-3.5 w-3.5" /> Automacao
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">14 regras ativas de conciliacao e alerta inteligente.</p>
            </div>
          </section>

          {renderContent()}
        </main>
      </div>
    </div>
  );
};
