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

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../../index', () => ({
  prisma: {
    markdownCycle: { findMany: (...a: any[]) => mockCycleFindMany(...a) },
    item: {
      findMany: (...a: any[]) => mockItemFindMany(...a),
      update: (...a: any[]) => mockItemUpdate(...a),
    },
    itemPriceHistory: { create: jest.fn().mockResolvedValue({}) },
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
