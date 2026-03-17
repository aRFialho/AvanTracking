import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { TrayFreightService } from '../services/trayFreightService';

const prisma = new PrismaClient();

/**
 * POST /api/freight/quote/:orderId
 * Cotar frete de um pedido específico
 */
export const quoteOrderFreight = async (req: Request, res: Response) => {
  try {
    // ✅ CORREÇÃO: Garantir que orderId seja string
    const orderId = String(req.params.orderId);
    const { storeId } = req.body;

    if (!storeId) {
      return res.status(400).json({ error: 'storeId é obrigatório' });
    }

    console.log(`💰 Cotando frete para pedido ${orderId}...`);

    // 1. Buscar pedido
    const order = await prisma.order.findUnique({
      where: { id: orderId } // ✅ Agora orderId é string
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    // 2. Validar dados necessários
    if (!order.zipCode) {
      return res.status(400).json({ error: 'Pedido sem CEP' });
    }

    // 3. Preparar dados para cotação
    const freightService = new TrayFreightService(storeId);

    const cotationParams = {
      zipcode: order.zipCode,
      products: [
        {
          product_id: order.orderNumber,
          price: order.totalValue || 100,
          quantity: 1
        }
      ]
    };

    // 4. Cotar frete
    const cotationResult = await freightService.quoteFreight(cotationParams);

    if (!cotationResult.Shipping.cotation || cotationResult.Shipping.cotation.length === 0) {
      return res.status(404).json({ 
        error: 'Nenhuma opção de frete disponível',
        details: 'Não há formas de envio configuradas para este CEP'
      });
    }

    // 5. Buscar opção mais barata
    const cheapestOption = freightService.getCheapestOption(cotationResult.Shipping.cotation);
    const fastestOption = freightService.getFastestOption(cotationResult.Shipping.cotation);

    // 6. Salvar cotação no banco
    const quotedValue = cheapestOption ? parseFloat(cheapestOption.value) : 0;

    // ✅ CORREÇÃO: Campos agora existem no schema
    await prisma.order.update({
      where: { id: orderId },
      data: {
        quotedFreightValue: quotedValue,
        quotedFreightDate: new Date(),
        quotedFreightDetails: cotationResult.Shipping.cotation as any // JSON
      }
    });

    console.log(`✅ Frete cotado: R$ ${quotedValue.toFixed(2)}`);

    // 7. Retornar resultado
    return res.json({
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      freight: {
        paid: order.freightValue || 0,
        quoted: quotedValue,
        difference: (order.freightValue || 0) - quotedValue,
        percentDifference: order.freightValue 
          ? (((order.freightValue - quotedValue) / order.freightValue) * 100).toFixed(2)
          : 0
      },
      options: {
        cheapest: cheapestOption,
        fastest: fastestOption,
        all: cotationResult.Shipping.cotation
      },
      destination: cotationResult.Shipping.destination
    });

  } catch (error) {
    console.error('❌ Erro ao cotar frete:', error);
    return res.status(500).json({
      error: 'Erro ao cotar frete',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

/**
 * POST /api/freight/quote-batch
 * Cotar frete de vários pedidos em lote
 */
export const quoteBatchFreight = async (req: Request, res: Response) => {
  try {
    const { orderIds, storeId } = req.body;

    if (!storeId) {
      return res.status(400).json({ error: 'storeId é obrigatório' });
    }

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'orderIds deve ser um array não vazio' });
    }

    console.log(`💰 Cotando frete para ${orderIds.length} pedidos...`);

    const results: any[] = [];
    const freightService = new TrayFreightService(storeId);

    for (const orderId of orderIds) {
      try {
        // ✅ CORREÇÃO: Garantir que seja string
        const orderIdStr = String(orderId);

        const order = await prisma.order.findUnique({
          where: { id: orderIdStr }
        });

        if (!order || !order.zipCode) {
          results.push({
            orderId: orderIdStr,
            success: false,
            error: 'Pedido não encontrado ou sem CEP'
          });
          continue;
        }

        const cotationParams = {
          zipcode: order.zipCode,
          products: [{
            product_id: order.orderNumber,
            price: order.totalValue || 100,
            quantity: 1
          }]
        };

        const cotationResult = await freightService.quoteFreight(cotationParams);
        const cheapestOption = freightService.getCheapestOption(cotationResult.Shipping.cotation);
        const quotedValue = cheapestOption ? parseFloat(cheapestOption.value) : 0;

        // ✅ CORREÇÃO: Campos agora existem
        await prisma.order.update({
          where: { id: orderIdStr },
          data: {
            quotedFreightValue: quotedValue,
            quotedFreightDate: new Date(),
            quotedFreightDetails: cotationResult.Shipping.cotation as any
          }
        });

        results.push({
          orderId: orderIdStr,
          orderNumber: order.orderNumber,
          success: true,
          paid: order.freightValue || 0,
          quoted: quotedValue,
          difference: (order.freightValue || 0) - quotedValue
        });

        console.log(`   ✓ Pedido ${order.orderNumber}: R$ ${quotedValue.toFixed(2)}`);

      } catch (error) {
        results.push({
          orderId: String(orderId),
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    console.log(`✅ ${successful}/${orderIds.length} cotações realizadas`);

    return res.json({
      success: true,
      total: orderIds.length,
      successful,
      failed: orderIds.length - successful,
      results
    });

  } catch (error) {
    console.error('❌ Erro ao cotar frete em lote:', error);
    return res.status(500).json({
      error: 'Erro ao cotar frete em lote',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};