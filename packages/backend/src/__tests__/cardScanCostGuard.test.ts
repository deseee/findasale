/**
 * Card scan cost guard (ADR-138 batch B4): the guard half of acceptance AT-21.
 * The guard is tested with an in-memory store and fakes. A second block loads the shared instance with the platform
 * modules mocked, to prove the scan path never touches the shared token counters or the shared daily call counter.
 */
import fs from 'fs';
import path from 'path';
import * as tracker from '../lib/aiCostTracker';
import { closeReservation, createScanCostGuard, getScanCostGuard, DEFAULT_FRAME_COST_ESTIMATE_USD, SCAN_COST_SERVICE_TAG } from '../services/cardScan/recognition/scanCostGuard';
import type { ScanReservation } from '../services/cardScan/recognition/scanCostGuard';
import type { RecognitionOutcome } from '../services/cardScan/recognition/types';
import type { EnvLike } from '../services/cardScan/config';

jest.mock('../lib/aiCostTracker', () => ({
  isAICostCeilingExceeded: jest.fn(async () => false),
  isAIDailyCallCapAvailable: jest.fn(async () => true),
  recordApiUsage: jest.fn(async () => undefined),
  trackAITokens: jest.fn(async () => true),
  trackAICall: jest.fn(async () => undefined),
  trackVisionCall: jest.fn(async () => undefined),
  recordAnthropicUsage: jest.fn(async () => undefined),
  recordAnthropicUsageOrEstimate: jest.fn(async () => undefined),
}));
jest.mock('../lib/redis', () => {
  const data = new Map<string, string>();
  return {
    redis: {
      get: async (key: string) => (data.has(key) ? (data.get(key) as string) : null),
      setex: async (key: string, _ttl: number, value: string) => {
        data.set(key, value);
      },
    },
  };
});

const OCT = new Date('2026-10-12T10:00:00.000Z');
const DAY_KEY = 'cardscan:frames:2026-10-12';
const OCT_KEY = 'cardscan:cost:2026-10';

function makeStore() {
  const data = new Map<string, string>();
  const writes: Array<{ key: string; ttl: number; value: string }> = [];
  return {
    data,
    writes,
    get: async (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setex: async (key: string, ttl: number, value: string) => {
      data.set(key, value);
      writes.push({ key, ttl, value });
    },
  };
}

function makeGuard() {
  const store = makeStore();
  const state = { ceilingExceeded: false, dailyCapAvailable: true, env: {} as EnvLike, now: OCT };
  const usage: Array<{ service: string; costUsd: number; calls: number }> = [];
  const guard = createScanCostGuard({
    store,
    isSharedCostCeilingExceeded: async () => state.ceilingExceeded,
    isSharedDailyCallCapAvailable: async () => state.dailyCapAvailable,
    recordUsage: async (service, costUsd, calls) => {
      usage.push({ service, costUsd, calls });
    },
    env: () => state.env,
    now: () => state.now,
  });
  return { guard, store, state, usage };
}

async function reserveOk(guard: ReturnType<typeof makeGuard>['guard'], estimatedCostUsd?: number): Promise<ScanReservation> {
  const result = await guard.reserve(estimatedCostUsd === undefined ? undefined : { estimatedCostUsd });
  if (!result.ok) throw new Error(`expected a reservation, got ${result.reason}`);
  return result.reservation;
}

describe('defaults and keys', () => {
  it('uses the documented limits: 3000 frames a day and $15 a month, separate from the shared 5000 and $50', async () => {
    const { guard } = makeGuard();
    expect(await guard.usage()).toEqual({ framesToday: 0, dailyCap: 3000, dailyRemaining: 3000, spentThisMonthUsd: 0, monthlyCeilingUsd: 15 });
  });

  it('reads the environment on every call, not once', async () => {
    const { guard, state } = makeGuard();
    state.env = { CARD_SCAN_DAILY_CAP: '7', CARD_SCAN_MONTHLY_CEILING_USD: '3' };
    expect(await guard.usage()).toMatchObject({ dailyCap: 7, monthlyCeilingUsd: 3 });
    state.env = {};
    expect(await guard.usage()).toMatchObject({ dailyCap: 3000, monthlyCeilingUsd: 15 });
  });

  it('keeps its counters under its own cardscan prefix, never in the shared ai or curio pools', async () => {
    const { guard, store } = makeGuard();
    await reserveOk(guard);
    const keys = [...store.data.keys()];
    expect(keys.sort()).toEqual([DAY_KEY, OCT_KEY].sort());
    for (const key of keys) {
      expect(key.startsWith('cardscan:')).toBe(true);
      expect(key.startsWith('ai:')).toBe(false);
      expect(key.startsWith('curio:')).toBe(false);
    }
  });
});

describe('reserve, settle and refund', () => {
  it('reserve books one frame and the estimated cost', async () => {
    const { guard, store } = makeGuard();
    const reservation = await reserveOk(guard);
    expect(reservation.state).toBe('OPEN');
    expect(reservation.estimatedCostUsd).toBe(DEFAULT_FRAME_COST_ESTIMATE_USD);
    expect(store.data.get(DAY_KEY)).toBe('1');
    expect(store.data.get(OCT_KEY)).toBe('25');
    expect(await guard.usage()).toMatchObject({ framesToday: 1, dailyRemaining: 2999, spentThisMonthUsd: 0.0025 });
  });

  it('a caller supplied estimate is used, and a bad estimate falls back to the default', async () => {
    const { guard, store } = makeGuard();
    const a = await reserveOk(guard, 0.004);
    expect(a.units).toBe(40);
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const r = await reserveOk(guard, bad);
      expect(r.estimatedCostUsd).toBe(DEFAULT_FRAME_COST_ESTIMATE_USD);
    }
    expect(store.data.get(DAY_KEY)).toBe('4');
  });

  it('settle swaps the estimate for the real cost and writes one usage row under the scan service tag', async () => {
    const { guard, store, usage } = makeGuard();
    const reservation = await reserveOk(guard);
    expect(await guard.settle(reservation, 0.002)).toBe(true);
    expect(reservation.state).toBe('SETTLED');
    expect(store.data.get(OCT_KEY)).toBe('20');
    expect(store.data.get(DAY_KEY)).toBe('1');
    expect(usage).toEqual([{ service: SCAN_COST_SERVICE_TAG, costUsd: 0.002, calls: 1 }]);
    expect(SCAN_COST_SERVICE_TAG).toBe('anthropic:card_scan');
  });

  it('settle with a higher real cost raises the monthly total', async () => {
    const { guard, store } = makeGuard();
    const reservation = await reserveOk(guard);
    await guard.settle(reservation, 0.0055);
    expect(store.data.get(OCT_KEY)).toBe('55');
  });

  it('settling or refunding twice changes nothing and writes no second usage row', async () => {
    const { guard, store, usage } = makeGuard();
    const reservation = await reserveOk(guard);
    await guard.settle(reservation, 0.002);
    expect(await guard.settle(reservation, 0.05)).toBe(false);
    expect(await guard.refund(reservation)).toBe(false);
    expect(store.data.get(OCT_KEY)).toBe('20');
    expect(store.data.get(DAY_KEY)).toBe('1');
    expect(usage).toHaveLength(1);
  });

  it('refund gives the frame and the estimate back and writes no usage row', async () => {
    const { guard, store, usage } = makeGuard();
    const reservation = await reserveOk(guard);
    expect(await guard.refund(reservation)).toBe(true);
    expect(reservation.state).toBe('REFUNDED');
    expect(store.data.get(DAY_KEY)).toBe('0');
    expect(store.data.get(OCT_KEY)).toBe('0');
    expect(await guard.refund(reservation)).toBe(false);
    expect(await guard.settle(reservation, 0.002)).toBe(false);
    expect(store.data.get(DAY_KEY)).toBe('0');
    expect(usage).toHaveLength(0);
  });

  it('a usage row failure never blocks settling', async () => {
    const store = makeStore();
    const guard = createScanCostGuard({
      store,
      isSharedCostCeilingExceeded: async () => false,
      isSharedDailyCallCapAvailable: async () => true,
      recordUsage: async () => {
        throw new Error('database down');
      },
      now: () => OCT,
    });
    const reservation = await reserveOk(guard);
    await expect(guard.settle(reservation, 0.002)).resolves.toBe(true);
  });
});

describe('caps', () => {
  it('the daily cap denies the next frame, with a retry time, and a refund frees one slot', async () => {
    const { guard, state } = makeGuard();
    state.env = { CARD_SCAN_DAILY_CAP: '3' };
    const held: ScanReservation[] = [];
    for (let i = 0; i < 3; i += 1) held.push(await reserveOk(guard));
    const denied = await guard.reserve();
    expect(denied).toEqual({ ok: false, reason: 'DAILY_CAP', retryAfterSeconds: 14 * 60 * 60 });
    await guard.refund(held[0]);
    expect((await guard.reserve()).ok).toBe(true);
    expect((await guard.reserve()).ok).toBe(false);
  });

  it('a denied reservation books nothing', async () => {
    const { guard, state, store } = makeGuard();
    state.env = { CARD_SCAN_DAILY_CAP: '1' };
    await reserveOk(guard);
    const before = [...store.data.entries()].sort();
    await guard.reserve();
    await guard.reserve();
    expect([...store.data.entries()].sort()).toEqual(before);
  });

  it('the monthly ceiling is checked against the spend so far plus the new estimate', async () => {
    const { guard, state } = makeGuard();
    state.env = { CARD_SCAN_MONTHLY_CEILING_USD: '0.01' };
    await reserveOk(guard, 0.004);
    await reserveOk(guard, 0.004);
    const denied = await guard.reserve({ estimatedCostUsd: 0.004 });
    expect(denied).toEqual({ ok: false, reason: 'MONTHLY_CEILING' });
    expect(await guard.usage()).toMatchObject({ framesToday: 2, spentThisMonthUsd: 0.008 });
  });

  it('spending exactly to the ceiling is allowed and the next frame is not', async () => {
    const { guard, state } = makeGuard();
    state.env = { CARD_SCAN_MONTHLY_CEILING_USD: '0.008' };
    await reserveOk(guard, 0.004);
    await reserveOk(guard, 0.004);
    expect((await guard.reserve({ estimatedCostUsd: 0.0001 })).ok).toBe(false);
  });

  it('real costs above the estimate count against the ceiling', async () => {
    const { guard, state } = makeGuard();
    state.env = { CARD_SCAN_MONTHLY_CEILING_USD: '0.01' };
    const first = await reserveOk(guard, 0.004);
    await guard.settle(first, 0.009);
    const denied = await guard.reserve({ estimatedCostUsd: 0.004 });
    expect(denied).toMatchObject({ ok: false, reason: 'MONTHLY_CEILING' });
  });

  it('twenty simultaneous reservations against a cap of five grant exactly five', async () => {
    const { guard, state } = makeGuard();
    state.env = { CARD_SCAN_DAILY_CAP: '5' };
    const results = await Promise.all(Array.from({ length: 20 }, () => guard.reserve()));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.reason === 'DAILY_CAP')).toHaveLength(15);
  });

  it('a new day and a new month start from zero', async () => {
    const { guard, state } = makeGuard();
    state.env = { CARD_SCAN_DAILY_CAP: '1' };
    await reserveOk(guard);
    expect((await guard.reserve()).ok).toBe(false);
    state.now = new Date('2026-10-13T00:00:01.000Z');
    expect((await guard.reserve()).ok).toBe(true);
    state.now = new Date('2026-11-01T09:00:00.000Z');
    expect(await guard.usage()).toMatchObject({ framesToday: 0, spentThisMonthUsd: 0 });
  });

  it('settling after a month change adjusts the month the frame was booked in', async () => {
    const { guard, state, store } = makeGuard();
    const reservation = await reserveOk(guard);
    state.now = new Date('2026-11-01T00:00:05.000Z');
    await guard.settle(reservation, 0.004);
    expect(store.data.get(OCT_KEY)).toBe('40');
    expect(store.data.has('cardscan:cost:2026-11')).toBe(false);
  });

  it('keeps enforcing the caps from its own copy when the store fails', async () => {
    const guard = createScanCostGuard({
      store: {
        get: async () => {
          throw new Error('store down');
        },
        setex: async () => {
          throw new Error('store down');
        },
      },
      isSharedCostCeilingExceeded: async () => false,
      isSharedDailyCallCapAvailable: async () => true,
      recordUsage: async () => undefined,
      env: () => ({ CARD_SCAN_DAILY_CAP: '2' }),
      now: () => OCT,
    });
    expect((await guard.reserve()).ok).toBe(true);
    expect((await guard.reserve()).ok).toBe(true);
    expect((await guard.reserve()).ok).toBe(false);
  });
});

describe('shared platform switches are honored first', () => {
  it('denies, and books nothing, when the shared monthly ceiling is hit', async () => {
    const { guard, state, store } = makeGuard();
    state.ceilingExceeded = true;
    expect(await guard.reserve()).toEqual({ ok: false, reason: 'SHARED_CEILING' });
    expect(store.writes).toHaveLength(0);
  });

  it('denies, and books nothing, when the shared daily call cap is hit', async () => {
    const { guard, state, store } = makeGuard();
    state.dailyCapAvailable = false;
    expect(await guard.reserve()).toEqual({ ok: false, reason: 'SHARED_DAILY_CAP' });
    expect(store.writes).toHaveLength(0);
  });
});

describe('closeReservation (settle or refund from the recognizer outcome)', () => {
  const reading: RecognitionOutcome = { ok: true, observation: { providerId: 'haiku-card', game: 'MTG', cardName: 'Lightning Bolt' }, usage: { costUsd: 0.002 } };

  it('a reading settles with its real cost', async () => {
    const { guard, store, usage } = makeGuard();
    const reservation = await reserveOk(guard);
    expect(await closeReservation(guard, reservation, reading)).toBe('SETTLED');
    expect(store.data.get(OCT_KEY)).toBe('20');
    expect(usage).toHaveLength(1);
  });

  it('NO_CARD with usage settles (the money was spent) and keeps the frame count', async () => {
    const { guard, store, usage } = makeGuard();
    const reservation = await reserveOk(guard);
    const outcome: RecognitionOutcome = { ok: false, code: 'NO_CARD', chargeable: true, usage: { costUsd: 0.0018 } };
    expect(await closeReservation(guard, reservation, outcome)).toBe('SETTLED');
    expect(store.data.get(DAY_KEY)).toBe('1');
    expect(store.data.get(OCT_KEY)).toBe('18');
    expect(usage).toEqual([{ service: SCAN_COST_SERVICE_TAG, costUsd: 0.0018, calls: 1 }]);
  });

  it('a chargeable answer with no usage settles at the estimate', async () => {
    const { guard, store } = makeGuard();
    const reservation = await reserveOk(guard);
    expect(await closeReservation(guard, reservation, { ok: false, code: 'NO_CARD', chargeable: true })).toBe('SETTLED');
    expect(store.data.get(OCT_KEY)).toBe('25');
  });

  it('a provider failure with no usage is refunded: frame and estimate come back, no usage row', async () => {
    const { guard, store, usage } = makeGuard();
    for (const code of ['PROVIDER_ERROR', 'RATE_LIMIT', 'DISABLED', 'CAP_REACHED'] as const) {
      const reservation = await reserveOk(guard);
      expect(await closeReservation(guard, reservation, { ok: false, code, chargeable: false })).toBe('REFUNDED');
    }
    expect(store.data.get(DAY_KEY)).toBe('0');
    expect(store.data.get(OCT_KEY)).toBe('0');
    expect(usage).toHaveLength(0);
  });

  it('a failure that still reports spent tokens settles instead of refunding', async () => {
    const { guard, store } = makeGuard();
    const reservation = await reserveOk(guard);
    const outcome: RecognitionOutcome = { ok: false, code: 'PROVIDER_ERROR', chargeable: false, usage: { costUsd: 0.0021 } };
    expect(await closeReservation(guard, reservation, outcome)).toBe('SETTLED');
    expect(store.data.get(OCT_KEY)).toBe('21');
  });
});

describe('source rules', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'cardScan', 'recognition', 'scanCostGuard.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('never feeds the shared token counter, the shared daily call counter or the per model usage helper', () => {
    expect(code).not.toMatch(/trackAITokens|trackAICall|recordAnthropicUsage|trackVisionCall/);
  });

  it('loads the platform modules lazily, so importing it has no side effects', () => {
    expect(code).not.toMatch(/^import .*['"]\.\.\/\.\.\/\.\.\/lib\//m);
    expect(code).toMatch(/import\(['"]\.\.\/\.\.\/\.\.\/lib\/redis['"]\)/);
  });
});

describe('the shared instance (platform modules mocked)', () => {
  const mocked = tracker as unknown as Record<string, jest.Mock>;

  it('is one instance, checks the shared switches, and records spend only through the usage row writer', async () => {
    const guard = getScanCostGuard();
    expect(getScanCostGuard()).toBe(guard);

    const reservation = await reserveOk(guard);
    expect(mocked.isAICostCeilingExceeded).toHaveBeenCalled();
    expect(mocked.isAIDailyCallCapAvailable).toHaveBeenCalled();

    await closeReservation(guard, reservation, { ok: true, observation: { providerId: 'haiku-card', game: 'MTG' }, usage: { costUsd: 0.002 } });
    expect(mocked.recordApiUsage).toHaveBeenCalledTimes(1);
    expect(mocked.recordApiUsage).toHaveBeenCalledWith('anthropic:card_scan', 0.002, 1);

    const refused = await reserveOk(guard);
    await closeReservation(guard, refused, { ok: false, code: 'PROVIDER_ERROR', chargeable: false });
    expect(mocked.recordApiUsage).toHaveBeenCalledTimes(1);

    expect(mocked.trackAITokens).not.toHaveBeenCalled();
    expect(mocked.trackAICall).not.toHaveBeenCalled();
    expect(mocked.trackVisionCall).not.toHaveBeenCalled();
    expect(mocked.recordAnthropicUsage).not.toHaveBeenCalled();
    expect(mocked.recordAnthropicUsageOrEstimate).not.toHaveBeenCalled();
  });

  it('refuses a frame while the shared ceiling is hit', async () => {
    mocked.isAICostCeilingExceeded.mockResolvedValueOnce(true);
    expect(await getScanCostGuard().reserve()).toEqual({ ok: false, reason: 'SHARED_CEILING' });
  });
});
