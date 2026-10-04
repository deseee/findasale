/**
 * ADR-135 batch E-B4 addendum (a): the stale-draft sweep. runEtsyDraftWorker takes no claim of its own,
 * so the sweep is the claim point. Tests prove the conditional claim, that two concurrent sweeps never
 * run the worker twice for a row, the per-run cap, the kill switches and that nothing throws.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('../../../lib/prisma', () => ({ prisma: {} }));

import { ETSY_DRAFT_IDLE_MS } from '../etsyConnector';
import { ETSY_DRAFT_SWEEP_MAX_PER_RUN, sweepStaleEtsyDrafts } from '../etsyDraftSweep';
import { makeEtsySyncFakeDb, seedSyncListing } from './etsySyncFakeDb';

const ENV_ON = { ETSY_CONNECTOR_ENABLED: 'true', ETSY_PUSH_ENABLED: 'true' };
const NOW = new Date('2026-10-03T12:00:00.000Z');
const OLD = new Date(NOW.getTime() - ETSY_DRAFT_IDLE_MS - 60_000);
const FRESH = new Date(NOW.getTime() - ETSY_DRAFT_IDLE_MS + 60_000);

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

function setup(rows: Array<Record<string, any>>) {
  const db = makeEtsySyncFakeDb({ clock: () => NOW });
  for (const r of rows) seedSyncListing(db, { state: 'DRAFT_PENDING', etsyListingId: null, ...r });
  return db;
}

describe('sweepStaleEtsyDrafts', () => {
  it('claims an idle DRAFT_PENDING row with a conditional update and runs the worker once', async () => {
    const db = setup([{ id: 'L1', itemId: 'i1', updatedAt: OLD }]);
    const runWorker = jest.fn(async () => 'ready' as const);
    const r = await sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW, runWorker });
    expect(runWorker).toHaveBeenCalledTimes(1);
    expect(runWorker).toHaveBeenCalledWith('L1');
    expect(r).toMatchObject({ skipped: false, considered: 1, claimed: 1, lostClaim: 0, ran: 1, errors: 0 });
    expect(r.outcomes.ready).toBe(1);
    // The claim is conditional on id, state AND the updatedAt value that was read.
    expect(db.writes.listingUpdates[0].where).toEqual({ id: 'L1', state: 'DRAFT_PENDING', updatedAt: OLD });
    // Harmless data change, and updatedAt moved to now.
    expect(db.writes.listingUpdates[0].data).toEqual({ lastErrorMessage: null, updatedAt: NOW });
    expect(db.store.listings[0].updatedAt).toEqual(NOW);
    expect(db.store.listings[0].state).toBe('DRAFT_PENDING');
  });

  it('leaves fresh rows, other states and rows that are not DRAFT_PENDING alone', async () => {
    const db = setup([
      { id: 'fresh', itemId: 'i1', updatedAt: FRESH },
      { id: 'ready', itemId: 'i2', updatedAt: OLD, state: 'DRAFT_READY' },
      { id: 'active', itemId: 'i3', updatedAt: OLD, state: 'ACTIVE' },
    ]);
    const runWorker = jest.fn(async () => 'ready' as const);
    const r = await sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW, runWorker });
    expect(r.considered).toBe(0);
    expect(runWorker).not.toHaveBeenCalled();
    expect(db.writes.listingUpdates).toHaveLength(0);
  });

  it('two concurrent sweeps never run the worker twice for the same row', async () => {
    const db = setup([
      { id: 'L1', itemId: 'i1', updatedAt: OLD },
      { id: 'L2', itemId: 'i2', updatedAt: new Date(OLD.getTime() + 1000) },
    ]);
    const ran: string[] = [];
    const runWorker = jest.fn(async (id: string) => {
      ran.push(id);
      await new Promise((resolve) => setImmediate(resolve));
      return 'ready' as const;
    });
    const [a, b] = await Promise.all([
      sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW, runWorker }),
      sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW, runWorker }),
    ]);
    expect([...ran].sort()).toEqual(['L1', 'L2']);
    expect(a.claimed + b.claimed).toBe(2);
    expect(a.lostClaim + b.lostClaim).toBe(2);
    expect(a.ran + b.ran).toBe(2);
  });

  it('five concurrent sweeps still run each row exactly once', async () => {
    const db = setup([{ id: 'L1', itemId: 'i1', updatedAt: OLD }]);
    const runWorker = jest.fn(async () => 'ready' as const);
    await Promise.all(Array.from({ length: 5 }, () => sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW, runWorker })));
    expect(runWorker).toHaveBeenCalledTimes(1);
  });

  it('a later sweep within the idle window does not run a row the first sweep already claimed', async () => {
    const db = setup([{ id: 'L1', itemId: 'i1', updatedAt: OLD }]);
    const runWorker = jest.fn(async () => 'failed' as const);
    await sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW, runWorker });
    const later = new Date(NOW.getTime() + 60_000);
    const again = await sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => later, runWorker });
    expect(again.considered).toBe(0);
    expect(runWorker).toHaveBeenCalledTimes(1);
  });

  it('counts a lost claim (count 0) and does not run the worker for it', async () => {
    const db = setup([{ id: 'L1', itemId: 'i1', updatedAt: OLD }]);
    // Another sweeper moves updatedAt between our read and our claim.
    const realFindMany = db.etsyListing.findMany;
    db.etsyListing.findMany = async (args: any) => {
      const rows = await realFindMany(args);
      db.store.listings[0].updatedAt = new Date(OLD.getTime() + 5);
      return rows;
    };
    const runWorker = jest.fn(async () => 'ready' as const);
    const r = await sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW, runWorker });
    expect(r).toMatchObject({ considered: 1, claimed: 0, lostClaim: 1, ran: 0 });
    expect(runWorker).not.toHaveBeenCalled();
  });

  it('caps the rows per run, oldest first', async () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ id: `L${i}`, itemId: `i${i}`, updatedAt: new Date(OLD.getTime() + i * 1000) }));
    const db = setup(rows);
    const ran: string[] = [];
    const runWorker = jest.fn(async (id: string) => {
      ran.push(id);
      return 'ready' as const;
    });
    const r = await sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW, runWorker });
    expect(ETSY_DRAFT_SWEEP_MAX_PER_RUN).toBe(5);
    expect(ran).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
    expect(r.claimed).toBe(5);
    const smaller = await sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW, runWorker, maxPerRun: 2 });
    expect(smaller.considered).toBe(2);
    const bigger = await sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW, runWorker, maxPerRun: 500 });
    expect(bigger.considered).toBeLessThanOrEqual(5);
  });

  it('does nothing and touches nothing when either switch is off', async () => {
    const db = setup([{ id: 'L1', itemId: 'i1', updatedAt: OLD }]);
    const runWorker = jest.fn(async () => 'ready' as const);
    for (const env of [{}, { ETSY_CONNECTOR_ENABLED: 'true' }, { ETSY_PUSH_ENABLED: 'true' }, { ETSY_CONNECTOR_ENABLED: 'TRUE', ETSY_PUSH_ENABLED: 'true' }]) {
      const r = await sweepStaleEtsyDrafts({ db, env, now: () => NOW, runWorker });
      expect(r.skipped).toBe(true);
    }
    expect(runWorker).not.toHaveBeenCalled();
    expect(db.writes.listingUpdates).toHaveLength(0);
    expect(db.store.listings[0].updatedAt).toEqual(OLD);
  });

  it('never throws: a worker that throws, a claim that throws and a read that throws are all absorbed', async () => {
    const db = setup([
      { id: 'L1', itemId: 'i1', updatedAt: OLD },
      { id: 'L2', itemId: 'i2', updatedAt: new Date(OLD.getTime() + 1000) },
    ]);
    const runWorker = jest.fn(async (id: string) => {
      if (id === 'L1') throw new Error('worker blew up');
      return 'ready' as const;
    });
    const r = await sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW, runWorker });
    expect(r).toMatchObject({ claimed: 2, ran: 2, errors: 1 });
    expect(r.outcomes.ready).toBe(1);

    const db2 = setup([{ id: 'L1', itemId: 'i1', updatedAt: OLD }]);
    db2.etsyListing.updateMany = async () => {
      throw new Error('claim failed');
    };
    const r2 = await sweepStaleEtsyDrafts({ db: db2, env: ENV_ON, now: () => NOW, runWorker });
    expect(r2).toMatchObject({ claimed: 0, ran: 0, errors: 1 });

    const db3 = setup([]);
    db3.etsyListing.findMany = async () => {
      throw new Error('read failed');
    };
    const r3 = await sweepStaleEtsyDrafts({ db: db3, env: ENV_ON, now: () => NOW, runWorker });
    expect(r3.errors).toBe(1);
  });

  it('passes its deps to the real worker by default (skipped when the row is not DRAFT_PENDING)', async () => {
    // Without an injected runWorker the sweep calls runEtsyDraftWorker(id, deps). Here the worker re-reads
    // the row, finds it is no longer DRAFT_PENDING (DRAFT_READY), and answers 'skipped' without any Etsy call.
    const db = setup([{ id: 'L1', itemId: 'i1', updatedAt: OLD }]);
    db.etsyListing.findUnique = async () => ({ id: 'L1', state: 'DRAFT_READY' });
    const r = await sweepStaleEtsyDrafts({ db, env: ENV_ON, now: () => NOW });
    expect(r).toMatchObject({ claimed: 1, ran: 1, errors: 0 });
    expect(r.outcomes.skipped).toBe(1);
  });
});
