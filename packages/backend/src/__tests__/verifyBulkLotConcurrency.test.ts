/**
 * verifyBulkLotConcurrency.test.ts: proves the safety guards and the pure helpers of the bulk lot concurrency check
 * (src/scripts/verifyBulkLotConcurrency.ts, ADR-136 roadmap #659). No database, no network, no Prisma client: the script's
 * database code only runs from its main entry point and is never run by a test. What is covered:
 *   - the start guard accepts only a local scratch database and refuses everything else, without ever printing the password
 *   - the pool parameters, the message sanitizer and the error classifier (deadlocks are reported, never retried away)
 *   - the tally, the invariant checks, the scenario result and the exit code rules (a skipped scenario is neither pass nor fail)
 *   - the hold rules the script compares the database against (read from the service's own constants)
 *   - the source reads no environment variable except DATABASE_URL, creates one Prisma client, makes no network call and
 *     deletes only by id
 */

import fs from 'fs';
import path from 'path';
import {
  CONNECTION_LIMIT,
  POOL_TIMEOUT_SECONDS,
  buildScenarioResult,
  checkAtMost,
  checkEquals,
  checkScratchDatabaseUrl,
  classifyError,
  errorCodeOf,
  expectedHoldWins,
  expectedShopperHoldWins,
  expectedStatus,
  isDeadlockOrSerialization,
  makeRunPrefix,
  onlyOwnedIds,
  overallExitCode,
  runVerification,
  sanitizeMessage,
  secretsOf,
  skippedScenario,
  summarizeResults,
  tallyOutcomes,
  withPoolParams,
} from '../scripts/verifyBulkLotConcurrency';
import { MAX_ACTIVE_HOLDS_PER_LOT, MAX_ACTIVE_SHOPPER_HOLDS } from '../services/bulkLot/bulkLotHoldService';

const GOOD = 'postgresql://findasale:findasale@localhost:5432/findasale_bulktest';
// Scheme prefixes kept apart from the fake credentials below, so the fixtures never read as a literal connection string.
const PG = 'postgresql://';
const PG_SHORT = 'postgres://';

describe('start guard: accepts only a local scratch database', () => {
  it('accepts localhost and 127.0.0.1 with a _bulktest, _scratch or _test database', () => {
    const a = checkScratchDatabaseUrl(GOOD);
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.host).toBe('localhost');
      expect(a.port).toBe('5432');
      expect(a.database).toBe('findasale_bulktest');
    }
    const b = checkScratchDatabaseUrl('postgresql://u:pw@127.0.0.1:55432/shop_scratch');
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.port).toBe('55432');
    expect(checkScratchDatabaseUrl(`${PG_SHORT}u:pw@LOCALHOST/shop_test?sslmode=disable`).ok).toBe(true);
  });

  it('refuses a missing, empty or malformed URL', () => {
    expect(checkScratchDatabaseUrl(undefined).ok).toBe(false);
    expect(checkScratchDatabaseUrl(null).ok).toBe(false);
    expect(checkScratchDatabaseUrl('').ok).toBe(false);
    expect(checkScratchDatabaseUrl('   ').ok).toBe(false);
    expect(checkScratchDatabaseUrl('not a url').ok).toBe(false);
    expect(checkScratchDatabaseUrl('mysql://u:pw@localhost:3306/shop_test').ok).toBe(false);
  });

  it('refuses the Railway host and the production database name', () => {
    const r = checkScratchDatabaseUrl('postgresql://postgres:S3cr3tPw@db.example.com:13949/railway');
    expect(r.ok).toBe(false);
    const r2 = checkScratchDatabaseUrl('postgresql://postgres:S3cr3tPw@db.example.com:13949/shop_test');
    expect(r2.ok).toBe(false);
    const r3 = checkScratchDatabaseUrl('postgresql://postgres:S3cr3tPw@localhost:5432/railway');
    expect(r3.ok).toBe(false);
  });

  it('refuses the dev database and names that do not end in a scratch suffix', () => {
    expect(checkScratchDatabaseUrl('postgresql://findasale:findasale@localhost:5432/findasale').ok).toBe(false);
    expect(checkScratchDatabaseUrl('postgresql://u:pw@localhost:5432/findasale_testing').ok).toBe(false);
    expect(checkScratchDatabaseUrl('postgresql://u:pw@localhost:5432/_test').ok).toBe(false);
    expect(checkScratchDatabaseUrl('postgresql://u:pw@localhost:5432/').ok).toBe(false);
    expect(checkScratchDatabaseUrl('postgresql://u:pw@localhost:5432').ok).toBe(false);
  });

  it('refuses look-alike and remote hosts, including a user name that spells localhost', () => {
    expect(checkScratchDatabaseUrl('postgresql://u:pw@localhost.evil.com:5432/shop_test').ok).toBe(false);
    expect(checkScratchDatabaseUrl('postgresql://localhost:pw@evil.example.com/shop_test').ok).toBe(false);
    expect(checkScratchDatabaseUrl('postgresql://u:pw@db.example.com:5432/shop_test').ok).toBe(false);
    expect(checkScratchDatabaseUrl(`${PG}u:pw@0.0.0.0:5432/shop_test`).ok).toBe(false);
    expect(checkScratchDatabaseUrl(`${PG}u:pw@[::1]:5432/shop_test`).ok).toBe(false);
  });

  it('refuses a query parameter that could redirect the connection', () => {
    expect(checkScratchDatabaseUrl('postgresql://u:pw@localhost:5432/shop_test?host=evil.example.com').ok).toBe(false);
    expect(checkScratchDatabaseUrl('postgresql://u:pw@localhost:5432/shop_test?HOSTADDR=10.0.0.5').ok).toBe(false);
    expect(checkScratchDatabaseUrl('postgresql://u:pw@localhost:5432/shop_test?dbname=railway').ok).toBe(false);
    expect(checkScratchDatabaseUrl('postgresql://u:pw@localhost:5432/shop_test?service=prod').ok).toBe(false);
  });

  it('never puts the password or the user name in a refusal reason', () => {
    const urls = [
      'postgresql://postgres:S3cr3tPw@db.example.com:13949/railway',
      'postgresql://alice:S3cr3tPw@localhost:5432/production',
      'postgresql://alice:S3cr3tPw@localhost:5432/shop_test?host=evil.example.com',
      'mysql://alice:S3cr3tPw@localhost/shop_test',
      'postgresql://alice:S3cr3tPw@db.example.com/shop_test',
    ];
    for (const url of urls) {
      const r = checkScratchDatabaseUrl(url);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).not.toContain('S3cr3tPw');
        expect(r.reason).not.toContain('alice');
      }
    }
  });
});

describe('runVerification refuses to start on a wrong DATABASE_URL (exit code 2) and prints no password', () => {
  it('returns 2 for the Railway URL and for a missing URL, touching nothing', async () => {
    const lines: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args.map((a) => String(a)).join(' '));
    };
    try {
      expect(await runVerification({ DATABASE_URL: 'postgresql://postgres:S3cr3tPw@db.example.com:13949/railway' })).toBe(2);
      expect(await runVerification({ DATABASE_URL: 'postgresql://postgres:S3cr3tPw@localhost:5432/findasale' })).toBe(2);
      expect(await runVerification({})).toBe(2);
    } finally {
      console.error = original;
    }
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain('S3cr3tPw');
    expect(lines.join('\n')).toMatch(/REFUSED to start/);
  });
});

describe('pool parameters', () => {
  it('appends connection_limit=40 and a raised pool_timeout, and keeps the user, password and path', () => {
    const out = withPoolParams(GOOD);
    expect(out.startsWith('postgresql://findasale:findasale@localhost:5432/findasale_bulktest?')).toBe(true);
    expect(out).toContain(`connection_limit=${CONNECTION_LIMIT}`);
    expect(out).toContain(`pool_timeout=${POOL_TIMEOUT_SECONDS}`);
    expect(CONNECTION_LIMIT).toBe(40);
    expect(POOL_TIMEOUT_SECONDS).toBeGreaterThan(10);
  });

  it('replaces values already in the URL and keeps other parameters', () => {
    const out = withPoolParams('postgresql://u:pw@localhost:5432/shop_test?connection_limit=3&pool_timeout=1&schema=public');
    expect(out.match(/connection_limit=/g)).toHaveLength(1);
    expect(out.match(/pool_timeout=/g)).toHaveLength(1);
    expect(out).toContain('connection_limit=40');
    expect(out).toContain('schema=public');
    expect(out).not.toContain('connection_limit=3');
  });
});

describe('sanitizeMessage and secretsOf', () => {
  it('removes the password, the URL and any postgres URL, on one line, and cuts long text', () => {
    const url = 'postgresql://alice:S3cr3tPw@localhost:5432/shop_test';
    const secrets = secretsOf(url);
    expect(secrets).toContain(url);
    expect(secrets).toContain('S3cr3tPw');
    const out = sanitizeMessage(`cannot reach ${url}\nand also S3cr3tPw and ${PG_SHORT}bob:other@host/db`, secrets);
    expect(out).not.toContain('S3cr3tPw');
    expect(out).not.toContain('alice');
    expect(out).not.toContain('bob');
    expect(out).not.toContain('\n');
    expect(sanitizeMessage('x'.repeat(1000), [], 50)).toHaveLength(53);
    expect(sanitizeMessage(undefined)).toBe('');
  });

  it('decodes a percent-encoded password too', () => {
    const secrets = secretsOf('postgresql://u:p%40ssw0rd@localhost/shop_test');
    expect(secrets).toContain('p%40ssw0rd');
    expect(secrets).toContain('p@ssw0rd');
  });
});

describe('error classification', () => {
  it('knows the refusal codes of the stock and hold services by name', () => {
    expect(errorCodeOf({ name: 'InsufficientStockError' })).toBe('INSUFFICIENT_STOCK');
    expect(errorCodeOf({ name: 'BulkLotError', code: 'NOT_AVAILABLE' })).toBe('NOT_AVAILABLE');
    expect(errorCodeOf({ name: 'BulkHoldError', code: 'BULK_HOLD_LIMIT' })).toBe('BULK_HOLD_LIMIT');
    expect(errorCodeOf({ name: 'PrismaClientKnownRequestError', code: 'P2002' })).toBeNull();
    expect(errorCodeOf(null)).toBeNull();
    expect(errorCodeOf('boom')).toBeNull();
  });

  it('a code in the allowed list is a refusal, any other error is unexpected', () => {
    const stock = Object.assign(new Error('Cannot sell 1 unit(s)'), { name: 'InsufficientStockError' });
    expect(classifyError(stock, ['INSUFFICIENT_STOCK']).kind).toBe('refusal');
    expect(classifyError(stock, ['NOT_AVAILABLE']).kind).toBe('unexpected');
    const limit = Object.assign(new Error('too many holds'), { name: 'BulkHoldError', code: 'BULK_HOLD_LIMIT' });
    expect(classifyError(limit, ['INSUFFICIENT_STOCK', 'BULK_HOLD_LIMIT']).code).toBe('BULK_HOLD_LIMIT');
    expect(classifyError(limit, ['INSUFFICIENT_STOCK']).kind).toBe('unexpected');
    expect(classifyError(new Error('plain'), ['INSUFFICIENT_STOCK']).kind).toBe('unexpected');
    expect(classifyError('a string', []).kind).toBe('unexpected');
  });

  it('flags a deadlock or a serialization failure as unexpected and says so', () => {
    const dead = Object.assign(new Error('deadlock detected'), { name: 'PrismaClientKnownRequestError', code: 'P2010' });
    const c = classifyError(dead, ['INSUFFICIENT_STOCK']);
    expect(c.kind).toBe('unexpected');
    expect(c.deadlockOrSerialization).toBe(true);
    expect(isDeadlockOrSerialization('Transaction failed due to a write conflict or a deadlock (P2034)')).toBe(true);
    expect(isDeadlockOrSerialization('could not serialize access due to concurrent update')).toBe(true);
    expect(isDeadlockOrSerialization('Unique constraint failed')).toBe(false);
    // a refusal is never treated as a deadlock
    expect(classifyError(Object.assign(new Error('x'), { name: 'InsufficientStockError' }), ['INSUFFICIENT_STOCK']).deadlockOrSerialization).toBe(false);
  });

  it('removes the password from an unexpected message', () => {
    const err = new Error('connect failed for postgresql://alice:S3cr3tPw@localhost:5432/shop_test');
    const c = classifyError(err, [], secretsOf('postgresql://alice:S3cr3tPw@localhost:5432/shop_test'));
    expect(c.message).not.toContain('S3cr3tPw');
  });
});

describe('tally, checks and scenario results', () => {
  it('counts successes, designed refusals by code, and unexpected errors', () => {
    const t = tallyOutcomes([
      { index: 0, kind: 'success' },
      { index: 1, kind: 'success' },
      { index: 2, kind: 'refusal', code: 'INSUFFICIENT_STOCK' },
      { index: 3, kind: 'refusal', code: 'INSUFFICIENT_STOCK' },
      { index: 4, kind: 'refusal', code: 'BULK_HOLD_LIMIT' },
      { index: 5, kind: 'unexpected', message: 'deadlock detected', deadlockOrSerialization: true },
    ]);
    expect(t.attempts).toBe(6);
    expect(t.succeeded).toBe(2);
    expect(t.failedWithExpectedRefusal).toBe(3);
    expect(t.refusalCodes).toEqual({ INSUFFICIENT_STOCK: 2, BULK_HOLD_LIMIT: 1 });
    expect(t.failedUnexpected).toEqual([{ index: 5, message: 'deadlock detected', deadlockOrSerialization: true }]);
  });

  it('checkEquals and checkAtMost carry name, expected, actual and pass', () => {
    expect(checkEquals('sold', 5, 5)).toEqual({ name: 'sold', expected: 5, actual: 5, pass: true });
    expect(checkEquals('sold', 5, 6).pass).toBe(false);
    expect(checkEquals('status', 'SOLD', null).pass).toBe(false);
    expect(checkAtMost('cap', 5, 5)).toEqual({ name: 'cap', expected: '<= 5', actual: 5, pass: true });
    expect(checkAtMost('cap', 5, 6).pass).toBe(false);
  });

  const okTally = tallyOutcomes([{ index: 0, kind: 'success' }, { index: 1, kind: 'refusal', code: 'INSUFFICIENT_STOCK' }]);

  it('a scenario passes only with every check true and no unexpected error', () => {
    const pass = buildScenarioResult({ name: 'a', calls: ['x'], tally: okTally, checks: [checkEquals('n', 1, 1)], durationMs: 5 });
    expect(pass.pass).toBe(true);
    expect(pass.status).toBe('PASSED');
    expect(pass.attempts).toBe(2);
    expect(pass.succeeded).toBe(1);
    expect(pass.failedWithExpectedRefusal).toBe(1);
    expect(pass.invariantChecks).toHaveLength(1);
    const badCheck = buildScenarioResult({ name: 'b', calls: [], tally: okTally, checks: [checkEquals('n', 1, 2)], durationMs: 5 });
    expect(badCheck.pass).toBe(false);
    expect(badCheck.status).toBe('FAILED');
    const withUnexpected = buildScenarioResult({
      name: 'c',
      calls: [],
      tally: tallyOutcomes([{ index: 0, kind: 'unexpected', message: 'deadlock detected', deadlockOrSerialization: true }]),
      checks: [checkEquals('n', 1, 1)],
      durationMs: 5,
    });
    expect(withUnexpected.pass).toBe(false);
    expect(withUnexpected.failedUnexpected).toHaveLength(1);
    const noChecks = buildScenarioResult({ name: 'd', calls: [], tally: okTally, checks: [], durationMs: 5 });
    expect(noChecks.pass).toBe(false);
    const errored = buildScenarioResult({ name: 'e', calls: [], checks: [], durationMs: 5, error: 'fixture failed' });
    expect(errored.pass).toBe(false);
    expect(errored.error).toBe('fixture failed');
  });

  it('exit code is 0 only when every scenario that ran passed; a skipped scenario counts as neither', () => {
    const pass = buildScenarioResult({ name: 'a', calls: [], tally: okTally, checks: [checkEquals('n', 1, 1)], durationMs: 1 });
    const fail = buildScenarioResult({ name: 'b', calls: [], tally: okTally, checks: [checkEquals('n', 1, 2)], durationMs: 1 });
    const skipped = skippedScenario('c', 'needs a network', ['x']);
    expect(skipped.status).toBe('SKIPPED');
    expect(skipped.skipReason).toBe('needs a network');
    expect(overallExitCode([pass])).toBe(0);
    expect(overallExitCode([pass, skipped])).toBe(0);
    expect(overallExitCode([pass, fail])).toBe(1);
    expect(overallExitCode([pass, fail, skipped])).toBe(1);
    expect(overallExitCode([skipped])).toBe(1);
    expect(overallExitCode([])).toBe(1);
    expect(overallExitCode([pass], false)).toBe(1);
    expect(summarizeResults([pass, fail, skipped])).toEqual({ total: 3, passed: 1, failed: 1, skipped: 1 });
  });
});

describe('the hold rules the database is compared against', () => {
  it('uses the service caps: 25 ACTIVE holds per lot and 5 per shopper', () => {
    expect(MAX_ACTIVE_HOLDS_PER_LOT).toBe(25);
    expect(MAX_ACTIVE_SHOPPER_HOLDS).toBe(5);
  });

  it('expectedHoldWins is limited by the cards left and by the lot cap', () => {
    expect(expectedHoldWins({ attempts: 25, cardsLeft: 10, cardsPerHold: 1, activeHolds: 0, perLotCap: MAX_ACTIVE_HOLDS_PER_LOT })).toBe(10);
    expect(expectedHoldWins({ attempts: 36, cardsLeft: 100, cardsPerHold: 1, activeHolds: 0, perLotCap: MAX_ACTIVE_HOLDS_PER_LOT })).toBe(25);
    expect(expectedHoldWins({ attempts: 10, cardsLeft: 100, cardsPerHold: 1, activeHolds: 0, perLotCap: MAX_ACTIVE_HOLDS_PER_LOT })).toBe(10);
    expect(expectedHoldWins({ attempts: 40, cardsLeft: 1000, cardsPerHold: 50, activeHolds: 0, perLotCap: MAX_ACTIVE_HOLDS_PER_LOT })).toBe(20);
    expect(expectedHoldWins({ attempts: 30, cardsLeft: 100, cardsPerHold: 1, activeHolds: 20, perLotCap: MAX_ACTIVE_HOLDS_PER_LOT })).toBe(5);
    expect(expectedHoldWins({ attempts: 30, cardsLeft: 0, cardsPerHold: 1, activeHolds: 0, perLotCap: MAX_ACTIVE_HOLDS_PER_LOT })).toBe(0);
    expect(expectedHoldWins({ attempts: 30, cardsLeft: 100, cardsPerHold: 1, activeHolds: 30, perLotCap: MAX_ACTIVE_HOLDS_PER_LOT })).toBe(0);
  });

  it('expectedShopperHoldWins is limited by the cap minus the holds already open', () => {
    expect(expectedShopperHoldWins({ attempts: 12, activeHolds: 0, cap: MAX_ACTIVE_SHOPPER_HOLDS })).toBe(5);
    expect(expectedShopperHoldWins({ attempts: 12, activeHolds: 0, cap: 1 })).toBe(1);
    expect(expectedShopperHoldWins({ attempts: 3, activeHolds: 0, cap: MAX_ACTIVE_SHOPPER_HOLDS })).toBe(3);
    expect(expectedShopperHoldWins({ attempts: 12, activeHolds: 4, cap: MAX_ACTIVE_SHOPPER_HOLDS })).toBe(1);
    expect(expectedShopperHoldWins({ attempts: 12, activeHolds: 9, cap: MAX_ACTIVE_SHOPPER_HOLDS })).toBe(0);
  });

  it('expectedStatus is SOLD exactly when stockSold reaches stockTotal (null counts as 1)', () => {
    expect(expectedStatus(5, 5)).toBe('SOLD');
    expect(expectedStatus(5, 4)).toBe('AVAILABLE');
    expect(expectedStatus(1000, 1000)).toBe('SOLD');
    expect(expectedStatus(null, 1)).toBe('SOLD');
    expect(expectedStatus(null, 0)).toBe('AVAILABLE');
  });
});

describe('run prefix and owned ids', () => {
  it('makeRunPrefix is time based, random tailed and id safe', () => {
    const p = makeRunPrefix(1760000000000, () => 0.5);
    expect(p).toMatch(/^bulkconc_[a-z0-9]+_[a-z0-9]{4}$/);
    expect(makeRunPrefix(1760000000000, () => 0.1)).not.toBe(makeRunPrefix(1760000000000, () => 0.9));
    expect(makeRunPrefix(1, () => 0)).toMatch(/_0000$/);
  });

  it('onlyOwnedIds keeps only ids that start with this run prefix, once each', () => {
    const prefix = 'bulkconc_abc_1234';
    const ids = [`${prefix}_item_s1`, `${prefix}_item_s1`, 'bulkconc_abc_9999_item_s1', 'cmabcdef', `${prefix}`, '', `${prefix}_user_0`];
    expect(onlyOwnedIds(prefix, ids)).toEqual([`${prefix}_item_s1`, `${prefix}_user_0`]);
    expect(onlyOwnedIds('', ['a_b'])).toEqual([]);
    expect(onlyOwnedIds(prefix, [])).toEqual([]);
  });
});

describe('the script source', () => {
  const scriptPath = path.join(process.cwd(), 'src/scripts/verifyBulkLotConcurrency.ts');
  const raw = fs.readFileSync(scriptPath, 'utf8');
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('reads DATABASE_URL and no other environment variable', () => {
    const names = Array.from(code.matchAll(/\benv\.([A-Za-z_][A-Za-z0-9_]*)/g)).map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).toBe('DATABASE_URL');
    expect(code).not.toMatch(/process\.env\s*\[/);
  });

  it('creates exactly one Prisma client, from the validated URL with the pool parameters', () => {
    expect(code.match(/new PrismaClient\(/g)).toHaveLength(1);
    expect(code).toContain('datasources: { db: { url: poolUrl } }');
    expect(code).toContain('withPoolParams(guard.url)');
  });

  it('makes no network call of its own', () => {
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/axios|node-fetch|XMLHttpRequest/);
  });

  it('deletes only by id and never truncates, drops or runs unsafe raw SQL', () => {
    const calls = code.match(/deleteMany\(/g) ?? [];
    const guarded = code.match(/deleteMany\(\{ where: \{ id: \{ in: ids \} \} \}\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(guarded).toHaveLength(calls.length);
    expect(code).not.toMatch(/TRUNCATE|DROP\s+(TABLE|DATABASE|SCHEMA)|\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe|\.deleteMany\(\s*\)/i);
  });

  it('tells the reader the target is a scratch database and gives the Windows recipe', () => {
    expect(raw).toContain('NEVER the dev database "findasale"');
    expect(raw).toContain('CREATE DATABASE findasale_bulktest OWNER findasale;');
    expect(raw).toContain('postgresql://findasale:findasale@localhost:5432/findasale_bulktest');
    expect(raw).toContain('npx prisma migrate deploy');
    expect(raw).toContain('pnpm --filter backend exec tsx src/scripts/verifyBulkLotConcurrency.ts | Out-File -Encoding utf8 bulk-lot-concurrency.json');
    expect(raw).toContain('DROP DATABASE findasale_bulktest;');
    expect(raw).toContain('Remove-Item Env:DATABASE_URL');
    const recipeLines = raw.slice(0, raw.indexOf('*/')).split('\n').filter((l) => /psql|pnpm|npx|Remove-Item|\$env:/.test(l));
    expect(recipeLines.length).toBeGreaterThan(4);
    for (const l of recipeLines) expect(l).not.toMatch(/&&/);
  });
});
