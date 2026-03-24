import { Router } from 'express';
import {
  completeAccessPassword,
  createUser,
  deleteUser,
  getAccessLinkDetails,
  getUsers,
  login,
  requestPasswordReset,
  switchUserCompany,
  updateUser,
} from '../controllers/userController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Rotas publicas
router.post('/login', login);
router.post('/forgot-password', requestPasswordReset);
router.get('/access-link/:token', getAccessLinkDetails);
router.post('/access-link/complete', completeAccessPassword);

// Rotas protegidas
router.get('/', authenticateToken, getUsers);
router.post('/', authenticateToken, createUser);
router.put('/:id', authenticateToken, updateUser);
router.delete('/:id', authenticateToken, deleteUser);
router.post('/switch-company', authenticateToken, switchUserCompany);

export default router;
