import { Request, Response } from 'express';
import { TrayApiService } from '../services/trayApiService';
import { importOrders } from './orderController';

/**
 * POST /api/tray/sync
 * Sincronizar pedidos da Tray
 */
export const syncTrayOrders = async (req: Request, res: Response) => {
  console.log('🔄 Iniciando sincronização com Tray...');
  
  try {
    const { storeId, status, modified } = req.body;

    if (!storeId) {
      return res.status(400).json({ error: 'storeId é obrigatório' });
    }

    // 1. Criar instância do serviço Tray
    const trayApi = new TrayApiService(storeId);

    // 2. Buscar pedidos da API Tray
    const trayOrders = await trayApi.syncAllOrders({ status, modified });

    if (trayOrders.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhum pedido encontrado na Tray',
        results: { created: 0, updated: 0, skipped: 0 }
      });
    }

    // 3. Mapear pedidos para formato do sistema
    console.log(`🔄 Mapeando ${trayOrders.length} pedidos...`);
    const mappedOrders = trayOrders.map(order => trayApi.mapTrayOrderToSystem(order));

    // 4. Importar usando a função existente
    req.body = { orders: mappedOrders };
    return importOrders(req, res);

  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    return res.status(500).json({
      error: 'Erro ao sincronizar com Tray',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};