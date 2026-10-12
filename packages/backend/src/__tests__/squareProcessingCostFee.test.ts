/**
 * The platform bears Square's card processing cost (Patrick decision, 2026-10-11).
 *
 * The organizer's total deduction on a card sale is the inclusive fee (8% / 9.5% SIMPLE, 6% / 7.5% PRO and TEAMS, $0.75 minimum). Square takes
 * its own 2.9% + 30c out of the seller's proceeds BEFORE the app fee (verified live: $1.25 sale, 75c app fee, 34c Square fee, seller kept 16c),
 * so the app_fee_money SENT to Square is max(0, inclusiveFee - estimatedSquareProcessing). Everything is mocked: no Square call, no database.
 *   pnpm --filter backend test -- squareProcessingCostFee
 */

const mockLinkCreate = jest.fn();
const mockPaymentsCreate = jest.fn();
const mockCustomersCreate = jest.fn();
const fakeClient = {
  checkout: { paymentLinks: { create: mockLinkCreate } },
  payments: { create: mockPaymentsCreate },
  customers: { create: mockCustomersCreate },
};

jest.mock('../utils/square', () => ({
  getSquareClientForMerchant: jest.fn(() => fakeClient),
  getSquarePlatformClient: jest.fn(() => fakeClient),
}));
jest.mock('square', () => {
  class SquareError extends Error {
    errors?: any[];
  }
  return { SquareError };
});
jest.mock('../lib/prisma', () => ({
  prisma: {
    organizer: {
      findUnique: jest.fn(async () => ({ id: 'org1', squareMerchantId: 'm1', squareOnboarded: true, squareLocationId: 'LOC1' })),
    },
  },
}));
jest.mock('../utils/tokenCrypto', () => ({ decryptToken: jest.fn(), encryptToken: jest.fn() }));
jest.mock('../services/squareConnectService', () => ({ refreshSquareAccessToken: jest.fn() }));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock('../services/squarePaymentService', () => ({
  ...jest.requireActual('../services/squarePaymentService'),
  resolveOrganizerSquareAccessToken: jest.fn(async () => 'organizer-token'),
}));

import {
  SQUARE_CARD_PROCESSING_FIXED_CENTS,
  SQUARE_CARD_PROCESSING_RATE_BPS,
  calculateInclusiveCommissionCents,
  estimateSquareProcessingCents,
  squareAppFeeNetOfProcessingCents,
} from '../utils/feeCalculator';
import { cardLegFeeFits, computeCashDebtRoomCents, minCardCentsForAppFee } from '../services/cashFeeService';
import { createSquareCheckoutLink } from '../services/squareCheckoutLinkService';
import { assertPackSellableOnline } from '../services/bulkLot/bulkLotPackCheckout';
import { authorizeSquareBoothCartLeg } from '../services/squareVendorBoothCartService';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SQUARE_PLATFORM_LOCATION_ID = 'PLATFORM_LOC';
});

describe('estimateSquareProcessingCents', () => {
  it('is 2.9% + 30c, rounded half up, in integer math', () => {
    expect(SQUARE_CARD_PROCESSING_RATE_BPS).toBe(290);
    expect(SQUARE_CARD_PROCESSING_FIXED_CENTS).toBe(30);
    expect(estimateSquareProcessingCents(125)).toBe(34); // the verified live data point: $1.25 -> 34c
    expect(estimateSquareProcessingCents(500)).toBe(45); // 14.5 + 30 = 44.5 -> 45
    expect(estimateSquareProcessingCents(6246)).toBe(211);
    expect(estimateSquareProcessingCents(10000)).toBe(320);
  });
  it('is 0 for a non-positive amount', () => {
    expect(estimateSquareProcessingCents(0)).toBe(0);
    expect(estimateSquareProcessingCents(-100)).toBe(0);
  });
});

describe('squareAppFeeNetOfProcessingCents', () => {
  it('$1.25 PRO in person: inclusive 75c floor -> 41c sent (the organizer pays 75c in total: 34c Square + 41c app fee)', () => {
    const inclusive = calculateInclusiveCommissionCents(125, 'PRO', 'IN_PERSON');
    expect(inclusive).toBe(75);
    expect(squareAppFeeNetOfProcessingCents(inclusive, 125)).toBe(41);
    expect(125 - 34 - 41).toBe(50); // seller proceeds: 125 less the full 75c inclusive fee
  });
  it('$62.46 online PRO 7.5%: inclusive 468 -> 257 sent', () => {
    const inclusive = calculateInclusiveCommissionCents(6246, 'PRO', 'ONLINE');
    expect(inclusive).toBe(468);
    expect(squareAppFeeNetOfProcessingCents(inclusive, 6246)).toBe(468 - 211);
  });
  it('$5.00: inclusive stays at the 75c floor, Square cost 45c -> 30c sent', () => {
    expect(calculateInclusiveCommissionCents(500, 'PRO', 'IN_PERSON')).toBe(75);
    expect(squareAppFeeNetOfProcessingCents(75, 500)).toBe(30);
  });
  it('floors at 0 when Square cost exceeds the inclusive fee, never negative', () => {
    expect(squareAppFeeNetOfProcessingCents(20, 125)).toBe(0);
    expect(squareAppFeeNetOfProcessingCents(30, 500)).toBe(0);
  });
  it('a zero fee (referral discount) stays zero: the platform never adds a fee to cover Square', () => {
    expect(squareAppFeeNetOfProcessingCents(0, 10000)).toBe(0);
  });
  it('rates are unchanged: the inclusive fee is the same number it always was', () => {
    expect(calculateInclusiveCommissionCents(10000, 'SIMPLE', 'IN_PERSON')).toBe(800);
    expect(calculateInclusiveCommissionCents(10000, 'SIMPLE', 'ONLINE')).toBe(950);
    expect(calculateInclusiveCommissionCents(10000, 'TEAMS', 'IN_PERSON')).toBe(600);
    expect(calculateInclusiveCommissionCents(10000, 'PRO', 'ONLINE')).toBe(750);
  });
});

describe('minimum card sale from the adjusted fee', () => {
  it('75c fee: Square limit alone is 72c, but the platform minimum card sale is 99c (2026-10-12), which governs', () => {
    expect(minCardCentsForAppFee(75)).toBe(99);
    expect(cardLegFeeFits(72, 75)).toBe(true);
    expect(cardLegFeeFits(71, 75)).toBe(false);
    expect(minCardCentsForAppFee(0)).toBe(99);
  });
  it('every sale the minimum accepts keeps the SENT fee at or under 60% of the sale', () => {
    for (const cents of [72, 125, 500, 1000, 6246]) {
      const sent = squareAppFeeNetOfProcessingCents(75, cents);
      expect(sent).toBeLessThanOrEqual(Math.floor(cents * 0.6));
    }
  });
});

describe('bulk lot pack gate uses the same minimum as the POS', () => {
  const packOk = (cents: number, platformFeeCents: number) => {
    try {
      assertPackSellableOnline({ cents, platformFeeCents, shippingRequested: false, couponCode: null, organizerDiscountAmount: 0 });
      return true;
    } catch {
      return false;
    }
  };
  it('the smallest sellable pack for the 75c fee is minCardCentsForAppFee(75) = 99c (the platform minimum card sale), not $1.25', () => {
    expect(minCardCentsForAppFee(75)).toBe(99);
    expect(packOk(72, 75)).toBe(false);
    expect(packOk(98, 75)).toBe(false);
    expect(packOk(99, 75)).toBe(true);
    expect(packOk(124, 75)).toBe(true);
  });
  it('agrees with max(99c floor, cardLegFeeFits) for every pack size from 50 cents to $10.00', () => {
    for (const fee of [75, 120, 468]) {
      for (let cents = 50; cents <= 1000; cents += 1) expect(packOk(cents, fee)).toBe(cents >= 99 && cardLegFeeFits(cents, fee));
    }
  });
});

describe('debt padding on the smaller base', () => {
  it('room is computed on the Square-net base and the ceiling applies to base + padding', () => {
    const base = squareAppFeeNetOfProcessingCents(75, 125); // 41
    const pad = computeCashDebtRoomCents({ cashFeeBalance: 10, baseAppFeeCents: base, saleAmountCents: 125 });
    expect(pad).toBe(34);
    expect(base + pad).toBeLessThanOrEqual(Math.floor(125 * 0.6));
  });
});

describe('createSquareCheckoutLink sends the Square-net fee', () => {
  const link = (appFeeCents: number, amountCents: number) =>
    createSquareCheckoutLink({ organizerId: 'org1', idempotencyKey: 'k', amountCents, description: 'x', appFeeCents });

  beforeEach(() => {
    mockLinkCreate.mockResolvedValue({ paymentLink: { id: 'PL1', url: 'https://sq.link/1', orderId: 'O1' } });
  });

  it('$62.46 online PRO: 468 inclusive -> 257 app_fee_money', async () => {
    const r = await link(468, 6246);
    expect(r.ok).toBe(true);
    const sent = mockLinkCreate.mock.calls[0][0];
    expect(Number(sent.checkoutOptions.appFeeMoney.amount)).toBe(257);
    expect(Number(sent.quickPay.priceMoney.amount)).toBe(6246);
  });

  it('omits the app fee entirely when the net fee is 0', async () => {
    await link(20, 125);
    expect(mockLinkCreate.mock.calls[0][0].checkoutOptions).toBeUndefined();
  });

  it('omits the app fee when no fee was asked for', async () => {
    await link(0, 6246);
    expect(mockLinkCreate.mock.calls[0][0].checkoutOptions).toBeUndefined();
  });
});

describe('booth cart leg: Square cost comes out of the platform portion, never the hub owner share', () => {
  const leg = (appFeeCents: number, hubOwnerShareCents?: number) =>
    authorizeSquareBoothCartLeg({
      boothAccessToken: 'tok',
      sharedCardId: 'ccof:1',
      amountCents: 10000,
      appFeeCents,
      cartTransactionId: 'cart1',
      vendorBoothId: 'booth1',
      hubId: 'hub1',
      hubOwnerShareCents,
      hubOwnerSquareLocationId: hubOwnerShareCents ? 'HUB_LOC' : null,
    });

  beforeEach(() => {
    mockCustomersCreate.mockResolvedValue({ customer: { id: 'cust1' } });
    mockPaymentsCreate.mockResolvedValue({ payment: { id: 'pay1', status: 'APPROVED' } });
  });

  it('no hub share: single appFeeMoney = platform fee - Square cost (600 - 320 = 280)', async () => {
    await leg(600);
    const sent = mockPaymentsCreate.mock.calls[0][0];
    expect(Number(sent.appFeeMoney.amount)).toBe(280);
    expect(sent.appFeeAllocations).toBeUndefined();
  });

  it('hub share: allocations are (platform - Square cost) and the full hub share (600 + 500 -> 280 and 500)', async () => {
    await leg(1100, 500);
    const sent = mockPaymentsCreate.mock.calls[0][0];
    expect(sent.appFeeMoney).toBeUndefined();
    expect(sent.appFeeAllocations).toHaveLength(2);
    expect(sent.appFeeAllocations[0].locationId).toBe('PLATFORM_LOC');
    expect(Number(sent.appFeeAllocations[0].amountMoney.amount)).toBe(280);
    expect(sent.appFeeAllocations[1].locationId).toBe('HUB_LOC');
    expect(Number(sent.appFeeAllocations[1].amountMoney.amount)).toBe(500);
  });
});
