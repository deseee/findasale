/**
 * The four duplicate layers for scans of the same physical card (ADR-138 section 3.5). Pure: each function is a
 * decision over rows the caller already loaded, so it can be tested without a database. Layers 1 to 3 run BEFORE
 * the recognizer is called (so they also save money); layer 4 runs after the card has been identified.
 *
 *  L1 retry      same clientEntryId  -> return the existing entry, no spend
 *  L2 placement  same placementId    -> return the existing entry, no spend, except ONE re-read when the first
 *                                       reading found nothing usable (an unmatched card the organizer has not
 *                                       decided, or an error)
 *  L3 image      same image sha256   -> return the existing entry, no spend
 *  L4 repeat     a frame with no placementId whose identity equals the previous entry's inside the window is HELD
 *                (suspectDuplicateOf), not counted until the organizer says "count as another copy"
 */
import { computeDedupKey } from '../cardRecordService';
import { MAX_PLACEMENT_ATTEMPTS } from './config';
import type { ObservationResolution, ScanEntryRow, ScanEntrySource } from './types';

/** What the duplicate checks read from a stored entry. */
export type DuplicateCandidateRow = Pick<
  ScanEntryRow,
  'id' | 'seq' | 'clientEntryId' | 'placementId' | 'imageSha256' | 'attempts' | 'status' | 'resolution' | 'acceptAsTyped'
>;

/** What the duplicate checks read from the frame being received. */
export interface DuplicateProbe {
  clientEntryId: string | null;
  placementId: string | null;
  imageSha256: string | null;
}

export type EarlyDuplicateDecision =
  | { kind: 'NONE' }
  | { kind: 'SAME_ENTRY'; entryId: string }
  | { kind: 'SAME_IMAGE'; entryId: string }
  | {
      kind: 'SAME_PLACEMENT';
      entryId: string;
      /** True when the existing entry may be re-read once (the recognizer runs again and the entry is updated). */
      retry: boolean;
    };

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return typeof a === 'string' && a !== '' && a === b;
}

/** The first reading found nothing usable and the organizer has not decided the row yet. */
function readingWasUnusable(row: DuplicateCandidateRow): boolean {
  if (row.status === 'ERROR') return true;
  return row.status === 'NEEDS_REVIEW' && row.resolution === 'UNMATCHED' && !row.acceptAsTyped;
}

/**
 * Layers 1 to 3. `existing` is every entry of the session that could match (the caller may pass just the rows
 * whose clientEntryId, placementId or imageSha256 equal the probe's).
 */
export function decideEarlyDuplicate(probe: DuplicateProbe, existing: readonly DuplicateCandidateRow[]): EarlyDuplicateDecision {
  // L1: a retried upload.
  const sameEntry = existing.find((row) => same(probe.clientEntryId, row.clientEntryId));
  if (sameEntry) return { kind: 'SAME_ENTRY', entryId: sameEntry.id };

  // L2: a second frame of the same placement. The same bytes are never read again.
  const samePlacement = existing.find((row) => same(probe.placementId, row.placementId));
  if (samePlacement) {
    if (same(probe.imageSha256, samePlacement.imageSha256)) return { kind: 'SAME_IMAGE', entryId: samePlacement.id };
    const retry = samePlacement.attempts < MAX_PLACEMENT_ATTEMPTS && readingWasUnusable(samePlacement);
    return { kind: 'SAME_PLACEMENT', entryId: samePlacement.id, retry };
  }

  // L3: the same image bytes uploaded twice.
  const sameImage = existing.find((row) => same(probe.imageSha256, row.imageSha256));
  if (sameImage) return { kind: 'SAME_IMAGE', entryId: sameImage.id };

  return { kind: 'NONE' };
}

/** What the identity key is computed from: the chosen printing when there is one, otherwise the typed reading. */
export interface IdentityInput {
  game: string;
  printingId?: string | null;
  cardName?: string | null;
  setCode?: string | null;
  collectorNumber?: string | null;
}

/**
 * The identity of a card as seen at scan time: game plus printing (or set, number and name). Language, finish and
 * condition are left out on purpose (they are decided later, so two scans of one card compare equal). Returns null
 * when nothing identifies the card (no printing and no name), so an unreadable frame is never called a repeat.
 */
export function identityKeyFor(input: IdentityInput): string | null {
  const printingId = (input.printingId ?? '').trim();
  const name = (input.cardName ?? '').trim();
  if (printingId === '' && name === '') return null;
  return computeDedupKey({
    game: input.game,
    catalogPrintingId: printingId !== '' ? printingId : null,
    setCode: input.setCode ?? null,
    collectorNumber: input.collectorNumber ?? null,
    cardName: name !== '' ? name : null,
  });
}

/** Identity of a freshly resolved reading: the pre-selected printing when EXACT, else what was read. */
export function identityKeyForReading(
  game: string,
  read: { cardName?: string | null; setCode?: string | null; collectorNumber?: string | null },
  resolution: Pick<ObservationResolution, 'status' | 'printingId'>
): string | null {
  return identityKeyFor({
    game,
    printingId: resolution.status === 'EXACT' ? resolution.printingId : null,
    cardName: read.cardName,
    setCode: read.setCode,
    collectorNumber: read.collectorNumber,
  });
}

/** The entry received just before this one (highest seq), reduced to what layer 4 compares. */
export interface PreviousEntry {
  id: string;
  identityKey: string | null;
  createdAtMs: number;
}

export interface RepeatInput {
  source: ScanEntrySource;
  placementId: string | null;
  identityKey: string | null;
  nowMs: number;
  previous: PreviousEntry | null;
  windowMs: number;
}

export type RepeatDecision = { hold: false; suspectDuplicateOf: null } | { hold: true; suspectDuplicateOf: string };

/**
 * Layer 4. Applies only to camera and upload frames that carry no placementId (a frame with a placementId is already
 * covered by L2, a manual or Delver entry is a deliberate act). A repeat inside the window is held, never dropped.
 */
export function decideRepeatHold(input: RepeatInput): RepeatDecision {
  const none: RepeatDecision = { hold: false, suspectDuplicateOf: null };
  if (input.source !== 'PHOTO' && input.source !== 'UPLOAD') return none;
  if ((input.placementId ?? '') !== '') return none;
  if (!input.previous || input.identityKey === null || input.previous.identityKey === null) return none;
  if (input.previous.identityKey !== input.identityKey) return none;
  const elapsed = input.nowMs - input.previous.createdAtMs;
  if (!(elapsed >= 0 && elapsed < input.windowMs)) return none;
  return { hold: true, suspectDuplicateOf: input.previous.id };
}
