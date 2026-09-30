/**
 * transactionalEmailService.send forwards an optional `headers` map to Resend (2026-09-29), so
 * RFC 8058 List-Unsubscribe / List-Unsubscribe-Post headers on notify-me emails really go out.
 * Resend, the suppression lookup, usage tracking and Sentry are mocks: no real email is sent.
 */
const mockResendSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: (...a: any[]) => mockResendSend(...a) } })),
}));
jest.mock('../services/suppressionService', () => ({
  suppressionService: { checkMultipleHard: jest.fn().mockResolvedValue(new Map()) },
}));
jest.mock('../lib/aiCostTracker', () => ({ recordApiUsage: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

import { transactionalEmailService } from '../lib/transactionalEmailService';

const HEADERS = {
  'List-Unsubscribe': '<https://finda.sale/api/shopper/waitlist/unsubscribe?token=abc>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
};

describe('transactionalEmailService.send headers passthrough', () => {
  const OLD_KEY = process.env.RESEND_API_KEY;
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key';
    mockResendSend.mockReset();
    mockResendSend.mockResolvedValue({ data: { id: 'e1' }, error: null });
  });
  afterAll(() => {
    if (OLD_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = OLD_KEY;
  });

  it('passes headers through to resend.emails.send', async () => {
    const r = await transactionalEmailService.emails.send({
      to: 'a@example.com', subject: 'Hi', html: '<p>x</p>', text: 'x', headers: HEADERS,
    });
    expect(r).toEqual({ sent: true });
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(mockResendSend.mock.calls[0][0].headers).toEqual(HEADERS);
    expect(mockResendSend.mock.calls[0][0].to).toEqual(['a@example.com']);
  });

  it('omits the headers key entirely when none are given (existing callers unchanged)', async () => {
    await transactionalEmailService.emails.send({ to: 'a@example.com', subject: 'Hi', html: '<p>x</p>' });
    expect(Object.prototype.hasOwnProperty.call(mockResendSend.mock.calls[0][0], 'headers')).toBe(false);
  });

  it('omits an empty headers object', async () => {
    await transactionalEmailService.emails.send({ to: 'a@example.com', subject: 'Hi', html: '<p>x</p>', headers: {} });
    expect(Object.prototype.hasOwnProperty.call(mockResendSend.mock.calls[0][0], 'headers')).toBe(false);
  });
});
