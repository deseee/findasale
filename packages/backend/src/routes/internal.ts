/**
 * ADR-076: Internal API routes — GitHub Actions scraper endpoint
 * Protected by x-scraper-key header
 */

import express from 'express';
import { ingestFromGitHubActions } from '../controllers/internalScraperController';
import { runEnrichmentBackfill } from '../controllers/internalEnrichmentController';
import {
  triggerSaleDetailEnrichment,
  getSaleDetailEnrichmentStatus,
  getBatchOfUnenrichedSales,
  bulkUpsertEnrichedSales,
} from '../controllers/internalSaleDetailEnrichmentController';

const router = express.Router();

// POST /api/internal/scraper/ingest — accept scraped items from GitHub Actions
router.post('/scraper/ingest', ingestFromGitHubActions);

// POST /api/internal/scraper/enrich-backfill — backfill Google Places data on unmanaged listings
router.post('/scraper/enrich-backfill', runEnrichmentBackfill);

// POST /api/internal/enrich-sale-details — trigger ESN sale detail enrichment (description + photos)
router.post('/enrich-sale-details', triggerSaleDetailEnrichment);

// GET /api/internal/enrich-sale-details/status — check unenriched sales count
router.get('/enrich-sale-details/status', getSaleDetailEnrichmentStatus);

// GET /api/internal/enrich-sale-details/batch — fetch paginated batch of unenriched sales for GitHub Actions
router.get('/enrich-sale-details/batch', getBatchOfUnenrichedSales);

// POST /api/internal/enrich-sale-details/bulk — upsert enriched sale details from GitHub Actions
router.post('/enrich-sale-details/bulk', bulkUpsertEnrichedSales);

export default router;
