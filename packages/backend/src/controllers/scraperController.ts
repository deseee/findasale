/**
 * ADR-073: Directory Scraper — Admin Controller
 * Provides admin endpoints for scraper management.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { runScrapeRun } from '../services/scraper';

const VALID_SOURCES = ['EstateSalesNet', 'GarageSaleFinder', 'Craigslist'];

/**
 * GET /admin/scraper/sources
 * Returns per-source status summary based on recent jobs.
 */
export const getScrapeSourcesStatus = async (_req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const recentJobs = await prisma.scrapedSalesJob.findMany({
      orderBy: { id: 'desc' },
      take: 100,
    });

    const summary = VALID_SOURCES.map((source) => {
      const sourceJobs = recentJobs.filter((j) => j.source === source);
      const lastJob = sourceJobs[0] ?? null;
      return {
        source,
        enabled: process.env.SCRAPER_ENABLED === 'true',
        lastRunAt: lastJob?.completedAt ?? null,
        lastRunStatus: lastJob?.status ?? null,
        recentJobCount: sourceJobs.length,
        recentItemsCreated: sourceJobs.reduce((sum, j) => sum + (j.itemsCreated ?? 0), 0),
      };
    });

    return res.json({ sources: summary });
  } catch (error) {
    console.error('[scraperController] getScrapeSourcesStatus error:', error);
    return res.status(500).json({ error: 'Failed to fetch scraper status' });
  }
};

/**
 * POST /admin/scraper/runs
 * Manually trigger a scrape run for a source + metro.
 * Fire-and-forget — returns immediately.
 */
export const triggerScrapeRun = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { source, metro } = req.body as { source?: string; metro?: string };

    if (!source || !VALID_SOURCES.includes(source)) {
      return res.status(400).json({
        error: `Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}`,
      });
    }
    if (!metro) {
      return res.status(400).json({ error: 'metro is required (e.g. "chicago-il")' });
    }

    // Fire and forget — respond immediately, job runs in background
    runScrapeRun(source, metro).catch((err) =>
      console.error(`[scraperController] Manual trigger failed for ${source}/${metro}:`, err)
    );

    return res.json({ message: `Scrape run started for ${source} / ${metro}` });
  } catch (error) {
    console.error('[scraperController] triggerScrapeRun error:', error);
    return res.status(500).json({ error: 'Failed to trigger scrape run' });
  }
};

/**
 * GET /admin/scraper/runs
 * Paginated list of ScrapedSalesJob records.
 * Optional ?source=EstateSalesNet filter.
 */
export const getScrapeRuns = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = parseInt((req.query.limit as string) ?? '50', 10);
    const source = req.query.source as string | undefined;

    const where = source ? { source } : {};
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.scrapedSalesJob.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      prisma.scrapedSalesJob.count({ where }),
    ]);

    return res.json({ jobs, total, page, limit });
  } catch (error) {
    console.error('[scraperController] getScrapeRuns error:', error);
    return res.status(500).json({ error: 'Failed to fetch scrape runs' });
  }
};

/**
 * GET /admin/scraper/sales
 * Paginated list of scraped Sales (sourceName IS NOT NULL).
 * Optional ?claimed=true/false filter.
 */
export const getScrapedSales = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = parseInt((req.query.limit as string) ?? '50', 10);
    const claimed = req.query.claimed as string | undefined;

    const skip = (page - 1) * limit;

    const baseWhere = {
      sourceName: { not: null as string | null },
      deletedAt: null,
    };

    const organizerFilter =
      claimed === 'true'
        ? { isClaimed: true }
        : claimed === 'false'
        ? { isClaimed: false }
        : undefined;

    const where = organizerFilter
      ? { ...baseWhere, organizer: organizerFilter }
      : baseWhere;

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: { lastScrapedAt: 'desc' },
        skip,
        take: limit,
        include: {
          organizer: {
            select: {
              id: true,
              businessName: true,
              isClaimed: true,
              isUnmanagedListing: true,
            },
          },
        },
      }),
      prisma.sale.count({ where }),
    ]);

    return res.json({ sales, total, page, limit });
  } catch (error) {
    console.error('[scraperController] getScrapedSales error:', error);
    return res.status(500).json({ error: 'Failed to fetch scraped sales' });
  }
};

/**
 * POST /admin/scraper/takedown
 * Soft-delete a scraped sale (sets deletedAt).
 * Body: { saleId: string }
 */
export const emergencyTakedown = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { saleId } = req.body as { saleId?: string };

    if (!saleId) {
      return res.status(400).json({ error: 'saleId is required' });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, sourceName: true, deletedAt: true },
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.deletedAt) {
      return res.status(409).json({ error: 'Sale is already taken down' });
    }

    await prisma.sale.update({
      where: { id: saleId },
      data: { deletedAt: new Date() },
    });

    console.log(`[scraperController] Emergency takedown: sale ${saleId} soft-deleted`);
    return res.json({ message: `Sale ${saleId} taken down successfully` });
  } catch (error) {
    console.error('[scraperController] emergencyTakedown error:', error);
    return res.status(500).json({ error: 'Failed to take down sale' });
  }
};
