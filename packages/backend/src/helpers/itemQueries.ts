/**
 * itemQueries.ts — Phase 1B Helper
 *
 * Rapidfire Mode creates Items with draftStatus = 'DRAFT' initially.
 * After AI analysis, they become 'PENDING_REVIEW'.
 * After organizer publishes, they become 'PUBLISHED'.
 *
 * This helper enforces that DRAFT items (actively being edited) NEVER appear in
 * public-facing endpoints (browse, search, sale detail, trending, etc.).
 * PENDING_REVIEW and PUBLISHED items are visible to shoppers.
 *
 * Import PUBLIC_ITEM_FILTER when filtering by draft status is needed.
 * Use getPublicItemsBySaleId for common "items in a public sale" queries.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * PUBLIC_ITEM_FILTER — Prisma where clause fragment
 * Ensures only published items appear in public queries.
 * Excludes DRAFT items (which are actively being edited/AI analyzed by organizers).
 * Includes PENDING_REVIEW items (AI analysis complete, waiting for organizer review).
 * Includes PUBLISHED items (organizer approved, ready for sale).
 *
 * Usage in Prisma:
 *   where: {
 *     saleId,
 *     ...PUBLIC_ITEM_FILTER,
 *   }
 *
 * Note: draftStatus field is added in Phase 1A migration.
 * TypeScript may show type errors until migration deploys — that's expected.
 * Bug #25 fix: Exclude only DRAFT status; show PENDING_REVIEW and PUBLISHED items.
 */
// PUBLIC_ITEM_FILTER — Combines active status with grace-lock status
// Excludes items marked as inactive (organizer Hide bulk action)
// Excludes GRACE_LOCKED items (hidden from shoppers during grace period downgrade)
// Includes PENDING_REVIEW and PUBLISHED items that are marked isActive
export const PUBLIC_ITEM_FILTER: Prisma.ItemWhereInput = {
  isActive: true,
  status: { notIn: ['GRACE_LOCKED'] },
  draftStatus: { in: ['PENDING_REVIEW', 'PUBLISHED'] },
};

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
