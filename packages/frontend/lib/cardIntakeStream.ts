/**
 * cardIntakeStream (ADR-134 #642, batch B8): the confirm call and its NDJSON progress stream.
 *
 * Why fetch and not axios: the confirm response is application/x-ndjson, written line by line while the import runs,
 * and axios cannot read a response body as it arrives in the browser. This file reads it with a ReadableStream reader.
 *
 * Contract (services/cardIntake/intakeService.ts, controllers/cardIntakeController.ts, commit.ts):
 *   - Failures before any byte is streamed are plain JSON: { success:false, error, code, ...extra } with an HTTP status
 *     (409 ALREADY_APPLIED carries extra.summary and is NOT a failure for the seller).
 *   - Then one JSON object per line:
 *       { type:'progress', phase:'reading'|'writing', processed, total, created?, merged?, skipped?, errors? }
 *       { type:'rowError', row, code, field, message, source, csvLine, replayed? }
 *       { type:'done', status:'COMPLETED'|'CANCELLED', batchId, resumed, summary, errorsCsvHeader }
 *       { type:'fatal', code, message }
 *   - Cancel = AbortController.abort(), then send the same file again to resume from the saved cursor.
 *   - A rowError with replayed:true was already counted on an earlier run; errors are stored once per row, so a resumed
 *     run still produces a complete errors.csv.
 *
 * Nothing here has a timeout: a pause of any length while the server works does not end the stream. The screens only
 * show a "still working" note after STALL_AFTER_MS without an event.
 *
 * No React, no axios, no env reads at import time. fetch, the CSRF cookie and the base URL are injected, so
 * lib/__tests__/cardIntakeStream.test.ts runs everything with fakes.
 */
import { IntakeFailure, BatchSummary, abortedFailure, buildForm, failureFromError, failureFromResponse, networkFailure, readBatchSummary } from './cardIntake';

export const STALL_AFTER_MS = 20000;
/** errors.csv is built in the browser; past this many characters further lines are not kept and the file says so. */
export const MAX_ERROR_CHARS = 40000000;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface ProgressEvent {
  type: 'progress';
  phase: 'reading' | 'writing';
  processed: number;
  total: number;
  created: number | null;
  merged: number | null;
  skipped: number | null;
  errors: number | null;
}
export interface RowErrorEvent {
  type: 'rowError';
  row: number;
  code: string;
  field: string | null;
  message: string;
  csvLine: string;
  replayed: boolean;
}
export interface DoneSummary {
  rowsTotal: number;
  created: number;
  merged: number;
  skipped: number;
  errors: number;
  noCatalogMatch: number;
  needsPrice: number;
  warnings: Record<string, number>;
}
export interface DoneEvent {
  type: 'done';
  status: 'COMPLETED' | 'CANCELLED';
  batchId: string | null;
  resumed: boolean;
  summary: DoneSummary;
  errorsCsvHeader: string;
}
export interface FatalEvent {
  type: 'fatal';
  code: string;
  message: string;
}
export type ConfirmEvent = ProgressEvent | RowErrorEvent | DoneEvent | FatalEvent;

function rec(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function n(v: unknown, fallback = 0): number {
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}
function nOrNull(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/** Validates one parsed line. Unknown or malformed events give null and are ignored. */
export function classifyEvent(raw: unknown): ConfirmEvent | null {
  if (!rec(raw) || typeof raw.type !== 'string') return null;
  if (raw.type === 'progress') {
    return {
      type: 'progress',
      phase: raw.phase === 'reading' ? 'reading' : 'writing',
      processed: n(raw.processed),
      total: n(raw.total),
      created: nOrNull(raw.created),
      merged: nOrNull(raw.merged),
      skipped: nOrNull(raw.skipped),
      errors: nOrNull(raw.errors),
    };
  }
  if (raw.type === 'rowError') {
    if (typeof raw.row !== 'number' || typeof raw.csvLine !== 'string') return null;
    return {
      type: 'rowError',
      row: raw.row,
      code: typeof raw.code === 'string' ? raw.code : '',
      field: typeof raw.field === 'string' ? raw.field : null,
      message: typeof raw.message === 'string' ? raw.message : '',
      csvLine: raw.csvLine,
      replayed: raw.replayed === true,
    };
  }
  if (raw.type === 'done') {
    const s = rec(raw.summary) ? raw.summary : {};
    const warnings: Record<string, number> = {};
    if (rec(s.warnings)) {
      Object.keys(s.warnings).forEach((k) => {
        const v = (s.warnings as Record<string, unknown>)[k];
        if (typeof v === 'number') Object.defineProperty(warnings, k, { value: v, enumerable: true, writable: true, configurable: true });
      });
    }
    return {
      type: 'done',
      status: raw.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
      batchId: typeof raw.batchId === 'string' ? raw.batchId : null,
      resumed: raw.resumed === true,
      summary: {
        rowsTotal: n(s.rowsTotal),
        created: n(s.created),
        merged: n(s.merged),
        skipped: n(s.skipped),
        errors: n(s.errors),
        noCatalogMatch: n(s.noCatalogMatch),
        needsPrice: n(s.needsPrice),
        warnings,
      },
      errorsCsvHeader: typeof raw.errorsCsvHeader === 'string' ? raw.errorsCsvHeader : '',
    };
  }
  if (raw.type === 'fatal') {
    return { type: 'fatal', code: typeof raw.code === 'string' ? raw.code : 'SERVER_ERROR', message: typeof raw.message === 'string' ? raw.message : '' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// NDJSON line parser
// ---------------------------------------------------------------------------

export interface NdjsonParser {
  /** Feed decoded text; returns the complete events found so far. A partial last line waits for the next chunk. */
  push(text: string): ConfirmEvent[];
  /** Call once at the end of the stream; parses a last line that had no newline. */
  flush(): ConfirmEvent[];
  badLines(): number;
}

export function createNdjsonParser(): NdjsonParser {
  let buffer = '';
  let bad = 0;
  const parseLine = (line: string, out: ConfirmEvent[]) => {
    const t = line.trim();
    if (t === '') return;
    try {
      const ev = classifyEvent(JSON.parse(t));
      if (ev) out.push(ev);
      else bad += 1;
    } catch {
      bad += 1;
    }
  };
  return {
    push(text: string): ConfirmEvent[] {
      buffer += text;
      const out: ConfirmEvent[] = [];
      let idx = buffer.indexOf('\n');
      while (idx >= 0) {
        parseLine(buffer.slice(0, idx), out);
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf('\n');
      }
      return out;
    },
    flush(): ConfirmEvent[] {
      const out: ConfirmEvent[] = [];
      parseLine(buffer, out);
      buffer = '';
      return out;
    },
    badLines: () => bad,
  };
}

export interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}

/**
 * Reads the body to its end and calls onEvent for every event, in order. Multi-byte characters split across chunks are
 * decoded correctly. Returns whether a terminal event (done or fatal) was seen. A reader error is thrown to the caller.
 */
export async function readNdjsonStream(reader: ByteReader, onEvent: (e: ConfirmEvent) => void): Promise<{ sawTerminal: boolean; badLines: number }> {
  const decoder = new TextDecoder('utf-8');
  const parser = createNdjsonParser();
  let sawTerminal = false;
  const deliver = (events: ConfirmEvent[]) => {
    events.forEach((e) => {
      if (e.type === 'done' || e.type === 'fatal') sawTerminal = true;
      onEvent(e);
    });
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length) deliver(parser.push(decoder.decode(value, { stream: true })));
  }
  deliver(parser.push(decoder.decode()));
  deliver(parser.flush());
  return { sawTerminal, badLines: parser.badLines() };
}

// ---------------------------------------------------------------------------
// Import state
// ---------------------------------------------------------------------------

export type ImportStatus = 'idle' | 'running' | 'done' | 'stopped' | 'failed' | 'interrupted' | 'already';

export interface RowErrorRecord {
  row: number;
  code: string;
  message: string;
  csvLine: string;
}

export interface ImportState {
  status: ImportStatus;
  phase: 'reading' | 'writing' | null;
  processed: number;
  total: number;
  created: number;
  merged: number;
  skipped: number;
  errors: number;
  startedAt: number | null;
  lastEventAt: number | null;
  /** One record per row number: a replayed error overwrites its own earlier copy instead of doubling it. */
  rowErrors: Record<number, RowErrorRecord>;
  rowErrorChars: number;
  errorsTruncated: boolean;
  done: DoneEvent | null;
  /** Set for failed, interrupted and already. */
  failure: IntakeFailure | null;
  alreadySummary: BatchSummary | null;
}

export const INITIAL_IMPORT_STATE: ImportState = {
  status: 'idle',
  phase: null,
  processed: 0,
  total: 0,
  created: 0,
  merged: 0,
  skipped: 0,
  errors: 0,
  startedAt: null,
  lastEventAt: null,
  rowErrors: {},
  rowErrorChars: 0,
  errorsTruncated: false,
  done: null,
  failure: null,
  alreadySummary: null,
};

export type ImportAction =
  | { type: 'reset' }
  | { type: 'start'; now: number }
  | { type: 'event'; event: ConfirmEvent; now: number }
  | { type: 'streamEnded' }
  | { type: 'failure'; failure: IntakeFailure };

export function reduceImport(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case 'reset':
      return INITIAL_IMPORT_STATE;
    case 'start':
      // A resumed run replays earlier row errors, so the error store starts empty every time.
      return { ...INITIAL_IMPORT_STATE, status: 'running', startedAt: action.now, lastEventAt: action.now };
    case 'event': {
      const e = action.event;
      if (e.type === 'progress') {
        return {
          ...state,
          lastEventAt: action.now,
          phase: e.phase,
          processed: e.processed,
          total: e.total,
          created: e.created === null ? state.created : e.created,
          merged: e.merged === null ? state.merged : e.merged,
          skipped: e.skipped === null ? state.skipped : e.skipped,
          errors: e.errors === null ? state.errors : e.errors,
        };
      }
      if (e.type === 'rowError') {
        const already = Object.prototype.hasOwnProperty.call(state.rowErrors, e.row);
        const cost = e.csvLine.length + 1;
        if (!already && state.rowErrorChars + cost > MAX_ERROR_CHARS) {
          return { ...state, lastEventAt: action.now, errorsTruncated: true };
        }
        const rowErrors = { ...state.rowErrors };
        rowErrors[e.row] = { row: e.row, code: e.code, message: e.message, csvLine: e.csvLine };
        return { ...state, lastEventAt: action.now, rowErrors, rowErrorChars: already ? state.rowErrorChars : state.rowErrorChars + cost };
      }
      if (e.type === 'done') {
        return {
          ...state,
          lastEventAt: action.now,
          status: e.status === 'CANCELLED' ? 'stopped' : 'done',
          done: e,
          processed: e.status === 'COMPLETED' ? Math.max(state.processed, e.summary.rowsTotal) : state.processed,
          total: Math.max(state.total, e.summary.rowsTotal),
          created: e.summary.created,
          merged: e.summary.merged,
          skipped: e.summary.skipped,
          errors: e.summary.errors,
        };
      }
      // fatal
      return {
        ...state,
        lastEventAt: action.now,
        status: 'failed',
        failure: failureFromResponse(500, { success: false, error: e.message || undefined, code: e.code }),
      };
    }
    case 'streamEnded':
      // The body ended without a done or fatal line: the connection dropped. Progress is saved on the server.
      if (state.status !== 'running') return state;
      return { ...state, status: 'interrupted', failure: { ...networkFailure(), code: 'INTERRUPTED' } };
    case 'failure': {
      if (action.failure.kind === 'aborted') return { ...state, status: 'stopped', failure: action.failure };
      if (action.failure.code === 'ALREADY_APPLIED') {
        return { ...state, status: 'already', failure: action.failure, alreadySummary: action.failure.summary };
      }
      return { ...state, status: action.failure.kind === 'network' ? 'interrupted' : 'failed', failure: action.failure };
    }
    default:
      return state;
  }
}

/** Whole-number percent for a progress bar, clamped to 0..100. 100 only when processed has reached total. */
export function percentOf(processed: number, total: number): number {
  if (!(total > 0) || !(processed > 0)) return 0;
  return Math.max(0, Math.min(100, Math.floor((processed / total) * 100)));
}

/** True when no event has arrived for a while. Used only to show a calm "still working" note, never to stop the import. */
export function isStalled(lastEventAt: number | null, now: number, thresholdMs: number = STALL_AFTER_MS): boolean {
  if (lastEventAt === null) return false;
  return now - lastEventAt >= thresholdMs;
}

/** errors.csv lines in file order. */
export function errorLines(state: Pick<ImportState, 'rowErrors'>): string[] {
  return Object.keys(state.rowErrors)
    .map(Number)
    .sort((a, b) => a - b)
    .map((row) => state.rowErrors[row].csvLine);
}

export function errorRecords(state: Pick<ImportState, 'rowErrors'>, limit: number): RowErrorRecord[] {
  return Object.keys(state.rowErrors)
    .map(Number)
    .sort((a, b) => a - b)
    .slice(0, limit)
    .map((row) => state.rowErrors[row]);
}

export function errorCount(state: Pick<ImportState, 'rowErrors'>): number {
  return Object.keys(state.rowErrors).length;
}

export function errorsByCode(state: Pick<ImportState, 'rowErrors'>): Record<string, number> {
  const out: Record<string, number> = {};
  Object.keys(state.rowErrors).forEach((k) => {
    const code = state.rowErrors[Number(k)].code || 'UNKNOWN';
    const prev = Object.prototype.hasOwnProperty.call(out, code) ? out[code] : 0;
    Object.defineProperty(out, code, { value: prev + 1, enumerable: true, writable: true, configurable: true });
  });
  return out;
}

// ---------------------------------------------------------------------------
// The confirm request
// ---------------------------------------------------------------------------

/** The slice of the fetch Response this file uses (the browser's Response satisfies it; tests pass a fake). */
export interface ResponseLike {
  ok: boolean;
  status: number;
  body?: { getReader(): ByteReader } | null;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type FetchLike = (url: string, init: Record<string, unknown>) => Promise<ResponseLike>;

export interface ConfirmDeps {
  fetchImpl: FetchLike;
  /** The csrf-token cookie value, or null. Sent as the x-csrf-token header like every other mutating request. */
  getCsrfToken: () => string | null;
  /** '/api' in the browser (the Next proxy keeps the login cookies on the same origin). */
  apiBase: string;
  /** Optional. Called once on a 401; return true when the session was refreshed and the request should be retried. */
  refreshSession?: () => Promise<boolean>;
}

export interface ConfirmArgs {
  saleId: string;
  file: Blob;
  fileName: string;
  fields: Array<[string, string]>;
  signal?: AbortSignal;
  onEvent: (e: ConfirmEvent) => void;
  /** Test hook: the FormData constructor. */
  FormDataCtor?: { new (): FormData };
}

export type ConfirmOutcome = { kind: 'stream'; sawTerminal: boolean } | { kind: 'failure'; failure: IntakeFailure };

/** Same lookup as lib/api.ts: the csrf-token cookie, raw value. */
export function readCsrfToken(cookieString: string): string | null {
  const row = cookieString.split('; ').filter((r) => r.indexOf('csrf-token=') === 0)[0];
  if (!row) return null;
  const value = row.split('=')[1];
  return value ? value : null;
}

/** '/api' in the browser, the configured API address on the server. Read when called, never at import time. */
export function defaultApiBase(): string {
  if (typeof window !== 'undefined') return '/api';
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
}

async function readJsonQuietly(res: ResponseLike): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function runConfirm(deps: ConfirmDeps, args: ConfirmArgs): Promise<ConfirmOutcome> {
  const url = deps.apiBase.replace(/\/$/, '') + '/card-intake/' + encodeURIComponent(args.saleId) + '/confirm';
  let refreshed = false;
  try {
    for (;;) {
      // A new FormData every attempt: a body that was already sent cannot be sent again.
      const form = buildForm(args.fields, args.file, args.fileName, args.FormDataCtor);
      const headers: Record<string, string> = { Accept: 'application/x-ndjson, application/json' };
      const csrf = deps.getCsrfToken();
      if (csrf) headers['x-csrf-token'] = csrf;
      const res = await deps.fetchImpl(url, { method: 'POST', body: form, headers, credentials: 'include', signal: args.signal });
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
      if (!res.ok) {
        return { kind: 'failure', failure: failureFromResponse(res.status, await readJsonQuietly(res)) };
      }
      let sawTerminal = false;
      try {
        if (res.body && typeof res.body.getReader === 'function') {
          sawTerminal = (await readNdjsonStream(res.body.getReader(), args.onEvent)).sawTerminal;
        } else {
          // No streaming support: read everything at once. The import still works; there is just no live progress.
          const parser = createNdjsonParser();
          const events = parser.push(await res.text()).concat(parser.flush());
          events.forEach((e) => {
            if (e.type === 'done' || e.type === 'fatal') sawTerminal = true;
            args.onEvent(e);
          });
        }
      } catch (err) {
        const f = failureFromError(err);
        if (f.kind === 'aborted') return { kind: 'failure', failure: abortedFailure() };
        // The connection dropped mid-stream: progress is saved, the seller can resume.
        return { kind: 'stream', sawTerminal: false };
      }
      return { kind: 'stream', sawTerminal };
    }
  } catch (err) {
    return { kind: 'failure', failure: failureFromError(err) };
  }
}

/** Convenience for the 409 body: the summary of the earlier import. */
export function alreadyAppliedSummary(extra: Record<string, unknown> | null): BatchSummary | null {
  return extra && rec(extra.summary) ? readBatchSummary(extra.summary) : null;
}
