/**
 * Internal Reports Controller
 * Read-only reporting endpoints for internal/ops use. Added 2026-08-03 because
 * Claude Cowork cloud sessions have no direct path to the production database
 * (no SSH tunnel, no raw TCP, no Railway MCP exec capability -- confirmed absent
 * across all three). This exposes specific, whitelisted, read-only queries as
 * normal HTTPS endpoints instead -- NOT a generic "run arbitrary SQL" endpoint.
 * Protected by x-scraper-key header, reusing the existing INTERNAL_SCRAPER_KEY
 * pattern (see internalGeocodingController.ts). No writes. No mutations.
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * GET /api/internal/reports/unconfirmed-weight-backlog
 * For every eBay-connected organizer, counts AVAILABLE items that are live on eBay
 * (ebayListingId set) but were published using an unconfirmed weight/shipping estimate
 * (packageConfirmedByOrganizer: false). Platform-wide -- not limited to one organizer.
 * Ports the logic from scripts/patrick-queries/platform-wide-unconfirmed-weight-count.mjs.
 * Read-only. Protected by x-scraper-key header.
 */
export async function getUnconfirmedWeightBacklog(req: Request, res: Response): Promise<void> {
  try {
    const key = req.headers['x-scraper-key'];
    if (!process.env.INTERNAL_SCRAPER_KEY || key !== process.env.INTERNAL_SCRAPER_KEY) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    // Every eBay-connected organizer. EbayConnection.organizerId is @unique (one row per
    // organizer, schema.prisma:611-659) -- a row existing means that organizer has completed
    // eBay OAuth. Does not check whether the connection's token is still valid -- answers
    // "connected at all", which is the platform-wide question this endpoint answers.
    const connections = await prisma.ebayConnection.findMany({
      select: {
        organizerId: true,
        organizer: { select: { businessName: true } },
      },
    });

    if (connections.length === 0) {
      res.json({ organizers: [], grandTotal: 0 });
      return;
    }

    const orgIds = connections.map((c) => c.organizerId);

    // Item.organizerId is denormalized from sale.organizerId (schema.prisma:1154 comment:
    // "Denormalized from sale.organizerId for library queries") and nullable on the model --
    // the where clause below scopes it to orgIds (all non-null), so results are safe to treat
    // as non-null, but if a given item's organizerId were ever unpopulated where
    // sale.organizerId is not, this would undercount that organizer. Not independently
    // verified against production data -- same caveat the reference script carries.
    const grouped = await prisma.item.groupBy({
      by: ['organizerId'],
      where: {
        organizerId: { in: orgIds },
        status: 'AVAILABLE',
        isActive: true,
        deletedAt: null,
        ebayListingId: { not: null },
        packageConfirmedByOrganizer: false,
      },
      _count: { _all: true },
    });

    const countByOrg = new Map<string, number>(
      grouped
        .filter((g): g is typeof g & { organizerId: string } => g.organizerId !== null)
        .map((g) => [g.organizerId, g._count._all])
    );

    const organizers = connections
      .map((c) => ({
        organizerId: c.organizerId,
        businessName: c.organizer?.businessName ?? '(unknown)',
        count: countByOrg.get(c.organizerId) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);

    const grandTotal = organizers.reduce((sum, o) => sum + o.count, 0);

    res.json({ organizers, grandTotal });
  } catch (err) {
    console.error('[internalReportsController] getUnconfirmedWeightBacklog failed:', err);
    res.status(500).json({ message: 'Internal error' });
  }
}
