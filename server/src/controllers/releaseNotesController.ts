import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendReleaseNotesEmail } from '../services/releaseNotesService';

const prisma = new PrismaClient();
const MASTER_ADMIN_EMAIL = 'admin@avantracking.com.br';

const normalizeLines = (value: unknown) =>
  String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

export const sendReleaseNotes = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Usuario nao autenticado' });
  }

  if (req.user.email !== MASTER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Apenas o admin master pode enviar release notes.' });
  }

  const version = String(req.body?.version || '').trim();
  const title = String(req.body?.title || '').trim();
  const summary = String(req.body?.summary || '').trim();
  const newFeatures = normalizeLines(req.body?.newFeatures);
  const adjustments = normalizeLines(req.body?.adjustments);
  const requestedRecipientIds = Array.isArray(req.body?.recipientUserIds)
    ? req.body.recipientUserIds
        .map((value: unknown) => String(value || '').trim())
        .filter(Boolean)
    : [];

  if (!version || !title || !summary) {
    return res.status(400).json({
      error: 'Informe versao, titulo e texto principal para montar o release notes.',
    });
  }

  if (requestedRecipientIds.length === 0) {
    return res.status(400).json({ error: 'Selecione pelo menos um destinatario.' });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: requestedRecipientIds,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    const recipientsMap = new Map<string, { email: string; name: string }>();

    for (const user of users) {
      const normalizedEmail = String(user.email || '').trim().toLowerCase();
      if (!normalizedEmail) continue;

      recipientsMap.set(normalizedEmail, {
        email: user.email,
        name: user.name || user.email,
      });
    }

    const recipients = Array.from(recipientsMap.values());

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'Nenhum e-mail valido encontrado nos destinatarios selecionados.' });
    }

    await sendReleaseNotesEmail({
      version,
      title,
      summary,
      newFeatures,
      adjustments,
      recipients,
    });

    return res.json({
      success: true,
      message: `Release notes enviado para ${recipients.length} destinatario(s).`,
    });
  } catch (error) {
    console.error('Erro ao enviar release notes:', error);
    return res.status(500).json({ error: 'Falha ao enviar release notes.' });
  }
};
