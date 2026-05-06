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
import { sendOutreachEmails } from '../jobs/outreachEmailsCron';
import { runCategorySync } from '../jobs/categorySyncCron';

const router = express.Router();

const requireSecret = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.OUTREACH_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

// POST /api/internal/scraper/ingest — accept scraped items from GitHub Actions
router.post('/scraper/ingest', ingestFromGitHubActions);

// POST /api/internal/scraper/enrich-backfill — backfill Google Places data on unmanaged listings
router.post('/scraper/enrich-backfill', runEnrichmentBackfill);

// POST /api/internal/enrich-sale-details — trigger ESN sale detail enrichment (description + photos)
router.post('/enrich-sale-details', triggerSaleDetailEnrichment);

// GET /api/internal/enrich-sale-details/status — check unenriched sales count
router.get('/enrich-sale-details/status', getSaleDetailEnrichmentStatus);

// GET /api/internal/enrich-sale-details/unenriched — get batch of unenriched sales
router.get('/enrich-sale-details/unenriched', getBatchOfUnenrichedSales);

// POST /api/internal/enrich-sale-details/bulk-upsert — bulk upsert enriched sale details
router.post('/enrich-sale-details/bulk-upsert', bulkUpsertEnrichedSales);

// POST /api/internal/category-sync/trigger — manually trigger eBay category sync (public eBay data, no auth required)
router.post('/category-sync/trigger', async (req: express.Request, res: express.Response) => {
  try {
    runCategorySync().catch(err => console.error('[CategorySync] Trigger error:', err));
    res.json({ ok: true, message: 'Category sync started' });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/internal/outreach/trigger — manually trigger outreach email batch (protected)
router.post('/outreach/trigger', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await sendOutreachEmails();
    res.json({ ok: true, message: 'Outreach batch triggered' });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
