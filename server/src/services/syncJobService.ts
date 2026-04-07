import crypto from 'crypto';
import type {
  SyncLogEntry,
  SyncJobStatus,
  SyncScheduleStatus,
} from '../types/syncJob';
import type { SyncTrigger } from '../types/syncReport';
import { TrackingService } from './trackingService';
import { syncReportService } from './syncReportService';
import { toUserFacingDatabaseErrorMessage } from '../utils/prismaError';
import { prisma } from '../lib/prisma';

const trackingService = new TrackingService();
const MAX_LOGS = 1000;
const AUTO_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const AUTO_SYNC_SCHEDULE_TIMES = [
  { hour: 7, minute: 0 },
  { hour: 17, minute: 0 },
];
const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';
const SAO_PAULO_UTC_OFFSET_HOURS = 3;
const BUSINESS_WEEKDAYS = new Set(['MON', 'TUE', 'WED', 'THU', 'FRI']);

type CompanyJobMap = Map<string, SyncJobStatus>;
type ScheduleEntry = {
  userId: string;
  nextScheduledAt: string | null;
  timeout: NodeJS.Timeout | null;
};
type RequesterEntry = {
  email?: string | null;
  name?: string | null;
};

class SyncJobService {
  private jobs: CompanyJobMap = new Map();
  private schedules: Map<string, ScheduleEntry> = new Map();
  private requesters: Map<string, RequesterEntry> = new Map();

  getJob(companyId: string) {
    return this.jobs.get(companyId) || null;
  }

  ensureSchedule(companyId: string, userId: string) {
    const existing = this.schedules.get(companyId);

    if (existing) {
      existing.userId = userId;
      if (!existing.nextScheduledAt) {
        this.scheduleNext(companyId, userId);
      }
      return;
    }

    this.scheduleNext(companyId, userId);
  }

  async initializeSchedules() {
    const users = await prisma.user.findMany({
      where: {
        companyId: { not: null },
      },
      select: {
        id: true,
        companyId: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const seenCompanies = new Set<string>();

    for (const user of users) {
      if (!user.companyId || seenCompanies.has(user.companyId)) {
        continue;
      }

      seenCompanies.add(user.companyId);
      this.ensureSchedule(user.companyId, user.id);
    }
  }

  getSchedule(companyId: string): SyncScheduleStatus {
    const schedule = this.schedules.get(companyId);

    return {
      enabled: true,
      intervalMs: AUTO_SYNC_INTERVAL_MS,
      nextScheduledAt: schedule?.nextScheduledAt ?? null,
    };
  }

  startJob(
    companyId: string,
    userId: string,
    trigger: SyncTrigger = 'manual',
    requester?: RequesterEntry,
  ) {
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
      warnings: [],
      logs: [],
    };

    this.clearScheduledTimeout(companyId);
    this.requesters.set(companyId, requester || {});
    this.pushLog(job, 'info', 'Sincronização iniciada.');
    this.jobs.set(companyId, job);

    void this.run(job, trigger);

    return job;
  }

  private async run(job: SyncJobStatus, trigger: SyncTrigger) {
    try {
      const results = await trackingService.syncAllActive(job.companyId, {
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
      job.warnings = Array.isArray(results.warnings) ? results.warnings : [];
      this.touch(job);
      this.pushLog(
        job,
        'success',
        `Sincronização finalizada. ${job.success} sucesso(s), ${job.failed} falha(s).`,
      );

      for (const warning of job.warnings) {
        this.pushLog(job, 'info', `Aviso: ${warning}`);
      }

      try {
        const requester = this.requesters.get(job.companyId);
        const report = await syncReportService.sendTrackingSyncReport({
          companyId: job.companyId,
          userId: job.userId,
          userEmail: requester?.email,
          userName: requester?.name,
          trigger,
          payload: results.report,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt || new Date().toISOString(),
        });
        this.pushLog(
          job,
          'info',
          `Relatorio enviado para ${report.recipients} destinatario(s). CSV: ${report.csvUrl}`,
        );
      } catch (reportError) {
        const reportMessage =
          reportError instanceof Error
            ? reportError.message
            : 'Erro desconhecido ao enviar relatorio';
        this.pushLog(job, 'error', `Falha ao enviar relatorio: ${reportMessage}`);
      }

      this.scheduleNext(job.companyId, job.userId);
    } catch (error) {
      job.status = 'failed';
      job.currentOrderNumber = null;
      job.finishedAt = new Date().toISOString();
      job.error = toUserFacingDatabaseErrorMessage(
        error,
        'Erro desconhecido durante a sincronizacao',
      );
      this.touch(job);
      this.pushLog(job, 'error', `Sincronização interrompida: ${job.error}`);
      this.scheduleNext(job.companyId, job.userId);
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

  private getSaoPauloDateParts(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: SAO_PAULO_TIMEZONE,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value || 0);

    return {
      weekday: String(parts.find((part) => part.type === 'weekday')?.value || '')
        .slice(0, 3)
        .toUpperCase(),
      year: read('year'),
      month: read('month'),
      day: read('day'),
    };
  }

  private createSaoPauloDate(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
  ) {
    return new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour + SAO_PAULO_UTC_OFFSET_HOURS,
        minute,
        0,
        0,
      ),
    );
  }

  private resolveNextRunDate(now = new Date()) {
    for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
      const candidateBase = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const base = this.getSaoPauloDateParts(candidateBase);

      if (!BUSINESS_WEEKDAYS.has(base.weekday)) {
        continue;
      }

      for (const slot of AUTO_SYNC_SCHEDULE_TIMES) {
        const candidate = this.createSaoPauloDate(
          base.year,
          base.month,
          base.day,
          slot.hour,
          slot.minute,
        );

        if (candidate.getTime() > now.getTime()) {
          return candidate;
        }
      }
    }

    const nextDayBase = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextDayParts = this.getSaoPauloDateParts(nextDayBase);
    const firstSlot = AUTO_SYNC_SCHEDULE_TIMES[0];

    return this.createSaoPauloDate(
      nextDayParts.year,
      nextDayParts.month,
      nextDayParts.day,
      firstSlot.hour,
      firstSlot.minute,
    );
  }

  private scheduleNext(companyId: string, userId: string) {
    this.clearScheduledTimeout(companyId);

    const nextRun = this.resolveNextRunDate();
    const delayMs = Math.max(1000, nextRun.getTime() - Date.now());
    const nextRunAt = nextRun.toISOString();
    const timeout = setTimeout(() => {
      this.triggerAutomaticSync(companyId);
    }, delayMs);

    this.schedules.set(companyId, {
      userId,
      nextScheduledAt: nextRunAt,
      timeout,
    });
  }

  private triggerAutomaticSync(companyId: string) {
    const schedule = this.schedules.get(companyId);
    if (!schedule) return;

    schedule.timeout = null;
    schedule.nextScheduledAt = null;

    const existing = this.jobs.get(companyId);
    if (existing?.status === 'running') {
      this.scheduleNext(companyId, schedule.userId);
      return;
    }

    const job = this.startJob(companyId, schedule.userId, 'automatic');
    this.pushLog(job, 'info', 'Execução automática disparada.');
  }

  private clearScheduledTimeout(companyId: string) {
    const schedule = this.schedules.get(companyId);
    if (!schedule?.timeout) return;

    clearTimeout(schedule.timeout);
    schedule.timeout = null;
  }
}

export const syncJobService = new SyncJobService();
