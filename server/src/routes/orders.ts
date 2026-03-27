import { Router } from 'express';
import { importOrders, getOrders, getOrderById, syncSingleOrder, syncAllOrders, startSyncAllOrders, getSyncAllStatus, clearOrdersDatabase, openOrderTracking, searchExternalOrder } from '../controllers/orderController';

const router = Router();

// POST /api/orders/clear - Limpar banco de dados
router.post('/clear', clearOrdersDatabase);

// POST /api/orders/import - Importar planilha
router.post('/import', importOrders);

// GET /api/orders - Listar todos os pedidos
router.get('/', getOrders);

// POST /api/orders/search-external - Buscar pedido/NF/XML em provedores externos
router.post('/search-external', searchExternalOrder);

// GET /api/orders/:id/open-tracking - Abrir link direto de rastreio
router.get('/:id/open-tracking', openOrderTracking);

// GET /api/orders/:id - Detalhes de um pedido
router.get('/:id', getOrderById);

// POST /api/orders/:id/sync - Sincronizar rastreio de um pedido
router.post('/:id/sync', syncSingleOrder);

// POST /api/orders/sync-all - Sincronizar todos os pedidos ativos
router.post('/sync-all', syncAllOrders);
router.post('/sync-all/start', startSyncAllOrders);
router.get('/sync-all/status', getSyncAllStatus);

export default router;
