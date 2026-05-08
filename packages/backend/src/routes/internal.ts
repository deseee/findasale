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
import { runScrapeRun } from '../services/scraper/index';
import { runIndianaLicensingScraper } from '../services/scraper/sources/indianaLicensingScraper';
import { runOsmScraper } from '../services/scraper/osmScraper';
import { scrapeTheSaleSeker } from '../services/scraper/sources/saleSeeker';

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
router.post('/scraper/enrich-backfill', requireSecret, runEnrichmentBackfill);

// POST /api/internal/scraper/run-indiana-licensing — run Indiana auctioneer license scraper
router.post('/scraper/run-indiana-licensing', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runIndianaLicensingScraper();
    res.json({ success: true, message: 'Indiana licensing scraper completed' });
  } catch (error: any) {
    console.error('[IndianaLicensing] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-osm — run OpenStreetMap Overpass API scraper
router.post('/scraper/run-osm', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    await runOsmScraper();
    res.json({ success: true, message: 'OSM scraper completed' });
  } catch (error: any) {
    console.error('[OSM] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/scraper/run-sale-seeker — run TheSaleSeker.com scraper
router.post('/scraper/run-sale-seeker', requireSecret, async (req: express.Request, res: express.Response) => {
  try {
    // Get system organizer for unmanaged listings
    const { getOrCreateSystemOrganizer } = await import('../services/scraper/index');
    const organizerId = await getOrCreateSystemOrganizer();

    // Scrape all major metros (extract from query or use default list)
    const metros = req.body?.metros || ['grand-rapids-mi', 'new-york-ny', 'los-angeles-ca'];

    const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

    for (const metro of metros) {
      try {
        const { defaultRateLimiter } = await import('../services/scraper/index');
        const result = await scrapeTheSaleSeker(metro, organizerId, defaultRateLimiter);
        stats.created += result.created;
        stats.updated += result.updated;
        stats.skipped += result.skipped;
        stats.failed += result.failed;
      } catch (err) {
        console.error(`[SaleSeker] Metro ${metro} failed:`, err);
        stats.failed++;
      }
    }

    res.json({ success: true, message: 'SaleSeker scraper completed', stats });
  } catch (error: any) {
    console.error('[SaleSeker] Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/internal/enrich-sale-details — trigger ESN sale detail enrichment (description + photos)
router.post('/enrich-sale-details', triggerSaleDetailEnrichment);

// GET /api/internal/enrich-sale-details/status — check unenriched sales count
router.get('/enrich-sale-details/status', getSaleDetailEnrichmentStatus);

// GET /api/internal/enrich-sale-details/batch — get batch of unenriched sales (called by enrich-sale-details.yml workflow)
router.get('/enrich-sale-details/batch', getBatchOfUnenrichedSales);

// POST /api/internal/enrich-sale-details/bulk — bulk upsert enriched sale details (called by enrich-sale-details.yml workflow)
router.post('/enrich-sale-details/bulk', bulkUpsertEnrichedSales);

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
