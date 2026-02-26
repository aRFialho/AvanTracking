
export type PageView = 'dashboard' | 'orders' | 'upload' | 'alerts' | 'delivery-failures' | 'admin';

export enum OrderStatus {
  PENDING = 'PENDING', // Importado, aguardando info
  CREATED = 'CREATED', // Criado na transportadora
  SHIPPED = 'SHIPPED', // Em trânsito
  DELIVERY_ATTEMPT = 'DELIVERY_ATTEMPT', // Saiu para entrega
  DELIVERED = 'DELIVERED', // Entregue
  FAILURE = 'FAILURE', // Falha
  RETURNED = 'RETURNED', // Devolvido
  CANCELED = 'CANCELED', // Cancelado
  CHANNEL_LOGISTICS = 'CHANNEL_LOGISTICS' // Logistica do Canal (Shopee/ME2)
}

export interface TrackingEvent {
  status: string;
  description: string;
  date: Date;
  city?: string;
  state?: string;
}

export interface Order {
  // Identification
  id: string; // Internal ID or mapped from 'Pedido'
  orderNumber: string; // 'Pedido'
  
  // Customer
  customerName: string; // 'Nome do Cliente'
  corporateName?: string; // 'Razão Social'
  cpf?: string; // 'CPF'
  cnpj?: string; // 'CNPJ'
  phone?: string; // 'Telefone'
  mobile?: string; // 'Celular'
  
  // Logistics
  salesChannel: string; // 'Canal de venda'
  freightType: string; // 'Frete tipo' (Transportadora) - Updated by API
  freightValue: number; // 'Frete valor'
  shippingDate: Date; // 'Envio data'
  
  // Address
  address: string; // 'Endereço'
  number: string; // 'Número'
  complement?: string; // 'Complemento'
  neighborhood: string; // 'Bairro'
  city: string; // 'Cidade'
  state: string; // 'Estado'
  zipCode: string; // 'Cep'
  
  // Financial
  totalValue: number; // 'Total'
  
  // Delivery Constraints
  recipient?: string; // 'Destinatário'
  maxShippingDeadline: Date; // 'Prazo máximo de envio'
  estimatedDeliveryDate: Date; // 'Data estimada de entrega'
  
  // Tracking State (Mutable)
  status: OrderStatus;
  isDelayed: boolean; // Flag 'risco_atraso'
  trackingHistory: TrackingEvent[];
  lastApiSync: Date | null;
  lastUpdate: Date;
}
