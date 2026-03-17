import React, { useState, useMemo } from "react";
import { Order, OrderStatus } from "../types";
import { OrderDetail } from "./OrderDetail";
import {
  AlertTriangle,
  Clock,
  CalendarX,
  Eye,
  AlertOctagon,
  CheckCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { normalizeCarrierName } from "../utils";

interface AlertsViewProps {
  orders: Order[];
}

export const AlertsView: React.FC<AlertsViewProps> = ({ orders }) => {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [minDaysDelayed, setMinDaysDelayed] = useState<number>(0);

  // Calculate delay days helper
  const getDelayDays = (order: Order) => {
    if (!order.isDelayed) return 0;
    const targetDate = new Date(order.estimatedDeliveryDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - targetDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Filter only risky orders
  const riskyOrders = useMemo(() => {
    return orders
      .filter((o) => {
        // Exclude Cancelled
        if (o.status === OrderStatus.CANCELED) return false;

        // Exclude Channel Logistics / Priority
        // Check Status or FreightType string to be sure
        const isChannelLogistics =
          o.status === OrderStatus.CHANNEL_LOGISTICS ||
          o.freightType.toLowerCase().includes("priorit") ||
          ["ColetasME2", "Shopee Xpress"].includes(o.freightType);

        if (isChannelLogistics) return false;

        // Determine Risk
        const hasDelay = o.isDelayed && o.status !== OrderStatus.DELIVERED;
        const hasFailure =
          o.status === OrderStatus.FAILURE || o.status === OrderStatus.RETURNED;

        if (!hasDelay && !hasFailure) return false;

        const days = getDelayDays(o);
        return days >= minDaysDelayed;
      })
      .sort((a, b) => getDelayDays(b) - getDelayDays(a)); // Sort by most delayed
  }, [orders, minDaysDelayed]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-red-600 dark:text-red-400 font-medium text-sm">
              Total de Alertas
            </p>
            <h3 className="text-3xl font-bold text-red-800 dark:text-white">
              {riskyOrders.length}
            </h3>
          </div>
          <AlertTriangle className="w-8 h-8 text-red-300 dark:text-red-500" />
        </div>

        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30 p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-orange-600 dark:text-orange-400 font-medium text-sm">
              Atraso Crítico (+5 dias)
            </p>
            <h3 className="text-3xl font-bold text-orange-800 dark:text-white">
              {riskyOrders.filter((o) => getDelayDays(o) > 5).length}
            </h3>
          </div>
          <AlertOctagon className="w-8 h-8 text-orange-300 dark:text-orange-500" />
        </div>

        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 p-6 rounded-xl flex items-center gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300 block mb-2">
              Filtrar por dias de atraso
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="30"
                value={minDaysDelayed}
                onChange={(e) => setMinDaysDelayed(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
              <span className="w-8 text-sm font-bold text-slate-700 dark:text-white">
                {minDaysDelayed}+
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-hidden bg-white dark:bg-dark-card rounded-xl border border-slate-200 dark:border-white/10 shadow-sm relative">
        <div className="absolute inset-0 overflow-auto">
          {riskyOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
              <CheckCircle className="w-12 h-12 mb-2 text-green-400" />
              <p className="font-medium text-lg text-slate-600 dark:text-slate-300">
                Tudo certo!
              </p>
              <p>Nenhum pedido com risco crítico encontrado.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {riskyOrders.map((order) => {
                const days = getDelayDays(order);
                return (
                  <div
                    key={order.id}
                    className="p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg mt-1">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-800 dark:text-white">
                            Pedido #{order.orderNumber}
                          </h4>
                          <span className="text-xs bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-white/5">
                            {normalizeCarrierName(order.freightType)}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400 text-sm mt-0.5">
                          {order.customerName}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-500">
                          <span className="flex items-center gap-1">
                            <CalendarX className="w-3 h-3" /> Previsto:{" "}
                            {new Date(
                              order.estimatedDeliveryDate,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                      <div className="text-right">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
                          Tempo de Atraso
                        </p>
                        <p className="text-xl font-bold text-red-600 dark:text-red-400">
                          {days} dias
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-white/10 hover:border-slate-300 transition-colors flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" /> Detalhes
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
};
