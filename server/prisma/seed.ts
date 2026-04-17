
import { LogisyncRole, PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const users = [
    {
      name: 'Admin',
      email: 'admin@avantracking.com.br',
      password: 'admin', // Deveria ser alterado logo
      role: Role.ADMIN,
    },
    {
      name: 'Josy Rossi',
      email: 'dmovambientes@gmail.com',
      password: 'Dmov@123',
      role: Role.USER,
    },
    {
      name: 'Nath Zanin',
      email: 'coordenacao@drossiinteriores.com.br',
      password: 'Alfenas@123',
      role: Role.USER,
    },
  ];

  for (const user of users) {
    const existingUser = await prisma.user.findUnique({
      where: { email: user.email },
    });

    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await prisma.user.create({
        data: {
          name: user.name,
          email: user.email,
          password: hashedPassword,
          role: user.role,
        },
      });
      console.log(`User created: ${user.email}`);
    } else {
      console.log(`User already exists: ${user.email}`);
    }
  }

  const logisyncAdmins = [
    {
      name: 'Logisync Admin',
      email: 'logisync@admin.com.br',
      password: 'Logi@172839',
      role: LogisyncRole.ADMIN_SUPER,
    },
  ];

  for (const user of logisyncAdmins) {
    const existingUser = await prisma.logisyncUser.findUnique({
      where: { email: user.email },
    });

    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await prisma.logisyncUser.create({
        data: {
          name: user.name,
          email: user.email,
          password: hashedPassword,
          role: user.role,
          isActive: true,
        },
      });
      console.log(`Logisync admin created: ${user.email}`);
    } else {
      console.log(`Logisync admin already exists: ${user.email}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
