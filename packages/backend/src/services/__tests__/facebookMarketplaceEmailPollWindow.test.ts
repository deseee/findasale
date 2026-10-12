/**
 * facebookMarketplaceEmailPollService.ts -- recent-window + processed-marker polling for the
 * title-matched sold-email branches (Vinted, Mercari, Poshmark, Grailed), 2026-10-12.
 *
 * Regression: the first live Vinted bundle sale email was never processed (the poller logged
 * "No unread Vinted sold emails found"). The branches no longer depend on is:unread; they search a
 * 3-day window and dedupe on a ProcessedWebhookEvent marker keyed by the Message-ID.
 */

const mockPrisma: any = {
  processedWebhookEvent: { findMany: jest.fn(), create: jest.fn() },
  organizer: { findUnique: jest.fn() },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
const mockCreateNotification = jest.fn();
jest.mock('../../lib/notificationService', () => ({ createNotification: (...a: any[]) => mockCreateNotification(...a) }));
const mockNotifyBundle = jest.fn();
const mockListOrphans = jest.fn();
const mockAttach = jest.fn();
jest.mock('../vintedBundleSaleService', () => ({
  ...jest.requireActual('../vintedBundleSaleService'),
  notifyOrganizerVintedBundleSale: (...a: any[]) => mockNotifyBundle(...a),
  listBundleNoticesMissingConversation: (...a: any[]) => mockListOrphans(...a),
  attachConversationToNotice: (...a: any[]) => mockAttach(...a),
}));
const mockProcessVinted = jest.fn();
const mockInspect = jest.fn();
jest.mock('../vintedSoldEmailDetection', () => ({
  processVintedSoldEmail: (...a: any[]) => mockProcessVinted(...a),
  inspectVintedBundleEmail: (...a: any[]) => mockInspect(...a),
}));
jest.mock('../facebookMarketplaceEmailSoldDetection', () => ({ processFacebookMarketplaceOrderEmail: jest.fn() }));
jest.mock('../mercariSoldEmailDetection', () => ({ processMercariSoldEmail: jest.fn() }));
jest.mock('../poshmarkSoldEmailDetection', () => ({ processPoshmarkSoldEmail: jest.fn() }));
jest.mock('../grailedSoldEmailDetection', () => ({ processGrailedSoldEmail: jest.fn() }));
jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }));
jest.mock('mailparser', () => ({
  simpleParser: jest.fn(async () => ({
    from: { value: [{ address: 'no-reply@vinted.com', name: 'Team Vinted' }] },
    subject: 'Some subject',
    html: '<p>body</p>',
    attachments: [],
    headerLines: [],
  })),
}));

import { getSoldEmailSource } from '../soldEmailSourceGuard';
import {
  processVintedBatch,
  reattachVintedBundleConversations,
  vintedRetroEventKey,
  soldEmailEventKey,
  SOLD_EMAIL_WINDOW_DAYS,
  type FacebookSoldEmailPollResult,
} from '../facebookMarketplaceEmailPollService';

function newResult(): FacebookSoldEmailPollResult {
  const c = () => ({ processed: 0, matched: 0, unmatched: 0, ambiguous: 0, ignored: 0 });
  return { processed: 0, matched: 0, unmatched: 0, ignored: 0, errors: [], vinted: c(), mercari: c(), poshmark: c(), grailed: c() };
}

function fakeClient(uids: number[], seenUids: number[] = []) {
  return {
    search: jest.fn(async () => uids),
    fetch: jest.fn((requested: number[]) =>
      (async function* () {
        for (const uid of requested) {
          yield { uid, envelope: { messageId: `<m${uid}@mail.example>` }, flags: new Set(seenUids.includes(uid) ? ['\\Seen'] : []) };
        }
      })(),
    ),
    fetchOne: jest.fn(async () => ({ source: Buffer.from('raw') })),
    messageFlagsAdd: jest.fn(async () => true),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.processedWebhookEvent.findMany.mockResolvedValue([]);
  mockPrisma.processedWebhookEvent.create.mockResolvedValue({});
  mockPrisma.organizer.findUnique.mockResolvedValue({ userId: 'u1' });
});

describe('soldEmailEventKey', () => {
  it('is keyed by branch label and Message-ID, falling back to the UID', () => {
    expect(soldEmailEventKey('Vinted', { uid: 7, messageId: ' <abc@x> ' })).toBe('sold-email:Vinted:<abc@x>');
    expect(soldEmailEventKey('Vinted', { uid: 7, messageId: null })).toBe('sold-email:Vinted:uid:7');
    expect(soldEmailEventKey('Mercari', { uid: 7, messageId: '<abc@x>' })).not.toBe(soldEmailEventKey('Vinted', { uid: 7, messageId: '<abc@x>' }));
  });
});

describe('processVintedBatch -- window search, read or unread', () => {
  it('searches the recent window with no is:unread and no subject filter', async () => {
    const client = fakeClient([]);
    await processVintedBatch(client as any, newResult());
    const query = (client.search.mock.calls[0] as any[])[0].gmraw as string;
    expect(query).toContain('from:no-reply@vinted.com');
    expect(query).toContain(`newer_than:${SOLD_EMAIL_WINDOW_DAYS}d`);
    expect(query).not.toContain('is:unread');
    expect(query).not.toContain('subject:');
    expect(query).toContain('-in:spam');
  });

  it('processes an ALREADY-READ message that has no processed marker, and records the marker', async () => {
    mockProcessVinted.mockResolvedValue({ kind: 'matched', organizerId: 'o1', itemId: 'i1', title: 't', soldVia: 'VINTED', alreadySold: false, result: 'sold' });
    const client = fakeClient([5], [5]);
    const result = newResult();
    await processVintedBatch(client as any, result);
    expect(mockProcessVinted).toHaveBeenCalledTimes(1);
    expect(result.vinted.matched).toBe(1);
    expect(mockPrisma.processedWebhookEvent.create).toHaveBeenCalledWith({ data: { eventId: 'sold-email:Vinted:<m5@mail.example>', status: 'COMPLETED' } });
    expect(client.messageFlagsAdd).not.toHaveBeenCalled(); // already read: nothing to flag
  });

  it('skips messages that already have a processed marker (never double-processed)', async () => {
    mockPrisma.processedWebhookEvent.findMany.mockResolvedValue([{ eventId: 'sold-email:Vinted:<m5@mail.example>' }]);
    const client = fakeClient([5, 6]);
    mockProcessVinted.mockResolvedValue({ kind: 'ignored', reason: 'x' });
    await processVintedBatch(client as any, newResult());
    expect(client.fetchOne).toHaveBeenCalledTimes(1);
    expect((client.fetchOne.mock.calls[0] as any[])[0]).toBe(6);
    expect(mockProcessVinted).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all when every message in the window is already processed', async () => {
    mockPrisma.processedWebhookEvent.findMany.mockResolvedValue([{ eventId: 'sold-email:Vinted:<m5@mail.example>' }]);
    const client = fakeClient([5]);
    await processVintedBatch(client as any, newResult());
    expect(client.fetchOne).not.toHaveBeenCalled();
    expect(mockPrisma.processedWebhookEvent.create).not.toHaveBeenCalled();
  });

  it('a processing failure leaves NO marker so the next poll retries, and the batch continues', async () => {
    mockProcessVinted.mockRejectedValueOnce(new Error('commit failed')).mockResolvedValueOnce({ kind: 'ignored', reason: 'x' });
    const client = fakeClient([5, 6]);
    const result = newResult();
    await processVintedBatch(client as any, result);
    expect(result.errors.join(' ')).toContain('commit failed');
    const created = mockPrisma.processedWebhookEvent.create.mock.calls.map((c: any[]) => c[0].data.eventId);
    expect(created).toEqual(['sold-email:Vinted:<m6@mail.example>']);
    expect(client.messageFlagsAdd).toHaveBeenCalledTimes(1);
  });

  it('fails closed (processes nothing) when the marker table cannot be read', async () => {
    mockPrisma.processedWebhookEvent.findMany.mockRejectedValue(new Error('db down'));
    const client = fakeClient([5]);
    const result = newResult();
    await processVintedBatch(client as any, result);
    expect(client.fetchOne).not.toHaveBeenCalled();
    expect(result.errors.join(' ')).toContain('processed-marker lookup failed');
  });
});

describe('processVintedBatch -- notifications are sent at most once per email', () => {
  const bundle = { kind: 'bundle', organizerId: 'o1', itemCount: 5, amountText: '$5.00', buyer: 'duck212', title: 'Bundle 5 items' };

  it('notifies a bundle email once, claiming the marker first', async () => {
    mockProcessVinted.mockResolvedValue(bundle);
    await processVintedBatch(fakeClient([9], [9]) as any, newResult());
    expect(mockNotifyBundle).toHaveBeenCalledTimes(1);
    expect(mockNotifyBundle).toHaveBeenCalledWith('o1', { itemCount: 5, amountText: '$5.00', buyer: 'duck212', conversationId: null });
  });

  it('does not notify again when the marker already exists (unique violation)', async () => {
    mockProcessVinted.mockResolvedValue(bundle);
    mockPrisma.processedWebhookEvent.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    await processVintedBatch(fakeClient([9]) as any, newResult());
    expect(mockNotifyBundle).not.toHaveBeenCalled();
  });

  it('an UNREAD unmatched email notifies; an already-read unmatched email is only logged', async () => {
    mockProcessVinted.mockResolvedValue({ kind: 'unmatched', organizerId: 'o1', title: 'Some title', reason: 'no_match' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await processVintedBatch(fakeClient([1]) as any, newResult());
      expect(mockCreateNotification).toHaveBeenCalledTimes(1);
      mockCreateNotification.mockClear();
      mockPrisma.processedWebhookEvent.findMany.mockResolvedValue([]);
      await processVintedBatch(fakeClient([2], [2]) as any, newResult());
      expect(mockCreateNotification).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('processVintedBatch -- bundle notice carries the conversation id (2026-10-12)', () => {
  it('passes the decoded conversation id to the notifier', async () => {
    mockProcessVinted.mockResolvedValue({ kind: 'bundle', organizerId: 'o1', itemCount: 5, amountText: '$5.00', buyer: 'duck212', title: 'Bundle 5 items', conversationId: '900100200300' });
    await processVintedBatch(fakeClient([9], [9]) as any, newResult());
    expect(mockNotifyBundle).toHaveBeenCalledWith('o1', expect.objectContaining({ conversationId: '900100200300', itemCount: 5 }));
  });
});

describe('reattachVintedBundleConversations -- retroactive conversation id for already-processed bundles', () => {
  const orphan = { id: 'n9', userId: 'u1', link: '/organizer/vinted-bundle', body: 'Vinted reports a bundle of 2 items sold for $18.90 to booradley90. x', createdAt: new Date() };
  const info = { organizerId: 'o1', itemCount: 2, amountText: '$18.90', buyer: 'booradley90', conversationId: '900100200301' };

  beforeEach(() => {
    mockListOrphans.mockResolvedValue([orphan]);
    mockAttach.mockResolvedValue(true);
    mockInspect.mockResolvedValue(info);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('does nothing (not even an IMAP search) when no open bundle notice lacks a conversation id', async () => {
    mockListOrphans.mockResolvedValue([]);
    const client = fakeClient([5]);
    expect(await reattachVintedBundleConversations(client as any, newResult())).toBe(0);
    expect(client.search).not.toHaveBeenCalled();
  });

  it('re-reads the 7-day window read-only and attaches the id to the matching open notice (no new notice, no marker, no \\Seen)', async () => {
    const client = fakeClient([5], [5]);
    const attached = await reattachVintedBundleConversations(client as any, newResult());
    expect(attached).toBe(1);
    expect(((client.search.mock.calls[0] as any[])[0].gmraw as string)).toContain('newer_than:7d');
    expect(mockAttach).toHaveBeenCalledWith(orphan, { conversationId: '900100200301', itemCount: 2, amountText: '$18.90' });
    expect(mockNotifyBundle).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(client.messageFlagsAdd).not.toHaveBeenCalled();
    const created = mockPrisma.processedWebhookEvent.create.mock.calls.map((c: any[]) => c[0].data.eventId);
    expect(created).toEqual([]); // matched: no backoff marker, and never a sold-email marker
  });

  it('does not attach to a notice of another organizer or a different bundle size/price', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ userId: 'someone_else' });
    expect(await reattachVintedBundleConversations(fakeClient([5]) as any, newResult())).toBe(0);
    mockPrisma.organizer.findUnique.mockResolvedValue({ userId: 'u1' });
    mockInspect.mockResolvedValue({ ...info, itemCount: 5 });
    expect(await reattachVintedBundleConversations(fakeClient([5]) as any, newResult())).toBe(0);
    mockInspect.mockResolvedValue({ ...info, amountText: '$99.00' });
    expect(await reattachVintedBundleConversations(fakeClient([5]) as any, newResult())).toBe(0);
    expect(mockAttach).not.toHaveBeenCalled();
  });

  it('skips emails that are not bundles or carry no conversation id, and backs off an unmatched notice for a few hours', async () => {
    mockInspect.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...info, conversationId: null });
    const client = fakeClient([5, 6]);
    expect(await reattachVintedBundleConversations(client as any, newResult())).toBe(0);
    expect(mockAttach).not.toHaveBeenCalled();
    const created = mockPrisma.processedWebhookEvent.create.mock.calls.map((c: any[]) => c[0].data.eventId);
    expect(created).toEqual([vintedRetroEventKey('n9')]);
  });

  it('skips a notice that is inside its backoff window (no IMAP search)', async () => {
    mockPrisma.processedWebhookEvent.findMany.mockResolvedValue([{ eventId: vintedRetroEventKey('n9') }]);
    const client = fakeClient([5]);
    expect(await reattachVintedBundleConversations(client as any, newResult())).toBe(0);
    expect(client.search).not.toHaveBeenCalled();
  });

  it('never throws: a failing lookup is recorded in result.errors', async () => {
    mockListOrphans.mockRejectedValue(new Error('db down'));
    const result = newResult();
    await expect(reattachVintedBundleConversations(fakeClient([5]) as any, result)).resolves.toBe(0);
    expect(result.errors.join(' ')).toContain('VintedRetro');
  });
});

describe('processVintedBatch -- source e-mail context for the sale guard (2026-10-12)', () => {
  it('runs the processor inside a context carrying the marker key and the e-mail date (envelope date, else INTERNALDATE)', async () => {
    const seen: any[] = [];
    mockProcessVinted.mockImplementation(async () => { seen.push(getSoldEmailSource()); return { kind: 'ignored', reason: 'x' }; });
    const client: any = fakeClient([5, 6]);
    client.fetch = jest.fn(() =>
      (async function* () {
        yield { uid: 5, envelope: { messageId: '<m5@mail.example>', date: new Date('2026-10-11T21:52:00Z') }, flags: new Set<string>() };
        yield { uid: 6, envelope: { messageId: '<m6@mail.example>' }, internalDate: new Date('2026-10-11T22:00:00Z'), flags: new Set<string>() };
      })(),
    );
    await processVintedBatch(client, newResult());
    expect(seen[0]).toEqual({ key: 'sold-email:Vinted:<m5@mail.example>', sentAt: new Date('2026-10-11T21:52:00Z') });
    expect(seen[1]).toEqual({ key: 'sold-email:Vinted:<m6@mail.example>', sentAt: new Date('2026-10-11T22:00:00Z') });
    expect(getSoldEmailSource()).toBeUndefined(); // context does not leak out of the call
  });
});
