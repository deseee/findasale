/**
 * Scrydex recognizer: a typed STUB. It makes no network call, holds no key and imports no HTTP client.
 * Selected only by CARD_SCAN_PROVIDER=scrydex, which stays unsupported until a later ADR (ADR-138 sections 4 and 17).
 *
 * No request is written against an unverified vendor schema. Before any HTTP is added here, someone must verify
 * from the vendor's own documentation (not from memory):
 *   1. the authentication header and how the account key is passed,
 *   2. the request format for a card photo (upload, base64 or URL) and its size limits,
 *   3. the response schema: which fields identify a printing (set code, number, name, ids) and any score,
 *   4. the credit cost of one call on the plan we would buy, and what a failed call costs,
 *   5. the terms: whether the service may be used for many sellers on one account (multi-tenant use),
 *      whether results may be stored, and whether any price data comes back (price data is dropped).
 * The research notes quote 5 credits per call (about $0.029 on a 5,000 credit plan); that figure and any accuracy
 * claim are unverified.
 */
import { failure } from './types';
import type { CardRecognitionProvider } from './types';

export const SCRYDEX_NOT_CONFIGURED = 'Scrydex recognition is not configured.';

export const scrydexProvider: CardRecognitionProvider = {
  id: 'scrydex',
  isAvailable: () => false,
  recognize: async () => failure('DISABLED', false),
};
