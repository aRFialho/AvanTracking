import { Request, Response } from 'express';
import { logisyncRuleService } from '../services/logisyncRuleService';

const resolveCompanyId = (req: Request) => {
  const bodyCompanyId = String(req.body?.companyId || '').trim();
  const queryCompanyId = String(req.query?.companyId || '').trim();
  const explicitCompanyId = bodyCompanyId || queryCompanyId;

  if (req.user?.module === 'logisync') {
    return explicitCompanyId || null;
  }

  return String(req.user?.companyId || '').trim() || explicitCompanyId || null;
};

const ensureCompanyId = (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  if (!companyId) {
    res.status(400).json({
      error:
        req.user?.module === 'logisync'
          ? 'Informe a empresa para carregar as regras inteligentes.'
          : 'Usuario sem empresa vinculada.',
    });
    return null;
  }

  return companyId;
};

export const listLogisyncRules = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompanyId(req, res);
    if (!companyId) return;

    const rules = await logisyncRuleService.listRules(companyId);
    return res.json({
      success: true,
      companyId,
      rules,
    });
  } catch (error) {
    console.error('Erro ao listar regras Logisync:', error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Erro ao listar regras inteligentes.',
    });
  }
};

export const createLogisyncRule = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompanyId(req, res);
    if (!companyId) return;

    const rules = await logisyncRuleService.createRule({
      companyId,
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      rule: req.body?.rule || req.body || {},
    });

    return res.json({
      success: true,
      companyId,
      rules,
    });
  } catch (error) {
    console.error('Erro ao criar regra Logisync:', error);
    return res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'Erro ao criar regra inteligente.',
    });
  }
};

export const updateLogisyncRule = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompanyId(req, res);
    if (!companyId) return;

    const ruleId = String(req.params?.ruleId || '').trim();
    if (!ruleId) {
      return res.status(400).json({ error: 'Informe o ruleId.' });
    }

    const rules = await logisyncRuleService.updateRule({
      companyId,
      ruleId,
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      patch: req.body?.rule || req.body || {},
    });

    return res.json({
      success: true,
      companyId,
      rules,
    });
  } catch (error) {
    console.error('Erro ao atualizar regra Logisync:', error);
    return res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'Erro ao atualizar regra inteligente.',
    });
  }
};

export const deleteLogisyncRule = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompanyId(req, res);
    if (!companyId) return;

    const ruleId = String(req.params?.ruleId || '').trim();
    if (!ruleId) {
      return res.status(400).json({ error: 'Informe o ruleId.' });
    }

    const rules = await logisyncRuleService.deleteRule({
      companyId,
      ruleId,
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
    });

    return res.json({
      success: true,
      companyId,
      rules,
    });
  } catch (error) {
    console.error('Erro ao remover regra Logisync:', error);
    return res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'Erro ao remover regra inteligente.',
    });
  }
};

export const getLogisyncConciliationContext = async (
  req: Request,
  res: Response,
) => {
  try {
    const companyId = ensureCompanyId(req, res);
    if (!companyId) return;

    const orders = await logisyncRuleService.getConciliationOrders(companyId);
    return res.json({
      success: true,
      companyId,
      orders,
    });
  } catch (error) {
    console.error('Erro ao carregar contexto de conciliacao Logisync:', error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Erro ao carregar contexto de conciliacao.',
    });
  }
};

