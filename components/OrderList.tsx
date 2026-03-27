import React, { useState, useMemo } from "react";
import {
  Order,
  OrderStatus,
  SyncJobStatus,
  TraySyncFilters,
  TrayIntegrationStatus,
} from "../types";
import { OrderDetail } from "./OrderDetail";
import {
  Download,
  Search,
  Filter,
  Globe,
  ChevronDown,
  ChevronUp,
  X,
  Calendar,
  Truck,
  ShoppingBag,
  Eye,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { clsx } from "clsx";
import {
  normalizeCarrierName,
  isOrderOnRoute,
  toText,
  normalizeTrackingHistory,
  parseOptionalDate,
  formatDateOrDash,
  formatCarrierForecast,
} from "../utils";
import { fetchWithAuth } from "../utils/authFetch";
import { LOGO_URL } from "../constants";

const STATUS_LABELS: Record<string, string> = {
  [OrderStatus.PENDING]: "Pendente",
  [OrderStatus.CREATED]: "Criado",
  [OrderStatus.SHIPPED]: "Em Trânsito",
  [OrderStatus.DELIVERY_ATTEMPT]: "Saiu para Entrega",
  [OrderStatus.DELIVERED]: "Entregue",
  [OrderStatus.FAILURE]: "Falha",
  [OrderStatus.RETURNED]: "Devolvido",
  [OrderStatus.CANCELED]: "Cancelado",
  [OrderStatus.CHANNEL_LOGISTICS]: "Logística do Canal",
};

const TRAY_DAY_OPTIONS: TraySyncFilters["days"][] = [90, 60, 30, 15, 7];
const TRAY_STATUS_OPTIONS = [
  "pedido cadastrado",
  "a enviar",
  "5- aguardando faturamento",
  "enviado",
  "finalizado",
  "entregue",
  "cancelado",
  "aguardando envio",
];

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `R$ ${value.toFixed(2)}`;
};

interface OrderListProps {
  orders: Order[];
  initialFilters?: any;
  onFetchSingle?: (orderId: string) => Promise<void>;
  isNoMovementView?: boolean;
  onStartSync?: () => Promise<void> | void;
  onStartTraySync?: (filters: TraySyncFilters) => Promise<void>;
  syncJob?: SyncJobStatus | null;
  traySyncJob?: SyncJobStatus | null;
  trayIntegrationStatus?: TrayIntegrationStatus | null;
}

export const OrderList: React.FC<OrderListProps> = ({
  orders,
  initialFilters,
  onFetchSingle,
  isNoMovementView = false,
  onStartSync,
  onStartTraySync,
  syncJob,
  traySyncJob,
  trayIntegrationStatus,
}) => {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isFetchingSingle, setIsFetchingSingle] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [isTraySyncModalOpen, setIsTraySyncModalOpen] = useState(false);
  const [isTraySyncing, setIsTraySyncing] = useState(false);
  const [traySyncDays, setTraySyncDays] = useState<TraySyncFilters["days"]>(90);
  const [trayStatusMode, setTrayStatusMode] =
    useState<TraySyncFilters["statusMode"]>("all_except_canceled");
  const [selectedTrayStatuses, setSelectedTrayStatuses] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false); // ✅ Novo state

  // No Movement View State
  const [noMovementDays, setNoMovementDays] = useState(5);

  // Search Modal State
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [apiSearchInput, setApiSearchInput] = useState("");

  // Filters State
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(
    initialFilters?.status || "ALL",
  );
  const [carrierFilter, setCarrierFilter] = useState<string>("ALL");
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>("ALL");
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");

  // Custom Filter Logic from Dashboard
  const [customStatusFilter, setCustomStatusFilter] = useState<string[] | null>(
    initialFilters?.customStatus || null,
  );
  const [onlyDelayed, setOnlyDelayed] = useState<boolean>(
    initialFilters?.onlyDelayed || false,
  );
  const [dueToday, setDueToday] = useState<boolean>(
    initialFilters?.dueToday || false,
  );
  const [noSync, setNoSync] = useState<boolean>(
    initialFilters?.noSync || false,
  );
  const [noForecast, setNoForecast] = useState<boolean>(
    initialFilters?.noForecast || false,
  );

  // Update filters if props change (re-navigation)
  React.useEffect(() => {
    if (initialFilters) {
      if (initialFilters.status) setStatusFilter(initialFilters.status);
      if (initialFilters.customStatus)
        setCustomStatusFilter(initialFilters.customStatus);
      setOnlyDelayed(!!initialFilters.onlyDelayed);
      setDueToday(!!initialFilters.dueToday);
      setNoSync(!!initialFilters.noSync);
      setNoForecast(!!initialFilters.noForecast);
    }
  }, [initialFilters]);

  // Extract Lists (excluding Canceled)
  const validOrders = useMemo(
    () => orders.filter((o) => o.status !== OrderStatus.CANCELED),
    [orders],
  );

  const carriers = useMemo(
    () =>
      Array.from(
        new Set(validOrders.map((o) => normalizeCarrierName(o.freightType))),
      ).sort(),
    [validOrders],
  );
  const marketplaces = useMemo(
    () => Array.from(new Set(validOrders.map((o) => o.salesChannel))).sort(),
    [validOrders],
  );

  const filteredOrders = useMemo(() => {
    return validOrders.filter((o) => {
      // 1. Text
      const matchText =
        toText(o.orderNumber).toLowerCase().includes(searchText.toLowerCase()) ||
        toText((o as any).invoiceNumber)
          .toLowerCase()
          .includes(searchText.toLowerCase()) ||
        toText(o.customerName).toLowerCase().includes(searchText.toLowerCase()) ||
        toText(o.cpf).includes(searchText);

      // 2. Dropdowns
      const matchStatus =
        (statusFilter === "ALL" ||
          o.status === statusFilter ||
          (statusFilter === OrderStatus.DELIVERY_ATTEMPT &&
            isOrderOnRoute(o))) &&
        (!customStatusFilter || customStatusFilter.includes(o.status));

      const matchCarrier =
        carrierFilter === "ALL" ||
        normalizeCarrierName(o.freightType) === carrierFilter;
      const matchMkt =
        marketplaceFilter === "ALL" || o.salesChannel === marketplaceFilter;

      // 3. Special Filters
      if (onlyDelayed && (!o.isDelayed || o.status === OrderStatus.DELIVERED))
        return false;

      if (dueToday) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const d = parseOptionalDate(o.estimatedDeliveryDate);
        if (!d) return false;
        d.setHours(0, 0, 0, 0);
        if (
          d.getTime() !== today.getTime() ||
          o.status === OrderStatus.DELIVERED
        )
          return false;
      }

      if (noSync && o.lastApiSync) return false;
      if (noForecast && o.estimatedDeliveryDate) return false;

      // 4. Date Range (Estimated Delivery)
      let matchDate = true;
      if (dateRangeStart) {
        const estimatedDate = parseOptionalDate(o.estimatedDeliveryDate);
        matchDate =
          matchDate &&
          Boolean(estimatedDate) &&
          estimatedDate >= new Date(dateRangeStart);
      }
      if (dateRangeEnd) {
        const estimatedDate = parseOptionalDate(o.estimatedDeliveryDate);
        matchDate =
          matchDate &&
          Boolean(estimatedDate) &&
          estimatedDate <= new Date(dateRangeEnd);
      }

      // 5. No Movement Filter
      if (isNoMovementView) {
        // Exclude finalized orders
        if (
          [
            OrderStatus.DELIVERED,
            OrderStatus.CANCELED,
            OrderStatus.RETURNED,
            OrderStatus.FAILURE,
          ].includes(o.status)
        ) {
          return false;
        }

        const lastUpdate = new Date(o.lastUpdate);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < noMovementDays) return false;
      }

      return matchText && matchStatus && matchCarrier && matchMkt && matchDate;
    });
  }, [
    validOrders,
    searchText,
    statusFilter,
    carrierFilter,
    marketplaceFilter,
    dateRangeStart,
    dateRangeEnd,
    isNoMovementView,
    noMovementDays,
  ]);

  const handleExternalSearchClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSearchModalOpen(true);
  };

  const executeApiSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onFetchSingle || !apiSearchInput.trim()) return;

    setIsFetchingSingle(true);
    try {
      await onFetchSingle(apiSearchInput);
      setSearchText(apiSearchInput); // Filter list to show the new item
      setIsSearchModalOpen(false);
      setApiSearchInput("");
    } catch (e) {
      // Alert handled in parent usually
    } finally {
      setIsFetchingSingle(false);
    }
  };

  const clearFilters = () => {
    setSearchText("");
    setStatusFilter("ALL");
    setCarrierFilter("ALL");
    setMarketplaceFilter("ALL");
    setDateRangeStart("");
    setDateRangeEnd("");
    setCustomStatusFilter(null);
    setOnlyDelayed(false);
    setDueToday(false);
    setNoSync(false);
    setNoForecast(false);
  };

  // ✅ Função de sincronização
  const handleSyncAll = async () => {
    if (onStartSync) {
      if (
        !confirm(
          "Sincronizar todos os pedidos ativos? Isso pode demorar alguns minutos.",
        )
      ) {
        return;
      }
      onStartSync();
      return;
    }

    if (
      !confirm(
        "Sincronizar todos os pedidos ativos? Isso pode demorar alguns minutos.",
      )
    ) {
      return;
    }

    setIsSyncing(true);
    try {
      const response = await fetchWithAuth("/api/orders/sync-all/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();

      if (result.success) {
        alert(
          result.message || "Sincronizacao iniciada. O relatorio sera enviado ao final do processo.",
        );
      } else {
        alert("❌ Erro ao sincronizar");
      }
    } catch (error) {
      console.error("Erro ao sincronizar:", error);
      alert("❌ Erro ao sincronizar pedidos");
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleTrayStatus = (status: string) => {
    setSelectedTrayStatuses((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  };

  const handleTraySync = async () => {
    if (!onStartTraySync) return;

    if (trayStatusMode === "selected" && selectedTrayStatuses.length === 0) {
      alert("Selecione ao menos um status da Tray para buscar os pedidos.");
      return;
    }

    setIsTraySyncing(true);
    try {
      await onStartTraySync({
        days: traySyncDays,
        statusMode: trayStatusMode,
        statuses: selectedTrayStatuses,
      });
    } finally {
      setIsTraySyncing(false);
    }
  };

  const getOrderStatusLabel = (order: Order) => {
    if (
      order.isDelayed &&
      order.status !== OrderStatus.DELIVERED &&
      order.status !== OrderStatus.CHANNEL_LOGISTICS
    ) {
      return "Atrasado";
    }

    return STATUS_LABELS[order.status] || order.status;
  };

  const getLatestMovementLabel = (order: Order) => {
    const trackingHistory = normalizeTrackingHistory(order.trackingHistory);

    if (trackingHistory.length === 0) {
      if (!order.lastUpdate) {
        return "-";
      }

      return `${new Date(order.lastUpdate).toLocaleDateString("pt-BR")} ${new Date(
        order.lastUpdate,
      ).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    const latestEvent = [...trackingHistory].sort(
      (left, right) =>
        new Date(right.date).getTime() - new Date(left.date).getTime(),
    )[0];

    const eventDate = parseOptionalDate(latestEvent.date);
    const eventDateLabel = eventDate
      ? `${eventDate.toLocaleDateString("pt-BR")} ${eventDate.toLocaleTimeString(
          "pt-BR",
          {
            hour: "2-digit",
            minute: "2-digit",
          },
        )}`
      : "-";

    return [
      eventDateLabel,
      toText(latestEvent.status),
      toText(latestEvent.description),
    ]
      .filter(Boolean)
      .join(" - ");
  };

  const getExportRows = () =>
    filteredOrders.map((order) => ({
      orderNumber: order.orderNumber,
      invoiceNumber: order.invoiceNumber || "-",
      trackingCode: order.trackingCode || "-",
      shippingDate: formatDateOrDash(order.shippingDate),
      salesChannel: order.salesChannel,
      freightType: normalizeCarrierName(order.freightType),
      freightValue: formatCurrency(order.freightValue),
      quotedFreightValue: formatCurrency(order.quotedFreightValue),
      estimatedDeliveryDate: formatDateOrDash(order.estimatedDeliveryDate),
      carrierEstimatedDeliveryDate: formatCarrierForecast(
        order.carrierEstimatedDeliveryDate,
      ),
      latestMovement: getLatestMovementLabel(order),
      status: getOrderStatusLabel(order),
      trackingUrl: order.trackingUrl || "#",
    }));

  const handleExportHtmlReport = () => {
    if (filteredOrders.length === 0) {
      alert("Nao ha pedidos para exportar com os filtros atuais.");
      return;
    }

    const escapeHtml = (value: unknown) =>
      toText(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const reportGeneratedAt = new Date();
    const rows = getExportRows()
      .map((order) => {
        return `
          <tr>
            <td>${escapeHtml(order.orderNumber)}</td>
            <td>${escapeHtml(order.invoiceNumber)}</td>
            <td>${escapeHtml(order.trackingCode)}</td>
            <td>${escapeHtml(order.shippingDate)}</td>
            <td>${escapeHtml(order.salesChannel)}</td>
            <td>${escapeHtml(order.freightType)}</td>
            <td>${escapeHtml(order.estimatedDeliveryDate)}</td>
            <td>${escapeHtml(order.carrierEstimatedDeliveryDate)}</td>
            <td>${escapeHtml(order.latestMovement)}</td>
            <td><span class="status-chip">${escapeHtml(order.status)}</span></td>
            <td><a href="${escapeHtml(
              order.trackingUrl,
            )}" target="_blank" rel="noopener noreferrer">Abrir rastreio</a></td>
          </tr>
        `;
      })
      .join("");

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Relatorio de Pedidos - Avantracking</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3f6fb;
        --card: #ffffff;
        --text: #172033;
        --muted: #64748b;
        --line: #d7dfeb;
        --line-soft: #e8edf5;
        --brand: #0f766e;
        --brand-soft: #dff6f1;
        --header: #eef4fb;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Segoe UI", Arial, sans-serif;
        background: linear-gradient(180deg, #eef3f9 0%, #f8fafc 100%);
        color: var(--text);
      }

      .page {
        padding: 32px;
      }

      .report-card {
        max-width: 1600px;
        margin: 0 auto;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 22px;
        box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
        overflow: hidden;
      }

      .report-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        padding: 28px 32px 24px;
        border-bottom: 1px solid var(--line-soft);
        background: linear-gradient(135deg, #ffffff 0%, #f4f9ff 100%);
      }

      .brand {
        display: flex;
        align-items: flex-start;
        gap: 18px;
        min-width: 0;
      }

      .brand img {
        width: 168px;
        height: auto;
        object-fit: contain;
        flex-shrink: 0;
      }

      .brand-copy {
        min-width: 0;
        padding-top: 6px;
      }

      h1 {
        margin: 0 0 6px;
        font-size: 28px;
        line-height: 1.15;
      }

      .subtitle,
      .generated-at {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.5;
      }

      .summary {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: #fff;
        white-space: nowrap;
      }

      .summary strong {
        display: block;
        font-size: 24px;
      }

      .summary span {
        display: block;
        color: var(--muted);
        font-size: 13px;
      }

      .table-wrap {
        padding: 0 24px 24px;
      }

      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 13px;
      }

      thead th {
        position: sticky;
        top: 0;
        padding: 14px 12px;
        text-align: left;
        background: var(--header);
        color: #334155;
        border-bottom: 1px solid var(--line);
        border-top: 1px solid var(--line);
      }

      thead th:first-child {
        border-left: 1px solid var(--line);
        border-top-left-radius: 14px;
      }

      thead th:last-child {
        border-right: 1px solid var(--line);
        border-top-right-radius: 14px;
      }

      tbody td {
        padding: 12px;
        border-bottom: 1px solid var(--line-soft);
        vertical-align: top;
        color: #1e293b;
      }

      tbody tr:nth-child(even) td {
        background: #fbfdff;
      }

      tbody tr td:first-child {
        border-left: 1px solid var(--line-soft);
      }

      tbody tr td:last-child {
        border-right: 1px solid var(--line-soft);
      }

      .status-chip {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--brand-soft);
        color: var(--brand);
        font-weight: 600;
      }

      a {
        color: #0f62fe;
        text-decoration: none;
        font-weight: 600;
      }

      a:hover {
        text-decoration: underline;
      }

      @media (max-width: 960px) {
        .page {
          padding: 16px;
        }

        .report-header {
          flex-direction: column;
          align-items: stretch;
        }

        .brand {
          flex-direction: column;
        }

        .brand img {
          width: 148px;
        }

        .table-wrap {
          overflow-x: auto;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="report-card">
        <div class="report-header">
          <div class="brand">
            <img src="${escapeHtml(LOGO_URL)}" alt="Avantracking" />
            <div class="brand-copy">
              <h1>Relatorio de Pedidos</h1>
              <p class="subtitle">Exportacao formatada da aba de pedidos com status, previsoes e link direto de rastreio.</p>
              <p class="generated-at">Gerado em ${escapeHtml(
                reportGeneratedAt.toLocaleString("pt-BR"),
              )}</p>
            </div>
          </div>
          <div class="summary">
            <div>
              <strong>${escapeHtml(filteredOrders.length)}</strong>
              <span>Pedidos exportados</span>
            </div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID / Pedido</th>
                <th>Nota Fiscal</th>
                <th>Codigo de Envio</th>
                <th>Emissao</th>
                <th>Marketplace</th>
                <th>Transportadora</th>
                <th>Prev. Entrega</th>
                <th>Previsao Transportadora</th>
                <th>Ultima Movimentacao</th>
                <th>Status</th>
                <th>Abrir rastreio</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  </body>
</html>`;

    const blob = new Blob([htmlContent], {
      type: "text/html;charset=utf-8;",
    });
    const fileUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);

    link.href = fileUrl;
    link.download = `relatorio-pedidos-${today}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(fileUrl);
  };

  const handleExportCsvReport = () => {
    if (filteredOrders.length === 0) {
      alert("Nao ha pedidos para exportar com os filtros atuais.");
      return;
    }

    const escapeCsvValue = (value: unknown) =>
      `"${toText(value).replace(/"/g, '""')}"`;

    const headers = [
      "ID / Pedido",
      "Nota Fiscal",
      "Codigo de Envio",
      "Emissao",
      "Marketplace",
      "Transportadora",
      "Prev. Entrega",
      "Previsao Transportadora",
      "Ultima Movimentacao",
      "Status",
      "Abrir rastreio",
    ];

    const rows = getExportRows().map((order) => [
      order.orderNumber,
      order.invoiceNumber,
      order.trackingCode,
      order.shippingDate,
      order.salesChannel,
      order.freightType,
      order.estimatedDeliveryDate,
      order.carrierEstimatedDeliveryDate,
      order.latestMovement,
      order.status,
      order.trackingUrl,
    ]);

    const csvContent = [
      headers.map(escapeCsvValue).join(";"),
      ...rows.map((row) => row.map(escapeCsvValue).join(";")),
    ].join("\n");

    const blob = new Blob([`\uFEFF${csvContent}`], {
      type: "text/csv;charset=utf-8;",
    });
    const fileUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);

    link.href = fileUrl;
    link.download = `relatorio-pedidos-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(fileUrl);
  };

  const openTrackingLink = async (order: Order) => {
    try {
      const response = await fetchWithAuth(
        `/api/orders/${order.id}/open-tracking?resolve=1`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.trackingUrl) {
        throw new Error(
          data?.error || "Nenhum link de rastreio disponivel para este pedido.",
        );
      }

      window.open(data.trackingUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Nao foi possivel abrir o rastreio deste pedido.",
      );
    }
  };

  const isSyncRunning = isSyncing || syncJob?.status === "running";
  const isTrayJobRunning = traySyncJob?.status === "running";
  const isTrayAvailable = Boolean(trayIntegrationStatus?.authorized);
  const hasTrayJob = Boolean(traySyncJob);
  const trayLogs = traySyncJob?.logs || [];
  const trayStatusLabel =
    traySyncJob?.status === "running"
      ? "Em andamento"
      : traySyncJob?.status === "completed"
        ? "Concluido"
        : traySyncJob?.status === "failed"
          ? "Falhou"
          : "Pronto";
  const trayStatusClass =
    traySyncJob?.status === "running"
      ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/40"
      : traySyncJob?.status === "completed"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/40"
        : traySyncJob?.status === "failed"
          ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/40"
          : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/10";

  // Modern Status Badge
  const StatusBadge = ({
    status,
    delayed,
  }: {
    status: OrderStatus;
    delayed: boolean;
  }) => {
    const baseClass =
      "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border";

    if (
      delayed &&
      status !== OrderStatus.DELIVERED &&
      status !== OrderStatus.CHANNEL_LOGISTICS
    ) {
      return (
        <span
          className={clsx(
            baseClass,
            "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30",
          )}
        >
          Atrasado
        </span>
      );
    }

    switch (status) {
      case OrderStatus.DELIVERED:
        return (
          <span
            className={clsx(
              baseClass,
              "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30",
            )}
          >
            Entregue
          </span>
        );
      case OrderStatus.SHIPPED:
        return (
          <span
            className={clsx(
              baseClass,
              "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30",
            )}
          >
            Trânsito
          </span>
        );
      case OrderStatus.DELIVERY_ATTEMPT:
        return (
          <span
            className={clsx(
              baseClass,
              "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30",
            )}
          >
            Saiu para Entrega
          </span>
        );
      case OrderStatus.FAILURE:
      case OrderStatus.RETURNED:
      case OrderStatus.CANCELED:
        return (
          <span
            className={clsx(
              baseClass,
              "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/5",
            )}
          >
            Falha
          </span>
        );
      case OrderStatus.CHANNEL_LOGISTICS:
        return (
          <span
            className={clsx(
              baseClass,
              "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-900/30",
            )}
          >
            Logística do Canal
          </span>
        );
      default:
        return (
          <span
            className={clsx(
              baseClass,
              "bg-gray-50 text-gray-600 border-gray-200 dark:bg-white/5 dark:text-gray-400 dark:border-white/5",
            )}
          >
            Pendente
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col relative">
      {/* 1. Filter Control Bar (Collapsible) */}
      <div className="glass-card rounded-xl border border-slate-200 dark:border-dark-border shadow-sm shrink-0 overflow-hidden transition-all duration-300">
        <div
          className="flex items-center justify-between p-4 bg-slate-50 dark:bg-dark-card border-b border-slate-100 dark:border-white/5 cursor-pointer"
          onClick={() => setShowFilters(!showFilters)}
        >
          <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-white">
            <Filter className="w-4 h-4 text-accent dark:text-neon-blue" />
            Filtros Avançados
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {filteredOrders.length} resultados
            </span>
            {showFilters ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>

        {showFilters && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2 duration-200 bg-white dark:bg-dark-card">
            {/* Search */}
            <div className="col-span-1 lg:col-span-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por Pedido, Numero da Nota ou Cliente..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent dark:focus:border-neon-blue dark:text-white transition-colors"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
            </div>

            {/* Dropdowns */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                <Truck className="w-3 h-3" /> Transportadora
              </label>
              <select
                value={carrierFilter}
                onChange={(e) => setCarrierFilter(e.target.value)}
                className="w-full p-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-dark-card dark:text-white focus:border-accent outline-none"
              >
                <option value="ALL">Todas</option>
                {carriers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                <ShoppingBag className="w-3 h-3" /> Marketplace
              </label>
              <select
                value={marketplaceFilter}
                onChange={(e) => setMarketplaceFilter(e.target.value)}
                className="w-full p-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-dark-card dark:text-white focus:border-accent outline-none"
              >
                <option value="ALL">Todos</option>
                {marketplaces.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                <Filter className="w-3 h-3" /> Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full p-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-dark-card dark:text-white focus:border-accent outline-none"
              >
                <option value="ALL">Todos</option>
                {Object.values(OrderStatus).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s] || s}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Previsão de Entrega
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateRangeStart}
                  onChange={(e) => setDateRangeStart(e.target.value)}
                  className="w-full p-2 border border-slate-200 dark:border-white/10 rounded-lg text-xs bg-white dark:bg-dark-card dark:text-white focus:border-accent outline-none"
                />
                <input
                  type="date"
                  value={dateRangeEnd}
                  onChange={(e) => setDateRangeEnd(e.target.value)}
                  className="w-full p-2 border border-slate-200 dark:border-white/10 rounded-lg text-xs bg-white dark:bg-dark-card dark:text-white focus:border-accent outline-none"
                />
              </div>
            </div>

            {/* No Movement Toggle */}
            {isNoMovementView && (
              <div className="col-span-1 lg:col-span-4 flex flex-wrap items-center gap-4 bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-200 dark:border-red-900/30">
                <span className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Sem Movimentação:
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNoMovementDays(2)}
                    className={clsx(
                      "px-3 py-1 rounded-md text-xs font-medium transition-colors border",
                      noMovementDays === 2
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white dark:bg-white/10 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-50",
                    )}
                  >
                    2+ dias
                  </button>
                  <button
                    onClick={() => setNoMovementDays(5)}
                    className={clsx(
                      "px-3 py-1 rounded-md text-xs font-medium transition-colors border",
                      noMovementDays === 5
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white dark:bg-white/10 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-50",
                    )}
                  >
                    5+ dias
                  </button>
                </div>
                <span className="text-xs text-red-600 dark:text-red-300 ml-auto">
                  Exibindo pedidos sem atualização há{" "}
                  <strong>{noMovementDays} dias</strong> ou mais.
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="col-span-1 lg:col-span-4 flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
              <button
                onClick={clearFilters}
                className="text-slate-500 text-sm hover:text-slate-800 dark:hover:text-white px-4 py-2 font-medium"
              >
                Limpar Filtros
              </button>
              <button
                onClick={handleExternalSearchClick}
                disabled={isFetchingSingle}
                className="flex items-center justify-center px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
              >
                <Globe className="w-4 h-4 mr-2" />
                Buscar API
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <div className="w-full flex flex-col gap-3 sm:max-w-xl sm:flex-row sm:justify-end">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleExportHtmlReport}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white rounded-lg hover:bg-slate-50 dark:hover:bg-white/10 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              Abrir HTML
            </button>
            <button
              onClick={handleExportCsvReport}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white rounded-lg hover:bg-slate-50 dark:hover:bg-white/10 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              Baixar CSV
            </button>
          </div>

          {onStartTraySync && !isNoMovementView && isTrayAvailable && (
            <button
              onClick={() => setIsTraySyncModalOpen(true)}
              disabled={isTraySyncing}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white rounded-lg hover:bg-slate-50 dark:hover:bg-white/10 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTraySyncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Iniciando Tray...
                </>
              ) : isTrayJobRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Acompanhar Sync Tray
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Sincronizar Pedidos da Tray
                </>
              )}
            </button>
          )}

          <button
            onClick={handleSyncAll}
            disabled={isSyncRunning}
            className="flex w-full items-center justify-center gap-2 px-4 py-2 bg-accent dark:bg-neon-blue text-white dark:text-black rounded-lg hover:bg-blue-600 dark:hover:bg-cyan-400 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {isSyncRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Sincronizar Todos
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Detailed Data Table */}
      <div className="flex-1 overflow-hidden glass-card rounded-xl border border-slate-200 dark:border-dark-border shadow-sm relative bg-white dark:bg-dark-card">
        <div className="absolute inset-0 overflow-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase bg-slate-50 dark:bg-dark-card sticky top-0 z-10 shadow-sm backdrop-blur-md">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  ID / Pedido
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Nota Fiscal
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Emissão
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Marketplace
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Código de Envio
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Transportadora
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Frete Pago
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Frete Cotado
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Prev. Entrega
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Previsão Transportadora
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Última Movimentação
                </th>
                <th className="px-4 py-3 whitespace-nowrap text-center bg-slate-50 dark:bg-[#11131f]">
                  Status
                </th>
                <th className="px-4 py-3 whitespace-nowrap text-right bg-slate-50 dark:bg-[#11131f]">
                  Ação
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      <div className="flex flex-col">
                        <span className="bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded text-xs w-fit mb-0.5">
                          #{order.orderNumber}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                          {order.customerName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {order.invoiceNumber || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {order.shippingDate
                        ? new Date(order.shippingDate).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                        {order.salesChannel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {order.trackingCode || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {normalizeCarrierName(order.freightType)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatCurrency(order.freightValue)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <div className="flex flex-col">
                        <span className="whitespace-nowrap">
                          {formatCurrency(order.quotedFreightValue)}
                        </span>
                        <span className="text-[10px] text-slate-400 break-all">
                          {order.quotedCarrierName ||
                            "Sem cotacao no pedido"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatDateOrDash(order.estimatedDeliveryDate)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatCarrierForecast(order.carrierEstimatedDeliveryDate)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-xs">
                          {order.lastUpdate
                            ? new Date(order.lastUpdate).toLocaleDateString()
                            : "-"}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {order.lastUpdate
                            ? new Date(order.lastUpdate)
                                .toLocaleTimeString()
                                .slice(0, 5)
                            : ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge
                        status={order.status}
                        delayed={order.isDelayed}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openTrackingLink(order)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Abrir rastreio
                        </button>
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="text-slate-400 hover:text-accent dark:hover:text-neon-blue p-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-white/5 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={13}
                    className="px-6 py-12 text-center text-slate-400 dark:text-slate-500"
                  >
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Nenhum pedido encontrado com os filtros atuais.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {isTraySyncModalOpen && onStartTraySync && isTrayAvailable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-card w-full max-w-3xl rounded-xl p-6 shadow-2xl animate-in zoom-in-95 border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                  Sincronizar Pedidos da Tray
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Defina o período e os status dos pedidos que serão buscados.
                </p>
              </div>
              <button
                onClick={() => setIsTraySyncModalOpen(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Status da sincronizacao
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span
                        className={clsx(
                          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide",
                          trayStatusClass,
                        )}
                      >
                        {trayStatusLabel}
                      </span>
                      {traySyncJob?.currentOrderNumber && (
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          Status atual: <strong>{traySyncJob.currentOrderNumber}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  {hasTrayJob && (
                    <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-[240px]">
                      <div className="rounded-lg bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Progresso
                        </p>
                        <p className="font-semibold text-slate-800 dark:text-white">
                          {traySyncJob?.processed || 0}/{traySyncJob?.total || 0}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Novos pedidos
                        </p>
                        <p className="font-semibold text-slate-800 dark:text-white">
                          {traySyncJob?.success || 0}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {isTrayJobRunning && (
                  <p className="mt-3 text-xs text-blue-600 dark:text-blue-300">
                    O processo continua executando mesmo se esta janela for fechada.
                  </p>
                )}
                {traySyncJob?.error && (
                  <p className="mt-3 text-xs text-red-600 dark:text-red-300">
                    {traySyncJob.error}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">
                  Buscar pedidos
                </label>
                <select
                  value={traySyncDays}
                  onChange={(e) =>
                    setTraySyncDays(Number(e.target.value) as TraySyncFilters["days"])
                  }
                  className="w-full p-3 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-dark-card dark:text-white focus:border-accent outline-none"
                  disabled={isTrayJobRunning}
                >
                  {TRAY_DAY_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {days} dias
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">
                  Status dos pedidos a serem buscados
                </label>

                <div className="grid gap-2">
                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                    <input
                      type="radio"
                      name="tray-status-mode"
                      checked={trayStatusMode === "all_except_canceled"}
                      onChange={() => setTrayStatusMode("all_except_canceled")}
                      className="mt-1"
                      disabled={isTrayJobRunning}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-white">
                        Todos exceto cancelados
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Busca os pedidos da Tray ignorando apenas o status cancelado.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                    <input
                      type="radio"
                      name="tray-status-mode"
                      checked={trayStatusMode === "selected"}
                      onChange={() => setTrayStatusMode("selected")}
                      className="mt-1"
                      disabled={isTrayJobRunning}
                    />
                    <div className="w-full">
                      <p className="text-sm font-medium text-slate-700 dark:text-white">
                        Selecionar status manualmente
                      </p>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {TRAY_STATUS_OPTIONS.map((status) => (
                          <label
                            key={status}
                            className={clsx(
                              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                              trayStatusMode === "selected"
                                ? "border-slate-200 dark:border-white/10 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                                : "border-slate-100 dark:border-white/5 opacity-60 cursor-not-allowed",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selectedTrayStatuses.includes(status)}
                              onChange={() => toggleTrayStatus(status)}
                              disabled={
                                trayStatusMode !== "selected" || isTrayJobRunning
                              }
                            />
                            <span className="capitalize">{status}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                    Logs da sincronizacao
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {trayLogs.length} registro(s)
                  </span>
                </div>
                <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 dark:border-white/10 bg-slate-950 text-slate-100">
                  {trayLogs.length > 0 ? (
                    <div className="divide-y divide-white/5">
                      {trayLogs.map((log, index) => (
                        <div
                          key={`${log.timestamp}-${index}`}
                          className="px-4 py-3 font-mono text-xs"
                        >
                          <div className="flex items-start gap-3">
                            <span className="min-w-[72px] text-slate-400">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span
                              className={clsx(
                                "min-w-[64px] uppercase tracking-wide",
                                log.level === "error"
                                  ? "text-red-300"
                                  : log.level === "success"
                                    ? "text-emerald-300"
                                    : "text-blue-300",
                              )}
                            >
                              {log.level}
                            </span>
                            <span className="flex-1 whitespace-pre-wrap break-words text-slate-100">
                              {log.message}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-center text-xs text-slate-400">
                      Os logs da Tray aparecem aqui assim que a sincronizacao for iniciada.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsTraySyncModalOpen(false)}
                  className="flex-1 px-4 py-3 border border-slate-200 dark:border-white/10 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleTraySync}
                  disabled={isTraySyncing || isTrayJobRunning}
                  className="flex-1 px-4 py-3 bg-accent dark:bg-neon-blue hover:bg-blue-600 dark:hover:bg-cyan-400 text-white dark:text-black rounded-lg font-bold shadow-lg shadow-blue-500/20 dark:shadow-neon-blue/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isTraySyncing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Iniciando...
                    </>
                  ) : isTrayJobRunning ? (
                    "Sincronizando em segundo plano"
                  ) : (
                    "Buscar pedidos"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Search Modal */}
      {isSearchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-card w-full max-w-md rounded-xl p-6 shadow-2xl animate-in zoom-in-95 border-t-4 border-accent dark:border-neon-blue bg-white dark:bg-dark-card">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-accent dark:text-neon-blue" />{" "}
                  Busca Externa
                </h3>
                <p className="text-xs text-slate-500">
                  Consultar Intelipost via API
                </p>
              </div>
              <button
                onClick={() => setIsSearchModalOpen(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={executeApiSearch} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Número do Pedido
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ex: 12345678"
                  value={apiSearchInput}
                  onChange={(e) => setApiSearchInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-3 text-lg font-mono tracking-wider text-slate-900 dark:text-white focus:border-accent dark:focus:border-neon-blue outline-none"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsSearchModalOpen(false)}
                  className="flex-1 px-4 py-3 border border-slate-200 dark:border-white/10 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isFetchingSingle}
                  className="flex-1 px-4 py-3 bg-accent dark:bg-neon-blue hover:bg-blue-600 dark:hover:bg-cyan-400 text-white dark:text-black rounded-lg font-bold shadow-lg shadow-blue-500/20 dark:shadow-neon-blue/20 flex items-center justify-center gap-2"
                >
                  {isFetchingSingle ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Consultar"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
