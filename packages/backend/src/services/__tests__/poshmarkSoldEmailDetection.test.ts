/**
 * poshmarkSoldEmailDetection.ts -- unit tests (ADR-131 Poshmark branch, 2026-09-23).
 *
 * RESEARCH-BUILT fixtures: no real Poshmark sale email has reached the mailbox yet. The subject,
 * body sentence, Order ID shape and label PDF name follow the sources cited in the module header.
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
  processPoshmarkSoldEmail,
  parsePoshmarkSubject,
  parsePoshmarkSoldEmailBody,
  isPoshmarkBundleTitle,
  hasPoshmarkLabelPdf,
  normalizeQuotes,
  __resetPoshmarkFirstLiveEmailLog,
  POSHMARK_SOLD_EMAIL_SENDER,
  SOLD_VIA_POSHMARK,
  type InboundPoshmarkSoldEmail,
} from '../poshmarkSoldEmailDetection';
import { buildFacebookSoldForwardingAddress } from '../organizerEmailForwardingService';
import type { PlatformSoldResult } from '../platformSoldDetectionService';

const KNOWN_TOKEN = 'KnownToken_abc123';
const TITLE = 'Lululemon Work It Out Short';
const ORDER_ID = '5f3c2a1b9e8d7c6b5a4f3e2d';
const SUBJECT = `"${TITLE}" just sold to @buyer on Poshmark!`;

function saleHtml(title = TITLE, orderId = ORDER_ID): string {
  return `<html><head><style>.x{color:#822432}</style></head><body>
<p>Hi Pat!</p>
<p>Great news - you just sold &quot;${title}&quot; on Poshmark. Please package your sale and get it ready for shipment. @buyer can&#39;t wait to receive it. You can find all of the details below.</p>
<table>
<tr><td>Buyer</td><td>@buyer</td></tr>
<tr><td>Order Date</td><td>09/22/2026</td></tr>
<tr><td>Order ID</td><td>${orderId}</td></tr>
<tr><td>Tracking Number</td><td>9405511899223197428490</td></tr>
<tr><td colspan="2">${title}</td></tr>
<tr><td>Size</td><td>6</td></tr>
<tr><td>Price</td><td>$38.00</td></tr>
<tr><td>Your Earnings</td><td>$30.40</td></tr>
</table>
<p>Happy Poshing!<br>The Poshmark Team</p>
</body></html>`;
}

const PASSING_AUTH =
  'mx.google.com; dkim=pass header.i=@poshmark.com header.s=s1 header.b=abc123; ' +
  'dkim=pass header.i=@sendgrid.info header.s=smtpapi header.b=def456; ' +
  'spf=pass smtp.mailfrom="bounces+123@em.poshmark.com"; ' +
  'dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=poshmark.com';

function email(overrides: Partial<InboundPoshmarkSoldEmail> = {}): InboundPoshmarkSoldEmail {
  return {
    from: POSHMARK_SOLD_EMAIL_SENDER,
    fromName: 'Poshmark',
    subject: SUBJECT,
    rawBody: saleHtml(),
    attachmentNames: ['pre-paid mailing label 5f3c2a1b.pdf'],
    authenticationResults: [PASSING_AUTH],
    recipientAddresses: ['pat@gmail.com', buildFacebookSoldForwardingAddress(KNOWN_TOKEN)],
    ...overrides,
  };
}

function soldReport(over: Partial<PlatformSoldResult> = {}): PlatformSoldResult {
  return { platform: 'POSHMARK', remoteListingId: '', title: TITLE, result: 'sold', itemId: 'item_lulu', via: 'title', ...over };
}

let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;
beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  __resetPoshmarkFirstLiveEmailLog();
});
afterEach(() => {
  warnSpy.mockRestore();
  logSpy.mockRestore();
});

describe('parsing', () => {
  it('parses the subject with an @handle or a guest buyer', () => {
    expect(parsePoshmarkSubject(SUBJECT)).toEqual({ title: TITLE, buyer: '@buyer' });
    expect(parsePoshmarkSubject(`"${TITLE}" just sold to guest Posher on Poshmark!`)).toEqual({ title: TITLE, buyer: 'guest Posher' });
  });
  it('normalizes curly quotes first', () => {
    expect(normalizeQuotes('“A” ’')).toBe('"A" \'');
    expect(parsePoshmarkSubject(`“${TITLE}” just sold to @buyer on Poshmark!`)?.title).toBe(TITLE);
  });
  it('anchors the greedy title on the LAST `" just sold to `', () => {
    const tricky = 'Tee "just sold to" nobody';
    expect(parsePoshmarkSubject(`"${tricky}" just sold to @b on Poshmark!`)).toEqual({ title: tricky, buyer: '@b' });
  });
  it('rejects anything that is not the sale subject', () => {
    expect(parsePoshmarkSubject(`Fwd: ${SUBJECT}`)).toBeNull();
    expect(parsePoshmarkSubject(`"${TITLE}" just sold to @buyer on Poshmark`)).toBeNull();
    expect(parsePoshmarkSubject(undefined)).toBeNull();
  });
  it('reads the body title, Order ID and label outage text', () => {
    expect(parsePoshmarkSoldEmailBody(saleHtml())).toEqual({ title: TITLE, orderId: ORDER_ID, labelOutageNotice: false });
    const outage = saleHtml().replace('Happy Poshing!', 'Our shipping label system is experiencing delays. Happy Poshing!');
    expect(parsePoshmarkSoldEmailBody(outage).labelOutageNotice).toBe(true);
    expect(parsePoshmarkSoldEmailBody(undefined)).toEqual({ title: null, orderId: null, labelOutageNotice: false });
  });
  it('recognises the label PDF and bundle titles', () => {
    expect(hasPoshmarkLabelPdf(['Pre-Paid Mailing Label 123.pdf'])).toBe(true);
    expect(hasPoshmarkLabelPdf(['invoice.pdf'])).toBe(false);
    expect(isPoshmarkBundleTitle('3 items in bundle')).toBe(true);
    expect(isPoshmarkBundleTitle('1 item in bundle')).toBe(true);
    expect(isPoshmarkBundleTitle('Bundle for @jane')).toBe(true);
    expect(isPoshmarkBundleTitle(TITLE)).toBe(false);
  });
});

describe('processPoshmarkSoldEmail -- sale email', () => {
  it('commits through the platform matcher and logs the first-live-email warn once', async () => {
    const processReport = jest.fn(async () => soldReport());
    const r = await processPoshmarkSoldEmail(email(), { processReport });
    expect(processReport).toHaveBeenCalledWith('organizer_1', TITLE);
    expect(r).toMatchObject({ kind: 'matched', itemId: 'item_lulu', soldVia: SOLD_VIA_POSHMARK, poshmarkOrderId: ORDER_ID, alreadySold: false });
    const firstLive = warnSpy.mock.calls.filter((c) => String(c[0]).includes('poshmark_first_live_email'));
    expect(firstLive).toHaveLength(1);
    expect(firstLive[0][1]).toMatchObject({ orderId: ORDER_ID, labelPdf: true });
    await processPoshmarkSoldEmail(email(), { processReport });
    expect(warnSpy.mock.calls.filter((c) => String(c[0]).includes('poshmark_first_live_email'))).toHaveLength(1);
  });

  it('works with a guest buyer, no PDF and the label outage text', async () => {
    const processReport = jest.fn(async () => soldReport());
    const r = await processPoshmarkSoldEmail(
      email({
        subject: `"${TITLE}" just sold to guest Posher on Poshmark!`,
        attachmentNames: [],
        rawBody: saleHtml().replace('Happy Poshing!', 'Our shipping label system is experiencing delays. Happy Poshing!'),
      }),
      { processReport },
    );
    expect(r.kind).toBe('matched');
  });

  it('prefers the body title when subject and body disagree', async () => {
    const processReport = jest.fn(async () => soldReport());
    await processPoshmarkSoldEmail(email({ subject: '"Lululemon Work It Out Sho" just sold to @buyer on Poshmark!' }), { processReport });
    expect(processReport).toHaveBeenCalledWith('organizer_1', TITLE);
  });

  it('falls back to the subject title when the body sentence is missing', async () => {
    const processReport = jest.fn(async () => soldReport());
    await processPoshmarkSoldEmail(email({ rawBody: '<p>Order details</p>' }), { processReport });
    expect(processReport).toHaveBeenCalledWith('organizer_1', TITLE);
  });

  it('logs a bundle as unresolved bundle_sale and commits nothing', async () => {
    const processReport = jest.fn(async () => soldReport());
    const r = await processPoshmarkSoldEmail(
      email({ subject: '"3 items in bundle" just sold to @buyer on Poshmark!', rawBody: saleHtml('3 items in bundle') }),
      { processReport },
    );
    expect(r).toMatchObject({ kind: 'unmatched', reason: 'bundle_sale' });
    expect(processReport).not.toHaveBeenCalled();
    const r2 = await processPoshmarkSoldEmail(
      email({ subject: '"Bundle for @jane" just sold to @jane on Poshmark!', rawBody: '<p>x</p>' }),
      { processReport },
    );
    expect(r2).toMatchObject({ kind: 'unmatched', reason: 'bundle_sale' });
    expect(processReport).not.toHaveBeenCalled();
  });

  it('returns ambiguous / unmatched, and throws on a failed commit', async () => {
    const amb = await processPoshmarkSoldEmail(email(), {
      processReport: async () => soldReport({ result: 'ambiguous', itemId: undefined, candidateCount: 2 }),
    });
    expect(amb).toMatchObject({ kind: 'ambiguous', candidateCount: 2 });
    const nf = await processPoshmarkSoldEmail(email(), {
      processReport: async () => soldReport({ result: 'notFound', itemId: undefined, reason: 'no_match' }),
    });
    expect(nf).toMatchObject({ kind: 'unmatched', reason: 'no_match' });
    await expect(
      processPoshmarkSoldEmail(email(), { processReport: async () => soldReport({ result: 'error', reason: 'commit_failed' }) }),
    ).rejects.toThrow(/commit failed/);
  });
});

describe('processPoshmarkSoldEmail -- everything else is ignored', () => {
  const processReport = jest.fn();
  afterEach(() => processReport.mockClear());

  const cases: Array<[string, string]> = [
    [POSHMARK_SOLD_EMAIL_SENDER, 'Thanks for shipping order 5f3c2a1b9e8d7c6b5a4f3e2d'],
    [POSHMARK_SOLD_EMAIL_SENDER, 'Reminder to ship'],
    [POSHMARK_SOLD_EMAIL_SENDER, `Return request denied and earnings released for your sale, "${TITLE}"`],
    [POSHMARK_SOLD_EMAIL_SENDER, `@x just made an offer of $5 on "${TITLE}"`],
    ['info@poshmark.com', 'Get your listings SOLD'],
    ['info@poshmark.com', 'Say hello to major SALES'],
    ['info@poshmark.com', 'Drop prices. Make $$$. Repeat.'],
    ['info@poshmark.com', SUBJECT],
    ['shop@poshmark.com', SUBJECT],
    ['orders@poshmark-support.com', 'Your item just sold 🎉'],
    ['orders@poshmark.co', 'Congratulations! Your item has sold'],
    ['orders@poshmark.com.verify-seller.net', SUBJECT],
    ['pat@gmail.com', `Fwd: ${SUBJECT}`],
  ];
  it.each(cases)('ignores from=%s subject=%s', async (from, subject) => {
    const r = await processPoshmarkSoldEmail(email({ from, subject }), { processReport });
    expect(r.kind).toBe('ignored');
    expect(processReport).not.toHaveBeenCalled();
  });

  it('accepts the sender case-insensitively', async () => {
    const r = await processPoshmarkSoldEmail(email({ from: 'Orders@Poshmark.com' }), {
      processReport: async () => soldReport(),
    });
    expect(r.kind).toBe('matched');
  });

  it('refuses a display name other than Poshmark', async () => {
    const r = await processPoshmarkSoldEmail(email({ fromName: 'Poshmark Seller Support' }), { processReport });
    expect(r.kind).toBe('ignored');
    expect(processReport).not.toHaveBeenCalled();
  });
});

describe('processPoshmarkSoldEmail -- sender authentication', () => {
  const processReport = jest.fn(async () => soldReport());
  afterEach(() => processReport.mockClear());

  it('rejects a SendGrid signature alone', async () => {
    const auth = 'mx.google.com; dkim=pass header.i=@sendgrid.info header.s=smtpapi; dkim=pass header.d=sendgrid.net; dmarc=pass header.from=poshmark.com';
    const r = await processPoshmarkSoldEmail(email({ authenticationResults: [auth] }), { processReport });
    expect(r.kind).toBe('ignored');
    expect(processReport).not.toHaveBeenCalled();
  });

  it('rejects without dmarc=pass, and a look-alike domain', async () => {
    const noDmarc = 'mx.google.com; dkim=pass header.i=@poshmark.com';
    expect((await processPoshmarkSoldEmail(email({ authenticationResults: [noDmarc] }), { processReport })).kind).toBe('ignored');
    const lookalike = 'mx.google.com; dkim=pass header.i=@notposhmark.com; dmarc=pass header.from=notposhmark.com';
    expect((await processPoshmarkSoldEmail(email({ authenticationResults: [lookalike] }), { processReport })).kind).toBe('ignored');
    expect(processReport).not.toHaveBeenCalled();
  });

  it('rejects when there is no sold-<token> recipient or the token is unknown', async () => {
    expect((await processPoshmarkSoldEmail(email({ recipientAddresses: ['pat@gmail.com'] }), { processReport })).kind).toBe('ignored');
    expect(
      (await processPoshmarkSoldEmail(email({ recipientAddresses: [buildFacebookSoldForwardingAddress('unknownToken99')] }), { processReport })).kind,
    ).toBe('ignored');
    expect(processReport).not.toHaveBeenCalled();
  });
});

describe('parseImapMessageToInboundEmail carries the display name and attachment names', () => {
  it('reads fromName and the label PDF name from a raw message', async () => {
    const { parseImapMessageToInboundEmail } = await import('../facebookMarketplaceEmailPollService');
    const raw = [
      `Delivered-To: ${buildFacebookSoldForwardingAddress(KNOWN_TOKEN)}`,
      `Authentication-Results: ${PASSING_AUTH}`,
      'From: Poshmark <orders@poshmark.com>',
      'To: pat@gmail.com',
      `Subject: ${SUBJECT}`,
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/html; charset=utf-8',
      '',
      saleHtml(),
      '--b1',
      'Content-Type: application/pdf; name="pre-paid mailing label.pdf"',
      'Content-Disposition: attachment; filename="pre-paid mailing label.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      'JVBERi0xLjQK',
      '--b1--',
      '',
    ].join('\r\n');
    const parsed = await parseImapMessageToInboundEmail(Buffer.from(raw));
    expect(parsed.from).toBe('orders@poshmark.com');
    expect(parsed.fromName).toBe('Poshmark');
    expect(parsed.attachmentNames).toEqual(['pre-paid mailing label.pdf']);
    const r = await processPoshmarkSoldEmail(parsed, { processReport: async () => soldReport() });
    expect(r).toMatchObject({ kind: 'matched', poshmarkOrderId: ORDER_ID });
  });
});
