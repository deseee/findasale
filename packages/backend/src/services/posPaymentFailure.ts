import { squareReasonForCode } from './squareErrorReasons';

/**
 * Payment-adapter failure -> client response (2026-09-30, reasons added 2026-10-11). The adapters' `message` strings
 * are built for logs and sometimes carry processor detail (for example the Stripe intent status), so they are never
 * echoed straight into the response. The client gets a message plus a STABLE code it can branch on; the detail
 * (adapter status and message) is logged server-side only.
 *   CARD_DECLINED                a declined card (the only message worth showing the shopper as is)
 *   CARD_AMOUNT_TOO_SMALL        the sale is too small to carry the platform fee on a card (Square INVALID_FEES); NOT a decline
 *   PAYMENT_PROVIDER_UNAVAILABLE the processor could not be reached or verified (adapter 502, or a Square TEMPORARY_ERROR)
 *   PAYMENT_VERIFICATION_FAILED  the payment did not check out against this request (adapter 4xx other than a decline)
 *   PAYMENT_CREATE_FAILED        the processor refused or failed the charge (adapter 5xx, or a Square refusal that is not a decline)
 *
 * Specific reasons (2026-10-11): when the adapter result carries `squareCode` (Square's errors[0].code), the body gets
 * the specific, pre-written message for that code (squareErrorReasons.ts: "Insufficient funds.", "The security code
 * (CVV) did not match.", ...) instead of the fixed generic text, plus an extra `squareCode` field. `message` and
 * `error` (legacy, opt-in) carry that text; `reason` equals it as well. Raw processor strings are never exposed: an
 * unmapped code falls back to Square's own `detail` only when it is short and holds no card data, else to a generic
 * "The payment could not be completed (CODE)." Declines stay HTTP 400.
 */
export const POS_PAYMENT_FAILURE_MESSAGES = {
  CARD_DECLINED: 'Your card was declined. Please check your card details or try a different card.',
  CARD_AMOUNT_TOO_SMALL: 'This sale is too small to take by card because of the minimum platform fee. Take it in cash or raise the amount.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'We could not reach the payment processor. Please try again in a moment.',
  PAYMENT_VERIFICATION_FAILED: 'We could not verify this payment. Please try again or ask the organizer for help.',
  PAYMENT_CREATE_FAILED: 'We could not complete the payment. Please try again.',
} as const;
export type PosPaymentFailureCode = keyof typeof POS_PAYMENT_FAILURE_MESSAGES;

export interface PosPaymentFailureResponseBody {
  message: string;
  code: PosPaymentFailureCode;
  error?: string;
  /** Present only when the failure came from a Square error code. */
  squareCode?: string;
  /** Same text as `message`; present only alongside `squareCode`. */
  reason?: string;
}

export const posPaymentFailureBody = (
  result: { status: number; message: string; squareCode?: string },
  context: string,
  opts: { includeErrorField?: boolean } = {}
): { status: number; body: PosPaymentFailureResponseBody } => {
  console.error(
    `[pos-payment] ${context}: payment adapter reported failure (HTTP ${result.status}${result.squareCode ? `, square ${result.squareCode}` : ''}): ${result.message}`
  );

  if (result.squareCode) {
    const reason = squareReasonForCode(result.squareCode, result.message);
    const code: PosPaymentFailureCode =
      reason.kind === 'DECLINE' ? 'CARD_DECLINED'
      : reason.kind === 'FEE' ? 'CARD_AMOUNT_TOO_SMALL'
      : reason.kind === 'RETRY' ? 'PAYMENT_PROVIDER_UNAVAILABLE'
      : 'PAYMENT_CREATE_FAILED';
    const status = reason.kind === 'RETRY' ? 502 : 400;
    const body: PosPaymentFailureResponseBody = {
      message: reason.message,
      ...(opts.includeErrorField ? { error: reason.message } : {}),
      code,
      squareCode: reason.squareCode,
      reason: reason.message,
    };
    return { status, body };
  }

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
