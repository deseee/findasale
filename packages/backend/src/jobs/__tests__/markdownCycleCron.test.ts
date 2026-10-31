/**
 * markdownCycleCron tier filter (2026-09-29, Patrick D1/D2). NOT EXECUTED when written (jest
 * cannot run on the authoring device); CI is the first real run.
 *
 * Markdown CYCLES are a paid feature: only cycles whose organizer is currently PRO/TEAMS run.
 * There is no grace clause (organizers keep paid features until the subscription runs out).
 */
const mockCycleFindMany = jest.fn();
const mockItemFindMany = jest.fn();
const mockItemUpdate = jest.fn();
const mockItemUpdateMany = jest.fn();
const mockHistoryCreate = jest.fn();

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../../index', () => ({
  prisma: {
    markdownCycle: { findMany: (...a: any[]) => mockCycleFindMany(...a) },
    item: {
      findMany: (...a: any[]) => mockItemFindMany(...a),
      update: (...a: any[]) => mockItemUpdate(...a),
      updateMany: (...a: any[]) => mockItemUpdateMany(...a),
    },
    itemPriceHistory: { create: (...a: any[]) => mockHistoryCreate(...a) },
  },
}));
jest.mock('../../services/priceDropService', () => ({ notifyPriceDropAlerts: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/markdownPricePropagationService', () => ({
  classifyPropagationFailure: jest.fn(),
  resolveSyncStateAfterFailure: jest.fn(),
  formatPropagationFailureReason: jest.fn(),
  propagateMarkdownPriceToMarketplaces: jest.fn().mockResolvedValue([]),
}));

import cron from 'node-cron';
import { scheduleMarkdownCycleCron } from '../markdownCycleCron';

async function runCron() {
  (cron.schedule as jest.Mock).mockClear();
  scheduleMarkdownCycleCron();
  const cb = (cron.schedule as jest.Mock).mock.calls[0][1];
  await cb();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockItemUpdate.mockResolvedValue({});
  mockItemUpdateMany.mockResolvedValue({ count: 1 });
  mockHistoryCreate.mockResolvedValue({});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('markdownCycleCron tier filter', () => {
  it('only loads active cycles whose organizer is PRO or TEAMS', async () => {
    mockCycleFindMany.mockResolvedValue([]);
    await runCron();
    expect(mockCycleFindMany).toHaveBeenCalledTimes(1);
    const where = mockCycleFindMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.organizer).toEqual({ subscriptionTier: { in: ['PRO', 'TEAMS'] } });
  });

  it('has no grace-period clause', async () => {
    mockCycleFindMany.mockResolvedValue([]);
    await runCron();
    const where = mockCycleFindMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toMatch(/grace/i);
  });

  it('touches no items when the tier filter leaves no cycles (a SIMPLE organizer keeps prices as they are)', async () => {
    mockCycleFindMany.mockResolvedValue([]);
    await runCron();
    expect(mockItemFindMany).not.toHaveBeenCalled();
    expect(mockItemUpdate).not.toHaveBeenCalled();
  });
});

describe('markdownCycleCron vs markdownCron (2026-10-30: one mechanism per item)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const cycle = {
    id: 'cyc_1', organizerId: 'org_1', saleId: 'sale_1', sale: { id: 'sale_1', organizerId: 'org_1', saleType: 'ESTATE', moveOutDate: null },
    steps: [{ stepOrder: 1, dayThreshold: 10, pctOff: 10 }, { stepOrder: 2, dayThreshold: 20, pctOff: 20 }],
  };
  const item = (over: Record<string, unknown> = {}) => ({
    id: 'item_1', price: 18.49, createdAt: new Date(Date.now() - 25 * DAY), priceBeforeMarkdown: 20, markdownStepIndexApplied: 1,
    ebayOfferId: null, ebayListingId: null, discogsListingId: null, reverbListingId: null, ebaySyncAttempts: 0, ...over,
  });

  it('never selects an item the free Day-2/Day-3 cron has tiered', async () => {
    mockCycleFindMany.mockResolvedValue([cycle]);
    mockItemFindMany.mockResolvedValue([]);
    await runCron();
    const where = mockItemFindMany.mock.calls[0][0].where;
    expect(where.markdownTierApplied).toBe(0);
    expect(where.excludeFromMarkdown).toBe(false);
  });

  it('a step is computed off the original price and written conditionally (untiered, same step, same price)', async () => {
    mockCycleFindMany.mockResolvedValue([cycle]);
    mockItemFindMany.mockResolvedValue([item()]);
    await runCron();
    expect(mockItemUpdateMany).toHaveBeenCalledTimes(1);
    const { where, data } = mockItemUpdateMany.mock.calls[0][0];
    expect(where).toMatchObject({ id: 'item_1', markdownTierApplied: 0, markdownStepIndexApplied: 1, price: 18.49, excludeFromMarkdown: false });
    expect(data.price).toBe(15.99); // 20 * 0.8 = 16.00 -> keystone 15.99
    expect(data.priceBeforeMarkdown).toBe(20);
    expect(data.markdownStepIndexApplied).toBe(2);
    expect(mockHistoryCreate).toHaveBeenCalledTimes(1);
    expect(mockHistoryCreate.mock.calls[0][0].data).toMatchObject({ itemId: 'item_1', price: 15.99, changedBy: 'markdown' });
  });

  it('a lost race (markdownCron got there first) records no history', async () => {
    mockCycleFindMany.mockResolvedValue([cycle]);
    mockItemFindMany.mockResolvedValue([item()]);
    mockItemUpdateMany.mockResolvedValue({ count: 0 });
    await runCron();
    expect(mockHistoryCreate).not.toHaveBeenCalled();
  });
});
