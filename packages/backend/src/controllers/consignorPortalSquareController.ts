/**
 * Consignor portal Square payouts (2026-10-06). PUBLIC endpoints authorized only by the portal
 * capability token in the URL (Consignor.portalToken), mounted next to the existing portal routes
 * in routes/consignors.ts, all behind consignorPortalSquareLimiter. No FindA.Sale account needed.
 *
 *   GET  /api/consignors/portal/:token/square            cached status
 *   POST /api/consignors/portal/:token/square/start      returns { onboardingUrl }
 *   POST /api/consignors/portal/:token/square/callback   body { code, state }
 *   POST /api/consignors/portal/:token/square/refresh    re-check activation with Square
 *
 * Responses never include a merchant id, token, user id or any other consignor's data. Errors are
 * { error, code } from PortalSquareError (consignorSquareConnectService.ts).
 */
import { Request, Response } from 'express';
import {
  PortalSquareError,
  completePortalSquareConnection,
  getPortalSquareStatus,
  refreshPortalSquareStatus,
  startPortalSquareConnection,
} from '../services/consignorSquareConnectService';

function sendError(res: Response, err: unknown, label: string) {
  if (err instanceof PortalSquareError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error(`[${label}] Error:`, (err as any)?.message || err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'ERROR' });
}

export const getPortalSquare = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(await getPortalSquareStatus(req.params.token));
  } catch (err) {
    return sendError(res, err, 'getPortalSquare');
  }
};

export const startPortalSquare = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(await startPortalSquareConnection(req.params.token));
  } catch (err) {
    return sendError(res, err, 'startPortalSquare');
  }
};

export const completePortalSquare = async (req: Request, res: Response) => {
  try {
    // Only code and state are read from the body; nothing else is ever written from it.
    const body = req.body || {};
    return res.status(200).json(
      await completePortalSquareConnection({ portalToken: req.params.token, code: body.code, state: body.state })
    );
  } catch (err) {
    return sendError(res, err, 'completePortalSquare');
  }
};

export const refreshPortalSquare = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(await refreshPortalSquareStatus(req.params.token));
  } catch (err) {
    return sendError(res, err, 'refreshPortalSquare');
  }
};
