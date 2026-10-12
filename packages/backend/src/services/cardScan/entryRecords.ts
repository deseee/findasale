/**
 * Turns confirmed scan entries into the records the existing intake planner reads (ADR-138 sections 2.2 and 3.2),
 * builds the resolver that answers by the printing the organizer chose, and computes the manifest hash that
 * freezes a commit. Pure: no database, no I/O. The printings are loaded by the caller and passed in.
 *
 * Nothing here re-implements card validation or the dedupKey: records go through planRecords, which uses the single
 * card writer, so a scanned card merges with stock created by a spreadsheet import and the other way round.
 *
 * Contract for the session service: the card columns on a scan entry (cardName, setCode, setName, collectorNumber,
 * language, game) are the organizer's decisions and are what a TYPED entry commits with, so the service copies the
 * reading into those columns when it creates the entry (the organizer then edits them). When a printing is chosen
 * the printing's own details are used and those columns are not read.
 */
import { createHash } from 'crypto';
import { CARD_LANGUAGES, canonicalizeVocabValue } from '../../constants/cardVocabulary';
import type { CardFinish } from '../../constants/cardVocabulary';
import type { PrintingDto, ResolveRef, ResolveResult } from '../cardCatalog/cardCatalogLookup';
import type { StreamedRecord } from '../cardIntake/parseSpreadsheet';
import type { ColumnMapping, IntakeMode, SourceRecord } from '../cardIntake/types';
import { computeDedupKey } from '../cardRecordService';
import { availableFinishes, computeEffectiveValues, computeReadiness } from './readiness';
import type { EffectiveValues, ReadinessContext } from './readiness';
import type { ScanEntryRow, ScanNotCommitted, ScanSessionDefaults } from './types';

export const MANIFEST_VERSION_TAG = 'card-scan-v1';

/** Header names of the generic importer (importers/generic.ts GENERIC_ALIASES), one per card column. */
export const SCAN_HEADERS = {
  name: 'Name',
  setCode: 'Set code',
  setName: 'Set name',
  collectorNumber: 'Collector number',
  quantity: 'Quantity',
  finish: 'Finish',
  condition: 'Condition',
  language: 'Language',
  price: 'Price',
  game: 'Game',
  grader: 'Grader',
  grade: 'Grade',
  certNumber: 'Cert number',
} as const;

/** The column mapping to hand to the planner with the generic importer. */
export const SCAN_COLUMN_MAPPING: ColumnMapping = {
  name: SCAN_HEADERS.name,
  setCode: SCAN_HEADERS.setCode,
  setName: SCAN_HEADERS.setName,
  collectorNumber: SCAN_HEADERS.collectorNumber,
  quantity: SCAN_HEADERS.quantity,
  finish: SCAN_HEADERS.finish,
  condition: SCAN_HEADERS.condition,
  language: SCAN_HEADERS.language,
  price: SCAN_HEADERS.price,
  game: SCAN_HEADERS.game,
  grader: SCAN_HEADERS.grader,
  grade: SCAN_HEADERS.grade,
  certNumber: SCAN_HEADERS.certNumber,
};

/** The words the planner's finish parser reads (the vocabulary codes themselves are not all accepted, e.g. REVERSE_HOLO). */
const FINISH_CELL: Record<CardFinish, string> = {
  NONFOIL: 'nonfoil',
  FOIL: 'foil',
  ETCHED: 'etched',
  HOLO: 'holo',
  REVERSE_HOLO: 'reverse holo',
};

/** One entry that is ready to commit, with the printing it points at and the values a commit would use. */
export interface CommitEntry {
  entry: ScanEntryRow;
  printing: PrintingDto | null;
  effective: EffectiveValues;
}

export interface CommitSelection {
  /** In seq order. */
  ready: CommitEntry[];
  notCommitted: ScanNotCommitted[];
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Picks the entries a commit may write. Readiness is recomputed from the fields (the stored status is not trusted),
 * so a stale status can never commit an incomplete card. Skipped and already committed entries are left out silently;
 * a held suspected repeat, an entry that still needs a decision, and an entry whose printing cannot be found are
 * reported in notCommitted. Entries already marked COMMITTING are eligible, so an interrupted commit can be resumed.
 */
export function selectReadyEntries(
  entries: readonly ScanEntryRow[],
  defaults: ScanSessionDefaults,
  printingsById: ReadonlyMap<string, PrintingDto>
): CommitSelection {
  const ordered = [...entries].sort((a, b) => a.seq - b.seq);
  const ready: CommitEntry[] = [];
  const notCommitted: ScanNotCommitted[] = [];
  for (const entry of ordered) {
    if (entry.status === 'SKIPPED' || entry.status === 'COMMITTED') continue;
    const printing = clean(entry.printingId) !== '' ? printingsById.get(clean(entry.printingId)) ?? null : null;
    const ctx: ReadinessContext = { defaults, printing: printing ? { finishes: printing.finishes } : null };
    const readiness = computeReadiness({ ...entry, status: 'NEEDS_REVIEW' }, ctx);
    if (readiness.status === 'READY') {
      ready.push({ entry, printing, effective: readiness.effective });
      continue;
    }
    if (readiness.held) notCommitted.push({ entryId: entry.id, reason: 'SUSPECT_REPEAT' });
    else if (readiness.problems.includes('PRINTING_NOT_FOUND')) notCommitted.push({ entryId: entry.id, reason: 'PRINTING_NOT_FOUND' });
    else if (readiness.needs.length > 0) notCommitted.push({ entryId: entry.id, reason: readiness.needs[0] });
    else notCommitted.push({ entryId: entry.id, reason: 'INVALID_DETAILS' });
  }
  return { ready, notCommitted };
}

/** One entry as a spreadsheet record in the generic importer's header names. */
export function entryToSourceRecord(item: CommitEntry): SourceRecord {
  const { entry, printing, effective } = item;
  return {
    [SCAN_HEADERS.name]: printing ? printing.name : clean(entry.cardName),
    [SCAN_HEADERS.setCode]: printing ? printing.setCode : clean(entry.setCode),
    [SCAN_HEADERS.setName]: printing ? clean(printing.setName) : clean(entry.setName),
    [SCAN_HEADERS.collectorNumber]: printing ? clean(printing.collectorNumber) : clean(entry.collectorNumber),
    [SCAN_HEADERS.quantity]: String(entry.quantity),
    [SCAN_HEADERS.finish]: effective.finish ? FINISH_CELL[effective.finish] : '',
    [SCAN_HEADERS.condition]: effective.conditionCode ?? '',
    [SCAN_HEADERS.language]: clean(entry.language),
    [SCAN_HEADERS.price]: entry.price !== null && Number.isFinite(entry.price) ? entry.price.toFixed(2) : '',
    [SCAN_HEADERS.game]: printing ? printing.game : clean(entry.game),
    [SCAN_HEADERS.grader]: effective.grader ?? '',
    [SCAN_HEADERS.grade]: effective.grade ?? '',
    [SCAN_HEADERS.certNumber]: effective.certNumber ?? '',
  };
}

/** The planner's records for a selection. The planner row number is the entry's seq. */
export function buildStreamedRecords(items: readonly CommitEntry[]): StreamedRecord[] {
  return [...items]
    .sort((a, b) => a.entry.seq - b.entry.seq)
    .map((item) => ({ row: item.entry.seq, record: entryToSourceRecord(item), tooLong: false }));
}

/** An async source over records already in memory, for planRecords. */
export async function* iterateRecords(records: readonly StreamedRecord[]): AsyncGenerator<StreamedRecord> {
  for (const record of records) yield record;
}

/**
 * The resolver to hand to the planner (PlanDeps.resolve): a row whose entry has a chosen printing resolves to exactly
 * that printing, every other row is UNMATCHED. The planner therefore never guesses a printing again and never returns
 * a review state for a scanned card.
 */
export function buildPrintingResolver(items: readonly CommitEntry[]): (refs: ResolveRef[]) => Promise<ResolveResult[]> {
  const bySeq = new Map<string, PrintingDto>();
  for (const item of items) {
    if (item.printing) bySeq.set(String(item.entry.seq), item.printing);
  }
  return async (refs: ResolveRef[]): Promise<ResolveResult[]> =>
    refs.map((r): ResolveResult => {
      const printing = bySeq.get(r.ref);
      return printing
        ? { ref: r.ref, status: 'EXACT', candidates: [printing], truncated: false }
        : { ref: r.ref, status: 'UNMATCHED', candidates: [], truncated: false };
    });
}

/** The typed identity used in the manifest when no printing is chosen. */
export function typedKey(entry: Pick<ScanEntryRow, 'game' | 'setCode' | 'collectorNumber' | 'cardName'>): string {
  const parts = [entry.game, entry.setCode, entry.collectorNumber, entry.cardName].map((p) => clean(p).toLowerCase());
  return `t:${parts.join('|')}`;
}

function manifestLine(item: CommitEntry): string {
  const { entry, effective } = item;
  const identity = clean(entry.printingId) !== '' ? clean(entry.printingId) : typedKey(entry);
  const conditionOrGrader = effective.graded
    ? `G:${effective.grader ?? ''}:${effective.grade ?? ''}:${effective.certNumber ?? ''}`
    : effective.conditionCode ?? '';
  const price = entry.price !== null && Number.isFinite(entry.price) ? entry.price.toFixed(2) : '';
  return [entry.id, String(entry.seq), identity, effective.finish ?? '', conditionOrGrader, String(entry.quantity), price].join('|');
}

/**
 * sha256 of 'card-scan-v1\n' + sessionId + '\n' + mode + '\n' followed by one line per entry in seq order, each line
 * ending in '\n': id|seq|printingId-or-typed-key|finish|condition-or-grader|quantity|price. The result is lower case hex.
 * The same selection always gives the same hash (it keys the intake ledger, so a retried commit resumes instead of
 * writing twice); any change to what would be written gives a different one.
 */
export function computeManifestHash(sessionId: string, mode: IntakeMode, items: readonly CommitEntry[]): string {
  const lines = [...items].sort((a, b) => a.entry.seq - b.entry.seq).map((item) => `${manifestLine(item)}\n`);
  const text = `${MANIFEST_VERSION_TAG}\n${sessionId}\n${mode}\n${lines.join('')}`;
  return createHash('sha256').update(text).digest('hex');
}

/**
 * The key the queue groups identical cards by: the dedupKey the commit would compute for this entry (same function the
 * spreadsheet path uses), or null when the entry cannot be identified yet. Language and finish follow the planner: the
 * row's own value, else the printing's language, and the printing's finish when it comes in exactly one.
 */
export function scanGroupKey(
  entry: ScanEntryRow,
  printing: PrintingDto | null,
  defaults: ScanSessionDefaults
): string | null {
  const ctx: ReadinessContext = { defaults, printing: printing ? { finishes: printing.finishes } : null };
  const effective = computeEffectiveValues(entry, ctx);
  if (!printing && clean(entry.cardName) === '') return null;
  const language =
    canonicalizeVocabValue(CARD_LANGUAGES, entry.language) ??
    (printing ? canonicalizeVocabValue(CARD_LANGUAGES, printing.language) : undefined) ??
    null;
  let finish: string | null = effective.finish;
  if (finish === null && printing) {
    const available = availableFinishes(printing.finishes);
    if (available.size === 1) finish = Array.from(available)[0];
  }
  return computeDedupKey({
    game: printing ? printing.game : clean(entry.game),
    catalogPrintingId: printing ? printing.id : null,
    setCode: printing ? null : clean(entry.setCode) || null,
    collectorNumber: printing ? null : clean(entry.collectorNumber) || null,
    cardName: printing ? null : clean(entry.cardName),
    language,
    finish,
    conditionCode: effective.graded ? null : effective.conditionCode,
    grader: effective.grader,
    grade: effective.grade,
    certNumber: effective.certNumber,
  });
}
