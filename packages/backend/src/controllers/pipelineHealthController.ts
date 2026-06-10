/**
 * Pipeline Health Controller
 *
 * GET /api/internal/pipeline-health
 *
 * Reports per-pipeline data-freshness counts so a daily monitor can catch
 * "green-but-empty" runs — workflows that exit 0 but wrote 0 rows. Each metric
 * is a cheap Prisma `count` (no rows loaded) on the relevant timestamp column.
 *
 * Auth: reuses the existing `requireSecret` guard on the internal router
 * (x-internal-secret header validated against OUTREACH_SECRET). The route is
 * registered behind that middleware in routes/internal.ts, so this controller
 * assumes the request is already authorized.
 *
 * Response is intentionally compact (well under ~2KB).
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const MS_24H = 24 * 60 * 60 * 1000;
const MS_7D = 7 * MS_24H;
const MS_8D = 8 * MS_24H;

export async function getPipelineHealth(req: Request, res: Response): Promise<void> {
  try {
    const now = Date.now();
    const since24h = new Date(now - MS_24H);
    const since7d = new Date(now - MS_7D);
    const since8d = new Date(now - MS_8D);

    const notes: string[] = [];

    // --- Sales by source (single groupBy each window; sourceName is the real
    // per-pipeline discriminator written by every scraper). groupBy returns
    // exactly the sources that produced rows, so a missing/zero source is the
    // "green-but-empty" signal the monitor watches for. ---
    const [salesBySource24hRaw, salesBySource7dRaw] = await Promise.all([
      prisma.sale.groupBy({
        by: ['sourceName'],
        where: { createdAt: { gte: since24h }, sourceName: { not: null } },
        _count: { _all: true },
      }),
      prisma.sale.groupBy({
        by: ['sourceName'],
        where: { createdAt: { gte: since7d }, sourceName: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const toSourceMap = (
      rows: Array<{ sourceName: string | null; _count: { _all: number } }>
    ): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const row of rows) {
        if (row.sourceName) out[row.sourceName] = row._count._all;
      }
      return out;
    };

    // --- Remaining metrics: independent count queries on the relevant
    // timestamp column. Run in parallel. ---
    const [
      geocoded24h,
      ungeocodedBacklog,
      outreachSent24h,
      outreachSent7d,
      emailsDiscovered24h,
      enriched24h,
      suppressionsAdded24h,
      contactFilled24h,
      leadScores8d,
    ] = await Promise.all([
      // Geocoding: sales whose lat/lng was populated recently. There is no
      // dedicated geocodedAt column, so updatedAt is used as the freshness
      // proxy on rows that now carry coordinates (see notes).
      prisma.sale.count({
        where: { lat: { not: null }, lng: { not: null }, updatedAt: { gte: since24h } },
      }),
      // Ungeocoded backlog: mirrors the geocoding pipeline's own working-set
      // definition (PUBLISHED, has city+state, lat still null).
      prisma.sale.count({
        where: { lat: null, status: 'PUBLISHED', city: { not: '' }, state: { not: '' } },
      }),
      // Outreach sent: OutreachAuditLog SENT events are the canonical send signal.
      prisma.outreachAuditLog.count({
        where: { event: 'SENT', createdAt: { gte: since24h } },
      }),
      prisma.outreachAuditLog.count({
        where: { event: 'SENT', createdAt: { gte: since7d } },
      }),
      // Email discovery: organizers whose contact email was discovered recently.
      prisma.organizer.count({
        where: { emailDiscoveredAt: { gte: since24h } },
      }),
      // Enrichment: ESN sales that are now fully enriched (description + photos)
      // and were touched by the scraper within 24h. No enrichedAt column exists,
      // so lastScrapedAt is the freshness proxy (see notes).
      prisma.sale.count({
        where: {
          sourceName: 'EstateSalesNet',
          sourceUrl: { not: null },
          description: { not: null },
          NOT: { photoUrls: { equals: [] } },
          lastScrapedAt: { gte: since24h },
        },
      }),
      // Suppression: rows added to the suppression list in the last 24h.
      prisma.emailSuppression.count({
        where: { createdAt: { gte: since24h } },
      }),
      // Organizer backfill: organizers whose contactEmail-bearing record was
      // updated in the last 24h (backfill writes contactEmail + bumps updatedAt).
      prisma.organizer.count({
        where: { contactEmail: { not: null }, updatedAt: { gte: since24h } },
      }),
      // Lead scoring: organizers re-scored in the last 8 days. The cron runs
      // weekly and filters on lastScoredAt >= 7d, so an 8-day window confirms
      // the most recent run actually wrote scores.
      prisma.organizer.count({
        where: { lastScoredAt: { gte: since8d } },
      }),
    ]);

    notes.push(
      'geocoding.geocoded_24h uses Sale.updatedAt as a proxy — no dedicated geocodedAt column exists; count may include sales updated for other reasons.'
    );
    notes.push(
      'enrichment.ai_enriched_24h uses Sale.lastScrapedAt as a proxy for ESN detail-enrichment freshness — no dedicated enrichedAt column exists.'
    );
    notes.push(
      'organizer_backfill.contact_filled_24h uses Organizer.updatedAt as a proxy — no dedicated contactFilledAt column exists; count may include unrelated organizer updates.'
    );

    res.status(200).json({
      generatedAt: new Date(now).toISOString(),
      sales_by_source_24h: toSourceMap(salesBySource24hRaw),
      sales_by_source_7d: toSourceMap(salesBySource7dRaw),
      geocoding: {
        geocoded_24h: geocoded24h,
        ungeocoded_backlog: ungeocodedBacklog,
      },
      outreach: {
        outreach_sent_24h: outreachSent24h,
        outreach_sent_7d: outreachSent7d,
      },
      email_discovery: {
        emails_discovered_24h: emailsDiscovered24h,
      },
      enrichment: {
        ai_enriched_24h: enriched24h,
      },
      suppression: {
        suppressions_added_24h: suppressionsAdded24h,
      },
      organizer_backfill: {
        contact_filled_24h: contactFilled24h,
      },
      lead_scoring: {
        lead_scores_updated_8d: leadScores8d,
      },
      notes,
    });
  } catch (error) {
    console.error(
      '[pipelineHealthController] Error:',
      error instanceof Error ? error.message : String(error)
    );
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
