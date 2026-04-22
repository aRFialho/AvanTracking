import { Router } from 'express';
import {
  createLogisyncUser,
  deleteLogisyncUser,
  listLogisyncUsers,
  updateLogisyncUser,
} from '../controllers/logisyncUserController';

const router = Router();

router.get('/', listLogisyncUsers);
router.post('/', createLogisyncUser);
router.put('/:id', updateLogisyncUser);
router.delete('/:id', deleteLogisyncUser);

export default router;
