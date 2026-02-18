
import React from 'react';
import { Order, OrderStatus } from '../types';
import { X, MapPin, Calendar, Truck, User, CreditCard } from 'lucide-react';
import { clsx } from 'clsx';

interface OrderDetailProps {
  order: Order;
  onClose: () => void;
}

export const OrderDetail: React.FC<OrderDetailProps> = ({ order, onClose }) => {
  
  // Sort history descending
  const sortedHistory = [...order.trackingHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-dark-card w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-white/10">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-black/20">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Pedido #{order.orderNumber}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Detalhes completos e rastreamento</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Info */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/30 dark:bg-white/5">
                  <div className="flex items-center gap-2 mb-2 text-slate-800 dark:text-white font-semibold text-sm">
                    <User className="w-4 h-4 text-accent" /> Cliente
                  </div>
                  <p className="font-medium text-slate-700 dark:text-slate-200">{order.customerName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{order.cpf || order.cnpj}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{order.mobile || order.phone}</p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/30 dark:bg-white/5">
                  <div className="flex items-center gap-2 mb-2 text-slate-800 dark:text-white font-semibold text-sm">
                    <MapPin className="w-4 h-4 text-accent" /> Entrega
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{order.address}, {order.number}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{order.neighborhood}</p>
                  <p className="text-sm font-medium mt-1 text-slate-700 dark:text-slate-200">{order.city} - {order.state}</p>
                  <p className="text-xs text-slate-400">{order.zipCode}</p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/30 dark:bg-white/5">
                  <div className="flex items-center gap-2 mb-2 text-slate-800 dark:text-white font-semibold text-sm">
                    <Truck className="w-4 h-4 text-accent" /> Logística
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-200"><span className="text-slate-500 dark:text-slate-400">Transp:</span> {order.freightType}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200"><span className="text-slate-500 dark:text-slate-400">Frete:</span> R$ {order.freightValue?.toFixed(2)}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200"><span className="text-slate-500 dark:text-slate-400">Canal:</span> {order.salesChannel}</p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/30 dark:bg-white/5">
                  <div className="flex items-center gap-2 mb-2 text-slate-800 dark:text-white font-semibold text-sm">
                    <Calendar className="w-4 h-4 text-accent" /> Prazos
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-200"><span className="text-slate-500 dark:text-slate-400">Envio:</span> {new Date(order.shippingDate).toLocaleDateString()}</p>
                  <p className={clsx("text-sm font-medium", order.isDelayed ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")}>
                    <span className="text-slate-500 dark:text-slate-400 font-normal">Previsto:</span> {new Date(order.estimatedDeliveryDate).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Status Warning */}
              {order.isDelayed && order.status !== OrderStatus.DELIVERED && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-4 rounded-lg flex items-start gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full text-red-600 dark:text-red-300">
                    <CreditCard className="w-4 h-4" /> {/* Just an icon placeholder */}
                  </div>
                  <div>
                    <h4 className="font-bold text-red-700 dark:text-red-400 text-sm">Risco de Atraso Detectado</h4>
                    <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                      A data atual excede a previsão de entrega e o status do pedido ainda não consta como entregue.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Timeline */}
            <div className="border-l border-slate-200 dark:border-white/10 pl-8 relative">
              <h3 className="font-bold text-slate-800 dark:text-white mb-6">Histórico de Rastreamento</h3>
              
              <div className="space-y-8">
                {sortedHistory.length > 0 ? sortedHistory.map((event, idx) => (
                  <div key={idx} className="relative group">
                    {/* Line connector */}
                    {idx !== sortedHistory.length - 1 && (
                      <div className="absolute top-2 left-[-33px] w-0.5 h-full bg-slate-200 dark:bg-white/10 group-last:hidden"></div>
                    )}
                    
                    {/* Dot */}
                    <div className={clsx(
                      "absolute top-1.5 left-[-37px] w-2.5 h-2.5 rounded-full border-2",
                      idx === 0 ? "bg-accent border-accent shadow-[0_0_0_4px_rgba(59,130,246,0.2)]" : "bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600"
                    )}></div>

                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white text-sm">{event.status}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{event.description}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                        <span>{new Date(event.date).toLocaleString()}</span>
                        {event.city && <span>• {event.city}/{event.state}</span>}
                      </div>
                    </div>
                  </div>
                )) : (
                   <div className="text-slate-400 text-sm italic">
                     Aguardando primeira atualização de rastreamento...
                   </div>
                )}
                
                {/* Initial State */}
                <div className="relative">
                   <div className="absolute top-1.5 left-[-37px] w-2.5 h-2.5 rounded-full border-2 bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600"></div>
                   <div>
                      <p className="font-semibold text-slate-600 dark:text-slate-300 text-sm">IMPORTADO</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Pedido importado para o sistema</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{new Date().toLocaleDateString()}</p>
                   </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-black/20 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm font-medium text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-white/10"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
