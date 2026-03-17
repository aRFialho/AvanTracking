import React, { useState, useMemo } from "react";
import { Order, OrderStatus } from "../types";
import { OrderDetail } from "./OrderDetail";
import { AlertTriangle, AlertOctagon, CheckCircle, Search } from "lucide-react";
import { normalizeCarrierName } from "../utils";

interface DeliveryFailuresProps {
  orders: Order[];
}

export const DeliveryFailures: React.FC<DeliveryFailuresProps> = ({
  orders,
}) => {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchText, setSearchText] = useState("");

  // Filter only orders with delivery failures
  const failureOrders = useMemo(() => {
    return orders
      .filter((o) => {
        // Check if canceled
        if (o.status === OrderStatus.CANCELED) return false;

        // Check for CLARIFY_DELIVERY_FAIL in tracking history
        const hasFailure =
          o.trackingHistory &&
          o.trackingHistory.some((e) => e.status === "CLARIFY_DELIVERY_FAIL");

        if (!hasFailure) return false;

        // Text Search
        if (searchText) {
          const lower = searchText.toLowerCase();
          return (
            o.orderNumber.toLowerCase().includes(lower) ||
            o.customerName.toLowerCase().includes(lower) ||
            (o.trackingCode || "").toLowerCase().includes(lower)
          );
        }

        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime(),
      );
  }, [orders, searchText]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-red-600 dark:text-red-400 font-medium text-sm">
              Total de Falhas
            </p>
            <h3 className="text-3xl font-bold text-red-800 dark:text-white">
              {failureOrders.length}
            </h3>
            <p className="text-xs text-red-500 mt-1">
              Pedidos aguardando tratativa
            </p>
          </div>
          <AlertTriangle className="w-8 h-8 text-red-300 dark:text-red-500" />
        </div>

        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 p-6 rounded-xl flex items-center gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300 block mb-2">
              Buscar Pedido
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Número, cliente, rastreio..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-accent outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-hidden bg-white dark:bg-dark-card rounded-xl border border-slate-200 dark:border-white/10 shadow-sm relative">
        <div className="absolute inset-0 overflow-auto">
          {failureOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
              <CheckCircle className="w-12 h-12 mb-2 text-green-400" />
              <p className="font-medium text-lg text-slate-600 dark:text-slate-300">
                Tudo certo!
              </p>
              <p>Nenhuma falha de entrega pendente.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase bg-slate-50 dark:bg-dark-card sticky top-0 z-10 shadow-sm backdrop-blur-md">
                <tr>
                  <th className="px-4 py-3 bg-slate-50 dark:bg-[#11131f]">
                    Pedido
                  </th>
                  <th className="px-4 py-3 bg-slate-50 dark:bg-[#11131f]">
                    Cliente
                  </th>
                  <th className="px-4 py-3 bg-slate-50 dark:bg-[#11131f]">
                    Transportadora
                  </th>
                  <th className="px-4 py-3 bg-slate-50 dark:bg-[#11131f]">
                    Última Atualização
                  </th>
                  <th className="px-4 py-3 bg-slate-50 dark:bg-[#11131f]">
                    Motivo da Falha
                  </th>
                  <th className="px-4 py-3 bg-slate-50 dark:bg-[#11131f]">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {failureOrders.map((order) => {
                  const failEvent = order.trackingHistory.find(
                    (e) => e.status === "CLARIFY_DELIVERY_FAIL",
                  );
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {order.orderNumber}
                        <div className="text-[10px] text-slate-400">
                          {order.trackingCode || "Sem rastreio"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {order.customerName}
                        <div className="text-[10px] text-slate-400">
                          {order.city} - {order.state}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                          {normalizeCarrierName(order.freightType)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {new Date(order.lastUpdate).toLocaleDateString()}
                        <div className="text-[10px] text-slate-400">
                          {new Date(order.lastUpdate).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="text-red-600 dark:text-red-400 font-medium text-xs max-w-[200px] truncate"
                          title={failEvent?.description}
                        >
                          {failEvent?.description || "Falha na entrega"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="px-3 py-1.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-accent hover:text-white hover:border-accent transition-colors text-xs font-medium"
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
