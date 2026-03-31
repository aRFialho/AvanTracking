import { createHash } from 'crypto';
import { TrayFreightService } from './trayFreightService';

export const safeString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

export const safeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const normalized =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value).replace(/[^\d,.-]/g, '').replace(',', '.'));

  return Number.isFinite(normalized) ? normalized : null;
};

export const safeInteger = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeZipCode = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '').trim();
  return digits || null;
};

export const buildProductsHash = (productsRaw: unknown) => {
  if (productsRaw === null || productsRaw === undefined) return null;

  try {
    const serialized = typeof productsRaw === 'string' ? productsRaw : JSON.stringify(productsRaw);
    if (!serialized) return null;
    return createHash('sha256').update(serialized).digest('hex');
  } catch {
    return null;
  }
};

export type FreightRequestProduct = {
  product_id: string;
  price: number;
  quantity: number;
};

export type FreightAuditProduct = FreightRequestProduct & {
  name: string | null;
  reference: string | null;
  variant_id: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
};

export type ExtractedTrayOrderProducts = {
  requestProducts: FreightRequestProduct[];
  auditProducts: FreightAuditProduct[];
  source: string | null;
  productsHash: string | null;
};

export const extractTrayOrderProducts = (
  rawPayload: any,
): ExtractedTrayOrderProducts => {
  const candidateCollections = [
    { source: 'OrderItem', items: rawPayload?.OrderItem },
    { source: 'OrderItems', items: rawPayload?.OrderItems },
    { source: 'ProductsSold', items: rawPayload?.ProductsSold },
    { source: 'products', items: rawPayload?.products },
    { source: 'items', items: rawPayload?.items },
  ].filter((entry) => Array.isArray(entry.items));

  for (const collection of candidateCollections) {
    const auditProducts = (collection.items as any[])
      .map((entry: any) => {
        const item =
          entry?.OrderItem ||
          entry?.ProductsSold ||
          entry?.ProductSold ||
          entry?.Product ||
          entry;
        const productId = safeString(
          item?.product_id ?? item?.id_product ?? item?.id ?? item?.Product?.id,
        );
        const quantity =
          safeInteger(item?.quantity ?? item?.qty ?? item?.amount ?? 1) || 1;
        const directTotal = safeNumber(item?.total ?? item?.subtotal);
        const unitPrice =
          safeNumber(
            item?.price ??
              item?.sale_price ??
              item?.original_price ??
              item?.unit_price,
          ) ?? (directTotal !== null ? directTotal / quantity : null);

        if (!productId || unitPrice === null || quantity <= 0) {
          return null;
        }

        return {
          product_id: productId,
          price: unitPrice,
          quantity,
          name: safeString(item?.name ?? item?.Product?.name),
          reference: safeString(item?.reference ?? item?.Product?.reference),
          variant_id: safeString(item?.variant_id ?? item?.variation_id),
          weight: safeNumber(item?.weight ?? item?.gross_weight),
          length: safeNumber(item?.length),
          width: safeNumber(item?.width),
          height: safeNumber(item?.height),
        };
      })
      .filter((item): item is FreightAuditProduct => Boolean(item));

    if (auditProducts.length > 0) {
      return {
        requestProducts: auditProducts.map(({ product_id, price, quantity }) => ({
          product_id,
          price,
          quantity,
        })),
        auditProducts,
        source: collection.source,
        productsHash: buildProductsHash(auditProducts),
      };
    }
  }

  return {
    requestProducts: [],
    auditProducts: [],
    source: null,
    productsHash: null,
  };
};

export const buildRecalculatedDetails = (
  cotationOptions: any[],
  selectedOption: any,
  matchedByCarrier: boolean,
  requestedCarrier: string | null | undefined,
  quoteRequest: {
    zipcode: string;
    source: string | null;
    productsHash: string | null;
    products: FreightAuditProduct[];
  },
) => ({
  selectedOption,
  selectedCarrierName:
    safeString(selectedOption?.taxe?.name) ||
    safeString(selectedOption?.name) ||
    safeString(selectedOption?.identifier) ||
    null,
  selectedServiceName:
    safeString(selectedOption?.name) ||
    safeString(selectedOption?.identifier) ||
    null,
  matchedByCarrier,
  selectionStrategy: matchedByCarrier ? 'carrier_match' : 'best_available_option',
  requestedCarrier: safeString(requestedCarrier),
  optionsCount: cotationOptions.length,
  options: cotationOptions,
  quoteRequest,
});

const hasSelectedOption = (details: any) => {
  if (!details || typeof details !== 'object') {
    return false;
  }

  if (
    details.selectedOption &&
    typeof details.selectedOption === 'object' &&
    Object.keys(details.selectedOption).length > 0
  ) {
    return true;
  }

  return Boolean(
    safeString(details.selectedCarrierName) || safeString(details.selectedServiceName),
  );
};

export const needsFreightRecalculation = (order: {
  recalculatedFreightValue?: number | null;
  recalculatedFreightDate?: Date | string | null;
  recalculatedFreightDetails?: any;
}) => {
  const details = order?.recalculatedFreightDetails;
  const hasProductsSnapshot =
    Array.isArray(details?.quoteRequest?.products) &&
    details.quoteRequest.products.length > 0;

  return (
    order?.recalculatedFreightValue === null ||
    order?.recalculatedFreightValue === undefined ||
    !order?.recalculatedFreightDate ||
    !hasSelectedOption(details) ||
    !hasProductsSnapshot
  );
};

type RecalculateStoredOrderFreightArgs = {
  prisma: any;
  order: any;
  companyId: string;
  freightService?: TrayFreightService;
  force?: boolean;
};

export const recalculateStoredOrderFreight = async ({
  prisma,
  order,
  companyId,
  freightService,
  force = false,
}: RecalculateStoredOrderFreightArgs) => {
  if (!force && !needsFreightRecalculation(order)) {
    return {
      skipped: true,
      reason: 'already_recalculated',
      order,
    };
  }

  const zipcode = normalizeZipCode(order?.zipCode);
  if (!zipcode) {
    throw new Error('Pedido sem CEP valido');
  }

  const extractedProducts = extractTrayOrderProducts(order?.apiRawPayload);
  if (extractedProducts.requestProducts.length === 0) {
    throw new Error(
      'Pedido sem produtos validos para recotacao na Tray. A API /shippings/cotation exige product_id, price e quantity reais do pedido.',
    );
  }

  const resolvedFreightService =
    freightService || new TrayFreightService(companyId);
  const cotationResult = await resolvedFreightService.quoteFreight({
    zipcode,
    products: extractedProducts.requestProducts,
  });
  const cotationOptions = Array.isArray(cotationResult?.Shipping?.cotation)
    ? cotationResult.Shipping.cotation
    : [];

  if (cotationOptions.length === 0) {
    throw new Error('Nenhuma opcao de frete disponivel para este CEP');
  }

  const cheapestOption = resolvedFreightService.getCheapestOption(cotationOptions);
  const fastestOption = resolvedFreightService.getFastestOption(cotationOptions);
  const matchedOption = resolvedFreightService.getPreferredOptionForCarrier(
    cotationOptions,
    order?.freightType,
    order?.apiRawPayload?.shipment,
  );
  const selectedOption =
    matchedOption || cheapestOption || fastestOption || cotationOptions[0] || null;
  const quotedValue = selectedOption ? safeNumber(selectedOption.value) : null;
  const recalculatedFreightDetails = buildRecalculatedDetails(
    cotationOptions,
    selectedOption,
    Boolean(matchedOption),
    order?.freightType,
    {
      zipcode,
      source: extractedProducts.source,
      productsHash: extractedProducts.productsHash,
      products: extractedProducts.auditProducts,
    },
  );

  await prisma.order.update({
    where: { id: order.id },
    data: {
      recalculatedFreightValue: quotedValue,
      recalculatedFreightDate: new Date(),
      recalculatedFreightDetails,
    },
  });

  return {
    skipped: false,
    order,
    cotationResult,
    cotationOptions,
    cheapestOption,
    fastestOption,
    matchedOption,
    selectedOption,
    quotedValue,
    extractedProducts,
    recalculatedFreightDetails,
  };
};
