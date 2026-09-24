/**
 * grailedSoldEmailDetection.ts -- unit tests (ADR-131 Grailed branch, PROVISIONAL 2026-09-23).
 *
 * Only Grailed's in-app GrailedBot wording is known ("You just sold <title> in Size <size> for
 * $<price>", "Item Sold: <title> in Size S for $385"). The sale email's subject is a guess, so
 * these tests pin the fail-closed behaviour more than the template.
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
  processGrailedSoldEmail,
  parseGrailedSoldEmailTitle,
  isGrailedSaleSubject,
  GRAILED_SOLD_EMAIL_SENDER,
  SOLD_VIA_GRAILED,
  type InboundGrailedSoldEmail,
} from '../grailedSoldEmailDetection';
import { buildFacebookSoldForwardingAddress } from '../organizerEmailForwardingService';
import type { PlatformSoldResult } from '../platformSoldDetectionService';

const KNOWN_TOKEN = 'KnownToken_abc123';
const TITLE = 'Rick Owens Geobasket High Top Sneakers';

const PASSING_AUTH =
  'mx.google.com; dkim=pass header.i=@grailed.com header.s=k1 header.b=abc; ' +
  'dkim=pass header.i=@mailgun.org header.s=mg header.b=def; dmarc=pass (p=QUARANTINE) header.from=grailed.com';

function saleHtml(title = TITLE): string {
  return `<html><body><h1>SALE CONFIRMED</h1><p>Congrats! You just sold ${title} in Size 43 for $385.00.</p><p>Ship within 7 days.</p></body></html>`;
}

function email(overrides: Partial<InboundGrailedSoldEmail> = {}): InboundGrailedSoldEmail {
  return {
    from: GRAILED_SOLD_EMAIL_SENDER,
    subject: 'Your item sold!',
    rawBody: saleHtml(),
    authenticationResults: [PASSING_AUTH],
    recipientAddresses: ['pat@gmail.com', buildFacebookSoldForwardingAddress(KNOWN_TOKEN)],
    ...overrides,
  };
}

function soldReport(over: Partial<PlatformSoldResult> = {}): PlatformSoldResult {
  return { platform: 'GRAILED', remoteListingId: '', title: TITLE, result: 'sold', itemId: 'item_ro', via: 'title', ...over };
}

let warnSpy: jest.SpyInstance;
beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warnSpy.mockRestore());

describe('parsing', () => {
  it('reads both GrailedBot wordings', () => {
    expect(parseGrailedSoldEmailTitle(saleHtml())).toBe(TITLE);
    expect(parseGrailedSoldEmailTitle('<p>Item Sold: Kapital Boro Jacket in Size S for $385</p>')).toBe('Kapital Boro Jacket');
    expect(parseGrailedSoldEmailTitle('<p>You just sold Acne Studios Jeans in size 32 US / EU 48 for $1,020</p>')).toBe('Acne Studios Jeans');
    expect(parseGrailedSoldEmailTitle('<p>Your item has been sold.</p>')).toBeNull();
    expect(parseGrailedSoldEmailTitle(undefined)).toBeNull();
  });
  it('applies the provisional subject gate', () => {
    expect(isGrailedSaleSubject('Your item sold!')).toBe(true);
    expect(isGrailedSaleSubject('Sale confirmed')).toBe(true);
    expect(isGrailedSaleSubject('Your listing is incomplete.')).toBe(false);
    expect(isGrailedSaleSubject('Please verify your email address')).toBe(false);
    expect(isGrailedSaleSubject('New offer on your sale item')).toBe(false);
    expect(isGrailedSaleSubject('Weekly digest')).toBe(false);
  });
});

describe('processGrailedSoldEmail -- parse and match', () => {
  it('commits the parsed title through the platform matcher', async () => {
    const processReport = jest.fn(async () => soldReport());
    const r = await processGrailedSoldEmail(email(), { processReport });
    expect(processReport).toHaveBeenCalledWith('organizer_1', TITLE);
    expect(r).toMatchObject({ kind: 'matched', itemId: 'item_ro', soldVia: SOLD_VIA_GRAILED, alreadySold: false });
  });

  it('returns ambiguous / unmatched and throws on a failed commit', async () => {
    const amb = await processGrailedSoldEmail(email(), {
      processReport: async () => soldReport({ result: 'ambiguous', itemId: undefined, candidateCount: 3 }),
    });
    expect(amb).toMatchObject({ kind: 'ambiguous', candidateCount: 3 });
    const nf = await processGrailedSoldEmail(email(), {
      processReport: async () => soldReport({ result: 'notFound', itemId: undefined, reason: 'title_too_short' }),
    });
    expect(nf).toMatchObject({ kind: 'unmatched', reason: 'title_too_short' });
    await expect(
      processGrailedSoldEmail(email(), { processReport: async () => soldReport({ result: 'error', reason: 'commit_failed' }) }),
    ).rejects.toThrow(/commit failed/);
  });
});

describe('processGrailedSoldEmail -- unparsed but logged', () => {
  it('commits nothing and logs grailed_unparsed with the subject and a 300-char excerpt', async () => {
    const processReport = jest.fn();
    const longBody = `<p>Congrats, your item sold! ${'Details about shipping and payouts. '.repeat(30)}</p>`;
    const r = await processGrailedSoldEmail(email({ subject: 'Congrats, your item sold', rawBody: longBody }), { processReport });
    expect(r).toMatchObject({ kind: 'unmatched', title: null, reason: 'grailed_unparsed' });
    expect(processReport).not.toHaveBeenCalled();
    const call = warnSpy.mock.calls.find((c) => String(c[0]).includes('grailed_unparsed'));
    expect(call).toBeDefined();
    const payload = (call as any[])[1];
    expect(payload.subject).toBe('Congrats, your item sold');
    expect(payload.bodyExcerpt.length).toBe(300);
    expect(payload.bodyExcerpt.startsWith('Congrats, your item sold!')).toBe(true);
  });
});

describe('processGrailedSoldEmail -- ignored emails', () => {
  const processReport = jest.fn();
  afterEach(() => processReport.mockClear());

  const cases: Array<[string, string]> = [
    [GRAILED_SOLD_EMAIL_SENDER, 'Your listing is incomplete.'],
    [GRAILED_SOLD_EMAIL_SENDER, 'Please verify your email address'],
    [GRAILED_SOLD_EMAIL_SENDER, 'You received an offer'],
    ['news@mail.grailed.com', 'Final Hours: Grail Sale'],
    ['news@mail.grailed.com', 'Your item sold!'],
    ['support@grailed-payments.com', 'Your Item has been sold'],
    ['help@grailed.co', 'Your Item has been sold'],
    ['pat@gmail.com', 'Fwd: Your item sold!'],
  ];
  it.each(cases)('ignores from=%s subject=%s', async (from, subject) => {
    const r = await processGrailedSoldEmail(email({ from, subject }), { processReport });
    expect(r.kind).toBe('ignored');
    expect(processReport).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('grailed_unparsed'))).toBe(false);
  });

  it('rejects a Mailgun signature alone, and a missing dmarc=pass', async () => {
    const mailgunOnly = 'mx.google.com; dkim=pass header.i=@mailgun.org; dmarc=pass header.from=grailed.com';
    expect((await processGrailedSoldEmail(email({ authenticationResults: [mailgunOnly] }), { processReport })).kind).toBe('ignored');
    const noDmarc = 'mx.google.com; dkim=pass header.i=@grailed.com';
    expect((await processGrailedSoldEmail(email({ authenticationResults: [noDmarc] }), { processReport })).kind).toBe('ignored');
    expect(processReport).not.toHaveBeenCalled();
  });

  it('rejects an unknown forwarding token', async () => {
    const r = await processGrailedSoldEmail(email({ recipientAddresses: [buildFacebookSoldForwardingAddress('unknownToken99')] }), { processReport });
    expect(r.kind).toBe('ignored');
    expect(processReport).not.toHaveBeenCalled();
  });
});
