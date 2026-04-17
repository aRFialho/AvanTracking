import { Router } from 'express';
import {
  createLogisyncRule,
  deleteLogisyncRule,
  getLogisyncConciliationContext,
  listLogisyncRules,
  updateLogisyncRule,
} from '../controllers/logisyncRuleController';

const router = Router();

router.get('/', listLogisyncRules);
router.get('/context', getLogisyncConciliationContext);
router.post('/', createLogisyncRule);
router.patch('/:ruleId', updateLogisyncRule);
router.delete('/:ruleId', deleteLogisyncRule);

export default router;

