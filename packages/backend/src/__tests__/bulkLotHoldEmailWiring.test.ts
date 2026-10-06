/**
 * bulkLotHoldEmailWiring (ADR-136 Addendum D, roadmap #659): the live wiring uses the Resend transactional rail and the existing
 * recipient gate, and nothing else. The rail, the gate, Prisma and Sentry are mocks here: no email is ever sent.
 *
 *   - a placed hold goes through transactionalEmailService.emails.send (no `from` is passed, so the rail's verified default is used and the
 *     outreach address is never involved), after suppressionService.isHardSuppressed said the address is fine
 *   - a suppressed or domain-blocked address is not sent to
 *   - no RESEND_API_KEY means no send (and no claim in the reminder pass)
 *   - the flag off sends nothing and looks nothing up
 *   - a rail that throws is reported to Sentry and goes no further
 *   - the reminder deps claim nothing when the gate refuses
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    item: { findUnique: jest.fn() },
    sale: { findUnique: jest.fn() },
    organizer: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn() } } }));
jest.mock('../services/suppressionService', () => ({ suppressionService: { isHardSuppressed: jest.fn() } }));

import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService } from '../services/suppressionService';
import { liveReminderDeps, onBulkHoldEnded, onBulkHoldPlaced } from '../services/bulkLot/bulkLotHoldEmailWiring';

const p: any = prisma;
const send = transactionalEmailService.emails.send as unknown as jest.Mock;
const blocked = suppressionService.isHardSuppressed as unknown as jest.Mock;

const HOLD = {
  id: 'h1', itemId: 'lot1', saleId: 'sale1', organizerId: 'org1', shopperUserId: null, customerName: 'Sam', customerEmail: 'sam@example.com',
  quantity: 1500, lineCents: 1200, expiresAt: new Date(Date.UTC(2026, 9, 7, 12, 0, 0)), createdAt: new Date(Date.UTC(2026, 9, 6, 12, 0, 0)),
};
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const saved = { flag: process.env.CARD_BULK_LOTS_ENABLED, key: process.env.RESEND_API_KEY };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CARD_BULK_LOTS_ENABLED = 'true';
  process.env.RESEND_API_KEY = 're_test_key_never_used';
  send.mockResolvedValue({ sent: true });
  blocked.mockResolvedValue(false);
  p.item.findUnique.mockResolvedValue({ title: 'Commons' });
  p.sale.findUnique.mockResolvedValue({ id: 'sale1', title: 'Card Show', address: '1 Main St', city: 'Paw Paw', state: 'MI' });
  p.organizer.findUnique.mockResolvedValue({ businessName: 'Cards & Co', timezone: null });
  p.user.findUnique.mockResolvedValue(null);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  if (saved.flag === undefined) delete process.env.CARD_BULK_LOTS_ENABLED; else process.env.CARD_BULK_LOTS_ENABLED = saved.flag;
  if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key;
});

describe('live hold email wiring', () => {
  it('sends the confirmation on the transactional rail after the recipient gate, with no custom from address', async () => {
    onBulkHoldPlaced(HOLD);
    await flush();
    expect(blocked).toHaveBeenCalledWith('sam@example.com');
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe('sam@example.com');
    expect(msg.subject).toBe('Your hold at Cards & Co: 1,500 cards');
    expect(Object.keys(msg).sort()).toEqual(['html', 'subject', 'text', 'to']);
    expect(p.organizer.findUnique).toHaveBeenCalledWith({ where: { id: 'org1' }, select: { businessName: true, timezone: true } });
  });

  it('sends the ended notice for an expired and for a released hold', async () => {
    onBulkHoldEnded(HOLD, 'EXPIRED');
    onBulkHoldEnded(HOLD, 'RELEASED');
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].html).toContain('has ended');
    expect(send.mock.calls[1][0].html).toContain('let go of your hold');
  });

  it('a shopper hold uses the shopper account email', async () => {
    p.user.findUnique.mockResolvedValue({ email: 'Pat@Example.com', name: 'Pat' });
    onBulkHoldPlaced({ ...HOLD, shopperUserId: 'u1', customerEmail: null });
    await flush();
    expect(send.mock.calls[0][0].to).toBe('pat@example.com');
  });

  it('a suppressed or domain-blocked address is not sent to', async () => {
    blocked.mockResolvedValue(true);
    onBulkHoldPlaced({ ...HOLD, customerEmail: 'someone@finda.sale' });
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('without RESEND_API_KEY nothing is sent', async () => {
    delete process.env.RESEND_API_KEY;
    onBulkHoldPlaced(HOLD);
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('with the flag off nothing is looked up and nothing is sent', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'false';
    onBulkHoldPlaced(HOLD);
    onBulkHoldEnded(HOLD, 'EXPIRED');
    await flush();
    expect(send).not.toHaveBeenCalled();
    expect(blocked).not.toHaveBeenCalled();
    expect(p.item.findUnique).not.toHaveBeenCalled();
    expect(await liveReminderDeps.canEmail(HOLD)).toBe(false);
  });

  it('a rail that throws is reported to Sentry and does not throw out of the hook', async () => {
    send.mockRejectedValue(new Error('resend down'));
    expect(() => onBulkHoldPlaced(HOLD)).not.toThrow();
    await flush();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('the reminder deps: the gate says yes for a good hold and no for a blocked one, and the sender sends a reminder', async () => {
    expect(await liveReminderDeps.canEmail(HOLD)).toBe(true);
    await liveReminderDeps.sendReminder(HOLD);
    expect(send.mock.calls[0][0].subject).toBe('Your hold at Cards & Co ends soon');
    blocked.mockResolvedValue(true);
    expect(await liveReminderDeps.canEmail(HOLD)).toBe(false);
  });
});
