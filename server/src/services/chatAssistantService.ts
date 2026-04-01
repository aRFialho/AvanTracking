import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

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

  return [
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
  ].some((term) => normalized.includes(term));
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

  const lastDaysMatch = normalized.match(/(?:nos|nos ultimos|ultimos)\s+(\d+)\s*dias?/);
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

class ChatAssistantService {
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

    return (
      matches.find((carrier) => {
        const normalizedCarrier = normalizeText(carrier);
        return normalizedCarrier && normalizedInput.includes(normalizedCarrier);
      }) || null
    );
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

    return (
      matches.find((channel) => {
        const normalizedChannel = normalizeText(channel);
        return normalizedChannel && normalizedInput.includes(normalizedChannel);
      }) || null
    );
  }

  private async resolveFilters(companyId: string, input: string): Promise<MatchedFilter | null> {
    const normalized = normalizeText(input);
    const filter: MatchedFilter = {};
    filter.period = resolvePeriodFilter(input);

    if (
      normalized.includes('atraso plataforma') ||
      normalized.includes('atrasados plataforma') ||
      normalized.includes('atrasado plataforma')
    ) {
      filter.delayedKind = 'platform';
    }

    if (
      normalized.includes('atraso transportadora') ||
      normalized.includes('atrasados transportadora') ||
      normalized.includes('atrasado transportadora') ||
      normalized.includes('pedidos atrasados')
    ) {
      filter.delayedKind = 'carrier';
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

    return {
      handled: true,
      text: [
        `Preparei um relatorio com ${count} ${filterLabel} na empresa ${company.name}.`,
        '',
        `Relatorio HTML: ${htmlUrl}`,
        `CSV: ${csvUrl}`,
      ].join('\n'),
    };
  }
}

export const chatAssistantService = new ChatAssistantService();
