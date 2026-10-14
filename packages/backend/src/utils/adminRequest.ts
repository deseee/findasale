/**
 * isAdminRequest (2026-10-13, security): for public routes that accept an admin-only option (for example
 * ?forceRefresh=true, which bypasses a cache and recomputes an expensive aggregate). The route itself stays
 * public, so authentication is resolved lazily and only when the option is actually requested: if no
 * middleware attached req.user, the token is read with lenientOptionalAuthenticate (an expired or bad
 * token is simply anonymous, never an error). Returns true only for a user with the ADMIN role.
 */
import { Request, Response } from 'express';
import { AuthRequest, lenientOptionalAuthenticate } from '../middleware/auth';
import { isAdminViewer } from './saleStaffAccess';

export async function isAdminRequest(req: Request, res: Response): Promise<boolean> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    try {
      await new Promise<void>((resolve) => {
        lenientOptionalAuthenticate(authReq, res, () => resolve());
      });
    } catch {
      return false;
    }
  }
  return isAdminViewer(authReq.user);
}
