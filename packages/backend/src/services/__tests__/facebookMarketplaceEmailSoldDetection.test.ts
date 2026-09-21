/**
 * facebookMarketplaceEmailSoldDetection.ts — unit tests (ADR-131).
 *
 * MOCKING NOTE (same convention as ebayRateEstimateDestinationSurcharge.test.ts /
 * ebayRateEstimateHighWeightDecomposition.test.ts): '../lib/prisma' is mocked to a
 * no-op object so this suite never needs a real database connection. The sibling
 * facebookNativeSaleService module (which itself pulls in ebayController,
 * shopifyService, and the Discogs connector) is also mocked out at the module
 * boundary -- every test below supplies its own `resolveItemIdForListingId` /
 * `commitSale` via the `deps` parameter, so the real default implementations (and
 * their heavy transitive imports) are never exercised here. This keeps the suite a
 * true unit test of the parsing/matching/fail-closed logic only.
 *
 * Fixtures below are modeled directly on ADR-131's real, live-verified example:
 * subject "New Marketplace order for {item title}" and link
 * ".../marketplace/you/shipping_orders/10175351837195594/?referral_surface=
 * c2c_seller_order_placed_email&listing_id=1473556531485754" -- 10175351837195594 is
 * the shipping/order id (path segment), 1473556531485754 is the listing id (query
 * param) -- the two must never be confused, which several assertions below check for.
 */

jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../facebookNativeSaleService', () => ({
  commitFacebookNativeSale: jest.fn(),
}));

import {
  processFacebookMarketplaceOrderEmail,
  FACEBOOK_ORDER_EMAIL_SENDER,
  SOLD_VIA_FB_EMAIL_ORDER,
  InboundFacebookOrderEmail,
} from '../facebookMarketplaceEmailSoldDetection';

const REAL_ORDER_ID = '10175351837195594';
const REAL_LISTING_ID = '1473556531485754';
const REAL_HREF = `/marketplace/you/shipping_orders/${REAL_ORDER_ID}/?referral_surface=c2c_seller_order_placed_email&listing_id=${REAL_LISTING_ID}`;

function orderEmail(overrides: Partial<InboundFacebookOrderEmail> = {}): InboundFacebookOrderEmail {
  return {
    from: FACEBOOK_ORDER_EMAIL_SENDER,
    subject: 'New Marketplace order for Vintage Oak Dresser',
    links: [REAL_HREF],
    ...overrides,
  };
}

describe('processFacebookMarketplaceOrderEmail (ADR-131)', () => {
  describe('sender/subject filtering', () => {
    it('ignores an email from any sender other than the exact Facebook Marketplace address', async () => {
      const result = await processFacebookMarketplaceOrderEmail(
        orderEmail({ from: 'attacker@evil.example.com' }),
      );
      expect(result.kind).toBe('ignored');
    });

    it('ignores a sibling email from the real sender with a different subject (offer, not an order)', async () => {
      const result = await processFacebookMarketplaceOrderEmail(
        orderEmail({ subject: 'New Marketplace offer of $45 for Vintage Oak Dresser' }),
      );
      expect(result.kind).toBe('ignored');
    });

    it('ignores a shipping-label sibling email from the real sender', async () => {
      const result = await processFacebookMarketplaceOrderEmail(
        orderEmail({ subject: 'Shipping label for your Marketplace order' }),
      );
      expect(result.kind).toBe('ignored');
    });

    it('ignores a delivery-confirmation sibling email from the real sender', async () => {
      const result = await processFacebookMarketplaceOrderEmail(
        orderEmail({ subject: 'Your order has arrived' }),
      );
      expect(result.kind).toBe('ignored');
    });

    it('accepts the real sender address regardless of casing', async () => {
      const resolveItemIdForListingId = jest.fn().mockResolvedValue('item_123');
      const commitSale = jest.fn().mockResolvedValue({ alreadyCommitted: false });

      const result = await processFacebookMarketplaceOrderEmail(
        orderEmail({ from: 'NoReply@Marketplace.Facebook.Com' }),
        { resolveItemIdForListingId, commitSale },
      );

      expect(result.kind).toBe('matched');
    });
  });

  describe('listing_id extraction', () => {
    it('extracts listing_id from the href query string, not the path-segment order id', async () => {
      const resolveItemIdForListingId = jest.fn().mockResolvedValue('item_123');
      const commitSale = jest.fn().mockResolvedValue({ alreadyCommitted: false });

      const result = await processFacebookMarketplaceOrderEmail(orderEmail(), {
        resolveItemIdForListingId,
        commitSale,
      });

      expect(resolveItemIdForListingId).toHaveBeenCalledWith(REAL_LISTING_ID);
      expect(resolveItemIdForListingId).not.toHaveBeenCalledWith(REAL_ORDER_ID);
      if (result.kind === 'matched') {
        expect(result.remoteListingId).toBe(REAL_LISTING_ID);
        expect(result.remoteOrderId).toBe(REAL_ORDER_ID);
      } else {
        throw new Error(`expected matched, got ${result.kind}`);
      }
    });

    it('extracts listing_id from rawBody when no links array is provided', async () => {
      const resolveItemIdForListingId = jest.fn().mockResolvedValue('item_123');
      const commitSale = jest.fn().mockResolvedValue({ alreadyCommitted: false });

      const result = await processFacebookMarketplaceOrderEmail(
        orderEmail({ links: undefined, rawBody: `<a href="${REAL_HREF}">View order</a>` }),
        { resolveItemIdForListingId, commitSale },
      );

      expect(result.kind).toBe('matched');
      expect(resolveItemIdForListingId).toHaveBeenCalledWith(REAL_LISTING_ID);
    });

    it('does NOT extract a listing id from visible link text alone (only href/rawBody)', async () => {
      // Simulates a caller that only captured rendered text, not the anchor's real href --
      // no query string present anywhere, so extraction must fail closed to 'unmatched'.
      const resolveItemIdForListingId = jest.fn();
      const result = await processFacebookMarketplaceOrderEmail(
        orderEmail({ links: ['View your order'] }),
        { resolveItemIdForListingId },
      );

      expect(result.kind).toBe('unmatched');
      expect(resolveItemIdForListingId).not.toHaveBeenCalled();
    });
  });

  describe('fail-closed matching (ADR-131 §3 -- non-negotiable)', () => {
    it('returns unmatched with order id + subject title when no MarketplaceListingJob row matches, and never calls commitSale', async () => {
      const resolveItemIdForListingId = jest.fn().mockResolvedValue(null);
      const commitSale = jest.fn();

      const result = await processFacebookMarketplaceOrderEmail(orderEmail(), {
        resolveItemIdForListingId,
        commitSale,
      });

      expect(result.kind).toBe('unmatched');
      if (result.kind === 'unmatched') {
        expect(result.remoteOrderId).toBe(REAL_ORDER_ID);
        expect(result.remoteListingId).toBe(REAL_LISTING_ID);
        expect(result.itemTitleFromSubject).toBe('Vintage Oak Dresser');
      }
      expect(commitSale).not.toHaveBeenCalled();
    });

    it('never falls back to a title-based match when the listing id itself cannot be extracted', async () => {
      const resolveItemIdForListingId = jest.fn();
      const commitSale = jest.fn();

      const result = await processFacebookMarketplaceOrderEmail(
        orderEmail({ links: [], rawBody: 'no useful link in this body at all' }),
        { resolveItemIdForListingId, commitSale },
      );

      expect(result.kind).toBe('unmatched');
      if (result.kind === 'unmatched') {
        expect(result.remoteListingId).toBeNull();
        expect(result.itemTitleFromSubject).toBe('Vintage Oak Dresser');
      }
      expect(resolveItemIdForListingId).not.toHaveBeenCalled();
      expect(commitSale).not.toHaveBeenCalled();
    });
  });

  describe('on a real match', () => {
    it('commits the sale with soldVia=FB_EMAIL_ORDER and returns the matched itemId', async () => {
      const resolveItemIdForListingId = jest.fn().mockResolvedValue('item_abc');
      const commitSale = jest.fn().mockResolvedValue({ alreadyCommitted: false });

      const result = await processFacebookMarketplaceOrderEmail(orderEmail(), {
        resolveItemIdForListingId,
        commitSale,
      });

      expect(commitSale).toHaveBeenCalledWith('item_abc', SOLD_VIA_FB_EMAIL_ORDER);
      expect(result).toMatchObject({
        kind: 'matched',
        itemId: 'item_abc',
        remoteListingId: REAL_LISTING_ID,
        remoteOrderId: REAL_ORDER_ID,
        soldVia: SOLD_VIA_FB_EMAIL_ORDER,
        alreadyCommitted: false,
      });
    });

    it('surfaces alreadyCommitted=true from an idempotent repeat without treating it as an error', async () => {
      const resolveItemIdForListingId = jest.fn().mockResolvedValue('item_abc');
      const commitSale = jest.fn().mockResolvedValue({ alreadyCommitted: true });

      const result = await processFacebookMarketplaceOrderEmail(orderEmail(), {
        resolveItemIdForListingId,
        commitSale,
      });

      expect(result.kind).toBe('matched');
      if (result.kind === 'matched') {
        expect(result.alreadyCommitted).toBe(true);
      }
    });
  });
});
