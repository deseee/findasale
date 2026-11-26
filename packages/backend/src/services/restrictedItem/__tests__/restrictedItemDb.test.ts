/**
 * Restricted-item classification against a REAL Postgres with all migrations applied (CI's findasale_test database).
 * Proves the database half: the invalidation trigger catches a raw-SQL writer, the audit trigger logs class changes,
 * the compare-and-set reclassification, the admin override and the organizer suspension writers, and the gate's
 * DB re-read end to end.
 *
 * Uses its own PrismaClient (same reason as holdInvoiceClaim.test.ts: lib/prisma pulls in Sentry and timers). Never
 * point at production: it creates and deletes rows (jest.guard.js refuses non-local hosts).
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('../../../lib/prisma', () => ({ prisma: {} }));

import { readItemClassificationRows, reclassifyItemsById, setRestrictedClassOverride, type RawSqlClient } from '../restrictedClassStore';
import { setOrganizerCardSuspension, type SuspensionTxClient } from '../cardSuspensionService';
import { assertCardAllowedForItems, type GateDeps } from '../cardPaymentGate';
import { classificationColumnsForCreate } from '../itemWriteHooks';

if (!process.env.DATABASE_URL) {
  throw new Error('restrictedItemDb.test.ts requires DATABASE_URL pointing at a throwaway Postgres with migrations applied.');
}

const prisma = new PrismaClient();
const db = prisma as unknown as RawSqlClient;
const RUN = randomUUID().slice(0, 8);
const rid = (s: string) => `rid-${RUN}-${s}`;
const USER = rid('user');
const ADMIN = rid('admin');
const ORG = rid('org');
const SALE = rid('sale');

async function makeItem(id: string, title: string) {
  await prisma.item.create({
    data: { id, title, saleId: SALE, organizerId: ORG, embedding: [], price: 10, ...(classificationColumnsForCreate({ title }) as any) },
  });
}

const gateDeps = (): GateDeps => ({
  db,
  audit: (row) =>
    prisma.restrictedItemAuditLog.create({
      data: { ...row, source: row.source, detail: row.detail as any },
    }),
  readSuspension: async (organizerId) => {
    const o = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { cardPaymentsSuspendedAt: true } });
    return { exists: !!o, suspendedAt: o?.cardPaymentsSuspendedAt ?? null };
  },
});

beforeAll(async () => {
  await prisma.user.create({ data: { id: USER, email: `${USER}@example.invalid`, name: 'Org' } as any });
  await prisma.organizer.create({ data: { id: ORG, userId: USER, businessName: 'Test Org', address: '1 Main St' } as any });
  await prisma.sale.create({
    data: {
      id: SALE,
      organizerId: ORG,
      title: 'Test Sale',
      address: '1 Main St',
      city: 'Paw Paw',
      state: 'MI',
      zip: '49079',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000),
      status: 'PUBLISHED',
    } as any,
  });
});

afterAll(async () => {
  await prisma.restrictedItemAuditLog.deleteMany({ where: { OR: [{ organizerId: ORG }, { itemId: { startsWith: `rid-${RUN}` } }] } });
  await prisma.item.deleteMany({ where: { id: { startsWith: `rid-${RUN}` } } });
  await prisma.sale.deleteMany({ where: { id: SALE } });
  await prisma.organizer.deleteMany({ where: { id: ORG } });
  await prisma.user.deleteMany({ where: { id: USER } });
  await prisma.$disconnect();
});

describe('restricted-item classification (real database)', () => {
  it('a restricted create is audited by the insert trigger', async () => {
    const id = rid('knife');
    await makeItem(id, 'Bowie Knife');
    const log = await prisma.restrictedItemAuditLog.findFirst({ where: { itemId: id, kind: 'CLASSIFICATION_CHANGE' } });
    expect(log?.newClass).toBe('KNIFE');
  });

  it('a raw-SQL title change marks the row stale, the gate reclassifies it, and the ratchet keeps the class', async () => {
    const id = rid('rename');
    await makeItem(id, 'Hunting Knife');
    await prisma.$executeRaw`UPDATE "Item" SET "title" = 'Kitchen Tool' WHERE "id" = ${id}`;
    const [stale] = await readItemClassificationRows(db, [id]);
    expect(stale.restrictedClassifiedAt).toBeNull();
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: id, amountCents: 1000 }], ORG, { path: 'test' }, gateDeps());
    expect(d.blocked[0].restrictedClass).toBe('KNIFE');
    const [fresh] = await readItemClassificationRows(db, [id]);
    expect(fresh.restrictedClassifiedAt).not.toBeNull();
    expect(fresh.restrictedClass).toBe('KNIFE');
  });

  it('a raw-SQL change into a restricted title raises the class at payment time and audits it', async () => {
    const id = rid('raise');
    await makeItem(id, 'Lamp');
    await prisma.$executeRaw`UPDATE "Item" SET "title" = 'Pearl Necklace' WHERE "id" = ${id}`;
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: id, amountCents: 1000 }], ORG, { path: 'test' }, gateDeps());
    expect(d.allCash).toBe(true);
    const change = await prisma.restrictedItemAuditLog.findFirst({ where: { itemId: id, kind: 'CLASSIFICATION_CHANGE', newClass: 'JEWELRY' } });
    expect(change?.source).toBe('GATE');
    const block = await prisma.restrictedItemAuditLog.findFirst({ where: { organizerId: ORG, kind: 'PAYMENT_BLOCK', itemIds: { has: id } } });
    expect(block?.processor).toBe('FINIX');
  });

  it('compare-and-set: a classification computed from old inputs does not land after a concurrent edit', async () => {
    const id = rid('cas');
    await makeItem(id, 'Lamp');
    const [before] = await readItemClassificationRows(db, [id]);
    await prisma.$executeRaw`UPDATE "Item" SET "title" = 'Pocket Knife' WHERE "id" = ${id}`;
    const { reclassifyRow } = await import('../restrictedClassStore');
    const out = await reclassifyRow(db, before, 'TEST');
    expect(out.persisted).toBe(false);
    const [after] = await readItemClassificationRows(db, [id]);
    expect(after.restrictedClassifiedAt).toBeNull(); // still stale, so the gate will classify the real title
    const all = await reclassifyItemsById(db, [id], 'TEST');
    expect(all[0].storedClass).toBe('KNIFE');
  });

  it('rk-2 rule change: an untouched kitchen knife stored KNIFE by the older rules is card-allowed, a ratcheted one is not', async () => {
    const chef = rid('chef');
    const held = rid('held');
    await makeItem(chef, 'Wusthof Chef Knife');
    await makeItem(held, 'Wusthof Chef Knife');
    // Simulate rows classified by rk-1, which blocked every knife: one untouched, one held up by the ratchet.
    await prisma.$executeRaw`UPDATE "Item" SET "restrictedClass" = 'KNIFE', "restrictedClassAuto" = 'KNIFE',
      "restrictedClassifierVersion" = 'rk-1-2026-11-06', "restrictedClassifiedAt" = NOW() WHERE "id" = ${chef}`;
    await prisma.$executeRaw`UPDATE "Item" SET "restrictedClass" = 'KNIFE', "restrictedClassAuto" = 'NONE',
      "restrictedClassifierVersion" = 'rk-1-2026-11-06', "restrictedClassifiedAt" = NOW() WHERE "id" = ${held}`;
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: chef, amountCents: 1000 }, { itemId: held, amountCents: 1000 }], ORG, { path: 'test' }, gateDeps());
    expect(d.allowed.map((a) => a.itemId)).toEqual([chef]);
    expect(d.blocked.map((b) => b.itemId)).toEqual([held]);
    const [fresh] = await readItemClassificationRows(db, [chef]);
    expect(fresh.restrictedClass).toBe('NONE');
    const change = await prisma.restrictedItemAuditLog.findFirst({ where: { itemId: chef, kind: 'CLASSIFICATION_CHANGE', newClass: 'NONE' } });
    expect(change?.oldClass).toBe('KNIFE');
  });

  it('admin override clears and restores, with audit rows', async () => {
    const id = rid('override');
    await makeItem(id, 'Butter Knife Set plus Hunting Knife');
    const cleared = await setRestrictedClassOverride(db, { itemId: id, override: 'NONE', reason: 'Reviewed', adminUserId: ADMIN });
    expect(cleared).toMatchObject({ found: true, previousEffective: 'KNIFE', newEffective: 'NONE' });
    const d = await assertCardAllowedForItems('FINIX', [{ itemId: id, amountCents: 1000 }], ORG, { path: 'test' }, gateDeps());
    expect(d.allCardAllowed).toBe(true);
    await setRestrictedClassOverride(db, { itemId: id, override: null, reason: 'Back to automatic', adminUserId: ADMIN });
    const d2 = await assertCardAllowedForItems('FINIX', [{ itemId: id, amountCents: 1000 }], ORG, { path: 'test' }, gateDeps());
    expect(d2.allCash).toBe(true);
    const rows = await prisma.restrictedItemAuditLog.findMany({ where: { itemId: id, kind: 'ADMIN_OVERRIDE' } });
    expect(rows.map((r) => r.actorUserId)).toEqual([ADMIN, ADMIN]);
  });

  it('organizer suspension: set blocks every card line on Square, clear restores it, both audited', async () => {
    const id = rid('plain');
    await makeItem(id, 'Lamp');
    const set = await setOrganizerCardSuspension(prisma as unknown as SuspensionTxClient, { organizerId: ORG, suspend: true, reason: 'Review', adminUserId: ADMIN });
    expect(set?.cardPaymentsSuspendedAt).toBeInstanceOf(Date);
    const d = await assertCardAllowedForItems('SQUARE', [{ itemId: id, amountCents: 1000 }], ORG, { path: 'test' }, gateDeps());
    expect(d.organizerCardSuspended).toBe(true);
    expect(d.allCash).toBe(true);
    await setOrganizerCardSuspension(prisma as unknown as SuspensionTxClient, { organizerId: ORG, suspend: false, reason: 'Cleared', adminUserId: ADMIN });
    const d2 = await assertCardAllowedForItems('SQUARE', [{ itemId: id, amountCents: 1000 }], ORG, { path: 'test' }, gateDeps());
    expect(d2.allCardAllowed).toBe(true);
    const kinds = (await prisma.restrictedItemAuditLog.findMany({ where: { organizerId: ORG, kind: { startsWith: 'SUSPENSION' } }, orderBy: { createdAt: 'asc' } })).map((r) => r.kind);
    expect(kinds).toEqual(['SUSPENSION_SET', 'SUSPENSION_CLEARED']);
    expect(await setOrganizerCardSuspension(prisma as unknown as SuspensionTxClient, { organizerId: rid('nobody'), suspend: true, reason: 'x', adminUserId: ADMIN })).toBeNull();
  });
});
