/**
 * Security fix (2026-11-04, findings #80 / #141): the Stripe webhook also accepts events signed with
 * STRIPE_CONNECT_WEBHOOK_SECRET. Those carry `event.account`, and an organizer on a Standard
 * connected account can put any metadata on a PaymentIntent created on their own account.
 *
 * WHAT THIS PROVES
 *   - a connected-account event never runs a platform-only branch: Boost, Hunt Pass, Bounty and the
 *     a-la-carte fee (PaymentIntent and Checkout Session) are all ignored
 *   - the same metadata on a platform event still activates Boost / Hunt Pass / a-la-carte (legit path)
 *   - charge.succeeded hands markHoldInvoicePaid the charge's account and amount to verify
 *   - charge.failed from another organizer's account (or for less than the invoice) does not expire
 *     the invoice; a matching one from the invoice organizer's own account still does
 *
 * The DB is an auto-mocking proxy; the Stripe client and the hold-invoice recorder are mocked
 * (verifyStripeChargeForHoldInvoice stays REAL, it is the code under test for charge.failed).
 */

var mockConstructEvent = jest.fn();
var mockPiRetrieve = jest.fn();

jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn(), init: jest.fn() }));
jest.mock('../utils/stripe', () => ({
  getStripe: jest.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    paymentIntents: { retrieve: mockPiRetrieve },
    checkout: { sessions: { list: jest.fn().mockResolvedValue({ data: [] }), expire: jest.fn() } },
  })),
  isStripeConfigured: () => true,
  StripeNotConfiguredError: class extends Error {},
  isStripeNotConfiguredError: () => false,
}));
jest.mock('../lib/prisma', () => {
  const models: Record<string, any> = {};
  const model = (name: string) =>
    (models[name] ??= new Proxy({}, {
      get: (t: any, k: string) => (t[k] ??= jest.fn().mockResolvedValue(null)),
    }));
  const prisma: any = new Proxy({}, {
    get: (_t, k: string) => {
      if (k === '$transaction') return (models.$transaction ??= jest.fn());
      return model(k);
    },
  });
  return { prisma, default: prisma };
});
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({ to: () => ({ emit: jest.fn() }) })) }));
jest.mock('../services/holdInvoicePaymentRecorder', () => {
  const actual = jest.requireActual('../services/holdInvoicePaymentRecorder');
  return { ...actual, markHoldInvoicePaid: jest.fn().mockResolvedValue({ recorded: true, alreadyPaid: false }) };
});

import { prisma } from '../lib/prisma';
import { webhookHandler } from '../controllers/stripeController';
import { markHoldInvoicePaid } from '../services/holdInvoicePaymentRecorder';

const db: any = prisma;

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

async function deliver(event: any) {
  mockConstructEvent.mockReturnValue(event);
  const res = makeRes();
  await webhookHandler({ headers: { 'stripe-signature': 'sig' }, body: Buffer.from('{}') } as any, res);
  return res;
}

const piEvent = (metadata: Record<string, string>, account?: string) => ({
  id: `evt_${Math.random().toString(36).slice(2)}`,
  type: 'payment_intent.succeeded',
  livemode: true,
  ...(account ? { account } : {}),
  data: { object: { id: 'pi_1', amount: 50, metadata } },
});

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_platform';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect';
});

beforeEach(() => {
  jest.clearAllMocks();
  db.processedWebhookEvent.create.mockResolvedValue({});
  db.processedWebhookEvent.update.mockResolvedValue({});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('platform-only branches ignore connected-account events', () => {
  it('does not activate a boost from a connected-account PaymentIntent', async () => {
    db.boostPurchase.findUnique.mockResolvedValue({ id: 'bp_1', status: 'PENDING', durationDays: 7, boostType: 'X' });
    await deliver(piEvent({ boostPurchaseId: 'bp_1' }, 'acct_attacker'));
    expect(db.boostPurchase.update).not.toHaveBeenCalled();
  });

  it('still activates a boost from a platform PaymentIntent', async () => {
    db.boostPurchase.findUnique.mockResolvedValue({ id: 'bp_1', status: 'PENDING', durationDays: 7, boostType: 'X' });
    await deliver(piEvent({ boostPurchaseId: 'bp_1' }));
    expect(db.boostPurchase.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'bp_1' } }));
  });

  it('does not grant Hunt Pass from a connected-account PaymentIntent', async () => {
    await deliver(piEvent({ type: 'hunt_pass', userId: 'victim_or_self' }, 'acct_attacker'));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('still grants Hunt Pass from a platform PaymentIntent', async () => {
    await deliver(piEvent({ type: 'hunt_pass', userId: 'u_1' }));
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u_1' } }));
  });

  it('does not fulfil a bounty submission from a connected-account PaymentIntent', async () => {
    await deliver(piEvent({ type: 'BOUNTY_SUBMISSION', submissionId: 'bs_1', userId: 'u_1' }, 'acct_attacker'));
    expect(db.bountySubmission.findUnique).not.toHaveBeenCalled();
  });

  it('does not mark the a-la-carte fee paid from a connected-account PaymentIntent', async () => {
    await deliver(piEvent({ type: 'ALA_CARTE', saleId: 'sale_victim' }, 'acct_attacker'));
    expect(db.sale.update).not.toHaveBeenCalled();
  });

  it('still marks the a-la-carte fee paid from a platform PaymentIntent', async () => {
    await deliver(piEvent({ type: 'ALA_CARTE', saleId: 'sale_1' }));
    expect(db.sale.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sale_1' } }));
  });

  it('does not mark the a-la-carte fee paid from a connected-account Checkout Session', async () => {
    await deliver({
      id: 'evt_cs_1',
      type: 'checkout.session.completed',
      livemode: true,
      account: 'acct_attacker',
      data: { object: { id: 'cs_1', metadata: { type: 'ALA_CARTE', saleId: 'sale_victim' }, payment_intent: null } },
    });
    expect(db.sale.update).not.toHaveBeenCalled();
  });
});

describe('hold-invoice charge events verify account and amount', () => {
  const invoiceRow = {
    id: 'inv_victim',
    status: 'PENDING',
    totalAmount: 5000,
    cashAmountCents: null,
    cardAmountCents: null,
    stripeAccountId: 'acct_victim',
    chargeType: 'DIRECT',
    itemIds: ['item_1'],
    stripeSessionId: null,
    shopperUserId: null,
    sale: { organizer: { stripeConnectId: 'acct_victim' } },
  };

  const chargeEvent = (type: string, account: string | undefined, amount: number) => ({
    id: `evt_${type}_${account}_${amount}`,
    type,
    livemode: true,
    ...(account ? { account } : {}),
    data: { object: { id: 'ch_1', amount, amount_refunded: 0, payment_intent: 'pi_1', failure_message: 'declined' } },
  });

  beforeEach(() => {
    mockPiRetrieve.mockResolvedValue({ id: 'pi_1', metadata: { invoiceId: 'inv_victim' } });
    db.holdInvoice.findUnique.mockResolvedValue(invoiceRow);
    db.item.findMany.mockResolvedValue([{ id: 'item_1', title: 'Lamp' }]);
    db.itemReservation.findMany.mockResolvedValue([]);
    db.$transaction.mockResolvedValue({ expired: false });
  });

  it('charge.succeeded passes the event account and charge amount to markHoldInvoicePaid', async () => {
    await deliver(chargeEvent('charge.succeeded', 'acct_attacker', 50));
    expect(markHoldInvoicePaid).toHaveBeenCalledWith(
      'inv_victim',
      expect.anything(),
      expect.objectContaining({ stripeCharge: { connectAccountId: 'acct_attacker', amountCents: 50 } })
    );
  });

  it("charge.failed from another organizer's account does not expire the invoice", async () => {
    await deliver(chargeEvent('charge.failed', 'acct_attacker', 5000));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('charge.failed for less than the invoice total does not expire the invoice', async () => {
    await deliver(chargeEvent('charge.failed', 'acct_victim', 50));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("charge.failed from the invoice organizer's own account still expires the invoice", async () => {
    await deliver(chargeEvent('charge.failed', 'acct_victim', 5000));
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

// Stripe is retired (owner, 2026-11-04): index.ts must run stripeUnavailableGuard (410 STRIPE_RETIRED while
// STRIPE_PLATFORM_CLOSED is in effect) in front of every Stripe webhook and Stripe-calling route, BEFORE the
// routers are mounted, and must leave the non-Stripe routes under /api/stripe (cash register etc.) open.
// Source check because importing index.ts boots the whole server.
describe('index.ts Stripe retirement gate', () => {
  const src: string = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.ts'), 'utf8');
  const guardAt = (p: string) => src.indexOf(`app.use('${p}', stripeUnavailableGuard);`);

  it.each([
    '/api/stripe/webhook',
    '/api/billing/webhook',
    '/api/stripe/pending-payment',
    '/api/stripe/recover-payment-intent',
    '/api/stripe-connect/onboard',
    '/api/organizers/me/stripe/start-standard-migration',
    '/api/organizers/me/hub-owner/stripe/onboard',
  ])('guards %s before the routers are mounted', (p) => {
    const at = guardAt(p);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(src.indexOf("app.use('/api/stripe', stripeRoutes);"));
    expect(at).toBeLessThan(src.indexOf("app.use('/api/organizers',"));
  });

  it('does not guard the non-Stripe cash register route or the /api/stripe router as a whole', () => {
    expect(guardAt('/api/stripe/terminal/cash-payment')).toBe(-1);
    expect(guardAt('/api/stripe')).toBe(-1);
  });
});
