import { PrismaClient } from '@prisma/client';

// O banco de dados principal (geralmente Drossi, configurado no .env)
export const mainPrisma = new PrismaClient();

// Cache de clientes Prisma por URL para não estourar conexões
const tenantClients: Record<string, PrismaClient> = {};

export const getTenantPrisma = async (companyId?: string | null): Promise<PrismaClient> => {
    if (!companyId) return mainPrisma;

    try {
        const company = await mainPrisma.company.findUnique({
            where: { id: companyId },
            select: { databaseUrl: true }
        });

        if (company && company.databaseUrl) {
            const url = company.databaseUrl;
            
            if (!tenantClients[url]) {
                tenantClients[url] = new PrismaClient({
                    datasources: {
                        db: {
                            url: url
                        }
                    }
                });
            }
            return tenantClients[url];
        }
    } catch (error) {
        console.error('Erro ao buscar tenant Prisma:', error);
    }

    // Fallback para o banco principal se não tiver URL específica
    return mainPrisma;
};

// Utilitário para propagar criações/atualizações de usuários e empresas para todos os tenants
export const syncToAllTenants = async (action: (prisma: PrismaClient) => Promise<void>) => {
    try {
        const companies = await mainPrisma.company.findMany({
            where: { databaseUrl: { not: null } },
            select: { databaseUrl: true }
        });

        const urls = [...new Set(companies.map(c => c.databaseUrl as string))];

        // Sempre executar na principal
        await action(mainPrisma);

        // Executar nas outras
        for (const url of urls) {
            if (!tenantClients[url]) {
                tenantClients[url] = new PrismaClient({
                    datasources: { db: { url } }
                });
            }
            try {
                await action(tenantClients[url]);
            } catch (err) {
                console.error(`Erro ao sincronizar com tenant ${url}:`, err);
            }
        }
    } catch (error) {
        console.error('Erro geral no syncToAllTenants:', error);
    }
};
