import React, { useState, useMemo } from "react";
import { Order, OrderStatus } from "../types";
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
  Loader2,
  RefreshCw,
} from "lucide-react";
import { clsx } from "clsx";
import { normalizeCarrierName } from "../utils";

interface OrderListProps {
  orders: Order[];
  initialFilters?: any;
  onFetchSingle?: (orderId: string) => Promise<void>;
}

export const OrderList: React.FC<OrderListProps> = ({
  orders,
  initialFilters,
  onFetchSingle,
}) => {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isFetchingSingle, setIsFetchingSingle] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false); // ✅ Novo state

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
        o.orderNumber.toLowerCase().includes(searchText.toLowerCase()) ||
        o.customerName.toLowerCase().includes(searchText.toLowerCase()) ||
        (o.cpf && o.cpf.includes(searchText));

      // 2. Dropdowns
      const matchStatus =
        (statusFilter === "ALL" || o.status === statusFilter) &&
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
        const d = new Date(o.estimatedDeliveryDate);
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
        matchDate =
          matchDate &&
          new Date(o.estimatedDeliveryDate) >= new Date(dateRangeStart);
      }
      if (dateRangeEnd) {
        matchDate =
          matchDate &&
          new Date(o.estimatedDeliveryDate) <= new Date(dateRangeEnd);
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
    if (
      !confirm(
        "Sincronizar todos os pedidos ativos? Isso pode demorar alguns minutos.",
      )
    ) {
      return;
    }

    setIsSyncing(true);
    try {
      const response = await fetch("/api/orders/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ ${result.message}`);
        // Recarregar pedidos
        window.location.reload();
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
            Rota
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
                  placeholder="Buscar por Pedido, Chave NF ou Cliente..."
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
                    {s}
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

      {/* ✅ Botão Sincronizar Todos */}
      <div className="flex justify-end">
        <button
          onClick={handleSyncAll}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-2 bg-accent dark:bg-neon-blue text-white dark:text-black rounded-lg hover:bg-blue-600 dark:hover:bg-cyan-400 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          {isSyncing ? (
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
                  Emissão
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Marketplace
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Transportadora
                </th>
                <th className="px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-[#11131f]">
                  Prev. Entrega
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
                      {normalizeCarrierName(order.freightType)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {new Date(
                        order.estimatedDeliveryDate,
                      ).toLocaleDateString()}
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
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-slate-400 hover:text-accent dark:hover:text-neon-blue p-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
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
