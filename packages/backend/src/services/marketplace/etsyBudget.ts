/**
 * etsyBudget.ts -- shared Etsy API budget (ADR-135 D5.3, D5.6). Batch B1.
 *
 * Etsy enforces rate limits per application key, not per seller, so every replica of the backend
 * and every priority class draws from ONE budget. The ledger lives in Postgres (EtsyApiCall rows
 * plus the single EtsyApiState row) because lib/redis.ts has no atomic increment and silently falls
 * back to in-memory when Redis is absent.
 *
 * Reservation (reserveEtsyCall) runs inside ONE prisma.$transaction that first takes
 * pg_advisory_xact_lock(ETSY_BUDGET_LOCK_KEY), so concurrent replicas serialize on the decision and
 * the EtsyApiCall insert. The decision itself is the pure function computeEtsyBudgetDecision.
 *
 * Decision rules:
 *   - blockedUntil in the future rejects everything (ETSY_BLOCKED, with retryAt).
 *   - limit = min(ETSY_DAILY_BUDGET (default 5000), observed x-limit-per-day when present).
 *   - used = EtsyApiCall rows in the last 24 hours.
 *   - effectiveUsed = max(used, limit - remainingToday) ONLY when x-remaining-today was observed
 *     within the last 10 minutes (folds in calls we cannot see, such as the pricing adapter's).
 *   - priority caps of the limit: URGENT 98%, INTERACTIVE 90%, BACKGROUND 60%.
 *
 * Import safety: no env reads or network at module load. The Prisma client is loaded lazily, and
 * every function takes an optional deps argument so tests inject fakes.
 *
 * Sentry: tags { integration: 'etsy', area, step }. Never pass tokens, codes, state values, the API
 * key or secret, receipt bodies or buyer data; scrubEtsySecrets is applied to every string anyway.
 */

import * as Sentry from '@sentry/node';

export type EtsyPriority = 'URGENT' | 'INTERACTIVE' | 'BACKGROUND';
export const ETSY_PRIORITIES: readonly EtsyPriority[] = ['URGENT', 'INTERACTIVE', 'BACKGROUND'];

/** Share of the daily limit each priority class may consume before it is rejected. */
export const ETSY_PRIORITY_CAPS: Record<EtsyPriority, number> = {
  URGENT: 0.98,
  INTERACTIVE: 0.9,
  BACKGROUND: 0.6,
};

/** Must match the literal in the pg_advisory_xact_lock statement inside reserveEtsyCall (tested). */
export const ETSY_BUDGET_LOCK_KEY = 7350001;
export const ETSY_STATE_ID = 'global';
/** The 5,000 QPD figure comes from the developer portal screenshot (T2 confirms the real value). */
export const ETSY_DEFAULT_DAILY_BUDGET = 5000;
export const ETSY_DEFAULT_LIMIT_PER_SECOND = 5;
export const ETSY_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;
/** x-remaining-today only counts when it was observed this recently. */
export const ETSY_REMAINING_FRESH_MS = 10 * 60 * 1000;
/** A QPD block never lasts longer than this. */
export const ETSY_BLOCK_CAP_MS = 24 * 60 * 60 * 1000;
/** EtsyApiCall rows older than this are pruned by the housekeeping cron. */
export const ETSY_CALL_RETENTION_MS = 48 * 60 * 60 * 1000;
/** Budget alert thresholds (share of limit) and the minimum gap between alerts. */
export const ETSY_ALERT_WARNING_RATIO = 0.8;
export const ETSY_ALERT_ERROR_RATIO = 0.95;
export const ETSY_ALERT_MIN_GAP_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

export type EtsyErrorCode =
  | 'ETSY_DISABLED'
  | 'ETSY_NOT_CONFIGURED'
  | 'ETSY_NOT_ALLOWED'
  | 'ETSY_BAD_REQUEST'
  | 'ETSY_BUDGET'
  | 'ETSY_BLOCKED'
  | 'ETSY_BUSY'
  | 'ETSY_NETWORK'
  | 'ETSY_NEEDS_REAUTH'
  | 'ETSY_NOT_CONNECTED'
  | 'ETSY_REFRESH_BUSY'
  | 'ETSY_REFRESH_FAILED'
  | 'ETSY_STATE_INVALID'
  | 'ETSY_TOKEN_EXCHANGE_FAILED'
  | 'ETSY_NO_SHOP'
  | 'ETSY_SHOP_IN_USE'
  | 'ETSY_UPSTREAM';

export class EtsyError extends Error {
  code: EtsyErrorCode;
  retryAt?: Date;
  status?: number;
  constructor(code: EtsyErrorCode, message: string, opts: { retryAt?: Date; status?: number } = {}) {
    super(message);
    this.name = 'EtsyError';
    this.code = code;
    this.retryAt = opts.retryAt;
    this.status = opts.status;
  }
}

// ---------------------------------------------------------------------------------------------
// Env helpers (all read at call time)
// ---------------------------------------------------------------------------------------------

export type EtsyEnv = Record<string, string | undefined>;

export function readEtsyDailyBudget(env: EtsyEnv): number {
  const n = parseInt(String(env.ETSY_DAILY_BUDGET ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : ETSY_DEFAULT_DAILY_BUDGET;
}

// ---------------------------------------------------------------------------------------------
// Secret scrubbing and Sentry helper
// ---------------------------------------------------------------------------------------------

/** Redact anything that looks like an Etsy token, a bearer header, or a configured secret. */
export function scrubEtsySecrets(text: string, env: EtsyEnv = process.env): string {
  let out = String(text ?? '');
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]');
  out = out.replace(/\b\d{3,}\.[A-Za-z0-9_-]{16,}/g, '[redacted-token]');
  for (const name of ['ETSY_API_KEY', 'ETSY_SHARED_SECRET', 'ETSY_WEBHOOK_SECRET']) {
    const v = env[name];
    if (v && v.length >= 6) out = out.split(v).join('[redacted]');
  }
  return out;
}

export interface EtsyEventContext {
  area: 'auth' | 'listing' | 'sync' | 'budget' | 'webhook' | 'http';
  step?: string;
  /** Ids and small facts only (organizerId, itemId, shopId, HTTP status, Etsy error code). */
  extra?: Record<string, string | number | boolean | null | undefined>;
}

export function captureEtsyEvent(
  level: 'info' | 'warning' | 'error',
  message: string,
  ctx: EtsyEventContext,
  env: EtsyEnv = process.env
): void {
  try {
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ctx.extra ?? {})) {
      extra[k] = typeof v === 'string' ? scrubEtsySecrets(v, env) : v;
    }
    Sentry.captureMessage(scrubEtsySecrets(message, env), {
      level,
      tags: { integration: 'etsy', area: ctx.area, ...(ctx.step ? { step: ctx.step } : {}) },
      extra,
    });
  } catch {
    // Sentry may not be initialized (tests, early boot); never let telemetry break a call.
  }
}

// ---------------------------------------------------------------------------------------------
// Pure decision function
// ---------------------------------------------------------------------------------------------

export interface EtsyBudgetState {
  limitPerDay?: number | null;
  remainingToday?: number | null;
  limitPerSecond?: number | null;
  observedAt?: Date | null;
  blockedUntil?: Date | null;
  blockedReason?: string | null;
  lastAlertAt?: Date | null;
}

export interface EtsyBudgetDecisionInput {
  priority: EtsyPriority;
  dailyBudget: number;
  state: EtsyBudgetState | null;
  used24h: number;
  now: Date;
}

export interface EtsyBudgetDecision {
  allowed: boolean;
  reason?: 'BLOCKED' | 'BUDGET';
  retryAt?: Date;
  limit: number;
  used24h: number;
  effectiveUsed: number;
  /** floor(limit * cap) for the requested priority: effectiveUsed at or above this rejects. */
  threshold: number;
}

/** limit = min(configured budget, observed x-limit-per-day when present). */
export function resolveEtsyLimit(dailyBudget: number, state: EtsyBudgetState | null): number {
  const observed = state?.limitPerDay;
  if (typeof observed === 'number' && observed > 0) return Math.min(dailyBudget, observed);
  return dailyBudget;
}

/** effectiveUsed = max(used, limit - remainingToday) only when remainingToday was observed within 10 minutes. */
export function computeEffectiveUsed(
  used24h: number,
  limit: number,
  state: EtsyBudgetState | null,
  now: Date
): number {
  const remaining = state?.remainingToday;
  const observedAt = state?.observedAt;
  if (
    typeof remaining === 'number' &&
    observedAt instanceof Date &&
    now.getTime() - observedAt.getTime() <= ETSY_REMAINING_FRESH_MS &&
    now.getTime() >= observedAt.getTime()
  ) {
    return Math.max(used24h, limit - remaining);
  }
  return used24h;
}

export function computeEtsyBudgetDecision(input: EtsyBudgetDecisionInput): EtsyBudgetDecision {
  const { priority, dailyBudget, state, used24h, now } = input;
  const limit = resolveEtsyLimit(dailyBudget, state);
  const effectiveUsed = computeEffectiveUsed(used24h, limit, state, now);
  const threshold = Math.floor(limit * ETSY_PRIORITY_CAPS[priority]);
  const blockedUntil = state?.blockedUntil;
  if (blockedUntil instanceof Date && blockedUntil.getTime() > now.getTime()) {
    return { allowed: false, reason: 'BLOCKED', retryAt: blockedUntil, limit, used24h, effectiveUsed, threshold };
  }
  if (effectiveUsed >= threshold) {
    return { allowed: false, reason: 'BUDGET', limit, used24h, effectiveUsed, threshold };
  }
  return { allowed: true, limit, used24h, effectiveUsed, threshold };
}

// ---------------------------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------------------------

export interface EtsyBudgetDeps {
  /** Prisma-shaped client. Defaults to the shared client, loaded lazily. */
  db?: any;
  now?: () => Date;
  env?: EtsyEnv;
}

function defaultDb(): any {
  // Lazy so importing this module never constructs a Prisma client (import safety).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../lib/prisma').prisma;
}

export interface ReserveArgs {
  priority: EtsyPriority;
  /** Short label such as 'GET /v3/application/shops/:id'. Never a full URL or an id. */
  endpoint: string;
  organizerId?: string | null;
}

/**
 * Reserve one call against the shared budget. Throws EtsyError ETSY_BLOCKED or ETSY_BUDGET when the
 * call must not be made. Otherwise inserts an EtsyApiCall row (inside the locked transaction) and
 * returns its id for recordEtsyResponse.
 */
export async function reserveEtsyCall(args: ReserveArgs, deps: EtsyBudgetDeps = {}): Promise<{ callId: number }> {
  const db = deps.db ?? defaultDb();
  const now = (deps.now ?? (() => new Date()))();
  const env = deps.env ?? process.env;
  const dailyBudget = readEtsyDailyBudget(env);

  return db.$transaction(async (tx: any) => {
    // The literal below must equal ETSY_BUDGET_LOCK_KEY (asserted in etsyBudget.test.ts).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7350001)`;
    const state = await tx.etsyApiState.findUnique({ where: { id: ETSY_STATE_ID } });
    const used24h = await tx.etsyApiCall.count({
      where: { at: { gt: new Date(now.getTime() - ETSY_BUDGET_WINDOW_MS) } },
    });
    const decision = computeEtsyBudgetDecision({ priority: args.priority, dailyBudget, state, used24h, now });
    if (!decision.allowed) {
      if (decision.reason === 'BLOCKED') {
        throw new EtsyError('ETSY_BLOCKED', 'Etsy calls are paused by a rate-limit block', { retryAt: decision.retryAt });
      }
      throw new EtsyError('ETSY_BUDGET', `Etsy daily call budget reached for ${args.priority} calls`);
    }
    const row = await tx.etsyApiCall.create({
      data: { priority: args.priority, endpoint: args.endpoint.slice(0, 160), organizerId: args.organizerId ?? null },
      select: { id: true },
    });
    return { callId: row.id as number };
  });
}

function toIntOrNull(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Headers Etsy documents for rate limiting (lowercase keys). */
export interface EtsyRateHeaders {
  'x-limit-per-day'?: string;
  'x-remaining-today'?: string;
  'x-limit-per-second'?: string;
  'x-remaining-this-second'?: string;
}

/** Update the call row's status and fold the rate-limit headers into EtsyApiState. Never throws. */
export async function recordEtsyResponse(
  callId: number,
  status: number,
  headers: EtsyRateHeaders,
  deps: EtsyBudgetDeps = {}
): Promise<void> {
  try {
    const db = deps.db ?? defaultDb();
    const now = (deps.now ?? (() => new Date()))();
    await db.etsyApiCall.update({ where: { id: callId }, data: { status } });
    const patch: Record<string, number> = {};
    const perDay = toIntOrNull(headers['x-limit-per-day']);
    const remaining = toIntOrNull(headers['x-remaining-today']);
    const perSecond = toIntOrNull(headers['x-limit-per-second']);
    if (perDay !== null) patch.limitPerDay = perDay;
    if (remaining !== null) patch.remainingToday = remaining;
    if (perSecond !== null) patch.limitPerSecond = perSecond;
    if (Object.keys(patch).length === 0) return;
    await db.etsyApiState.upsert({
      where: { id: ETSY_STATE_ID },
      create: { id: ETSY_STATE_ID, ...patch, observedAt: now },
      update: { ...patch, observedAt: now },
    });
  } catch (err: any) {
    console.warn('[etsy-budget] could not record response:', scrubEtsySecrets(err?.message || String(err)));
  }
}

/** Block every process and replica until `until` (never shortens an existing later block). */
export async function markEtsyBlocked(
  args: { until: Date; reason: 'QPS' | 'QPD' },
  deps: EtsyBudgetDeps = {}
): Promise<void> {
  const db = deps.db ?? defaultDb();
  const now = (deps.now ?? (() => new Date()))();
  const cap = new Date(now.getTime() + ETSY_BLOCK_CAP_MS);
  let until = args.until.getTime() > cap.getTime() ? cap : args.until;
  const existing = await db.etsyApiState.findUnique({ where: { id: ETSY_STATE_ID } });
  const existingUntil: Date | null | undefined = existing?.blockedUntil;
  if (existingUntil instanceof Date && existingUntil.getTime() > until.getTime()) until = existingUntil;
  await db.etsyApiState.upsert({
    where: { id: ETSY_STATE_ID },
    create: { id: ETSY_STATE_ID, blockedUntil: until, blockedReason: args.reason },
    update: { blockedUntil: until, blockedReason: args.reason },
  });
}

/** Delete EtsyApiCall rows older than 48 hours. Returns the number deleted. */
export async function pruneEtsyApiCalls(deps: EtsyBudgetDeps = {}): Promise<number> {
  const db = deps.db ?? defaultDb();
  const now = (deps.now ?? (() => new Date()))();
  const res = await db.etsyApiCall.deleteMany({ where: { at: { lt: new Date(now.getTime() - ETSY_CALL_RETENTION_MS) } } });
  return res?.count ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Snapshot, log line, alerts
// ---------------------------------------------------------------------------------------------

export interface EtsyBudgetSnapshot {
  used24h: number;
  effectiveUsed: number;
  limit: number;
  remaining: number;
  ratio: number;
  limitPerDay: number | null;
  remainingToday: number | null;
  observedAt: Date | null;
  blockedUntil: Date | null;
  blockedReason: string | null;
  lastAlertAt: Date | null;
}

export async function getEtsyBudgetSnapshot(deps: EtsyBudgetDeps = {}): Promise<EtsyBudgetSnapshot> {
  const db = deps.db ?? defaultDb();
  const now = (deps.now ?? (() => new Date()))();
  const env = deps.env ?? process.env;
  const state = await db.etsyApiState.findUnique({ where: { id: ETSY_STATE_ID } });
  const used24h = await db.etsyApiCall.count({ where: { at: { gt: new Date(now.getTime() - ETSY_BUDGET_WINDOW_MS) } } });
  const limit = resolveEtsyLimit(readEtsyDailyBudget(env), state);
  const effectiveUsed = computeEffectiveUsed(used24h, limit, state, now);
  const blockedUntil: Date | null = state?.blockedUntil ?? null;
  return {
    used24h,
    effectiveUsed,
    limit,
    remaining: Math.max(limit - effectiveUsed, 0),
    ratio: limit > 0 ? effectiveUsed / limit : 1,
    limitPerDay: state?.limitPerDay ?? null,
    remainingToday: state?.remainingToday ?? null,
    observedAt: state?.observedAt ?? null,
    blockedUntil: blockedUntil && blockedUntil.getTime() > now.getTime() ? blockedUntil : null,
    blockedReason: state?.blockedReason ?? null,
    lastAlertAt: state?.lastAlertAt ?? null,
  };
}

export function formatEtsyBudgetLog(s: EtsyBudgetSnapshot): string {
  const blocked = s.blockedUntil ? `${s.blockedReason ?? 'unknown'} until ${s.blockedUntil.toISOString()}` : 'no';
  return `[etsy-budget] used24h=${s.used24h} limit=${s.limit} remaining=${s.remaining} blocked=${blocked}`;
}

/**
 * Log the budget line and raise a Sentry event at 80% (warning) and 95% (error) of the limit, at
 * most once per hour (EtsyApiState.lastAlertAt). Safe to call from any cron.
 */
export async function reportEtsyBudget(
  deps: EtsyBudgetDeps = {}
): Promise<{ snapshot: EtsyBudgetSnapshot; alerted: 'warning' | 'error' | null }> {
  const db = deps.db ?? defaultDb();
  const now = (deps.now ?? (() => new Date()))();
  const env = deps.env ?? process.env;
  const snapshot = await getEtsyBudgetSnapshot(deps);
  console.log(formatEtsyBudgetLog(snapshot));
  let alerted: 'warning' | 'error' | null = null;
  const level = snapshot.ratio >= ETSY_ALERT_ERROR_RATIO ? 'error' : snapshot.ratio >= ETSY_ALERT_WARNING_RATIO ? 'warning' : null;
  if (level) {
    const recentlyAlerted =
      snapshot.lastAlertAt instanceof Date && now.getTime() - snapshot.lastAlertAt.getTime() < ETSY_ALERT_MIN_GAP_MS;
    if (!recentlyAlerted) {
      captureEtsyEvent(
        level,
        `Etsy API budget at ${Math.round(snapshot.ratio * 100)} percent of the daily limit`,
        { area: 'budget', step: 'threshold', extra: { used24h: snapshot.used24h, limit: snapshot.limit, effectiveUsed: snapshot.effectiveUsed } },
        env
      );
      await db.etsyApiState.upsert({
        where: { id: ETSY_STATE_ID },
        create: { id: ETSY_STATE_ID, lastAlertAt: now },
        update: { lastAlertAt: now },
      });
      alerted = level;
    }
  }
  return { snapshot, alerted };
}
