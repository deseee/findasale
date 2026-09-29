/**
 * markdownCron eligibility (2026-09-29, Patrick D3). NOT EXECUTED when written (jest cannot run
 * on the authoring device); CI is the first real run.
 *
 * The free-tier Day-2 (50%) / Day-3+ (75%) schedule must run for every organizer tier and must
 * only touch live, unsold, undeleted items. Pricing math (keystone rounding) is asserted
 * unchanged.
 */
const mockSaleFindMany = jest.fn();
const mockItemFindMany = jest.fn();
const mockItemUpdate = jest.fn();
const mockHistoryCreate = jest.fn();
const mockNotifyDrops = jest.fn();

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../../index', () => ({
  prisma: {
    sale: { findMany: (...a: any[]) => mockSaleFindMany(...a) },
    item: {
      findMany: (...a: any[]) => mockItemFindMany(...a),
      update: (...a: any[]) => mockItemUpdate(...a),
    },
    itemPriceHistory: { create: (...a: any[]) => mockHistoryCreate(...a) },
  },
}));
jest.mock('../../services/priceDropService', () => ({
  notifyPriceDropAlerts: (...a: any[]) => mockNotifyDrops(...a),
}));

import cron from 'node-cron';
import { scheduleMarkdownCron } from '../markdownCron';

const DAY = 24 * 60 * 60 * 1000;

async function runCron() {
  (cron.schedule as jest.Mock).mockClear();
  scheduleMarkdownCron();
  const cb = (cron.schedule as jest.Mock).mock.calls[0][1];
  await cb();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockItemUpdate.mockResolvedValue({});
  mockHistoryCreate.mockResolvedValue({});
  mockNotifyDrops.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('markdownCron', () => {
  it('has no organizer-tier filter on the sale query (free for ALL tiers)', async () => {
    mockSaleFindMany.mockResolvedValue([]);
    await runCron();
    expect(mockSaleFindMany).toHaveBeenCalledTimes(1);
    const where = mockSaleFindMany.mock.calls[0][0].where;
    expect(where.markdownEnabled).toBe(true);
    expect(where.status).toBe('PUBLISHED');
    expect(JSON.stringify(where)).not.toMatch(/subscriptionTier|organizer/);
  });

  it('marks down sales of every tier (two sales, both processed)', async () => {
    const startDate = new Date(Date.now() - 1.5 * DAY);
    // The sale rows carry no tier at all: a SIMPLE-tier and a TEAMS-tier organizer's sales look identical here.
    mockSaleFindMany.mockResolvedValue([
      { id: 'sale_simple', startDate, markdownFloor: null },
      { id: 'sale_teams', startDate, markdownFloor: null },
    ]);
    mockItemFindMany.mockImplementation(async (args: any) => [{ id: `item_of_${args.where.saleId}`, price: 20 }]);
    await runCron();
    expect(mockItemUpdate).toHaveBeenCalledTimes(2);
    const updatedIds = mockItemUpdate.mock.calls.map((c) => c[0].where.id).sort();
    expect(updatedIds).toEqual(['item_of_sale_simple', 'item_of_sale_teams']);
  });

  it('only queries live, unsold, undeleted items (status AVAILABLE, deletedAt null)', async () => {
    mockSaleFindMany.mockResolvedValue([{ id: 'sale_1', startDate: new Date(Date.now() - 1.5 * DAY), markdownFloor: null }]);
    mockItemFindMany.mockResolvedValue([]);
    await runCron();
    const where = mockItemFindMany.mock.calls[0][0].where;
    expect(where.status).toBe('AVAILABLE');
    expect(where.deletedAt).toBeNull();
    expect(where.saleId).toBe('sale_1');
    expect(where.listingType).toEqual({ not: 'AUCTION' });
    expect(where.excludeFromMarkdown).toBe(false);
  });

  it('keeps the keystone pricing unchanged: $20 at 50% off lands on 9.99', async () => {
    mockSaleFindMany.mockResolvedValue([{ id: 'sale_1', startDate: new Date(Date.now() - 1.5 * DAY), markdownFloor: null }]);
    mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 20 }]);
    await runCron();
    expect(mockItemUpdate).toHaveBeenCalledTimes(1);
    const data = mockItemUpdate.mock.calls[0][0].data;
    expect(data.price).toBe(9.99);
    expect(data.priceBeforeMarkdown).toBe(20);
    expect(data.markdownTierApplied).toBe(1);
    expect(data.markdownApplied).toBe(true);
    expect(data.markdownPhysicallyAppliedAt).toBeNull();
  });

  it('does nothing on Day 1', async () => {
    mockSaleFindMany.mockResolvedValue([{ id: 'sale_1', startDate: new Date(Date.now() - 0.5 * DAY), markdownFloor: null }]);
    await runCron();
    expect(mockItemFindMany).not.toHaveBeenCalled();
    expect(mockItemUpdate).not.toHaveBeenCalled();
  });
});
