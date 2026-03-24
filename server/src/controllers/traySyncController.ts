import { Request, Response } from 'express';
import { TrayApiService } from '../services/trayApiService';
import { trayAuthService } from '../services/trayAuthService';
import { importOrders } from './orderController';

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

const VALID_DAY_OPTIONS = [90, 60, 30, 15, 7] as const;

const normalizeRequestedStatuses = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((status) => String(status || '').trim().toLowerCase())
    .filter((status): status is (typeof TRAY_STATUS_OPTIONS)[number] =>
      TRAY_STATUS_OPTIONS.includes(status as (typeof TRAY_STATUS_OPTIONS)[number]),
    );
};

const resolveModifiedDate = (days: number) => {
  const modified = new Date();
  modified.setHours(0, 0, 0, 0);
  modified.setDate(modified.getDate() - days);
  return modified.toISOString().slice(0, 10);
};

/**
 * POST /api/tray/sync
 * Sincronizar pedidos da Tray
 */
export const syncTrayOrders = async (req: Request, res: Response) => {
  console.log('Iniciando sincronizacao com Tray...');

  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario nao autenticado' });
    }

    const requestedStoreId =
      typeof req.body?.storeId === 'string' && req.body.storeId.trim()
        ? req.body.storeId.trim()
        : undefined;

    const auth = await trayAuthService.getCurrentAuth(requestedStoreId);

    if (!auth) {
      return res.status(400).json({
        error: 'Nenhuma integracao Tray autorizada foi encontrada.',
      });
    }

    const selectedDays = Number(req.body?.days);
    const days = VALID_DAY_OPTIONS.includes(selectedDays as (typeof VALID_DAY_OPTIONS)[number])
      ? selectedDays
      : 30;

    const statusMode =
      req.body?.statusMode === 'selected'
        ? 'selected'
        : 'all_except_canceled';

    const requestedStatuses = normalizeRequestedStatuses(req.body?.statuses);
    const statusesToSync =
      statusMode === 'selected'
        ? requestedStatuses
        : [...DEFAULT_TRAY_STATUSES];

    if (statusMode === 'selected' && statusesToSync.length === 0) {
      return res.status(400).json({
        error: 'Selecione ao menos um status da Tray para sincronizar.',
      });
    }

    const modified = resolveModifiedDate(days);
    const trayApi = new TrayApiService(auth.storeId);
    const uniqueOrders = new Map<string, any>();

    for (const trayStatus of statusesToSync) {
      const trayOrders = await trayApi.syncAllOrders({
        status: trayStatus,
        modified,
      });

      for (const order of trayOrders) {
        uniqueOrders.set(String(order.id), order);
      }
    }

    const trayOrders = Array.from(uniqueOrders.values());

    if (trayOrders.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhum pedido encontrado na Tray com os filtros selecionados.',
        storeId: auth.storeId,
        statuses: statusesToSync,
        modified,
        results: { created: 0, updated: 0, skipped: 0 },
      });
    }

    const mappedOrders = trayOrders.map((order) =>
      trayApi.mapTrayOrderToSystem(order),
    );

    req.body = { orders: mappedOrders };
    return importOrders(req, res);
  } catch (error) {
    console.error('Erro na sincronizacao com Tray:', error);
    return res.status(500).json({
      error: 'Erro ao sincronizar com Tray',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};
