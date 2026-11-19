/**
 * pruneScrapedSales tombstones (2026-11-19, GSC 404 cleanup):
 *  - every pruned id gets a PrunedSaleTombstone row carrying the sale's canonical citySlug,
 *  - the Global Config 410 window is synced from tombstones WITHOUT a citySlug only (the ones with a slug are
 *    answered unbounded by GET /sales/:id -> 301 to the city page).
 * Prisma is a mock; nothing touches a database.
 */
var mockPrisma: any;
var mockTx: any;
jest.mock('../../lib/prisma', () => {
  mockTx = {
    affiliateLink: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })) },
    sale: { deleteMany: jest.fn(() => Promise.resolve({ count: 0 })) },
    prunedSaleTombstone: { createMany: jest.fn(() => Promise.resolve({ count: 0 })) },
  };
  mockPrisma = {
    sale: { count: jest.fn(), findMany: jest.fn() },
    prunedSaleTombstone: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: any) => Promise<unknown>) => fn(mockTx)),
  };
  return { prisma: mockPrisma };
});
jest.mock('../../services/revalidationService', () => {
  const { canonicalCitySlug } = jest.requireActual('../../utils/citySlug');
  return {
    triggerRevalidation: jest.fn(() => Promise.resolve()),
    citySlugFromCityState: jest.fn((city: string, state: string) => canonicalCitySlug(city, state)),
  };
});
jest.mock('../../lib/vercelGlobalConfig', () => ({ syncGlobalConfigExactSet: jest.fn(() => Promise.resolve()) }));

import { pruneScrapedSales } from '../pruneScrapedSales';
import { syncGlobalConfigExactSet } from '../../lib/vercelGlobalConfig';
import { resetCitySlugColumnCache } from '../../utils/tombstoneCitySlugColumn';

const p2022 = () =>
  Object.assign(new Error('The column `citySlug` does not exist in the current database.'), {
    code: 'P2022',
    meta: { modelName: 'PrunedSaleTombstone', column: 'citySlug' },
  });

beforeEach(() => {
  jest.clearAllMocks();
  resetCitySlugColumnCache();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('writes a tombstone with the canonical city slug for every pruned sale', async () => {
  const rows = [
    { id: 'cmaaaaaaaaaaaaaaaaaaaaaa1', city: 'Grand Rapids', state: 'MI' },
    { id: 'cmaaaaaaaaaaaaaaaaaaaaaa2', city: 'St. Louis', state: 'MO' },
    { id: 'cmaaaaaaaaaaaaaaaaaaaaaa3', city: '', state: 'MI' }, // cannot form a slug
  ];
  mockPrisma.sale.count.mockResolvedValue(rows.length);
  mockPrisma.sale.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
  mockPrisma.prunedSaleTombstone.findMany.mockResolvedValue([{ id: 'cmold' }]);

  const result = await pruneScrapedSales({ dryRun: false, maxDeletes: 10 });

  expect(result.deleted).toBe(3);
  expect(mockTx.sale.deleteMany).toHaveBeenCalledWith({ where: { id: { in: rows.map((r) => r.id) } } });
  expect(mockTx.prunedSaleTombstone.createMany).toHaveBeenCalledWith({
    data: [
      { id: 'cmaaaaaaaaaaaaaaaaaaaaaa1', citySlug: 'grand-rapids-mi' },
      { id: 'cmaaaaaaaaaaaaaaaaaaaaaa2', citySlug: 'st-louis-mo' },
      { id: 'cmaaaaaaaaaaaaaaaaaaaaaa3', citySlug: null },
    ],
    skipDuplicates: true,
  });
});

it('syncs only tombstones without a city slug to the Global Config 410 window', async () => {
  mockPrisma.sale.count.mockResolvedValue(0);
  mockPrisma.sale.findMany.mockResolvedValue([]);
  mockPrisma.prunedSaleTombstone.findMany.mockResolvedValue([{ id: 'cmlegacy1' }, { id: 'cmlegacy2' }]);

  await pruneScrapedSales({ dryRun: false, maxDeletes: 10 });

  expect(mockPrisma.prunedSaleTombstone.findMany).toHaveBeenCalledWith({
    where: { citySlug: null },
    select: { id: true },
    orderBy: { prunedAt: 'desc' },
    take: 5000,
  });
  expect(syncGlobalConfigExactSet).toHaveBeenCalledWith(['cmlegacy1', 'cmlegacy2']);
});

it('citySlug column not migrated yet (P2022): reruns the whole batch transaction without citySlug', async () => {
  const rows = [{ id: 'cmaaaaaaaaaaaaaaaaaaaaaa1', city: 'Grand Rapids', state: 'MI' }];
  mockPrisma.sale.count.mockResolvedValue(1);
  mockPrisma.sale.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
  mockPrisma.prunedSaleTombstone.findMany.mockResolvedValue([]);
  mockTx.prunedSaleTombstone.createMany.mockRejectedValueOnce(p2022());

  const result = await pruneScrapedSales({ dryRun: false, maxDeletes: 10 });

  expect(result.deleted).toBe(1);
  expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2); // aborted tx is not reused: the batch is rerun
  expect(mockTx.sale.deleteMany).toHaveBeenCalledTimes(2);
  expect(mockTx.prunedSaleTombstone.createMany).toHaveBeenLastCalledWith({
    data: [{ id: 'cmaaaaaaaaaaaaaaaaaaaaaa1' }],
    skipDuplicates: true,
  });
});

it('citySlug column not migrated yet (P2022): the 410 window falls back to the newest tombstones of all', async () => {
  mockPrisma.sale.count.mockResolvedValue(0);
  mockPrisma.sale.findMany.mockResolvedValue([]);
  mockPrisma.prunedSaleTombstone.findMany
    .mockRejectedValueOnce(p2022())
    .mockResolvedValueOnce([{ id: 'cmnew1' }, { id: 'cmold1' }]);

  await pruneScrapedSales({ dryRun: false, maxDeletes: 10 });

  expect(mockPrisma.prunedSaleTombstone.findMany).toHaveBeenLastCalledWith({
    select: { id: true },
    orderBy: { prunedAt: 'desc' },
    take: 5000,
  });
  expect(syncGlobalConfigExactSet).toHaveBeenCalledWith(['cmnew1', 'cmold1']);
});
