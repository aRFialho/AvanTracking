
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando limpeza de pedidos...');
  try {
    const deleted = await prisma.order.deleteMany({});
    console.log(`✅ Sucesso! ${deleted.count} pedidos foram deletados.`);
  } catch (error) {
    console.error('Erro ao deletar pedidos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
