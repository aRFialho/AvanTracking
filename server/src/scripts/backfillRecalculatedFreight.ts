import { PrismaClient } from '@prisma/client';
import {
  needsFreightRecalculation,
  recalculateStoredOrderFreight,
} from '../services/freightRecalculationService';
import { TrayFreightService } from '../services/trayFreightService';

const prisma = new PrismaClient() as any;
const PAGE_SIZE = 100;

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : 'Erro desconhecido';

async function processCompany(company: {
  id: string;
  name: string;
}) {
  console.log(`\nEmpresa: ${company.name}`);

  const freightService = new TrayFreightService(company.id);
  let cursor: string | null = null;
  let scanned = 0;
  let queued = 0;
  let updated = 0;
  let failed = 0;

  while (true) {
    const orders = await prisma.order.findMany({
      where: {
        companyId: company.id,
        OR: [
          { recalculatedFreightDate: null },
          { recalculatedFreightValue: null },
          { recalculatedFreightDetails: null },
        ],
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
        freightType: true,
        zipCode: true,
        freightValue: true,
        apiRawPayload: true,
        recalculatedFreightValue: true,
        recalculatedFreightDate: true,
        recalculatedFreightDetails: true,
      },
    });

    if (orders.length === 0) {
      break;
    }

    cursor = orders[orders.length - 1].id;
    const pendingOrders = orders.filter((order) => needsFreightRecalculation(order));
    scanned += orders.length;
    queued += pendingOrders.length;

    for (const order of pendingOrders) {
      try {
        const result = await recalculateStoredOrderFreight({
          prisma,
          order,
          companyId: company.id,
          freightService,
        });

        if (!result.skipped) {
          updated += 1;
          console.log(
            `  OK ${order.orderNumber}: recalculado em R$ ${(result.quotedValue ?? 0).toFixed(2)}`,
          );
        }
      } catch (error) {
        failed += 1;
        console.error(`  ERRO ${order.orderNumber}: ${formatError(error)}`);
      }
    }
  }

  console.log(
    `Resumo ${company.name}: ${updated} atualizado(s), ${failed} com erro, ${Math.max(
      scanned - queued,
      0,
    )} ja estavam preenchidos no recorte.`,
  );

  return {
    scanned,
    queued,
    updated,
    failed,
  };
}

async function main() {
  const companies = await prisma.company.findMany({
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

  let totalUpdated = 0;
  let totalFailed = 0;
  let totalQueued = 0;

  for (const company of eligibleCompanies) {
    const result = await processCompany({
      id: company.id,
      name: company.name,
    });

    totalUpdated += result.updated;
    totalFailed += result.failed;
    totalQueued += result.queued;
  }

  console.log('\nBackfill de frete recalculado concluido.');
  console.log(`Pedidos avaliados para recotacao: ${totalQueued}`);
  console.log(`Pedidos atualizados: ${totalUpdated}`);
  console.log(`Pedidos com erro: ${totalFailed}`);
}

main()
  .catch((error) => {
    console.error('Falha no backfill de frete recalculado:', formatError(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
