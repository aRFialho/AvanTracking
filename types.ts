
export type PageView = 'dashboard' | 'orders' | 'upload' | 'alerts' | 'delivery-failures' | 'admin' | 'no-movement';

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

export interface SyncLogEntry {
  timestamp: string;
  level: "info" | "success" | "error";
  message: string;
}

export interface SyncJobStatus {
  jobId: string;
  companyId: string;
  userId: string;
  status: "running" | "completed" | "failed";
  total: number;
  processed: number;
  success: number;
  failed: number;
  currentOrderNumber: string | null;
  startedAt: string;
  finishedAt: string | null;
  lastUpdatedAt: string;
  error: string | null;
  logs: SyncLogEntry[];
}

export interface SyncScheduleStatus {
  enabled: true;
  intervalMs: number;
  nextScheduledAt: string | null;
}

export interface TrayIntegrationStatus {
  authorized: boolean;
  status: "online" | "offline";
  storeId: string | null;
  storeName: string | null;
  updatedAt: string | null;
  message: string;
}

export interface TraySyncFilters {
  days: 7 | 15 | 30 | 60 | 90;
  statusMode: "all_except_canceled" | "selected";
  statuses: string[];
}

export interface Order {
  // Identification
  id: string; // Internal ID or mapped from 'Pedido'
  orderNumber: string; // 'Pedido'
  trackingCode?: string; // 'Código de rastreio'
  
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
  maxShippingDeadline: Date | null; // 'Prazo máximo de envio'
  estimatedDeliveryDate: Date | null; // 'Data estimada de entrega'
  carrierEstimatedDeliveryDate?: Date | null; // 'Previsão transportadora'
  
  // Tracking State (Mutable)
  status: OrderStatus;
  isDelayed: boolean; // Flag 'risco_atraso'
  trackingHistory: TrackingEvent[];
  lastApiSync: Date | null;
  lastUpdate: Date;
}
