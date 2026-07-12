/**
 * ADR-076: GitHub Actions Scraper Runner — Internal Endpoint
 * Validates scraper key and ingests batches from GitHub Actions
 */

import { Request, Response } from 'express';
import { ingestScrapedListing, flushFreshnessTouches, flushScraperRevalidation, ScrapedItem } from '../services/scraper/index';

export const ingestFromGitHubActions = async (req: Request, res: Response): Promise<void> => {
  // --- Validation phase (try/catch covers ONLY this section) ---
  let items: ScrapedItem[] = [];
  let organizerId: string | undefined;

  try {
    // Validate x-scraper-key header
    const key = req.headers['x-scraper-key'];
    if (!process.env.INTERNAL_SCRAPER_KEY || key !== process.env.INTERNAL_SCRAPER_KEY) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    // Parse request body
    items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: 'No items provided' });
      return;
    }

    // organizerId is optional — ingestScrapedListing falls back to the system
    // organizer (created via getOrCreateSystemOrganizer) when undefined. This
    // is the correct path for unclaimed scraped listings.
    organizerId = req.body.organizerId || undefined;
  } catch (validationError) {
    console.error('[internalScraperController] Validation error:', validationError);
    if (!res.headersSent) {
      res.status(400).json({ message: 'Invalid request body' });
    }
    return;
  }

  // --- Ingest phase — synchronous so caller gets real stats ---
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  try {
    for (const item of items) {
      const result = await ingestScrapedListing(item, organizerId);
      if (result.status === 'created') stats.created++;
      else if (result.status === 'updated') stats.updated++;
      else if (result.status === 'skipped') stats.skipped++;
      else stats.failed++;
    }
    await flushFreshnessTouches();
    await flushScraperRevalidation();

    console.log('[internalScraperController] Ingest complete:', stats);
    res.status(200).json({ stats });
  } catch (err) {
    console.error('[internalScraperController] Ingest error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Ingest failed', stats });
    }
  }
};
