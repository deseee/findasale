/**
 * ADR-076: Internal API routes — GitHub Actions scraper endpoint
 * Protected by x-scraper-key header
 */

import express from 'express';
import { ingestFromGitHubActions } from '../controllers/internalScraperController';

const router = express.Router();

// POST /api/internal/scraper/ingest — accept scraped items from GitHub Actions
router.post('/scraper/ingest', ingestFromGitHubActions);

export default router;
