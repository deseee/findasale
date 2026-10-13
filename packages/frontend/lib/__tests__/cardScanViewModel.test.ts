/**
 * cardScan + cardScanQueue review view model (ADR-138 batch B6, AT-33): readers, request builders, the client,
 * filters, groups, selection, bulk plans, optimistic changes with ifUpdatedAt, polling rules and the save button.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BULK_MAX_IDS,
  alreadyAppliedSummary,
  buildBulkBodies,
  buildCommitBody,
  buildCreateSessionBody,
  buildManualEntryBody,
  buildPatchBody,
  clampQuantity,
  createScanClient,
  failureFromError,
  failureFromResponse,
  fetchAllEntries,
  isRetriableFailure,
  readCommitResult,
  readEntry,
  readQueueState,
  readSession,
  readStatus,
  type ScanClient,
  type ScanClientDeps,
  type ScanEntry,
  type ScanQueueState,
  type ScanResult,
  type ScanSession,
} from '../cardScan';
import {
  MODE_OPTIONS,
  SCAN_FILTERS,
  applyPatchLocally,
  beginChange,
  bulkEligible,
  canEditEntry,
  commitState,
  countEntries,
  countedQuantity,
  createQueueView,
  defaultFilter,
  describeCommit,
  emptyMessage,
  emptySelection,
  entryNotices,
  entrySubtitle,
  entryTitle,
  failChange,
  filterCounts,
  filterEntries,
  filterOf,
  filterTabs,
  groupEntries,
  isSelected,
  looksFoil,
  mergeServerEntries,
  needChips,
  nextPollQuery,
  patchCountAsAnother,
  patchIgnoreHeld,
  patchPickPrinting,
  patchSkip,
  patchStepQuantity,
  patchUseAsTyped,
  patchUseSuggestedCondition,
  pendingChangeCount,
  planBulk,
  printingFinishes,
  pruneSelection,
  replaceServerEntries,
  resolveChange,
  secondsSince,
  selectFiltered,
  selectedCount,
  selectedEntries,
  sendChange,
  setSelected,
  shouldPoll,
  suggestedChip,
  toggleSelected,
  totalCopies,
} from '../cardScanQueue';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mk(over: Record<string, unknown> = {}): ScanEntry {
  const base = {
    id: 'e1',
    seq: 1,
    source: 'PHOTO',
    status: 'NEEDS_REVIEW',
    needs: [],
    read: { game: 'MTG', name: 'Lightning Bolt', setCode: 'lea', setName: 'Alpha', collectorNumber: '161', language: 'en', finish: null, confidence: 0.8 },
    suggested: null,
    resolution: { status: 'EXACT', note: null, agreement: 'FULL', printingId: 'SCRYFALL:bolt', candidates: [], truncated: false },
    chosen: { game: 'MTG', printingId: 'SCRYFALL:bolt', acceptAsTyped: false, cardName: null, setCode: null, setName: null, collectorNumber: null, language: 'en', finish: null, conditionCode: null, quantity: 1, price: null },
    groupKey: 'p:SCRYFALL:bolt|NONFOIL|NM',
    suspectDuplicateOf: null,
    errorCode: null,
    updatedAt: '2026-10-12T10:00:00.000Z',
  };
  const e = readEntry({ ...base, ...over });
  if (!e) throw new Error('fixture entry did not read');
  return e;
}

function mkSession(over: Record<string, unknown> = {}): ScanSession {
  const s = readSession({ id: 's1', saleId: 'sale1', status: 'OPEN', source: 'PHOTO', ...over });
  if (!s) throw new Error('fixture session did not read');
  return s;
}

const T0 = '2026-10-12T10:00:00.000Z';
const T1 = '2026-10-12T10:00:05.000Z';

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

test('the entry reader fails closed: an unknown status is "needs a decision", never ready', () => {
  assert.equal(mk({ status: 'WHATEVER' }).status, 'NEEDS_REVIEW');
  assert.equal(mk({ status: 'READY' }).status, 'READY');
  assert.equal(readEntry(null), null);
  assert.equal(readEntry({ status: 'READY' }), null, 'no id, no entry');
  assert.equal(readEntry({ id: '' }), null);
});

test('the entry reader keeps what it needs and ignores the rest', () => {
  const e = mk({
    needs: ['PRINTING', 'BOGUS', 'PRINTING', 'FINISH'],
    suggested: { conditionCode: 'NM', grader: null, grade: null, certNumber: null, source: 'HAIKU' },
    chosen: { quantity: 3, price: '12.50', printingId: 'p1', finish: 'FOIL' },
    resolution: { status: 'AMBIGUOUS', note: 'NAME_MISMATCH', agreement: 'NONE', printingId: null, truncated: true, candidates: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ printingId: 'c' + n, name: 'N' + n, setCode: 's', finishes: ['FOIL', 7] })) },
  });
  assert.deepEqual(e.needs, ['PRINTING', 'FINISH']);
  assert.equal(e.chosen.price, 12.5, 'a Decimal that arrives as text becomes a number');
  assert.equal(e.chosen.quantity, 3);
  assert.equal(e.resolution.candidates.length, 5, 'at most five printings are kept');
  assert.deepEqual(e.resolution.candidates[0].finishes, ['FOIL']);
  assert.equal(e.resolution.truncated, true);
  assert.equal(e.suggested && e.suggested.conditionCode, 'NM');
  assert.equal(mk({ suggested: {} }).suggested, null, 'an empty suggestion is no suggestion');
  assert.equal(mk({ chosen: {} }).chosen.quantity, 1);
});

test('queue state, status and commit result readers are tolerant', () => {
  const q = readQueueState({ success: true, data: { session: { id: 's1', status: 'COMMITTING' }, entries: [{ id: 'a', seq: 2 }, null, { nope: 1 }], counts: { ready: 4 }, catalogReady: true, delver: { lastActivityAt: T0 } } });
  assert.ok(q);
  assert.equal(q && q.session.status, 'COMMITTING');
  assert.equal(q && q.entries.length, 1);
  assert.equal(q && q.counts.ready, 4);
  assert.equal(q && q.counts.error, 0);
  assert.equal(q && q.delver.lastActivityAt, T0);
  assert.equal(readQueueState({ success: true, data: { entries: [] } }), null, 'no session, no state');
  assert.equal(readQueueState('nope'), null);

  const st = readStatus({ success: true, data: { scanEnabled: false, readyGames: ['MTG', 3], smartTags: { remaining: 12 } } });
  assert.ok(st);
  assert.equal(st && st.scanEnabled, false);
  assert.deepEqual(st && st.readyGames, ['MTG']);
  assert.equal(st && st.smartTagsRemaining, 12);
  assert.equal(st && st.limits.maxFrameBytes, 1572864);
  assert.equal(readStatus({ success: true, data: {} }), null);

  const c = readCommitResult({ success: true, data: { batchId: 'b1', status: 'COMPLETED', summary: { created: 3, merged: 1, skipped: 0, errors: 1, needsPrice: 2 }, notCommitted: [{ entryId: 'x', reason: 'NEEDS_REVIEW' }, 5], failed: [{ entryId: 'y', code: 'BAD', message: 'm' }] } });
  assert.ok(c);
  assert.equal(c && c.summary.needsPrice, 2);
  assert.deepEqual(c && c.notCommitted, [{ entryId: 'x', reason: 'NEEDS_REVIEW' }]);
  assert.equal(c && c.failed[0].code, 'BAD');
});

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

test('failures: server text first, our wording as the fallback, retry and halt flags', () => {
  const f = failureFromResponse(409, { success: false, error: 'Already saved.', code: 'ALREADY_APPLIED', summary: { created: 2, merged: 0, skipped: 0, errors: 0, needsPrice: 1 } });
  assert.equal(f.message, 'Already saved.');
  assert.equal(f.code, 'ALREADY_APPLIED');
  assert.equal(f.retriable, false);
  const sum = alreadyAppliedSummary(f);
  assert.ok(sum && sum.created === 2 && sum.needsPrice === 1);

  const quiet = failureFromResponse(500, null);
  assert.equal(quiet.code, 'SERVER_ERROR');
  assert.equal(quiet.retriable, true);
  assert.ok(quiet.message.length > 5 && quiet.help.length > 5);

  assert.equal(failureFromResponse(429, { code: 'AI_QUOTA_EXCEEDED' }).retriable, false);
  assert.equal(failureFromResponse(429, { code: 'AI_QUOTA_EXCEEDED' }).halts, true);
  assert.equal(failureFromResponse(429, { code: 'SCAN_CAP_REACHED' }).retriable, false);
  assert.equal(failureFromResponse(429, { code: 'RATE_LIMITED' }).retriable, true);
  assert.equal(failureFromResponse(429, { code: 'RATE_LIMITED' }).halts, false);
  assert.equal(failureFromResponse(503, { code: 'SCAN_DISABLED' }).retriable, false);
  assert.equal(failureFromResponse(503, { code: 'PROVIDER_UNAVAILABLE' }).retriable, true);
  assert.equal(failureFromResponse(409, { code: 'SESSION_NOT_OPEN' }).halts, true);
  assert.equal(failureFromResponse(409, { code: 'ENTRY_CHANGED' }).halts, false);
  assert.equal(failureFromResponse(400, { code: 'BAD_FRAME' }).retriable, false);
  assert.equal(failureFromResponse(401, null).code, 'SESSION_ENDED');
  assert.equal(failureFromResponse(413, null).code, 'FRAME_TOO_LARGE');

  assert.equal(failureFromError(new TypeError('fetch failed')).kind, 'network');
  assert.equal(failureFromError(new TypeError('fetch failed')).retriable, true);
  const abort = Object.assign(new Error('x'), { name: 'AbortError' });
  assert.equal(failureFromError(abort).kind, 'aborted');
  assert.equal(isRetriableFailure('aborted', null, 'CANCELLED'), false);
  assert.equal(isRetriableFailure('http', 408, 'X'), true);
});

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

test('PATCH body: only accepted keys, always ifUpdatedAt, quantity and price cleaned', () => {
  const { body, dropped } = buildPatchBody({ conditionCode: 'NM', quantity: 2.9, price: 4.567, skip: false, bogus: 'x' } as never, T0);
  assert.deepEqual(body, { conditionCode: 'NM', quantity: 2, price: 4.57, skip: false, ifUpdatedAt: T0 });
  assert.deepEqual(dropped, []);
  assert.equal(buildPatchBody({ quantity: 0 }, null).body.quantity, 1);
  assert.equal(buildPatchBody({ quantity: 99999 }, null).body.quantity, 10000);
  assert.deepEqual(buildPatchBody({ price: -3 }, T0).dropped, ['price']);
  assert.equal(buildPatchBody({ price: null }, T0).body.price, null, 'null clears the price');
  assert.equal('ifUpdatedAt' in buildPatchBody({ finish: 'FOIL' }, null).body, false);
  assert.equal(buildPatchBody({ finish: undefined }, T0).body.finish, undefined);
  assert.equal(clampQuantity(Number.NaN), 1);
});

test('manual add body: a catalog pick or a typed name, nothing else', () => {
  assert.deepEqual(buildManualEntryBody({ clientEntryId: 'c1', printingId: 'SCRYFALL:x', quantity: 2 }), { ok: true, body: { clientEntryId: 'c1', printingId: 'SCRYFALL:x', quantity: 2 } });
  const typed = buildManualEntryBody({ clientEntryId: 'c1', cardName: '  Pikachu ', game: 'POKEMON', price: 1.234, finish: '', bogus: 1 } as never);
  assert.deepEqual(typed, { ok: true, body: { clientEntryId: 'c1', cardName: 'Pikachu', game: 'POKEMON', price: 1.23 } });
  assert.deepEqual(buildManualEntryBody({ clientEntryId: 'c1' }), { ok: false, code: 'CARD_REQUIRED' });
  assert.deepEqual(buildManualEntryBody({ clientEntryId: '', cardName: 'x' }), { ok: false, code: 'CLIENT_ID_REQUIRED' });
});

test('session body: label trimmed, never cut, defaults only when chosen', () => {
  assert.deepEqual(buildCreateSessionBody({ saleId: 'sale1' }), { ok: true, body: { saleId: 'sale1', source: 'PHOTO' } });
  assert.deepEqual(buildCreateSessionBody({ saleId: 'sale1', label: '  Binder 3 ', defaultConditionCode: 'NM', defaultFinish: null }), { ok: true, body: { saleId: 'sale1', label: 'Binder 3', source: 'PHOTO', defaultConditionCode: 'NM' } });
  assert.deepEqual(buildCreateSessionBody({ saleId: 'sale1', label: 'x'.repeat(61) }), { ok: false, code: 'LABEL_TOO_LONG' });
  assert.equal(buildCreateSessionBody({ saleId: 'sale1', label: 'x'.repeat(60) }).ok, true);
  assert.deepEqual(buildCreateSessionBody({ saleId: ' ' }), { ok: false, code: 'SALE_REQUIRED' });
});

test('commit body: the mode has no default', () => {
  assert.deepEqual(buildCommitBody('ADD'), { ok: true, body: { mode: 'ADD' } });
  assert.deepEqual(buildCommitBody('REPLACE', true), { ok: true, body: { mode: 'REPLACE', force: true } });
  assert.deepEqual(buildCommitBody(null), { ok: false, code: 'MODE_REQUIRED' });
  assert.deepEqual(buildCommitBody(undefined), { ok: false, code: 'MODE_REQUIRED' });
  assert.deepEqual(buildCommitBody('add'), { ok: false, code: 'MODE_REQUIRED' });
  assert.deepEqual(buildCommitBody(''), { ok: false, code: 'MODE_REQUIRED' });
});

test('bulk bodies: 200 ids at most per call, the needed value for each action', () => {
  const ids = Array.from({ length: 450 }, (_, i) => 'e' + i);
  const built = buildBulkBodies('SKIP', ids, {});
  assert.ok(built.ok);
  if (built.ok) {
    assert.equal(built.body.length, 3);
    assert.equal((built.body[0].entryIds as string[]).length, BULK_MAX_IDS);
    assert.equal((built.body[2].entryIds as string[]).length, 50);
    assert.equal(built.body[0].action, 'SKIP');
    assert.equal('conditionCode' in built.body[0], false);
  }
  assert.deepEqual(buildBulkBodies('SET_CONDITION', ['a'], {}), { ok: false, code: 'CONDITION_REQUIRED' });
  assert.deepEqual(buildBulkBodies('SET_FINISH', ['a'], {}), { ok: false, code: 'FINISH_REQUIRED' });
  assert.deepEqual(buildBulkBodies('SET_CONDITION', ['a', 'a', ''], { conditionCode: 'LP' }), { ok: true, body: [{ entryIds: ['a'], action: 'SET_CONDITION', conditionCode: 'LP' }] });
  assert.deepEqual(buildBulkBodies('DELETE', [], {}), { ok: false, code: 'NO_ENTRIES' });
  assert.deepEqual(buildBulkBodies('NOPE' as never, ['a'], {}), { ok: false, code: 'BAD_ACTION' });
});

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

interface Call {
  url: string;
  init: Record<string, unknown>;
}

function fakeDeps(responses: Array<{ status: number; body: unknown }>, extra: Partial<ScanClientDeps> = {}): { deps: ScanClientDeps; calls: Call[] } {
  const calls: Call[] = [];
  const queue = responses.slice();
  const deps: ScanClientDeps = {
    apiBase: '/api/',
    getCsrfToken: () => 'tok',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const r = queue.shift() || { status: 500, body: null };
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body, text: async () => '' };
    },
    ...extra,
  };
  return { deps, calls };
}

test('client: commit never calls the server without a mode', async () => {
  const { deps, calls } = fakeDeps([]);
  const client = createScanClient(deps);
  const res = await client.commit('s1', null);
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.failure.code, 'MODE_REQUIRED');
  assert.equal(calls.length, 0);
});

test('client: commit, patch, bulk and queue reads use the contract paths, methods and headers', async () => {
  const { deps, calls } = fakeDeps([
    { status: 200, body: { success: true, data: { batchId: 'b1', status: 'COMPLETED', summary: { created: 1, merged: 0, skipped: 0, errors: 0, needsPrice: 0 }, notCommitted: [], failed: [] } } },
    { status: 200, body: { success: true, data: { entry: { id: 'e1', status: 'READY', updatedAt: T1 } } } },
    { status: 200, body: { success: true, data: { updated: 2, ignored: 1 } } },
    { status: 200, body: { success: true, data: { session: { id: 's1' }, entries: [], counts: {}, catalogReady: false, delver: {} } } },
    { status: 200, body: { success: true, data: { sessions: [{ id: 's1', label: 'Binder', status: 'OPEN', counts: { ready: 2 } }] } } },
  ]);
  const client = createScanClient(deps);

  const commit = await client.commit('s 1', 'REPLACE');
  assert.equal(commit.ok, true);
  assert.equal(calls[0].url, '/api/card-scan/sessions/s%201/commit');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, JSON.stringify({ mode: 'REPLACE' }));
  assert.equal((calls[0].init.headers as Record<string, string>)['x-csrf-token'], 'tok');
  assert.equal((calls[0].init.headers as Record<string, string>)['Content-Type'], 'application/json');
  assert.equal(calls[0].init.credentials, 'include');

  const patch = await client.patchEntry('s1', 'e1', buildPatchBody({ conditionCode: 'NM' }, T0).body);
  assert.equal(patch.ok, true);
  assert.equal(calls[1].url, '/api/card-scan/sessions/s1/entries/e1');
  assert.equal(calls[1].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[1].init.body as string), { conditionCode: 'NM', ifUpdatedAt: T0 });

  const bulk = await client.bulk('s1', { entryIds: ['a'], action: 'SKIP' });
  assert.equal(bulk.ok && bulk.data.ignored, 1);
  assert.equal(calls[2].url, '/api/card-scan/sessions/s1/entries/bulk');

  const q = await client.getSession('s1', { afterSeq: 12, limit: 500 });
  assert.equal(q.ok, true);
  assert.equal(calls[3].url, '/api/card-scan/sessions/s1?afterSeq=12&limit=200', 'limit is capped at 200');
  assert.equal(calls[3].init.method, 'GET');
  assert.equal((calls[3].init.headers as Record<string, string>)['x-csrf-token'], undefined, 'no CSRF header on a read');
  assert.equal(calls[3].init.body, undefined);

  const list = await client.listSessions('sale 1');
  assert.equal(calls[4].url, '/api/card-scan/sessions?saleId=sale%201');
  assert.equal(list.ok && list.data[0].counts.ready, 2);
});

test('client: one refresh on a 401, then the request is sent again', async () => {
  let refreshes = 0;
  const { deps, calls } = fakeDeps(
    [
      { status: 401, body: { success: false, code: 'UNAUTHORIZED' } },
      { status: 200, body: { success: true, data: { scanEnabled: true } } },
    ],
    { refreshSession: async () => { refreshes += 1; return true; } },
  );
  const res = await createScanClient(deps).getStatus();
  assert.equal(res.ok, true);
  assert.equal(refreshes, 1);
  assert.equal(calls.length, 2);

  const again = fakeDeps(
    [
      { status: 401, body: null },
      { status: 401, body: null },
    ],
    { refreshSession: async () => true },
  );
  const stuck = await createScanClient(again.deps).getStatus();
  assert.equal(stuck.ok, false);
  assert.equal(again.calls.length, 2, 'only one refresh per request');
});

test('client: a body it cannot read is a failure, a thrown fetch is a network failure', async () => {
  const bad = await createScanClient(fakeDeps([{ status: 200, body: 'nope' }]).deps).getStatus();
  assert.equal(bad.ok, false);
  assert.equal(!bad.ok && bad.failure.code, 'BAD_RESPONSE');

  const deps: ScanClientDeps = { apiBase: '/api', getCsrfToken: () => null, fetchImpl: async () => { throw new TypeError('fetch failed'); } };
  const net = await createScanClient(deps).getStatus();
  assert.equal(!net.ok && net.failure.kind, 'network');
  assert.equal(!net.ok && net.failure.retriable, true);
});

test('fetchAllEntries pages through a long queue and keeps the last session and counts', async () => {
  const pages: ScanQueueState[] = [];
  const make = (from: number, count: number, ready: number): ScanQueueState => ({
    session: mkSession(),
    entries: Array.from({ length: count }, (_, i) => mk({ id: 'e' + (from + i), seq: from + i })),
    counts: { needsReview: 0, ready, skipped: 0, committed: 0, error: 0 },
    catalogReady: true,
    delver: { lastActivityAt: null },
  });
  pages.push(make(1, 200, 1), make(201, 200, 2), make(401, 37, 3));
  const asked: Array<number | null | undefined> = [];
  const client = { getSession: async (_id: string, opts?: { afterSeq?: number | null }): Promise<ScanResult<ScanQueueState>> => {
    asked.push(opts && opts.afterSeq);
    return { ok: true, data: pages.shift() as ScanQueueState };
  } } as unknown as ScanClient;
  const res = await fetchAllEntries(client, 's1');
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.data.entries.length, 437);
    assert.equal(res.data.counts.ready, 3);
  }
  assert.deepEqual(asked, [null, 200, 400]);

  const failing = { getSession: async (): Promise<ScanResult<ScanQueueState>> => ({ ok: false, failure: failureFromResponse(404, { code: 'SESSION_NOT_FOUND' }) }) } as unknown as ScanClient;
  const f = await fetchAllEntries(failing, 's1');
  assert.equal(!f.ok && f.failure.code, 'SESSION_NOT_FOUND');
});

// ---------------------------------------------------------------------------
// Filters, chips, notices, groups
// ---------------------------------------------------------------------------

test('filters: Needs a decision, Ready, Skipped, Committed', () => {
  assert.deepEqual(SCAN_FILTERS, ['NEEDS_DECISION', 'READY', 'SKIPPED', 'COMMITTED']);
  const entries = [
    mk({ id: 'a', seq: 1, status: 'NEEDS_REVIEW' }),
    mk({ id: 'b', seq: 2, status: 'ERROR' }),
    mk({ id: 'c', seq: 3, status: 'READY' }),
    mk({ id: 'd', seq: 4, status: 'COMMITTING' }),
    mk({ id: 'e', seq: 5, status: 'SKIPPED' }),
    mk({ id: 'f', seq: 6, status: 'COMMITTED' }),
  ];
  assert.deepEqual(entries.map(filterOf), ['NEEDS_DECISION', 'NEEDS_DECISION', 'READY', 'READY', 'SKIPPED', 'COMMITTED']);
  assert.deepEqual(filterCounts(entries), { NEEDS_DECISION: 2, READY: 2, SKIPPED: 1, COMMITTED: 1 });
  assert.deepEqual(filterEntries(entries, 'READY').map((e) => e.id), ['c', 'd']);
  const tabs = filterTabs(entries, 'READY');
  assert.deepEqual(tabs.map((t) => t.text), ['Needs a decision (2)', 'Ready (2)', 'Skipped (1)', 'Committed (1)']);
  assert.deepEqual(tabs.map((t) => t.active), [false, true, false, false]);
  assert.equal(defaultFilter(entries), 'NEEDS_DECISION');
  assert.equal(defaultFilter([mk({ status: 'READY' })]), 'READY');
  assert.equal(defaultFilter([]), 'NEEDS_DECISION');
  assert.equal(emptyMessage('SKIPPED'), 'No skipped cards.');
  assert.deepEqual(countEntries(entries), { needsReview: 1, ready: 2, skipped: 1, committed: 1, error: 1 });
});

test('"still needed" chips and the plain notes on an entry', () => {
  const e = mk({ needs: ['PRINTING', 'FINISH', 'CONDITION', 'NAME'] });
  assert.deepEqual(needChips(e).map((c) => c.label), ['Pick the printing', 'Choose the finish', 'Choose the condition', 'Add the card name']);

  const held = mk({ suspectDuplicateOf: 'e0' });
  assert.equal(entryNotices(held)[0].text, 'Looks like the same card as the last one. Count it as another copy?');
  assert.equal(entryNotices(mk({ resolution: { status: 'AMBIGUOUS', note: 'NAME_MISMATCH' } }))[0].text, 'The set and number we read do not match the name. Pick the right printing.');
  assert.equal(entryNotices(mk({ resolution: { status: 'EXACT', note: 'NAME_ONLY' } }))[0].text, 'We found one printing with this name. Check the picture matches your card.');
  assert.equal(entryNotices(mk({ resolution: { status: 'UNMATCHED', note: 'GAME_NOT_SERVED' } }))[0].text, 'We do not have a card list for this game yet. Check the details and use them as typed.');
  assert.equal(entryNotices(mk({ resolution: { status: 'UNMATCHED', note: 'CATALOG_OFF' } }))[0].kind, 'CATALOG_OFF');
  assert.equal(entryNotices(mk({ status: 'ERROR' }))[0].kind, 'ERROR');
  assert.deepEqual(entryNotices(mk()), []);

  const foil = mk({ read: { game: 'MTG', name: 'X', finish: 'FOIL' } });
  assert.equal(looksFoil(foil), true);
  assert.equal(entryNotices(foil)[0].kind, 'LOOKS_FOIL');
  assert.equal(entryNotices(mk({ read: { game: 'MTG', name: 'X', finish: 'FOIL' }, chosen: { finish: 'FOIL' } })).length, 0, 'once the seller chose, the note goes');
  assert.equal(looksFoil(mk({ read: { finish: 'NONFOIL' } })), false);
});

test('title and subtitle prefer what the seller chose, then what was read', () => {
  assert.equal(entryTitle(mk()), 'Lightning Bolt');
  assert.equal(entryTitle(mk({ chosen: { cardName: 'Typed Name' } })), 'Typed Name');
  assert.equal(entryTitle(mk({ read: null })), 'Unknown card');
  assert.equal(entrySubtitle(mk()), 'Alpha, #161');
  assert.equal(entrySubtitle(mk({ chosen: { setName: 'Beta', collectorNumber: '9' } })), 'Beta, #9');
  assert.equal(entrySubtitle(mk({ read: null })), '');
});

test('groups: identical cards count together, held repeats do not count, skipped add nothing', () => {
  const entries = [
    mk({ id: 'a', seq: 1, groupKey: 'K1', chosen: { quantity: 1 } }),
    mk({ id: 'b', seq: 2, groupKey: 'K2', chosen: { quantity: 2 } }),
    mk({ id: 'c', seq: 3, groupKey: 'K1', chosen: { quantity: 1 } }),
    mk({ id: 'd', seq: 4, groupKey: 'K1', chosen: { quantity: 1 }, suspectDuplicateOf: 'c' }),
    mk({ id: 'e', seq: 5, groupKey: null, chosen: { quantity: 4 } }),
    mk({ id: 'f', seq: 6, groupKey: null, chosen: { quantity: 1 } }),
    mk({ id: 'g', seq: 7, groupKey: 'K2', status: 'SKIPPED', chosen: { quantity: 5 } }),
  ];
  const groups = groupEntries(entries);
  assert.deepEqual(groups.map((g) => g.key), ['g:K1', 'g:K2', 'e:e', 'e:f']);
  assert.deepEqual(groups.map((g) => g.copies), [2, 2, 4, 1]);
  assert.deepEqual(groups.map((g) => g.held), [1, 0, 0, 0]);
  assert.deepEqual(groups[0].entries.map((e) => e.id), ['a', 'c', 'd']);
  assert.equal(countedQuantity(entries[3]), 0);
  assert.equal(countedQuantity(entries[6]), 0);
  assert.equal(totalCopies(entries), 9);
});

test('printing finishes come from the picked candidate when it is known', () => {
  const known = mk({
    chosen: { printingId: 'c1' },
    resolution: { status: 'AMBIGUOUS', candidates: [{ printingId: 'c1', name: 'A', setCode: 's', finishes: ['NONFOIL', 'FOIL'] }, { printingId: 'c2', name: 'B', setCode: 's', finishes: ['ETCHED'] }] },
  });
  assert.deepEqual(printingFinishes(known), { codes: ['NONFOIL', 'FOIL'], known: true });
  const unknown = printingFinishes(mk({ chosen: { printingId: 'zzz' } }));
  assert.equal(unknown.known, false);
  assert.ok(unknown.codes.indexOf('FOIL') >= 0);
});

// ---------------------------------------------------------------------------
// Selection and bulk
// ---------------------------------------------------------------------------

test('selection: toggle, select a tab, prune, queue order', () => {
  const entries = [
    mk({ id: 'a', seq: 1, status: 'NEEDS_REVIEW' }),
    mk({ id: 'b', seq: 2, status: 'NEEDS_REVIEW' }),
    mk({ id: 'c', seq: 3, status: 'COMMITTED' }),
    mk({ id: 'd', seq: 4, status: 'READY' }),
  ];
  let sel = emptySelection();
  sel = toggleSelected(sel, 'b');
  sel = toggleSelected(sel, 'a');
  assert.equal(selectedCount(sel), 2);
  assert.equal(isSelected(sel, 'a'), true);
  assert.deepEqual(selectedEntries(sel, entries).map((e) => e.id), ['a', 'b'], 'queue order, not click order');
  sel = toggleSelected(sel, 'a');
  assert.equal(isSelected(sel, 'a'), false);
  assert.equal(selectedCount(sel), 1);

  assert.equal(selectedCount(selectFiltered(entries, 'NEEDS_DECISION')), 2);
  assert.equal(selectedCount(selectFiltered(entries, 'COMMITTED')), 0, 'saved cards cannot be picked');

  sel = setSelected(emptySelection(), ['a', 'c', 'gone'], true);
  assert.deepEqual(Object.keys(pruneSelection(sel, entries)), ['a'], 'saved and missing ids drop out');
  assert.equal(selectedCount(setSelected(sel, ['a'], false)), 2);
});

test('bulk plans: which cards take which action', () => {
  const withSuggestion = mk({ id: 'a', seq: 1, suggested: { conditionCode: 'LP', source: 'HAIKU' } });
  const without = mk({ id: 'b', seq: 2 });
  const skipped = mk({ id: 'c', seq: 3, status: 'SKIPPED' });
  const saved = mk({ id: 'd', seq: 4, status: 'COMMITTED' });
  const all = [withSuggestion, without, skipped, saved];

  const suggested = planBulk('USE_SUGGESTED_CONDITION', all, {});
  assert.deepEqual(suggested.targetIds, ['a']);
  assert.deepEqual(suggested.ignoredIds, ['b', 'c', 'd']);
  assert.equal(suggested.blocker, null);
  assert.ok(suggested.bodies && suggested.bodies.length === 1);

  assert.deepEqual(planBulk('SKIP', all, {}).targetIds, ['a', 'b']);
  assert.deepEqual(planBulk('UNSKIP', all, {}).targetIds, ['c']);
  assert.deepEqual(planBulk('DELETE', all, {}).targetIds, ['a', 'b', 'c']);
  assert.deepEqual(planBulk('SET_CONDITION', all, { conditionCode: 'NM' }).targetIds, ['a', 'b']);

  const noCondition = planBulk('SET_CONDITION', all, {});
  assert.equal(noCondition.bodies, null);
  assert.equal(noCondition.blocker, 'Choose a condition first.');
  assert.equal(planBulk('SET_FINISH', all, {}).blocker, 'Choose a finish first.');
  assert.equal(planBulk('UNSKIP', [without], {}).blocker, 'None of the selected cards can take that change.');

  const onlyFoil = mk({ id: 'x', seq: 5, chosen: { printingId: 'c1' }, resolution: { status: 'AMBIGUOUS', candidates: [{ printingId: 'c1', name: 'A', setCode: 's', finishes: ['FOIL'] }] } });
  assert.equal(bulkEligible(onlyFoil, 'SET_FINISH', { finish: 'NONFOIL' }), false, 'a finish the printing does not come in is left alone');
  assert.equal(bulkEligible(onlyFoil, 'SET_FINISH', { finish: 'FOIL' }), true);
  assert.equal(bulkEligible(without, 'SET_FINISH', { finish: 'NONFOIL' }), true, 'unknown finishes are left to the server');
});

test('a suggestion is only used when the seller taps it', () => {
  const e = mk({ suggested: { conditionCode: 'NM', source: 'HAIKU' } });
  assert.equal(e.chosen.conditionCode, null, 'reading an entry never fills in the condition');
  const chip = suggestedChip(e);
  assert.deepEqual(chip, { text: 'Suggested: Near Mint. Tap to use.', conditionCode: 'NM' });
  assert.deepEqual(patchUseSuggestedCondition(e), { conditionCode: 'NM' });
  assert.equal(patchUseSuggestedCondition(mk()), null);
  assert.equal(suggestedChip(mk({ suggested: { conditionCode: 'NM' }, chosen: { conditionCode: 'NM' } })), null, 'already chosen');
  assert.equal(suggestedChip(mk()), null);
  // The suggested condition is not part of the local change until the patch is applied.
  assert.equal(applyPatchLocally(e, { finish: 'FOIL' }).chosen.conditionCode, null);
});

test('patch helpers', () => {
  assert.deepEqual(patchPickPrinting('P1'), { printingId: 'P1', acceptAsTyped: false });
  assert.deepEqual(patchUseAsTyped(), { acceptAsTyped: true, printingId: null });
  assert.deepEqual(patchSkip(true), { skip: true });
  assert.deepEqual(patchCountAsAnother(), { countAsAnother: true });
  assert.deepEqual(patchIgnoreHeld(), { skip: true });
  const e = mk({ chosen: { quantity: 1 } });
  assert.deepEqual(patchStepQuantity(e, 1), { quantity: 2 });
  assert.equal(patchStepQuantity(e, -1), null, 'one is the least');
  assert.equal(patchStepQuantity(mk({ chosen: { quantity: 10000 } }), 1), null);
});

// ---------------------------------------------------------------------------
// Optimistic changes
// ---------------------------------------------------------------------------

test('an optimistic change shows at once and sends the updatedAt the seller was looking at', () => {
  const view = createQueueView([mk({ id: 'a', seq: 1, updatedAt: T0 })]);
  const begun = beginChange(view, 'a', { conditionCode: 'LP', quantity: 3 });
  assert.ok(begun.ok);
  if (!begun.ok) return;
  assert.deepEqual(begun.request, { entryId: 'a', patch: { conditionCode: 'LP', quantity: 3 }, ifUpdatedAt: T0 });
  assert.equal(begun.view.entries[0].chosen.conditionCode, 'LP');
  assert.equal(begun.view.entries[0].chosen.quantity, 3);
  assert.equal(begun.view.entries[0].status, 'NEEDS_REVIEW', 'readiness stays with the server');
  assert.equal(pendingChangeCount(begun.view), 1);
  assert.equal(view.entries[0].chosen.conditionCode, null, 'the old view is untouched');

  const body = buildPatchBody(begun.request!.patch, begun.request!.ifUpdatedAt).body;
  assert.equal(body.ifUpdatedAt, T0);

  const server = mk({ id: 'a', seq: 1, status: 'READY', chosen: { conditionCode: 'LP', quantity: 3 }, updatedAt: T1 });
  const done = resolveChange(begun.view, 'a', server);
  assert.equal(done.next, null);
  assert.equal(done.view.entries[0].status, 'READY');
  assert.equal(done.view.entries[0].updatedAt, T1);
  assert.equal(pendingChangeCount(done.view), 0);
});

test('rapid taps on one entry are merged and sent one after the other with fresh ifUpdatedAt', () => {
  const view = createQueueView([mk({ id: 'a', seq: 1, chosen: { quantity: 1 }, updatedAt: T0 })]);
  const first = beginChange(view, 'a', { quantity: 2 });
  assert.ok(first.ok);
  if (!first.ok) return;
  const second = beginChange(first.view, 'a', { quantity: 3 });
  assert.ok(second.ok);
  if (!second.ok) return;
  assert.equal(second.request, null, 'the first change is still in flight');
  assert.equal(second.view.entries[0].chosen.quantity, 3, 'the screen already shows the latest tap');
  const third = beginChange(second.view, 'a', { finish: 'FOIL' });
  assert.ok(third.ok);
  if (!third.ok) return;

  const server = mk({ id: 'a', seq: 1, chosen: { quantity: 2 }, updatedAt: T1 });
  const resolved = resolveChange(third.view, 'a', server);
  assert.deepEqual(resolved.next, { entryId: 'a', patch: { quantity: 3, finish: 'FOIL' }, ifUpdatedAt: T1 });
  assert.equal(resolved.view.entries[0].chosen.quantity, 3);
  assert.equal(resolved.view.entries[0].chosen.finish, 'FOIL');
  assert.equal(pendingChangeCount(resolved.view), 1);
});

test('a failed change puts the entry back; someone else changing it asks for a reload', () => {
  const original = mk({ id: 'a', seq: 1, updatedAt: T0 });
  const begun = beginChange(createQueueView([original]), 'a', { skip: true });
  assert.ok(begun.ok);
  if (!begun.ok) return;
  assert.equal(begun.view.entries[0].status, 'SKIPPED');

  const plain = failChange(begun.view, 'a', failureFromResponse(500, null));
  assert.equal(plain.reload, false);
  assert.equal(plain.view.entries[0].status, 'NEEDS_REVIEW');
  assert.equal(pendingChangeCount(plain.view), 0);

  const conflict = failChange(begun.view, 'a', failureFromResponse(409, { code: 'ENTRY_CHANGED' }));
  assert.equal(conflict.reload, true);
  assert.deepEqual(conflict.view.entries[0], original);
});

test('changes to unknown or saved entries are refused', () => {
  const view = createQueueView([mk({ id: 'a', seq: 1, status: 'COMMITTED' }), mk({ id: 'b', seq: 2, status: 'COMMITTING' })]);
  assert.deepEqual(beginChange(view, 'zzz', { skip: true }), { ok: false, reason: 'UNKNOWN_ENTRY' });
  assert.deepEqual(beginChange(view, 'a', { skip: true }), { ok: false, reason: 'LOCKED' });
  assert.deepEqual(beginChange(view, 'b', { skip: true }), { ok: false, reason: 'LOCKED' });
  assert.equal(canEditEntry(view.entries[0], mkSession()), false);
  assert.equal(canEditEntry(mk(), mkSession()), true);
  assert.equal(canEditEntry(mk(), mkSession({ status: 'COMMITTING' })), false);
  assert.equal(canEditEntry(mk(), null), false);
});

test('local patches: count as another clears the hold, skip and unskip move the status', () => {
  const held = mk({ suspectDuplicateOf: 'e0' });
  assert.equal(applyPatchLocally(held, { countAsAnother: true }).suspectDuplicateOf, null);
  assert.equal(applyPatchLocally(mk(), { skip: true }).status, 'SKIPPED');
  assert.equal(applyPatchLocally(mk({ status: 'SKIPPED' }), { skip: false }).status, 'NEEDS_REVIEW');
  assert.equal(applyPatchLocally(mk({ status: 'READY' }), { skip: false }).status, 'READY');
  assert.equal(applyPatchLocally(mk(), { price: null }).chosen.price, null);
  assert.equal(applyPatchLocally(mk(), { quantity: 0 }).chosen.quantity, 1);
});

test('polling merges: the server wins, except for an entry with a change in flight', () => {
  const a = mk({ id: 'a', seq: 1, updatedAt: T0 });
  const b = mk({ id: 'b', seq: 2, updatedAt: T0 });
  let view = createQueueView([b, a]);
  assert.deepEqual(view.entries.map((e) => e.id), ['a', 'b'], 'kept in seq order');

  const begun = beginChange(view, 'a', { conditionCode: 'HP' });
  assert.ok(begun.ok);
  if (!begun.ok) return;
  view = begun.view;
  const newer = mk({ id: 'a', seq: 1, updatedAt: T1, chosen: { price: 9 } });
  const c = mk({ id: 'c', seq: 3, updatedAt: T1 });
  view = mergeServerEntries(view, [newer, c, mk({ id: 'b', seq: 2, updatedAt: T1, status: 'READY' })]);
  assert.equal(view.entries[0].chosen.conditionCode, 'HP', 'what the seller just did stays on screen');
  assert.equal(view.entries[1].status, 'READY');
  assert.deepEqual(view.entries.map((e) => e.id), ['a', 'b', 'c']);
  const failed = failChange(view, 'a', failureFromResponse(500, null));
  assert.equal(failed.view.entries[0].chosen.price, 9, 'a failed change falls back to the newest server copy');

  // An older copy never replaces a newer one.
  const stale = mergeServerEntries(failed.view, [mk({ id: 'b', seq: 2, updatedAt: T0, status: 'NEEDS_REVIEW' })]);
  assert.equal(stale.entries[1].status, 'READY');
});

test('a full refresh removes entries the server no longer has', () => {
  const view = createQueueView([mk({ id: 'a', seq: 1 }), mk({ id: 'b', seq: 2 }), mk({ id: 'c', seq: 3 })]);
  const refreshed = replaceServerEntries(view, [mk({ id: 'a', seq: 1 }), mk({ id: 'c', seq: 3, updatedAt: T1 })]);
  assert.deepEqual(refreshed.entries.map((e) => e.id), ['a', 'c']);

  const begun = beginChange(view, 'b', { skip: true });
  assert.ok(begun.ok);
  if (!begun.ok) return;
  const kept = replaceServerEntries(begun.view, [mk({ id: 'a', seq: 1 })]);
  assert.deepEqual(kept.entries.map((e) => e.id), ['a', 'b'], 'an entry with a change in flight is not dropped');
});

test('sendChange builds the PATCH body with ifUpdatedAt', async () => {
  const { deps, calls } = fakeDeps([{ status: 200, body: { success: true, data: { entry: { id: 'a', updatedAt: T1 } } } }]);
  const res = await sendChange(createScanClient(deps), 's1', { entryId: 'a', patch: { finish: 'FOIL' }, ifUpdatedAt: T0 });
  assert.equal(res.ok, true);
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { finish: 'FOIL', ifUpdatedAt: T0 });
});

// ---------------------------------------------------------------------------
// Polling rules
// ---------------------------------------------------------------------------

test('polling runs only while the tab is visible and the scan is moving', () => {
  assert.equal(shouldPoll('visible', 'OPEN'), true);
  assert.equal(shouldPoll('visible', 'COMMITTING'), true);
  assert.equal(shouldPoll('hidden', 'OPEN'), false);
  assert.equal(shouldPoll('visible', 'CLOSED'), false);
  assert.equal(shouldPoll('visible', 'DISCARDED'), false);
  assert.equal(shouldPoll('visible', null), false);
});

test('the next poll asks for new entries, with a full refresh now and then', () => {
  const entries = [mk({ id: 'a', seq: 4 }), mk({ id: 'b', seq: 9 })];
  assert.deepEqual(nextPollQuery(entries, null, 1000), { afterSeq: null, full: true });
  assert.deepEqual(nextPollQuery([], 1000, 2000), { afterSeq: null, full: true });
  assert.deepEqual(nextPollQuery(entries, 1000, 4000), { afterSeq: 9, full: false });
  assert.deepEqual(nextPollQuery(entries, 1000, 16000), { afterSeq: null, full: true });
  assert.deepEqual(nextPollQuery(entries, 1000, 3000, 1500), { afterSeq: null, full: true });
});

test('seconds since the last Delver event', () => {
  const now = Date.parse('2026-10-12T10:00:30.000Z');
  assert.equal(secondsSince('2026-10-12T10:00:18.000Z', now), 12);
  assert.equal(secondsSince('2026-10-12T10:01:00.000Z', now), 0);
  assert.equal(secondsSince(null, now), null);
  assert.equal(secondsSince('not a date', now), null);
});

// ---------------------------------------------------------------------------
// The save button
// ---------------------------------------------------------------------------

function readyEntries(): ScanEntry[] {
  return [
    mk({ id: 'a', seq: 1, status: 'READY', chosen: { quantity: 2, conditionCode: 'NM' } }),
    mk({ id: 'b', seq: 2, status: 'READY', chosen: { quantity: 1, conditionCode: 'LP' } }),
    mk({ id: 'c', seq: 3, status: 'NEEDS_REVIEW' }),
    mk({ id: 'd', seq: 4, status: 'SKIPPED' }),
  ];
}

test('the save button needs a chosen mode, ready cards, no sends and no saves in flight', () => {
  const session = mkSession();
  const base = { session, entries: readyEntries(), mode: null, uploadsInFlight: 0, pendingChanges: 0 } as const;

  const noMode = commitState({ ...base });
  assert.equal(noMode.canCommit, false);
  assert.deepEqual(noMode.blockers, ['MODE']);
  assert.equal(noMode.blockerTexts[0], 'Choose how to count before you continue.');
  assert.equal(noMode.buttonLabel, 'Save cards');
  assert.equal(noMode.readyEntries, 2);
  assert.equal(noMode.readyCopies, 3);
  assert.equal(noMode.notReadyEntries, 1);
  assert.equal(noMode.notReadyNote, '1 card still needs a decision and will not be saved yet.');
  assert.equal(noMode.modeHint, null);

  const add = commitState({ ...base, mode: 'ADD' });
  assert.equal(add.canCommit, true);
  assert.deepEqual(add.blockers, []);
  assert.equal(add.buttonLabel, 'Save 3 cards');
  assert.equal(add.modeHint, 'The count is added to what you already have.');
  assert.match(commitState({ ...base, mode: 'REPLACE' }).modeHint as string, /stay counted as sold/);

  assert.deepEqual(commitState({ ...base, mode: 'ADD', uploadsInFlight: 2 }).blockers, ['UPLOADING']);
  assert.deepEqual(commitState({ ...base, mode: 'ADD', pendingChanges: 1 }).blockers, ['SAVING']);
  assert.deepEqual(commitState({ ...base, mode: 'ADD', entries: [mk({ status: 'NEEDS_REVIEW' })] }).blockers, ['NOTHING_READY']);
  assert.deepEqual(commitState({ ...base, mode: 'ADD', session: mkSession({ status: 'COMMITTING' }) }).blockers, ['NOT_OPEN']);
  assert.deepEqual(commitState({ ...base, mode: 'ADD', session: null }).blockers, ['NOT_OPEN']);
  assert.equal(commitState({ ...base, mode: 'ADD', entries: [mk({ status: 'READY', chosen: { quantity: 1 } })] }).buttonLabel, 'Save 1 card');
});

test('the two ways to count are offered with no default', () => {
  assert.deepEqual(MODE_OPTIONS.map((m) => m.mode), ['ADD', 'REPLACE']);
  assert.deepEqual(MODE_OPTIONS.map((m) => m.label), ['Add to my stock', 'Set my stock to this count']);
  assert.equal(commitState({ session: mkSession(), entries: [], mode: null, uploadsInFlight: 0, pendingChanges: 0 }).canCommit, false);
});

test('a session default is disclosed beside the save button', () => {
  const entries = [
    mk({ id: 'a', seq: 1, status: 'READY', chosen: { quantity: 2, conditionCode: null } }),
    mk({ id: 'b', seq: 2, status: 'READY', chosen: { quantity: 1, conditionCode: 'LP' } }),
    mk({ id: 'c', seq: 3, status: 'READY', chosen: { quantity: 4, conditionCode: 'NM' } }),
    mk({ id: 'd', seq: 4, status: 'READY', chosen: { quantity: 1, conditionCode: null, grader: 'PSA', grade: '9' } }),
  ];
  const withDefault = commitState({ session: mkSession({ defaultConditionCode: 'NM' }), entries, mode: 'ADD', uploadsInFlight: 0, pendingChanges: 0 });
  assert.deepEqual(withDefault.disclosures, ['6 cards will be saved as Near Mint (your default for this session).']);
  const none = commitState({ session: mkSession(), entries, mode: 'ADD', uploadsInFlight: 0, pendingChanges: 0 });
  assert.deepEqual(none.disclosures, [], 'no default chosen, nothing to disclose');

  const finish = commitState({
    session: mkSession({ defaultFinish: 'NONFOIL' }),
    entries: [
      mk({ id: 'a', seq: 1, status: 'READY', chosen: { quantity: 3, finish: null } }),
      mk({ id: 'b', seq: 2, status: 'READY', read: { game: 'MTG', name: 'X', finish: 'FOIL' }, chosen: { quantity: 2, finish: 'FOIL' } }),
    ],
    mode: 'ADD',
    uploadsInFlight: 0,
    pendingChanges: 0,
  });
  assert.deepEqual(finish.disclosures, ['3 cards will be saved as Non-foil (your default for this session).']);
});

test('a finished save is described in plain words', () => {
  const result = readCommitResult({ data: { batchId: 'b1', status: 'COMPLETED', summary: { created: 5, merged: 2, skipped: 1, errors: 0, needsPrice: 3 } } });
  assert.ok(result);
  if (!result) return;
  const d = describeCommit(result);
  assert.equal(d.headline, 'Saved');
  assert.deepEqual(d.lines, ['5 new, 2 added to existing stock, 1 skipped, 0 with problems.', '3 cards have no price yet.']);
  assert.equal(describeCommit(result, true).lines[0], 'These cards were already saved. Nothing was added twice.');
});
