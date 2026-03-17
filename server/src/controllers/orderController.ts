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

// Funções auxiliares de validação
const safeString = (value: any): string | null => {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim();
};

const safeDate = (value: any): Date | null => {
  if (!value) return null;
  
  try {
    const date = new Date(value);
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

// ✅ IMPORTAÇÃO OTIMIZADA EM LOTE COM TRACKING EVENTS
export const importOrders = async (req: Request, res: Response) => {
  console.log('📦 Iniciando importação em lote...');
  
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'Nenhum pedido válido para importar' });
    }

    console.log(`📊 Recebidos ${orders.length} pedidos`);

    // Debug: verificar se vem trackingHistory
    const firstWithHistory = orders.find(o => o.trackingHistory && o.trackingHistory.length > 0);
    if (firstWithHistory) {
      console.log(`🔍 TrackingHistory detectado. Exemplo:`, firstWithHistory.trackingHistory[0]);
    } else {
      console.log(`⚠️  Nenhum pedido com trackingHistory. Criando eventos automáticos.`);
    }

    // 1️⃣ Buscar TODOS os pedidos existentes de uma vez
    const orderNumbers = orders.map(o => String(o.orderNumber));
    const existingOrders = await prisma.order.findMany({
      where: {
        orderNumber: { in: orderNumbers }
      },
      select: { orderNumber: true, status: true, id: true }
    });

    console.log(`🔍 Encontrados ${existingOrders.length} pedidos existentes`);

    const existingMap = new Map(existingOrders.map(o => [o.orderNumber, o]));

    // 2️⃣ Separar novos de atualizações
    const toUpdate: Array<{ id: string; status: OrderStatus; lastUpdate: Date }> = [];
    let skipped = 0;
    let created = 0;
    let totalTrackingEvents = 0;

    for (const orderData of orders) {
      const orderNumber = String(orderData.orderNumber);
      const existing = existingMap.get(orderNumber);
      const newStatus = mapStatus(orderData.status);

      if (existing) {
        // Atualizar apenas se status mudou
        if (existing.status !== newStatus) {
          toUpdate.push({
            id: existing.id,
            status: newStatus,
            lastUpdate: new Date()
          });
        } else {
          skipped++;
        }
      } else {
        // 3️⃣ CRIAR PEDIDO COM TRACKING EVENTS
        const shippingDate = safeDate(orderData.shippingDate);
        const maxDeadline = safeDate(orderData.maxShippingDeadline);
        const estimatedDate = safeDate(orderData.estimatedDeliveryDate);

        // ✅ Preparar tracking events
        let trackingEventsData: any[] = [];

        if (orderData.trackingHistory && Array.isArray(orderData.trackingHistory) && orderData.trackingHistory.length > 0) {
          // Se vem do frontend, usar
          trackingEventsData = orderData.trackingHistory.map((event: any) => ({
            status: safeString(event.status) || newStatus,
            description: safeString(event.description) || 'Evento de rastreamento',
            eventDate: safeDate(event.date) || new Date(),
            city: safeString(event.city),
            state: safeString(event.state),
          }));
        } else {
          // Se não vem, criar evento inicial automático
          const statusDescriptions: Record<string, string> = {
            'PENDING': 'Pedido pendente de processamento',
            'CREATED': 'Pedido criado',
            'SHIPPED': 'Pedido enviado',
            'DELIVERY_ATTEMPT': 'Tentativa de entrega',
            'DELIVERED': 'Pedido entregue',
            'FAILURE': 'Falha na entrega',
            'RETURNED': 'Pedido devolvido',
            'CANCELED': 'Pedido cancelado',
            'CHANNEL_LOGISTICS': 'Logística gerenciada pelo canal de venda',
          };

          trackingEventsData = [{
            status: newStatus,
            description: statusDescriptions[newStatus] || 'Status atualizado',
            eventDate: shippingDate || new Date(),
            city: safeString(orderData.city),
            state: safeString(orderData.state),
          }];
        }

        totalTrackingEvents += trackingEventsData.length;

        // Criar pedido com eventos
        await prisma.order.create({
          data: {
            orderNumber,
            invoiceNumber: safeString(orderData.invoiceNumber),
            trackingCode: safeString(orderData.trackingCode),
            customerName: safeString(orderData.customerName) || 'Desconhecido',
            corporateName: safeString(orderData.corporateName),
            cpf: safeString(orderData.cpf),
            cnpj: safeString(orderData.cnpj),
            phone: safeString(orderData.phone),
            mobile: safeString(orderData.mobile),
            salesChannel: safeString(orderData.salesChannel) || 'Não identificado',
            freightType: safeString(orderData.freightType) || 'Aguardando',
            freightValue: safeNumber(orderData.freightValue),
            shippingDate: shippingDate,
            address: safeString(orderData.address) || '',
            number: safeString(orderData.number) || '',
            complement: safeString(orderData.complement),
            neighborhood: safeString(orderData.neighborhood) || '',
            city: safeString(orderData.city) || '',
            state: safeString(orderData.state) || '',
            zipCode: safeString(orderData.zipCode) || '',
            totalValue: safeNumber(orderData.totalValue),
            recipient: safeString(orderData.recipient),
            maxShippingDeadline: maxDeadline,
            estimatedDeliveryDate: estimatedDate,
            status: newStatus,
            isDelayed: orderData.isDelayed || false,
            
            // ✅ CRIAR TRACKING EVENTS
            trackingEvents: {
              create: trackingEventsData
            }
          }
        });

        created++;
        
        if (created % 100 === 0) {
          console.log(`   ✓ Criados ${created} pedidos com ${totalTrackingEvents} eventos`);
        }
      }
    }

    // 4️⃣ Atualizar todos de uma vez (em transação)
    let updated = 0;
    if (toUpdate.length > 0) {
      console.log(`🔄 Atualizando ${toUpdate.length} pedidos em lote...`);
      
      const BATCH_SIZE = 100;
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = toUpdate.slice(i, i + BATCH_SIZE);
        
        await prisma.$transaction(
          batch.map(u => 
            prisma.order.update({
              where: { id: u.id },
              data: { status: u.status, lastUpdate: u.lastUpdate }
            })
          )
        );
        
        updated += batch.length;
      }
      
      console.log(`✅ ${updated} pedidos atualizados`);
    }

    const message = `Importação concluída: ${created} criados (${totalTrackingEvents} eventos), ${updated} atualizados, ${skipped} ignorados`;
    console.log(`🎉 ${message}`);

    return res.json({
      success: true,
      message,
      results: { created, updated, skipped, totalTrackingEvents, errors: [] }
    });

  } catch (error) {
    console.error('❌ Erro na importação:', error);
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
      lastApiSync: order.lastApiSync,
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
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

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