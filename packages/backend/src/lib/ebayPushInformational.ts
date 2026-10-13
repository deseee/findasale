/**
 * Push block reasons that are INFORMATIONAL, not failures (Patrick, 2026-10-12).
 *
 * When an eBay push cannot go out because the item needs more information (no package weight, unconfirmed box size, no
 * ISBN for a book, eBay shipping policies not set up), nothing is wrong with eBay or with FindA.Sale. The organizer just has
 * something to fill in. These rows keep their stored status (no new status value, no migration) and are told apart by
 * errorCode. Every failure count, banner and retry lookup excludes them; real eBay API errors keep counting.
 */
export const INFORMATIONAL_PUSH_CODES: readonly string[] = [
  'NEEDS_PACKAGE_DETAILS',
  'EBAY_NO_PACKAGE_WEIGHT',
  'EBAY_WEIGHT_NOT_CONFIRMED',
  'EBAY_PACKAGE_DIMS_NOT_CONFIRMED',
  'EBAY_BOOK_NO_ISBN',
  'POLICIES_NOT_CONFIGURED',
  'NO_FULFILLMENT_POLICY_MATCH',
];

export function isInformationalPushCode(code: string | null | undefined): boolean {
  return typeof code === 'string' && INFORMATIONAL_PUSH_CODES.includes(code);
}

/**
 * Prisma where fragment: rows that are NOT informational blocks. A plain `notIn` would drop rows whose errorCode is NULL
 * (SQL NULL NOT IN is unknown), so NULL is allowed explicitly.
 */
export const INFORMATIONAL_ONLY_PUSH_WHERE = { errorCode: { in: [...INFORMATIONAL_PUSH_CODES] } };

export const NOT_INFORMATIONAL_PUSH_WHERE = {
  OR: [{ errorCode: null }, { errorCode: { notIn: [...INFORMATIONAL_PUSH_CODES] } }],
};
