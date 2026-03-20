
import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser, login, switchUserCompany } from '../controllers/userController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Middleware simples para verificar se é admin poderia ser adicionado aqui
// Por enquanto, confiamos na autenticação do frontend e validação básica

router.post('/login', login);
router.get('/', authenticateToken, getUsers);
router.post('/', authenticateToken, createUser);
router.put('/:id', authenticateToken, updateUser);
router.delete('/:id', authenticateToken, deleteUser);

// ✅ Rota para trocar empresa do usuário
router.post('/switch-company', authenticateToken, switchUserCompany);

export default router;
