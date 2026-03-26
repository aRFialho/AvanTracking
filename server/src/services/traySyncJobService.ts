import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import type {
  SyncLogEntry,
  SyncJobStatus,
  SyncScheduleStatus,
} from '../types/syncJob';
import {
  traySyncService,
  type TraySyncFiltersInput,
} from './traySyncService';
import { trayAuthService } from './trayAuthService';
import { syncReportService } from './syncReportService';
import type { SyncTrigger } from '../types/syncReport';

const prisma = new PrismaClient();
const MAX_LOGS = 1000;
const AUTO_TRAY_SYNC_INTERVAL_MS = 0;
const AUTO_TRAY_SYNC_SCHEDULE_TIMES = [
  { hour: 7, minute: 42 },
  { hour: 17, minute: 0 },
];
const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';
const SAO_PAULO_UTC_OFFSET_HOURS = 3;
const AUTO_TRAY_SYNC_FILTERS: TraySyncFiltersInput = {
  days: 2,
  statusMode: 'selected',
  statuses: [
    'a enviar',
    '5- aguardando faturamento',
    'enviado',
    'aguardando envio',
    'pedido cadastrado',
  ],
};

type ScheduleEntry = {
  userId: string;
  nextScheduledAt: string | null;
  timeout: NodeJS.Timeout | null;
};

class TraySyncJobService {
  private jobs: Map<string, SyncJobStatus> = new Map();
  private schedules: Map<string, ScheduleEntry> = new Map();

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

  getSchedule(companyId: string): SyncScheduleStatus {
    const schedule = this.schedules.get(companyId);

    return {
      enabled: true,
      intervalMs: AUTO_TRAY_SYNC_INTERVAL_MS,
      nextScheduledAt: schedule?.nextScheduledAt ?? null,
    };
  }

  getDisabledSchedule(): SyncScheduleStatus {
    return {
      enabled: false,
      intervalMs: AUTO_TRAY_SYNC_INTERVAL_MS,
      nextScheduledAt: null,
    };
  }

  async initializeSchedules() {
    const companyIdsWithAuth = new Set(await trayAuthService.getCompaniesWithAuth());
    if (companyIdsWithAuth.size === 0) return;

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
      if (
        !user.companyId ||
        seenCompanies.has(user.companyId) ||
        !companyIdsWithAuth.has(user.companyId)
      ) {
        continue;
      }

      seenCompanies.add(user.companyId);
      this.ensureSchedule(user.companyId, user.id);
    }
  }

  startJob(
    companyId: string,
    userId: string,
    filters: TraySyncFiltersInput,
    mode: 'manual' | 'automatic' = 'manual',
  ) {
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

    this.clearScheduledTimeout(companyId);
    this.pushLog(
      job,
      'info',
      mode === 'automatic'
        ? 'Sincronizacao automatica da Tray iniciada.'
        : 'Sincronizacao da Tray iniciada em segundo plano.',
    );
    this.jobs.set(companyId, job);
    void this.run(job, filters, mode);

    return job;
  }

  private async run(
    job: SyncJobStatus,
    filters: TraySyncFiltersInput,
    mode: 'manual' | 'automatic',
  ) {
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

      try {
        const report = await syncReportService.sendTraySyncReport({
          companyId: job.companyId,
          userId: job.userId,
          trigger: mode as SyncTrigger,
          payload: {
            companyId: job.companyId,
            storeId: result.storeId,
            modified: result.modified,
            statuses: result.statuses,
            created: Number(result?.results?.created || 0),
            updated: Number(result?.results?.updated || 0),
            skipped: Number(result?.results?.skipped || 0),
            totalTrackingEvents: Number(result?.results?.totalTrackingEvents || 0),
            errors: Array.isArray(result?.results?.errors)
              ? result.results.errors
              : [],
            createdOrders: Array.isArray(result?.results?.createdOrders)
              ? result.results.createdOrders
              : [],
            updatedOrders: Array.isArray(result?.results?.updatedOrders)
              ? result.results.updatedOrders
              : [],
          },
          startedAt: job.startedAt,
          finishedAt: job.finishedAt || new Date().toISOString(),
        });
        this.pushLog(
          job,
          'info',
          `Relatorio da Tray enviado para ${report.recipients} destinatario(s). CSV: ${report.csvUrl}`,
        );
      } catch (reportError) {
        const reportMessage =
          reportError instanceof Error
            ? reportError.message
            : 'Erro desconhecido ao enviar relatorio da Tray';
        this.pushLog(
          job,
          'error',
          `Falha ao enviar relatorio da Tray: ${reportMessage}`,
        );
      }

      this.scheduleNext(job.companyId, job.userId);
    } catch (error) {
      job.status = 'failed';
      job.currentOrderNumber = null;
      job.finishedAt = new Date().toISOString();
      job.error =
        error instanceof Error ? error.message : 'Erro desconhecido na sincronizacao da Tray.';
      this.touch(job);
      this.pushLog(job, 'error', job.error);
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
    const base = this.getSaoPauloDateParts(now);

    for (const slot of AUTO_TRAY_SYNC_SCHEDULE_TIMES) {
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

    const nextDayBase = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextDayParts = this.getSaoPauloDateParts(nextDayBase);
    const firstSlot = AUTO_TRAY_SYNC_SCHEDULE_TIMES[0];

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

    const job = this.startJob(
      companyId,
      schedule.userId,
      AUTO_TRAY_SYNC_FILTERS,
      'automatic',
    );
    this.pushLog(
      job,
      'info',
      'Execucao automatica da Tray disparada com janela de 2 dias.',
    );
  }

  private clearScheduledTimeout(companyId: string) {
    const schedule = this.schedules.get(companyId);
    if (!schedule?.timeout) return;

    clearTimeout(schedule.timeout);
    schedule.timeout = null;
  }
}

export const traySyncJobService = new TraySyncJobService();
