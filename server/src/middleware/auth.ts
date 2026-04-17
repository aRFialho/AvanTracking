import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        companyId: string | null;
        role: string;
        module?: 'avantracking' | 'logisync';
        isSuperAdmin?: boolean;
      };
    }
  }
}

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token nao fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        const expiredAt =
          err instanceof jwt.TokenExpiredError ? err.expiredAt : undefined;
        console.warn('Token expired:', expiredAt);
        return res.status(401).json({
          error: 'Token expirado',
          code: 'TOKEN_EXPIRED',
        });
      }

      console.error('Token verification failed:', err.message);
      return res.status(403).json({
        error: 'Token invalido',
        code: 'TOKEN_INVALID',
      });
    }

    req.user = decoded as any;
    next();
  });
};

export const generateToken = (payload: {
  id: string;
  email: string;
  companyId: string | null;
  role: string;
  module?: 'avantracking' | 'logisync';
  isSuperAdmin?: boolean;
}): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};
