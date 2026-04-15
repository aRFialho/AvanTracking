import React, { useState, useEffect, useCallback, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { OrderList } from "./components/OrderList";
import { UploadModal } from "./components/UploadModal";
import { AlertsView } from "./components/AlertsView";
import { DeliveryFailures } from "./components/DeliveryFailures";
import { AdminPanel } from "./components/AdminPanel";
import { LatestUpdates } from "./components/LatestUpdates";
import { Login } from "./components/Login";
import { Chatbot } from "./components/Chatbot";
import { CompanySwitcher } from "./components/CompanySwitcher";
import { SupportModal } from "./components/SupportModal";
import {
  Order,
  PageView,
  OrderStatus,
  SyncJobStatus,
  TraySyncFilters,
  TrayIntegrationStatus,
  AppNotification,
} from "./types";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  FileDown,
  Info,
  LifeBuoy,
  Loader2,
  X,
} from "lucide-react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LOGO_URL } from "./constants";
import {
  isCarrierDelayedOrder,
  getEffectiveOrderStatus,
  isPlatformDelayedOrder,
  normalizeTrackingHistory,
  toText,
} from "./utils";
import { TruckCursor } from "./components/TruckCursor";
import { fetchWithAuth } from "./utils/authFetch";
import { APP_TOAST_EVENT, ToastPayload, ToastTone, showToast } from "./utils/toast";

const SplitIntro: React.FC = () => {
  return (
    <div className="split-overlay">
      <div className="split-part split-left">
        <div className="w-[150px] h-[120px] overflow-hidden relative">
          <img
            src={LOGO_URL}
            className="absolute left-0 top-0 h-full max-w-none object-contain w-[300px]"
            style={{ left: 0 }}
          />
        </div>
      </div>
      <div className="split-part split-right">
        <div className="w-[150px] h-[120px] overflow-hidden relative">
          <img
            src={LOGO_URL}
            className="absolute right-0 top-0 h-full max-w-none object-contain w-[300px]"
            style={{ right: 0 }}
          />
        </div>
      </div>
    </div>
  );
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;

  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseCarrierForecastFromText = (text: unknown) => {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) return null;

  const match = normalizedText.match(
    /previs[aã]o\s+de\s+entrega\s*:\s*(\d{2})\/(\d{2})\/(\d{2,4})/i,
  );

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const parsed = new Date(year, month, day, 23, 59, 59, 999);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const extractCarrierForecastFromTrackingHistory = (trackingHistory: Array<{
  description?: string;
  date?: Date | string | number;
}>) => {
  const orderedEvents = [...trackingHistory].sort((left, right) => {
    const leftDate = parseDate(left.date)?.getTime() || 0;
    const rightDate = parseDate(right.date)?.getTime() || 0;
    return rightDate - leftDate;
  });

  for (const event of orderedEvents) {
    const parsed = parseCarrierForecastFromText(event.description);
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

const formatCountdown = (target: Date | null, nowMs: number) => {
  if (!target) return "--:--:--";

  const diffMs = Math.max(0, target.getTime() - nowMs);
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

const InitialDataLoader: React.FC = () => {
  return (
    <div className="h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_top,#fef2f2_0%,#fff7ed_38%,#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_top,#14213d_0%,#0b0c15_48%,#05060c_100%)] flex items-center justify-center px-6">
      <div className="relative flex w-full max-w-sm flex-col items-center rounded-[32px] border border-white/70 bg-white/80 px-8 py-10 text-center shadow-[0_30px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
        <div className="absolute inset-0 rounded-[32px] bg-[linear-gradient(135deg,rgba(240,90,61,0.14),rgba(59,130,246,0.08),transparent_72%)] dark:bg-[linear-gradient(135deg,rgba(240,90,61,0.16),rgba(59,130,246,0.14),transparent_72%)]" />
        <div className="relative mb-6 flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-[#f8b8a7] dark:border-[#365f8b]" />
          <div className="absolute inset-[6px] animate-spin rounded-full border-2 border-transparent border-t-[#f05a3d] border-r-[#f59e0b]" />
          <div className="absolute inset-[14px] rounded-full bg-white shadow-inner dark:bg-[#0f172a]" />
          <img
            src={LOGO_URL}
            alt="Avantracking"
            className="relative h-12 w-12 object-contain drop-shadow-[0_10px_24px_rgba(240,90,61,0.18)]"
          />
        </div>
        <div className="relative space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#f05a3d]">
            Avantracking
          </p>
          <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
            Carregando dados...
          </h2>
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            Estamos preparando o dashboard com pedidos, alertas e
            sincronizacoes iniciais.
          </p>
        </div>
        <div className="relative mt-6 flex items-center gap-2 text-xs font-medium text-slate-400 dark:text-slate-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#f05a3d]" />
          Aguarde um instante
        </div>
      </div>
    </div>
  );
};

const SessionExpiredToast: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-[120] w-full max-w-sm animate-in slide-in-from-top-3 fade-in duration-200">
      <div className="overflow-hidden rounded-2xl border border-amber-200/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-amber-500/20 dark:bg-[#0f172a]/95">
        <div className="h-1.5 w-full bg-[linear-gradient(90deg,#f59e0b_0%,#f97316_100%)]" />
        <div className="flex gap-3 p-4">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              Sessao expirada
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Entre novamente para continuar usando a plataforma com seguranca.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

type AppToast = ToastPayload & {
  id: string;
  tone: ToastTone;
};

const TOAST_STYLES: Record<
  ToastTone,
  {
    border: string;
    iconWrap: string;
    icon: React.ReactNode;
    title: string;
  }
> = {
  success: {
    border: "border-emerald-200/80 dark:border-emerald-500/20",
    iconWrap:
      "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    icon: <CheckCircle2 className="h-5 w-5" />,
    title: "Sucesso",
  },
  error: {
    border: "border-rose-200/80 dark:border-rose-500/20",
    iconWrap:
      "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    icon: <AlertCircle className="h-5 w-5" />,
    title: "Erro",
  },
  warning: {
    border: "border-amber-200/80 dark:border-amber-500/20",
    iconWrap:
      "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    icon: <AlertTriangle className="h-5 w-5" />,
    title: "Aviso",
  },
  info: {
    border: "border-sky-200/80 dark:border-sky-500/20",
    iconWrap:
      "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    icon: <Info className="h-5 w-5" />,
    title: "Informacao",
  },
};

const ToastViewport: React.FC<{
  toasts: AppToast[];
  onClose: (id: string) => void;
}> = ({ toasts, onClose }) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[130] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.tone];

        return (
          <div
            key={toast.id}
            className="pointer-events-auto animate-in slide-in-from-top-3 fade-in duration-200"
          >
            <div
              className={`overflow-hidden rounded-2xl border bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:bg-[#0f172a]/95 ${style.border}`}
            >
              <div className="flex gap-3 p-4">
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${style.iconWrap}`}
                >
                  {style.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {toast.title || style.title}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {toast.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onClose(toast.id)}
                  className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                  aria-label="Fechar aviso"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentView, setCurrentView] = useState<PageView>("dashboard");
  const [activeFilters, setActiveFilters] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [nextSyncAt, setNextSyncAt] = useState<Date | null>(null);
  const [nextTraySyncAt, setNextTraySyncAt] = useState<Date | null>(null);
  const [trayIntegrationStatus, setTrayIntegrationStatus] =
    useState<TrayIntegrationStatus | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [syncJob, setSyncJob] = useState<SyncJobStatus | null>(null);
  const [traySyncJob, setTraySyncJob] = useState<SyncJobStatus | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isInitialDashboardLoading, setIsInitialDashboardLoading] = useState(true);
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [showSessionExpiredToast, setShowSessionExpiredToast] = useState(false);
  const [generalNotifications, setGeneralNotifications] = useState<
    AppNotification[]
  >([]);
  const [monitoredNotifications, setMonitoredNotifications] = useState<
    AppNotification[]
  >([]);
  const [monitoredOrderIds, setMonitoredOrderIds] = useState<string[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<
    "general" | "monitored"
  >("general");
  const previousSyncStatusRef = useRef<SyncJobStatus["status"] | null>(null);
  const previousTraySyncStatusRef = useRef<SyncJobStatus["status"] | null>(null);
  const lastSyncWarningJobRef = useRef<string | null>(null);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);

  const normalizeOrderRecord = useCallback((order: Order) => {
    const trackingHistory = normalizeTrackingHistory(
      (order as any).trackingHistory ?? (order as any).trackingEvents,
    ).map((event) => ({
      ...event,
      date: parseDate(event.date) ?? new Date(),
    }));
    const carrierForecastFromTracking =
      extractCarrierForecastFromTrackingHistory(trackingHistory);

    const normalizedOrder = {
      ...order,
      platformCreatedAt:
        parseDate((order as any).platformCreatedAt) ??
        (order as any).platformCreatedAt,
      shippingDate:
        parseDate((order as any).shippingDate) ?? (order as any).shippingDate,
      maxShippingDeadline:
        parseDate((order as any).maxShippingDeadline) ??
        (order as any).maxShippingDeadline,
      estimatedDeliveryDate:
        parseDate((order as any).estimatedDeliveryDate) ??
        (order as any).estimatedDeliveryDate,
      carrierEstimatedDeliveryDate:
        carrierForecastFromTracking ??
        parseDate((order as any).carrierEstimatedDeliveryDate) ??
        (order as any).carrierEstimatedDeliveryDate,
      quotedFreightDate:
        parseDate((order as any).quotedFreightDate) ??
        (order as any).quotedFreightDate,
      originalQuotedFreightDate:
        parseDate((order as any).originalQuotedFreightDate) ??
        (order as any).originalQuotedFreightDate,
      recalculatedFreightDate:
        parseDate((order as any).recalculatedFreightDate) ??
        (order as any).recalculatedFreightDate,
      lastApiSync: parseDate((order as any).lastApiSync),
      lastUpdate: parseDate((order as any).lastUpdate) ?? new Date(),
      trackingHistory,
    } as Order;

    const effectiveStatus = getEffectiveOrderStatus(normalizedOrder);
    const orderWithEffectiveStatus = {
      ...normalizedOrder,
      status: effectiveStatus,
    } as Order;
    const isDelayed = isCarrierDelayedOrder(orderWithEffectiveStatus);
    const isPlatformDelayed = isPlatformDelayedOrder(orderWithEffectiveStatus);

    return {
      ...orderWithEffectiveStatus,
      isDelayed,
      isPlatformDelayed,
    };
  }, []);

  const upsertOrder = useCallback(
    (incomingOrder: Order) => {
      const normalizedIncomingOrder = normalizeOrderRecord(incomingOrder);

      setOrders((previousOrders) => {
        const existingIndex = previousOrders.findIndex(
          (order) =>
            order.id === normalizedIncomingOrder.id ||
            order.orderNumber === normalizedIncomingOrder.orderNumber,
        );

        if (existingIndex === -1) {
          return [normalizedIncomingOrder, ...previousOrders];
        }

        const nextOrders = [...previousOrders];
        nextOrders[existingIndex] = {
          ...nextOrders[existingIndex],
          ...normalizedIncomingOrder,
        };
        return nextOrders;
      });
    },
    [normalizeOrderRecord],
  );

  const handleChangeView = (view: PageView) => {
    setCurrentView(view);
    if (view !== "orders") {
      setActiveFilters(null);
    }
  };

  const loadOrdersFromDatabase = useCallback(async () => {
    console.log("📥 Carregando pedidos do banco de dados...");

    try {
      const response = await fetchWithAuth("/api/orders");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("✅ Pedidos carregados do banco:", data.length);

      const activeOrders = data
        .filter((order: Order) => order.status !== OrderStatus.CANCELED)
        .map((order: Order) => normalizeOrderRecord(order));

      setOrders(activeOrders);
    } catch (error) {
      console.error("❌ Erro ao carregar pedidos:", error);
    }
  }, [normalizeOrderRecord]);

  const loadSyncStatus = useCallback(async () => {
    if (!user?.companyId) {
      setSyncJob(null);
      setNextSyncAt(null);
      return;
    }

    try {
      const response = await fetchWithAuth("/api/orders/sync-all/status");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setSyncJob(data.job || null);
      setNextSyncAt(parseDate(data.schedule?.nextScheduledAt));

      if (data.job?.finishedAt) {
        setLastSyncTime((current) => current ?? parseDate(data.job.finishedAt));
      }
    } catch (error) {
      console.error("Erro ao carregar status da sincronização:", error);
    }
  }, [user?.companyId]);

  const loadTraySyncStatus = useCallback(async () => {
    if (!user?.companyId) {
      setTraySyncJob(null);
      setNextTraySyncAt(null);
      setTrayIntegrationStatus(null);
      return;
    }

    try {
      const statusResponse = await fetchWithAuth("/api/tray/status");
      const statusData = await statusResponse.json().catch(() => ({}));

      if (!statusResponse.ok) {
        throw new Error(`HTTP ${statusResponse.status}`);
      }

      const normalizedTrayIntegrationStatus: TrayIntegrationStatus = {
        authorized: Boolean(statusData.authorized),
        status: statusData.status === "online" ? "online" : "offline",
        storeId: statusData.storeId || null,
        storeName: statusData.storeName || null,
        updatedAt: statusData.updatedAt || null,
        message:
          statusData.message ||
          (statusData.authorized
            ? "Integracao da Integradora online."
            : "Nenhuma integracao da Integradora autorizada."),
      };

      setTrayIntegrationStatus(normalizedTrayIntegrationStatus);

      if (!normalizedTrayIntegrationStatus.authorized) {
        setTraySyncJob(null);
        setNextTraySyncAt(null);
        return;
      }

      const response = await fetchWithAuth("/api/tray/sync/status");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setTraySyncJob(data.job || null);
      setNextTraySyncAt(parseDate(data.schedule?.nextScheduledAt));
    } catch (error) {
      console.error("Erro ao carregar status da sincronizacao da Integradora:", error);
      setTrayIntegrationStatus(null);
      setTraySyncJob(null);
      setNextTraySyncAt(null);
    }
  }, [user?.companyId]);

  const loadNotifications = useCallback(async () => {
    if (!user?.companyId) {
      setGeneralNotifications([]);
      setMonitoredNotifications([]);
      setMonitoredOrderIds([]);
      return;
    }

    try {
      const response = await fetchWithAuth("/api/notifications/feed");
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setGeneralNotifications(
        Array.isArray(data.general) ? (data.general as AppNotification[]) : [],
      );
      setMonitoredNotifications(
        Array.isArray(data.monitored)
          ? (data.monitored as AppNotification[])
          : [],
      );
      setMonitoredOrderIds(
        Array.isArray(data.monitoredOrderIds)
          ? data.monitoredOrderIds
              .map((item: unknown) => String(item || ""))
              .filter(Boolean)
          : [],
      );
    } catch (error) {
      console.error("Erro ao carregar notificacoes:", error);
    }
  }, [user?.companyId]);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      console.log("🔄 Usuário autenticado, carregando pedidos...");
      loadOrdersFromDatabase();
      loadSyncStatus();
      loadTraySyncStatus();
      loadNotifications();
    }
  }, [
    isAuthenticated,
    isLoading,
    loadOrdersFromDatabase,
    loadSyncStatus,
    loadTraySyncStatus,
    loadNotifications,
  ]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) {
      setIsInitialDashboardLoading(true);
      return;
    }

    let cancelled = false;

    const loadInitialDashboardData = async () => {
      setIsInitialDashboardLoading(true);

      await Promise.allSettled([
        loadOrdersFromDatabase(),
        loadSyncStatus(),
        loadTraySyncStatus(),
        loadNotifications(),
      ]);

      if (!cancelled) {
        setIsInitialDashboardLoading(false);
      }
    };

    void loadInitialDashboardData();

    return () => {
      cancelled = true;
    };
  }, [
    isAuthenticated,
    isLoading,
    loadOrdersFromDatabase,
    loadSyncStatus,
    loadTraySyncStatus,
    loadNotifications,
  ]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "admin") {
      setCurrentView("admin");
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    setIsSyncing(syncJob?.status === "running");
  }, [syncJob?.status]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const intervalMs = syncJob?.status === "running" ? 2000 : 30000;
    const statusInterval = setInterval(() => {
      loadSyncStatus();
    }, intervalMs);

    return () => clearInterval(statusInterval);
  }, [isAuthenticated, isLoading, loadSyncStatus, syncJob?.status]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const intervalMs = traySyncJob?.status === "running" ? 2000 : 30000;
    const statusInterval = setInterval(() => {
      loadTraySyncStatus();
    }, intervalMs);

    return () => clearInterval(statusInterval);
  }, [isAuthenticated, isLoading, loadTraySyncStatus, traySyncJob?.status]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const interval = window.setInterval(() => {
      loadNotifications();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [isAuthenticated, isLoading, loadNotifications]);

  useEffect(() => {
    if (!isAuthenticated || isLoading || traySyncJob?.status !== "running") {
      return;
    }

    const refreshInterval = setInterval(() => {
      loadOrdersFromDatabase();
    }, 10000);

    return () => clearInterval(refreshInterval);
  }, [
    isAuthenticated,
    isLoading,
    loadOrdersFromDatabase,
    traySyncJob?.status,
  ]);

  useEffect(() => {
    const previousStatus = previousSyncStatusRef.current;
    const currentStatus = syncJob?.status || null;

    if (
      previousStatus === "running" &&
      currentStatus &&
      currentStatus !== "running"
    ) {
      loadOrdersFromDatabase();
      loadNotifications();
      setLastSyncTime(
        syncJob?.finishedAt ? new Date(syncJob.finishedAt) : new Date(),
      );
      if (
        syncJob?.jobId &&
        syncJob.jobId !== lastSyncWarningJobRef.current &&
        Array.isArray(syncJob.warnings) &&
        syncJob.warnings.length > 0
      ) {
        lastSyncWarningJobRef.current = syncJob.jobId;
        showToast({
          title: "Aviso de sincronizacao",
          message: syncJob.warnings.join("\n\n"),
          tone: "warning",
          durationMs: 7000,
        });
      }
    }

    previousSyncStatusRef.current = currentStatus;
  }, [loadNotifications, loadOrdersFromDatabase, syncJob]);

  useEffect(() => {
    const previousStatus = previousTraySyncStatusRef.current;
    const currentStatus = traySyncJob?.status || null;

    if (
      previousStatus === "running" &&
      currentStatus &&
      currentStatus !== "running"
    ) {
      loadOrdersFromDatabase();
      loadNotifications();
      setLastSyncTime(
        traySyncJob?.finishedAt ? new Date(traySyncJob.finishedAt) : new Date(),
      );
    }

    previousTraySyncStatusRef.current = currentStatus;
  }, [loadNotifications, loadOrdersFromDatabase, traySyncJob]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const clockInterval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<ToastPayload>;
      const detail = customEvent.detail;

      if (!detail?.message) {
        return;
      }

      setToasts((current) => [
        ...current,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title: detail.title,
          message: detail.message,
          tone: detail.tone || "info",
          durationMs: detail.durationMs,
        },
      ]);
    };

    window.addEventListener(APP_TOAST_EVENT, handleToast as EventListener);

    return () => {
      window.removeEventListener(APP_TOAST_EVENT, handleToast as EventListener);
    };
  }, []);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, toast.durationMs ?? 4500),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts]);

  useEffect(() => {
    const handleExpiredSession = () => {
      setShowSessionExpiredToast(true);
    };

    window.addEventListener("auth:expired", handleExpiredSession);

    return () => {
      window.removeEventListener("auth:expired", handleExpiredSession);
    };
  }, []);

  useEffect(() => {
    if (!showSessionExpiredToast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowSessionExpiredToast(false);
    }, 7000);

    return () => window.clearTimeout(timer);
  }, [showSessionExpiredToast]);

  useEffect(() => {
    if (!isNotificationOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationPanelRef.current &&
        !notificationPanelRef.current.contains(event.target as Node)
      ) {
        setIsNotificationOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isNotificationOpen]);

  const handleSync = useCallback(async () => {
    try {
      const response = await fetchWithAuth("/api/orders/sync-all/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setSyncJob(data.job || null);
      setNextSyncAt(parseDate(data.schedule?.nextScheduledAt));
    } catch (error) {
      console.error("Sync failed:", error);
      showToast({
        message: "Erro ao sincronizar com a Intelipost.",
        tone: "error",
      });
    }
  }, []);

  const handleTraySync = useCallback(
    async (filters: TraySyncFilters) => {
      try {
        const response = await fetchWithAuth("/api/tray/sync/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(filters),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        setTraySyncJob(data.job || null);
      } catch (error: any) {
        console.error("Integradora sync failed:", error);
        showToast({
          message: error.message || "Erro ao sincronizar pedidos da Integradora.",
          tone: "error",
        });
      }
    },
    [],
  );

  const handleFetchSingleOrder = useCallback(
    async (identifier: string) => {
      const rawIdentifier = String(identifier || "").trim();
      const normalizedDigits = rawIdentifier.replace(/\D/g, "").trim();
      const normalizedAlphaNumeric = rawIdentifier
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase()
        .trim();

      const localOrder = orders.find((order) => {
        const orderNumberMatch = order.orderNumber === rawIdentifier;
        const invoiceMatch =
          Boolean(normalizedDigits) &&
          String(order.invoiceNumber || "").replace(/\D/g, "") === normalizedDigits;
        const trackingDigitsMatch =
          Boolean(normalizedDigits) &&
          String(order.trackingCode || "").replace(/\D/g, "") === normalizedDigits;
        const trackingAlphaNumericMatch =
          Boolean(normalizedAlphaNumeric) &&
          String(order.trackingCode || "")
            .replace(/[^A-Za-z0-9]/g, "")
            .toUpperCase() === normalizedAlphaNumeric;

        return (
          orderNumberMatch ||
          invoiceMatch ||
          trackingDigitsMatch ||
          trackingAlphaNumericMatch
        );
      });

      try {
        if (localOrder) {
          const response = await fetchWithAuth(`/api/orders/${localOrder.id}/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.message || data.error || `HTTP ${response.status}`);
          }

          if (data.order) {
            upsertOrder(data.order);
          }

          setLastSyncTime(new Date());
          showToast({
            message: `Consulta ${rawIdentifier} atualizada com sucesso.`,
            tone: "success",
          });
          return;
        }

        const response = await fetchWithAuth("/api/orders/search-external", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: rawIdentifier }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.order) {
          throw new Error(
            data?.error || `Nenhum resultado encontrado para ${rawIdentifier}.`,
          );
        }

        upsertOrder(data.order as Order);
        setLastSyncTime(new Date());
        showToast({
          message: `Consulta ${rawIdentifier} encontrada e adicionada.`,
          tone: "success",
        });
      } catch (error) {
        console.error(error);
        showToast({
          message: error instanceof Error ? error.message : "Erro ao consultar API.",
          tone: "error",
        });
      }
    },
    [orders, upsertOrder],
  );

  const handleOrdersUploaded = async (newOrders: Order[]) => {
    console.log("Enviando", newOrders.length, "pedidos para API...");
    const importChunkSize = 150;

    const processedOrders = newOrders.filter((order) => {
      if (order.status === OrderStatus.CANCELED) return false;
      return true;
    });

    if (processedOrders.length === 0) {
      showToast({
        tone: "warning",
        title: "Importacao de pedidos",
        message: "Nenhum pedido valido para importar apos os filtros.",
      });
      return;
    }

    try {
      const chunkMessages: string[] = [];
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      let totalTrackingEvents = 0;
      const importErrors: string[] = [];

      for (let index = 0; index < processedOrders.length; index += importChunkSize) {
        const chunk = processedOrders.slice(index, index + importChunkSize);
        const response = await fetchWithAuth("/api/orders/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orders: chunk }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        if (typeof data.message === "string" && data.message.trim()) {
          chunkMessages.push(data.message.trim());
        }

        totalCreated += Number(data?.results?.created || 0);
        totalUpdated += Number(data?.results?.updated || 0);
        totalSkipped += Number(data?.results?.skipped || 0);
        totalTrackingEvents += Number(data?.results?.totalTrackingEvents || 0);

        if (Array.isArray(data?.results?.errors)) {
          importErrors.push(
            ...data.results.errors.filter(
              (item: unknown): item is string =>
                typeof item === "string" && item.trim().length > 0,
            ),
          );
        }
      }

      await loadOrdersFromDatabase();
      setCurrentView("dashboard");

      const summaryMessage =
        `Importacao concluida: ${totalCreated} criados, ${totalUpdated} atualizados, ` +
        `${totalSkipped} ignorados, ${totalTrackingEvents} evento(s) iniciais de rastreio.` +
        (importErrors.length > 0
          ? ` ${importErrors.length} pedido(s) apresentaram erro.`
          : "");

      showToast({
        tone: importErrors.length > 0 ? "warning" : "success",
        title: "Importacao concluida",
        message: summaryMessage,
      });
    } catch (error) {
      console.error("Erro ao enviar para API:", error);
      showToast({
        tone: "error",
        title: "Falha na importacao",
        message:
          error instanceof Error
            ? error.message
            : "Erro ao importar pedidos. Verifique o console e os logs do servidor.",
      });
    }
  };

  const handleToggleMonitoredOrder = useCallback(
    async (order: Order) => {
      const isAlreadyMonitored = monitoredOrderIds.includes(order.id);
      const endpoint = `/api/notifications/monitored-orders/${order.id}`;

      const response = await fetchWithAuth(
        isAlreadyMonitored ? endpoint : "/api/notifications/monitored-orders",
        {
          method: isAlreadyMonitored ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          ...(isAlreadyMonitored
            ? {}
            : {
                body: JSON.stringify({ orderIds: [order.id] }),
              }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (Array.isArray(data.monitoredOrderIds)) {
        setMonitoredOrderIds(
          data.monitoredOrderIds
            .map((item: unknown) => String(item || ""))
            .filter(Boolean),
        );
      } else if (isAlreadyMonitored) {
        setMonitoredOrderIds((current) =>
          current.filter((item) => item !== order.id),
        );
      } else {
        setMonitoredOrderIds((current) =>
          current.includes(order.id) ? current : [...current, order.id],
        );
      }

      await loadNotifications();

      showToast({
        tone: "success",
        message: isAlreadyMonitored
          ? `Pedido ${order.orderNumber} removido dos monitorados.`
          : `Pedido ${order.orderNumber} incluido nos monitorados.`,
      });
    },
    [loadNotifications, monitoredOrderIds],
  );

  const renderContent = () => {
    switch (currentView) {
      case "dashboard":
        return (
          <Dashboard
            orders={orders}
            onChangeView={handleChangeView}
            onFilterRequest={(filters) => {
              setActiveFilters(filters);
              setCurrentView("orders");
            }}
          />
        );
      case "orders":
        return (
          <OrderList
            orders={orders}
            initialFilters={activeFilters}
            onFetchSingle={handleFetchSingleOrder}
            onOrderUpdated={upsertOrder}
            onStartSync={handleSync}
            onStartTraySync={handleTraySync}
            syncJob={syncJob}
            traySyncJob={traySyncJob}
            trayIntegrationStatus={trayIntegrationStatus}
            monitoredOrderIds={monitoredOrderIds}
            onToggleMonitoredOrder={handleToggleMonitoredOrder}
          />
        );
      case "no-movement":
        return (
          <OrderList
            orders={orders}
            onFetchSingle={handleFetchSingleOrder}
            isNoMovementView={true}
            onOrderUpdated={upsertOrder}
            onStartSync={handleSync}
            syncJob={syncJob}
            traySyncJob={traySyncJob}
            trayIntegrationStatus={trayIntegrationStatus}
            monitoredOrderIds={monitoredOrderIds}
            onToggleMonitoredOrder={handleToggleMonitoredOrder}
          />
        );
      case "upload":
        return <UploadModal onUpload={handleOrdersUploaded} />;
      case "alerts":
        return <AlertsView orders={orders} initialFilters={activeFilters} />;
      case "delivery-failures":
        return <DeliveryFailures orders={orders} />;
      case "admin":
        return <AdminPanel />;
      case "latest-updates":
        return <LatestUpdates />;
      default:
        return <Dashboard orders={orders} onChangeView={handleChangeView} />;
    }
  };

  if (!isAuthenticated) {
    return (
      <>
        <SessionExpiredToast
          visible={showSessionExpiredToast}
          onClose={() => setShowSessionExpiredToast(false)}
        />
        <ToastViewport
          toasts={toasts}
          onClose={(id) =>
            setToasts((current) => current.filter((toast) => toast.id !== id))
          }
        />
        <Login />
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0B0C15] text-white">
        <Loader2 className="animate-spin w-10 h-10" />
      </div>
    );
  }

  if (isInitialDashboardLoading) {
    return <InitialDataLoader />;
  }

  const notificationCount =
    generalNotifications.length + monitoredNotifications.length;
  const activeNotifications =
    notificationTab === "general" ? generalNotifications : monitoredNotifications;

  return (
    <>
      <ToastViewport
        toasts={toasts}
        onClose={(id) =>
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }
      />
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#0B0C15] text-slate-900 dark:text-slate-100 transition-colors duration-300 font-sans">
        {showIntro && <SplitIntro />}

        <Sidebar
          currentView={currentView}
          onChangeView={handleChangeView}
          onSync={handleSync}
          isSyncing={isSyncing}
          lastSync={lastSyncTime}
          syncJob={syncJob}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((current) => !current)}
        />

      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 bg-white dark:bg-dark-card border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 shrink-0 transition-colors duration-300">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            {currentView === "dashboard" && (
              <>
                <span className="text-accent dark:text-neon-blue">●</span>
                Dashboard Executivo
              </>
            )}
            {currentView === "orders" && "Gerenciamento de Pedidos"}
            {currentView === "no-movement" && "Pedidos Sem Movimentação"}
            {currentView === "upload" && "Importação de Dados"}
            {currentView === "latest-updates" && "Últimas Atualizações"}
            {currentView === "alerts" && "Monitoramento de Riscos"}
            {currentView === "delivery-failures" && "Falhas na Entrega"}
            {currentView === "admin" &&
              (user?.role === "ADMIN" ? "Painel Administrativo" : "Integração")}
          </h1>

          <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setIsSupportOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-[#ffd4c3] bg-[#fff3ee] px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#f05a3d] transition-colors hover:border-[#ffb89d] hover:bg-[#ffe7de]"
            >
              <LifeBuoy className="h-4 w-4" />
              Suporte
            </button>
            <div className="relative" ref={notificationPanelRef}>
              <button
                type="button"
                onClick={() => setIsNotificationOpen((current) => !current)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Abrir central de notificacoes"
              >
                <Bell className="h-4 w-4" />
                {notificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-4 text-white">
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                )}
              </button>

              {isNotificationOpen && (
                <div className="absolute right-0 top-12 z-50 w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-[#11131f]">
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Notificacoes
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-2 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => setNotificationTab("general")}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                        notificationTab === "general"
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                      }`}
                    >
                      Geral
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotificationTab("monitored")}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                        notificationTab === "monitored"
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                      }`}
                    >
                      Pedidos Monitorados
                    </button>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto p-3">
                    {activeNotifications.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                        Nenhuma notificacao nesta aba.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activeNotifications.map((notification) => (
                          <div
                            key={notification.id}
                            className="rounded-xl border border-slate-200 p-3 dark:border-white/10"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {notification.title || "Notificacao"}
                            </p>
                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                              {notification.message}
                            </p>
                            {notificationTab === "general" && (
                              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                                Entregues: {notification.deliveredCount || 0} | Atraso:{" "}
                                {notification.enteredDelayCount || 0} | Falha:{" "}
                                {notification.enteredFailureCount || 0}
                              </p>
                            )}
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {new Date(notification.createdAt).toLocaleString()}
                              </span>
                              {notificationTab === "general" &&
                                (notification.csvUrl || notification.reportUrl) && (
                                  <div className="flex items-center gap-2">
                                    <a
                                      href={notification.csvUrl || notification.reportUrl || "#"}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                                    >
                                      <FileDown className="h-3 w-3" />
                                      Baixar relatorio
                                    </a>
                                    {notification.reportUrl && (
                                      <a
                                        href={notification.reportUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        Detalhes
                                      </a>
                                    )}
                                  </div>
                                )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {user?.role === "ADMIN" && (
              <div className="border-r border-slate-200 dark:border-slate-700 pr-4">
                <CompanySwitcher />
              </div>
            )}
            {isSyncing && (
              <span className="flex items-center gap-2 text-blue-600 dark:text-neon-blue animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sincronizando...
              </span>
            )}
            {!isSyncing && nextSyncAt && (
              <div className="flex flex-col items-end font-mono text-[11px] opacity-80">
                <span className="text-[10px] uppercase tracking-wide opacity-60">
                  Próximo Sync de Rastreio
                </span>
                <span>{formatCountdown(nextSyncAt, nowMs)}</span>
              </div>
            )}
            {trayIntegrationStatus?.authorized && traySyncJob?.status === "running" && (
              <span className="flex items-center gap-2 text-cyan-600 dark:text-cyan-300 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sync da Integradora em andamento...
              </span>
            )}
            {trayIntegrationStatus?.authorized &&
              traySyncJob?.status !== "running" &&
              nextTraySyncAt && (
              <div className="flex flex-col items-end font-mono text-[11px] opacity-80">
                <span className="text-[10px] uppercase tracking-wide opacity-60">
                  Proximo Sync de Pedidos com a Integradora
                </span>
                <span>{formatCountdown(nextTraySyncAt, nowMs)}</span>
              </div>
            )}
            {!isSyncing && lastSyncTime && (
              <span className="font-mono text-xs opacity-70">
                UPDATED: {lastSyncTime.toLocaleTimeString()}
              </span>
            )}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 box-shadow-neon"></span>
              <span className="text-xs font-bold tracking-wider">ONLINE</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 bg-slate-50 dark:bg-[#0B0C15]">
          {renderContent()}
        </div>

        <SupportModal
          isOpen={isSupportOpen}
          onClose={() => setIsSupportOpen(false)}
          currentView={currentView}
          trayIntegrationStatus={trayIntegrationStatus}
        />
        <Chatbot />
        </main>
      </div>
    </>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TruckCursor />
        <MainApp />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;



