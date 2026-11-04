/**
 * Security fix (2026-11-04, finding #181, owner decision): GET /api/guest-invoices/lookup-recipient returned
 * the phone and saved home address of ANY registered email to any PRO organizer.
 *
 * WHAT THIS PROVES
 *   - an account with no paid purchase / paid hold invoice on THIS organizer's sales gets exactly the
 *     not-found shape (no phone, no address, exists:false) and no address lookup is even made
 *   - the not-found shape for a stranger is identical to the one for an email with no account
 *   - the organizer's real buyer (paid purchase, or paid hold invoice) still autofills phone and address
 *   - the relationship check is scoped to this organizer's sales and to the buyer's own account id
 */
export {};

const mockPrisma: any = {
  user: { findUnique: jest.fn() },
  purchase: { count: jest.fn() },
  holdInvoice: { count: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn() } } }));
jest.mock('../utils/posAuth', () => ({
  resolveOrganizerOrTeamMember: jest.fn(async () => ({ id: 'org-1', subscriptionTier: 'PRO' })),
}));
jest.mock('../services/holdInvoiceSquareCheckoutHelper', () => ({ createHoldInvoiceSquareCheckout: jest.fn(), generateHoldInvoiceId: jest.fn() }));
jest.mock('../services/squarePaymentService', () => ({ SquareOnboardingIncompleteError: class extends Error {} }));
const mockGetDefaultAddress = jest.fn();
const mockFindGuestPromotionAddress = jest.fn();
jest.mock('../services/addressService', () => ({
  getDefaultAddress: (...a: any[]) => mockGetDefaultAddress(...a),
  findGuestPromotionAddress: (...a: any[]) => mockFindGuestPromotionAddress(...a),
}));

import { lookupRecipientForInvoice } from '../controllers/guestInvoiceController';

const NOT_FOUND = { exists: false, phone: null, address: null, addressSource: null };
const SAVED = { recipientName: 'Victim', line1: '1 Home St', line2: null, city: 'Paw Paw', state: 'MI', zip: '49079', country: 'US' };

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  return res;
};
const lookup = async (email: string) => {
  const res = makeRes();
  await lookupRecipientForInvoice({ query: { email }, user: { id: 'org-user' } } as any, res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', phone: '555-0100' });
  mockPrisma.purchase.count.mockResolvedValue(0);
  mockPrisma.holdInvoice.count.mockResolvedValue(0);
  mockGetDefaultAddress.mockResolvedValue(SAVED);
  mockFindGuestPromotionAddress.mockResolvedValue(null);
});

describe('lookupRecipientForInvoice', () => {
  it('returns the not-found shape for an account that has never bought from this organizer', async () => {
    const res = await lookup('victim@example.com');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(NOT_FOUND);
    expect(mockGetDefaultAddress).not.toHaveBeenCalled();
    expect(mockFindGuestPromotionAddress).not.toHaveBeenCalled();
  });

  it('gives a stranger the same response as an email with no account', async () => {
    const stranger = await lookup('victim@example.com');
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const nobody = await lookup('nobody@example.com');
    expect(stranger.body).toEqual(nobody.body);
  });

  it('checks only this organizer\'s sales and only rows tied to the buyer\'s own account', async () => {
    await lookup('victim@example.com');
    expect(mockPrisma.purchase.count).toHaveBeenCalledWith({
      where: { userId: 'u-1', status: { in: ['PAID', 'REFUNDED'] }, sale: { organizerId: 'org-1' } },
    });
    expect(mockPrisma.holdInvoice.count).toHaveBeenCalledWith({
      where: { shopperUserId: 'u-1', status: { in: ['PAID', 'REFUNDED'] }, sale: { organizerId: 'org-1' } },
    });
  });

  it("autofills phone and saved address for the organizer's real buyer (legit path)", async () => {
    mockPrisma.purchase.count.mockResolvedValue(2);
    const res = await lookup('Buyer@Example.com');
    expect(res.body).toEqual({ exists: true, phone: '555-0100', address: SAVED, addressSource: 'saved' });
  });

  it('a buyer whose only history is a paid hold invoice also autofills', async () => {
    mockPrisma.holdInvoice.count.mockResolvedValue(1);
    const res = await lookup('buyer@example.com');
    expect(res.body.exists).toBe(true);
    expect(res.body.address).toEqual(SAVED);
  });
});
