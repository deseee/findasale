/**
 * First LIVE Poshmark sale email (2026-10-28), end to end in the live format.
 *
 * Regression: the Mouse Trap sale e-mail reached the polled inbox (forwarded via the organizer's
 * sold-<token> address) and the poller found it, but the research-built parser expected a
 * quoted title ('"<title>" just sold to ...'). The real subject has no quotes, so the message was
 * IGNORED and given a permanent processed marker; the item stayed AVAILABLE.
 *
 * The fixture (fixtures/poshmark-sold-email-2026-10-28.eml) is a SANITIZED reduction of that message:
 * the real sender, folded unquoted Subject, Date, Message-ID and the real HTML body structure (h1 title
 * line, Order Number row, item row), with placeholder recipient addresses, a placeholder buyer handle,
 * and no Received/DKIM/ARC/Authentication-Results headers or tracking links. Because the signatures are
 * gone, the DKIM/DMARC verdict is stubbed (its own parsing is covered by poshmarkSoldEmailDetection.test.ts).
 * Real mailparser, real header parsing, real subject/body parsing and the real window/marker loop; only
 * the IMAP client, the auth verdict, the database and the sale commit are faked.
 */

// Placeholder forwarding domain used by the fixture (read by organizerEmailForwardingService at load).
process.env.FACEBOOK_SOLD_EMAIL_DOMAIN = 'outreach.example';

import fs from 'fs';
import path from 'path';

const mockPrisma: any = {
  processedWebhookEvent: { findMany: jest.fn(), create: jest.fn() },
  organizer: { findUnique: jest.fn() },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/notificationService', () => ({ createNotification: jest.fn() }));
const mockResolveToken = jest.fn();
jest.mock('../organizerEmailForwardingService', () => ({
  ...jest.requireActual('../organizerEmailForwardingService'),
  resolveOrganizerIdByForwardingToken: (...a: any[]) => mockResolveToken(...a),
}));
const mockReport = jest.fn();
jest.mock('../platformSoldDetectionService', () => ({
  processPlatformSoldReport: (...a: any[]) => mockReport(...a),
}));
jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }));
const mockVerifyAuth = jest.fn();
jest.mock('../inboundEmailAuthService', () => ({
  ...jest.requireActual('../inboundEmailAuthService'),
  verifyInboundEmailAuthentication: (...a: any[]) => mockVerifyAuth(...a),
}));

import {
  processPoshmarkBatch,
  parseImapMessageToInboundEmail,
  soldEmailEventKey,
  type FacebookSoldEmailPollResult,
} from '../facebookMarketplaceEmailPollService';
import { processPoshmarkSoldEmail } from '../poshmarkSoldEmailDetection';
import { getSoldEmailSource } from '../soldEmailSourceGuard';

const FIXTURE = path.join(__dirname, 'fixtures', 'poshmark-sold-email-2026-10-28.eml');
// IMAP hands back CRLF; the repo stores the fixture with LF (.gitattributes eol=lf).
const RAW = Buffer.from(fs.readFileSync(FIXTURE, 'utf8').replace(/\r?\n/g, '\r\n'));
const MESSAGE_ID = '<Fw0djysIQYCJc1Qygku-8A@geopod-ismtpd-16>';
const FORWARDING_ID = 'testtoken'; // fixture recipient: sold-TESTTOKEN@outreach.example
const BUYER = '@testbuyer';
const ORGANIZER = 'cmnxueoas0005tfv8brnc0kky';
const ITEM = 'cmtbh5sq2021pp46dpxr6yr2j';
const TITLE = 'Mouse Trap Board Game, Milton Bradley, Vintage 1990s';
const ORDER = '6ae1e377fc6d1e98d84076b2';
// The marker the deployed (pre-fix) poller wrote on 2026-10-28 13:00 UTC when it ignored the e-mail.
const OLD_MARKER = `sold-email:Poshmark:${MESSAGE_ID}`;

function newResult(): FacebookSoldEmailPollResult {
  const c = () => ({ processed: 0, matched: 0, unmatched: 0, ambiguous: 0, ignored: 0 });
  return { processed: 0, matched: 0, unmatched: 0, ignored: 0, errors: [], vinted: c(), mercari: c(), poshmark: c(), grailed: c() };
}

// UID 295 in the polled inbox, already \Seen (the old poller marked it after ignoring it).
function fakeClient() {
  return {
    search: jest.fn(async () => [295]),
    fetch: jest.fn((requested: number[]) =>
      (async function* () {
        for (const uid of requested) {
          yield { uid, envelope: { messageId: MESSAGE_ID, date: new Date('2026-10-28T11:58:49Z') }, flags: new Set(['\\Seen']) };
        }
      })(),
    ),
    fetchOne: jest.fn(async () => ({ source: RAW })),
    messageFlagsAdd: jest.fn(async () => true),
  };
}

let markers: Set<string>;
let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  markers = new Set([OLD_MARKER]);
  mockPrisma.processedWebhookEvent.findMany.mockImplementation(async ({ where }: any) =>
    (where.eventId.in as string[]).filter((k) => markers.has(k)).map((eventId) => ({ eventId })),
  );
  mockPrisma.processedWebhookEvent.create.mockImplementation(async ({ data }: any) => {
    if (markers.has(data.eventId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
    markers.add(data.eventId);
    return data;
  });
  mockResolveToken.mockImplementation(async (t: string) => (t.toLowerCase() === FORWARDING_ID ? ORGANIZER : null));
  mockVerifyAuth.mockReturnValue({ ok: true });
  mockReport.mockImplementation(async (_p: string, _s: string, _o: string, r: any) => ({
    platform: 'POSHMARK', remoteListingId: '', title: r.title, result: 'sold', itemId: ITEM, via: 'title',
  }));
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
  logSpy.mockRestore();
});

describe('real Poshmark sale e-mail (2026-10-28)', () => {
  it('parses to the shape the Poshmark branch reads (sender, folded subject, forwarding address)', async () => {
    const e = await parseImapMessageToInboundEmail(RAW);
    expect(e.from).toBe('orders@poshmark.com');
    expect(e.fromName).toBe('Poshmark');
    expect(e.subject.replace(/\s+/g, ' ')).toBe(`${TITLE} just sold to ${BUYER} on Poshmark!`);
    expect(e.recipientAddresses).toContain(`sold-${FORWARDING_ID}@outreach.example`);
    expect(e.attachmentNames).toEqual([]);
  });

  it('commits the sale with the body title and the Order Number', async () => {
    const e = await parseImapMessageToInboundEmail(RAW);
    const r = await processPoshmarkSoldEmail(e);
    expect(mockReport).toHaveBeenCalledWith('POSHMARK', 'POSHMARK', ORGANIZER, { remoteListingId: '', title: TITLE, orderId: ORDER });
    expect(r).toMatchObject({ kind: 'matched', organizerId: ORGANIZER, itemId: ITEM, title: TITLE, poshmarkOrderId: ORDER, alreadySold: false });
    // The sender-authentication gate is still consulted for Poshmark's DKIM domain.
    expect(mockVerifyAuth).toHaveBeenCalledWith(expect.objectContaining({ from: 'orders@poshmark.com' }), ['poshmark.com']);
    expect(mockResolveToken).toHaveBeenCalledWith(FORWARDING_ID);
  });

  it('fails closed (no sale) when the sender-authentication verdict fails', async () => {
    mockVerifyAuth.mockReturnValue({ ok: false, reason: 'no dkim=pass for poshmark.com' });
    const r = await processPoshmarkSoldEmail(await parseImapMessageToInboundEmail(RAW));
    expect(r.kind).toBe('ignored');
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('the next poll re-examines the e-mail the old parser ignored, commits it once, and then leaves it alone', async () => {
    expect(soldEmailEventKey('Poshmark', { uid: 295, messageId: MESSAGE_ID })).not.toBe(OLD_MARKER);

    let source: any;
    mockReport.mockImplementation(async (_p: string, _s: string, _o: string, r: any) => {
      source = getSoldEmailSource();
      return { platform: 'POSHMARK', remoteListingId: '', title: r.title, result: 'sold', itemId: ITEM, via: 'title' };
    });
    const client = fakeClient();
    const result = newResult();
    await processPoshmarkBatch(client as any, result);

    expect(result.errors).toEqual([]);
    expect(result.poshmark).toMatchObject({ processed: 1, matched: 1, ignored: 0 });
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith('POSHMARK', 'POSHMARK', ORGANIZER, { remoteListingId: '', title: TITLE, orderId: ORDER });
    // The sale commit sees which e-mail it came from (replay / relist guard) and its real date.
    expect(source).toEqual({ key: soldEmailEventKey('Poshmark', { uid: 295, messageId: MESSAGE_ID }), sentAt: new Date('2026-10-28T11:58:49Z') });
    expect(markers.has(soldEmailEventKey('Poshmark', { uid: 295, messageId: MESSAGE_ID }))).toBe(true);
    expect(client.messageFlagsAdd).not.toHaveBeenCalled(); // already \Seen

    // Following polls: handled, never committed twice.
    const again = newResult();
    await processPoshmarkBatch(fakeClient() as any, again);
    expect(again.poshmark.processed).toBe(0);
    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  it('the Gmail search still matches the live subject (phrase, no quote dependence)', async () => {
    const client = fakeClient();
    await processPoshmarkBatch(client as any, newResult());
    const query = (client.search.mock.calls[0] as any[])[0].gmraw as string;
    expect(query).toContain('from:orders@poshmark.com');
    expect(query).toContain('subject:"just sold to"');
    expect(query).toMatch(/newer_than:\d+d/);
  });
});
