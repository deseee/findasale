import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

// Extend Express Request type
export interface AuthRequest extends Request {
  user?: any & {
    organizerProfile?: {
      subscriptionTier?: string;
      [key: string]: any;
    };
  };
}

export const optionalAuthenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // No token — proceed as unauthenticated
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return next();
    const decoded = jwt.verify(token, jwtSecret) as { id: string };

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (user) req.user = user;
  } catch {
    // Invalid/expired token — proceed as unauthenticated, do not block
  }
  next();
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET is not set');
    const decoded = jwt.verify(token, jwtSecret) as { id: string; role?: string; tokenVersion?: number; organizerTokenVersion?: number };

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { organizer: true }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // P0 Fix 4: Validate tokenVersion — if JWT has stale version, token is invalidated
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ message: 'Token has been invalidated' });
    }

    // P0-1 Fix: Validate organizerTokenVersion for organizers — invalidate stale tier claims
    if (decoded.role === 'ORGANIZER' && decoded.organizerTokenVersion !== undefined && user.organizer) {
      if (decoded.organizerTokenVersion !== user.organizer.tokenVersion) {
        return res.status(401).json({ message: 'Session invalidated — please log in again.' });
      }
    }

    // Attach user to request
    req.user = user;
    // Attach organizer profile for tier checks
    if (user.organizer) {
      req.user.organizerProfile = user.organizer;
    }
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ message: 'Invalid token' });
  }
};
