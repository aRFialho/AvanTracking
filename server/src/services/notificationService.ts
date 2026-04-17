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
  readAt?: Date | string | null;
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
const MONITORED_EMAIL_IMAGE_URL =
  process.env.MURICOCA_EMAIL_IMAGE_URL ||
  'https://res.cloudinary.com/dhqxp3tuo/image/upload/v1771249579/ChatGPT_Image_13_de_fev._de_2026_16_40_14_kldj3k.png';
const TERMINAL_MONITORED_STATUSES = new Set<OrderStatus>([
  OrderStatus.DELIVERED,
  OrderStatus.RETURNED,
  OrderStatus.CANCELED,
  OrderStatus.CHANNEL_LOGISTICS,
]);

type MonitoredWatchEvent =
  | 'ALL'
  | 'STATUS_CHANGE'
  | 'ENTERED_DELAY'
  | 'ENTERED_FAILURE'
  | 'DELIVERED'
  | 'CANCELED'
  | 'SHIPPED'
  | 'ROUTE';

const MONITORED_WATCH_EVENT_SET = new Set<MonitoredWatchEvent>([
  'ALL',
  'STATUS_CHANGE',
  'ENTERED_DELAY',
  'ENTERED_FAILURE',
  'DELIVERED',
  'CANCELED',
  'SHIPPED',
  'ROUTE',
]);

const MONITORED_WATCH_EVENT_LABELS: Record<MonitoredWatchEvent, string> = {
  ALL: 'Todos os eventos de status',
  STATUS_CHANGE: 'Mudanca de status',
  ENTERED_DELAY: 'Entrada em atraso',
  ENTERED_FAILURE: 'Falha na entrega',
  DELIVERED: 'Pedido entregue',
  CANCELED: 'Pedido cancelado',
  SHIPPED: 'Pedido despachado',
  ROUTE: 'Pedido em rota de entrega',
};

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

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeWatchEvents = (value: unknown): MonitoredWatchEvent[] => {
  const normalized = Array.isArray(value)
    ? value
        .map((item) => String(item || '').trim().toUpperCase())
        .filter((item) => MONITORED_WATCH_EVENT_SET.has(item as MonitoredWatchEvent))
    : [];

  const deduped = Array.from(new Set(normalized)) as MonitoredWatchEvent[];
  if (deduped.length === 0) {
    return ['ALL'];
  }

  if (deduped.includes('ALL')) {
    return ['ALL'];
  }

  return deduped;
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
    readAt: item.readAt ? safeDateString(item.readAt) : null,
    orderId: payload.orderId || null,
    orderNumber: payload.orderNumber || null,
    previousStatus: payload.previousStatus || null,
    currentStatus: payload.currentStatus || null,
  };
};

class NotificationService {
  async getFeed(companyId: string, limit = 40) {
    const db = prisma as any;

    const [generalRows, monitoredRows, monitoredOrders, monitoredOrderRows, monitoredHistoryRows] = await Promise.all([
      db.syncNotification.findMany({
        where: { companyId, category: 'GENERAL', readAt: null },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
      }),
      db.syncNotification.findMany({
        where: { companyId, category: 'MONITORED', readAt: null },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
      }),
      db.monitoredOrder.findMany({
        where: {
          companyId,
          order: {
            isArchived: false,
          },
        },
        select: { orderId: true },
      }),
      db.monitoredOrder.findMany({
        where: {
          companyId,
          order: {
            isArchived: false,
          },
        },
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
      db.syncNotification.findMany({
        where: { companyId, category: 'MONITORED' },
        orderBy: [{ createdAt: 'desc' }],
        take: Math.max(limit * 5, 100),
        select: {
          id: true,
          payload: true,
          createdAt: true,
        },
      }),
    ]);

    const activeMonitoredOrderRows = (Array.isArray(monitoredOrderRows) ? monitoredOrderRows : [])
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
      .filter(Boolean);

    const monitoredOrderFallbackRows = (Array.isArray(monitoredHistoryRows) ? monitoredHistoryRows : [])
      .map((item: any) => {
        const payload =
          item?.payload && typeof item.payload === 'object' ? item.payload : {};
        const orderId = String(payload.orderId || '').trim();
        const orderNumber = String(payload.orderNumber || '').trim();

        if (!orderId && !orderNumber) {
          return null;
        }

        const status = String(payload.currentStatus || payload.previousStatus || 'PENDING');
        const parsedStatus = Object.values(OrderStatus).includes(status as OrderStatus)
          ? (status as OrderStatus)
          : null;

        return {
          id: `notification-${String(item.id || '')}`,
          orderId,
          orderNumber,
          invoiceNumber: null as string | null,
          status,
          statusLabel: parsedStatus ? STATUS_LABELS[parsedStatus] : status,
          lastUpdate: safeDateString(item.createdAt),
          createdAt: safeDateString(item.createdAt),
        };
      })
      .filter(Boolean);

    const monitoredOrdersMap = new Map<string, any>();
    for (const item of activeMonitoredOrderRows) {
      const key = `${String(item.orderId || '').trim()}::${String(item.orderNumber || '').trim()}`;
      if (!key || key === '::') {
        continue;
      }
      monitoredOrdersMap.set(key, item);
    }
    for (const item of monitoredOrderFallbackRows) {
      const key = `${String(item.orderId || '').trim()}::${String(item.orderNumber || '').trim()}`;
      if (!key || key === '::' || monitoredOrdersMap.has(key)) {
        continue;
      }
      monitoredOrdersMap.set(key, item);
    }

    const mergedMonitoredOrders = Array.from(monitoredOrdersMap.values()).sort((left, right) => {
      const leftDate = new Date(String(left?.lastUpdate || left?.createdAt || 0)).getTime();
      const rightDate = new Date(String(right?.lastUpdate || right?.createdAt || 0)).getTime();
      return rightDate - leftDate;
    });

    return {
      general: (Array.isArray(generalRows) ? generalRows : []).map(toNotificationItem),
      monitored: (Array.isArray(monitoredRows) ? monitoredRows : []).map(toNotificationItem),
      monitoredOrderIds: (Array.isArray(monitoredOrders) ? monitoredOrders : [])
        .map((item: any) => String(item.orderId || ''))
        .filter(Boolean),
      monitoredOrders: mergedMonitoredOrders,
      unreadCount:
        (Array.isArray(generalRows) ? generalRows.length : 0) +
        (Array.isArray(monitoredRows) ? monitoredRows.length : 0),
    };
  }

  async markAllAsRead(companyId: string) {
    const db = prisma as any;
    const updated = await db.syncNotification.updateMany({
      where: {
        companyId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      updatedCount: Number(updated?.count || 0),
    };
  }

  async addMonitoredOrders(input: {
    companyId: string;
    createdById?: string | null;
    orderIds?: string[];
    identifiers?: string[];
    watchEvents?: string[];
  }) {
    const db = prisma as any;
    const hasExplicitWatchEvents =
      Array.isArray(input.watchEvents) && input.watchEvents.length > 0;
    const normalizedWatchEvents = hasExplicitWatchEvents
      ? normalizeWatchEvents(input.watchEvents)
      : null;

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
          isArchived: false,
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
          isArchived: false,
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
        isArchived: false,
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
        id: true,
        orderId: true,
      },
    });

    const existingOrderIdSet = new Set(
      (Array.isArray(existingRows) ? existingRows : [])
        .map((item: any) => String(item.orderId || ''))
        .filter(Boolean),
    );

    const toCreate = allCandidateOrderIds.filter((orderId) => !existingOrderIdSet.has(orderId));

    if (hasExplicitWatchEvents && existingRows.length > 0) {
      await Promise.all(
        existingRows.map((row: any) =>
          db.monitoredOrder.update({
            where: { id: row.id },
            data: { watchEvents: normalizedWatchEvents },
          }),
        ),
      );
    }

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
          watchEvents: normalizedWatchEvents || ['ALL'],
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
    const rows = await db.monitoredOrder.findMany({
      where: {
        companyId,
        order: {
          isArchived: false,
        },
      },
      select: { orderId: true },
    });

    return (Array.isArray(rows) ? rows : [])
      .map((item: any) => String(item.orderId || ''))
      .filter(Boolean);
  }

  async sendMonitoredEnrollmentEmail(input: {
    companyId: string;
    orderIds: string[];
    watchEvents?: string[];
    requestedByName?: string | null;
  }) {
    const normalizedOrderIds = Array.from(
      new Set(
        (Array.isArray(input.orderIds) ? input.orderIds : [])
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      ),
    );

    if (normalizedOrderIds.length === 0) {
      return { sent: false, reason: 'NO_ORDERS' as const };
    }

    const [company, recipients, orders] = await Promise.all([
      prisma.company.findUnique({
        where: { id: input.companyId },
        select: { name: true },
      }),
      this.resolveCompanyRecipients(input.companyId),
      prisma.order.findMany({
        where: {
          companyId: input.companyId,
          id: { in: normalizedOrderIds },
        },
        select: {
          id: true,
          orderNumber: true,
          invoiceNumber: true,
          trackingCode: true,
          customerName: true,
          salesChannel: true,
          freightType: true,
          status: true,
          estimatedDeliveryDate: true,
          carrierEstimatedDeliveryDate: true,
          city: true,
          state: true,
          isDelayed: true,
          lastUpdate: true,
        },
        orderBy: [{ lastUpdate: 'desc' }],
      }),
    ]);

    if (!recipients.length) {
      return { sent: false, reason: 'NO_RECIPIENTS' as const };
    }

    if (!orders.length) {
      return { sent: false, reason: 'NO_MATCHED_ORDERS' as const };
    }

    const companyName = String(company?.name || 'Sua empresa');
    const watchEvents = normalizeWatchEvents(input.watchEvents);
    const watchLabels = watchEvents.includes('ALL')
      ? [MONITORED_WATCH_EVENT_LABELS.ALL]
      : watchEvents.map((event) => MONITORED_WATCH_EVENT_LABELS[event]);
    const requestedByLabel = String(input.requestedByName || '').trim();
    const requestedByLine = requestedByLabel
      ? `<p style="margin:4px 0 0;font-size:13px;color:#64748b;">Solicitado por: <strong style="color:#0f172a;">${escapeHtml(requestedByLabel)}</strong></p>`
      : '';

    const orderRowsHtml = orders
      .map((order) => {
        const statusLabel =
          STATUS_LABELS[order.status as OrderStatus] || String(order.status || '-');
        const invoiceLabel = order.invoiceNumber ? String(order.invoiceNumber) : '-';
        const trackingLabel = order.trackingCode ? String(order.trackingCode) : '-';
        const carrierLabel = order.freightType ? String(order.freightType) : '-';
        const estimatedLabel = order.estimatedDeliveryDate
          ? new Date(order.estimatedDeliveryDate).toLocaleDateString('pt-BR')
          : '-';
        const carrierEstimatedLabel = order.carrierEstimatedDeliveryDate
          ? new Date(order.carrierEstimatedDeliveryDate).toLocaleDateString('pt-BR')
          : '-';

        return `
          <tr>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(String(order.orderNumber || '-'))}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(invoiceLabel)}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(trackingLabel)}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(String(order.customerName || '-'))}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(statusLabel)}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(carrierLabel)}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(String(order.city || '-'))} / ${escapeHtml(String(order.state || '-'))}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(estimatedLabel)}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(carrierEstimatedLabel)}</td>
          </tr>
        `;
      })
      .join('');

    const eventsHtml = watchLabels.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const subject = `Pedido monitorado pela Muricoca - ${companyName}`;
    const htmlContent = `
      <div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:28px;color:#0f172a;">
        <div style="max-width:900px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;">
          <div style="padding:26px 28px;background:linear-gradient(135deg,#0ea5e9 0%,#2563eb 70%);color:#ffffff;">
            <div style="display:flex;gap:16px;align-items:center;">
              <img src="${escapeHtml(MONITORED_EMAIL_IMAGE_URL)}" alt="Muricoca" style="width:72px;height:72px;border-radius:16px;object-fit:cover;border:2px solid rgba(255,255,255,0.35);" />
              <div>
                <h2 style="margin:0 0 8px;font-size:24px;line-height:1.2;">Pedido monitorado por mim</h2>
                <p style="margin:0;font-size:15px;line-height:1.6;">Pedido(s) monitorado(s) por mim, nao se preocupe, vou cuidar de tudo para voce.</p>
                ${requestedByLine}
              </div>
            </div>
          </div>
          <div style="padding:22px 28px;">
            <p style="margin:0 0 12px;font-size:14px;color:#334155;"><strong>Empresa:</strong> ${escapeHtml(companyName)}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Eventos monitorados:</strong></p>
            <ul style="margin:0 0 16px;padding-left:18px;color:#334155;">${eventsHtml}</ul>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:#eff6ff;color:#1e3a8a;text-align:left;">
                  <th style="padding:10px;border-bottom:1px solid #bfdbfe;">Pedido</th>
                  <th style="padding:10px;border-bottom:1px solid #bfdbfe;">NF</th>
                  <th style="padding:10px;border-bottom:1px solid #bfdbfe;">Codigo envio</th>
                  <th style="padding:10px;border-bottom:1px solid #bfdbfe;">Cliente</th>
                  <th style="padding:10px;border-bottom:1px solid #bfdbfe;">Status</th>
                  <th style="padding:10px;border-bottom:1px solid #bfdbfe;">Transportadora</th>
                  <th style="padding:10px;border-bottom:1px solid #bfdbfe;">Cidade/UF</th>
                  <th style="padding:10px;border-bottom:1px solid #bfdbfe;">Prev. plataforma</th>
                  <th style="padding:10px;border-bottom:1px solid #bfdbfe;">Prev. transportadora</th>
                </tr>
              </thead>
              <tbody>${orderRowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const textContent = [
      'Pedido monitorado pela Muricoca',
      `Empresa: ${companyName}`,
      'Pedido(s) monitorado(s) por mim, nao se preocupe, vou cuidar de tudo para voce.',
      `Eventos monitorados: ${watchLabels.join(', ')}`,
      '',
      ...orders.map((order) => {
        const statusLabel =
          STATUS_LABELS[order.status as OrderStatus] || String(order.status || '-');
        return `Pedido ${order.orderNumber} | NF ${order.invoiceNumber || '-'} | Status ${statusLabel} | Cliente ${order.customerName}`;
      }),
    ].join('\n');

    await sendBrevoEmail({
      to: recipients,
      subject,
      htmlContent,
      textContent,
    });

    return {
      sent: true,
      recipientCount: recipients.length,
      orderCount: orders.length,
    };
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
    const eventLines = input.events.map((event) => `<li>${escapeHtml(event)}</li>`).join('');
    const invoiceLine = input.invoiceNumber
      ? `<p><strong>NF:</strong> ${escapeHtml(input.invoiceNumber)}</p>`
      : '';
    const safeOrderNumber = escapeHtml(input.orderNumber);
    const safeCompanyName = escapeHtml(input.companyName);
    const safePreviousStatus = escapeHtml(input.previousStatus);
    const safeCurrentStatus = escapeHtml(input.currentStatus);

    return {
      subject: `Atualizacao de pedido monitorado #${input.orderNumber} - ${input.companyName}`,
      htmlContent: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;">
          <h2 style="margin:0 0 12px;">Pedido monitorado #${safeOrderNumber}</h2>
          ${invoiceLine}
          <p><strong>Empresa:</strong> ${safeCompanyName}</p>
          <p><strong>Status:</strong> ${safePreviousStatus} -> ${safeCurrentStatus}</p>
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
        watchEvents: true,
        order: {
          select: {
            invoiceNumber: true,
          },
        },
      },
    });

    const monitoredMetaByOrderId = new Map<
      string,
      {
        watchEvents: Set<MonitoredWatchEvent>;
        invoiceNumber: string | null;
      }
    >();

    for (const row of Array.isArray(monitoredRows) ? monitoredRows : []) {
      const orderId = String(row?.orderId || '').trim();
      if (!orderId) continue;

      monitoredMetaByOrderId.set(orderId, {
        watchEvents: new Set(normalizeWatchEvents(row?.watchEvents)),
        invoiceNumber: row?.order?.invoiceNumber
          ? String(row.order.invoiceNumber)
          : null,
      });
    }

    if (monitoredMetaByOrderId.size === 0) {
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
      const monitoredMeta = monitoredMetaByOrderId.get(change.orderId);
      if (!monitoredMeta) {
        continue;
      }

      const watchEvents = monitoredMeta.watchEvents;
      const shouldNotify = (event: MonitoredWatchEvent) =>
        watchEvents.has('ALL') || watchEvents.has(event);

      const orderLabel = String(change.orderNumber || '-');
      const previousStatusLabel = STATUS_LABELS[change.previousStatus] || change.previousStatus;
      const currentStatusLabel = STATUS_LABELS[change.currentStatus] || change.currentStatus;
      const detectedEvents: string[] = [];

      if (
        change.changed &&
        change.previousStatus !== change.currentStatus &&
        shouldNotify('STATUS_CHANGE')
      ) {
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

      if (change.enteredDelay && shouldNotify('ENTERED_DELAY')) {
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

      if (change.enteredFailure && shouldNotify('ENTERED_FAILURE')) {
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
        change.currentStatus === OrderStatus.DELIVERED &&
        shouldNotify('DELIVERED')
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
        change.currentStatus === OrderStatus.CANCELED &&
        shouldNotify('CANCELED')
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
        change.currentStatus === OrderStatus.SHIPPED &&
        shouldNotify('SHIPPED')
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
        (
          change.enteredRoute ||
          (
            change.previousStatus !== change.currentStatus &&
            change.currentStatus === OrderStatus.DELIVERY_ATTEMPT
          )
        ) &&
        shouldNotify('ROUTE')
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
          invoiceNumber: monitoredMeta.invoiceNumber,
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
