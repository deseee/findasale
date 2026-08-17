/**
 * Hold-to-Pay invoice claim — DB-backed regression suite.
 *
 * WHY THIS FILE EXISTS
 * On 2026-08-16 a P0 took Hold-to-Pay invoice creation down platform-wide for ~12 days.
 * markSoldAndCreateInvoice took its in-flight claim by writing a `CLAIMING:<holdId>` sentinel
 * string into `ItemReservation.invoiceId`. That column carries a live Postgres foreign key to
 * `HoldInvoice.id` (`ItemReservation_invoiceId_fkey`, created by migration
 * 20260330_add_hold_invoice) that schema.prisma never declared. So:
 *   - `tsc` accepted the write (Prisma's generated types knew of no FK),
 *   - every mocked-Prisma unit test accepted it (no database, no constraint),
 *   - and Postgres rejected it with P2003 on literally every request.
 * The failure was invisible to every gate the repo had. The ONLY thing that catches this class
 * of bug is a test executing against a real Postgres with the real migrations applied — which
 * CI did not have until this suite landed alongside the pgvector/pgvector:pg16 service
 * container in .github/workflows/ci-typecheck.yml.
 *
 * The first test below is the one that would have caught the P0.
 *
 * REQUIRES A REAL DATABASE. It fails loudly rather than skipping when DATABASE_URL is unset —
 * a regression gate that silently no-ops is exactly the failure mode being fixed here.
 * In CI, DATABASE_URL points at the postgres service container. Locally:
 *   $env:DATABASE_URL="postgresql://findasale:findasale@localhost:5432/findasale"
 *   pnpm --filter ./packages/backend test -- --testPathPattern=holdInvoiceClaim
 * Never point this at production: it creates and deletes rows.
 *
 * Uses its own PrismaClient rather than ../lib/prisma deliberately — lib/prisma pulls in Sentry,
 * installs a 5-minute pool-monitor setInterval and process signal handlers, none of which belong
 * in a test process. The claim helpers under test are pure functions with no prisma dependency.
 */

import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  invoiceableWhere,
  isInvoicedOrClaimed,
  INVOICE_CLAIM_TTL_MS,
} from '../services/holdInvoiceClaim';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'holdInvoiceClaim.test.ts requires DATABASE_URL pointing at a throwaway Postgres with ' +
      '`prisma migrate deploy` already applied. Refusing to run without one — a DB regression ' +
      'test that skips itself when the DB is missing is worse than no test at all.'
  );
}

const prisma = new PrismaClient();

// Run-scoped id prefix so parallel/rerun executions cannot collide, and so afterAll can delete
// exactly this run's rows and nothing else.
const RUN = randomUUID().slice(0, 8);
const rid = (suffix: string) => `hic-${RUN}-${suffix}`;

const ORGANIZER_USER_ID = rid('orguser');
const SHOPPER_USER_ID = rid('shopper');
const ORGANIZER_ID = rid('org');
const SALE_ID = rid('sale');

/** Sequence counter so each seedHolds() call gets its own untouched item/reservation rows. */
let seq = 0;

/**
 * Creates `n` fresh AVAILABLE items on the test sale, each with a PENDING ItemReservation held
 * by the test shopper. Returns the reservation ids. Fresh rows per test keep the three tests
 * order-independent.
 */
async function seedHolds(n: number): Promise<string[]> {
  const group = ++seq;
  const holdIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const itemId = rid(`item-${group}-${i}`);
    const holdId = rid(`hold-${group}-${i}`);
    await prisma.item.create({
      data: {
        id: itemId,
        title: `Claim test item ${group}-${i}`,
        price: 25,
        status: 'AVAILABLE',
        saleId: SALE_ID,
        photoUrls: [],
        embedding: [],
      },
    });
    await prisma.itemReservation.create({
      data: {
        id: holdId,
        itemId,
        userId: SHOPPER_USER_ID,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    holdIds.push(holdId);
  }
  return holdIds;
}

/**
 * The exact compare-and-swap claim markSoldAndCreateInvoice performs
 * (reservationController.ts ~:1411). Kept byte-for-byte equivalent on purpose: if the production
 * claim shape changes, this helper must change with it or these tests stop guarding anything.
 */
const claim = (holdIds: string[], token: string) =>
  prisma.itemReservation.updateMany({
    where: {
      id: { in: holdIds },
      status: { in: ['PENDING', 'CONFIRMED'] },
      ...invoiceableWhere(),
    },
    data: { invoiceClaimToken: token, invoiceClaimedAt: new Date() },
  });

/** The finalize step from inside the transaction (reservationController.ts ~:1546). */
const finalize = (holdIds: string[], token: string, invoiceId: string) =>
  prisma.itemReservation.updateMany({
    where: { id: { in: holdIds }, invoiceClaimToken: token },
    data: { invoiceId, invoiceClaimToken: null, invoiceClaimedAt: null },
  });

async function makeInvoice(label: string): Promise<string> {
  const invoice = await prisma.holdInvoice.create({
    data: {
      id: rid(`invoice-${label}`),
      shopperUserId: SHOPPER_USER_ID,
      organizerUserId: ORGANIZER_USER_ID,
      saleId: SALE_ID,
      totalAmount: 5000,
      platformFeeAmount: 500,
      itemIds: [],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return invoice.id;
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: ORGANIZER_USER_ID,
      email: `${ORGANIZER_USER_ID}@holdclaim.test`,
      name: 'Claim Test Organizer',
      role: 'ORGANIZER',
      roles: ['USER', 'ORGANIZER'],
    },
  });
  await prisma.user.create({
    data: {
      id: SHOPPER_USER_ID,
      email: `${SHOPPER_USER_ID}@holdclaim.test`,
      name: 'Claim Test Shopper',
      role: 'USER',
      roles: ['USER'],
    },
  });
  await prisma.organizer.create({
    data: {
      id: ORGANIZER_ID,
      userId: ORGANIZER_USER_ID,
      businessName: 'Claim Test Estate Sales',
      address: '219 E Michigan Ave',
    },
  });
  const start = new Date();
  await prisma.sale.create({
    data: {
      id: SALE_ID,
      title: 'Hold claim regression sale',
      startDate: start,
      endDate: new Date(start.getTime() + 24 * 60 * 60 * 1000),
      address: '219 E Michigan Ave',
      city: 'Paw Paw',
      state: 'MI',
      zip: '49079',
      organizerId: ORGANIZER_ID,
      status: 'PUBLISHED',
    },
  });
});

afterAll(async () => {
  // FK-safe order. ItemReservation -> HoldInvoice is ON DELETE SET NULL, so reservations go
  // first; Item -> ItemReservation and Sale -> Item cascade, but deleting explicitly keeps the
  // teardown honest about what it removed.
  try {
    await prisma.itemReservation.deleteMany({ where: { id: { startsWith: `hic-${RUN}-` } } });
    await prisma.holdInvoice.deleteMany({ where: { saleId: SALE_ID } });
    await prisma.item.deleteMany({ where: { saleId: SALE_ID } });
    await prisma.sale.deleteMany({ where: { id: SALE_ID } });
    await prisma.organizer.deleteMany({ where: { id: ORGANIZER_ID } });
    await prisma.user.deleteMany({ where: { id: { in: [ORGANIZER_USER_ID, SHOPPER_USER_ID] } } });
  } finally {
    await prisma.$disconnect();
  }
});

describe('holdInvoiceClaim — DB-backed regression suite', () => {
  /**
   * TEST 1 — the one that would have caught the 2026-08-16 P0.
   *
   * Two assertions, and both matter:
   *   (a) the current claim (invoiceClaimToken / invoiceClaimedAt, both non-FK columns) is
   *       accepted by Postgres and leaves invoiceId untouched at null;
   *   (b) the OLD claim (a `CLAIMING:<holdId>` sentinel in invoiceId) is still rejected by
   *       Postgres with P2003. (b) is what proves the FK is genuinely live in the test database
   *       — without it, (a) passing would prove nothing, because a database missing the
   *       constraint would let the broken code through just as happily.
   */
  it('claims holds without violating ItemReservation_invoiceId_fkey', async () => {
    const holdIds = await seedHolds(2);
    const token = randomUUID();

    const claimed = await claim(holdIds, token);
    expect(claimed.count).toBe(holdIds.length);

    const rows = await prisma.itemReservation.findMany({
      where: { id: { in: holdIds } },
      select: { id: true, invoiceId: true, invoiceClaimToken: true, invoiceClaimedAt: true },
    });
    expect(rows).toHaveLength(holdIds.length);
    // invoiceId means one thing only: a real HoldInvoice row exists. Claiming must not touch it.
    expect(rows.every(r => r.invoiceId === null)).toBe(true);
    expect(rows.every(r => r.invoiceClaimToken === token)).toBe(true);
    expect(rows.every(r => r.invoiceClaimedAt !== null)).toBe(true);
    // A live claim must be visible to every read site that checks availability.
    expect(rows.every(r => isInvoicedOrClaimed(r))).toBe(true);

    // The regression itself: the old sentinel write must still be rejected by the live FK.
    let sentinelError: any = null;
    try {
      await prisma.itemReservation.updateMany({
        where: { id: { in: holdIds } },
        data: { invoiceId: `CLAIMING:${holdIds[0]}` },
      });
    } catch (err) {
      sentinelError = err;
    }
    expect(sentinelError).not.toBeNull();
    expect(sentinelError.code).toBe('P2003');

    // ...and the rejected write left nothing behind.
    const after = await prisma.itemReservation.findMany({
      where: { id: { in: holdIds } },
      select: { invoiceId: true },
    });
    expect(after.every(r => r.invoiceId === null)).toBe(true);
  });

  /**
   * TEST 2 — the claim is a genuine compare-and-swap, not a check-then-act.
   *
   * Two mark-sold requests racing on the same holds: exactly one may come away with a full
   * claim. The loser must come away with a short count (production then returns 409) — or, if
   * Postgres resolves the row-lock contention as a deadlock, with a rejection. Both are
   * acceptable losses; two winners is not, because that is two Stripe Checkout Sessions and two
   * HoldInvoices for one set of holds.
   */
  it('rejects a second concurrent claim on the same holds', async () => {
    const holdIds = await seedHolds(2);
    const tokenA = randomUUID();
    const tokenB = randomUUID();

    const results = await Promise.allSettled([claim(holdIds, tokenA), claim(holdIds, tokenB)]);

    const fullClaims = results.filter(
      r => r.status === 'fulfilled' && r.value.count === holdIds.length
    );
    expect(fullClaims).toHaveLength(1);

    // And the database agrees: one single token owns every row.
    const rows = await prisma.itemReservation.findMany({
      where: { id: { in: holdIds } },
      select: { invoiceId: true, invoiceClaimToken: true },
    });
    const tokens = new Set(rows.map(r => r.invoiceClaimToken));
    expect(tokens.size).toBe(1);
    const winner = [...tokens][0];
    expect([tokenA, tokenB]).toContain(winner);
    expect(rows.every(r => r.invoiceId === null)).toBe(true);
  });

  /**
   * TEST 3 — the fencing-token property the bounded claim TTL depends on.
   *
   * INVOICE_CLAIM_TTL_MS exists so a request that died mid-Stripe-call cannot strand holds
   * forever. That steal is only safe if the abandoned request can never come back and finalize
   * over the top of whoever stole from it. The fence is the per-attempt token: finalize only
   * stamps rows still carrying THIS attempt's token, so a stolen-from request gets count 0,
   * `finalize.count !== holdIds.length` trips, and the transaction rolls back with
   * InvoiceClaimLostError instead of writing a second invoiceId over the winner's rows.
   *
   * Without this property the TTL is not a safety valve, it is a double-sell.
   */
  it('steals a claim older than INVOICE_CLAIM_TTL_MS but the loser cannot finalize', async () => {
    const holdIds = await seedHolds(2);
    const tokenA = randomUUID();

    // Request A claims, then stalls (e.g. inside the Stripe Checkout Session call).
    expect((await claim(holdIds, tokenA)).count).toBe(holdIds.length);

    // Age A's claim past the TTL — the same thing wall-clock time would do.
    await prisma.itemReservation.updateMany({
      where: { id: { in: holdIds } },
      data: { invoiceClaimedAt: new Date(Date.now() - INVOICE_CLAIM_TTL_MS - 60_000) },
    });

    const stale = await prisma.itemReservation.findMany({
      where: { id: { in: holdIds } },
      select: { invoiceId: true, invoiceClaimedAt: true },
    });
    // A stale claim must read as free, or nothing could ever steal it.
    expect(stale.every(r => !isInvoicedOrClaimed(r))).toBe(true);

    // Request B steals it through the ordinary claim path — no special-case steal logic.
    const tokenB = randomUUID();
    expect((await claim(holdIds, tokenB)).count).toBe(holdIds.length);

    // B finalizes: real HoldInvoice id onto rows still carrying B's token.
    const invoiceB = await makeInvoice('b');
    expect((await finalize(holdIds, tokenB, invoiceB)).count).toBe(holdIds.length);

    // A wakes up and tries to finalize its own invoice. The fence must stop it dead.
    const invoiceA = await makeInvoice('a');
    const loserFinalize = await finalize(holdIds, tokenA, invoiceA);
    expect(loserFinalize.count).toBe(0);
    // This is the exact condition markSoldAndCreateInvoice tests before throwing
    // InvoiceClaimLostError and rolling the whole transaction back.
    expect(loserFinalize.count).not.toBe(holdIds.length);

    // The winner's invoice is intact and unclobbered.
    const rows = await prisma.itemReservation.findMany({
      where: { id: { in: holdIds } },
      select: { invoiceId: true, invoiceClaimToken: true, invoiceClaimedAt: true },
    });
    expect(rows.every(r => r.invoiceId === invoiceB)).toBe(true);
    expect(rows.every(r => r.invoiceClaimToken === null)).toBe(true);
    expect(rows.every(r => r.invoiceClaimedAt === null)).toBe(true);
  });
});
