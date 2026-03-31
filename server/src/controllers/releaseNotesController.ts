import { Request, Response } from 'express';
import {
  buildReleaseNotesHtml,
  sendReleaseNotesEmail,
} from '../services/releaseNotesService';
import { prisma } from '../lib/prisma';
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

    const htmlContent = buildReleaseNotesHtml({
      version,
      title,
      summary,
      newFeatures,
      adjustments,
    });

    const releaseNote = await ((prisma as any).releaseNote).create({
      data: {
        version,
        title,
        summary,
        newFeatures,
        adjustments,
        htmlContent,
        recipientCount: recipients.length,
        sentByUserId: req.user.id,
      },
      select: {
        id: true,
        version: true,
        title: true,
        recipientCount: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      message: `Release notes enviado para ${recipients.length} destinatario(s).`,
      releaseNote,
    });
  } catch (error) {
    console.error('Erro ao enviar release notes:', error);
    return res.status(500).json({ error: 'Falha ao enviar release notes.' });
  }
};

export const listReleaseNotes = async (_req: Request, res: Response) => {
  try {
    const releaseNotes = await ((prisma as any).releaseNote).findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        version: true,
        title: true,
        summary: true,
        newFeatures: true,
        adjustments: true,
        recipientCount: true,
        createdAt: true,
      },
    });

    return res.json(releaseNotes.map((item: any) => ({
      ...item,
      featureCount: Array.isArray(item.newFeatures) ? item.newFeatures.length : 0,
      adjustmentCount: Array.isArray(item.adjustments) ? item.adjustments.length : 0,
    })));
  } catch (error) {
    console.error('Erro ao listar release notes:', error);
    return res.status(500).json({ error: 'Falha ao carregar atualizacoes.' });
  }
};

export const getReleaseNoteDetail = async (req: Request, res: Response) => {
  const id = String(req.params?.id || '').trim();

  if (!id) {
    return res.status(400).json({ error: 'ID da atualizacao obrigatorio.' });
  }

  try {
    const releaseNote = await ((prisma as any).releaseNote).findUnique({
      where: { id },
      select: {
        id: true,
        version: true,
        title: true,
        summary: true,
        newFeatures: true,
        adjustments: true,
        recipientCount: true,
        htmlContent: true,
        createdAt: true,
      },
    });

    if (!releaseNote) {
      return res.status(404).json({ error: 'Atualizacao nao encontrada.' });
    }

    return res.json({
      ...releaseNote,
      featureCount: Array.isArray(releaseNote.newFeatures)
        ? releaseNote.newFeatures.length
        : 0,
      adjustmentCount: Array.isArray(releaseNote.adjustments)
        ? releaseNote.adjustments.length
        : 0,
    });
  } catch (error) {
    console.error('Erro ao buscar detalhe do release note:', error);
    return res.status(500).json({ error: 'Falha ao carregar atualizacao.' });
  }
};
