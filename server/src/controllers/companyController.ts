
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

// Listar todas as empresas
export const getCompanies = async (req: Request, res: Response) => {
  try {
    await ensureDemoCompanyData(prisma);

    const companies = await prisma.company.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
};

// Criar empresa
export const createCompany = async (req: Request, res: Response) => {
  const { name, cnpj, intelipostClientId, sswRequireCnpjs } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const company = await (prisma.company as any).create({
      data: {
        name,
        cnpj,
        intelipostClientId: intelipostClientId ? String(intelipostClientId).trim() : null,
        sswRequireCnpjs: normalizeSswRequireCnpjs(sswRequireCnpjs),
        integrationCarrierExceptions: normalizeIntegrationCarrierExceptions(
          req.body?.integrationCarrierExceptions,
        ),
      }
    });
    res.status(201).json(company);
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
        id: true,
        name: true,
        cnpj: true,
        intelipostClientId: true,
        sswRequireCnpjs: true,
        integrationCarrierExceptions: true,
        createdAt: true,
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'Empresa nao encontrada' });
    }

    return res.json(company);
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

    if (intelipostClientId !== undefined && !intelipostClientId) {
      return res.status(400).json({ error: 'ID da Intelipost obrigatorio' });
    }

    const company = await (prisma.company as any).update({
      where: { id: req.user.companyId },
      data: {
        ...(intelipostClientId !== undefined ? { intelipostClientId } : {}),
        ...(sswRequireCnpjs !== undefined ? { sswRequireCnpjs } : {}),
        ...(integrationCarrierExceptions !== undefined
          ? { integrationCarrierExceptions }
          : {}),
      },
      select: {
        id: true,
        name: true,
        cnpj: true,
        intelipostClientId: true,
        sswRequireCnpjs: true,
        integrationCarrierExceptions: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      message: 'Configuracoes de integracao atualizadas com sucesso.',
      company,
    });
  } catch (error) {
    console.error('Error updating current company integration:', error);
    return res.status(500).json({ error: 'Failed to update company integration' });
  }
};
