
import { Order, OrderStatus } from "./types";

export const mapIntelipostStatusToEnum = (status: string): OrderStatus => {
  const s = status ? status.toUpperCase() : '';
  if (s.includes('ENTREGUE') || s.includes('DELIVERED')) return OrderStatus.DELIVERED;
  if (s.includes('EM TRÂNSITO') || s.includes('SHIPPED') || s.includes('TRANSIT') || s.includes('IN_TRANSIT')) return OrderStatus.SHIPPED;
  if (s.includes('SAIU PARA ENTREGA') || s.includes('DELIVERY_ATTEMPT') || s.includes('TO_BE_DELIVERED')) return OrderStatus.DELIVERY_ATTEMPT;
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
  if (!order.trackingHistory || order.trackingHistory.length === 0) {
    return order.status;
  }

  // Encontrar o evento mais recente
  const latestEvent = order.trackingHistory.reduce((prev, current) => {
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

  let normalized = name.toLowerCase();

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

  const estimated = new Date(order.estimatedDeliveryDate);
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
  
  if (order.trackingHistory && order.trackingHistory.length > 0) {
    const lastStatus = order.trackingHistory[0].status; // Assuming sorted descending or check logic
    // Usually trackingHistory is not guaranteed sorted here unless we sort it.
    // However, in our components we sort it. Here let's just check if the 0th element (if it is the latest) matches.
    // Ideally trackingHistory should be sorted by date descending.
    // If not sorted, we should find the latest event.
    // But for safety, let's just check the first one assuming it's latest or check if ANY recent event is TO_BE_DELIVERED? No, must be latest.
    // Let's assume the caller passes sorted history or we find max date.
    
    // Simple check: most recent event
    const latestEvent = order.trackingHistory.reduce((prev, current) => {
        return (new Date(prev.date) > new Date(current.date)) ? prev : current;
    });
    
    return latestEvent.status === "TO_BE_DELIVERED";
  }
  
  return false;
};
