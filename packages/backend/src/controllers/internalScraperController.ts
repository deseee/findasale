/**
 * ADR-076: GitHub Actions Scraper Runner — Internal Endpoint
 * Validates scraper key and ingests batches from GitHub Actions
 */

import { Request, Response } from 'express';
import { ingestScrapedListing, ScrapedItem } from '../services/scraper/index';

export const ingestFromGitHubActions = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate x-scraper-key header
    const key = req.headers['x-scraper-key'];
    if (key !== process.env.INTERNAL_SCRAPER_KEY) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    // Parse request body
    const items: ScrapedItem[] = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: 'No items provided' });
      return;
    }

    // organizerId is optional — ingestScrapedListing falls back to the system
    // organizer (created via getOrCreateSystemOrganizer) when undefined. This
    // is the correct path for unclaimed scraped listings.
    const organizerId: string | undefined = req.body.organizerId || undefined;

    // Respond immediately to avoid Railway 30-second timeout → double-response error.
    // Ingest runs in the background (fire-and-forget).
    res.status(202).json({ message: 'Scraper ingest started' });

    const runIngest = async (): Promise<void> => {
      const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

      for (const item of items) {
        const result = await ingestScrapedListing(item, organizerId);
        if (result.status === 'created') stats.created++;
        else if (result.status === 'updated') stats.updated++;
        else if (result.status === 'skipped') stats.skipped++;
        else stats.failed++;
      }

      console.log('[internalScraperController] Ingest complete:', stats);
    };

    runIngest().catch(err => console.error('[scraper-ingest] background error:', err));
  } catch (error) {
    console.error('[internalScraperController] Ingest error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Ingest failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
};
