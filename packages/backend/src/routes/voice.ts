import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { voiceExtract } from '../controllers/voiceController';

const router = Router();

// Rate limiter — defense-in-depth consistency with other public no-auth endpoints
// (contact, planner, search). Handler is regex-only (no external calls), so this
// guards against CPU-abuse rather than cost. Health-scout finding 2026-07-26, Low #1.
const voiceExtractLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  message: { error: 'Too many requests. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/voice/extract — Feature #42: Voice-to-tag extraction (no auth required for MVP)
router.post('/extract', voiceExtractLimiter, voiceExtract);

export default router;
