import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { TrackingService } from './trackingService';
import { importOrdersForCompany } from './orderImportService';

const CLOSED_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.FAILURE,
  OrderStatus.RETURNED,
  OrderStatus.CANCELED,
  OrderStatus.CHANNEL_LOGISTICS,
];

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

const STATUS_SUMMARY_ORDER: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CREATED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERY_ATTEMPT,
  OrderStatus.DELIVERED,
  OrderStatus.FAILURE,
  OrderStatus.RETURNED,
  OrderStatus.CANCELED,
  OrderStatus.CHANNEL_LOGISTICS,
];

const OPTION_MATCH_STOPWORDS = new Set([
  'da',
  'de',
  'do',
  'das',
  'dos',
  'e',
  'em',
  'para',
  'com',
  'pela',
  'pelos',
  'pelas',
  'por',
  'transportadora',
  'transportadoras',
  'transporte',
  'transportes',
  'express',
  'log',
  'logistica',
  'logistics',
  'marketplace',
  'marketplaces',
  'canal',
  'canais',
  'pedidos',
  'pedido',
  'status',
]);

type MatchedFilter = {
  status?: OrderStatus;
  delayedKind?: 'carrier' | 'platform';
  noMovementDays?: number;
  carrierName?: string | null;
  salesChannel?: string | null;
  period?: {
    label: string;
    start: Date;
    endExclusive: Date;
  } | null;
};

type StructuredResult = {
  handled: boolean;
  text?: string;
};

const normalizeText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const getMatchTokens = (value: unknown) =>
  normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !OPTION_MATCH_STOPWORDS.has(token));

const scoreOptionMatch = (option: string, normalizedInput: string) => {
  const normalizedOption = normalizeText(option);
  if (!normalizedOption) {
    return 0;
  }

  let score = 0;

  if (normalizedInput === normalizedOption) {
    score += 1000;
  }

  if (normalizedInput.includes(normalizedOption)) {
    score += 700;
  }

  if (
    normalizedInput.length >= 3 &&
    normalizedOption.includes(normalizedInput)
  ) {
    score += 550;
  }

  const optionTokens = getMatchTokens(normalizedOption);
  const inputTokens = getMatchTokens(normalizedInput);

  let sharedTokens = 0;
  let longestSharedTokenLength = 0;

  for (const optionToken of optionTokens) {
    const matchedToken = inputTokens.find(
      (inputToken) =>
        inputToken === optionToken ||
        inputToken.includes(optionToken) ||
        optionToken.includes(inputToken),
    );

    if (!matchedToken) {
      continue;
    }

    sharedTokens += 1;
    longestSharedTokenLength = Math.max(
      longestSharedTokenLength,
      Math.min(matchedToken.length, optionToken.length),
    );
  }

  if (sharedTokens > 0) {
    score += sharedTokens * 120 + longestSharedTokenLength * 10;

    if (sharedTokens === optionTokens.length && optionTokens.length > 0) {
      score += 180;
    }
  }

  return score;
};

const hasStatusHint = (normalized: string) =>
  STATUS_MATCHERS.some((matcher) =>
    matcher.phrases.some((phrase) => normalized.includes(phrase)),
  );

const hasDelayHint = (normalized: string) =>
  normalized.includes('atras') ||
  normalized.includes('em atraso') ||
  normalized.includes('transportadora') ||
  normalized.includes('plataforma');

const hasGenericDelayTerm = (normalized: string) =>
  normalized.includes('atrasado') ||
  normalized.includes('atrasados') ||
  normalized.includes('em atraso') ||
  normalized.includes('pedidos atrasados');

const hasExplicitPlatformDelayHint = (normalized: string) =>
  normalized.includes('atraso plataforma') ||
  normalized.includes('atrasados plataforma') ||
  normalized.includes('atrasado plataforma') ||
  normalized.includes('em atraso da plataforma') ||
  normalized.includes('em atraso plataforma') ||
  (normalized.includes('plataforma') && hasGenericDelayTerm(normalized));

const hasExplicitCarrierDelayHint = (normalized: string) =>
  normalized.includes('atraso transportadora') ||
  normalized.includes('atrasados transportadora') ||
  normalized.includes('atrasado transportadora') ||
  normalized.includes('atrasados pela') ||
  normalized.includes('atrasado pela') ||
  normalized.includes('atrasados por') ||
  normalized.includes('atrasado por') ||
  (normalized.includes('transportadora') && hasGenericDelayTerm(normalized));

const isAmbiguousDelayRequest = (normalized: string, carrierName?: string | null) =>
  hasGenericDelayTerm(normalized) &&
  !hasExplicitPlatformDelayHint(normalized) &&
  !hasExplicitCarrierDelayHint(normalized) &&
  !carrierName;

const hasNoMovementHint = (normalized: string) =>
  normalized.includes('sem movimentacao') ||
  normalized.includes('sem movimento') ||
  normalized.includes('sem atualizacao');

const hasPeriodHint = (normalized: string) =>
  normalized.includes('hoje') ||
  normalized.includes('ontem') ||
  /(?:nos\s+)?(?:ultimos|uiltimos|ultimas|ultimas)\s+\d+\s*dias?/.test(normalized);

const hasOperationalContextHint = (normalized: string) =>
  normalized.includes('pedido') ||
  normalized.includes('pedidos') ||
  normalized.includes('nf') ||
  normalized.includes('nfs') ||
  normalized.includes('nota fiscal') ||
  normalized.includes('transportadora') ||
  normalized.includes('marketplace') ||
  normalized.includes('canal');

const hasFilterLikeIntent = (normalized: string) =>
  (hasStatusHint(normalized) || hasDelayHint(normalized) || hasNoMovementHint(normalized)) &&
  (hasPeriodHint(normalized) ||
    hasOperationalContextHint(normalized) ||
    normalized.includes('pela ') ||
    normalized.includes('da ') ||
    normalized.includes('do '));

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeCsv = (value: unknown) => {
  const text = String(value ?? '');
  if (/[",;\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const formatDate = (value: Date | null | undefined) =>
  value ? new Date(value).toLocaleString('pt-BR') : '-';

const formatDateOnly = (value: Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString('pt-BR') : '-';

const normalizeDigits = (value: unknown) =>
  String(value || '')
    .replace(/\D/g, '')
    .trim();

const normalizeAlphaNumeric = (value: unknown) =>
  String(value || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .trim();

const safeString = (value: unknown) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const safeDate = (value: unknown) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildIntelipostTrackingUrl = (
  clientId: string | null | undefined,
  orderNumber: string | null | undefined,
) => {
  const normalizedClientId = normalizeDigits(clientId);
  const normalizedOrderNumber = safeString(orderNumber);

  if (!normalizedClientId || !normalizedOrderNumber) {
    return null;
  }

  return `https://status.ondeestameupedido.com/tracking/${normalizedClientId}/${encodeURIComponent(normalizedOrderNumber)}`;
};

const looksLikeXmlIdentifier = (value: unknown) => {
  const normalized = normalizeAlphaNumeric(value);
  return Boolean(
    normalized &&
      (/^\d{44}$/.test(normalized) ||
        (normalized.length >= 20 && /[A-Z]/.test(normalized) && /\d/.test(normalized))),
  );
};

const looksLikeCorreiosObjectCode = (value: unknown) =>
  /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(normalizeAlphaNumeric(value));

const TRACKING_INTENT_TERMS = [
  'rastreio',
  'rastreamento',
  'rastrear',
  'rastreie',
  'rastrei',
  'rastreia',
  'tracking',
  'acompanhar',
  'acompanhe',
  'acompanha',
  'consulta',
  'consultar',
];

type TrackingLookupKind =
  | 'invoice'
  | 'order'
  | 'xml'
  | 'tracking'
  | 'customer'
  | 'generic';

type TrackingLookupRequest = {
  kind: TrackingLookupKind;
  value: string;
  label: string;
};

const stripPoliteTail = (value: string) =>
  value
    .replace(/\b(?:pra mim|para mim|pra mi|para mi|por favor|pfv|pls|please|ai|a[ií])\b.*$/i, '')
    .replace(/[?!.,;:]+$/g, '')
    .trim();

const hasTrackingIntent = (text: string) => {
  const normalized = normalizeText(text);
  return TRACKING_INTENT_TERMS.some((term) => normalized.includes(term));
};

const hasTrackingLinkIntent = (text: string) => {
  const normalized = normalizeText(text);
  return (
    hasTrackingIntent(text) &&
    [
      'abrir',
      'abre',
      'abri',
      'link',
      'url',
      'abrir rastreio',
      'me manda o link',
      'me envie o link',
      'manda o link',
    ].some((term) => normalized.includes(term))
  );
};

const extractTrackingLookupRequest = (text: string): TrackingLookupRequest | null => {
  const rawText = String(text || '').trim();
  const normalized = normalizeText(rawText);

  if (!hasTrackingIntent(rawText)) {
    return null;
  }

  const patternMatches: Array<{
    kind: TrackingLookupKind;
    label: string;
    patterns: RegExp[];
  }> = [
    {
      kind: 'invoice',
      label: 'NF',
      patterns: [
        /(?:nota fiscal|nota|nf)\s*(?:numero|n|no|#|:)?\s*([A-Za-z0-9./-]{3,})/i,
      ],
    },
    {
      kind: 'order',
      label: 'pedido',
      patterns: [
        /(?:pedido)\s*(?:numero|n|no|#|:)?\s*([A-Za-z0-9./-]{3,})/i,
      ],
    },
    {
      kind: 'xml',
      label: 'XML',
      patterns: [
        /(?:xml|chave xml|chave da nota|chave de acesso|chave)\s*(?:numero|n|no|#|:)?\s*([A-Za-z0-9-]{20,})/i,
      ],
    },
    {
      kind: 'tracking',
      label: 'rastreio',
      patterns: [
        /(?:codigo de rastreio|codigo de envio|objeto|rastreio|tracking)\s*(?:numero|n|no|#|:)?\s*([A-Za-z0-9./-]{6,})/i,
      ],
    },
  ];

  for (const matcher of patternMatches) {
    for (const pattern of matcher.patterns) {
      const match = rawText.match(pattern);
      const value = stripPoliteTail(match?.[1] || '');
      if (value) {
        return {
          kind: matcher.kind,
          value,
          label: matcher.label,
        };
      }
    }
  }

  const customerMatch = rawText.match(
    /(?:do|da|de)?\s*cliente\s+(.+)$/i,
  );
  const customerValue = stripPoliteTail(customerMatch?.[1] || '');
  if (customerValue) {
    return {
      kind: 'customer',
      value: customerValue,
      label: 'cliente',
    };
  }

  const tokenCandidates = rawText.match(
    /[A-Za-z]{2}\d{9}[A-Za-z]{2}|\d{4,}|[A-Za-z0-9-]{20,}/g,
  );
  const candidate = tokenCandidates?.[tokenCandidates.length - 1] || '';
  const cleanedCandidate = stripPoliteTail(candidate);

  if (!cleanedCandidate) {
    return null;
  }

  if (looksLikeXmlIdentifier(cleanedCandidate)) {
    return { kind: 'xml', value: cleanedCandidate, label: 'XML' };
  }

  if (looksLikeCorreiosObjectCode(cleanedCandidate)) {
    return { kind: 'tracking', value: cleanedCandidate, label: 'rastreio' };
  }

  if (normalizeDigits(cleanedCandidate)) {
    return { kind: 'generic', value: cleanedCandidate, label: 'identificador' };
  }

  if (normalized.includes('cliente')) {
    return { kind: 'customer', value: cleanedCandidate, label: 'cliente' };
  }

  return null;
};

const mapTrackingEventsToHistory = (trackingEvents: any[] | undefined) =>
  Array.isArray(trackingEvents)
    ? trackingEvents.map((event) => ({
        status: safeString(event?.status) || 'UNKNOWN',
        description: safeString(event?.description) || 'Evento de rastreamento',
        date: safeDate(event?.eventDate || event?.date) || new Date(),
        city: safeString(event?.city) || '',
        state: safeString(event?.state) || '',
      }))
    : [];

const getStoredTrackingUrl = (order: { trackingUrl?: string | null; apiRawPayload?: any }) =>
  safeString(order.trackingUrl) ||
  safeString(order.apiRawPayload?.manualTrackingUrl) ||
  safeString(order.apiRawPayload?.trackingUrl) ||
  safeString(order.apiRawPayload?.logistic_provider?.live_tracking_url) ||
  safeString(order.apiRawPayload?.tracking_url) ||
  null;

const resolveTrackingSourceLabel = (order: {
  trackingSourceLabel?: string | null;
  trackingCode?: string | null;
  apiRawPayload?: any;
}) => {
  if (order.trackingSourceLabel) {
    return order.trackingSourceLabel;
  }

  const source = String(order.apiRawPayload?.source || '').toUpperCase();
  const lookupMode = String(order.apiRawPayload?.lookupMode || '').toUpperCase();
  const trackingUrl = String(getStoredTrackingUrl(order) || '');

  if (source === 'SSW' || /ssw\.inf\.br/i.test(trackingUrl)) {
    if (lookupMode === 'XML_KEY') {
      return 'SSW com Codigo XML';
    }
    if (lookupMode === 'TRACKING_CODE') {
      return 'SSW com codigo envio/NF';
    }
    return 'SSW com NF';
  }

  if (source === 'CORREIOS' || /correios/i.test(trackingUrl)) {
    return 'Correios';
  }

  if (
    source === 'INTELIPOST' ||
    /ondeestameupedido\.com|intelipost/i.test(trackingUrl)
  ) {
    return 'Intelipost';
  }

  return 'Nao identificado';
};

const splitDocumentFields = (value: unknown) => {
  const normalized = normalizeDigits(value);
  if (!normalized) {
    return {
      cpf: null as string | null,
      cnpj: null as string | null,
    };
  }

  if (normalized.length === 14) {
    return { cpf: null, cnpj: normalized };
  }

  return { cpf: normalized, cnpj: null };
};

const mapIntelipostStatusToOrderStatus = (value: string) => {
  const normalized = normalizeText(value).toUpperCase();

  if (
    normalized.includes('SAIU PARA ENTREGA') ||
    normalized.includes('DELIVERY_ATTEMPT') ||
    normalized.includes('TO_BE_DELIVERED')
  ) {
    return OrderStatus.DELIVERY_ATTEMPT;
  }

  if (normalized.includes('ENTREGUE') || normalized.includes('DELIVERED')) {
    return OrderStatus.DELIVERED;
  }

  if (
    normalized.includes('EM TRANSITO') ||
    normalized.includes('TRANSITO') ||
    normalized.includes('SHIPPED') ||
    normalized.includes('IN TRANSIT')
  ) {
    return OrderStatus.SHIPPED;
  }

  if (
    normalized.includes('CRIADO') ||
    normalized.includes('CREATED') ||
    normalized.includes('NEW')
  ) {
    return OrderStatus.CREATED;
  }

  if (
    normalized.includes('FALHA') ||
    normalized.includes('FAILURE') ||
    normalized.includes('CLARIFY_DELIVERY_FAIL')
  ) {
    return OrderStatus.FAILURE;
  }

  return OrderStatus.PENDING;
};

const getPublicBaseUrl = () => {
  const configuredBaseUrl = String(
    process.env.APP_BASE_URL ||
      process.env.FRONTEND_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      '',
  ).trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  return `http://localhost:${process.env.PORT || '3000'}`;
};

const getReportsDir = () =>
  path.join(__dirname, '../../public/reports/chat-insights');

const STATUS_MATCHERS: Array<{ phrases: string[]; status: OrderStatus; title: string }> = [
  {
    phrases: ['falha na entrega', 'falhas na entrega', 'falha de entrega'],
    status: OrderStatus.FAILURE,
    title: 'pedidos com falha na entrega',
  },
  {
    phrases: ['saiu para entrega', 'em rota', 'rota de entrega'],
    status: OrderStatus.DELIVERY_ATTEMPT,
    title: 'pedidos que sairam para entrega',
  },
  {
    phrases: ['em transito', 'transito', 'em transporte'],
    status: OrderStatus.SHIPPED,
    title: 'pedidos em transito',
  },
  {
    phrases: ['entregue', 'entregues'],
    status: OrderStatus.DELIVERED,
    title: 'pedidos entregues',
  },
  {
    phrases: ['devolvido', 'devolvidos'],
    status: OrderStatus.RETURNED,
    title: 'pedidos devolvidos',
  },
  {
    phrases: ['cancelado', 'cancelados'],
    status: OrderStatus.CANCELED,
    title: 'pedidos cancelados',
  },
  {
    phrases: ['logistica do canal'],
    status: OrderStatus.CHANNEL_LOGISTICS,
    title: 'pedidos em logistica do canal',
  },
  {
    phrases: ['pendente', 'pendentes'],
    status: OrderStatus.PENDING,
    title: 'pedidos pendentes',
  },
  {
    phrases: ['criado', 'criados'],
    status: OrderStatus.CREATED,
    title: 'pedidos criados',
  },
];

const isStructuredIntent = (text: string) => {
  const normalized = normalizeText(text);

  return (
    [
    'relatorio',
    'relatorio com',
    'me envie',
    'me envia',
    'gere um relatorio',
    'gerar relatorio',
    'monta um relatorio',
    'exporta',
    'csv',
    'html',
    'quantos',
    'quantidade',
    'qtd',
    'total de pedidos',
    'numero de pedidos',
    'lista de pedidos',
    'listar pedidos',
    'mostrar pedidos',
    ].some((term) => normalized.includes(term)) || hasFilterLikeIntent(normalized)
  );
};

const resolveIntentKind = (text: string) => {
  const normalized = normalizeText(text);

  if (
    normalized.includes('relatorio') ||
    normalized.includes('me envie') ||
    normalized.includes('me envia') ||
    normalized.includes('gere') ||
    normalized.includes('exporta') ||
    normalized.includes('csv') ||
    normalized.includes('html') ||
    normalized.includes('lista de pedidos') ||
    normalized.includes('listar pedidos') ||
    normalized.includes('mostrar pedidos')
  ) {
    return 'report' as const;
  }

  return 'count' as const;
};

const resolvePeriodFilter = (text: string) => {
  const normalized = normalizeText(text);
  const now = new Date();

  if (normalized.includes('ontem')) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const endExclusive = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      label: 'ontem',
      start,
      endExclusive,
    };
  }

  if (normalized.includes('hoje')) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endExclusive = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return {
      label: 'hoje',
      start,
      endExclusive,
    };
  }

  const lastDaysMatch = normalized.match(
    /(?:(?:nos|das|ha)\s+)?(?:ultimos|uiltimos|ultimas)\s+(\d+)\s*dias?/,
  );
  if (lastDaysMatch) {
    const days = Number(lastDaysMatch[1]);
    if (Number.isFinite(days) && days > 0) {
      const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      return {
        label: `nos ultimos ${days} dias`,
        start,
        endExclusive: now,
      };
    }
  }

  return null;
};

const buildStatusEventFilter = (status: OrderStatus, period: NonNullable<MatchedFilter['period']>) => {
  const containsAny = (...values: string[]) =>
    values.map((value) => ({
      contains: value,
      mode: 'insensitive' as const,
    }));

  if (status === OrderStatus.DELIVERED) {
    return {
      some: {
        eventDate: {
          gte: period.start,
          lt: period.endExclusive,
        },
        OR: [
          { status: { in: ['DELIVERED', 'ENTREGUE'] } },
          ...containsAny('DELIVERED').map((item) => ({ status: item })),
          ...containsAny('ENTREGUE').map((item) => ({ description: item })),
        ],
      },
    };
  }

  if (status === OrderStatus.SHIPPED) {
    return {
      some: {
        eventDate: {
          gte: period.start,
          lt: period.endExclusive,
        },
        OR: [
          ...containsAny('SHIPPED', 'TRANSIT').map((item) => ({ status: item })),
          ...containsAny('EM TRANSITO', 'TRANSITO').map((item) => ({
            description: item,
          })),
        ],
      },
    };
  }

  if (status === OrderStatus.DELIVERY_ATTEMPT) {
    return {
      some: {
        eventDate: {
          gte: period.start,
          lt: period.endExclusive,
        },
        OR: [
          ...containsAny('DELIVERY_ATTEMPT', 'TO_BE_DELIVERED').map((item) => ({
            status: item,
          })),
          ...containsAny('SAIU PARA ENTREGA', 'ROTA').map((item) => ({
            description: item,
          })),
        ],
      },
    };
  }

  if (status === OrderStatus.FAILURE) {
    return {
      some: {
        eventDate: {
          gte: period.start,
          lt: period.endExclusive,
        },
        OR: [
          ...containsAny('FAILURE', 'FALHA').map((item) => ({ status: item })),
          ...containsAny('FALHA').map((item) => ({ description: item })),
        ],
      },
    };
  }

  return {
    some: {
      eventDate: {
        gte: period.start,
        lt: period.endExclusive,
      },
    },
  };
};

const buildWhereClause = (companyId: string, filter: MatchedFilter) => {
  const now = new Date();
  const where: any = { companyId };

  if (filter.status) {
    where.status = filter.status;
  }

  if (filter.delayedKind === 'carrier') {
    where.status = { notIn: CLOSED_STATUSES };
    where.OR = [
      { isDelayed: true },
      { carrierEstimatedDeliveryDate: { lt: now } },
    ];
  }

  if (filter.delayedKind === 'platform') {
    where.status = { notIn: CLOSED_STATUSES };
    where.estimatedDeliveryDate = { lt: now };
  }

  if (filter.noMovementDays) {
    const minDate = new Date(now.getTime() - filter.noMovementDays * 24 * 60 * 60 * 1000);
    where.status = { notIn: CLOSED_STATUSES };
    where.lastUpdate = { lt: minDate };
  }

  if (filter.carrierName) {
    where.freightType = filter.carrierName;
  }

  if (filter.salesChannel) {
    where.salesChannel = filter.salesChannel;
  }

  if (filter.period) {
    if (filter.status) {
      where.trackingEvents = buildStatusEventFilter(filter.status, filter.period);
    } else {
      where.lastUpdate = {
        gte: filter.period.start,
        lt: filter.period.endExclusive,
      };
    }
  }

  return where;
};

const buildFilterLabel = (filter: MatchedFilter) => {
  let baseLabel = 'pedidos';

  if (filter.delayedKind === 'platform') {
    baseLabel = 'pedidos em atraso da plataforma';
  } else if (filter.delayedKind === 'carrier') {
    baseLabel = 'pedidos atrasados pela transportadora';
  } else if (filter.noMovementDays) {
    baseLabel = `pedidos sem movimentacao ha ${filter.noMovementDays} dias`;
  } else if (filter.status) {
    baseLabel = `pedidos com status ${STATUS_LABELS[filter.status] || filter.status}`;
  }

  const details: string[] = [baseLabel];

  if (filter.carrierName) {
    details.push(`da transportadora ${filter.carrierName}`);
  }

  if (filter.salesChannel) {
    details.push(`do marketplace ${filter.salesChannel}`);
  }

  if (filter.period) {
    details.push(filter.period.label);
  }

  return details.join(' ');
};

const buildReportHtml = (input: {
  companyName: string;
  filterLabel: string;
  total: number;
  generatedAt: Date;
  orders: Array<{
    orderNumber: string;
    invoiceNumber: string | null;
    customerName: string;
    status: OrderStatus;
    salesChannel: string;
    freightType: string | null;
    trackingCode: string | null;
    estimatedDeliveryDate: Date | null;
    carrierEstimatedDeliveryDate: Date | null;
    lastUpdate: Date;
  }>;
}) => `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Relatorio do chat - ${escapeHtml(input.companyName)}</title>
  </head>
  <body style="margin:0;padding:32px;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <div style="max-width:1120px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;">
      <div style="padding:28px 32px;background:linear-gradient(135deg,#1d4ed8,#0f172a);color:#ffffff;">
        <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:0.8;">Relatorio gerado pela Muricoca</div>
        <h1 style="margin:12px 0 6px;font-size:30px;line-height:1.1;">${escapeHtml(input.filterLabel)}</h1>
        <div style="font-size:14px;opacity:0.88;">Empresa: ${escapeHtml(input.companyName)} | Gerado em: ${escapeHtml(formatDate(input.generatedAt))}</div>
      </div>
      <div style="padding:24px 32px;">
        <div style="margin-bottom:20px;padding:18px;border-radius:18px;background:#eff6ff;border:1px solid #bfdbfe;">
          <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1d4ed8;font-weight:700;">Total localizado</div>
          <div style="margin-top:8px;font-size:32px;font-weight:700;">${input.total}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f8fafc;text-align:left;">
              <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Pedido</th>
              <th style="padding:12px;border-bottom:1px solid #e2e8f0;">NF</th>
              <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Cliente</th>
              <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Status</th>
              <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Marketplace</th>
              <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Transportadora</th>
              <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Rastreio</th>
              <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Prev. plataforma</th>
              <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Prev. transportadora</th>
              <th style="padding:12px;border-bottom:1px solid #e2e8f0;">Ultima mov.</th>
            </tr>
          </thead>
          <tbody>
            ${input.orders
              .map(
                (order) => `
                  <tr>
                    <td style="padding:12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(order.orderNumber)}</td>
                    <td style="padding:12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(order.invoiceNumber || '-')}</td>
                    <td style="padding:12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(order.customerName)}</td>
                    <td style="padding:12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(STATUS_LABELS[order.status] || order.status)}</td>
                    <td style="padding:12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(order.salesChannel)}</td>
                    <td style="padding:12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(order.freightType || '-')}</td>
                    <td style="padding:12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(order.trackingCode || '-')}</td>
                    <td style="padding:12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(formatDate(order.estimatedDeliveryDate))}</td>
                    <td style="padding:12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(formatDate(order.carrierEstimatedDeliveryDate))}</td>
                    <td style="padding:12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(formatDate(order.lastUpdate))}</td>
                  </tr>
                `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  </body>
</html>`;

const buildReportCsv = (
  orders: Array<{
    orderNumber: string;
    invoiceNumber: string | null;
    customerName: string;
    status: OrderStatus;
    salesChannel: string;
    freightType: string | null;
    trackingCode: string | null;
    estimatedDeliveryDate: Date | null;
    carrierEstimatedDeliveryDate: Date | null;
    lastUpdate: Date;
  }>,
) =>
  [
    [
      'Pedido',
      'NF',
      'Cliente',
      'Status',
      'Marketplace',
      'Transportadora',
      'Rastreio',
      'Previsao Plataforma',
      'Previsao Transportadora',
      'Ultima Movimentacao',
    ],
    ...orders.map((order) => [
      order.orderNumber,
      order.invoiceNumber || '',
      order.customerName,
      STATUS_LABELS[order.status] || order.status,
      order.salesChannel,
      order.freightType || '',
      order.trackingCode || '',
      formatDate(order.estimatedDeliveryDate),
      formatDate(order.carrierEstimatedDeliveryDate),
      formatDate(order.lastUpdate),
    ]),
  ]
    .map((line) => line.map((value) => escapeCsv(value)).join(';'))
    .join('\n');

const buildAmbiguousPrompt = () =>
  [
    'Posso consultar isso para voce na base da plataforma, mas preciso confirmar o foco do relatorio.',
    '',
    'Voce quer um relatorio de:',
    '- pedidos por status, como Entregue, Em transito ou Falha na entrega',
    '- pedidos atrasados pela transportadora',
    '- pedidos em atraso da plataforma',
    '- pedidos sem movimentacao',
    '- pedidos de uma transportadora especifica',
    '- pedidos de um marketplace especifico',
  ].join('\n');

const buildDelayClarificationPrompt = () =>
  [
    'Posso consultar os pedidos atrasados para voce, mas preciso confirmar o tipo de atraso.',
    '',
    'Voce quer ver:',
    '- atraso da plataforma',
    '- atraso da transportadora',
    '',
    'Se quiser, ja pode responder por exemplo:',
    '- pedidos atrasados da plataforma',
    '- pedidos atrasados da transportadora',
  ].join('\n');

class ChatAssistantService {
  private trackingService = new TrackingService();

  private buildTrackingSummary(order: {
    orderNumber: string;
    invoiceNumber?: string | null;
    trackingCode?: string | null;
    customerName: string;
    recipient?: string | null;
    freightType?: string | null;
    status: OrderStatus;
    estimatedDeliveryDate?: Date | null;
    carrierEstimatedDeliveryDate?: Date | null;
    trackingUrl?: string | null;
    trackingSourceLabel?: string | null;
    apiRawPayload?: any;
    trackingEvents?: any[];
  }) {
    const trackingHistory = mapTrackingEventsToHistory(order.trackingEvents);
    const latestEvent = trackingHistory
      .slice()
      .sort(
        (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
      )[0];
    const latestLocation =
      latestEvent && (latestEvent.city || latestEvent.state)
        ? ` (${[latestEvent.city, latestEvent.state].filter(Boolean).join('/')})`
        : '';
    const trackingUrl = getStoredTrackingUrl(order);
    const lines = [
      `Encontrei o rastreio atual do pedido ${order.orderNumber}.`,
      `- Cliente: ${order.customerName || '-'}`,
      `- Destinatario: ${order.recipient || '-'}`,
      `- Status atual: ${STATUS_LABELS[order.status] || order.status}`,
      `- Fonte do rastreio: ${resolveTrackingSourceLabel(order)}`,
      `- Transportadora: ${order.freightType || '-'}`,
      `- NF: ${order.invoiceNumber || '-'}`,
      `- Codigo de envio: ${order.trackingCode || '-'}`,
      `- Prazo da plataforma: ${formatDateOnly(order.estimatedDeliveryDate || null)}`,
      `- Prazo da transportadora: ${formatDateOnly(order.carrierEstimatedDeliveryDate || null)}`,
      latestEvent
        ? `- Ultima movimentacao: ${formatDate(latestEvent.date)} - ${latestEvent.description}${latestLocation}`
        : '- Ultima movimentacao: sem historico de rastreio',
    ];

    if (trackingUrl) {
      lines.push(`- Link de rastreio: ${trackingUrl}`);
    }

    return lines.join('\n');
  }

  private buildTrackingLinkReply(order: {
    orderNumber: string;
    trackingUrl?: string | null;
    apiRawPayload?: any;
  }) {
    const trackingUrl = getStoredTrackingUrl(order);

    if (!trackingUrl) {
      return `Nao encontrei um link direto de rastreio para o pedido ${order.orderNumber}.`;
    }

    return [
      `Aqui esta o link direto de rastreio do pedido ${order.orderNumber}:`,
      trackingUrl,
    ].join('\n');
  }

  private buildCustomerDisambiguation(
    customerName: string,
    orders: Array<{
      orderNumber: string;
      invoiceNumber: string | null;
      customerName: string;
      status: OrderStatus;
      lastUpdate: Date;
    }>,
  ) {
    return [
      `Encontrei mais de um pedido para o cliente ${customerName}.`,
      '',
      ...orders.slice(0, 5).map(
        (order, index) =>
          `${index + 1}. Pedido ${order.orderNumber} | NF ${order.invoiceNumber || '-'} | ${STATUS_LABELS[order.status] || order.status} | Ultima mov. ${formatDate(order.lastUpdate)}`,
      ),
      '',
      'Se quiser, me peça por numero do pedido, NF ou XML para eu trazer o rastreio exato.',
    ].join('\n');
  }

  private buildExternalOrderPayload(
    request: TrackingLookupRequest,
    source: 'SSW' | 'INTELIPOST' | 'CORREIOS',
    result: any,
  ) {
    if (source === 'SSW') {
      const events = Array.isArray(result.events) ? result.events : [];
      const latestEvent = events
        .slice()
        .sort((left, right) => right.eventDate.getTime() - left.eventDate.getTime())[0];
      const recipientName =
        safeString(result.matchMetadata?.recipientName) ||
        safeString(result.matchMetadata?.deliveredToName) ||
        'Consulta externa';
      const documentFields = splitDocumentFields(
        safeString(result.matchMetadata?.deliveredToDocument) ||
          safeString(result.matchMetadata?.recipientDocument),
      );
      const trackingUrl = safeString(result.rawPayload?.trackingUrl);

      return {
        orderNumber: request.kind === 'order' ? request.value : request.value,
        invoiceNumber:
          String(result.lookupMode || '').toUpperCase() === 'INVOICE'
            ? normalizeDigits(request.value)
            : null,
        trackingCode:
          String(result.lookupMode || '').toUpperCase() === 'XML_KEY'
            ? normalizeAlphaNumeric(request.value)
            : String(result.lookupMode || '').toUpperCase() === 'TRACKING_CODE'
              ? normalizeDigits(request.value)
              : null,
        customerName: recipientName,
        corporateName: null,
        cpf: documentFields.cpf,
        cnpj: documentFields.cnpj,
        phone: null,
        mobile: null,
        salesChannel: 'Externo',
        freightType: safeString(result.freightType) || 'SSW',
        freightValue: 0,
        shippingDate: latestEvent?.eventDate || new Date(),
        address: '',
        number: '',
        complement: null,
        neighborhood: '',
        city: safeString(result.matchMetadata?.destinationCity) || latestEvent?.city || '',
        state: safeString(result.matchMetadata?.destinationState) || latestEvent?.state || '',
        zipCode: '',
        totalValue: 0,
        recipient: recipientName,
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
        apiRawPayload: {
          source: 'SSW',
          lookupMode: result.lookupMode || 'INVOICE',
          trackingUrl,
          matchMetadata: result.matchMetadata ?? null,
          rawPayload: result.rawPayload ?? null,
        },
      };
    }

    if (source === 'CORREIOS') {
      const events = Array.isArray(result.events) ? result.events : [];
      const latestEvent = events[0] || null;
      const trackingCode = normalizeAlphaNumeric(result.objectCode || request.value);
      const trackingUrl = safeString(result.trackingUrl);

      return {
        orderNumber: trackingCode || request.value,
        invoiceNumber: null,
        trackingCode,
        customerName: 'Consulta externa',
        corporateName: null,
        cpf: null,
        cnpj: null,
        phone: null,
        mobile: null,
        salesChannel: 'Externo',
        freightType: 'Correios',
        freightValue: 0,
        shippingDate: latestEvent?.eventDate || new Date(),
        address: '',
        number: '',
        complement: null,
        neighborhood: '',
        city: safeString(latestEvent?.city) || '',
        state: safeString(latestEvent?.state) || '',
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
        apiRawPayload: {
          source: 'CORREIOS',
          trackingUrl,
          objectCode: trackingCode,
          rawPayload: result.rawPayload ?? null,
        },
      };
    }

    const trackingHistory = Array.isArray(result?.tracking?.history)
      ? result.tracking.history.map((historyItem: any) => ({
          status: safeString(historyItem?.macro_state?.code) || 'UNKNOWN',
          description:
            safeString(historyItem?.provider_message) ||
            safeString(historyItem?.status_label) ||
            'Evento de rastreamento',
          date: safeDate(historyItem?.event_date) || new Date(),
          city: safeString(result?.end_customer?.address?.city) || '',
          state: safeString(result?.end_customer?.address?.state) || '',
        }))
      : [];
    const latestEvent = trackingHistory
      .slice()
      .sort(
        (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
      )[0];
    const resolvedOrderNumber = safeString(result?.order?.order_number) || request.value;
    const trackingUrl = buildIntelipostTrackingUrl(
      safeString(result?.client?.id),
      resolvedOrderNumber,
    );

    return {
      orderNumber: resolvedOrderNumber,
      invoiceNumber: null,
      trackingCode: null,
      customerName: 'Consulta externa',
      corporateName: null,
      cpf: null,
      cnpj: null,
      phone: null,
      mobile: null,
      salesChannel: 'Externo',
      freightType: safeString(result?.logistic_provider?.name) || 'Desconhecida',
      freightValue: 0,
      shippingDate: latestEvent?.date || new Date(),
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
      status: mapIntelipostStatusToOrderStatus(
        [
          safeString(result?.tracking?.status),
          safeString(result?.tracking?.status_label),
          safeString(trackingHistory[0]?.status),
          safeString(trackingHistory[0]?.description),
        ]
          .filter(Boolean)
          .join(' '),
      ),
      isDelayed: false,
      trackingHistory,
      apiRawPayload: {
        source: 'INTELIPOST',
        trackingUrl,
        tracking: result?.tracking ?? null,
        logistic_provider: result?.logistic_provider ?? null,
        end_customer: result?.end_customer ?? null,
        client: result?.client ?? null,
        rawPayload: result ?? null,
      },
    };
  }

  private async fetchTrackingOrderById(orderId: string) {
    return prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        invoiceNumber: true,
        trackingCode: true,
        customerName: true,
        recipient: true,
        freightType: true,
        status: true,
        estimatedDeliveryDate: true,
        carrierEstimatedDeliveryDate: true,
        apiRawPayload: true,
        trackingEvents: {
          orderBy: { eventDate: 'desc' },
          take: 20,
          select: {
            status: true,
            description: true,
            city: true,
            state: true,
            eventDate: true,
          },
        },
      },
    });
  }

  async tryHandleTrackingRequest(input: {
    companyId: string | null | undefined;
    text: string;
  }): Promise<StructuredResult> {
    const shouldReturnLink = hasTrackingLinkIntent(input.text);
    const request = extractTrackingLookupRequest(input.text);
    if (!request) {
      return { handled: false };
    }

    if (!input.companyId) {
      return {
        handled: true,
        text: 'Nao encontrei uma empresa ativa para consultar o rastreio deste chat.',
      };
    }

    if (request.kind === 'customer') {
      const matches = await prisma.order.findMany({
        where: {
          companyId: input.companyId,
          OR: [
            { customerName: { contains: request.value, mode: 'insensitive' } },
            { corporateName: { contains: request.value, mode: 'insensitive' } },
            { recipient: { contains: request.value, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          orderNumber: true,
          invoiceNumber: true,
          customerName: true,
          status: true,
          lastUpdate: true,
        },
        orderBy: [{ lastUpdate: 'desc' }],
        take: 6,
      });

      if (matches.length === 0) {
        return {
          handled: true,
          text: `Nao encontrei pedido para o cliente ${request.value} na empresa ativa.`,
        };
      }

      if (matches.length > 1) {
        return {
          handled: true,
          text: this.buildCustomerDisambiguation(request.value, matches),
        };
      }

      const match = matches[0];
      await this.trackingService
        .syncOrder(match.id, input.companyId, { forceFinalized: true })
        .catch(() => null);
      const refreshedOrder = await this.fetchTrackingOrderById(match.id);

      return {
        handled: true,
        text: refreshedOrder
          ? shouldReturnLink
            ? this.buildTrackingLinkReply(refreshedOrder)
            : this.buildTrackingSummary(refreshedOrder)
          : `Nao consegui montar o rastreio do cliente ${request.value} agora.`,
      };
    }

    const normalizedDigits = normalizeDigits(request.value);
    const normalizedAlphaNumeric = normalizeAlphaNumeric(request.value);
    const localMatches = await prisma.order.findMany({
      where: {
        companyId: input.companyId,
        OR: [
          { orderNumber: request.value },
          ...(normalizedDigits ? [{ orderNumber: normalizedDigits }] : []),
          ...(normalizedDigits ? [{ invoiceNumber: normalizedDigits }] : []),
          ...(normalizedDigits ? [{ trackingCode: normalizedDigits }] : []),
          ...(normalizedAlphaNumeric ? [{ trackingCode: normalizedAlphaNumeric }] : []),
        ],
      },
      select: {
        id: true,
        lastUpdate: true,
      },
      orderBy: [{ lastUpdate: 'desc' }],
      take: 1,
    });

    if (localMatches[0]?.id) {
      await this.trackingService
        .syncOrder(localMatches[0].id, input.companyId, { forceFinalized: true })
        .catch(() => null);
      const refreshedOrder = await this.fetchTrackingOrderById(localMatches[0].id);

      return {
        handled: true,
        text: refreshedOrder
          ? shouldReturnLink
            ? this.buildTrackingLinkReply(refreshedOrder)
            : this.buildTrackingSummary(refreshedOrder)
          : `Nao consegui montar o rastreio de ${request.label} ${request.value} agora.`,
      };
    }

    const externalResult = await this.trackingService.searchExternalIdentifier(
      request.value,
      input.companyId,
    );

    if (!externalResult) {
      return {
        handled: true,
        text: `Nao encontrei rastreio para ${request.label} ${request.value} nas integradoras ativas nem na base local.`,
      };
    }

    const externalOrderPayload = this.buildExternalOrderPayload(
      request,
      externalResult.source,
      externalResult.result,
    );
    await importOrdersForCompany(input.companyId, [externalOrderPayload]);

    const savedOrder = await prisma.order.findFirst({
      where: {
        companyId: input.companyId,
        orderNumber: String(externalOrderPayload.orderNumber),
      },
      select: {
        id: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const orderForSummary = savedOrder?.id
      ? await this.fetchTrackingOrderById(savedOrder.id)
      : {
          ...externalOrderPayload,
          trackingUrl: getStoredTrackingUrl(externalOrderPayload),
          trackingSourceLabel: resolveTrackingSourceLabel(externalOrderPayload),
          trackingEvents: Array.isArray(externalOrderPayload.trackingHistory)
            ? externalOrderPayload.trackingHistory.map((event) => ({
                ...event,
                eventDate: event.date,
              }))
            : [],
        };

    return {
      handled: true,
      text: orderForSummary
        ? shouldReturnLink
          ? this.buildTrackingLinkReply(orderForSummary as any)
          : this.buildTrackingSummary(orderForSummary as any)
        : `Nao consegui montar o rastreio de ${request.label} ${request.value} agora.`,
    };
  }

  private async buildCarrierStatusSummary(companyId: string, filter: MatchedFilter) {
    if (!filter.carrierName) {
      return null;
    }

    const summaryBaseFilter: MatchedFilter = {
      carrierName: filter.carrierName,
      salesChannel: filter.salesChannel || null,
      period: filter.period || null,
    };

    const statusRows = await prisma.order.groupBy({
      by: ['status'],
      where: buildWhereClause(companyId, summaryBaseFilter),
      _count: {
        _all: true,
      },
    });

    const countsByStatus = new Map<OrderStatus, number>(
      statusRows.map((row) => [row.status as OrderStatus, row._count._all]),
    );

    const carrierDelayedCount = await prisma.order.count({
      where: buildWhereClause(companyId, {
        ...summaryBaseFilter,
        delayedKind: 'carrier',
      }),
    });

    const platformDelayedCount = await prisma.order.count({
      where: buildWhereClause(companyId, {
        ...summaryBaseFilter,
        delayedKind: 'platform',
      }),
    });

    return [
      `Resumo por status da transportadora ${filter.carrierName}:`,
      `- Atraso Transportadora: ${carrierDelayedCount}`,
      `- Atraso Plataforma: ${platformDelayedCount}`,
      ...STATUS_SUMMARY_ORDER.map(
        (status) =>
          `- ${STATUS_LABELS[status] || status}: ${countsByStatus.get(status) || 0}`,
      ),
    ].join('\n');
  }

  private async resolveExactCarrierName(companyId: string, normalizedInput: string) {
    const carriers = await prisma.order.findMany({
      where: {
        companyId,
        freightType: {
          not: null,
        },
      },
      select: { freightType: true },
      distinct: ['freightType'],
      take: 200,
    });

    const matches = carriers
      .map((carrier) => String(carrier.freightType || '').trim())
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);

    const bestMatch = matches
      .map((carrier) => ({
        carrier,
        score: scoreOptionMatch(carrier, normalizedInput),
      }))
      .sort((left, right) => right.score - left.score)[0];

    return bestMatch && bestMatch.score >= 120 ? bestMatch.carrier : null;
  }

  private async resolveExactMarketplaceName(companyId: string, normalizedInput: string) {
    const channels = await prisma.order.findMany({
      where: { companyId },
      select: { salesChannel: true },
      distinct: ['salesChannel'],
      take: 200,
    });

    const matches = channels
      .map((channel) => String(channel.salesChannel || '').trim())
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);

    const bestMatch = matches
      .map((channel) => ({
        channel,
        score: scoreOptionMatch(channel, normalizedInput),
      }))
      .sort((left, right) => right.score - left.score)[0];

    return bestMatch && bestMatch.score >= 120 ? bestMatch.channel : null;
  }

  private async resolveFilters(companyId: string, input: string): Promise<MatchedFilter | null> {
    const normalized = normalizeText(input);
    const filter: MatchedFilter = {};
    filter.period = resolvePeriodFilter(input);

    if (hasExplicitPlatformDelayHint(normalized)) {
      filter.delayedKind = 'platform';
    }

    if (hasExplicitCarrierDelayHint(normalized)) {
      if (filter.delayedKind !== 'platform') {
        filter.delayedKind = 'carrier';
      }
    }

    if (
      normalized.includes('sem movimentacao') ||
      normalized.includes('sem movimento') ||
      normalized.includes('sem atualizacao')
    ) {
      const daysMatch = normalized.match(/(\d+)\s*dias?/);
      filter.noMovementDays = daysMatch ? Number(daysMatch[1]) : 5;
    }

    for (const matcher of STATUS_MATCHERS) {
      if (matcher.phrases.some((phrase) => normalized.includes(phrase))) {
        filter.status = matcher.status;
        break;
      }
    }

    const carrierName = await this.resolveExactCarrierName(companyId, normalized);
    if (carrierName) {
      filter.carrierName = carrierName;
    }

    if (
      !filter.delayedKind &&
      carrierName &&
      hasGenericDelayTerm(normalized)
    ) {
      filter.delayedKind = 'carrier';
    }

    const salesChannel = await this.resolveExactMarketplaceName(companyId, normalized);
    if (salesChannel) {
      filter.salesChannel = salesChannel;
    }

    if (
      filter.status ||
      filter.delayedKind ||
      filter.noMovementDays ||
      filter.carrierName ||
      filter.salesChannel
    ) {
      return filter;
    }

    if (normalized.includes('todos os pedidos') || normalized === 'relatorio') {
      return {};
    }

    return null;
  }

  async tryHandleStructuredRequest(input: {
    companyId: string | null | undefined;
    userId?: string | null;
    text: string;
  }): Promise<StructuredResult> {
    if (!isStructuredIntent(input.text)) {
      return { handled: false };
    }

    if (!input.companyId) {
      return {
        handled: true,
        text: 'Nao encontrei uma empresa ativa para consultar os pedidos deste chat.',
      };
    }

    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!company) {
      return {
        handled: true,
        text: 'Nao encontrei a empresa ativa para consultar os pedidos agora.',
      };
    }

    const filter = await this.resolveFilters(company.id, input.text);
    if (!filter) {
      const normalizedInput = normalizeText(input.text);
      const inferredCarrier = await this.resolveExactCarrierName(
        company.id,
        normalizedInput,
      );

      if (isAmbiguousDelayRequest(normalizedInput, inferredCarrier)) {
        return {
          handled: true,
          text: buildDelayClarificationPrompt(),
        };
      }

      return {
        handled: true,
        text: buildAmbiguousPrompt(),
      };
    }

    const filterLabel = buildFilterLabel(filter);
    const where = buildWhereClause(company.id, filter);
    const intentKind = resolveIntentKind(input.text);

    const count = await prisma.order.count({ where });

    if (intentKind === 'count') {
      return {
        handled: true,
        text:
          count === 0
            ? `Hoje nao encontrei ${filterLabel} na empresa ${company.name}.`
            : `Hoje existem ${count} ${filterLabel} na empresa ${company.name}.\n\nSe quiser, eu tambem posso montar um relatorio completo disso para voce.`,
      };
    }

    if (count === 0) {
      return {
        handled: true,
        text: `Nao encontrei registros para ${filterLabel} na empresa ${company.name}.`,
      };
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: [{ lastUpdate: 'desc' }],
      select: {
        orderNumber: true,
        invoiceNumber: true,
        customerName: true,
        status: true,
        salesChannel: true,
        freightType: true,
        trackingCode: true,
        estimatedDeliveryDate: true,
        carrierEstimatedDeliveryDate: true,
        lastUpdate: true,
      },
    });

    const generatedAt = new Date();
    const reportId = crypto.randomUUID();
    const baseUrl = getPublicBaseUrl();
    const reportsDir = getReportsDir();
    const htmlUrl = `${baseUrl}/reports/chat-insights/${reportId}.html`;
    const csvUrl = `${baseUrl}/reports/chat-insights/${reportId}.csv`;

    await fs.mkdir(reportsDir, { recursive: true });
    await Promise.all([
      fs.writeFile(
        path.join(reportsDir, `${reportId}.html`),
        buildReportHtml({
          companyName: company.name,
          filterLabel,
          total: count,
          generatedAt,
          orders,
        }),
        'utf8',
      ),
      fs.writeFile(
        path.join(reportsDir, `${reportId}.csv`),
        buildReportCsv(orders),
        'utf8',
      ),
    ]);

    const carrierStatusSummary = await this.buildCarrierStatusSummary(
      company.id,
      filter,
    );

    return {
      handled: true,
      text: [
        `Preparei um relatorio com ${count} ${filterLabel} na empresa ${company.name}.`,
        ...(carrierStatusSummary ? ['', carrierStatusSummary] : []),
        '',
        `Relatorio HTML: ${htmlUrl}`,
        `CSV: ${csvUrl}`,
      ].join('\n'),
    };
  }
}

export const chatAssistantService = new ChatAssistantService();
