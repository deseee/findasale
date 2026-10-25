/**
 * Resend rail alignment (2026-10-25): every From that leaves the transactional rail must be on the
 * Resend-verified root domain finda.sale (DKIM d=finda.sale, SPF via send.finda.sale), so DMARC
 * (p=quarantine) aligns and Yahoo/AOL/iCloud/Outlook accept it. Also covers the replyTo pass-through
 * added for the contact form.
 */
const mockSend = jest.fn(async (..._a: any[]) => ({ error: null }));
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })) }));
jest.mock('../services/suppressionService', () => ({
  suppressionService: { checkMultipleHard: jest.fn(async () => new Map()) },
}));
jest.mock('../lib/aiCostTracker', () => ({ recordApiUsage: jest.fn(async () => {}) }));
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

import { transactionalEmailService } from '../lib/transactionalEmailService';

beforeEach(() => {
  process.env.RESEND_API_KEY = 're_test';
  mockSend.mockClear();
});

describe('transactionalEmailService From alignment', () => {
  it('keeps a finda.sale From (support@) untouched', async () => {
    await transactionalEmailService.emails.send({ from: 'The FindA.Sale Team <support@finda.sale>', to: 'a@yahoo.com', subject: 's', html: '<p>x</p>' });
    expect((mockSend.mock.calls[0][0] as any).from).toBe('The FindA.Sale Team <support@finda.sale>');
  });

  it.each(['find@outreach.finda.sale', 'noreply@send.finda.sale', 'someone@gmail.com'])(
    'coerces unaligned From %s to the verified default',
    async (from) => {
      await transactionalEmailService.emails.send({ from, to: 'a@aol.com', subject: 's', html: '<p>x</p>' });
      expect((mockSend.mock.calls[0][0] as any).from).toMatch(/@finda\.sale>?$/);
      expect((mockSend.mock.calls[0][0] as any).from).not.toContain(from);
    },
  );

  it('passes replyTo through', async () => {
    await transactionalEmailService.emails.send({ to: 'support@finda.sale', subject: 's', html: '<p>x</p>', replyTo: 'visitor@icloud.com' });
    expect((mockSend.mock.calls[0][0] as any).replyTo).toBe('visitor@icloud.com');
  });
});
