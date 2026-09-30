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
