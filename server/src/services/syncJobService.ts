import crypto from 'crypto';
import type { SyncLogEntry, SyncJobStatus } from '../types/syncJob';
import { TrackingService } from './trackingService';

const trackingService = new TrackingService();
const MAX_LOGS = 100;

type CompanyJobMap = Map<string, SyncJobStatus>;

class SyncJobService {
  private jobs: CompanyJobMap = new Map();

  getJob(companyId: string) {
    return this.jobs.get(companyId) || null;
  }

  startJob(companyId: string, userId: string) {
    const existing = this.jobs.get(companyId);

    if (existing && existing.status === 'running') {
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

    this.pushLog(job, 'info', 'Sincronização iniciada.');
    this.jobs.set(companyId, job);

    void this.run(job);

    return job;
  }

  private async run(job: SyncJobStatus) {
    try {
      await trackingService.syncAllActive(job.companyId, {
        onStart: ({ total }) => {
          job.total = total;
          this.touch(job);
          this.pushLog(job, 'info', `Total de pedidos na fila: ${total}.`);
        },
        onOrderStart: ({ orderNumber, index, total }) => {
          job.currentOrderNumber = orderNumber;
          this.touch(job);
          this.pushLog(
            job,
            'info',
            `Processando pedido ${orderNumber} (${index}/${total}).`,
          );
        },
        onOrderFinish: ({ orderNumber, success, message, durationMs }) => {
          job.processed += 1;
          if (success) {
            job.success += 1;
            this.pushLog(
              job,
              'success',
              `Pedido ${orderNumber} sincronizado em ${(durationMs / 1000).toFixed(1)}s. ${message}`,
            );
          } else {
            job.failed += 1;
            this.pushLog(
              job,
              'error',
              `Pedido ${orderNumber} falhou em ${(durationMs / 1000).toFixed(1)}s. ${message}`,
            );
          }
          this.touch(job);
        },
      });

      job.status = 'completed';
      job.currentOrderNumber = null;
      job.finishedAt = new Date().toISOString();
      this.touch(job);
      this.pushLog(
        job,
        'success',
        `Sincronização finalizada. ${job.success} sucesso(s), ${job.failed} falha(s).`,
      );
    } catch (error) {
      job.status = 'failed';
      job.currentOrderNumber = null;
      job.finishedAt = new Date().toISOString();
      job.error =
        error instanceof Error ? error.message : 'Erro desconhecido durante a sincronização';
      this.touch(job);
      this.pushLog(job, 'error', `Sincronização interrompida: ${job.error}`);
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

export const syncJobService = new SyncJobService();
