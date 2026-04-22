import axios, { AxiosInstance } from 'axios';
import { prisma } from '../lib/prisma';
import { anymarketRateLimiter } from './anymarketRateLimiter';

export interface AnymarketPagingInfo {
  size?: number;
  totalElements?: number;
  totalPages?: number;
  number?: number;
}

export interface AnymarketOrdersResponse {
  links?: Array<{
    rel?: string;
    href?: string;
  }>;
  content?: any[];
  page?: AnymarketPagingInfo;
}

export interface AnymarketConnectionStatus {
  configured: boolean;
  authorized: boolean;
  apiBaseUrl: string;
  platform: string | null;
  message: string;
}

type AnymarketConfiguration = {
  companyId: string;
  integrationEnabled: boolean;
  apiBaseUrl: string;
  platform: string;
  token: string | null;
};

const ANYMARKET_PRODUCTION_BASE_URL = 'https://api.anymarket.com.br/v2';
const ANYMARKET_PLATFORM_HEADER = 'AVANTRACKING';

const normalizeText = (value: unknown) => String(value || '').trim();

const normalizeDigits = (value: unknown) =>
  String(value || '')
    .replace(/\D/g, '')
    .trim();

const normalizeComparableText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const safeString = (value: unknown) => {
  const normalized = normalizeText(value);
  return normalized || null;
};

const safeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/[^\d.,-]/g, '').replace(',', '.'));

  return Number.isFinite(parsed) ? parsed : null;
};

const safeDate = (value: unknown) => {
  if (!value) return null;

  try {
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

const normalizeBaseUrl = (value: unknown) => {
  const normalized = normalizeText(value);
  return (normalized || ANYMARKET_PRODUCTION_BASE_URL).replace(/\/+$/, '');
};

const buildCleanParams = (params: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = safeString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const resolvePersonDocument = (buyer: any, shipping: any) => {
  const buyerDocumentType = normalizeComparableText(buyer?.documentType).toUpperCase();
  const buyerDigits = normalizeDigits(buyer?.documentNumberNormalized || buyer?.document);
  const shippingDocumentType = normalizeComparableText(shipping?.shipmentUserDocumentType).toUpperCase();
  const shippingDigits = normalizeDigits(shipping?.shipmentUserDocument);

  if (buyerDocumentType === 'CPF' || buyerDigits.length === 11) {
    return { cpf: buyerDigits || null, cnpj: null };
  }

  if (buyerDocumentType === 'CNPJ' || buyerDigits.length === 14) {
    return { cpf: null, cnpj: buyerDigits || null };
  }

  if (shippingDocumentType === 'CPF' || shippingDigits.length === 11) {
    return { cpf: shippingDigits || null, cnpj: null };
  }

  if (shippingDocumentType === 'CNPJ' || shippingDigits.length === 14) {
    return { cpf: null, cnpj: shippingDigits || null };
  }

  return { cpf: null, cnpj: null };
};

const mapShipmentStatusToInternal = (value: unknown) => {
  const normalized = normalizeComparableText(value).toUpperCase();

  const map: Record<string, string> = {
    IN_TRANSIT: 'SHIPPED',
    SHIPPED: 'SHIPPED',
    DELIVERED: 'DELIVERED',
    DELIVERED_LATE: 'DELIVERED',
    NOT_DELIVERED: 'FAILURE',
    DELAYED: 'DELIVERY_ATTEMPT',
    HOLD_FOR_PICKUP: 'CREATED',
    HOLD_FOR_SHIPPED: 'CREATED',
    PACKING: 'CREATED',
    SHIP_CONFIRMED: 'CREATED',
    DELAYED_PICKUP: 'CREATED',
    DELAYED_SHIPPING: 'SHIPPED',
    QUARANTINE: 'CREATED',
    UNKNOWN: 'PENDING',
  };

  return map[normalized] || null;
};

const mapAnymarketStatusToInternal = (order: any) => {
  const normalizedStatus = normalizeComparableText(order?.status).toUpperCase();

  const primaryMap: Record<string, string> = {
    PENDING: 'PENDING',
    DELIVERY_ISSUE: 'FAILURE',
    PAID_WAITING_SHIP: 'CREATED',
    INVOICED: 'CREATED',
    PAID_WAITING_DELIVERY: 'SHIPPED',
    CONCLUDED: 'DELIVERED',
    CANCELED: 'CANCELED',
  };

  if (primaryMap[normalizedStatus]) {
    return primaryMap[normalizedStatus];
  }

  return (
    mapShipmentStatusToInternal(order?.tracking?.deliveryStatus) ||
    mapShipmentStatusToInternal(order?.marketPlaceShipmentStatus) ||
    'PENDING'
  );
};

const buildTrackingHistory = (order: any, mappedStatus: string, address: any) => {
  const tracking = order?.tracking || {};
  const createdAt = safeDate(order?.createdAt);
  const shippedAt = safeDate(tracking?.shippedDate || tracking?.date);
  const deliveredAt = safeDate(tracking?.deliveredDate);
  const updatedAt = safeDate(order?.updatedAt);
  const city = pickFirstString(address?.city);
  const state = pickFirstString(address?.state, address?.stateAcronymNormalized);

  const history: Array<{
    status: string;
    description: string;
    date: Date;
    city: string | null;
    state: string | null;
  }> = [];

  if (createdAt) {
    history.push({
      status: 'PENDING',
      description: `Pedido ANYMARKET criado com status ${pickFirstString(order?.status) || 'PENDING'}.`,
      date: createdAt,
      city,
      state,
    });
  }

  if (shippedAt) {
    history.push({
      status: mapShipmentStatusToInternal(tracking?.deliveryStatus) || 'SHIPPED',
      description:
        pickFirstString(tracking?.deliveryStatus)
          ? `Rastreamento ANYMARKET: ${tracking.deliveryStatus}.`
          : 'Pedido enviado para a transportadora.',
      date: shippedAt,
      city,
      state,
    });
  }

  if (deliveredAt) {
    history.push({
      status: 'DELIVERED',
      description: 'Entrega confirmada no rastreamento do ANYMARKET.',
      date: deliveredAt,
      city,
      state,
    });
  }

  if (history.length === 0) {
    history.push({
      status: mappedStatus,
      description: `Pedido ANYMARKET em status ${pickFirstString(order?.status) || mappedStatus}.`,
      date: updatedAt || createdAt || new Date(),
      city,
      state,
    });
  }

  return history;
};

export class AnymarketApiService {
  constructor(private readonly companyId: string) {}

  async getConfiguration(): Promise<AnymarketConfiguration> {
    const company = await (prisma.company as any).findUnique({
      where: { id: this.companyId },
      select: {
        anymarketIntegrationEnabled: true,
        anymarketToken: true,
      },
    });

    if (!company) {
      throw new Error('Empresa nao encontrada.');
    }

    return {
      companyId: this.companyId,
      integrationEnabled: company.anymarketIntegrationEnabled !== false,
      apiBaseUrl: normalizeBaseUrl(undefined),
      platform: ANYMARKET_PLATFORM_HEADER,
      token: safeString(company.anymarketToken),
    };
  }

  private async getClient(): Promise<{
    client: AxiosInstance;
    configuration: AnymarketConfiguration;
  }> {
    const configuration = await this.getConfiguration();

    if (!configuration.integrationEnabled) {
      throw new Error('A integracao ANYMARKET esta desativada para esta empresa.');
    }

    if (!configuration.token) {
      throw new Error('gumgaToken do ANYMARKET nao configurado para esta empresa.');
    }

    const client = axios.create({
      baseURL: configuration.apiBaseUrl,
      timeout: 45_000,
      headers: {
        'Content-Type': 'application/json',
        gumgaToken: configuration.token,
        platform: configuration.platform,
      },
    });

    return {
      client,
      configuration,
    };
  }

  async getConnectionStatus(): Promise<AnymarketConnectionStatus> {
    const configuration = await this.getConfiguration();

    if (!configuration.integrationEnabled) {
      return {
        configured: false,
        authorized: false,
        apiBaseUrl: configuration.apiBaseUrl,
        platform: configuration.platform,
        message: 'Integracao ANYMARKET desativada para esta empresa.',
      };
    }

    if (!configuration.token) {
      return {
        configured: false,
        authorized: false,
        apiBaseUrl: configuration.apiBaseUrl,
        platform: configuration.platform,
        message: 'ANYMARKET sem configuracao completa de gumgaToken.',
      };
    }

    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 1);

      await this.listOrders({
        limit: 5,
        offset: 0,
        updatedAfter: sevenDaysAgo.toISOString(),
        updatedBefore: now.toISOString(),
      });

      return {
        configured: true,
        authorized: true,
        apiBaseUrl: configuration.apiBaseUrl,
        platform: configuration.platform,
        message: 'Integracao ANYMARKET online.',
      };
    } catch (error: any) {
      return {
        configured: true,
        authorized: false,
        apiBaseUrl: configuration.apiBaseUrl,
        platform: configuration.platform,
        message:
          error instanceof Error
            ? error.message
            : 'Falha ao validar conexao com o ANYMARKET.',
      };
    }
  }

  async listOrders(params: {
    limit?: number;
    offset?: number;
    status?: string;
    createdAfter?: string;
    createdBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    marketplace?: string;
    marketplaceId?: string;
    partnerId?: string;
    shippingId?: string;
    sort?: string;
    sortDirection?: 'ASC' | 'DESC';
  } = {}): Promise<AnymarketOrdersResponse> {
    return anymarketRateLimiter.execute(async () => {
      const { client } = await this.getClient();

      try {
        const response = await client.get('/orders', {
          params: buildCleanParams({
            limit: params.limit ?? 100,
            offset: params.offset ?? 0,
            status: params.status,
            createdAfter: params.createdAfter,
            createdBefore: params.createdBefore,
            updatedAfter: params.updatedAfter,
            updatedBefore: params.updatedBefore,
            marketplace: params.marketplace,
            marketplaceId: params.marketplaceId,
            partnerId: params.partnerId,
            shippingId: params.shippingId,
            sort: params.sort,
            sortDirection: params.sortDirection,
          }),
        });

        return {
          data: response.data,
          headers: response.headers as Record<string, unknown>,
        };
      } catch (error: any) {
        const details =
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          'Erro desconhecido na API ANYMARKET.';
        const wrappedError: any = new Error(`Erro na API ANYMARKET: ${details}`);
        wrappedError.response = error?.response;
        throw wrappedError;
      }
    });
  }

  async syncAllOrders(
    params: {
      status?: string;
      createdAfter?: string;
      createdBefore?: string;
      updatedAfter?: string;
      updatedBefore?: string;
      marketplace?: string;
    },
    hooks?: {
      onLog?: (message: string) => void;
      onOrdersBatch?: (orders: any[]) => Promise<void> | void;
    },
  ): Promise<number> {
    const pageSize = 100;
    let offset = 0;
    let importedOrdersCount = 0;
    let pageNumber = 1;

    while (true) {
      hooks?.onLog?.(
        `Buscando pagina ${pageNumber} do ANYMARKET com offset ${offset}${params.status ? ` para status "${params.status}"` : ''}.`,
      );

      const response = await this.listOrders({
        limit: pageSize,
        offset,
        status: params.status,
        createdAfter: params.createdAfter,
        createdBefore: params.createdBefore,
        updatedAfter: params.updatedAfter,
        updatedBefore: params.updatedBefore,
        marketplace: params.marketplace,
      });

      const orders = Array.isArray(response.content) ? response.content : [];
      if (orders.length === 0) {
        break;
      }

      await hooks?.onOrdersBatch?.(orders);
      importedOrdersCount += orders.length;

      const totalElements = Number(response.page?.totalElements || 0);
      offset += orders.length;
      pageNumber += 1;

      if (orders.length < pageSize) {
        break;
      }

      if (totalElements > 0 && offset >= totalElements) {
        break;
      }
    }

    return importedOrdersCount;
  }

  mapAnymarketOrderToSystem(anymarketOrder: any): any {
    const buyer = anymarketOrder?.buyer || {};
    const shipping = anymarketOrder?.shipping || {};
    const billingAddress = anymarketOrder?.billingAddress || {};
    const anymarketAddress = anymarketOrder?.anymarketAddress || {};
    const tracking = anymarketOrder?.tracking || {};
    const invoice = anymarketOrder?.invoice || {};
    const quoteReconciliation = anymarketOrder?.quoteReconciliation || {};
    const shippings = Array.isArray(anymarketOrder?.shippings)
      ? anymarketOrder.shippings
      : [];
    const primaryShipping = shippings[0] || {};
    const document = resolvePersonDocument(buyer, shipping);
    const mappedStatus = mapAnymarketStatusToInternal(anymarketOrder);
    const primaryAddress = shipping?.street || shipping?.address ? shipping : anymarketAddress;
    const salesChannelParts = [
      'ANYMARKET',
      pickFirstString(anymarketOrder?.marketPlace),
      pickFirstString(anymarketOrder?.subChannelNormalized, anymarketOrder?.subChannel),
    ].filter(Boolean);
    const resolvedOrderNumber = pickFirstString(
      anymarketOrder?.id,
      anymarketOrder?.partnerId,
      anymarketOrder?.marketPlaceId,
    );

    const quotedFreightValue = safeNumber(quoteReconciliation?.price);
    const quotedFreightDate = safeDate(anymarketOrder?.updatedAt || anymarketOrder?.createdAt);
    const shippingDate =
      safeDate(tracking?.shippedDate) ||
      safeDate(tracking?.date) ||
      safeDate(shipping?.promisedDispatchTime) ||
      safeDate(anymarketOrder?.paymentDate) ||
      safeDate(anymarketOrder?.createdAt);
    const estimatedDeliveryDate =
      safeDate(tracking?.estimateDate) ||
      safeDate(shipping?.promisedShippingTime) ||
      safeDate(anymarketAddress?.promisedShippingTime);

    if (!resolvedOrderNumber) {
      throw new Error('Pedido ANYMARKET sem identificador utilizavel para importacao.');
    }

    return {
      orderNumber: resolvedOrderNumber,
      invoiceNumber: pickFirstString(invoice?.number),
      trackingCode: pickFirstString(tracking?.number),
      customerName: pickFirstString(buyer?.name, shipping?.receiverName, anymarketAddress?.receiverName) || 'Desconhecido',
      corporateName:
        document.cnpj && buyer?.name && buyer?.name !== shipping?.receiverName
          ? pickFirstString(buyer?.name)
          : null,
      cpf: document.cpf,
      cnpj: document.cnpj,
      phone: pickFirstString(buyer?.phone),
      mobile: pickFirstString(buyer?.cellPhone),
      salesChannel: salesChannelParts.join(' - '),
      freightType:
        pickFirstString(
          tracking?.carrier,
          primaryShipping?.shippingtype,
          primaryShipping?.shippingCarrierNormalized,
          primaryShipping?.shippingCarrierTypeNormalized,
        ) || 'Nao informado',
      freightValue: safeNumber(anymarketOrder?.freight) || 0,
      quotedFreightValue,
      quotedFreightDate: quotedFreightValue !== null ? quotedFreightDate : null,
      quotedFreightDetails:
        quotedFreightValue !== null
          ? {
              quoteId: pickFirstString(quoteReconciliation?.quoteId),
              price: quotedFreightValue,
            }
          : null,
      originalQuotedFreightValue: quotedFreightValue,
      originalQuotedFreightDate: quotedFreightValue !== null ? quotedFreightDate : null,
      originalQuotedFreightDetails:
        quotedFreightValue !== null
          ? {
              quoteId: pickFirstString(quoteReconciliation?.quoteId),
              price: quotedFreightValue,
            }
          : null,
      originalQuotedFreightQuotationId: pickFirstString(quoteReconciliation?.quoteId),
      recalculatedFreightValue: null,
      recalculatedFreightDate: null,
      recalculatedFreightDetails: null,
      shippingDate,
      address: pickFirstString(
        primaryAddress?.street,
        primaryAddress?.address,
        billingAddress?.street,
        billingAddress?.address,
      ) || '',
      number: pickFirstString(primaryAddress?.number, billingAddress?.number) || '',
      complement: pickFirstString(primaryAddress?.comment, billingAddress?.comment),
      neighborhood:
        pickFirstString(primaryAddress?.neighborhood, billingAddress?.neighborhood) || '',
      city: pickFirstString(primaryAddress?.city, billingAddress?.city) || '',
      state:
        pickFirstString(
          primaryAddress?.stateAcronymNormalized,
          primaryAddress?.state,
          billingAddress?.stateAcronymNormalized,
          billingAddress?.state,
        ) || '',
      zipCode:
        normalizeDigits(
          pickFirstString(primaryAddress?.zipCode, billingAddress?.zipCode),
        ) || '',
      totalValue: safeNumber(anymarketOrder?.total) || 0,
      recipient:
        pickFirstString(
          shipping?.shipmentUserName,
          shipping?.receiverName,
          anymarketAddress?.receiverName,
          buyer?.name,
        ) || null,
      maxShippingDeadline:
        safeDate(shipping?.promisedShippingTime) ||
        safeDate(anymarketAddress?.promisedShippingTime) ||
        estimatedDeliveryDate,
      estimatedDeliveryDate,
      carrierEstimatedDeliveryDate: safeDate(tracking?.estimateDate),
      status: mappedStatus,
      isDelayed: false,
      apiRawPayload: anymarketOrder,
      trackingHistory: buildTrackingHistory(anymarketOrder, mappedStatus, primaryAddress),
    };
  }
}
