
import { Request, Response } from 'express';
import { ensureDemoCompanyData } from '../services/demoCompanyService';
import { prisma } from '../lib/prisma';

const normalizeSswRequireCnpjs = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((item) => String(item || '').replace(/\D/g, '').trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
};

const normalizeIntegrationCarrierExceptions = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  );
};

const normalizeBooleanSetting = (value: unknown) => {
  if (value === undefined) return undefined;
  return Boolean(value);
};

const ERP_INTEGRATION_FIELDS = [
  'trayIntegrationEnabled',
  'anymarketIntegrationEnabled',
  'blingIntegrationEnabled',
  'magazordIntegrationEnabled',
  'sysempIntegrationEnabled',
] as const;

type ErpIntegrationField = (typeof ERP_INTEGRATION_FIELDS)[number];

const buildErpIntegrationUpdate = (
  values: Partial<Record<ErpIntegrationField, boolean | undefined>>,
) => {
  const providedEntries = ERP_INTEGRATION_FIELDS.filter(
    (field) => values[field] !== undefined,
  );

  if (providedEntries.length === 0) {
    return {};
  }

  return providedEntries.reduce<Partial<Record<ErpIntegrationField, boolean>>>(
    (accumulator, field) => {
      accumulator[field] = Boolean(values[field]);
      return accumulator;
    },
    {},
  );
};

const resolveActiveErpFields = (
  values: Partial<Record<ErpIntegrationField, boolean | undefined>>,
) =>
  ERP_INTEGRATION_FIELDS.filter((field) => values[field] === true);

const normalizeOptionalString = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeIdentityDocumentNumber = (value: unknown) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/\D/g, "").trim();
  return normalized || null;
};

const normalizeIdentityDocumentType = (value: unknown, documentNumber?: string | null) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "CPF" || normalized === "CNPJ") return normalized;
  if (documentNumber?.length === 11) return "CPF";
  if (documentNumber?.length === 14) return "CNPJ";
  return null;
};

const companyPublicSelect = {
  id: true,
  name: true,
  cnpj: true,
  tenantGlobalId: true,
  documentType: true,
  documentNumber: true,
  trayIntegrationEnabled: true,
  anymarketIntegrationEnabled: true,
  blingIntegrationEnabled: true,
  magazordIntegrationEnabled: true,
  sysempIntegrationEnabled: true,
  intelipostIntegrationEnabled: true,
  sswRequireEnabled: true,
  correiosIntegrationEnabled: true,
  intelipostClientId: true,
  magazordApiBaseUrl: true,
  magazordApiUser: true,
  sswRequireCnpjs: true,
  integrationCarrierExceptions: true,
  createdAt: true,
  _count: {
    select: {
      users: true,
      orders: true,
    },
  },
} as const;

const sanitizeCompanyResponse = (company: any) => {
  const { magazordApiPassword, anymarketToken, ...safeCompany } = company || {};

  return {
    ...safeCompany,
    magazordApiPasswordConfigured: Boolean(magazordApiPassword),
    anymarketTokenConfigured: Boolean(anymarketToken),
  };
};

// Listar todas as empresas
export const getCompanies = async (req: Request, res: Response) => {
  try {
    await ensureDemoCompanyData(prisma);

    const isLogisyncUser = req.user?.module === 'logisync';
    const isLogisyncSuperAdmin = Boolean(req.user?.isSuperAdmin);
    const companyScope =
      isLogisyncUser && !isLogisyncSuperAdmin
        ? String(req.user?.companyId || '').trim()
        : '';

    const whereClause = companyScope ? { id: companyScope } : undefined;
    const companies = await (prisma.company as any).findMany({
      ...(whereClause ? { where: whereClause } : {}),
      orderBy: { name: 'asc' },
      select: {
        ...companyPublicSelect,
        magazordApiPassword: true,
        anymarketToken: true,
      },
    });
    res.json(companies.map(sanitizeCompanyResponse));
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
};

// Criar empresa
export const createCompany = async (req: Request, res: Response) => {
  const { name, cnpj, tenantGlobalId, documentType, documentNumber, intelipostClientId, sswRequireCnpjs } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const normalizedDocumentNumber = normalizeIdentityDocumentNumber(
      documentNumber ?? cnpj,
    );
    const normalizedDocumentType = normalizeIdentityDocumentType(
      documentType,
      normalizedDocumentNumber,
    );
    const normalizedTenantGlobalId = normalizeOptionalString(tenantGlobalId);
    const normalizedCnpj =
      normalizeOptionalString(cnpj) ??
      (normalizedDocumentType === "CNPJ" ? normalizedDocumentNumber : null);

    const trayIntegrationEnabled = normalizeBooleanSetting(
      req.body?.trayIntegrationEnabled,
    );
    const blingIntegrationEnabled = normalizeBooleanSetting(
      req.body?.blingIntegrationEnabled,
    );
    const anymarketIntegrationEnabled = normalizeBooleanSetting(
      req.body?.anymarketIntegrationEnabled,
    );
    const magazordIntegrationEnabled = normalizeBooleanSetting(
      req.body?.magazordIntegrationEnabled,
    );
    const sysempIntegrationEnabled = normalizeBooleanSetting(
      req.body?.sysempIntegrationEnabled,
    );
    const erpIntegrationData = buildErpIntegrationUpdate({
      trayIntegrationEnabled:
        trayIntegrationEnabled === undefined ? true : trayIntegrationEnabled,
      anymarketIntegrationEnabled,
      blingIntegrationEnabled,
      magazordIntegrationEnabled,
      sysempIntegrationEnabled,
    });
    const activeErpsOnCreate = resolveActiveErpFields({
      trayIntegrationEnabled:
        trayIntegrationEnabled === undefined ? true : trayIntegrationEnabled,
      anymarketIntegrationEnabled,
      blingIntegrationEnabled,
      magazordIntegrationEnabled,
      sysempIntegrationEnabled,
    });

    const anymarketToken = normalizeOptionalString(req.body?.anymarketToken);

    if (activeErpsOnCreate.length > 1) {
      return res.status(400).json({
        error: 'Nao e permitido manter mais de um ERP ativo ao mesmo tempo.',
      });
    }

    if (
      anymarketIntegrationEnabled === true &&
      !anymarketToken
    ) {
      return res.status(400).json({
        error:
          'O gumgaToken do ANYMARKET precisa ser informado para ativar a integracao.',
      });
    }

    const company = await (prisma.company as any).create({
      data: {
        name,
        cnpj: normalizedCnpj,
        tenantGlobalId: normalizedTenantGlobalId,
        documentType: normalizedDocumentType,
        documentNumber: normalizedDocumentNumber,
        ...erpIntegrationData,
        intelipostIntegrationEnabled: normalizeBooleanSetting(
          req.body?.intelipostIntegrationEnabled,
        ) ?? true,
        sswRequireEnabled: normalizeBooleanSetting(req.body?.sswRequireEnabled) ?? true,
        correiosIntegrationEnabled:
          normalizeBooleanSetting(req.body?.correiosIntegrationEnabled) ?? true,
        intelipostClientId: intelipostClientId ? String(intelipostClientId).trim() : null,
        anymarketToken,
        magazordApiBaseUrl: normalizeOptionalString(req.body?.magazordApiBaseUrl),
        magazordApiUser: normalizeOptionalString(req.body?.magazordApiUser),
        magazordApiPassword: normalizeOptionalString(req.body?.magazordApiPassword),
        sswRequireCnpjs: normalizeSswRequireCnpjs(sswRequireCnpjs),
        integrationCarrierExceptions: normalizeIntegrationCarrierExceptions(
          req.body?.integrationCarrierExceptions,
        ),
      },
      select: {
        ...companyPublicSelect,
        magazordApiPassword: true,
        anymarketToken: true,
      },
    });
    res.status(201).json(sanitizeCompanyResponse(company));
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
};

// Deletar empresa
export const deleteCompany = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  try {
    await prisma.company.delete({
      where: { id }
    });
    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
};

export const getCurrentCompany = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      return res.status(403).json({ error: 'Usuario sem empresa vinculada' });
    }

    const company = await (prisma.company as any).findUnique({
      where: { id: req.user.companyId },
      select: {
        ...companyPublicSelect,
        magazordApiPassword: true,
        anymarketToken: true,
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'Empresa nao encontrada' });
    }

    return res.json(sanitizeCompanyResponse(company));
  } catch (error) {
    console.error('Error fetching current company:', error);
    return res.status(500).json({ error: 'Failed to fetch current company' });
  }
};

export const updateCurrentCompanyIntegration = async (
  req: Request,
  res: Response,
) => {
  try {
    if (!req.user?.companyId) {
      return res.status(403).json({ error: 'Usuario sem empresa vinculada' });
    }

    const intelipostClientIdRaw = req.body?.intelipostClientId;
    const intelipostClientId =
      intelipostClientIdRaw === undefined || intelipostClientIdRaw === null
        ? undefined
        : String(intelipostClientIdRaw).trim();
    const sswRequireCnpjsRaw = req.body?.sswRequireCnpjs;
    const sswRequireCnpjs =
      sswRequireCnpjsRaw === undefined
        ? undefined
        : normalizeSswRequireCnpjs(sswRequireCnpjsRaw);
    const integrationCarrierExceptionsRaw = req.body?.integrationCarrierExceptions;
    const integrationCarrierExceptions =
      integrationCarrierExceptionsRaw === undefined
        ? undefined
        : normalizeIntegrationCarrierExceptions(integrationCarrierExceptionsRaw);
    const trayIntegrationEnabled = normalizeBooleanSetting(
      req.body?.trayIntegrationEnabled,
    );
    const blingIntegrationEnabled = normalizeBooleanSetting(
      req.body?.blingIntegrationEnabled,
    );
    const anymarketIntegrationEnabled = normalizeBooleanSetting(
      req.body?.anymarketIntegrationEnabled,
    );
    const magazordIntegrationEnabled = normalizeBooleanSetting(
      req.body?.magazordIntegrationEnabled,
    );
    const sysempIntegrationEnabled = normalizeBooleanSetting(
      req.body?.sysempIntegrationEnabled,
    );
    const intelipostIntegrationEnabled = normalizeBooleanSetting(
      req.body?.intelipostIntegrationEnabled,
    );
    const sswRequireEnabled = normalizeBooleanSetting(req.body?.sswRequireEnabled);
    const correiosIntegrationEnabled = normalizeBooleanSetting(
      req.body?.correiosIntegrationEnabled,
    );
    const anymarketTokenRaw = req.body?.anymarketToken;
    const anymarketToken =
      anymarketTokenRaw === undefined
        ? undefined
        : normalizeOptionalString(anymarketTokenRaw);
    const magazordApiBaseUrl = normalizeOptionalString(req.body?.magazordApiBaseUrl);
    const magazordApiUser = normalizeOptionalString(req.body?.magazordApiUser);
    const magazordApiPasswordRaw = req.body?.magazordApiPassword;
    const magazordApiPassword =
      magazordApiPasswordRaw === undefined
        ? undefined
        : normalizeOptionalString(magazordApiPasswordRaw);
    const erpIntegrationData = buildErpIntegrationUpdate({
      trayIntegrationEnabled,
      anymarketIntegrationEnabled,
      blingIntegrationEnabled,
      magazordIntegrationEnabled,
      sysempIntegrationEnabled,
    });

    if (intelipostClientId !== undefined && !intelipostClientId) {
      return res.status(400).json({ error: 'ID da Intelipost obrigatorio' });
    }

    if (
      (magazordApiBaseUrl !== undefined || magazordApiUser !== undefined) &&
      (!magazordApiBaseUrl || !magazordApiUser)
    ) {
      return res.status(400).json({
        error: 'URL base e usuario da Magazord precisam ser informados juntos.',
      });
    }

    const currentCompany = await (prisma.company as any).findUnique({
      where: { id: req.user.companyId },
      select: {
        ...ERP_INTEGRATION_FIELDS.reduce<Record<ErpIntegrationField, true>>(
          (accumulator, field) => {
            accumulator[field] = true;
            return accumulator;
          },
          {} as Record<ErpIntegrationField, true>,
        ),
        anymarketToken: true,
      },
    });

    if (!currentCompany) {
      return res.status(404).json({ error: 'Empresa nao encontrada' });
    }

    const effectiveErpState = ERP_INTEGRATION_FIELDS.reduce<
      Record<ErpIntegrationField, boolean>
    >((accumulator, field) => {
      const nextValue = erpIntegrationData[field];
      accumulator[field] =
        typeof nextValue === 'boolean'
          ? nextValue
          : Boolean((currentCompany as Record<string, unknown>)[field]);
      return accumulator;
    }, {} as Record<ErpIntegrationField, boolean>);

    const activeErpFields = resolveActiveErpFields(effectiveErpState);

    if (activeErpFields.length > 1) {
      return res.status(400).json({
        error:
          'Nao e permitido ativar um segundo ERP. Desative o ERP atual antes de ativar outro.',
      });
    }

    const effectiveAnymarketToken =
      anymarketToken !== undefined
        ? anymarketToken
        : (currentCompany as any).anymarketToken;
    const willEnableAnymarket = effectiveErpState.anymarketIntegrationEnabled === true;

    if (
      (willEnableAnymarket ||
        anymarketToken !== undefined) &&
      !effectiveAnymarketToken
    ) {
      return res.status(400).json({
        error:
          'O gumgaToken do ANYMARKET precisa ser informado para ativar ou configurar a integracao.',
      });
    }

    const company = await (prisma.company as any).update({
      where: { id: req.user.companyId },
      data: {
        ...(intelipostClientId !== undefined ? { intelipostClientId } : {}),
        ...erpIntegrationData,
        ...(intelipostIntegrationEnabled !== undefined
          ? { intelipostIntegrationEnabled }
          : {}),
        ...(sswRequireEnabled !== undefined ? { sswRequireEnabled } : {}),
        ...(correiosIntegrationEnabled !== undefined
          ? { correiosIntegrationEnabled }
          : {}),
        ...(anymarketToken !== undefined ? { anymarketToken } : {}),
        ...(magazordApiBaseUrl !== undefined ? { magazordApiBaseUrl } : {}),
        ...(magazordApiUser !== undefined ? { magazordApiUser } : {}),
        ...(magazordApiPassword !== undefined ? { magazordApiPassword } : {}),
        ...(sswRequireCnpjs !== undefined ? { sswRequireCnpjs } : {}),
        ...(integrationCarrierExceptions !== undefined
          ? { integrationCarrierExceptions }
          : {}),
      },
      select: {
        ...companyPublicSelect,
        magazordApiPassword: true,
        anymarketToken: true,
      },
    });

    return res.json({
      success: true,
      message: 'Configuracoes de integracao atualizadas com sucesso.',
      company: sanitizeCompanyResponse(company),
    });
  } catch (error) {
    console.error('Error updating current company integration:', error);
    return res.status(500).json({ error: 'Failed to update company integration' });
  }
};
