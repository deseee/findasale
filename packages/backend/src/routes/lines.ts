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
import { requireTier } from '../middleware/requireTier';
import { lineSmsBurstLimiter, lineSmsHourlyLimiter } from '../middleware/smsRateLimiter';

const router = Router();

// ── Organizer routes ──────────────────────────────────────────────────────────
// Virtual Queue (Line Queue) is a PRO and TEAMS feature (2026-09-29): components/TierComparisonTable.tsx
// lists "Virtual Queue (Line Queue)" as simple:false, pro:true, teams:true, and every line text is billed by
// Twilio. It was wired as SIMPLE, so a free organizer could text up to 1000 shoppers. The texting routes
// (/start, /next, /notify, /broadcast) go through services/compliantSms.ts (consent, STOP list, quiet hours,
// sender prefix + STOP footer, daily cap, SmsSendLog) and, for the bulk ones, the line burst/hourly limiters.
router.post('/:saleId/start', authenticate, requireTier('PRO'), lineSmsBurstLimiter, lineSmsHourlyLimiter, startLine);
router.post('/:saleId/next', authenticate, requireTier('PRO'), callNext);
router.get('/:saleId/status', authenticate, requireTier('PRO'), getLineStatus);
// T4: /notify — "now serving #N" SMS blast to all waiting shoppers
router.post('/:saleId/notify', authenticate, requireTier('PRO'), lineSmsBurstLimiter, lineSmsHourlyLimiter, broadcastPositionUpdates);
router.post('/:saleId/broadcast', authenticate, requireTier('PRO'), lineSmsBurstLimiter, lineSmsHourlyLimiter, broadcastPositionUpdates); // compat alias
router.post('/entry/:lineEntryId/entered', authenticate, requireTier('PRO'), markAsEntered);

// ── Shopper routes ────────────────────────────────────────────────────────────
router.post('/:saleId/join', authenticate, joinLine);
router.get('/:saleId/my-position', authenticate, getMyPosition);
router.delete('/:saleId/leave', authenticate, leaveLine);

export default router;
