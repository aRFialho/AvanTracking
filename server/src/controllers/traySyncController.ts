import { Request, Response } from 'express';
import { traySyncJobService } from '../services/traySyncJobService';
import { traySyncService } from '../services/traySyncService';
import { trayAuthService } from '../services/trayAuthService';
import { syncReportService } from '../services/syncReportService';

const getUserCompany = (req: Request) => {
  if (!req.user) {
    return { error: 'Usuario nao autenticado', status: 401 as const };
  }

  if (!req.user.companyId) {
    return {
      error: 'Usuario nao vinculado a uma empresa.',
      status: 403 as const,
    };
  }

  return { companyId: req.user.companyId, userId: req.user.id };
};

export const syncTrayOrders = async (req: Request, res: Response) => {
  console.log('Iniciando sincronizacao com Tray...');

  try {
    const context = getUserCompany(req);
    if ('error' in context) {
      return res.status(context.status).json({ error: context.error });
    }

    const auth = await trayAuthService.getCurrentAuth(context.companyId);
    if (!auth) {
      return res.status(400).json({
        error: 'Nenhuma integracao Tray autorizada para a empresa atual.',
      });
    }

    traySyncJobService.ensureSchedule(context.companyId, context.userId);
    const startedAt = new Date().toISOString();
    const result = await traySyncService.executeSync(context.companyId, req.body || {});
    const finishedAt = new Date().toISOString();

    let report: any = null;
    try {
      report = await syncReportService.sendTraySyncReport({
        companyId: context.companyId,
        userId: context.userId,
        trigger: 'manual',
        payload: {
        companyId: context.companyId,
        storeId: result.storeId,
        modified: result.modified,
        statuses: result.statuses,
        ...result.results,
      },
        startedAt,
        finishedAt,
      });
    } catch (reportError) {
      console.error('Falha ao enviar relatorio da sincronizacao direta da Tray:', reportError);
    }

    return res.json({
      ...result,
      report,
    });
  } catch (error) {
    console.error('Erro na sincronizacao com Tray:', error);
    return res.status(500).json({
      error: 'Erro ao sincronizar com Tray',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

export const startTraySyncJob = async (req: Request, res: Response) => {
  try {
    const context = getUserCompany(req);
    if ('error' in context) {
      return res.status(context.status).json({ error: context.error });
    }

    const auth = await trayAuthService.getCurrentAuth(context.companyId);
    if (!auth) {
      return res.status(400).json({
        error: 'Nenhuma integracao Tray autorizada para a empresa atual.',
      });
    }

    traySyncJobService.ensureSchedule(context.companyId, context.userId);
    const existing = traySyncJobService.getJob(context.companyId);
    if (existing?.status === 'running') {
      return res.json({
        success: true,
        message: 'A sincronizacao da Tray ja esta em andamento.',
        job: existing,
        schedule: traySyncJobService.getSchedule(context.companyId),
      });
    }

    const job = traySyncJobService.startJob(
      context.companyId,
      context.userId,
      req.body || {},
    );

    return res.json({
      success: true,
      message: 'Sincronizacao da Tray iniciada em segundo plano.',
      job,
      schedule: traySyncJobService.getSchedule(context.companyId),
    });
  } catch (error) {
    console.error('Erro ao iniciar sincronizacao da Tray:', error);
    return res.status(500).json({
      error: 'Erro ao iniciar sincronizacao da Tray',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

export const getTraySyncStatus = async (req: Request, res: Response) => {
  try {
    const context = getUserCompany(req);
    if ('error' in context) {
      return res.status(context.status).json({ error: context.error });
    }

    const auth = await trayAuthService.getCurrentAuth(context.companyId);
    if (!auth) {
      return res.json({
        success: true,
        job: null,
        schedule: traySyncJobService.getDisabledSchedule(),
      });
    }

    traySyncJobService.ensureSchedule(context.companyId, context.userId);
    return res.json({
      success: true,
      job: traySyncJobService.getJob(context.companyId),
      schedule: traySyncJobService.getSchedule(context.companyId),
    });
  } catch (error) {
    console.error('Erro ao consultar status da sincronizacao da Tray:', error);
    return res.status(500).json({
      error: 'Erro ao consultar status da sincronizacao da Tray',
    });
  }
};


