/**
 * itemQueries.ts — Phase 1B Helper
 *
 * Rapidfire Mode creates Items with draftStatus = 'DRAFT' initially.
 * After AI analysis, they become 'PENDING_REVIEW'.
 * After organizer publishes, they become 'PUBLISHED'.
 *
 * This helper enforces that DRAFT and PENDING_REVIEW items NEVER appear in
 * public-facing endpoints (browse, search, sale detail, trending, etc.).
 * Only PUBLISHED items are visible to shoppers.
 *
 * Import PUBLIC_ITEM_FILTER when filtering by draft status is needed.
 * Use getPublicItemsBySaleId for common "items in a public sale" queries.
 */

import { prisma } from '../lib/prisma';

/**
 * PUBLIC_ITEM_FILTER — Prisma where clause fragment
 * Ensures only published items appear in public queries.
 *
 * Usage in Prisma:
 *   where: {
 *     saleId,
 *     ...PUBLIC_ITEM_FILTER,
 *   }
 *
 * Note: draftStatus field is added in Phase 1A migration.
 * TypeScript may show type errors until migration deploys — that's expected.
 */
export const PUBLIC_ITEM_FILTER = {
  draftStatus: 'PUBLISHED',
} as const;

/**
 * getPublicItemsBySaleId(saleId)
 *
 * Fetches all PUBLISHED items for a sale.
 * Used by sale detail endpoints, item listings, etc.
 *
 * @param saleId — the sale ID to query
 * @returns array of items with draftStatus = 'PUBLISHED'
 */
export async function getPublicItemsBySaleId(saleId: string) {
  return prisma.item.findMany({
    where: {
      saleId,
      ...PUBLIC_ITEM_FILTER,
    },
  });
}
