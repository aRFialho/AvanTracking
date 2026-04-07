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
} from "./types";
import { LifeBuoy, Loader2 } from "lucide-react";
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
  const previousSyncStatusRef = useRef<SyncJobStatus["status"] | null>(null);
  const previousTraySyncStatusRef = useRef<SyncJobStatus["status"] | null>(null);
  const lastSyncWarningJobRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      console.log("🔄 Usuário autenticado, carregando pedidos...");
      loadOrdersFromDatabase();
      loadSyncStatus();
      loadTraySyncStatus();
    }
  }, [
    isAuthenticated,
    isLoading,
    loadOrdersFromDatabase,
    loadSyncStatus,
    loadTraySyncStatus,
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
        alert(syncJob.warnings.join("\n\n"));
      }
    }

    previousSyncStatusRef.current = currentStatus;
  }, [loadOrdersFromDatabase, syncJob]);

  useEffect(() => {
    const previousStatus = previousTraySyncStatusRef.current;
    const currentStatus = traySyncJob?.status || null;

    if (
      previousStatus === "running" &&
      currentStatus &&
      currentStatus !== "running"
    ) {
      loadOrdersFromDatabase();
      setLastSyncTime(
        traySyncJob?.finishedAt ? new Date(traySyncJob.finishedAt) : new Date(),
      );
    }

    previousTraySyncStatusRef.current = currentStatus;
  }, [loadOrdersFromDatabase, traySyncJob]);

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
      alert("Erro ao sincronizar com a Intelipost.");
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
        alert(error.message || "Erro ao sincronizar pedidos da Integradora.");
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
          alert(`Consulta ${rawIdentifier} atualizada com sucesso.`);
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
        alert(`Consulta ${rawIdentifier} encontrada e adicionada.`);
      } catch (error) {
        console.error(error);
        alert(
          error instanceof Error ? error.message : "Erro ao consultar API.",
        );
      }
    },
    [orders, upsertOrder],
  );

  const handleOrdersUploaded = async (newOrders: Order[]) => {
    console.log("📤 Enviando", newOrders.length, "pedidos para API...");

    const processedOrders = newOrders.filter((order) => {
      if (order.status === OrderStatus.CANCELED) return false;
      if (order.status === OrderStatus.CHANNEL_LOGISTICS) return false;
      return true;
    });

    if (processedOrders.length === 0) {
      alert(
        "Nenhum pedido válido para importar após os filtros (Cancelados e Logística do Canal ignorados).",
      );
      return;
    }

    try {
      const response = await fetchWithAuth("/api/orders/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: processedOrders }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      await loadOrdersFromDatabase();
      setCurrentView("dashboard");

      if (data.message) {
        alert(data.message);
      }
    } catch (error) {
      console.error("❌ Erro ao enviar para API:", error);
      alert(
        "Erro ao importar pedidos. Verifique o console e os logs do servidor.",
      );
    }
  };

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

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0B0C15] text-white">
        <Loader2 className="animate-spin w-10 h-10" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        {showIntro && <SplitIntro />}
        <Login />
      </>
    );
  }

  if (isInitialDashboardLoading) {
    return <InitialDataLoader />;
  }

  return (
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


