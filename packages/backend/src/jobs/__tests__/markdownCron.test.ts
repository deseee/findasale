/**
 * markdownCron eligibility (2026-09-29, Patrick D3) and non-compounding tiers (2026-10-30).
 *
 * The free-tier Day-2 (50%) / Day-3+ (75%) schedule must run for every organizer tier and must
 * only touch live, unsold, undeleted items. Every tier is computed from the original pre-markdown
 * price (priceBeforeMarkdown, set once), rounded to keystone, and the cron never touches an item a
 * MarkdownCycle step has marked down (and vice versa, enforced in the conditional write).
 */
const mockSaleFindMany = jest.fn();
const mockItemFindMany = jest.fn();
const mockItemUpdate = jest.fn();
const mockItemUpdateMany = jest.fn();
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
      updateMany: (...a: any[]) => mockItemUpdateMany(...a),
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
  mockItemUpdateMany.mockResolvedValue({ count: 1 });
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
    expect(mockItemUpdateMany).toHaveBeenCalledTimes(2);
    const updatedIds = mockItemUpdateMany.mock.calls.map((c) => c[0].where.id).sort();
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
    mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 20, priceBeforeMarkdown: null }]);
    await runCron();
    expect(mockItemUpdateMany).toHaveBeenCalledTimes(1);
    const data = mockItemUpdateMany.mock.calls[0][0].data;
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
    expect(mockItemUpdateMany).not.toHaveBeenCalled();
  });

  it('Day 3 after Day 2 takes 75% off the ORIGINAL price, not off the Day-2 price, and keeps priceBeforeMarkdown', async () => {
    mockSaleFindMany.mockResolvedValue([{ id: 'sale_1', startDate: new Date(Date.now() - 2.5 * DAY), markdownFloor: null }]);
    mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 9.99, priceBeforeMarkdown: 20 }]);
    await runCron();
    expect(mockItemUpdateMany).toHaveBeenCalledTimes(1);
    const { where, data } = mockItemUpdateMany.mock.calls[0][0];
    expect(data.price).toBe(4.99); // 20 * 0.25 = 5.00 -> keystone 4.99 (compounded would be 9.99 * 0.25 -> 2.49)
    expect('priceBeforeMarkdown' in data).toBe(false); // never overwritten by a later step
    expect(data.markdownTierApplied).toBe(2);
    expect(where.price).toBe(9.99);
    expect(mockHistoryCreate).toHaveBeenCalledTimes(1);
    expect(mockHistoryCreate.mock.calls[0][0].data).toMatchObject({ itemId: 'item_1', price: 4.99, changedBy: 'markdown' });
    expect(mockNotifyDrops).toHaveBeenCalledWith('item_1', 9.99, 4.99);
  });

  it('an untouched item reaching Day 3 directly lands on 75% off and records the original', async () => {
    mockSaleFindMany.mockResolvedValue([{ id: 'sale_1', startDate: new Date(Date.now() - 3 * DAY), markdownFloor: null }]);
    mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 20, priceBeforeMarkdown: null }]);
    await runCron();
    const data = mockItemUpdateMany.mock.calls[0][0].data;
    expect(data.price).toBe(4.99);
    expect(data.priceBeforeMarkdown).toBe(20);
  });

  it('never selects or writes an item a MarkdownCycle step has marked down', async () => {
    mockSaleFindMany.mockResolvedValue([{ id: 'sale_1', startDate: new Date(Date.now() - 1.5 * DAY), markdownFloor: null }]);
    mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 20, priceBeforeMarkdown: null }]);
    await runCron();
    const cycleGuard = [{ markdownStepIndexApplied: null }, { markdownStepIndexApplied: 0 }];
    expect(mockItemFindMany.mock.calls[0][0].where.OR).toEqual(cycleGuard);
    const where = mockItemUpdateMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(cycleGuard);
    expect(where.markdownTierApplied).toEqual({ lt: 1 });
    expect(where.excludeFromMarkdown).toBe(false);
    expect(where.status).toBe('AVAILABLE');
  });

  it('a lost race (the conditional write matched nothing) records no history and sends no alert', async () => {
    mockSaleFindMany.mockResolvedValue([{ id: 'sale_1', startDate: new Date(Date.now() - 1.5 * DAY), markdownFloor: null }]);
    mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 20, priceBeforeMarkdown: null }]);
    mockItemUpdateMany.mockResolvedValue({ count: 0 });
    await runCron();
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockNotifyDrops).not.toHaveBeenCalled();
  });

  it('never raises a price: at the floor already, only the tier is stamped', async () => {
    mockSaleFindMany.mockResolvedValue([{ id: 'sale_1', startDate: new Date(Date.now() - 1.5 * DAY), markdownFloor: null }]);
    mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 0.99, priceBeforeMarkdown: null }]);
    await runCron();
    expect(mockItemUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockItemUpdateMany.mock.calls[0][0].data).toEqual({ markdownTierApplied: 1 });
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockNotifyDrops).not.toHaveBeenCalled();
  });

  it('honors the organizer floor as-is', async () => {
    mockSaleFindMany.mockResolvedValue([{ id: 'sale_1', startDate: new Date(Date.now() - 2.5 * DAY), markdownFloor: 7.25 }]);
    mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 9.99, priceBeforeMarkdown: 20 }]);
    await runCron();
    expect(mockItemUpdateMany.mock.calls[0][0].data.price).toBe(7.25);
  });
});
