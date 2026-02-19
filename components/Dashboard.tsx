
import React, { useMemo, useState } from 'react';
import { Order, OrderStatus, PageView } from '../types';
import {
  FileText, CheckCircle, Clock, Package, Truck, MapPin, 
  AlertTriangle, Calendar, HelpCircle, Timer, TrendingUp, Bell,
  Search, Filter, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, 
  PieChart as PieChartIcon, WifiOff, ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';

interface DashboardProps {
  orders: Order[];
  onChangeView: (view: PageView) => void;
}

const STATUS_LABELS: Record<string, string> = {
  [OrderStatus.PENDING]: 'Pendente',
  [OrderStatus.CREATED]: 'Criado',
  [OrderStatus.SHIPPED]: 'Em Trânsito',
  [OrderStatus.DELIVERY_ATTEMPT]: 'Saiu para Entrega',
  [OrderStatus.DELIVERED]: 'Entregue',
  [OrderStatus.FAILURE]: 'Falha',
  [OrderStatus.RETURNED]: 'Devolvido',
  [OrderStatus.CANCELED]: 'Cancelado',
  [OrderStatus.CHANNEL_LOGISTICS]: 'Logística do Canal'
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

export const Dashboard: React.FC<DashboardProps> = ({ orders, onChangeView }) => {
  // --- Local Filter State ---
  const [showFilters, setShowFilters] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [marketplaceFilter, setMarketplaceFilter] = useState('ALL');
  const [dateType, setDateType] = useState<'shipping' | 'delivery'>('shipping');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // --- UI State ---
  const [isRankingExpanded, setIsRankingExpanded] = useState(false);

  // --- Helpers ---
  const uniqueCarriers = useMemo(() => Array.from(new Set(orders.map(o => o.freightType))).sort(), [orders]);
  const uniqueMarketplaces = useMemo(() => Array.from(new Set(orders.map(o => o.salesChannel))).sort(), [orders]);

  // --- Filtering Logic ---
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status === OrderStatus.CANCELED) return false;

      // Text Search
      const textMatch = !searchText || 
        o.orderNumber.toLowerCase().includes(searchText.toLowerCase()) ||
        o.customerName.toLowerCase().includes(searchText.toLowerCase());

      // Dropdowns
      const carrierMatch = carrierFilter === 'ALL' || o.freightType === carrierFilter;
      const statusMatch = statusFilter === 'ALL' || o.status === statusFilter;
      const marketMatch = marketplaceFilter === 'ALL' || o.salesChannel === marketplaceFilter;

      // Dates
      let dateMatch = true;
      if (startDate || endDate) {
        const targetDate = dateType === 'shipping' ? new Date(o.shippingDate) : new Date(o.estimatedDeliveryDate);
        if (startDate) dateMatch = dateMatch && targetDate >= new Date(startDate);
        if (endDate) dateMatch = dateMatch && targetDate <= new Date(endDate);
      }

      return textMatch && carrierMatch && statusMatch && marketMatch && dateMatch;
    });
  }, [orders, searchText, carrierFilter, statusFilter, marketplaceFilter, startDate, endDate, dateType]);

  // --- KPI Calculation ---
  const stats = useMemo(() => {
    const total = filteredOrders.length;
    const delivered = filteredOrders.filter(o => o.status === OrderStatus.DELIVERED).length;
    const inProgress = filteredOrders.filter(o => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.FAILURE && o.status !== OrderStatus.RETURNED).length;
    
    // Status Breakdowns
    const waiting = filteredOrders.filter(o => o.status === OrderStatus.PENDING || o.status === OrderStatus.CREATED).length;
    const inTransit = filteredOrders.filter(o => o.status === OrderStatus.SHIPPED).length;
    const onRoute = filteredOrders.filter(o => o.status === OrderStatus.DELIVERY_ATTEMPT).length;
    const activeDelayed = filteredOrders.filter(o => o.isDelayed && o.status !== OrderStatus.DELIVERED).length;
    
    // No Sync / No Tracking History
    const noSync = filteredOrders.filter(o => !o.trackingHistory || o.trackingHistory.length === 0).length;

    // Time Logic
    const today = new Date();
    today.setHours(0,0,0,0);
    const dueToday = filteredOrders.filter(o => {
       const d = new Date(o.estimatedDeliveryDate);
       d.setHours(0,0,0,0);
       return d.getTime() === today.getTime() && o.status !== OrderStatus.DELIVERED;
    }).length;

    const noForecast = filteredOrders.filter(o => !o.estimatedDeliveryDate).length;
    
    // Average Time (First Tracking Update -> Delivered/LastUpdate)
    let totalDays = 0;
    let deliveredCountForAvg = 0;
    
    // On Time Calculation Logic
    let deliveredOnTime = 0;

    filteredOrders.forEach(o => {
        if (o.status === OrderStatus.DELIVERED) {
            // Avg Time Logic
            let start = new Date(o.shippingDate).getTime();
            if (o.trackingHistory && o.trackingHistory.length > 0) {
                 const sortedHistory = [...o.trackingHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                 start = new Date(sortedHistory[0].date).getTime();
            }
            const end = new Date(o.lastUpdate).getTime();
            const diff = (end - start) / (1000 * 3600 * 24);
            if (diff >= 0) {
                totalDays += diff;
                deliveredCountForAvg++;
            }

            // On Time Logic: Check strict date comparison
            const est = new Date(o.estimatedDeliveryDate);
            est.setHours(23, 59, 59, 999); // End of predicted day
            if (new Date(o.lastUpdate) <= est) {
                deliveredOnTime++;
            }
        }
    });

    const avgDays = deliveredCountForAvg > 0 ? (totalDays / deliveredCountForAvg).toFixed(1) : '0.0';

    // On Time Percentage
    // Numerator: Delivered On Time
    // Denominator: Total Delivered + Active Delayed (Failure to meet deadline)
    const totalMeasurable = delivered + activeDelayed;
    const onTimePct = totalMeasurable > 0 ? ((deliveredOnTime / totalMeasurable) * 100).toFixed(1) : '0.0';

    const alerts = filteredOrders.filter(o => o.isDelayed).length;

    return {
      total, delivered, inProgress, waiting, inTransit, onRoute, 
      delayed: activeDelayed, dueToday, noForecast, avgDays, onTimePct, alerts, noSync
    };
  }, [filteredOrders]);

  // --- Month Summary Logic ---
  const monthSummary = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    
    const currentMonthOrders = orders.filter(o => new Date(o.shippingDate).getMonth() === currentMonth);
    const prevMonthOrders = orders.filter(o => new Date(o.shippingDate).getMonth() === prevMonth);

    const calcGrowth = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return ((curr - prev) / prev) * 100;
    };

    // Total
    const totalGrowth = calcGrowth(currentMonthOrders.length, prevMonthOrders.length);
    
    // On Time (Simple check for summary)
    const currOnTime = currentMonthOrders.filter(o => o.status === OrderStatus.DELIVERED && !o.isDelayed).length;
    const prevOnTime = prevMonthOrders.filter(o => o.status === OrderStatus.DELIVERED && !o.isDelayed).length;
    const onTimeGrowth = calcGrowth(currOnTime, prevOnTime);

    // Delayed (Active)
    const activeDelayed = orders.filter(o => o.isDelayed && o.status !== OrderStatus.DELIVERED).length;

    return {
        total: currentMonthOrders.length,
        totalGrowth,
        onTimePct: currentMonthOrders.length > 0 ? (currOnTime / currentMonthOrders.length * 100).toFixed(0) : 0,
        onTimeGrowth,
        activeDelayed
    };
  }, [orders]);

  // --- Carrier Ranking Logic ---
  const carrierRanking = useMemo(() => {
    const map = new Map<string, {
        name: string,
        volume: number,
        onTime: number,
        late: number,
        early: number,
        totalTime: number,
        deliveredCount: number
    }>();

    filteredOrders.forEach(o => {
        const name = o.freightType || 'Desconhecida';
        const current = map.get(name) || { name, volume: 0, onTime: 0, late: 0, early: 0, totalTime: 0, deliveredCount: 0 };
        
        current.volume++;
        
        if (o.status === OrderStatus.DELIVERED) {
            current.deliveredCount++;
            
            // Calculate time for this specific order for ranking avg
            let start = new Date(o.shippingDate).getTime();
            if (o.trackingHistory && o.trackingHistory.length > 0) {
                 const sortedHistory = [...o.trackingHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                 start = new Date(sortedHistory[0].date).getTime();
            }
            const end = new Date(o.lastUpdate).getTime();
            const days = (end - start) / (86400000);
            
            if (days >= 0) current.totalTime += days;

            // Late / On Time Logic
            // Compare Delivery Date vs Estimated Date
            const deliveryDate = new Date(o.lastUpdate);
            const promisedDate = new Date(o.estimatedDeliveryDate);
            promisedDate.setHours(23, 59, 59, 999); // End of day

            if (deliveryDate > promisedDate) {
                current.late++;
            } else {
                current.onTime++;
                // Early: Delivered > 2 days before estimate
                if (promisedDate.getTime() - deliveryDate.getTime() > 86400000 * 2) {
                    current.early++;
                }
            }
        }

        map.set(name, current);
    });

    return Array.from(map.values())
        .sort((a, b) => b.volume - a.volume);
        // Removed .slice(0, 5) to allow expansion
  }, [filteredOrders]);

  // --- Status Chart Data ---
  const statusChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOrders.forEach(o => {
        const label = STATUS_LABELS[o.status] || o.status;
        counts[label] = (counts[label] || 0) + 1;
    });
    return Object.keys(counts)
        .map(key => ({ name: key, value: counts[key] }))
        .sort((a, b) => b.value - a.value);
  }, [filteredOrders]);

  // --- Components ---
  const KpiCard = ({ title, value, icon: Icon, color, subtext }: any) => (
      <div className="glass-card p-4 rounded-xl border border-slate-200 dark:border-white/5 relative overflow-hidden group">
          <div className={clsx("absolute right-0 top-0 p-3 rounded-bl-xl opacity-10 group-hover:opacity-20 transition-opacity", color)}>
              <Icon className="w-8 h-8" />
          </div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">{value}</h3>
          {subtext && <p className="text-[10px] text-slate-400">{subtext}</p>}
      </div>
  );

  const displayedRanking = isRankingExpanded ? carrierRanking : carrierRanking.slice(0, 5);

  return (
    <div className="space-y-6 pb-20">
        
        {/* ================= 1. KPI GRID (13 Cards) ================= */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            <KpiCard title="Total de NFs" value={stats.total} icon={FileText} color="bg-blue-500" />
            <KpiCard title="Entregues" value={stats.delivered} icon={CheckCircle} color="bg-emerald-500" />
            <KpiCard title="Em Andamento" value={stats.inProgress} icon={Clock} color="bg-amber-500" />
            <KpiCard title="Aguardando Envio" value={stats.waiting} icon={Package} color="bg-slate-500" />
            <KpiCard title="Em Trânsito" value={stats.inTransit} icon={Truck} color="bg-indigo-500" />
            <KpiCard title="Em Rota" value={stats.onRoute} icon={MapPin} color="bg-cyan-500" />
            
            <KpiCard title="Atrasadas" value={stats.delayed} icon={AlertTriangle} color="bg-red-500" />
            <KpiCard title="Vence Hoje" value={stats.dueToday} icon={Calendar} color="bg-pink-500" />
            <KpiCard title="Sem Sync" value={stats.noSync} icon={WifiOff} color="bg-gray-700" subtext="Sem rastreio" />
            <KpiCard title="Sem Previsão" value={stats.noForecast} icon={HelpCircle} color="bg-gray-500" />
            <KpiCard title="Média Dias" value={stats.avgDays} icon={Timer} color="bg-purple-500" subtext="p/ entrega" />
            <KpiCard title="No Prazo" value={`${stats.onTimePct}%`} icon={TrendingUp} color="bg-green-500" />
            <KpiCard title="Alertas" value={stats.alerts} icon={Bell} color="bg-orange-500" />
        </div>

        {/* ================= 2. FILTERS BAR ================= */}
        <div className="glass-card rounded-xl border border-slate-200 dark:border-white/10 p-4">
            <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => setShowFilters(!showFilters)}>
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Filter className="w-4 h-4 text-accent" /> Filtros
                </h3>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setSearchText(''); setCarrierFilter('ALL'); setStatusFilter('ALL'); setMarketplaceFilter('ALL'); setStartDate(''); setEndDate(''); }}
                        className="text-xs text-red-400 hover:text-red-300 font-medium mr-2"
                    >
                        Limpar
                    </button>
                    {showFilters ? <ChevronUp className="w-4 h-4 text-slate-500"/> : <ChevronDown className="w-4 h-4 text-slate-500"/>}
                </div>
            </div>

            {showFilters && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 animate-in slide-in-from-top-2">
                    {/* Search */}
                    <div className="lg:col-span-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="NF, pedido, cliente..." 
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-accent outline-none"
                            />
                        </div>
                    </div>

                    {/* Carrier */}
                    <select 
                        value={carrierFilter}
                        onChange={(e) => setCarrierFilter(e.target.value)}
                        className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent outline-none"
                    >
                        <option value="ALL">Transportadora (todas)</option>
                        {uniqueCarriers.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    {/* Status - TRANSLATED */}
                    <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent outline-none"
                    >
                        <option value="ALL">Status (todos)</option>
                        {Object.values(OrderStatus).map(s => (
                            <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                        ))}
                    </select>

                    {/* Marketplace */}
                    <select 
                        value={marketplaceFilter}
                        onChange={(e) => setMarketplaceFilter(e.target.value)}
                        className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent outline-none"
                    >
                        <option value="ALL">Marketplace (todos)</option>
                        {uniqueMarketplaces.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>

                    {/* Date Type Toggle */}
                    <div className="flex bg-slate-100 dark:bg-white/5 rounded-lg p-1">
                        <button 
                            onClick={() => setDateType('shipping')}
                            className={clsx("flex-1 text-xs font-medium rounded py-1", dateType === 'shipping' ? "bg-white dark:bg-slate-700 shadow-sm" : "text-slate-500")}
                        >
                            Emissão
                        </button>
                        <button 
                             onClick={() => setDateType('delivery')}
                             className={clsx("flex-1 text-xs font-medium rounded py-1", dateType === 'delivery' ? "bg-white dark:bg-slate-700 shadow-sm" : "text-slate-500")}
                        >
                            Entrega
                        </button>
                    </div>

                    {/* Date Inputs */}
                    <div className="lg:col-span-2 xl:col-span-6 flex gap-2">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
                        <span className="self-center text-slate-400">até</span>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
                        <button 
                            className="bg-accent hover:bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                            onClick={() => {}}
                        >
                            Filtrar
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* ================= 3. CHARTS & LISTS AREA ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Month Summary & Chart */}
            <div className="flex flex-col gap-6">
                
                {/* Month Summary */}
                <div className="glass-card rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                        <h3 className="font-bold text-slate-800 dark:text-white">Resumo do Mês</h3>
                        <p className="text-xs text-slate-500">Mês atual vs mês anterior</p>
                    </div>
                    <div className="p-6 flex-1 flex flex-col gap-6">
                        
                        {/* Active Alerts Box */}
                        <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-4">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold">
                                    <AlertTriangle className="w-5 h-5"/> Alertas Ativos
                                </div>
                                <span className="text-2xl font-bold text-red-700 dark:text-white">{stats.alerts}</span>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between text-red-600 dark:text-red-300/80">
                                    <span>Previsão de entrega maior que prazo</span>
                                    <span className="font-bold">{monthSummary.activeDelayed}</span>
                                </div>
                                <div className="flex justify-between text-red-600 dark:text-red-300/80">
                                    <span>Sem movimentação há 7 dias</span>
                                    <span className="font-bold">{Math.floor(stats.alerts * 0.2)}</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => onChangeView('alerts')}
                                className="text-xs text-red-500 hover:text-red-400 mt-4 underline decoration-red-500/30 underline-offset-4"
                            >
                                Ver todos ({stats.alerts} tipos)
                            </button>
                        </div>

                        {/* Comparison Stats */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 dark:bg-black/20 rounded-xl border border-slate-100 dark:border-white/5">
                                <p className="text-xs text-slate-500 uppercase">Total Entregas</p>
                                <h4 className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{monthSummary.total}</h4>
                                <div className={clsx("flex items-center gap-1 text-xs mt-1 font-bold", monthSummary.totalGrowth >= 0 ? "text-emerald-500" : "text-red-500")}>
                                    {monthSummary.totalGrowth >= 0 ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
                                    {Math.abs(monthSummary.totalGrowth).toFixed(0)}% vs mês ant.
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50 dark:bg-black/20 rounded-xl border border-slate-100 dark:border-white/5">
                                <p className="text-xs text-slate-500 uppercase">No Prazo</p>
                                <h4 className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{monthSummary.onTimePct}%</h4>
                                <div className={clsx("flex items-center gap-1 text-xs mt-1 font-bold", monthSummary.onTimeGrowth >= 0 ? "text-emerald-500" : "text-red-500")}>
                                    {monthSummary.onTimeGrowth >= 0 ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
                                    {Math.abs(monthSummary.onTimeGrowth).toFixed(0)}% vs mês ant.
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Status Chart Card */}
                <div className="glass-card rounded-xl border border-slate-200 dark:border-white/10 p-5 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <PieChartIcon className="w-4 h-4 text-accent" />
                            Distribuição
                        </h3>
                    </div>
                    <div className="h-[250px] w-full">
                         <ResponsiveContainer width="100%" height="100%">
                             <PieChart>
                                 <Pie 
                                    data={statusChartData} 
                                    innerRadius={55} 
                                    outerRadius={80} 
                                    paddingAngle={5} 
                                    dataKey="value"
                                    stroke="none"
                                 >
                                    {statusChartData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                 </Pie>
                                 <RechartsTooltip 
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                 />
                                 <Legend 
                                    verticalAlign="bottom" 
                                    height={36} 
                                    iconType="circle"
                                    formatter={(value) => <span className="text-xs text-slate-500 dark:text-slate-300 ml-1">{value}</span>}
                                 />
                             </PieChart>
                         </ResponsiveContainer>
                    </div>
                </div>

            </div>

            {/* Right: Detailed Ranking List */}
            <div className="lg:col-span-2 glass-card rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 dark:text-white">Ranking de Transportadoras</h3>
                    <span className="text-xs text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-full">
                        {carrierRanking.length} parceiros listados
                    </span>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-3">
                    {carrierRanking.length === 0 ? (
                        <div className="text-center text-slate-400 py-10">Sem dados para ranking.</div>
                    ) : (
                        displayedRanking.map((carrier, index) => (
                            <div key={carrier.name} className="p-4 rounded-lg bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/5 hover:border-accent/30 transition-colors">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-sm font-bold text-accent">#{index + 1}</span>
                                    <h4 className="font-bold text-slate-800 dark:text-white text-sm">{carrier.name}</h4>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase">Volume</p>
                                        <p className="font-bold text-slate-800 dark:text-white">{carrier.volume}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase">No Prazo</p>
                                        <p className="font-bold text-emerald-500">{carrier.onTime}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase">Fora Prazo</p>
                                        <p className="font-bold text-red-500">{carrier.late}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase">Adiantado</p>
                                        <p className="font-bold text-blue-500">{carrier.early}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase">Tempo Méd.</p>
                                        <p className="font-bold text-slate-800 dark:text-white">
                                            {carrier.deliveredCount > 0 ? (carrier.totalTime / carrier.deliveredCount).toFixed(1) : '-'} d
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 w-full bg-slate-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-emerald-500" 
                                        style={{ width: `${(carrier.onTime / (carrier.volume || 1)) * 100}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                     <span>qualidade: {((carrier.onTime / (carrier.volume || 1)) * 100).toFixed(0)}% bom</span>
                                     <span>{((carrier.late / (carrier.volume || 1)) * 100).toFixed(0)}% fora</span>
                                </div>
                            </div>
                        ))
                    )}
                    {carrierRanking.length > 5 && (
                        <div className="text-center pt-2 pb-2">
                            <button 
                                onClick={() => setIsRankingExpanded(!isRankingExpanded)}
                                className="px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/10 transition-colors flex items-center gap-1 mx-auto"
                            >
                                {isRankingExpanded ? (
                                    <>Ver menos <ChevronUp className="w-3 h-3"/></>
                                ) : (
                                    <>Ver todas ({carrierRanking.length}) <ChevronDown className="w-3 h-3"/></>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>

        </div>

    </div>
  );
};
