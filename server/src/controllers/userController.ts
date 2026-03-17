
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Login
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    // Optional: Auto-create default admin if it doesn't exist (for safety so user isn't locked out)
    if (email === 'admin@avantracking.com.br') {
      const adminExists = await prisma.user.findUnique({ where: { email: 'admin@avantracking.com.br' } });
      if (!adminExists) {
        const hashedAdminPassword = await bcrypt.hash('Alfenas@172839', 10);
        await prisma.user.create({
          data: {
            name: 'Admin',
            email: 'admin@avantracking.com.br',
            password: hashedAdminPassword,
            role: 'ADMIN',
          }
        });
      }
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        password: true, // We need to fetch the password for comparison
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(String(password), user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Don't send the password back
    const { password: _, ...userWithoutPassword } = user;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Listar usuários
export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true, // Incluir companyId
        company: { select: { name: true } }, // Incluir nome da empresa
        createdAt: true,
        updatedAt: true,
        // Não retornar senha
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Criar usuário
export const createUser = async (req: Request, res: Response) => {
  const { name, email, password, role, companyId } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const passwordString = String(password);

  try {
    const existingUser = await prisma.user.findUnique({ where: { email: String(email) } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(passwordString, 10);

    const user = await prisma.user.create({
      data: {
        name: String(name),
        email: String(email),
        password: hashedPassword,
        role: role ? String(role) as any : 'USER',
        companyId: companyId || null, // Opcional
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        createdAt: true
      }
    });

    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

// Atualizar usuário (incluindo senha)
export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email, password, role } = req.body;

  try {
    const data: any = {};
    if (name) data.name = String(name);
    if (email) data.email = String(email);
    if (role) data.role = String(role) as any;
    if (password) {
      data.password = await bcrypt.hash(String(password), 10);
    }

    const user = await prisma.user.update({
      where: { id: String(id) },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// Deletar usuário
export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await prisma.user.delete({ where: { id: String(id) } });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};
