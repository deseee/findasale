import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * TEMPORARY debug endpoint for diagnosing eBay sync issues.
 * Accessible without authentication — remove once investigation is complete.
 *
 * GET /api/debug/ebay-queries
 */

const router = Router();

router.get('/ebay-queries', async (req: Request, res: Response) => {
  console.log('[debug/ebay-queries] Request received — running eBay diagnostic queries...');

  try {
    // Query A: All EbayConnection records with key diagnostic fields
    const queryAResult = await prisma.$queryRaw<any[]>`
      SELECT
        "organizerId",
        "ebayUserId",
        "connectedAt",
        "lastRefreshedAt",
        "lastEbaySoldSyncAt",
        "lastErrorAt",
        "lastErrorMessage",
        "tokenExpiresAt"
      FROM "EbayConnection"
      ORDER BY "connectedAt" DESC
    `;
    console.log('[debug/ebay-queries] Query A — EbayConnection records:');
    console.log(JSON.stringify(queryAResult, null, 2));

    // Query B: Item counts grouped by status where ebayListingId is set
    const queryBResult = await prisma.$queryRaw<any[]>`
      SELECT
        "status",
        COUNT(*) AS "count"
      FROM "Item"
      WHERE "ebayListingId" IS NOT NULL
      GROUP BY "status"
    `;
    console.log('[debug/ebay-queries] Query B — Item status breakdown (eBay-listed items):');
    console.log(JSON.stringify(queryBResult, null, 2));

    // Query C: EbayConnection error message frequency
    const queryCResult = await prisma.$queryRaw<any[]>`
      SELECT
        "lastErrorMessage",
        COUNT(*) AS "count"
      FROM "EbayConnection"
      WHERE "lastErrorMessage" IS NOT NULL
      GROUP BY "lastErrorMessage"
    `;
    console.log('[debug/ebay-queries] Query C — EbayConnection error message breakdown:');
    console.log(JSON.stringify(queryCResult, null, 2));

    console.log('[debug/ebay-queries] All queries completed successfully.');

    return res.status(200).json({
      success: true,
      queryA_ebayConnections: queryAResult,
      queryB_itemStatusByEbayListing: queryBResult,
      queryC_errorMessageBreakdown: queryCResult,
    });
  } catch (error: any) {
    console.error('[debug/ebay-queries] Query failed:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error',
    });
  }
});

export default router;
