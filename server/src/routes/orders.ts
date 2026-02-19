import { Router } from 'express';
import { importOrders, getOrders, getOrderById, syncSingleOrder, syncAllOrders } from '../controllers/orderController';

const router = Router();

// POST /api/orders/import - Importar planilha
router.post('/import', importOrders);

// GET /api/orders - Listar todos os pedidos
router.get('/', getOrders);

// GET /api/orders/:id - Detalhes de um pedido
router.get('/:id', getOrderById);

// POST /api/orders/:id/sync - Sincronizar rastreio de um pedido
router.post('/:id/sync', syncSingleOrder);

// POST /api/orders/sync-all - Sincronizar todos os pedidos ativos
router.post('/sync-all', syncAllOrders);

export default router;