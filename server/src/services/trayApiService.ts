import axios, { AxiosInstance } from 'axios';
import { trayAuthService } from './trayAuthService';
import { trayRateLimiter } from './rateLimiter';
import { normalizeExcludedPlatformFreight } from '../utils/orderExclusion';

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

const isTrayParticularSalesChannel = (salesChannel: string | null | undefined) =>
  String(salesChannel || '').trim().toUpperCase() === 'TRAY - PARTICULAR';

export class TrayApiService {
  private storeId: string;
  private manualToken?: string;

  constructor(storeId: string, manualToken?: string) {
    this.storeId = storeId;
    this.manualToken = manualToken;
  }

  private async getClient(): Promise<{
    client: AxiosInstance;
    apiAddress: string;
    accessToken: string;
  }> {
    const auth = await trayAuthService.getValidAuthData(this.storeId);

    if (!auth) {
      throw new Error('Loja nao autorizada. Execute o fluxo OAuth primeiro.');
    }

    const client = axios.create({
      baseURL: auth.apiAddress,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return {
      client,
      apiAddress: auth.apiAddress,
      accessToken: this.manualToken || auth.accessToken,
    };
  }

  async listOrders(params: {
    page?: number;
    limit?: number;
    status?: string;
    modified?: string;
  } = {}): Promise<TrayOrderListResponse> {
    return trayRateLimiter.execute(async () => {
      try {
        const { client, accessToken } = await this.getClient();

        const response = await client.get('/orders', {
          params: {
            access_token: accessToken,
            page: params.page || 1,
            limit: params.limit || 50,
            status: params.status,
            modified: params.modified,
          },
        });

        return response.data;
      } catch (error: any) {
        console.error('Erro ao listar pedidos da Tray:', error.response?.data || error.message);
        throw new Error(`Erro na API Tray: ${error.response?.data?.message || error.message}`);
      }
    });
  }

  async getOrderComplete(orderId: string | number): Promise<TrayOrderCompleteResponse> {
    return trayRateLimiter.execute(async () => {
      try {
        const { client, accessToken } = await this.getClient();

        const response = await client.get(`/orders/${orderId}/complete`, {
          params: {
            access_token: accessToken,
          },
        });

        return response.data;
      } catch (error: any) {
        console.error(`Erro ao buscar pedido ${orderId}:`, error.response?.data || error.message);
        throw new Error(`Erro na API Tray: ${error.response?.data?.message || error.message}`);
      }
    });
  }

  async syncAllOrders(params: {
    status?: string;
    modified?: string;
    skipOrderNumbers?: Set<string>;
  } = {}, hooks?: {
    onLog?: (message: string) => void;
    onOrdersBatch?: (orders: any[]) => Promise<void> | void;
  }): Promise<any[]> {
    console.log('Iniciando sincronizacao com API Tray...');
    console.log('Rate limit ativo: 180 requisicoes/minuto');

    const allOrders: any[] = [];
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      console.log(`Buscando pagina ${currentPage}...`);
      hooks?.onLog?.(`Buscando pagina ${currentPage} da Tray.`);

      const stats = trayRateLimiter.getStats();
      console.log(
        `Rate limit: ${stats.requestsInWindow}/${stats.maxRequests} (${stats.utilizationPercent}%)`,
      );
      hooks?.onLog?.(
        `Rate limit Tray: ${stats.requestsInWindow}/${stats.maxRequests} (${stats.utilizationPercent}%).`,
      );

      const response = await this.listOrders({
        ...params,
        page: currentPage,
        limit: 50,
      });

      const orders = response.Orders || [];
      console.log(`${orders.length} pedidos encontrados na pagina ${currentPage}`);
      hooks?.onLog?.(`${orders.length} pedido(s) encontrados na pagina ${currentPage}.`);

      const pageOrders: any[] = [];
      const completeOrderTasks = orders.map(async (orderWrapper) => {
        const orderId = orderWrapper.Order.id;

        if (params.skipOrderNumbers?.has(String(orderId))) {
          console.log(`Pedido ${orderId} ja existe no banco, pulando...`);
          hooks?.onLog?.(`Pedido ${orderId} ja existe no banco e foi ignorado.`);
          return;
        }

        try {
          const completeData = await this.getOrderComplete(orderId);
          allOrders.push(completeData.Order);
          pageOrders.push(completeData.Order);
        } catch (error) {
          console.error(`Erro ao buscar pedido ${orderId}, pulando...`);
          hooks?.onLog?.(`Erro ao buscar pedido ${orderId}; item ignorado.`);
        }
      });

      await Promise.all(completeOrderTasks);

      if (pageOrders.length > 0) {
        await hooks?.onOrdersBatch?.(pageOrders);
      }

      const { total, limit } = response.paging;
      const totalPages = Math.ceil(total / limit);
      hasMorePages = currentPage < totalPages;
      currentPage += 1;
    }

    console.log(`Total de ${allOrders.length} pedidos sincronizados`);
    hooks?.onLog?.(`Total de ${allOrders.length} pedido(s) novo(s) retornados pela Tray.`);

    const finalStats = trayRateLimiter.getStats();
    console.log(
      `Estatisticas finais: ${finalStats.requestsInWindow} requisicoes utilizadas (${finalStats.utilizationPercent}%)`,
    );

    return allOrders;
  }

  mapTrayOrderToSystem(trayOrder: any): any {
    const customer = trayOrder.Customer || {};
    const mainAddress = customer.CustomerAddresses?.[0]?.CustomerAddress || {};
    const normalizedChannelFreight = normalizeExcludedPlatformFreight(
      trayOrder.shipment,
    );

    const statusMap: Record<string, string> = {
      'A ENVIAR': 'PENDING',
      '5- AGUARDANDO FATURAMENTO': 'PENDING',
      'AGUARDANDO ENVIO': 'CREATED',
      ENVIADO: 'SHIPPED',
      FINALIZADO: 'DELIVERED',
      ENTREGUE: 'DELIVERED',
      CANCELADO: 'CANCELED',
      DEVOLVIDO: 'RETURNED',
      'EM SEPARACAO': 'CREATED',
      'EM SEPARAÇÃO': 'CREATED',
    };

    const trayStatus = (trayOrder.status || 'A ENVIAR').toUpperCase();
    const mappedStatus =
      normalizedChannelFreight ? 'CHANNEL_LOGISTICS' : statusMap[trayStatus] || 'PENDING';
    const salesChannel = 'Tray - ' + (trayOrder.point_sale || 'LOJA VIRTUAL');
    const trayEstimatedDeliveryDate =
      trayOrder.estimated_delivery_date &&
      trayOrder.estimated_delivery_date !== '0000-00-00'
        ? new Date(trayOrder.estimated_delivery_date)
        : null;

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
      salesChannel,
      freightType: normalizedChannelFreight || trayOrder.shipment || 'Nao informado',
      freightValue: parseFloat(trayOrder.shipment_value || '0'),
      shippingDate:
        trayOrder.shipment_date && trayOrder.shipment_date !== '0000-00-00'
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
      maxShippingDeadline: trayEstimatedDeliveryDate,
      estimatedDeliveryDate: isTrayParticularSalesChannel(salesChannel)
        ? null
        : trayEstimatedDeliveryDate,
      carrierEstimatedDeliveryDate: null,
      status: mappedStatus,
      isDelayed: false,
      trackingHistory: [
        {
          status: mappedStatus,
          description: `Pedido ${trayOrder.status || 'criado'}`,
          date: new Date(trayOrder.date),
          city: mainAddress.city || customer.city || '',
          state: mainAddress.state || customer.state || '',
        },
      ],
    };
  }
}
