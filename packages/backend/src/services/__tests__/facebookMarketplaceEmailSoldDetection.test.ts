/**
 * facebookMarketplaceEmailSoldDetection.ts — unit tests (ADR-131).
 *
 * MOCKING NOTE: '../../lib/prisma' is mocked to a no-op object so this
 * suite never needs a real database connection. The sibling
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
 *
 * SECURITY (2026-09-23): every fixture now carries a passing mx.google.com
 * Authentication-Results header (dkim=pass header.d=facebook.com, dmarc=pass) and a
 * sold-<token>@<forwarding domain> recipient; organizerEmailForwardingService's DB-backed
 * resolveOrganizerIdByForwardingToken is mocked to resolve KNOWN_TOKEN only. Negative
 * cases for both guards live in the two describe blocks at the end of this file.
 */

jest.mock('../../lib/prisma', () => ({ prisma: {} }));
jest.mock('../facebookNativeSaleService', () => ({
  commitFacebookNativeSale: jest.fn(),
}));
jest.mock('../organizerEmailForwardingService', () => ({
  ...jest.requireActual('../organizerEmailForwardingService'),
  resolveOrganizerIdByForwardingToken: jest.fn(async (token: string) =>
    token.toLowerCase() === 'knowntoken_abc123' ? 'organizer_1' : null,
  ),
}));

import {
  processFacebookMarketplaceOrderEmail,
  FACEBOOK_ORDER_EMAIL_SENDER,
  SOLD_VIA_FB_EMAIL_ORDER,
  InboundFacebookOrderEmail,
} from '../facebookMarketplaceEmailSoldDetection';
import { buildFacebookSoldForwardingAddress } from '../organizerEmailForwardingService';

const REAL_ORDER_ID = '10175351837195594';
const REAL_LISTING_ID = '1473556531485754';
const REAL_HREF = `/marketplace/you/shipping_orders/${REAL_ORDER_ID}/?referral_surface=c2c_seller_order_placed_email&listing_id=${REAL_LISTING_ID}`;

const KNOWN_TOKEN = 'KnownToken_abc123';
const PASSING_AUTH_RESULTS =
  'mx.google.com; dkim=pass header.d=facebook.com header.s=s1024-2013-q3 header.b=AbCd; spf=pass (google.com: domain of noreply@facebookmail.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=noreply@facebookmail.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=marketplace.facebook.com';

function orderEmail(overrides: Partial<InboundFacebookOrderEmail> = {}): InboundFacebookOrderEmail {
  return {
    from: FACEBOOK_ORDER_EMAIL_SENDER,
    subject: 'New Marketplace order for Vintage Oak Dresser',
    links: [REAL_HREF],
    authenticationResults: [PASSING_AUTH_RESULTS],
    recipientAddresses: ['someorganizer@gmail.com', buildFacebookSoldForwardingAddress(KNOWN_TOKEN)],
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

      expect(resolveItemIdForListingId).toHaveBeenCalledWith(REAL_LISTING_ID, 'organizer_1');
      expect(resolveItemIdForListingId).not.toHaveBeenCalledWith(REAL_ORDER_ID, expect.anything());
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
      expect(resolveItemIdForListingId).toHaveBeenCalledWith(REAL_LISTING_ID, 'organizer_1');
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
        organizerId: 'organizer_1',
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

describe('sender authentication (DKIM/DMARC via Authentication-Results) -- fail closed', () => {
  async function run(overrides: Partial<InboundFacebookOrderEmail>) {
    const resolveItemIdForListingId = jest.fn().mockResolvedValue('item_123');
    const commitSale = jest.fn().mockResolvedValue({ alreadyCommitted: false });
    const result = await processFacebookMarketplaceOrderEmail(orderEmail(overrides), {
      resolveItemIdForListingId,
      commitSale,
    });
    return { result, resolveItemIdForListingId, commitSale };
  }

  it('ignores an email with no Authentication-Results / ARC headers at all', async () => {
    const { result, resolveItemIdForListingId, commitSale } = await run({
      authenticationResults: [],
      arcAuthenticationResults: [],
    });
    expect(result.kind).toBe('ignored');
    expect(resolveItemIdForListingId).not.toHaveBeenCalled();
    expect(commitSale).not.toHaveBeenCalled();
  });

  it('ignores dkim=pass for the wrong signing domain (header.d=evil.example)', async () => {
    const { result, commitSale } = await run({
      authenticationResults: [
        'mx.google.com; dkim=pass header.d=evil.example header.s=s1; dmarc=pass header.from=marketplace.facebook.com',
      ],
    });
    expect(result.kind).toBe('ignored');
    expect(commitSale).not.toHaveBeenCalled();
  });

  it('ignores a look-alike signing domain that merely ends in the same letters (notfacebook.com)', async () => {
    const { result } = await run({
      authenticationResults: ['mx.google.com; dkim=pass header.d=notfacebook.com; dmarc=pass'],
    });
    expect(result.kind).toBe('ignored');
  });

  it('ignores dkim=fail even for facebook.com', async () => {
    const { result } = await run({
      authenticationResults: ['mx.google.com; dkim=fail header.d=facebook.com; dmarc=pass'],
    });
    expect(result.kind).toBe('ignored');
  });

  it('ignores dkim=pass without dmarc=pass', async () => {
    const { result } = await run({
      authenticationResults: ['mx.google.com; dkim=pass header.d=facebook.com; dmarc=fail (p=REJECT) header.from=marketplace.facebook.com'],
    });
    expect(result.kind).toBe('ignored');
  });

  it('ignores a passing header from an untrusted authserv-id (sender-forged)', async () => {
    const { result } = await run({
      authenticationResults: [`attacker.example; dkim=pass header.d=facebook.com; dmarc=pass`],
    });
    expect(result.kind).toBe('ignored');
  });

  it('only trusts the TOPMOST mx.google.com header -- a forged pass below a real fail is ignored', async () => {
    const { result, commitSale } = await run({
      authenticationResults: [
        'mx.google.com; dkim=none; spf=softfail smtp.mailfrom=evil.example; dmarc=fail header.from=marketplace.facebook.com',
        PASSING_AUTH_RESULTS,
      ],
    });
    expect(result.kind).toBe('ignored');
    expect(commitSale).not.toHaveBeenCalled();
  });

  it('accepts header.i=@facebookmail.com (no header.d) with folded lines, comments and case differences', async () => {
    const { result } = await run({
      authenticationResults: [
        'MX.Google.com;\r\n       DKIM=Pass header.i=@FacebookMail.com header.s=s1024-2013-q3 header.b=AbC;\r\n       spf=pass (google.com: domain of x@facebookmail.com designates 1.2.3.4 as permitted sender; ok) smtp.mailfrom=x@facebookmail.com;\r\n       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=facebookmail.com',
      ],
    });
    expect(result.kind).toBe('matched');
  });

  it('falls back to ARC-Authentication-Results only when no trusted Authentication-Results exists', async () => {
    const { result } = await run({
      authenticationResults: [],
      arcAuthenticationResults: ['i=1; mx.google.com; dkim=pass header.d=facebook.com; dmarc=pass header.from=marketplace.facebook.com'],
    });
    expect(result.kind).toBe('matched');
  });
});

describe('organizer scoping via sold-<token> recipient -- fail closed', () => {
  it('ignores an email with no sold-<token>@<forwarding domain> recipient', async () => {
    const resolveItemIdForListingId = jest.fn();
    const commitSale = jest.fn();
    const result = await processFacebookMarketplaceOrderEmail(
      orderEmail({ recipientAddresses: ['someorganizer@gmail.com', 'find@outreach.finda.sale'] }),
      { resolveItemIdForListingId, commitSale },
    );
    expect(result.kind).toBe('ignored');
    expect(resolveItemIdForListingId).not.toHaveBeenCalled();
    expect(commitSale).not.toHaveBeenCalled();
  });

  it('ignores a sold-<token> address on a different domain', async () => {
    const resolveItemIdForListingId = jest.fn();
    const result = await processFacebookMarketplaceOrderEmail(
      orderEmail({ recipientAddresses: [`sold-${KNOWN_TOKEN}@evil.example`] }),
      { resolveItemIdForListingId },
    );
    expect(result.kind).toBe('ignored');
    expect(resolveItemIdForListingId).not.toHaveBeenCalled();
  });

  it('ignores a token that does not resolve to any organizer', async () => {
    const resolveItemIdForListingId = jest.fn();
    const resolveOrganizerIdByToken = jest.fn().mockResolvedValue(null);
    const result = await processFacebookMarketplaceOrderEmail(orderEmail(), {
      resolveItemIdForListingId,
      resolveOrganizerIdByToken,
    });
    expect(result.kind).toBe('ignored');
    expect(resolveItemIdForListingId).not.toHaveBeenCalled();
  });

  it('ignores recipients whose tokens resolve to more than one organizer (ambiguous)', async () => {
    const resolveItemIdForListingId = jest.fn();
    const resolveOrganizerIdByToken = jest.fn(async (t: string) => (t === 'tokA' ? 'org_A' : 'org_B'));
    const result = await processFacebookMarketplaceOrderEmail(
      orderEmail({
        recipientAddresses: [
          buildFacebookSoldForwardingAddress('tokA'),
          buildFacebookSoldForwardingAddress('tokB'),
        ],
      }),
      { resolveItemIdForListingId, resolveOrganizerIdByToken },
    );
    expect(result.kind).toBe('ignored');
    expect(resolveItemIdForListingId).not.toHaveBeenCalled();
  });

  it('scopes the listing lookup to the organizer resolved from the recipient token (case-insensitive address)', async () => {
    const resolveItemIdForListingId = jest.fn().mockResolvedValue(null);
    const resolveOrganizerIdByToken = jest.fn().mockResolvedValue('organizer_scoped');
    const commitSale = jest.fn();
    const result = await processFacebookMarketplaceOrderEmail(
      orderEmail({ recipientAddresses: [buildFacebookSoldForwardingAddress(KNOWN_TOKEN).toUpperCase()] }),
      { resolveItemIdForListingId, resolveOrganizerIdByToken, commitSale },
    );
    expect(resolveItemIdForListingId).toHaveBeenCalledWith(REAL_LISTING_ID, 'organizer_scoped');
    // Another organizer's item with the same listing_id is simply not visible to this
    // lookup -> unmatched, never committed.
    expect(result.kind).toBe('unmatched');
    expect(commitSale).not.toHaveBeenCalled();
  });
});

describe('parseImapMessageToInboundEmail header extraction', () => {
  it('extracts Authentication-Results (in order), ARC-Authentication-Results and recipient addresses', async () => {
    const { parseImapMessageToInboundEmail } = await import('../facebookMarketplaceEmailPollService');
    const target = buildFacebookSoldForwardingAddress(KNOWN_TOKEN);
    const raw = [
      `Delivered-To: ${target}`,
      'ARC-Authentication-Results: i=1; mx.google.com;',
      '       dkim=pass header.d=facebook.com;',
      '       dmarc=pass header.from=marketplace.facebook.com',
      'Authentication-Results: mx.google.com;',
      '       dkim=pass header.d=facebook.com header.s=s1;',
      '       dmarc=pass (p=REJECT) header.from=marketplace.facebook.com',
      'Authentication-Results: attacker.example; dkim=pass header.d=facebook.com',
      'From: Facebook <noreply@marketplace.facebook.com>',
      'To: Some Organizer <someorganizer@gmail.com>',
      'Subject: New Marketplace order for Vintage Oak Dresser',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      `<a href="https://www.facebook.com${REAL_HREF}">View order</a>`,
      '',
    ].join('\r\n');

    const email = await parseImapMessageToInboundEmail(Buffer.from(raw));

    expect(email.from).toBe('noreply@marketplace.facebook.com');
    expect(email.authenticationResults).toHaveLength(2);
    expect(email.authenticationResults?.[0]).toMatch(/^mx\.google\.com;/);
    expect(email.authenticationResults?.[1]).toMatch(/^attacker\.example;/);
    expect(email.arcAuthenticationResults?.[0]).toMatch(/^i=1; mx\.google\.com;/);
    expect(email.recipientAddresses).toEqual(expect.arrayContaining([target.toLowerCase(), 'someorganizer@gmail.com']));
  });
});
