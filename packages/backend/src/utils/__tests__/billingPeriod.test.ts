/**
 * billingPeriod (2026-09-30): every subscription period, trial end and dunning deadline advances by exact
 * UTC milliseconds, so the result is identical in every server time zone and across DST changes. The old
 * renewal job used local-time setDate, which was 23 or 25 hours off across a DST change.
 *
 * Jest gives each test file a COPY of process.env, so assigning process.env.TZ inside a test does not
 * change the real time zone. The zone-sensitive checks therefore run the module in a child Node process
 * started with TZ set (typescript is already a devDependency; the file is transpiled in the child).
 */
import { execFileSync } from 'child_process';
import path from 'path';

jest.mock('square', () => ({ SquareError: class SquareError extends Error {} }));
jest.mock('../square', () => ({ getSquarePlatformClient: jest.fn() }));
jest.mock('../../services/squarePaymentService', () => ({
  toSquareMoney: (n: number) => ({ amount: BigInt(n), currency: 'USD' }),
  buildSquareIdempotencyKey: (parts: string[]) => parts.join('|').slice(0, 45),
}));

import { addDaysUtc, renewalPeriodKey, MS_PER_DAY } from '../billingPeriod';
import {
  computeNextRetryAt,
  computeGraceEndsAt,
  BILLING_INTERVAL_DAYS,
  DUNNING_GRACE_DAYS,
  DUNNING_RETRY_INTERVAL_DAYS,
} from '../../services/squareBillingService';

/** Runs addDaysUtc AND the legacy local-time setDate in a child process whose real time zone is `tz`. */
function inZone(tz: string, startIso: string, days: number): { exactMs: number; legacyMs: number } {
  const backendRoot = path.resolve(__dirname, '../../..');
  const modulePath = path.resolve(__dirname, '../billingPeriod.ts');
  const script = `
    const ts = require('typescript'); const fs = require('fs');
    const out = ts.transpileModule(fs.readFileSync(process.argv[1], 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const m = { exports: {} }; new Function('module', 'exports', out)(m, m.exports);
    const start = new Date(process.argv[2]); const days = Number(process.argv[3]);
    const legacy = new Date(start.getTime()); legacy.setDate(legacy.getDate() + days);
    console.log(JSON.stringify({ exactMs: m.exports.addDaysUtc(start, days).getTime() - start.getTime(), legacyMs: legacy.getTime() - start.getTime() }));
  `;
  const out = execFileSync(process.execPath, ['-e', script, modulePath, startIso, String(days)], {
    cwd: backendRoot,
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  });
  return JSON.parse(out.trim());
}

// Instants that sit right before a DST change in the zone, so +30 days (and +2, +7) cross it.
const CASES: Array<{ tz: string; start: string }> = [
  { tz: 'America/New_York', start: '2026-03-01T12:00:00.000Z' }, // spring forward 2026-03-08
  { tz: 'America/New_York', start: '2026-10-20T12:00:00.000Z' }, // fall back 2026-11-01
  { tz: 'Europe/London', start: '2026-10-10T06:30:00.000Z' }, // fall back 2026-10-25
  { tz: 'Australia/Lord_Howe', start: '2026-03-20T00:00:00.000Z' }, // 30-minute DST, ends 2026-04-05
  { tz: 'UTC', start: '2026-10-20T12:00:00.000Z' },
];

describe('addDaysUtc', () => {
  it('MS_PER_DAY is 24 hours', () => {
    expect(MS_PER_DAY).toBe(86_400_000);
  });

  it.each(CASES)('adds exact 24h days in $tz starting $start (DST-proof, real child process zone)', ({ tz, start }) => {
    for (const days of [1, 2, 7, 30]) {
      expect(inZone(tz, start, days).exactMs).toBe(days * MS_PER_DAY);
    }
  });

  it('the in-process result is byte-identical to the subscribe path arithmetic (now + 30 x 86400000)', () => {
    for (const { start } of CASES) {
      const s = new Date(start);
      expect(addDaysUtc(s, BILLING_INTERVAL_DAYS).getTime()).toBe(new Date(s.getTime() + 30 * 86400000).getTime());
    }
  });

  it('the old local-time setDate really was off across DST (this is the bug being closed)', () => {
    const fall = inZone('America/New_York', '2026-10-20T12:00:00.000Z', 30); // crosses fall-back
    expect(fall.legacyMs).toBe(30 * MS_PER_DAY + 60 * 60 * 1000); // one hour late
    expect(fall.exactMs).toBe(30 * MS_PER_DAY);
    const spring = inZone('America/New_York', '2026-03-01T12:00:00.000Z', 30); // crosses spring-forward
    expect(spring.legacyMs).toBe(30 * MS_PER_DAY - 60 * 60 * 1000); // one hour early
    expect(spring.exactMs).toBe(30 * MS_PER_DAY);
  });

  it('does not mutate its input', () => {
    const s = new Date('2026-10-20T12:00:00.000Z');
    addDaysUtc(s, 30);
    expect(s.toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });
});

describe('dunning deadlines use the same arithmetic', () => {
  it.each(CASES)('retry and grace deadlines are exact ms offsets (start $start)', ({ start }) => {
    const s = new Date(start);
    expect(computeNextRetryAt(s).getTime()).toBe(s.getTime() + DUNNING_RETRY_INTERVAL_DAYS * MS_PER_DAY);
    expect(computeGraceEndsAt(s).getTime()).toBe(s.getTime() + DUNNING_GRACE_DAYS * MS_PER_DAY);
  });
});

describe('renewalPeriodKey', () => {
  it('is renewal:<ISO period end> (the key the daily job and a past-due subscribe both claim)', () => {
    expect(renewalPeriodKey(new Date('2026-09-29T01:02:03.000Z'))).toBe('renewal:2026-09-29T01:02:03.000Z');
  });
});
