
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
  const { name, cnpj } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const company = await prisma.company.create({
      data: {
        name,
        cnpj
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
