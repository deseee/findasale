/**
 * verifyBulkLotPackSquareSandbox.test.ts: proves the safety guards and the pure helpers of the Square SANDBOX check of the online bulk
 * lot pack checkout (src/scripts/verifyBulkLotPackSquareSandbox.ts, ADR-136 Addendum E, roadmap #659). No database, no Square, no network:
 * the script's money code only runs from its main entry point and is never run by a test (runSandboxVerification refuses any
 * environment that is not the real process environment, so even a fully valid fake one cannot reach Square). What is covered:
 *   - SQUARE_ENVIRONMENT must be exactly sandbox; the two verify variables are read and checked without ever echoing the token
 *   - the Square client environment guard: the SDK Sandbox constant passes; Production, a baseUrl override, a missing environment
 *     and look-alike hosts are refused (checked on a client options object, like the script checks the real client)
 *   - token redaction in messages, console output and the JSON text
 *   - the Square readers' pure parts (money, payment and refund facts, fee probe decision, refund and payment checks, listing diff)
 *   - the run rules (exit codes, fixture prefix, idempotency keys, barrier, polling)
 *   - the money assumptions the scenarios rely on, read from the service's own functions (pack price, fee floor, too-cheap refusal)
 *   - the script source: one Prisma client, no network call except through the SDK, one environment constant, only id-based deletes
 */

import fs from 'fs';
import path from 'path';
import { SquareClient, SquareEnvironment } from 'square';
import {
  ACCEPTED_REFUND_STATUSES,
  Barrier,
  EXPECTED_PACK_CENTS,
  LOCATION_ENV_NAME,
  PACK_SIZE_CARDS,
  PRICE_DOLLARS_PER_THOUSAND,
  REFUSAL_EXIT,
  SANDBOX_CARD_NONCE_OK,
  SCENARIO_COUNT,
  TOKEN_ENV_NAME,
  PaymentFacts,
  RefundFacts,
  assertSandboxApiOptions,
  assertSandboxClient,
  buildNotProven,
  checkNotRefunded,
  checkPaymentCompleted,
  checkRefunds,
  checkSquareEnvironment,
  classifyPackOutcomeName,
  deriveIdempotencyKey,
  evaluateFeeProbe,
  expectedCentsForCards,
  installConsoleScrubber,
  makeSandboxRunPrefix,
  moneyCents,
  newOwnPayments,
  pollUntil,
  readVerifyConfig,
  redactSquareSecrets,
  resolveSquareApiHost,
  runSandboxVerification,
  sandboxExitCode,
  scrubConsoleText,
  scrubText,
  toPaymentFacts,
  toRefundFacts,
  tokenSecrets,
} from '../scripts/verifyBulkLotPackSquareSandbox';
import { buildScenarioResult, skippedScenario, checkEquals } from '../scripts/verifyBulkLotConcurrency';
import { PACK_MIN_CHARGE_CENTS, assertPackSellableOnline, computePackFees } from '../services/bulkLot/bulkLotPackCheckout';
import { planPackLine } from '../services/bulkLot/bulkLotPackService';
import { MINIMUM_TRANSACTION_FEE_CENTS, getInclusivePlatformFeeRate } from '../utils/feeCalculator';

// Fixtures are built from parts, so no line of this file reads as a real credential or connection string.
const SANDBOX_TOKEN = ['EAAB', 'sandboxVerify', 'Tok3n', '0123456789'].join('');
const OTHER_TOKEN = ['EAAB', 'otherSandbox', 'Tok3n', '9876543210'].join('');
const SQ0_SHAPE = ['sq0', 'atp-', 'abcdefgh12345678'].join('');
const PG = 'postgresql://';
const SCRATCH_URL = `${PG}findasale:findasale@localhost:5432/findasale_bulktest`;
const LOCATION = 'LOC0TEST0001';

const goodEnv = (extra: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
  DATABASE_URL: SCRATCH_URL,
  SQUARE_ENVIRONMENT: 'sandbox',
  [TOKEN_ENV_NAME]: SANDBOX_TOKEN,
  [LOCATION_ENV_NAME]: LOCATION,
  ...extra,
});

describe('SQUARE_ENVIRONMENT must be exactly sandbox', () => {
  it('accepts only the exact text sandbox', () => {
    expect(checkSquareEnvironment('sandbox').ok).toBe(true);
  });

  it('refuses unset, blank, other casing, padded and production', () => {
    for (const v of [undefined, null, '', ' ', 'Sandbox', 'SANDBOX', ' sandbox', 'sandbox ', 'production', 'prod', 'live', 'sandbox2']) {
      const r = checkSquareEnvironment(v as string | undefined | null);
      expect(r.ok).toBe(false);
    }
  });

  it('cuts a long wrong value in the reason', () => {
    const r = checkSquareEnvironment('x'.repeat(500));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeLessThan(200);
  });
});

describe('readVerifyConfig reads the two verify variables and never echoes the token', () => {
  it('accepts a well formed token and location, trimmed', () => {
    const r = readVerifyConfig(goodEnv({ [TOKEN_ENV_NAME]: `  ${SANDBOX_TOKEN}  `, [LOCATION_ENV_NAME]: ` ${LOCATION} ` }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accessToken).toBe(SANDBOX_TOKEN);
      expect(r.locationId).toBe(LOCATION);
    }
  });

  it('uses new variable names with the SQUARE_SANDBOX_VERIFY_ prefix', () => {
    expect(TOKEN_ENV_NAME.startsWith('SQUARE_SANDBOX_VERIFY_')).toBe(true);
    expect(LOCATION_ENV_NAME.startsWith('SQUARE_SANDBOX_VERIFY_')).toBe(true);
    expect(TOKEN_ENV_NAME).not.toBe('SQUARE_SANDBOX_ACCESS_TOKEN');
    expect(LOCATION_ENV_NAME).not.toBe('SQUARE_SANDBOX_LOCATION_ID');
  });

  it('refuses a missing, blank, malformed or short token', () => {
    expect(readVerifyConfig(goodEnv({ [TOKEN_ENV_NAME]: undefined })).ok).toBe(false);
    expect(readVerifyConfig(goodEnv({ [TOKEN_ENV_NAME]: '' })).ok).toBe(false);
    expect(readVerifyConfig(goodEnv({ [TOKEN_ENV_NAME]: '   ' })).ok).toBe(false);
    expect(readVerifyConfig(goodEnv({ [TOKEN_ENV_NAME]: 'short' })).ok).toBe(false);
    expect(readVerifyConfig(goodEnv({ [TOKEN_ENV_NAME]: `${SANDBOX_TOKEN} extra words` })).ok).toBe(false);
    expect(readVerifyConfig(goodEnv({ [TOKEN_ENV_NAME]: `${SANDBOX_TOKEN}"` })).ok).toBe(false);
  });

  it('refuses a missing or malformed location id', () => {
    expect(readVerifyConfig(goodEnv({ [LOCATION_ENV_NAME]: undefined })).ok).toBe(false);
    expect(readVerifyConfig(goodEnv({ [LOCATION_ENV_NAME]: '' })).ok).toBe(false);
    expect(readVerifyConfig(goodEnv({ [LOCATION_ENV_NAME]: 'bad location!' })).ok).toBe(false);
    expect(readVerifyConfig(goodEnv({ [LOCATION_ENV_NAME]: 'abc' })).ok).toBe(false);
  });

  it('refuses a token that equals the production platform token variable', () => {
    const r = readVerifyConfig(goodEnv({ SQUARE_ACCESS_TOKEN: SANDBOX_TOKEN }));
    expect(r.ok).toBe(false);
    expect(readVerifyConfig(goodEnv({ SQUARE_ACCESS_TOKEN: OTHER_TOKEN })).ok).toBe(true);
  });

  it('refuses when the refund kill switch is on, and accepts it off', () => {
    expect(readVerifyConfig(goodEnv({ SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED: '1' })).ok).toBe(false);
    expect(readVerifyConfig(goodEnv({ SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED: '0' })).ok).toBe(true);
    expect(readVerifyConfig(goodEnv({ SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED: '' })).ok).toBe(true);
  });

  it('never puts the token in a refusal reason', () => {
    const envs = [
      goodEnv({ [LOCATION_ENV_NAME]: undefined }),
      goodEnv({ [LOCATION_ENV_NAME]: 'bad location!' }),
      goodEnv({ SQUARE_ACCESS_TOKEN: SANDBOX_TOKEN }),
      goodEnv({ SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED: '1' }),
      goodEnv({ [TOKEN_ENV_NAME]: `${SANDBOX_TOKEN} extra words` }),
    ];
    for (const env of envs) {
      const r = readVerifyConfig(env);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).not.toContain(SANDBOX_TOKEN);
        expect(r.reason).not.toContain('Tok3n');
      }
    }
  });
});

describe('the Square client environment guard', () => {
  it('knows the SDK constants it compares against', () => {
    expect(SquareEnvironment.Sandbox).toBe('https://connect.squareupsandbox.com');
    expect(SquareEnvironment.Production).toBe('https://connect.squareup.com');
  });

  it('resolves the host from baseUrl first, then the environment', () => {
    const a = resolveSquareApiHost({ environment: SquareEnvironment.Sandbox });
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.host).toBe('connect.squareupsandbox.com');
    const b = resolveSquareApiHost({ baseUrl: 'https://example.test', environment: SquareEnvironment.Sandbox });
    expect(b.ok && b.host).toBe('example.test');
    const c = resolveSquareApiHost({ environment: () => SquareEnvironment.Sandbox });
    expect(c.ok).toBe(true);
  });

  it('refuses options that cannot be read, have no environment, are not text or not a URL', () => {
    expect(resolveSquareApiHost(null).ok).toBe(false);
    expect(resolveSquareApiHost(undefined).ok).toBe(false);
    expect(resolveSquareApiHost({}).ok).toBe(false);
    expect(resolveSquareApiHost({ environment: { Sandbox: 'x' } }).ok).toBe(false);
    expect(resolveSquareApiHost({ environment: 'not a url' }).ok).toBe(false);
    expect(resolveSquareApiHost({ environment: () => Promise.resolve(SquareEnvironment.Sandbox) }).ok).toBe(false);
  });

  it('accepts only the SDK Sandbox environment', () => {
    const r = assertSandboxApiOptions({ environment: SquareEnvironment.Sandbox });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.host).toContain('sandbox');
      expect(r.host.endsWith('squareupsandbox.com')).toBe(true);
    }
  });

  it('refuses Production, a missing environment and a baseUrl override (even a sandbox looking one)', () => {
    expect(assertSandboxApiOptions({ environment: SquareEnvironment.Production }).ok).toBe(false);
    expect(assertSandboxApiOptions({}).ok).toBe(false);
    expect(assertSandboxApiOptions(null).ok).toBe(false);
    expect(assertSandboxApiOptions({ environment: SquareEnvironment.Sandbox, baseUrl: SquareEnvironment.Production }).ok).toBe(false);
    expect(assertSandboxApiOptions({ environment: SquareEnvironment.Sandbox, baseUrl: SquareEnvironment.Sandbox }).ok).toBe(false);
  });

  it('refuses look-alike hosts even when the constants are swapped for them', () => {
    const prod = SquareEnvironment.Production;
    for (const lookAlike of [
      'https://connect.squareupsandbox.com.evil.example',
      'https://sandbox.evil.example',
      'https://evilsquareupsandbox.com.example',
      'https://connect.squareup.com',
      'https://connect.squareupsandbox.net',
    ]) {
      expect(assertSandboxApiOptions({ environment: lookAlike }, lookAlike, prod).ok).toBe(false);
    }
    // the only host shape that passes ends in squareupsandbox.com
    expect(assertSandboxApiOptions({ environment: 'https://x.squareupsandbox.com' }, 'https://x.squareupsandbox.com', prod).ok).toBe(true);
  });

  it('refuses a SDK Sandbox constant that ever pointed at the Production URL', () => {
    const r = assertSandboxApiOptions({ environment: SquareEnvironment.Production }, SquareEnvironment.Production, SquareEnvironment.Production);
    expect(r.ok).toBe(false);
  });

  it('checks a client object through its _options', () => {
    expect(assertSandboxClient({ _options: { environment: SquareEnvironment.Sandbox } }).ok).toBe(true);
    expect(assertSandboxClient({ _options: { environment: SquareEnvironment.Production } }).ok).toBe(false);
    expect(assertSandboxClient({}).ok).toBe(false);
    expect(assertSandboxClient(null).ok).toBe(false);
    expect(assertSandboxClient('client').ok).toBe(false);
  });

  it('reads the options of a real SDK client built the way utils/square.ts builds it', () => {
    const sandbox = new SquareClient({ token: SANDBOX_TOKEN, environment: SquareEnvironment.Sandbox });
    const production = new SquareClient({ token: SANDBOX_TOKEN, environment: SquareEnvironment.Production });
    expect(assertSandboxClient(sandbox).ok).toBe(true);
    expect(assertSandboxClient(production).ok).toBe(false);
  });
});

describe('secrets never reach the output', () => {
  it('lists the token and its URL encoded form', () => {
    expect(tokenSecrets(SANDBOX_TOKEN)).toEqual([SANDBOX_TOKEN]);
    expect(tokenSecrets('abc+def/ghi=')).toEqual(['abc+def/ghi=', encodeURIComponent('abc+def/ghi=')]);
    expect(tokenSecrets(undefined)).toEqual([]);
    expect(tokenSecrets('')).toEqual([]);
    expect(tokenSecrets('ab')).toEqual([]);
  });

  it('redactSquareSecrets removes the token, Bearer text, token shapes and postgres URLs, on one line', () => {
    const text = `request failed\nAuthorization: Bearer ${OTHER_TOKEN} for ${SANDBOX_TOKEN} also ${SQ0_SHAPE} and ${PG}u:pw9@db.example.net/x`;
    const out = redactSquareSecrets(text, tokenSecrets(SANDBOX_TOKEN), 1000);
    expect(out).not.toContain(SANDBOX_TOKEN);
    expect(out).not.toContain(OTHER_TOKEN);
    expect(out).not.toContain(SQ0_SHAPE);
    expect(out).not.toContain('pw9');
    expect(out).not.toContain('\n');
    expect(out).toContain('Bearer [redacted]');
  });

  it('redactSquareSecrets cuts long text', () => {
    expect(redactSquareSecrets('x'.repeat(1000), [], 50).length).toBeLessThanOrEqual(53);
  });

  it('scrubText replaces every occurrence and keeps the layout', () => {
    const out = scrubText(`{\n  "a": "${SANDBOX_TOKEN}",\n  "b": "${SANDBOX_TOKEN}"\n}`, [SANDBOX_TOKEN]);
    expect(out).not.toContain(SANDBOX_TOKEN);
    expect(out.split('\n').length).toBe(4);
    expect(scrubText('keep me', [])).toBe('keep me');
    expect(scrubText('keep me', ['ab'])).toBe('keep me');
  });

  it('scrubConsoleText covers the listed secrets, URLs, Bearer text and token shapes without joining lines', () => {
    const out = scrubConsoleText(`line one ${SANDBOX_TOKEN}\nBearer ${OTHER_TOKEN}\n${SQ0_SHAPE} ${PG}u:pw9@db.example.net/x`, [SANDBOX_TOKEN]);
    expect(out).not.toContain(SANDBOX_TOKEN);
    expect(out).not.toContain(OTHER_TOKEN);
    expect(out).not.toContain(SQ0_SHAPE);
    expect(out).not.toContain('pw9');
    expect(out.split('\n').length).toBe(3);
  });

  it('installConsoleScrubber sends every console call to stderr, scrubbed, and restores the console', () => {
    const originalWrite = process.stderr.write;
    const originalLog = console.log;
    const originalError = console.error;
    const written: string[] = [];
    (process.stderr as unknown as { write: (s: string) => boolean }).write = (s: string) => {
      written.push(String(s));
      return true;
    };
    let restore: () => void = () => undefined;
    try {
      restore = installConsoleScrubber([SANDBOX_TOKEN]);
      console.log('log line', SANDBOX_TOKEN);
      console.info({ token: SANDBOX_TOKEN });
      console.warn(new Error(`bad ${SANDBOX_TOKEN}`));
      console.error('plain');
      restore();
    } finally {
      restore();
      process.stderr.write = originalWrite;
    }
    const all = written.join('');
    expect(written.length).toBe(4);
    expect(all).not.toContain(SANDBOX_TOKEN);
    expect(all).toContain('log line');
    expect(all).toContain('plain');
    expect(console.log).toBe(originalLog);
    expect(console.error).toBe(originalError);
  });
});

describe('runSandboxVerification refuses to start (exit code 2) and sends nothing', () => {
  const capture = async (env: Record<string, string | undefined>): Promise<{ code: number; text: string }> => {
    const lines: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args.map((a) => String(a)).join(' '));
    };
    try {
      const code = await runSandboxVerification(env);
      return { code, text: lines.join('\n') };
    } finally {
      console.error = original;
    }
  };

  it('uses exit code 2 for a refusal', () => {
    expect(REFUSAL_EXIT).toBe(2);
  });

  it('refuses a missing or non scratch database', async () => {
    for (const env of [{}, goodEnv({ DATABASE_URL: `${PG}postgres:S3cr3tPw@db.example.com:13949/railway` }), goodEnv({ DATABASE_URL: `${PG}findasale:findasale@localhost:5432/findasale` })]) {
      const r = await capture(env);
      expect(r.code).toBe(2);
      expect(r.text).toMatch(/REFUSED to start/);
      expect(r.text).not.toContain('S3cr3tPw');
      expect(r.text).not.toContain(SANDBOX_TOKEN);
    }
  });

  it('refuses SQUARE_ENVIRONMENT that is not exactly sandbox', async () => {
    for (const v of [undefined, '', 'production', 'Sandbox']) {
      const r = await capture(goodEnv({ SQUARE_ENVIRONMENT: v }));
      expect(r.code).toBe(2);
      expect(r.text).toMatch(/SQUARE_ENVIRONMENT/);
      expect(r.text).not.toContain(SANDBOX_TOKEN);
    }
  });

  it('refuses a missing token or location without printing the token', async () => {
    const a = await capture(goodEnv({ [TOKEN_ENV_NAME]: undefined }));
    expect(a.code).toBe(2);
    expect(a.text).toContain(TOKEN_ENV_NAME);
    const b = await capture(goodEnv({ [LOCATION_ENV_NAME]: undefined }));
    expect(b.code).toBe(2);
    expect(b.text).not.toContain(SANDBOX_TOKEN);
  });

  it('refuses an environment that is not the real process environment, even when everything in it is valid', async () => {
    const r = await capture(goodEnv());
    expect(r.code).toBe(2);
    expect(r.text).toMatch(/REFUSED to start/);
    expect(r.text).toMatch(/process environment/);
    expect(r.text).not.toContain(SANDBOX_TOKEN);
  });
});

describe('Square money and read back helpers', () => {
  it('reads cents from a bigint, number or digit string, and nothing else', () => {
    expect(moneyCents({ amount: BigInt(200), currency: 'USD' })).toBe(200);
    expect(moneyCents({ amount: 75 })).toBe(75);
    expect(moneyCents({ amount: '125' })).toBe(125);
    expect(moneyCents({ amount: '1.5' })).toBeNull();
    expect(moneyCents({ amount: Number.NaN })).toBeNull();
    expect(moneyCents({})).toBeNull();
    expect(moneyCents(null)).toBeNull();
    expect(moneyCents(undefined)).toBeNull();
    expect(moneyCents('200')).toBeNull();
  });

  it('turns an SDK payment into plain facts', () => {
    const f = toPaymentFacts({
      id: 'PAY1',
      status: 'COMPLETED',
      amountMoney: { amount: BigInt(200), currency: 'USD' },
      appFeeMoney: { amount: BigInt(85), currency: 'USD' },
      refundedMoney: { amount: BigInt(100), currency: 'USD' },
      refundIds: ['R1', 7, 'R2'],
      locationId: 'LOC1',
      referenceId: 'ref',
    });
    expect(f).toEqual({ id: 'PAY1', status: 'COMPLETED', amountCents: 200, currency: 'USD', appFeeCents: 85, refundedCents: 100, refundIds: ['R1', 'R2'], locationId: 'LOC1', referenceId: 'ref' });
    const empty = toPaymentFacts(undefined);
    expect(empty.id).toBe('');
    expect(empty.status).toBeNull();
    expect(empty.amountCents).toBeNull();
    expect(empty.refundedCents).toBe(0);
    expect(empty.refundIds).toEqual([]);
  });

  it('turns an SDK refund into plain facts', () => {
    expect(toRefundFacts({ id: 'R1', status: 'COMPLETED', amountMoney: { amount: BigInt(200), currency: 'USD' }, paymentId: 'PAY1' })).toEqual({ id: 'R1', status: 'COMPLETED', amountCents: 200, paymentId: 'PAY1', appFeeCents: null });
    expect(toRefundFacts(null).status).toBeNull();
  });

  it('accepts only COMPLETED and PENDING refunds', () => {
    expect([...ACCEPTED_REFUND_STATUSES].sort()).toEqual(['COMPLETED', 'PENDING']);
  });
});

describe('the app fee probe decision', () => {
  it('uses the app fee only when Square accepted it and reported the same fee', () => {
    const r = evaluateFeeProbe({ chargeOk: true, expectedAppFeeCents: 75, readBackAppFeeCents: 75 });
    expect(r.mode).toBe('WITH_APP_FEE');
  });

  it('falls back to no app fee when Square refused the payment', () => {
    const r = evaluateFeeProbe({ chargeOk: false, errorCode: 'FORBIDDEN', expectedAppFeeCents: 75, readBackAppFeeCents: null });
    expect(r.mode).toBe('NO_APP_FEE');
    expect(r.reason).toContain('FORBIDDEN');
    expect(evaluateFeeProbe({ chargeOk: false, expectedAppFeeCents: 75, readBackAppFeeCents: null }).reason).toContain('no error code');
  });

  it('falls back to no app fee when Square accepted the payment but did not report the fee, or reported another one', () => {
    expect(evaluateFeeProbe({ chargeOk: true, expectedAppFeeCents: 75, readBackAppFeeCents: null }).mode).toBe('NO_APP_FEE');
    expect(evaluateFeeProbe({ chargeOk: true, expectedAppFeeCents: 75, readBackAppFeeCents: 0 }).mode).toBe('NO_APP_FEE');
    expect(evaluateFeeProbe({ chargeOk: true, expectedAppFeeCents: 75, readBackAppFeeCents: 74 }).mode).toBe('NO_APP_FEE');
  });
});

describe('checks on payments and refunds read back from Square', () => {
  const payment = (over: Partial<PaymentFacts> = {}): PaymentFacts => ({
    id: 'PAY1',
    status: 'COMPLETED',
    amountCents: 200,
    currency: 'USD',
    appFeeCents: 85,
    refundedCents: 0,
    refundIds: [],
    locationId: 'LOC1',
    referenceId: 'item_1',
    ...over,
  });
  const refund = (over: Partial<RefundFacts> = {}): RefundFacts => ({ id: 'R1', status: 'COMPLETED', amountCents: 200, paymentId: 'PAY1', appFeeCents: null, ...over });
  const expectation = { cents: 200, locationId: 'LOC1', referenceId: 'item_1', appFeeCents: 85 as number | null };

  it('passes a completed payment that matches', () => {
    expect(checkPaymentCompleted('p', payment(), expectation).every((c) => c.pass)).toBe(true);
    expect(checkPaymentCompleted('p', payment({ appFeeCents: null }), { ...expectation, appFeeCents: null }).every((c) => c.pass)).toBe(true);
  });

  it('fails on a wrong status, amount, currency, location, reference or fee', () => {
    const bad: Array<Partial<PaymentFacts>> = [{ status: 'FAILED' }, { amountCents: 199 }, { currency: 'CAD' }, { locationId: 'LOC2' }, { referenceId: 'other' }, { appFeeCents: 84 }];
    for (const over of bad) expect(checkPaymentCompleted('p', payment(over), expectation).every((c) => c.pass)).toBe(false);
    expect(checkPaymentCompleted('p', payment({ appFeeCents: 10 }), { ...expectation, appFeeCents: null }).every((c) => c.pass)).toBe(false);
  });

  it('compares the reference id cut to 40 characters like createSquareCharge does', () => {
    const long = 'r'.repeat(55);
    expect(checkPaymentCompleted('p', payment({ referenceId: long.slice(0, 40) }), { ...expectation, referenceId: long }).every((c) => c.pass)).toBe(true);
  });

  it('checkNotRefunded passes only with no refund money and no refund ids', () => {
    expect(checkNotRefunded('p', payment()).every((c) => c.pass)).toBe(true);
    expect(checkNotRefunded('p', payment({ refundedCents: 1 })).every((c) => c.pass)).toBe(false);
    expect(checkNotRefunded('p', payment({ refundIds: ['R1'] })).every((c) => c.pass)).toBe(false);
  });

  it('checkRefunds passes a full refund and fails every mismatch', () => {
    const ok = payment({ refundedCents: 200, refundIds: ['R1'] });
    expect(checkRefunds('p', ok, [refund()], 200, 1, true).every((c) => c.pass)).toBe(true);
    expect(checkRefunds('p', ok, [refund({ status: 'PENDING' })], 200, 1, true).every((c) => c.pass)).toBe(true);
    expect(checkRefunds('p', ok, [refund({ status: 'REJECTED' })], 200, 1, true).every((c) => c.pass)).toBe(false);
    expect(checkRefunds('p', ok, [refund({ amountCents: 100 })], 200, 1, true).every((c) => c.pass)).toBe(false);
    expect(checkRefunds('p', ok, [refund({ paymentId: 'PAY2' })], 200, 1, true).every((c) => c.pass)).toBe(false);
    expect(checkRefunds('p', ok, [], 200, 1, true).every((c) => c.pass)).toBe(false);
    expect(checkRefunds('p', payment({ refundedCents: 100, refundIds: ['R1'] }), [refund({ amountCents: 100 })], 200, 1, true).every((c) => c.pass)).toBe(false);
  });

  it('checkRefunds accepts a partial refund when full is not expected, and two refunds adding up', () => {
    const partial = payment({ refundedCents: 100, refundIds: ['R1'] });
    expect(checkRefunds('p', partial, [refund({ amountCents: 100 })], 100, 1, false).every((c) => c.pass)).toBe(true);
    expect(checkRefunds('p', partial, [refund({ amountCents: 100 })], 100, 1, true).every((c) => c.pass)).toBe(false);
    const both = payment({ refundedCents: 200, refundIds: ['R1', 'R2'] });
    expect(checkRefunds('p', both, [refund({ id: 'R1', amountCents: 100 }), refund({ id: 'R2', amountCents: 100 })], 200, 2, true).every((c) => c.pass)).toBe(true);
  });

  it('newOwnPayments counts new payments and those with the run prefix in the reference id', () => {
    const before = [{ id: 'A', referenceId: 'run_item_p1' }];
    const after = [
      { id: 'A', referenceId: 'run_item_p1' },
      { id: 'B', referenceId: 'run_item_p4a' },
      { id: 'C', referenceId: 'someone_else' },
      { id: 'D', referenceId: null },
    ];
    expect(newOwnPayments(before, after, 'run_item_p4')).toEqual({ newTotal: 3, newOwn: ['B'] });
    expect(newOwnPayments(before, before, 'run_item_p4')).toEqual({ newTotal: 0, newOwn: [] });
  });
});

describe('run rules', () => {
  const result = (status: 'PASSED' | 'FAILED') =>
    buildScenarioResult({ name: 'x', calls: [], checks: [checkEquals('c', 1, status === 'PASSED' ? 1 : 2)], durationMs: 1 });

  it('exits 0 only when all five scenarios passed and the cleanup is clean', () => {
    const five = Array.from({ length: SCENARIO_COUNT }, () => result('PASSED'));
    expect(SCENARIO_COUNT).toBe(5);
    expect(sandboxExitCode(five, true)).toBe(0);
    expect(sandboxExitCode(five, false)).toBe(1);
    expect(sandboxExitCode(five.slice(0, 4), true)).toBe(1);
    expect(sandboxExitCode([], true)).toBe(1);
    expect(sandboxExitCode([...five.slice(0, 4), result('FAILED')], true)).toBe(1);
  });

  it('never counts a skipped scenario as a pass', () => {
    const four = Array.from({ length: SCENARIO_COUNT - 1 }, () => result('PASSED'));
    expect(sandboxExitCode([...four, skippedScenario('P5', 'reason')], true)).toBe(1);
  });

  it('classifies the checkout outcomes', () => {
    expect(classifyPackOutcomeName('RECORDED')).toBe('success');
    for (const n of ['REPLAY', 'DUPLICATE_REFUNDED', 'SOLD_OUT_AFTER_PAYMENT']) expect(classifyPackOutcomeName(n)).toBe('refusal');
    for (const n of ['DECLINED', 'RECORD_FAILED', 'nonsense']) expect(classifyPackOutcomeName(n)).toBe('unexpected');
  });

  it('makes a run prefix that is unique, ordered by time and recognizable', () => {
    const a = makeSandboxRunPrefix(1_000_000, () => 0.5);
    expect(a.startsWith('bulksqsb_')).toBe(true);
    expect(a).toBe(makeSandboxRunPrefix(1_000_000, () => 0.5));
    expect(a).not.toBe(makeSandboxRunPrefix(1_000_001, () => 0.5));
    expect(a).not.toBe(makeSandboxRunPrefix(1_000_000, () => 0.25));
    expect(makeSandboxRunPrefix(Date.now()).length).toBeLessThan(30);
  });

  it('derives idempotency keys that are stable, distinct, URL safe and within Square\'s 45 characters', () => {
    const k = deriveIdempotencyKey('bulksqsb_abc_1234', 'probe');
    expect(k).toBe(deriveIdempotencyKey('bulksqsb_abc_1234', 'probe'));
    expect(k).not.toBe(deriveIdempotencyKey('bulksqsb_abc_1234', 'probe-refund'));
    expect(k).not.toBe(deriveIdempotencyKey('bulksqsb_abc_9999', 'probe'));
    expect(k.length).toBeLessThanOrEqual(45);
    expect(k).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('cuts a refund into cumulative half up cents that add up to the sale', () => {
    expect(expectedCentsForCards(200, 500, 1000)).toBe(100);
    expect(expectedCentsForCards(200, 1000, 1000)).toBe(200);
    expect(expectedCentsForCards(201, 500, 1000)).toBe(101);
    expect(expectedCentsForCards(200, 1500, 1000)).toBe(200);
  });

  it('lists what is not proven and names the app fee bypass only when it happened', () => {
    const without = buildNotProven('NO_APP_FEE');
    const withFee = buildNotProven('WITH_APP_FEE');
    expect(without[0]).toMatch(/APPLICATION FEE WAS BYPASSED/);
    expect(without[0]).toContain('squarePaymentService.ts:232');
    expect(withFee[0]).not.toMatch(/BYPASSED/);
    expect(withFee[0]).toMatch(/app fee WAS sent/);
    for (const list of [without, withFee]) {
      expect(list.length).toBeGreaterThanOrEqual(6);
      expect(list.join('\n')).toMatch(/sandbox/i);
      expect(list.join('\n')).toMatch(/HTTP layer/);
      expect(list.join('\n')).toMatch(/browser card token/);
    }
  });
});

describe('barrier and polling', () => {
  it('releases every caller once all parties arrived', async () => {
    const b = new Barrier(2, 5000);
    const order: string[] = [];
    const first = b.arrive().then(() => order.push('first'));
    await Promise.resolve();
    expect(order).toEqual([]);
    const second = b.arrive().then(() => order.push('second'));
    await Promise.all([first, second]);
    expect(order.sort()).toEqual(['first', 'second']);
    expect(b.timedOut).toBe(false);
    await b.arrive();
  });

  it('lets a lone caller through after the timeout and says so', async () => {
    const b = new Barrier(2, 20);
    await b.arrive();
    expect(b.timedOut).toBe(true);
  });

  it('polls until done, then stops', async () => {
    let reads = 0;
    const sleeps: number[] = [];
    const v = await pollUntil(
      async () => ++reads,
      (n) => n >= 3,
      8,
      10,
      async (ms) => {
        sleeps.push(ms);
      }
    );
    expect(v).toBe(3);
    expect(reads).toBe(3);
    expect(sleeps).toEqual([10, 10]);
  });

  it('gives back the last value when it never gets done, after exactly the allowed tries', async () => {
    let reads = 0;
    const v = await pollUntil(
      async () => ++reads,
      () => false,
      4,
      1,
      async () => undefined
    );
    expect(v).toBe(4);
    expect(reads).toBe(4);
  });

  it('does not swallow a read error', async () => {
    await expect(
      pollUntil(
        async () => {
          throw new Error('square down');
        },
        () => true,
        3,
        1,
        async () => undefined
      )
    ).rejects.toThrow('square down');
  });
});

describe('the money assumptions the scenarios rely on, read from the real service functions', () => {
  const tier = 'SIMPLE' as never;
  const feeFor = (cents: number) => computePackFees({ cents, feePercent: getInclusivePlatformFeeRate(tier, 'ONLINE') });
  const planFor = (price: number) => planPackLine({ price, status: 'AVAILABLE', stockTotal: 3 * PACK_SIZE_CARDS, stockSold: 0 }, PACK_SIZE_CARDS, 1, null);

  it('prices the fixture pack at the expected cents, above Square minimum and above the fee floor', () => {
    expect(planFor(PRICE_DOLLARS_PER_THOUSAND).cents).toBe(EXPECTED_PACK_CENTS);
    expect(EXPECTED_PACK_CENTS).toBeGreaterThanOrEqual(PACK_MIN_CHARGE_CENTS);
    expect(feeFor(EXPECTED_PACK_CENTS).platformFeeCents).toBe(MINIMUM_TRANSACTION_FEE_CENTS);
    expect(MINIMUM_TRANSACTION_FEE_CENTS).toBeLessThan(EXPECTED_PACK_CENTS);
    expect(MINIMUM_TRANSACTION_FEE_CENTS / EXPECTED_PACK_CENTS).toBeLessThan(0.6); // Square's cap for payments under 5.00 USD
  });

  it('sells the fixture pack online', () => {
    const fee = feeFor(EXPECTED_PACK_CENTS);
    expect(() => assertPackSellableOnline({ cents: EXPECTED_PACK_CENTS, platformFeeCents: fee.platformFeeCents, shippingRequested: false, couponCode: null, organizerDiscountAmount: 0 })).not.toThrow();
  });

  it('refuses the 40 cent and the 75 cent packs as BULK_PACK_TOO_CHEAP', () => {
    for (const [price, cents] of [
      [0.4, 40],
      [0.75, 75],
    ] as Array<[number, number]>) {
      expect(planFor(price).cents).toBe(cents);
      const fee = feeFor(cents);
      let thrown: unknown = null;
      try {
        assertPackSellableOnline({ cents, platformFeeCents: fee.platformFeeCents, shippingRequested: false, couponCode: null, organizerDiscountAmount: 0 });
      } catch (err) {
        thrown = err;
      }
      expect((thrown as { code?: string } | null)?.code).toBe('BULK_PACK_TOO_CHEAP');
    }
  });

  it('uses the documented sandbox nonce', () => {
    expect(SANDBOX_CARD_NONCE_OK).toBe('cnon:card-nonce-ok');
  });
});

describe('the script source', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'verifyBulkLotPackSquareSandbox.ts');
  const raw = fs.readFileSync(scriptPath, 'utf8');
  // Code only: block comments and whole line comments removed, so the header's prose does not count.
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  it('has no NUL bytes and is plain text', () => {
    expect(raw.includes('\u0000')).toBe(false);
  });

  it('reads only the environment variables the header lists', () => {
    const named = Array.from(code.matchAll(/process\.env\.([A-Z0-9_]+)/g)).map((m) => m[1]);
    const viaEnvArg = Array.from(code.matchAll(/\benv\.([A-Z0-9_]+)/g)).map((m) => m[1]);
    const allowed = new Set(['DATABASE_URL', 'SOCIAL_TOKEN_ENC_KEY', 'SQUARE_ENVIRONMENT', 'SQUARE_ACCESS_TOKEN', 'SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED']);
    for (const n of [...named, ...viaEnvArg]) expect(allowed.has(n)).toBe(true);
    expect(code).toContain('process.env[TOKEN_ENV_NAME]');
    expect(code).not.toMatch(/SQUARE_SANDBOX_ACCESS_TOKEN|SQUARE_SANDBOX_LOCATION_ID/);
    expect(code).not.toMatch(/SQUARE_SANDBOX_APPLICATION/);
  });

  it('names the two new variables with the verify prefix and nothing else new', () => {
    const news = new Set(Array.from(raw.matchAll(/SQUARE_SANDBOX_VERIFY_[A-Z_]+/g)).map((m) => m[0]));
    expect(Array.from(news).sort()).toEqual(['SQUARE_SANDBOX_VERIFY_ACCESS_TOKEN', 'SQUARE_SANDBOX_VERIFY_LOCATION_ID']);
  });

  it('has one environment constant for Production, used only as the comparison default, and no Square URL literal', () => {
    expect(code.match(/SquareEnvironment\.Production/g)?.length).toBe(1);
    expect(code).not.toMatch(/connect\.squareup/);
    expect(code).not.toMatch(/https?:\/\/(?!developer\.squareup\.com)/); // the only URLs in code are documentation links in text
  });

  it('calls Square only through the SDK client: no fetch, http, axios or Square HTTP endpoint', () => {
    expect(code).not.toMatch(/\bfetch\(/);
    expect(code).not.toMatch(/require\(['"]https?['"]\)|from ['"]https?['"]|axios|node-fetch/);
  });

  it('creates one Prisma client and deletes only by id', () => {
    expect(code.match(/new PrismaClient\(/g)?.length).toBe(1);
    const deletes = code.match(/\.deleteMany\(/g) ?? [];
    expect(deletes.length).toBe(1);
    expect(code).toContain('deleteMany({ where: { id: { in: ids } } })');
    expect(code).not.toMatch(/\.delete\(|\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe|TRUNCATE|DROP /i);
  });

  it('never passes the token to a console call or into a message without redaction', () => {
    expect(code).not.toMatch(/console\.[a-z]+\([^)]*accessToken/);
    expect(code).not.toMatch(/console\.[a-z]+\([^)]*TOKEN_ENV_NAME\]/);
  });

  it('checks the guards before any service module is loaded and before any Square call', () => {
    const run = code.indexOf('export async function runSandboxVerification');
    const body = code.slice(run);
    const guardDb = body.indexOf('checkScratchDatabaseUrl(env.DATABASE_URL)');
    const guardEnv = body.indexOf('checkSquareEnvironment(env.SQUARE_ENVIRONMENT)');
    const guardCfg = body.indexOf('readVerifyConfig(env)');
    const guardProc = body.indexOf('env !== process.env');
    const clientGuard = code.indexOf('assertSandboxClient(client)');
    const firstSquareCall = code.indexOf('client.locations.get');
    const firstImport = code.indexOf('await loadModules()');
    expect(guardDb).toBeGreaterThan(-1);
    expect(guardDb).toBeLessThan(guardEnv);
    expect(guardEnv).toBeLessThan(guardCfg);
    expect(guardCfg).toBeLessThan(guardProc);
    expect(firstImport).toBeGreaterThan(code.indexOf('runChecked'));
    expect(clientGuard).toBeGreaterThan(-1);
    expect(clientGuard).toBeLessThan(firstSquareCall);
  });

  it('does not import any database or Square service module at load time', () => {
    const top = raw.slice(0, raw.indexOf('export const SANDBOX_CARD_NONCE_OK'));
    expect(top).not.toMatch(/from '\.\.\/lib\/prisma'/);
    expect(top).not.toMatch(/from '\.\.\/utils\/square'/);
    expect(top).not.toMatch(/from '\.\.\/utils\/tokenCrypto'/);
    expect(top).not.toMatch(/from '\.\.\/services\/squarePaymentService'/);
    expect(top).not.toMatch(/from '\.\.\/services\/squareRefundService'/);
  });

  it('documents the fidelity analysis, the doc links, the run recipe and the exit codes in its header', () => {
    for (const needle of [
      'FIDELITY',
      'WHAT THIS SCRIPT DRIVES FOR REAL',
      'WHAT CANNOT BE REPRODUCED',
      'HOW TO RUN',
      '$env:SQUARE_ENVIRONMENT="sandbox"',
      'developer.squareup.com/docs/devtools/sandbox/payments',
      'developer.squareup.com/docs/payments-api/take-payments-and-collect-fees',
      'developer.squareup.com/reference/square/payments-api/create-payment',
      'squarePaymentService.ts:222',
      'test-transaction',
      'NOT PROVEN',
    ]) {
      expect(raw).toContain(needle);
    }
  });
});
