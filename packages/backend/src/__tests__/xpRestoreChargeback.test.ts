/**
 * xpService.restoreChargebackXp (2026-09-30): reverses a chargeback XP claw-back after a WON dispute, through the
 * existing PointsTransaction ledger. Prisma is a jest mock with an in-memory ledger.
 */
const ledger: Array<{ userId: string; type: string; points: number; purchaseId: string | null; description?: string }> = [];
const guildXp: Record<string, number> = { u1: 100 };
jest.mock('../lib/prisma', () => ({
  prisma: {
    pointsTransaction: {
      findMany: jest.fn(async ({ where }: any) =>
        ledger.filter((l) => l.userId === where.userId && l.purchaseId === where.purchaseId && where.type.in.includes(l.type)).map((l) => ({ type: l.type, points: l.points }))),
      create: jest.fn(async ({ data }: any) => { ledger.push(data); return data; }),
    },
    user: {
      update: jest.fn(async ({ where, data }: any) => { guildXp[where.id] += data.guildXp.increment ?? 0; return {}; }),
    },
  },
}));

import { prisma } from '../lib/prisma';
import { restoreChargebackXp } from '../services/xpService';

const db: any = prisma;

beforeEach(() => {
  ledger.length = 0;
  guildXp.u1 = 100;
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('restoreChargebackXp', () => {
  it('adds back exactly the clawed-back XP and writes a CHARGEBACK_XP_RESTORE ledger row tagged with the dispute', async () => {
    ledger.push({ userId: 'u1', type: 'CHARGEBACK_XP_CLAWBACK', points: -30, purchaseId: 'p1' });
    const restored = await restoreChargebackXp('p1', 'u1', 'disp_9');
    expect(restored).toBe(30);
    expect(guildXp.u1).toBe(130);
    const row = ledger[ledger.length - 1];
    expect(row).toMatchObject({ userId: 'u1', type: 'CHARGEBACK_XP_RESTORE', points: 30, purchaseId: 'p1' });
    expect(row.description).toContain('disp_9');
  });

  it('is idempotent: a second call finds nothing left to restore', async () => {
    ledger.push({ userId: 'u1', type: 'CHARGEBACK_XP_CLAWBACK', points: -30, purchaseId: 'p1' });
    await restoreChargebackXp('p1', 'u1', 'disp_9');
    expect(await restoreChargebackXp('p1', 'u1', 'disp_9')).toBe(0);
    expect(guildXp.u1).toBe(130);
    expect(ledger.filter((l) => l.type === 'CHARGEBACK_XP_RESTORE')).toHaveLength(1);
  });

  it('restores nothing when no XP was clawed back for the purchase', async () => {
    expect(await restoreChargebackXp('p2', 'u1', 'disp_9')).toBe(0);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(ledger).toHaveLength(0);
  });

  it('only counts the clawback rows of this purchase and user', async () => {
    ledger.push({ userId: 'u1', type: 'CHARGEBACK_XP_CLAWBACK', points: -30, purchaseId: 'other' });
    ledger.push({ userId: 'u2', type: 'CHARGEBACK_XP_CLAWBACK', points: -99, purchaseId: 'p1' });
    expect(await restoreChargebackXp('p1', 'u1', 'disp_9')).toBe(0);
  });
});
