/**
 * Guild Routes — Phase 2b
 * Explorer's Guild endpoints for Hall of Fame, rank info, and guild features
 */

import express from 'express';
import { getHallOfFame } from '../controllers/guildController';

const router = express.Router();

/**
 * GET /api/guild/hall-of-fame
 * Public endpoint — no authentication required
 * Returns all-time Grandmasters and seasonal top 100 Sage+
 */
router.get('/hall-of-fame', getHallOfFame);

export default router;
