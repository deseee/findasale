/**
 * Square POS adapter: a thrown SquareError now returns the specific reason and Square's own code instead of the
 * generic "Your card was declined" (2026-10-11; a live INVALID_FEES refusal on a $1.00 sale was being shown to the
 * cashier as a declined card). Everything is mocked: no Square call, no database.
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

import { SquareError } from 'square';
import { createAndCapturePayment, createAndCaptureSandboxPayment } from '../services/squarePosPaymentAdapter';
import { describeSquareError, sanitizeSquareDetail } from '../services/squareErrorReasons';

const squareErr = (code: string, detail = 'raw square detail') => {
  const e = new (SquareError as any)('square failed');
  e.errors = [{ category: 'PAYMENT_METHOD_ERROR', code, detail }];
  return e;
};

const base = {
  organizer: { squareLocationId: 'loc_1' } as any,
  accessToken: 'tok',
  sourceId: 'cnon:aaa',
  amountCents: 100,
  appFeeCents: 75,
  posRequestId: 'req_1',
};

let warnSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

describe('createAndCapturePayment Square errors', () => {
  it('INVALID_FEES comes back as the fee message with its code, never the decline text, and is still logged', async () => {
    mockPaymentsCreate.mockRejectedValue(squareErr('INVALID_FEES', 'app_fee_money must be less than or equal to 60% of the payment amount.'));
    const res = await createAndCapturePayment(base);
    expect(res).toEqual({
      ok: false,
      status: 400,
      message: 'This sale is too small to take by card because of the minimum platform fee. Take it in cash or raise the amount.',
      squareCode: 'INVALID_FEES',
    });
    expect((res as any).message).not.toMatch(/declin/i);
    expect(String(warnSpy.mock.calls[0][0])).toContain('INVALID_FEES -- app_fee_money must be less than or equal to 60%');
  });

  it('a bank decline carries GENERIC_DECLINE and the specific text', async () => {
    mockPaymentsCreate.mockRejectedValue(squareErr('GENERIC_DECLINE'));
    const res: any = await createAndCapturePayment(base);
    expect(res).toMatchObject({ ok: false, status: 400, squareCode: 'GENERIC_DECLINE', message: 'The card was declined by the bank. Ask for a different card or contact the bank.' });
  });

  it('a temporary Square error is a 502 so the client can retry', async () => {
    mockPaymentsCreate.mockRejectedValue(squareErr('TEMPORARY_ERROR'));
    const res: any = await createAndCapturePayment(base);
    expect(res).toMatchObject({ ok: false, status: 502, squareCode: 'TEMPORARY_ERROR' });
  });

  it('an unmapped code with card-like detail falls back to the generic text plus the code', async () => {
    mockPaymentsCreate.mockRejectedValue(squareErr('BRAND_NEW_CODE', 'card 4111111111111111 bad'));
    const res: any = await createAndCapturePayment(base);
    expect(res.message).toBe('The payment could not be completed (BRAND_NEW_CODE).');
    expect(res.squareCode).toBe('BRAND_NEW_CODE');
  });

  it('a non-Square exception is still a plain 500', async () => {
    mockPaymentsCreate.mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res: any = await createAndCapturePayment(base);
    expect(res).toEqual({ ok: false, status: 500, message: 'Failed to create Square payment' });
  });
});

describe('createAndCaptureSandboxPayment Square errors', () => {
  it('maps the sandbox decline nonce path the same way', async () => {
    mockPaymentsCreate.mockRejectedValue(squareErr('CVV_FAILURE'));
    const res: any = await createAndCaptureSandboxPayment({ amountCents: 100, posRequestId: 'req_1', sourceId: 'cnon:card-nonce-declined' });
    expect(res).toMatchObject({ ok: false, status: 400, squareCode: 'CVV_FAILURE', message: 'The security code (CVV) did not match.' });
  });
});

describe('squareErrorReasons', () => {
  it('describeSquareError handles a missing error entry', () => {
    expect(describeSquareError(undefined)).toMatchObject({ squareCode: 'SQUARE_ERROR', mapped: false, message: 'The payment could not be completed (SQUARE_ERROR).' });
  });
  it('rejects odd code strings rather than echoing them', () => {
    expect(describeSquareError({ code: 'bad code <script>' }).squareCode).toBe('SQUARE_ERROR');
  });
  it('sanitizeSquareDetail keeps short clean text only', () => {
    expect(sanitizeSquareDetail('Location not found.')).toBe('Location not found.');
    expect(sanitizeSquareDetail('')).toBeNull();
    expect(sanitizeSquareDetail(42)).toBeNull();
    expect(sanitizeSquareDetail('see https://x.example/y')).toBeNull();
  });
});
