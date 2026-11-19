/**
 * GET /sales/sitemap (utils/thinSale listSitemapSales) leaves thin sales out (2026-11-19, GSC thin-page cleanup): a PUBLISHED sale with no public
 * items, no photos and a description under 50 characters is noindex on /sales/[id], so it must not be in the
 * sitemap. Prisma is a mock.
 */
var mockPrisma: any;
jest.mock('../lib/prisma', () => {
  mockPrisma = { sale: { findMany: jest.fn() } };
  return { prisma: mockPrisma };
});
jest.mock('@sentry/node', () => new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : jest.fn()) }));

import { listSitemapSales } from '../utils/thinSale';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';

beforeEach(() => mockPrisma.sale.findMany.mockReset());

it('drops description-only sales whose description is too short, keeps the rest in order', async () => {
  const t = new Date('2026-11-18T00:00:00Z');
  mockPrisma.sale.findMany
    .mockResolvedValueOnce([{ id: 'a', updatedAt: t }, { id: 'b', updatedAt: t }, { id: 'c', updatedAt: t }])
    .mockResolvedValueOnce([
      { id: 'b', description: '  Sale Saturday  ' },
      { id: 'c', description: 'A full house of mid-century furniture, tools, vinyl records and kitchenware.' },
    ]);
  expect(await listSitemapSales(5000)).toEqual([{ id: 'a', updatedAt: t }, { id: 'c', updatedAt: t }]);
  const first = mockPrisma.sale.findMany.mock.calls[0][0];
  expect(first.take).toBe(5000);
  expect(first.orderBy).toEqual({ updatedAt: 'desc' });
  expect(first.where).toMatchObject({ status: 'PUBLISHED', deletedAt: null, isInventoryContainer: false });
  expect(first.where.OR).toEqual([
    { photoUrls: { isEmpty: false } },
    { items: { some: PUBLIC_ITEM_FILTER } },
    { AND: [{ description: { not: null } }, { description: { not: '' } }] },
  ]);
  const second = mockPrisma.sale.findMany.mock.calls[1][0];
  expect(second.where).toEqual({ id: { in: ['a', 'b', 'c'] }, photoUrls: { isEmpty: true }, items: { none: PUBLIC_ITEM_FILTER } });
});

it('skips the second query when nothing qualifies', async () => {
  mockPrisma.sale.findMany.mockResolvedValueOnce([]);
  expect(await listSitemapSales(5000)).toEqual([]);
  expect(mockPrisma.sale.findMany).toHaveBeenCalledTimes(1);
});
