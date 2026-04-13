import { Router } from 'express';
import { voiceExtract } from '../controllers/voiceController';

const router = Router();

// POST /api/voice/extract — Feature #42: Voice-to-tag extraction (no auth required for MVP)
router.post('/extract', voiceExtract);

export default router;
