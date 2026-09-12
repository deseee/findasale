/**
 * Cash-fee-debt recoupment -- pure-logic coverage for computeCashDebtRoomCents.
 *
 * WHY THIS EXISTS (2026-09-12, Stripe removal): removing payoutController.ts's createPayout
 * (Stripe on-demand payout) deleted the only mechanism that used to collect an organizer's
 * accrued Organizer.cashFeeBalance (platform commission owed on cash/off-platform sales --
 * see cashFeeService.ts's header comment). Square has no on-demand-payout API, so the
 * replacement mechanism recoups the debt by padding a SUBSEQUENT Square card sale's
 * appFeeMoney -- see cashFeeService.applyCashDebtToAppFee / settleCashDebtCollection, wired
 * into squarePaymentController.ts's single-item and cart checkout paths.
 *
 * This suite covers ONLY the pure sizing function (no DB, no Square API, no Prisma mock) --
 * the two async wrappers (applyCashDebtToAppFee / settleCashDebtCollection) are thin Prisma
 * read/write shells around this same math and are exercised end-to-end by
 * cashSaleFee.test.ts's sibling suites and by manual QA before this ships (flagged in the
 * dispatch handoff -- this is real-money-adjacent, guest-checkout-reachable code and should
 * get a findasale-hacker adversarial pass before going live, same as any other checkout change).
 */
import { computeCashDebtRoomCents } from '../services/cashFeeService';

describe('computeCashDebtRoomCents', () => {
  it('returns 0 when the organizer owes nothing', () => {
    expect(
      computeCashDebtRoomCents({ cashFeeBalance: 0, baseAppFeeCents: 500, saleAmountCents: 5000 })
    ).toBe(0);
  });

  it('collects the full debt when it fits under the sale total', () => {
    expect(
      computeCashDebtRoomCents({ cashFeeBalance: 15, baseAppFeeCents: 1000, saleAmountCents: 10000 })
    ).toBe(1500);
  });

  it('caps collection at the room available -- never takes more than the sale is worth', () => {
    expect(
      computeCashDebtRoomCents({ cashFeeBalance: 500, baseAppFeeCents: 200, saleAmountCents: 2000 })
    ).toBe(1800);
  });

  it('collects nothing when the base commission already consumes the entire sale', () => {
    expect(
      computeCashDebtRoomCents({ cashFeeBalance: 50, baseAppFeeCents: 5000, saleAmountCents: 5000 })
    ).toBe(0);
    expect(
      computeCashDebtRoomCents({ cashFeeBalance: 50, baseAppFeeCents: 6000, saleAmountCents: 5000 })
    ).toBe(0);
  });

  it('never returns a negative amount for a negative or zero balance', () => {
    expect(
      computeCashDebtRoomCents({ cashFeeBalance: -5, baseAppFeeCents: 100, saleAmountCents: 1000 })
    ).toBe(0);
  });

  it('rounds the outstanding balance to the nearest cent before sizing', () => {
    expect(
      computeCashDebtRoomCents({ cashFeeBalance: 10.005, baseAppFeeCents: 0, saleAmountCents: 100000 })
    ).toBe(1001);
  });
});
