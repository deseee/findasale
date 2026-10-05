/**
 * Every user-facing string of the TCGplayer round trip (ADR-137), in one module so the copy lint test can scan them
 * all. Rules: plain wording for a shop owner, no em dash or en dash, no mention of automation, the word "sale" for a
 * sale, no placeholder text.
 */

export const API_MESSAGES = {
  FEATURE_DISABLED: 'The TCGplayer round trip is not turned on for this account yet.',
  UNAUTHORIZED: 'Organizer access required.',
  NO_FILE: 'Choose the CSV file you exported from your TCGplayer seller account.',
  NOT_A_TCGPLAYER_FILE: 'This does not look like a TCGplayer seller inventory export. It needs the columns TCGplayer Id, Condition and Total Quantity.',
  BAD_PARAMS: 'Some choices sent with the request are not valid. Reload the page and try again.',
  UPLOAD_ANSWER_REQUIRED: 'Tell us whether you uploaded the last update file to TCGplayer, so quantities are not counted twice.',
  NOTHING_TO_UPLOAD: 'There are no changes to send to TCGplayer right now.',
  NO_PENDING_EXPORT: 'There is no update file waiting to be marked as uploaded. Download a new one first.',
  ALREADY_RUNNING: 'An update for this sale is already running. Wait for it to finish and try again.',
  RATE_LIMITED: 'Too many requests. Please wait a while and try again.',
  SERVER_ERROR: 'Something went wrong. Nothing was lost and you can try again.',
} as const;

export const FILE_PROBLEM_MESSAGES = {
  BAD_TCGPLAYER_ID: 'The TCGplayer Id in this row is missing or not a whole number, so the row was skipped.',
  BAD_QUANTITY: 'The Total Quantity in this row is missing or not a whole number from 0 to 10,000, so the row was skipped.',
  BAD_CONDITION: 'The condition in this row was not recognized, so the row was skipped instead of guessing.',
  ROW_TOO_LONG: 'This row has more text than we can read, so it was skipped.',
} as const;

export const OUTCOME_LABELS = {
  IN_SYNC: 'Matches TCGplayer',
  DECREASE: 'Sold on TCGplayer',
  INCREASE: 'More on TCGplayer',
  NEEDS_NEW_ITEM: 'Add this card with the regular import',
} as const;

export const NOTES = {
  FIRST_SYNC_DIFFERS: 'First time this card is matched. Its FindA.Sale quantity was not changed. The next update file will correct TCGplayer.',
  SHORTFALL: 'TCGplayer sold more of this card than FindA.Sale had available. Check that none of it was also sold at the counter.',
  NEEDS_NEW_ITEM: 'TCGplayer shows stock of this card, but this sale has no available item for it. Add it with the regular card import.',
  NOT_IN_FINDASALE: 'On TCGplayer but not in this sale. Add these cards with the regular card import.',
  LISTED_BUT_MISSING: 'FindA.Sale believes TCGplayer holds this card, but your file has no row for it. It may have sold out there. Nothing was changed.',
  DUPLICATE_KEYS: 'The same TCGplayer Id, condition and foil appears on more than one row. Those cards were skipped.',
} as const;

/** Text for the counter notice and the sync page. */
export const COUNTER_MESSAGES = {
  ONE_CARD: 'This card is also listed on TCGplayer. Update TCGplayer after the sale.',
  MANY_CARDS: 'Some of these cards are also listed on TCGplayer. Update TCGplayer after the sale.',
  DOWNLOAD: 'Download TCGplayer update file',
  OPEN_PAGE: 'Open TCGplayer sync',
} as const;

export const TENANT_NOTES = {
  EBAY_TRACKED: 'eBay orders between $20 and $30 will be tracked. A raw card priced under $20 can still ship in a plain envelope.',
} as const;

export function allTcgplayerMessages(): string[] {
  return [
    ...Object.values(API_MESSAGES),
    ...Object.values(FILE_PROBLEM_MESSAGES),
    ...Object.values(OUTCOME_LABELS),
    ...Object.values(NOTES),
    ...Object.values(COUNTER_MESSAGES),
    ...Object.values(TENANT_NOTES),
  ];
}
