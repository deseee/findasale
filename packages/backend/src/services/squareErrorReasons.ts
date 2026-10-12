/**
 * Square CreatePayment error -> cashier-safe reason (2026-10-11).
 *
 * Until now every thrown SquareError on the POS was collapsed into "Your card was declined", which hid real causes
 * (a live $1.00 hand-keyed sale failed with INVALID_FEES -- not a card problem at all -- and the cashier was told the
 * card was declined). Each mapped Square error code (names from Square's documented Payments API error codes) gets a
 * stable human message here. Raw processor strings are never passed through, except a short, card-data-free
 * `detail` for a code that is not mapped (see sanitizeSquareDetail).
 *
 *   kind DECLINE  the card/bank said no            -> CARD_DECLINED, HTTP 400
 *   kind FEE      sale too small for the app fee   -> CARD_AMOUNT_TOO_SMALL, HTTP 400 (NEVER labelled a decline)
 *   kind RETRY    transient processor trouble      -> PAYMENT_PROVIDER_UNAVAILABLE, HTTP 502
 *   kind OTHER    account/setup/other refusals     -> PAYMENT_CREATE_FAILED, HTTP 400
 */
export type SquareReasonKind = 'DECLINE' | 'FEE' | 'RETRY' | 'OTHER';

export interface SquareReason {
  kind: SquareReasonKind;
  message: string;
}

const BANK = 'Ask for a different card or contact the bank.';

export const SQUARE_ERROR_REASONS: Record<string, SquareReason> = {
  GENERIC_DECLINE: { kind: 'DECLINE', message: `The card was declined by the bank. ${BANK}` },
  CARD_DECLINED: { kind: 'DECLINE', message: `The card was declined by the bank. ${BANK}` },
  CARD_DECLINED_VERIFICATION_REQUIRED: {
    kind: 'DECLINE',
    message: 'The bank needs extra verification for this card (such as a PIN or an issuer check) that cannot be done on manual entry. Try a different card.',
  },
  CARD_DECLINED_CALL_ISSUER: {
    kind: 'DECLINE',
    message: 'The bank declined this card and asked the cardholder to call them. Ask for a different card.',
  },
  INSUFFICIENT_FUNDS: { kind: 'DECLINE', message: 'Insufficient funds.' },
  CVV_FAILURE: { kind: 'DECLINE', message: 'The security code (CVV) did not match.' },
  VERIFY_CVV_FAILURE: { kind: 'DECLINE', message: 'The security code (CVV) did not match.' },
  ADDRESS_VERIFICATION_FAILURE: { kind: 'DECLINE', message: 'The billing ZIP/address did not match.' },
  VERIFY_AVS_FAILURE: { kind: 'DECLINE', message: 'The billing ZIP/address did not match.' },
  INVALID_EXPIRATION: { kind: 'DECLINE', message: 'The card is expired or the expiration date is wrong.' },
  EXPIRATION_FAILURE: { kind: 'DECLINE', message: 'The card is expired or the expiration date is wrong.' },
  CARD_EXPIRED: { kind: 'DECLINE', message: 'The card is expired or the expiration date is wrong.' },
  INVALID_CARD: { kind: 'DECLINE', message: 'The card number is not valid or the card type is not accepted.' },
  PAN_FAILURE: { kind: 'DECLINE', message: 'The card number is not valid or the card type is not accepted.' },
  CARD_NOT_SUPPORTED: { kind: 'DECLINE', message: 'The card number is not valid or the card type is not accepted.' },
  INVALID_ACCOUNT: { kind: 'DECLINE', message: 'The card number is not valid or the card type is not accepted.' },
  TRANSACTION_LIMIT: { kind: 'DECLINE', message: "Over the card's transaction limit." },
  CARD_TOKEN_USED: { kind: 'OTHER', message: 'This card entry was already used. Re-enter the card and try again.' },
  CARD_TOKEN_EXPIRED: { kind: 'OTHER', message: 'This card entry expired. Re-enter the card and try again.' },
  CARD_PROCESSING_NOT_ENABLED: {
    kind: 'OTHER',
    message: 'Card processing is not enabled on this Square account. Finish the Square setup or take the sale in cash.',
  },
  TEMPORARY_ERROR: { kind: 'RETRY', message: 'Square had a temporary problem. Please try the card again in a moment.' },
  GATEWAY_TIMEOUT: { kind: 'RETRY', message: 'Square did not respond in time. Please try the card again in a moment.' },
  INVALID_FEES: {
    kind: 'FEE',
    message: 'This sale is too small to take by card because of the minimum platform fee. Take it in cash or raise the amount.',
  },
};

export const SQUARE_GENERIC_FAILURE = 'The payment could not be completed';

/** Square's own `detail`, only when it is short and carries nothing that looks like card data, an email or a token. */
export function sanitizeSquareDetail(detail: unknown): string | null {
  if (typeof detail !== 'string') return null;
  const d = detail.trim();
  if (!d || d.length > 140) return null;
  if (/\d{6,}/.test(d)) return null; // card / account style digit runs
  if (/@|https?:\/\//i.test(d)) return null; // emails, urls
  if (/\b(cnon|ccof|EAAA|sq0)[:\w-]*/i.test(d) && /[:_-]\w{8,}/.test(d)) return null; // card nonces / tokens
  return d;
}

const safeCodeLabel = (code: unknown): string => {
  const c = typeof code === 'string' ? code.trim() : '';
  return /^[A-Z0-9_]{2,64}$/.test(c) ? c : 'SQUARE_ERROR';
};

export interface DescribedSquareError {
  squareCode: string;
  kind: SquareReasonKind;
  mapped: boolean;
  message: string;
}

/**
 * Turns the first entry of a SquareError's `errors` array into a stable code plus a safe message. `mapped` is false
 * for codes not in the table above; those use Square's own short detail when it is clean, else the generic text
 * followed by the code.
 */
export function describeSquareError(first: { code?: unknown; detail?: unknown } | null | undefined): DescribedSquareError {
  const squareCode = safeCodeLabel(first?.code);
  const known = SQUARE_ERROR_REASONS[squareCode];
  if (known) return { squareCode, kind: known.kind, mapped: true, message: known.message };
  const detail = sanitizeSquareDetail(first?.detail);
  return {
    squareCode,
    kind: 'OTHER',
    mapped: false,
    message: detail ? detail : `${SQUARE_GENERIC_FAILURE} (${squareCode}).`,
  };
}

/** Message for a squareCode already carried on an adapter result; `fallback` (the adapter's own message) is used only
 *  for an unmapped code and only after the same sanitizing. */
export function squareReasonForCode(squareCode: string, fallback?: string): DescribedSquareError {
  const code = safeCodeLabel(squareCode);
  const known = SQUARE_ERROR_REASONS[code];
  if (known) return { squareCode: code, kind: known.kind, mapped: true, message: known.message };
  const detail = sanitizeSquareDetail(fallback);
  return { squareCode: code, kind: 'OTHER', mapped: false, message: detail ? detail : `${SQUARE_GENERIC_FAILURE} (${code}).` };
}
