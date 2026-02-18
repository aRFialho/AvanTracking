
import { Order, OrderStatus, TrackingEvent } from '../types';

// NOTE: In a production environment, these should be environment variables.
const INTELIPOST_API_URL = 'https://tracking-graphql.intelipost.com.br/';
// ID from the working request example
const DEFAULT_CLIENT_ID = '40115'; 

// ✅ QUERY ATUALIZADA
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
  const s = status ? status.toUpperCase() : '';
  if (s.includes('ENTREGUE') || s.includes('DELIVERED')) return OrderStatus.DELIVERED;
  if (s.includes('EM TRÂNSITO') || s.includes('SHIPPED') || s.includes('TRANSIT')) return OrderStatus.SHIPPED;
  if (s.includes('SAIU PARA ENTREGA') || s.includes('DELIVERY_ATTEMPT')) return OrderStatus.DELIVERY_ATTEMPT;
  if (s.includes('CRIADO') || s.includes('CREATED')) return OrderStatus.CREATED;
  if (s.includes('FALHA') || s.includes('FAILURE') || s.includes('ROUBO') || s.includes('AVARIA')) return OrderStatus.FAILURE;
  if (s.includes('DEVOL') || s.includes('RETURN')) return OrderStatus.RETURNED;
  if (s.includes('CANCEL') || s.includes('CANCELED')) return OrderStatus.CANCELED;
  return OrderStatus.PENDING;
};

/**
 * Fetches a single order directly from Intelipost using the GraphQL Query.
 */
export const fetchSingleOrder = async (orderNumber: string): Promise<Partial<Order> | null> => {
  const cleanOrderNumber = orderNumber.trim();

  try {
    const payload = {
      operationName: null,
      query: INTELIPOST_QUERY,
      variables: {
        clientId: DEFAULT_CLIENT_ID,
        orderHash: DEFAULT_CLIENT_ID, 
        orderNumber: cleanOrderNumber
      }
    };

    const response = await fetch(INTELIPOST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://status.ondeestameupedido.com'
        // User-Agent removed to prevent browser safety errors
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const json = await response.json();
      
      if (json.errors) return null;

      const trackingData = json.data?.trackingStatus;

      if (trackingData) {
        // Real Data Found - Map and Return
        const historyMapped: TrackingEvent[] = (trackingData.tracking.history || []).map((h: any) => ({
          status: h.macro_state?.code || 'UNKNOWN',
          description: h.provider_message || h.status_label,
          date: new Date(h.event_date),
          city: trackingData.end_customer?.address?.city || '',
          state: trackingData.end_customer?.address?.state || ''
        }));

        const estimatedDate = trackingData.tracking.estimated_delivery_date_lp 
          ? new Date(trackingData.tracking.estimated_delivery_date_lp)
          : new Date();
        
        // Determine last update date from history or current time
        const lastEventDate = historyMapped.length > 0 
            ? new Date(Math.max(...historyMapped.map(e => new Date(e.date).getTime())))
            : new Date();

        return {
          orderNumber: trackingData.order.order_number,
          status: mapIntelipostStatusToEnum(trackingData.tracking.status),
          freightType: trackingData.logistic_provider?.name || 'Desconhecida',
          estimatedDeliveryDate: estimatedDate,
          trackingHistory: historyMapped,
          lastUpdate: lastEventDate,
          city: trackingData.end_customer?.address?.city || '',
          state: trackingData.end_customer?.address?.state || ''
        };
      }
    }
  } catch (error) {
    console.warn("Falha na conexão com API Real.", error);
  }
  return null;
};

/**
 * Syncs multiple orders.
 * 1. Skips finalized orders and CANCELED orders.
 * 2. Handles 'ColetasME2', 'Shopee Xpress' AND 'Priority' by forcing STATUS = CHANNEL_LOGISTICS.
 * 3. For others, fetches REAL data from Intelipost.
 * 4. Updates 'Transportadora' (freightType) ONLY from API sync for non-marketplace orders.
 */
export const syncOrdersWithIntelipost = async (orders: Order[]): Promise<Order[]> => {
  
  const updatedOrders = await Promise.all(orders.map(async (order) => {
    
    // 1. Skip if Finalized (Delivered, Canceled, etc)
    if ([OrderStatus.DELIVERED, OrderStatus.FAILURE, OrderStatus.RETURNED, OrderStatus.CANCELED].includes(order.status)) {
        return order;
    }

    // 2. Handle Marketplace Logistics / Priority (No Intelipost Call)
    // Checks for specific strings or if it already is channel logistics
    const isChannelManaged = 
        ['ColetasME2', 'Shopee Xpress'].includes(order.freightType) || 
        order.freightType.toLowerCase().includes('priorit') ||
        order.status === OrderStatus.CHANNEL_LOGISTICS;

    if (isChannelManaged) {
        // Force status to Channel Logistics if not already set or finalized
        const history = [...order.trackingHistory];
        
        // Add a mock history entry if empty to show something in UI
        if (history.length === 0) {
            history.push({
                status: 'CHANNEL_LOGISTICS',
                description: 'Logística gerenciada pelo canal de venda',
                date: new Date(order.shippingDate),
                city: order.city,
                state: order.state
            });
        }

        return {
            ...order,
            status: OrderStatus.CHANNEL_LOGISTICS,
            trackingHistory: history,
            lastUpdate: order.shippingDate // Or last history date
        };
    }

    // 3. Actionable Order: Fetch Real Data from Intelipost
    try {
        const fetchedData = await fetchSingleOrder(order.orderNumber);
        
        if (fetchedData) {
            const newStatus = fetchedData.status || order.status;
            const newEstimatedDate = fetchedData.estimatedDeliveryDate || order.estimatedDeliveryDate;
            const isDelayed = (new Date() > new Date(newEstimatedDate) && newStatus !== OrderStatus.DELIVERED);

            return {
                ...order,
                ...fetchedData, // This overwrites freightType with the real one from Intelipost
                isDelayed,
                // lastUpdate is already set correctly in fetchSingleOrder based on event date
            };
        }
    } catch (e) {
        console.error(`Error syncing order ${order.orderNumber}`, e);
    }

    return order;
  }));

  return updatedOrders;
};
