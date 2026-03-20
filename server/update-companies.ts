import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://neondb_owner:npg_6ulkSDP5vIFy@ep-bold-leaf-ackbvmtw-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
        }
    }
});

async function main() {
    const drossi = await prisma.company.findFirst({
        where: { name: { contains: 'DROSSI', mode: 'insensitive' } }
    });
    
    if (drossi) {
        await prisma.company.update({
            where: { id: drossi.id },
            data: { databaseUrl: "postgresql://neondb_owner:npg_6ulkSDP5vIFy@ep-bold-leaf-ackbvmtw-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require" }
        });
        console.log("Drossi updated");
    } else {
        await prisma.company.create({
            data: {
                name: 'DROSSI INTERIORES',
                databaseUrl: "postgresql://neondb_owner:npg_6ulkSDP5vIFy@ep-bold-leaf-ackbvmtw-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
            }
        });
        console.log("Drossi created");
    }

    const mpozenato = await prisma.company.findFirst({
        where: { name: { contains: 'MPOZENATO', mode: 'insensitive' } }
    });
    
    if (mpozenato) {
        await prisma.company.update({
            where: { id: mpozenato.id },
            data: { databaseUrl: "postgresql://neondb_owner:npg_Z5IFBLUxfkm4@ep-gentle-cloud-acby0n39-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require" }
        });
        console.log("Mpozenato updated");
    } else {
        await prisma.company.create({
            data: {
                name: 'MPOZENATO',
                databaseUrl: "postgresql://neondb_owner:npg_Z5IFBLUxfkm4@ep-gentle-cloud-acby0n39-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
            }
        });
        console.log("Mpozenato created");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
