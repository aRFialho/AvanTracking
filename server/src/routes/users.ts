
import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser } from '../controllers/userController';

const router = Router();

// Middleware simples para verificar se é admin poderia ser adicionado aqui
// Por enquanto, confiamos na autenticação do frontend e validação básica

router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
