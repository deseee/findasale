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

    const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

    // Ingest each item
    for (const item of items) {
      const result = await ingestScrapedListing(item, organizerId);
      if (result.status === 'created') stats.created++;
      else if (result.status === 'updated') stats.updated++;
      else if (result.status === 'skipped') stats.skipped++;
      else stats.failed++;
    }

    res.json({ stats });
  } catch (error) {
    console.error('[internalScraperController] Ingest error:', error);
    res.status(500).json({ message: 'Ingest failed', error: error instanceof Error ? error.message : String(error) });
  }
};
