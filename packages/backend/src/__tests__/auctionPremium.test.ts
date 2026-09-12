/**
 * Auction close paths — platform-locked buyer premium, reserve parity, fee snapshot, XP parity.
 *
 * WHAT THIS SUITE EXISTS FOR (all confirmed live on 2026-08-17):
 *
 *   1. THE PREMIUM IS A PLATFORM RATE. `Sale.buyersPremiumPct` was briefly an
 *      organizer-settable 0-50% control; it is RETIRED (Patrick ruling, same day) because the
 *      premium goes into the platform's application fee — it is FindA.Sale's own revenue, so
 *      an organizer setting it was an organizer setting the platform's income. These tests
 *      deliberately WRITE a value into the retired column and assert the charge IGNORES it.
 *      That direction matters: the column still exists in the database (dropping it is
 *      destructive and queued separately), so "nothing reads it" needs a test, not a comment.
 *
 *   2. `services/auctionService.closeAuction` — reachable from the organizer's manual
 *      "Close Auction" button (POST /api/items/:itemId/close-auction) — had NO reserve-price
 *      check, while the cron has always had one. An organizer could click their own button and
 *      sell a lot below their own reserve, charging the bidder. The rule now lives once, in
 *      utils/auctionRules.evaluateAuctionReserve, and both paths call it.
 *
 *   3. FEE SNAPSHOT. `Purchase.platformFeeAmount` holds the COMBINED premium + commission with
 *      no record of the split, so organizer earnings recomputed it from live config — an
 *      organizer upgrading SIMPLE -> PRO silently restated the fee on every past sale. The
 *      charge paths now pin the split at charge time; these tests assert they do.
 *
 *   4. XP PARITY. The cron awarded AUCTION_WIN XP and the manual button did not, so an
 *      identical outcome paid a different reward purely because of which mechanism closed the
 *      lot. Both now award, once, with the same amount, multiplier and monthly cap.
 *
 * Stripe removal (2026-09-12): both auction-winner charge paths (jobs/auctionJob.ts's cron and
 * services/auctionService.ts's closeAuction, the organizer's manual button) were converted to
 * Square in an earlier pass this session (Square migration Wave S2 #2, 2026-09-09) — a
 * Square-onboarded organizer's winner charge now goes through
 * squareCheckoutLinkService.createSquareCheckoutLink (a Square Payment Link) instead of
 * Stripe's paymentIntents.create / checkout.sessions.create. This suite's fixture organizer was
 * still seeded Stripe-only, so every test here was silently hitting the "organizer is not
 * Square-eligible, skip payment link creation" fallback branch instead of the real charge path
 * it exists to verify — a stale-fixture false pass, not a real one, caught by the CI break this
 * session's Square-only enforcement caused. Rewritten to seed a Square-onboarded organizer and
 * mock createSquareCheckoutLink directly; the fee/premium/reserve/XP arithmetic under test is
 * unchanged by which processor issues the link, since both paths compute
 * amountCents/appFeeCents identically before handing them to whichever processor is eligible.
 * auctionService.ts's Square branch (unlike its old Stripe branch, which deferred Purchase
 * creation to a checkout.session.completed webhook) creates its own PENDING Purchase row
 * inline, so several assertions below now read that row directly instead of inspecting a
 * mocked Stripe call's line-item/metadata shape — a more direct and more accurate check of the
 * exact same underlying fee split.
 *
 * MOCKING NOTES (read before editing):
 *   - `services/auctionService.ts` imports `prisma` from `../index`, which is the Express entry
 *     point — importing it boots the HTTP server, Socket.io, Redis, Sentry and ~80 cron jobs.
 *     `../index` is mocked to re-export the same singleton from `../lib/prisma`, which is
 *     exactly what index.ts itself does (index.ts:291). Same object, no server boot.
 *   - `jobs/auctionJob.ts` calls `cron.schedule(...)` at module scope. `node-cron` is mocked so
 *     importing the job does not register a live 5-minute timer inside the test process.
 *   - `createSquareCheckoutLink` is mocked (via `jest.requireActual` + override, so the real
 *     `getSquareOrderPaymentStatus`/`deleteSquareCheckoutLink` exports stay real/unused rather
 *     than silently undefined); email and notification side effects are mocked; the assertions
 *     are about the Square call's arguments and the resulting DB rows, which are the parts that
 *     move money. `Purchase.squarePaymentLinkId` is NOT `@unique` (unlike HoldInvoice's own
 *     column of the same name) so, unlike some sibling suites, a single shared mocked
 *     resolved value is safe to reuse across every test in this file — no per-test-unique id
 *     is required here.
 */

import { prisma } from '../lib/prisma';

// ── Mocks (hoisted by ts-jest above the var declarations — `var`, not `const`, deliberately) ──
var mockCreateSquareCheckoutLink = jest.fn();

jest.mock('../services/squareCheckoutLinkService', () => {
  const actual = jest.requireActual('../services/squareCheckoutLinkService');
  return {
    ...actual,
    createSquareCheckoutLink: (...args: any[]) => mockCreateSquareCheckoutLink(...args),
  };
});

// auctionService.ts: `import { prisma } from '../index'` — see MOCKING NOTES above.
jest.mock('../index', () => ({
  get prisma() {
    return require('../lib/prisma').prisma;
  },
}));

// auctionJob.ts registers a real cron at import time.
jest.mock('node-cron', () => ({
  __esModule: true,
  default: { schedule: jest.fn() },
  schedule: jest.fn(),
}));

jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/emailService', () => ({
  emailService: { emails: { send: jest.fn().mockResolvedValue({ id: 'mock' }) } },
}));

jest.mock('../services/suppressionService', () => ({
  suppressionService: { isHardSuppressed: jest.fn().mockResolvedValue(false) },
}));

// XP: the cap is PERMISSIVE by default (it used to be mocked at 0, which silently suppressed
// every award and would have hidden an XP-parity regression entirely). Individual tests
// override it to assert the exhausted-cap branch.
var mockAwardXp = jest.fn();
var mockCheckMonthlyXpCap = jest.fn();
jest.mock('../services/xpService', () => ({
  awardXp: mockAwardXp,
  applyHuntPassMultiplier: jest.fn(async (_u: string, xp: number) => xp),
  checkMonthlyXpCap: mockCheckMonthlyXpCap,
  XP_AWARDS: { AUCTION_WIN: 20 },
}));

jest.mock('../services/marketplaceStockSyncService', () => ({
  syncMarketplaceStock: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports AFTER the mocks ──────────────────────────────────────────────────────────────
import { endAuctions } from '../jobs/auctionJob';
import { closeAuction } from '../services/auctionService';
import { evaluateAuctionReserve } from '../utils/auctionRules';
import { AUCTION_BUYER_PREMIUM_RATE, resolveOrganizerFeeReport } from '../utils/feeCalculator';

describe('Auction close — configured premium & reserve parity', () => {
  let organizerUser: any;
  let organizer: any;
  let bidder: any;

  beforeAll(async () => {
    process.env.FRONTEND_URL = 'http://localhost:3000';

    organizerUser = await prisma.user.create({
      data: {
        id: 'test-org-user-auction-premium',
        email: 'org-auction-premium@findasale.test',
        name: 'Auction Premium Organizer',
        password: 'hashed_password',
        role: 'ORGANIZER',
      },
    });
    organizer = await prisma.organizer.create({
      data: {
        businessName: 'Auction Premium Estate Sales',
        phone: '5551110099',
        address: '100 Test Ave',
        userId: organizerUser.id,
        subscriptionTier: 'SIMPLE',
        squareOnboarded: true,
        squareMerchantId: 'sq-merchant-auction-premium',
        squareLocationId: 'sq-location-auction-premium',
        cashFeeBalance: 0,
      },
    });
    bidder = await prisma.user.create({
      data: {
        id: 'test-bidder-auction-premium',
        email: 'bidder-auction-premium@findasale.test',
        name: 'Auction Premium Bidder',
        password: 'hashed_password',
        role: 'USER',
      },
    });

    // Fee-precedence fix (2026-08-22): a wildcard FeeStructure row can no longer override the
    // organizer's tier rate anywhere (see utils/feeCalculator.ts). Cleared anyway as a
    // defensive no-op in case a stray row from another suite is present.
    await prisma.feeStructure.deleteMany({ where: { listingType: '*' } }).catch(() => {});
  });

  afterAll(async () => {
    await prisma.purchase.deleteMany({ where: { userId: bidder?.id } }).catch(() => {});
    await prisma.bid.deleteMany({ where: { userId: bidder?.id } }).catch(() => {});
    await prisma.item.deleteMany({ where: { sale: { organizerId: organizer?.id } } }).catch(() => {});
    await prisma.sale.deleteMany({ where: { organizerId: organizer?.id } }).catch(() => {});
    if (organizer) await prisma.organizer.delete({ where: { id: organizer.id } }).catch(() => {});
    if (organizerUser) await prisma.user.delete({ where: { id: organizerUser.id } }).catch(() => {});
    if (bidder) await prisma.user.delete({ where: { id: bidder.id } }).catch(() => {});
    delete process.env.FRONTEND_URL;
  });

  beforeEach(() => {
    mockCreateSquareCheckoutLink.mockReset();
    mockAwardXp.mockReset();
    mockAwardXp.mockResolvedValue(undefined);
    mockCheckMonthlyXpCap.mockReset();
    mockCheckMonthlyXpCap.mockResolvedValue(1000); // permissive unless a test says otherwise
    // Not @unique on Purchase (see file header) -- one shared resolved value for every call.
    mockCreateSquareCheckoutLink.mockResolvedValue({
      ok: true,
      paymentLinkId: 'sqpl_auctionpremium',
      orderId: 'sqorder_auctionpremium',
      url: 'https://squareup.com/pay/auctionpremium',
      longUrl: null,
    });
  });

  /** An auction lot whose end time has already passed, with one bid on it. */
  const makeEndedLot = async (opts: {
    title: string;
    buyersPremiumPct?: number | null;
    coversFee?: boolean;
    reservePrice?: number | null;
    bidAmount: number;
    endedAlready?: boolean;
  }) => {
    // `buyersPremiumPct` writes the RETIRED column directly. Nothing in the app can set it any
    // more (no UI, and saleController's zod schema 400s on it), so this fixture is the only way
    // to prove the charge paths ignore what is already sitting in production rows.
    const sale = await prisma.sale.create({
      data: {
        title: `Auction premium — ${opts.title}`,
        description: 'Created by auctionPremium.test.ts — safe to delete',
        address: '100 Test Ave',
        city: 'Springfield',
        state: 'MI',
        zip: '49503',
        lat: 42.9629,
        lng: -85.6789,
        // Dated in the PAST deliberately: a PUBLISHED sale dated inside the next 7 days lands in
        // weeklyDigest.e2e's "sales happening this weekend" window, and a fixture leaking across
        // suites fails an unrelated test. Neither close path reads the sale's dates.
        startDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 60 * 60 * 1000),
        status: 'PUBLISHED',
        isAuctionSale: true,
        saleType: 'AUCTION',
        ...(opts.coversFee ? { coversFee: true } : {}),
        ...(opts.buyersPremiumPct === null || opts.buyersPremiumPct === undefined
          ? {}
          : { buyersPremiumPct: opts.buyersPremiumPct }),
        organizerId: organizer.id,
      },
    });
    const item = await prisma.item.create({
      data: {
        embedding: [],
        title: `Lot — ${opts.title}`,
        listingType: 'AUCTION',
        auctionStartPrice: 10.0,
        currentBid: opts.bidAmount,
        auctionReservePrice: opts.reservePrice ?? null,
        auctionEndTime: opts.endedAlready === false
          ? new Date(Date.now() + 60 * 60 * 1000)
          : new Date(Date.now() - 60 * 1000),
        auctionClosed: false,
        status: 'AVAILABLE',
        saleId: sale.id,
      },
    });
    await prisma.bid.create({
      data: { itemId: item.id, userId: bidder.id, amount: opts.bidAmount },
    });
    return { sale, item };
  };

  // ── jobs/auctionJob.ts — the LIVE winner charge path ────────────────────────────────────
  describe('jobs/auctionJob.endAuctions — platform-locked premium on the winner charge', () => {
    it('should charge the PLATFORM 5%, IGNORING a 15% left in the retired column', async () => {
      // THE POINT OF THIS TEST: `Sale.buyersPremiumPct` still exists as a column and can still
      // hold a value (a legacy row, a direct DB write). A prior pass made that value
      // authoritative on the charge path — an organizer could set FindA.Sale's own revenue.
      // Reversed. A stored 15% must have no effect whatsoever on what the winner is charged.
      const { item } = await makeEndedLot({
        title: 'cron ignores stored 15pct',
        buyersPremiumPct: 15,
        bidAmount: 200,
      });

      await endAuctions();

      const call = mockCreateSquareCheckoutLink.mock.calls.find(
        (c) => c[0]?.metadata?.itemId === item.id
      );
      expect(call).toBeDefined();
      // $200 hammer + the platform 5% => $210.00. NOT the $230.00 the stored 15% would give.
      expect(call![0].amountCents).toBe(21000);
      expect(call![0].amountCents).not.toBe(23000);
      // appFeeCents = $10.00 premium + $20.00 SIMPLE commission.
      expect(call![0].appFeeCents).toBe(1000 + 2000);
      // Organizer still nets $180.00.
      expect(call![0].amountCents - call![0].appFeeCents).toBe(18000);

      // The PENDING Purchase must record what the buyer was actually charged.
      const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
      expect(purchase?.amount).toBe(210);
      expect(purchase?.platformFeeAmount).toBe(30);
      expect(purchase?.status).toBe('PENDING');
      console.log('✓ auctionJob: stored 15% ignored, winner charged $210.00 at the platform 5%');
    });

    it('should charge the platform 5% even when the retired column says 0', async () => {
      // The mirror of the test above, and the more dangerous direction: a stored 0 used to mean
      // "this auction earns FindA.Sale no premium at all". It must now be inert too.
      const { item } = await makeEndedLot({
        title: 'cron ignores stored 0pct',
        buyersPremiumPct: 0,
        bidAmount: 200,
      });

      await endAuctions();

      const call = mockCreateSquareCheckoutLink.mock.calls.find(
        (c) => c[0]?.metadata?.itemId === item.id
      );
      expect(call).toBeDefined();
      expect(call![0].amountCents).toBe(21000);            // premium still charged
      expect(call![0].amountCents).not.toBe(20000);         // the "organizer zeroed us out" bug
      expect(call![0].appFeeCents).toBe(3000);              // $10 premium + $20 commission
      console.log('✓ auctionJob: stored 0% ignored, platform still collects its 5%');
    });

    it('should charge the platform 5% on a sale with nothing in the column', async () => {
      const { item } = await makeEndedLot({
        title: 'cron unset',
        buyersPremiumPct: null,
        bidAmount: 200,
      });

      await endAuctions();

      const call = mockCreateSquareCheckoutLink.mock.calls.find(
        (c) => c[0]?.metadata?.itemId === item.id
      );
      expect(call![0].amountCents).toBe(21000);
      expect(call![0].appFeeCents).toBe(1000 + 2000);
      console.log('✓ auctionJob: unset column, 5% charged');
    });

    it('should write the fee SNAPSHOT so the split never has to be recomputed', async () => {
      const { item } = await makeEndedLot({
        title: 'cron snapshot',
        bidAmount: 200,
      });

      await endAuctions();

      const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
      expect(purchase).toBeTruthy();
      expect(purchase!.buyerPremiumAmount).toBe(10);
      expect(purchase!.buyerPremiumRate).toBe(AUCTION_BUYER_PREMIUM_RATE);
      expect(purchase!.commissionAmount).toBe(20);
      expect(purchase!.commissionRate).toBe(0.1);
      expect(purchase!.organizerAbsorbedPremium).toBe(false);
      // THE INVARIANT: the two components reconstruct the combined application fee.
      expect(purchase!.buyerPremiumAmount! + purchase!.commissionAmount!).toBe(
        purchase!.platformFeeAmount
      );

      // And reporting PREFERS it: the organizer sees $200 gross / $20 fee even if we hand the
      // helper a PRO tier rate, because the row records that it was charged at SIMPLE.
      const report = resolveOrganizerFeeReport(purchase as any, 0.08);
      expect(report.grossSalePrice).toBe(200);
      expect(report.platformFee).toBe(20);
      console.log('✓ auctionJob snapshot: $10 premium + $20 commission pinned; report ignores the PRO rate');
    });

    it('should snapshot the coversFee case as organizer-absorbed', async () => {
      const { item } = await makeEndedLot({
        title: 'cron coversFee',
        coversFee: true,
        bidAmount: 200,
      });

      await endAuctions();

      const call = mockCreateSquareCheckoutLink.mock.calls.find(
        (c) => c[0]?.metadata?.itemId === item.id
      );
      // Buyer pays the bid only; the platform still collects premium + commission.
      expect(call![0].amountCents).toBe(20000);
      expect(call![0].appFeeCents).toBe(3000);

      const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
      expect(purchase!.organizerAbsorbedPremium).toBe(true);
      expect(purchase!.buyerPremiumAmount).toBe(10);
      expect(purchase!.commissionAmount).toBe(20);
      // The organizer absorbed the premium, so it belongs on THEIR fee line: $200 gross, $30 fee.
      const report = resolveOrganizerFeeReport(purchase as any, 0.1);
      expect(report.grossSalePrice).toBe(200);
      expect(report.platformFee).toBe(30);
      console.log('✓ auctionJob coversFee: buyer charged $200.00, organizer fee line $30.00');
    });

    it('should award AUCTION_WIN XP to the winner (the behaviour the manual path had to match)', async () => {
      const { item, sale } = await makeEndedLot({ title: 'cron xp', bidAmount: 40 });

      await endAuctions();

      expect(mockAwardXp).toHaveBeenCalledWith(bidder.id, 'AUCTION_WIN', 20, {
        itemId: item.id,
        saleId: sale.id,
        preMultipliedHuntPassXp: true,
      });
      console.log('✓ auctionJob: AUCTION_WIN XP awarded — the baseline the manual close now mirrors');
    });

    it('should NOT charge below reserve, and must create no Purchase and no Square payment link', async () => {
      // The cron's long-standing behaviour, asserted so the shared rule cannot regress it.
      const { item } = await makeEndedLot({
        title: 'cron reserve unmet',
        buyersPremiumPct: 15,
        reservePrice: 500,
        bidAmount: 120,
      });

      await endAuctions();

      const call = mockCreateSquareCheckoutLink.mock.calls.find(
        (c) => c[0]?.metadata?.itemId === item.id
      );
      expect(call).toBeUndefined();
      const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
      expect(purchase).toBeNull();
      const after = await prisma.item.findUnique({ where: { id: item.id } });
      expect(after?.auctionClosed).toBe(true);
      expect(after?.status).toBe('AUCTION_ENDED');
      console.log('✓ auctionJob reserve unmet: no charge, no Purchase, lot closed at AUCTION_ENDED');
    });
  });

  // ── services/auctionService.closeAuction — the organizer's manual button ────────────────
  describe('services/auctionService.closeAuction — reserve parity with the cron (P1, money)', () => {
    it('must REFUSE to award a lot below the organizer’s reserve', async () => {
      // THE BUG: before 2026-08-17 this path had no reserve check at all. An organizer with a
      // $500 reserve could click "Close Auction" at a $120 high bid and the bidder was charged
      // $120 (+ premium) for a lot the reserve existed to protect.
      const { item } = await makeEndedLot({
        title: 'manual reserve unmet',
        buyersPremiumPct: 15,
        reservePrice: 500,
        bidAmount: 120,
        endedAlready: false, // organizer closing EARLY — the whole point of the manual button
      });

      const result = await closeAuction(item.id);

      expect(result.outcome).toBe('RESERVE_NOT_MET');
      expect(result.highestBidAmount).toBe(120);
      expect(result.reservePrice).toBe(500);
      // No money may move: no Square payment link, no Purchase row.
      expect(mockCreateSquareCheckoutLink).not.toHaveBeenCalled();
      const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
      expect(purchase).toBeNull();
      // Same terminal state the cron leaves a reserve-unmet lot in.
      const after = await prisma.item.findUnique({ where: { id: item.id } });
      expect(after?.auctionClosed).toBe(true);
      expect(after?.status).toBe('AUCTION_ENDED');
      expect(after?.status).not.toBe('SOLD');
      console.log('✓ manual close below reserve: refused, nothing charged, lot AUCTION_ENDED');
    });

    it('should award at the PLATFORM 5%, ignoring a 15% left in the retired column', async () => {
      const { item } = await makeEndedLot({
        title: 'manual reserve met',
        buyersPremiumPct: 15,
        reservePrice: 100,
        bidAmount: 200,
        endedAlready: false,
      });

      const result = await closeAuction(item.id);

      expect(result.outcome).toBe('SOLD');
      expect(mockCreateSquareCheckoutLink).toHaveBeenCalled();
      const call = mockCreateSquareCheckoutLink.mock.calls.at(-1)![0];
      // Buyer pays $200 + 5% = $210.00 — same arithmetic as the cron.
      expect(call.amountCents).toBe(21000);
      expect(call.amountCents).not.toBe(23000);
      expect(call.appFeeCents).toBe(1000 + 2000);

      // auctionService.ts's Square branch creates its own PENDING Purchase row inline (unlike
      // the old Stripe branch, which deferred to a webhook) — read the fee split straight off
      // it rather than off Square-specific call-argument shape.
      const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
      expect(purchase).toBeTruthy();
      expect(purchase!.processor).toBe('SQUARE');
      expect(purchase!.status).toBe('PENDING');
      expect(purchase!.amount).toBe(210);
      expect(purchase!.platformFeeAmount).toBe(30);
      expect(purchase!.buyerPremiumAmount).toBe(10);
      expect(purchase!.commissionAmount).toBe(20);
      expect(purchase!.commissionRate).toBe(0.1);
      expect(purchase!.organizerAbsorbedPremium).toBe(false);
      console.log('✓ manual close above reserve: $210.00 payment link, $30.00 fee, split pinned on the Purchase row');
    });

    it('should award a lot with NO reserve set, exactly as before', async () => {
      const { item } = await makeEndedLot({
        title: 'manual no reserve',
        buyersPremiumPct: null,
        reservePrice: null,
        bidAmount: 75,
        endedAlready: false,
      });

      const result = await closeAuction(item.id);

      expect(result.outcome).toBe('SOLD');
      const call = mockCreateSquareCheckoutLink.mock.calls.at(-1)![0];
      expect(call.amountCents).toBe(7875); // $75 + 5%
      console.log('✓ manual close, no reserve: unchanged award at the platform 5%');
    });

    // ── XP PARITY (2026-08-17) ────────────────────────────────────────────────────────────
    it('should award AUCTION_WIN XP — the same amount and shape as the cron', async () => {
      // THE BUG: this path awarded nothing. Same winner, same lot, same outcome — a different
      // reward purely because an organizer pressed a button instead of the clock running out.
      const { item, sale } = await makeEndedLot({
        title: 'manual xp parity',
        bidAmount: 90,
        endedAlready: false,
      });

      const result = await closeAuction(item.id);

      expect(result.outcome).toBe('SOLD');
      expect(mockAwardXp).toHaveBeenCalledTimes(1);
      expect(mockAwardXp).toHaveBeenCalledWith(bidder.id, 'AUCTION_WIN', 20, {
        itemId: item.id,
        saleId: sale.id,
        preMultipliedHuntPassXp: true,
      });
      console.log('✓ manual close: AUCTION_WIN XP awarded, identical call shape to the cron');
    });

    it('should award XP exactly ONCE when the close is double-fired', async () => {
      // The atomic auctionClosed claim is what makes this safe: the second caller returns
      // ALREADY_CLOSED long before reaching the award.
      const { item } = await makeEndedLot({
        title: 'manual xp double fire',
        bidAmount: 55,
        endedAlready: false,
      });

      const [first, second] = [await closeAuction(item.id), await closeAuction(item.id)];

      expect(first.outcome).toBe('SOLD');
      expect(second.outcome).toBe('ALREADY_CLOSED');
      expect(mockAwardXp).toHaveBeenCalledTimes(1);
      console.log('✓ manual close double-fire: one XP award, not two');
    });

    it('should award NO XP when the monthly AUCTION cap is exhausted', async () => {
      mockCheckMonthlyXpCap.mockResolvedValue(0);
      const { item } = await makeEndedLot({
        title: 'manual xp capped',
        bidAmount: 45,
        endedAlready: false,
      });

      const result = await closeAuction(item.id);

      expect(result.outcome).toBe('SOLD');
      expect(mockAwardXp).not.toHaveBeenCalled();
      console.log('✓ manual close: monthly cap respected, no XP awarded');
    });

    it('should still close the auction when the XP service throws', async () => {
      // XP is a reward, not part of the transaction. A broken xpService must never fail a close
      // that has already created a payment link for a real buyer.
      mockAwardXp.mockRejectedValue(new Error('xp service down'));
      const { item } = await makeEndedLot({
        title: 'manual xp throws',
        bidAmount: 65,
        endedAlready: false,
      });

      const result = await closeAuction(item.id);

      expect(result.outcome).toBe('SOLD');
      expect(mockCreateSquareCheckoutLink).toHaveBeenCalled();
      console.log('✓ manual close: XP failure swallowed, auction still closed');
    });

    it('should award NO XP when the reserve is not met', async () => {
      const { item } = await makeEndedLot({
        title: 'manual xp reserve unmet',
        reservePrice: 500,
        bidAmount: 100,
        endedAlready: false,
      });

      const result = await closeAuction(item.id);

      expect(result.outcome).toBe('RESERVE_NOT_MET');
      expect(mockAwardXp).not.toHaveBeenCalled();
      console.log('✓ manual close below reserve: no winner, no XP');
    });

    it('should report NO_BIDS without charging anything', async () => {
      const sale = await prisma.sale.create({
        data: {
          title: 'Auction premium — manual no bids',
          description: 'Created by auctionPremium.test.ts — safe to delete',
          address: '100 Test Ave',
          city: 'Springfield',
          state: 'MI',
          zip: '49503',
          lat: 42.9629,
          lng: -85.6789,
          startDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
          endDate: new Date(Date.now() - 60 * 60 * 1000),
          status: 'PUBLISHED',
          isAuctionSale: true,
          saleType: 'AUCTION',
          organizerId: organizer.id,
        },
      });
      const item = await prisma.item.create({
        data: {
          embedding: [],
          title: 'Lot — manual no bids',
          listingType: 'AUCTION',
          auctionStartPrice: 10.0,
          auctionEndTime: new Date(Date.now() + 60 * 60 * 1000),
          auctionClosed: false,
          status: 'AVAILABLE',
          saleId: sale.id,
        },
      });

      const result = await closeAuction(item.id);

      expect(result.outcome).toBe('NO_BIDS');
      expect(mockCreateSquareCheckoutLink).not.toHaveBeenCalled();
      console.log('✓ manual close, no bids: nothing charged');
    });

    it('should refuse a second close (atomic claim holds)', async () => {
      const { item } = await makeEndedLot({
        title: 'manual double close',
        bidAmount: 60,
        endedAlready: false,
      });

      const first = await closeAuction(item.id);
      const second = await closeAuction(item.id);

      expect(first.outcome).toBe('SOLD');
      expect(second.outcome).toBe('ALREADY_CLOSED');
      expect(mockCreateSquareCheckoutLink).toHaveBeenCalledTimes(1);
      console.log('✓ manual close is idempotent: one payment link, second call refused');
    });
  });

  // ── the shared rule itself ───────────────────────────────────────────────────────────
  describe('utils/auctionRules.evaluateAuctionReserve — the one rule both paths use', () => {
    it('treats null and 0 as NO reserve', () => {
      expect(evaluateAuctionReserve({ auctionReservePrice: null }, 0).reserveMet).toBe(true);
      expect(evaluateAuctionReserve({ auctionReservePrice: 0 }, 0).reserveMet).toBe(true);
      expect(evaluateAuctionReserve(null, 0).reserveMet).toBe(true);
    });

    it('requires the bid to REACH the reserve, not merely approach it', () => {
      expect(evaluateAuctionReserve({ auctionReservePrice: 500 }, 499.99).reserveMet).toBe(false);
      expect(evaluateAuctionReserve({ auctionReservePrice: 500 }, 500).reserveMet).toBe(true);
      expect(evaluateAuctionReserve({ auctionReservePrice: 500 }, 501).reserveMet).toBe(true);
    });

    it('evaluates no bids as a $0 bid', () => {
      expect(evaluateAuctionReserve({ auctionReservePrice: 500 }, 0).reserveMet).toBe(false);
      expect(evaluateAuctionReserve({ auctionReservePrice: null }, 0).reserveMet).toBe(true);
    });

    it('reports the reserve and the bid it decided against', () => {
      const d = evaluateAuctionReserve({ auctionReservePrice: 500 }, 120);
      expect(d.reservePrice).toBe(500);
      expect(d.highestBidAmount).toBe(120);
      expect(d.reason).toContain('NOT met');
    });
  });
});
