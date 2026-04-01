import { PrismaClient } from '@prisma/client';
import { TrayApiService } from '../services/trayApiService';

const prisma = new PrismaClient() as any;
const PAGE_SIZE = 100;

const forceAll =
  ['1', 'true', 'yes', 'y', 'sim'].includes(
    String(process.env.FORCE_ALL || '')
      .trim()
      .toLowerCase(),
  );

const companyFilter = String(process.env.COMPANY_ID || '').trim() || null;

const safeString = (value: unknown) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : 'Erro desconhecido';

const extractStoredQuotationId = (order: {
  originalQuotedFreightQuotationId?: unknown;
  apiRawPayload?: any;
}) =>
  safeString(order.originalQuotedFreightQuotationId) ||
  safeString(order.apiRawPayload?.id_quotation) ||
  safeString(order.apiRawPayload?.quotation_id) ||
  null;

async function processCompany(company: {
  id: string;
  name: string;
}) {
  console.log(`\nEmpresa: ${company.name}`);

  const trayApiService = new TrayApiService(company.id);
  let cursor: string | null = null;
  let scanned = 0;
  let queued = 0;
  let updated = 0;
  let missingInTray = 0;
  let failed = 0;

  while (true) {
    const orders = await prisma.order.findMany({
      where: {
        companyId: company.id,
      },
      orderBy: {
        id: 'asc',
      },
      take: PAGE_SIZE,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        orderNumber: true,
        invoiceNumber: true,
        originalQuotedFreightQuotationId: true,
        originalQuotedFreightValue: true,
        originalQuotedFreightDate: true,
        originalQuotedFreightDetails: true,
        apiRawPayload: true,
      },
    });

    if (orders.length === 0) {
      break;
    }

    cursor = orders[orders.length - 1].id;
    scanned += orders.length;

    const targetOrders = orders.filter((order) => {
      if (!safeString(order.orderNumber)) {
        return false;
      }

      if (forceAll) {
        return true;
      }

      return !extractStoredQuotationId(order);
    });

    queued += targetOrders.length;

    for (const order of targetOrders) {
      try {
        const completeOrderResponse = await trayApiService.getOrderComplete(
          order.orderNumber,
        );
        const trayOrder = completeOrderResponse?.Order;

        if (!trayOrder || typeof trayOrder !== 'object') {
          throw new Error('Pedido nao retornou payload completo na Tray.');
        }

        const mappedOrder = trayApiService.mapTrayOrderToSystem(trayOrder);
        const quotationId =
          safeString(mappedOrder?.originalQuotedFreightQuotationId) ||
          safeString(trayOrder?.id_quotation) ||
          safeString(trayOrder?.quotation_id);

        if (!quotationId) {
          missingInTray += 1;
          console.log(
            `  SEM ID ${order.orderNumber}: a Tray nao retornou quotation_id para este pedido.`,
          );
          continue;
        }

        await prisma.order.update({
          where: {
            id: order.id,
          },
          data: {
            originalQuotedFreightQuotationId: quotationId,
            originalQuotedFreightValue:
              mappedOrder?.originalQuotedFreightValue ??
              order.originalQuotedFreightValue,
            originalQuotedFreightDate:
              mappedOrder?.originalQuotedFreightDate ??
              order.originalQuotedFreightDate,
            originalQuotedFreightDetails:
              mappedOrder?.originalQuotedFreightDetails ??
              order.originalQuotedFreightDetails,
            apiRawPayload: trayOrder,
          },
        });

        updated += 1;
        console.log(`  OK ${order.orderNumber}: quotation_id ${quotationId}`);
      } catch (error) {
        failed += 1;
        console.error(`  ERRO ${order.orderNumber}: ${formatError(error)}`);
      }
    }
  }

  console.log(
    `Resumo ${company.name}: ${updated} atualizado(s), ${missingInTray} sem quotation_id na Tray, ${failed} com erro, ${Math.max(
      scanned - queued,
      0,
    )} ja estavam preenchidos no recorte.`,
  );

  return {
    scanned,
    queued,
    updated,
    missingInTray,
    failed,
  };
}

async function main() {
  console.log(
    `Backfill de quotation_id da Tray iniciado (${forceAll ? 'modo completo' : 'somente faltantes'}).`,
  );

  const companies = await prisma.company.findMany({
    where: companyFilter
      ? {
          id: companyFilter,
        }
      : undefined,
    select: {
      id: true,
      name: true,
      trayAuth: {
        select: {
          id: true,
        },
      },
    },
  });

  const eligibleCompanies = companies.filter((company) => Boolean(company.trayAuth));

  if (eligibleCompanies.length === 0) {
    console.log('Nenhuma empresa com Tray autorizada foi encontrada.');
    return;
  }

  let totalQueued = 0;
  let totalUpdated = 0;
  let totalMissingInTray = 0;
  let totalFailed = 0;

  for (const company of eligibleCompanies) {
    const result = await processCompany({
      id: company.id,
      name: company.name,
    });

    totalQueued += result.queued;
    totalUpdated += result.updated;
    totalMissingInTray += result.missingInTray;
    totalFailed += result.failed;
  }

  console.log('\nBackfill de quotation_id concluido.');
  console.log(`Pedidos enviados para consulta na Tray: ${totalQueued}`);
  console.log(`Pedidos atualizados: ${totalUpdated}`);
  console.log(`Pedidos sem quotation_id retornado pela Tray: ${totalMissingInTray}`);
  console.log(`Pedidos com erro: ${totalFailed}`);
}

main()
  .catch((error) => {
    console.error('Falha no backfill de quotation_id da Tray:', formatError(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
