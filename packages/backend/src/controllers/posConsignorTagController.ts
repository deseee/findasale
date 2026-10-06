/**
 * POST /pos/consignor-tag/verify (2026-10-06): the register calls this when it scans a consignor price tag, BEFORE the
 * tag becomes a cart line. It re-validates everything the QR claims (flag, TEAMS, sale ownership, signature, consignor
 * workspace, archived) and answers only {consignorName, amountCents}. Nothing is written: the SOLD Item is minted later,
 * inside the sale's own transaction.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { resolveOrganizerOrTeamMember } from '../utils/posAuth';
import { resolveTagLines, isConsignorTagError, consignorTagErrorBody, toTagLineInput } from '../services/consignorTagService';

export const verifyConsignorTag = async (req: AuthRequest, res: Response) => {
  try {
    const actor = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!actor) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const saleId = body.saleId;
    if (typeof saleId !== 'string' || saleId.length === 0 || saleId.length > 64) {
      return res.status(400).json({ message: 'saleId is required', code: 'TAG_INVALID' });
    }

    const [line] = await resolveTagLines(prisma, {
      organizer: { id: actor.id, subscriptionTier: actor.subscriptionTier },
      saleId,
      lines: [toTagLineInput(body)],
    });
    return res.json({ consignorName: line.consignorName, amountCents: line.priceCents });
  } catch (err: unknown) {
    if (isConsignorTagError(err)) {
      return res.status(err.status).json(consignorTagErrorBody(err));
    }
    console.error('[pos] verifyConsignorTag error:', err);
    return res.status(500).json({ message: 'Could not verify this tag.' });
  }
};
