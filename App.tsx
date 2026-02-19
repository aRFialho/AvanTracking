
import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { OrderList } from './components/OrderList';
import { UploadModal } from './components/UploadModal';
import { AlertsView } from './components/AlertsView';
import { AdminPanel } from './components/AdminPanel'; // New
import { Login } from './components/Login'; // New
import { Chatbot } from './components/Chatbot'; // New
import { Order, PageView, OrderStatus } from './types';
import { syncOrdersWithIntelipost, fetchSingleOrder } from './services/trackingApi';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LOGO_URL } from './constants';

const SplitIntro: React.FC = () => {
  return (
    <div className="split-overlay">
      <div className="split-part split-left">
        <div className="w-[150px] h-[120px] overflow-hidden relative">
             {/* Left Part: Show left side of image (left: 0) */}
             <img src={LOGO_URL} className="absolute left-0 top-0 h-full max-w-none object-contain w-[300px]" style={{left: 0}} />
        </div>
      </div>
      <div className="split-part split-right">
        <div className="w-[150px] h-[120px] overflow-hidden relative">
             {/* Right Part: Show right side of image (right: 0) */}
             <img src={LOGO_URL} className="absolute right-0 top-0 h-full max-w-none object-contain w-[300px]" style={{right: 0}} />
        </div>
      </div>
    </div>
  );
};

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentView, setCurrentView] = useState<PageView>('dashboard');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
        setShowIntro(false);
    }, 2000); // Wait for animation
    return () => clearTimeout(timer);
  }, []);

  // Sync Logic
  const handleSync = useCallback(async () => {
    if (orders.length === 0) return;
    setIsSyncing(true);
    try {
      const updatedOrders = await syncOrdersWithIntelipost(orders);
      
      // Filter out CANCELED orders post-sync (double check)
      const activeOrders = updatedOrders.filter(o => o.status !== OrderStatus.CANCELED);
      
      setOrders(activeOrders);
      setLastSyncTime(new Date());
    } catch (error) {
      console.error("Sync failed:", error);
      alert("Erro ao sincronizar com a Intelipost.");
    } finally {
      setIsSyncing(false);
    }
  }, [orders]);

  // Handle Single Order Fetch
  const handleFetchSingleOrder = useCallback(async (orderNumber: string) => {
    const localOrderIndex = orders.findIndex(o => o.orderNumber === orderNumber);
    try {
        const fetchedData = await fetchSingleOrder(orderNumber);
        if (!fetchedData) {
            alert(`Pedido ${orderNumber} não encontrado na Intelipost.`);
            return;
        }

        if (localOrderIndex > -1) {
            const updatedOrders = [...orders];
            const existing = updatedOrders[localOrderIndex];
            const newStatus = fetchedData.status || existing.status;
            const newEstimatedDate = fetchedData.estimatedDeliveryDate || existing.estimatedDeliveryDate;
            const isDelayed = (new Date() > new Date(newEstimatedDate) && newStatus !== OrderStatus.DELIVERED);

            updatedOrders[localOrderIndex] = {
                ...existing,
                ...fetchedData,
                isDelayed,
                lastUpdate: fetchedData.lastUpdate || new Date()
            };
            setOrders(updatedOrders);
            alert(`Pedido ${orderNumber} atualizado com sucesso.`);
        } else {
            const newOrder: Order = {
                id: fetchedData.orderNumber || orderNumber,
                orderNumber: fetchedData.orderNumber || orderNumber,
                customerName: 'Cliente Externo',
                corporateName: '',
                cpf: '',
                cnpj: '',
                phone: '',
                mobile: '',
                salesChannel: 'Externo',
                freightType: fetchedData.freightType || 'Desconhecido',
                freightValue: 0,
                shippingDate: new Date(),
                address: '',
                number: '',
                complement: '',
                neighborhood: '',
                city: fetchedData.city || '',
                state: fetchedData.state || '',
                zipCode: '',
                totalValue: 0,
                recipient: '',
                maxShippingDeadline: new Date(Date.now() + 86400000 * 7),
                estimatedDeliveryDate: fetchedData.estimatedDeliveryDate || new Date(),
                status: fetchedData.status || OrderStatus.PENDING,
                isDelayed: false,
                trackingHistory: fetchedData.trackingHistory || [],
                lastUpdate: fetchedData.lastUpdate || new Date()
            };
            setOrders(prev => [newOrder, ...prev]);
            alert(`Pedido ${orderNumber} encontrado e adicionado.`);
        }
    } catch (error) {
        console.error(error);
        alert("Erro ao consultar API.");
    }
  }, [orders]);

  // Automated Sync Timer
  useEffect(() => {
    const timer = setInterval(() => {
      handleSync();
    }, 3600000);
    return () => clearInterval(timer);
  }, [handleSync]);

  const handleOrdersUploaded = (newOrders: Order[]) => {
    // Apply immediate channel logistics logic on upload
    // Also ensuring no CANCELED orders get here (though UploadModal filters them, safe to double check)
    const processedOrders = newOrders
      .filter(o => o.status !== OrderStatus.CANCELED)
      .map(o => {
        // Logic for Channel Logistics (Marketplace or Priority/Coletas)
        const isChannelManaged = 
            ['ColetasME2', 'Shopee Xpress'].includes(o.freightType) ||
            o.freightType.toLowerCase().includes('priorit');

        if(isChannelManaged) {
             return {
                 ...o,
                 status: OrderStatus.CHANNEL_LOGISTICS,
                 trackingHistory: [{
                    status: 'CHANNEL_LOGISTICS',
                    description: 'Logística gerenciada pelo canal de venda',
                    date: o.shippingDate,
                    city: o.city,
                    state: o.state
                 }]
             }
        }
        return o;
    });

    setOrders(processedOrders);
    setCurrentView('dashboard');
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard orders={orders} onChangeView={setCurrentView} />;
      case 'orders':
        return <OrderList orders={orders} onFetchSingle={handleFetchSingleOrder} />;
      case 'upload':
        return <UploadModal onUpload={handleOrdersUploaded} />;
      case 'alerts':
        return <AlertsView orders={orders} />;
      case 'admin':
        return <AdminPanel />;
      default:
        return <Dashboard orders={orders} onChangeView={setCurrentView} />;
    }
  };

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-[#0B0C15] text-white"><Loader2 className="animate-spin w-10 h-10" /></div>;
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
        onChangeView={setCurrentView} 
        onSync={handleSync}
        isSyncing={isSyncing}
        lastSync={lastSyncTime}
      />
      
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-dark-card border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 shrink-0 transition-colors duration-300">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            {currentView === 'dashboard' && <><span className="text-accent dark:text-neon-blue">●</span> Dashboard Executivo</>}
            {currentView === 'orders' && 'Gerenciamento de Pedidos'}
            {currentView === 'upload' && 'Importação de Dados'}
            {currentView === 'alerts' && 'Monitoramento de Riscos'}
            {currentView === 'admin' && 'Painel Administrativo'}
          </h1>
          
          <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            {isSyncing && (
              <span className="flex items-center gap-2 text-blue-600 dark:text-neon-blue animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sincronizando...
              </span>
            )}
            {!isSyncing && lastSyncTime && (
               <span className="font-mono text-xs opacity-70">UPDATED: {lastSyncTime.toLocaleTimeString()}</span>
            )}
            <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-green-500 box-shadow-neon"></span>
               <span className="text-xs font-bold tracking-wider">ONLINE</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50 dark:bg-[#0B0C15]">
          {renderContent()}
        </div>

        {/* AI Chatbot Overlay */}
        <Chatbot />
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
