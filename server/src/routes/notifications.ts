import { Router } from 'express';
import {
  addMonitoredOrders,
  getNotificationFeed,
  listMonitoredOrders,
  removeMonitoredOrder,
} from '../controllers/notificationController';

const router = Router();

router.get('/feed', getNotificationFeed);
router.get('/monitored-orders', listMonitoredOrders);
router.post('/monitored-orders', addMonitoredOrders);
router.delete('/monitored-orders/:orderId', removeMonitoredOrder);

export default router;

