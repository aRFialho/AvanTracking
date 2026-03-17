
import { Router } from 'express';
import { getCompanies, createCompany, deleteCompany } from '../controllers/companyController';

const router = Router();

router.get('/', getCompanies);
router.post('/', createCompany);
router.delete('/:id', deleteCompany);

export default router;
