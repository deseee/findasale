/**
 * verifyBulkLotConcurrency.ts: proves that the bulk lot stock guards hold under REAL concurrent load (ADR-136 Addenda A, B, D, E,
 * roadmap #659). Run by Patrick on Windows, never by CI and never by a dev agent. It WRITES to a database, so it refuses to start
 * unless DATABASE_URL points at a throwaway local scratch database (see SAFETY).
 *
 * WHAT IT DOES. It builds its own fixture rows (one organizer, one sale, a handful of bulk lots, some shoppers), then runs ten
 * scenarios. Each scenario fires N parallel attempts with Promise.allSettled (all attempts are released at the same instant, on a
 * connection pool of 40 that is warmed first, so the concurrency reaches the database for real) and then decides pass or fail by
 * READING THE DATABASE AFTERWARDS, never by trusting what the functions returned:
 *   S1   last cards            30 x sellItemUnits(lot, 1) on a 5 card lot: exactly 5 win, stockSold 5, status SOLD.
 *   S2   mixed quantities      40 transactions x sellItemUnitsInTransaction(lot, 50) on a 1,000 card lot: exactly 20 win, stockSold 1,000.
 *   S3   last pack             25 attempts to take 1 pack (planPackLine, then sellBulkLinesInTransaction, the pack path's guarded
 *                              decrement) when exactly 1 pack of cards is left: exactly 1 wins.
 *   S4a  holds, stock guard    25 different shoppers place a 1 card hold on a 10 card lot (placeBulkHold): exactly 10 win.
 *   S4b  holds, shopper cap    ONE shopper fires 12 concurrent 1 card holds on 12 different lots: at most 5 (MAX_ACTIVE_SHOPPER_HOLDS).
 *   S4c  holds, one per lot    ONE shopper fires 12 concurrent 1 card holds on the SAME lot: at most 1.
 *   S4d  holds, lot cap        36 organizer holds of 1 card on a 100 card lot: at most 25 (MAX_ACTIVE_HOLDS_PER_LOT).
 *   S5   hold vs walk-in sale  10 cards, 6 already held by shopper A; then 4 card and 6 card claims by walk-in cash sales and by
 *                              shoppers' holds race for the 4 free cards: exactly one claim wins, no 6 card claim wins.
 *   S6   duplicate pack click  10 concurrent executePackCheckout calls with the same buyer key and retry token (each with its own
 *                              "payment"): exactly one Purchase row. The Square charge and refund are in-process stand-ins.
 *   S7   hub cart reserve      30 carts each reserve 1 card of a 5 card lot (reserveCartLotLines): exactly 5 lines are reserved.
 * S4b, S4c and S4d are the hold CAP scenarios. Until 2026-10-06 the caps were counted with a plain read before the transaction in
 * bulkLotHoldService.placeBulkHold, so concurrent requests could all pass the same count; the counts now run inside the
 * transaction under two advisory locks (lot first, then shopper), and these scenarios are the real-Postgres proof of that fix.
 * The stock itself (S1 to S3, S4a, S5, S7) is protected by one guarded UPDATE. A failing cap scenario is a finding about the
 * service, not a defect of this script; the invariant check that failed says which cap. A Prisma P2028 (transaction timeout)
 * in S4 would mean lock waiting outran the transaction timeout, which is also a finding.
 *
 * SAFETY (all enforced by exported pure helpers that src/__tests__/verifyBulkLotConcurrency.test.ts covers):
 *   - It refuses to start (exit code 2, message on stderr, the password is never printed) unless DATABASE_URL parses to the host
 *     localhost or 127.0.0.1 AND the database name ends in _scratch, _test or _bulktest. A URL that carries a host, hostaddr,
 *     dbname or service query parameter is refused too, and so is any other scheme than postgresql:// or postgres://.
 *   - It reads DATABASE_URL and no other environment variable for a connection. It builds its own Prisma client from that URL
 *     with connection_limit=40 and a raised pool_timeout appended, and passes the client explicitly to every service function.
 *   - After connecting it asks the server for current_database() and refuses (exit code 2) unless that is the database named in the URL.
 *   - Every fixture id carries a run-unique prefix (bulkconc_<time>_<random>). At the end, also when a scenario failed, a finally
 *     block deletes ONLY the rows this run created, by id, children first (cart lines, holds, purchases, bulk lot markers, items,
 *     sale, organizer, users), and then counts what is left. The target is a scratch database that Patrick creates for this
 *     check. It is NEVER the dev database "findasale", and never the production database.
 *
 * HOW TO RUN (Windows PowerShell, from the repo root C:\Users\desee\ClaudeProjects\FindaSale; chain with ; never with &&):
 *   1. Create the scratch database on the local server. Run as the postgres superuser, so the one-time
 *      "ALTER USER findasale CREATEDB;" (needed only for prisma migrate dev's shadow database) is NOT needed for this:
 *        psql -U postgres -c "CREATE DATABASE findasale_bulktest OWNER findasale;"
 *   2. Point this PowerShell window at it. $env:DATABASE_URL lives only in this window (it beats every .env file), so close the
 *      window afterwards or clear it with Remove-Item Env:DATABASE_URL. The password is the local dev one from packages\backend\.env:
 *        $env:DATABASE_URL="postgresql://findasale:findasale@localhost:5432/findasale_bulktest"
 *        echo $env:DATABASE_URL
 *      WARNING: packages\database\.env holds the PRODUCTION Railway URL. Prisma uses it whenever DATABASE_URL is not set in the window,
 *      so never run a prisma command in a window where the echo above does not print the scratch URL. The guarded form below
 *      refuses to run otherwise.
 *   3. Apply every migration to the empty scratch database. This also proves that all 479 migrations apply cleanly, in order, on a
 *      fresh database. "npx prisma generate" is NOT needed if the client is already generated (the schema is unchanged):
 *        cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database; if ($env:DATABASE_URL -like "*localhost:5432/findasale_bulktest") { npx prisma migrate deploy } else { Write-Error "DATABASE_URL is not the scratch database, not migrating" }
 *   4. Run the check. Progress and a short summary go to the console (stderr), the JSON report goes to the file (stdout):
 *        cd C:\Users\desee\ClaudeProjects\FindaSale; pnpm --filter backend exec tsx src/scripts/verifyBulkLotConcurrency.ts | Out-File -Encoding utf8 bulk-lot-concurrency.json
 *      Exit code 0 only when every scenario that ran passed (check it with: echo $LASTEXITCODE). 1 = a scenario or the cleanup
 *      failed, or the scratch database is not migrated. 2 = refused to start (wrong DATABASE_URL). Run it several times: a race is
 *      timing dependent, so one clean run is evidence, not proof.
 *   5. Clean up the window and drop the scratch database (close every window that still has it open first; the server must have
 *      no other connections to it, or add WITH (FORCE) after the name):
 *        Remove-Item Env:DATABASE_URL; psql -U postgres -c "DROP DATABASE findasale_bulktest;"
 *   Attach bulk-lot-concurrency.json to the ADR-136 PR. The server's max_connections must be above 60 (the default 100 is fine).
 *
 * NOT PROVEN by this check (also listed in the JSON report as notProven): anything Square, eBay or Resend does (the charge and
 * refund of scenario S6 are in-process stand-ins and no network is touched); more than one Postgres node, replicas or a pooler
 * such as PgBouncer (one local server, direct connections); any isolation level other than the server default, READ COMMITTED
 * (the guards rely on the row lock a single UPDATE takes); the HTTP layer (auth, rate limits, request parsing: the scenarios call
 * the service functions the controllers call, not the controllers); hold convert, release and the expiry sweep under load.
 *
 * REAL FUNCTIONS CALLED (nothing is re-implemented here except the walk-in sale of S5, which mirrors the cash register's
 * transaction in controllers/cashPaymentController.ts: sellBulkLinesInTransaction then a Purchase row with bulkQuantity):
 *   services/itemStockService.ts          sellItemUnits, sellItemUnitsInTransaction
 *   services/bulkLot/bulkLotService.ts    planBulkLine, sellBulkLinesInTransaction
 *   services/bulkLot/bulkLotPackService.ts planPackLine
 *   services/bulkLot/bulkLotPackCheckout.ts executePackCheckout (with an in-process charge, refund and fee-debt stand-in)
 *   services/bulkLot/bulkLotHoldService.ts placeBulkHold
 *   services/bulkLot/bulkLotBoothCartService.ts reserveCartLotLines
 */

import { MAX_ACTIVE_HOLDS_PER_LOT, MAX_ACTIVE_SHOPPER_HOLDS, HoldDeps, placeBulkHold } from '../services/bulkLot/bulkLotHoldService';
import { planBulkLine, sellBulkLinesInTransaction } from '../services/bulkLot/bulkLotService';
import { planPackLine } from '../services/bulkLot/bulkLotPackService';
import { packsAvailable } from '../services/bulkLot/bulkLotPacks';
import {
  PackCheckoutDeps,
  PackCheckoutInput,
  computePackFees,
  executePackCheckout,
  packBuyerKey,
  packClientTransactionId,
  parsePackClientToken,
} from '../services/bulkLot/bulkLotPackCheckout';
import { reserveCartLotLines } from '../services/bulkLot/bulkLotBoothCartService';

/** The Prisma client is created at run time from the generated package, so importing this file (the unit test does) loads no database code. */
type Db = any;
/** itemStockService imports the shared lib/prisma client, so it is loaded only after the DATABASE_URL guard has passed. */
type StockModule = typeof import('../services/itemStockService');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALLOWED_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];
export const REQUIRED_DB_SUFFIXES: readonly string[] = ['_scratch', '_test', '_bulktest'];
export const CONNECTION_LIMIT = 40;
export const POOL_TIMEOUT_SECONDS = 120;
/** Query parameters that could send the connection somewhere other than the host and database the guard looked at. */
const CONNECTION_OVERRIDE_PARAMS: readonly string[] = ['host', 'hostaddr', 'dbname', 'service', 'servicefile'];
/** Codes a scenario treats as the designed refusal of a competing claim (anything else is an unexpected error). */
const STOCK_REFUSALS: readonly string[] = ['INSUFFICIENT_STOCK'];
const PLAN_REFUSALS: readonly string[] = ['INSUFFICIENT_STOCK', 'NOT_AVAILABLE'];
const HOLD_REFUSALS: readonly string[] = ['INSUFFICIENT_STOCK', 'NOT_AVAILABLE', 'BULK_HOLD_LIMIT'];
/** Explicit transaction limits for the scenarios that open many transactions at once (the Prisma default is 2s wait and 5s run). */
const TX_OPTIONS = { maxWait: 30000, timeout: 60000 };

export const NOT_PROVEN: readonly string[] = [
  'Anything Square, eBay or Resend does: the pack checkout charge and refund in scenario S6 are in-process stand-ins and no network is touched.',
  'More than one Postgres node, replicas, or a pooler such as PgBouncer: this is one local server with direct connections.',
  'Any isolation level other than the server default (READ COMMITTED): the guards rely on the row lock that a single UPDATE takes.',
  'The HTTP layer (auth, rate limits, request parsing): the scenarios call the service functions the controllers call, not the controllers.',
  'Hold convert (cash and Square), hold release and the expiry sweep under load.',
  'A pass means no violation was observed in this run. Races are timing dependent, so run the check several times.',
];

// ---------------------------------------------------------------------------
// Pure helpers (exported and unit tested)
// ---------------------------------------------------------------------------

export type ScratchUrlCheck =
  | { ok: true; host: string; port: string; database: string; url: string }
  | { ok: false; reason: string };

/**
 * The start guard. Accepts only a postgresql:// or postgres:// URL whose host is localhost or 127.0.0.1 and whose database name
 * ends in _scratch, _test or _bulktest (with something in front of the suffix). The reason text never contains the password or
 * the user name: it names the host and the database only.
 */
export function checkScratchDatabaseUrl(raw: string | undefined | null): ScratchUrlCheck {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, reason: 'DATABASE_URL is not set in this window.' };
  const text = raw.trim();
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, reason: 'DATABASE_URL is not a valid URL.' };
  }
  if (u.protocol !== 'postgresql:' && u.protocol !== 'postgres:') {
    return { ok: false, reason: 'DATABASE_URL must start with postgresql:// or postgres://.' };
  }
  const host = u.hostname.toLowerCase();
  if (host === '') return { ok: false, reason: 'DATABASE_URL has no host.' };
  if (!ALLOWED_HOSTS.includes(host)) {
    return { ok: false, reason: `the host "${host}" is not allowed. Only ${ALLOWED_HOSTS.join(' or ')} is accepted.` };
  }
  for (const key of Array.from(u.searchParams.keys())) {
    if (CONNECTION_OVERRIDE_PARAMS.includes(key.toLowerCase())) {
      return { ok: false, reason: `the query parameter "${key}" could redirect the connection and is not allowed.` };
    }
  }
  let database = '';
  try {
    database = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  } catch {
    return { ok: false, reason: 'the database name in DATABASE_URL cannot be read.' };
  }
  if (database === '' || database.includes('/')) return { ok: false, reason: 'DATABASE_URL has no usable database name.' };
  const suffix = REQUIRED_DB_SUFFIXES.find((s) => database.endsWith(s) && database.length > s.length);
  if (!suffix) {
    return { ok: false, reason: `the database "${database}" does not end in ${REQUIRED_DB_SUFFIXES.join(' or ')}. Use a scratch database created for this check, never the dev database.` };
  }
  return { ok: true, host, port: u.port || '5432', database, url: text };
}

/** Appends connection_limit and pool_timeout to the URL (replacing any that are already there). Leaves the user, password and path as they were. */
export function withPoolParams(url: string, connectionLimit: number = CONNECTION_LIMIT, poolTimeoutSeconds: number = POOL_TIMEOUT_SECONDS): string {
  const cut = url.indexOf('?');
  const base = cut === -1 ? url : url.slice(0, cut);
  const params = new URLSearchParams(cut === -1 ? '' : url.slice(cut + 1));
  params.delete('connection_limit');
  params.delete('pool_timeout');
  params.set('connection_limit', String(connectionLimit));
  params.set('pool_timeout', String(poolTimeoutSeconds));
  return `${base}?${params.toString()}`;
}

/** The strings that must never reach stdout or stderr: the whole URL and the password (plain and decoded). */
export function secretsOf(url: string | undefined | null): string[] {
  const out: string[] = [];
  if (typeof url !== 'string' || url === '') return out;
  out.push(url);
  try {
    const u = new URL(url);
    if (u.password) {
      out.push(u.password);
      try {
        out.push(decodeURIComponent(u.password));
      } catch {
        // an undecodable password is still covered by the raw form above
      }
    }
  } catch {
    // not a URL: only the raw text is redacted
  }
  return out.filter((s) => s.length > 0);
}

/** One line, secrets and any postgres URL removed, cut to maxLength. Pure. */
export function sanitizeMessage(text: unknown, secrets: ReadonlyArray<string> = [], maxLength = 300): string {
  let out = String(text === undefined || text === null ? '' : text);
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join('[redacted]');
  }
  out = out.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]');
  out = out.replace(/\s+/g, ' ').trim();
  return out.length > maxLength ? `${out.slice(0, maxLength)}...` : out;
}

/** True when the text looks like a Postgres deadlock, a serialization failure or Prisma's write conflict (P2034). Such an error is never retried away. */
export function isDeadlockOrSerialization(text: unknown): boolean {
  return /deadlock|40P01|40001|could not serialize|serialization|P2034|write conflict/i.test(String(text ?? ''));
}

/** The code a refusal carries, or null: InsufficientStockError by its name, BulkLotError and BulkHoldError by their code. Duck typed like the services. */
export function errorCodeOf(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { name?: unknown; code?: unknown };
  if (e.name === 'InsufficientStockError') return 'INSUFFICIENT_STOCK';
  if ((e.name === 'BulkLotError' || e.name === 'BulkHoldError') && typeof e.code === 'string') return e.code;
  return null;
}

export interface ErrorClass {
  kind: 'refusal' | 'unexpected';
  code: string | null;
  message: string;
  deadlockOrSerialization: boolean;
}

/** A thrown error is the designed refusal only when its code is in `allowed`. Everything else (a deadlock, a timeout, a constraint error) is unexpected. */
export function classifyError(err: unknown, allowed: ReadonlyArray<string>, secrets: ReadonlyArray<string> = []): ErrorClass {
  const code = errorCodeOf(err);
  const name = err && typeof err === 'object' && typeof (err as { name?: unknown }).name === 'string' ? String((err as { name?: unknown }).name) : 'Error';
  const rawMessage = err instanceof Error ? err.message : String(err);
  const prismaCode = err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string' ? String((err as { code?: unknown }).code) : null;
  const message = sanitizeMessage(`${name}${prismaCode ? ` [${prismaCode}]` : ''}: ${rawMessage}`, secrets);
  if (code !== null && allowed.includes(code)) return { kind: 'refusal', code, message, deadlockOrSerialization: false };
  return { kind: 'unexpected', code, message, deadlockOrSerialization: isDeadlockOrSerialization(`${prismaCode ?? ''} ${rawMessage}`) };
}

export interface AttemptOutcome {
  index: number;
  kind: 'success' | 'refusal' | 'unexpected';
  code?: string | null;
  message?: string;
  deadlockOrSerialization?: boolean;
}

export interface Tally {
  attempts: number;
  succeeded: number;
  failedWithExpectedRefusal: number;
  refusalCodes: Record<string, number>;
  failedUnexpected: Array<{ index: number; message: string; deadlockOrSerialization: boolean }>;
}

export function tallyOutcomes(outcomes: ReadonlyArray<AttemptOutcome>): Tally {
  const t: Tally = { attempts: outcomes.length, succeeded: 0, failedWithExpectedRefusal: 0, refusalCodes: {}, failedUnexpected: [] };
  for (const o of outcomes) {
    if (o.kind === 'success') {
      t.succeeded++;
    } else if (o.kind === 'refusal') {
      t.failedWithExpectedRefusal++;
      const code = o.code ?? 'UNKNOWN';
      t.refusalCodes[code] = (t.refusalCodes[code] ?? 0) + 1;
    } else {
      t.failedUnexpected.push({ index: o.index, message: o.message ?? 'unknown error', deadlockOrSerialization: o.deadlockOrSerialization === true });
    }
  }
  return t;
}

export interface InvariantCheck {
  name: string;
  expected: string | number | boolean;
  actual: string | number | boolean | null;
  pass: boolean;
}

export function checkEquals(name: string, expected: string | number | boolean, actual: string | number | boolean | null): InvariantCheck {
  return { name, expected, actual, pass: expected === actual };
}

export function checkAtMost(name: string, limit: number, actual: number): InvariantCheck {
  return { name, expected: `<= ${limit}`, actual, pass: typeof actual === 'number' && actual <= limit };
}

export interface ScenarioResult {
  name: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  attempts: number;
  succeeded: number;
  failedWithExpectedRefusal: number;
  refusalCodes: Record<string, number>;
  failedUnexpected: Array<{ index: number; message: string; deadlockOrSerialization: boolean }>;
  invariantChecks: InvariantCheck[];
  durationMs: number;
  pass: boolean;
  calls: string[];
  notes: string[];
  skipReason?: string;
  error?: string;
}

/** A scenario passes only with no setup error, no unexpected attempt error, at least one check, and every check true. */
export function buildScenarioResult(args: {
  name: string;
  calls: string[];
  notes?: string[];
  tally?: Tally;
  checks: InvariantCheck[];
  durationMs: number;
  error?: string;
}): ScenarioResult {
  const tally = args.tally ?? { attempts: 0, succeeded: 0, failedWithExpectedRefusal: 0, refusalCodes: {}, failedUnexpected: [] };
  const pass = !args.error && tally.failedUnexpected.length === 0 && args.checks.length > 0 && args.checks.every((c) => c.pass);
  return {
    name: args.name,
    status: pass ? 'PASSED' : 'FAILED',
    attempts: tally.attempts,
    succeeded: tally.succeeded,
    failedWithExpectedRefusal: tally.failedWithExpectedRefusal,
    refusalCodes: tally.refusalCodes,
    failedUnexpected: tally.failedUnexpected,
    invariantChecks: args.checks,
    durationMs: args.durationMs,
    pass,
    calls: args.calls,
    notes: args.notes ?? [],
    ...(args.error ? { error: args.error } : {}),
  };
}

export function skippedScenario(name: string, reason: string, calls: string[] = []): ScenarioResult {
  return {
    name,
    status: 'SKIPPED',
    attempts: 0,
    succeeded: 0,
    failedWithExpectedRefusal: 0,
    refusalCodes: {},
    failedUnexpected: [],
    invariantChecks: [],
    durationMs: 0,
    pass: false,
    calls,
    notes: [],
    skipReason: reason,
  };
}

export function summarizeResults(results: ReadonlyArray<ScenarioResult>): { total: number; passed: number; failed: number; skipped: number } {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === 'PASSED').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    skipped: results.filter((r) => r.status === 'SKIPPED').length,
  };
}

/** 0 only when at least one scenario ran, every scenario that ran passed, and the cleanup left nothing behind. A skipped scenario never counts as a pass or a failure. */
export function overallExitCode(results: ReadonlyArray<ScenarioResult>, cleanupOk = true): 0 | 1 {
  const ran = results.filter((r) => r.status !== 'SKIPPED');
  return cleanupOk && ran.length > 0 && ran.every((r) => r.pass) ? 0 : 1;
}

/**
 * How many of `attempts` identical hold requests the service's own rule lets through when they are applied one after another:
 * limited by the cards left (cardsLeft / cardsPerHold) and by the per-lot cap on ACTIVE holds (perLotCap minus the ACTIVE holds already there).
 * Concurrency must not change this number. Pure.
 */
export function expectedHoldWins(args: { attempts: number; cardsLeft: number; cardsPerHold: number; activeHolds: number; perLotCap: number }): number {
  const byCards = Math.floor(Math.max(0, args.cardsLeft) / Math.max(1, args.cardsPerHold));
  const byCap = Math.max(0, args.perLotCap - args.activeHolds);
  return Math.max(0, Math.min(args.attempts, byCards, byCap));
}

/** How many of `attempts` holds one shopper gets under a cap of `cap` ACTIVE holds when `activeHolds` are already open. Pure. */
export function expectedShopperHoldWins(args: { attempts: number; activeHolds: number; cap: number }): number {
  return Math.max(0, Math.min(args.attempts, args.cap - args.activeHolds));
}

/** Item.status the stock service leaves a lot in: SOLD once stockSold reaches stockTotal (null counts as 1), otherwise untouched (AVAILABLE here). */
export function expectedStatus(stockTotal: number | null | undefined, stockSold: number): 'SOLD' | 'AVAILABLE' {
  return stockSold >= (stockTotal ?? 1) ? 'SOLD' : 'AVAILABLE';
}

/** Run-unique id prefix. Every fixture id this run creates starts with it. */
export function makeRunPrefix(nowMs: number, rand: () => number = Math.random): string {
  const tail = Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0');
  return `bulkconc_${nowMs.toString(36)}_${tail}`;
}

/** The ids that start with this run's prefix, each once. Cleanup deletes nothing else. */
export function onlyOwnedIds(prefix: string, ids: ReadonlyArray<string>): string[] {
  return Array.from(new Set(ids.filter((id) => typeof id === 'string' && prefix.length > 0 && id.startsWith(`${prefix}_`))));
}

// ---------------------------------------------------------------------------
// Concurrency harness
// ---------------------------------------------------------------------------

type Interpretation = { kind: 'success' } | { kind: 'refusal'; code: string } | { kind: 'unexpected'; message: string };

interface FireOptions<T> {
  allowed: readonly string[];
  secrets: string[];
  /** For a function that reports a refusal in its return value instead of throwing (executePackCheckout, reserveCartLotLines). */
  interpret?: (value: T, index: number) => Interpretation;
}

type FiredAttempt<T> = AttemptOutcome & { value?: T };

/** Builds all n attempts, releases them in the same instant, and classifies every settled result. */
async function fireConcurrently<T>(n: number, fn: (index: number) => Promise<T>, options: FireOptions<T>): Promise<Array<FiredAttempt<T>>> {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = Array.from({ length: n }, (_unused, index) =>
    (async () => {
      await gate;
      return fn(index);
    })()
  );
  release();
  const settled = await Promise.allSettled(pending);
  return settled.map((s, index): FiredAttempt<T> => {
    if (s.status === 'fulfilled') {
      const verdict: Interpretation = options.interpret ? options.interpret(s.value, index) : { kind: 'success' };
      if (verdict.kind === 'success') return { index, kind: 'success', value: s.value };
      if (verdict.kind === 'refusal') return { index, kind: 'refusal', code: verdict.code, value: s.value };
      return { index, kind: 'unexpected', message: sanitizeMessage(verdict.message, options.secrets), deadlockOrSerialization: false, value: s.value };
    }
    const c = classifyError(s.reason, options.allowed, options.secrets);
    if (c.kind === 'refusal') return { index, kind: 'refusal', code: c.code, message: c.message };
    return { index, kind: 'unexpected', code: c.code, message: c.message, deadlockOrSerialization: c.deadlockOrSerialization };
  });
}

// ---------------------------------------------------------------------------
// Fixtures and readers
// ---------------------------------------------------------------------------

interface Registry {
  userIds: string[];
  organizerIds: string[];
  saleIds: string[];
  itemIds: string[];
}

interface Ctx {
  prisma: Db;
  stock: StockModule;
  secrets: string[];
  prefix: string;
  reg: Registry;
  organizerId: string;
  organizerUserId: string;
  saleId: string;
}

async function createUsers(ctx: Ctx, count: number, tag: string): Promise<string[]> {
  const ids = Array.from({ length: count }, (_unused, i) => `${ctx.prefix}_user_${tag}_${i}`);
  ctx.reg.userIds.push(...ids); // registered before the insert, so a half-finished insert is still cleaned up
  await ctx.prisma.user.createMany({ data: ids.map((id, i) => ({ id, email: `${id}@bulkconc.invalid`, name: `Concurrency ${tag} ${i}` })) });
  return ids;
}

async function createLot(ctx: Ctx, tag: string, o: { stockTotal: number; stockSold?: number; packSize?: number | null; price?: number }): Promise<string> {
  const id = `${ctx.prefix}_item_${tag}`;
  ctx.reg.itemIds.push(id);
  await ctx.prisma.item.create({
    data: {
      id,
      title: `${ctx.prefix} lot ${tag}`,
      price: o.price ?? 8, // dollars per 1,000 cards
      status: 'AVAILABLE',
      stockTotal: o.stockTotal,
      stockSold: o.stockSold ?? 0,
      photoUrls: [],
      embedding: [], // Item.embedding is a required array column
      saleId: ctx.saleId,
      organizerId: ctx.organizerId,
      isActive: true,
      draftStatus: 'PUBLISHED',
    },
  });
  await ctx.prisma.itemBulkLot.create({ data: { itemId: id, organizerId: ctx.organizerId, packSize: o.packSize ?? null } });
  return id;
}

async function readLot(ctx: Ctx, itemId: string): Promise<{ stockTotal: number; stockSold: number; status: string }> {
  const r = await ctx.prisma.item.findUnique({ where: { id: itemId }, select: { stockTotal: true, stockSold: true, status: true } });
  if (!r) throw new Error(`fixture lot ${itemId} is missing`);
  return { stockTotal: r.stockTotal ?? 1, stockSold: r.stockSold, status: r.status };
}

async function readForPlan(ctx: Ctx, itemId: string): Promise<{ price: number | null; status: string; stockTotal: number | null; stockSold: number; packSize: number | null }> {
  const r = await ctx.prisma.item.findUnique({
    where: { id: itemId },
    select: { price: true, status: true, stockTotal: true, stockSold: true, bulkLot: { select: { packSize: true } } },
  });
  if (!r) throw new Error(`fixture lot ${itemId} is missing`);
  return { price: r.price, status: r.status, stockTotal: r.stockTotal, stockSold: r.stockSold, packSize: r.bulkLot ? r.bulkLot.packSize : null };
}

/** ACTIVE holds matching `where`: the number of rows and the cards under them. */
async function readActiveHolds(ctx: Ctx, where: Record<string, unknown>): Promise<{ count: number; cards: number }> {
  const agg = await ctx.prisma.bulkLotHold.aggregate({ where: { ...where, status: 'ACTIVE' }, _count: { _all: true }, _sum: { quantity: true } });
  return { count: agg._count._all, cards: agg._sum.quantity ?? 0 };
}

async function readPurchases(ctx: Ctx, where: Record<string, unknown>): Promise<{ count: number; cards: number }> {
  const agg = await ctx.prisma.purchase.aggregate({ where, _count: { _all: true }, _sum: { bulkQuantity: true } });
  return { count: agg._count._all, cards: agg._sum.bulkQuantity ?? 0 };
}

function holdDeps(ctx: Ctx): HoldDeps {
  return { sell: ctx.stock.sellItemUnitsInTransaction };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

interface ScenarioBody {
  tally: Tally;
  checks: InvariantCheck[];
  notes?: string[];
}

async function runScenario(ctx: Ctx, name: string, calls: string[], notes: string[], body: (c: Ctx) => Promise<ScenarioBody>): Promise<ScenarioResult> {
  const started = Date.now();
  console.error(`... ${name}`);
  try {
    const r = await body(ctx);
    return buildScenarioResult({ name, calls, notes: [...notes, ...(r.notes ?? [])], tally: r.tally, checks: r.checks, durationMs: Date.now() - started });
  } catch (err) {
    return buildScenarioResult({
      name,
      calls,
      notes,
      checks: [],
      durationMs: Date.now() - started,
      error: sanitizeMessage(err instanceof Error ? `${err.name}: ${err.message}` : String(err), ctx.secrets),
    });
  }
}

/** S1: 30 concurrent sellItemUnits(lot, 1) on a lot of 5 cards. */
async function scenarioLastCards(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'S1 last cards: 30 x sellItemUnits(1) on a 5 card lot',
    ['services/itemStockService.ts sellItemUnits(itemId, 1, client)'],
    ['sellItemUnits is the guarded UPDATE used by every channel; the client is passed in so the 40 connection pool is used.'],
    async (c) => {
      const N = 30;
      const TOTAL = 5;
      const itemId = await createLot(c, 's1', { stockTotal: TOTAL });
      const fired = await fireConcurrently(N, () => c.stock.sellItemUnits(itemId, 1, c.prisma), { allowed: STOCK_REFUSALS, secrets: c.secrets });
      const tally = tallyOutcomes(fired);
      const lot = await readLot(c, itemId);
      return {
        tally,
        checks: [
          checkEquals('attempts that succeeded', TOTAL, tally.succeeded),
          checkEquals('attempts refused with InsufficientStockError', N - TOTAL, tally.failedWithExpectedRefusal),
          checkEquals('Item.stockSold read back from the database', TOTAL, lot.stockSold),
          checkAtMost('Item.stockSold never above Item.stockTotal', lot.stockTotal, lot.stockSold),
          checkEquals('Item.status (SOLD once stockSold reaches stockTotal)', expectedStatus(lot.stockTotal, lot.stockSold), lot.status),
        ],
      };
    }
  );
}

/** S2: 40 transactions, each sells 50 cards of a 1,000 card lot through sellItemUnitsInTransaction. */
async function scenarioMixedQuantities(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'S2 mixed quantities: 40 transactions x sellItemUnitsInTransaction(50) on a 1,000 card lot',
    ['services/itemStockService.ts sellItemUnitsInTransaction(tx, itemId, 50) inside prisma.$transaction'],
    [],
    async (c) => {
      const N = 40;
      const CARDS = 50;
      const TOTAL = 1000;
      const WINS = TOTAL / CARDS;
      const itemId = await createLot(c, 's2', { stockTotal: TOTAL });
      const fired = await fireConcurrently(
        N,
        () => c.prisma.$transaction(async (tx: any) => c.stock.sellItemUnitsInTransaction(tx, itemId, CARDS), TX_OPTIONS),
        { allowed: STOCK_REFUSALS, secrets: c.secrets }
      );
      const tally = tallyOutcomes(fired);
      const lot = await readLot(c, itemId);
      const remainingSeen = new Set<number>();
      for (const f of fired) {
        const v = f.value as { remainingStock?: number } | undefined;
        if (f.kind === 'success' && v && typeof v.remainingStock === 'number') remainingSeen.add(v.remainingStock);
      }
      return {
        tally,
        checks: [
          checkEquals('transactions that succeeded', WINS, tally.succeeded),
          checkEquals('transactions refused with InsufficientStockError', N - WINS, tally.failedWithExpectedRefusal),
          checkEquals('Item.stockSold read back from the database', TOTAL, lot.stockSold),
          checkAtMost('Item.stockSold never above Item.stockTotal', lot.stockTotal, lot.stockSold),
          checkEquals('distinct remainingStock values returned to the winners (no two saw the same state)', WINS, remainingSeen.size),
          checkEquals('Item.status (SOLD once stockSold reaches stockTotal)', expectedStatus(lot.stockTotal, lot.stockSold), lot.status),
        ],
      };
    }
  );
}

/** S3: exactly one pack of cards left, 25 attempts to take one pack through the pack path's guarded decrement. */
async function scenarioLastPack(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'S3 last pack: 25 attempts to take 1 pack when exactly 1 pack of cards is left',
    [
      'services/bulkLot/bulkLotPackService.ts planPackLine(row, packSize, 1, null)',
      'services/bulkLot/bulkLotService.ts sellBulkLinesInTransaction(tx, lines, sellItemUnitsInTransaction) inside prisma.$transaction',
    ],
    [
      'This calls the lower-level guarded decrement that executePackCheckout uses (no charge is made). The full checkout is S6.',
      'Lot: 1,000 cards, 400 sold, pack size 500: 600 cards left = 1 pack plus 100 leftover cards.',
    ],
    async (c) => {
      const N = 25;
      const PACK = 500;
      const TOTAL = 1000;
      const SOLD0 = 400;
      const itemId = await createLot(c, 's3', { stockTotal: TOTAL, stockSold: SOLD0, packSize: PACK });
      const fired = await fireConcurrently(
        N,
        async () => {
          const row = await readForPlan(c, itemId);
          const plan = planPackLine(row, row.packSize, 1, null);
          return c.prisma.$transaction(
            async (tx: any) =>
              sellBulkLinesInTransaction(
                tx,
                [{ itemId, cards: plan.cards, cents: plan.cents, pricePerThousandCents: plan.pricePerThousandCents }],
                c.stock.sellItemUnitsInTransaction
              ),
            TX_OPTIONS
          );
        },
        { allowed: PLAN_REFUSALS, secrets: c.secrets }
      );
      const tally = tallyOutcomes(fired);
      const lot = await readLot(c, itemId);
      return {
        tally,
        checks: [
          checkEquals('attempts that took the pack', 1, tally.succeeded),
          checkEquals('attempts refused (INSUFFICIENT_STOCK or NOT_AVAILABLE)', N - 1, tally.failedWithExpectedRefusal),
          checkEquals('Item.stockSold read back (400 sold plus one 500 card pack)', SOLD0 + PACK, lot.stockSold),
          checkAtMost('Item.stockSold never above Item.stockTotal', lot.stockTotal, lot.stockSold),
          checkEquals('whole packs left afterwards', 0, packsAvailable(lot.stockTotal - lot.stockSold, PACK)),
          checkEquals('Item.status (100 leftover cards keep it AVAILABLE)', expectedStatus(lot.stockTotal, lot.stockSold), lot.status),
        ],
      };
    }
  );
}

/** S4a: 25 different shoppers each hold 1 card of a 10 card lot. */
async function scenarioHoldsStockGuard(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'S4a holds, stock guard: 25 different shoppers hold 1 card each of a 10 card lot',
    ['services/bulkLot/bulkLotHoldService.ts placeBulkHold(prisma, { sell: sellItemUnitsInTransaction }, SHOPPER actor, itemId, { quantity: 1 })'],
    ['Rule (read from placeBulkHold): a hold takes its cards from the lot with the guarded stockSold increment, so held cards ARE counted in stockSold; available = stockTotal - stockSold.'],
    async (c) => {
      const N = 25;
      const CARDS = 10;
      const itemId = await createLot(c, 's4a', { stockTotal: CARDS });
      const shoppers = await createUsers(c, N, 's4a');
      const rule = expectedHoldWins({ attempts: N, cardsLeft: CARDS, cardsPerHold: 1, activeHolds: 0, perLotCap: MAX_ACTIVE_HOLDS_PER_LOT });
      const fired = await fireConcurrently(
        N,
        (i) => placeBulkHold(c.prisma, holdDeps(c), { kind: 'SHOPPER', userId: shoppers[i] }, itemId, { quantity: 1 }),
        { allowed: HOLD_REFUSALS, secrets: c.secrets }
      );
      const tally = tallyOutcomes(fired);
      const lot = await readLot(c, itemId);
      const holds = await readActiveHolds(c, { itemId });
      return {
        tally,
        checks: [
          checkEquals('holds placed (the service rule: min(cards left, lot cap))', rule, tally.succeeded),
          checkEquals('ACTIVE hold rows in the database', rule, holds.count),
          checkAtMost('cards under ACTIVE holds never above what the rule allows', rule, holds.cards),
          checkAtMost('cards under ACTIVE holds never above Item.stockTotal', lot.stockTotal, holds.cards),
          checkEquals('Item.stockSold equals the cards under ACTIVE holds (every held card taken once, none twice)', holds.cards, lot.stockSold),
          checkEquals('Item.status (SOLD once every card is held)', expectedStatus(lot.stockTotal, lot.stockSold), lot.status),
        ],
      };
    }
  );
}

/** S4b: one shopper, 12 concurrent holds on 12 different lots: the cap of 5 ACTIVE holds per shopper. */
async function scenarioHoldsShopperCap(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'S4b holds, per-shopper cap: one shopper fires 12 concurrent holds on 12 different lots (cap 5)',
    ['services/bulkLot/bulkLotHoldService.ts placeBulkHold(...) with MAX_ACTIVE_SHOPPER_HOLDS'],
    ["placeBulkHold counts the shopper's ACTIVE holds inside its transaction under the lot and shopper advisory locks; a failure here means the locks do not serialize the count."],
    async (c) => {
      const N = 12;
      const lotIds: string[] = [];
      for (let i = 0; i < N; i++) lotIds.push(await createLot(c, `s4b_${i}`, { stockTotal: 10 }));
      const [shopper] = await createUsers(c, 1, 's4b');
      const rule = expectedShopperHoldWins({ attempts: N, activeHolds: 0, cap: MAX_ACTIVE_SHOPPER_HOLDS });
      const fired = await fireConcurrently(
        N,
        (i) => placeBulkHold(c.prisma, holdDeps(c), { kind: 'SHOPPER', userId: shopper }, lotIds[i], { quantity: 1 }),
        { allowed: HOLD_REFUSALS, secrets: c.secrets }
      );
      const tally = tallyOutcomes(fired);
      const mine = await readActiveHolds(c, { shopperUserId: shopper });
      let soldAcrossLots = 0;
      for (const id of lotIds) soldAcrossLots += (await readLot(c, id)).stockSold;
      return {
        tally,
        checks: [
          checkAtMost(`ACTIVE holds of the one shopper never above the cap (MAX_ACTIVE_SHOPPER_HOLDS = ${MAX_ACTIVE_SHOPPER_HOLDS})`, MAX_ACTIVE_SHOPPER_HOLDS, mine.count),
          checkEquals('holds placed (the service rule: the cap)', rule, tally.succeeded),
          checkEquals("stockSold summed over the 12 lots equals the cards under the shopper's ACTIVE holds", mine.cards, soldAcrossLots),
        ],
      };
    }
  );
}

/** S4c: one shopper, 12 concurrent holds on the SAME lot: the cap of one ACTIVE hold per lot per shopper. */
async function scenarioHoldsOnePerLot(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'S4c holds, one per lot: one shopper fires 12 concurrent holds on the same lot (cap 1)',
    ['services/bulkLot/bulkLotHoldService.ts placeBulkHold(...) (the "mineOnLot >= 1" rule)'],
    ['Same locks as S4b: the one-per-lot rule is counted inside the transaction under the shopper advisory lock.'],
    async (c) => {
      const N = 12;
      const itemId = await createLot(c, 's4c', { stockTotal: 10 });
      const [shopper] = await createUsers(c, 1, 's4c');
      const rule = expectedShopperHoldWins({ attempts: N, activeHolds: 0, cap: 1 });
      const fired = await fireConcurrently(
        N,
        () => placeBulkHold(c.prisma, holdDeps(c), { kind: 'SHOPPER', userId: shopper }, itemId, { quantity: 1 }),
        { allowed: HOLD_REFUSALS, secrets: c.secrets }
      );
      const tally = tallyOutcomes(fired);
      const mine = await readActiveHolds(c, { itemId, shopperUserId: shopper });
      const lot = await readLot(c, itemId);
      return {
        tally,
        checks: [
          checkAtMost('ACTIVE holds of the one shopper on the one lot never above 1', 1, mine.count),
          checkEquals('holds placed (the service rule: 1)', rule, tally.succeeded),
          checkEquals('Item.stockSold equals the cards under ACTIVE holds', mine.cards, lot.stockSold),
        ],
      };
    }
  );
}

/** S4d: 36 organizer holds of 1 card on a 100 card lot: the cap of 25 ACTIVE holds per lot. */
async function scenarioHoldsLotCap(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'S4d holds, per-lot cap: 36 concurrent organizer holds of 1 card on a 100 card lot (cap 25)',
    ['services/bulkLot/bulkLotHoldService.ts placeBulkHold(prisma, deps, ORGANIZER actor, itemId, { quantity: 1 }) with MAX_ACTIVE_HOLDS_PER_LOT'],
    ["placeBulkHold counts the lot's ACTIVE holds inside its transaction under the lot advisory lock."],
    async (c) => {
      const N = 36;
      const CARDS = 100;
      const itemId = await createLot(c, 's4d', { stockTotal: CARDS });
      const rule = expectedHoldWins({ attempts: N, cardsLeft: CARDS, cardsPerHold: 1, activeHolds: 0, perLotCap: MAX_ACTIVE_HOLDS_PER_LOT });
      const fired = await fireConcurrently(
        N,
        (i) =>
          placeBulkHold(c.prisma, holdDeps(c), { kind: 'ORGANIZER', organizerId: c.organizerId, actorUserId: c.organizerUserId }, itemId, {
            quantity: 1,
            customerName: `Customer ${i}`,
          }),
        { allowed: HOLD_REFUSALS, secrets: c.secrets }
      );
      const tally = tallyOutcomes(fired);
      const holds = await readActiveHolds(c, { itemId });
      const lot = await readLot(c, itemId);
      return {
        tally,
        checks: [
          checkAtMost(`ACTIVE holds on the lot never above the cap (MAX_ACTIVE_HOLDS_PER_LOT = ${MAX_ACTIVE_HOLDS_PER_LOT})`, MAX_ACTIVE_HOLDS_PER_LOT, holds.count),
          checkEquals('holds placed (the service rule: the cap)', rule, tally.succeeded),
          checkEquals('Item.stockSold equals the cards under ACTIVE holds', holds.cards, lot.stockSold),
          checkEquals('Item.status (cards remain, so not SOLD)', expectedStatus(lot.stockTotal, lot.stockSold), lot.status),
        ],
      };
    }
  );
}

interface S5Spec {
  who: 'WALKIN' | 'HOLD';
  cards: number;
  shopper?: string;
}

/** S5: hold versus walk-in cash sale race for the free cards of a lot that already has a hold on it. */
async function scenarioHoldVersusSale(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'S5 hold versus sale: 10 cards, 6 held by shopper A, 4 free; walk-in sales and holds race for them',
    [
      'services/bulkLot/bulkLotHoldService.ts placeBulkHold (shopper A setup, then 13 competing shopper holds)',
      'services/bulkLot/bulkLotService.ts planBulkLine, sellBulkLinesInTransaction (walk-in cash sale, mirrors controllers/cashPaymentController.ts) plus tx.purchase.create',
    ],
    [
      'In the service a hold takes its cards out of the lot (they are in stockSold), so the literal "stockSold + hold cards <= stockTotal" would count held cards twice. The equivalent invariant checked here: stockSold == cards under ACTIVE holds + cards on walk-in Purchase rows, and that sum never exceeds stockTotal.',
      '10 walk-in sales of 4 cards and 10 holds of 4 cards compete for the 4 free cards: exactly one wins. 3 walk-in sales of 6 and 3 holds of 6 can never fit: none wins. Convert (markPaid) is not exercised.',
    ],
    async (c) => {
      const TOTAL = 10;
      const HELD = 6;
      const itemId = await createLot(c, 's5', { stockTotal: TOTAL });
      const users = await createUsers(c, 14, 's5');
      const shopperA = users[0];
      await placeBulkHold(c.prisma, holdDeps(c), { kind: 'SHOPPER', userId: shopperA }, itemId, { quantity: HELD });
      const specs: S5Spec[] = [];
      let nextShopper = 1;
      for (let k = 0; k < 10; k++) {
        specs.push({ who: 'WALKIN', cards: 4 });
        specs.push({ who: 'HOLD', cards: 4, shopper: users[nextShopper++] });
      }
      for (let k = 0; k < 3; k++) {
        specs.push({ who: 'WALKIN', cards: 6 });
        specs.push({ who: 'HOLD', cards: 6, shopper: users[nextShopper++] });
      }
      const fired = await fireConcurrently(
        specs.length,
        async (i) => {
          const spec = specs[i];
          if (spec.who === 'HOLD') {
            return placeBulkHold(c.prisma, holdDeps(c), { kind: 'SHOPPER', userId: spec.shopper as string }, itemId, { quantity: spec.cards });
          }
          const row = await readForPlan(c, itemId);
          const plan = planBulkLine(row, spec.cards, null);
          return c.prisma.$transaction(async (tx: any) => {
            await sellBulkLinesInTransaction(
              tx,
              [{ itemId, cards: plan.cards, cents: plan.cents, pricePerThousandCents: plan.pricePerThousandCents }],
              c.stock.sellItemUnitsInTransaction
            );
            await tx.purchase.create({
              data: {
                itemId,
                saleId: c.saleId,
                amount: plan.cents / 100,
                processor: 'CASH',
                status: 'PAID',
                source: 'POS',
                bulkQuantity: plan.cards,
                clientTransactionId: `${c.prefix}_s5_walkin_${i}`,
              },
            });
            return 'SOLD';
          }, TX_OPTIONS);
        },
        { allowed: PLAN_REFUSALS, secrets: c.secrets }
      );
      const tally = tallyOutcomes(fired);
      const winners = (cards: number, who?: 'WALKIN' | 'HOLD') =>
        fired.filter((f) => f.kind === 'success' && specs[f.index].cards === cards && (!who || specs[f.index].who === who)).length;
      const holdWins4 = winners(4, 'HOLD');
      const walkinWins4 = winners(4, 'WALKIN');
      const holds = await readActiveHolds(c, { itemId });
      const purchases = await readPurchases(c, { itemId });
      const lot = await readLot(c, itemId);
      return {
        tally,
        checks: [
          checkEquals('claims of 4 cards on the 4 free cards: winners (walk-in sale or hold, exactly one)', 1, winners(4)),
          checkEquals('claims of 6 cards (only 4 are free): winners', 0, winners(6)),
          checkEquals('Item.stockSold read back (6 held + the 4 card winner)', TOTAL, lot.stockSold),
          checkAtMost('Item.stockSold never above Item.stockTotal', lot.stockTotal, lot.stockSold),
          checkEquals("cards under ACTIVE holds (shopper A's 6 plus 4 for each hold winner)", HELD + 4 * holdWins4, holds.cards),
          checkEquals('cards on walk-in Purchase rows (4 for each walk-in winner)', 4 * walkinWins4, purchases.cards),
          checkEquals('stockSold minus (cards under ACTIVE holds + cards on Purchase rows): cards nobody accounts for', 0, lot.stockSold - (holds.cards + purchases.cards)),
          checkAtMost('cards claimed (held + purchased) never above Item.stockTotal', lot.stockTotal, holds.cards + purchases.cards),
          checkEquals('Item.status (SOLD once every card is claimed)', expectedStatus(lot.stockTotal, lot.stockSold), lot.status),
        ],
      };
    }
  );
}

/** S6: 10 concurrent pack checkouts with the same buyer key and retry token, each with its own stand-in payment. */
async function scenarioDuplicatePackClick(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'S6 duplicate pack click: 10 concurrent checkouts with the same buyer key and retry token',
    [
      'services/bulkLot/bulkLotPackCheckout.ts executePackCheckout(deps, input) (advisory lock pack-attempt:<txnKey> plus Purchase.clientTransactionId lookup)',
      'services/bulkLot/bulkLotPackService.ts planPackLine; services/bulkLot/bulkLotPackCheckout.ts computePackFees, packBuyerKey, packClientTransactionId, parsePackClientToken',
    ],
    [
      'Runs without Square: charge, refund and the cash fee debt claim are in-process stand-ins that only count calls. Each attempt gets its own payment id, like a double click that tokenized the card twice.',
      'In this scenario "failedWithExpectedRefusal" counts the designed non-sales: REPLAY (answered with the first Purchase) and DUPLICATE_REFUNDED (second payment refunded in full).',
    ],
    async (c) => {
      const N = 10;
      const PACK = 1000;
      const TOTAL = 10000;
      const FEE = 0.075;
      const itemId = await createLot(c, 's6', { stockTotal: TOTAL, packSize: PACK });
      const row = await readForPlan(c, itemId);
      const plan = planPackLine(row, row.packSize, 1, null);
      const fees = computePackFees({ cents: plan.cents, feePercent: FEE });
      const token = `${c.prefix}-click`;
      if (parsePackClientToken(token) === null) throw new Error('the generated retry token is not accepted by parsePackClientToken');
      const email = `${c.prefix}@bulkconc.invalid`;
      const txnKey = packClientTransactionId(packBuyerKey(null, email), token);
      const counts = { charges: 0, refunds: 0, claims: 0, claimsReleased: 0, captured: 0 };
      const input: PackCheckoutInput = {
        itemId,
        saleId: c.saleId,
        txnKey,
        idempotencyKey: `${c.prefix}_idem`,
        plan,
        feeBreakdown: fees.feeBreakdown,
        platformFeeCents: fees.platformFeeCents,
        feePercent: FEE,
        buyer: { userId: null, email, name: 'Concurrency Guest' },
      };
      const depsFor = (i: number): PackCheckoutDeps => ({
        db: c.prisma,
        sell: c.stock.sellItemUnitsInTransaction,
        applyDebt: async (a) => {
          counts.claims++;
          return { appFeeCents: a.baseAppFeeCents, debtAppliedCents: 0 };
        },
        releaseDebt: async () => {
          counts.claimsReleased++;
        },
        charge: async () => {
          counts.charges++;
          return { ok: true, paymentId: `${c.prefix}_pay_${i}`, cardFingerprint: null };
        },
        refund: async (a) => {
          counts.refunds++;
          return { status: 'REFUNDED', refundCents: a.amountCents };
        },
        resolveAttribution: async () => null,
        captureError: () => {
          counts.captured++;
        },
      });
      const fired = await fireConcurrently(N, (i) => executePackCheckout(depsFor(i), input), {
        allowed: [],
        secrets: c.secrets,
        interpret: (outcome) => {
          const o = (outcome as { outcome: string }).outcome;
          if (o === 'RECORDED') return { kind: 'success' };
          if (o === 'REPLAY' || o === 'DUPLICATE_REFUNDED') return { kind: 'refusal', code: o };
          return { kind: 'unexpected', message: `checkout outcome ${o}` };
        },
      });
      const tally = tallyOutcomes(fired);
      const purchases = await readPurchases(c, { clientTransactionId: txnKey });
      const lot = await readLot(c, itemId);
      const purchaseIds = new Set<string>();
      for (const f of fired) {
        const v = f.value as { purchase?: { id?: string } } | undefined;
        if (v && v.purchase && typeof v.purchase.id === 'string') purchaseIds.add(v.purchase.id);
      }
      return {
        tally,
        checks: [
          checkEquals('Purchase rows with this clientTransactionId in the database', 1, purchases.count),
          checkEquals('checkouts answered RECORDED', 1, tally.succeeded),
          checkEquals('cards taken from the lot (one pack)', PACK, lot.stockSold),
          checkEquals('cards on the Purchase row (bulkQuantity)', PACK, purchases.cards),
          checkEquals('distinct Purchase ids across all answers (everyone is pointed at the same sale)', 1, purchaseIds.size),
          checkEquals('stand-in charges minus refunds (net payments kept)', 1, counts.charges - counts.refunds),
          checkEquals('cash fee debt claims minus claims given back (only the sale keeps one)', 1, counts.claims - counts.claimsReleased),
          checkEquals('errors reported through captureError', 0, counts.captured),
        ],
      };
    }
  );
}

/** S7: 30 carts each reserve 1 card of a 5 card lot. */
async function scenarioHubCartReserve(ctx: Ctx): Promise<ScenarioResult> {
  return runScenario(
    ctx,
    'S7 hub cart reserve: 30 carts each reserve 1 card of a 5 card lot',
    ['services/bulkLot/bulkLotBoothCartService.ts reserveCartLotLines(prisma, { sell: sellItemUnitsInTransaction }, { cartId, requests }, applyToCart)'],
    ['Every cart plans from the same stale snapshot of the lot (stockSold 0), so only the guarded decrement can refuse. applyToCart is a no-op (the BoothCartTransaction compare-and-swap belongs to the controller).'],
    async (c) => {
      const N = 30;
      const TOTAL = 5;
      const itemId = await createLot(c, 's7', { stockTotal: TOTAL });
      const snap = await readForPlan(c, itemId);
      const item = { id: itemId, price: snap.price, status: snap.status, stockTotal: snap.stockTotal, stockSold: snap.stockSold };
      const fired = await fireConcurrently(
        N,
        (i) =>
          reserveCartLotLines(
            c.prisma,
            { sell: c.stock.sellItemUnitsInTransaction },
            { cartId: `${c.prefix}_cart_${i}`, requests: [{ item, vendorBoothId: `${c.prefix}_booth`, quantity: 1, amountDollars: null }] },
            async () => undefined
          ),
        {
          allowed: [],
          secrets: c.secrets,
          interpret: (r) => {
            if (r.added.length === 1 && r.rejected.length === 0) return { kind: 'success' };
            if (r.added.length === 0 && r.rejected.length === 1 && PLAN_REFUSALS.includes(String(r.rejected[0].code))) return { kind: 'refusal', code: String(r.rejected[0].code) };
            return { kind: 'unexpected', message: `reserve answered added=${r.added.length} rejected=${JSON.stringify(r.rejected.map((x) => x.code))}` };
          },
        }
      );
      const tally = tallyOutcomes(fired);
      const lot = await readLot(c, itemId);
      const agg = await c.prisma.boothCartBulkLine.aggregate({ where: { itemId, status: 'RESERVED' }, _count: { _all: true }, _sum: { quantity: true } });
      const reservedLines: number = agg._count._all;
      const reservedCards: number = agg._sum.quantity ?? 0;
      return {
        tally,
        checks: [
          checkEquals('carts that reserved a card', TOTAL, tally.succeeded),
          checkEquals('carts refused (INSUFFICIENT_STOCK)', N - TOTAL, tally.failedWithExpectedRefusal),
          checkEquals('RESERVED BoothCartBulkLine rows in the database', TOTAL, reservedLines),
          checkEquals('cards on the RESERVED lines', TOTAL, reservedCards),
          checkEquals('Item.stockSold equals the cards on the RESERVED lines', reservedCards, lot.stockSold),
          checkAtMost('Item.stockSold never above Item.stockTotal', lot.stockTotal, lot.stockSold),
          checkEquals('Item.status (SOLD once every card is reserved)', expectedStatus(lot.stockTotal, lot.stockSold), lot.status),
        ],
      };
    }
  );
}

// ---------------------------------------------------------------------------
// Cleanup (only rows this run created, by id, children first)
// ---------------------------------------------------------------------------

export interface CleanupReport {
  ok: boolean;
  deleted: Record<string, number>;
  leftover: Record<string, number>;
  errors: string[];
}

async function idsByItem(delegate: any, itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const rows: Array<{ id: string }> = await delegate.findMany({ where: { itemId: { in: itemIds } }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function deleteByIds(delegate: any, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await delegate.deleteMany({ where: { id: { in: ids } } });
  return res.count;
}

async function cleanup(prisma: Db, prefix: string, reg: Registry, secrets: string[]): Promise<CleanupReport> {
  const report: CleanupReport = { ok: true, deleted: {}, leftover: {}, errors: [] };
  const itemIds = onlyOwnedIds(prefix, reg.itemIds);
  const step = async (label: string, fn: () => Promise<number>) => {
    try {
      report.deleted[label] = await fn();
    } catch (err) {
      report.ok = false;
      report.errors.push(`${label}: ${sanitizeMessage(err instanceof Error ? err.message : String(err), secrets)}`);
    }
  };
  await step('boothCartBulkLine', async () => deleteByIds(prisma.boothCartBulkLine, await idsByItem(prisma.boothCartBulkLine, itemIds)));
  await step('bulkLotHold', async () => deleteByIds(prisma.bulkLotHold, await idsByItem(prisma.bulkLotHold, itemIds)));
  await step('purchase', async () => deleteByIds(prisma.purchase, await idsByItem(prisma.purchase, itemIds)));
  await step('itemBulkLot', async () => deleteByIds(prisma.itemBulkLot, await idsByItem(prisma.itemBulkLot, itemIds)));
  await step('item', async () => deleteByIds(prisma.item, itemIds));
  await step('sale', async () => deleteByIds(prisma.sale, onlyOwnedIds(prefix, reg.saleIds)));
  await step('organizer', async () => deleteByIds(prisma.organizer, onlyOwnedIds(prefix, reg.organizerIds)));
  await step('user', async () => deleteByIds(prisma.user, onlyOwnedIds(prefix, reg.userIds)));

  const count = async (label: string, fn: () => Promise<number>) => {
    try {
      report.leftover[label] = await fn();
      if (report.leftover[label] > 0) report.ok = false;
    } catch (err) {
      report.ok = false;
      report.errors.push(`leftover ${label}: ${sanitizeMessage(err instanceof Error ? err.message : String(err), secrets)}`);
    }
  };
  const byItem = { itemId: { in: itemIds } };
  await count('boothCartBulkLine', () => prisma.boothCartBulkLine.count({ where: byItem }));
  await count('bulkLotHold', () => prisma.bulkLotHold.count({ where: byItem }));
  await count('purchase', () => prisma.purchase.count({ where: byItem }));
  await count('itemBulkLot', () => prisma.itemBulkLot.count({ where: byItem }));
  await count('item', () => prisma.item.count({ where: { id: { in: itemIds } } }));
  await count('sale', () => prisma.sale.count({ where: { id: { in: onlyOwnedIds(prefix, reg.saleIds) } } }));
  await count('organizer', () => prisma.organizer.count({ where: { id: { in: onlyOwnedIds(prefix, reg.organizerIds) } } }));
  await count('user', () => prisma.user.count({ where: { id: { in: onlyOwnedIds(prefix, reg.userIds) } } }));
  return report;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function printSummary(results: ScenarioResult[]): void {
  console.error('');
  console.error('Summary');
  for (const r of results) {
    const head = r.status === 'PASSED' ? 'PASS' : r.status === 'SKIPPED' ? 'SKIP' : 'FAIL';
    console.error(`  ${head}  ${r.name}`);
    if (r.status === 'SKIPPED') {
      console.error(`        skipped: ${r.skipReason}`);
      continue;
    }
    console.error(
      `        attempts ${r.attempts}, succeeded ${r.succeeded}, expected refusals ${r.failedWithExpectedRefusal}, unexpected errors ${r.failedUnexpected.length}, ${r.durationMs} ms`
    );
    if (r.error) console.error(`        scenario error: ${r.error}`);
    for (const f of r.failedUnexpected.slice(0, 3)) console.error(`        unexpected${f.deadlockOrSerialization ? ' (deadlock or serialization)' : ''}: ${f.message}`);
    for (const ck of r.invariantChecks.filter((x) => !x.pass)) console.error(`        FAILED CHECK: ${ck.name}: expected ${ck.expected}, actual ${ck.actual}`);
  }
}

/** Returns the process exit code: 0 all passed, 1 a scenario, the cleanup or the setup failed, 2 refused to start. */
export async function runVerification(env: Record<string, string | undefined> = process.env): Promise<number> {
  const guard = checkScratchDatabaseUrl(env.DATABASE_URL);
  if (!guard.ok) {
    console.error(`REFUSED to start: ${guard.reason}`);
    console.error('This check writes to a database. Point DATABASE_URL at a throwaway local scratch database (see the header of this file).');
    return 2;
  }
  const secrets = secretsOf(guard.url);
  const poolUrl = withPoolParams(guard.url);
  const prefix = makeRunPrefix(Date.now());
  const reg: Registry = { userIds: [], organizerIds: [], saleIds: [], itemIds: [] };
  const results: ScenarioResult[] = [];
  let setupError: string | null = null;
  let cleanupReport: CleanupReport = { ok: true, deleted: {}, leftover: {}, errors: [] };

  const { PrismaClient } = await import('@prisma/client');
  const prisma: Db = new PrismaClient({ datasources: { db: { url: poolUrl } }, log: [] });
  try {
    const who: Array<{ name: string; hold_table: string | null; lot_table: string | null }> = await prisma.$queryRaw`
      SELECT current_database() AS name, to_regclass('"BulkLotHold"')::text AS hold_table, to_regclass('"ItemBulkLot"')::text AS lot_table
    `;
    if (!who[0] || who[0].name !== guard.database) {
      console.error(`REFUSED to continue: the server reports a different database than the one named in DATABASE_URL (${guard.database}).`);
      return 2;
    }
    if (!who[0].hold_table || !who[0].lot_table) {
      console.error('The scratch database is not migrated (the BulkLotHold or ItemBulkLot table is missing). Run prisma migrate deploy against it first (see the header of this file).');
      return 1;
    }
    console.error(`Scratch database ${guard.database} on ${guard.host}:${guard.port}, run ${prefix}, pool ${CONNECTION_LIMIT}.`);

    // Loaded only now: itemStockService imports lib/prisma, which reads DATABASE_URL (already validated above).
    const stock: StockModule = await import('../services/itemStockService');

    // Open the whole pool before the first scenario so the attempts really run in parallel.
    await Promise.all(Array.from({ length: CONNECTION_LIMIT }, () => prisma.$queryRaw`SELECT 1 AS ok FROM pg_sleep(0.1)`));

    try {
      const organizerUserId = `${prefix}_user_org`;
      reg.userIds.push(organizerUserId);
      await prisma.user.create({ data: { id: organizerUserId, email: `${organizerUserId}@bulkconc.invalid`, name: 'Concurrency Organizer' } });
      const organizerId = `${prefix}_organizer`;
      reg.organizerIds.push(organizerId);
      await prisma.organizer.create({ data: { id: organizerId, businessName: `${prefix} shop`, address: '1 Test Street, Paw Paw, MI 49079', userId: organizerUserId } });
      const saleId = `${prefix}_sale`;
      reg.saleIds.push(saleId);
      await prisma.sale.create({
        data: {
          id: saleId,
          title: `${prefix} sale`,
          startDate: new Date(),
          endDate: new Date(Date.now() + 86_400_000),
          address: '1 Test Street',
          city: 'Paw Paw',
          state: 'MI',
          zip: '49079',
          organizerId,
        },
      });
      const ctx: Ctx = { prisma, stock, secrets, prefix, reg, organizerId, organizerUserId, saleId };

      results.push(await scenarioLastCards(ctx));
      results.push(await scenarioMixedQuantities(ctx));
      results.push(await scenarioLastPack(ctx));
      results.push(await scenarioHoldsStockGuard(ctx));
      results.push(await scenarioHoldsShopperCap(ctx));
      results.push(await scenarioHoldsOnePerLot(ctx));
      results.push(await scenarioHoldsLotCap(ctx));
      results.push(await scenarioHoldVersusSale(ctx));
      results.push(await scenarioDuplicatePackClick(ctx));
      results.push(await scenarioHubCartReserve(ctx));
    } catch (err) {
      setupError = sanitizeMessage(err instanceof Error ? `${err.name}: ${err.message}` : String(err), secrets);
      console.error(`Setup or scenario run failed: ${setupError}`);
    } finally {
      cleanupReport = await cleanup(prisma, prefix, reg, secrets);
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }

  printSummary(results);
  console.error('');
  console.error(`Cleanup: ${cleanupReport.ok ? 'clean, no fixture rows left' : 'PROBLEM, see the cleanup section of the report'}`);
  const summary = summarizeResults(results);
  const code = setupError ? 1 : overallExitCode(results, cleanupReport.ok);
  console.error(`Result: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped. Exit code ${code}.`);
  const report = {
    generatedAt: new Date().toISOString(),
    runPrefix: prefix,
    database: { host: guard.host, port: guard.port, name: guard.database },
    pool: { connectionLimit: CONNECTION_LIMIT, poolTimeoutSeconds: POOL_TIMEOUT_SECONDS },
    node: process.version,
    summary,
    scenarios: results,
    cleanup: cleanupReport,
    ...(setupError ? { setupError } : {}),
    notProven: NOT_PROVEN,
    pass: code === 0,
  };
  console.log(JSON.stringify(report, null, 2));
  return code;
}

if (require.main === module) {
  runVerification()
    .then((code) => {
      process.stdout.write('', () => process.exit(code));
    })
    .catch((err) => {
      console.error('verifyBulkLotConcurrency failed:', sanitizeMessage(err instanceof Error ? err.message : String(err), secretsOf(process.env.DATABASE_URL)));
      process.stdout.write('', () => process.exit(1));
    });
}
