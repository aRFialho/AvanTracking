import { PrismaClient, OrderStatus } from '@prisma/client';
import type {
  SyncOrderChangeReport,
  SyncReportSnapshot,
  TrackingSyncReportPayload,
} from '../types/syncReport';
import { normalizeExcludedPlatformFreight } from '../utils/orderExclusion';
import { sswTrackingService } from './sswTrackingService';

const prisma = new PrismaClient();

const INTELIPOST_API_URL = 'https://tracking-graphql.intelipost.com.br/';
const DEFAULT_CLIENT_ID = '40115';
const ROUTE_STATUSES: OrderStatus[] = [
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERY_ATTEMPT,
];
const FINALIZED_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.FAILURE,
  OrderStatus.RETURNED,
  OrderStatus.CANCELED,
];

const INTELIPOST_QUERY = `
query ($clientId: ID, $orderNumber: String, $orderHash: String) {
  trackingStatus(clientId: $clientId, orderNumber: $orderNumber, orderHash: $orderHash) {
    client {
      id
    }
    order {
      order_number
    }
    tracking {
      status
      status_label
      estimated_delivery_date_lp
      history {
        event_date
        status_label
        provider_message
        macro_state { code }
      }
    }
    logistic_provider {
      name
    }
    end_customer {
      address {
        city
        state
      }
    }
  }
}
`;

const mapIntelipostStatusToEnum = (status: string): OrderStatus => {
  const normalizedStatus = status ? status.toUpperCase() : '';
  if (
    normalizedStatus.includes('SAIU PARA ENTREGA') ||
    normalizedStatus.includes('DELIVERY_ATTEMPT') ||
    normalizedStatus.includes('TO_BE_DELIVERED') ||
    normalizedStatus.includes('SAIU PARA')
  ) {
    return OrderStatus.DELIVERY_ATTEMPT;
  }
  if (
    normalizedStatus.includes('ENTREGUE') ||
    normalizedStatus.includes('DELIVERED')
  ) {
    return OrderStatus.DELIVERED;
  }
  if (
    normalizedStatus.includes('EM TRÃƒâ€šNSITO') ||
    normalizedStatus.includes('SHIPPED') ||
    normalizedStatus.includes('TRANSIT')
  ) {
    return OrderStatus.SHIPPED;
  }
  if (normalizedStatus.includes('CRIADO') || normalizedStatus.includes('CREATED')) {
    return OrderStatus.CREATED;
  }
  if (
    normalizedStatus.includes('FALHA') ||
    normalizedStatus.includes('FAILURE') ||
    normalizedStatus.includes('ROUBO') ||
    normalizedStatus.includes('AVARIA')
  ) {
    return OrderStatus.FAILURE;
  }
  if (normalizedStatus.includes('DEVOL') || normalizedStatus.includes('RETURN')) {
    return OrderStatus.RETURNED;
  }
  if (
    normalizedStatus.includes('CANCEL') ||
    normalizedStatus.includes('CANCELED')
  ) {
    return OrderStatus.CANCELED;
  }
  return OrderStatus.PENDING;
};

const resolveTrackingStatus = (
  trackingData: any,
  events: Array<{
    status: string;
    description: string;
    eventDate: Date;
  }>,
) => {
  const latestEvent =
    events.length > 0
      ? events.reduce((currentLatest, event) => {
          if (!currentLatest || event.eventDate > currentLatest.eventDate) {
            return event;
          }
          return currentLatest;
        })
      : null;

  return mapIntelipostStatusToEnum(
    [
      trackingData?.tracking?.status,
      trackingData?.tracking?.status_label,
      latestEvent?.status,
      latestEvent?.description,
    ]
      .filter(Boolean)
      .join(' '),
  );
};

const parseCarrierForecastFromText = (text: string | null | undefined) => {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) return null;

  const match = normalizedText.match(
    /previs[aã]o\s+de\s+entrega\s*:\s*(\d{2})\/(\d{2})\/(\d{2,4})/i,
  );

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const parsedDate = new Date(year, month, day);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  parsedDate.setHours(23, 59, 59, 999);
  return parsedDate;
};

const resolveCarrierEstimatedDate = (
  events: Array<{ description: string; eventDate: Date }>,
) => {
  const orderedTexts = events
    .slice()
    .sort((left, right) => right.eventDate.getTime() - left.eventDate.getTime())
    .map((event) => event.description);

  for (const text of orderedTexts) {
    const parsedDate = parseCarrierForecastFromText(text);
    if (parsedDate) {
      return parsedDate;
    }
  }

  return null;
};

const isRouteStatus = (status: OrderStatus) => ROUTE_STATUSES.includes(status);

const toIsoString = (value: Date | null | undefined) =>
  value instanceof Date ? value.toISOString() : null;

const buildEmptySnapshot = (): SyncReportSnapshot => ({
  totalTracked: 0,
  delivered: 0,
  onRoute: 0,
  delayed: 0,
  failure: 0,
});

type SswLookupMode = 'INVOICE' | 'TRACKING_CODE' | 'XML_KEY';

const isXmlSearchIdentifier = (value: string) => {
  const normalized = String(value || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .trim();

  if (!normalized) return false;
  if (/^\d{44}$/.test(normalized)) return true;
  return normalized.length >= 20 && /[A-Z]/.test(normalized) && /\d/.test(normalized);
};

export class TrackingService {
  private async resolveCompanyTrackingConfig(companyId?: string | null) {
    if (!companyId) {
      return {
        intelipostClientId: DEFAULT_CLIENT_ID,
        sswRequireCnpjs: [] as string[],
      };
    }

    const company = await (prisma.company as any).findUnique({
      where: { id: companyId },
      select: {
        intelipostClientId: true,
        sswRequireCnpjs: true,
      },
    });

    return {
      intelipostClientId: String(company?.intelipostClientId || DEFAULT_CLIENT_ID).trim(),
      sswRequireCnpjs: Array.isArray(company?.sswRequireCnpjs)
        ? company.sswRequireCnpjs.map((cnpj) => String(cnpj || '').replace(/\D/g, '').trim()).filter(Boolean)
        : [],
    };
  }

  private async fetchFromIntelipost(
    orderNumber: string,
    companyId?: string | null,
  ) {
    try {
      const { intelipostClientId } = await this.resolveCompanyTrackingConfig(companyId);
      const payload = {
        operationName: null,
        query: INTELIPOST_QUERY,
        variables: {
          clientId: intelipostClientId,
          orderHash: intelipostClientId,
          orderNumber: orderNumber.trim(),
        },
      };

      const response = await fetch(INTELIPOST_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://status.ondeestameupedido.com',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();

      if (json.errors) {
        console.error('GraphQL errors:', json.errors);
        return null;
      }

      return json.data?.trackingStatus;
    } catch (error) {
      console.error('Erro ao consultar Intelipost:', error);
      return null;
    }
  }

  private async fetchFromSsw(order: {
    orderNumber: string;
    invoiceNumber: string | null;
    trackingCode: string | null;
    companyId: string | null;
  }) {
    const normalizedInvoiceNumber = String(order.invoiceNumber || '')
      .replace(/\D/g, '')
      .trim();
    const normalizedTrackingDigits = String(order.trackingCode || '')
      .replace(/\D/g, '')
      .trim();
    const normalizedTrackingKey = String(order.trackingCode || '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .trim();
    const hasXmlTrackingKey =
      !normalizedInvoiceNumber &&
      (normalizedTrackingKey.length === 44 ||
        (normalizedTrackingKey.length >= 20 &&
          /[A-Z]/.test(normalizedTrackingKey) &&
          /\d/.test(normalizedTrackingKey)));

    const { sswRequireCnpjs } = await this.resolveCompanyTrackingConfig(
      order.companyId,
    );

    const standardIdentifier = normalizedInvoiceNumber || normalizedTrackingDigits;

    if (standardIdentifier) {
      for (const cnpj of sswRequireCnpjs) {
        const result = await sswTrackingService.fetchTrackingByInvoice(
          cnpj,
          standardIdentifier,
        );

        if (result) {
          return {
            ...result,
            lookupMode: normalizedInvoiceNumber
              ? ('INVOICE' as SswLookupMode)
              : ('TRACKING_CODE' as SswLookupMode),
          };
        }
      }
    }

    if (hasXmlTrackingKey) {
      const result = await sswTrackingService.fetchTrackingByKey(
        normalizedTrackingKey,
      );

      if (result) {
        return {
          ...result,
          lookupMode: 'XML_KEY' as SswLookupMode,
        };
      }
    }

    return null;
  }

  async searchExternalIdentifier(identifier: string, companyId?: string | null) {
    const rawIdentifier = String(identifier || '').trim();

    if (!rawIdentifier) {
      return null;
    }

    const normalizedDigits = rawIdentifier.replace(/\D/g, '').trim();
    const looksLikeXml = isXmlSearchIdentifier(rawIdentifier);

    if (looksLikeXml) {
      const sswResult = await this.fetchFromSsw({
        orderNumber: rawIdentifier,
        invoiceNumber: null,
        trackingCode: rawIdentifier,
        companyId: companyId || null,
      });

      if (sswResult) {
        return {
          source: 'SSW' as const,
          identifier: rawIdentifier,
          result: sswResult,
        };
      }
    }

    if (normalizedDigits) {
      const sswResult = await this.fetchFromSsw({
        orderNumber: rawIdentifier,
        invoiceNumber: normalizedDigits,
        trackingCode: normalizedDigits,
        companyId: companyId || null,
      });

      if (sswResult) {
        return {
          source: 'SSW' as const,
          identifier: rawIdentifier,
          result: sswResult,
        };
      }
    }

    const intelipostResult = await this.fetchFromIntelipost(
      rawIdentifier,
      companyId,
    );

    if (intelipostResult) {
      return {
        source: 'INTELIPOST' as const,
        identifier: rawIdentifier,
        result: intelipostResult,
      };
    }

    return null;
  }

  private async buildSnapshot(companyId?: string | null): Promise<SyncReportSnapshot> {
    if (!companyId) {
      return buildEmptySnapshot();
    }

    const orders = await prisma.order.findMany({
      where: { companyId },
      select: {
        status: true,
        isDelayed: true,
        freightType: true,
      },
    });

    return {
      totalTracked: orders.filter((order) => !normalizeExcludedPlatformFreight(order.freightType)).length,
      delivered: orders.filter(
        (order) =>
          !normalizeExcludedPlatformFreight(order.freightType) &&
          order.status === OrderStatus.DELIVERED,
      ).length,
      onRoute: orders.filter(
        (order) =>
          !normalizeExcludedPlatformFreight(order.freightType) &&
          isRouteStatus(order.status),
      ).length,
      delayed: orders.filter(
        (order) =>
          !normalizeExcludedPlatformFreight(order.freightType) && order.isDelayed,
      ).length,
      failure: orders.filter(
        (order) =>
          !normalizeExcludedPlatformFreight(order.freightType) &&
          order.status === OrderStatus.FAILURE,
      ).length,
    };
  }

  private buildChangeBase(order: {
    id: string;
    orderNumber: string;
    trackingCode: string | null;
    customerName: string;
    freightType: string | null;
    status: OrderStatus;
    isDelayed: boolean;
    estimatedDeliveryDate: Date | null;
    lastApiSync: Date | null;
  }): SyncOrderChangeReport {
    return {
      orderId: order.id,
      orderNumber: String(order.orderNumber),
      trackingCode: order.trackingCode || null,
      customerName: order.customerName,
      freightType: order.freightType || null,
      previousStatus: order.status,
      currentStatus: order.status,
      previousIsDelayed: order.isDelayed,
      currentIsDelayed: order.isDelayed,
      previousEstimatedDeliveryDate: toIsoString(order.estimatedDeliveryDate),
      currentEstimatedDeliveryDate: toIsoString(order.estimatedDeliveryDate),
      lastApiSync: toIsoString(order.lastApiSync),
      changed: false,
      enteredDelivered: false,
      enteredDelay: false,
      enteredFailure: false,
      enteredRoute: false,
      latestTrackingStatus: null,
      latestTrackingDescription: null,
      errorMessage: null,
      trackingEvents: [],
    };
  }

  async syncOrder(orderId: string, companyId?: string | null) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        return { success: false, message: 'Pedido nÃƒÂ£o encontrado', change: null };
      }

      if (companyId && order.companyId !== companyId) {
        return {
          success: false,
          message: 'Pedido nÃƒÂ£o pertence ÃƒÂ  empresa ativa',
          change: null,
        };
      }

      const baseChange = this.buildChangeBase(order);

      if (FINALIZED_STATUSES.includes(order.status)) {
        return {
          success: false,
          message: 'Pedido jÃƒÂ¡ finalizado',
          change: {
            ...baseChange,
            errorMessage: 'Pedido jÃƒÂ¡ finalizado',
          },
        };
      }

      const excludedFreight = normalizeExcludedPlatformFreight(order.freightType);
      const isChannelManaged = Boolean(excludedFreight);

      if (isChannelManaged) {
        if (order.status !== OrderStatus.CHANNEL_LOGISTICS) {
          const syncedAt = new Date();
          await prisma.order.update({
            where: { id: orderId },
            data: {
              freightType: excludedFreight,
              status: OrderStatus.CHANNEL_LOGISTICS,
              lastApiSync: syncedAt,
            },
          });

          return {
            success: true,
            message: 'LogÃƒÂ­stica gerenciada pelo canal',
            change: {
              ...baseChange,
              freightType: excludedFreight,
              currentStatus: OrderStatus.CHANNEL_LOGISTICS,
              lastApiSync: syncedAt.toISOString(),
              changed:
                String(order.status) !== String(OrderStatus.CHANNEL_LOGISTICS),
            },
          };
        }

        return {
          success: true,
          message: 'LogÃƒÂ­stica gerenciada pelo canal',
          change: {
            ...baseChange,
              freightType: excludedFreight,
          },
        };
      }

      const sswTrackingData = await this.fetchFromSsw({
        orderNumber: order.orderNumber,
        invoiceNumber: order.invoiceNumber,
        trackingCode: order.trackingCode,
        companyId: order.companyId || companyId || null,
      });

      const trackingData =
        sswTrackingData ||
        (await this.fetchFromIntelipost(
          order.orderNumber,
          order.companyId || companyId,
        ));

      if (!trackingData) {
        const syncedAt = new Date();
        await prisma.order.update({
          where: { id: orderId },
          data: {
            lastApiError: 'Sem dados da SSW e da Intelipost',
            lastApiSync: syncedAt,
          },
        });

        return {
          success: false,
          message: 'Sem dados de rastreio na SSW e na Intelipost',
          change: {
            ...baseChange,
            lastApiSync: syncedAt.toISOString(),
            errorMessage: 'Sem dados de rastreio na SSW e na Intelipost',
          },
        };
      }

      const usingSsw = 'source' in trackingData && trackingData.source === 'SSW';
      const events = usingSsw
        ? trackingData.events.map((event) => ({
            orderId,
            status: event.status,
            description: event.description,
            city: event.city,
            state: event.state,
            eventDate: event.eventDate,
          }))
        : (trackingData.tracking.history || []).map((historyItem: any) => ({
            orderId,
            status: historyItem.macro_state?.code || 'UNKNOWN',
            description: historyItem.provider_message || historyItem.status_label,
            city: trackingData.end_customer?.address?.city || null,
            state: trackingData.end_customer?.address?.state || null,
            eventDate: new Date(historyItem.event_date),
          }));

      const newStatus = usingSsw
        ? trackingData.status
        : resolveTrackingStatus(trackingData, events);
      const carrierEstimatedDate = usingSsw
        ? trackingData.carrierEstimatedDate
        : resolveCarrierEstimatedDate(events);
      const estimatedDate = order.estimatedDeliveryDate;

      const isDelayed =
        Boolean(estimatedDate) &&
        new Date() > estimatedDate &&
        newStatus !== OrderStatus.DELIVERED;
      const syncedAt = new Date();
      const currentFreightType = usingSsw
        ? trackingData.freightType || order.freightType || null
        : trackingData.logistic_provider?.name || order.freightType || null;
      const rawPayload = usingSsw
        ? ({
            source: 'SSW',
            lookupMode: (trackingData as any).lookupMode || 'INVOICE',
            ...trackingData.rawPayload,
          } as any)
        : ({ source: 'INTELIPOST', ...(trackingData as any) } as any);

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          freightType: currentFreightType,
          estimatedDeliveryDate: estimatedDate,
          carrierEstimatedDeliveryDate: carrierEstimatedDate,
          isDelayed: isDelayed || false,
          lastApiSync: syncedAt,
          lastApiError: null,
          apiRawPayload: rawPayload,
        },
      });

      await prisma.trackingEvent.deleteMany({
        where: { orderId },
      });

      if (events.length > 0) {
        await prisma.trackingEvent.createMany({
          data: events,
        });
      }

      const latestEvent =
        events.length > 0
          ? events.reduce((currentLatest, event) => {
              if (!currentLatest || event.eventDate > currentLatest.eventDate) {
                return event;
              }
              return currentLatest;
            })
          : null;

      const changed =
        order.status !== newStatus ||
        order.isDelayed !== Boolean(isDelayed) ||
        toIsoString(order.estimatedDeliveryDate) !== toIsoString(estimatedDate) ||
        toIsoString((order as any).carrierEstimatedDeliveryDate) !==
          toIsoString(carrierEstimatedDate) ||
        (order.freightType || null) !== currentFreightType;

      return {
        success: true,
        message: usingSsw
          ? 'Rastreio atualizado com sucesso pela SSW'
          : 'Rastreio atualizado com sucesso pela Intelipost',
        change: {
          ...baseChange,
          freightType: currentFreightType,
          currentStatus: newStatus,
          currentIsDelayed: Boolean(isDelayed),
          currentEstimatedDeliveryDate: toIsoString(estimatedDate),
          lastApiSync: syncedAt.toISOString(),
          changed,
          enteredDelivered:
            order.status !== OrderStatus.DELIVERED &&
            newStatus === OrderStatus.DELIVERED,
          enteredDelay: !order.isDelayed && Boolean(isDelayed),
          enteredFailure:
            order.status !== OrderStatus.FAILURE &&
            newStatus === OrderStatus.FAILURE,
          enteredRoute:
            !isRouteStatus(order.status) && isRouteStatus(newStatus),
          latestTrackingStatus: latestEvent?.status || null,
          latestTrackingDescription: latestEvent?.description || null,
          trackingEvents: events
            .slice()
            .sort((left, right) => right.eventDate.getTime() - left.eventDate.getTime())
            .map((event) => ({
              status: event.status,
              description: event.description,
              eventDate: event.eventDate.toISOString(),
              city: event.city,
              state: event.state,
            })),
        },
      };
    } catch (error) {
      console.error('Erro ao sincronizar rastreio:', error);
      return {
        success: false,
        message: 'Erro ao sincronizar',
        error,
        change: null,
      };
    }
  }

  async syncAllActive(
    companyId?: string | null,
    hooks?: {
      onStart?: (data: { total: number }) => void;
      onOrderStart?: (data: { orderNumber: string; index: number; total: number }) => void;
      onOrderFinish?: (data: {
        orderNumber: string;
        success: boolean;
        message: string;
        durationMs: number;
      }) => void;
    },
  ) {
    try {
      const activeOrders = await prisma.order.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          freightType: {
            notIn: ['ColetasME2', 'Shopee Xpress', 'Correios'],
          },
          status: {
            notIn: FINALIZED_STATUSES,
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const beforeSnapshot = await this.buildSnapshot(companyId);
      const changes: SyncOrderChangeReport[] = [];
      const results = {
        total: activeOrders.length,
        success: 0,
        failed: 0,
        errors: [] as string[],
        report: {
          companyId: companyId || '',
          total: activeOrders.length,
          success: 0,
          failed: 0,
          errors: [] as string[],
          before: beforeSnapshot,
          after: beforeSnapshot,
          changes,
        } as TrackingSyncReportPayload,
      };

      const syncDelayMs = Math.max(0, Number(process.env.SYNC_DELAY_MS ?? 100));

      hooks?.onStart?.({ total: activeOrders.length });

      for (let index = 0; index < activeOrders.length; index += 1) {
        const order = activeOrders[index];
        const startedAt = Date.now();

        hooks?.onOrderStart?.({
          orderNumber: String(order.orderNumber),
          index: index + 1,
          total: activeOrders.length,
        });

        const result = await this.syncOrder(order.id, companyId);
        const durationMs = Date.now() - startedAt;

        if (result.success) {
          results.success += 1;
        } else {
          results.failed += 1;
          results.errors.push(`${order.orderNumber}: ${result.message}`);
        }

        if (result.change) {
          changes.push(result.change);
        }

        hooks?.onOrderFinish?.({
          orderNumber: String(order.orderNumber),
          success: !!result.success,
          message: String(result.message || ''),
          durationMs,
        });

        if (syncDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, syncDelayMs));
        }
      }

      const afterSnapshot = await this.buildSnapshot(companyId);
      results.report.success = results.success;
      results.report.failed = results.failed;
      results.report.errors = [...results.errors];
      results.report.after = afterSnapshot;

      return results;
    } catch (error) {
      console.error('Erro ao sincronizar pedidos:', error);
      throw error;
    }
  }
}
