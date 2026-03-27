import { Request, Response } from 'express';
import { PrismaClient, OrderStatus } from '@prisma/client';
import { syncJobService } from '../services/syncJobService';
import { TrackingService } from '../services/trackingService';
import { importOrdersForCompany } from '../services/orderImportService';
import { isExcludedPlatformFreight } from '../utils/orderExclusion';
import { sswTrackingService } from '../services/sswTrackingService';

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
    order.createdAt ||
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
  order.status === OrderStatus.CHANNEL_LOGISTICS ||
  isExcludedPlatformFreight(order.freightType);

const buildSswTrackingUrl = (identifier: string, cnpj?: string | null) =>
  cnpj
    ? `https://ssw.inf.br/app/tracking/${cnpj}/${identifier}`
    : `https://ssw.inf.br/app/tracking/${identifier}`;

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

const extractQuotedCarrierName = (quotedFreightDetails: any): string | null => {
  if (!quotedFreightDetails || typeof quotedFreightDetails !== 'object') {
    return null;
  }

  return (
    safeString(quotedFreightDetails.selectedCarrierName) ||
    safeString(quotedFreightDetails.selectedServiceName) ||
    safeString(quotedFreightDetails.selectedOption?.carrier_name) ||
    safeString(quotedFreightDetails.selectedOption?.carrier) ||
    safeString(quotedFreightDetails.selectedOption?.transportadora) ||
    safeString(quotedFreightDetails.selectedOption?.shipping_company) ||
    safeString(quotedFreightDetails.selectedOption?.delivery_method?.name) ||
    safeString(quotedFreightDetails.selectedOption?.service_name) ||
    safeString(quotedFreightDetails.selectedOption?.service) ||
    safeString(quotedFreightDetails.selectedOption?.identifier) ||
    safeString(quotedFreightDetails.selectedOption?.name) ||
    null
  );
};

const resolveOrderTrackingUrl = (
  order: {
    invoiceNumber?: string | null;
    trackingCode?: string | null;
    apiRawPayload?: any;
  },
  sswRequireCnpjs: string[] = [],
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

  return null;
};

const resolveVerifiedOrderTrackingUrl = async (
  order: {
    invoiceNumber?: string | null;
    trackingCode?: string | null;
    apiRawPayload?: any;
  },
  sswRequireCnpjs: string[] = [],
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

  return (
    storedTrackingUrl ||
    safeString(order.apiRawPayload?.logistic_provider?.live_tracking_url) ||
    safeString(order.apiRawPayload?.tracking_url) ||
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
      sswRequireCnpjs: true,
    },
  }) as Promise<any>);

  return Array.isArray(company?.sswRequireCnpjs)
    ? company.sswRequireCnpjs
        .map((cnpj: unknown) => normalizeDigits(cnpj))
        .filter(Boolean)
    : [];
};

const formatOrderForResponse = (order: any, sswRequireCnpjs: string[] = []) => {
  const carrierEstimatedDeliveryDate =
    resolveCarrierEstimatedDateFromTrackingEvents(order.trackingEvents) ||
    order.carrierEstimatedDeliveryDate ||
    null;
  const quotedCarrierName = extractQuotedCarrierName(order.quotedFreightDetails);
  const freightCarrierMatchesQuote =
    quotedCarrierName && order.freightType
      ? normalizeComparableText(order.freightType) ===
        normalizeComparableText(quotedCarrierName)
      : null;

  return {
    ...order,
    orderNumber: String(order.orderNumber),
    status: order.status as OrderStatus,
    carrierEstimatedDeliveryDate,
    trackingSourceLabel: resolveTrackingSourceLabel(order.apiRawPayload),
    quotedCarrierName,
    freightCarrierMatchesQuote,
    trackingHistory: mapTrackingEventsToHistory(order.trackingEvents),
    lastUpdate: getMovementDate(order),
    trackingUrl: resolveOrderTrackingUrl(order, sswRequireCnpjs),
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
      include: {
        trackingEvents: {
          orderBy: { eventDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sswRequireCnpjs = await getCompanySswRequireCnpjs(user.companyId);

    return res.json(
      orders
        .filter((order) => !shouldExcludeOrderFromPlatform(order))
        .map((order) => formatOrderForResponse(order, sswRequireCnpjs)),
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

    return res.json(formatOrderForResponse(order, sswRequireCnpjs));
  } catch (error) {
    console.error('Erro ao buscar pedido:', error);
    return res.status(500).json({ error: 'Erro ao buscar pedido' });
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
        apiRawPayload: true,
        freightType: true,
        status: true,
      },
    });

    if (!order || order.companyId !== user.companyId || shouldExcludeOrderFromPlatform(order)) {
      return res.status(404).json({ error: 'Pedido nao encontrado' });
    }

    const sswRequireCnpjs = await getCompanySswRequireCnpjs(user.companyId);
    const trackingUrl = await resolveVerifiedOrderTrackingUrl(
      order,
      sswRequireCnpjs,
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
        message: 'Pedido excluido da plataforma pelo tipo de frete.',
      });
    }

    const sswRequireCnpjs = await getCompanySswRequireCnpjs(user.companyId);

    return res.json({
      success: true,
      message: result.message,
      order: order ? formatOrderForResponse(order, sswRequireCnpjs) : null,
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

    const results = await trackingService.syncAllActive(user.companyId);
    syncJobService.ensureSchedule(user.companyId, user.id);

    return res.json({
      success: true,
      message: `Sincronizacao concluida: ${results.success} sucessos, ${results.failed} falhas`,
      results,
      report: null,
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
