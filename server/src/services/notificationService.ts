import { OrderStatus } from '@prisma/client';
import type {
  SyncOrderChangeReport,
  TrackingSyncReportPayload,
} from '../types/syncReport';
import { prisma } from '../lib/prisma';
import { sendBrevoEmail, type BrevoRecipient } from './emailTransportService';

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pendente',
  CREATED: 'Criado',
  SHIPPED: 'Em transito',
  DELIVERY_ATTEMPT: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  FAILURE: 'Falha na entrega',
  RETURNED: 'Devolvido',
  CANCELED: 'Cancelado',
  CHANNEL_LOGISTICS: 'Logistica do canal',
};

type NotificationCategory = 'GENERAL' | 'MONITORED';

type NotificationRecord = {
  id: string;
  category: NotificationCategory;
  type: string;
  title: string;
  message: string;
  createdAt: Date | string;
  payload?: any;
};

type RegisterTrackingSyncInput = {
  companyId: string;
  payload: TrackingSyncReportPayload;
  reportId?: string | null;
  reportUrl?: string | null;
  csvUrl?: string | null;
  finishedAt: string;
};

const MAX_MONITORED_ORDERS_PER_COMPANY = 10;
const TERMINAL_MONITORED_STATUSES = new Set<OrderStatus>([
  OrderStatus.DELIVERED,
  OrderStatus.FAILURE,
  OrderStatus.RETURNED,
  OrderStatus.CANCELED,
  OrderStatus.CHANNEL_LOGISTICS,
]);

const normalizeIdentifier = (value: unknown) => String(value || '').trim();

const normalizeDigits = (value: unknown) =>
  String(value || '')
    .replace(/\D/g, '')
    .trim();

const normalizeAlphaNumeric = (value: unknown) =>
  String(value || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .trim();

const safeDateString = (value: unknown) => {
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const toNotificationItem = (item: NotificationRecord) => {
  const payload = item?.payload && typeof item.payload === 'object' ? item.payload : {};

  return {
    id: String(item.id),
    category: item.category,
    type: String(item.type || ''),
    title: String(item.title || ''),
    message: String(item.message || ''),
    createdAt: safeDateString(item.createdAt),
    reportId: payload.reportId || null,
    reportUrl: payload.reportUrl || null,
    csvUrl: payload.csvUrl || null,
    deliveredCount: Number(payload.deliveredCount || 0),
    enteredDelayCount: Number(payload.enteredDelayCount || 0),
    enteredFailureCount: Number(payload.enteredFailureCount || 0),
    orderId: payload.orderId || null,
    orderNumber: payload.orderNumber || null,
    previousStatus: payload.previousStatus || null,
    currentStatus: payload.currentStatus || null,
  };
};

class NotificationService {
  async getFeed(companyId: string, limit = 40) {
    const db = prisma as any;
    await this.releaseClosedMonitoredOrders(companyId);

    const [generalRows, monitoredRows, monitoredOrders, monitoredOrderRows] = await Promise.all([
      db.syncNotification.findMany({
        where: { companyId, category: 'GENERAL' },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
      }),
      db.syncNotification.findMany({
        where: { companyId, category: 'MONITORED' },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
      }),
      db.monitoredOrder.findMany({
        where: { companyId },
        select: { orderId: true },
      }),
      db.monitoredOrder.findMany({
        where: { companyId },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              invoiceNumber: true,
              status: true,
              lastUpdate: true,
            },
          },
        },
      }),
    ]);

    return {
      general: (Array.isArray(generalRows) ? generalRows : []).map(toNotificationItem),
      monitored: (Array.isArray(monitoredRows) ? monitoredRows : []).map(toNotificationItem),
      monitoredOrderIds: (Array.isArray(monitoredOrders) ? monitoredOrders : [])
        .map((item: any) => String(item.orderId || ''))
        .filter(Boolean),
      monitoredOrders: (Array.isArray(monitoredOrderRows) ? monitoredOrderRows : [])
        .map((item: any) => {
          const order = item?.order;
          if (!order?.id) return null;

          return {
            id: String(item.id || ''),
            orderId: String(order.id),
            orderNumber: String(order.orderNumber || ''),
            invoiceNumber: order.invoiceNumber ? String(order.invoiceNumber) : null,
            status: String(order.status || ''),
            statusLabel: STATUS_LABELS[order.status as OrderStatus] || String(order.status || ''),
            lastUpdate: safeDateString(order.lastUpdate),
            createdAt: safeDateString(item.createdAt),
          };
        })
        .filter(Boolean),
    };
  }

  async addMonitoredOrders(input: {
    companyId: string;
    createdById?: string | null;
    orderIds?: string[];
    identifiers?: string[];
  }) {
    const db = prisma as any;
    await this.releaseClosedMonitoredOrders(input.companyId);

    const candidateOrderIds = new Set<string>();
    const notFoundIdentifiers: string[] = [];
    const normalizedIdentifiers = Array.from(
      new Set(
        (Array.isArray(input.identifiers) ? input.identifiers : [])
          .map((item) => normalizeIdentifier(item))
          .filter(Boolean),
      ),
    );

    const normalizedOrderIds = Array.from(
      new Set(
        (Array.isArray(input.orderIds) ? input.orderIds : [])
          .map((item) => normalizeIdentifier(item))
          .filter(Boolean),
      ),
    );

    if (normalizedOrderIds.length > 0) {
      const ordersById = await db.order.findMany({
        where: {
          companyId: input.companyId,
          id: { in: normalizedOrderIds },
        },
        select: { id: true },
      });

      for (const item of ordersById) {
        if (item?.id) {
          candidateOrderIds.add(String(item.id));
        }
      }
    }

    for (const identifier of normalizedIdentifiers) {
      const digits = normalizeDigits(identifier);
      const alphaNumeric = normalizeAlphaNumeric(identifier);
      const match = await db.order.findFirst({
        where: {
          companyId: input.companyId,
          OR: [
            { orderNumber: identifier },
            ...(digits ? [{ orderNumber: digits }] : []),
            ...(digits ? [{ invoiceNumber: digits }] : []),
            ...(digits ? [{ trackingCode: digits }] : []),
            ...(alphaNumeric ? [{ trackingCode: alphaNumeric }] : []),
          ],
        },
        select: {
          id: true,
        },
        orderBy: [{ lastUpdate: 'desc' }],
      });

      if (match?.id) {
        candidateOrderIds.add(String(match.id));
      } else {
        notFoundIdentifiers.push(identifier);
      }
    }

    const allCandidateOrderIds = Array.from(candidateOrderIds);
    if (allCandidateOrderIds.length === 0) {
      const monitoredIds = await this.getMonitoredOrderIds(input.companyId);
      return {
        addedOrders: [] as Array<{ id: string; orderNumber: string; invoiceNumber: string | null; label: string }>,
        alreadyMonitoredOrders: [] as Array<{ id: string; orderNumber: string; invoiceNumber: string | null; label: string }>,
        notFoundIdentifiers,
        monitoredOrderIds: monitoredIds,
      };
    }

    const orderDetails = await db.order.findMany({
      where: {
        companyId: input.companyId,
        id: { in: allCandidateOrderIds },
      },
      select: {
        id: true,
        orderNumber: true,
        invoiceNumber: true,
      },
    });

    const detailsById = new Map(
      (Array.isArray(orderDetails) ? orderDetails : []).map((item: any) => [
        String(item.id),
        {
          id: String(item.id),
          orderNumber: String(item.orderNumber || ''),
          invoiceNumber: item.invoiceNumber ? String(item.invoiceNumber) : null,
          label: item.invoiceNumber
            ? `Pedido ${item.orderNumber} / NF ${item.invoiceNumber}`
            : `Pedido ${item.orderNumber}`,
        },
      ]),
    );

    const existingRows = await db.monitoredOrder.findMany({
      where: {
        companyId: input.companyId,
        orderId: { in: allCandidateOrderIds },
      },
      select: {
        orderId: true,
      },
    });

    const existingOrderIdSet = new Set(
      (Array.isArray(existingRows) ? existingRows : [])
        .map((item: any) => String(item.orderId || ''))
        .filter(Boolean),
    );

    const toCreate = allCandidateOrderIds.filter((orderId) => !existingOrderIdSet.has(orderId));
    const currentMonitoredCount = await db.monitoredOrder.count({
      where: { companyId: input.companyId },
    });
    const availableSlots = Math.max(
      0,
      MAX_MONITORED_ORDERS_PER_COMPANY - Number(currentMonitoredCount || 0),
    );
    const limitedToCreate = toCreate.slice(0, availableSlots);
    const limitExceededOrders = toCreate
      .slice(availableSlots)
      .map((orderId) => detailsById.get(orderId))
      .filter(Boolean);

    if (limitedToCreate.length > 0) {
      await db.monitoredOrder.createMany({
        data: limitedToCreate.map((orderId) => ({
          companyId: input.companyId,
          orderId,
          createdById: input.createdById || null,
        })),
        skipDuplicates: true,
      });
    }

    const monitoredOrderIds = await this.getMonitoredOrderIds(input.companyId);

    return {
      addedOrders: limitedToCreate
        .map((orderId) => detailsById.get(orderId))
        .filter(Boolean),
      alreadyMonitoredOrders: allCandidateOrderIds
        .filter((orderId) => existingOrderIdSet.has(orderId))
        .map((orderId) => detailsById.get(orderId))
        .filter(Boolean),
      limitExceededOrders,
      maxMonitoredOrders: MAX_MONITORED_ORDERS_PER_COMPANY,
      availableSlotsAfter:
        MAX_MONITORED_ORDERS_PER_COMPANY - monitoredOrderIds.length,
      notFoundIdentifiers,
      monitoredOrderIds,
    };
  }

  async removeMonitoredOrder(companyId: string, orderId: string) {
    const db = prisma as any;

    await db.monitoredOrder.deleteMany({
      where: {
        companyId,
        orderId,
      },
    });

    return this.getMonitoredOrderIds(companyId);
  }

  async getMonitoredOrderIds(companyId: string) {
    const db = prisma as any;
    await this.releaseClosedMonitoredOrders(companyId);
    const rows = await db.monitoredOrder.findMany({
      where: { companyId },
      select: { orderId: true },
    });

    return (Array.isArray(rows) ? rows : [])
      .map((item: any) => String(item.orderId || ''))
      .filter(Boolean);
  }

  async registerTrackingSyncNotifications(input: RegisterTrackingSyncInput) {
    const db = prisma as any;

    const deliveredCount = input.payload.changes.filter((change) => change.enteredDelivered).length;
    const enteredDelayCount = input.payload.changes.filter((change) => change.enteredDelay).length;
    const enteredFailureCount = input.payload.changes.filter((change) => change.enteredFailure).length;

    const summaryMessage =
      `Entregues: ${deliveredCount} | Entraram em atraso: ${enteredDelayCount} | ` +
      `Entraram em falha: ${enteredFailureCount}`;

    await db.syncNotification.create({
      data: {
        companyId: input.companyId,
        category: 'GENERAL',
        type: 'TRACKING_SYNC_SUMMARY',
        title: 'Resumo da sincronizacao',
        message: summaryMessage,
        payload: {
          reportId: input.reportId || null,
          reportUrl: input.reportUrl || null,
          csvUrl: input.csvUrl || null,
          deliveredCount,
          enteredDelayCount,
          enteredFailureCount,
          success: Number(input.payload.success || 0),
          failed: Number(input.payload.failed || 0),
          finishedAt: input.finishedAt,
        },
      },
    });

    await this.createMonitoredOrderNotifications(input.companyId, input.payload.changes);
  }

  async registerMonitoredOrderChanges(
    companyId: string,
    changes: SyncOrderChangeReport[],
  ) {
    await this.createMonitoredOrderNotifications(companyId, changes);
  }

  private async releaseClosedMonitoredOrders(companyId: string) {
    const db = prisma as any;

    await db.monitoredOrder.deleteMany({
      where: {
        companyId,
        order: {
          status: {
            in: Array.from(TERMINAL_MONITORED_STATUSES),
          },
        },
      },
    });
  }

  private async resolveCompanyRecipients(companyId: string): Promise<BrevoRecipient[]> {
    const users = await prisma.user.findMany({
      where: { companyId },
      select: {
        email: true,
        name: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const recipientsMap = new Map<string, BrevoRecipient>();

    for (const user of users) {
      const email = String(user.email || '').trim();
      const normalizedEmail = email.toLowerCase();
      if (!normalizedEmail) continue;

      recipientsMap.set(normalizedEmail, {
        email,
        name: String(user.name || email).trim(),
      });
    }

    return Array.from(recipientsMap.values());
  }

  private buildMonitoredEventEmail(input: {
    companyName: string;
    orderNumber: string;
    invoiceNumber: string | null;
    events: string[];
    previousStatus: string;
    currentStatus: string;
  }) {
    const eventLines = input.events.map((event) => `<li>${event}</li>`).join('');
    const invoiceLine = input.invoiceNumber ? `<p><strong>NF:</strong> ${input.invoiceNumber}</p>` : '';

    return {
      subject: `Atualizacao de pedido monitorado #${input.orderNumber} - ${input.companyName}`,
      htmlContent: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;">
          <h2 style="margin:0 0 12px;">Pedido monitorado #${input.orderNumber}</h2>
          ${invoiceLine}
          <p><strong>Status:</strong> ${input.previousStatus} -> ${input.currentStatus}</p>
          <p><strong>Eventos detectados:</strong></p>
          <ul>${eventLines}</ul>
        </div>
      `,
      textContent: [
        `Pedido monitorado #${input.orderNumber}`,
        ...(input.invoiceNumber ? [`NF: ${input.invoiceNumber}`] : []),
        `Status: ${input.previousStatus} -> ${input.currentStatus}`,
        'Eventos detectados:',
        ...input.events.map((event) => `- ${event}`),
      ].join('\n'),
    };
  }

  private async createMonitoredOrderNotifications(
    companyId: string,
    changes: SyncOrderChangeReport[],
  ) {
    const db = prisma as any;
    const candidateChanges = Array.isArray(changes)
      ? changes.filter((item) => Boolean(item?.orderId))
      : [];

    if (candidateChanges.length === 0) {
      return;
    }

    const monitoredRows = await db.monitoredOrder.findMany({
      where: {
        companyId,
        orderId: {
          in: candidateChanges.map((item) => item.orderId),
        },
      },
      select: {
        orderId: true,
      },
    });

    const monitoredOrderIdSet = new Set(
      (Array.isArray(monitoredRows) ? monitoredRows : [])
        .map((item: any) => String(item.orderId || ''))
        .filter(Boolean),
    );

    if (monitoredOrderIdSet.size === 0) {
      return;
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const companyName = String(company?.name || 'Empresa');
    const recipients = await this.resolveCompanyRecipients(companyId);
    const monitoredOrderIdsToRelease = new Set<string>();

    const notificationInputs: Array<{
      type: string;
      title: string;
      message: string;
      payload: Record<string, unknown>;
    }> = [];

    for (const change of candidateChanges) {
      if (!monitoredOrderIdSet.has(change.orderId)) {
        continue;
      }

      const orderLabel = String(change.orderNumber || '-');
      const previousStatusLabel = STATUS_LABELS[change.previousStatus] || change.previousStatus;
      const currentStatusLabel = STATUS_LABELS[change.currentStatus] || change.currentStatus;
      const detectedEvents: string[] = [];

      if (change.changed && change.previousStatus !== change.currentStatus) {
        detectedEvents.push(
          `Status alterado de ${previousStatusLabel} para ${currentStatusLabel}.`,
        );
        notificationInputs.push({
          type: 'MONITORED_ORDER_STATUS_CHANGE',
          title: `Pedido monitorado #${orderLabel}`,
          message: `Pedido ${orderLabel} teve seu status alterado de ${previousStatusLabel} para ${currentStatusLabel}.`,
          payload: {
            orderId: change.orderId,
            orderNumber: orderLabel,
            previousStatus: change.previousStatus,
            currentStatus: change.currentStatus,
          },
        });
      }

      if (change.enteredDelay) {
        detectedEvents.push('Pedido entrou em atraso.');
        notificationInputs.push({
          type: 'MONITORED_ORDER_ENTERED_DELAY',
          title: `Pedido monitorado #${orderLabel}`,
          message: `Pedido ${orderLabel} entrou em atraso.`,
          payload: {
            orderId: change.orderId,
            orderNumber: orderLabel,
            previousStatus: change.previousStatus,
            currentStatus: change.currentStatus,
          },
        });
      }

      if (change.enteredFailure) {
        detectedEvents.push('Pedido entrou em falha na entrega.');
        notificationInputs.push({
          type: 'MONITORED_ORDER_ENTERED_FAILURE',
          title: `Pedido monitorado #${orderLabel}`,
          message: `Pedido ${orderLabel} entrou em falha na entrega.`,
          payload: {
            orderId: change.orderId,
            orderNumber: orderLabel,
            previousStatus: change.previousStatus,
            currentStatus: change.currentStatus,
          },
        });
      }

      if (
        change.previousStatus !== change.currentStatus &&
        change.currentStatus === OrderStatus.DELIVERED
      ) {
        detectedEvents.push('Pedido foi entregue.');
        notificationInputs.push({
          type: 'MONITORED_ORDER_DELIVERED',
          title: `Pedido monitorado #${orderLabel}`,
          message: `Pedido ${orderLabel} foi entregue.`,
          payload: {
            orderId: change.orderId,
            orderNumber: orderLabel,
            previousStatus: change.previousStatus,
            currentStatus: change.currentStatus,
          },
        });
      }

      if (
        change.previousStatus !== change.currentStatus &&
        change.currentStatus === OrderStatus.CANCELED
      ) {
        detectedEvents.push('Pedido foi cancelado.');
        notificationInputs.push({
          type: 'MONITORED_ORDER_CANCELED',
          title: `Pedido monitorado #${orderLabel}`,
          message: `Pedido ${orderLabel} foi cancelado.`,
          payload: {
            orderId: change.orderId,
            orderNumber: orderLabel,
            previousStatus: change.previousStatus,
            currentStatus: change.currentStatus,
          },
        });
      }

      if (
        change.previousStatus !== change.currentStatus &&
        change.currentStatus === OrderStatus.SHIPPED
      ) {
        detectedEvents.push('Pedido foi despachado.');
        notificationInputs.push({
          type: 'MONITORED_ORDER_SHIPPED',
          title: `Pedido monitorado #${orderLabel}`,
          message: `Pedido ${orderLabel} foi despachado.`,
          payload: {
            orderId: change.orderId,
            orderNumber: orderLabel,
            previousStatus: change.previousStatus,
            currentStatus: change.currentStatus,
          },
        });
      }

      if (
        change.enteredRoute ||
        (
          change.previousStatus !== change.currentStatus &&
          change.currentStatus === OrderStatus.DELIVERY_ATTEMPT
        )
      ) {
        detectedEvents.push('Pedido entrou em rota de entrega.');
        notificationInputs.push({
          type: 'MONITORED_ORDER_ROUTE',
          title: `Pedido monitorado #${orderLabel}`,
          message: `Pedido ${orderLabel} entrou em rota de entrega.`,
          payload: {
            orderId: change.orderId,
            orderNumber: orderLabel,
            previousStatus: change.previousStatus,
            currentStatus: change.currentStatus,
          },
        });
      }

      if (TERMINAL_MONITORED_STATUSES.has(change.currentStatus)) {
        monitoredOrderIdsToRelease.add(change.orderId);
      }

      if (detectedEvents.length > 0 && recipients.length > 0) {
        const emailInput = this.buildMonitoredEventEmail({
          companyName,
          orderNumber: orderLabel,
          invoiceNumber: null,
          events: detectedEvents,
          previousStatus: previousStatusLabel,
          currentStatus: currentStatusLabel,
        });

        try {
          await sendBrevoEmail({
            to: recipients,
            subject: emailInput.subject,
            htmlContent: emailInput.htmlContent,
            textContent: emailInput.textContent,
          });
        } catch (emailError) {
          console.error(
            `Falha ao enviar e-mail do pedido monitorado ${orderLabel}:`,
            emailError,
          );
        }
      }
    }

    if (notificationInputs.length === 0) {
      if (monitoredOrderIdsToRelease.size > 0) {
        await db.monitoredOrder.deleteMany({
          where: {
            companyId,
            orderId: {
              in: Array.from(monitoredOrderIdsToRelease),
            },
          },
        });
      }
      return;
    }

    await db.syncNotification.createMany({
      data: notificationInputs.map((item) => ({
        companyId,
        category: 'MONITORED',
        type: item.type,
        title: item.title,
        message: item.message,
        payload: item.payload,
      })),
    });

    if (monitoredOrderIdsToRelease.size > 0) {
      await db.monitoredOrder.deleteMany({
        where: {
          companyId,
          orderId: {
            in: Array.from(monitoredOrderIdsToRelease),
          },
        },
      });
    }
  }
}

export const notificationService = new NotificationService();
