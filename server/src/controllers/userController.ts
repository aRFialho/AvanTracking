import crypto from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { generateToken } from '../middleware/auth';
import { sendAccessEmail } from '../services/accessEmailService';
import { prisma } from '../lib/prisma';

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

type AccessTokenType = 'INVITE' | 'RESET_PASSWORD';

const hashAccessToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

const formatExpiryLabel = (expiresAt: Date) => {
  const diffMs = expiresAt.getTime() - Date.now();
  const totalMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (totalMinutes < 60) {
    return `${totalMinutes} minuto(s)`;
  }

  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < 24) {
    return `${totalHours} hora(s)`;
  }

  const totalDays = Math.round(totalHours / 24);
  return `${totalDays} dia(s)`;
};

const getAppBaseUrl = (req: Request) => {
  const configuredUrl = process.env.APP_BASE_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol =
    typeof forwardedProto === 'string' && forwardedProto.trim()
      ? forwardedProto.split(',')[0].trim()
      : req.protocol;

  return `${protocol}://${req.get('host')}`;
};

const buildAccessUrl = (
  req: Request,
  token: string,
  mode: 'invite' | 'reset',
) => {
  const baseUrl = getAppBaseUrl(req);
  const params = new URLSearchParams({
    mode,
    token,
  });

  return `${baseUrl}/?${params.toString()}`;
};

const requireAdmin = (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Usuario nao autenticado' });
    return null;
  }

  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Apenas administradores podem realizar esta acao' });
    return null;
  }

  return req.user;
};

const getValidAccessTokenRecord = async (rawToken: string) => {
  const accessToken = await prisma.userAccessToken.findUnique({
    where: { tokenHash: hashAccessToken(rawToken) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!accessToken) {
    return null;
  }

  if (accessToken.usedAt) {
    return null;
  }

  if (accessToken.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return accessToken;
};

const createAccessToken = async (
  userId: string,
  type: AccessTokenType,
  ttlMs: number,
) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.userAccessToken.create({
    data: {
      userId,
      type,
      tokenHash: hashAccessToken(rawToken),
      expiresAt,
    },
  });

  return {
    rawToken,
    expiresAt,
  };
};

const issueAndSendAccessEmail = async (
  req: Request,
  user: { id: string; name: string; email: string },
  type: AccessTokenType,
) => {
  const ttlMs = type === 'INVITE' ? INVITE_TOKEN_TTL_MS : RESET_TOKEN_TTL_MS;
  const mode = type === 'INVITE' ? 'invite' : 'reset';

  await prisma.userAccessToken.deleteMany({
    where: {
      userId: user.id,
      type,
      usedAt: null,
    },
  });

  const { rawToken, expiresAt } = await createAccessToken(user.id, type, ttlMs);
  const actionUrl = buildAccessUrl(req, rawToken, mode);

  await sendAccessEmail({
    toEmail: user.email,
    toName: user.name,
    accessType: type,
    actionUrl,
    expiresLabel: formatExpiryLabel(expiresAt),
  });
};

// Login
export const login = async (req: Request, res: Response) => {
  const { email, password, module } = req.body;
  const authModule =
    String(module || 'avantracking').toLowerCase() === 'logisync'
      ? 'logisync'
      : 'avantracking';

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    if (authModule === 'logisync') {
      const adminEmail = 'logisync@admin.com.br';
      const adminPassword = 'Logi@172839';

      const existingLogisyncAdmin = await prisma.logisyncUser.findUnique({
        where: { email: adminEmail },
      });

      if (!existingLogisyncAdmin) {
        const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
        await prisma.logisyncUser.create({
          data: {
            name: 'Logisync Admin',
            email: adminEmail,
            password: hashedAdminPassword,
            role: 'ADMIN_SUPER',
            isActive: true,
            companyId: null,
          },
        });
      }

      const logisyncUser = await prisma.logisyncUser.findUnique({
        where: { email: String(email) },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          companyId: true,
          password: true,
        },
      });

      if (!logisyncUser || !logisyncUser.isActive) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isPasswordValid = await bcrypt.compare(
        String(password),
        logisyncUser.password,
      );

      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (logisyncUser.role !== 'ADMIN_SUPER' && !logisyncUser.companyId) {
        return res.status(403).json({
          error:
            'Usuario Logisync sem empresa vinculada. Solicite ajuste ao admin super.',
        });
      }

      const token = generateToken({
        id: logisyncUser.id,
        email: logisyncUser.email,
        companyId: logisyncUser.companyId,
        role: logisyncUser.role,
        module: 'logisync',
        isSuperAdmin: logisyncUser.role === 'ADMIN_SUPER',
      });

      return res.json({
        id: logisyncUser.id,
        email: logisyncUser.email,
        name: logisyncUser.name,
        role: logisyncUser.role,
        companyId: logisyncUser.companyId,
        module: 'logisync',
        isSuperAdmin: logisyncUser.role === 'ADMIN_SUPER',
        token,
      });
    }

    if (email === 'admin@avantracking.com.br') {
      const adminExists = await prisma.user.findUnique({
        where: { email: 'admin@avantracking.com.br' },
      });

      if (!adminExists) {
        const hashedAdminPassword = await bcrypt.hash('Alfenas@172839', 10);
        await prisma.user.create({
          data: {
            name: 'Admin',
            email: 'admin@avantracking.com.br',
            password: hashedAdminPassword,
            role: 'ADMIN',
          },
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
        password: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(String(password), user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { password: _, ...userWithoutPassword } = user;
    const token = generateToken({
      id: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
      module: 'avantracking',
      isSuperAdmin: false,
    });

    res.json({
      ...userWithoutPassword,
      module: 'avantracking',
      isSuperAdmin: false,
      token,
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Listar usuarios
export const getUsers = async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        company: { select: { name: true } },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Criar usuario com convite
export const createUser = async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { name, email, role, companyId } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: String(email) },
    });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const temporaryPassword = crypto.randomBytes(24).toString('hex');
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    const user = await prisma.user.create({
      data: {
        name: String(name),
        email: String(email),
        password: hashedPassword,
        role: role ? (String(role) as any) : 'USER',
        companyId: companyId || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        createdAt: true,
      },
    });

    try {
      await issueAndSendAccessEmail(req, user, 'INVITE');
    } catch (emailError) {
      await prisma.userAccessToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
      throw emailError;
    }

    res.status(201).json({
      ...user,
      message: 'Usuario criado e convite enviado por e-mail com sucesso.',
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

// Atualizar usuario (incluindo senha)
export const updateUser = async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;
  const { name, email, password, role, companyId } = req.body;

  try {
    const data: any = {};
    if (name) data.name = String(name);
    if (email) data.email = String(email);
    if (role) data.role = String(role) as any;
    if (companyId !== undefined) data.companyId = companyId || null;
    if (password) {
      if (String(password).length < MIN_PASSWORD_LENGTH) {
        return res
          .status(400)
          .json({ error: `Password must have at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      data.password = await bcrypt.hash(String(password), 10);
    }

    const user = await prisma.user.update({
      where: { id: String(id) },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// Deletar usuario
export const deleteUser = async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;

  try {
    await prisma.user.delete({ where: { id: String(id) } });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Solicitar redefinicao de senha
export const requestPasswordReset = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: String(email) },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!user) {
      return res.json({
        message:
          'Se existir uma conta com este e-mail, enviaremos as instrucoes de redefinicao.',
      });
    }

    await issueAndSendAccessEmail(req, user, 'RESET_PASSWORD');

    res.json({
      message:
        'Se existir uma conta com este e-mail, enviaremos as instrucoes de redefinicao.',
    });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ error: 'Failed to request password reset' });
  }
};

// Validar link de convite/reset
export const getAccessLinkDetails = async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const accessToken = await getValidAccessTokenRecord(String(token));

    if (!accessToken) {
      return res.status(400).json({ error: 'Link invalido ou expirado' });
    }

    res.json({
      type: accessToken.type,
      expiresAt: accessToken.expiresAt,
      user: accessToken.user,
    });
  } catch (error) {
    console.error('Error validating access link:', error);
    res.status(500).json({ error: 'Failed to validate access link' });
  }
};

// Concluir cadastro/redefinicao de senha
export const completeAccessPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }

  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
  }

  try {
    const accessToken = await getValidAccessTokenRecord(String(token));

    if (!accessToken) {
      return res.status(400).json({ error: 'Link invalido ou expirado' });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const now = new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: accessToken.userId },
        data: { password: hashedPassword },
      }),
      prisma.userAccessToken.update({
        where: { id: accessToken.id },
        data: { usedAt: now },
      }),
      prisma.userAccessToken.updateMany({
        where: {
          userId: accessToken.userId,
          id: { not: accessToken.id },
          usedAt: null,
        },
        data: { usedAt: now },
      }),
    ]);

    res.json({
      message: 'Senha definida com sucesso. Voce ja pode acessar a plataforma.',
    });
  } catch (error) {
    console.error('Error completing access password:', error);
    res.status(500).json({ error: 'Failed to complete password setup' });
  }
};

// Trocar empresa do usuario logado
export const switchUserCompany = async (req: Request, res: Response) => {
  const { userId, companyId } = req.body;
  const requester = req.user;

  if (!userId || !companyId) {
    return res.status(400).json({ error: 'userId e companyId sao obrigatorios' });
  }

  if (!requester) {
    return res.status(401).json({ error: 'Usuario nao autenticado' });
  }

  if (requester.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas administradores podem trocar de empresa' });
  }

  if (String(requester.id) !== String(userId)) {
    return res.status(403).json({ error: 'Troca de empresa permitida apenas para a propria sessao' });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: String(companyId) },
    });

    if (!company) {
      return res.status(404).json({ error: 'Empresa nao encontrada' });
    }

    const user = await prisma.user.update({
      where: { id: String(userId) },
      data: { companyId: String(companyId) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
      },
    });

    const token = generateToken({
      id: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
      module: 'avantracking',
      isSuperAdmin: false,
    });

    res.json({
      message: 'Empresa alterada com sucesso',
      user,
      token,
    });
  } catch (error) {
    console.error('Error switching user company:', error);
    res.status(500).json({ error: 'Erro ao trocar empresa' });
  }
};
