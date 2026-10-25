/**
 * Inventory reconcile sweep. No network, no real database: syncItemStock is mocked and every dependency of the sweep is an
 * in-memory fake. Covers drift detection, repair + re-check, manual markets, notification dedupe, per-organizer isolation,
 * the dry run, the item cap with its rotating cursor, and the eBay rate limit stop.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: () => Promise<void>) => fn }));
jest.mock('../services/inventoryStockSync', () => ({ syncItemStock: jest.fn() }));

import * as Sentry from '@sentry/node';
import { syncItemStock } from '../services/inventoryStockSync';
import {
  runInventoryReconcile,
  buildReconcileMessage,
  resetReconcileCursors,
} from '../jobs/inventoryReconcileCron';
import type { ReconcileDeps } from '../jobs/inventoryReconcileCron';
import { realReconcileDeps } from '../jobs/inventoryReconcileCron';
import { prisma } from '../lib/prisma';

const syncMock = syncItemStock as unknown as jest.Mock;

type Outcome = { market: string; status: string; expected: number; live?: number | null; detail?: string };

// Live state of each item on each market, plus how the fake sync behaves.
interface World {
  inStock: Record<string, number>;
  live: Record<string, Record<string, number | null>>; // itemId -> market -> live qty
  manual: Record<string, string[]>; // itemId -> markets that cannot take a count
  failPush: Set<string>; // itemId whose repair push does nothing (drift persists)
  failedMarkets: Record<string, string>; // itemId -> market that always reports 'failed'
  failedDetail?: Record<string, string>; // itemId -> detail of that failure (default 'token expired')
  throwFor: Set<string>;
  checkCalls: string[];
  repairCalls: string[];
}

function installSyncFake(w: World) {
  syncMock.mockImplementation(async (itemId: string, _reason: string, opts?: { checkOnly?: boolean }) => {
    if (w.throwFor.has(itemId)) throw new Error('boom');
    const inStock = w.inStock[itemId] ?? 1;
    const outcomes: Outcome[] = [];
    if (opts?.checkOnly) {
      w.checkCalls.push(itemId);
      for (const [market, live] of Object.entries(w.live[itemId] || {})) {
        outcomes.push(live === inStock ? { market, status: 'unchanged', expected: inStock, live } : { market, status: 'drift', expected: inStock, live });
      }
    } else {
      w.repairCalls.push(itemId);
      for (const market of Object.keys(w.live[itemId] || {})) {
        if (!w.failPush.has(itemId)) w.live[itemId][market] = inStock;
        outcomes.push({ market, status: w.failPush.has(itemId) ? 'failed' : 'synced', expected: inStock, detail: w.failPush.has(itemId) ? 'eBay said no' : undefined });
      }
    }
    for (const market of w.manual[itemId] || []) outcomes.push({ market, status: 'manual', expected: inStock });
    if (w.failedMarkets[itemId]) outcomes.push({ market: w.failedMarkets[itemId], status: 'failed', expected: inStock, detail: w.failedDetail?.[itemId] ?? 'token expired' });
    return { itemId, inStock, outcomes };
  });
}

function newWorld(): World {
  return { inStock: {}, live: {}, manual: {}, failPush: new Set(), failedMarkets: {}, throwFor: new Set(), checkCalls: [], repairCalls: [] };
}

interface Fakes {
  deps: ReconcileDeps;
  alerts: Array<{ userId: string; title: string; body: string; link: string }>;
}

function makeDeps(
  candidatesByOrg: Record<string, Array<{ id: string; title: string }>>,
  over: Partial<ReconcileDeps> = {}
): Fakes {
  const alerts: Fakes['alerts'] = [];
  const alertTimes = new Map<string, Date>();
  const deps: ReconcileDeps = {
    listOrganizerIds: async () => Object.keys(candidatesByOrg),
    loadCandidates: async (org, afterId, take) =>
      (candidatesByOrg[org] || []).filter((c) => (afterId ? c.id > afterId : true)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, take),
    findStaleKits: async () => [],
    recomputeAllKits: async () => 0,
    findOrganizerUserId: async (org) => `user-${org}`,
    hasRecentAlert: async (userId, since) => {
      const at = alertTimes.get(userId);
      return !!at && at >= since;
    },
    createAlert: async (input) => {
      alerts.push(input);
      alertTimes.set(input.userId, new Date());
    },
    isEbayRateLimited: () => false,
    now: () => new Date(),
    ...over,
  };
  return { deps, alerts };
}

beforeEach(() => {
  syncMock.mockReset();
  (Sentry.captureMessage as jest.Mock).mockClear();
  resetReconcileCursors();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('runInventoryReconcile', () => {
  it('detects drift, repairs it with a normal sync, re-checks, and does not notify when everything is fixed', async () => {
    const w = newWorld();
    w.inStock['i1'] = 3;
    w.live['i1'] = { ebay: 5 };
    installSyncFake(w);
    const { deps, alerts } = makeDeps({ orgA: [{ id: 'i1', title: 'Tubes' }] });

    const r = await runInventoryReconcile({}, deps);

    expect(r.itemsChecked).toBe(1);
    expect(r.drift).toEqual([{ itemId: 'i1', title: 'Tubes', market: 'ebay', expected: 3, live: 5 }]);
    expect(r.repaired).toEqual([{ itemId: 'i1', title: 'Tubes', market: 'ebay', expected: 3, live: 3, fixed: true }]);
    expect(w.repairCalls).toEqual(['i1']);
    expect(w.checkCalls).toEqual(['i1', 'i1']); // check, then re-check
    expect(r.failed).toEqual([]);
    expect(alerts).toHaveLength(0);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('is idempotent: a second run over repaired data repairs nothing', async () => {
    const w = newWorld();
    w.inStock['i1'] = 2;
    w.live['i1'] = { etsy: 9 };
    installSyncFake(w);
    const { deps } = makeDeps({ orgA: [{ id: 'i1', title: 'Lamp' }] });
    await runInventoryReconcile({}, deps);
    w.repairCalls.length = 0;
    const second = await runInventoryReconcile({}, deps);
    expect(second.drift).toEqual([]);
    expect(second.repaired).toEqual([]);
    expect(w.repairCalls).toEqual([]);
  });

  it('reports drift that persists after the repair, records the failure, alerts Sentry and notifies once', async () => {
    const w = newWorld();
    w.inStock['i1'] = 4;
    w.live['i1'] = { ebay: 1 };
    w.failPush.add('i1');
    installSyncFake(w);
    const { deps, alerts } = makeDeps({ orgA: [{ id: 'i1', title: 'Radio' }] });

    const r = await runInventoryReconcile({}, deps);

    expect(r.repaired[0]).toMatchObject({ itemId: 'i1', market: 'ebay', expected: 4, live: 1, fixed: false });
    expect(r.failed).toEqual([{ itemId: 'i1', title: 'Radio', market: 'ebay', status: 'failed', detail: 'eBay said no' }]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].userId).toBe('user-orgA');
    expect(alerts[0].body).toContain('still shows a different stock count on eBay');
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('reports markets that cannot take a count (multi-unit only) and notifies with plain copy', async () => {
    const w = newWorld();
    w.inStock['multi'] = 6;
    w.inStock['single'] = 1;
    w.manual['multi'] = ['facebook', 'craigslist'];
    w.manual['single'] = ['facebook'];
    installSyncFake(w);
    const { deps, alerts } = makeDeps({ orgA: [{ id: 'multi', title: 'Box of mugs' }, { id: 'single', title: 'One vase' }] });

    const r = await runInventoryReconcile({}, deps);

    expect(r.manual).toEqual([{ itemId: 'multi', title: 'Box of mugs', markets: ['facebook', 'craigslist'] }]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toContain("These listings can't take a stock count automatically: Box of mugs (Facebook, Craigslist)");
    expect(alerts[0].body).not.toContain('One vase');
    expect(alerts[0].body).not.toMatch(/\u2014/); // no em dashes
  });

  it('dedupes the notification within 3 days across runs', async () => {
    const w = newWorld();
    w.inStock['multi'] = 3;
    w.manual['multi'] = ['facebook'];
    installSyncFake(w);
    const { deps, alerts } = makeDeps({ orgA: [{ id: 'multi', title: 'Boxes' }] });

    const first = await runInventoryReconcile({}, deps);
    const second = await runInventoryReconcile({}, deps);

    expect(first.notified).toBe(1);
    expect(second.notified).toBe(0);
    expect(alerts).toHaveLength(1);
  });

  it('notifies again once the 3 day window has passed', async () => {
    const w = newWorld();
    w.inStock['multi'] = 3;
    w.manual['multi'] = ['facebook'];
    installSyncFake(w);
    let clock = new Date();
    const { deps, alerts } = makeDeps({ orgA: [{ id: 'multi', title: 'Boxes' }] }, { now: () => clock });
    await runInventoryReconcile({}, deps);
    clock = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    await runInventoryReconcile({}, deps);
    expect(alerts).toHaveLength(2);
  });

  it('an error in one organizer does not block the others', async () => {
    const w = newWorld();
    w.inStock['b1'] = 2;
    w.live['b1'] = { ebay: 7 };
    installSyncFake(w);
    const base = makeDeps({ orgA: [{ id: 'a1', title: 'A' }], orgB: [{ id: 'b1', title: 'B' }] });
    const deps: ReconcileDeps = {
      ...base.deps,
      loadCandidates: async (org, afterId, take) => {
        if (org === 'orgA') throw new Error('db down for A');
        return base.deps.loadCandidates(org, afterId, take);
      },
    };

    const r = await runInventoryReconcile({}, deps);

    expect(r.organizersFailed).toBe(1);
    expect(r.organizersProcessed).toBe(1);
    expect(r.repaired).toHaveLength(1);
    expect(r.repaired[0].itemId).toBe('b1');
  });

  it('an error on one item does not stop the rest of the batch', async () => {
    const w = newWorld();
    w.inStock['i2'] = 2;
    w.live['i2'] = { ebay: 9 };
    w.throwFor.add('i1');
    installSyncFake(w);
    const { deps } = makeDeps({ orgA: [{ id: 'i1', title: 'Bad' }, { id: 'i2', title: 'Good' }] });
    const r = await runInventoryReconcile({}, deps);
    expect(r.failed.some((f) => f.itemId === 'i1' && f.detail === 'boom')).toBe(true);
    expect(r.repaired.some((x) => x.itemId === 'i2' && x.fixed)).toBe(true);
  });

  it('dryRun detects drift but never repairs or notifies', async () => {
    const w = newWorld();
    w.inStock['i1'] = 1;
    w.live['i1'] = { shopify: 4 };
    w.manual['i1'] = [];
    installSyncFake(w);
    const { deps, alerts } = makeDeps({ orgA: [{ id: 'i1', title: 'Chair' }] });
    const r = await runInventoryReconcile({ dryRun: true }, deps);
    expect(r.drift).toHaveLength(1);
    expect(r.repaired).toEqual([]);
    expect(w.repairCalls).toEqual([]);
    expect(alerts).toHaveLength(0);
  });

  it('organizerId limits the run to that organizer', async () => {
    const w = newWorld();
    installSyncFake(w);
    const { deps } = makeDeps({ orgA: [{ id: 'a1', title: 'A' }], orgB: [{ id: 'b1', title: 'B' }] });
    await runInventoryReconcile({ organizerId: 'orgB' }, deps);
    expect(w.checkCalls).toEqual(['b1']);
  });

  it('records failed markets reported by the check pass', async () => {
    const w = newWorld();
    w.inStock['i1'] = 2;
    w.failedMarkets['i1'] = 'etsy';
    installSyncFake(w);
    const { deps, alerts } = makeDeps({ orgA: [{ id: 'i1', title: 'Vase' }] });
    const r = await runInventoryReconcile({}, deps);
    expect(r.failed).toEqual([{ itemId: 'i1', title: 'Vase', market: 'etsy', status: 'failed', detail: 'token expired' }]);
    expect(alerts).toHaveLength(1);
  });

  it('treats a transient eBay 5xx read as skipped until it repeats on 3 consecutive checks (FINDASALE-NODEJS-96)', async () => {
    const w = newWorld();
    w.inStock['i1'] = 1;
    w.failedMarkets['i1'] = 'ebay';
    w.failedDetail = { i1: 'eBay did not return the inventory item (HTTP 500) {"errors":[{"errorId":25001}]}' };
    installSyncFake(w);
    const { deps, alerts } = makeDeps({ orgA: [{ id: 'i1', title: 'Lock' }] });

    const r1 = await runInventoryReconcile({}, deps);
    expect(r1.failed).toEqual([]);
    expect(r1.skipped.map((x) => x.itemId)).toEqual(['i1']);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(0);

    const r2 = await runInventoryReconcile({}, deps);
    expect(r2.failed).toEqual([]);

    const r3 = await runInventoryReconcile({}, deps);
    expect(r3.failed.map((x) => x.itemId)).toEqual(['i1']);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(alerts).toHaveLength(1);
  });

  it('treats eBay 404 errorId 25710 on the inventory item read (offer still published) as transient too (FINDASALE-NODEJS-96)', async () => {
    const w = newWorld();
    w.inStock['i1'] = 1;
    w.failedMarkets['i1'] = 'ebay';
    w.failedDetail = { i1: 'eBay did not return the inventory item (HTTP 404) {"errors":[{"errorId":25710,"domain":"API_INVENTORY","message":"We didn\'t find the resource/entity you are requesting"}]}' };
    installSyncFake(w);
    const { deps, alerts } = makeDeps({ orgA: [{ id: 'i1', title: 'Flags' }] });

    const r1 = await runInventoryReconcile({}, deps);
    expect(r1.failed).toEqual([]);
    expect(r1.skipped.map((x) => x.itemId)).toEqual(['i1']);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(0);

    await runInventoryReconcile({}, deps);
    const r3 = await runInventoryReconcile({}, deps);
    expect(r3.failed.map((x) => x.itemId)).toEqual(['i1']);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('still reports any other eBay 4xx immediately (e.g. the offer read itself 404s)', async () => {
    const w = newWorld();
    w.inStock['i1'] = 1;
    w.failedMarkets['i1'] = 'ebay';
    w.failedDetail = { i1: 'eBay did not return the offer (HTTP 404) {"errors":[{"errorId":25713}]}' };
    installSyncFake(w);
    const { deps } = makeDeps({ orgA: [{ id: 'i1', title: 'Flags' }] });
    const r1 = await runInventoryReconcile({}, deps);
    expect(r1.failed.map((x) => x.itemId)).toEqual(['i1']);
  });

  it('respects the per-run item cap and continues from a rotating cursor on the next run', async () => {
    process.env.INVENTORY_RECONCILE_MAX_ITEMS = '2';
    try {
      const w = newWorld();
      installSyncFake(w);
      const items = ['i1', 'i2', 'i3', 'i4', 'i5'].map((id) => ({ id, title: id }));
      const { deps } = makeDeps({ orgA: items });
      const r1 = await runInventoryReconcile({}, deps);
      expect(r1.itemsChecked).toBe(2);
      expect(r1.stoppedEarly).toBe('item_cap');
      const r2 = await runInventoryReconcile({}, deps);
      expect(r2.itemsChecked).toBe(2);
      expect(w.checkCalls).toEqual(['i1', 'i2', 'i3', 'i4']);
      const r3 = await runInventoryReconcile({}, deps);
      expect(r3.itemsChecked).toBe(1); // i5, then the cursor resets
      const r4 = await runInventoryReconcile({}, deps);
      expect(w.checkCalls.slice(-2)).toEqual(['i1', 'i2']);
      expect(r4.itemsChecked).toBe(2);
    } finally {
      delete process.env.INVENTORY_RECONCILE_MAX_ITEMS;
    }
  });

  it('stops when the eBay daily limit is reached', async () => {
    const w = newWorld();
    installSyncFake(w);
    const { deps } = makeDeps({ orgA: [{ id: 'i1', title: 'A' }] }, { isEbayRateLimited: () => true });
    const r = await runInventoryReconcile({}, deps);
    expect(r.stoppedEarly).toBe('ebay_rate_limited');
    expect(w.checkCalls).toEqual([]);
  });

  it('kit sweep: recomputes stale kits first, then pushes each corrected kit', async () => {
    const w = newWorld();
    installSyncFake(w);
    const order: string[] = [];
    const { deps } = makeDeps({}, {
      findStaleKits: async () => [
        { kitId: 'kit1', title: 'Tubes for CBW', storedStockTotal: 14, expectedStockTotal: 17, storedAvail: 14, expectedAvail: 17 },
      ],
      recomputeAllKits: async () => {
        order.push('recompute');
        return 1;
      },
    });
    syncMock.mockImplementation(async (id: string) => {
      order.push(`push:${id}`);
      return { itemId: id, inStock: 17, outcomes: [] };
    });
    const r = await runInventoryReconcile({}, deps);
    expect(r.kitsStale).toBe(1);
    expect(r.kitsRecomputed).toBe(1);
    expect(r.kitsPushed).toBe(1);
    expect(order).toEqual(['recompute', 'push:kit1']);
  });

  it('kit sweep in dryRun reports stale kits without changing them', async () => {
    const w = newWorld();
    installSyncFake(w);
    const recompute = jest.fn(async () => 1);
    const { deps } = makeDeps({}, {
      findStaleKits: async () => [{ kitId: 'kit1', title: 'K', storedStockTotal: 1, expectedStockTotal: 2, storedAvail: 1, expectedAvail: 2 }],
      recomputeAllKits: recompute,
    });
    const r = await runInventoryReconcile({ dryRun: true }, deps);
    expect(r.kitsStale).toBe(1);
    expect(recompute).not.toHaveBeenCalled();
  });

  it('a failing kit sweep does not stop the organizer pass', async () => {
    const w = newWorld();
    w.inStock['i1'] = 2;
    w.live['i1'] = { ebay: 5 };
    installSyncFake(w);
    const { deps } = makeDeps({ orgA: [{ id: 'i1', title: 'A' }] }, {
      findStaleKits: async () => {
        throw new Error('sql down');
      },
    });
    const r = await runInventoryReconcile({}, deps);
    expect(r.repaired).toHaveLength(1);
  });

  it('never calls anything that writes a stock count (only syncItemStock is used)', async () => {
    const w = newWorld();
    w.inStock['i1'] = 2;
    w.live['i1'] = { ebay: 5 };
    installSyncFake(w);
    const { deps } = makeDeps({ orgA: [{ id: 'i1', title: 'A' }] });
    await runInventoryReconcile({}, deps);
    for (const call of syncMock.mock.calls) {
      expect(call[1]).toBe('reconcile');
      expect(Object.keys(call[2] || {}).every((k) => k === 'checkOnly')).toBe(true);
    }
  });
});

describe('buildReconcileMessage', () => {
  it('returns null when nothing needs attention', () => {
    expect(buildReconcileMessage({ repaired: [{ itemId: 'a', title: 'A', market: 'ebay', expected: 1, live: 1, fixed: true }], manual: [], failed: [] })).toBeNull();
  });
  it('mentions corrected counts alongside a remaining problem', () => {
    const m = buildReconcileMessage({
      repaired: [
        { itemId: 'a', title: 'A', market: 'ebay', expected: 1, live: 1, fixed: true },
        { itemId: 'b', title: 'B', market: 'etsy', expected: 2, live: 5, fixed: false },
      ],
      manual: [],
      failed: [],
    });
    expect(m?.body).toContain('Stock counts were corrected on eBay for 1 item.');
    expect(m?.body).toContain('1 item still shows');
  });
});


describe('kits in the reconcile sweep (2026-10-13, kits listable everywhere)', () => {
  it('runs the one-time legacy DONT_LIST cleanup first and reports how many kits it cleared', async () => {
    const fix = jest.fn().mockResolvedValue({ ran: true, fixed: 4 });
    const { deps } = makeDeps({}, { fixLegacyKitDontList: fix });
    const r = await runInventoryReconcile({}, deps);
    expect(fix).toHaveBeenCalledTimes(1);
    expect(r.kitsDontListCleared).toBe(4);
  });

  it('a later run (marker already claimed) reports nothing', async () => {
    const fix = jest.fn().mockResolvedValue({ ran: false, fixed: 0 });
    const { deps } = makeDeps({}, { fixLegacyKitDontList: fix });
    const r = await runInventoryReconcile({}, deps);
    expect(fix).toHaveBeenCalledTimes(1);
    expect(r.kitsDontListCleared).toBeUndefined();
  });

  it('a dry run never performs the cleanup', async () => {
    const fix = jest.fn().mockResolvedValue({ ran: true, fixed: 1 });
    const { deps } = makeDeps({}, { fixLegacyKitDontList: fix });
    await runInventoryReconcile({ dryRun: true }, deps);
    expect(fix).not.toHaveBeenCalled();
  });

  it('a failing cleanup never stops the sweep', async () => {
    const w = newWorld();
    w.inStock.a = 2;
    w.live.a = { ebay: 2 };
    installSyncFake(w);
    const { deps } = makeDeps({ org1: [{ id: 'a', title: 'A' }] }, { fixLegacyKitDontList: jest.fn().mockRejectedValue(new Error('db')) });
    const r = await runInventoryReconcile({}, deps);
    expect(w.checkCalls).toContain('a');
    expect(r.kitsDontListCleared).toBeUndefined();
  });

  it('the real candidate query no longer excludes kits (only consignor tags)', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'kit1', title: 'Kit' }]);
    (prisma as any).etsyListing = { findMany: jest.fn().mockResolvedValue([]) };
    (prisma as any).item = { findMany };
    const rows = await realReconcileDeps.loadCandidates('org1', null, 10);
    expect(rows).toEqual([{ id: 'kit1', title: 'Kit' }]);
    expect(findMany.mock.calls[0][0].where.listingType).toEqual({ notIn: ['CONSIGNOR_TAG'] });
  });
});
