import { OrderStatus } from '@prisma/client';
import type {
  SyncOrderChangeReport,
  SyncReportSnapshot,
  TrackingSyncReportPayload,
} from '../types/syncReport';
import { isDatabaseUnavailableError, toUserFacingDatabaseErrorMessage } from '../utils/prismaError';
import { correiosTrackingService } from './correiosTrackingService';
import { matchSswTrackingToOrder, sswTrackingService } from './sswTrackingService';
import { isDemoCompanyById } from './demoCompanyService';
import { prisma } from '../lib/prisma';

const INTELIPOST_API_URL = 'https://tracking-graphql.intelipost.com.br/';
const DEFAULT_CLIENT_ID = '40115';
const ROUTE_STATUSES: OrderStatus[] = [
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERY_ATTEMPT,
];
const FINALIZED_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELED,
];
const TRACKING_PROVIDER_SOURCES = new Set(['SSW', 'INTELIPOST', 'CORREIOS']);

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

const normalizeEventLocation = (value: string) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.;:,]+$/g, '')
    .trim();

const extractEventLocationFromText = (text: string | null | undefined) => {
  const normalizedText = normalizeEventLocation(String(text || ''));
  if (!normalizedText) {
    return { city: null as string | null, state: null as string | null };
  }

  const slashMatch = normalizedText.match(
    /\b([A-ZÀ-Ú0-9' -]+)\s*\/\s*([A-Z]{2})\b/i,
  );
  if (slashMatch?.[1]) {
    return {
      city: normalizeEventLocation(slashMatch[1]),
      state: normalizeEventLocation(slashMatch[2]).slice(0, 2).toUpperCase(),
    };
  }

  const patterns = [
    /na cidade de\s+([A-ZÀ-Ú0-9' -]+?)(?:\s+em\b|[.;]|$)/i,
    /cidade de\s+([A-ZÀ-Ú0-9' -]+?)(?:\s+em\b|[.;]|$)/i,
    /na unidade\s+([A-ZÀ-Ú0-9' -]+?)(?:\s+em\b|[.;]|$)/i,
    /da unidade\s+([A-ZÀ-Ú0-9' -]+?)(?:\s+em\b|[.;]|$)/i,
    /unidade\s+([A-ZÀ-Ú0-9' -]+?)(?:\s+em\b|[.;]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) {
      return {
        city: normalizeEventLocation(match[1]),
        state: null,
      };
    }
  }

  return { city: null, state: null };
};

const isRouteStatus = (status: OrderStatus) => ROUTE_STATUSES.includes(status);

const shouldSkipTerminalSync = (order: {
  status: OrderStatus;
  apiRawPayload?: any;
  trackingEvents?: Array<{
    status: string;
    description: string;
    eventDate: Date;
  }>;
}) => {
  if (order.status === OrderStatus.DELIVERED) {
    const trackingSource = String(order.apiRawPayload?.source || '')
      .trim()
      .toUpperCase();
    return TRACKING_PROVIDER_SOURCES.has(trackingSource);
  }

  return FINALIZED_STATUSES.includes(order.status);
};

const getTerminalSyncSkipMessage = (status: OrderStatus) =>
  status === OrderStatus.DELIVERED ? 'Pedido ja entregue' : 'Pedido ja finalizado';

const toIsoString = (value: Date | null | undefined) =>
  value instanceof Date ? value.toISOString() : null;

const DATABASE_RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
const CORREIOS_DISABLED_WARNING =
  'Ha pedidos Correios ativos porem a integracao esta desabilitada, habilite ou adicione Correio, Pac e Sedex a excecao de transportadoras.';

const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const ensureDatabaseReady = async () => {
  await prisma.$connect();
  await prisma.$queryRawUnsafe('SELECT 1');
};

const buildEmptySnapshot = (): SyncReportSnapshot => ({
  totalTracked: 0,
  delivered: 0,
  onRoute: 0,
  delayed: 0,
  failure: 0,
});

type SswLookupMode = 'INVOICE' | 'TRACKING_CODE' | 'XML_KEY';
type TrackingProvider = 'SSW' | 'INTELIPOST' | 'CORREIOS';

const isXmlSearchIdentifier = (value: string) => {
  const normalized = String(value || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .trim();

  if (!normalized) return false;
  if (/^\d{44}$/.test(normalized)) return true;
  return normalized.length >= 20 && /[A-Z]/.test(normalized) && /\d/.test(normalized);
};

const isCorreiosSearchIdentifier = (value: string) => {
  const normalized = String(value || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .trim();

  return /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(normalized);
};

export class TrackingService {
  private async resolveCompanyTrackingConfig(companyId?: string | null) {
    if (!companyId) {
      return {
        intelipostClientId: DEFAULT_CLIENT_ID,
        sswRequireCnpjs: [] as string[],
        intelipostIntegrationEnabled: true,
        sswRequireEnabled: true,
        correiosIntegrationEnabled: true,
      };
    }

    const company = await (prisma.company as any).findUnique({
      where: { id: companyId },
      select: {
        intelipostIntegrationEnabled: true,
        sswRequireEnabled: true,
        correiosIntegrationEnabled: true,
        intelipostClientId: true,
        sswRequireCnpjs: true,
      },
    });

    return {
      intelipostClientId:
        company?.intelipostIntegrationEnabled === false
          ? ''
          : String(company?.intelipostClientId || DEFAULT_CLIENT_ID).trim(),
      sswRequireCnpjs:
        company?.sswRequireEnabled === false
          ? []
          : Array.isArray(company?.sswRequireCnpjs)
        ? company.sswRequireCnpjs.map((cnpj) => String(cnpj || '').replace(/\D/g, '').trim()).filter(Boolean)
        : [],
      intelipostIntegrationEnabled: company?.intelipostIntegrationEnabled !== false,
      sswRequireEnabled: company?.sswRequireEnabled !== false,
      correiosIntegrationEnabled: company?.correiosIntegrationEnabled !== false,
    };
  }

  private async fetchFromIntelipost(
    orderNumber: string,
    companyId?: string | null,
  ) {
    try {
      const { intelipostClientId, intelipostIntegrationEnabled } =
        await this.resolveCompanyTrackingConfig(companyId);
      if (!intelipostIntegrationEnabled || !intelipostClientId) {
        return null;
      }
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
    customerName?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
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
    const shouldValidateAgainstOrder = Boolean(
      order.customerName || order.cpf || order.cnpj || order.city || order.state,
    );
    const standardCandidates = [
      normalizedInvoiceNumber
        ? {
            identifier: normalizedInvoiceNumber,
            lookupMode: 'INVOICE' as SswLookupMode,
          }
        : null,
      normalizedTrackingDigits && normalizedTrackingDigits !== normalizedInvoiceNumber
        ? {
            identifier: normalizedTrackingDigits,
            lookupMode: 'TRACKING_CODE' as SswLookupMode,
          }
        : null,
    ].filter(Boolean) as Array<{
      identifier: string;
      lookupMode: SswLookupMode;
    }>;

    const acceptedStandardMatches: Array<{
      score: number;
      lookupMode: SswLookupMode;
      result: ReturnType<typeof matchSswTrackingToOrder>;
      payload: any;
    }> = [];
    const rejectedStandardMatches: Array<{
      score: number;
      lookupMode: SswLookupMode;
      cnpj: string;
      reasons: string[];
    }> = [];

    for (const candidate of standardCandidates) {
      for (const cnpj of sswRequireCnpjs) {
        const result = await sswTrackingService.fetchTrackingByInvoice(
          cnpj,
          candidate.identifier,
        );

        if (!result) {
          continue;
        }

        if (!shouldValidateAgainstOrder) {
          return {
            ...result,
            lookupMode: candidate.lookupMode,
            matchedCnpj: cnpj,
          };
        }

        const match = matchSswTrackingToOrder(order, result);
        if (!match.isMatch) {
          rejectedStandardMatches.push({
            score: match.score,
            lookupMode: candidate.lookupMode,
            cnpj,
            reasons: match.reasons,
          });
          continue;
        }

        acceptedStandardMatches.push({
          score: match.score,
          lookupMode: candidate.lookupMode,
          result: match,
          payload: {
            ...result,
            lookupMode: candidate.lookupMode,
            matchedCnpj: cnpj,
            matchScore: match.score,
            matchReasons: match.reasons,
          },
        });
      }
    }

    if (acceptedStandardMatches.length > 0) {
      acceptedStandardMatches.sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        if (left.lookupMode === right.lookupMode) {
          return 0;
        }
        return left.lookupMode === 'INVOICE' ? -1 : 1;
      });

      return acceptedStandardMatches[0].payload;
    }

    if (rejectedStandardMatches.length > 0) {
      rejectedStandardMatches.sort((left, right) => right.score - left.score);
      const bestRejected = rejectedStandardMatches[0];
      console.warn('SSW retornou dados, mas o match com o pedido foi rejeitado.', {
        orderNumber: order.orderNumber,
        invoiceNumber: order.invoiceNumber,
        trackingCode: order.trackingCode,
        lookupMode: bestRejected.lookupMode,
        cnpj: bestRejected.cnpj,
        score: bestRejected.score,
        reasons: bestRejected.reasons,
      });
    }

    if (hasXmlTrackingKey) {
      const result = await sswTrackingService.fetchTrackingByKey(
        normalizedTrackingKey,
      );

      if (result) {
        if (shouldValidateAgainstOrder) {
          const match = matchSswTrackingToOrder(order, result);
          if (!match.isMatch) {
            return null;
          }
        }

        return {
          ...result,
          lookupMode: 'XML_KEY' as SswLookupMode,
        };
      }
    }

    return null;
  }

  private async fetchFromCorreios(order: {
    trackingCode: string | null;
    freightType: string | null;
    companyId?: string | null;
  },
  options?: {
    strict?: boolean;
  }) {
    try {
      const { correiosIntegrationEnabled } =
        await this.resolveCompanyTrackingConfig(order.companyId);
      if (!correiosIntegrationEnabled) {
        if (options?.strict) {
          throw new Error(
            'A integracao dos Correios esta desativada para a empresa atual.',
          );
        }
        return null;
      }

      return await correiosTrackingService.fetchTrackingByObjectCode(
        order.trackingCode,
        order.freightType,
      );
    } catch (error) {
      if (options?.strict) {
        throw error;
      }
      console.error('Erro ao consultar Correios:', error);
      return null;
    }
  }

  async searchExternalIdentifier(identifier: string, companyId?: string | null) {
    const rawIdentifier = String(identifier || '').trim();

    if (!rawIdentifier) {
      return null;
    }

    const hasCorreiosCodeFormat = isCorreiosSearchIdentifier(rawIdentifier);

    const correiosResult = await this.fetchFromCorreios(
      {
        trackingCode: rawIdentifier,
        freightType: 'Correios',
        companyId,
      },
      {
        strict: hasCorreiosCodeFormat,
      },
    );

    if (correiosResult) {
      return {
        source: 'CORREIOS' as const,
        identifier: rawIdentifier,
        result: correiosResult,
      };
    }

    if (hasCorreiosCodeFormat) {
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
      where: {
        companyId,
        isArchived: false,
      },
      select: {
        status: true,
        isDelayed: true,
        freightType: true,
      },
    });

    return {
      totalTracked: orders.filter(
        (order) => order.status !== OrderStatus.CHANNEL_LOGISTICS,
      ).length,
      delivered: orders.filter(
        (order) =>
          order.status !== OrderStatus.CHANNEL_LOGISTICS &&
          order.status === OrderStatus.DELIVERED,
      ).length,
      onRoute: orders.filter(
        (order) =>
          order.status !== OrderStatus.CHANNEL_LOGISTICS &&
          isRouteStatus(order.status),
      ).length,
      delayed: orders.filter(
        (order) =>
          order.status !== OrderStatus.CHANNEL_LOGISTICS && order.isDelayed,
      ).length,
      failure: orders.filter(
        (order) =>
          order.status !== OrderStatus.CHANNEL_LOGISTICS &&
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

  async syncOrder(
    orderId: string,
    companyId?: string | null,
    options?: {
      forceFinalized?: boolean;
    },
  ) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          company: {
            select: {
              name: true,
            },
          },
          trackingEvents: {
            orderBy: { eventDate: 'desc' },
            take: 5,
          },
        },
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
      const resolvedCompanyId = order.companyId || companyId || null;

      if (order.isArchived) {
        const archivedMessage = 'Pedido arquivado. Retire do arquivo para sincronizar.';
        return {
          success: false,
          message: archivedMessage,
          change: {
            ...baseChange,
            errorMessage: archivedMessage,
          },
        };
      }

      if (resolvedCompanyId && (await isDemoCompanyById(resolvedCompanyId))) {
        const blockedMessage =
          'Sincronizacao desabilitada para empresa demonstrativa.';
        return {
          success: false,
          message: blockedMessage,
          change: {
            ...baseChange,
            errorMessage: blockedMessage,
          },
        };
      }

      if (!options?.forceFinalized && shouldSkipTerminalSync(order)) {
        const terminalMessage = getTerminalSyncSkipMessage(order.status);
        return {
          success: false,
          message: terminalMessage,
          change: {
            ...baseChange,
            errorMessage: terminalMessage,
          },
        };
      }



      const shouldUseCorreiosProvider = correiosTrackingService.shouldUseForCarrier(
        order.freightType,
      );
      const companyTrackingConfig = await this.resolveCompanyTrackingConfig(
        order.companyId || companyId || null,
      );
      const shouldTryCorreios =
        shouldUseCorreiosProvider &&
        companyTrackingConfig.correiosIntegrationEnabled !== false;
      const correiosTrackingData = shouldTryCorreios
        ? await this.fetchFromCorreios({
            trackingCode: order.trackingCode,
            freightType: order.freightType,
            companyId: order.companyId || companyId || null,
          })
        : null;

      const sswTrackingData = correiosTrackingData
        ? null
        : await this.fetchFromSsw({
            orderNumber: order.orderNumber,
            invoiceNumber: order.invoiceNumber,
            trackingCode: order.trackingCode,
            companyId: order.companyId || companyId || null,
          });

      const intelipostTrackingData =
        correiosTrackingData || sswTrackingData
          ? null
          : await this.fetchFromIntelipost(
              order.orderNumber,
              order.companyId || companyId,
            );

      const trackingData =
        correiosTrackingData || sswTrackingData || intelipostTrackingData;

      const selectedProvider: TrackingProvider | null = correiosTrackingData
        ? 'CORREIOS'
        : sswTrackingData
          ? 'SSW'
          : intelipostTrackingData
            ? 'INTELIPOST'
            : null;

      if (!trackingData) {
        const syncedAt = new Date();
        const noDataErrorMessage =
          shouldUseCorreiosProvider && !shouldTryCorreios
            ? 'Integracao Correios desabilitada e sem dados nas demais integradoras'
            : shouldUseCorreiosProvider
              ? 'Sem dados dos Correios e das demais integradoras'
              : 'Sem dados da SSW e da Intelipost';
        await prisma.order.update({
          where: { id: orderId },
          data: {
            lastApiError: noDataErrorMessage,
            lastApiSync: syncedAt,
          },
        });

        return {
          success: false,
          message:
            shouldUseCorreiosProvider
              ? 'Sem dados de rastreio nas integradoras ativas'
              : 'Sem dados de rastreio na SSW e na Intelipost',
          change: {
            ...baseChange,
            lastApiSync: syncedAt.toISOString(),
            errorMessage: noDataErrorMessage,
          },
        };
      }

      const usingCorreios =
        selectedProvider === 'CORREIOS' ||
        ('source' in trackingData && trackingData.source === 'CORREIOS');
      const usingSsw =
        selectedProvider === 'SSW' ||
        ('source' in trackingData && trackingData.source === 'SSW');
      const events = usingSsw || usingCorreios
        ? trackingData.events.map((event) => ({
            orderId,
            status: event.status,
            description: event.description,
            city: event.city,
            state: event.state,
            eventDate: event.eventDate,
          }))
        : (trackingData.tracking.history || []).map((historyItem: any) => {
            const description =
              historyItem.provider_message || historyItem.status_label;
            const parsedLocation = extractEventLocationFromText(description);

            return {
              orderId,
              status: historyItem.macro_state?.code || 'UNKNOWN',
              description,
              city: parsedLocation.city,
              state: parsedLocation.state,
              eventDate: new Date(historyItem.event_date),
            };
          });

      const newStatus = usingSsw || usingCorreios
        ? trackingData.status
        : resolveTrackingStatus(trackingData, events);
      const carrierEstimatedDate = usingSsw
        ? trackingData.carrierEstimatedDate
        : usingCorreios
          ? trackingData.carrierEstimatedDate
        : resolveCarrierEstimatedDate(events);
      const estimatedDate = order.estimatedDeliveryDate;

      const isDelayed =
        Boolean(carrierEstimatedDate) &&
        ![
          OrderStatus.DELIVERED,
          OrderStatus.FAILURE,
          OrderStatus.RETURNED,
          OrderStatus.CANCELED,
          OrderStatus.CHANNEL_LOGISTICS,
        ].includes(newStatus) &&
        new Date() > carrierEstimatedDate;
      const syncedAt = new Date();
      const currentFreightType = usingCorreios
        ? order.freightType || trackingData.freightType || 'Correios'
        : usingSsw
        ? trackingData.freightType || order.freightType || null
        : trackingData.logistic_provider?.name || order.freightType || null;
      const rawPayload = usingCorreios
        ? ({
            source: 'CORREIOS',
            trackingUrl: trackingData.trackingUrl,
            objectCode: trackingData.objectCode,
            ...trackingData.rawPayload,
          } as any)
        : usingSsw
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
        message: usingCorreios
          ? 'Rastreio atualizado com sucesso pelos Correios'
          : usingSsw
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
        message: toUserFacingDatabaseErrorMessage(error, 'Erro ao sincronizar'),
        error,
        change: null,
      };
    }
  }

  async syncAllActive(
    companyId?: string | null,
    options?: {
      forceFinalized?: boolean;
    },
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
    const executeSync = async () => {
      if (companyId && (await isDemoCompanyById(companyId))) {
        const emptySnapshot = await this.buildSnapshot(companyId);
        const blockedWarning =
          'Sincronizacao automatica e manual desabilitada para empresa demonstrativa.';

        hooks?.onStart?.({ total: 0 });

        return {
          total: 0,
          success: 0,
          failed: 0,
          warnings: [blockedWarning],
          errors: [] as string[],
          report: {
            companyId: companyId || '',
            total: 0,
            success: 0,
            failed: 0,
            errors: [] as string[],
            before: emptySnapshot,
            after: emptySnapshot,
            changes: [] as SyncOrderChangeReport[],
          } as TrackingSyncReportPayload,
        };
      }

      const activeOrders = await prisma.order.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          isArchived: false,
          freightType: {
            notIn: ['ColetasME2', 'Shopee Xpress'],
          },
          status: {
            not: OrderStatus.CANCELED,
          },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          freightType: true,
          apiRawPayload: true,
          trackingEvents: {
            orderBy: { eventDate: 'desc' },
            take: 5,
            select: {
              status: true,
              description: true,
              eventDate: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const eligibleOrders = options?.forceFinalized
        ? activeOrders
        : activeOrders.filter((order) => !shouldSkipTerminalSync(order));

      const beforeSnapshot = await this.buildSnapshot(companyId);
      const changes: SyncOrderChangeReport[] = [];
      const results = {
        total: eligibleOrders.length,
        success: 0,
        failed: 0,
        warnings: [] as string[],
        errors: [] as string[],
        report: {
          companyId: companyId || '',
          total: eligibleOrders.length,
          success: 0,
          failed: 0,
          errors: [] as string[],
          before: beforeSnapshot,
          after: beforeSnapshot,
          changes,
        } as TrackingSyncReportPayload,
      };

      const syncDelayMs = Math.max(0, Number(process.env.SYNC_DELAY_MS ?? 100));
      const companyTrackingConfig = await this.resolveCompanyTrackingConfig(companyId);
      const hasCorreiosOrders = eligibleOrders.some((order) =>
        correiosTrackingService.shouldUseForCarrier(order.freightType),
      );

      if (
        hasCorreiosOrders &&
        companyTrackingConfig.correiosIntegrationEnabled === false
      ) {
        results.warnings.push(CORREIOS_DISABLED_WARNING);
      }

      hooks?.onStart?.({ total: eligibleOrders.length });

      for (let index = 0; index < eligibleOrders.length; index += 1) {
        const order = eligibleOrders[index];
        const startedAt = Date.now();

        hooks?.onOrderStart?.({
          orderNumber: String(order.orderNumber),
          index: index + 1,
          total: eligibleOrders.length,
        });

        const result = await this.syncOrder(order.id, companyId, options);
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
    };

    try {
      await ensureDatabaseReady();
      return await executeSync();
    } catch (error) {
      if (isDatabaseUnavailableError(error)) {
        for (let index = 0; index < DATABASE_RETRY_DELAYS_MS.length; index += 1) {
          const delayMs = DATABASE_RETRY_DELAYS_MS[index];
          console.warn(
            `Banco indisponivel na sincronizacao. Nova tentativa ${index + 2}/${DATABASE_RETRY_DELAYS_MS.length + 1} em ${delayMs}ms.`,
          );

          await wait(delayMs);

          try {
            await ensureDatabaseReady();
            return await executeSync();
          } catch (retryError) {
            if (!isDatabaseUnavailableError(retryError)) {
              console.error('Erro ao sincronizar pedidos:', retryError);
              throw retryError;
            }

            error = retryError;
          }
        }
      }

      console.error('Erro ao sincronizar pedidos:', error);
      throw error;
    }
  }
}
