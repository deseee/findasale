/**
 * Scan cost guard (ADR-138 section 5.2 item 3): a SEPARATE spend pool for recognized frames, modeled on
 * lib/curioCostTracker.ts, so one shop scanning thousands of cards cannot use up the shared $50 monthly ceiling or
 * the shared 5,000 call daily cap that every organizer's item tagging depends on.
 *
 *   - Daily cap: platform-wide recognized frames per day (CARD_SCAN_DAILY_CAP, default 3000).
 *   - Monthly ceiling: platform-wide scan spend in dollars (CARD_SCAN_MONTHLY_CEILING_USD, default 15).
 *   Both defaults come from getScanConfig, which reads the environment each time it is called.
 *
 * Flow for one frame (batch B5 does the sequencing):
 *   reserve()   before the provider call: checks the shared platform switches first (so an outage switch still
 *               works), then both caps, and books the frame plus an estimated cost.
 *   settle()    after paid work was done (including a NO_CARD answer): swaps the estimate for the real cost and
 *               writes the per feature usage row under the service tag below.
 *   refund()    when no paid work was done (the provider failed or never ran): gives the frame and the estimate back.
 *
 * What this module deliberately never does: it does not feed the shared token counter, it does not count toward the
 * shared daily call cap, and it does not use the per model usage helper that does both. Its Redis keys start with
 * "cardscan:" and never collide with the "ai:" or "curio:" pools. Only the usage row writer is borrowed, for the
 * per feature cost report.
 *
 * Concurrency: reads and writes inside one process are serialized, and a per process copy of each counter backs up
 * the store, so a store outage cannot grant unlimited scans. The store has no atomic increment, so two backend
 * processes could race by a frame or two; the caps are cost breakers, not billing (UNVERIFIED how many processes run).
 */
import { getScanConfig } from '../config';
import type { EnvLike } from '../config';
import type { RecognitionOutcome } from './types';

export const SCAN_COST_SERVICE_TAG = 'anthropic:card_scan';
/** About $0.0022 per Haiku frame (ADR section 5.1), rounded up. */
export const DEFAULT_FRAME_COST_ESTIMATE_USD = 0.0025;
/** Haiku frame plus one text detection call ($0.0015 for one text detection call, per Google's pricing page). */
export const DEFAULT_OCR_FRAME_COST_ESTIMATE_USD = 0.004;

/** Dollars are stored as whole units of $0.0001 so many small increments never drift. */
const UNITS_PER_USD = 10000;
const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;
const MONTH_TTL_SECONDS = 35 * 24 * 60 * 60;

export type ReserveDeniedReason = 'SHARED_CEILING' | 'SHARED_DAILY_CAP' | 'DAILY_CAP' | 'MONTHLY_CEILING';

export interface ScanReservation {
  readonly id: string;
  readonly dayKey: string;
  readonly monthKey: string;
  readonly estimatedCostUsd: number;
  readonly units: number;
  state: 'OPEN' | 'SETTLED' | 'REFUNDED';
}

export type ReserveResult =
  | { ok: true; reservation: ScanReservation }
  | { ok: false; reason: ReserveDeniedReason; retryAfterSeconds?: number };

export interface ScanCostUsage {
  framesToday: number;
  dailyCap: number;
  dailyRemaining: number;
  spentThisMonthUsd: number;
  monthlyCeilingUsd: number;
}

/** The surface of lib/redis that the guard needs. */
export interface ScanCostStore {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<void>;
}

export interface ScanCostGuardDeps {
  store: ScanCostStore;
  /** True when the platform wide AI spend ceiling is hit. Checked before every reservation. */
  isSharedCostCeilingExceeded(): Promise<boolean>;
  /** False when the platform wide daily call cap is hit. Checked before every reservation. */
  isSharedDailyCallCapAvailable(): Promise<boolean>;
  /** Writes the per feature usage row. A failure must never block scanning. */
  recordUsage(service: string, costUsd: number, calls: number): Promise<void>;
  /** Defaults to process.env, read on every call. */
  env?: () => EnvLike;
  now?: () => Date;
}

export interface ScanCostGuard {
  reserve(opts?: { estimatedCostUsd?: number }): Promise<ReserveResult>;
  /** Returns true when the reservation was open and is now settled. */
  settle(reservation: ScanReservation, actualCostUsd: number): Promise<boolean>;
  /** Returns true when the reservation was open and is now refunded. */
  refund(reservation: ScanReservation): Promise<boolean>;
  usage(): Promise<ScanCostUsage>;
}

function cleanUsd(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function secondsUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export function createScanCostGuard(deps: ScanCostGuardDeps): ScanCostGuard {
  const memory = new Map<string, number>();
  let tail: Promise<unknown> = Promise.resolve();
  let sequence = 0;

  const clock = (): Date => (deps.now ? deps.now() : new Date());
  const environment = (): EnvLike => (deps.env ? deps.env() : process.env);
  const dayKeyOf = (now: Date): string => `cardscan:frames:${now.toISOString().slice(0, 10)}`;
  const monthKeyOf = (now: Date): string => `cardscan:cost:${now.toISOString().slice(0, 7)}`;

  /** Runs one step at a time within this process, whatever happens to the step before it. */
  function exclusive<T>(step: () => Promise<T>): Promise<T> {
    const run = tail.then(step, step);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function readCount(key: string): Promise<number> {
    const local = memory.get(key) ?? 0;
    let stored = 0;
    try {
      const raw = await deps.store.get(key);
      if (raw !== null) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n > 0) stored = n;
      }
    } catch {
      // The per process copy below still bounds spend.
    }
    return Math.max(local, stored);
  }

  async function writeCount(key: string, value: number, ttlSeconds: number): Promise<void> {
    const safe = Math.max(0, Math.round(value));
    memory.set(key, safe);
    try {
      await deps.store.setex(key, ttlSeconds, String(safe));
    } catch {
      // The per process copy above already holds the value.
    }
  }

  return {
    async reserve(opts?: { estimatedCostUsd?: number }): Promise<ReserveResult> {
      if (await deps.isSharedCostCeilingExceeded()) return { ok: false, reason: 'SHARED_CEILING' };
      if (!(await deps.isSharedDailyCallCapAvailable())) return { ok: false, reason: 'SHARED_DAILY_CAP' };

      const cfg = getScanConfig(environment());
      const estimatedCostUsd = cleanUsd(opts?.estimatedCostUsd, DEFAULT_FRAME_COST_ESTIMATE_USD);
      const units = Math.round(estimatedCostUsd * UNITS_PER_USD);

      return exclusive<ReserveResult>(async () => {
        const now = clock();
        const dayKey = dayKeyOf(now);
        const monthKey = monthKeyOf(now);

        const frames = await readCount(dayKey);
        if (frames >= cfg.dailyCap) return { ok: false, reason: 'DAILY_CAP', retryAfterSeconds: secondsUntilNextUtcDay(now) };

        const spentUnits = await readCount(monthKey);
        if (spentUnits + units > Math.round(cfg.monthlyCeilingUsd * UNITS_PER_USD)) return { ok: false, reason: 'MONTHLY_CEILING' };

        await writeCount(dayKey, frames + 1, DAY_TTL_SECONDS);
        await writeCount(monthKey, spentUnits + units, MONTH_TTL_SECONDS);
        sequence += 1;
        return {
          ok: true,
          reservation: { id: `${dayKey}#${sequence}`, dayKey, monthKey, estimatedCostUsd, units, state: 'OPEN' },
        };
      });
    },

    async settle(reservation: ScanReservation, actualCostUsd: number): Promise<boolean> {
      const costUsd = cleanUsd(actualCostUsd, 0);
      const changed = await exclusive<boolean>(async () => {
        if (reservation.state !== 'OPEN') return false;
        reservation.state = 'SETTLED';
        const delta = Math.round(costUsd * UNITS_PER_USD) - reservation.units;
        if (delta !== 0) {
          const spentUnits = await readCount(reservation.monthKey);
          await writeCount(reservation.monthKey, spentUnits + delta, MONTH_TTL_SECONDS);
        }
        return true;
      });
      if (changed) {
        try {
          await deps.recordUsage(SCAN_COST_SERVICE_TAG, costUsd, 1);
        } catch {
          // A usage report failure never blocks scanning.
        }
      }
      return changed;
    },

    async refund(reservation: ScanReservation): Promise<boolean> {
      return exclusive<boolean>(async () => {
        if (reservation.state !== 'OPEN') return false;
        reservation.state = 'REFUNDED';
        const frames = await readCount(reservation.dayKey);
        await writeCount(reservation.dayKey, frames - 1, DAY_TTL_SECONDS);
        const spentUnits = await readCount(reservation.monthKey);
        await writeCount(reservation.monthKey, spentUnits - reservation.units, MONTH_TTL_SECONDS);
        return true;
      });
    },

    async usage(): Promise<ScanCostUsage> {
      const cfg = getScanConfig(environment());
      const now = clock();
      const frames = await readCount(dayKeyOf(now));
      const spentUnits = await readCount(monthKeyOf(now));
      return {
        framesToday: frames,
        dailyCap: cfg.dailyCap,
        dailyRemaining: Math.max(0, cfg.dailyCap - frames),
        spentThisMonthUsd: spentUnits / UNITS_PER_USD,
        monthlyCeilingUsd: cfg.monthlyCeilingUsd,
      };
    },
  };
}

/**
 * Closes a reservation from what the recognizer returned (ADR-138 acceptance AT-21, guard half):
 *   - a reading, or any failure that reports real usage: settle with that real cost (the money was spent);
 *   - a chargeable failure with no usage: paid work was done and the cost is unknown, so settle with the estimate;
 *   - any other failure (provider error, rate limit, disabled, cap): nothing was spent, so refund.
 * The organizer's Smart tag follows a different rule that batch B5 owns: keep it when outcome.ok or outcome.chargeable,
 * refund it otherwise.
 */
export async function closeReservation(guard: ScanCostGuard, reservation: ScanReservation, outcome: RecognitionOutcome): Promise<'SETTLED' | 'REFUNDED'> {
  if (outcome.ok) {
    await guard.settle(reservation, outcome.usage.costUsd);
    return 'SETTLED';
  }
  if (outcome.usage) {
    await guard.settle(reservation, outcome.usage.costUsd);
    return 'SETTLED';
  }
  if (outcome.chargeable) {
    await guard.settle(reservation, reservation.estimatedCostUsd);
    return 'SETTLED';
  }
  await guard.refund(reservation);
  return 'REFUNDED';
}

// ---------------------------------------------------------------------------------------------
// The shared instance used by the controller (batch B5). The platform modules are loaded on first use, so
// importing this file has no side effects and the pure guard above can be tested without them.
// ---------------------------------------------------------------------------------------------

let sharedGuard: ScanCostGuard | null = null;

export function getScanCostGuard(): ScanCostGuard {
  if (!sharedGuard) {
    const loadRedis = async () => (await import('../../../lib/redis')).redis;
    const loadTracker = () => import('../../../lib/aiCostTracker');
    sharedGuard = createScanCostGuard({
      store: {
        get: async (key: string) => (await loadRedis()).get(key),
        setex: async (key: string, ttlSeconds: number, value: string) => (await loadRedis()).setex(key, ttlSeconds, value),
      },
      isSharedCostCeilingExceeded: async () => (await loadTracker()).isAICostCeilingExceeded(),
      isSharedDailyCallCapAvailable: async () => (await loadTracker()).isAIDailyCallCapAvailable(),
      recordUsage: async (service: string, costUsd: number, calls: number) => (await loadTracker()).recordApiUsage(service, costUsd, calls),
    });
  }
  return sharedGuard;
}
