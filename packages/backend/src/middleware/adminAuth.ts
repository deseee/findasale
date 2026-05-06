import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  const isAdmin = req.user?.roles?.includes('ADMIN') || req.user?.role === 'ADMIN';
  if (!req.user || !isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};
