import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { handlePlannerChat } from '../controllers/plannerController';

const router = Router();

// Rate limiter for planner chat — 30 requests per 15 minutes per IP
// This is lenient to allow multi-turn conversation but prevent abuse
const plannerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: 'Too many requests. Please wait before sending another message.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/planner/chat — public endpoint, no auth required
// Body: { messages: Array<{role: 'user'|'assistant', content: string}> }
// Response: { reply: string }
router.post('/chat', plannerLimiter, async (req: Request, res: Response) => {
  await handlePlannerChat(req, res);
});

export default router;
