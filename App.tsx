import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { OrderList } from "./components/OrderList";
import { UploadModal } from "./components/UploadModal";
import { AlertsView } from "./components/AlertsView";
import { DeliveryFailures } from "./components/DeliveryFailures";
import { AdminPanel } from "./components/AdminPanel";
import { Login } from "./components/Login";
import { Chatbot } from "./components/Chatbot";
import { CompanySwitcher } from "./components/CompanySwitcher";
import { Order, PageView, OrderStatus } from "./types";
import { fetchSingleOrder } from "./services/trackingApi";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LOGO_URL } from "./constants";
import { getEffectiveOrderStatus, normalizeTrackingHistory, toText } from "./utils";
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

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentView, setCurrentView] = useState<PageView>("dashboard");
  const [activeFilters, setActiveFilters] = useState<any>(null); // ✅ Filters state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [showIntro, setShowIntro] = useState(true);

  // ✅ View Change Handler
  const handleChangeView = (view: PageView) => {
    setCurrentView(view);
    // Reset filters when switching to dashboard or other non-order views manually
    if (view !== "orders") {
      setActiveFilters(null);
    }
  };

  // ✅ FUNÇÃO PARA CARREGAR DO BANCO
  const loadOrdersFromDatabase = useCallback(async () => {
    console.log("📥 Carregando pedidos do banco de dados...");

    try {
      const response = await fetchWithAuth("/api/orders");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("✅ Pedidos carregados do banco:", data.length);

      // Filtrar pedidos cancelados e atualizar status com base no histórico
      const activeOrders = data
        .filter((o: Order) => o.status !== OrderStatus.CANCELED)
        .map((o: Order) => {
          const trackingHistory = normalizeTrackingHistory(
            (o as any).trackingHistory ?? (o as any).trackingEvents,
          );
          const normalizedOrder = {
            ...o,
            trackingHistory,
          };
          const effectiveStatus = getEffectiveOrderStatus(normalizedOrder);
          // Recalcular isDelayed com base no status efetivo
          const isDelivered = effectiveStatus === OrderStatus.DELIVERED;
          const isDelayed =
            !isDelivered && new Date() > new Date(o.estimatedDeliveryDate);

          return {
            ...normalizedOrder,
            trackingHistory,
            status: effectiveStatus,
            isDelayed: isDelayed,
          };
        });

      setOrders(activeOrders);
    } catch (error) {
      console.error("❌ Erro ao carregar pedidos:", error);
    }
  }, []);

  // ✅ CARREGAR AO AUTENTICAR
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      console.log("🔄 Usuário autenticado, carregando pedidos...");
      loadOrdersFromDatabase();
    }
  }, [isAuthenticated, isLoading, loadOrdersFromDatabase]);

  // Intro animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Sync Logic
  const handleSync = useCallback(async () => {
    if (orders.length === 0) return;
    setIsSyncing(true);
    try {
      const response = await fetchWithAuth("/api/orders/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      await loadOrdersFromDatabase();
      setLastSyncTime(new Date());
    } catch (error) {
      console.error("Sync failed:", error);
      alert("Erro ao sincronizar com a Intelipost.");
    } finally {
      setIsSyncing(false);
    }
  }, [orders.length, loadOrdersFromDatabase]);

  // Handle Single Order Fetch
  const handleFetchSingleOrder = useCallback(
    async (orderNumber: string) => {
      const localOrderIndex = orders.findIndex(
        (o) => o.orderNumber === orderNumber,
      );
      try {
        if (localOrderIndex > -1) {
          const existing = orders[localOrderIndex];
          const response = await fetchWithAuth(`/api/orders/${existing.id}/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.message || data.error || `HTTP ${response.status}`);
          }

          await loadOrdersFromDatabase();
          setLastSyncTime(new Date());
          alert(`Pedido ${orderNumber} atualizado com sucesso.`);
          return;
        }

        const fetchedData = await fetchSingleOrder(orderNumber);
        if (!fetchedData) {
          alert(`Pedido ${orderNumber} não encontrado na Intelipost.`);
          return;
        }

        if (localOrderIndex > -1) {
          const updatedOrders = [...orders];
          const existing = updatedOrders[localOrderIndex];
          const newStatus = fetchedData.status || existing.status;
          const newEstimatedDate =
            fetchedData.estimatedDeliveryDate || existing.estimatedDeliveryDate;
          const isDelayed =
            new Date() > new Date(newEstimatedDate) &&
            newStatus !== OrderStatus.DELIVERED;

          const updatedOrder = {
            ...existing,
            ...fetchedData,
            isDelayed,
            lastUpdate: fetchedData.lastUpdate || new Date(),
            lastApiSync: new Date(),
          };

          // Apply Effective Status Logic
          updatedOrder.status = getEffectiveOrderStatus(updatedOrder);
          updatedOrder.isDelayed =
            updatedOrder.status !== OrderStatus.DELIVERED &&
            new Date() > new Date(updatedOrder.estimatedDeliveryDate);

          updatedOrders[localOrderIndex] = updatedOrder;
          setOrders(updatedOrders);
          alert(`Pedido ${orderNumber} atualizado com sucesso.`);
        } else {
          let newOrder: Order = {
            id: fetchedData.orderNumber || orderNumber,
            orderNumber: fetchedData.orderNumber || orderNumber,
            customerName: "Cliente Externo",
            corporateName: "",
            cpf: "",
            cnpj: "",
            phone: "",
            mobile: "",
            salesChannel: "Externo",
            freightType: fetchedData.freightType || "Desconhecido",
            freightValue: 0,
            shippingDate: new Date(),
            address: "",
            number: "",
            complement: "",
            neighborhood: "",
            city: fetchedData.city || "",
            state: fetchedData.state || "",
            zipCode: "",
            totalValue: 0,
            recipient: "",
            maxShippingDeadline: new Date(Date.now() + 86400000 * 7),
            estimatedDeliveryDate:
              fetchedData.estimatedDeliveryDate || new Date(),
            status: fetchedData.status || OrderStatus.PENDING,
            isDelayed: false,
            trackingHistory: fetchedData.trackingHistory || [],
            lastUpdate: fetchedData.lastUpdate || new Date(),
            lastApiSync: new Date(),
          };

          // Apply Effective Status
          newOrder.status = getEffectiveOrderStatus(newOrder);
          newOrder.isDelayed =
            newOrder.status !== OrderStatus.DELIVERED &&
            new Date() > new Date(newOrder.estimatedDeliveryDate);

          setOrders((prev) => [newOrder, ...prev]);
          alert(`Pedido ${orderNumber} encontrado e adicionado.`);
        }
      } catch (error) {
        console.error(error);
        alert("Erro ao consultar API.");
      }
    },
    [loadOrdersFromDatabase, orders],
  );

  // Automated Sync Timer (REMOVIDO - Sync apenas manual via botão Sincronizar)
  // Antes havia: setInterval(..., 4 * 60 * 60 * 1000)
  // Agora: Sync APENAS quando usuário clicar em "Sincronizar"

  const handleOrdersUploaded = async (newOrders: Order[]) => {
    console.log("📤 Enviando", newOrders.length, "pedidos para API...");

    // Os pedidos já vêm filtrados do UploadModal (sem cancelados e sem logística do canal),
    // mas garantimos mais uma vez aqui.
    const processedOrders = newOrders.filter((o) => {
      if (o.status === OrderStatus.CANCELED) return false;
      if (o.status === OrderStatus.CHANNEL_LOGISTICS) return false;

      const isChannelManaged =
        ["ColetasME2", "Shopee Xpress"].includes(toText(o.freightType)) ||
        toText(o.freightType).toLowerCase().includes("priorit");

      if (isChannelManaged) return false;

      return true;
    });

    if (processedOrders.length === 0) {
      alert(
        "Nenhum pedido válido para importar após os filtros (Cancelados e Logística do Canal ignorados).",
      );
      return;
    }

    // Enviar para API
    try {
      // Atualizar o estado local IMEDIATAMENTE para feedback instantâneo (optimistic update)
      setOrders((prev) => {
        // Mesclar pedidos novos/atualizados com os existentes
        const existingMap = new Map(prev.map((o) => [o.orderNumber, o]));

        processedOrders.forEach((o) => {
          existingMap.set(o.orderNumber, {
            ...o,
            // Garantir que status e delay são calculados corretamente pro frontend
            status: getEffectiveOrderStatus(o),
            isDelayed:
              getEffectiveOrderStatus(o) !== OrderStatus.DELIVERED &&
              new Date() > new Date(o.estimatedDeliveryDate),
          });
        });

        return Array.from(existingMap.values());
      });

      setCurrentView("dashboard");

      // Enviar para API em background (não bloqueia a UI)
      fetchWithAuth("/api/orders/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: processedOrders }),
      })
        .then(async (response) => {
          if (!response.ok) {
            console.error("Erro na importação em background");
          } else {
            console.log("✅ Importação no backend concluída.");
            // Opcional: Recarregar do banco apenas para garantir sincronia fina
            // await loadOrdersFromDatabase();
          }
        })
        .catch((err) =>
          console.error("Erro fatal no fetch de importação", err),
        );
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
          />
        );
      case "no-movement":
        return (
          <OrderList
            orders={orders}
            onFetchSingle={handleFetchSingleOrder}
            isNoMovementView={true}
          />
        );
      case "upload":
        return <UploadModal onUpload={handleOrdersUploaded} />;
      case "alerts":
        return <AlertsView orders={orders} />;
      case "delivery-failures":
        return <DeliveryFailures orders={orders} />;
      case "admin":
        return <AdminPanel />;
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

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#0B0C15] text-slate-900 dark:text-slate-100 transition-colors duration-300 font-sans">
      {showIntro && <SplitIntro />}

      <Sidebar
        currentView={currentView}
        onChangeView={handleChangeView}
        onSync={handleSync}
        isSyncing={isSyncing}
        lastSync={lastSyncTime}
      />

      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="h-16 bg-white dark:bg-dark-card border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 shrink-0 transition-colors duration-300">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            {currentView === "dashboard" && (
              <>
                <span className="text-accent dark:text-neon-blue">●</span>{" "}
                Dashboard Executivo
              </>
            )}
            {currentView === "orders" && "Gerenciamento de Pedidos"}
            {currentView === "no-movement" && "Pedidos Sem Movimentação"}
            {currentView === "upload" && "Importação de Dados"}
            {currentView === "alerts" && "Monitoramento de Riscos"}
            {currentView === "delivery-failures" && "Falhas na Entrega"}
            {currentView === "admin" && "Painel Administrativo"}
          </h1>

          <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
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
