import axios, { AxiosInstance } from 'axios';
import { trayAuthService } from './trayAuthService';
import { trayRateLimiter } from './rateLimiter';

interface TrayPaging {
  total: number;
  page: number;
  offset: number;
  limit: number;
  maxLimit: number;
}

interface TrayOrderListResponse {
  paging: TrayPaging;
  Orders: Array<{ Order: any }>;
}

interface TrayOrderCompleteResponse {
  Order: any;
}

export class TrayApiService {
  private storeId: string;
  private manualToken?: string; // ← ADICIONAR (para testes futuros)

  constructor(storeId: string, manualToken?: string) {
    this.storeId = storeId;
    this.manualToken = manualToken;
  }

  /**
   * Obter cliente HTTP configurado com token válido
   */
  private async getClient(): Promise<{ client: AxiosInstance; apiAddress: string }> {
    // Buscar autenticação do banco
    const auth = await trayAuthService.getAuthData(this.storeId);

    if (!auth) {
      throw new Error('Loja não autorizada. Execute o fluxo OAuth primeiro.');
    }

    // Verificar se token está válido ou renovar
    const accessToken = await trayAuthService.getValidAuth(this.storeId);

    if (!accessToken) {
      throw new Error('Não foi possível obter token válido.');
    }

    const client = axios.create({
      baseURL: auth.apiAddress,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    return { client, apiAddress: auth.apiAddress };
  }

  /**
   * Listar pedidos com paginação - COM RATE LIMIT
   */
  async listOrders(params: {
    page?: number;
    limit?: number;
    status?: string;
    modified?: string;
  } = {}): Promise<TrayOrderListResponse> {
    // ✅ USAR RATE LIMITER
    return await trayRateLimiter.execute(async () => {
      try {
        const { client } = await this.getClient();
        const accessToken = this.manualToken || await trayAuthService.getValidAuth(this.storeId);

        const response = await client.get('/orders', {
          params: {
            access_token: accessToken,
            page: params.page || 1,
            limit: params.limit || 50,
            status: params.status,
            modified: params.modified,
          }
        });

        return response.data;
      } catch (error: any) {
        console.error('❌ Erro ao listar pedidos da Tray:', error.response?.data || error.message);
        throw new Error(`Erro na API Tray: ${error.response?.data?.message || error.message}`);
      }
    });
  }

  /**
   * Buscar dados completos de um pedido - COM RATE LIMIT
   */
  async getOrderComplete(orderId: string | number): Promise<TrayOrderCompleteResponse> {
    // ✅ USAR RATE LIMITER
    return await trayRateLimiter.execute(async () => {
      try {
        const { client } = await this.getClient();
        const accessToken = this.manualToken || await trayAuthService.getValidAuth(this.storeId);

        const response = await client.get(`/orders/${orderId}/complete`, {
          params: {
            access_token: accessToken
          }
        });

        return response.data;
      } catch (error: any) {
        console.error(`❌ Erro ao buscar pedido ${orderId}:`, error.response?.data || error.message);
        throw new Error(`Erro na API Tray: ${error.response?.data?.message || error.message}`);
      }
    });
  }

  /**
   * Sincronizar todos os pedidos (com paginação automática) - COM RATE LIMIT
   */
  async syncAllOrders(params: {
    status?: string;
    modified?: string;
  } = {}): Promise<any[]> {
    console.log('📦 Iniciando sincronização com API Tray...');
    console.log('🔒 Rate limit ativo: 180 requisições/minuto');
    
    const allOrders: any[] = [];
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      console.log(`📄 Buscando página ${currentPage}...`);
      
      // Mostrar estatísticas do rate limit
      const stats = trayRateLimiter.getStats();
      console.log(`   📊 Rate limit: ${stats.requestsInWindow}/${stats.maxRequests} (${stats.utilizationPercent}%)`);
      
      const response = await this.listOrders({
        ...params,
        page: currentPage,
        limit: 50
      });

      const orders = response.Orders || [];
      console.log(`   ✓ ${orders.length} pedidos encontrados`);

      // Buscar dados completos de cada pedido
      for (const orderWrapper of orders) {
        const orderId = orderWrapper.Order.id;
        try {
          const completeData = await this.getOrderComplete(orderId);
          allOrders.push(completeData.Order);
        } catch (error) {
          console.error(`   ⚠️ Erro ao buscar pedido ${orderId}, pulando...`);
        }
      }

      // Verificar se há mais páginas
      const { total, limit } = response.paging;
      const totalPages = Math.ceil(total / limit);
      hasMorePages = currentPage < totalPages;
      currentPage++;
    }

    console.log(`✅ Total de ${allOrders.length} pedidos sincronizados`);
    
    // Mostrar estatísticas finais
    const finalStats = trayRateLimiter.getStats();
    console.log(`📊 Estatísticas finais: ${finalStats.requestsInWindow} requisições utilizadas (${finalStats.utilizationPercent}%)`);
    
    return allOrders;
  }

  /**
   * Mapear pedido da Tray para formato do sistema
   */
  mapTrayOrderToSystem(trayOrder: any): any {
    const customer = trayOrder.Customer || {};
    const mainAddress = customer.CustomerAddresses?.[0]?.CustomerAddress || {};

    // Mapear status da Tray para OrderStatus
    const statusMap: Record<string, string> = {
      'A ENVIAR': 'PENDING',
      'ENVIADO': 'SHIPPED',
      'ENTREGUE': 'DELIVERED',
      'CANCELADO': 'CANCELED',
      'DEVOLVIDO': 'RETURNED',
      'EM SEPARAÇÃO': 'CREATED',
    };

    const trayStatus = (trayOrder.status || 'A ENVIAR').toUpperCase();
    const mappedStatus = statusMap[trayStatus] || 'PENDING';

    return {
      orderNumber: String(trayOrder.id),
      invoiceNumber: trayOrder.OrderInvoice?.[0]?.OrderInvoice?.number || null,
      trackingCode: trayOrder.sending_code || null,
      customerName: customer.name || 'Desconhecido',
      corporateName: customer.company_name || null,
      cpf: customer.cpf || null,
      cnpj: customer.cnpj || null,
      phone: customer.phone || null,
      mobile: customer.cellphone || null,
      salesChannel: 'Tray - ' + (trayOrder.point_sale || 'LOJA VIRTUAL'),
      freightType: trayOrder.shipment || 'Não informado',
      freightValue: parseFloat(trayOrder.shipment_value || '0'),
      shippingDate: trayOrder.shipment_date && trayOrder.shipment_date !== '0000-00-00' 
        ? new Date(trayOrder.shipment_date) 
        : new Date(trayOrder.date),
      address: mainAddress.address || customer.address || '',
      number: mainAddress.number || customer.number || '',
      complement: mainAddress.complement || customer.complement || null,
      neighborhood: mainAddress.neighborhood || customer.neighborhood || '',
      city: mainAddress.city || customer.city || '',
      state: mainAddress.state || customer.state || '',
      zipCode: (mainAddress.zip_code || customer.zip_code || '').replace('-', ''),
      totalValue: parseFloat(trayOrder.total || '0'),
      recipient: mainAddress.recipient || customer.name || null,
      maxShippingDeadline: trayOrder.estimated_delivery_date && trayOrder.estimated_delivery_date !== '0000-00-00'
        ? new Date(trayOrder.estimated_delivery_date)
        : null,
      estimatedDeliveryDate: trayOrder.estimated_delivery_date && trayOrder.estimated_delivery_date !== '0000-00-00'
        ? new Date(trayOrder.estimated_delivery_date)
        : null,
      status: mappedStatus,
      isDelayed: false,
      trackingHistory: [{
        status: mappedStatus,
        description: `Pedido ${trayOrder.status || 'criado'}`,
        date: new Date(trayOrder.date),
        city: mainAddress.city || customer.city || '',
        state: mainAddress.state || customer.state || '',
      }]
    };
  }
}