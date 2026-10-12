/**
 * cardScanQueue (ADR-138 batch B6, AT-32): the send queue. Concurrency 2, a retry reuses the same clientEntryId,
 * a client error stops that picture only, and unsent pictures survive a reload (a store fake stands in for IndexedDB).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUploadQueue,
  defaultBackoffMs,
  makeFrameSender,
  newClientEntryId,
  type PendingStore,
  type PersistedUpload,
  type UploadItem,
  type UploadQueueDeps,
} from '../cardScanQueue';
import { createScanClient, failureFromResponse, readEntry, type FrameResult, type ScanFailure, type ScanResult } from '../cardScan';

type Pic = string;

function entryFor(id: string): FrameResult['entry'] {
  const e = readEntry({ id: 'entry-' + id, seq: 1, source: 'PHOTO', status: 'NEEDS_REVIEW', updatedAt: '2026-10-12T10:00:00.000Z' });
  if (!e) throw new Error('fixture entry did not read');
  return e;
}

function okResult(id: string): ScanResult<FrameResult> {
  return { ok: true, data: { entry: entryFor(id), duplicate: null, charged: true } };
}

function failResult(status: number, code?: string): ScanResult<FrameResult> {
  return { ok: false, failure: failureFromResponse(status, code ? { success: false, error: 'x', code } : null) };
}

function networkFail(): ScanResult<FrameResult> {
  return { ok: false, failure: { kind: 'network', status: null, code: 'NETWORK_ERROR', message: 'n', help: 'h', retriable: true, halts: false, extra: null } as ScanFailure };
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

type MemoryStore = PendingStore<Pic> & { saved: PersistedUpload<Pic>[]; saves: number };

function memoryStore(initial: PersistedUpload<Pic>[] = []): MemoryStore {
  const s: MemoryStore = {
    saved: initial.slice(),
    saves: 0,
    async load() {
      return s.saved.slice();
    },
    async save(items: PersistedUpload<Pic>[]) {
      s.saved = items.slice();
      s.saves += 1;
    },
  };
  return s;
}

function baseDeps(send: UploadQueueDeps<Pic>['send'], extra: Partial<UploadQueueDeps<Pic>> = {}): UploadQueueDeps<Pic> & { sleeps: number[] } {
  const sleeps: number[] = [];
  let n = 0;
  return {
    send,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    newId: () => 'id-' + (n += 1),
    sleeps,
    ...extra,
  };
}

test('two pictures are sent at a time, in the order they were taken', async () => {
  const started: string[] = [];
  const gates: Record<string, { promise: Promise<ScanResult<FrameResult>>; resolve: (v: ScanResult<FrameResult>) => void }> = {};
  let inFlight = 0;
  let maxInFlight = 0;
  const deps = baseDeps(async (item: UploadItem<Pic>) => {
    started.push(item.clientEntryId);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    gates[item.clientEntryId] = deferred<ScanResult<FrameResult>>();
    const r = await gates[item.clientEntryId].promise;
    inFlight -= 1;
    return r;
  });
  const q = createUploadQueue<Pic>(deps);
  for (let i = 1; i <= 5; i += 1) q.enqueue({ frame: 'pic' + i });
  assert.deepEqual(started, ['id-1', 'id-2'], 'only two start');
  let snap = q.snapshot();
  assert.equal(snap.sending, 2);
  assert.equal(snap.pending, 3);
  assert.equal(snap.idle, false);

  gates['id-1'].resolve(okResult('1'));
  await tick();
  assert.deepEqual(started, ['id-1', 'id-2', 'id-3'], 'the next in line starts, in order');
  gates['id-3'].resolve(okResult('3'));
  gates['id-2'].resolve(okResult('2'));
  await tick();
  assert.deepEqual(started, ['id-1', 'id-2', 'id-3', 'id-4', 'id-5']);
  gates['id-4'].resolve(okResult('4'));
  gates['id-5'].resolve(okResult('5'));
  await q.whenIdle();
  snap = q.snapshot();
  assert.equal(maxInFlight, 2, 'never more than two at once');
  assert.equal(snap.doneCount, 5);
  assert.equal(snap.items.length, 0, 'sent pictures leave the list');
  assert.equal(snap.idle, true);
});

test('a retry reuses the same clientEntryId and picture, with a growing wait', async () => {
  const seen: Array<{ id: string; frame: Pic; attempt: number }> = [];
  const results: ScanResult<FrameResult>[] = [networkFail(), failResult(503, 'PROVIDER_UNAVAILABLE'), okResult('a')];
  const accepted: string[] = [];
  const deps = baseDeps(async (item) => {
    seen.push({ id: item.clientEntryId, frame: item.frame, attempt: item.attempts });
    return results.shift() as ScanResult<FrameResult>;
  }, { onResult: (item) => accepted.push(item.clientEntryId) });
  const q = createUploadQueue<Pic>(deps);
  const id = q.enqueue({ frame: 'the-picture', placementId: 'p-7' });
  await q.whenIdle();
  assert.equal(seen.length, 3);
  assert.deepEqual(seen.map((s) => s.id), [id, id, id], 'same clientEntryId every time');
  assert.deepEqual(seen.map((s) => s.frame), ['the-picture', 'the-picture', 'the-picture']);
  assert.deepEqual(seen.map((s) => s.attempt), [1, 2, 3]);
  assert.deepEqual(deps.sleeps, [1000, 2000]);
  assert.deepEqual(accepted, [id], 'the page hears about the entry once');
  assert.equal(q.snapshot().doneCount, 1);
});

test('a rate limit waits at least five seconds, and the wait stays under half a minute', () => {
  const f429 = failureFromResponse(429, { code: 'RATE_LIMITED' });
  assert.equal(defaultBackoffMs(1, f429), 5000);
  assert.equal(defaultBackoffMs(4, f429), 8000);
  const f500 = failureFromResponse(500, null);
  assert.equal(defaultBackoffMs(1, f500), 1000);
  assert.equal(defaultBackoffMs(20, f500), 30000);
});

test('a client error stops that picture only; the rest keep going', async () => {
  const calls: Record<string, number> = {};
  const deps = baseDeps(async (item) => {
    calls[item.clientEntryId] = (calls[item.clientEntryId] || 0) + 1;
    return item.frame === 'bad' ? failResult(400, 'BAD_FRAME') : okResult(item.clientEntryId);
  });
  const q = createUploadQueue<Pic>(deps);
  q.enqueue({ frame: 'one' });
  const badId = q.enqueue({ frame: 'bad' });
  q.enqueue({ frame: 'three' });
  await q.whenIdle();
  const snap = q.snapshot();
  assert.equal(calls[badId], 1, 'a 400 is not retried');
  assert.equal(snap.failed, 1);
  assert.equal(snap.doneCount, 2);
  assert.equal(snap.halted, false);
  assert.equal(snap.items.length, 1);
  assert.equal(snap.items[0].status, 'FAILED');
  assert.equal(snap.items[0].failure && snap.items[0].failure.code, 'BAD_FRAME');
  assert.deepEqual(deps.sleeps, [], 'no wait for a client error');
});

test('server errors are retried up to the limit, then marked failed; retry() starts over', async () => {
  let calls = 0;
  const deps = baseDeps(async () => {
    calls += 1;
    return failResult(500, 'SERVER_ERROR');
  }, { maxAttempts: 3 });
  const q = createUploadQueue<Pic>(deps);
  const id = q.enqueue({ frame: 'x' });
  await q.whenIdle();
  assert.equal(calls, 3);
  assert.equal(q.snapshot().failed, 1);
  assert.equal(deps.sleeps.length, 2);
  q.retry(id);
  await q.whenIdle();
  assert.equal(calls, 6, 'a manual retry gets a fresh set of tries');
  assert.equal(q.snapshot().items[0].attempts, 3);
});

test('a quota stop halts the queue, keeps the pictures, and resume() sends them', async () => {
  const sent: string[] = [];
  let quotaLeft = false;
  const deps = baseDeps(async (item) => {
    sent.push(item.frame);
    return quotaLeft ? okResult(item.clientEntryId) : failResult(429, 'AI_QUOTA_EXCEEDED');
  });
  const q = createUploadQueue<Pic>(deps);
  q.enqueue({ frame: 'a' });
  q.enqueue({ frame: 'b' });
  q.enqueue({ frame: 'c' });
  q.enqueue({ frame: 'd' });
  await q.whenIdle();
  let snap = q.snapshot();
  assert.equal(snap.halted, true);
  assert.equal(snap.haltFailure && snap.haltFailure.code, 'AI_QUOTA_EXCEEDED');
  assert.equal(snap.failed, 0, 'nothing is thrown away');
  assert.equal(snap.pending, 4);
  assert.deepEqual(sent, ['a', 'b'], 'nothing else is started once it is halted');
  assert.deepEqual(deps.sleeps, [], 'a quota stop is not retried');

  quotaLeft = true;
  q.resume();
  await q.whenIdle();
  snap = q.snapshot();
  assert.equal(snap.halted, false);
  assert.equal(snap.doneCount, 4);
  assert.deepEqual(sent.slice(2).sort(), ['a', 'b', 'c', 'd']);
});

test('pause stops new sends and resume continues', async () => {
  const sent: string[] = [];
  const q = createUploadQueue<Pic>(baseDeps(async (item) => {
    sent.push(item.frame);
    return okResult(item.clientEntryId);
  }));
  q.pause();
  q.enqueue({ frame: 'a' });
  q.enqueue({ frame: 'b' });
  await tick();
  assert.deepEqual(sent, []);
  assert.equal(q.snapshot().pending, 2);
  q.resume();
  await q.whenIdle();
  assert.deepEqual(sent, ['a', 'b']);
});

test('unsent pictures survive a reload, in order, with the same ids', async () => {
  const store = memoryStore();
  const never = deferred<ScanResult<FrameResult>>();
  const first = createUploadQueue<Pic>(baseDeps(() => never.promise, { store }));
  first.enqueue({ frame: 'one', placementId: 'p-1' });
  first.enqueue({ frame: 'two', placementId: 'p-2', gameHint: 'MTG' });
  first.enqueue({ frame: 'three' });
  await tick();
  assert.deepEqual(store.saved.map((s) => s.clientEntryId), ['id-1', 'id-2', 'id-3'], 'all three are on disk, sending or not');
  assert.deepEqual(store.saved.map((s) => s.frame), ['one', 'two', 'three']);

  // The page reloads: a new queue reads what was on disk.
  const sent: Array<{ id: string; frame: Pic; placement: string | null; hint: string | null }> = [];
  const second = createUploadQueue<Pic>(baseDeps(async (item) => {
    sent.push({ id: item.clientEntryId, frame: item.frame, placement: item.placementId, hint: item.gameHint });
    return okResult(item.clientEntryId);
  }, { store }));
  const restored = await second.restore();
  assert.equal(restored, 3);
  await second.whenIdle();
  assert.deepEqual(sent.map((s) => s.id), ['id-1', 'id-2', 'id-3']);
  assert.deepEqual(sent.map((s) => s.frame), ['one', 'two', 'three']);
  assert.deepEqual(sent.map((s) => s.placement), ['p-1', 'p-2', null]);
  assert.equal(sent[1].hint, 'MTG');
  assert.deepEqual(store.saved, [], 'once sent, nothing is left on disk');
});

test('restore does not add a picture that is already in the queue, and survives a store that fails', async () => {
  const store = memoryStore([{ clientEntryId: 'old-1', placementId: null, gameHint: null, fileName: 'a.jpg', frame: 'a', seq: 5 }]);
  const deps = baseDeps(async (item) => okResult(item.clientEntryId), { store });
  const q = createUploadQueue<Pic>(deps);
  q.pause();
  q.enqueue({ frame: 'a', clientEntryId: 'old-1' });
  assert.equal(await q.restore(), 0, 'the id is already waiting, so it is not added twice');
  q.resume();
  await q.whenIdle();
  assert.equal(q.snapshot().doneCount, 1);

  const broken: PendingStore<Pic> = {
    async load() {
      throw new Error('disk gone');
    },
    async save() {
      throw new Error('disk gone');
    },
  };
  const q2 = createUploadQueue<Pic>(baseDeps(async (item) => okResult(item.clientEntryId), { store: broken }));
  assert.equal(await q2.restore(), 0);
  q2.enqueue({ frame: 'z' });
  await q2.whenIdle();
  assert.equal(q2.snapshot().doneCount, 1, 'a failing store never stops sending');
});

test('the same clientEntryId enqueued twice is one picture', async () => {
  const sent: string[] = [];
  const q = createUploadQueue<Pic>(baseDeps(async (item) => {
    sent.push(item.clientEntryId);
    return okResult(item.clientEntryId);
  }));
  q.pause();
  const a = q.enqueue({ frame: 'a', clientEntryId: 'same' });
  const b = q.enqueue({ frame: 'a-again', clientEntryId: 'same' });
  assert.equal(a, 'same');
  assert.equal(b, 'same');
  assert.equal(q.snapshot().items.length, 1);
  q.resume();
  await q.whenIdle();
  assert.deepEqual(sent, ['same']);
});

test('dismiss and clear remove pictures, and a thrown send is treated as a network failure', async () => {
  const gate = deferred<ScanResult<FrameResult>>();
  let threw = 0;
  const q = createUploadQueue<Pic>(baseDeps(async (item) => {
    if (item.frame === 'boom' && threw === 0) {
      threw += 1;
      throw new Error('socket closed');
    }
    return item.frame === 'hold' ? gate.promise : okResult(item.clientEntryId);
  }));
  q.pause();
  const a = q.enqueue({ frame: 'a' });
  q.enqueue({ frame: 'b' });
  q.dismiss(a);
  assert.equal(q.snapshot().items.length, 1);
  q.clear();
  assert.equal(q.snapshot().items.length, 0);

  q.resume();
  q.enqueue({ frame: 'boom' });
  await q.whenIdle();
  assert.equal(q.snapshot().doneCount, 1, 'the throw was retried and then worked');
  q.enqueue({ frame: 'hold' });
  assert.equal(q.snapshot().sending, 1);
  q.clear();
  gate.resolve(okResult('late'));
  await q.whenIdle();
  assert.equal(q.snapshot().items.length, 0);
  assert.equal(q.snapshot().doneCount, 1, 'a cleared picture that finishes late is not counted');
});

test('listeners hear about changes and can stop listening', async () => {
  const q = createUploadQueue<Pic>(baseDeps(async (item) => okResult(item.clientEntryId)));
  let heard = 0;
  const off = q.subscribe(() => {
    heard += 1;
  });
  q.enqueue({ frame: 'a' });
  await q.whenIdle();
  assert.ok(heard >= 2);
  off();
  const before = heard;
  q.enqueue({ frame: 'b' });
  await q.whenIdle();
  assert.equal(heard, before);
});

test('newClientEntryId looks like a version 4 id and is different each time', () => {
  const a = newClientEntryId();
  const b = newClientEntryId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
  let n = 0;
  assert.equal(newClientEntryId(() => (n++ % 16) / 16).length, 36);
});

test('makeFrameSender posts the picture, ids and game hint as one multipart request', async () => {
  const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
  const client = createScanClient({
    apiBase: '/api',
    getCsrfToken: () => 'csrf-1',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { entry: { id: 'e1', status: 'NEEDS_REVIEW', updatedAt: 'x' }, duplicate: 'SAME_PLACEMENT', charged: false } }),
        text: async () => '',
      };
    },
  });
  const send = makeFrameSender<Blob>(client, 'sess 1');
  const item: UploadItem<Blob> = {
    clientEntryId: 'c-1',
    placementId: 'p-1',
    gameHint: 'MTG',
    fileName: 'card.jpg',
    frame: new Blob(['jpegbytes'], { type: 'image/jpeg' }),
    status: 'SENDING',
    attempts: 1,
    failure: null,
    seq: 1,
  };
  const res = await send(item, undefined);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.duplicate, 'SAME_PLACEMENT');
    assert.equal(res.data.charged, false);
    assert.equal(res.data.entry.id, 'e1');
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/card-scan/sessions/sess%201/frames');
  assert.equal(calls[0].init.method, 'POST');
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers['x-csrf-token'], 'csrf-1');
  assert.equal(headers['Content-Type'], undefined, 'the browser sets the multipart boundary');
  const form = calls[0].init.body as FormData;
  assert.equal(form.get('clientEntryId'), 'c-1');
  assert.equal(form.get('placementId'), 'p-1');
  assert.equal(form.get('gameHint'), 'MTG');
  assert.ok(form.get('frame') instanceof Blob);
});
