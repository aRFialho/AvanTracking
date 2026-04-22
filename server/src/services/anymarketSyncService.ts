import type { TraySyncOrderReport } from '../types/syncReport';
import { prisma } from '../lib/prisma';
import { isDemoCompany } from './demoCompanyService';
import { AnymarketApiService } from './anymarketApiService';
import { integrationOrderStatusService } from './integrationOrderStatusService';
import { importOrdersForCompany } from './orderImportService';
import { shouldSkipPlatformOrderImport } from '../utils/orderExclusion';
import { SyncCancellationError } from '../utils/syncCancellation';

const VALID_DAY_OPTIONS = [120, 90, 60, 30, 15, 7, 2] as const;
const ANYMARKET_FALLBACK_STATUSES = [
  'PENDING',
  'DELIVERY_ISSUE',
  'PAID_WAITING_SHIP',
  'INVOICED',
  'PAID_WAITING_DELIVERY',
  'CONCLUDED',
  'CANCELED',
] as const;

export interface AnymarketSyncFiltersInput {
  days?: number;
  statusMode?: 'selected' | 'all_except_canceled';
  statuses?: string[];
  marketplace?: string;
}

interface AnymarketSyncHooks {
  onStart?: (data: { total: number }) => void;
  onStatusStart?: (data: { status: string; index: number; total: number }) => void;
  onStatusFinish?: (data: {
    status: string;
    index: number;
    total: number;
    imported: number;
  }) => void;
  onLog?: (message: string) => void;
  shouldCancel?: () => boolean;
}

const normalizeRequestedStatuses = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((status) => String(status || '').trim().toUpperCase())
    .filter(Boolean);
};

const resolveQueryWindow = (days: number) => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - days);

  if (days <= 7) {
    return {
      windowType: 'updated' as const,
      createdAfter: undefined,
      createdBefore: undefined,
      updatedAfter: start.toISOString(),
      updatedBefore: now.toISOString(),
    };
  }

  return {
    windowType: 'created' as const,
    createdAfter: start.toISOString(),
    createdBefore: now.toISOString(),
    updatedAfter: undefined,
    updatedBefore: undefined,
  };
};

export class AnymarketSyncService {
  async executeSync(
    companyId: string,
    filters: AnymarketSyncFiltersInput,
    hooks?: AnymarketSyncHooks,
  ) {
    const company = await (prisma.company as any).findUnique({
      where: { id: companyId },
      select: {
        name: true,
        cnpj: true,
        documentNumber: true,
        anymarketIntegrationEnabled: true,
        integrationCarrierExceptions: true,
      },
    });

    if (isDemoCompany(company)) {
      throw new Error(
        'Sincronizacao da Integradora desabilitada para empresa demonstrativa.',
      );
    }

    if (company?.anymarketIntegrationEnabled === false) {
      throw new Error('A integracao ANYMARKET esta desativada para esta empresa.');
    }

    const selectedDays = Number(filters.days);
    const days = VALID_DAY_OPTIONS.includes(
      selectedDays as (typeof VALID_DAY_OPTIONS)[number],
    )
      ? selectedDays
      : 7;
    const queryWindow = resolveQueryWindow(days);
    const statusMode =
      filters.statusMode === 'selected' ? 'selected' : 'all_except_canceled';
    const requestedStatuses = normalizeRequestedStatuses(filters.statuses);
    const availableStatuses =
      await integrationOrderStatusService.getOrderImportStatuses(companyId);
    const cancelStatuses = availableStatuses.cancelStatusValues.map((value) =>
      String(value || '').trim().toUpperCase(),
    );
    const statusesToSync =
      statusMode === 'selected'
        ? requestedStatuses
        : (availableStatuses.integration === 'anymarket'
            ? availableStatuses.statuses
                .map((status) => String(status.value || '').trim().toUpperCase())
                .filter((status) => status && !cancelStatuses.includes(status))
            : ANYMARKET_FALLBACK_STATUSES.filter(
                (status) => !cancelStatuses.includes(status),
              ));

    if (statusMode === 'selected' && statusesToSync.length === 0) {
      throw new Error('Selecione ao menos um status do ANYMARKET para sincronizar.');
    }

    const storedOrders = await prisma.order.findMany({
      where: { companyId },
      select: {
        id: true,
        freightType: true,
      },
    });
    const ordersToRemoveByCarrierException = storedOrders.filter((order) =>
      shouldSkipPlatformOrderImport({
        freightType: order.freightType,
        carrierExceptions: company?.integrationCarrierExceptions,
      }),
    );

    if (ordersToRemoveByCarrierException.length > 0) {
      await prisma.order.deleteMany({
        where: {
          id: {
            in: ordersToRemoveByCarrierException.map((order) => order.id),
          },
        },
      });
      hooks?.onLog?.(
        `${ordersToRemoveByCarrierException.length} pedido(s) existente(s) foram removidos por baterem com a excecao de transportadora antes do sync ANYMARKET.`,
      );
    }

    const anymarketApi = new AnymarketApiService(companyId);
    const aggregateResults = {
      created: 0,
      updated: 0,
      skipped: 0,
      totalTrackingEvents: 0,
      errors: [] as string[],
      createdOrders: [] as TraySyncOrderReport[],
      updatedOrders: [] as TraySyncOrderReport[],
    };
    let processedOrdersCount = 0;

    hooks?.onStart?.({ total: statusesToSync.length });
    hooks?.onLog?.(
      `Sincronizacao ANYMARKET iniciada com janela de ${days} dias baseada em ${queryWindow.windowType} e ${statusesToSync.length} status.`,
    );

    for (let index = 0; index < statusesToSync.length; index += 1) {
      if (hooks?.shouldCancel?.()) {
        throw new SyncCancellationError();
      }

      const anymarketStatus = statusesToSync[index];

      hooks?.onStatusStart?.({
        status: anymarketStatus,
        index: index + 1,
        total: statusesToSync.length,
      });
      hooks?.onLog?.(`Buscando pedidos ANYMARKET com status "${anymarketStatus}".`);

      const importedOrdersCount = await anymarketApi.syncAllOrders(
        {
          status: anymarketStatus,
          marketplace:
            typeof filters.marketplace === 'string' && filters.marketplace.trim()
              ? filters.marketplace.trim()
              : undefined,
          createdAfter: queryWindow.createdAfter,
          createdBefore: queryWindow.createdBefore,
          updatedAfter: queryWindow.updatedAfter,
          updatedBefore: queryWindow.updatedBefore,
        },
        {
          onLog: hooks?.onLog,
          shouldCancel: hooks?.shouldCancel,
          onOrdersBatch: async (batchOrders) => {
            if (hooks?.shouldCancel?.()) {
              throw new SyncCancellationError();
            }

            const mappedOrders = batchOrders.map((order) =>
              anymarketApi.mapAnymarketOrderToSystem(order),
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
            processedOrdersCount += batchOrders.length;

            hooks?.onLog?.(
              `Lote ANYMARKET importado: ${importResult.results.created} criado(s), ${importResult.results.updated} atualizado(s), ${importResult.results.skipped} ignorado(s).`,
            );
          },
        },
      );

      hooks?.onStatusFinish?.({
        status: anymarketStatus,
        index: index + 1,
        total: statusesToSync.length,
        imported: importedOrdersCount,
      });
      hooks?.onLog?.(
        `Status "${anymarketStatus}" finalizado com ${importedOrdersCount} pedido(s) consultado(s) no ANYMARKET.`,
      );
    }

    if (processedOrdersCount === 0) {
      hooks?.onLog?.(
        'Nenhum pedido ANYMARKET encontrado para importacao com os filtros selecionados.',
      );

      return {
        success: true,
        message:
          'Nenhum pedido ANYMARKET encontrado para importacao com os filtros selecionados.',
        statuses: statusesToSync,
        windowType: queryWindow.windowType,
        range: {
          createdAfter: queryWindow.createdAfter || null,
          createdBefore: queryWindow.createdBefore || null,
          updatedAfter: queryWindow.updatedAfter || null,
          updatedBefore: queryWindow.updatedBefore || null,
        },
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
      `Importacao ANYMARKET concluida: ${aggregateResults.created} criados, ${aggregateResults.updated} atualizados, ` +
      `${aggregateResults.skipped} ignorados, ${aggregateResults.totalTrackingEvents} evento(s) iniciais de rastreio.`;
    hooks?.onLog?.(importMessage);

    return {
      success: true,
      message: importMessage,
      statuses: statusesToSync,
      windowType: queryWindow.windowType,
      range: {
        createdAfter: queryWindow.createdAfter || null,
        createdBefore: queryWindow.createdBefore || null,
        updatedAfter: queryWindow.updatedAfter || null,
        updatedBefore: queryWindow.updatedBefore || null,
      },
      results: aggregateResults,
    };
  }
}

export const anymarketSyncService = new AnymarketSyncService();
