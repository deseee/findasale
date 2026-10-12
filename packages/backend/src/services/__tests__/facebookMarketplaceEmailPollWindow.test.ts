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
jest.mock('../vintedBundleSaleService', () => ({ notifyOrganizerVintedBundleSale: (...a: any[]) => mockNotifyBundle(...a) }));
const mockProcessVinted = jest.fn();
jest.mock('../vintedSoldEmailDetection', () => ({ processVintedSoldEmail: (...a: any[]) => mockProcessVinted(...a) }));
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

import { processVintedBatch, soldEmailEventKey, SOLD_EMAIL_WINDOW_DAYS, type FacebookSoldEmailPollResult } from '../facebookMarketplaceEmailPollService';

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
    expect(mockNotifyBundle).toHaveBeenCalledWith('o1', { itemCount: 5, amountText: '$5.00', buyer: 'duck212' });
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
