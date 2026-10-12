/**
 * POS payment-adapter failures no longer echo adapter text to the client (2026-09-30): the response carries a fixed
 * generic message plus a stable code, and the detail is logged server-side. Also checks the controller is wired to
 * the helper (no `error: result.message` left on the confirm and manual-card paths).
 */
import fs from 'fs';
import path from 'path';
import { posPaymentFailureBody, POS_PAYMENT_FAILURE_MESSAGES } from '../services/posPaymentFailure';

describe('posPaymentFailureBody', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => errSpy.mockRestore());

  it('a decline keeps status 400 and the CARD_DECLINED code', () => {
    const out = posPaymentFailureBody({ status: 400, message: 'Your card was declined. Please check your card details or try a different card.' }, 'ctx');
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ message: POS_PAYMENT_FAILURE_MESSAGES.CARD_DECLINED, code: 'CARD_DECLINED' });
  });

  it('processor trouble (502) becomes PAYMENT_PROVIDER_UNAVAILABLE', () => {
    const out = posPaymentFailureBody({ status: 502, message: 'Could not verify payment with Square' }, 'ctx');
    expect(out.status).toBe(502);
    expect(out.body.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
  });

  it('a 500 from the adapter becomes PAYMENT_CREATE_FAILED', () => {
    const out = posPaymentFailureBody({ status: 500, message: 'Failed to create Square payment' }, 'ctx');
    expect(out.status).toBe(500);
    expect(out.body.code).toBe('PAYMENT_CREATE_FAILED');
  });

  it('a verification failure never leaks processor detail such as the intent status', () => {
    const out = posPaymentFailureBody({ status: 400, message: 'Payment intent status is requires_payment_method, expected succeeded' }, 'confirm r1 (Stripe)', { includeErrorField: true });
    expect(out.body.code).toBe('PAYMENT_VERIFICATION_FAILED');
    expect(JSON.stringify(out.body)).not.toMatch(/requires_payment_method|intent/i);
    expect(out.body.error).toBe(out.body.message);
  });

  it('logs the adapter detail server-side and keeps it out of the body', () => {
    const out = posPaymentFailureBody({ status: 502, message: 'secret upstream detail' }, 'manual card entry (Square)');
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0][0])).toContain('secret upstream detail');
    expect(String(errSpy.mock.calls[0][0])).toContain('manual card entry (Square)');
    expect(JSON.stringify(out.body)).not.toContain('secret upstream detail');
  });

  it('omits the legacy error field unless asked', () => {
    expect(posPaymentFailureBody({ status: 500, message: 'x' }, 'c').body).not.toHaveProperty('error');
  });
});

describe('posPaymentFailureBody with a Square error code (2026-10-11)', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => errSpy.mockRestore());

  const run = (squareCode: string, message = 'adapter text', status = 400) =>
    posPaymentFailureBody({ status, message, squareCode }, 'ctx', { includeErrorField: true });

  const declines: Array<[string, string]> = [
    ['GENERIC_DECLINE', 'The card was declined by the bank. Ask for a different card or contact the bank.'],
    ['INSUFFICIENT_FUNDS', 'Insufficient funds.'],
    ['CVV_FAILURE', 'The security code (CVV) did not match.'],
    ['VERIFY_CVV_FAILURE', 'The security code (CVV) did not match.'],
    ['ADDRESS_VERIFICATION_FAILURE', 'The billing ZIP/address did not match.'],
    ['VERIFY_AVS_FAILURE', 'The billing ZIP/address did not match.'],
    ['INVALID_EXPIRATION', 'The card is expired or the expiration date is wrong.'],
    ['EXPIRATION_FAILURE', 'The card is expired or the expiration date is wrong.'],
    ['CARD_EXPIRED', 'The card is expired or the expiration date is wrong.'],
    ['INVALID_CARD', 'The card number is not valid or the card type is not accepted.'],
    ['PAN_FAILURE', 'The card number is not valid or the card type is not accepted.'],
    ['CARD_NOT_SUPPORTED', 'The card number is not valid or the card type is not accepted.'],
    ['INVALID_ACCOUNT', 'The card number is not valid or the card type is not accepted.'],
    ['TRANSACTION_LIMIT', "Over the card's transaction limit."],
  ];
  it.each(declines)('%s is a 400 CARD_DECLINED with its specific message', (squareCode, text) => {
    const out = run(squareCode);
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ message: text, error: text, code: 'CARD_DECLINED', squareCode, reason: text });
  });

  it('CARD_DECLINED_VERIFICATION_REQUIRED and CARD_DECLINED_CALL_ISSUER are declines with their own text', () => {
    const v = run('CARD_DECLINED_VERIFICATION_REQUIRED');
    const c = run('CARD_DECLINED_CALL_ISSUER');
    expect(v.body.code).toBe('CARD_DECLINED');
    expect(c.body.code).toBe('CARD_DECLINED');
    expect(v.body.message).toMatch(/extra verification/);
    expect(c.body.message).toMatch(/call them/);
    expect(v.body.message).not.toBe(c.body.message);
  });

  it('INVALID_FEES is never labelled a decline and keeps HTTP 400', () => {
    const out = run('INVALID_FEES');
    expect(out.status).toBe(400);
    expect(out.body.code).toBe('CARD_AMOUNT_TOO_SMALL');
    expect(out.body.squareCode).toBe('INVALID_FEES');
    expect(out.body.message).toBe('This sale is too small to take by card because of the minimum platform fee. Take it in cash or raise the amount.');
    expect(out.body.message).not.toMatch(/declin/i);
    expect(out.body.code).not.toBe('CARD_DECLINED');
  });

  it('TEMPORARY_ERROR and GATEWAY_TIMEOUT are retryable provider problems (502)', () => {
    for (const code of ['TEMPORARY_ERROR', 'GATEWAY_TIMEOUT']) {
      const out = run(code, 'x', 502);
      expect(out.status).toBe(502);
      expect(out.body.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
      expect(out.body.message).toMatch(/try the card again/i);
    }
  });

  it('CARD_PROCESSING_NOT_ENABLED is not a decline', () => {
    const out = run('CARD_PROCESSING_NOT_ENABLED');
    expect(out.status).toBe(400);
    expect(out.body.code).toBe('PAYMENT_CREATE_FAILED');
    expect(out.body.message).not.toMatch(/declin/i);
  });

  it('an unmapped code uses a short, clean Square detail', () => {
    const out = run('SOME_NEW_CODE', 'The location is closed for payments.');
    expect(out.body.message).toBe('The location is closed for payments.');
    expect(out.body.squareCode).toBe('SOME_NEW_CODE');
    expect(out.body.code).toBe('PAYMENT_CREATE_FAILED');
    expect(out.body.code).not.toBe('CARD_DECLINED');
  });

  it('an unmapped code never exposes long detail or anything that looks like card data', () => {
    for (const detail of ['x'.repeat(200), 'Card 4111111111111111 refused', 'cardholder a@b.com refused']) {
      const out = run('SOME_NEW_CODE', detail);
      expect(out.body.message).toBe('The payment could not be completed (SOME_NEW_CODE).');
      expect(JSON.stringify(out.body)).not.toContain('4111');
      expect(JSON.stringify(out.body)).not.toContain('a@b.com');
    }
  });

  it('a mapped code ignores whatever text the adapter passed', () => {
    const out = run('INSUFFICIENT_FUNDS', 'secret upstream detail');
    expect(JSON.stringify(out.body)).not.toContain('secret upstream detail');
  });

  it('omits the legacy error field unless asked, and still logs the detail server-side', () => {
    const out = posPaymentFailureBody({ status: 400, message: 'adapter text', squareCode: 'CVV_FAILURE' }, 'ctx');
    expect(out.body).not.toHaveProperty('error');
    expect(String(errSpy.mock.calls[0][0])).toContain('CVV_FAILURE');
  });

  it('a result without squareCode behaves exactly as before', () => {
    const out = posPaymentFailureBody({ status: 400, message: 'Your card was declined. Please check your card details or try a different card.' }, 'ctx');
    expect(out.body).toEqual({ message: POS_PAYMENT_FAILURE_MESSAGES.CARD_DECLINED, code: 'CARD_DECLINED' });
    expect(out.body).not.toHaveProperty('squareCode');
  });
});

describe('posPaymentController wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, '../controllers/posPaymentController.ts'), 'utf8');
  it('never echoes adapter messages into a response', () => {
    expect(src).not.toMatch(/error:\s*(sandboxResult|result)\.message/);
    expect(src).not.toMatch(/json\(\{\s*message:\s*(sandboxResult|result)\.message/);
  });
  it('uses the helper on all five adapter failure sites', () => {
    expect((src.match(/posPaymentFailureBody\(/g) ?? []).length).toBe(5);
  });
});
