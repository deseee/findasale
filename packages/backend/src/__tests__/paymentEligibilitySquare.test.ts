/**
 * paymentEligibilityService.assertSaleCanAcceptPayment, Square-aware (money review P1-13, 2026-09-29).
 * Stripe was removed 2026-09-12, so the Stripe onboarding check in Fix 1 blocked every Square-only
 * organizer from Hold-to-Pay. An organizer with completed Square onboarding (squareOnboarded === true
 * AND a merchant id) now satisfies Fix 1. Stripe callers that pass no Square fields behave exactly as
 * before, and Fix 2 (sale PUBLISHED) and Fix 3 (payments held / velocity breaker) apply to both.
 */

import { assertSaleCanAcceptPayment } from '../services/paymentEligibilityService';

const prismaLike = (purchases: Array<{ status: string }> = []) =>
  ({
    purchase: { findMany: jest.fn().mockResolvedValue(purchases) },
    sale: { update: jest.fn().mockResolvedValue({}) },
  }) as any;

const sale = (over: any = {}) => ({ id: 'sale_1', status: 'PUBLISHED', paymentsHeldAt: null, ...over });
const noStripe = { organizerStripeConnectId: null, organizerStripeOnboarded: false };

describe('assertSaleCanAcceptPayment', () => {
  it('a Square-only organizer passes', async () => {
    const r = await assertSaleCanAcceptPayment({
      prisma: prismaLike(), sale: sale(), ...noStripe, organizerSquareOnboarded: true, organizerSquareMerchantId: 'MERCH1',
    });
    expect(r).toEqual({ blocked: false });
  });

  it.each([
    ['squareOnboarded false', { organizerSquareOnboarded: false, organizerSquareMerchantId: 'MERCH1' }],
    ['no merchant id', { organizerSquareOnboarded: true, organizerSquareMerchantId: null }],
    ['squareOnboarded null', { organizerSquareOnboarded: null, organizerSquareMerchantId: 'MERCH1' }],
    ['no Square fields at all (a Stripe-only caller)', {}],
  ])('still blocked with no Stripe account and %s', async (_label, sq) => {
    const r: any = await assertSaleCanAcceptPayment({ prisma: prismaLike(), sale: sale(), ...noStripe, ...(sq as any) });
    expect(r.blocked).toBe(true);
    expect(r.body.code).toBe('SELLER_PAYMENTS_UNAVAILABLE');
  });

  it('a fully onboarded Stripe organizer passes exactly as before', async () => {
    const r = await assertSaleCanAcceptPayment({
      prisma: prismaLike(), sale: sale(), organizerStripeConnectId: 'acct_live123', organizerStripeOnboarded: true,
    });
    expect(r).toEqual({ blocked: false });
  });

  it('a half-onboarded Stripe organizer is still blocked', async () => {
    const r: any = await assertSaleCanAcceptPayment({
      prisma: prismaLike(), sale: sale(), organizerStripeConnectId: 'acct_live123', organizerStripeOnboarded: false,
    });
    expect(r.blocked).toBe(true);
  });

  it('an unpublished sale is blocked for a Square organizer too', async () => {
    const r: any = await assertSaleCanAcceptPayment({
      prisma: prismaLike(), sale: sale({ status: 'ENDED' }), ...noStripe, organizerSquareOnboarded: true, organizerSquareMerchantId: 'MERCH1',
    });
    expect(r.blocked).toBe(true);
    expect(r.body.code).toBe('SALE_NOT_ACTIVE');
  });

  it('a payments-held sale is blocked for a Square organizer too', async () => {
    const r: any = await assertSaleCanAcceptPayment({
      prisma: prismaLike(), sale: sale({ paymentsHeldAt: new Date() }), ...noStripe, organizerSquareOnboarded: true, organizerSquareMerchantId: 'MERCH1',
    });
    expect(r.blocked).toBe(true);
    expect(r.body.code).toBe('SALE_PAYMENTS_HELD');
  });

  it('the velocity breaker still trips for a Square organizer (3 FAILED of 10)', async () => {
    const purchases = [
      ...Array(3).fill({ status: 'FAILED' }),
      ...Array(7).fill({ status: 'PAID' }),
    ];
    const p = prismaLike(purchases);
    const r: any = await assertSaleCanAcceptPayment({
      prisma: p, sale: sale(), ...noStripe, organizerSquareOnboarded: true, organizerSquareMerchantId: 'MERCH1',
    });
    expect(r.blocked).toBe(true);
    expect(p.sale.update).toHaveBeenCalledTimes(1);
  });
});
