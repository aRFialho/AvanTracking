import { Request, Response } from 'express';
import { PrismaClient, OrderStatus } from '@prisma/client';
import { syncJobService } from '../services/syncJobService';
import { TrackingService } from '../services/trackingService';

const prisma = new PrismaClient();
const trackingService = new TrackingService();

const mapStatus = (status: string): OrderStatus => {
  const statusMap: Record<string, OrderStatus> = {
    PENDING: OrderStatus.PENDING,
    CREATED: OrderStatus.CREATED,
    SHIPPED: OrderStatus.SHIPPED,
    DELIVERY_ATTEMPT: OrderStatus.DELIVERY_ATTEMPT,
    DELIVERED: OrderStatus.DELIVERED,
    FAILURE: OrderStatus.FAILURE,
    RETURNED: OrderStatus.RETURNED,
    CANCELED: OrderStatus.CANCELED,
    CHANNEL_LOGISTICS: OrderStatus.CHANNEL_LOGISTICS,
  };

  return statusMap[status] || OrderStatus.PENDING;
};

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

const safeNumber = (value: any): number => {
  if (value === null || value === undefined || value === '') return 0;
  const num =
    typeof value === 'number'
      ? value
      : parseFloat(String(value).replace(/[^\d.-]/g, ''));

  return Number.isNaN(num) ? 0 : num;
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

const buildTrackingEventsData = (orderData: any, fallbackStatus: OrderStatus) => {
  const shippingDate = safeDate(orderData.shippingDate);
  const sourceHistory = Array.isArray(orderData.trackingHistory)
    ? orderData.trackingHistory
    : [];

  if (sourceHistory.length > 0) {
    return sourceHistory.map((event: any) => ({
      status: safeString(event.status) || fallbackStatus,
      description: safeString(event.description) || 'Evento de rastreamento',
      eventDate: safeDate(event.date) || shippingDate || new Date(),
      city: safeString(event.city),
      state: safeString(event.state),
    }));
  }

  const statusDescriptions: Record<string, string> = {
    PENDING: 'Pedido pendente de processamento',
    CREATED: 'Pedido criado',
    SHIPPED: 'Pedido enviado',
    DELIVERY_ATTEMPT: 'Tentativa de entrega',
    DELIVERED: 'Pedido entregue',
    FAILURE: 'Falha na entrega',
    RETURNED: 'Pedido devolvido',
    CANCELED: 'Pedido cancelado',
    CHANNEL_LOGISTICS: 'Logística gerenciada pelo canal de venda',
  };

  return [
    {
      status: fallbackStatus,
      description: statusDescriptions[fallbackStatus] || 'Status atualizado',
      eventDate: shippingDate || new Date(),
      city: safeString(orderData.city),
      state: safeString(orderData.state),
    },
  ];
};

const buildOrderData = (orderData: any, status: OrderStatus) => ({
  orderNumber: String(orderData.orderNumber),
  invoiceNumber: safeString(orderData.invoiceNumber),
  trackingCode: safeString(orderData.trackingCode),
  customerName: safeString(orderData.customerName) || 'Desconhecido',
  corporateName: safeString(orderData.corporateName),
  cpf: safeString(orderData.cpf),
  cnpj: safeString(orderData.cnpj),
  phone: safeString(orderData.phone),
  mobile: safeString(orderData.mobile),
  salesChannel: safeString(orderData.salesChannel) || 'Não identificado',
  freightType: safeString(orderData.freightType) || 'Aguardando',
  freightValue: safeNumber(orderData.freightValue),
  shippingDate: safeDate(orderData.shippingDate),
  address: safeString(orderData.address) || '',
  number: safeString(orderData.number) || '',
  complement: safeString(orderData.complement),
  neighborhood: safeString(orderData.neighborhood) || '',
  city: safeString(orderData.city) || '',
  state: safeString(orderData.state) || '',
  zipCode: safeString(orderData.zipCode) || '',
  totalValue: safeNumber(orderData.totalValue),
  recipient: safeString(orderData.recipient),
  maxShippingDeadline: safeDate(orderData.maxShippingDeadline),
  estimatedDeliveryDate: safeDate(orderData.estimatedDeliveryDate),
  status,
  isDelayed: Boolean(orderData.isDelayed),
});

export const importOrders = async (req: Request, res: Response) => {
  console.log('📦 Iniciando importação em lote...');

  try {
    const { orders } = req.body;
    // @ts-ignore
    const user = req.user;

    if (!user || !user.companyId) {
      return res
        .status(403)
        .json({ error: 'Usuário não vinculado a uma empresa. Contate o administrador.' });
    }

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'Nenhum pedido válido para importar' });
    }

    const companyId = user.companyId;
    console.log(`📊 Recebidos ${orders.length} pedidos para a empresa ${companyId}`);

    const orderNumbers = orders
      .map((order) => safeString(order?.orderNumber))
      .filter((value): value is string => Boolean(value));

    const existingOrders = await prisma.order.findMany({
      where: {
        companyId,
        orderNumber: { in: orderNumbers },
      },
      select: {
        id: true,
        orderNumber: true,
        _count: {
          select: {
            trackingEvents: true,
          },
        },
      },
    });

    const existingMap = new Map(existingOrders.map((order) => [order.orderNumber, order]));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let totalTrackingEvents = 0;

    for (const orderData of orders) {
      const orderNumber = safeString(orderData?.orderNumber);
      if (!orderNumber) {
        skipped += 1;
        continue;
      }

      const status = mapStatus(String(orderData.status || 'PENDING'));
      const orderPayload = buildOrderData(orderData, status);
      const trackingEventsData = buildTrackingEventsData(orderData, status);
      const existing = existingMap.get(orderNumber);

      if (existing) {
        await prisma.order.update({
          where: { id: existing.id },
          data: orderPayload,
        });

        if (existing._count.trackingEvents === 0 && trackingEventsData.length > 0) {
          await prisma.trackingEvent.createMany({
            data: trackingEventsData.map((event) => ({
              ...event,
              orderId: existing.id,
            })),
          });
          totalTrackingEvents += trackingEventsData.length;
        }

        updated += 1;
        continue;
      }

      await prisma.order.create({
        data: {
          companyId,
          ...orderPayload,
          trackingEvents: {
            create: trackingEventsData,
          },
        },
      });

      created += 1;
      totalTrackingEvents += trackingEventsData.length;
    }

    const message =
      `Importação concluída: ${created} criados, ${updated} atualizados, ` +
      `${skipped} ignorados, ${totalTrackingEvents} evento(s) iniciais de rastreio.`;
    console.log(`🎉 ${message}`);

    return res.json({
      success: true,
      message,
      results: {
        created,
        updated,
        skipped,
        totalTrackingEvents,
        errors: [],
      },
    });
  } catch (error) {
    console.error('❌ Erro na importação:', error);
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
      return res.status(403).json({ error: 'Acesso negado. Usuário sem empresa.' });
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
      return res.status(400).json({ error: 'ID inválido' });
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
      return res.status(404).json({ error: 'Pedido não encontrado' });
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
      return res.status(400).json({ error: 'ID inválido' });
    }

    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'Acesso negado. Usuário sem empresa.' });
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
      return res.status(403).json({ error: 'Acesso negado. Usuário sem empresa.' });
    }

    const results = await trackingService.syncAllActive(user.companyId);
    syncJobService.ensureSchedule(user.companyId, user.id);

    return res.json({
      success: true,
      message: `Sincronização concluída: ${results.success} sucessos, ${results.failed} falhas`,
      results,
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
      return res.status(403).json({ error: 'Acesso negado. Usuário sem empresa.' });
    }

    const job = syncJobService.startJob(user.companyId, user.id);

    return res.json({
      success: true,
      message: 'Sincronização em andamento',
      job,
      schedule: syncJobService.getSchedule(user.companyId),
    });
  } catch (error) {
    console.error('Erro ao iniciar sincronização:', error);
    return res.status(500).json({ error: 'Erro ao iniciar sincronização' });
  }
};

export const getSyncAllStatus = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const user = req.user;

    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'Acesso negado. Usuário sem empresa.' });
    }

    syncJobService.ensureSchedule(user.companyId, user.id);

    return res.json({
      success: true,
      job: syncJobService.getJob(user.companyId),
      schedule: syncJobService.getSchedule(user.companyId),
    });
  } catch (error) {
    console.error('Erro ao obter status da sincronização:', error);
    return res.status(500).json({ error: 'Erro ao consultar status da sincronização' });
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
      return res.json({ message: `Todos os ${result.count} pedidos e seus rastreios foram apagados.` });
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
      return res.json({ message: `${result.count} pedidos entregues há mais de 7 dias foram apagados.` });
    }

    return res.status(400).json({ error: 'Tipo de limpeza inválido' });
  } catch (error) {
    console.error('Erro ao limpar banco de dados:', error);
    return res.status(500).json({ error: 'Erro ao limpar banco de dados' });
  }
};
