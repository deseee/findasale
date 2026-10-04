/**
 * ADR-135 batch E-B4 acceptance items 4 to 6: the sold-elsewhere sweep and quantity reconcile, the
 * receipts poll (cursor, interval math, live-listing filter, per-account isolation) and the cron wrapper.
 * Everything is injected: an in-memory fake db and fake functions for Etsy fetches, withdraws, inventory
 * updates, draft sweeps and budget reports. No Etsy call, no real database, no real schedule.
 */

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: jest.fn((_opts: any, fn: any) => fn) }));
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), addBreadcrumb: jest.fn() }));

import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { cronGuard } from '../utils/cronGuard';
import { EtsyError } from '../services/marketplace/etsyBudget';
import {
  ETSY_CURSOR_OVERLAP_MS,
  ETSY_POLL_MAX_PAGES,
  ETSY_RECONCILE_LIMIT,
  ETSY_SOLD_SYNC_SCHEDULE,
  ETSY_WITHDRAW_SWEEP_LIMIT,
  classifyLiveEtsyListing,
  computeEtsyPollIntervalMinutes,
  computeNextReceiptCursor,
  isEtsyPollDue,
  runEtsySoldSync,
  startEtsySoldSyncCron,
} from '../jobs/etsySoldSyncCron';
import { makeEtsySyncFakeDb, seedSyncConnection, seedSyncItem, seedSyncListing } from '../services/marketplace/__tests__/etsySyncFakeDb';

const ENV_ON = { ETSY_CONNECTOR_ENABLED: 'true' };
const NOW = new Date('2026-10-03T12:00:00.000Z');
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

describe('computeEtsyPollIntervalMinutes (acceptance 5: interval math)', () => {
  it.each([
    [0, 15],
    [1, 15],
    [10, 15],
    [20, 15],
    [21, 16],
    [30, 22],
    [100, 72],
    [500, 360],
  ])('%p accounts with live listings -> %p minutes', (accounts, minutes) => {
    expect(computeEtsyPollIntervalMinutes(accounts)).toBe(minutes);
  });

  it('is never under 15, whatever the input', () => {
    for (const n of [-5, 0, NaN, Infinity === Infinity ? 0 : 0, 3]) expect(computeEtsyPollIntervalMinutes(n)).toBeGreaterThanOrEqual(15);
  });

  it('relaxes to at least 60 minutes while a webhook is arriving, never below the load-based interval', () => {
    expect(computeEtsyPollIntervalMinutes(1, true)).toBe(60);
    expect(computeEtsyPollIntervalMinutes(30, true)).toBe(60);
    expect(computeEtsyPollIntervalMinutes(100, true)).toBe(72);
  });
});

describe('isEtsyPollDue', () => {
  it('is due with no earlier poll, and one minute early to absorb cron jitter', () => {
    expect(isEtsyPollDue(null, 15, NOW)).toBe(true);
    expect(isEtsyPollDue(undefined, 15, NOW)).toBe(true);
    expect(isEtsyPollDue(new Date(NOW.getTime() - 14 * MIN + 1000), 15, NOW)).toBe(false);
    expect(isEtsyPollDue(new Date(NOW.getTime() - 14 * MIN), 15, NOW)).toBe(true);
    expect(isEtsyPollDue(new Date(NOW.getTime() - 15 * MIN), 15, NOW)).toBe(true);
    expect(isEtsyPollDue(new Date(NOW.getTime() - 59 * MIN), 72, NOW)).toBe(false);
  });
});

describe('computeNextReceiptCursor (acceptance 5: newest updated_timestamp minus 5 minutes)', () => {
  it('moves to newest minus 5 minutes, never backwards, and holds when nothing was seen', () => {
    const newest = new Date('2026-10-03T11:30:00.000Z');
    expect(computeNextReceiptCursor(null, newest)).toEqual(new Date(newest.getTime() - ETSY_CURSOR_OVERLAP_MS));
    expect(ETSY_CURSOR_OVERLAP_MS).toBe(5 * MIN);
    const ahead = new Date('2026-10-03T11:29:00.000Z');
    expect(computeNextReceiptCursor(ahead, newest)).toEqual(ahead);
    const behind = new Date('2026-10-03T10:00:00.000Z');
    expect(computeNextReceiptCursor(behind, newest)).toEqual(new Date('2026-10-03T11:25:00.000Z'));
    expect(computeNextReceiptCursor(behind, null)).toBe(behind);
    expect(computeNextReceiptCursor(null, null)).toBeNull();
  });
});

describe('classifyLiveEtsyListing (acceptance 4: what the sweep selects)', () => {
  const live = { state: 'ACTIVE', syncedQuantity: 1 };
  it.each([
    ['missing item row', live, null, 'withdraw'],
    ['soft-deleted item', live, { status: 'AVAILABLE', deletedAt: new Date(), stockTotal: 1, stockSold: 0 }, 'withdraw'],
    ['SOLD item', live, { status: 'SOLD', stockTotal: 1, stockSold: 1, lastSoldVia: 'STRIPE' }, 'withdraw'],
    ['SOLD item with no tag', live, { status: 'SOLD', stockTotal: 1, stockSold: 1, lastSoldVia: null }, 'withdraw'],
    ['SOLD on Etsy itself', live, { status: 'SOLD', stockTotal: 1, stockSold: 1, lastSoldVia: 'ETSY' }, 'none'],
    ['no stock left but status lags', live, { status: 'AVAILABLE', stockTotal: 3, stockSold: 3 }, 'withdraw'],
    ['single-unit available item', live, { status: 'AVAILABLE', stockTotal: 1, stockSold: 0 }, 'none'],
    ['null stockTotal counts as 1', live, { status: 'AVAILABLE', stockTotal: null, stockSold: 0 }, 'none'],
    ['reserved single unit (temporary hold)', live, { status: 'RESERVED', stockTotal: 1, stockSold: 0 }, 'none'],
    ['units remain, Etsy count differs', { state: 'ACTIVE', syncedQuantity: 5 }, { status: 'AVAILABLE', stockTotal: 5, stockSold: 2 }, 'reconcile'],
    ['units remain, Etsy count matches', { state: 'ACTIVE', syncedQuantity: 3 }, { status: 'AVAILABLE', stockTotal: 5, stockSold: 2 }, 'none'],
    ['units remain, never synced', { state: 'ACTIVE', syncedQuantity: null }, { status: 'AVAILABLE', stockTotal: 5, stockSold: 2 }, 'none'],
    ['units remain on a draft', { state: 'DRAFT_READY', syncedQuantity: 5 }, { status: 'AVAILABLE', stockTotal: 5, stockSold: 2 }, 'none'],
  ])('%s -> %s', (_label, listing, item, expected) => {
    expect(classifyLiveEtsyListing(listing as any, item as any)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------------------------

function tickDeps(db: any, over: Record<string, any> = {}) {
  return {
    db,
    env: ENV_ON,
    now: () => NOW,
    fetchReceiptsPage: jest.fn(async () => ({ ok: true, transactions: [], receiptCount: 0, maxUpdatedAt: null, ascending: true })),
    processTransactions: jest.fn(async () => ({ recorded: 0, alreadyRecorded: 0, unmatched: 0, invalid: 0, failed: 0 })),
    withdraw: jest.fn(async () => 'withdrawn'),
    updateInventory: jest.fn(async () => ({ ok: true, outcome: 'updated' })),
    sweepDrafts: jest.fn(async () => ({ skipped: false, considered: 0, claimed: 0, lostClaim: 0, ran: 0, outcomes: { ready: 0, failed: 0, skipped: 0, cancelled: 0 }, errors: 0 })),
    reportBudget: jest.fn(async () => undefined),
    ...over,
  } as any;
}

function liveWorld() {
  const db = makeEtsySyncFakeDb({ clock: () => NOW });
  seedSyncConnection(db);
  seedSyncItem(db);
  seedSyncListing(db);
  return db;
}

describe('runEtsySoldSync: kill switch and wrapper (acceptance 6)', () => {
  it('returns early with zero work when ETSY_CONNECTOR_ENABLED is not exactly true', async () => {
    for (const env of [{}, { ETSY_CONNECTOR_ENABLED: 'false' }, { ETSY_CONNECTOR_ENABLED: 'TRUE' }, { ETSY_CONNECTOR_ENABLED: '1' }]) {
      const db = liveWorld();
      db.marketplaceAccount.findMany = jest.fn();
      const deps = tickDeps(db, { env });
      const r = await runEtsySoldSync(deps);
      expect(r.skipped).toBe(true);
      expect(db.marketplaceAccount.findMany).not.toHaveBeenCalled();
      expect(deps.fetchReceiptsPage).not.toHaveBeenCalled();
      expect(deps.withdraw).not.toHaveBeenCalled();
      expect(deps.sweepDrafts).not.toHaveBeenCalled();
      expect(deps.reportBudget).not.toHaveBeenCalled();
    }
  });

  it('registers the 15 minute schedule inside cronGuard({ jobName: etsySoldSyncCron }) and does not register at import', async () => {
    (cron.schedule as jest.Mock).mockClear();
    expect(cron.schedule).not.toHaveBeenCalled();
    const db = liveWorld();
    startEtsySoldSyncCron(tickDeps(db));
    expect(ETSY_SOLD_SYNC_SCHEDULE).toBe('13,28,43,58 * * * *');
    expect(cron.schedule).toHaveBeenCalledTimes(1);
    expect((cron.schedule as jest.Mock).mock.calls[0][0]).toBe('13,28,43,58 * * * *');
    expect((cronGuard as jest.Mock).mock.calls.some((c) => c[0]?.jobName === 'etsySoldSyncCron')).toBe(true);
  });

  it('the scheduled function runs a tick, and a second firing while one is still running is refused', async () => {
    (cron.schedule as jest.Mock).mockClear();
    const db = liveWorld();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = tickDeps(db, { sweepDrafts: jest.fn(async () => { await gate; return null; }) });
    startEtsySoldSyncCron(deps);
    const fn = (cron.schedule as jest.Mock).mock.calls[0][1] as () => Promise<void>;
    const first = fn();
    await new Promise((resolve) => setImmediate(resolve));
    await fn(); // refused while the first is blocked on the draft sweep
    expect(deps.sweepDrafts).toHaveBeenCalledTimes(1);
    release();
    await first;
    await fn(); // free again
    expect(deps.sweepDrafts).toHaveBeenCalledTimes(2);
  });
});

describe('runEtsySoldSync: poll (acceptance 5)', () => {
  it('polls an ACTIVE account with a live listing, from 14 days back on the first run, then advances the cursor to newest minus 5 minutes', async () => {
    const db = liveWorld();
    const newest = new Date(NOW.getTime() - 20 * MIN);
    const deps = tickDeps(db, {
      fetchReceiptsPage: jest.fn(async () => ({
        ok: true,
        transactions: [{ transactionId: '1', listingId: '9001', quantity: 1, receiptId: '2', paidAt: newest }],
        receiptCount: 1,
        maxUpdatedAt: newest,
        ascending: true,
      })),
    });
    const r = await runEtsySoldSync(deps);
    expect(r).toMatchObject({ skipped: false, accounts: 1, accountsWithLiveListings: 1, polled: 1, pollFailed: 0, receiptsPages: 1 });
    expect(deps.fetchReceiptsPage).toHaveBeenCalledWith({ organizerId: 'org_1', shopId: '555', minLastModified: new Date(NOW.getTime() - 14 * DAY), offset: 0, limit: 100 });
    expect(deps.processTransactions).toHaveBeenCalledWith({ shopId: '555', organizerId: 'org_1', transactions: expect.any(Array), source: 'POLL' });
    const settings = db.store.settings[0];
    expect(settings.receiptCursor).toEqual(new Date(newest.getTime() - 5 * MIN));
    expect(settings.lastReceiptPollAt).toEqual(NOW);

    // Next due poll starts from the cursor.
    settings.lastReceiptPollAt = new Date(NOW.getTime() - 20 * MIN);
    deps.fetchReceiptsPage.mockClear();
    await runEtsySoldSync(deps);
    expect((deps.fetchReceiptsPage.mock.calls[0] as any)[0].minLastModified).toEqual(new Date(newest.getTime() - 5 * MIN));
  });

  it('does not poll accounts without a live (ACTIVE) listing, and makes no receipts call for them', async () => {
    const db = makeEtsySyncFakeDb({ clock: () => NOW });
    seedSyncConnection(db);
    seedSyncItem(db);
    seedSyncListing(db, { state: 'DRAFT_READY' });
    const deps = tickDeps(db);
    const r = await runEtsySoldSync(deps);
    expect(r).toMatchObject({ accounts: 1, accountsWithLiveListings: 0, polled: 0 });
    expect(deps.fetchReceiptsPage).not.toHaveBeenCalled();
  });

  it('only polls accounts that are ACTIVE (a NEEDS_REAUTH account is not touched)', async () => {
    const db = liveWorld();
    seedSyncConnection(db, { organizerId: 'org_2', shopId: '777', account: { status: 'NEEDS_REAUTH' } });
    seedSyncItem(db, { id: 'item_2', organizerId: 'org_2', sale: { organizerId: 'org_2' } });
    seedSyncListing(db, { itemId: 'item_2', organizerId: 'org_2', shopId: '777', etsyListingId: '9002' });
    const deps = tickDeps(db);
    const r = await runEtsySoldSync(deps);
    expect(r.accounts).toBe(1);
    expect(deps.fetchReceiptsPage).toHaveBeenCalledTimes(1);
  });

  it('skips an account that is not due, and honors the webhook-relaxed 60 minute interval', async () => {
    const db = liveWorld();
    db.store.settings[0].lastReceiptPollAt = new Date(NOW.getTime() - 5 * MIN);
    let deps = tickDeps(db);
    let r = await runEtsySoldSync(deps);
    expect(r).toMatchObject({ polled: 0, pollNotDue: 1 });
    expect(deps.fetchReceiptsPage).not.toHaveBeenCalled();

    // 30 minutes since the last poll: due normally, but not while a webhook arrived in the last day.
    db.store.settings[0].lastReceiptPollAt = new Date(NOW.getTime() - 30 * MIN);
    db.store.settings[0].lastWebhookAt = new Date(NOW.getTime() - 2 * 60 * MIN);
    deps = tickDeps(db);
    r = await runEtsySoldSync(deps);
    expect(r.pollNotDue).toBe(1);
    // A stale webhook (over 24 hours old) no longer relaxes the interval.
    db.store.settings[0].lastWebhookAt = new Date(NOW.getTime() - 30 * 60 * MIN);
    deps = tickDeps(db);
    r = await runEtsySoldSync(deps);
    expect(r.polled).toBe(1);
  });

  it('pages while pages are full, up to the page cap, and sums the outcomes', async () => {
    const db = liveWorld();
    const full = (n: number) => ({ ok: true, transactions: [{ transactionId: String(n) }], receiptCount: 100, maxUpdatedAt: new Date(NOW.getTime() - (40 - n) * MIN), ascending: true });
    const fetchReceiptsPage = jest.fn(async (a: any) => (a.offset < 200 ? full(a.offset / 100) : { ok: true, transactions: [], receiptCount: 40, maxUpdatedAt: new Date(NOW.getTime() - 30 * MIN), ascending: true }));
    const processTransactions = jest.fn(async () => ({ recorded: 1, alreadyRecorded: 2, unmatched: 3, invalid: 0, failed: 0 }));
    const r = await runEtsySoldSync(tickDeps(db, { fetchReceiptsPage, processTransactions }));
    expect(fetchReceiptsPage.mock.calls.map((c: any) => c[0].offset)).toEqual([0, 100, 200]);
    expect(r).toMatchObject({ receiptsPages: 3, recorded: 2, alreadyRecorded: 4, unmatched: 6 });
    expect(ETSY_POLL_MAX_PAGES).toBe(3);
  });

  it('stops at the page cap on a full last page and still advances the cursor when the pages were ascending', async () => {
    const db = liveWorld();
    const newest = new Date(NOW.getTime() - 40 * MIN);
    const fetchReceiptsPage = jest.fn(async () => ({ ok: true, transactions: [], receiptCount: 100, maxUpdatedAt: newest, ascending: true }));
    const r = await runEtsySoldSync(tickDeps(db, { fetchReceiptsPage }));
    expect(fetchReceiptsPage).toHaveBeenCalledTimes(3);
    expect(r.polled).toBe(1);
    expect(db.store.settings[0].receiptCursor).toEqual(new Date(newest.getTime() - 5 * MIN));
  });

  it('does NOT advance the cursor past a truncated page that came back out of order', async () => {
    const db = liveWorld();
    const before = new Date(NOW.getTime() - 3 * DAY);
    db.store.settings[0].receiptCursor = before;
    const fetchReceiptsPage = jest.fn(async () => ({ ok: true, transactions: [], receiptCount: 100, maxUpdatedAt: new Date(NOW.getTime() - 10 * MIN), ascending: false }));
    (Sentry.captureMessage as jest.Mock).mockClear();
    await runEtsySoldSync(tickDeps(db, { fetchReceiptsPage }));
    expect(db.store.settings[0].receiptCursor).toEqual(before);
    expect(db.store.settings[0].lastReceiptPollAt).toEqual(NOW);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('out of order'), expect.objectContaining({ tags: expect.objectContaining({ integration: 'etsy', area: 'sync' }) }));
  });

  it('keeps the cursor and the due time when a sale failed to record, so it is seen again', async () => {
    const db = liveWorld();
    const before = new Date(NOW.getTime() - 3 * DAY);
    db.store.settings[0].receiptCursor = before;
    db.store.settings[0].lastReceiptPollAt = new Date(NOW.getTime() - 40 * MIN);
    const deps = tickDeps(db, {
      fetchReceiptsPage: jest.fn(async () => ({ ok: true, transactions: [{ transactionId: '1' }], receiptCount: 1, maxUpdatedAt: new Date(NOW.getTime() - 10 * MIN), ascending: true })),
      processTransactions: jest.fn(async () => ({ recorded: 0, alreadyRecorded: 0, unmatched: 0, invalid: 0, failed: 1 })),
    });
    const r = await runEtsySoldSync(deps);
    expect(r.pollFailed).toBe(1);
    expect(db.store.settings[0].receiptCursor).toEqual(before);
    expect(db.store.settings[0].lastReceiptPollAt).toEqual(new Date(NOW.getTime() - 40 * MIN));
  });

  it('an HTTP failure from Etsy counts as a failed poll and moves nothing', async () => {
    const db = liveWorld();
    const deps = tickDeps(db, { fetchReceiptsPage: jest.fn(async () => ({ ok: false, status: 403 })) });
    const r = await runEtsySoldSync(deps);
    expect(r).toMatchObject({ polled: 0, pollFailed: 1 });
    expect(db.store.settings[0].lastReceiptPollAt).toBeNull();
  });

  it('one failing account never blocks the others', async () => {
    const db = liveWorld();
    seedSyncConnection(db, { organizerId: 'org_2', shopId: '777' });
    seedSyncItem(db, { id: 'item_2', organizerId: 'org_2', sale: { organizerId: 'org_2' } });
    seedSyncListing(db, { itemId: 'item_2', organizerId: 'org_2', shopId: '777', etsyListingId: '9002' });
    const fetchReceiptsPage = jest.fn(async (a: any) => {
      if (a.organizerId === 'org_1') throw new EtsyError('ETSY_NEEDS_REAUTH', 'reconnect');
      return { ok: true, transactions: [], receiptCount: 0, maxUpdatedAt: null, ascending: true };
    });
    const r = await runEtsySoldSync(tickDeps(db, { fetchReceiptsPage }));
    expect(r).toMatchObject({ polled: 1, pollFailed: 1 });
    expect(fetchReceiptsPage).toHaveBeenCalledTimes(2);
    expect(db.store.settings.find((s: any) => s.organizerId === 'org_2').lastReceiptPollAt).toEqual(NOW);
  });

  it('a budget or block error stops polling for the rest of the tick but the sweeps and report still run', async () => {
    const db = liveWorld();
    seedSyncConnection(db, { organizerId: 'org_2', shopId: '777' });
    seedSyncItem(db, { id: 'item_2', organizerId: 'org_2', sale: { organizerId: 'org_2' } });
    seedSyncListing(db, { itemId: 'item_2', organizerId: 'org_2', shopId: '777', etsyListingId: '9002' });
    const fetchReceiptsPage = jest.fn(async () => {
      throw new EtsyError('ETSY_BLOCKED', 'daily quota');
    });
    const deps = tickDeps(db, { fetchReceiptsPage });
    const r = await runEtsySoldSync(deps);
    expect(fetchReceiptsPage).toHaveBeenCalledTimes(1);
    expect(r.pollFailed).toBe(1);
    expect(deps.sweepDrafts).toHaveBeenCalledTimes(1);
    expect(deps.reportBudget).toHaveBeenCalledTimes(1);
  });

  it('an account with no settings row or a bad shop id is skipped quietly', async () => {
    const db = liveWorld();
    db.store.settings[0].shopId = '../etc';
    const deps = tickDeps(db);
    const r = await runEtsySoldSync(deps);
    expect(r.polled).toBe(0);
    expect(deps.fetchReceiptsPage).not.toHaveBeenCalled();
  });
});

describe('runEtsySoldSync: sweep and quantity reconcile (acceptance 4)', () => {
  function sweepWorld() {
    const db = makeEtsySyncFakeDb({ clock: () => NOW });
    seedSyncConnection(db);
    // Order of updatedAt decides oldest first.
    let t = 0;
    const listing = (itemId: string, over: Record<string, any> = {}) =>
      seedSyncListing(db, { itemId, etsyListingId: `L-${itemId}`, updatedAt: new Date(NOW.getTime() - (1000 - t++) * MIN), ...over });
    return { db, listing };
  }

  it('withdraws listings whose item is SOLD, soft-deleted, missing or out of stock, and leaves the rest alone', async () => {
    const { db, listing } = sweepWorld();
    seedSyncItem(db, { id: 'sold', status: 'SOLD', stockTotal: 1, stockSold: 1, lastSoldVia: 'STRIPE' });
    seedSyncItem(db, { id: 'deleted', deletedAt: new Date('2026-10-02T00:00:00Z') });
    seedSyncItem(db, { id: 'empty', stockTotal: 2, stockSold: 2 });
    seedSyncItem(db, { id: 'fine' });
    seedSyncItem(db, { id: 'soldOnEtsy', status: 'SOLD', stockTotal: 1, stockSold: 1, lastSoldVia: 'ETSY' });
    for (const id of ['sold', 'deleted', 'empty', 'fine', 'soldOnEtsy', 'missing']) listing(id);
    const deps = tickDeps(db);
    const r = await runEtsySoldSync(deps);
    expect(deps.withdraw.mock.calls.map((c: any) => c[0]).sort()).toEqual(['deleted', 'empty', 'missing', 'sold']);
    expect(r.withdrawn).toBe(4);
    expect(deps.updateInventory).not.toHaveBeenCalled();
  });

  it('does not look at SOLD, ENDED, ORPHANED or id-less listings', async () => {
    const { db, listing } = sweepWorld();
    seedSyncItem(db, { id: 'a', status: 'SOLD', stockSold: 1 });
    seedSyncItem(db, { id: 'b', status: 'SOLD', stockSold: 1 });
    seedSyncItem(db, { id: 'c', status: 'SOLD', stockSold: 1 });
    seedSyncItem(db, { id: 'd', status: 'SOLD', stockSold: 1 });
    listing('a', { state: 'SOLD' });
    listing('b', { state: 'ENDED' });
    listing('c', { state: 'ORPHANED' });
    listing('d', { etsyListingId: null });
    const deps = tickDeps(db);
    await runEtsySoldSync(deps);
    expect(deps.withdraw).not.toHaveBeenCalled();
  });

  it('caps withdrawals per organizer per run, oldest first, and retries the failures on a later run', async () => {
    const { db, listing } = sweepWorld();
    for (let i = 0; i < 14; i++) {
      seedSyncItem(db, { id: `s${i}`, status: 'SOLD', stockTotal: 1, stockSold: 1, lastSoldVia: 'STRIPE' });
      listing(`s${i}`);
    }
    const order: string[] = [];
    const deps = tickDeps(db, {
      withdraw: jest.fn(async (id: string) => {
        order.push(id);
        return id === 's1' ? 'failed' : 'withdrawn';
      }),
    });
    const r1 = await runEtsySoldSync(deps);
    expect(ETSY_WITHDRAW_SWEEP_LIMIT).toBe(10);
    expect(order).toEqual(Array.from({ length: 10 }, (_, i) => `s${i}`));
    expect(r1).toMatchObject({ withdrawn: 9, withdrawFailed: 1 });

    // Failed rows stay live in the db (the real withdraw leaves state alone), so the next run tries again.
    order.length = 0;
    await runEtsySoldSync(deps);
    expect(order[0]).toBe('s0');
    expect(order).toContain('s1');
  });

  it('counts gone outcomes and absorbs a withdraw that throws', async () => {
    const { db, listing } = sweepWorld();
    for (const id of ['x', 'y']) {
      seedSyncItem(db, { id, status: 'SOLD', stockSold: 1, lastSoldVia: 'STRIPE' });
      listing(id);
    }
    const deps = tickDeps(db, {
      withdraw: jest.fn(async (id: string) => {
        if (id === 'x') return 'gone';
        throw new Error('boom');
      }),
    });
    const r = await runEtsySoldSync(deps);
    expect(r).toMatchObject({ withdrawnGone: 1, withdrawFailed: 1 });
  });

  it('multi-quantity: pushes the remaining count with updateEtsyListingInventory instead of withdrawing', async () => {
    const { db, listing } = sweepWorld();
    seedSyncItem(db, { id: 'multi', stockTotal: 5, stockSold: 2 });
    listing('multi', { syncedQuantity: 5 });
    const deps = tickDeps(db);
    const r = await runEtsySoldSync(deps);
    expect(deps.updateInventory).toHaveBeenCalledTimes(1);
    expect(deps.updateInventory).toHaveBeenCalledWith('multi');
    expect(deps.withdraw).not.toHaveBeenCalled();
    expect(r).toMatchObject({ reconcileAttempted: 1, reconciled: 1, reconcileFailed: 0 });
  });

  it('quantity 0 withdraws and never issues a zero-quantity update', async () => {
    const { db, listing } = sweepWorld();
    seedSyncItem(db, { id: 'zero', stockTotal: 5, stockSold: 5, status: 'AVAILABLE' });
    listing('zero', { syncedQuantity: 3 });
    const deps = tickDeps(db);
    await runEtsySoldSync(deps);
    expect(deps.withdraw).toHaveBeenCalledWith('zero');
    expect(deps.updateInventory).not.toHaveBeenCalled();
  });

  it('issues at most 20 inventory updates per run across all organizers', async () => {
    const { db, listing } = sweepWorld();
    seedSyncConnection(db, { organizerId: 'org_2', shopId: '777' });
    for (let i = 0; i < 15; i++) {
      seedSyncItem(db, { id: `m${i}`, stockTotal: 5, stockSold: 2 });
      listing(`m${i}`, { syncedQuantity: 5 });
      seedSyncItem(db, { id: `n${i}`, organizerId: 'org_2', sale: { organizerId: 'org_2' }, stockTotal: 5, stockSold: 2 });
      seedSyncListing(db, { itemId: `n${i}`, organizerId: 'org_2', shopId: '777', etsyListingId: `N-${i}`, syncedQuantity: 5 });
    }
    const deps = tickDeps(db);
    const r = await runEtsySoldSync(deps);
    expect(ETSY_RECONCILE_LIMIT).toBe(20);
    expect(deps.updateInventory).toHaveBeenCalledTimes(20);
    expect(r.reconcileAttempted).toBe(20);
  });

  it('counts failed and thrown inventory updates and keeps going', async () => {
    const { db, listing } = sweepWorld();
    for (const id of ['p', 'q', 'r']) {
      seedSyncItem(db, { id, stockTotal: 5, stockSold: 2 });
      listing(id, { syncedQuantity: 5 });
    }
    const deps = tickDeps(db, {
      updateInventory: jest.fn(async (id: string) => {
        if (id === 'p') return { ok: false, outcome: 'failed' };
        if (id === 'q') throw new Error('boom');
        return { ok: true, outcome: 'updated' };
      }),
    });
    const r = await runEtsySoldSync(deps);
    expect(r).toMatchObject({ reconcileAttempted: 3, reconciled: 1, reconcileFailed: 2 });
  });

  it('one organizer whose sweep throws does not block the next', async () => {
    const { db, listing } = sweepWorld();
    seedSyncConnection(db, { organizerId: 'org_2', shopId: '777' });
    seedSyncItem(db, { id: 'good', status: 'SOLD', stockSold: 1, lastSoldVia: 'STRIPE' });
    seedSyncListing(db, { itemId: 'good', organizerId: 'org_2', shopId: '777', etsyListingId: 'G' });
    seedSyncItem(db, { id: 'bad' });
    listing('bad');
    const realFindMany = db.etsyListing.findMany;
    db.etsyListing.findMany = async (args: any) => {
      if (args.where?.organizerId === 'org_1') throw new Error('db blip');
      return realFindMany(args);
    };
    const deps = tickDeps(db);
    const r = await runEtsySoldSync(deps);
    expect(deps.withdraw).toHaveBeenCalledWith('good');
    expect(r.withdrawn).toBe(1);
  });
});

describe('runEtsySoldSync: draft sweep and budget report ride the tick', () => {
  it('calls the draft sweep and the budget report on every tick and stores the sweep result', async () => {
    const db = liveWorld();
    const deps = tickDeps(db);
    const r = await runEtsySoldSync(deps);
    expect(deps.sweepDrafts).toHaveBeenCalledTimes(1);
    expect(deps.reportBudget).toHaveBeenCalledTimes(1);
    expect(r.drafts).toMatchObject({ skipped: false, claimed: 0 });
  });

  it('uses the real draft sweep by default (a stale DRAFT_PENDING row is claimed and its worker started)', async () => {
    const db = liveWorld();
    seedSyncListing(db, { id: 'draft', itemId: 'item_draft', etsyListingId: null, state: 'DRAFT_PENDING', updatedAt: new Date(NOW.getTime() - 10 * MIN) });
    const deps = tickDeps(db, { sweepDrafts: undefined, env: { ETSY_CONNECTOR_ENABLED: 'true', ETSY_PUSH_ENABLED: 'true' } });
    // The default worker re-reads the row; give it a state that makes it answer 'skipped' without an Etsy call.
    db.etsyListing.findUnique = async () => ({ id: 'draft', state: 'DRAFT_READY' });
    const r = await runEtsySoldSync(deps);
    expect(r.drafts).toMatchObject({ claimed: 1, ran: 1 });
  });

  it('a draft sweep or budget report that throws never fails the tick', async () => {
    const db = liveWorld();
    const deps = tickDeps(db, {
      sweepDrafts: jest.fn(async () => {
        throw new Error('sweep boom');
      }),
      reportBudget: jest.fn(async () => {
        throw new Error('report boom');
      }),
    });
    const r = await runEtsySoldSync(deps);
    expect(r.skipped).toBe(false);
    expect(r.drafts).toBeNull();
  });

  it('an account lookup failure still lets the draft sweep run', async () => {
    const db = liveWorld();
    db.marketplaceAccount.findMany = async () => {
      throw new Error('db down');
    };
    const deps = tickDeps(db);
    const r = await runEtsySoldSync(deps);
    expect(r.accounts).toBe(0);
    expect(deps.sweepDrafts).toHaveBeenCalledTimes(1);
  });
});
