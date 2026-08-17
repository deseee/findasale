/**
 * Auction close paths — configured buyer premium (#363) + reserve-price parity (P1, money).
 *
 * TWO BUGS THIS SUITE EXISTS FOR, both confirmed live on 2026-08-17:
 *
 *   1. `Sale.buyersPremiumPct` was displayed to shoppers but never charged. Every charge path
 *      hardcoded 5%, including this one — jobs/auctionJob.ts is the LIVE auction-winner path
 *      (the cron closes the auction and creates the winner's PaymentIntent), so a sale
 *      advertising 15% ran the winner's card for 5%.
 *
 *   2. `services/auctionService.closeAuction` — reachable from the organizer's manual
 *      "Close Auction" button (POST /api/items/:itemId/close-auction) — had NO reserve-price
 *      check, while the cron has always had one. An organizer could click their own button and
 *      sell a lot below their own reserve, charging the bidder. The rule now lives once, in
 *      utils/auctionRules.evaluateAuctionReserve, and both paths call it.
 *
 * MOCKING NOTES (read before editing):
 *   - `services/auctionService.ts` imports `prisma` from `../index`, which is the Express entry
 *     point — importing it boots the HTTP server, Socket.io, Redis, Sentry and ~80 cron jobs.
 *     `../index` is mocked to re-export the same singleton from `../lib/prisma`, which is
 *     exactly what index.ts itself does (index.ts:291). Same object, no server boot.
 *   - `jobs/auctionJob.ts` calls `cron.schedule(...)` at module scope. `node-cron` is mocked so
 *     importing the job does not register a live 5-minute timer inside the test process.
 *   - Stripe, email and notification side effects are mocked; the assertions are about the
 *     Stripe arguments and the resulting DB rows, which are the parts that move money.
 */

import { prisma } from '../lib/prisma';

// ── Mocks (hoisted by ts-jest above the var declarations — `var`, not `const`, deliberately) ──
var mockPaymentIntentsCreate = jest.fn();
var mockCheckoutSessionsCreate = jest.fn();

jest.mock('../utils/stripe', () => ({
  getStripe: jest.fn(() => ({
    paymentIntents: { create: mockPaymentIntentsCreate },
    checkout: { sessions: { create: mockCheckoutSessionsCreate } },
  })),
  default: jest.fn(),
}));

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

// Direct-charges staged rollout: force the DESTINATION shape so the assertions read one
// consistent Stripe payload. Which shape is used is orthogonal to premium/reserve.
jest.mock('../services/stripeConnectService', () => ({
  shouldUseDirectCharge: jest.fn().mockResolvedValue(false),
}));

jest.mock('../services/xpService', () => ({
  awardXp: jest.fn().mockResolvedValue(undefined),
  applyHuntPassMultiplier: jest.fn(async (_u: string, xp: number) => xp),
  checkMonthlyXpCap: jest.fn().mockResolvedValue(0),
  XP_AWARDS: { AUCTION_WIN: 20 },
}));

jest.mock('../services/marketplaceStockSyncService', () => ({
  syncMarketplaceStock: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports AFTER the mocks ───────────────────────────────────────────────────────────────
import { endAuctions } from '../jobs/auctionJob';
import { closeAuction } from '../services/auctionService';
import { evaluateAuctionReserve } from '../utils/auctionRules';

const STRIPE_CONNECT_ID = 'acct_auctionpremiume2e';

describe('Auction close — configured premium & reserve parity', () => {
  let organizerUser: any;
  let organizer: any;
  let bidder: any;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_auction_premium';
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
        stripeConnectId: STRIPE_CONNECT_ID,
        subscriptionTier: 'SIMPLE',
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

    // createPaymentIntent-style FeeStructure override off, so the organizer's tier rate applies.
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
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.FRONTEND_URL;
  });

  beforeEach(() => {
    mockPaymentIntentsCreate.mockReset();
    mockCheckoutSessionsCreate.mockReset();
    mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_auction_mock', client_secret: 'sec' });
    mockCheckoutSessionsCreate.mockResolvedValue({ id: 'cs_auction_mock', url: 'https://stripe.test/cs' });
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
  describe('jobs/auctionJob.endAuctions — configured premium on the winner charge', () => {
    it('should charge the winner the CONFIGURED 15% premium, not a hardcoded 5%', async () => {
      const { item } = await makeEndedLot({
        title: 'cron 15pct',
        buyersPremiumPct: 15,
        bidAmount: 200,
      });

      await endAuctions();

      const call = mockPaymentIntentsCreate.mock.calls.find(
        (c) => c[0]?.metadata?.itemId === item.id
      );
      expect(call).toBeDefined();
      // $200 hammer + 15% => $230.00 charged. The hardcoded-5% bug produced 21000.
      expect(call![0].amount).toBe(23000);
      expect(call![0].amount).not.toBe(21000);
      // application_fee = $30.00 premium + $20.00 SIMPLE commission.
      expect(call![0].application_fee_amount).toBe(3000 + 2000);
      // Organizer still nets $180.00.
      expect(call![0].amount - call![0].application_fee_amount).toBe(18000);

      // The PENDING Purchase must record what the buyer was actually charged.
      const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
      expect(purchase?.amount).toBe(230);
      expect(purchase?.platformFeeAmount).toBe(50);
      expect(purchase?.status).toBe('PENDING');
      console.log('✓ auctionJob 15%: winner charged $230.00, application fee $50.00, organizer nets $180.00');
    });

    it('should charge no premium at all when the sale is configured at 0', async () => {
      const { item } = await makeEndedLot({
        title: 'cron 0pct',
        buyersPremiumPct: 0,
        bidAmount: 200,
      });

      await endAuctions();

      const call = mockPaymentIntentsCreate.mock.calls.find(
        (c) => c[0]?.metadata?.itemId === item.id
      );
      expect(call).toBeDefined();
      expect(call![0].amount).toBe(20000);      // bid only
      expect(call![0].amount).not.toBe(21000);  // the falsy-trap regression
      expect(call![0].application_fee_amount).toBe(2000); // commission only
      console.log('✓ auctionJob 0%: winner charged $200.00 flat');
    });

    it('should keep the 5% default when the sale has no configured premium', async () => {
      const { item } = await makeEndedLot({
        title: 'cron default',
        buyersPremiumPct: null,
        bidAmount: 200,
      });

      await endAuctions();

      const call = mockPaymentIntentsCreate.mock.calls.find(
        (c) => c[0]?.metadata?.itemId === item.id
      );
      expect(call![0].amount).toBe(21000);
      expect(call![0].application_fee_amount).toBe(1000 + 2000);
      console.log('✓ auctionJob default: unchanged 5% behaviour');
    });

    it('should NOT charge below reserve, and must create no Purchase and no Stripe object', async () => {
      // The cron's long-standing behaviour, asserted so the shared rule cannot regress it.
      const { item } = await makeEndedLot({
        title: 'cron reserve unmet',
        buyersPremiumPct: 15,
        reservePrice: 500,
        bidAmount: 120,
      });

      await endAuctions();

      const call = mockPaymentIntentsCreate.mock.calls.find(
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
      // No money may move: no Checkout Session, no PaymentIntent, no Purchase row.
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
      const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
      expect(purchase).toBeNull();
      // Same terminal state the cron leaves a reserve-unmet lot in.
      const after = await prisma.item.findUnique({ where: { id: item.id } });
      expect(after?.auctionClosed).toBe(true);
      expect(after?.status).toBe('AUCTION_ENDED');
      expect(after?.status).not.toBe('SOLD');
      console.log('✓ manual close below reserve: refused, nothing charged, lot AUCTION_ENDED');
    });

    it('should award normally when the reserve IS met, at the configured premium', async () => {
      const { item } = await makeEndedLot({
        title: 'manual reserve met',
        buyersPremiumPct: 15,
        reservePrice: 100,
        bidAmount: 200,
        endedAlready: false,
      });

      const result = await closeAuction(item.id);

      expect(result.outcome).toBe('SOLD');
      expect(mockCheckoutSessionsCreate).toHaveBeenCalled();
      const args = mockCheckoutSessionsCreate.mock.calls.at(-1)![0];
      // Buyer pays $200 + 15% = $230.00 — same arithmetic as the cron and createPaymentIntent.
      expect(args.line_items[0].price_data.unit_amount).toBe(23000);
      expect(args.payment_intent_data.application_fee_amount).toBe(3000 + 2000);
      // The Stripe line description must state the rate actually charged, not "5%". Anchored on
      // the leading "+ " because the string "15%" trivially contains "5%".
      expect(args.line_items[0].price_data.product_data.description).toContain('+ 15% buyer premium');
      expect(args.line_items[0].price_data.product_data.description).not.toContain('+ 5% buyer premium');
      // The webhook needs the fee stamped in metadata to write the Purchase row later.
      expect(args.metadata.platformFeeAmount).toBe('50');
      console.log('✓ manual close above reserve: $230.00 session, $50.00 application fee, description says 15%');
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
      const args = mockCheckoutSessionsCreate.mock.calls.at(-1)![0];
      expect(args.line_items[0].price_data.unit_amount).toBe(7875); // $75 + 5%
      console.log('✓ manual close, no reserve: unchanged award at the 5% default');
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
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
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
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
      console.log('✓ manual close is idempotent: one session, second call refused');
    });
  });

  // ── the shared rule itself ──────────────────────────────────────────────────────────────
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
