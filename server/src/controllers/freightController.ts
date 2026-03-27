import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { TrayFreightService } from '../services/trayFreightService';

const prisma = new PrismaClient() as any;

const safeString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

const safeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const normalized =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value).replace(/[^\d,.-]/g, '').replace(',', '.'));

  return Number.isFinite(normalized) ? normalized : null;
};

const safeInteger = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeZipCode = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '').trim();
  return digits || null;
};

const normalizeBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'sim'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'nao', 'não'].includes(normalized)) return false;
  return null;
};

const buildProductsHash = (productsRaw: unknown) => {
  if (productsRaw === null || productsRaw === undefined) return null;

  try {
    const serialized = typeof productsRaw === 'string' ? productsRaw : JSON.stringify(productsRaw);
    if (!serialized) return null;
    return createHash('sha256').update(serialized).digest('hex');
  } catch {
    return null;
  }
};

/**
 * POST /api/freight/quote/:orderId
 * Cotar frete de um pedido especifico
 */
export const quoteOrderFreight = async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.orderId);

    if (!req.user?.companyId) {
      return res.status(403).json({ error: 'Usuario sem empresa vinculada' });
    }

    console.log(`Cotando frete para pedido ${orderId}...`);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido nao encontrado' });
    }

    if (!order.zipCode) {
      return res.status(400).json({ error: 'Pedido sem CEP' });
    }

    const freightService = new TrayFreightService(req.user.companyId);

    const cotationParams = {
      zipcode: order.zipCode,
      products: [
        {
          product_id: order.orderNumber,
          price: order.totalValue || 100,
          quantity: 1,
        },
      ],
    };

    const cotationResult = await freightService.quoteFreight(cotationParams);

    if (!cotationResult.Shipping.cotation || cotationResult.Shipping.cotation.length === 0) {
      return res.status(404).json({
        error: 'Nenhuma opcao de frete disponivel',
        details: 'Nao ha formas de envio configuradas para este CEP',
      });
    }

    const cheapestOption = freightService.getCheapestOption(cotationResult.Shipping.cotation);
    const fastestOption = freightService.getFastestOption(cotationResult.Shipping.cotation);
    const quotedValue = cheapestOption ? Number.parseFloat(cheapestOption.value) : 0;

    await prisma.order.update({
      where: { id: orderId },
      data: {
        recalculatedFreightValue: quotedValue,
        recalculatedFreightDate: new Date(),
        recalculatedFreightDetails: cotationResult.Shipping.cotation,
      },
    });

    console.log(`Frete recalculado: R$ ${quotedValue.toFixed(2)}`);

    return res.json({
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      freight: {
        paid: order.freightValue || 0,
        original: order.originalQuotedFreightValue ?? order.quotedFreightValue ?? null,
        recalculated: quotedValue,
        difference: (order.freightValue || 0) - quotedValue,
        percentDifference: order.freightValue
          ? (((order.freightValue - quotedValue) / order.freightValue) * 100).toFixed(2)
          : 0,
      },
      options: {
        cheapest: cheapestOption,
        fastest: fastestOption,
        all: cotationResult.Shipping.cotation,
      },
      destination: cotationResult.Shipping.destination,
    });
  } catch (error) {
    console.error('Erro ao cotar frete:', error);
    return res.status(500).json({
      error: 'Erro ao cotar frete',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * POST /api/freight/quote-batch
 * Cotar frete de varios pedidos em lote
 */
export const quoteBatchFreight = async (req: Request, res: Response) => {
  try {
    const { orderIds } = req.body;

    if (!req.user?.companyId) {
      return res.status(403).json({ error: 'Usuario sem empresa vinculada' });
    }

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'orderIds deve ser um array nao vazio' });
    }

    console.log(`Cotando frete para ${orderIds.length} pedidos...`);

    const results: any[] = [];
    const freightService = new TrayFreightService(req.user.companyId);

    for (const orderId of orderIds) {
      try {
        const orderIdStr = String(orderId);

        const order = await prisma.order.findUnique({
          where: { id: orderIdStr },
        });

        if (!order || !order.zipCode) {
          results.push({
            orderId: orderIdStr,
            success: false,
            error: 'Pedido nao encontrado ou sem CEP',
          });
          continue;
        }

        const cotationParams = {
          zipcode: order.zipCode,
          products: [
            {
              product_id: order.orderNumber,
              price: order.totalValue || 100,
              quantity: 1,
            },
          ],
        };

        const cotationResult = await freightService.quoteFreight(cotationParams);
        const cheapestOption = freightService.getCheapestOption(cotationResult.Shipping.cotation);
        const quotedValue = cheapestOption ? Number.parseFloat(cheapestOption.value) : 0;

        await prisma.order.update({
          where: { id: orderIdStr },
          data: {
            recalculatedFreightValue: quotedValue,
            recalculatedFreightDate: new Date(),
            recalculatedFreightDetails: cotationResult.Shipping.cotation,
          },
        });

        results.push({
          orderId: orderIdStr,
          orderNumber: order.orderNumber,
          success: true,
          paid: order.freightValue || 0,
          original: order.originalQuotedFreightValue ?? order.quotedFreightValue ?? null,
          recalculated: quotedValue,
          difference: (order.freightValue || 0) - quotedValue,
        });
      } catch (error) {
        results.push({
          orderId: String(orderId),
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    const successful = results.filter((result) => result.success).length;

    return res.json({
      success: true,
      total: orderIds.length,
      successful,
      failed: orderIds.length - successful,
      results,
    });
  } catch (error) {
    console.error('Erro ao cotar frete em lote:', error);
    return res.status(500).json({
      error: 'Erro ao cotar frete em lote',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * POST /api/tray/checkout-quotes
 * Salva snapshot da cotacao original do checkout da Tray.
 */
export const saveTrayCheckoutQuoteSnapshot = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      return res.status(403).json({ error: 'Usuario sem empresa vinculada' });
    }

    const quotationId = safeString(req.body?.quotationId);
    if (!quotationId) {
      return res.status(400).json({ error: 'quotationId e obrigatorio' });
    }

    const productsRaw = req.body?.productsRaw ?? req.body?.products ?? null;
    const snapshotData = req.body?.snapshotData ?? req.body ?? null;

    const data = {
      companyIdValue: req.user.companyId,
      trayStoreId: safeString(req.body?.trayStoreId),
      token: safeString(req.body?.token),
      sessionId: safeString(req.body?.sessionId),
      originZipCode: normalizeZipCode(req.body?.originZipCode),
      destinationZipCode: normalizeZipCode(req.body?.destinationZipCode),
      productsRaw,
      productsHash: safeString(req.body?.productsHash) || buildProductsHash(productsRaw),
      quotationId,
      shippingId: safeString(req.body?.shippingId),
      shipmentType: safeString(req.body?.shipmentType),
      serviceCode: safeString(req.body?.serviceCode),
      serviceName: safeString(req.body?.serviceName),
      integrator: safeString(req.body?.integrator),
      quotedValue: safeNumber(req.body?.quotedValue),
      minPeriod: safeInteger(req.body?.minPeriod),
      maxPeriod: safeInteger(req.body?.maxPeriod),
      selectedPossible: normalizeBoolean(req.body?.selectedPossible),
      snapshotData,
    };

    const savedQuote = await prisma.trayCheckoutQuote.upsert({
      where: { quotationId },
      update: data,
      create: data,
    });

    return res.json({
      success: true,
      message: 'Snapshot da cotacao original salvo com sucesso.',
      quote: savedQuote,
    });
  } catch (error) {
    console.error('Erro ao salvar snapshot da cotacao original da Tray:', error);
    return res.status(500).json({
      error: 'Erro ao salvar snapshot da cotacao original da Tray',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};
