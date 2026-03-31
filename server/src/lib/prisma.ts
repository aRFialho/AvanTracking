import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
  __avantrackingPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.__avantrackingPrisma ||
  new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__avantrackingPrisma = prisma;
}
