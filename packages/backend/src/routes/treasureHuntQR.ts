import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  createClue,
  listClues,
  deleteClue,
  getClue,
  markClueFound,
  getProgress,
} from '../controllers/treasureHuntQRController';

const router = Router({ mergeParams: true });

/**
 * Feature #85: Treasure Hunt QR Routes
 * Mounted at /sales/:saleId/treasure-hunt-qr
 */

// POST /sales/:saleId/treasure-hunt-qr — Create clue (organizer auth)
router.post('/', authenticate, createClue);

// GET /sales/:saleId/treasure-hunt-qr — List clues (public, no auth)
router.get('/', listClues);

// GET /sales/:saleId/treasure-hunt-qr/progress — Get user's progress (auth required)
router.get('/progress', authenticate, getProgress);

// GET /sales/:saleId/treasure-hunt-qr/:clueId — Get single clue (auth required)
router.get('/:clueId', authenticate, getClue);

// POST /sales/:saleId/treasure-hunt-qr/:clueId/found — Mark found, award XP (auth required)
router.post('/:clueId/found', authenticate, markClueFound);

// DELETE /sales/:saleId/treasure-hunt-qr/:clueId — Delete clue (organizer auth)
router.delete('/:clueId', authenticate, deleteClue);

export default router;
