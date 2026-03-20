import { PrismaClient } from '@prisma/client';

const mpozenatoPrisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://neondb_owner:npg_Z5IFBLUxfkm4@ep-gentle-cloud-acby0n39-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
        }
    }
});

const drossiPrisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://neondb_owner:npg_6ulkSDP5vIFy@ep-bold-leaf-ackbvmtw-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
        }
    }
});

async function syncCompanies() {
    const drossiCompanies = await drossiPrisma.company.findMany();
    
    for (const c of drossiCompanies) {
        const exists = await mpozenatoPrisma.company.findUnique({ where: { id: c.id } });
        if (!exists) {
            await mpozenatoPrisma.company.create({
                data: {
                    id: c.id,
                    name: c.name,
                    cnpj: c.cnpj,
                    databaseUrl: c.databaseUrl
                }
            });
            console.log(`Synced company ${c.name} to Mpozenato DB`);
        }
    }

    const drossiUsers = await drossiPrisma.user.findMany();
    for (const u of drossiUsers) {
        const exists = await mpozenatoPrisma.user.findUnique({ where: { id: u.id } });
        if (!exists) {
            await mpozenatoPrisma.user.create({
                data: {
                    id: u.id,
                    email: u.email,
                    name: u.name,
                    password: u.password,
                    role: u.role,
                    companyId: u.companyId
                }
            });
            console.log(`Synced user ${u.name} to Mpozenato DB`);
        }
    }
}

syncCompanies().catch(console.error).finally(() => {
    mpozenatoPrisma.$disconnect();
    drossiPrisma.$disconnect();
});
