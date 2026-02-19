import { PrismaClient, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

const INTELIPOST_API_URL = 'https://tracking-graphql.intelipost.com.br/';
const DEFAULT_CLIENT_ID = '40115';

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

export class TrackingService {
  /**
   * Buscar dados de rastreio da Intelipost
   */
  private async fetchFromIntelipost(orderNumber: string) {
    try {
      const payload = {
        operationName: null,
        query: INTELIPOST_QUERY,
        variables: {
          clientId: DEFAULT_CLIENT_ID,
          orderHash: DEFAULT_CLIENT_ID,
          orderNumber: orderNumber.trim()
        }
      };

      const response = await fetch(INTELIPOST_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://status.ondeestameupedido.com'
        },
        body: JSON.stringify(payload)
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

  /**
   * Sincronizar rastreio de um pedido específico
   */
  async syncOrder(orderId: string) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId }
      });

      if (!order) {
        return { success: false, message: 'Pedido não encontrado' };
      }

      // Skip se já finalizado
      const finalizedStatuses: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.FAILURE, OrderStatus.RETURNED, OrderStatus.CANCELED];

      if (finalizedStatuses.includes(order.status)) {
        return { success: false, message: 'Pedido já finalizado' };
      }

      // Verificar se é logística do canal
      const isChannelManaged =
        ['ColetasME2', 'Shopee Xpress'].includes(order.freightType || '') ||
        (order.freightType || '').toLowerCase().includes('priorit');

      if (isChannelManaged) {
        // Atualizar para CHANNEL_LOGISTICS se ainda não estiver
        if (order.status !== OrderStatus.CHANNEL_LOGISTICS) {
          await prisma.order.update({
            where: { id: orderId },
            data: {
              status: OrderStatus.CHANNEL_LOGISTICS,
              lastApiSync: new Date()
            }
          });
        }
        return { success: true, message: 'Logística gerenciada pelo canal' };
      }

      // Buscar dados da Intelipost
      const trackingData = await this.fetchFromIntelipost(order.orderNumber);

      if (!trackingData) {
        // Salvar erro no banco
        await prisma.order.update({
          where: { id: orderId },
          data: {
            lastApiError: 'Sem dados da Intelipost',
            lastApiSync: new Date()
          }
        });
        return { success: false, message: 'Sem dados de rastreio' };
      }

      // Mapear status
      const newStatus = mapIntelipostStatusToEnum(trackingData.tracking.status);
      
      // Atualizar pedido
      const estimatedDate = trackingData.tracking.estimated_delivery_date_lp
        ? new Date(trackingData.tracking.estimated_delivery_date_lp)
        : order.estimatedDeliveryDate;

      const isDelayed = estimatedDate && new Date() > estimatedDate && newStatus !== OrderStatus.DELIVERED;

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          freightType: trackingData.logistic_provider?.name || order.freightType,
          estimatedDeliveryDate: estimatedDate,
          isDelayed: isDelayed || false,
          lastApiSync: new Date(),
          lastApiError: null,
          apiRawPayload: trackingData as any
        }
      });

      // Salvar eventos de rastreio (limpar antigos e inserir novos)
      await prisma.trackingEvent.deleteMany({
        where: { orderId }
      });

      const events = (trackingData.tracking.history || []).map((h: any) => ({
        orderId,
        status: h.macro_state?.code || 'UNKNOWN',
        description: h.provider_message || h.status_label,
        city: trackingData.end_customer?.address?.city || null,
        state: trackingData.end_customer?.address?.state || null,
        eventDate: new Date(h.event_date)
      }));

      if (events.length > 0) {
        await prisma.trackingEvent.createMany({
          data: events
        });
      }

      return { success: true, message: 'Rastreio atualizado com sucesso' };

    } catch (error) {
      console.error('Erro ao sincronizar rastreio:', error);
      return { success: false, message: 'Erro ao sincronizar', error };
    }
  }

  /**
   * Sincronizar todos os pedidos ativos (não finalizados)
   */
  async syncAllActive() {
    try {
      const activeOrders = await prisma.order.findMany({
        where: {
          status: {
            notIn: [OrderStatus.DELIVERED, OrderStatus.FAILURE, OrderStatus.RETURNED, OrderStatus.CANCELED]
          }
        }
      });

      const results = {
        total: activeOrders.length,
        success: 0,
        failed: 0,
        errors: [] as string[]
      };

      for (const order of activeOrders) {
        const result = await this.syncOrder(order.id);
        
        if (result.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(`${order.orderNumber}: ${result.message}`);
        }

        // Delay entre requisições para não sobrecarregar API
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return results;
    } catch (error) {
      console.error('Erro ao sincronizar pedidos:', error);
      throw error;
    }
  }
}