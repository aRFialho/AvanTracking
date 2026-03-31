import { PrismaClient, OrderStatus } from '@prisma/client';
import { isExcludedPlatformFreight } from '../utils/orderExclusion';
import type { TraySyncOrderReport } from '../types/syncReport';

const prisma = new PrismaClient();

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

const isActiveDelayedByCarrier = (
  status: OrderStatus,
  carrierEstimatedDeliveryDate: Date | null,
) => {
  const closedStatuses: OrderStatus[] = [
    OrderStatus.DELIVERED,
    OrderStatus.FAILURE,
    OrderStatus.RETURNED,
    OrderStatus.CANCELED,
    OrderStatus.CHANNEL_LOGISTICS,
  ];

  return Boolean(
    carrierEstimatedDeliveryDate &&
      !closedStatuses.includes(status) &&
      new Date() > carrierEstimatedDeliveryDate,
  );
};

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
    CHANNEL_LOGISTICS: 'Logistica gerenciada pelo canal de venda',
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

const buildOrderData = (orderData: any, status: OrderStatus) => {
  const carrierEstimatedDeliveryDate = safeDate(orderData.carrierEstimatedDeliveryDate);

  return {
  orderNumber: String(orderData.orderNumber),
  invoiceNumber: safeString(orderData.invoiceNumber),
  trackingCode: safeString(orderData.trackingCode),
  customerName: safeString(orderData.customerName) || 'Desconhecido',
  corporateName: safeString(orderData.corporateName),
  cpf: safeString(orderData.cpf),
  cnpj: safeString(orderData.cnpj),
  phone: safeString(orderData.phone),
  mobile: safeString(orderData.mobile),
  salesChannel: safeString(orderData.salesChannel) || 'Nao identificado',
  freightType: safeString(orderData.freightType) || 'Aguardando',
  freightValue: safeNumber(orderData.freightValue),
  quotedFreightValue:
    orderData.quotedFreightValue === null || orderData.quotedFreightValue === undefined
      ? null
      : safeNumber(orderData.quotedFreightValue),
  quotedFreightDate: safeDate(orderData.quotedFreightDate),
  quotedFreightDetails: orderData.quotedFreightDetails ?? null,
  originalQuotedFreightValue:
    orderData.originalQuotedFreightValue === null ||
    orderData.originalQuotedFreightValue === undefined
      ? null
      : safeNumber(orderData.originalQuotedFreightValue),
  originalQuotedFreightDate: safeDate(orderData.originalQuotedFreightDate),
  originalQuotedFreightDetails: orderData.originalQuotedFreightDetails ?? null,
  originalQuotedFreightQuotationId: safeString(
    orderData.originalQuotedFreightQuotationId,
  ),
  recalculatedFreightValue:
    orderData.recalculatedFreightValue === null ||
    orderData.recalculatedFreightValue === undefined
      ? null
      : safeNumber(orderData.recalculatedFreightValue),
  recalculatedFreightDate: safeDate(orderData.recalculatedFreightDate),
  recalculatedFreightDetails: orderData.recalculatedFreightDetails ?? null,
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
  carrierEstimatedDeliveryDate,
  status,
  isDelayed: isActiveDelayedByCarrier(status, carrierEstimatedDeliveryDate),
  apiRawPayload: orderData.apiRawPayload ?? null,
  };
};

const buildTraySyncOrderReport = (
  orderId: string | null,
  orderPayload: ReturnType<typeof buildOrderData>,
): TraySyncOrderReport => ({
  orderId,
  orderNumber: orderPayload.orderNumber,
  customerName: orderPayload.customerName,
  trackingCode: orderPayload.trackingCode,
  salesChannel: orderPayload.salesChannel,
  freightType: orderPayload.freightType,
  status: orderPayload.status,
  shippingDate: orderPayload.shippingDate?.toISOString() || null,
  estimatedDeliveryDate: orderPayload.estimatedDeliveryDate?.toISOString() || null,
  carrierEstimatedDeliveryDate:
    orderPayload.carrierEstimatedDeliveryDate?.toISOString() || null,
  totalValue: orderPayload.totalValue,
  isDelayed: orderPayload.isDelayed,
});

export const importOrdersForCompany = async (companyId: string, orders: any[]) => {
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new Error('Nenhum pedido valido para importar');
  }

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

  const existingMap = new Map(
    existingOrders.map((order) => [order.orderNumber, order]),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let totalTrackingEvents = 0;
  const createdOrders: TraySyncOrderReport[] = [];
  const updatedOrders: TraySyncOrderReport[] = [];

  for (const orderData of orders) {
    const orderNumber = safeString(orderData?.orderNumber);
    if (!orderNumber) {
      skipped += 1;
      continue;
    }

    if (isExcludedPlatformFreight(orderData?.freightType)) {
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
      updatedOrders.push(buildTraySyncOrderReport(existing.id, orderPayload));
      continue;
    }

    const createdOrder = await prisma.order.create({
      data: {
        companyId,
        ...orderPayload,
        trackingEvents: {
          create: trackingEventsData,
        },
      },
      select: {
        id: true,
      },
    });

    created += 1;
    totalTrackingEvents += trackingEventsData.length;
    createdOrders.push(buildTraySyncOrderReport(createdOrder.id, orderPayload));
  }

  const message =
    `Importacao concluida: ${created} criados, ${updated} atualizados, ` +
    `${skipped} ignorados, ${totalTrackingEvents} evento(s) iniciais de rastreio.`;

  return {
    message,
    results: {
      created,
      updated,
      skipped,
      totalTrackingEvents,
      errors: [] as string[],
      createdOrders,
      updatedOrders,
    },
  };
};
