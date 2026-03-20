
import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser, login, switchUserCompany } from '../controllers/userController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// ✅ Rota de login SEM autenticação
router.post('/login', login);

// ✅ Rotas COM autenticação
router.get('/', authenticateToken, getUsers);
router.post('/', authenticateToken, createUser);
router.put('/:id', authenticateToken, updateUser);
router.delete('/:id', authenticateToken, deleteUser);
router.post('/switch-company', authenticateToken, switchUserCompany);

export default router;
