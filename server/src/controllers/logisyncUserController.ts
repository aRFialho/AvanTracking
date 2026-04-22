import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const MIN_PASSWORD_LENGTH = 8;
const ROOT_LOGISYNC_ADMIN_EMAIL = 'logisync@admin.com.br';

type LogisyncRole = 'ADMIN_SUPER' | 'ANALYST';

const normalizeText = (value: unknown) => String(value || '').trim();

const normalizeRole = (value: unknown): LogisyncRole =>
  String(value || '').trim().toUpperCase() === 'ADMIN_SUPER'
    ? 'ADMIN_SUPER'
    : 'ANALYST';

const requireLogisyncSuperAdmin = (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Usuario nao autenticado' });
    return null;
  }

  if (req.user.module !== 'logisync') {
    res.status(403).json({ error: 'Acesso permitido apenas no modulo Logisync.' });
    return null;
  }

  if (!req.user.isSuperAdmin || req.user.role !== 'ADMIN_SUPER') {
    res.status(403).json({
      error: 'Apenas admin super do Logisync pode gerenciar usuarios.',
    });
    return null;
  }

  return req.user;
};

const ensureCompanyExists = async (companyId: string) => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });

  if (!company?.id) {
    throw new Error('Empresa nao encontrada.');
  }

  return company;
};

export const listLogisyncUsers = async (req: Request, res: Response) => {
  if (!requireLogisyncSuperAdmin(req, res)) return;

  const companyId = normalizeText(req.query?.companyId);
  if (!companyId) {
    return res.status(400).json({
      error: 'Informe a empresa para listar os usuarios do Logisync.',
    });
  }

  try {
    await ensureCompanyExists(companyId);

    const users = await prisma.logisyncUser.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        companyId: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return res.json({
      success: true,
      companyId,
      users,
    });
  } catch (error) {
    console.error('Erro ao listar usuarios Logisync:', error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Falha ao listar usuarios do Logisync.',
    });
  }
};

export const createLogisyncUser = async (req: Request, res: Response) => {
  if (!requireLogisyncSuperAdmin(req, res)) return;

  const name = normalizeText(req.body?.name);
  const email = normalizeText(req.body?.email).toLowerCase();
  const password = normalizeText(req.body?.password);
  const role = normalizeRole(req.body?.role);
  const companyIdRaw = normalizeText(req.body?.companyId);
  const companyId = role === 'ADMIN_SUPER' ? null : companyIdRaw;

  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e e-mail sao obrigatorios.' });
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `A senha deve ter no minimo ${MIN_PASSWORD_LENGTH} caracteres.`,
    });
  }

  if (role !== 'ADMIN_SUPER' && !companyId) {
    return res.status(400).json({
      error: 'Selecione uma empresa para vincular o usuario.',
    });
  }

  try {
    if (companyId) {
      await ensureCompanyExists(companyId);
    }

    const existingUser = await prisma.logisyncUser.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser?.id) {
      return res.status(400).json({ error: 'Ja existe um usuario com este e-mail.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const created = await prisma.logisyncUser.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        isActive: true,
        companyId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        companyId: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({
      success: true,
      user: created,
      message: 'Usuario Logisync criado com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao criar usuario Logisync:', error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Falha ao criar usuario do Logisync.',
    });
  }
};

export const updateLogisyncUser = async (req: Request, res: Response) => {
  if (!requireLogisyncSuperAdmin(req, res)) return;

  const userId = normalizeText(req.params?.id);
  if (!userId) {
    return res.status(400).json({ error: 'Informe o usuario.' });
  }

  const name = req.body?.name;
  const email = req.body?.email;
  const password = req.body?.password;
  const role = req.body?.role;
  const companyIdRaw = req.body?.companyId;
  const isActive = req.body?.isActive;

  try {
    const existing = await prisma.logisyncUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
      },
    });

    if (!existing?.id) {
      return res.status(404).json({ error: 'Usuario nao encontrado.' });
    }

    const nextRole =
      role === undefined ? (existing.role as LogisyncRole) : normalizeRole(role);
    const normalizedCompanyIdInput =
      companyIdRaw === undefined || companyIdRaw === null
        ? undefined
        : normalizeText(companyIdRaw);

    const nextCompanyId =
      nextRole === 'ADMIN_SUPER'
        ? null
        : normalizedCompanyIdInput !== undefined
          ? normalizedCompanyIdInput || null
          : existing.companyId;

    if (nextRole !== 'ADMIN_SUPER' && !nextCompanyId) {
      return res.status(400).json({
        error: 'Usuarios nao-super precisam estar vinculados a uma empresa.',
      });
    }

    if (nextCompanyId) {
      await ensureCompanyExists(nextCompanyId);
    }

    const nextEmail =
      email === undefined ? undefined : normalizeText(email).toLowerCase();
    if (nextEmail) {
      const userWithEmail = await prisma.logisyncUser.findUnique({
        where: { email: nextEmail },
        select: { id: true },
      });

      if (userWithEmail?.id && userWithEmail.id !== userId) {
        return res.status(400).json({ error: 'Ja existe um usuario com este e-mail.' });
      }
    }

    if (existing.email.toLowerCase() === ROOT_LOGISYNC_ADMIN_EMAIL) {
      if (nextRole !== 'ADMIN_SUPER') {
        return res.status(400).json({
          error: 'O admin raiz do Logisync deve permanecer como ADMIN_SUPER.',
        });
      }

      if (nextCompanyId !== null) {
        return res.status(400).json({
          error: 'O admin raiz do Logisync nao pode ser vinculado a empresa.',
        });
      }
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      data.name = normalizeText(name);
    }
    if (nextEmail !== undefined) {
      data.email = nextEmail;
    }
    if (role !== undefined) {
      data.role = nextRole;
    }
    if (normalizedCompanyIdInput !== undefined || role !== undefined) {
      data.companyId = nextCompanyId;
    }
    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }
    if (password !== undefined) {
      const parsedPassword = normalizeText(password);
      if (!parsedPassword || parsedPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({
          error: `A senha deve ter no minimo ${MIN_PASSWORD_LENGTH} caracteres.`,
        });
      }

      data.password = await bcrypt.hash(parsedPassword, 10);
    }

    const updated = await prisma.logisyncUser.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        companyId: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      success: true,
      user: updated,
      message: 'Usuario Logisync atualizado com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao atualizar usuario Logisync:', error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Falha ao atualizar usuario do Logisync.',
    });
  }
};

export const deleteLogisyncUser = async (req: Request, res: Response) => {
  if (!requireLogisyncSuperAdmin(req, res)) return;

  const userId = normalizeText(req.params?.id);
  if (!userId) {
    return res.status(400).json({ error: 'Informe o usuario.' });
  }

  try {
    const existing = await prisma.logisyncUser.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!existing?.id) {
      return res.status(404).json({ error: 'Usuario nao encontrado.' });
    }

    if (existing.email.toLowerCase() === ROOT_LOGISYNC_ADMIN_EMAIL) {
      return res.status(400).json({
        error: 'O admin raiz do Logisync nao pode ser removido.',
      });
    }

    await prisma.logisyncUser.delete({ where: { id: userId } });

    return res.json({
      success: true,
      message: 'Usuario Logisync removido com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao remover usuario Logisync:', error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Falha ao remover usuario do Logisync.',
    });
  }
};
