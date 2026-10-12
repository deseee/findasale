/**
 * Ximilar recognizer: a typed STUB. It makes no network call, holds no key and imports no HTTP client.
 * Selected only by CARD_SCAN_PROVIDER=ximilar, which stays unsupported until a later ADR (ADR-138 sections 4 and 17).
 *
 * No request is written against an unverified vendor schema. Before any HTTP is added here, someone must verify
 * from the vendor's own documentation (not from memory):
 *   1. the authentication header and how the account token is passed,
 *   2. the endpoint and request format for card identification, and its image size limits,
 *   3. the response schema: which fields identify a printing and how a match score is reported,
 *   4. the credit cost of one identification call (the research notes mention 10 credits; no price was verified),
 *   5. the terms: multi-tenant use on one account, storage of results, and any price data (price data is dropped).
 * No published accuracy figure was found for this vendor, so none is assumed.
 */
import { failure } from './types';
import type { CardRecognitionProvider } from './types';

export const XIMILAR_NOT_CONFIGURED = 'Ximilar recognition is not configured.';

export const ximilarProvider: CardRecognitionProvider = {
  id: 'ximilar',
  isAvailable: () => false,
  recognize: async () => failure('DISABLED', false),
};
