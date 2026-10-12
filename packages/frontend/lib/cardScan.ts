/**
 * cardScan (ADR-138 batch B6): the typed client for the /api/card-scan routes (ADR-138 section 9), the readers that turn
 * response bodies into the shapes the Scan cards screens use, and the builders for every request body.
 *
 * No React, no axios, no env reads at import time, no network at import time. fetch, the CSRF cookie, the base URL and
 * the session refresh are injected (the same shape as lib/cardIntakeStream.ts ConfirmDeps), so lib/__tests__/cardScanQueue.test.ts
 * and cardScanViewModel.test.ts run with fakes. Run: npm test   (node:test through tsx)
 *
 * Rules this file keeps (ADR-138 sections 3 and 9):
 *  - The server owns identity, readiness and grouping. Nothing here computes a dedup key, a readiness state or a suggested price.
 *  - Request bodies for PATCH, manual add, bulk and commit are built from fixed key lists, because the server rejects unknown keys.
 *  - The commit mode (ADD or REPLACE) has no default. The commit builder refuses to build without it.
 *  - Readers never throw. A malformed body gives null or safe defaults, and the entry reader fails closed (an unknown status
 *    is shown as "needs a decision", never as ready).
 *
 * Wire shapes (envelope: success { success: true, data }, failure { success: false, error, code, ...extra }):
 *   GET    /api/card-scan/status
 *   POST   /api/card-scan/sessions
 *   GET    /api/card-scan/sessions?saleId=
 *   GET    /api/card-scan/sessions/:id?afterSeq=&limit=
 *   POST   /api/card-scan/sessions/:id/frames           multipart: frame, clientEntryId, placementId?, gameHint?
 *   POST   /api/card-scan/sessions/:id/entries
 *   PATCH  /api/card-scan/sessions/:id/entries/:entryId
 *   POST   /api/card-scan/sessions/:id/entries/bulk
 *   POST   /api/card-scan/sessions/:id/commit
 *   POST   /api/card-scan/sessions/:id/discard
 *   POST|GET|DELETE /api/card-scan/ingest-tokens         (batch B8, Delver address)
 */
import type { Candidate } from './cardIntake';
import { defaultApiBase, readCsrfToken, type FetchLike, type ResponseLike } from './cardIntakeStream';
import { wordingForScanError } from './cardScanCopy';

// ---------------------------------------------------------------------------
// Constants and shared shapes
// ---------------------------------------------------------------------------

export type ScanMode = 'ADD' | 'REPLACE';
export type ScanEntrySource = 'PHOTO' | 'UPLOAD' | 'DELVER' | 'MANUAL';
export type ScanEntryStatus = 'NEEDS_REVIEW' | 'READY' | 'SKIPPED' | 'COMMITTING' | 'COMMITTED' | 'ERROR';
export type ScanNeed = 'PRINTING' | 'FINISH' | 'CONDITION' | 'NAME';
export type ScanResolutionStatus = 'EXACT' | 'AMBIGUOUS' | 'UNMATCHED';
export type ScanAgreement = 'FULL' | 'PARTIAL' | 'NONE';
export type ScanDuplicate = 'SAME_ENTRY' | 'SAME_PLACEMENT' | 'SAME_IMAGE' | 'SUSPECT_REPEAT';
export type ScanSessionStatus = 'OPEN' | 'COMMITTING' | 'CLOSED' | 'DISCARDED';
export type ScanBulkAction = 'SET_CONDITION' | 'USE_SUGGESTED_CONDITION' | 'SET_FINISH' | 'SKIP' | 'UNSKIP' | 'DELETE';

export const ENTRY_STATUSES: readonly ScanEntryStatus[] = ['NEEDS_REVIEW', 'READY', 'SKIPPED', 'COMMITTING', 'COMMITTED', 'ERROR'];
export const SCAN_NEEDS: readonly ScanNeed[] = ['PRINTING', 'FINISH', 'CONDITION', 'NAME'];
export const BULK_ACTIONS: readonly ScanBulkAction[] = ['SET_CONDITION', 'USE_SUGGESTED_CONDITION', 'SET_FINISH', 'SKIP', 'UNSKIP', 'DELETE'];

/** Server limits (ADR-138 section 11). The status call can report smaller values; these are the defaults. */
export const BULK_MAX_IDS = 200;
export const PAGE_LIMIT_MAX = 200;
export const SESSION_MAX_ENTRIES = 2000;
export const SESSION_LABEL_MAX = 60;
export const MAX_FRAME_BYTES_DEFAULT = 1572864;
export const MAX_CANDIDATES = 5;
export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 10000;

export const SCAN_API_PATH = '/card-scan';

/** Keys the PATCH route accepts (strict zod on the server). Anything else would be a 400. */
export const PATCH_KEYS: readonly string[] = [
  'printingId',
  'acceptAsTyped',
  'game',
  'cardName',
  'setCode',
  'setName',
  'collectorNumber',
  'language',
  'finish',
  'conditionCode',
  'grader',
  'grade',
  'certNumber',
  'quantity',
  'price',
  'skip',
  'countAsAnother',
  'ifUpdatedAt',
];

/** Keys the manual add route accepts. */
export const MANUAL_KEYS: readonly string[] = [
  'clientEntryId',
  'printingId',
  'game',
  'cardName',
  'setCode',
  'setName',
  'collectorNumber',
  'language',
  'finish',
  'conditionCode',
  'grader',
  'grade',
  'certNumber',
  'quantity',
  'price',
];

export interface ScanEntryRead {
  game: string | null;
  name: string | null;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  language: string | null;
  finish: string | null;
  confidence: number | null;
}

export interface ScanEntrySuggested {
  conditionCode: string | null;
  grader: string | null;
  grade: string | null;
  certNumber: string | null;
  source: string | null;
}

export interface ScanEntryResolution {
  status: ScanResolutionStatus;
  note: string | null;
  agreement: ScanAgreement;
  printingId: string | null;
  candidates: Candidate[];
  truncated: boolean;
}

export interface ScanEntryChosen {
  game: string | null;
  printingId: string | null;
  acceptAsTyped: boolean;
  cardName: string | null;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  language: string | null;
  finish: string | null;
  conditionCode: string | null;
  grader: string | null;
  grade: string | null;
  certNumber: string | null;
  quantity: number;
  price: number | null;
}

/** One row of the confirm queue (ADR-138 section 9, ScanEntryDto). */
export interface ScanEntry {
  id: string;
  seq: number;
  source: ScanEntrySource;
  status: ScanEntryStatus;
  needs: ScanNeed[];
  read: ScanEntryRead | null;
  suggested: ScanEntrySuggested | null;
  resolution: ScanEntryResolution;
  chosen: ScanEntryChosen;
  groupKey: string | null;
  suspectDuplicateOf: string | null;
  errorCode: string | null;
  updatedAt: string;
}

export interface ScanSession {
  id: string;
  saleId: string | null;
  label: string | null;
  source: string;
  status: ScanSessionStatus;
  defaultGame: string | null;
  defaultConditionCode: string | null;
  defaultFinish: string | null;
  commitMode: string | null;
  nextSeq: number;
  lastActivityAt: string | null;
  createdAt: string | null;
}

export interface ScanCounts {
  needsReview: number;
  ready: number;
  skipped: number;
  committed: number;
  error: number;
}

export interface ScanSessionListItem {
  id: string;
  label: string | null;
  source: string;
  status: ScanSessionStatus;
  counts: ScanCounts;
  lastActivityAt: string | null;
}

export interface ScanQueueState {
  session: ScanSession;
  entries: ScanEntry[];
  counts: ScanCounts;
  catalogReady: boolean;
  delver: { lastActivityAt: string | null };
}

export interface ScanStatus {
  scanEnabled: boolean;
  providerReady: boolean;
  providerId: string | null;
  mode: string | null;
  catalogReady: boolean;
  readyGames: string[];
  limits: { maxEntries: number; maxFrameBytes: number; dupWindowMs: number };
  smartTagsRemaining: number | null;
}

export interface FrameResult {
  entry: ScanEntry;
  duplicate: ScanDuplicate | null;
  charged: boolean;
}

export interface BulkResult {
  updated: number;
  ignored: number;
}

export interface CommitSummary {
  created: number;
  merged: number;
  skipped: number;
  errors: number;
  needsPrice: number;
}

export interface CommitResult {
  batchId: string | null;
  status: string;
  summary: CommitSummary;
  notCommitted: Array<{ entryId: string; reason: string }>;
  failed: Array<{ entryId: string; code: string; message: string }>;
}

export interface IngestToken {
  id: string;
  hint: string;
  url: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

export interface ScanFailure {
  kind: 'http' | 'network' | 'aborted' | 'invalid';
  status: number | null;
  code: string;
  /** The server's own `error` text when it sent one, else our wording. */
  message: string;
  help: string;
  /** True when the same request may succeed if sent again (the server de-duplicates by clientEntryId). */
  retriable: boolean;
  /** True when every later request of the same kind will fail the same way, so a send queue should stop (quota, cap, flag, session). */
  halts: boolean;
  extra: Record<string, unknown> | null;
}

export type ScanResult<T> = { ok: true; data: T } | { ok: false; failure: ScanFailure };

/** Codes after which a send queue stops sending and keeps the rest (they will fail the same way). */
const HALTING_CODES: readonly string[] = [
  'AI_QUOTA_EXCEEDED',
  'SCAN_CAP_REACHED',
  'SCAN_DISABLED',
  'SESSION_NOT_OPEN',
  'SESSION_NOT_FOUND',
  'SESSION_FULL',
  'SESSION_COMMITTING',
  'UNAUTHORIZED',
  'SESSION_ENDED',
  'FORBIDDEN',
  'NOT_YOUR_SALE',
  'SALE_NOT_FOUND',
];

export function isHaltingCode(code: string): boolean {
  return HALTING_CODES.indexOf(code) >= 0;
}

/** Codes where a 429 or 5xx will not get better by waiting a few seconds. */
const NEVER_RETRY_CODES: readonly string[] = ['AI_QUOTA_EXCEEDED', 'SCAN_CAP_REACHED', 'SCAN_DISABLED'];

/** Whether sending the same request again can help. Network trouble, rate limits and server errors can; client errors and quota stops cannot. */
export function isRetriableFailure(kind: ScanFailure['kind'], status: number | null, code: string): boolean {
  if (kind === 'network') return true;
  if (kind !== 'http' || status === null) return false;
  if (NEVER_RETRY_CODES.indexOf(code) >= 0) return false;
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

function codeForStatus(status: number): string {
  if (status === 401) return 'SESSION_ENDED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'SESSION_NOT_FOUND';
  if (status === 413) return 'FRAME_TOO_LARGE';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN';
}

function buildFailure(kind: ScanFailure['kind'], status: number | null, code: string, serverText: string | null, extra: Record<string, unknown> | null): ScanFailure {
  const w = wordingForScanError(code);
  return {
    kind,
    status,
    code,
    message: serverText || w.message,
    help: w.help,
    retriable: isRetriableFailure(kind, status, code),
    halts: isHaltingCode(code),
    extra,
  };
}

/** Turns an HTTP failure into display values. Body shape from the backend: { success:false, error, code, ...extra }. */
export function failureFromResponse(status: number, body: unknown): ScanFailure {
  const b = isRecord(body) ? body : null;
  const serverCode = b && typeof b.code === 'string' && b.code !== '' ? b.code : null;
  const serverText = b && typeof b.error === 'string' && b.error.trim() !== '' ? b.error.trim() : null;
  let extra: Record<string, unknown> | null = null;
  if (b) {
    const rest: Record<string, unknown> = {};
    Object.keys(b).forEach((k) => {
      if (k !== 'success' && k !== 'error' && k !== 'code') rest[k] = b[k];
    });
    if (Object.keys(rest).length > 0) extra = rest;
  }
  return buildFailure('http', status, serverCode || codeForStatus(status), serverText, extra);
}

/** A failure that never reached the server, or a thrown error from fetch. */
export function failureFromError(err: unknown): ScanFailure {
  const e = err as { name?: string; code?: string } | null;
  if (e && (e.name === 'AbortError' || e.name === 'CanceledError' || e.code === 'ERR_CANCELED')) {
    return buildFailure('aborted', null, 'CANCELLED', null, null);
  }
  return buildFailure('network', null, 'NETWORK_ERROR', null, null);
}

/** A failure raised by this file before any request (for example a missing commit mode). */
export function localFailure(code: string): ScanFailure {
  return buildFailure('invalid', null, code, null, null);
}

/** The 409 ALREADY_APPLIED body carries the earlier commit summary. */
export function alreadyAppliedSummary(failure: ScanFailure): CommitSummary | null {
  const s = failure.extra && isRecord(failure.extra.summary) ? failure.extra.summary : null;
  return s ? readCommitSummary(s) : null;
}

// ---------------------------------------------------------------------------
// Tolerant readers (never throw; a malformed body gives null or safe defaults)
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null;
}
/** Prisma sends a Decimal as a string such as "12.50"; accept both. */
function numLikeOrNull(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return isFinite(n) ? n : null;
  }
  return null;
}
function bool(v: unknown): boolean {
  return v === true;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && allowed.indexOf(v as T) >= 0 ? (v as T) : fallback;
}
function unwrap(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  if (isRecord(body.data) && body.success !== false) return body.data;
  return body;
}

function readCandidate(raw: unknown): Candidate | null {
  if (!isRecord(raw) || typeof raw.printingId !== 'string' || raw.printingId === '') return null;
  return {
    printingId: raw.printingId,
    name: str(raw.name),
    setCode: str(raw.setCode),
    setName: strOrNull(raw.setName),
    collectorNumber: strOrNull(raw.collectorNumber),
    finishes: arr(raw.finishes).filter((f): f is string => typeof f === 'string'),
    releaseYear: numOrNull(raw.releaseYear),
    imageSmallUrl: strOrNull(raw.imageSmallUrl),
  };
}

function readRead(raw: unknown): ScanEntryRead | null {
  if (!isRecord(raw)) return null;
  return {
    game: strOrNull(raw.game),
    name: strOrNull(raw.name),
    setCode: strOrNull(raw.setCode),
    setName: strOrNull(raw.setName),
    collectorNumber: strOrNull(raw.collectorNumber),
    language: strOrNull(raw.language),
    finish: strOrNull(raw.finish),
    confidence: numOrNull(raw.confidence),
  };
}

function readSuggested(raw: unknown): ScanEntrySuggested | null {
  if (!isRecord(raw)) return null;
  const s: ScanEntrySuggested = {
    conditionCode: strOrNull(raw.conditionCode),
    grader: strOrNull(raw.grader),
    grade: strOrNull(raw.grade),
    certNumber: strOrNull(raw.certNumber),
    source: strOrNull(raw.source),
  };
  // An object with nothing in it is no suggestion at all.
  return s.conditionCode || s.grader || s.grade || s.certNumber ? s : null;
}

function readResolution(raw: unknown): ScanEntryResolution {
  const r = isRecord(raw) ? raw : {};
  const candidates: Candidate[] = [];
  arr(r.candidates).forEach((c) => {
    const cand = readCandidate(c);
    if (cand && candidates.length < MAX_CANDIDATES) candidates.push(cand);
  });
  return {
    status: oneOf<ScanResolutionStatus>(r.status, ['EXACT', 'AMBIGUOUS', 'UNMATCHED'], 'UNMATCHED'),
    note: strOrNull(r.note),
    agreement: oneOf<ScanAgreement>(r.agreement, ['FULL', 'PARTIAL', 'NONE'], 'NONE'),
    printingId: strOrNull(r.printingId),
    candidates,
    truncated: bool(r.truncated),
  };
}

function readChosen(raw: unknown): ScanEntryChosen {
  const c = isRecord(raw) ? raw : {};
  const q = typeof c.quantity === 'number' && isFinite(c.quantity) ? Math.floor(c.quantity) : 1;
  return {
    game: strOrNull(c.game),
    printingId: strOrNull(c.printingId),
    acceptAsTyped: bool(c.acceptAsTyped),
    cardName: strOrNull(c.cardName),
    setCode: strOrNull(c.setCode),
    setName: strOrNull(c.setName),
    collectorNumber: strOrNull(c.collectorNumber),
    language: strOrNull(c.language),
    finish: strOrNull(c.finish),
    conditionCode: strOrNull(c.conditionCode),
    grader: strOrNull(c.grader),
    grade: strOrNull(c.grade),
    certNumber: strOrNull(c.certNumber),
    quantity: q >= 0 ? q : 1,
    price: numLikeOrNull(c.price),
  };
}

/** One queue row. Returns null when there is no id. An unknown status reads as NEEDS_REVIEW (fails closed, never READY). */
export function readEntry(raw: unknown): ScanEntry | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  const needs: ScanNeed[] = [];
  arr(raw.needs).forEach((n) => {
    if (typeof n === 'string' && SCAN_NEEDS.indexOf(n as ScanNeed) >= 0 && needs.indexOf(n as ScanNeed) < 0) needs.push(n as ScanNeed);
  });
  return {
    id: raw.id,
    seq: num(raw.seq, 0),
    source: oneOf<ScanEntrySource>(raw.source, ['PHOTO', 'UPLOAD', 'DELVER', 'MANUAL'], 'PHOTO'),
    status: oneOf<ScanEntryStatus>(raw.status, ENTRY_STATUSES, 'NEEDS_REVIEW'),
    needs,
    read: readRead(raw.read),
    suggested: readSuggested(raw.suggested),
    resolution: readResolution(raw.resolution),
    chosen: readChosen(raw.chosen),
    groupKey: strOrNull(raw.groupKey),
    suspectDuplicateOf: strOrNull(raw.suspectDuplicateOf),
    errorCode: strOrNull(raw.errorCode),
    updatedAt: str(raw.updatedAt),
  };
}

export function readEntries(raw: unknown): ScanEntry[] {
  const out: ScanEntry[] = [];
  arr(raw).forEach((r) => {
    const e = readEntry(r);
    if (e) out.push(e);
  });
  return out;
}

export function readSession(raw: unknown): ScanSession | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  return {
    id: raw.id,
    saleId: strOrNull(raw.saleId),
    label: strOrNull(raw.label),
    source: str(raw.source, 'PHOTO'),
    status: oneOf<ScanSessionStatus>(raw.status, ['OPEN', 'COMMITTING', 'CLOSED', 'DISCARDED'], 'OPEN'),
    defaultGame: strOrNull(raw.defaultGame),
    defaultConditionCode: strOrNull(raw.defaultConditionCode),
    defaultFinish: strOrNull(raw.defaultFinish),
    commitMode: strOrNull(raw.commitMode),
    nextSeq: num(raw.nextSeq, 0),
    lastActivityAt: strOrNull(raw.lastActivityAt),
    createdAt: strOrNull(raw.createdAt),
  };
}

export function readCounts(raw: unknown): ScanCounts {
  const c = isRecord(raw) ? raw : {};
  return {
    needsReview: num(c.needsReview, 0),
    ready: num(c.ready, 0),
    skipped: num(c.skipped, 0),
    committed: num(c.committed, 0),
    error: num(c.error, 0),
  };
}

export function readSessionList(body: unknown): ScanSessionListItem[] {
  const d = unwrap(body);
  const out: ScanSessionListItem[] = [];
  if (!d) return out;
  arr(d.sessions).forEach((raw) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') return;
    out.push({
      id: raw.id,
      label: strOrNull(raw.label),
      source: str(raw.source, 'PHOTO'),
      status: oneOf<ScanSessionStatus>(raw.status, ['OPEN', 'COMMITTING', 'CLOSED', 'DISCARDED'], 'OPEN'),
      counts: readCounts(raw.counts),
      lastActivityAt: strOrNull(raw.lastActivityAt),
    });
  });
  return out;
}

export function readQueueState(body: unknown): ScanQueueState | null {
  const d = unwrap(body);
  if (!d) return null;
  const session = readSession(d.session);
  if (!session) return null;
  const delver = isRecord(d.delver) ? d.delver : {};
  return {
    session,
    entries: readEntries(d.entries),
    counts: readCounts(d.counts),
    catalogReady: bool(d.catalogReady),
    delver: { lastActivityAt: strOrNull(delver.lastActivityAt) },
  };
}

export function readStatus(body: unknown): ScanStatus | null {
  const d = unwrap(body);
  if (!d || typeof d.scanEnabled !== 'boolean') return null;
  const limits = isRecord(d.limits) ? d.limits : {};
  const tags = isRecord(d.smartTags) ? d.smartTags : {};
  return {
    scanEnabled: d.scanEnabled,
    providerReady: bool(d.providerReady),
    providerId: strOrNull(d.providerId),
    mode: strOrNull(d.mode),
    catalogReady: bool(d.catalogReady),
    readyGames: arr(d.readyGames).filter((g): g is string => typeof g === 'string'),
    limits: {
      maxEntries: num(limits.maxEntries, SESSION_MAX_ENTRIES),
      maxFrameBytes: num(limits.maxFrameBytes, MAX_FRAME_BYTES_DEFAULT),
      dupWindowMs: num(limits.dupWindowMs, 3000),
    },
    smartTagsRemaining: numOrNull(tags.remaining),
  };
}

export function readFrameResult(body: unknown): FrameResult | null {
  const d = unwrap(body);
  if (!d) return null;
  const entry = readEntry(d.entry);
  if (!entry) return null;
  const dup = oneOf<ScanDuplicate | ''>(d.duplicate, ['SAME_ENTRY', 'SAME_PLACEMENT', 'SAME_IMAGE', 'SUSPECT_REPEAT', ''], '');
  return { entry, duplicate: dup === '' ? null : dup, charged: bool(d.charged) };
}

export function readEntryEnvelope(body: unknown): ScanEntry | null {
  const d = unwrap(body);
  return d ? readEntry(d.entry) : null;
}

export function readSessionEnvelope(body: unknown): ScanSession | null {
  const d = unwrap(body);
  return d ? readSession(d.session) : null;
}

export function readBulkResult(body: unknown): BulkResult | null {
  const d = unwrap(body);
  if (!d || typeof d.updated !== 'number') return null;
  return { updated: num(d.updated, 0), ignored: num(d.ignored, 0) };
}

export function readCommitSummary(raw: unknown): CommitSummary {
  const s = isRecord(raw) ? raw : {};
  return {
    created: num(s.created, 0),
    merged: num(s.merged, 0),
    skipped: num(s.skipped, 0),
    errors: num(s.errors, 0),
    needsPrice: num(s.needsPrice, 0),
  };
}

export function readCommitResult(body: unknown): CommitResult | null {
  const d = unwrap(body);
  if (!d) return null;
  const notCommitted: CommitResult['notCommitted'] = [];
  arr(d.notCommitted).forEach((r) => {
    if (isRecord(r) && typeof r.entryId === 'string') notCommitted.push({ entryId: r.entryId, reason: str(r.reason) });
  });
  const failed: CommitResult['failed'] = [];
  arr(d.failed).forEach((r) => {
    if (isRecord(r) && typeof r.entryId === 'string') failed.push({ entryId: r.entryId, code: str(r.code, 'UNKNOWN'), message: str(r.message) });
  });
  return {
    batchId: strOrNull(d.batchId),
    status: str(d.status),
    summary: readCommitSummary(d.summary),
    notCommitted,
    failed,
  };
}

function readIngestToken(raw: unknown): IngestToken | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  return {
    id: raw.id,
    hint: str(raw.hint),
    url: strOrNull(raw.url),
    createdAt: strOrNull(raw.createdAt),
    lastUsedAt: strOrNull(raw.lastUsedAt),
    revokedAt: strOrNull(raw.revokedAt),
  };
}

// ---------------------------------------------------------------------------
// Request body builders
// ---------------------------------------------------------------------------

export type BuildResult<T> = { ok: true; body: T } | { ok: false; code: string };

export interface CreateSessionInput {
  saleId: string;
  label?: string | null;
  source?: string;
  defaultConditionCode?: string | null;
  defaultFinish?: string | null;
}

/** Body for POST /sessions. The label is trimmed and never cut short: more than 60 characters is refused so the seller's words are not changed. */
export function buildCreateSessionBody(input: CreateSessionInput): BuildResult<Record<string, unknown>> {
  const saleId = typeof input.saleId === 'string' ? input.saleId.trim() : '';
  if (saleId === '') return { ok: false, code: 'SALE_REQUIRED' };
  const body: Record<string, unknown> = { saleId };
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (label !== '') {
    if (label.length > SESSION_LABEL_MAX) return { ok: false, code: 'LABEL_TOO_LONG' };
    body.label = label;
  }
  body.source = input.source || 'PHOTO';
  if (input.defaultConditionCode) body.defaultConditionCode = input.defaultConditionCode;
  if (input.defaultFinish) body.defaultFinish = input.defaultFinish;
  return { ok: true, body };
}

export interface ScanEntryPatch {
  printingId?: string | null;
  acceptAsTyped?: boolean;
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
  skip?: boolean;
  countAsAnother?: boolean;
}

export function clampQuantity(n: number): number {
  if (!isFinite(n)) return QUANTITY_MIN;
  const whole = Math.floor(n);
  return whole < QUANTITY_MIN ? QUANTITY_MIN : whole > QUANTITY_MAX ? QUANTITY_MAX : whole;
}

/** Whole cents, never negative. Returns null for anything that is not a usable price. */
export function normalizePrice(n: unknown): number | null {
  if (typeof n !== 'number' || !isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Body for PATCH. Only the keys the server accepts are copied, and `ifUpdatedAt` (the updatedAt the seller was looking at)
 * is always sent so a change made somewhere else comes back as 409 ENTRY_CHANGED instead of being overwritten.
 * An unusable price is dropped and named in `dropped`; a price of null clears the price.
 */
export function buildPatchBody(patch: ScanEntryPatch, ifUpdatedAt: string | null): { body: Record<string, unknown>; dropped: string[] } {
  const body: Record<string, unknown> = {};
  const dropped: string[] = [];
  const src = patch as unknown as Record<string, unknown>;
  Object.keys(src).forEach((k) => {
    if (PATCH_KEYS.indexOf(k) < 0 || k === 'ifUpdatedAt') return;
    const v = src[k];
    if (v === undefined) return;
    if (k === 'quantity') {
      if (typeof v === 'number' && isFinite(v)) body.quantity = clampQuantity(v);
      else dropped.push(k);
      return;
    }
    if (k === 'price') {
      if (v === null) {
        body.price = null;
      } else {
        const p = normalizePrice(v);
        if (p === null) dropped.push(k);
        else body.price = p;
      }
      return;
    }
    body[k] = v;
  });
  if (ifUpdatedAt) body.ifUpdatedAt = ifUpdatedAt;
  return { body, dropped };
}

export interface ManualEntryInput {
  clientEntryId: string;
  printingId?: string | null;
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

/** Body for POST /entries: a catalog pick (printingId) or typed details (at least a card name). */
export function buildManualEntryBody(input: ManualEntryInput): BuildResult<Record<string, unknown>> {
  if (typeof input.clientEntryId !== 'string' || input.clientEntryId === '') return { ok: false, code: 'CLIENT_ID_REQUIRED' };
  const hasPick = typeof input.printingId === 'string' && input.printingId !== '';
  const hasName = typeof input.cardName === 'string' && input.cardName.trim() !== '';
  if (!hasPick && !hasName) return { ok: false, code: 'CARD_REQUIRED' };
  const body: Record<string, unknown> = {};
  const src = input as unknown as Record<string, unknown>;
  Object.keys(src).forEach((k) => {
    if (MANUAL_KEYS.indexOf(k) < 0) return;
    const v = src[k];
    if (v === undefined || v === null || v === '') return;
    if (k === 'quantity') {
      if (typeof v === 'number') body.quantity = clampQuantity(v);
      return;
    }
    if (k === 'price') {
      const p = normalizePrice(v);
      if (p !== null) body.price = p;
      return;
    }
    body[k] = typeof v === 'string' ? v.trim() : v;
  });
  return { ok: true, body };
}

export interface BulkExtras {
  conditionCode?: string | null;
  finish?: string | null;
}

/**
 * Bodies for POST /entries/bulk. The server takes up to 200 ids per call, so a longer list becomes several bodies.
 * SET_CONDITION needs a condition and SET_FINISH needs a finish; nothing is guessed.
 */
export function buildBulkBodies(action: ScanBulkAction, entryIds: string[], extras: BulkExtras): BuildResult<Array<Record<string, unknown>>> {
  if (BULK_ACTIONS.indexOf(action) < 0) return { ok: false, code: 'BAD_ACTION' };
  const ids: string[] = [];
  entryIds.forEach((id) => {
    if (typeof id === 'string' && id !== '' && ids.indexOf(id) < 0) ids.push(id);
  });
  if (ids.length === 0) return { ok: false, code: 'NO_ENTRIES' };
  if (action === 'SET_CONDITION' && !extras.conditionCode) return { ok: false, code: 'CONDITION_REQUIRED' };
  if (action === 'SET_FINISH' && !extras.finish) return { ok: false, code: 'FINISH_REQUIRED' };
  const bodies: Array<Record<string, unknown>> = [];
  for (let i = 0; i < ids.length; i += BULK_MAX_IDS) {
    const body: Record<string, unknown> = { entryIds: ids.slice(i, i + BULK_MAX_IDS), action };
    if (action === 'SET_CONDITION') body.conditionCode = extras.conditionCode;
    if (action === 'SET_FINISH') body.finish = extras.finish;
    bodies.push(body);
  }
  return { ok: true, body: bodies };
}

/** Body for POST /commit. The mode has no default: anything but ADD or REPLACE is refused here, before any request. */
export function buildCommitBody(mode: string | null | undefined, force?: boolean): BuildResult<Record<string, unknown>> {
  if (mode !== 'ADD' && mode !== 'REPLACE') return { ok: false, code: 'MODE_REQUIRED' };
  const body: Record<string, unknown> = { mode };
  if (force === true) body.force = true;
  return { ok: true, body };
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

export interface ScanClientDeps {
  fetchImpl: FetchLike;
  /** The csrf-token cookie value, or null. Sent as the x-csrf-token header like every other mutating request. */
  getCsrfToken: () => string | null;
  /** '/api' in the browser (the Next proxy keeps the login cookies on the same origin). */
  apiBase: string;
  /** Optional. Called once on a 401; return true when the session was refreshed and the request should be retried. */
  refreshSession?: () => Promise<boolean>;
  /** Test hook: the FormData constructor. */
  FormDataCtor?: { new (): FormData };
}

/** The browser wiring. Everything is read when called, never at import time. */
export function defaultScanClientDeps(refreshSession?: () => Promise<boolean>): ScanClientDeps {
  return {
    fetchImpl: (url, init) => window.fetch(url, init as RequestInit) as unknown as Promise<ResponseLike>,
    getCsrfToken: () => (typeof document !== 'undefined' ? readCsrfToken(document.cookie) : null),
    apiBase: defaultApiBase(),
    refreshSession,
  };
}

interface RequestSpec<T> {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | null | undefined>;
  json?: unknown;
  buildForm?: () => FormData;
  signal?: AbortSignal;
  read: (body: unknown) => T | null;
}

function queryString(q: RequestSpec<unknown>['query']): string {
  if (!q) return '';
  const parts: string[] = [];
  Object.keys(q).forEach((k) => {
    const v = q[k];
    if (v === null || v === undefined || v === '') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  });
  return parts.length > 0 ? '?' + parts.join('&') : '';
}

async function readJsonQuietly(res: ResponseLike): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function runScanRequest<T>(deps: ScanClientDeps, spec: RequestSpec<T>): Promise<ScanResult<T>> {
  const url = deps.apiBase.replace(/\/$/, '') + SCAN_API_PATH + spec.path + queryString(spec.query);
  let refreshed = false;
  try {
    for (;;) {
      const headers: Record<string, string> = { Accept: 'application/json' };
      let body: unknown;
      if (spec.buildForm) {
        // A new FormData every attempt: a body that was already sent cannot be sent again.
        body = spec.buildForm();
      } else if (spec.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(spec.json);
      }
      if (spec.method !== 'GET') {
        const csrf = deps.getCsrfToken();
        if (csrf) headers['x-csrf-token'] = csrf;
      }
      const init: Record<string, unknown> = { method: spec.method, headers, credentials: 'include', signal: spec.signal };
      if (body !== undefined) init.body = body;
      const res = await deps.fetchImpl(url, init);
      if (res.status === 401 && deps.refreshSession && !refreshed) {
        refreshed = true;
        let ok = false;
        try {
          ok = await deps.refreshSession();
        } catch {
          ok = false;
        }
        if (ok) continue;
      }
      const parsed = await readJsonQuietly(res);
      if (!res.ok) return { ok: false, failure: failureFromResponse(res.status, parsed) };
      const data = spec.read(parsed);
      if (data === null) return { ok: false, failure: localFailure('BAD_RESPONSE') };
      return { ok: true, data };
    }
  } catch (err) {
    return { ok: false, failure: failureFromError(err) };
  }
}

export interface FrameUpload {
  frame: Blob;
  fileName?: string;
  /** Required. The server returns the same entry for a repeat of the same id, so a retry never double counts or double charges. */
  clientEntryId: string;
  /** One id per physical card placement (from lib/cardScanCapture.ts). A second frame for the same placement returns the first entry. */
  placementId?: string | null;
  gameHint?: string | null;
}

export interface ScanClient {
  getStatus(signal?: AbortSignal): Promise<ScanResult<ScanStatus>>;
  createSession(body: Record<string, unknown>, signal?: AbortSignal): Promise<ScanResult<ScanSession>>;
  listSessions(saleId: string, signal?: AbortSignal): Promise<ScanResult<ScanSessionListItem[]>>;
  getSession(sessionId: string, opts?: { afterSeq?: number | null; limit?: number }, signal?: AbortSignal): Promise<ScanResult<ScanQueueState>>;
  postFrame(sessionId: string, upload: FrameUpload, signal?: AbortSignal): Promise<ScanResult<FrameResult>>;
  addEntry(sessionId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<ScanResult<ScanEntry>>;
  patchEntry(sessionId: string, entryId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<ScanResult<ScanEntry>>;
  bulk(sessionId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<ScanResult<BulkResult>>;
  commit(sessionId: string, mode: string | null | undefined, force?: boolean, signal?: AbortSignal): Promise<ScanResult<CommitResult>>;
  discard(sessionId: string, signal?: AbortSignal): Promise<ScanResult<{ status: string }>>;
  createIngestToken(saleId: string, signal?: AbortSignal): Promise<ScanResult<IngestToken>>;
  listIngestTokens(saleId: string, signal?: AbortSignal): Promise<ScanResult<IngestToken[]>>;
  revokeIngestToken(tokenId: string, signal?: AbortSignal): Promise<ScanResult<{ revoked: boolean }>>;
}

function sid(sessionId: string): string {
  return '/sessions/' + encodeURIComponent(sessionId);
}

export function createScanClient(deps: ScanClientDeps): ScanClient {
  return {
    getStatus: (signal) => runScanRequest(deps, { method: 'GET', path: '/status', signal, read: readStatus }),

    createSession: (body, signal) =>
      runScanRequest(deps, { method: 'POST', path: '/sessions', json: body, signal, read: readSessionEnvelope }),

    listSessions: (saleId, signal) =>
      runScanRequest(deps, { method: 'GET', path: '/sessions', query: { saleId }, signal, read: (b) => (unwrap(b) ? readSessionList(b) : null) }),

    getSession: (sessionId, opts, signal) => {
      const limit = opts && typeof opts.limit === 'number' ? Math.max(1, Math.min(PAGE_LIMIT_MAX, Math.floor(opts.limit))) : PAGE_LIMIT_MAX;
      const afterSeq = opts && typeof opts.afterSeq === 'number' && opts.afterSeq >= 0 ? Math.floor(opts.afterSeq) : null;
      return runScanRequest(deps, { method: 'GET', path: sid(sessionId), query: { afterSeq, limit }, signal, read: readQueueState });
    },

    postFrame: (sessionId, upload, signal) =>
      runScanRequest(deps, {
        method: 'POST',
        path: sid(sessionId) + '/frames',
        signal,
        buildForm: () => {
          const Ctor: { new (): FormData } = deps.FormDataCtor || FormData;
          const form = new Ctor();
          form.append('frame', upload.frame, upload.fileName || 'card.jpg');
          form.append('clientEntryId', upload.clientEntryId);
          if (upload.placementId) form.append('placementId', upload.placementId);
          if (upload.gameHint) form.append('gameHint', upload.gameHint);
          return form;
        },
        read: readFrameResult,
      }),

    addEntry: (sessionId, body, signal) =>
      runScanRequest(deps, { method: 'POST', path: sid(sessionId) + '/entries', json: body, signal, read: readEntryEnvelope }),

    patchEntry: (sessionId, entryId, body, signal) =>
      runScanRequest(deps, { method: 'PATCH', path: sid(sessionId) + '/entries/' + encodeURIComponent(entryId), json: body, signal, read: readEntryEnvelope }),

    bulk: (sessionId, body, signal) =>
      runScanRequest(deps, { method: 'POST', path: sid(sessionId) + '/entries/bulk', json: body, signal, read: readBulkResult }),

    commit: async (sessionId, mode, force, signal) => {
      const built = buildCommitBody(mode, force);
      if (!built.ok) return { ok: false, failure: localFailure(built.code) };
      return runScanRequest(deps, { method: 'POST', path: sid(sessionId) + '/commit', json: built.body, signal, read: readCommitResult });
    },

    discard: (sessionId, signal) =>
      runScanRequest(deps, {
        method: 'POST',
        path: sid(sessionId) + '/discard',
        json: {},
        signal,
        read: (b) => {
          const d = unwrap(b);
          return d ? { status: str(d.status, 'DISCARDED') } : null;
        },
      }),

    createIngestToken: (saleId, signal) =>
      runScanRequest(deps, { method: 'POST', path: '/ingest-tokens', json: { saleId }, signal, read: (b) => readIngestToken(unwrap(b)) }),

    listIngestTokens: (saleId, signal) =>
      runScanRequest(deps, {
        method: 'GET',
        path: '/ingest-tokens',
        query: { saleId },
        signal,
        read: (b) => {
          const d = unwrap(b);
          if (!d) return null;
          const out: IngestToken[] = [];
          arr(d.tokens).forEach((t) => {
            const tok = readIngestToken(t);
            if (tok) out.push(tok);
          });
          return out;
        },
      }),

    revokeIngestToken: (tokenId, signal) =>
      runScanRequest(deps, {
        method: 'DELETE',
        path: '/ingest-tokens/' + encodeURIComponent(tokenId),
        signal,
        read: (b) => {
          const d = unwrap(b);
          return d ? { revoked: d.revoked === true } : null;
        },
      }),
  };
}

// ---------------------------------------------------------------------------
// Loading a whole queue
// ---------------------------------------------------------------------------

/** Upper bound on pages for one load: 20 pages of 200 covers the 2,000 entry session cap. */
export const MAX_PAGES = 20;

/**
 * Loads every entry after `afterSeq` (default: all), one page of up to 200 at a time, until a short page comes back.
 * The session, counts and Delver status come from the last page. Stops with the failure if any page fails.
 */
export async function fetchAllEntries(
  client: ScanClient,
  sessionId: string,
  opts: { afterSeq?: number | null; signal?: AbortSignal } = {},
): Promise<ScanResult<ScanQueueState>> {
  let afterSeq: number | null = typeof opts.afterSeq === 'number' ? opts.afterSeq : null;
  let merged: ScanQueueState | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await client.getSession(sessionId, { afterSeq, limit: PAGE_LIMIT_MAX }, opts.signal);
    if (!res.ok) return res;
    const data = res.data;
    const entries: ScanQueueState['entries'] = merged ? merged.entries.concat(data.entries) : data.entries;
    merged = { session: data.session, entries, counts: data.counts, catalogReady: data.catalogReady, delver: data.delver };
    if (data.entries.length < PAGE_LIMIT_MAX) break;
    const last = data.entries[data.entries.length - 1];
    if (typeof afterSeq === 'number' && last.seq <= afterSeq) break;
    afterSeq = last.seq;
  }
  if (!merged) return { ok: false, failure: localFailure('BAD_RESPONSE') };
  return { ok: true, data: merged };
}
