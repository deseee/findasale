/**
 * Every user-facing string the card scan can send (ADR-138 section 12, batch B2). Kept in one module so the
 * copy-lint test can scan them all. Rules: plain wording for a non-technical seller, no em dash or en dash,
 * no placeholder text, no mention of automation or its abbreviation (say Smart, Auto or Suggested), the word
 * "sale" for a sale with no qualifier before it, and the organizer's own choices always win.
 */
import type { ScanNeed, ScanNotCommittedReason, DuplicateKind } from './types';

export const SCAN_LABELS = {
  FEATURE: 'Scan cards',
  RECOGNIZER: 'Smart scan',
  COMMIT_ADD: 'Add to my stock',
  COMMIT_REPLACE: 'Set my stock to this count',
} as const;

/** Why scanning is not available right now. Adding a card by search always still works. */
export const SCAN_STATUS_MESSAGES = {
  DISABLED: 'Smart scan is not turned on yet. You can still search for a card and add it by hand.',
  QUOTA_EXCEEDED: "You have used this month's Smart tags. You can still add cards by search.",
  CAP_REACHED: 'Smart scan is paused for today. You can still add cards by search.',
  PROVIDER_UNAVAILABLE: 'Smart scan could not read that card right now. You can try again, or add the card by search.',
  NO_CARD: 'We could not see a card in that picture. Place the card in the frame and try again.',
  UNREADABLE: 'We could not read that card. Try again with better light, or add it by search.',
} as const;

/** Notes shown next to a reading, keyed by ObservationResolution.note. */
export const RESOLUTION_NOTE_MESSAGES = {
  NAME_MISMATCH: 'The set and number we read do not match the name. Pick the right printing.',
  NAME_ONLY: 'We found one printing with this name. Check the picture matches your card.',
  GAME_NOT_SERVED: 'We do not have a card list for this game yet. Check the details and use them as typed.',
  CATALOG_OFF: 'The card list is not available right now. Check the details and use them as typed.',
} as const;

export const NEED_MESSAGES: Record<ScanNeed, string> = {
  PRINTING: 'Pick the printing that matches your card.',
  FINISH: 'Choose the finish (foil or non-foil) for this card.',
  CONDITION: 'Choose the condition of this card, or enter its grading company and grade.',
  NAME: 'Enter the card name.',
};

export const DUPLICATE_MESSAGES: Record<DuplicateKind, string> = {
  SAME_ENTRY: 'That picture was already received. Nothing was added.',
  SAME_PLACEMENT: 'This card was already scanned. Nothing was added.',
  SAME_IMAGE: 'That exact picture was already scanned. Nothing was added.',
  SUSPECT_REPEAT: 'Looks like the same card as the last one. Count it as another copy?',
};

export const NOT_COMMITTED_MESSAGES: Record<ScanNotCommittedReason, string> = {
  PRINTING: NEED_MESSAGES.PRINTING,
  FINISH: NEED_MESSAGES.FINISH,
  CONDITION: NEED_MESSAGES.CONDITION,
  NAME: NEED_MESSAGES.NAME,
  SUSPECT_REPEAT: 'This card is waiting for you to decide whether it is another copy, so it was not added.',
  INVALID_DETAILS: 'Some details on this card are not valid, so it was not added.',
  PRINTING_NOT_FOUND: 'The printing chosen for this card could not be found, so it was not added. Pick it again.',
};

/** Answers for the scan endpoints, keyed by the failure code the endpoint sends. */
export const SCAN_API_MESSAGES = {
  UNAUTHORIZED: 'Organizer access required.',
  NOT_YOUR_SALE: 'This is not your sale.',
  SALE_NOT_FOUND: 'Sale not found.',
  SESSION_NOT_FOUND: 'That scan session was not found.',
  ENTRY_NOT_FOUND: 'That card was not found in this scan session.',
  CARD_NOT_FOUND: 'We could not find that card in the card list.',
  BAD_REQUEST: 'Some of the details sent could not be read. Please try again.',
  CARD_VALIDATION: 'Some card details are not valid. Check them and try again.',
  BAD_FRAME: 'That picture could not be used. Take another one.',
  FRAME_TOO_LARGE: 'That picture is too large. Take another one.',
  RATE_LIMITED: 'You are scanning faster than we can keep up. Wait a moment and try again.',
  SESSION_NOT_OPEN: 'This scan session is closed.',
  SESSION_FULL: 'This scan session is full. Add these cards to your stock, then start a new session.',
  TOO_MANY_OPEN_SESSIONS: 'This sale already has the most open scan sessions allowed. Finish or discard one first.',
  ENTRY_CHANGED: 'This card was changed somewhere else. The latest details are shown.',
  SESSION_COMMITTING: 'These cards are being added to your stock right now. Wait a moment and try again.',
  MODE_REQUIRED: 'Choose how to handle cards you already have: add to the quantity, or set it to this count.',
  MODE_MISMATCH: 'This scan session was started with the other choice. Use the same choice to finish it.',
  ALREADY_APPLIED: 'These cards were already added. Nothing was changed.',
  NOTHING_READY: 'No cards are ready to add yet. Finish the cards that need a decision first.',
  DB_SPACE_LOW: 'We cannot add this many cards right now because storage is nearly full. Please contact support.',
  SERVER_ERROR: 'Something went wrong. Your cards were saved and you can try again.',
} as const;

/** "Suggested: Near Mint. Tap to use." */
export function suggestedConditionText(conditionLabel: string): string {
  return `Suggested: ${conditionLabel}. Tap to use.`;
}

/** "12 cards will be saved as Near Mint (your default for this session)." */
export function sessionDefaultDisclosure(count: number, conditionLabel: string): string {
  const noun = count === 1 ? 'card' : 'cards';
  return `${count} ${noun} will be saved as ${conditionLabel} (your default for this session).`;
}

/** Every exported constant string, flattened, plus samples of the generated ones, for the copy-lint test. */
export function allScanMessages(): string[] {
  return [
    ...Object.values(SCAN_LABELS),
    ...Object.values(SCAN_STATUS_MESSAGES),
    ...Object.values(RESOLUTION_NOTE_MESSAGES),
    ...Object.values(NEED_MESSAGES),
    ...Object.values(DUPLICATE_MESSAGES),
    ...Object.values(NOT_COMMITTED_MESSAGES),
    ...Object.values(SCAN_API_MESSAGES),
    suggestedConditionText('Near Mint'),
    sessionDefaultDisclosure(1, 'Near Mint'),
    sessionDefaultDisclosure(12, 'Near Mint'),
  ];
}
