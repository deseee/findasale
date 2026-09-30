/**
 * Public item id index (2026-09-29), backing GET /api/items/sitemap (itemController.getSitemapItems).
 *
 * Kept out of itemController so the visibility rules are unit-testable without that file's huge import graph.
 *
 * Visibility matches the public sale page (GET /api/sales/:id for an anonymous viewer):
 *  - item: PUBLIC_ITEM_FILTER (isActive, not GRACE_LOCKED, draftStatus PUBLISHED)
 *  - sale: PUBLISHED, not soft-deleted, not an inventory container, and past its early-access window.
 *    Anonymous viewers are rank INITIATE, which has no early access, so publishedAt must be null or <= now.
 *
 * NOT a crawler sitemap: item pages (/items/[id]) are deliberately noindex until they move to ISR
 * (pages/server-sitemap.xml.tsx, S1070/S1071), so these ids must never be added to sitemap.xml.
 */

import { prisma } from '../lib/prisma';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';

export const SITEMAP_ITEMS_DEFAULT_LIMIT = 5000;
export const SITEMAP_ITEMS_MAX_LIMIT = 10000;

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface SitemapPaging {
  limit: number;
  cursorId: string | null;
}

/** Parses ?limit= and ?cursor= defensively. Bad values fall back to defaults instead of erroring. */
export function parseSitemapPaging(query: { limit?: unknown; cursor?: unknown }): SitemapPaging {
  const rawLimit = parseInt(String(query.limit ?? ''), 10);
  const limit = Math.min(
    Math.max(Number.isFinite(rawLimit) ? rawLimit : SITEMAP_ITEMS_DEFAULT_LIMIT, 1),
    SITEMAP_ITEMS_MAX_LIMIT
  );
  const cursorId = typeof query.cursor === 'string' && CURSOR_PATTERN.test(query.cursor) ? query.cursor : null;
  return { limit, cursorId };
}

export interface PublicItemIdPage {
  items: Array<{ id: string; updatedAt: Date }>;
  nextCursor: string | null;
}

/** One page of publicly viewable item ids, newest first (updatedAt desc, id desc: stable for cursors). */
export async function listPublicItemIds(paging: SitemapPaging, now: Date = new Date()): Promise<PublicItemIdPage> {
  const { limit, cursorId } = paging;

  const rows = await prisma.item.findMany({
    where: {
      ...PUBLIC_ITEM_FILTER,
      sale: {
        status: 'PUBLISHED',
        deletedAt: null,
        isInventoryContainer: false,
        OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
      },
    },
    select: { id: true, updatedAt: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
