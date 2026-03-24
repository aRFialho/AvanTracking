import { OrderStatus } from '@prisma/client';

export type SyncTrigger = 'manual' | 'automatic';

export interface SyncTrackingEventReport {
  status: string;
  description: string;
  eventDate: string;
  city: string | null;
  state: string | null;
}

export interface SyncOrderChangeReport {
  orderId: string;
  orderNumber: string;
  trackingCode: string | null;
  customerName: string;
  freightType: string | null;
  previousStatus: OrderStatus;
  currentStatus: OrderStatus;
  previousIsDelayed: boolean;
  currentIsDelayed: boolean;
  previousEstimatedDeliveryDate: string | null;
  currentEstimatedDeliveryDate: string | null;
  lastApiSync: string | null;
  changed: boolean;
  enteredDelivered: boolean;
  enteredDelay: boolean;
  enteredFailure: boolean;
  enteredRoute: boolean;
  latestTrackingStatus: string | null;
  latestTrackingDescription: string | null;
  errorMessage: string | null;
  trackingEvents: SyncTrackingEventReport[];
}

export interface SyncReportSnapshot {
  totalTracked: number;
  delivered: number;
  onRoute: number;
  delayed: number;
  failure: number;
}

export interface TrackingSyncReportPayload {
  companyId: string;
  total: number;
  success: number;
  failed: number;
  errors: string[];
  before: SyncReportSnapshot;
  after: SyncReportSnapshot;
  changes: SyncOrderChangeReport[];
}
