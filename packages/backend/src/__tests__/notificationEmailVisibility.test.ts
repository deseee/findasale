/**
 * OUTBID / AUCTION_WON email visibility (2026-09-29).
 * A time-critical bidding email that is skipped or fails must produce a Sentry signal
 * (previously console-only), and a successful hand-off must log the Gmail message id.
 */
const mockSend = jest.fn();
const mockFindUser = jest.fn();
const mockIsSuppressed = jest.fn();
const mockCapMsg = jest.fn();
const mockCapExc = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    notification: { create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: (...a: any[]) => mockFindUser(...a) },
  },
}));
jest.mock('../lib/emailService', () => ({
  emailService: { emails: { send: (...a: any[]) => mockSend(...a) } },
}));
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isSuppressed: (...a: any[]) => mockIsSuppressed(...a) },
  isEmailDomainBlocked: (e: string) => e.endsWith('@example.com'),
}));
jest.mock('@sentry/node', () => ({
  captureMessage: (...a: any[]) => mockCapMsg(...a),
  captureException: (...a: any[]) => mockCapExc(...a),
}));

import { createNotification } from '../services/notificationService';

const call = () =>
  createNotification('u1', 'OUTBID', 'You Were Outbid', 'body', '/items/1', 'OPERATIONAL', true, 'subj');

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSuppressed.mockResolvedValue(false);
  mockFindUser.mockResolvedValue({ email: 'real@gmail.com', name: 'Real' });
});

it('logs success and does not alert when Gmail returns a message id', async () => {
  mockSend.mockResolvedValue({ data: { id: 'abc123' } });
  await call();
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ jobName: 'notification_OUTBID' }));
  expect(mockCapMsg).not.toHaveBeenCalled();
  expect(mockCapExc).not.toHaveBeenCalled();
});

it('alerts when the email rail silently skips the send', async () => {
  mockSend.mockResolvedValue(undefined);
  await call();
  expect(mockCapMsg).toHaveBeenCalledWith(
    expect.stringContaining('not sent'),
    expect.objectContaining({ tags: expect.objectContaining({ reason: 'rail_skip' }) }),
  );
});

it('captures a thrown send error (quota / creds) to Sentry and still resolves', async () => {
  mockSend.mockRejectedValue(new Error('Daily Gmail quota exceeded'));
  await expect(call()).resolves.toBeUndefined();
  expect(mockCapExc).toHaveBeenCalled();
});

it('alerts when the recipient is suppressed', async () => {
  mockIsSuppressed.mockResolvedValue(true);
  await call();
  expect(mockSend).not.toHaveBeenCalled();
  expect(mockCapMsg).toHaveBeenCalledWith(
    expect.stringContaining('suppressed'),
    expect.anything(),
  );
});

it('stays quiet for placeholder @example.com test users', async () => {
  mockFindUser.mockResolvedValue({ email: 'user5@example.com', name: 'T' });
  await call();
  expect(mockSend).not.toHaveBeenCalled();
  expect(mockCapMsg).not.toHaveBeenCalled();
});
