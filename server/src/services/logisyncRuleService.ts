import { prisma } from '../lib/prisma';

export type LogisyncRuleScope = 'all' | 'carriers';

export type LogisyncFreightRule = {
  id: string;
  name: string;
  description: string;
  scope: LogisyncRuleScope;
  carriers: string[];
  percentAdd: number;
  fixedAdd: number;
  active: boolean;
};

export type LogisyncConciliationOrder = {
  pedido: string;
  transportadora: string;
  freteCotado: number;
  freteCobradoPago: number;
};

const LOGISYNC_RULES_NOTIFICATION_TYPE = 'LOGISYNC_RULES_CONFIG';
const LOGISYNC_RULES_NOTIFICATION_TITLE = 'Configuracao de regras Logisync';

const safeText = (value: unknown) => String(value || '').trim();

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeRuleScope = (value: unknown): LogisyncRuleScope =>
  String(value || '').trim().toLowerCase() === 'carriers' ? 'carriers' : 'all';

const normalizeCarriers = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .map((item) => safeText(item))
        .filter(Boolean),
    ),
  );
};

const normalizeRule = (value: unknown): LogisyncFreightRule | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = safeText(raw.id);
  const name = safeText(raw.name);
  const scope = normalizeRuleScope(raw.scope);
  const carriers = scope === 'all' ? [] : normalizeCarriers(raw.carriers);
  const percentAdd = Math.max(0, safeNumber(raw.percentAdd));
  const fixedAdd = Math.max(0, safeNumber(raw.fixedAdd));

  if (!id || !name) {
    return null;
  }

  if (scope === 'carriers' && carriers.length === 0) {
    return null;
  }

  if (percentAdd <= 0 && fixedAdd <= 0) {
    return null;
  }

  return {
    id,
    name,
    description: safeText(raw.description) || 'Regra criada manualmente.',
    scope,
    carriers,
    percentAdd,
    fixedAdd,
    active: raw.active === undefined ? true : Boolean(raw.active),
  };
};

const normalizeRules = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as LogisyncFreightRule[];
  }

  return value
    .map((item) => normalizeRule(item))
    .filter((item): item is LogisyncFreightRule => Boolean(item));
};

const parseNotificationPayloadRules = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return [] as LogisyncFreightRule[];
  }

  const rawPayload = payload as Record<string, unknown>;
  return normalizeRules(rawPayload.rules);
};

class LogisyncRuleService {
  private async ensureCompany(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company?.id) {
      throw new Error('Empresa nao encontrada.');
    }

    return company;
  }

  private async readRulesSnapshot(companyId: string) {
    const db = prisma as any;
    const latestConfig = await db.syncNotification.findFirst({
      where: {
        companyId,
        type: LOGISYNC_RULES_NOTIFICATION_TYPE,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        payload: true,
      },
    });

    return {
      configId: latestConfig?.id ? String(latestConfig.id) : null,
      rules: parseNotificationPayloadRules(latestConfig?.payload),
    };
  }

  private async saveRulesSnapshot(input: {
    companyId: string;
    companyName: string;
    rules: LogisyncFreightRule[];
    userId?: string | null;
    userEmail?: string | null;
  }) {
    const db = prisma as any;
    const now = new Date();
    const payload = {
      rules: input.rules,
      updatedAt: now.toISOString(),
      updatedBy: {
        id: safeText(input.userId) || null,
        email: safeText(input.userEmail) || null,
      },
    };

    const existing = await db.syncNotification.findFirst({
      where: {
        companyId: input.companyId,
        type: LOGISYNC_RULES_NOTIFICATION_TYPE,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true },
    });

    if (existing?.id) {
      await db.syncNotification.update({
        where: { id: existing.id },
        data: {
          category: 'GENERAL',
          type: LOGISYNC_RULES_NOTIFICATION_TYPE,
          title: LOGISYNC_RULES_NOTIFICATION_TITLE,
          message: `Regras inteligentes atualizadas para ${input.companyName}.`,
          payload,
          readAt: now,
        },
      });
      return;
    }

    await db.syncNotification.create({
      data: {
        companyId: input.companyId,
        category: 'GENERAL',
        type: LOGISYNC_RULES_NOTIFICATION_TYPE,
        title: LOGISYNC_RULES_NOTIFICATION_TITLE,
        message: `Regras inteligentes atualizadas para ${input.companyName}.`,
        payload,
        readAt: now,
      },
    });
  }

  async listRules(companyId: string) {
    await this.ensureCompany(companyId);
    const { rules } = await this.readRulesSnapshot(companyId);

    return rules;
  }

  async createRule(input: {
    companyId: string;
    userId?: string | null;
    userEmail?: string | null;
    rule: Partial<LogisyncFreightRule>;
  }) {
    const company = await this.ensureCompany(input.companyId);
    const { rules } = await this.readRulesSnapshot(input.companyId);

    const rawRule = {
      id: `rule-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      name: safeText(input.rule?.name),
      description: safeText(input.rule?.description) || 'Regra criada manualmente.',
      scope: normalizeRuleScope(input.rule?.scope),
      carriers: normalizeCarriers(input.rule?.carriers),
      percentAdd: Math.max(0, safeNumber(input.rule?.percentAdd)),
      fixedAdd: Math.max(0, safeNumber(input.rule?.fixedAdd)),
      active: true,
    };
    const normalizedRule = normalizeRule(rawRule);
    if (!normalizedRule) {
      throw new Error(
        'Regra invalida. Informe nome, escopo e ao menos um adicional percentual ou fixo.',
      );
    }

    const nextRules = [normalizedRule, ...rules];
    await this.saveRulesSnapshot({
      companyId: input.companyId,
      companyName: company.name,
      rules: nextRules,
      userId: input.userId,
      userEmail: input.userEmail,
    });

    return nextRules;
  }

  async updateRule(input: {
    companyId: string;
    ruleId: string;
    userId?: string | null;
    userEmail?: string | null;
    patch: Partial<LogisyncFreightRule>;
  }) {
    const company = await this.ensureCompany(input.companyId);
    const { rules } = await this.readRulesSnapshot(input.companyId);
    const normalizedRuleId = safeText(input.ruleId);
    if (!normalizedRuleId) {
      throw new Error('Informe o identificador da regra.');
    }

    const nextRules = rules.map((rule) => {
      if (rule.id !== normalizedRuleId) {
        return rule;
      }

      const updated = normalizeRule({
        ...rule,
        ...input.patch,
        id: rule.id,
      });
      return updated || rule;
    });

    const hasRule = nextRules.some((rule) => rule.id === normalizedRuleId);
    if (!hasRule) {
      throw new Error('Regra nao encontrada para a empresa informada.');
    }

    await this.saveRulesSnapshot({
      companyId: input.companyId,
      companyName: company.name,
      rules: nextRules,
      userId: input.userId,
      userEmail: input.userEmail,
    });

    return nextRules;
  }

  async deleteRule(input: {
    companyId: string;
    ruleId: string;
    userId?: string | null;
    userEmail?: string | null;
  }) {
    const company = await this.ensureCompany(input.companyId);
    const { rules } = await this.readRulesSnapshot(input.companyId);
    const normalizedRuleId = safeText(input.ruleId);
    if (!normalizedRuleId) {
      throw new Error('Informe o identificador da regra.');
    }

    const nextRules = rules.filter((rule) => rule.id !== normalizedRuleId);

    if (nextRules.length === rules.length) {
      throw new Error('Regra nao encontrada para a empresa informada.');
    }

    await this.saveRulesSnapshot({
      companyId: input.companyId,
      companyName: company.name,
      rules: nextRules,
      userId: input.userId,
      userEmail: input.userEmail,
    });

    return nextRules;
  }

  async getConciliationOrders(companyId: string) {
    await this.ensureCompany(companyId);
    const orders = await prisma.order.findMany({
      where: {
        companyId,
        isArchived: false,
        status: { not: 'CANCELED' },
        freightValue: { not: null },
      },
      select: {
        orderNumber: true,
        freightType: true,
        freightValue: true,
        quotedFreightValue: true,
        originalQuotedFreightValue: true,
        recalculatedFreightValue: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 600,
    });

    return (Array.isArray(orders) ? orders : []).map((order) => {
      const orderNumber = safeText(order.orderNumber) || '-';
      const pedido = orderNumber.startsWith('#') ? orderNumber : `#${orderNumber}`;
      const freteCobradoPago = safeNumber(order.freightValue);
      const freteCotado = safeNumber(
        order.recalculatedFreightValue ??
          order.originalQuotedFreightValue ??
          order.quotedFreightValue ??
          order.freightValue,
      );

      return {
        pedido,
        transportadora: safeText(order.freightType) || 'Nao informada',
        freteCotado,
        freteCobradoPago,
      } satisfies LogisyncConciliationOrder;
    });
  }
}

export const logisyncRuleService = new LogisyncRuleService();

