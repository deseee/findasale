/**
 * Payment-adapter failure -> client response (2026-09-30). The adapters' `message` strings are built for logs and
 * sometimes carry processor detail (for example the Stripe intent status), and the old code echoed them straight into
 * the response (`error: result.message`). The client now gets a fixed generic message plus a STABLE code it can branch
 * on; the detail (adapter status and message) is logged server-side only.
 *   CARD_DECLINED                a declined card (the only message worth showing the shopper as is)
 *   PAYMENT_PROVIDER_UNAVAILABLE the processor could not be reached or verified (adapter 502)
 *   PAYMENT_VERIFICATION_FAILED  the payment did not check out against this request (adapter 4xx other than a decline)
 *   PAYMENT_CREATE_FAILED        the processor refused or failed the charge (adapter 5xx)
 */
export const POS_PAYMENT_FAILURE_MESSAGES = {
  CARD_DECLINED: 'Your card was declined. Please check your card details or try a different card.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'We could not reach the payment processor. Please try again in a moment.',
  PAYMENT_VERIFICATION_FAILED: 'We could not verify this payment. Please try again or ask the organizer for help.',
  PAYMENT_CREATE_FAILED: 'We could not complete the payment. Please try again.',
} as const;
export type PosPaymentFailureCode = keyof typeof POS_PAYMENT_FAILURE_MESSAGES;

export const posPaymentFailureBody = (
  result: { status: number; message: string },
  context: string,
  opts: { includeErrorField?: boolean } = {}
): { status: number; body: { message: string; code: PosPaymentFailureCode; error?: string } } => {
  console.error(`[pos-payment] ${context}: payment adapter reported failure (HTTP ${result.status}): ${result.message}`);
  let code: PosPaymentFailureCode;
  if (result.status === 400 && /declined/i.test(result.message)) code = 'CARD_DECLINED';
  else if (result.status === 502) code = 'PAYMENT_PROVIDER_UNAVAILABLE';
  else if (result.status >= 500) code = 'PAYMENT_CREATE_FAILED';
  else code = 'PAYMENT_VERIFICATION_FAILED';
  const message = POS_PAYMENT_FAILURE_MESSAGES[code];
  // Only the statuses the client already understood are passed on (declines stay 400, processor trouble stays 502).
  const status = code === 'CARD_DECLINED' ? 400 : code === 'PAYMENT_PROVIDER_UNAVAILABLE' ? 502 : code === 'PAYMENT_CREATE_FAILED' ? 500 : 400;
  return { status, body: opts.includeErrorField ? { message, error: message, code } : { message, code } };
};
