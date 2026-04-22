import { prisma } from '../lib/prisma';
import { TrayApiService } from '../services/trayApiService';
import { importOrdersForCompany } from '../services/orderImportService';

const DEFAULT_ORDER_NUMBERS = ['319961', '319907', '319829'];

const parseOrderNumbers = () => {
  const raw = String(process.env.ORDER_NUMBERS || '').trim();
  const source = raw.length > 0 ? raw : DEFAULT_ORDER_NUMBERS.join(',');

  return Array.from(
    new Set(
      source
        .split(/[,;\s]+/g)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
};

const orderNumbers = parseOrderNumbers();
const companyFilter = String(process.env.COMPANY_ID || '').trim() || null;

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : 'Erro desconhecido';

async function main() {
  if (orderNumbers.length === 0) {
    console.log('Nenhum pedido informado para reprocessar.');
    return;
  }

  console.log(
    `Reprocessamento Tray iniciado para os pedidos: ${orderNumbers.join(', ')}`,
  );
  if (companyFilter) {
    console.log(`Filtro de empresa ativo: ${companyFilter}`);
  }

  const companies = await prisma.company.findMany({
    where: companyFilter
      ? {
          id: companyFilter,
        }
      : undefined,
    select: {
      id: true,
      name: true,
      trayIntegrationEnabled: true,
      trayAuth: {
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  const eligibleCompanies = companies.filter(
    (company) =>
      company.trayIntegrationEnabled !== false && Boolean(company.trayAuth),
  );

  if (eligibleCompanies.length === 0) {
    console.log('Nenhuma empresa elegivel com Tray autorizada foi encontrada.');
    return;
  }

  let totalMatched = 0;
  let totalUpdated = 0;
  let totalFailed = 0;

  for (const company of eligibleCompanies) {
    const existingOrders = await prisma.order.findMany({
      where: {
        companyId: company.id,
        orderNumber: {
          in: orderNumbers,
        },
      },
      select: {
        orderNumber: true,
        status: true,
        freightType: true,
      },
      orderBy: {
        orderNumber: 'asc',
      },
    });

    if (existingOrders.length === 0) {
      continue;
    }

    totalMatched += existingOrders.length;
    console.log(
      `\nEmpresa ${company.name}: ${existingOrders.length} pedido(s) localizado(s).`,
    );

    const trayApiService = new TrayApiService(company.id);

    for (const order of existingOrders) {
      const beforeStatus = String(order.status || '');
      const beforeCarrier = String(order.freightType || '');

      try {
        const completeOrderResponse = await trayApiService.getOrderComplete(
          order.orderNumber,
        );
        const trayOrder = completeOrderResponse?.Order;

        if (!trayOrder || typeof trayOrder !== 'object') {
          throw new Error('Pedido nao retornou payload completo na Tray.');
        }

        const mappedOrder = trayApiService.mapTrayOrderToSystem(trayOrder, {
          companyName: company.name,
        });

        const importResult = await importOrdersForCompany(company.id, [mappedOrder]);
        const importUpdated =
          Number(importResult?.results?.updated || 0) +
          Number(importResult?.results?.created || 0);

        const refreshedOrder = await prisma.order.findFirst({
          where: {
            companyId: company.id,
            orderNumber: order.orderNumber,
          },
          select: {
            status: true,
            freightType: true,
            invoiceNumber: true,
            trackingCode: true,
          },
        });

        const afterStatus = String(refreshedOrder?.status || '');
        const afterCarrier = String(refreshedOrder?.freightType || '');

        totalUpdated += importUpdated > 0 ? 1 : 0;
        console.log(
          `  OK ${order.orderNumber}: status ${beforeStatus} -> ${afterStatus} | transportadora ${beforeCarrier} -> ${afterCarrier} | NF ${refreshedOrder?.invoiceNumber || '-'} | rastreio ${refreshedOrder?.trackingCode || '-'}`,
        );
      } catch (error) {
        totalFailed += 1;
        console.error(
          `  ERRO ${order.orderNumber}: ${formatError(error)}`,
        );
      }
    }
  }

  if (totalMatched === 0) {
    console.log(
      'Nenhum dos pedidos informados foi encontrado nas empresas elegiveis.',
    );
    return;
  }

  console.log('\nReprocessamento concluido.');
  console.log(`Pedidos localizados: ${totalMatched}`);
  console.log(`Pedidos reprocessados com sucesso: ${totalUpdated}`);
  console.log(`Pedidos com falha: ${totalFailed}`);
}

main()
  .catch((error) => {
    console.error('Falha no reprocessamento especifico:', formatError(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
