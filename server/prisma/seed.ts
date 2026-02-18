import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("Alfenas@123", 10);

  await prisma.user.upsert({
    where: { email: "admin@avantracking.com" },
    update: {},
    create: {
      email: "admin@avantracking.com",
      name: "Admin",
      password: hashedPassword,
      role: Role.ADMIN,
    },
  });

  console.log("Admin user created");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
