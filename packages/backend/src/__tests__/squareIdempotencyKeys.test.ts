/**
 * Per-attempt Square idempotency keys (money review P1-11, 2026-09-29).
 *
 * The checkout and POS callers used to seed the Square CreatePayment idempotency key from the
 * item/cart/user or the POS request id ONLY. After a declined first attempt, retrying with a DIFFERENT
 * card sent the same key with a different source_id and Square answered IDEMPOTENCY_KEY_REUSED, so the
 * buyer could never pay. A hash of the card token (sourceId) is now part of the key:
 *   - the same tokenization retried (network timeout) keeps the same key, so Square still dedupes;
 *   - a new card is a new key, so it is a fresh attempt.
 *
 * Everything is mocked: no Square call, no database. Run with
 *   pnpm --filter backend test -- squareIdempotencyKeys
 */

const mockPaymentsCreate = jest.fn();
const mockPaymentsGet = jest.fn();
const mockPaymentsComplete = jest.fn();
const fakeClient = { payments: { create: mockPaymentsCreate, get: mockPaymentsGet, complete: mockPaymentsComplete } };

jest.mock('../utils/square', () => ({
  getSquareClientForMerchant: jest.fn(() => fakeClient),
  getSquareSandboxClient: jest.fn(() => fakeClient),
  getSquareSandboxLocationId: jest.fn(() => 'sandbox_loc'),
}));
jest.mock('square', () => {
  class SquareError extends Error {
    errors?: any[];
  }
  return { SquareError };
});
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../utils/tokenCrypto', () => ({ decryptToken: jest.fn(), encryptToken: jest.fn() }));
jest.mock('../services/squareConnectService', () => ({ refreshSquareAccessToken: jest.fn() }));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));

import {
  buildSquareAttemptIdempotencyKey,
  buildSquareIdempotencyKey,
  createSquareCharge,
} from '../services/squarePaymentService';
import { createAndCapturePayment, createAndCaptureSandboxPayment } from '../services/squarePosPaymentAdapter';

beforeEach(() => {
  jest.clearAllMocks();
  mockPaymentsCreate.mockResolvedValue({ payment: { id: 'sq_pay_new', status: 'COMPLETED' } });
});

describe('buildSquareAttemptIdempotencyKey', () => {
  it('is stable for the same seed and the same card token (a network retry still dedupes)', () => {
    expect(buildSquareAttemptIdempotencyKey('seed', 'cnon:aaa')).toBe(buildSquareAttemptIdempotencyKey('seed', 'cnon:aaa'));
  });
  it('differs for a different card token (a new card is a new attempt)', () => {
    expect(buildSquareAttemptIdempotencyKey('seed', 'cnon:aaa')).not.toBe(buildSquareAttemptIdempotencyKey('seed', 'cnon:bbb'));
  });
  it('differs for a different seed with the same card token', () => {
    expect(buildSquareAttemptIdempotencyKey('seed1', 'cnon:aaa')).not.toBe(buildSquareAttemptIdempotencyKey('seed2', 'cnon:aaa'));
  });
  it('stays within Square\'s 45 character key limit whatever the token length', () => {
    const key = buildSquareAttemptIdempotencyKey('x'.repeat(200), 'cnon:' + 'y'.repeat(500));
    expect(key.length).toBeLessThanOrEqual(45);
    expect(key.length).toBeGreaterThan(0);
  });
  it('falls back to the base key when there is no card token', () => {
    expect(buildSquareAttemptIdempotencyKey('seed', undefined)).toBe('seed');
    expect(buildSquareAttemptIdempotencyKey('seed', '')).toBe('seed');
  });
});

describe('createSquareCharge (checkout single item and cart)', () => {
  const params = (sourceId: string) => ({
    organizerAccessToken: 'tok',
    idempotencyKey: buildSquareIdempotencyKey(['cart', 'user_1', 'item_1']),
    sourceId,
    amountCents: 5000,
    appFeeCents: 500,
  });

  it('sends the per-attempt key, not the raw seed', async () => {
    await createSquareCharge(params('cnon:aaa'));
    const sent = mockPaymentsCreate.mock.calls[0][0].idempotencyKey;
    expect(sent).toBe(buildSquareAttemptIdempotencyKey(params('cnon:aaa').idempotencyKey, 'cnon:aaa'));
    expect(sent).not.toBe(params('cnon:aaa').idempotencyKey);
  });

  it('declined first card then a second card: the two attempts use different keys; the same card twice uses the same key', async () => {
    await createSquareCharge(params('cnon:first'));
    await createSquareCharge(params('cnon:second'));
    await createSquareCharge(params('cnon:second'));
    const keys = mockPaymentsCreate.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
  });
});

describe('createAndCapturePayment (POS payment request)', () => {
  const base = (sourceId: string, extra: any = {}) => ({
    organizer: { squareLocationId: 'loc_1' } as any,
    accessToken: 'tok',
    sourceId,
    amountCents: 6000,
    appFeeCents: 600,
    posRequestId: 'req_1',
    ...extra,
  });
  beforeEach(() => {
    mockPaymentsCreate.mockResolvedValue({ payment: { id: 'sq_pay_new', status: 'APPROVED' } });
    mockPaymentsComplete.mockResolvedValue({ payment: { status: 'COMPLETED' } });
  });

  it('a new card after a decline is a new attempt (different key); the same card retried keeps its key', async () => {
    await createAndCapturePayment(base('cnon:first'));
    await createAndCapturePayment(base('cnon:second'));
    await createAndCapturePayment(base('cnon:second'));
    const keys = mockPaymentsCreate.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
    expect(keys.every((k: string) => k.length <= 45)).toBe(true);
  });

  it('resumes a persisted, still usable payment without creating another charge', async () => {
    mockPaymentsGet.mockResolvedValue({ payment: { id: 'sq_pay_old', status: 'APPROVED' } });
    const res = await createAndCapturePayment(base('cnon:aaa', { existingSquarePaymentId: 'sq_pay_old' }));
    expect(res).toEqual({ ok: true, paymentId: 'sq_pay_old', captured: true });
    expect(mockPaymentsCreate).not.toHaveBeenCalled();
  });

  it('a persisted payment Square already CANCELED or FAILED does not lock the shopper out: a new card starts a fresh attempt', async () => {
    for (const dead of ['CANCELED', 'FAILED']) {
      mockPaymentsCreate.mockClear();
      mockPaymentsGet.mockResolvedValue({ payment: { id: 'sq_pay_dead', status: dead } });
      const res = await createAndCapturePayment(base('cnon:newcard', { existingSquarePaymentId: 'sq_pay_dead' }));
      expect(mockPaymentsCreate).toHaveBeenCalledTimes(1);
      expect(res).toEqual({ ok: true, paymentId: 'sq_pay_new', captured: true });
    }
  });

  it('a persisted dead payment with no card token still answers with a decline (nothing to charge)', async () => {
    mockPaymentsGet.mockResolvedValue({ payment: { id: 'sq_pay_dead', status: 'CANCELED' } });
    const res = await createAndCapturePayment(base('', { existingSquarePaymentId: 'sq_pay_dead' }));
    expect(res.ok).toBe(false);
    expect(mockPaymentsCreate).not.toHaveBeenCalled();
  });
});

describe('createAndCaptureSandboxPayment (QA sandbox)', () => {
  it('uses the per-attempt key too, so a decline nonce followed by an ok nonce is not IDEMPOTENCY_KEY_REUSED', async () => {
    mockPaymentsCreate.mockResolvedValue({ payment: { id: 'sb_1', status: 'COMPLETED' } });
    await createAndCaptureSandboxPayment({ amountCents: 100, posRequestId: 'req_1', sourceId: 'cnon:card-nonce-declined' });
    await createAndCaptureSandboxPayment({ amountCents: 100, posRequestId: 'req_1', sourceId: 'cnon:card-nonce-ok' });
    const keys = mockPaymentsCreate.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
  });
});
