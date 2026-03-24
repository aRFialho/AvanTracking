
import { Order, OrderStatus } from "./types";

export const toText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value);
};

export const normalizeTrackingHistory = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return value.map((event) => ({
    status: toText((event as any)?.status) || "UNKNOWN",
    description: toText((event as any)?.description) || "Evento de rastreamento",
    date: (event as any)?.date ?? new Date(),
    city: toText((event as any)?.city),
    state: toText((event as any)?.state),
  }));
};

export const normalizeExcludedPlatformFreight = (
  freightType: string | null | undefined,
): string | null => {
  const normalized = toText(freightType).trim().toLowerCase();

  if (!normalized) return null;

  if (
    [
      "encomenda normal",
      "normal ao endereço",
      "normal ao endereco",
    ].includes(normalized) ||
    normalized.includes("priorit")
  ) {
    return "ColetasME2";
  }

  if (["shopee xpress", "retirada pelo comprador"].includes(normalized)) {
    return "Shopee Xpress";
  }

  if (
    normalized.includes("sedex") ||
    normalized.includes("correios pac") ||
    normalized === "pac" ||
    normalized.includes(" pac ")
  ) {
    return "Correios";
  }

  return null;
};

export const isChannelManagedFreight = (
  freightType: string | null | undefined,
): boolean => Boolean(normalizeExcludedPlatformFreight(freightType));

export const isExcludedPlatformFreight = (
  freightType: string | null | undefined,
): boolean => Boolean(normalizeExcludedPlatformFreight(freightType));

export const isChannelManagedOrder = (order: Pick<Order, "status" | "freightType">) =>
  order.status === OrderStatus.CHANNEL_LOGISTICS ||
  isExcludedPlatformFreight(order.freightType);

export const parseOptionalDate = (value: unknown): Date | null => {
  if (!value) return null;

  const parsed = new Date(value as string | number | Date);
  if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() < 1900) {
    return null;
  }

  return parsed;
};

export const formatDateOrDash = (value: unknown, locale = "pt-BR"): string => {
  const parsed = parseOptionalDate(value);
  return parsed ? parsed.toLocaleDateString(locale) : "-";
};

export const mapIntelipostStatusToEnum = (status: string): OrderStatus => {
  const s = status ? status.toUpperCase() : '';
  if (s.includes('ENTREGUE') || s.includes('DELIVERED')) return OrderStatus.DELIVERED;
  // Colocando SAIU PARA ENTREGA ANTES de EM TRÂNSITO para evitar sobrescrever
  if (s.includes('SAIU PARA ENTREGA') || s.includes('DELIVERY_ATTEMPT') || s.includes('TO_BE_DELIVERED') || s.includes('SAIU PARA')) return OrderStatus.DELIVERY_ATTEMPT;
  if (s.includes('EM TRÂNSITO') || s.includes('SHIPPED') || s.includes('TRANSIT') || s.includes('IN_TRANSIT')) return OrderStatus.SHIPPED;
  if (s.includes('CRIADO') || s.includes('CREATED') || s.includes('NEW')) return OrderStatus.CREATED;
  if (s.includes('FALHA') || s.includes('FAILURE') || s.includes('ROUBO') || s.includes('AVARIA') || s.includes('CLARIFY_DELIVERY_FAIL')) return OrderStatus.FAILURE;
  if (s.includes('DEVOL') || s.includes('RETURN')) return OrderStatus.RETURNED;
  if (s.includes('CANCEL') || s.includes('CANCELED')) return OrderStatus.CANCELED;
  
  // Default fallback for ambiguous cases
  return OrderStatus.PENDING;
};

/**
 * Determina o status efetivo do pedido com base no histórico de rastreamento mais recente.
 * Se houver histórico, usa o evento mais recente para determinar o status.
 * Caso contrário, retorna o status atual do pedido.
 */
export const getEffectiveOrderStatus = (order: Order): OrderStatus => {
  const trackingHistory = normalizeTrackingHistory(order.trackingHistory);

  if (trackingHistory.length === 0) {
    return order.status;
  }

  // Encontrar o evento mais recente
  const latestEvent = trackingHistory.reduce((prev, current) => {
    return (new Date(prev.date) > new Date(current.date)) ? prev : current;
  });

  // Mapear o status do evento para o enum OrderStatus
  // Se o status mapeado for PENDING (não reconhecido), manter o status original se ele for mais específico
  const mappedStatus = mapIntelipostStatusToEnum(latestEvent.status);

  // Se o status mapeado for válido e diferente de PENDING, usar ele.
  // PENDING é o fallback do mapIntelipostStatusToEnum.
  if (mappedStatus !== OrderStatus.PENDING) {
      return mappedStatus;
  }

  // Se o evento for algo como "CHANNEL_LOGISTICS", podemos não ter mapeado acima, mas pode ser válido.
  if (latestEvent.status === 'CHANNEL_LOGISTICS') {
      return OrderStatus.CHANNEL_LOGISTICS;
  }

  return order.status;
};

/**
 * Normaliza o nome da transportadora removendo sufixos e caracteres indesejados.
 * Ex: "LMS Logistica (Frete Fixo)" -> "LMS Logistica"
 * Ex: "Jamef Jamef Standard" -> "Jamef"
 */
export const normalizeCarrierName = (name: string | null | undefined): string => {
  if (!name) return 'Desconhecida';

  let normalized = toText(name).toLowerCase();

  // Remove termos indesejados
  const termsToRemove = [
    /\(frete fixo\)/g,
    /- standard/g,
    /\bstandard\b/g,
    /\./g // Remove pontos
  ];

  termsToRemove.forEach(term => {
    normalized = normalized.replace(term, '');
  });

  // Remove espaços extras e trim
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Title Case (Capitalizar primeira letra de cada palavra)
  const words = normalized.split(' ').map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  // Remove duplicatas consecutivas (ex: Jamef Jamef -> Jamef)
  const uniqueWords = words.filter((word, index) => {
    return index === 0 || word !== words[index - 1];
  });

  return uniqueWords.join(' ');
};

/**
 * Verifica se um pedido foi entregue no prazo.
 * O pedido deve ter status DELIVERED.
 * A data de entrega (lastUpdate) deve ser menor ou igual à data estimada (estimatedDeliveryDate).
 */
export const isOrderOnTime = (order: Order): boolean => {
  if (order.status !== OrderStatus.DELIVERED) return false;

  const estimated = parseOptionalDate(order.estimatedDeliveryDate);
  if (!estimated) return false;

  // Set estimated to end of day to be inclusive
  estimated.setHours(23, 59, 59, 999);

  const delivered = new Date(order.lastUpdate);
  
  return delivered <= estimated;
};

/**
 * Verifica se um pedido está "Em Rota" (Saiu para entrega).
 * Considera o status DELIVERY_ATTEMPT ou o último evento de rastreamento ser TO_BE_DELIVERED.
 */
export const isOrderOnRoute = (order: Order): boolean => {
  if (order.status === OrderStatus.DELIVERY_ATTEMPT) return true;

  const trackingHistory = normalizeTrackingHistory(order.trackingHistory);

  if (trackingHistory.length > 0) {
    const latestEvent = trackingHistory.reduce((prev, current) => {
      return (new Date(prev.date) > new Date(current.date)) ? prev : current;
    });

    return latestEvent.status === "TO_BE_DELIVERED";
  }

  return false;
};
