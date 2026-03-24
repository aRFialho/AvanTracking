import crypto from 'crypto';
import type { SyncLogEntry, SyncJobStatus } from '../types/syncJob';
import {
  traySyncService,
  type TraySyncFiltersInput,
} from './traySyncService';

const MAX_LOGS = 1000;

class TraySyncJobService {
  private jobs: Map<string, SyncJobStatus> = new Map();

  getJob(companyId: string) {
    return this.jobs.get(companyId) || null;
  }

  startJob(companyId: string, userId: string, filters: TraySyncFiltersInput) {
    const existing = this.jobs.get(companyId);

    if (existing?.status === 'running') {
      return existing;
    }

    const now = new Date().toISOString();
    const job: SyncJobStatus = {
      jobId: crypto.randomUUID(),
      companyId,
      userId,
      status: 'running',
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      currentOrderNumber: null,
      startedAt: now,
      finishedAt: null,
      lastUpdatedAt: now,
      error: null,
      logs: [],
    };

    this.pushLog(job, 'info', 'Sincronizacao da Tray iniciada em segundo plano.');
    this.jobs.set(companyId, job);
    void this.run(job, filters);

    return job;
  }

  private async run(job: SyncJobStatus, filters: TraySyncFiltersInput) {
    try {
      const result = await traySyncService.executeSync(job.companyId, filters, {
        onStart: ({ total }) => {
          job.total = total;
          this.touch(job);
          this.pushLog(job, 'info', `${total} etapa(s) de status na fila da Tray.`);
        },
        onStatusStart: ({ status, index, total }) => {
          job.currentOrderNumber = status;
          this.touch(job);
          this.pushLog(
            job,
            'info',
            `Processando status "${status}" (${index}/${total}).`,
          );
        },
        onStatusFinish: ({ status, index, imported }) => {
          job.processed = index;
          job.success += imported;
          job.currentOrderNumber = null;
          this.touch(job);
          this.pushLog(
            job,
            'success',
            `Status "${status}" concluido com ${imported} pedido(s) novo(s).`,
          );
        },
        onLog: (message) => {
          this.pushLog(job, 'info', message);
        },
      });

      job.status = 'completed';
      job.currentOrderNumber = null;
      job.finishedAt = new Date().toISOString();
      job.success =
        Number(result?.results?.created || 0) + Number(result?.results?.updated || 0);
      job.failed = Number(result?.results?.skipped || 0);
      this.touch(job);
      this.pushLog(job, 'success', result.message);
    } catch (error) {
      job.status = 'failed';
      job.currentOrderNumber = null;
      job.finishedAt = new Date().toISOString();
      job.error =
        error instanceof Error ? error.message : 'Erro desconhecido na sincronizacao da Tray.';
      this.touch(job);
      this.pushLog(job, 'error', job.error);
    }
  }

  private touch(job: SyncJobStatus) {
    job.lastUpdatedAt = new Date().toISOString();
  }

  private pushLog(
    job: SyncJobStatus,
    level: SyncLogEntry['level'],
    message: string,
  ) {
    const entry: SyncLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    job.logs = [...job.logs, entry].slice(-MAX_LOGS);
    this.touch(job);
  }
}

export const traySyncJobService = new TraySyncJobService();
