/**
 * emailService.emails.send opt-in retryOnRateLimit (Sentry FINDASALE-NODEJS-8H, 2026-10-11):
 * Gmail's per-user per-minute 429 must be retried with backoff for paced bulk sends (weekly digest)
 * instead of dropping the recipient. Gmail, quota DB, suppression and Sentry are mocks.
 */
const mockGmailSend = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })) },
    gmail: jest.fn().mockImplementation(() => ({ users: { messages: { send: (...a: any[]) => mockGmailSend(...a) } } })),
  },
}));
jest.mock('resend', () => ({ Resend: jest.fn() }));
jest.mock('../services/suppressionService', () => ({
  isEmailDomainBlocked: jest.fn().mockReturnValue(false),
  suppressionService: { checkMultipleHard: jest.fn().mockResolvedValue(new Map()) },
}));
const mockUpsert = jest.fn().mockResolvedValue({ count: 1, alertSentAt: null });
jest.mock('../lib/prisma', () => ({ prisma: { emailQuotaLog: { upsert: (...a: any[]) => mockUpsert(...a), update: jest.fn() } } }));
const mockCapture = jest.fn();
jest.mock('@sentry/node', () => ({ captureException: (...a: any[]) => mockCapture(...a) }));

import { emailService, isGmailRateLimitError, rateLimitBackoff } from '../lib/emailService';

const rateErr = () => Object.assign(
  new Error("Quota exceeded for quota metric 'Total Query Cost' and limit 'Total Query Cost per minute per user'"),
  { code: 429 },
);
const msg = { from: 'find@outreach.finda.sale', to: 'a@example.com', subject: 's', html: '<p>x</p>', jobName: 'test' };

describe('emailService retryOnRateLimit', () => {
  const origDelays = rateLimitBackoff.delaysMs;
  const origSleep = rateLimitBackoff.sleep;
  beforeEach(() => {
    process.env.GMAIL_CLIENT_ID = 'id'; process.env.GMAIL_CLIENT_SECRET = 'sec'; process.env.GMAIL_REFRESH_TOKEN = 'tok';
    mockGmailSend.mockReset(); mockCapture.mockClear(); mockUpsert.mockClear();
    rateLimitBackoff.delaysMs = [1, 1, 1];
    rateLimitBackoff.sleep = jest.fn().mockResolvedValue(undefined);
  });
  afterAll(() => { rateLimitBackoff.delaysMs = origDelays; rateLimitBackoff.sleep = origSleep; });

  it('classifies per-minute 429 as rate limit but not the daily cap', () => {
    expect(isGmailRateLimitError(rateErr())).toBe(true);
    expect(isGmailRateLimitError(new Error('Daily user sending limit exceeded'))).toBe(false);
    expect(isGmailRateLimitError(new Error('boom'))).toBe(false);
  });

  it('retries a 429 then succeeds, with one quota increment and no Sentry event', async () => {
    mockGmailSend.mockRejectedValueOnce(rateErr()).mockRejectedValueOnce(rateErr()).mockResolvedValueOnce({ data: { id: 'm1' } });
    const r: any = await emailService.emails.send({ ...msg, retryOnRateLimit: true });
    expect(r.data.id).toBe('m1');
    expect(mockGmailSend).toHaveBeenCalledTimes(3);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('throws and reports to Sentry once after retries are exhausted', async () => {
    mockGmailSend.mockRejectedValue(rateErr());
    await expect(emailService.emails.send({ ...msg, retryOnRateLimit: true })).rejects.toThrow(/Quota exceeded/);
    expect(mockGmailSend).toHaveBeenCalledTimes(4);
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('does not retry without the opt-in flag (existing callers unchanged)', async () => {
    mockGmailSend.mockRejectedValue(rateErr());
    await expect(emailService.emails.send(msg)).rejects.toThrow();
    expect(mockGmailSend).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-rate-limit errors', async () => {
    mockGmailSend.mockRejectedValue(new Error('invalid_grant'));
    await expect(emailService.emails.send({ ...msg, retryOnRateLimit: true })).rejects.toThrow('invalid_grant');
    expect(mockGmailSend).toHaveBeenCalledTimes(1);
  });
});
