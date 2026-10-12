/**
 * Card scan session service (ADR-138 sections 2.1, 3.5, 3.6, 8, 9 and 11, batch B3).
 *
 * Everything that reads or writes CardScanSession and CardScanEntry lives here: create, list, get, patch, bulk,
 * discard, the lazy purge, the atomic sequence number, and the intake of one frame (or one observation) with the
 * early duplicate layers L1 to L3 and the repeat hold L4. The commit to inventory is in commitBridge.ts.
 *
 * Rules that hold for every function:
 *  - Each takes the caller's organizerId and loads rows with it in the where clause, so another organizer's id is
 *    "not found", never a read or a write. No id from a client body is trusted as an owner.
 *  - The database is an injected narrow interface (ScanDb), so unit tests pass an in-memory fake. This module
 *    imports no recognizer, no HTTP client and no paid service: the recognizer arrives as a function parameter.
 *  - Readiness is recomputed from the fields on every write; a suggestion from a photo is never copied into an
 *    organizer decision (condition, finish, grading) by this module.
 *  - Candidates are recomputed from the local catalog on read and are never stored.
 */
import {
  CARD_CONDITION_CODES,
  CARD_FINISHES,
  CARD_GAMES,
  CARD_GRADERS,
  CARD_GRADES,
  CARD_LANGUAGES,
  canonicalizeVocabValue,
} from '../../constants/cardVocabulary';
import type { CardGame } from '../../constants/cardVocabulary';
import {
  DISABLED_STATE,
  decimalToNumber,
  loadCatalogState,
  loadPrintingsByIds,
  resolveRefs,
} from '../cardCatalog/cardCatalogLookup';
import type { CatalogState, PrintingDto, ResolveRef, ResolveResult } from '../cardCatalog/cardCatalogLookup';
import type { CommitDb } from '../cardIntake/commit';
import { MAX_QUANTITY } from '../cardIntake/config';
import {
  CLOSED_SESSION_RETENTION_DAYS,
  MAX_BULK_IDS,
  MAX_OPEN_SESSIONS_PER_SALE,
  MAX_PAGE_ENTRIES,
  OPEN_SESSION_IDLE_DAYS,
  SESSION_LABEL_MAX_CHARS,
  getScanConfig,
} from './config';
import type { EnvLike, ScanConfig } from './config';
import { decideEarlyDuplicate, decideRepeatHold, identityKeyFor, identityKeyForReading } from './duplicateRules';
import type { PreviousEntry } from './duplicateRules';
import { scanGroupKey } from './entryRecords';
import { SCAN_API_MESSAGES, SCAN_STATUS_MESSAGES } from './messages';
import { availableFinishes, computeReadiness } from './readiness';
import type { ReadinessEntry } from './readiness';
import { resolveObservation, resolveObservations, toCandidateDto } from './resolveObservation';
import {
  RESOLUTION_NOTES,
  SCAN_ENTRY_SOURCES,
  SCAN_ENTRY_STATUSES,
  SCAN_SESSION_SOURCES,
  SCAN_SESSION_STATUSES,
} from './types';
import type {
  CardObservation,
  DuplicateKind,
  ObservationResolution,
  ResolutionAgreement,
  ResolutionNote,
  ScanEntryDto,
  ScanEntryRow,
  ScanEntrySource,
  ScanEntryStatus,
  ScanSessionDefaults,
  ScanSessionSource,
  ScanSessionStatus,
} from './types';

// ---------------------------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------------------------

/**
 * The slice of the Prisma client this module uses. Arguments are loose on purpose (the same style as CommitDb and
 * LedgerDb): the real client satisfies it, and a test passes an in-memory fake. It extends CommitDb because the
 * commit bridge hands the same object to the existing intake commit.
 */
export interface ScanDb extends CommitDb {
  sale: { findUnique(args: any): Promise<any> };
  cardScanSession: {
    findFirst(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
    count(args: any): Promise<number>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
    deleteMany(args: any): Promise<{ count: number }>;
  };
  cardScanEntry: {
    findFirst(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
    count(args: any): Promise<number>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
    deleteMany(args: any): Promise<{ count: number }>;
  };
}

export interface ScanDeps {
  db: ScanDb;
  /** The catalog lookup (resolveRefs). */
  resolve(refs: ResolveRef[]): Promise<ResolveResult[]>;
  getCatalogState(): Promise<CatalogState>;
  /** Printings by catalog id (loadPrintingsByIds). Unknown ids are simply absent. */
  loadPrintings(ids: string[]): Promise<PrintingDto[]>;
  /** Database size in bytes, or null when it cannot be measured (the space guard is then skipped). */
  getDbSizeBytes(): Promise<number | null>;
  env: EnvLike;
  /** Clock, injectable for tests. */
  now?: () => Date;
}

export function nowOf(deps: ScanDeps): Date {
  return deps.now ? deps.now() : new Date();
}

function getScanDb(): ScanDb {
  // Lazy: requiring lib/prisma at import time would construct a client in every test and script.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../../lib/prisma') as { prisma: unknown };
  return mod.prisma as unknown as ScanDb;
}

async function defaultDbSizeBytes(): Promise<number | null> {
  try {
    const rows = (await (getScanDb() as any).$queryRawUnsafe('SELECT pg_database_size(current_database())::float8 AS bytes')) as Array<{ bytes: unknown }>;
    const n = Number(rows?.[0]?.bytes);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** The dependencies bound to the shared Prisma client, the card catalog and process.env. Built when called. */
export function getDefaultScanDeps(): ScanDeps {
  return {
    get db(): ScanDb {
      return getScanDb();
    },
    resolve: (refs: ResolveRef[]) => resolveRefs(refs),
    getCatalogState: () => loadCatalogState(),
    loadPrintings: (ids: string[]) => loadPrintingsByIds(ids),
    getDbSizeBytes: defaultDbSizeBytes,
    get env(): EnvLike {
      return process.env;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

/** Same shape as the intake's ApiFailure, so the controller can send it the same way. */
export interface ScanFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
}

export type ScanResult<T> = { ok: true; data: T } | ScanFailure;

type ApiMessageKey = keyof typeof SCAN_API_MESSAGES;

export function apiFail(status: number, code: ApiMessageKey, extra?: Record<string, unknown>): ScanFailure {
  return { ok: false, status, code, message: SCAN_API_MESSAGES[code], extra };
}

function statusFail(status: number, code: string, message: string): ScanFailure {
  return { ok: false, status, code, message };
}

export function isScanFailure(value: unknown): value is ScanFailure {
  return !!value && typeof value === 'object' && (value as { ok?: unknown }).ok === false && typeof (value as { code?: unknown }).code === 'string';
}

function good<T>(data: T): ScanResult<T> {
  return { ok: true, data };
}

/** The failure codes of the recognizer that stop a frame before any entry exists. */
const QUOTA_API_CODE = 'AI_QUOTA_EXCEEDED';

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

export interface ScanSessionRow {
  id: string;
  organizerId: string;
  saleId: string;
  source: ScanSessionSource;
  label: string | null;
  status: ScanSessionStatus;
  defaultGame: string;
  defaultConditionCode: string | null;
  defaultFinish: string | null;
  nextSeq: number;
  commitMode: string | null;
  commitManifestSha256: string | null;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function int(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

function when(v: unknown): Date {
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function toSessionRow(raw: any): ScanSessionRow {
  return {
    id: String(raw.id),
    organizerId: String(raw.organizerId),
    saleId: String(raw.saleId),
    source: oneOf(SCAN_SESSION_SOURCES, raw.source, 'PHOTO'),
    label: str(raw.label),
    status: oneOf(SCAN_SESSION_STATUSES, raw.status, 'OPEN'),
    defaultGame: str(raw.defaultGame) ?? 'MTG',
    defaultConditionCode: str(raw.defaultConditionCode),
    defaultFinish: str(raw.defaultFinish),
    nextSeq: int(raw.nextSeq, 0),
    commitMode: str(raw.commitMode),
    commitManifestSha256: str(raw.commitManifestSha256),
    lastActivityAt: when(raw.lastActivityAt),
    createdAt: when(raw.createdAt),
    updatedAt: when(raw.updatedAt),
  };
}

export function toEntryRow(raw: any): ScanEntryRow {
  return {
    id: String(raw.id),
    sessionId: String(raw.sessionId),
    organizerId: String(raw.organizerId),
    seq: int(raw.seq, 0),
    source: oneOf(SCAN_ENTRY_SOURCES, raw.source, 'PHOTO'),
    clientEntryId: str(raw.clientEntryId),
    placementId: str(raw.placementId),
    imageSha256: str(raw.imageSha256),
    providerId: str(raw.providerId),
    attempts: int(raw.attempts, 1),
    readGame: str(raw.readGame),
    readName: str(raw.readName),
    readSetCode: str(raw.readSetCode),
    readSetName: str(raw.readSetName),
    readCollectorNumber: str(raw.readCollectorNumber),
    readLanguage: str(raw.readLanguage),
    readFinish: str(raw.readFinish),
    readScryfallId: str(raw.readScryfallId),
    readConfidence: typeof raw.readConfidence === 'number' && Number.isFinite(raw.readConfidence) ? raw.readConfidence : null,
    readQuantity: typeof raw.readQuantity === 'number' && Number.isFinite(raw.readQuantity) ? Math.trunc(raw.readQuantity) : null,
    suggestedConditionCode: str(raw.suggestedConditionCode),
    suggestedGrader: str(raw.suggestedGrader),
    suggestedGrade: str(raw.suggestedGrade),
    suggestedCertNumber: str(raw.suggestedCertNumber),
    suggestionSource: str(raw.suggestionSource),
    resolution: raw.resolution === 'EXACT' || raw.resolution === 'AMBIGUOUS' ? raw.resolution : 'UNMATCHED',
    resolutionNote: str(raw.resolutionNote),
    game: str(raw.game) ?? 'MTG',
    printingId: str(raw.printingId),
    acceptAsTyped: raw.acceptAsTyped === true,
    cardName: str(raw.cardName),
    setCode: str(raw.setCode),
    setName: str(raw.setName),
    collectorNumber: str(raw.collectorNumber),
    language: str(raw.language),
    finish: str(raw.finish),
    conditionCode: str(raw.conditionCode),
    grader: str(raw.grader),
    grade: str(raw.grade),
    certNumber: str(raw.certNumber),
    quantity: int(raw.quantity, 1),
    price: decimalToNumber(raw.price),
    status: oneOf(SCAN_ENTRY_STATUSES, raw.status, 'NEEDS_REVIEW'),
    errorCode: str(raw.errorCode),
    suspectDuplicateOf: str(raw.suspectDuplicateOf),
    committedBatchId: str(raw.committedBatchId),
    createdAt: when(raw.createdAt),
    updatedAt: when(raw.updatedAt),
  };
}

export function sessionDefaults(session: Pick<ScanSessionRow, 'defaultConditionCode' | 'defaultFinish'>): ScanSessionDefaults {
  return { defaultConditionCode: session.defaultConditionCode, defaultFinish: session.defaultFinish };
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002';
}

/** Loads a session owned by the caller, or null (another organizer's id looks exactly like a missing one). */
export async function loadSession(deps: ScanDeps, organizerId: string, sessionId: string): Promise<ScanSessionRow | null> {
  if (typeof organizerId !== 'string' || organizerId === '') return null;
  if (typeof sessionId !== 'string' || sessionId === '' || sessionId.length > 64) return null;
  const raw = await deps.db.cardScanSession.findFirst({ where: { id: sessionId, organizerId } });
  return raw ? toSessionRow(raw) : null;
}

export async function loadEntry(deps: ScanDeps, session: ScanSessionRow, entryId: string): Promise<ScanEntryRow | null> {
  if (typeof entryId !== 'string' || entryId === '' || entryId.length > 64) return null;
  const raw = await deps.db.cardScanEntry.findFirst({ where: { id: entryId, sessionId: session.id, organizerId: session.organizerId } });
  return raw ? toEntryRow(raw) : null;
}

export async function safeCatalogState(deps: ScanDeps): Promise<CatalogState> {
  try {
    return await deps.getCatalogState();
  } catch {
    // The catalog is optional: if its tables are missing or unreadable, scanning still works with typed details.
    return DISABLED_STATE;
  }
}

export async function loadPrintingMap(deps: ScanDeps, ids: ReadonlyArray<string | null | undefined>): Promise<Map<string, PrintingDto>> {
  const wanted = Array.from(new Set(ids.map((id) => clean(id)).filter((id) => id !== '')));
  const out = new Map<string, PrintingDto>();
  if (wanted.length === 0) return out;
  for (const p of await deps.loadPrintings(wanted)) out.set(p.id, p);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Session DTO and counts
// ---------------------------------------------------------------------------------------------

export interface ScanSessionDto {
  id: string;
  saleId: string;
  source: ScanSessionSource;
  label: string | null;
  status: ScanSessionStatus;
  defaultGame: string;
  defaultConditionCode: string | null;
  defaultFinish: string | null;
  commitMode: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export function toSessionDto(row: ScanSessionRow): ScanSessionDto {
  return {
    id: row.id,
    saleId: row.saleId,
    source: row.source,
    label: row.label,
    status: row.status,
    defaultGame: row.defaultGame,
    defaultConditionCode: row.defaultConditionCode,
    defaultFinish: row.defaultFinish,
    commitMode: row.commitMode,
    lastActivityAt: row.lastActivityAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface ScanCounts {
  needsReview: number;
  ready: number;
  skipped: number;
  committing: number;
  committed: number;
  error: number;
}

function emptyCounts(): ScanCounts {
  return { needsReview: 0, ready: 0, skipped: 0, committing: 0, committed: 0, error: 0 };
}

function tally(counts: ScanCounts, status: ScanEntryStatus): void {
  if (status === 'NEEDS_REVIEW') counts.needsReview += 1;
  else if (status === 'READY') counts.ready += 1;
  else if (status === 'SKIPPED') counts.skipped += 1;
  else if (status === 'COMMITTING') counts.committing += 1;
  else if (status === 'COMMITTED') counts.committed += 1;
  else counts.error += 1;
}

export async function countEntries(deps: ScanDeps, organizerId: string, sessionId: string): Promise<ScanCounts> {
  const statuses = SCAN_ENTRY_STATUSES;
  const values = await Promise.all(
    statuses.map((status) => deps.db.cardScanEntry.count({ where: { sessionId, organizerId, status } }))
  );
  const counts = emptyCounts();
  statuses.forEach((status, i) => {
    for (let k = 0; k < values[i]; k += 1) tally(counts, status);
  });
  return counts;
}

// ---------------------------------------------------------------------------------------------
// Entry DTO (what the queue renders)
// ---------------------------------------------------------------------------------------------

function observationFromRow(row: ScanEntryRow): CardObservation | null {
  const name = clean(row.readName);
  const setCode = clean(row.readSetCode);
  const number = clean(row.readCollectorNumber);
  const scryfallId = clean(row.readScryfallId);
  if (name === '' && scryfallId === '' && !(setCode !== '' && number !== '')) return null;
  const game: CardGame = canonicalizeVocabValue(CARD_GAMES, row.readGame) ?? canonicalizeVocabValue(CARD_GAMES, row.game) ?? 'OTHER';
  const obs: CardObservation = { providerId: 'haiku-card', game };
  if (name !== '') obs.cardName = name;
  if (setCode !== '') obs.setCode = setCode;
  if (number !== '') obs.collectorNumber = number;
  if (scryfallId !== '') obs.scryfallId = scryfallId;
  const language = canonicalizeVocabValue(CARD_LANGUAGES, row.readLanguage);
  if (language) obs.language = language;
  return obs;
}

function isResolutionNote(value: string | null): value is ResolutionNote {
  return value !== null && (RESOLUTION_NOTES as readonly string[]).includes(value);
}

/** What was stored when the entry was created, used when the catalog is not asked again. */
function storedResolution(row: ScanEntryRow, printing: PrintingDto | null): ObservationResolution {
  const status = row.resolution;
  const agreement: ResolutionAgreement = status === 'EXACT' ? (row.resolutionNote === 'NAME_ONLY' ? 'PARTIAL' : 'FULL') : 'NONE';
  return {
    status,
    printingId: status === 'EXACT' && clean(row.printingId) !== '' ? clean(row.printingId) : null,
    candidates: printing ? [toCandidateDto(printing)] : [],
    truncated: false,
    agreement,
    note: isResolutionNote(row.resolutionNote) ? row.resolutionNote : null,
  };
}

/** The chosen printing is always among the candidates, so the queue can show its picture beside the photo. */
function withChosen(resolution: ObservationResolution, printing: PrintingDto | null): ObservationResolution {
  if (!printing) return resolution;
  if (resolution.candidates.some((c) => c.printingId === printing.id)) return resolution;
  const candidates = [toCandidateDto(printing), ...resolution.candidates];
  return { ...resolution, candidates: candidates.slice(0, 5), truncated: resolution.truncated || candidates.length > 5 };
}

function entryDto(row: ScanEntryRow, defaults: ScanSessionDefaults, printing: PrintingDto | null, fresh: ObservationResolution | null): ScanEntryDto {
  const readiness = computeReadiness(row, { defaults, printing: printing ? { finishes: printing.finishes } : null });
  const status: ScanEntryStatus = row.status === 'ERROR' ? 'ERROR' : readiness.status;
  const hasRead = [row.readGame, row.readName, row.readSetCode, row.readSetName, row.readCollectorNumber, row.readLanguage, row.readFinish].some(
    (v) => clean(v) !== ''
  );
  const hasSuggestion = [row.suggestedConditionCode, row.suggestedGrader, row.suggestedGrade, row.suggestedCertNumber].some((v) => clean(v) !== '');
  const resolution = withChosen(fresh ?? storedResolution(row, printing), printing);
  return {
    id: row.id,
    seq: row.seq,
    source: row.source,
    status,
    needs: readiness.needs,
    read: hasRead
      ? {
          game: row.readGame,
          name: row.readName,
          setCode: row.readSetCode,
          setName: row.readSetName,
          collectorNumber: row.readCollectorNumber,
          language: row.readLanguage,
          finish: row.readFinish,
          confidence: row.readConfidence,
        }
      : null,
    suggested: hasSuggestion
      ? {
          conditionCode: row.suggestedConditionCode,
          grader: row.suggestedGrader,
          grade: row.suggestedGrade,
          certNumber: row.suggestedCertNumber,
          source: row.suggestionSource,
        }
      : null,
    resolution: {
      status: resolution.status,
      note: resolution.note,
      agreement: resolution.agreement,
      printingId: resolution.printingId,
      candidates: resolution.candidates,
      truncated: resolution.truncated,
    },
    chosen: {
      game: row.game,
      printingId: row.printingId,
      acceptAsTyped: row.acceptAsTyped,
      cardName: row.cardName,
      setCode: row.setCode,
      setName: row.setName,
      collectorNumber: row.collectorNumber,
      language: row.language,
      finish: row.finish,
      conditionCode: row.conditionCode,
      grader: row.grader,
      grade: row.grade,
      certNumber: row.certNumber,
      quantity: row.quantity,
      price: row.price,
    },
    groupKey: scanGroupKey(row, printing, defaults),
    suspectDuplicateOf: row.suspectDuplicateOf,
    errorCode: row.errorCode,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The queue view of entries. Candidates are looked up again only for entries that still need a pick (no printing
 * chosen and not accepted as typed) or whose reading had several matches, so a poll over a mostly decided queue
 * costs one printing load and no name searches.
 */
export async function buildEntryDtos(deps: ScanDeps, session: ScanSessionRow, rows: readonly ScanEntryRow[]): Promise<ScanEntryDto[]> {
  const defaults = sessionDefaults(session);
  const printings = await loadPrintingMap(deps, rows.map((r) => r.printingId));
  const lookupRows: number[] = [];
  const observations: CardObservation[] = [];
  rows.forEach((row, index) => {
    if (row.status === 'SKIPPED' || row.status === 'COMMITTING' || row.status === 'COMMITTED') return;
    const undecided = clean(row.printingId) === '' && !row.acceptAsTyped;
    if (!undecided && row.resolution !== 'AMBIGUOUS') return;
    const obs = observationFromRow(row);
    if (!obs) return;
    lookupRows.push(index);
    observations.push(obs);
  });
  const fresh = new Map<number, ObservationResolution>();
  if (observations.length > 0) {
    const catalog = await safeCatalogState(deps);
    try {
      const resolved = await resolveObservations(observations, { catalog, resolve: deps.resolve });
      lookupRows.forEach((rowIndex, k) => fresh.set(rowIndex, resolved[k]));
    } catch {
      // The stored reading is shown when the catalog cannot be asked.
    }
  }
  return rows.map((row, index) => entryDto(row, defaults, printings.get(clean(row.printingId)) ?? null, fresh.get(index) ?? null));
}

export async function buildEntryDto(deps: ScanDeps, session: ScanSessionRow, row: ScanEntryRow): Promise<ScanEntryDto> {
  const [dto] = await buildEntryDtos(deps, session, [row]);
  return dto;
}

// ---------------------------------------------------------------------------------------------
// Field parsing (shared by manual add, patch and bulk)
// ---------------------------------------------------------------------------------------------

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const MAX_PRICE = 99999999.99;
const MAX_ID_CHARS = 100;

type Parsed<T> = { ok: true; value: T } | { ok: false };

function parseText(raw: unknown, max: number): Parsed<string | null> {
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const text = raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > max) return { ok: false };
  return { ok: true, value: text === '' ? null : text };
}

function parseVocab<T extends string>(list: readonly T[], raw: unknown): Parsed<T | null> {
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  if (raw.trim() === '') return { ok: true, value: null };
  const canonical = canonicalizeVocabValue(list, raw);
  return canonical ? { ok: true, value: canonical } : { ok: false };
}

/** The organizer's card decisions, only the keys that were present. */
export type ParsedFields = Record<string, string | number | null>;

/** The card fields a manual add or a patch may carry (the same whitelist for both). */
export interface EntryFieldInput {
  game?: string | null;
  cardName?: string | null;
  setCode?: string | null;
  setName?: string | null;
  collectorNumber?: string | null;
  language?: string | null;
  finish?: string | null;
  conditionCode?: string | null;
  grader?: string | null;
  grade?: string | null;
  certNumber?: string | null;
  quantity?: number;
  price?: number | null;
}

/**
 * Validates the card fields. An absent key (undefined) is left alone; null or blank text clears a field that may be
 * empty; anything outside the vocabulary or the length limits makes the whole input invalid (returns null). The
 * game and the quantity can be changed but never cleared.
 */
export function parseEntryFields(input: EntryFieldInput): ParsedFields | null {
  const raw = input as Record<string, unknown>;
  const out: ParsedFields = {};
  if (raw.game !== undefined) {
    const game = canonicalizeVocabValue(CARD_GAMES, raw.game);
    if (!game) return null;
    out.game = game;
  }
  const texts: Array<[string, number]> = [
    ['cardName', 200],
    ['setCode', 20],
    ['setName', 120],
    ['collectorNumber', 20],
    ['certNumber', 30],
  ];
  for (const [key, max] of texts) {
    if (raw[key] === undefined) continue;
    const parsed = parseText(raw[key], max);
    if (!parsed.ok) return null;
    out[key] = parsed.value;
  }
  const vocabs: Array<[string, readonly string[]]> = [
    ['language', CARD_LANGUAGES],
    ['finish', CARD_FINISHES],
    ['conditionCode', CARD_CONDITION_CODES],
    ['grader', CARD_GRADERS],
    ['grade', CARD_GRADES],
  ];
  for (const [key, list] of vocabs) {
    if (raw[key] === undefined) continue;
    const parsed = parseVocab(list, raw[key]);
    if (!parsed.ok) return null;
    out[key] = parsed.value;
  }
  if (raw.quantity !== undefined) {
    const q = raw.quantity;
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > MAX_QUANTITY) return null;
    out.quantity = q;
  }
  if (raw.price !== undefined) {
    const p = raw.price;
    if (p === null) out.price = null;
    else if (typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= MAX_PRICE) out.price = Math.round(p * 100) / 100;
    else return null;
  }
  return out;
}

function parseId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  return text.length >= 1 && text.length <= MAX_ID_CHARS ? text : null;
}

function cut(value: string | null | undefined, max: number): string | null {
  const text = clean(value).replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text.slice(0, max);
}

// ---------------------------------------------------------------------------------------------
// Sessions: create, list, get, discard, purge
// ---------------------------------------------------------------------------------------------

export interface CreateSessionInput {
  organizerId: string;
  saleId: string;
  label?: string | null;
  source?: string | null;
  defaultGame?: string | null;
  defaultConditionCode?: string | null;
  defaultFinish?: string | null;
}

/**
 * Deletes this organizer's stale sessions (their entries go with them through the foreign key): an OPEN session idle
 * for 30 days, a CLOSED or DISCARDED one older than 14 days. A session being committed is never touched. Best effort:
 * a failure here never blocks the caller.
 */
export async function purgeStaleSessions(deps: ScanDeps, scope: { organizerId: string }): Promise<number> {
  try {
    const nowMs = nowOf(deps).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const result = await deps.db.cardScanSession.deleteMany({
      where: {
        organizerId: scope.organizerId,
        OR: [
          { status: 'OPEN', lastActivityAt: { lt: new Date(nowMs - OPEN_SESSION_IDLE_DAYS * dayMs) } },
          { status: { in: ['CLOSED', 'DISCARDED'] }, lastActivityAt: { lt: new Date(nowMs - CLOSED_SESSION_RETENTION_DAYS * dayMs) } },
        ],
      },
    });
    return result.count;
  } catch {
    return 0;
  }
}

export async function createSession(deps: ScanDeps, input: CreateSessionInput): Promise<ScanResult<{ session: ScanSessionDto }>> {
  const saleId = typeof input.saleId === 'string' ? input.saleId.trim() : '';
  if (saleId === '' || saleId.length > 64) return apiFail(400, 'BAD_REQUEST');

  let label: string | null = null;
  if (input.label !== undefined && input.label !== null) {
    const parsed = parseText(input.label, SESSION_LABEL_MAX_CHARS);
    if (!parsed.ok) return apiFail(400, 'BAD_REQUEST');
    label = parsed.value;
  }
  const sourceText = input.source === undefined || input.source === null || input.source === '' ? 'PHOTO' : String(input.source).toUpperCase();
  if (!(SCAN_SESSION_SOURCES as readonly string[]).includes(sourceText)) return apiFail(400, 'BAD_REQUEST');
  const source = sourceText as ScanSessionSource;
  const game = input.defaultGame === undefined || input.defaultGame === null || input.defaultGame === '' ? 'MTG' : canonicalizeVocabValue(CARD_GAMES, input.defaultGame);
  if (!game) return apiFail(400, 'BAD_REQUEST');
  const condition = parseVocab(CARD_CONDITION_CODES, input.defaultConditionCode === undefined ? null : input.defaultConditionCode);
  const finish = parseVocab(CARD_FINISHES, input.defaultFinish === undefined ? null : input.defaultFinish);
  if (!condition.ok || !finish.ok) return apiFail(400, 'BAD_REQUEST');

  // The sale must exist and belong to the caller.
  const sale = await deps.db.sale.findUnique({ where: { id: saleId }, select: { id: true, organizerId: true } });
  if (!sale) return apiFail(404, 'SALE_NOT_FOUND');
  if (sale.organizerId !== input.organizerId) return apiFail(403, 'NOT_YOUR_SALE');

  await purgeStaleSessions(deps, { organizerId: input.organizerId });
  const open = await deps.db.cardScanSession.count({
    where: { organizerId: input.organizerId, saleId, status: { in: ['OPEN', 'COMMITTING'] } },
  });
  if (open >= MAX_OPEN_SESSIONS_PER_SALE) return apiFail(409, 'TOO_MANY_OPEN_SESSIONS');

  const now = nowOf(deps);
  const created = await deps.db.cardScanSession.create({
    data: {
      organizerId: input.organizerId,
      saleId,
      source,
      label,
      defaultGame: game,
      defaultConditionCode: condition.value,
      defaultFinish: finish.value,
      lastActivityAt: now,
    },
  });
  return good({ session: toSessionDto(toSessionRow(created)) });
}

export interface SessionListItem {
  id: string;
  saleId: string;
  label: string | null;
  source: ScanSessionSource;
  status: ScanSessionStatus;
  counts: ScanCounts;
  lastActivityAt: string;
}

export async function listSessions(
  deps: ScanDeps,
  input: { organizerId: string; saleId: string }
): Promise<ScanResult<{ sessions: SessionListItem[] }>> {
  const saleId = typeof input.saleId === 'string' ? input.saleId.trim() : '';
  if (saleId === '' || saleId.length > 64) return apiFail(400, 'BAD_REQUEST');
  const sale = await deps.db.sale.findUnique({ where: { id: saleId }, select: { id: true, organizerId: true } });
  if (!sale) return apiFail(404, 'SALE_NOT_FOUND');
  if (sale.organizerId !== input.organizerId) return apiFail(403, 'NOT_YOUR_SALE');

  const rows = (
    await deps.db.cardScanSession.findMany({
      where: { organizerId: input.organizerId, saleId, status: { in: ['OPEN', 'COMMITTING', 'CLOSED'] } },
      orderBy: { lastActivityAt: 'desc' },
      take: 50,
    })
  ).map(toSessionRow);
  const countsById = new Map<string, ScanCounts>(rows.map((r) => [r.id, emptyCounts()]));
  if (rows.length > 0) {
    const entries = await deps.db.cardScanEntry.findMany({
      where: { organizerId: input.organizerId, sessionId: { in: rows.map((r) => r.id) } },
      select: { sessionId: true, status: true },
    });
    for (const e of entries) {
      const counts = countsById.get(String(e.sessionId));
      if (counts) tally(counts, oneOf(SCAN_ENTRY_STATUSES, e.status, 'NEEDS_REVIEW'));
    }
  }
  return good({
    sessions: rows.map((r) => ({
      id: r.id,
      saleId: r.saleId,
      label: r.label,
      source: r.source,
      status: r.status,
      counts: countsById.get(r.id) ?? emptyCounts(),
      lastActivityAt: r.lastActivityAt.toISOString(),
    })),
  });
}

export interface GetSessionInput {
  organizerId: string;
  sessionId: string;
  afterSeq?: number;
  limit?: number;
}

export interface SessionView {
  session: ScanSessionDto;
  entries: ScanEntryDto[];
  counts: ScanCounts;
  catalogReady: boolean;
  delver: { lastActivityAt: string } | null;
}

/** The queue state the page polls. Entries come in seq order, after `afterSeq`, at most `limit` (default and cap 200). */
export async function getSession(deps: ScanDeps, input: GetSessionInput): Promise<ScanResult<SessionView>> {
  const session = await loadSession(deps, input.organizerId, input.sessionId);
  if (!session) return apiFail(404, 'SESSION_NOT_FOUND');
  const afterSeq = typeof input.afterSeq === 'number' && Number.isInteger(input.afterSeq) && input.afterSeq > 0 ? input.afterSeq : 0;
  const limitRaw = typeof input.limit === 'number' && Number.isInteger(input.limit) && input.limit > 0 ? input.limit : MAX_PAGE_ENTRIES;
  const limit = Math.min(limitRaw, MAX_PAGE_ENTRIES);
  const rows = (
    await deps.db.cardScanEntry.findMany({
      where: { sessionId: session.id, organizerId: session.organizerId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      take: limit,
    })
  ).map(toEntryRow);
  const [entries, counts, catalog] = await Promise.all([
    buildEntryDtos(deps, session, rows),
    countEntries(deps, session.organizerId, session.id),
    safeCatalogState(deps),
  ]);
  return good({
    session: toSessionDto(session),
    entries,
    counts,
    catalogReady: catalog.catalogReady,
    delver: session.source === 'DELVER' ? { lastActivityAt: session.lastActivityAt.toISOString() } : null,
  });
}

/** Throws away the queue. Entries are staging rows, so no Item is touched. A session being committed cannot be discarded. */
export async function discardSession(deps: ScanDeps, input: { organizerId: string; sessionId: string }): Promise<ScanResult<{ status: 'DISCARDED' }>> {
  const session = await loadSession(deps, input.organizerId, input.sessionId);
  if (!session) return apiFail(404, 'SESSION_NOT_FOUND');
  if (session.status === 'COMMITTING') return apiFail(409, 'SESSION_COMMITTING');
  if (session.status !== 'DISCARDED') {
    const res = await deps.db.cardScanSession.updateMany({
      where: { id: session.id, organizerId: session.organizerId, status: { in: ['OPEN', 'CLOSED'] } },
      data: { status: 'DISCARDED', lastActivityAt: nowOf(deps) },
    });
    if (res.count === 0) return apiFail(409, 'SESSION_COMMITTING');
  }
  return good<{ status: 'DISCARDED' }>({ status: 'DISCARDED' });
}

/** The gate for every write to an entry: only an OPEN session accepts changes. */
function writableGate(session: ScanSessionRow): ScanFailure | null {
  if (session.status === 'OPEN') return null;
  if (session.status === 'COMMITTING') return apiFail(409, 'SESSION_COMMITTING');
  return apiFail(409, 'SESSION_NOT_OPEN');
}

async function touchSession(deps: ScanDeps, session: ScanSessionRow): Promise<void> {
  try {
    await deps.db.cardScanSession.updateMany({ where: { id: session.id, organizerId: session.organizerId }, data: { lastActivityAt: nowOf(deps) } });
  } catch {
    // Activity time is informational.
  }
}

// ---------------------------------------------------------------------------------------------
// New entries: manual add, one recognized frame, one observation
// ---------------------------------------------------------------------------------------------

/** Why a frame produced no usable reading (the recognizer reports these; ADR-138 section 4). */
export type FrameFailureCode = 'NO_CARD' | 'UNREADABLE' | 'PROVIDER_ERROR' | 'RATE_LIMIT' | 'DISABLED' | 'CAP_REACHED' | 'QUOTA_EXCEEDED';

/** The failures that still leave an entry behind (a row the organizer can type, skip, or let a retry re-read). */
type EntryFailure = 'NO_CARD' | 'UNREADABLE' | 'PROVIDER_ERROR' | 'RATE_LIMIT';

/**
 * What the injected recognizer reports. `charged` is true when paid work was done (the controller owns the quota
 * reservation and the refund; this module only passes the flag back).
 */
export type FrameRecognition =
  | { ok: true; observation: CardObservation; charged: boolean }
  | { ok: false; code: FrameFailureCode; charged: boolean };

/**
 * The injected recognizer. It is called at most once per frame, and only after the early duplicate layers L1 to L3
 * found nothing, so a retried or repeated upload costs nothing. The controller's closure does the quota
 * reservation, the provider call and the refund.
 */
export type FrameRecognizer = () => Promise<FrameRecognition>;

interface ReadingColumns {
  readGame: string | null;
  readName: string | null;
  readSetCode: string | null;
  readSetName: string | null;
  readCollectorNumber: string | null;
  readLanguage: string | null;
  readFinish: string | null;
  readScryfallId: string | null;
  readConfidence: number | null;
  suggestedConditionCode: string | null;
  suggestedGrader: string | null;
  suggestedGrade: string | null;
  suggestedCertNumber: string | null;
  suggestionSource: string | null;
  resolution: ScanEntryRow['resolution'];
  resolutionNote: string | null;
  game: string;
  printingId: string | null;
  cardName: string | null;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  language: string | null;
}

/**
 * The reading copied into the columns. The read* columns keep what was seen and are never edited. The chosen card
 * columns (cardName, setCode, setName, collectorNumber, language, game) start as the reading so a typed commit has
 * them and the organizer edits from there. Finish and condition are NEVER copied: a suggestion stays in suggested*.
 */
function readingColumns(session: ScanSessionRow, obs: CardObservation | null, resolution: ObservationResolution): ReadingColumns {
  const language = canonicalizeVocabValue(CARD_LANGUAGES, obs?.language) ?? null;
  const suggestedCondition = canonicalizeVocabValue(CARD_CONDITION_CODES, obs?.suggestedConditionCode) ?? null;
  const suggestedGrader = canonicalizeVocabValue(CARD_GRADERS, obs?.grader) ?? null;
  const suggestedGrade = canonicalizeVocabValue(CARD_GRADES, obs?.grade) ?? null;
  const suggestedCert = cut(obs?.certNumber, 30);
  const hasSuggestion = suggestedCondition !== null || suggestedGrader !== null || suggestedGrade !== null || suggestedCert !== null;
  const rawConfidence = obs ? obs.confidence : undefined;
  const confidence = typeof rawConfidence === 'number' && Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : null;
  return {
    readGame: obs ? obs.game : null,
    readName: cut(obs?.cardName, 200),
    readSetCode: cut(obs?.setCode, 20),
    readSetName: cut(obs?.setName, 120),
    readCollectorNumber: cut(obs?.collectorNumber, 20),
    readLanguage: language,
    readFinish: canonicalizeVocabValue(CARD_FINISHES, obs?.finish) ?? null,
    readScryfallId: cut(obs?.scryfallId, 64),
    readConfidence: confidence,
    suggestedConditionCode: suggestedCondition,
    suggestedGrader,
    suggestedGrade,
    suggestedCertNumber: suggestedCert,
    suggestionSource: obs && hasSuggestion ? (obs.providerId === 'delver' ? 'DELVER' : 'HAIKU') : null,
    resolution: resolution.status,
    resolutionNote: resolution.note,
    game: obs ? canonicalizeVocabValue(CARD_GAMES, obs.game) ?? session.defaultGame : session.defaultGame,
    printingId: resolution.status === 'EXACT' ? resolution.printingId : null,
    cardName: cut(obs?.cardName, 200),
    setCode: cut(obs?.setCode, 20),
    setName: cut(obs?.setName, 120),
    collectorNumber: cut(obs?.collectorNumber, 20),
    language,
  };
}

function noResolution(note: ObservationResolution['note']): ObservationResolution {
  return { status: 'UNMATCHED', printingId: null, candidates: [], truncated: false, agreement: 'NONE', note };
}

async function resolveReading(deps: ScanDeps, obs: CardObservation | null): Promise<ObservationResolution> {
  if (!obs) return noResolution(null);
  const catalog = await safeCatalogState(deps);
  try {
    return await resolveObservation(obs, { catalog, resolve: deps.resolve });
  } catch {
    // A paid reading is kept even when the catalog cannot be asked: the organizer picks the card by hand.
    return noResolution('CATALOG_OFF');
  }
}

/** The finishes of the printing a new reading pre-selected, without another database read. */
function preselectedPrinting(resolution: ObservationResolution): { finishes: readonly string[] } | null {
  return resolution.status === 'EXACT' && resolution.candidates.length > 0 ? { finishes: resolution.candidates[0].finishes } : null;
}

/** Reserves the next sequence number. The increment is atomic in the database, so two frames never share one. */
async function takeSeq(deps: ScanDeps, session: ScanSessionRow): Promise<number> {
  const bumped = await deps.db.cardScanSession.update({
    where: { id: session.id, organizerId: session.organizerId },
    data: { nextSeq: { increment: 1 }, lastActivityAt: nowOf(deps) },
    select: { nextSeq: true },
  });
  const seq = int(bumped?.nextSeq, 0);
  if (seq < 1) throw new Error('Scan session sequence could not be reserved');
  return seq;
}

async function entryCount(deps: ScanDeps, session: ScanSessionRow): Promise<number> {
  return deps.db.cardScanEntry.count({ where: { sessionId: session.id, organizerId: session.organizerId } });
}

async function findEarlyCandidates(
  deps: ScanDeps,
  session: ScanSessionRow,
  probe: { clientEntryId: string | null; placementId: string | null; imageSha256: string | null }
): Promise<ScanEntryRow[]> {
  const or: Array<Record<string, unknown>> = [];
  if (probe.clientEntryId) or.push({ clientEntryId: probe.clientEntryId });
  if (probe.placementId) or.push({ placementId: probe.placementId });
  if (probe.imageSha256) or.push({ imageSha256: probe.imageSha256 });
  if (or.length === 0) return [];
  const raws = await deps.db.cardScanEntry.findMany({ where: { sessionId: session.id, organizerId: session.organizerId, OR: or } });
  return raws.map(toEntryRow);
}

interface NewEntrySpec {
  session: ScanSessionRow;
  cfg: ScanConfig;
  source: ScanEntrySource;
  clientEntryId: string | null;
  placementId: string | null;
  imageSha256: string | null;
  providerId: string | null;
  observation: CardObservation | null;
  failure: EntryFailure | null;
  quantity: number | null;
}

function clampQuantity(q: number | null): number {
  return typeof q === 'number' && Number.isInteger(q) && q >= 1 ? Math.min(q, MAX_QUANTITY) : 1;
}

/** Layer 4: a repeat of the previous entry's card inside the window, from a frame with no placement id. */
async function repeatOf(deps: ScanDeps, spec: NewEntrySpec, cols: ReadingColumns, resolution: ObservationResolution): Promise<string | null> {
  if (!spec.observation || spec.failure) return null;
  const previousRaw = await deps.db.cardScanEntry.findFirst({
    where: { sessionId: spec.session.id, organizerId: spec.session.organizerId },
    orderBy: { seq: 'desc' },
  });
  if (!previousRaw) return null;
  const prev = toEntryRow(previousRaw);
  const previous: PreviousEntry = {
    id: prev.id,
    identityKey: identityKeyFor({ game: prev.game, printingId: prev.printingId, cardName: prev.cardName, setCode: prev.setCode, collectorNumber: prev.collectorNumber }),
    createdAtMs: prev.createdAt.getTime(),
  };
  const identityKey = identityKeyForReading(
    cols.game,
    { cardName: cols.cardName, setCode: cols.setCode, collectorNumber: cols.collectorNumber },
    resolution
  );
  const decision = decideRepeatHold({
    source: spec.source,
    placementId: spec.placementId,
    identityKey,
    nowMs: nowOf(deps).getTime(),
    previous,
    windowMs: spec.cfg.dupWindowMs,
  });
  return decision.hold ? decision.suspectDuplicateOf : null;
}

/** Stores one new entry. Returns raced when a unique index says another request stored the same frame first. */
async function createReadEntry(
  deps: ScanDeps,
  spec: NewEntrySpec,
  resolution: ObservationResolution
): Promise<{ entry: ScanEntryRow; held: boolean } | { raced: true }> {
  const { session } = spec;
  const cols = readingColumns(session, spec.observation, resolution);
  const quantity = clampQuantity(spec.quantity);
  const suspect = await repeatOf(deps, spec, cols, resolution);
  const draft: ReadinessEntry = {
    status: 'NEEDS_REVIEW',
    printingId: cols.printingId,
    acceptAsTyped: false,
    game: cols.game,
    cardName: cols.cardName,
    finish: null,
    readFinish: cols.readFinish,
    conditionCode: null,
    grader: null,
    grade: null,
    certNumber: null,
    quantity,
    suspectDuplicateOf: suspect,
  };
  const readiness = computeReadiness(draft, { defaults: sessionDefaults(session), printing: preselectedPrinting(resolution) });
  const failed = spec.failure === 'PROVIDER_ERROR' || spec.failure === 'RATE_LIMIT';
  const status: ScanEntryStatus = failed ? 'ERROR' : readiness.status;
  const seq = await takeSeq(deps, session);
  try {
    const raw = await deps.db.cardScanEntry.create({
      data: {
        sessionId: session.id,
        organizerId: session.organizerId,
        seq,
        source: spec.source,
        clientEntryId: spec.clientEntryId,
        placementId: spec.placementId,
        imageSha256: spec.imageSha256,
        providerId: spec.providerId,
        attempts: 1,
        ...cols,
        readQuantity: spec.quantity !== null ? quantity : null,
        acceptAsTyped: false,
        quantity,
        status,
        errorCode: spec.failure,
        suspectDuplicateOf: suspect,
      },
    });
    return { entry: toEntryRow(raw), held: suspect !== null };
  } catch (err) {
    if (isUniqueViolation(err)) return { raced: true };
    throw err;
  }
}

async function printingForReadiness(deps: ScanDeps, printingId: string | null, resolution: ObservationResolution): Promise<{ finishes: readonly string[] } | null> {
  const id = clean(printingId);
  if (id === '') return null;
  if (resolution.printingId === id && resolution.candidates.length > 0) return { finishes: resolution.candidates[0].finishes };
  const map = await loadPrintingMap(deps, [id]);
  const p = map.get(id);
  return p ? { finishes: p.finishes } : null;
}

/**
 * The one re-read allowed for a placement whose first reading found nothing usable. The organizer's own decisions
 * are kept; the reading only fills blanks. Returns null when the row can no longer be re-read.
 */
async function rereadEntry(
  deps: ScanDeps,
  spec: NewEntrySpec,
  prior: ScanEntryRow,
  resolution: ObservationResolution
): Promise<ScanEntryRow | null> {
  const cols = readingColumns(spec.session, spec.observation, resolution);
  const fill = (current: string | null, fresh: string | null): string | null => (clean(current) !== '' ? current : fresh);
  const data: Partial<ScanEntryRow> = {
    clientEntryId: spec.clientEntryId,
    imageSha256: spec.imageSha256,
    providerId: spec.providerId,
    attempts: prior.attempts + 1,
    readGame: cols.readGame,
    readName: cols.readName,
    readSetCode: cols.readSetCode,
    readSetName: cols.readSetName,
    readCollectorNumber: cols.readCollectorNumber,
    readLanguage: cols.readLanguage,
    readFinish: cols.readFinish,
    readScryfallId: cols.readScryfallId,
    readConfidence: cols.readConfidence,
    suggestedConditionCode: cols.suggestedConditionCode,
    suggestedGrader: cols.suggestedGrader,
    suggestedGrade: cols.suggestedGrade,
    suggestedCertNumber: cols.suggestedCertNumber,
    suggestionSource: cols.suggestionSource,
    resolution: cols.resolution,
    resolutionNote: cols.resolutionNote,
    game: spec.observation ? cols.game : prior.game,
    printingId: clean(prior.printingId) !== '' ? prior.printingId : cols.printingId,
    cardName: fill(prior.cardName, cols.cardName),
    setCode: fill(prior.setCode, cols.setCode),
    setName: fill(prior.setName, cols.setName),
    collectorNumber: fill(prior.collectorNumber, cols.collectorNumber),
    language: fill(prior.language, cols.language),
  };
  const merged: ScanEntryRow = { ...prior, ...data };
  const printing = await printingForReadiness(deps, merged.printingId, resolution);
  const readiness = computeReadiness({ ...merged, status: 'NEEDS_REVIEW' }, { defaults: sessionDefaults(spec.session), printing });
  const failed = spec.failure === 'PROVIDER_ERROR' || spec.failure === 'RATE_LIMIT';
  const writeData: Record<string, unknown> = { ...data, status: failed ? 'ERROR' : readiness.status, errorCode: spec.failure };
  try {
    const res = await deps.db.cardScanEntry.updateMany({
      where: { id: prior.id, sessionId: prior.sessionId, organizerId: prior.organizerId, status: { in: ['NEEDS_REVIEW', 'READY', 'ERROR'] } },
      data: writeData,
    });
    if (res.count === 0) return null;
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
  const raw = await deps.db.cardScanEntry.findFirst({ where: { id: prior.id, sessionId: prior.sessionId, organizerId: prior.organizerId } });
  return raw ? toEntryRow(raw) : null;
}

export interface FrameInput {
  organizerId: string;
  sessionId: string;
  /** Client uuid for this upload. A retried upload of the same frame carries the same value (layer L1). */
  clientEntryId: string;
  /** Issued by the client each time a new card is placed (layer L2). Absent for a plain upload. */
  placementId?: string | null;
  /** Lower case hex sha256 of the received image bytes, computed by the controller (layer L3). */
  imageSha256: string;
  /** PHOTO for the live camera, UPLOAD for the batch upload tab. Default PHOTO. */
  source?: 'PHOTO' | 'UPLOAD';
}

export interface FrameData {
  entry: ScanEntryDto;
  duplicate: DuplicateKind | null;
  charged: boolean;
}

/**
 * Takes one frame into the session (ADR-138 section 2.1).
 *  1. Ownership and an OPEN session.
 *  2. Layers L1 to L3 (same clientEntryId, same placementId, same image). A hit returns the existing entry with
 *     charged false and the recognizer is never called. One re-read is allowed for a placement whose first
 *     reading found nothing usable.
 *  3. The injected recognizer runs once. It can stop the frame (scan turned off, daily cap, monthly Smart tags used
 *     up) before any entry exists; every other outcome leaves an entry behind.
 *  4. The reading is resolved against the catalog (set and number AND name must agree to pre-select a printing),
 *     layer L4 may hold a repeat, readiness is computed, and the entry is stored with the next sequence number.
 */
export async function ingestFrame(deps: ScanDeps, input: FrameInput, recognize: FrameRecognizer): Promise<ScanResult<FrameData>> {
  const cfg = getScanConfig(deps.env);
  const clientEntryId = parseId(input.clientEntryId);
  if (!clientEntryId) return apiFail(400, 'BAD_REQUEST');
  const placementRaw = input.placementId;
  const placementId = placementRaw === undefined || placementRaw === null || placementRaw === '' ? null : parseId(placementRaw);
  if (placementRaw !== undefined && placementRaw !== null && placementRaw !== '' && !placementId) return apiFail(400, 'BAD_REQUEST');
  if (typeof input.imageSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(input.imageSha256)) return apiFail(400, 'BAD_FRAME');
  const imageSha256 = input.imageSha256;
  const source: ScanEntrySource = input.source === 'UPLOAD' ? 'UPLOAD' : 'PHOTO';

  const session = await loadSession(deps, input.organizerId, input.sessionId);
  if (!session) return apiFail(404, 'SESSION_NOT_FOUND');
  const gate = writableGate(session);
  if (gate) return gate;

  const probe = { clientEntryId, placementId, imageSha256 };
  const existing = await findEarlyCandidates(deps, session, probe);
  const decision = decideEarlyDuplicate(probe, existing);
  let prior: ScanEntryRow | null = null;
  if (decision.kind !== 'NONE') {
    const found = existing.find((row) => row.id === decision.entryId) ?? null;
    if (!found) return apiFail(500, 'SERVER_ERROR');
    if (decision.kind === 'SAME_PLACEMENT' && decision.retry) {
      prior = found;
    } else {
      return good<FrameData>({ entry: await buildEntryDto(deps, session, found), duplicate: decision.kind, charged: false });
    }
  }
  if (!prior && (await entryCount(deps, session)) >= cfg.maxEntries) return apiFail(409, 'SESSION_FULL');

  let outcome: FrameRecognition;
  try {
    outcome = await recognize();
  } catch {
    outcome = { ok: false, code: 'PROVIDER_ERROR', charged: false };
  }
  if (!outcome.ok) {
    if (outcome.code === 'DISABLED') return statusFail(503, 'SCAN_DISABLED', SCAN_STATUS_MESSAGES.DISABLED);
    if (outcome.code === 'CAP_REACHED') return statusFail(429, 'SCAN_CAP_REACHED', SCAN_STATUS_MESSAGES.CAP_REACHED);
    if (outcome.code === 'QUOTA_EXCEEDED') return statusFail(429, QUOTA_API_CODE, SCAN_STATUS_MESSAGES.QUOTA_EXCEEDED);
  }
  const observation = outcome.ok ? outcome.observation : null;
  const failure: EntryFailure | null = outcome.ok ? null : (outcome.code as EntryFailure);
  const spec: NewEntrySpec = {
    session,
    cfg,
    source,
    clientEntryId,
    placementId,
    imageSha256,
    providerId: observation ? observation.providerId : null,
    observation,
    failure,
    quantity: null,
  };
  const resolution = await resolveReading(deps, observation);

  if (prior) {
    const updated = await rereadEntry(deps, spec, prior, resolution);
    const row = updated ?? prior;
    return good<FrameData>({ entry: await buildEntryDto(deps, session, row), duplicate: updated ? null : 'SAME_PLACEMENT', charged: outcome.charged });
  }

  const created = await createReadEntry(deps, spec, resolution);
  if ('raced' in created) {
    // Another request stored this frame between the check and the write: show what it stored.
    const again = await findEarlyCandidates(deps, session, probe);
    const decisionAgain = decideEarlyDuplicate(probe, again);
    const match = decisionAgain.kind !== 'NONE' ? again.find((row) => row.id === decisionAgain.entryId) ?? null : null;
    if (!match) return apiFail(409, 'SESSION_NOT_OPEN');
    return good<FrameData>({ entry: await buildEntryDto(deps, session, match), duplicate: decisionAgain.kind === 'NONE' ? null : decisionAgain.kind, charged: outcome.charged });
  }
  return good<FrameData>({
    entry: await buildEntryDto(deps, session, created.entry),
    duplicate: created.held ? 'SUSPECT_REPEAT' : null,
    charged: outcome.charged,
  });
}

export interface ObservationData {
  entry: ScanEntryDto;
  duplicate: DuplicateKind | null;
}

export interface ObservationInput {
  organizerId: string;
  sessionId: string;
  /** Unique per observation inside the session (for example "delver:" + the vendor uuid). */
  clientEntryId: string;
  observation: CardObservation;
  source: ScanEntrySource;
  quantity?: number;
}

/**
 * Stores an observation that needs no recognizer (the Delver feed). Layer L1 applies (the same clientEntryId returns
 * the existing entry); placement, image and repeat checks do not, because a vendor feed is a deliberate act.
 */
export async function ingestObservation(
  deps: ScanDeps,
  input: ObservationInput
): Promise<ScanResult<ObservationData>> {
  const cfg = getScanConfig(deps.env);
  const clientEntryId = parseId(input.clientEntryId);
  if (!clientEntryId || !input.observation || typeof input.observation !== 'object') return apiFail(400, 'BAD_REQUEST');
  const session = await loadSession(deps, input.organizerId, input.sessionId);
  if (!session) return apiFail(404, 'SESSION_NOT_FOUND');
  const gate = writableGate(session);
  if (gate) return gate;

  const probe = { clientEntryId, placementId: null, imageSha256: null };
  const existing = await findEarlyCandidates(deps, session, probe);
  if (existing.length > 0) return good<ObservationData>({ entry: await buildEntryDto(deps, session, existing[0]), duplicate: 'SAME_ENTRY' });
  if ((await entryCount(deps, session)) >= cfg.maxEntries) return apiFail(409, 'SESSION_FULL');

  const spec: NewEntrySpec = {
    session,
    cfg,
    source: input.source,
    clientEntryId,
    placementId: null,
    imageSha256: null,
    providerId: input.observation.providerId,
    observation: input.observation,
    failure: null,
    quantity: typeof input.quantity === 'number' ? input.quantity : null,
  };
  const resolution = await resolveReading(deps, input.observation);
  const created = await createReadEntry(deps, spec, resolution);
  if ('raced' in created) {
    const again = await findEarlyCandidates(deps, session, probe);
    if (again.length === 0) return apiFail(409, 'SESSION_NOT_OPEN');
    return good<ObservationData>({ entry: await buildEntryDto(deps, session, again[0]), duplicate: 'SAME_ENTRY' });
  }
  return good<ObservationData>({ entry: await buildEntryDto(deps, session, created.entry), duplicate: created.held ? 'SUSPECT_REPEAT' : null });
}

export interface ManualEntryInput extends EntryFieldInput {
  organizerId: string;
  sessionId: string;
  /** Client uuid, so a retried request returns the entry it already made. */
  clientEntryId: string;
  /** A catalog printing id chosen from the search; or leave it out and type the card. */
  printingId?: string | null;
}

/** Adds a card by hand: a printing picked from the catalog search, or typed details. Works with the recognizer off. */
export async function addManualEntry(deps: ScanDeps, input: ManualEntryInput): Promise<ScanResult<{ entry: ScanEntryDto }>> {
  const cfg = getScanConfig(deps.env);
  const session = await loadSession(deps, input.organizerId, input.sessionId);
  if (!session) return apiFail(404, 'SESSION_NOT_FOUND');
  const gate = writableGate(session);
  if (gate) return gate;
  const clientEntryId = parseId(input.clientEntryId);
  if (!clientEntryId) return apiFail(400, 'BAD_REQUEST');

  const existing = await findEarlyCandidates(deps, session, { clientEntryId, placementId: null, imageSha256: null });
  if (existing.length > 0) return good({ entry: await buildEntryDto(deps, session, existing[0]) });
  if ((await entryCount(deps, session)) >= cfg.maxEntries) return apiFail(409, 'SESSION_FULL');

  const fields = parseEntryFields(input);
  if (!fields) return apiFail(400, 'CARD_VALIDATION');
  const printingIdText = input.printingId === undefined || input.printingId === null || input.printingId === '' ? null : parseId(input.printingId);
  if (input.printingId !== undefined && input.printingId !== null && input.printingId !== '' && !printingIdText) return apiFail(400, 'CARD_VALIDATION');

  let printing: PrintingDto | null = null;
  if (printingIdText) {
    printing = (await loadPrintingMap(deps, [printingIdText])).get(printingIdText) ?? null;
    if (!printing) return apiFail(404, 'CARD_NOT_FOUND');
  } else if (clean(typeof fields.cardName === 'string' ? fields.cardName : null) === '') {
    return apiFail(400, 'CARD_VALIDATION');
  }

  const text = (key: string): string | null => (typeof fields[key] === 'string' ? (fields[key] as string) : null);
  const quantity = typeof fields.quantity === 'number' ? fields.quantity : 1;
  const base = {
    game: printing ? printing.game : typeof fields.game === 'string' ? fields.game : session.defaultGame,
    printingId: printing ? printing.id : null,
    acceptAsTyped: printing ? false : true,
    cardName: printing ? printing.name : text('cardName'),
    setCode: printing ? printing.setCode : text('setCode'),
    setName: printing ? printing.setName : text('setName'),
    collectorNumber: printing ? printing.collectorNumber : text('collectorNumber'),
    language: text('language'),
    finish: text('finish'),
    conditionCode: text('conditionCode'),
    grader: text('grader'),
    grade: text('grade'),
    certNumber: text('certNumber'),
    quantity,
    price: typeof fields.price === 'number' ? fields.price : null,
  };
  const draft: ReadinessEntry = {
    status: 'NEEDS_REVIEW',
    printingId: base.printingId,
    acceptAsTyped: base.acceptAsTyped,
    game: base.game,
    cardName: base.cardName,
    finish: base.finish,
    readFinish: null,
    conditionCode: base.conditionCode,
    grader: base.grader,
    grade: base.grade,
    certNumber: base.certNumber,
    quantity,
    suspectDuplicateOf: null,
  };
  const readiness = computeReadiness(draft, { defaults: sessionDefaults(session), printing: printing ? { finishes: printing.finishes } : null });
  const seq = await takeSeq(deps, session);
  try {
    const raw = await deps.db.cardScanEntry.create({
      data: {
        sessionId: session.id,
        organizerId: session.organizerId,
        seq,
        source: 'MANUAL',
        clientEntryId,
        providerId: 'manual',
        attempts: 1,
        resolution: printing ? 'EXACT' : 'UNMATCHED',
        ...base,
        status: readiness.status,
      },
    });
    return good({ entry: await buildEntryDto(deps, session, toEntryRow(raw)) });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const again = await findEarlyCandidates(deps, session, { clientEntryId, placementId: null, imageSha256: null });
    if (again.length === 0) throw err;
    return good({ entry: await buildEntryDto(deps, session, again[0]) });
  }
}

// ---------------------------------------------------------------------------------------------
// Organizer decisions: patch one entry, act on many
// ---------------------------------------------------------------------------------------------

export interface EntryPatch extends EntryFieldInput {
  /** Pick a printing (copies its details into the card columns) or null to clear the pick. */
  printingId?: string | null;
  /** True: use the typed details, no catalog printing. */
  acceptAsTyped?: boolean;
  /** True: leave this card out of the commit. False: put a skipped card back. */
  skip?: boolean;
  /** True: a held suspected repeat counts as another copy. */
  countAsAnother?: boolean;
  /** The updatedAt the client last saw; a different current value answers 409 ENTRY_CHANGED. */
  ifUpdatedAt?: string;
}

const FROZEN_ENTRY: readonly ScanEntryStatus[] = ['COMMITTING', 'COMMITTED'];

async function entryChanged(deps: ScanDeps, session: ScanSessionRow, row: ScanEntryRow): Promise<ScanFailure> {
  if (row.status === 'COMMITTING') return apiFail(409, 'SESSION_COMMITTING');
  if (row.status === 'COMMITTED') return apiFail(409, 'ALREADY_APPLIED');
  return apiFail(409, 'ENTRY_CHANGED', { entry: await buildEntryDto(deps, session, row) });
}

/**
 * Applies the organizer's decisions to one entry, recomputes readiness, and writes with a guard so a frozen
 * (committing or committed) entry can never be changed. With ifUpdatedAt the write also requires the entry to be
 * unchanged since the client last saw it.
 */
export async function patchEntry(
  deps: ScanDeps,
  input: { organizerId: string; sessionId: string; entryId: string; patch: EntryPatch }
): Promise<ScanResult<{ entry: ScanEntryDto }>> {
  const session = await loadSession(deps, input.organizerId, input.sessionId);
  if (!session) return apiFail(404, 'SESSION_NOT_FOUND');
  const gate = writableGate(session);
  if (gate) return gate;
  const entry = await loadEntry(deps, session, input.entryId);
  if (!entry) return apiFail(404, 'ENTRY_NOT_FOUND');
  if (entry.status === 'COMMITTING') return apiFail(409, 'SESSION_COMMITTING');
  if (entry.status === 'COMMITTED') return apiFail(409, 'ALREADY_APPLIED');

  const patch = input.patch ?? {};
  let expected: Date | null = null;
  if (patch.ifUpdatedAt !== undefined) {
    const asked = typeof patch.ifUpdatedAt === 'string' ? new Date(patch.ifUpdatedAt) : null;
    if (!asked || Number.isNaN(asked.getTime())) return apiFail(400, 'BAD_REQUEST');
    if (asked.getTime() !== entry.updatedAt.getTime()) return entryChanged(deps, session, entry);
    expected = entry.updatedAt;
  }
  const fields = parseEntryFields(patch);
  if (!fields) return apiFail(400, 'CARD_VALIDATION');
  for (const flag of [patch.acceptAsTyped, patch.skip, patch.countAsAnother]) {
    if (flag !== undefined && typeof flag !== 'boolean') return apiFail(400, 'BAD_REQUEST');
  }
  let printingIdText: string | null | undefined;
  if (patch.printingId === undefined) printingIdText = undefined;
  else if (patch.printingId === null) printingIdText = null;
  else {
    printingIdText = parseId(patch.printingId);
    if (!printingIdText) return apiFail(400, 'CARD_VALIDATION');
  }
  if (patch.acceptAsTyped === true && typeof printingIdText === 'string') return apiFail(400, 'CARD_VALIDATION');

  const next: ScanEntryRow = { ...entry };
  const data: Record<string, unknown> = {};
  const set = (key: keyof ScanEntryRow, value: unknown): void => {
    data[key] = value;
    (next as unknown as Record<string, unknown>)[key] = value;
  };
  for (const [key, value] of Object.entries(fields)) set(key as keyof ScanEntryRow, value);

  let printing: PrintingDto | null = null;
  if (typeof printingIdText === 'string') {
    printing = (await loadPrintingMap(deps, [printingIdText])).get(printingIdText) ?? null;
    if (!printing) return apiFail(404, 'CARD_NOT_FOUND');
    set('printingId', printing.id);
    set('acceptAsTyped', false);
    // The printing's own details fill the descriptive columns (a typed value sent in the same patch wins).
    if (fields.game === undefined) set('game', printing.game);
    if (fields.cardName === undefined) set('cardName', printing.name);
    if (fields.setCode === undefined) set('setCode', printing.setCode);
    if (fields.setName === undefined) set('setName', printing.setName);
    if (fields.collectorNumber === undefined) set('collectorNumber', printing.collectorNumber);
  } else if (printingIdText === null) {
    set('printingId', null);
  }
  if (patch.acceptAsTyped === true) {
    set('acceptAsTyped', true);
    if (printingIdText === undefined) set('printingId', null);
  } else if (patch.acceptAsTyped === false) {
    set('acceptAsTyped', false);
  }
  if (patch.countAsAnother === true) set('suspectDuplicateOf', null);

  if (!printing && clean(next.printingId) !== '') {
    printing = (await loadPrintingMap(deps, [next.printingId])).get(clean(next.printingId)) ?? null;
  }
  // A finish the newly picked printing does not come in is cleared, so the organizer chooses again.
  if (typeof printingIdText === 'string' && printing && fields.finish === undefined && clean(next.finish) !== '') {
    const canonical = canonicalizeVocabValue(CARD_FINISHES, next.finish);
    const available = availableFinishes(printing.finishes);
    if (canonical && available.size > 0 && !available.has(canonical)) set('finish', null);
  }

  const readiness = computeReadiness({ ...next, status: 'NEEDS_REVIEW' }, { defaults: sessionDefaults(session), printing: printing ? { finishes: printing.finishes } : null });
  let status: ScanEntryStatus;
  if (patch.skip === true) status = 'SKIPPED';
  else if (entry.status === 'SKIPPED' && patch.skip !== false) status = 'SKIPPED';
  else status = readiness.status;
  data.status = status;
  if (patch.skip !== true) data.errorCode = null;

  const res = await deps.db.cardScanEntry.updateMany({
    where: {
      id: entry.id,
      sessionId: session.id,
      organizerId: session.organizerId,
      status: { notIn: FROZEN_ENTRY },
      ...(expected ? { updatedAt: expected } : {}),
    },
    data,
  });
  const latest = await loadEntry(deps, session, entry.id);
  if (!latest) return apiFail(404, 'ENTRY_NOT_FOUND');
  if (res.count === 0) return entryChanged(deps, session, latest);
  await touchSession(deps, session);
  return good({ entry: await buildEntryDto(deps, session, latest) });
}

export const BULK_ACTIONS = ['SET_CONDITION', 'USE_SUGGESTED_CONDITION', 'SET_FINISH', 'SKIP', 'UNSKIP', 'DELETE'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export interface BulkInput {
  organizerId: string;
  sessionId: string;
  entryIds: string[];
  action: string;
  conditionCode?: string | null;
  finish?: string | null;
}

/**
 * The same organizer action on up to 200 entries. Entries that cannot take the action (another session's id,
 * already committed, a graded card for a condition, a suggestion that is missing, a finish the printing does not
 * come in) are counted in `ignored`, never changed. USE_SUGGESTED_CONDITION never overrides a condition the
 * organizer already set.
 */
export async function bulkUpdate(deps: ScanDeps, input: BulkInput): Promise<ScanResult<{ updated: number; ignored: number }>> {
  const session = await loadSession(deps, input.organizerId, input.sessionId);
  if (!session) return apiFail(404, 'SESSION_NOT_FOUND');
  const gate = writableGate(session);
  if (gate) return gate;

  if (!Array.isArray(input.entryIds) || input.entryIds.length < 1 || input.entryIds.length > MAX_BULK_IDS) return apiFail(400, 'BAD_REQUEST');
  const ids: string[] = [];
  for (const raw of input.entryIds) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (id === '' || id.length > 64) return apiFail(400, 'BAD_REQUEST');
    if (!ids.includes(id)) ids.push(id);
  }
  if (!(BULK_ACTIONS as readonly string[]).includes(input.action)) return apiFail(400, 'BAD_REQUEST');
  const action = input.action as BulkAction;
  let conditionCode: string | null = null;
  let finish: string | null = null;
  if (action === 'SET_CONDITION') {
    conditionCode = canonicalizeVocabValue(CARD_CONDITION_CODES, input.conditionCode) ?? null;
    if (!conditionCode) return apiFail(400, 'CARD_VALIDATION');
  }
  if (action === 'SET_FINISH') {
    finish = canonicalizeVocabValue(CARD_FINISHES, input.finish) ?? null;
    if (!finish) return apiFail(400, 'CARD_VALIDATION');
  }

  const rows = (
    await deps.db.cardScanEntry.findMany({ where: { sessionId: session.id, organizerId: session.organizerId, id: { in: ids } } })
  )
    .map(toEntryRow)
    .filter((row) => !FROZEN_ENTRY.includes(row.status));
  const printings = await loadPrintingMap(deps, rows.map((r) => r.printingId));
  const defaults = sessionDefaults(session);

  interface Planned {
    row: ScanEntryRow;
    data: Record<string, unknown>;
  }
  const planned: Planned[] = [];
  const toDelete: string[] = [];
  for (const row of rows) {
    const printing = printings.get(clean(row.printingId)) ?? null;
    const next: ScanEntryRow = { ...row };
    const data: Record<string, unknown> = {};
    let status: ScanEntryStatus | null = null;
    if (action === 'DELETE') {
      toDelete.push(row.id);
      continue;
    }
    if (action === 'SET_CONDITION') {
      if (clean(row.grader) !== '') continue;
      data.conditionCode = conditionCode;
      next.conditionCode = conditionCode;
    } else if (action === 'USE_SUGGESTED_CONDITION') {
      const suggested = canonicalizeVocabValue(CARD_CONDITION_CODES, row.suggestedConditionCode);
      if (!suggested || clean(row.conditionCode) !== '' || clean(row.grader) !== '') continue;
      data.conditionCode = suggested;
      next.conditionCode = suggested;
    } else if (action === 'SET_FINISH') {
      if (printing) {
        const available = availableFinishes(printing.finishes);
        if (available.size > 0 && !available.has(finish as 'FOIL')) continue;
      }
      data.finish = finish;
      next.finish = finish;
    } else if (action === 'SKIP') {
      if (row.status === 'SKIPPED') continue;
      status = 'SKIPPED';
    } else if (action === 'UNSKIP') {
      if (row.status !== 'SKIPPED') continue;
    }
    if (status === null) {
      const readiness = computeReadiness({ ...next, status: 'NEEDS_REVIEW' }, { defaults, printing: printing ? { finishes: printing.finishes } : null });
      status = row.status === 'SKIPPED' && action !== 'UNSKIP' ? 'SKIPPED' : readiness.status;
    }
    data.status = status;
    if (status !== 'SKIPPED') data.errorCode = null;
    planned.push({ row, data });
  }

  let updated = 0;
  const chunk = 25;
  for (let start = 0; start < planned.length; start += chunk) {
    const part = planned.slice(start, start + chunk);
    const results = await Promise.all(
      part.map((p) =>
        deps.db.cardScanEntry.updateMany({
          where: { id: p.row.id, sessionId: session.id, organizerId: session.organizerId, status: { notIn: FROZEN_ENTRY } },
          data: p.data,
        })
      )
    );
    for (const r of results) updated += r.count;
  }
  if (toDelete.length > 0) {
    const removed = await deps.db.cardScanEntry.deleteMany({
      where: { id: { in: toDelete }, sessionId: session.id, organizerId: session.organizerId, status: { notIn: FROZEN_ENTRY } },
    });
    updated += removed.count;
  }
  if (updated > 0) await touchSession(deps, session);
  return good({ updated, ignored: ids.length - updated });
}
