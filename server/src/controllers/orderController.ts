import { Request, Response } from 'express';
import { PrismaClient, OrderStatus } from '@prisma/client';
import { syncJobService } from '../services/syncJobService';
import { TrackingService } from '../services/trackingService';
import { syncReportService } from '../services/syncReportService';
import { importOrdersForCompany } from '../services/orderImportService';

const prisma = new PrismaClient();
const trackingService = new TrackingService();

const safeString = (value: any): string | null => {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim();
};

const safeDate = (value: any): Date | null => {
  if (!value) return null;

  try {
    const date = new Date(value);
    const year = date.getFullYear();
    if (Number.isNaN(year) || year < 1900 || year > 2100) {
      return null;
    }
    return date;
  } catch {
    return null;
  }
};

const mapTrackingEventsToHistory = (trackingEvents: any[] | undefined) => {
  if (!Array.isArray(trackingEvents)) return [];

  return trackingEvents.map((event) => ({
    status: safeString(event.status) || 'UNKNOWN',
    description: safeString(event.description) || 'Evento de rastreamento',
    date: safeDate(event.eventDate) || new Date(),
    city: safeString(event.city) || '',
    state: safeString(event.state) || '',
  }));
};

const getMovementDate = (order: any) => {
  const latestTrackingEvent = Array.isArray(order.trackingEvents)
    ? order.trackingEvents[0]
    : null;

  return (
    latestTrackingEvent?.eventDate ||
    order.shippingDate ||
    order.createdAt ||
    order.lastUpdate
  );
};

const formatOrderForResponse = (order: any) => ({
  ...order,
  orderNumber: String(order.orderNumber),
  status: order.status as OrderStatus,
  trackingHistory: mapTrackingEventsToHistory(order.trackingEvents),
  lastUpdate: getMovementDate(order),
});

export const importOrders = async (req: Request, res: Response) => {
  console.log('Importando pedidos em lote...');

  try {
    const { orders } = req.body;
    // @ts-ignore
    const user = req.user;

    if (!user || !user.companyId) {
      return res.status(403).json({
        error: 'Usuario nao vinculado a uma empresa. Contate o administrador.',
      });
    }

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'Nenhum pedido valido para importar' });
    }

    const { message, results } = await importOrdersForCompany(
      user.companyId,
      orders,
    );

    return res.json({
      success: true,
      message,
      results,
    });
  } catch (error) {
    console.error('Erro na importacao:', error);
    return res.status(500).json({
      error: 'Erro ao importar pedidos',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

export const getOrders = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const user = req.user;
    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'Acesso negado. Usuario sem empresa.' });
    }

    const orders = await prisma.order.findMany({
      where: { companyId: user.companyId },
      include: {
        trackingEvents: {
          orderBy: { eventDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(orders.map(formatOrderForResponse));
  } catch (error) {
    console.error('Erro ao buscar pedidos:', error);
    return res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (typeof id !== 'string') {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        carrier: true,
        trackingEvents: {
          orderBy: { eventDate: 'desc' },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido nao encontrado' });
    }

    return res.json(formatOrderForResponse(order));
  } catch (error) {
    console.error('Erro ao buscar pedido:', error);
    return res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
};

export const syncSingleOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // @ts-ignore
    const user = req.user;

    if (typeof id !== 'string') {
      return res.status(400).json({ error: 'ID invalido' });
    }

    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'Acesso negado. Usuario sem empresa.' });
    }

    const result = await trackingService.syncOrder(id, user.companyId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        carrier: true,
        trackingEvents: {
          orderBy: { eventDate: 'desc' },
        },
      },
    });

    return res.json({
      success: true,
      message: result.message,
      order: order ? formatOrderForResponse(order) : null,
    });
  } catch (error) {
    console.error('Erro ao sincronizar pedido:', error);
    return res.status(500).json({ error: 'Erro ao sincronizar pedido' });
  }
};

export const syncAllOrders = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const user = req.user;

    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'Acesso negado. Usuario sem empresa.' });
    }

    const startedAt = new Date().toISOString();
    const results = await trackingService.syncAllActive(user.companyId);
    syncJobService.ensureSchedule(user.companyId, user.id);

    let report: { reportUrl?: string; csvUrl?: string; recipients?: number } | null =
      null;

    try {
      report = await syncReportService.sendTrackingSyncReport({
        companyId: user.companyId,
        userId: user.id,
        trigger: 'manual',
        payload: results.report,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    } catch (reportError) {
      console.error('Erro ao enviar relatorio de sincronizacao:', reportError);
    }

    return res.json({
      success: true,
      message: `Sincronizacao concluida: ${results.success} sucessos, ${results.failed} falhas`,
      results,
      report,
      schedule: syncJobService.getSchedule(user.companyId),
    });
  } catch (error) {
    console.error('Erro ao sincronizar todos os pedidos:', error);
    return res.status(500).json({ error: 'Erro ao sincronizar pedidos' });
  }
};

export const startSyncAllOrders = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const user = req.user;

    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'Acesso negado. Usuario sem empresa.' });
    }

    const job = syncJobService.startJob(user.companyId, user.id);

    return res.json({
      success: true,
      message: 'Sincronizacao em andamento',
      job,
      schedule: syncJobService.getSchedule(user.companyId),
    });
  } catch (error) {
    console.error('Erro ao iniciar sincronizacao:', error);
    return res.status(500).json({ error: 'Erro ao iniciar sincronizacao' });
  }
};

export const getSyncAllStatus = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const user = req.user;

    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'Acesso negado. Usuario sem empresa.' });
    }

    syncJobService.ensureSchedule(user.companyId, user.id);

    return res.json({
      success: true,
      job: syncJobService.getJob(user.companyId),
      schedule: syncJobService.getSchedule(user.companyId),
    });
  } catch (error) {
    console.error('Erro ao obter status da sincronizacao:', error);
    return res.status(500).json({ error: 'Erro ao consultar status da sincronizacao' });
  }
};

export const clearOrdersDatabase = async (req: Request, res: Response) => {
  try {
    const { type, password } = req.body;

    if (password !== '172839') {
      return res.status(403).json({ error: 'Senha incorreta' });
    }

    if (type === 'ALL') {
      const result = await prisma.order.deleteMany({});
      return res.json({
        message: `Todos os ${result.count} pedidos e seus rastreios foram apagados.`,
      });
    }

    if (type === 'DELIVERED_7_DAYS') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const result = await prisma.order.deleteMany({
        where: {
          status: OrderStatus.DELIVERED,
          lastUpdate: {
            lt: sevenDaysAgo,
          },
        },
      });
      return res.json({
        message: `${result.count} pedidos entregues ha mais de 7 dias foram apagados.`,
      });
    }

    return res.status(400).json({ error: 'Tipo de limpeza invalido' });
  } catch (error) {
    console.error('Erro ao limpar banco de dados:', error);
    return res.status(500).json({ error: 'Erro ao limpar banco de dados' });
  }
};
