/**
 * Markdown precedence in both crons (2026-11-04). Each organizer chooses which automatic markdown wins when the
 * sale's Day-2/Day-3 tiers (markdownCron.ts) and a MarkdownCycle (markdownCycleCron.ts) could both apply:
 * FIRST_WINS (default, the exact 2026-10-30 behavior), SALE_TIERS_WIN or CYCLES_WIN.
 */
const mockSaleFindMany = jest.fn();
const mockCycleFindMany = jest.fn();
const mockItemFindMany = jest.fn();
const mockItemUpdate = jest.fn();
const mockItemUpdateMany = jest.fn();
const mockHistoryCreate = jest.fn();
const mockPrecedenceFindMany = jest.fn();
const mockOrganizerFindMany = jest.fn();
const mockNotifyDrops = jest.fn();
const mockPropagate = jest.fn();

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../../index', () => ({
  prisma: {
    sale: { findMany: (...a: any[]) => mockSaleFindMany(...a) },
    markdownCycle: { findMany: (...a: any[]) => mockCycleFindMany(...a) },
    item: {
      findMany: (...a: any[]) => mockItemFindMany(...a),
      update: (...a: any[]) => mockItemUpdate(...a),
      updateMany: (...a: any[]) => mockItemUpdateMany(...a),
    },
    itemPriceHistory: { create: (...a: any[]) => mockHistoryCreate(...a) },
    organizerMarkdownPrecedence: { findMany: (...a: any[]) => mockPrecedenceFindMany(...a) },
    organizer: { findMany: (...a: any[]) => mockOrganizerFindMany(...a) },
  },
}));
jest.mock('../../services/priceDropService', () => ({
  notifyPriceDropAlerts: (...a: any[]) => mockNotifyDrops(...a),
}));
jest.mock('../../services/markdownPricePropagationService', () => ({
  classifyPropagationFailure: jest.fn(),
  resolveSyncStateAfterFailure: jest.fn(),
  formatPropagationFailureReason: jest.fn(),
  propagateMarkdownPriceToMarketplaces: (...a: any[]) => mockPropagate(...a),
}));

import cron from 'node-cron';
import { scheduleMarkdownCron } from '../markdownCron';
import { scheduleMarkdownCycleCron } from '../markdownCycleCron';

const DAY = 24 * 60 * 60 * 1000;
const CYCLE_GUARD = [{ markdownStepIndexApplied: null }, { markdownStepIndexApplied: 0 }];

async function run(schedule: () => void) {
  (cron.schedule as jest.Mock).mockClear();
  schedule();
  const cb = (cron.schedule as jest.Mock).mock.calls[0][1];
  await cb();
}

/** Organizer org_1's stored choice and tier (null = no row). */
function setPrecedence(precedence: string | null, tier = 'PRO') {
  mockPrecedenceFindMany.mockImplementation(async (args: any) =>
    precedence && precedence !== 'FIRST_WINS' && args.where.organizerId.in.includes('org_1')
      ? [{ organizerId: 'org_1', precedence }]
      : []
  );
  mockOrganizerFindMany.mockResolvedValue([{ id: 'org_1', subscriptionTier: tier }]);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockItemUpdate.mockResolvedValue({});
  mockItemUpdateMany.mockResolvedValue({ count: 1 });
  mockHistoryCreate.mockResolvedValue({});
  mockNotifyDrops.mockResolvedValue(undefined);
  mockPropagate.mockResolvedValue([]);
  mockCycleFindMany.mockResolvedValue([]);
  setPrecedence(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ------------------------------------------------------------------------------------------------------------------
// markdownCron (sale Day-2/Day-3)
// ------------------------------------------------------------------------------------------------------------------
describe('markdownCron under each precedence', () => {
  const day2Sale = { id: 'sale_1', organizerId: 'org_1', startDate: new Date(Date.now() - 1.5 * DAY), markdownFloor: null };
  const day3Sale = { ...day2Sale, startDate: new Date(Date.now() - 2.5 * DAY) };

  // The exact 2026-10-30 item query and conditional write, written out literally.
  const legacyItemWhere = (tier: number) => ({
    saleId: 'sale_1',
    status: 'AVAILABLE',
    deletedAt: null,
    listingType: { not: 'AUCTION' },
    markdownTierApplied: { lt: tier },
    price: { gt: 0 },
    excludeFromMarkdown: false,
    OR: CYCLE_GUARD,
  });
  const legacyLock = (id: string, tier: number, price: number) => ({
    id,
    status: 'AVAILABLE',
    deletedAt: null,
    excludeFromMarkdown: false,
    markdownTierApplied: { lt: tier },
    OR: CYCLE_GUARD,
    price,
  });

  it.each([
    ['no stored choice', null, 'PRO'],
    ['stored FIRST_WINS', 'FIRST_WINS', 'PRO'],
    ['SIMPLE organizer with a stale CYCLES_WIN row', 'CYCLES_WIN', 'SIMPLE'],
    ['SIMPLE organizer with a stale SALE_TIERS_WIN row', 'SALE_TIERS_WIN', 'SIMPLE'],
  ])('default (%s) reproduces the 2026-10-30 query and write exactly', async (_label, stored, tier) => {
    setPrecedence(stored, tier);
    mockSaleFindMany.mockResolvedValue([day2Sale]);
    mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 20, priceBeforeMarkdown: null, markdownStepIndexApplied: null }]);
    await run(scheduleMarkdownCron);
    expect(mockItemFindMany.mock.calls[0][0].where).toEqual(legacyItemWhere(1));
    expect(mockItemUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockItemUpdateMany.mock.calls[0][0]).toEqual({
      where: legacyLock('item_1', 1, 20),
      data: {
        price: 9.99,
        priceBeforeMarkdown: 20,
        markdownTierApplied: 1,
        markdownApplied: true,
        markdownPhysicallyAppliedAt: null,
      },
    });
    expect(mockCycleFindMany).not.toHaveBeenCalled();
  });

  it('default never selects a cycle-cut item and the stamp-only path is unchanged', async () => {
    mockSaleFindMany.mockResolvedValue([day2Sale]);
    mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 0.99, priceBeforeMarkdown: null, markdownStepIndexApplied: null }]);
    await run(scheduleMarkdownCron);
    expect(mockItemUpdateMany.mock.calls[0][0]).toStrictEqual({
      where: { id: 'item_1', status: 'AVAILABLE', deletedAt: null, excludeFromMarkdown: false, markdownTierApplied: { lt: 1 }, OR: CYCLE_GUARD },
      data: { markdownTierApplied: 1 },
    });
  });

  it('a read error on the precedence table falls back to the default filters', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockPrecedenceFindMany.mockRejectedValue(new Error('boom'));
    mockSaleFindMany.mockResolvedValue([day2Sale]);
    mockItemFindMany.mockResolvedValue([]);
    await run(scheduleMarkdownCron);
    expect(mockItemFindMany.mock.calls[0][0].where).toEqual(legacyItemWhere(1));
  });

  describe('SALE_TIERS_WIN', () => {
    beforeEach(() => setPrecedence('SALE_TIERS_WIN'));

    it('selects cycle-cut items too (no cycle guard), still AVAILABLE / not excluded / not AUCTION', async () => {
      mockSaleFindMany.mockResolvedValue([day3Sale]);
      mockItemFindMany.mockResolvedValue([]);
      await run(scheduleMarkdownCron);
      const where = mockItemFindMany.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
      expect(where).toMatchObject({ status: 'AVAILABLE', deletedAt: null, excludeFromMarkdown: false, listingType: { not: 'AUCTION' } });
    });

    it('takes over a cycle-cut item off the ORIGINAL anchor (not stacked on the cycle cut) and clears the step pointer', async () => {
      mockSaleFindMany.mockResolvedValue([day3Sale]);
      // A cycle took $20 -> $15.99 (20% off) and recorded the $20 anchor.
      mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 15.99, priceBeforeMarkdown: 20, markdownStepIndexApplied: 2 }]);
      await run(scheduleMarkdownCron);
      expect(mockItemUpdateMany).toHaveBeenCalledTimes(1);
      const { where, data } = mockItemUpdateMany.mock.calls[0][0];
      expect(data.price).toBe(4.99); // 75% off $20 -> $5.00 -> keystone 4.99 (stacked would be 15.99 * 0.25 -> 3.99)
      expect('priceBeforeMarkdown' in data).toBe(false); // anchor kept
      expect(data.markdownTierApplied).toBe(2);
      expect(data.markdownStepIndexApplied).toBeNull();
      expect(where).toMatchObject({ id: 'item_1', markdownStepIndexApplied: 2, price: 15.99, status: 'AVAILABLE', excludeFromMarkdown: false });
      expect(mockHistoryCreate).toHaveBeenCalledTimes(1);
      expect(mockNotifyDrops).toHaveBeenCalledWith('item_1', 15.99, 4.99);
    });

    it('never raises a price: a cycle cut deeper than the tier is only stamped (and owned) by the tier', async () => {
      mockSaleFindMany.mockResolvedValue([day2Sale]);
      mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 7.99, priceBeforeMarkdown: 20, markdownStepIndexApplied: 3 }]);
      await run(scheduleMarkdownCron);
      const { where, data } = mockItemUpdateMany.mock.calls[0][0];
      expect(data).toEqual({ markdownTierApplied: 1, markdownStepIndexApplied: null });
      expect(where.markdownStepIndexApplied).toBe(3);
      expect(mockHistoryCreate).not.toHaveBeenCalled();
    });

    it('an item no cycle touched is written exactly like the default plus the null step pin', async () => {
      mockSaleFindMany.mockResolvedValue([day2Sale]);
      mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 20, priceBeforeMarkdown: null, markdownStepIndexApplied: null }]);
      await run(scheduleMarkdownCron);
      const { where, data } = mockItemUpdateMany.mock.calls[0][0];
      expect(data).toEqual({ price: 9.99, priceBeforeMarkdown: 20, markdownTierApplied: 1, markdownApplied: true, markdownPhysicallyAppliedAt: null });
      expect(where.markdownStepIndexApplied).toBeNull();
    });

    it('a manual organizer price (anchor cleared) is the price the tier discounts from', async () => {
      mockSaleFindMany.mockResolvedValue([day2Sale]);
      mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 30, priceBeforeMarkdown: null, markdownStepIndexApplied: 1 }]);
      await run(scheduleMarkdownCron);
      expect(mockItemUpdateMany.mock.calls[0][0].data.price).toBe(14.99);
      expect(mockItemUpdateMany.mock.calls[0][0].data.priceBeforeMarkdown).toBe(30);
    });
  });

  describe('CYCLES_WIN', () => {
    beforeEach(() => setPrecedence('CYCLES_WIN'));

    it('skips a sale that has its own running sale-scoped cycle', async () => {
      mockCycleFindMany.mockResolvedValue([{ organizerId: 'org_1', saleId: 'sale_1' }]);
      mockSaleFindMany.mockResolvedValue([day2Sale]);
      await run(scheduleMarkdownCron);
      expect(mockCycleFindMany.mock.calls[0][0].where).toEqual({ isActive: true, organizerId: { in: ['org_1'] }, steps: { some: {} } });
      expect(mockItemFindMany).not.toHaveBeenCalled();
      expect(mockItemUpdateMany).not.toHaveBeenCalled();
    });

    it('excludes the organizer-wide cycle scope in the query AND the conditional write', async () => {
      mockCycleFindMany.mockResolvedValue([{ organizerId: 'org_1', saleId: null }]);
      mockSaleFindMany.mockResolvedValue([day2Sale]);
      mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 20, priceBeforeMarkdown: null, markdownStepIndexApplied: null }]);
      await run(scheduleMarkdownCron);
      const scope = [{ OR: [{ organizerId: null }, { organizerId: { not: 'org_1' } }] }];
      expect(mockItemFindMany.mock.calls[0][0].where).toEqual({ ...legacyItemWhere(1), AND: scope });
      expect(mockItemUpdateMany.mock.calls[0][0].where).toEqual({ ...legacyLock('item_1', 1, 20), AND: scope });
    });

    it('with no running cycle in scope it behaves exactly like the default', async () => {
      mockCycleFindMany.mockResolvedValue([{ organizerId: 'org_1', saleId: 'another_sale' }]);
      mockSaleFindMany.mockResolvedValue([day2Sale]);
      mockItemFindMany.mockResolvedValue([{ id: 'item_1', price: 20, priceBeforeMarkdown: null, markdownStepIndexApplied: null }]);
      await run(scheduleMarkdownCron);
      expect(mockItemFindMany.mock.calls[0][0].where).toEqual(legacyItemWhere(1));
      expect(mockItemUpdateMany.mock.calls[0][0].where).toEqual(legacyLock('item_1', 1, 20));
    });

    it('a cycle read error falls back to the default for that run', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockCycleFindMany.mockRejectedValue(new Error('boom'));
      mockSaleFindMany.mockResolvedValue([day2Sale]);
      mockItemFindMany.mockResolvedValue([]);
      await run(scheduleMarkdownCron);
      expect(mockItemFindMany.mock.calls[0][0].where).toEqual(legacyItemWhere(1));
    });
  });
});

// ------------------------------------------------------------------------------------------------------------------
// markdownCycleCron (PRO/TEAMS cycles)
// ------------------------------------------------------------------------------------------------------------------
describe('markdownCycleCron under each precedence', () => {
  const cycle = {
    id: 'cyc_1', organizerId: 'org_1', saleId: 'sale_1', sale: { id: 'sale_1', organizerId: 'org_1', saleType: 'ESTATE', moveOutDate: null },
    steps: [{ stepOrder: 1, dayThreshold: 10, pctOff: 10 }, { stepOrder: 2, dayThreshold: 20, pctOff: 20 }, { stepOrder: 3, dayThreshold: 30, pctOff: 30 }],
  };
  const item = (over: Record<string, unknown> = {}) => ({
    id: 'item_1', price: 17.99, createdAt: new Date(Date.now() - 25 * DAY), priceBeforeMarkdown: 20, markdownStepIndexApplied: 1,
    markdownTierApplied: 0, ebayOfferId: null, ebayListingId: null, discogsListingId: null, reverbListingId: null, ebaySyncAttempts: 0, ...over,
  });
  const legacyItemWhere = {
    status: 'AVAILABLE',
    price: { gt: 0 },
    excludeFromMarkdown: false,
    deletedAt: null,
    markdownTierApplied: 0,
    saleId: 'sale_1',
    OR: [{ markdownStepIndexApplied: null }, { markdownStepIndexApplied: { lt: 3 } }],
  };

  beforeEach(() => {
    mockCycleFindMany.mockResolvedValue([cycle]);
  });

  it.each([['no stored choice', null], ['FIRST_WINS', 'FIRST_WINS'], ['SALE_TIERS_WIN', 'SALE_TIERS_WIN']])(
    '%s reproduces the 2026-10-30 query and write exactly',
    async (_label, stored) => {
      setPrecedence(stored);
      mockItemFindMany.mockResolvedValue([item()]);
      await run(scheduleMarkdownCycleCron);
      expect(mockItemFindMany.mock.calls[0][0].where).toEqual(legacyItemWhere);
      expect(mockItemUpdateMany).toHaveBeenCalledTimes(1);
      const { where, data } = mockItemUpdateMany.mock.calls[0][0];
      expect(where).toEqual({ id: 'item_1', status: 'AVAILABLE', excludeFromMarkdown: false, markdownTierApplied: 0, markdownStepIndexApplied: 1, price: 17.99 });
      expect(data).toEqual({
        priceBeforeMarkdown: 20,
        price: 15.99,
        markdownApplied: true,
        markdownStepIndexApplied: 2,
        markdownPhysicallyAppliedAt: null,
        priceUpdatedAt: expect.any(Date),
      });
    }
  );

  it('the default no-op stamp keeps its exact where', async () => {
    mockItemFindMany.mockResolvedValue([item({ price: 15.99 })]);
    await run(scheduleMarkdownCycleCron);
    expect(mockItemUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: 'item_1', markdownTierApplied: 0, markdownStepIndexApplied: 1 },
      data: { markdownStepIndexApplied: 2 },
    });
  });

  describe('CYCLES_WIN', () => {
    beforeEach(() => setPrecedence('CYCLES_WIN'));

    it('selects items the Day-2/Day-3 cron tiered (no markdownTierApplied filter)', async () => {
      mockItemFindMany.mockResolvedValue([]);
      await run(scheduleMarkdownCycleCron);
      const where = mockItemFindMany.mock.calls[0][0].where;
      expect('markdownTierApplied' in where).toBe(false);
      expect(where).toMatchObject({ status: 'AVAILABLE', excludeFromMarkdown: false, deletedAt: null, saleId: 'sale_1' });
    });

    it('claims a tiered item: deeper step price off the anchor, tier pointer reset, write pinned to the tier read', async () => {
      // Day-2 took $20 -> $9.99 (tier 1). The 25-day-old item is due this cycle's step 2 (60% off), deeper than the tier.
      const deepCycle = { ...cycle, steps: [{ stepOrder: 1, dayThreshold: 10, pctOff: 30 }, { stepOrder: 2, dayThreshold: 20, pctOff: 60 }] };
      mockCycleFindMany.mockResolvedValue([deepCycle]);
      mockItemFindMany.mockResolvedValue([item({ price: 9.99, markdownTierApplied: 1, markdownStepIndexApplied: null })]);
      await run(scheduleMarkdownCycleCron);
      const { where, data } = mockItemUpdateMany.mock.calls[0][0];
      expect(where).toEqual({ id: 'item_1', status: 'AVAILABLE', excludeFromMarkdown: false, markdownTierApplied: 1, markdownStepIndexApplied: null, price: 9.99 });
      expect(data.price).toBe(7.99); // 60% off $20 = $8.00 -> keystone 7.99, never 60% off the $9.99 tier price
      expect(data.priceBeforeMarkdown).toBe(20);
      expect(data.markdownTierApplied).toBe(0);
      expect(data.markdownStepIndexApplied).toBe(2);
      expect(mockHistoryCreate).toHaveBeenCalledTimes(1);
    });

    it('a claim never raises the price: the step pointer is stamped and ownership moves, no price write', async () => {
      mockItemFindMany.mockResolvedValue([item({ price: 4.99, markdownTierApplied: 2, markdownStepIndexApplied: null })]);
      await run(scheduleMarkdownCycleCron);
      expect(mockItemUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockItemUpdateMany.mock.calls[0][0]).toEqual({
        where: { id: 'item_1', markdownTierApplied: 2, markdownStepIndexApplied: null },
        data: { markdownStepIndexApplied: 2, markdownTierApplied: 0 },
      });
      expect(mockHistoryCreate).not.toHaveBeenCalled();
      expect(mockNotifyDrops).not.toHaveBeenCalled();
      expect(mockPropagate).not.toHaveBeenCalled();
    });

    it('never re-cuts an applied step: an item already at the due step is skipped', async () => {
      mockItemFindMany.mockResolvedValue([item({ price: 9.99, markdownTierApplied: 1, markdownStepIndexApplied: 2 })]);
      await run(scheduleMarkdownCycleCron);
      expect(mockItemUpdateMany).not.toHaveBeenCalled();
    });

    it('does not skip a step: a 25-day-old item at step 1 goes to step 2, not step 3', async () => {
      mockItemFindMany.mockResolvedValue([item()]);
      await run(scheduleMarkdownCycleCron);
      const { where, data } = mockItemUpdateMany.mock.calls[0][0];
      expect(data.markdownStepIndexApplied).toBe(2);
      expect(where.markdownTierApplied).toBe(0); // untiered item: pinned to 0, as in the default
      expect('markdownTierApplied' in data).toBe(false); // not a claim, nothing to reset
    });

    it('a SIMPLE organizer row is ignored (cycles do not run for SIMPLE anyway; effective mode is the default)', async () => {
      setPrecedence('CYCLES_WIN', 'SIMPLE');
      mockItemFindMany.mockResolvedValue([item()]);
      await run(scheduleMarkdownCycleCron);
      expect(mockItemFindMany.mock.calls[0][0].where).toEqual(legacyItemWhere);
    });
  });
});
