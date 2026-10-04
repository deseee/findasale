/**
 * Every user-facing string the card intake can send (ADR-134 #642, batch B4). Kept in one module so
 * the copy-lint test can scan them all. Rules: plain wording for a non-technical seller, no em
 * dashes, no placeholder text, no mention of automation or its abbreviation, and the word "sale"
 * for a sale (never a qualifier before it). The copy-lint test enforces these.
 */
import type { RowErrorCode } from './types';

export const ROW_ERROR_MESSAGES: Record<RowErrorCode, string> = {
  MISSING_NAME: 'This row has no card name, so it was skipped.',
  BAD_QUANTITY: 'The quantity must be a whole number from 1 to 10,000.',
  BAD_PRICE: 'The price is not a valid amount, so this row was skipped.',
  AMBIGUOUS_PRINTING: 'Several printings match this card and none was chosen, so this row was skipped.',
  UNKNOWN_FINISH: 'The finish (foil or non-foil) could not be told from your file and none was chosen, so this row was skipped.',
  CONDITION_UNMAPPED: 'The condition in this row was not matched to a condition, so this row was skipped instead of guessing.',
  SKU_CONFLICT: 'Another card in this sale already uses this SKU, so this row was skipped.',
  GRADED_MISSING_GRADE: 'A graded card needs both a grading company and a grade, so this row was skipped.',
  CERT_TOO_LONG: 'The certification number is longer than 30 characters, so this row was skipped.',
  ROW_TOO_LONG: 'This row has more text than we can store, so it was skipped.',
  INVALID_DECISION: 'The choice made for this row does not match any of its options, so this row was skipped.',
  INVALID_CARD_DATA: 'Some card details in this row are not valid, so it was skipped.',
};

export const WARNING_MESSAGES = {
  DUPLICATE_IN_FILE_MERGED: 'The same card appears more than once in your file. The quantities were added together.',
  MULTIPLE_MATCHES: 'More than one card in this sale matched. The oldest one was updated.',
  MISSING_CONDITION: 'No condition was given for this card, so the condition was left blank.',
  UNKNOWN_LANGUAGE: 'The language was not recognized, so it was left blank.',
} as const;

export const REVIEW_MESSAGES = {
  AMBIGUOUS_PRINTING: 'More than one printing matches this card. Pick the right one or skip this row.',
  NO_CATALOG_MATCH: 'No catalog match. This card will be added with the details from your file.',
  FINISH_AMBIGUOUS: 'Choose the finish (foil or non-foil) for this card or skip this row.',
} as const;

export const API_MESSAGES = {
  UNAUTHORIZED: 'Organizer access required.',
  SALE_NOT_FOUND: 'Sale not found.',
  NOT_YOUR_SALE: 'This is not your sale.',
  NO_FILE: 'Choose a CSV file to upload.',
  FILE_TOO_LARGE: 'That file is too large. Split it into smaller files and try again.',
  UNSUPPORTED_FILE_TYPE: 'Only CSV, TSV or TXT files can be imported. Export your list as CSV and try again.',
  UPLOAD_FAILED: 'The file could not be uploaded. Please try again.',
  NOT_A_CSV_FILE: 'This file does not look like a CSV file. Export your list as CSV and try again.',
  PARSE_ERROR: 'The file could not be read. Check that it is a normal CSV export and try again.',
  EMPTY_FILE: 'This file has no card rows.',
  NO_NAME_COLUMN: 'We could not find a card name column. Choose which column holds the card name.',
  BAD_COLUMN_MAPPING: 'The column choices do not match the columns in your file.',
  BAD_FORMAT: 'That file format is not one we can import.',
  BAD_GAME: 'That game is not one we can import.',
  BAD_PRICE_SOURCE: 'Choose whether to use the prices from your file or leave prices blank.',
  BAD_DEFAULT_CONDITION: 'That condition is not one we can use.',
  BAD_MODE: 'Choose how to handle cards you already have: add to the quantity, or replace it.',
  MODE_REQUIRED: 'Choose how to handle cards you already have: add to the quantity, or replace it with the number in your file.',
  FILE_HASH_REQUIRED: 'The file check value is missing. Preview the file again before importing.',
  BAD_JSON: 'Some of the choices sent with the file could not be read. Preview the file again and retry.',
  BAD_CONDITION_MAPPING: 'One of the condition choices is not a valid condition.',
  BAD_DECISIONS: 'One of the row choices is not valid. Preview the file again and retry.',
  FILE_CHANGED: 'This file is different from the one you previewed. Preview it again before importing.',
  TOO_MANY_ROWS: 'This file has too many rows. Split it into smaller files and try again.',
  ALREADY_APPLIED: 'This file was already imported. Nothing was changed.',
  DB_SPACE_LOW: 'We cannot import this many cards right now because storage is nearly full. Please contact support.',
  RATE_LIMITED_PREVIEW: 'Too many previews. Please wait a while and try again.',
  RATE_LIMITED_CONFIRM: 'Too many imports. Please wait a while and try again.',
  SERVER_ERROR: 'Something went wrong while importing. Your progress was saved and you can try again.',
  CANCELLED: 'The import was stopped. Send the same file again to continue where it stopped.',
} as const;

/** Text shown next to each importer on the upload screen. */
export const FORMAT_HINTS = {
  manabox: 'ManaBox: export your collection as CSV from the ManaBox app.',
  moxfield: 'Moxfield: export your collection as CSV from your Moxfield collection page.',
  tcgplayer_seller: 'TCGplayer seller inventory: the inventory CSV exported from your TCGplayer seller account.',
  tcgplayer_app: 'TCGplayer app: the collection CSV exported from the TCGplayer app.',
  generic: 'Any other CSV: you will choose which column holds the name, set, number, quantity and so on.',
} as const;

/** Labels for the column-mapping screen (generic files). */
export const SOURCE_FIELD_LABELS = {
  name: 'Card name',
  setCode: 'Set code',
  setName: 'Set name',
  collectorNumber: 'Card number',
  quantity: 'Quantity',
  finish: 'Foil or finish',
  condition: 'Condition',
  language: 'Language',
  price: 'Price',
  sku: 'Your SKU',
  scryfallId: 'Scryfall ID',
  tcgplayerProductId: 'TCGplayer ID',
  cost: 'What you paid',
  costCurrency: 'Currency of what you paid',
  game: 'Game',
  rarity: 'Rarity',
  grader: 'Grading company',
  grade: 'Grade',
  certNumber: 'Certification number',
} as const;

export const MODE_LABELS = {
  ADD: 'Add to existing quantity',
  REPLACE: 'Replace quantity with file value',
} as const;

export const PRICE_SOURCE_LABELS = {
  FILE: 'Use the price from my file',
  NONE: 'Leave prices blank',
} as const;

export const CONDITION_LABELS_NOTE = 'Condition words mean different things in different apps, so every non-obvious one is shown for you to confirm.';

/** Every exported constant string, flattened, for the copy-lint test. */
export function allIntakeMessages(): string[] {
  return [
    ...Object.values(ROW_ERROR_MESSAGES),
    ...Object.values(WARNING_MESSAGES),
    ...Object.values(REVIEW_MESSAGES),
    ...Object.values(API_MESSAGES),
    ...Object.values(FORMAT_HINTS),
    ...Object.values(SOURCE_FIELD_LABELS),
    ...Object.values(MODE_LABELS),
    ...Object.values(PRICE_SOURCE_LABELS),
    CONDITION_LABELS_NOTE,
  ];
}
