import axios from 'axios';
import { trayAuthService } from './trayAuthService';
import { trayRateLimiter } from './rateLimiter';

interface FreightCotationParams {
  zipcode: string; // CEP destino
  products: Array<{
    product_id: string;
    price: number;
    quantity: number;
  }>;
}

interface FreightCotationOption {
  id: string;
  id_quotation: string;
  name: string;
  identifier: string;
  value: string; // Valor como string
  min_period: string;
  max_period: string;
  estimated_delivery_date: string;
  information: string;
  taxe?: {
    name: string;
    value: string;
  };
}

interface FreightCotationResponse {
  Shipping: {
    origin: {
      zipcode: string;
      address: string;
      neighborhood: string;
      city: string;
      state: string;
    };
    destination: {
      zipcode: string;
      address: string;
      neighborhood: string;
      city: string;
      state: string;
    };
    cotation: FreightCotationOption[];
  };
}

export class TrayFreightService {
  private storeId: string;

  constructor(storeId: string) {
    this.storeId = storeId;
  }

  /**
   * Cotar frete usando API Tray
   */
  async quoteFreight(params: FreightCotationParams): Promise<FreightCotationResponse> {
    return await trayRateLimiter.execute(async () => {
      try {
        console.log(`💰 Cotando frete para CEP ${params.zipcode}...`);

        // Buscar autenticação
        const auth = await trayAuthService.getAuthData(this.storeId);
        if (!auth) {
          throw new Error('Loja não autorizada');
        }

        const accessToken = await trayAuthService.getValidAuth(this.storeId);
        if (!accessToken) {
          throw new Error('Token inválido');
        }

        // Montar parâmetros da query
        const queryParams: any = {
          access_token: accessToken,
          zipcode: params.zipcode
        };

        // Adicionar produtos ao query string
        params.products.forEach((product, index) => {
          queryParams[`products[${index}][product_id]`] = product.product_id;
          queryParams[`products[${index}][price]`] = product.price;
          queryParams[`products[${index}][quantity]`] = product.quantity;
        });

        // Fazer requisição
        const response = await axios.get(`${auth.apiAddress}/shippings/cotation/`, {
          params: queryParams,
          timeout: 30000
        });

        console.log(`✅ Cotação realizada com sucesso`);
        return response.data;

      } catch (error: any) {
        console.error('❌ Erro ao cotar frete:', error.response?.data || error.message);
        throw new Error(`Erro ao cotar frete: ${error.response?.data?.message || error.message}`);
      }
    });
  }

  /**
   * Buscar a opção de frete mais barata
   */
  getCheapestOption(cotation: FreightCotationOption[]): FreightCotationOption | null {
    if (!cotation || cotation.length === 0) return null;

    return cotation.reduce((cheapest, current) => {
      const cheapestValue = parseFloat(cheapest.value);
      const currentValue = parseFloat(current.value);
      return currentValue < cheapestValue ? current : cheapest;
    });
  }

  /**
   * Buscar a opção de frete mais rápida
   */
  getFastestOption(cotation: FreightCotationOption[]): FreightCotationOption | null {
    if (!cotation || cotation.length === 0) return null;

    return cotation.reduce((fastest, current) => {
      const fastestPeriod = parseInt(fastest.max_period);
      const currentPeriod = parseInt(current.max_period);
      return currentPeriod < fastestPeriod ? current : fastest;
    });
  }

  /**
   * Buscar opção por nome do serviço (ex: "SEDEX", "PAC")
   */
  getOptionByService(cotation: FreightCotationOption[], serviceName: string): FreightCotationOption | null {
    if (!cotation || cotation.length === 0) return null;

    const normalized = serviceName.toLowerCase();
    return cotation.find(option => 
      option.name.toLowerCase().includes(normalized) ||
      option.identifier.toLowerCase().includes(normalized)
    ) || null;
  }
}