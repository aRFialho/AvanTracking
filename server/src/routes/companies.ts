
import { Router } from 'express';
import {
  getCompanies,
  createCompany,
  deleteCompany,
  getCurrentCompany,
  updateCurrentCompanyIntegration,
} from '../controllers/companyController';

const router = Router();

router.get('/', getCompanies);
router.get('/current', getCurrentCompany);
router.patch('/current/integration', updateCurrentCompanyIntegration);
router.post('/', createCompany);
router.delete('/:id', deleteCompany);

export default router;
