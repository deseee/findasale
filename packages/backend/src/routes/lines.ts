import { Router } from 'express';
import {
  startLine,
  callNext,
  getLineStatus,
  markAsEntered,
  broadcastPositionUpdates,
  joinLine,
  getMyPosition,
  leaveLine,
} from '../controllers/lineController';
import { authenticate } from '../middleware/auth';
import { requireTierOrSaleUpgrade } from '../middleware/requireTier';
import { prisma } from '../lib/prisma';
import { lineSmsBurstLimiter, lineSmsHourlyLimiter } from '../middleware/smsRateLimiter';

const router = Router();

// 2026-10-23: the $9.99 a-la-carte sale upgrade includes the Virtual Queue for THAT sale (lib/saleProFeatures.ts).
// PRO/TEAMS pass as before; a SIMPLE organizer passes only for their own upgraded sale. The controllers keep their own
// ownership checks (sale.organizerId === caller's organizer), so other organizers and staff stay closed.
const proOrUpgradedSale = requireTierOrSaleUpgrade('PRO', (req) => req.params.saleId);
const proOrUpgradedSaleOfEntry = requireTierOrSaleUpgrade('PRO', async (req) => {
  const lineEntryId = req.params.lineEntryId;
  if (typeof lineEntryId !== 'string' || !lineEntryId) return null;
  const entry = await prisma.lineEntry.findUnique({ where: { id: lineEntryId }, select: { saleId: true } });
  return entry?.saleId ?? null;
});

// ── Organizer routes ──────────────────────────────────────────────────────────
// Virtual Queue (Line Queue) is a PRO and TEAMS feature (2026-09-29): components/TierComparisonTable.tsx
// lists "Virtual Queue (Line Queue)" as simple:false, pro:true, teams:true, and every line text is billed by
// Twilio. It was wired as SIMPLE, so a free organizer could text up to 1000 shoppers. The texting routes
// (/start, /next, /notify, /broadcast) go through services/compliantSms.ts (consent, STOP list, quiet hours,
// sender prefix + STOP footer, daily cap, SmsSendLog) and, for the bulk ones, the line burst/hourly limiters.
router.post('/:saleId/start', authenticate, proOrUpgradedSale, lineSmsBurstLimiter, lineSmsHourlyLimiter, startLine);
router.post('/:saleId/next', authenticate, proOrUpgradedSale, callNext);
router.get('/:saleId/status', authenticate, proOrUpgradedSale, getLineStatus);
// T4: /notify — "now serving #N" SMS blast to all waiting shoppers
router.post('/:saleId/notify', authenticate, proOrUpgradedSale, lineSmsBurstLimiter, lineSmsHourlyLimiter, broadcastPositionUpdates);
router.post('/:saleId/broadcast', authenticate, proOrUpgradedSale, lineSmsBurstLimiter, lineSmsHourlyLimiter, broadcastPositionUpdates); // compat alias
router.post('/entry/:lineEntryId/entered', authenticate, proOrUpgradedSaleOfEntry, markAsEntered);

// ── Shopper routes ────────────────────────────────────────────────────────────
router.post('/:saleId/join', authenticate, joinLine);
router.get('/:saleId/my-position', authenticate, getMyPosition);
router.delete('/:saleId/leave', authenticate, leaveLine);

export default router;
