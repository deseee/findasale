/**
 * Non-outreach mail rides the aligned Resend rail (2026-10-25).
 *
 * The Gmail rail (lib/emailService.ts, find@outreach.finda.sale) shares sending reputation with
 * cold outreach, so it is reserved for outreachEmailsCron and its helpers. Notifications, hold
 * invoices, auction winners, waitlist / reminder / ending-soon alerts, recovery nudges and admin
 * alerts were moved to lib/transactionalEmailService.ts (Resend, From @finda.sale, DKIM d=finda.sale).
 *
 * 1. Source guard: none of the moved modules may import the Gmail rail again, and every one of
 *    them must send through transactionalEmailService with a finda.sale From.
 * 2. Behaviour: lib/notificationService and the abandoned-signup nudge hand mail to the Resend rail
 *    with a finda.sale From (and RFC 8058 one-click headers for the marketing-style nudge).
 */
import fs from 'fs';
import path from 'path';

const mockTxnSend = jest.fn();
const mockGmailSend = jest.fn();
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: (...a: unknown[]) => mockTxnSend(...a) } },
}));
jest.mock('../lib/emailService', () => ({
  emailService: { emails: { send: (...a: unknown[]) => mockGmailSend(...a) } },
}));
const mockPrisma = {
  notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
  user: { findUnique: jest.fn() },
  organizer: { findUnique: jest.fn() },
  emailAutomationLog: { findFirst: jest.fn(), create: jest.fn().mockResolvedValue({}) },
};
jest.mock('../lib/prisma', () => ({ get prisma() { return mockPrisma; } }));
// abandonedSignupEmailService imports prisma from '../index' (the Express entry); never load the real one.
jest.mock('../index', () => ({ get prisma() { return mockPrisma; } }));
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
  isEmailDomainBlocked: () => false,
}));
jest.mock('../controllers/unsubscribeController', () => ({
  buildUnsubscribeLinks: jest.fn().mockResolvedValue({
    webUrl: 'https://finda.sale/unsubscribe?token=tok',
    listUnsubscribeHeader: '<mailto:unsubscribe@finda.sale?subject=unsubscribe>, <https://finda.sale/api/unsubscribe?token=tok>',
  }),
  generateUnsubscribeToken: jest.fn().mockResolvedValue('tok'),
}));

import { createNotification } from '../lib/notificationService';
import { sendAbandonedSignup1h } from '../services/abandonedSignupEmailService';

const SRC = path.join(__dirname, '..');
const MOVED = [
  'services/notificationService.ts',
  'lib/notificationService.ts',
  'controllers/waitlistController.ts',
  'controllers/saleWaitlistController.ts',
  'controllers/reservationController.ts',
  'controllers/buyingPoolController.ts',
  'jobs/abandonedCheckoutJob.ts',
  'jobs/auctionJob.ts',
  'jobs/saleEndingSoonJob.ts',
  'services/abandonedSignupEmailService.ts',
  'services/emailReminderService.ts',
  'routes/twilioVoice.ts',
  'routes/organizers.ts',
  'middleware/crawlerAnalytics.ts',
];
const GMAIL_IMPORT = /from\s+['"](\.\.?\/)+(lib\/)?emailService['"]|import\(\s*['"](\.\.?\/)+(lib\/)?emailService['"]\s*\)/;

describe('moved non-outreach senders stay off the Gmail outreach rail', () => {
  it.each(MOVED)('%s does not import lib/emailService and sends via transactionalEmailService', (rel) => {
    const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
    expect(src).not.toMatch(GMAIL_IMPORT);
    expect(src).toMatch(/transactionalEmailService\.emails\.send\(/);
    expect(src).not.toMatch(/GMAIL_FROM_EMAIL|SES_FROM_EMAIL|outreach\.finda\.sale/);
  });

  it.each(MOVED)('%s gives every Resend send an explicit finda.sale From', (rel) => {
    const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
    // Every literal fallback sender in the file is on the verified finda.sale root domain.
    const literals = src.match(/<[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+>/g) ?? [];
    const senders = literals.filter((l) => !/unsubscribe@/.test(l));
    expect(senders.length).toBeGreaterThan(0);
    for (const l of senders) expect(l).toMatch(/@finda\.sale>$/);
    // Every send call passes a from.
    const calls = src.split('transactionalEmailService.emails.send(').slice(1);
    for (const c of calls) expect(c.slice(0, 400)).toMatch(/\bfrom\s*:/);
  });
});

describe('behaviour on the Resend rail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.ACTIVATION_NUDGE_FROM_EMAIL;
    mockTxnSend.mockResolvedValue({ sent: true });
  });

  it('lib/notificationService emails through Resend with a finda.sale From', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'shopper@gmail.com', name: 'Sam' });
    await createNotification({ userId: 'u1', type: 'ITEM_SOLD', title: 'Sold', body: 'Your item sold', link: '/x', sendEmail: true });
    expect(mockGmailSend).not.toHaveBeenCalled();
    expect(mockTxnSend).toHaveBeenCalledTimes(1);
    const msg = mockTxnSend.mock.calls[0][0];
    expect(msg.to).toBe('shopper@gmail.com');
    expect(msg.from).toMatch(/@finda\.sale>$/);
    expect(msg.jobName).toBe('notification_ITEM_SOLD');
  });

  it('a skipped Resend send never throws out of createNotification', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'shopper@gmail.com', name: 'Sam' });
    mockTxnSend.mockResolvedValue({ sent: false, reason: 'suppressed' });
    await expect(
      createNotification({ userId: 'u1', type: 'ITEM_SOLD', title: 'Sold', body: 'b', sendEmail: true }),
    ).resolves.toEqual({ id: 'n1' });
  });

  it('the abandoned-signup nudge goes out on Resend from support@finda.sale with one-click unsubscribe headers', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'o1', user: { id: 'u1', email: 'org@gmail.com', name: 'Pat Doe' } });
    mockPrisma.emailAutomationLog.findFirst.mockResolvedValue(null);
    await expect(sendAbandonedSignup1h('o1')).resolves.toBe(true);
    expect(mockGmailSend).not.toHaveBeenCalled();
    const msg = mockTxnSend.mock.calls[0][0];
    expect(msg.from).toBe('The FindA.Sale Team <support@finda.sale>');
    expect(msg.headers['List-Unsubscribe']).toMatch(/\/api\/unsubscribe\?token=tok/);
    expect(msg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(mockPrisma.emailAutomationLog.create).toHaveBeenCalledTimes(1);
  });

  it('the abandoned-signup nudge reports false and stays retryable when Resend is not configured', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'o1', user: { id: 'u1', email: 'org@gmail.com', name: 'Pat' } });
    mockPrisma.emailAutomationLog.findFirst.mockResolvedValue(null);
    mockTxnSend.mockResolvedValue({ sent: false, reason: 'not_configured' });
    await expect(sendAbandonedSignup1h('o1')).resolves.toBe(false);
    expect(mockPrisma.emailAutomationLog.create).not.toHaveBeenCalled();
  });
});
