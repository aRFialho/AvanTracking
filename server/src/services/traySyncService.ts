import { TrayApiService } from './trayApiService';
import { trayAuthService } from './trayAuthService';
import { importOrdersForCompany } from './orderImportService';
import type { TraySyncOrderReport } from '../types/syncReport';
import { prisma } from '../lib/prisma';
import { TrayFreightService } from './trayFreightService';
import {
  needsFreightRecalculation,
  recalculateStoredOrderFreight,
} from './freightRecalculationService';
import { integrationOrderStatusService } from './integrationOrderStatusService';

const TRAY_STATUS_OPTIONS = [
  'pedido cadastrado',
  'a enviar',
  '5- aguardando faturamento',
  'enviado',
  'finalizado',
  'entregue',
  'cancelado',
  'aguardando envio',
] as const;

const VALID_DAY_OPTIONS = [90, 60, 30, 15, 7, 2] as const;

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
    .filter(Boolean);
};

const resolveModifiedDate = (days: number) => {
  const modified = new Date();
  modified.setHours(0, 0, 0, 0);
  modified.setDate(modified.getDate() - days);
  return modified.toISOString().slice(0, 10);
};

const isBlankIdentifier = (value: string | null | undefined) =>
  typeof value !== 'string' || value.trim().length === 0;

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

    const company = await (prisma.company as any).findUnique({
      where: { id: companyId },
      select: {
        name: true,
        trayIntegrationEnabled: true,
      },
    });

    if (company?.trayIntegrationEnabled === false) {
      throw new Error('A integracao da Integradora esta desativada para esta empresa.');
    }

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
    const availableStatuses =
      await integrationOrderStatusService.getOrderImportStatuses(companyId);
    const statusesToSync =
      statusMode === 'selected'
        ? requestedStatuses
        : (availableStatuses.statuses.length > 0
            ? availableStatuses.statuses
                .map((status) => String(status.value || '').trim().toLowerCase())
                .filter(
                  (status) =>
                    status &&
                    !availableStatuses.cancelStatusValues
                      .map((value) => String(value || '').trim().toLowerCase())
                      .includes(status),
                )
            : TRAY_STATUS_OPTIONS.filter((status) => status !== 'cancelado'));

    if (statusMode === 'selected' && statusesToSync.length === 0) {
      throw new Error('Selecione ao menos um status da Tray para sincronizar.');
    }

    const modified = resolveModifiedDate(days);
    const trayApi = new TrayApiService(companyId);
    const freightService = new TrayFreightService(companyId);
    const storedOrders = await prisma.order.findMany({
      where: { companyId },
      select: {
        orderNumber: true,
        invoiceNumber: true,
        trackingCode: true,
      },
    });
    const existingOrderNumbers = new Set(
      storedOrders.map((order) => String(order.orderNumber)),
    );
    const pendingIdentifierOrderNumbers = new Set(
      storedOrders
        .filter(
          (order) =>
            isBlankIdentifier(order.invoiceNumber) &&
            isBlankIdentifier(order.trackingCode),
        )
        .map((order) => String(order.orderNumber)),
    );
    const skipOrderNumbers = new Set(
      storedOrders
        .map((order) => String(order.orderNumber))
        .filter((orderNumber) => !pendingIdentifierOrderNumbers.has(orderNumber)),
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
    let processedOrdersCount = 0;
    let revisitedOrdersCount = 0;

    hooks?.onStart?.({ total: statusesToSync.length });
    hooks?.onLog?.(
      `Sincronizacao Tray iniciada com janela de ${days} dias e ${statusesToSync.length} status.`,
    );
    if (pendingIdentifierOrderNumbers.size > 0) {
      hooks?.onLog?.(
        `${pendingIdentifierOrderNumbers.size} pedido(s) existente(s) sem NF e sem codigo de envio serao revisitados na Tray.`,
      );
    }

    for (let index = 0; index < statusesToSync.length; index += 1) {
      const trayStatus = statusesToSync[index];
      hooks?.onStatusStart?.({
        status: trayStatus,
        index: index + 1,
        total: statusesToSync.length,
      });
      hooks?.onLog?.(`Buscando pedidos Tray com status "${trayStatus}".`);

      const importedTrayOrdersCount = await trayApi.syncAllOrders(
        {
          status: trayStatus,
          modified,
          skipOrderNumbers,
        },
        {
          onLog: hooks?.onLog,
          onOrdersBatch: async (batchOrders) => {
            const ordersToProcess = batchOrders.filter((order) => {
              const orderNumber = String(order.id);
              return (
                !existingOrderNumbers.has(orderNumber) ||
                pendingIdentifierOrderNumbers.has(orderNumber)
              );
            });

            if (ordersToProcess.length === 0) {
              return;
            }

            const revisitedOrders = ordersToProcess.filter((order) =>
              pendingIdentifierOrderNumbers.has(String(order.id)),
            );
            const mappedOrders = ordersToProcess.map((order) =>
              trayApi.mapTrayOrderToSystem(order, {
                companyName: company?.name,
              }),
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
            processedOrdersCount += ordersToProcess.length;
            revisitedOrdersCount += revisitedOrders.length;

            const affectedOrderIds = [
              ...importResult.results.createdOrders,
              ...importResult.results.updatedOrders,
            ]
              .map((order) => order.orderId)
              .filter((orderId): orderId is string => Boolean(orderId));

            if (affectedOrderIds.length > 0) {
              const ordersForFreight = await prisma.order.findMany({
                where: {
                  id: { in: affectedOrderIds },
                },
                select: {
                  id: true,
                  orderNumber: true,
                  freightType: true,
                  zipCode: true,
                  freightValue: true,
                  apiRawPayload: true,
                  recalculatedFreightValue: true,
                  recalculatedFreightDate: true,
                  recalculatedFreightDetails: true,
                },
              });

              let recalculatedCount = 0;
              let skippedRecalculationCount = 0;

              for (const order of ordersForFreight) {
                try {
                  if (!needsFreightRecalculation(order)) {
                    skippedRecalculationCount += 1;
                    continue;
                  }

                  await recalculateStoredOrderFreight({
                    prisma,
                    order,
                    companyId,
                    freightService,
                  });
                  recalculatedCount += 1;
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : 'Erro desconhecido';
                  aggregateResults.errors.push(
                    `Frete ${order.orderNumber}: ${message}`,
                  );
                  hooks?.onLog?.(
                    `Falha ao recalcular frete do pedido ${order.orderNumber}: ${message}`,
                  );
                }
              }

              hooks?.onLog?.(
                `Frete recalculado no lote: ${recalculatedCount} pedido(s) atualizado(s), ${skippedRecalculationCount} ja estavam completos.`,
              );
            }

            for (const order of ordersToProcess) {
              const orderNumber = String(order.id);
              existingOrderNumbers.add(orderNumber);
              pendingIdentifierOrderNumbers.delete(orderNumber);
              skipOrderNumbers.add(orderNumber);
            }

            hooks?.onLog?.(
              `Lote importado no banco: ${importResult.results.created} criado(s), ${importResult.results.updated} atualizado(s), ${revisitedOrders.length} revisitado(s) por falta de NF/codigo.`,
            );
          },
        },
      );

      hooks?.onStatusFinish?.({
        status: trayStatus,
        index: index + 1,
        total: statusesToSync.length,
        imported: importedTrayOrdersCount,
      });
      hooks?.onLog?.(
        `Status "${trayStatus}" finalizado com ${importedTrayOrdersCount} pedido(s) consultado(s) na Tray.`,
      );
    }

    if (processedOrdersCount === 0) {
      hooks?.onLog?.(
        'Nenhum pedido novo ou incompleto encontrado na Tray para importacao.',
      );
      return {
        success: true,
        message:
          'Nenhum pedido novo ou sem NF/codigo de envio encontrado na Tray com os filtros selecionados.',
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
      `${aggregateResults.skipped} ignorados, ${aggregateResults.totalTrackingEvents} evento(s) iniciais de rastreio, ` +
      `${revisitedOrdersCount} pedido(s) revisitado(s) por falta de NF/codigo.`;
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
