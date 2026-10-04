/**
 * Owner resolution for label, social, bounty and tag handlers (item editor unification, Wave 1, B1).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * Decisions under test (all default deny, never fail open):
 *  - label (GET /items/:id/label): inventory items ARE labelled by their owner (no sale line); anyone else 403.
 *  - social template: owner-only; the post text names a sale, so an owned saleless item gets a clean 400.
 *  - bounty submit / match: owner-only; bounties are sale-bound, so an owned saleless item gets a clean 400.
 *  - bounty purchase: a submission whose item has no sale gets a clean 400 instead of a crash.
 *  - tag listing: public, published-sale items only; a row without a sale is skipped, never a crash.
 */
const mockItemFindUnique = jest.fn();
const mockItemFindMany = jest.fn();
const mockItemCount = jest.fn();
const mockOrganizerFindFirst = jest.fn();
const mockBountyFindUnique = jest.fn();
const mockBountyFindMany = jest.fn();
const mockSubmissionFindFirst = jest.fn();
const mockSubmissionFindUnique = jest.fn();
const mockSubmissionCreate = jest.fn();
const mockLaunch = jest.fn();
const mockSetContent = jest.fn();

const mockPrisma = {
  item: {
    findUnique: (...a: any[]) => mockItemFindUnique(...a),
    findMany: (...a: any[]) => mockItemFindMany(...a),
    count: (...a: any[]) => mockItemCount(...a),
  },
  organizer: { findFirst: (...a: any[]) => mockOrganizerFindFirst(...a) },
  missingListingBounty: {
    findUnique: (...a: any[]) => mockBountyFindUnique(...a),
    findMany: (...a: any[]) => mockBountyFindMany(...a),
  },
  bountySubmission: {
    findFirst: (...a: any[]) => mockSubmissionFindFirst(...a),
    findUnique: (...a: any[]) => mockSubmissionFindUnique(...a),
    create: (...a: any[]) => mockSubmissionCreate(...a),
  },
};

jest.mock('../index', () => ({ prisma: mockPrisma }));
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

// label
jest.mock('qrcode', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,AA') },
}));
jest.mock('../utils/qrUrl', () => ({
  buildItemQrUrl: (base: string, id: string, src: string) => `${base}/items/${id}?utm_source=${src}`,
  QR_SOURCE_ITEM_LABEL: 'qr_item_label',
}));
jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: (...a: any[]) => mockLaunch(...a) } }), { virtual: true });

// bounty: everything the controller imports besides prisma and the owner helper
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/xpService', () => ({
  awardXp: jest.fn(),
  spendXp: jest.fn(),
  getSpendableXp: jest.fn(),
  XP_AWARDS: {},
}));
jest.mock('../utils/feeCalculator', () => ({
  getInclusivePlatformFeeRate: jest.fn(),
  calculateInclusiveCommissionCents: jest.fn(),
}));
jest.mock('../services/squarePaymentService', () => ({
  resolveOrganizerSquareAccessToken: jest.fn(),
  SquareOnboardingIncompleteError: class SquareOnboardingIncompleteError extends Error {},
  buildSquareIdempotencyKey: jest.fn(),
  createSquareCharge: jest.fn(),
}));
jest.mock('../services/cashFeeService', () => ({
  applyCashDebtToAppFee: jest.fn(),
  settleCashDebtCollection: jest.fn(),
  releaseCashDebtClaim: jest.fn(),
}));
jest.mock('../services/paymentEligibilityService', () => ({ assertSaleCanAcceptPayment: jest.fn() }));
jest.mock('../services/squarePaymentEligibilityService', () => ({ assertSaleCanAcceptSquarePayment: jest.fn() }));
jest.mock('../services/checkoutGuard', () => ({
  assertCheckoutAllowed: jest.fn(),
  CheckoutGuardError: class CheckoutGuardError extends Error {},
}));
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../services/itemStockService', () => ({
  sellItemUnits: jest.fn(),
  InsufficientStockError: class InsufficientStockError extends Error {},
}));
jest.mock('../services/squarePurchaseEngagementService', () => ({ fireSquarePurchaseEngagement: jest.fn() }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn() }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn() }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn() }));
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn() }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn() }));

import { getSingleItemLabel } from '../controllers/labelController';
import { getSocialTemplate } from '../controllers/socialController';
import { submitBountySubmission, matchItemToBounties, completeBountyPurchase } from '../controllers/bountyController';
import { getItemsByTag } from '../controllers/tagController';

const OWNER = 'user_owner';
const OTHER = 'user_other';

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
};

const saleItem = (overrides: any = {}) => ({
  id: 'item_1',
  title: 'Walnut dresser',
  price: 120,
  category: 'Furniture',
  condition: 'GOOD',
  tags: ['walnut'],
  photoUrls: [],
  status: 'AVAILABLE',
  saleId: 'sale_1',
  organizerId: 'org_owner',
  sale: {
    id: 'sale_1',
    title: 'Spring Sale',
    city: 'Paw Paw',
    state: 'MI',
    startDate: new Date('2026-05-01'),
    endDate: new Date('2026-05-02'),
    lat: 42.2,
    lng: -85.9,
    organizerId: 'org_owner',
    organizer: { id: 'org_owner', userId: OWNER, subscriptionTier: 'PRO', lat: null, lng: null },
  },
  ...overrides,
});

const inventoryItem = () => saleItem({ saleId: null, organizerId: 'org_inv', sale: null });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  // The inventory organizer row exists only for the real owner's userId.
  mockOrganizerFindFirst.mockImplementation(async (args: any) =>
    args?.where?.id === 'org_inv' && args?.where?.userId === OWNER
      ? { id: 'org_inv', userId: OWNER, subscriptionTier: 'SIMPLE', lat: null, lng: null }
      : null,
  );
  mockLaunch.mockResolvedValue({
    newPage: async () => ({ setContent: mockSetContent, pdf: async () => Buffer.from('pdf') }),
    close: async () => undefined,
  });
});
afterEach(() => jest.restoreAllMocks());

describe('getSingleItemLabel', () => {
  const req = (userId: string) => ({ params: { id: 'item_1' }, user: { id: userId } } as any);

  it('sale owner gets a label that names the sale', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await getSingleItemLabel(req(OWNER), res);
    expect(res.end).toHaveBeenCalled();
    expect(mockSetContent.mock.calls[0][0]).toContain('class="label-sale">Spring Sale');
  });

  it('another organizer gets 403 on a sale item and no PDF is rendered', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await getSingleItemLabel(req(OTHER), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('inventory owner gets a label with no sale line (no crash)', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await getSingleItemLabel(req(OWNER), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
    expect(mockSetContent.mock.calls[0][0]).not.toContain('class="label-sale"');
    expect(mockSetContent.mock.calls[0][0]).toContain('Walnut dresser');
  });

  it('another organizer gets 403 on an inventory item and no PDF is rendered', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await getSingleItemLabel(req(OTHER), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('missing item is a 404', async () => {
    mockItemFindUnique.mockResolvedValue(null);
    const res = mkRes();
    await getSingleItemLabel(req(OWNER), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('getSocialTemplate', () => {
  const req = (userId: string, roles: string[] = ['ORGANIZER']) =>
    ({ params: { itemId: 'item_1' }, query: {}, user: { id: userId, roles } } as any);

  it('sale owner gets a post that names the sale city', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await getSocialTemplate(req(OWNER), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].text).toContain('Paw Paw');
  });

  it('another organizer gets 403 on a sale item', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await getSocialTemplate(req(OTHER), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('inventory owner gets a clean 400 (the post text needs a sale), not a crash', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await getSocialTemplate(req(OWNER), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('another organizer gets 403 (not 400) on an inventory item', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await getSocialTemplate(req(OTHER), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('a shopper is refused before the item is read', async () => {
    const res = mkRes();
    await getSocialTemplate(req(OWNER, ['USER']), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockItemFindUnique).not.toHaveBeenCalled();
  });
});

describe('submitBountySubmission', () => {
  const req = (userId: string) => ({ params: { id: 'bounty_1' }, body: { itemId: 'item_1' }, user: { id: userId } } as any);

  beforeEach(() => {
    mockBountyFindUnique.mockResolvedValue({ id: 'bounty_1', status: 'OPEN', userId: 'user_shopper', sale: null });
    mockSubmissionFindFirst.mockResolvedValue(null);
    mockSubmissionCreate.mockResolvedValue({ id: 'sub_1' });
  });

  it('sale owner can submit a sale item', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await submitBountySubmission(req(OWNER), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockSubmissionCreate).toHaveBeenCalled();
  });

  it('another organizer gets 403 on a sale item and nothing is created', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await submitBountySubmission(req(OTHER), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSubmissionCreate).not.toHaveBeenCalled();
  });

  it('inventory owner gets a clean 400 (bounties settle through a sale), nothing created', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await submitBountySubmission(req(OWNER), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSubmissionCreate).not.toHaveBeenCalled();
  });

  it('another organizer gets 403 (not 400, not a crash) on an inventory item', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await submitBountySubmission(req(OTHER), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSubmissionCreate).not.toHaveBeenCalled();
  });
});

describe('matchItemToBounties', () => {
  const req = (userId: string) => ({ body: { itemId: 'item_1' }, user: { id: userId } } as any);

  it('sale owner gets matches', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    mockBountyFindMany.mockResolvedValue([]);
    const res = mkRes();
    await matchItemToBounties(req(OWNER), res);
    expect(res.json).toHaveBeenCalledWith({ matches: [] });
  });

  it('another organizer gets 403 on a sale item and no bounties are read', async () => {
    mockItemFindUnique.mockResolvedValue(saleItem());
    const res = mkRes();
    await matchItemToBounties(req(OTHER), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockBountyFindMany).not.toHaveBeenCalled();
  });

  it('inventory owner gets a clean 400', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await matchItemToBounties(req(OWNER), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockBountyFindMany).not.toHaveBeenCalled();
  });

  it('another organizer gets 403 on an inventory item', async () => {
    mockItemFindUnique.mockResolvedValue(inventoryItem());
    const res = mkRes();
    await matchItemToBounties(req(OTHER), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockBountyFindMany).not.toHaveBeenCalled();
  });
});

describe('completeBountyPurchase', () => {
  const req = (userId: string) => ({ params: { id: 'sub_1' }, body: {}, user: { id: userId } } as any);

  it('a submission whose item has no sale gets a clean 400, not a crash', async () => {
    mockSubmissionFindUnique.mockResolvedValue({
      id: 'sub_1',
      status: 'PENDING_REVIEW',
      itemId: 'item_1',
      bounty: { userId: 'user_shopper' },
      item: { id: 'item_1', saleId: null, sale: null },
      organizer: {},
    });
    const res = mkRes();
    await completeBountyPurchase(req('user_shopper'), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('someone other than the bounty owner still gets 403 first', async () => {
    mockSubmissionFindUnique.mockResolvedValue({
      id: 'sub_1',
      status: 'PENDING_REVIEW',
      itemId: 'item_1',
      bounty: { userId: 'user_shopper' },
      item: { id: 'item_1', saleId: null, sale: null },
      organizer: {},
    });
    const res = mkRes();
    await completeBountyPurchase(req('user_intruder'), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('getItemsByTag', () => {
  const req = () => ({ params: { slug: 'walnut' }, query: {} } as any);
  const row = (id: string, sale: any) => ({
    id,
    title: `Item ${id}`,
    price: 10,
    category: 'Furniture',
    condition: 'GOOD',
    photoUrls: [],
    tags: ['walnut'],
    createdAt: new Date('2026-01-01'),
    sale,
  });
  const sale = { id: 'sale_1', title: 'Spring Sale', city: 'Paw Paw', state: 'MI', startDate: null, endDate: null };

  it('lists items with their sale summary', async () => {
    mockItemFindMany.mockResolvedValue([row('a', sale), row('b', sale)]);
    mockItemCount.mockResolvedValue(2);
    const res = mkRes();
    await getItemsByTag(req(), res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.items).toHaveLength(2);
    expect(payload.sales).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({ saleId: 'sale_1', saleTitle: 'Spring Sale' });
  });

  it('skips a row without a sale instead of crashing', async () => {
    mockItemFindMany.mockResolvedValue([row('a', sale), row('inv', null)]);
    mockItemCount.mockResolvedValue(2);
    const res = mkRes();
    await getItemsByTag(req(), res);
    expect(res.status).not.toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.items.map((i: any) => i.id)).toEqual(['a']);
  });
});
