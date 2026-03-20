import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Estender tipo Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        companyId: string | null;
        role: string;
      };
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  // Pegar token do header Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('Token verification failed:', err);
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }

    // Settar o usuário no request
    req.user = decoded as any;
    next();
  });
};

// Gerar token JWT
export const generateToken = (payload: {
  id: string;
  email: string;
  companyId: string | null;
  role: string;
}): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }); // Token expira em 7 dias
};
