/**
 * Payment review finding 4 (2026-09-30): the hold invoice, checkout-link and payment-link email paths must not
 * return raw processor or exception text to the client. They answer a generic message plus a stable `code`, and
 * the detail is logged server side. This is a source scan: the two invoice and one settlement error sites need a
 * live Square failure to drive through the real handlers, which needs a database.
 */
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('payment paths return generic messages with a stable code', () => {
  const files = ['controllers/posController.ts', 'controllers/reservationController.ts'];

  it.each(files)('%s never puts a caught error message in a JSON response body', (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/error:\s*squareError\??\.message/);
    expect(src).not.toMatch(/error:\s*stripeErr\??\.message/);
    expect(src).not.toMatch(/json\(\{[^}]*error:\s*(err|error|e)\??\.message/);
  });

  it('sendHoldInvoice answers SQUARE_PAYMENT_LINK_FAILED and logs the detail server side', () => {
    const src = read('controllers/posController.ts');
    expect(src).toMatch(/Failed to create Square payment link', code: 'SQUARE_PAYMENT_LINK_FAILED'/);
    expect(src).toContain("console.error('[pos] sendHoldInvoice: Square payment link creation failed:', squareError)");
  });

  it('the hold-invoice and checkout-link handlers in reservationController use stable codes', () => {
    const src = read('controllers/reservationController.ts');
    expect(src).toMatch(/Failed to create Square payment link', code: 'SQUARE_PAYMENT_LINK_FAILED'/);
    expect(src).toMatch(/message: 'Failed to create checkout link',\s*code: 'CHECKOUT_LINK_FAILED'/);
  });

  it('the payment link email endpoint answers generic errors with codes', () => {
    const src = read('controllers/posController.ts');
    expect(src).toContain("{ message: 'Failed to send email', code: 'EMAIL_SEND_FAILED' }");
  });
});
