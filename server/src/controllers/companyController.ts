
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ensureDemoCompanyData } from '../services/demoCompanyService';

const prisma = new PrismaClient();

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
  const { name, cnpj, intelipostClientId } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const company = await prisma.company.create({
      data: {
        name,
        cnpj,
        intelipostClientId: intelipostClientId ? String(intelipostClientId).trim() : null,
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

    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: {
        id: true,
        name: true,
        cnpj: true,
        intelipostClientId: true,
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

    const intelipostClientId = String(req.body?.intelipostClientId || '').trim();

    if (!intelipostClientId) {
      return res.status(400).json({ error: 'ID da Intelipost obrigatorio' });
    }

    const company = await prisma.company.update({
      where: { id: req.user.companyId },
      data: {
        intelipostClientId,
      },
      select: {
        id: true,
        name: true,
        cnpj: true,
        intelipostClientId: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      message: 'Configuracao Intelipost atualizada com sucesso.',
      company,
    });
  } catch (error) {
    console.error('Error updating current company integration:', error);
    return res.status(500).json({ error: 'Failed to update company integration' });
  }
};
