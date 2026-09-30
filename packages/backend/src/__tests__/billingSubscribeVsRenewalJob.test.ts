/**
 * Subscribe vs the daily renewal job: ONE charge per organizer period (2026-09-30).
 *
 * The two real code paths (controllers/billingController.ts createSquareBillingSubscription and
 * jobs/squareBillingChargeJob.ts processOrganizerBilling) run against the REAL organizerBillingLedger
 * over an in-memory OrganizerBillingCharge table (unique organizerId + periodKey, PENDING/COMPLETED/FAILED
 * semantics), an in-memory Organizer row and a counting fake of chargeStoredCard. No Square or database
 * call is possible. The DST checks assert exact UTC-millisecond periods in WHATEVER zone the process runs
 * in; run the file as `TZ=America/New_York npx jest src/__tests__/billingSubscribeVsRenewalJob.test.ts`
 * to exercise a DST zone (Jest copies process.env, so the zone cannot be set from inside a test).
 */

// ---------------------------------------------------------------- in-memory state
type LedgerRow = {
  id: string; organizerId: string; periodKey: string; kind: string; tier: string; amountCents: number;
  status: string; squarePaymentId: string | null; failureReason: string | null; attempts: number;
  updatedAt: Date; createdAt: Date; completedAt: Date | null;
};
let ledger: LedgerRow[] = [];
let seq = 0;
let org: any;
let charges: Array<{ amountCents: number; key: string[] }> = [];
let chargeGate: Promise<void> | null = null;
let chargeResult: { ok: boolean; message?: string } = { ok: true };
let cardGate: Promise<void> | null = null;
let failNextGrant = false;

const ledgerMatches = (r: any, where: any): boolean =>
  Object.entries(where).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('not' in v) return r[k] !== v.not;
      if ('gte' in v) return r[k].getTime() >= v.gte.getTime();
      if ('startsWith' in v || 'contains' in v) {
        return (v.startsWith === undefined || String(r[k]).startsWith(v.startsWith)) &&
          (v.contains === undefined || String(r[k]).includes(v.contains));
      }
    }
    if (v instanceof Date) return r[k].getTime() === v.getTime();
    return r[k] === v;
  });
const applyLedger = (r: any, data: any) => {
  for (const [k, v] of Object.entries<any>(data)) {
    if (v && typeof v === 'object' && 'increment' in v) r[k] += v.increment;
    else r[k] = v;
  }
  r.updatedAt = new Date();
};
const applyOrg = (data: any) => {
  const { tokenVersion, ...plain } = data;
  org = { ...org, ...plain };
};
const sameInstant = (a: any, b: any) =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

jest.mock('square', () => ({ SquareError: class SquareError extends Error {} }));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../utils/square', () => ({ getSquarePlatformClient: jest.fn() }));
jest.mock('../utils/stripe', () => ({ getStripe: () => ({}) }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/syncTier', () => ({ syncTier: jest.fn(), notifyAutoMarkdownsPaused: jest.fn() }));
jest.mock('../services/tierGraceService', () => ({
  calculateDowngradeDelta: jest.fn(),
  triggerGracePeriod: jest.fn(),
  clearGracePeriod: jest.fn().mockResolvedValue({ itemsRestored: 0, membersRestored: 0 }),
}));
jest.mock('../services/squarePaymentService', () => ({
  toSquareMoney: (n: number) => ({ amount: BigInt(n), currency: 'USD' }),
  buildSquareIdempotencyKey: (parts: string[]) => parts.join('|').slice(0, 45),
}));
jest.mock('../services/squareBillingService', () => ({
  ...jest.requireActual('../services/squareBillingService'),
  createPlatformBillingCard: async () => {
    if (cardGate) await cardGate;
    return { customerId: 'cust_new', cardId: 'card_new' };
  },
  chargeStoredCard: async (p: any) => {
    charges.push({ amountCents: p.amountCents, key: p.idempotencyParts });
    if (chargeGate) await chargeGate;
    return chargeResult.ok
      ? { ok: true, paymentId: `pay_${charges.length}`, status: 'COMPLETED' }
      : { ok: false, message: chargeResult.message ?? 'Card declined' };
  },
}));
jest.mock('../lib/prisma', () => ({
  prisma: {
    organizerBillingCharge: {
      create: async ({ data }: any) => {
        if (ledger.some((r) => r.organizerId === data.organizerId && r.periodKey === data.periodKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const now = new Date();
        const row: LedgerRow = {
          id: `chg_${++seq}`, squarePaymentId: null, failureReason: null, completedAt: null,
          attempts: 1, createdAt: now, updatedAt: now, ...data,
        };
        ledger.push(row);
        return { id: row.id };
      },
      findUnique: async ({ where }: any) => {
        const k = where.organizerId_periodKey;
        return ledger.find((r) => r.organizerId === k.organizerId && r.periodKey === k.periodKey) ?? null;
      },
      findFirst: async ({ where }: any) => {
        const hits = ledger.filter((r) => ledgerMatches(r, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return hits[0] ?? null;
      },
      updateMany: async ({ where, data }: any) => {
        const hit = ledger.filter((r) => ledgerMatches(r, where));
        hit.forEach((r) => applyLedger(r, data));
        return { count: hit.length };
      },
    },
    organizer: {
      findUnique: async ({ where }: any) => (where.userId === 'user_1' || where.id === 'org_1' ? { ...org } : null),
      findMany: async ({ where }: any) => {
        const now = new Date();
        const due =
          org.billingProcessor === where.billingProcessor &&
          org.squareCustomerId && org.squareCardId &&
          org.billingCurrentPeriodEnd && new Date(org.billingCurrentPeriodEnd).getTime() <= now.getTime() &&
          (!org.billingNextRetryAt || new Date(org.billingNextRetryAt).getTime() <= now.getTime());
        return due ? [{ ...org, businessName: 'Biz', user: { email: 'a@b.c', name: 'A' }, userId: 'user_1' }] : [];
      },
      update: async ({ where, data }: any) => {
        if (where.billingCurrentPeriodEnd !== undefined && !sameInstant(where.billingCurrentPeriodEnd, org.billingCurrentPeriodEnd)) {
          throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
        }
        if (failNextGrant && data.subscriptionTier) {
          failNextGrant = false;
          throw new Error('db write failed');
        }
        applyOrg(data);
        return { ...org, userId: 'user_1' };
      },
      updateMany: async ({ where, data }: any) => {
        if (where.billingCurrentPeriodEnd !== undefined && !sameInstant(where.billingCurrentPeriodEnd, org.billingCurrentPeriodEnd)) {
          return { count: 0 };
        }
        applyOrg(data);
        return { count: 1 };
      },
    },
    userRoleSubscription: {
      upsert: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
  },
}));

import { createSquareBillingSubscription } from '../controllers/billingController';
import { processOrganizerBilling } from '../jobs/squareBillingChargeJob';
import { addDaysUtc } from '../utils/billingPeriod';

const DAY = 24 * 60 * 60 * 1000;

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(b: any) { this.body = b; return this; },
  };
  return res;
}
const subscribe = async (tier: 'PRO' | 'TEAMS', sourceId = 'cnon:x') => {
  const res = makeRes();
  await createSquareBillingSubscription({ user: { id: 'user_1' }, body: { tier, sourceId } } as any, res);
  return res;
};
const flush = async (n = 30) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const waitFor = async (cond: () => boolean) => { for (let i = 0; i < 400 && !cond(); i++) await Promise.resolve(); expect(cond()).toBe(true); };
// Fake ONLY Date (timers and microtasks stay real so the awaited fakes below keep working).
const fakeDate = (iso: string) =>
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
const gate = () => {
  let release!: () => void;
  const p = new Promise<void>((r) => { release = r; });
  return { p, release };
};

let T0: Date;
const dunningOrg = (over: any = {}) => ({
  id: 'org_1', userId: 'user_1', businessName: 'Biz',
  billingProcessor: 'square', squareCustomerId: 'cust_old', squareCardId: 'card_old',
  subscriptionTier: 'PRO', subscriptionStatus: 'past_due', trialEndsAt: null,
  billingCurrentPeriodEnd: T0, billingNextRetryAt: null, billingDunningFailCount: 1, billingGraceEndsAt: null,
  ...over,
});

beforeEach(() => {
  jest.useRealTimers();
  ledger = []; seq = 0; charges = [];
  chargeGate = null; cardGate = null; chargeResult = { ok: true }; failNextGrant = false;
  T0 = new Date(Date.now() - 1 * DAY);
  org = dunningOrg();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

const completedRows = () => ledger.filter((r) => r.status === 'COMPLETED');

describe('dunning organizer (period end T0 in the past): job and subscribe are mutually exclusive', () => {
  it('job charging, subscribe arrives mid-charge: 409 in progress, exactly ONE charge in total', async () => {
    const g = gate(); chargeGate = g.p;
    const jobP = processOrganizerBilling();
    await waitFor(() => charges.length === 1);

    const res = await subscribe('PRO');
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('PAYMENT_IN_PROGRESS');
    expect(charges).toHaveLength(1);

    g.release();
    await jobP;
    expect(charges).toHaveLength(1);
    expect(completedRows()).toHaveLength(1);
    expect(ledger[0].periodKey).toBe(`renewal:${T0.toISOString()}`);
    expect(org.subscriptionStatus).toBe('active');
    expect(new Date(org.billingCurrentPeriodEnd).getTime()).toBe(T0.getTime() + 30 * DAY);
  });

  it('subscribe charging, the job runs mid-charge: the job skips it, exactly ONE charge in total', async () => {
    const g = gate(); chargeGate = g.p;
    const subP = subscribe('PRO');
    await waitFor(() => charges.length === 1);

    await processOrganizerBilling(); // due row is still T0: the job must NOT charge it a second time
    expect(charges).toHaveLength(1);

    g.release();
    const res = await subP;
    expect(res.statusCode).toBe(200);
    expect(charges).toHaveLength(1);
    expect(completedRows()).toHaveLength(1);
    expect(ledger[0].periodKey).toBe(`renewal:${T0.toISOString()}`); // subscribe claimed the JOB's key
    expect(ledger[0].kind).toBe('SUBSCRIBE');
    expect(org.subscriptionStatus).toBe('active');
  });

  it('job already paid the period, then the SAME tier subscribes: ALREADY_ACTIVE, still ONE charge', async () => {
    await processOrganizerBilling();
    expect(charges).toHaveLength(1);
    const res = await subscribe('PRO');
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ALREADY_ACTIVE');
    expect(charges).toHaveLength(1);
  });

  it('job paid PRO, then TEAMS is requested: a prorated DIFFERENCE upgrade, never a second full-price period', async () => {
    await processOrganizerBilling();
    const res = await subscribe('TEAMS');
    expect(res.statusCode).toBe(200);
    expect(res.body.mode).toBe('upgrade');
    expect(charges).toHaveLength(2);
    expect(charges[0].amountCents).toBe(2900);
    expect(charges[1].amountCents).toBeGreaterThan(0);
    expect(charges[1].amountCents).toBeLessThanOrEqual(7900 - 2900);
  });

  it('subscribe read the organizer BEFORE the job paid the period: it finds the paid row, does not charge, 409 changed', async () => {
    const cg = gate(); cardGate = cg.p;
    const subP = subscribe('PRO'); // reads the org (period T0) then waits on the card gate
    await flush();
    await processOrganizerBilling(); // the job pays and advances the period meanwhile
    expect(charges).toHaveLength(1);

    cg.release();
    const res = await subP;
    expect(charges).toHaveLength(1); // still one
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SUBSCRIPTION_CHANGED');
    expect(new Date(org.billingCurrentPeriodEnd).getTime()).toBe(T0.getTime() + 30 * DAY);
  });

  it('subscribe paid TEAMS but activation crashed: the next job run heals the period AND the paid tier, no second charge', async () => {
    failNextGrant = true;
    const res = await subscribe('TEAMS');
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('ACTIVATION_PENDING');
    expect(charges).toHaveLength(1);
    expect(charges[0].amountCents).toBe(7900);
    expect(org.subscriptionTier).toBe('PRO'); // grant never landed

    await processOrganizerBilling();
    expect(charges).toHaveLength(1); // the job saw the COMPLETED row and did not charge
    expect(org.subscriptionTier).toBe('TEAMS'); // healed to the tier that was PAID
    expect(org.subscriptionStatus).toBe('active');
    expect(new Date(org.billingCurrentPeriodEnd).getTime()).toBe(T0.getTime() + 30 * DAY);
  });

  it('subscribe paid, activation crashed, subscribe retried: re-applies the grant, still ONE charge', async () => {
    failNextGrant = true;
    await subscribe('PRO');
    const res = await subscribe('PRO', 'cnon:retry');
    expect(res.statusCode).toBe(200);
    expect(charges).toHaveLength(1);
    expect(org.subscriptionStatus).toBe('active');
  });

  it('declined subscribe, then the job: the FAILED row is reclaimed and the period is paid exactly once', async () => {
    chargeResult = { ok: false, message: 'Card declined' };
    const declined = await subscribe('PRO');
    expect(declined.statusCode).toBe(402);
    expect(ledger[0].status).toBe('FAILED');

    chargeResult = { ok: true };
    await processOrganizerBilling();
    expect(charges).toHaveLength(2); // one declined attempt, one paid
    expect(completedRows()).toHaveLength(1);
    expect(ledger).toHaveLength(1); // ONE row for the period, across both paths
    expect(org.subscriptionStatus).toBe('active');
  });
});

describe('paid PRO with a failed grant, then TEAMS the same day (no period end on file)', () => {
  beforeEach(() => {
    org = dunningOrg({ subscriptionTier: 'SIMPLE', subscriptionStatus: 'canceled', billingCurrentPeriodEnd: null, billingDunningFailCount: 0 });
  });

  it('grants the PAID PRO and does not charge TEAMS on top', async () => {
    failNextGrant = true;
    const first = await subscribe('PRO');
    expect(first.statusCode).toBe(500);
    expect(charges).toHaveLength(1);

    const second = await subscribe('TEAMS', 'cnon:teams');
    expect(second.statusCode).toBe(200);
    expect(charges).toHaveLength(1); // never silently double charged
    expect(org.subscriptionTier).toBe('PRO'); // the tier that was actually paid
    expect(second.body).toMatchObject({ tier: 'PRO', tierAdjusted: true, requestedTier: 'TEAMS', chargedCents: 2900 });
    expect(ledger).toHaveLength(1);
  });

  it('same protection across UTC midnight', async () => {
    fakeDate('2026-09-29T23:58:00.000Z');
    failNextGrant = true;
    await subscribe('PRO');
    jest.setSystemTime(new Date('2026-09-30T00:05:00.000Z'));
    const second = await subscribe('TEAMS', 'cnon:teams');
    expect(second.statusCode).toBe(200);
    expect(charges).toHaveLength(1);
    expect(org.subscriptionTier).toBe('PRO');
  });

  it('after the PRO grant landed, TEAMS is a prorated upgrade (the organizer can still move up, paying only the difference)', async () => {
    await subscribe('PRO');
    const res = await subscribe('TEAMS', 'cnon:teams');
    expect(res.body.mode).toBe('upgrade');
    expect(charges).toHaveLength(2);
    expect(charges[1].amountCents).toBeLessThanOrEqual(5000);
  });
});

describe('period arithmetic is exact UTC milliseconds across a DST change (any process zone)', () => {
  it('the job advances a period that crosses the November DST end by exactly 30 x 24h', async () => {
    // 2026-10-20 12:00Z + 30 days crosses the US fall-back on 2026-11-01. In a New York zone the old local
    // setDate landed 1h off; the exact-millisecond period must hold in every zone.
    const start = new Date('2026-10-20T12:00:00.000Z');

    org = dunningOrg({ billingCurrentPeriodEnd: start, billingDunningFailCount: 0, subscriptionStatus: 'active' });
    fakeDate('2026-10-20T13:00:00.000Z');
    await processOrganizerBilling();
    expect(charges).toHaveLength(1);
    expect(new Date(org.billingCurrentPeriodEnd).getTime()).toBe(start.getTime() + 30 * DAY);
    expect(addDaysUtc(start, 30).getTime()).toBe(start.getTime() + 30 * DAY);
  });

  it('subscribe (new period) grants exactly 30 x 24h', async () => {
    org = dunningOrg({ subscriptionTier: 'SIMPLE', subscriptionStatus: 'canceled', billingCurrentPeriodEnd: null });
    const now = new Date('2026-10-20T12:00:00.000Z');
    fakeDate(now.toISOString());
    const res = await subscribe('PRO');
    expect(res.statusCode).toBe(200);
    expect(new Date(org.billingCurrentPeriodEnd).getTime()).toBe(now.getTime() + 30 * DAY);
  });
});
