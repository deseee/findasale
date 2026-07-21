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
  // Diagnostic aggregation only — does NOT affect created/updated/skipped/failed
  // classification. Item-level failure reasons were previously swallowed entirely
  // (only the aggregate `failed` count was visible in GitHub Actions logs), making
  // a 0-created/high-failed regression undiagnosable without direct DB/log access.
  // Bucketed by truncated reason text and capped to the top 10 so this can never
  // produce unbounded log/response growth on a bad batch.
  const failureReasonCounts = new Map<string, number>();
  const recordFailureReason = (reason?: string): void => {
    if (!reason) return;
    const key = reason.length > 120 ? `${reason.slice(0, 120)}…` : reason;
    failureReasonCounts.set(key, (failureReasonCounts.get(key) || 0) + 1);
  };
  const topFailureReasons = (): { reason: string; count: number }[] =>
    Array.from(failureReasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }));

  try {
    for (const item of items) {
      const result = await ingestScrapedListing(item, organizerId);
      if (result.status === 'created') stats.created++;
      else if (result.status === 'updated') stats.updated++;
      else if (result.status === 'skipped') stats.skipped++;
      else {
        stats.failed++;
        recordFailureReason(result.reason);
      }
    }
    await flushFreshnessTouches();
    await flushScraperRevalidation();

    const failureReasons = topFailureReasons();
    console.log('[internalScraperController] Ingest complete:', stats, 'Top failure reasons:', failureReasons);
    res.status(200).json({ stats, failureReasons });
  } catch (err) {
    console.error('[internalScraperController] Ingest error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Ingest failed', stats, failureReasons: topFailureReasons() });
    }
  }
};
