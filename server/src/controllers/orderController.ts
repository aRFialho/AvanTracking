import { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { syncJobService } from '../services/syncJobService';
import { TrackingService } from '../services/trackingService';
import { importOrdersForCompany } from '../services/orderImportService';
import { sswTrackingService } from '../services/sswTrackingService';
import { syncReportService } from '../services/syncReportService';
import { toUserFacingDatabaseErrorMessage } from '../utils/prismaError';
import { resolvePlatformCreatedDate } from '../utils/orderDates';
import { prisma as sharedPrisma } from '../lib/prisma';

const prisma = sharedPrisma as any;
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

const normalizeEventLocation = (value: unknown) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.;:,]+$/g, '')
    .trim();

const extractEventLocationFromText = (text: unknown) => {
  const normalizedText = normalizeEventLocation(text);
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

const parseCarrierForecastFromTrackingText = (text: string | null | undefined) => {
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

const isActiveDelayedByDate = (
  status: OrderStatus,
  targetDate: Date | null | undefined,
) => {
  if (!targetDate) return false;

  const closedStatuses: OrderStatus[] = [
    OrderStatus.DELIVERED,
    OrderStatus.FAILURE,
    OrderStatus.RETURNED,
    OrderStatus.CANCELED,
    OrderStatus.CHANNEL_LOGISTICS,
  ];

  return !closedStatuses.includes(status) && new Date() > targetDate;
};

const resolveCarrierEstimatedDateFromTrackingEvents = (trackingEvents: any[] | undefined) => {
  if (!Array.isArray(trackingEvents)) return null;

  const orderedEvents = [...trackingEvents].sort((left, right) => {
    const leftDate = safeDate(left?.eventDate)?.getTime() || 0;
    const rightDate = safeDate(right?.eventDate)?.getTime() || 0;
    return rightDate - leftDate;
  });

  for (const event of orderedEvents) {
    const parsedDate = parseCarrierForecastFromTrackingText(event?.description);
    if (parsedDate) {
      return parsedDate;
    }
  }

  return null;
};

const getMovementDate = (order: any) => {
  const latestTrackingEvent = Array.isArray(order.trackingEvents)
    ? order.trackingEvents[0]
    : null;

  return (
    latestTrackingEvent?.eventDate ||
    order.shippingDate ||
    resolvePlatformCreatedDate(order) ||
    order.lastUpdate
  );
};

const normalizeDigits = (value: unknown) =>
  String(value || '')
    .replace(/\D/g, '')
    .trim();

const normalizeAlphaNumeric = (value: unknown) =>
  String(value || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .trim();

const normalizeComparableText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

const isXmlTrackingKey = (value: unknown) => {
  const normalized = normalizeAlphaNumeric(value);
  if (!normalized) return false;
  if (/^\d{44}$/.test(normalized)) return true;
  return normalized.length >= 20 && /[A-Z]/.test(normalized) && /\d/.test(normalized);
};

const shouldExcludeOrderFromPlatform = (order: any) =>
  order.status === OrderStatus.CHANNEL_LOGISTICS;

const buildSswTrackingUrl = (identifier: string, cnpj?: string | null) =>
  cnpj
    ? `https://ssw.inf.br/app/tracking/${cnpj}/${identifier}`
    : `https://ssw.inf.br/app/tracking/${identifier}`;

const buildIntelipostTrackingUrl = (
  intelipostClientId: string | null | undefined,
  orderNumber: string | null | undefined,
) => {
  const normalizedClientId = normalizeDigits(intelipostClientId);
  const normalizedOrderNumber = safeString(orderNumber);

  if (!normalizedClientId || !normalizedOrderNumber) {
    return null;
  }

  return `https://status.ondeestameupedido.com/tracking/${normalizedClientId}/${encodeURIComponent(normalizedOrderNumber)}`;
};

const getStoredTrackingUrl = (
  order: {
    invoiceNumber?: string | null;
    trackingCode?: string | null;
    apiRawPayload?: any;
  },
) =>
  safeString(order.apiRawPayload?.trackingUrl) ||
  safeString(order.apiRawPayload?.logistic_provider?.live_tracking_url) ||
  safeString(order.apiRawPayload?.tracking_url) ||
  null;

const resolveTrackingSourceLabel = (rawPayload: any) => {
  const source = safeString(rawPayload?.source)?.toUpperCase();
  const lookupMode = safeString(rawPayload?.lookupMode)?.toUpperCase();

  if (source === 'SSW') {
    if (lookupMode === 'TRACKING_CODE') {
      return 'SSW com codigo envio/NF';
    }

    if (lookupMode === 'XML_KEY') {
      return 'SSW com Codigo XML';
    }

    return 'SSW com NF';
  }

  if (
    source === 'INTELIPOST' ||
    rawPayload?.tracking ||
    rawPayload?.logistic_provider
  ) {
    return 'Intelipost';
  }

  if (/ssw\.inf\.br/i.test(String(rawPayload?.trackingUrl || ''))) {
    if (lookupMode === 'TRACKING_CODE') {
      return 'SSW com codigo envio/NF';
    }
    if (lookupMode === 'XML_KEY') {
      return 'SSW com Codigo XML';
    }
    return 'SSW com NF';
  }

  return null;
};

const extractQuoteCarrierName = (quoteDetails: any): string | null => {
  if (!quoteDetails || typeof quoteDetails !== 'object') {
    return null;
  }

  const normalizeComparableText = (value: unknown) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();

  const isIntegratorLabel = (value: unknown) => {
    const normalized = normalizeComparableText(value);
    if (!normalized) return false;

    return [
      'INTELIPOST',
      'FRETE FACIL',
      'FRETEFACIL',
      'MELHOR ENVIO',
      'KANGU',
      'FRENET',
    ].some((token) => normalized === token || normalized.includes(token));
  };

  const isGenericServiceLabel = (value: unknown) => {
    const normalized = normalizeComparableText(value);
    if (!normalized) return false;

    return [
      'EMISSAO DE NOTA FISCAL',
      'EMISSAO NOTA FISCAL',
      'NOTA FISCAL',
      'DOCUMENTO FISCAL',
      'COTACAO DE FRETE',
      'FRETE',
    ].some((token) => normalized === token || normalized.includes(token));
  };

  const pickCarrierCandidate = (...candidates: unknown[]) => {
    for (const candidate of candidates) {
      const normalized = safeString(candidate);
      if (!normalized) continue;
      if (isIntegratorLabel(normalized)) continue;
      if (isGenericServiceLabel(normalized)) continue;
      return normalized;
    }

    return null;
  };

  return (
    (quoteDetails.matchedByCarrier ? safeString(quoteDetails.requestedCarrier) : null) ||
    pickCarrierCandidate(
      quoteDetails.selectedCarrierName,
      quoteDetails.selectedOption?.carrier_name,
      quoteDetails.selectedOption?.carrier,
      quoteDetails.selectedOption?.transportadora,
      quoteDetails.selectedOption?.shipping_company,
      quoteDetails.selectedOption?.delivery_method?.carrier_name,
      quoteDetails.selectedOption?.taxe?.name,
      quoteDetails.raw?.taxe?.name,
      quoteDetails.carrierName,
      quoteDetails.shipmentType,
      quoteDetails.selectedOption?.delivery_method?.name,
      quoteDetails.selectedServiceName,
      quoteDetails.raw?.service_name,
      quoteDetails.selectedOption?.service_name,
      quoteDetails.selectedOption?.service,
      quoteDetails.selectedOption?.identifier,
      quoteDetails.selectedOption?.name,
      quoteDetails.raw?.name,
      quoteDetails.serviceName,
      quoteDetails.serviceCode,
    ) ||
    null
  );
};

const extractOrderQuotationId = (order: any) =>
  safeString(order.originalQuotedFreightQuotationId) ||
  safeString(order.apiRawPayload?.id_quotation) ||
  safeString(order.apiRawPayload?.quotation_id) ||
  null;

const mergeQuoteDetails = (primary: any, fallback: any) => {
  if (!primary && !fallback) {
    return null;
  }

  if (!primary) {
    return fallback;
  }

  if (!fallback) {
    return primary;
  }

  return {
    ...fallback,
    ...primary,
    selectedOption: {
      ...(fallback?.selectedOption || {}),
      ...(primary?.selectedOption || {}),
    },
    raw: {
      ...(fallback?.raw || {}),
      ...(primary?.raw || {}),
    },
  };
};

const loadCheckoutQuotesMap = async (
  companyId: string | null | undefined,
  orders: any[],
) => {
  const quotationIds = Array.from(
    new Set(
      orders
        .map((order) => extractOrderQuotationId(order))
        .filter((value) => Boolean(value)),
    ),
  );

  if (!companyId || quotationIds.length === 0) {
    return new Map();
  }

  const rows = await (prisma).trayCheckoutQuote.findMany({
    where: {
      companyIdValue: companyId,
      quotationId: { in: quotationIds },
    },
  }).catch(() => []);

  return new Map(rows.map((row) => [String(row.quotationId), row]));
};

const loadCheckoutQuoteForOrder = async (
  companyId: string | null | undefined,
  order: any,
) => {
  const quotationId = extractOrderQuotationId(order);

  if (!companyId || !quotationId) {
    return null;
  }

  return (prisma).trayCheckoutQuote.findFirst({
    where: {
      companyIdValue: companyId,
      quotationId,
    },
  }).catch(() => null);
};

const resolveOrderTrackingUrl = (
  order: {
    invoiceNumber?: string | null;
    trackingCode?: string | null;
    orderNumber?: string | null;
    apiRawPayload?: any;
  },
  sswRequireCnpjs: string[] = [],
  intelipostClientId?: string | null,
) => {
  const storedTrackingUrl = getStoredTrackingUrl(order);
  if (storedTrackingUrl) {
    return storedTrackingUrl;
  }

  const invoiceIdentifier = normalizeDigits(order.invoiceNumber);
  const trackingDigits = normalizeDigits(order.trackingCode);
  const trackingKey = normalizeAlphaNumeric(order.trackingCode);

  if (invoiceIdentifier && sswRequireCnpjs.length > 0) {
    return buildSswTrackingUrl(invoiceIdentifier, sswRequireCnpjs[0]);
  }

  if (!invoiceIdentifier && trackingDigits && sswRequireCnpjs.length > 0) {
    return buildSswTrackingUrl(trackingDigits, sswRequireCnpjs[0]);
  }

  if (!invoiceIdentifier && trackingKey && isXmlTrackingKey(trackingKey)) {
    return buildSswTrackingUrl(trackingKey);
  }

  const intelipostTrackingUrl =
    safeString(order.apiRawPayload?.source)?.toUpperCase() === 'INTELIPOST' ||
    order.apiRawPayload?.tracking ||
    order.apiRawPayload?.logistic_provider
      ? buildIntelipostTrackingUrl(intelipostClientId, order.orderNumber)
      : null;

  return intelipostTrackingUrl;
};

const resolveVerifiedOrderTrackingUrl = async (
  order: {
    invoiceNumber?: string | null;
    trackingCode?: string | null;
    orderNumber?: string | null;
    apiRawPayload?: any;
  },
  sswRequireCnpjs: string[] = [],
  intelipostClientId?: string | null,
) => {
  const storedTrackingUrl = getStoredTrackingUrl(order);
  const trackingSource = safeString(order.apiRawPayload?.source)?.toUpperCase();
  const storedUrlLooksLikeSsw = /ssw\.inf\.br/i.test(storedTrackingUrl || '');

  if (storedTrackingUrl && trackingSource !== 'SSW' && !storedUrlLooksLikeSsw) {
    return storedTrackingUrl;
  }

  const invoiceIdentifier = normalizeDigits(order.invoiceNumber);
  const trackingDigits = normalizeDigits(order.trackingCode);
  const trackingKey = normalizeAlphaNumeric(order.trackingCode);
  const standardIdentifier = invoiceIdentifier || trackingDigits;

  if (standardIdentifier && sswRequireCnpjs.length > 0) {
    for (const cnpj of sswRequireCnpjs) {
      const result = await sswTrackingService.fetchTrackingByInvoice(
        cnpj,
        standardIdentifier,
      );

      if (result) {
        return buildSswTrackingUrl(standardIdentifier, cnpj);
      }
    }
  }

  if (!invoiceIdentifier && trackingKey && isXmlTrackingKey(trackingKey)) {
    const xmlResult = await sswTrackingService.fetchTrackingByKey(trackingKey);
    if (xmlResult) {
      return buildSswTrackingUrl(trackingKey);
    }
  }

  const intelipostTrackingUrl =
    safeString(order.apiRawPayload?.source)?.toUpperCase() === "INTELIPOST" ||
    order.apiRawPayload?.tracking ||
    order.apiRawPayload?.logistic_provider
      ? buildIntelipostTrackingUrl(intelipostClientId, order.orderNumber)
      : null;

  return (
    storedTrackingUrl ||
    safeString(order.apiRawPayload?.logistic_provider?.live_tracking_url) ||
    safeString(order.apiRawPayload?.tracking_url) ||
    intelipostTrackingUrl ||
    null
  );
};

const getCompanySswRequireCnpjs = async (companyId: string | null | undefined) => {
  if (!companyId) {
    return [];
  }

  const company = await ((prisma.company as any).findUnique({
    where: { id: companyId },
    select: {
      sswRequireEnabled: true,
      sswRequireCnpjs: true,
    },
  }) as Promise<any>);

  if (company?.sswRequireEnabled === false) {
    return [];
  }

  return Array.isArray(company?.sswRequireCnpjs)
    ? company.sswRequireCnpjs
        .map((cnpj: unknown) => normalizeDigits(cnpj))
        .filter(Boolean)
    : [];
};

const getCompanyIntelipostClientId = async (
  companyId: string | null | undefined,
) => {
  if (!companyId) {
    return null;
  }

  const company = await ((prisma.company as any).findUnique({
    where: { id: companyId },
    select: {
      intelipostIntegrationEnabled: true,
      intelipostClientId: true,
    },
  }) as Promise<any>);

  if (company?.intelipostIntegrationEnabled === false) {
    return null;
  }

  return safeString(company?.intelipostClientId);
};

const mapIntelipostStatusToEnum = (status: string): OrderStatus => {
  const normalizedStatus = status ? status.toUpperCase() : '';

  if (
    normalizedStatus.includes('SAIU PARA ENTREGA') ||
    normalizedStatus.includes('DELIVERY_ATTEMPT') ||
    normalizedStatus.includes('TO_BE_DELIVERED')
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
  if (normalizedStatus.includes('CANCEL')) {
    return OrderStatus.CANCELED;
  }
  if (
    normalizedStatus.includes('SHIPPED') ||
    normalizedStatus.includes('TRANSIT') ||
    normalizedStatus.includes('EM TR')
  ) {
    return OrderStatus.SHIPPED;
  }
  if (
    normalizedStatus.includes('CRIADO') ||
    normalizedStatus.includes('CREATED') ||
    normalizedStatus.includes('NEW')
  ) {
    return OrderStatus.CREATED;
  }

  return OrderStatus.PENDING;
};

const buildExternalOrderResponse = (
  identifier: string,
  source: 'SSW' | 'INTELIPOST',
  result: any,
  intelipostClientId?: string | null,
) => {
  if (source === 'SSW') {
    const events = Array.isArray(result.events) ? result.events : [];
    const orderedEvents = events
      .slice()
      .sort((left, right) => right.eventDate.getTime() - left.eventDate.getTime());
    const latestEvent = orderedEvents[0] || null;
    const lookupMode = safeString(result.lookupMode) || 'INVOICE';

    return {
      id: `external-${normalizeAlphaNumeric(identifier) || normalizeDigits(identifier) || Date.now()}` ,
      orderNumber: String(identifier),
      invoiceNumber: lookupMode === 'INVOICE' ? normalizeDigits(identifier) : null,
      trackingCode: lookupMode === 'XML_KEY' ? identifier : null,
      trackingUrl: safeString(result.rawPayload?.trackingUrl),
      trackingSourceLabel:
        lookupMode === 'XML_KEY'
          ? 'SSW com Codigo XML'
          : lookupMode === 'TRACKING_CODE'
            ? 'SSW com codigo envio/NF'
            : 'SSW com NF',
      customerName: 'Consulta externa',
      corporateName: null,
      cpf: null,
      cnpj: null,
      phone: null,
      mobile: null,
      salesChannel: 'Externo',
      freightType: result.freightType || 'SSW',
      freightValue: 0,
      quotedFreightValue: null,
      quotedFreightDate: null,
      quotedFreightDetails: null,
      quotedCarrierName: null,
      freightCarrierMatchesQuote: null,
      shippingDate: latestEvent?.eventDate || new Date(),
      address: '',
      number: '',
      complement: null,
      neighborhood: '',
      city: latestEvent?.city || '',
      state: latestEvent?.state || '',
      zipCode: '',
      totalValue: 0,
      recipient: null,
      maxShippingDeadline: null,
      estimatedDeliveryDate: result.carrierEstimatedDate || null,
      carrierEstimatedDeliveryDate: result.carrierEstimatedDate || null,
      status: result.status as OrderStatus,
      isDelayed: false,
      trackingHistory: events.map((event: any) => ({
        status: safeString(event.status) || 'UNKNOWN',
        description: safeString(event.description) || 'Evento de rastreamento',
        date: safeDate(event.eventDate) || new Date(),
        city: safeString(event.city) || '',
        state: safeString(event.state) || '',
      })),
      lastApiSync: new Date(),
      lastUpdate: latestEvent?.eventDate || new Date(),
    };
  }

  const trackingHistory = (result?.tracking?.history || []).map((historyItem: any) => {
    const description =
      historyItem.provider_message ||
      historyItem.status_label ||
      'Evento de rastreamento';
    const parsedLocation = extractEventLocationFromText(description);

    return {
      status: historyItem.macro_state?.code || 'UNKNOWN',
      description,
      date: safeDate(historyItem.event_date) || new Date(),
      city: parsedLocation.city || '',
      state: parsedLocation.state || '',
    };
  });

  const latestTrackingEvent =
    trackingHistory.length > 0
      ? trackingHistory.reduce((latest: any, current: any) =>
          new Date(latest.date).getTime() > new Date(current.date).getTime()
            ? latest
            : current,
        )
      : null;

  const status = mapIntelipostStatusToEnum(
    [
      safeString(result?.tracking?.status),
      safeString(result?.tracking?.status_label),
      safeString(latestTrackingEvent?.status),
      safeString(latestTrackingEvent?.description),
    ]
      .filter(Boolean)
      .join(' '),
  );

  const resolvedOrderNumber = safeString(result?.order?.order_number) || identifier;

  return {
    id: `external-${normalizeAlphaNumeric(resolvedOrderNumber) || Date.now()}` ,
    orderNumber: resolvedOrderNumber,
    invoiceNumber: null,
    trackingCode: null,
    trackingUrl: buildIntelipostTrackingUrl(
      intelipostClientId,
      resolvedOrderNumber,
    ),
    trackingSourceLabel: 'Intelipost',
    customerName: 'Consulta externa',
    corporateName: null,
    cpf: null,
    cnpj: null,
    phone: null,
    mobile: null,
    salesChannel: 'Externo',
    freightType: safeString(result?.logistic_provider?.name) || 'Desconhecida',
    freightValue: 0,
    quotedFreightValue: null,
    quotedFreightDate: null,
    quotedFreightDetails: null,
    quotedCarrierName: null,
    freightCarrierMatchesQuote: null,
    shippingDate: new Date(),
    address: '',
    number: '',
    complement: null,
    neighborhood: '',
    city: safeString(result?.end_customer?.address?.city) || '',
    state: safeString(result?.end_customer?.address?.state) || '',
    zipCode: '',
    totalValue: 0,
    recipient: null,
    maxShippingDeadline: null,
    estimatedDeliveryDate: safeDate(result?.tracking?.estimated_delivery_date_lp),
    carrierEstimatedDeliveryDate: safeDate(result?.tracking?.estimated_delivery_date_lp),
    status,
    isDelayed: false,
    trackingHistory,
    lastApiSync: new Date(),
    lastUpdate: safeDate(latestTrackingEvent?.date) || new Date(),
  };
};

const formatOrderForResponse = (
  order: any,
  sswRequireCnpjs: string[] = [],
  intelipostClientId?: string | null,
  checkoutQuote?: any,
) => {
  const carrierEstimatedDeliveryDate =
    resolveCarrierEstimatedDateFromTrackingEvents(order.trackingEvents) ||
    order.carrierEstimatedDeliveryDate ||
    null;
  const legacyQuotedValue = order.quotedFreightValue ?? null;
  const legacyQuotedDate = order.quotedFreightDate ?? null;
  const legacyQuotedDetails = order.quotedFreightDetails ?? null;
  const originalQuotedFreightValue =
    order.originalQuotedFreightValue ??
    checkoutQuote?.quotedValue ??
    legacyQuotedValue;
  const originalQuotedFreightDate =
    order.originalQuotedFreightDate ??
    checkoutQuote?.createdAt ??
    legacyQuotedDate;
  const originalQuotedFreightDetails = mergeQuoteDetails(
    mergeQuoteDetails(order.originalQuotedFreightDetails, checkoutQuote?.snapshotData),
    legacyQuotedDetails,
  );
  const originalQuotedFreightQuotationId =
    extractOrderQuotationId(order) || safeString(checkoutQuote?.quotationId);
  const recalculatedFreightValue = order.recalculatedFreightValue ?? null;
  const recalculatedFreightDate = order.recalculatedFreightDate ?? null;
  const recalculatedFreightDetails = order.recalculatedFreightDetails ?? null;
  const isPlatformDelayed = isActiveDelayedByDate(
    order.status as OrderStatus,
    order.estimatedDeliveryDate,
  );
  const originalQuotedCarrierName = extractQuoteCarrierName(
    originalQuotedFreightDetails,
  );
  const recalculatedQuotedCarrierName = extractQuoteCarrierName(
    recalculatedFreightDetails,
  );
  const freightCarrierMatchesOriginalQuote =
    originalQuotedCarrierName && order.freightType
      ? normalizeComparableText(order.freightType) ===
        normalizeComparableText(originalQuotedCarrierName)
      : null;
  const freightCarrierMatchesRecalculatedQuote =
    recalculatedQuotedCarrierName && order.freightType
      ? normalizeComparableText(order.freightType) ===
        normalizeComparableText(recalculatedQuotedCarrierName)
      : null;

  return {
    ...order,
    orderNumber: String(order.orderNumber),
    status: order.status as OrderStatus,
    platformCreatedAt: resolvePlatformCreatedDate(order),
    carrierEstimatedDeliveryDate,
    trackingSourceLabel: resolveTrackingSourceLabel(order.apiRawPayload),
    quotedFreightValue: legacyQuotedValue,
    quotedFreightDate: legacyQuotedDate,
    quotedFreightDetails: legacyQuotedDetails,
    quotedCarrierName: originalQuotedCarrierName,
    originalQuotedFreightValue,
    originalQuotedFreightDate,
    originalQuotedFreightDetails,
    originalQuotedFreightQuotationId,
    originalQuotedCarrierName,
    recalculatedFreightValue,
    recalculatedFreightDate,
    recalculatedFreightDetails,
    recalculatedQuotedCarrierName,
    isPlatformDelayed,
    freightCarrierMatchesQuote: freightCarrierMatchesOriginalQuote,
    freightCarrierMatchesOriginalQuote,
    freightCarrierMatchesRecalculatedQuote,
    trackingHistory: mapTrackingEventsToHistory(order.trackingEvents),
    lastUpdate: getMovementDate(order),
    trackingUrl: resolveOrderTrackingUrl(
      order,
      sswRequireCnpjs,
      intelipostClientId,
    ),
  };
};

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
      select: {
        id: true,
        orderNumber: true,
        invoiceNumber: true,
        trackingCode: true,
        customerName: true,
        corporateName: true,
        cpf: true,
        cnpj: true,
        phone: true,
        mobile: true,
        salesChannel: true,
        freightType: true,
        freightValue: true,
        quotedFreightValue: true,
        quotedFreightDate: true,
        quotedFreightDetails: true,
        originalQuotedFreightValue: true,
        originalQuotedFreightDate: true,
        originalQuotedFreightDetails: true,
        originalQuotedFreightQuotationId: true,
        recalculatedFreightValue: true,
        recalculatedFreightDate: true,
        recalculatedFreightDetails: true,
        shippingDate: true,
        address: true,
        number: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
        zipCode: true,
        totalValue: true,
        recipient: true,
        maxShippingDeadline: true,
        estimatedDeliveryDate: true,
        carrierEstimatedDeliveryDate: true,
        status: true,
        isDelayed: true,
        lastApiSync: true,
        lastUpdate: true,
        createdAt: true,
        trackingEvents: {
          orderBy: { eventDate: 'desc' },
          select: {
            status: true,
            description: true,
            city: true,
            state: true,
            eventDate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sswRequireCnpjs = await getCompanySswRequireCnpjs(user.companyId);
    const intelipostClientId = await getCompanyIntelipostClientId(user.companyId);
    const checkoutQuotesMap = await loadCheckoutQuotesMap(user.companyId, orders);

    return res.json(
      orders
        .filter((order) => !shouldExcludeOrderFromPlatform(order))
        .map((order) =>
          formatOrderForResponse(
            order,
            sswRequireCnpjs,
            intelipostClientId,
            checkoutQuotesMap.get(extractOrderQuotationId(order) || ''),
          ),
        ),
    );
  } catch (error) {
    console.error('Erro ao buscar pedidos:', error);
    return res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // @ts-ignore
    const user = req.user;

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

    if (user?.companyId && order.companyId !== user.companyId) {
      return res.status(404).json({ error: 'Pedido nao encontrado' });
    }

    if (shouldExcludeOrderFromPlatform(order)) {
      return res.status(404).json({ error: 'Pedido nao encontrado' });
    }

    const sswRequireCnpjs = await getCompanySswRequireCnpjs(order.companyId);
    const intelipostClientId = await getCompanyIntelipostClientId(order.companyId);
    const checkoutQuote = await loadCheckoutQuoteForOrder(order.companyId, order);

    return res.json(
      formatOrderForResponse(
        order,
        sswRequireCnpjs,
        intelipostClientId,
        checkoutQuote,
      ),
    );
  } catch (error) {
    console.error('Erro ao buscar pedido:', error);
    return res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
};

export const updateOrderFreightType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const freightType = safeString(req.body?.freightType);
    // @ts-ignore
    const user = req.user;

    if (typeof id !== 'string') {
      return res.status(400).json({ error: 'ID invalido' });
    }

    if (!user?.companyId) {
      return res.status(403).json({ error: 'Acesso negado. Usuario sem empresa.' });
    }

    if (!freightType) {
      return res.status(400).json({ error: 'Informe o nome da transportadora.' });
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

    if (!order || order.companyId !== user.companyId) {
      return res.status(404).json({ error: 'Pedido nao encontrado' });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        freightType,
        lastUpdate: new Date(),
      },
      include: {
        carrier: true,
        trackingEvents: {
          orderBy: { eventDate: 'desc' },
        },
      },
    });

    const sswRequireCnpjs = await getCompanySswRequireCnpjs(user.companyId);
    const intelipostClientId = await getCompanyIntelipostClientId(user.companyId);
    const checkoutQuote = await loadCheckoutQuoteForOrder(user.companyId, updatedOrder);

    return res.json({
      success: true,
      message: 'Transportadora atualizada com sucesso.',
      order: formatOrderForResponse(
        updatedOrder,
        sswRequireCnpjs,
        intelipostClientId,
        checkoutQuote,
      ),
    });
  } catch (error) {
    console.error('Erro ao atualizar transportadora do pedido:', error);
    return res.status(500).json({
      error: toUserFacingDatabaseErrorMessage(
        error,
        'Erro ao atualizar transportadora do pedido',
      ),
    });
  }
};

export const openOrderTracking = async (req: Request, res: Response) => {
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

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        invoiceNumber: true,
        trackingCode: true,
        orderNumber: true,
        apiRawPayload: true,
        freightType: true,
        status: true,
      },
    });

    if (!order || order.companyId !== user.companyId || shouldExcludeOrderFromPlatform(order)) {
      return res.status(404).json({ error: 'Pedido nao encontrado' });
    }

    const sswRequireCnpjs = await getCompanySswRequireCnpjs(user.companyId);
    const intelipostClientId = await getCompanyIntelipostClientId(user.companyId);
    const trackingUrl = await resolveVerifiedOrderTrackingUrl(
      order,
      sswRequireCnpjs,
      intelipostClientId,
    );

    if (!trackingUrl) {
      return res.status(404).json({
        error: 'Nenhum link direto de rastreio disponivel para este pedido.',
      });
    }

    if (
      req.query.resolve === '1' ||
      String(req.headers.accept || '').includes('application/json')
    ) {
      return res.json({ trackingUrl });
    }

    return res.redirect(trackingUrl);
  } catch (error) {
    console.error('Erro ao abrir link de rastreio:', error);
    return res.status(500).json({ error: 'Erro ao abrir rastreio do pedido' });
  }
};

export const searchExternalOrder = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const user = req.user;
    const identifier = safeString(req.body?.identifier);

    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'Acesso negado. Usuario sem empresa.' });
    }

    if (!identifier) {
      return res.status(400).json({ error: 'Informe pedido, NF ou chave XML.' });
    }

    const normalizedDigits = normalizeDigits(identifier);
    const normalizedAlphaNumeric = normalizeAlphaNumeric(identifier);

    const existingOrder = await prisma.order.findFirst({
      where: {
        companyId: user.companyId,
        OR: [
          { orderNumber: identifier },
          ...(normalizedDigits ? [{ invoiceNumber: normalizedDigits }] : []),
          ...(normalizedDigits ? [{ trackingCode: normalizedDigits }] : []),
          ...(normalizedAlphaNumeric ? [{ trackingCode: normalizedAlphaNumeric }] : []),
        ],
      },
    });

    if (existingOrder && !shouldExcludeOrderFromPlatform(existingOrder)) {
      const syncResult = await trackingService.syncOrder(existingOrder.id, user.companyId);

      if (
        !syncResult.success &&
        syncResult.message !== 'Pedido ja finalizado' &&
        syncResult.message !== 'Pedido ja entregue'
      ) {
        return res.status(400).json({
          error: syncResult.message || 'Nao foi possivel atualizar o pedido local.',
        });
      }

      const refreshedOrder = await prisma.order.findUnique({
        where: { id: existingOrder.id },
        include: {
          carrier: true,
          trackingEvents: {
            orderBy: { eventDate: 'desc' },
          },
        },
      });

      const sswRequireCnpjs = await getCompanySswRequireCnpjs(user.companyId);
      const intelipostClientId = await getCompanyIntelipostClientId(user.companyId);

      return res.json({
        source: 'LOCAL',
        order: refreshedOrder
          ? formatOrderForResponse(
              refreshedOrder,
              sswRequireCnpjs,
              intelipostClientId,
            )
          : null,
      });
    }

    const externalResult = await trackingService.searchExternalIdentifier(
      identifier,
      user.companyId,
    );

    if (!externalResult) {
      return res.status(404).json({
        error: 'Nenhum resultado encontrado na SSW ou Intelipost para este identificador.',
      });
    }

    const intelipostClientId = await getCompanyIntelipostClientId(user.companyId);

    return res.json({
      source: externalResult.source,
      order: buildExternalOrderResponse(
        identifier,
        externalResult.source,
        externalResult.result,
        intelipostClientId,
      ),
    });
  } catch (error) {
    console.error('Erro na busca externa:', error);
    return res.status(500).json({ error: 'Erro ao consultar pedido externamente' });
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

    if (order && shouldExcludeOrderFromPlatform(order)) {
      return res.status(404).json({
        success: false,
        message: 'Pedido tratado como logistica do canal.',
      });
    }

    const sswRequireCnpjs = await getCompanySswRequireCnpjs(user.companyId);
    const intelipostClientId = await getCompanyIntelipostClientId(user.companyId);
    const checkoutQuote = order
      ? await loadCheckoutQuoteForOrder(user.companyId, order)
      : null;

    return res.json({
      success: true,
      message: result.message,
      order: order
        ? formatOrderForResponse(
            order,
            sswRequireCnpjs,
            intelipostClientId,
            checkoutQuote,
          )
        : null,
    });
  } catch (error) {
    console.error('Erro ao sincronizar pedido:', error);
    return res.status(500).json({
      error: toUserFacingDatabaseErrorMessage(
        error,
        'Erro ao sincronizar pedido',
      ),
    });
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
    const finishedAt = new Date().toISOString();
    syncJobService.ensureSchedule(user.companyId, user.id);

    let report: any = null;
    try {
      report = await syncReportService.sendTrackingSyncReport({
        companyId: user.companyId,
        userId: user.id,
        userEmail: user.email,
        userName: user.email,
        trigger: 'manual',
        payload: results.report,
        startedAt,
        finishedAt,
      });
    } catch (reportError) {
      console.error('Falha ao enviar relatorio da sincronizacao direta:', reportError);
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
    return res.status(500).json({
      error: toUserFacingDatabaseErrorMessage(
        error,
        'Erro ao sincronizar pedidos',
      ),
    });
  }
};

export const startSyncAllOrders = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const user = req.user;

    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'Acesso negado. Usuario sem empresa.' });
    }

    const job = syncJobService.startJob(user.companyId, user.id, 'manual', {
      email: user.email,
      name: user.email,
    });

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
    const { type, password, companyId } = req.body;

    if (req.user?.email !== 'admin@avantracking.com.br') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (password !== '172839') {
      return res.status(403).json({ error: 'Senha incorreta' });
    }

    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({ error: 'Empresa obrigatoria' });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return res.status(404).json({ error: 'Empresa nao encontrada' });
    }

    if (type === 'ALL') {
      const result = await prisma.order.deleteMany({
        where: { companyId: company.id },
      });
      return res.json({
        message: `Todos os ${result.count} pedidos da empresa ${company.name} foram apagados.`,
      });
    }

    if (type === 'DELIVERED_7_DAYS') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const result = await prisma.order.deleteMany({
        where: {
          companyId: company.id,
          status: OrderStatus.DELIVERED,
          lastUpdate: {
            lt: sevenDaysAgo,
          },
        },
      });
      return res.json({
        message: `${result.count} pedidos entregues ha mais de 7 dias da empresa ${company.name} foram apagados.`,
      });
    }

    return res.status(400).json({ error: 'Tipo de limpeza invalido' });
  } catch (error) {
    console.error('Erro ao limpar banco de dados:', error);
    return res.status(500).json({ error: 'Erro ao limpar banco de dados' });
  }
};


