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
import { sendClaimEmailBatch } from '../services/scraper/claimEmailService';

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

// GET /api/internal/enrich-sale-details/batch — fetch paginated batch of unenriched sales for GitHub Actions
router.get('/enrich-sale-details/batch', getBatchOfUnenrichedSales);

// POST /api/internal/enrich-sale-details/bulk — upsert enriched sale details from GitHub Actions
router.post('/enrich-sale-details/bulk', bulkUpsertEnrichedSales);

// POST /api/internal/outreach/trigger — manual trigger for outreach email cron (protected)
router.post('/outreach/trigger', requireSecret, async (_req, res) => {
  try {
    console.log('[Internal] Manual outreach trigger fired');
    await sendOutreachEmails();
    res.json({ ok: true, message: 'Outreach batch complete' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/internal/claim-emails/trigger — manual trigger for claim emails cron (protected)
router.post('/claim-emails/trigger', requireSecret, async (_req, res) => {
  try {
    console.log('[Internal] Manual claim-emails trigger fired');
    await sendClaimEmailBatch();
    res.json({ ok: true, message: 'Claim email batch complete' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
