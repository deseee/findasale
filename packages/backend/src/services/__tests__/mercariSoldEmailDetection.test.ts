/**
 * mercariSoldEmailDetection.ts -- unit tests (ADR-131 Mercari branch, 2026-09-23).
 *
 * Fixtures are cut down from the real Mercari sale email in the organizer's inbox
 * (2026-09-02 23:54 UTC, "You've made a sale: Planet Waves XLR Microphone Cable, Male to Female",
 * From: Mercari <no-reply@alerts.us.mercari.com>). The Authentication-Results values are the real
 * ones Gmail stamped (buyer name/address and tracking tokens removed). The non-sale subjects and
 * senders are the real ones from the same inbox.
 */

jest.mock('../../lib/prisma', () => ({ prisma: {} }));
jest.mock('../facebookNativeSaleService', () => ({ commitFacebookNativeSale: jest.fn() }));
jest.mock('../organizerEmailForwardingService', () => ({
  ...jest.requireActual('../organizerEmailForwardingService'),
  resolveOrganizerIdByForwardingToken: jest.fn(async (token: string) =>
    token.toLowerCase() === 'knowntoken_abc123' ? 'organizer_1' : null,
  ),
}));

import {
  processMercariSoldEmail,
  parseMercariSoldEmailBody,
  parseMercariSubjectTitle,
  MERCARI_SOLD_EMAIL_SENDER,
  SOLD_VIA_MERCARI,
  type InboundMercariSoldEmail,
} from '../mercariSoldEmailDetection';
import { buildFacebookSoldForwardingAddress } from '../organizerEmailForwardingService';
import type { PlatformSoldResult } from '../platformSoldDetectionService';

const KNOWN_TOKEN = 'KnownToken_abc123';
const TITLE = 'Planet Waves XLR Microphone Cable, Male to Female';
const REAL_SUBJECT = `You've made a sale: ${TITLE}`;

function saleHtml(title = TITLE, id = 'm55401730709'): string {
  return `<!DOCTYPE html><html><head><title>Mercari</title><style>.e2-body{color:#252B60}</style></head><body>
<div style="display:none">Here's what to do next.</div>
<table><tbody><tr><td style="color: #252B60; line-height: 36px; font-size: 32px; padding: 16px 16px 24px;">
                    Congratulations!<br>You made a sale.</td></tr></tbody></table>
<table class="e2-body-paragraph-container"><tr><td><p>Hi artifactm ,</p>
<p>The buyer is now eagerly awaiting their purchase. We ask you to ship the item within 3 business days.</p></td></tr></table>
<table><tbody><tr><td>
  <p class="e2-details-item-detail-with-id-itemDetails">Item details</p>
  <p><a href="https://ablink.links.us.mercari.com/ls/click?upn=u001.AtGu-2Bea2lEHaT8">${title}</a></p>
  <p>
      ID: ${id}
  </p>
</td><td><a href="https://ablink.links.us.mercari.com/ls/click?upn=u001.x"><img src="https://u-mercari-images.mercdn.net/thumb/photos/${id}_1.jpg?1787923516"></a></td></tr></tbody></table>
<table><tr><td>Price</td><td>Selling fee</td></tr><tr><td>$17.00</td><td>-$2.37</td></tr></table>
<p>Earnings $14.63</p>
<p>Payment will be added to your balance once the buyer confirms delivery.</p>
</body></html>`;
}

// Real header Gmail stamped on receipt at artifactmi@gmail.com (the shape the Workspace mailbox
// stamps on the forwarded copy): Mercari's own signature, a SendGrid signature, DMARC pass.
const PASSING_AUTH =
  'mx.google.com; dkim=pass header.i=@alerts.us.mercari.com header.s=s1 header.b=Uj4lquZW; ' +
  'dkim=pass header.i=@sendgrid.info header.s=smtpapi header.b=w4l0h13w; ' +
  'spf=pass (google.com: domain of bounces+35455781-32b1-artifactmi=gmail.com@abmail.alerts.us.mercari.com designates 223.165.120.131 as permitted sender) ' +
  'smtp.mailfrom="bounces+35455781-32b1-artifactmi=gmail.com@abmail.alerts.us.mercari.com"; ' +
  'dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=mercari.com';

function email(overrides: Partial<InboundMercariSoldEmail> = {}): InboundMercariSoldEmail {
  return {
    from: MERCARI_SOLD_EMAIL_SENDER,
    subject: REAL_SUBJECT,
    rawBody: saleHtml(),
    authenticationResults: [PASSING_AUTH],
    recipientAddresses: ['artifactmi@gmail.com', buildFacebookSoldForwardingAddress(KNOWN_TOKEN)],
    ...overrides,
  };
}

function soldReport(over: Partial<PlatformSoldResult> = {}): PlatformSoldResult {
  return { platform: 'MERCARI', remoteListingId: 'm55401730709', title: TITLE, result: 'sold', itemId: 'item_pw', via: 'title', ...over };
}

describe('parsing', () => {
  it('reads the full title and Mercari item id from the real "Item details" block', () => {
    expect(parseMercariSoldEmailBody(saleHtml())).toEqual({ title: TITLE, mercariItemId: 'm55401730709' });
  });
  it('returns null when the Item details block is missing', () => {
    expect(parseMercariSoldEmailBody('<p>Congratulations! You made a sale.</p>')).toBeNull();
    expect(parseMercariSoldEmailBody(undefined)).toBeNull();
  });
  it('reads the subject title with a straight or curly apostrophe', () => {
    expect(parseMercariSubjectTitle(REAL_SUBJECT)).toBe(TITLE);
    expect(parseMercariSubjectTitle(`You’ve made a sale: ${TITLE}`)).toBe(TITLE);
    expect(parseMercariSubjectTitle(`Transaction canceled: ${TITLE}`)).toBeNull();
  });
});

describe('processMercariSoldEmail -- real sale email', () => {
  it('commits the sale through the platform matcher with the body title and Mercari id', async () => {
    const processReport = jest.fn(async () => soldReport());
    const r = await processMercariSoldEmail(email(), { processReport });
    expect(processReport).toHaveBeenCalledWith('organizer_1', TITLE, 'm55401730709');
    expect(r).toMatchObject({ kind: 'matched', itemId: 'item_pw', soldVia: SOLD_VIA_MERCARI, alreadySold: false });
  });

  it('falls back to the subject title when the body block is missing', async () => {
    const processReport = jest.fn(async () => soldReport());
    await processMercariSoldEmail(email({ rawBody: '<p>You made a sale.</p>' }), { processReport });
    expect(processReport).toHaveBeenCalledWith('organizer_1', TITLE, null);
  });

  it('reports alreadySold on a repeat', async () => {
    const processReport = jest.fn(async () => soldReport({ result: 'alreadySold' }));
    const r = await processMercariSoldEmail(email(), { processReport });
    expect(r).toMatchObject({ kind: 'matched', alreadySold: true });
  });

  it('returns ambiguous / unmatched without committing anything', async () => {
    const amb = await processMercariSoldEmail(email(), {
      processReport: async () => soldReport({ result: 'ambiguous', itemId: undefined, candidateCount: 2 }),
    });
    expect(amb).toMatchObject({ kind: 'ambiguous', candidateCount: 2 });
    const nf = await processMercariSoldEmail(email(), {
      processReport: async () => soldReport({ result: 'notFound', itemId: undefined, reason: 'no_match' }),
    });
    expect(nf).toMatchObject({ kind: 'unmatched', reason: 'no_match' });
  });

  it('throws on a failed commit so the poller leaves the message unread', async () => {
    await expect(
      processMercariSoldEmail(email(), { processReport: async () => soldReport({ result: 'error', reason: 'commit_failed' }) }),
    ).rejects.toThrow(/commit failed/);
  });
});

describe('processMercariSoldEmail -- non-sale Mercari emails are ignored', () => {
  const processReport = jest.fn();
  afterEach(() => processReport.mockClear());

  // Real subjects/senders from the same inbox.
  const cases: Array<[string, string]> = [
    [MERCARI_SOLD_EMAIL_SENDER, `Transaction canceled: ${TITLE}`],
    [MERCARI_SOLD_EMAIL_SENDER, `The buyer has asked to cancel ${TITLE}.`],
    [MERCARI_SOLD_EMAIL_SENDER, 'You’ve updated your payment method.'],
    [MERCARI_SOLD_EMAIL_SENDER, 'ID Check submission complete.'],
    ['no-reply@hello.us.mercari.com', 'You’ve got a chat message for Kaka Ukulele Soprano with Carrying Case.'],
    ['no-reply@hello.us.mercari.com', "'Bored Ape Yacht Club Adidas Tracksuit Into the Metaverse Pixel Medium New BAYC' has 68 views and 3 likes!"],
    ['no-reply@hello.us.mercari.com', 'It’s time to turn “just browsing” into “just sold” 💰'],
    ['no-reply@hello.us.mercari.com', '⚡ Live now: 10% off* item price(s) with code: BACK2SCHOOL'],
    ['no-reply@hello.us.mercari.com', REAL_SUBJECT], // right subject, marketing sender
  ];
  it.each(cases)('ignores from=%s subject=%s', async (from, subject) => {
    const r = await processMercariSoldEmail(email({ from, subject }), { processReport });
    expect(r.kind).toBe('ignored');
    expect(processReport).not.toHaveBeenCalled();
  });

  it('ignores a hand-forwarded "Fwd:" copy', async () => {
    const r = await processMercariSoldEmail(email({ from: 'artifactmi@gmail.com', subject: `Fwd: ${REAL_SUBJECT}` }), { processReport });
    expect(r.kind).toBe('ignored');
  });
});

describe('processMercariSoldEmail -- sender authentication', () => {
  const processReport = jest.fn(async () => soldReport());
  afterEach(() => processReport.mockClear());

  it('rejects the SendGrid signature alone (no mercari.com dkim)', async () => {
    const auth = 'mx.google.com; dkim=pass header.i=@sendgrid.info header.s=smtpapi; dmarc=pass header.from=mercari.com';
    const r = await processMercariSoldEmail(email({ authenticationResults: [auth] }), { processReport });
    expect(r.kind).toBe('ignored');
    expect(processReport).not.toHaveBeenCalled();
  });

  it('rejects a header without dmarc=pass (the real POP3-fetch copy in a second mailbox)', async () => {
    const auth =
      'mx.google.com; spf=pass smtp.mailfrom="bounces@abmail.alerts.us.mercari.com"; ' +
      'dkim=pass header.i=@alerts.us.mercari.com header.s=s1 header.b=Uj4lquZW; dkim=pass header.i=@sendgrid.info header.s=smtpapi';
    const r = await processMercariSoldEmail(email({ authenticationResults: [auth] }), { processReport });
    expect(r.kind).toBe('ignored');
  });

  it('rejects a look-alike domain', async () => {
    const auth = 'mx.google.com; dkim=pass header.i=@alerts.us.notmercari.com; dmarc=pass header.from=notmercari.com';
    const r = await processMercariSoldEmail(email({ authenticationResults: [auth] }), { processReport });
    expect(r.kind).toBe('ignored');
  });

  it('rejects when there is no sold-<token> recipient or the token is unknown', async () => {
    const a = await processMercariSoldEmail(email({ recipientAddresses: ['artifactmi@gmail.com'] }), { processReport });
    expect(a.kind).toBe('ignored');
    const b = await processMercariSoldEmail(email({ recipientAddresses: [buildFacebookSoldForwardingAddress('unknownToken99')] }), { processReport });
    expect(b.kind).toBe('ignored');
    expect(processReport).not.toHaveBeenCalled();
  });
});
