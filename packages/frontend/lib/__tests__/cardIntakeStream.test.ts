/**
 * cardIntakeStream (ADR-134 batch B8): the confirm call, the NDJSON reader and the import state.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_IMPORT_STATE,
  STALL_AFTER_MS,
  classifyEvent,
  createNdjsonParser,
  errorCount,
  errorLines,
  errorRecords,
  errorsByCode,
  isStalled,
  percentOf,
  readCsrfToken,
  readNdjsonStream,
  reduceImport,
  runConfirm,
  type ByteReader,
  type ConfirmEvent,
  type ConfirmDeps,
  type ImportState,
  type ResponseLike,
} from '../cardIntakeStream';

const enc = new TextEncoder();

function line(o: unknown): string {
  return JSON.stringify(o) + '\n';
}
const PROGRESS = (processed: number, total: number, phase = 'writing') => ({ type: 'progress', phase, processed, total, created: processed, merged: 0, skipped: 0, errors: 0 });
const ROW_ERROR = (row: number, replayed = false) => ({ type: 'rowError', row, code: 'BAD_QUANTITY', field: 'quantity', message: 'The quantity must be a whole number from 1 to 10,000.', source: {}, csvLine: `"Card ${row}",0,"The quantity must be a whole number from 1 to 10,000."`, ...(replayed ? { replayed: true } : {}) });
const DONE = (over: Record<string, unknown> = {}) => ({ type: 'done', status: 'COMPLETED', batchId: 'b1', resumed: false, summary: { rowsTotal: 10, created: 8, merged: 1, skipped: 0, errors: 1, noCatalogMatch: 2, needsPrice: 3, warnings: { DUPLICATE_IN_FILE_MERGED: 1 } }, errorsCsvHeader: 'Name,Qty,FindASale Error', ...over });

function readerOf(chunks: Array<Uint8Array | (() => Promise<Uint8Array>) | Error>): ByteReader {
  let i = 0;
  return {
    async read() {
      if (i >= chunks.length) return { done: true };
      const next = chunks[i++];
      if (next instanceof Error) throw next;
      const value = typeof next === 'function' ? await next() : next;
      return { done: false, value };
    },
  };
}

function okResponse(reader: ByteReader): ResponseLike {
  return { ok: true, status: 200, body: { getReader: () => reader }, json: async () => ({}), text: async () => '' };
}
function jsonResponse(status: number, body: unknown): ResponseLike {
  return { ok: false, status, body: null, json: async () => body, text: async () => JSON.stringify(body) };
}
function deps(fetchImpl: ConfirmDeps['fetchImpl'], extra: Partial<ConfirmDeps> = {}): ConfirmDeps {
  return { fetchImpl, getCsrfToken: () => 'tok123', apiBase: '/api', ...extra };
}
function args(onEvent: (e: ConfirmEvent) => void, signal?: AbortSignal) {
  return { saleId: 'sale 1', file: new Blob(['Name\nBolt\n']), fileName: 'cards.csv', fields: [['mode', 'ADD'] as [string, string], ['fileSha256', 'a'.repeat(64)] as [string, string]], signal, onEvent };
}
const tick = () => new Promise<void>((r) => setImmediate(r));

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test('the parser waits for the end of a line and tolerates blank and broken lines', () => {
  const p = createNdjsonParser();
  assert.deepEqual(p.push('{"type":"progress","phase":"writing","proc'), []);
  const first = p.push('essed":5,"total":10}\n\n{"type":"progress",');
  assert.equal(first.length, 1);
  assert.equal(first[0].type, 'progress');
  const rest = p.push('"processed":6,"total":10}\nnot json\n{"type":"mystery"}\n{"type":"fatal","code":"SERVER_ERROR","message":"x"}');
  assert.equal(rest.length, 1);
  const tail = p.flush();
  assert.equal(tail.length, 1);
  assert.equal(tail[0].type, 'fatal');
  assert.equal(p.badLines(), 2);
});

test('classifyEvent validates every event type and drops malformed ones', () => {
  assert.equal(classifyEvent({ type: 'progress', phase: 'reading', processed: 500, total: 2000 })?.type, 'progress');
  const reading = classifyEvent({ type: 'progress', phase: 'reading', processed: 500, total: 2000 });
  assert.equal(reading?.type === 'progress' && reading.created, null);
  assert.equal(classifyEvent({ type: 'rowError', row: 'x', csvLine: 'a' }), null);
  assert.equal(classifyEvent({ type: 'rowError', row: 3 }), null);
  assert.equal(classifyEvent({ type: 'rowError', row: 3, csvLine: 'a' })?.type, 'rowError');
  const done = classifyEvent(DONE({ status: 'CANCELLED' }));
  assert.equal(done?.type === 'done' && done.status, 'CANCELLED');
  assert.equal(classifyEvent({ type: 'fatal' })?.type, 'fatal');
  assert.equal(classifyEvent(null), null);
  assert.equal(classifyEvent([]), null);
  assert.equal(classifyEvent({ type: 5 }), null);
});

test('readNdjsonStream delivers events in order and decodes a multi-byte letter split across two chunks', async () => {
  const text = line(PROGRESS(1, 2)) + line({ ...ROW_ERROR(3), message: 'Café über' }) + line(DONE());
  const bytes = enc.encode(text);
  // Cut in the middle of the two-byte "é".
  const cut = bytes.indexOf(0xc3) + 1;
  const events: ConfirmEvent[] = [];
  const res = await readNdjsonStream(readerOf([bytes.slice(0, cut), bytes.slice(cut)]), (e) => events.push(e));
  assert.equal(res.sawTerminal, true);
  assert.deepEqual(events.map((e) => e.type), ['progress', 'rowError', 'done']);
  const re = events[1];
  assert.equal(re.type === 'rowError' && re.message, 'Café über');
});

test('a stream that ends without done or fatal says so', async () => {
  const events: ConfirmEvent[] = [];
  const res = await readNdjsonStream(readerOf([enc.encode(line(PROGRESS(1, 5)))]), (e) => events.push(e));
  assert.equal(res.sawTerminal, false);
  assert.equal(events.length, 1);
});

test('a last line with no newline is still read', async () => {
  const events: ConfirmEvent[] = [];
  const res = await readNdjsonStream(readerOf([enc.encode(JSON.stringify(DONE()))]), (e) => events.push(e));
  assert.equal(res.sawTerminal, true);
  assert.equal(events.length, 1);
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function feed(state: ImportState, events: unknown[], now = 1000): ImportState {
  let s = state;
  for (const raw of events) {
    const e = classifyEvent(raw);
    assert.ok(e, 'event should classify');
    s = reduceImport(s, { type: 'event', event: e as ConfirmEvent, now });
  }
  return s;
}

test('progress, row errors and done build the final state', () => {
  let s = reduceImport(INITIAL_IMPORT_STATE, { type: 'start', now: 1000 });
  assert.equal(s.status, 'running');
  s = feed(s, [PROGRESS(0, 10, 'reading'), PROGRESS(10, 10, 'reading')], 2000);
  assert.equal(s.phase, 'reading');
  s = feed(s, [PROGRESS(5, 10), ROW_ERROR(4), PROGRESS(10, 10)], 3000);
  assert.equal(s.phase, 'writing');
  assert.equal(s.processed, 10);
  assert.equal(s.lastEventAt, 3000);
  s = feed(s, [DONE()], 4000);
  assert.equal(s.status, 'done');
  assert.equal(s.created, 8);
  assert.equal(s.done?.summary.needsPrice, 3);
  assert.equal(errorCount(s), 1);
  assert.deepEqual(errorLines(s), ['"Card 4",0,"The quantity must be a whole number from 1 to 10,000."']);
  assert.deepEqual(errorsByCode(s), { BAD_QUANTITY: 1 });
});

test('a reading-phase progress event keeps the writing counters', () => {
  let s = reduceImport(INITIAL_IMPORT_STATE, { type: 'start', now: 0 });
  s = feed(s, [PROGRESS(40, 100), { type: 'progress', phase: 'reading', processed: 500, total: 2000 }]);
  assert.equal(s.created, 40);
  assert.equal(s.processed, 500);
});

test('replayed row errors from a resumed run are stored once per row, in file order', () => {
  let s = reduceImport(INITIAL_IMPORT_STATE, { type: 'start', now: 0 });
  s = feed(s, [ROW_ERROR(9, true), ROW_ERROR(2, true), ROW_ERROR(2), ROW_ERROR(30)]);
  assert.equal(errorCount(s), 3);
  assert.deepEqual(errorRecords(s, 2).map((r) => r.row), [2, 9]);
  assert.equal(errorLines(s).length, 3);
  assert.ok(errorLines(s)[0].indexOf('Card 2') > 0);
});

test('starting again clears the previous run so a resume cannot double its errors', () => {
  let s = reduceImport(INITIAL_IMPORT_STATE, { type: 'start', now: 0 });
  s = feed(s, [ROW_ERROR(2), PROGRESS(5, 10)]);
  s = reduceImport(s, { type: 'streamEnded' });
  assert.equal(s.status, 'interrupted');
  s = reduceImport(s, { type: 'start', now: 5000 });
  assert.equal(s.status, 'running');
  assert.equal(errorCount(s), 0);
  assert.equal(s.failure, null);
});

test('a stream that ended early is "interrupted", never "done"', () => {
  let s = reduceImport(INITIAL_IMPORT_STATE, { type: 'start', now: 0 });
  s = feed(s, [PROGRESS(3, 10)]);
  s = reduceImport(s, { type: 'streamEnded' });
  assert.equal(s.status, 'interrupted');
  const finished = reduceImport(feed(reduceImport(INITIAL_IMPORT_STATE, { type: 'start', now: 0 }), [DONE()]), { type: 'streamEnded' });
  assert.equal(finished.status, 'done');
});

test('a CANCELLED done event is "stopped", and a fatal event is "failed" with the server text', () => {
  let s = reduceImport(INITIAL_IMPORT_STATE, { type: 'start', now: 0 });
  const stopped = feed(s, [DONE({ status: 'CANCELLED', batchId: null })]);
  assert.equal(stopped.status, 'stopped');
  const failed = feed(s, [{ type: 'fatal', code: 'SERVER_ERROR', message: 'Something went wrong while importing. Your progress was saved and you can try again.' }]);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failure?.message, 'Something went wrong while importing. Your progress was saved and you can try again.');
  const noText = feed(s, [{ type: 'fatal', code: 'SERVER_ERROR' }]);
  assert.ok((noText.failure?.message ?? '').length > 5);
});

test('409 ALREADY_APPLIED becomes "already imported" with the earlier summary, not a failure', () => {
  const s = reduceImport(reduceImport(INITIAL_IMPORT_STATE, { type: 'start', now: 0 }), {
    type: 'failure',
    failure: { kind: 'http', status: 409, code: 'ALREADY_APPLIED', message: 'This file was already imported. Nothing was changed.', help: 'Nothing was changed.', extra: null, summary: { batchId: 'b', mode: 'ADD', status: 'COMPLETED', rowsTotal: 10, committedThroughRow: 10, created: 9, merged: 0, skipped: 0, errors: 1 } },
  });
  assert.equal(s.status, 'already');
  assert.equal(s.alreadySummary?.created, 9);
});

test('other failures: abort is "stopped", a dropped connection is "interrupted", a refusal is "failed"', () => {
  const running = reduceImport(INITIAL_IMPORT_STATE, { type: 'start', now: 0 });
  const mk = (kind: 'http' | 'network' | 'aborted', code: string) => ({ kind, status: kind === 'http' ? 400 : null, code, message: 'm', help: 'h', extra: null, summary: null });
  assert.equal(reduceImport(running, { type: 'failure', failure: mk('aborted', 'CANCELLED') }).status, 'stopped');
  assert.equal(reduceImport(running, { type: 'failure', failure: mk('network', 'NETWORK_ERROR') }).status, 'interrupted');
  assert.equal(reduceImport(running, { type: 'failure', failure: mk('http', 'FILE_CHANGED') }).status, 'failed');
});

test('percent is clamped and 0 until there is something to count', () => {
  assert.equal(percentOf(0, 0), 0);
  assert.equal(percentOf(5, 0), 0);
  assert.equal(percentOf(1, 3), 33);
  assert.equal(percentOf(10, 10), 100);
  assert.equal(percentOf(15, 10), 100);
  assert.equal(percentOf(-3, 10), 0);
});

test('stall note appears after a quiet spell and never when nothing has started', () => {
  assert.equal(isStalled(null, 99999), false);
  assert.equal(isStalled(1000, 1000 + STALL_AFTER_MS - 1), false);
  assert.equal(isStalled(1000, 1000 + STALL_AFTER_MS), true);
  assert.equal(isStalled(1000, 1000 + 30000), true);
});

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

test('csrf token comes from the csrf-token cookie like every other mutating request', () => {
  assert.equal(readCsrfToken('a=1; csrf-token=abc123; b=2'), 'abc123');
  assert.equal(readCsrfToken('a=1'), null);
  assert.equal(readCsrfToken(''), null);
});

test('confirm posts the file and fields with the CSRF header, cookies included, to the right URL', async () => {
  const seen: Array<{ url: string; init: Record<string, any> }> = [];
  const events: ConfirmEvent[] = [];
  const out = await runConfirm(
    deps(async (url, init) => {
      seen.push({ url, init });
      return okResponse(readerOf([enc.encode(line(PROGRESS(1, 1)) + line(DONE()))]));
    }),
    args((e) => events.push(e))
  );
  assert.deepEqual(out, { kind: 'stream', sawTerminal: true });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, '/api/card-intake/sale%201/confirm');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.credentials, 'include');
  assert.equal(seen[0].init.headers['x-csrf-token'], 'tok123');
  assert.equal(seen[0].init.headers['Content-Type'], undefined, 'the browser must set the multipart boundary');
  const keys: string[] = [];
  (seen[0].init.body as FormData).forEach((_v, k) => keys.push(k));
  assert.deepEqual(keys, ['mode', 'fileSha256', 'file']);
  assert.deepEqual(events.map((e) => e.type), ['progress', 'done']);
});

test('no CSRF cookie means no header, not an empty one', async () => {
  let headers: Record<string, string> = {};
  await runConfirm(
    deps(async (_u, init) => {
      headers = init.headers as Record<string, string>;
      return okResponse(readerOf([enc.encode(line(DONE()))]));
    }, { getCsrfToken: () => null }),
    args(() => undefined)
  );
  assert.equal('x-csrf-token' in headers, false);
});

test('409 ALREADY_APPLIED comes back as a failure result carrying the earlier summary', async () => {
  const out = await runConfirm(
    deps(async () => jsonResponse(409, { success: false, error: 'This file was already imported. Nothing was changed.', code: 'ALREADY_APPLIED', summary: { batchId: 'b', mode: 'ADD', status: 'COMPLETED', rowsTotal: 4, committedThroughRow: 4, created: 4, merged: 0, skipped: 0, errors: 0 } })),
    args(() => undefined)
  );
  assert.equal(out.kind, 'failure');
  if (out.kind === 'failure') {
    assert.equal(out.failure.code, 'ALREADY_APPLIED');
    assert.equal(out.failure.summary?.created, 4);
  }
});

test('error bodies show the server text; a proxy page with no JSON still gets plain wording', async () => {
  const withBody = await runConfirm(deps(async () => jsonResponse(409, { success: false, error: 'This file is different from the one you previewed. Preview it again before importing.', code: 'FILE_CHANGED' })), args(() => undefined));
  assert.equal(withBody.kind === 'failure' && withBody.failure.message, 'This file is different from the one you previewed. Preview it again before importing.');
  const noJson = await runConfirm(deps(async () => ({ ok: false, status: 502, body: null, json: async () => { throw new Error('not json'); }, text: async () => '<html>Bad gateway</html>' })), args(() => undefined));
  assert.equal(noJson.kind === 'failure' && noJson.failure.code, 'SERVER_ERROR');
});

test('a 401 refreshes the session once and retries the same upload', async () => {
  let calls = 0;
  let refreshed = 0;
  const out = await runConfirm(
    deps(async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(401, { success: false, error: 'No', code: 'UNAUTHORIZED' }) : okResponse(readerOf([enc.encode(line(DONE()))]));
    }, { refreshSession: async () => (refreshed += 1, true) }),
    args(() => undefined)
  );
  assert.equal(calls, 2);
  assert.equal(refreshed, 1);
  assert.deepEqual(out, { kind: 'stream', sawTerminal: true });
  // A second 401 is not retried forever.
  let again = 0;
  const stuck = await runConfirm(deps(async () => (again += 1, jsonResponse(401, null)), { refreshSession: async () => true }), args(() => undefined));
  assert.equal(again, 2);
  assert.equal(stuck.kind === 'failure' && stuck.failure.code, 'SESSION_ENDED');
});

test('an abort before or during the stream is reported as stopped, not as an error', async () => {
  const early = await runConfirm(deps(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }), args(() => undefined));
  assert.equal(early.kind === 'failure' && early.failure.kind, 'aborted');
  const mid = await runConfirm(
    deps(async () => okResponse(readerOf([enc.encode(line(PROGRESS(1, 9))), (() => { const e = new Error('aborted'); e.name = 'AbortError'; return e; })()]))),
    args(() => undefined)
  );
  assert.equal(mid.kind === 'failure' && mid.failure.kind, 'aborted');
});

test('a dropped connection before the reply is a network failure; mid-stream it is a stream with no end', async () => {
  const before = await runConfirm(deps(async () => { throw new TypeError('Failed to fetch'); }), args(() => undefined));
  assert.equal(before.kind === 'failure' && before.failure.kind, 'network');
  const events: ConfirmEvent[] = [];
  const mid = await runConfirm(deps(async () => okResponse(readerOf([enc.encode(line(PROGRESS(2, 9))), new TypeError('network error')]))), args((e) => events.push(e)));
  assert.deepEqual(mid, { kind: 'stream', sawTerminal: false });
  assert.equal(events.length, 1);
});

test('without a streaming body the whole reply is read at once and still works', async () => {
  const events: ConfirmEvent[] = [];
  const out = await runConfirm(
    deps(async () => ({ ok: true, status: 200, body: null, json: async () => ({}), text: async () => line(PROGRESS(1, 1)) + line(DONE()) })),
    args((e) => events.push(e))
  );
  assert.deepEqual(out, { kind: 'stream', sawTerminal: true });
  assert.equal(events.length, 2);
});

test('the progress stream survives a 30 second pause with no data', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let lastEventAt = 0;
    let clock = 1000;
    const events: ConfirmEvent[] = [];
    let state = reduceImport(INITIAL_IMPORT_STATE, { type: 'start', now: clock });
    const onEvent = (e: ConfirmEvent) => {
      events.push(e);
      lastEventAt = clock;
      state = reduceImport(state, { type: 'event', event: e, now: clock });
    };
    const reader = readerOf([
      enc.encode(line(PROGRESS(100, 1000))),
      // The server goes quiet for 30 seconds (a slow chunk), then carries on.
      () => new Promise<Uint8Array>((resolve) => setTimeout(() => resolve(enc.encode(line(PROGRESS(600, 1000)) + line(DONE({ summary: { rowsTotal: 1000, created: 990, merged: 0, skipped: 0, errors: 10, noCatalogMatch: 0, needsPrice: 0, warnings: {} } })))), 30000)),
    ]);
    const running = runConfirm(deps(async () => okResponse(reader)), args(onEvent));
    await tick();
    await tick();
    assert.equal(events.length, 1, 'only the first event so far');
    assert.equal(state.status, 'running');
    // 30 seconds with no data: the screen may show the calm note, but the import is still running.
    clock += 30000;
    assert.equal(isStalled(lastEventAt, clock), true);
    assert.equal(state.status, 'running');
    mock.timers.tick(30000);
    const out = await running;
    assert.deepEqual(out, { kind: 'stream', sawTerminal: true });
    assert.deepEqual(events.map((e) => e.type), ['progress', 'progress', 'done']);
    assert.equal(state.status, 'done');
    assert.equal(state.created, 990);
    assert.equal(isStalled(lastEventAt, clock), false);
  } finally {
    mock.timers.reset();
  }
});

test('cancel then resume: the second run starts clean and produces the full errors file from replayed rows', async () => {
  const first: ConfirmEvent[] = [];
  const out1 = await runConfirm(
    deps(async () => okResponse(readerOf([enc.encode(line(PROGRESS(0, 20, 'reading')) + line(ROW_ERROR(3)) + line(PROGRESS(10, 20)) + line(DONE({ status: 'CANCELLED', summary: { rowsTotal: 20, created: 8, merged: 0, skipped: 0, errors: 1, noCatalogMatch: 0, needsPrice: 0, warnings: {} } })))]))),
    args((e) => first.push(e))
  );
  assert.deepEqual(out1, { kind: 'stream', sawTerminal: true });
  let s = reduceImport(INITIAL_IMPORT_STATE, { type: 'start', now: 0 });
  first.forEach((e) => (s = reduceImport(s, { type: 'event', event: e, now: 1 })));
  assert.equal(s.status, 'stopped');
  // Resume: the server replays row 3 (already counted) and reports a new one at row 15.
  s = reduceImport(s, { type: 'start', now: 2 });
  const second: ConfirmEvent[] = [];
  await runConfirm(
    deps(async () => okResponse(readerOf([enc.encode(line(ROW_ERROR(3, true)) + line(ROW_ERROR(15)) + line(DONE({ resumed: true })))]))),
    args((e) => second.push(e))
  );
  second.forEach((e) => (s = reduceImport(s, { type: 'event', event: e, now: 3 })));
  assert.equal(s.status, 'done');
  assert.equal(s.done?.resumed, true);
  assert.equal(errorLines(s).length, 2);
});
