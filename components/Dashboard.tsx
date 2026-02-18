import React, { useMemo } from 'react';
import { Order, OrderStatus } from '../types';
import {
  FileStack, BoxSelect, Map as MapIcon, TimerOff,
  CalendarRange, Activity
} from 'lucide-react';
import { clsx } from 'clsx';

interface DashboardProps {
  orders: Order[];
}

export const Dashboard: React.FC<DashboardProps> = ({ orders }) => {

  const stats = useMemo(() => {
    const activeOrders = orders.filter(o => o.status !== OrderStatus.CANCELED);

    const total = activeOrders.length;
    const delivered = activeOrders.filter(o => o.status === OrderStatus.DELIVERED).length;
    const inTransit = activeOrders.filter(o => o.status === OrderStatus.SHIPPED).length;
    const delayed = activeOrders.filter(o => o.isDelayed).length;

    return {
      total,
      delivered,
      inTransit,
      delayed
    };
  }, [orders]);

  const StatCard = ({ label, value, icon: Icon, colorClass, borderClass }: any) => (
    <div className={clsx(
      "glass-card p-4 rounded-xl border-l-4 shadow-sm flex items-start justify-between tilt-card",
      borderClass
    )}>
      <div>
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          {label}
        </p>
        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mt-1">
          {value}
        </h3>
      </div>
      <div className={clsx("p-2 rounded-lg bg-opacity-10", colorClass)}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
  );

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500">
        <Activity className="w-16 h-16 mb-4 opacity-50" />
        <h2 className="text-xl font-semibold">Dashboard Vazio</h2>
        <p>Importe seus dados CSV para gerar as métricas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">

      {/* ================= HEADER COM RAIOS ATRÁS DO TÍTULO ================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">

        {/* BLOCO DO TÍTULO ENERGIZADO */}
        <div className="relative overflow-hidden rounded-2xl px-8 py-6">

          {/* Fundo escuro translúcido para contraste */}
          <div className="absolute inset-0 bg-slate-900/70 dark:bg-black/60 backdrop-blur-sm z-0"></div>

          {/* Camada de Raios */}
          <div className="absolute inset-0 lightning-bg pointer-events-none z-0"></div>

          {/* Conteúdo */}
          <div className="relative z-10">
            <h2 className="text-3xl font-bold text-white">
              Visão Geral da Operação
            </h2>
            <p className="text-slate-300 text-sm mt-1">
              Monitoramento em tempo real de {stats.total} pedidos.
            </p>
          </div>
        </div>

        {/* BLOCO DE DATA */}
        <div className="flex items-center gap-2 bg-white dark:bg-dark-card px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm text-sm">
          <CalendarRange className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Mês Atual
          </span>
        </div>

      </div>

      {/* ================= GRID DE KPIs ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        <StatCard
          label="Total de NFs"
          value={stats.total}
          icon={FileStack}
          colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
          borderClass="border-blue-500"
        />

        <StatCard
          label="Entregues"
          value={stats.delivered}
          icon={BoxSelect}
          colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
          borderClass="border-emerald-500"
        />

        <StatCard
          label="Em Trânsito"
          value={stats.inTransit}
          icon={MapIcon}
          colorClass="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400"
          borderClass="border-indigo-500"
        />

        <StatCard
          label="Atrasados"
          value={stats.delayed}
          icon={TimerOff}
          colorClass="bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400"
          borderClass="border-rose-500"
        />

      </div>

    </div>
  );
};
