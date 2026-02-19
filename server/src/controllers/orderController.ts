import { Request, Response } from 'express';
import { PrismaClient, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Helper: Map frontend status string to Prisma enum
const mapStatus = (status: string): OrderStatus => {
  const statusMap: Record<string, OrderStatus> = {
    'PENDING': OrderStatus.PENDING,
    'CREATED': OrderStatus.CREATED,
    'SHIPPED': OrderStatus.SHIPPED,
    'DELIVERY_ATTEMPT': OrderStatus.DELIVERY_ATTEMPT,
    'DELIVERED': OrderStatus.DELIVERED,
    'FAILURE': OrderStatus.FAILURE,
    'RETURNED': OrderStatus.RETURNED,
    'CANCELED': OrderStatus.CANCELED,
    'CHANNEL_LOGISTICS': OrderStatus.CHANNEL_LOGISTICS,
  };
  return statusMap[status] || OrderStatus.PENDING;
};

// POST /api/orders/import
// POST /api/orders/import
export const importOrders = async (req: Request, res: Response) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'Nenhum pedido válido para importar' });
    }

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[]
    };

    // ✅ Funções auxiliares de validação
    const safeString = (value: any): string | null => {
      if (value === null || value === undefined || value === '') return null;
      return String(value).trim();
    };

    const safeDate = (value: any): Date | null => {
      if (!value) return null;
      
      try {
        const date = new Date(value);
        
        // Validar se a data é razoável (entre 1900 e 2100)
        const year = date.getFullYear();
        if (isNaN(year) || year < 1900 || year > 2100) {
          return null;
        }
        
        return date;
      } catch {
        return null;
      }
    };

    const safeNumber = (value: any): number => {
      if (value === null || value === undefined || value === '') return 0;
      const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
      return isNaN(num) ? 0 : num;
    };

    for (const orderData of orders) {
      try {
        // 1. Buscar pedido existente por orderNumber
        const existing = await prisma.order.findFirst({
          where: { orderNumber: String(orderData.orderNumber) }
        });

        if (existing) {
          // 2. PEDIDO EXISTE: Atualizar apenas o status
          const newStatus = mapStatus(orderData.status);
          
          // Só atualiza se o status mudou
          if (existing.status !== newStatus) {
            await prisma.order.update({
              where: { id: existing.id },
              data: {
                status: newStatus,
                lastUpdate: new Date()
              }
            });
            results.updated++;
          } else {
            results.skipped++;
          }
        } else {
          // 3. PEDIDO NÃO EXISTE: Criar novo registro
          
          // ✅ Validar e sanitizar dados
          const shippingDate = safeDate(orderData.shippingDate);
          const maxDeadline = safeDate(orderData.maxShippingDeadline);
          const estimatedDate = safeDate(orderData.estimatedDeliveryDate);

          await prisma.order.create({
            data: {
              orderNumber: String(orderData.orderNumber),
              invoiceNumber: safeString(orderData.invoiceNumber),
              trackingCode: safeString(orderData.trackingCode),
              customerName: safeString(orderData.customerName) || 'Desconhecido',
              corporateName: safeString(orderData.corporateName),
              cpf: safeString(orderData.cpf), // ✅ Converter para string
              cnpj: safeString(orderData.cnpj), // ✅ Converter para string
              phone: safeString(orderData.phone),
              mobile: safeString(orderData.mobile),
              salesChannel: safeString(orderData.salesChannel) || 'Não identificado',
              freightType: safeString(orderData.freightType) || 'Aguardando',
              freightValue: safeNumber(orderData.freightValue),
              shippingDate: shippingDate, // ✅ Data validada ou null
              address: safeString(orderData.address) || '',
              number: safeString(orderData.number) || '',
              complement: safeString(orderData.complement),
              neighborhood: safeString(orderData.neighborhood) || '',
              city: safeString(orderData.city) || '',
              state: safeString(orderData.state) || '',
              zipCode: safeString(orderData.zipCode) || '',
              totalValue: safeNumber(orderData.totalValue),
              recipient: safeString(orderData.recipient),
              maxShippingDeadline: maxDeadline, // ✅ Data validada ou null
              estimatedDeliveryDate: estimatedDate, // ✅ Data validada ou null
              status: mapStatus(orderData.status),
              isDelayed: orderData.isDelayed || false,
            }
          });
          results.created++;
        }
      } catch (err) {
        console.error(`Erro ao processar pedido ${orderData.orderNumber}:`, err);
        results.errors.push(`Pedido ${orderData.orderNumber}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
      }
    }

    return res.json({
      success: true,
      message: `Importação concluída: ${results.created} criados, ${results.updated} atualizados, ${results.skipped} ignorados`,
      results
    });

  } catch (error) {
    console.error('Erro na importação:', error);
    return res.status(500).json({ 
      error: 'Erro ao importar pedidos', 
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

// GET /api/orders
export const getOrders = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        status: { not: OrderStatus.CANCELED }
      },
      include: {
        carrier: true,
        trackingEvents: {
          orderBy: { eventDate: 'desc' },
          take: 5
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // ✅ Transformar para formato esperado pelo frontend
    const formattedOrders = orders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      invoiceNumber: order.invoiceNumber,
      trackingCode: order.trackingCode,
      customerName: order.customerName,
      corporateName: order.corporateName,
      cpf: order.cpf,
      cnpj: order.cnpj,
      phone: order.phone,
      mobile: order.mobile,
      salesChannel: order.salesChannel,
      freightType: order.freightType || 'Aguardando',
      freightValue: order.freightValue,
      shippingDate: order.shippingDate,
      address: order.address,
      number: order.number,
      complement: order.complement,
      neighborhood: order.neighborhood,
      city: order.city,
      state: order.state,
      zipCode: order.zipCode,
      totalValue: order.totalValue,
      recipient: order.recipient,
      maxShippingDeadline: order.maxShippingDeadline,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      status: order.status,
      isDelayed: order.isDelayed,
      lastUpdate: order.lastUpdate,
      trackingHistory: order.trackingEvents.map(event => ({
        status: event.status,
        description: event.description,
        date: event.eventDate,
        city: event.city,
        state: event.state
      }))
    }));

    return res.json(formattedOrders);
  } catch (error) {
    console.error('Erro ao buscar pedidos:', error);
    return res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
};

// GET /api/orders/:id
// GET /api/orders/:id
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // ✅ Validação: garantir que id é string
    if (typeof id !== 'string') {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        carrier: true,
        trackingEvents: {
          orderBy: { eventDate: 'desc' }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    return res.json(order);
  } catch (error) {
    console.error('Erro ao buscar pedido:', error);
    return res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
};
import { TrackingService } from '../services/trackingService';

const trackingService = new TrackingService();

// POST /api/orders/:id/sync
export const syncSingleOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (typeof id !== 'string') {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const result = await trackingService.syncOrder(id);

    if (result.success) {
      // Buscar pedido atualizado
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          carrier: true,
          trackingEvents: {
            orderBy: { eventDate: 'desc' }
          }
        }
      });

      return res.json({
        success: true,
        message: result.message,
        order
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('Erro ao sincronizar pedido:', error);
    return res.status(500).json({ error: 'Erro ao sincronizar pedido' });
  }
};

// POST /api/orders/sync-all
export const syncAllOrders = async (req: Request, res: Response) => {
  try {
    const results = await trackingService.syncAllActive();

    return res.json({
      success: true,
      message: `Sincronização concluída: ${results.success} sucessos, ${results.failed} falhas`,
      results
    });
  } catch (error) {
    console.error('Erro ao sincronizar todos os pedidos:', error);
    return res.status(500).json({ error: 'Erro ao sincronizar pedidos' });
  }
};