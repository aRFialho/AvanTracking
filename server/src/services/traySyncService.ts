import { PrismaClient } from '@prisma/client';
import { TrayApiService } from './trayApiService';
import { trayAuthService } from './trayAuthService';
import { importOrdersForCompany } from './orderImportService';
import type { TraySyncOrderReport } from '../types/syncReport';

const prisma = new PrismaClient();

const TRAY_STATUS_OPTIONS = [
  'a enviar',
  '5- aguardando faturamento',
  'enviado',
  'finalizado',
  'entregue',
  'cancelado',
  'aguardando envio',
] as const;

const DEFAULT_TRAY_STATUSES = TRAY_STATUS_OPTIONS.filter(
  (status) => status !== 'cancelado',
);

const VALID_DAY_OPTIONS = [90, 60, 30, 15, 7, 2] as const;

type TrayStatusOption = (typeof TRAY_STATUS_OPTIONS)[number];

export interface TraySyncFiltersInput {
  storeId?: string;
  days?: number;
  statusMode?: 'selected' | 'all_except_canceled';
  statuses?: string[];
}

interface TraySyncHooks {
  onStart?: (data: { total: number }) => void;
  onStatusStart?: (data: { status: string; index: number; total: number }) => void;
  onStatusFinish?: (data: {
    status: string;
    index: number;
    total: number;
    imported: number;
  }) => void;
  onLog?: (message: string) => void;
}

const normalizeRequestedStatuses = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((status) => String(status || '').trim().toLowerCase())
    .filter((status): status is TrayStatusOption =>
      TRAY_STATUS_OPTIONS.includes(status as TrayStatusOption),
    );
};

const resolveModifiedDate = (days: number) => {
  const modified = new Date();
  modified.setHours(0, 0, 0, 0);
  modified.setDate(modified.getDate() - days);
  return modified.toISOString().slice(0, 10);
};

export class TraySyncService {
  async executeSync(
    companyId: string,
    filters: TraySyncFiltersInput,
    hooks?: TraySyncHooks,
  ) {
    const requestedStoreId =
      typeof filters.storeId === 'string' && filters.storeId.trim()
        ? filters.storeId.trim()
        : undefined;

    const auth = await trayAuthService.getCurrentAuth(companyId, requestedStoreId);

    if (!auth) {
      throw new Error('Nenhuma integracao Tray autorizada foi encontrada.');
    }

    const selectedDays = Number(filters.days);
    const days = VALID_DAY_OPTIONS.includes(
      selectedDays as (typeof VALID_DAY_OPTIONS)[number],
    )
      ? selectedDays
      : 30;

    const statusMode =
      filters.statusMode === 'selected' ? 'selected' : 'all_except_canceled';

    const requestedStatuses = normalizeRequestedStatuses(filters.statuses);
    const statusesToSync =
      statusMode === 'selected' ? requestedStatuses : [...DEFAULT_TRAY_STATUSES];

    if (statusMode === 'selected' && statusesToSync.length === 0) {
      throw new Error('Selecione ao menos um status da Tray para sincronizar.');
    }

    const modified = resolveModifiedDate(days);
    const trayApi = new TrayApiService(companyId);
    const existingOrderNumbers = new Set(
      (
        await prisma.order.findMany({
          where: { companyId },
          select: { orderNumber: true },
        })
      ).map((order) => String(order.orderNumber)),
    );
    const aggregateResults = {
      created: 0,
      updated: 0,
      skipped: 0,
      totalTrackingEvents: 0,
      errors: [] as string[],
      createdOrders: [] as TraySyncOrderReport[],
      updatedOrders: [] as TraySyncOrderReport[],
    };
    let importedOrdersCount = 0;

    hooks?.onStart?.({ total: statusesToSync.length });
    hooks?.onLog?.(
      `Sincronizacao Tray iniciada com janela de ${days} dias e ${statusesToSync.length} status.`,
    );

    for (let index = 0; index < statusesToSync.length; index += 1) {
      const trayStatus = statusesToSync[index];
      hooks?.onStatusStart?.({
        status: trayStatus,
        index: index + 1,
        total: statusesToSync.length,
      });
      hooks?.onLog?.(`Buscando pedidos Tray com status "${trayStatus}".`);

      const trayOrders = await trayApi.syncAllOrders(
        {
          status: trayStatus,
          modified,
          skipOrderNumbers: existingOrderNumbers,
        },
        {
          onLog: hooks?.onLog,
          onOrdersBatch: async (batchOrders) => {
            const freshOrders = batchOrders.filter((order) => {
              const orderNumber = String(order.id);
              return !existingOrderNumbers.has(orderNumber);
            });

            if (freshOrders.length === 0) {
              return;
            }

            const mappedOrders = freshOrders.map((order) =>
              trayApi.mapTrayOrderToSystem(order),
            );
            const importResult = await importOrdersForCompany(companyId, mappedOrders);

            aggregateResults.created += importResult.results.created;
            aggregateResults.updated += importResult.results.updated;
            aggregateResults.skipped += importResult.results.skipped;
            aggregateResults.totalTrackingEvents +=
              importResult.results.totalTrackingEvents;
            aggregateResults.errors.push(...importResult.results.errors);
            aggregateResults.createdOrders.push(
              ...importResult.results.createdOrders,
            );
            aggregateResults.updatedOrders.push(
              ...importResult.results.updatedOrders,
            );
            importedOrdersCount += freshOrders.length;

            for (const order of freshOrders) {
              existingOrderNumbers.add(String(order.id));
            }

            hooks?.onLog?.(
              `Lote importado no banco: ${importResult.results.created} criado(s), ${importResult.results.updated} atualizado(s).`,
            );
          },
        },
      );

      hooks?.onStatusFinish?.({
        status: trayStatus,
        index: index + 1,
        total: statusesToSync.length,
        imported: trayOrders.length,
      });
      hooks?.onLog?.(
        `Status "${trayStatus}" finalizado com ${trayOrders.length} pedido(s) novo(s).`,
      );
    }

    if (importedOrdersCount === 0) {
      hooks?.onLog?.('Nenhum pedido novo encontrado na Tray para importacao.');
      return {
        success: true,
        message: 'Nenhum pedido novo encontrado na Tray com os filtros selecionados.',
        storeId: auth.storeId,
        statuses: statusesToSync,
        modified,
        results: {
          created: 0,
          updated: 0,
          skipped: 0,
          totalTrackingEvents: 0,
          errors: [],
          createdOrders: [],
          updatedOrders: [],
        },
      };
    }
    const importMessage =
      `Importacao concluida: ${aggregateResults.created} criados, ${aggregateResults.updated} atualizados, ` +
      `${aggregateResults.skipped} ignorados, ${aggregateResults.totalTrackingEvents} evento(s) iniciais de rastreio.`;
    hooks?.onLog?.(importMessage);

    return {
      success: true,
      message: importMessage,
      storeId: auth.storeId,
      statuses: statusesToSync,
      modified,
      results: aggregateResults,
    };
  }
}

export const traySyncService = new TraySyncService();
