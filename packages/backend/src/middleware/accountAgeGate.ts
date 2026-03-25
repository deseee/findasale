import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/**
 * Middleware: Account Age Gate
 * Ensures bidders have accounts at least 7 days old.
 * Returns 403 if account age < 7 days.
 */
export const accountAgeGate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Bypass for admin/seed accounts
    if (req.user.roles?.includes('ADMIN') || req.user.role === 'ADMIN') {
      return next();
    }

    const createdAt = req.user.createdAt;
    if (!createdAt) {
      return res.status(500).json({ message: 'Account creation date not found' });
    }

    const now = new Date();
    const accountAgeMs = now.getTime() - new Date(createdAt).getTime();
    const accountAgeHours = accountAgeMs / (1000 * 60 * 60);

    const SEVEN_DAYS_HOURS = 7 * 24; // 168 hours

    if (accountAgeHours < SEVEN_DAYS_HOURS) {
      return res.status(403).json({
        message: 'Account must be at least 7 days old to bid'
      });
    }

    next();
  } catch (error) {
    console.error('Error in accountAgeGate middleware:', error);
    res.status(500).json({ message: 'Server error validating account age' });
  }
};
