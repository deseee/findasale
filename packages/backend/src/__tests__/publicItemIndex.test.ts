/**
 * GET /api/items/sitemap data rules (2026-09-29): only publicly viewable items, cursor pagination.
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 */
const mockItemFindMany = jest.fn();
jest.mock('../lib/prisma', () => ({ prisma: { item: { findMany: (...a: any[]) => mockItemFindMany(...a) } } }));

import {
  listPublicItemIds,
  parseSitemapPaging,
  SITEMAP_ITEMS_DEFAULT_LIMIT,
  SITEMAP_ITEMS_MAX_LIMIT,
} from '../services/publicItemIndexService';

describe('parseSitemapPaging', () => {
  it('defaults and clamps the limit', () => {
    expect(parseSitemapPaging({}).limit).toBe(SITEMAP_ITEMS_DEFAULT_LIMIT);
    expect(parseSitemapPaging({ limit: '999999' }).limit).toBe(SITEMAP_ITEMS_MAX_LIMIT);
    expect(parseSitemapPaging({ limit: '0' }).limit).toBe(1);
    expect(parseSitemapPaging({ limit: 'abc' }).limit).toBe(SITEMAP_ITEMS_DEFAULT_LIMIT);
  });
  it('accepts only id-shaped cursors', () => {
    expect(parseSitemapPaging({ cursor: 'cmabc123' }).cursorId).toBe('cmabc123');
    expect(parseSitemapPaging({ cursor: "x'; DROP TABLE" }).cursorId).toBeNull();
    expect(parseSitemapPaging({ cursor: ['a'] }).cursorId).toBeNull();
    expect(parseSitemapPaging({}).cursorId).toBeNull();
  });
});

describe('listPublicItemIds', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  beforeEach(() => mockItemFindMany.mockReset());

  it('filters to public items in public sales', async () => {
    mockItemFindMany.mockResolvedValue([]);
    await listPublicItemIds({ limit: 10, cursorId: null }, now);
    const args = mockItemFindMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      isActive: true,
      draftStatus: 'PUBLISHED',
      status: { notIn: ['GRACE_LOCKED'] },
      sale: {
        status: 'PUBLISHED',
        deletedAt: null,
        isInventoryContainer: false,
        OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
      },
    });
    expect(args.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'desc' }]);
    expect(args.cursor).toBeUndefined();
  });

  it('returns a nextCursor when there is another page and trims the extra row', async () => {
    const rows = [1, 2, 3].map((n) => ({ id: `i${n}`, updatedAt: new Date(2026, 9, n) }));
    mockItemFindMany.mockResolvedValue(rows);
    const page = await listPublicItemIds({ limit: 2, cursorId: null }, now);
    expect(mockItemFindMany.mock.calls[0][0].take).toBe(3);
    expect(page.items.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(page.nextCursor).toBe('i2');
  });

  it('returns a null cursor on the last page', async () => {
    mockItemFindMany.mockResolvedValue([{ id: 'i1', updatedAt: new Date() }]);
    const page = await listPublicItemIds({ limit: 2, cursorId: null }, now);
    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(1);
  });

  it('continues after the cursor row', async () => {
    mockItemFindMany.mockResolvedValue([]);
    await listPublicItemIds({ limit: 5, cursorId: 'i2' }, now);
    const args = mockItemFindMany.mock.calls[0][0];
    expect(args.cursor).toEqual({ id: 'i2' });
    expect(args.skip).toBe(1);
  });
});
