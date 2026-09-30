/**
 * organizerBillingLedger (2026-09-29): claim / complete / fail semantics against an in-memory fake of
 * the OrganizerBillingCharge table (unique organizerId+periodKey, updatedAt bump on update).
 */
type Row = { id: string; organizerId: string; periodKey: string; kind: string; tier: string; amountCents: number; status: string; squarePaymentId: string | null; failureReason: string | null; attempts: number; updatedAt: Date; completedAt: Date | null };
let table: Row[] = [];
let seq = 0;

const matches = (r: Row, where: any) =>
  Object.entries(where).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && 'not' in v) return (r as any)[k] !== v.not;
    if (v instanceof Date) return (r as any)[k].getTime() === v.getTime();
    return (r as any)[k] === v;
  });
const applyData = (r: Row, data: any) => {
  for (const [k, v] of Object.entries<any>(data)) {
    if (v && typeof v === 'object' && 'increment' in v) (r as any)[k] += v.increment;
    else (r as any)[k] = v;
  }
  r.updatedAt = new Date(Date.now());
};

jest.mock('../../lib/prisma', () => ({
  prisma: {
    organizerBillingCharge: {
      create: async ({ data }: any) => {
        if (table.some(r => r.organizerId === data.organizerId && r.periodKey === data.periodKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row: Row = { id: `chg_${++seq}`, squarePaymentId: null, failureReason: null, completedAt: null, updatedAt: new Date(Date.now()), attempts: 1, ...data };
        table.push(row);
        return { id: row.id };
      },
      findUnique: async ({ where }: any) => {
        const k = where.organizerId_periodKey;
        return table.find(r => r.organizerId === k.organizerId && r.periodKey === k.periodKey) ?? null;
      },
      updateMany: async ({ where, data }: any) => {
        const hit = table.filter(r => matches(r, where));
        hit.forEach(r => applyData(r, data));
        return { count: hit.length };
      },
    },
  },
}));

import { claimBillingCharge, completeBillingCharge, failBillingCharge, PENDING_STALE_MS } from '../organizerBillingLedger';

const P = { organizerId: 'org_1', periodKey: 'renewal:2026-09-01T00:00:00.000Z', kind: 'RENEWAL' as const, tier: 'PRO', amountCents: 2900 };

beforeEach(() => { table = []; seq = 0; });

describe('claimBillingCharge', () => {
  it('first claim creates a PENDING row', async () => {
    const c = await claimBillingCharge(P);
    expect(c.state).toBe('claimed');
    expect(table).toHaveLength(1);
    expect(table[0].status).toBe('PENDING');
  });

  it('a second concurrent claim for the same period is in_progress, never a second row', async () => {
    await claimBillingCharge(P);
    const c2 = await claimBillingCharge(P);
    expect(c2.state).toBe('in_progress');
    expect(table).toHaveLength(1);
  });

  it('after COMPLETED, a claim reports already_completed with the payment id (no re-charge)', async () => {
    const c = await claimBillingCharge(P);
    await completeBillingCharge((c as any).id, 'pay_1');
    const again = await claimBillingCharge(P);
    expect(again).toMatchObject({ state: 'already_completed', paymentId: 'pay_1' });
  });

  it('after FAILED, the same period can be re-claimed (dunning retry) and attempts increments', async () => {
    const c = await claimBillingCharge(P);
    expect(await failBillingCharge((c as any).id, 'Card declined')).toBe(true);
    const retry = await claimBillingCharge(P);
    expect(retry.state).toBe('claimed');
    expect(table[0].status).toBe('PENDING');
    expect(table[0].attempts).toBe(2);
    expect(table[0].failureReason).toBeNull();
  });

  it('a stale PENDING row (crashed attempt) can be re-claimed; a fresh one cannot', async () => {
    await claimBillingCharge(P);
    const realNow = Date.now;
    try {
      Date.now = () => table[0].updatedAt.getTime() + PENDING_STALE_MS - 1000;
      expect((await claimBillingCharge(P)).state).toBe('in_progress');
      Date.now = () => table[0].updatedAt.getTime() + PENDING_STALE_MS + 1000;
      expect((await claimBillingCharge(P)).state).toBe('claimed');
    } finally {
      Date.now = realNow;
    }
  });

  it('different periods are independent', async () => {
    expect((await claimBillingCharge(P)).state).toBe('claimed');
    expect((await claimBillingCharge({ ...P, periodKey: 'renewal:2026-10-01T00:00:00.000Z' })).state).toBe('claimed');
    expect(table).toHaveLength(2);
  });

  it('rethrows an unexpected database error instead of pretending the claim worked', async () => {
    const { prisma } = require('../../lib/prisma');
    const orig = prisma.organizerBillingCharge.create;
    prisma.organizerBillingCharge.create = async () => { throw new Error('connection reset'); };
    await expect(claimBillingCharge(P)).rejects.toThrow('connection reset');
    prisma.organizerBillingCharge.create = orig;
  });
});

describe('COMPLETED is terminal', () => {
  it('failBillingCharge returns false and does NOT overwrite a COMPLETED row', async () => {
    const c = await claimBillingCharge(P);
    await completeBillingCharge((c as any).id, 'pay_1');
    expect(await failBillingCharge((c as any).id, 'Card declined')).toBe(false);
    expect(table[0].status).toBe('COMPLETED');
    expect(table[0].squarePaymentId).toBe('pay_1');
    expect(table[0].failureReason).toBeNull();
  });

  it('completeBillingCharge wins over a FAILED row', async () => {
    const c = await claimBillingCharge(P);
    await failBillingCharge((c as any).id, 'Card declined');
    await completeBillingCharge((c as any).id, 'pay_2');
    expect(table[0].status).toBe('COMPLETED');
    expect(table[0].completedAt).toBeInstanceOf(Date);
  });
});
