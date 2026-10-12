/**
 * Card scan session service (ADR-138 sections 2.1, 3.5, 3.6, 8 and 9; acceptance AT-10 to AT-13 and the session half
 * of the authorization and limit rules). Everything runs on the in-memory database and catalog of
 * __fixtures__/cardScanFakes.ts with an injected recognizer: no database, no network, no paid call.
 */
import { createHash } from 'crypto';
import { SCAN_API_MESSAGES, SCAN_STATUS_MESSAGES } from '../services/cardScan/messages';
import {
  addManualEntry,
  bulkUpdate,
  createSession,
  discardSession,
  getSession,
  ingestFrame,
  ingestObservation,
  isScanFailure,
  listSessions,
  patchEntry,
  purgeStaleSessions,
} from '../services/cardScan/sessionService';
import type {
  BulkInput,
  CreateSessionInput,
  EntryPatch,
  FrameInput,
  FrameRecognition,
  FrameRecognizer,
  ManualEntryInput,
  ScanFailure,
  ScanResult,
} from '../services/cardScan/sessionService';
import {
  BOLTS,
  CATALOG_OFF_STATE,
  MOX,
  ORGANIZER_ID,
  OTHER_ORGANIZER_ID,
  OTHER_SALE_ID,
  SALE_ID,
  makeScanHarness,
  observation,
} from './__fixtures__/cardScanFakes';

type Harness = ReturnType<typeof makeScanHarness>;

const DAY = 24 * 60 * 60 * 1000;
const BOLT_READ = { cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161' };
const MOX_READ = { cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '263' };

function sha(seed: string | number): string {
  return createHash('sha256').update(String(seed)).digest('hex');
}

function must<T>(result: ScanResult<T>): T {
  if (result.ok === false) throw new Error(`Expected success, got ${result.status} ${result.code}`);
  return result.data;
}

function failureOf<T>(result: ScanResult<T>, status: number, code: string): ScanFailure {
  expect(isScanFailure(result)).toBe(true);
  if (result.ok === true) throw new Error('Expected a failure');
  expect({ status: result.status, code: result.code }).toEqual({ status, code });
  return result;
}

/** A recognizer that counts its calls. */
function recognizer(result: FrameRecognition | (() => FrameRecognition | Promise<FrameRecognition>)) {
  const state = { calls: 0 };
  const run: FrameRecognizer = async () => {
    state.calls += 1;
    return typeof result === 'function' ? result() : result;
  };
  return { run, state };
}

function sees(over: Parameters<typeof observation>[0] = BOLT_READ, charged = true): FrameRecognition {
  return { ok: true, observation: observation(over), charged };
}

function frame(sessionId: string, n: number, over: Partial<FrameInput> = {}): FrameInput {
  return { organizerId: ORGANIZER_ID, sessionId, clientEntryId: `c${n}`, imageSha256: sha(`img${n}`), placementId: `pl${n}`, ...over };
}

async function openSession(h: Harness, over: Partial<CreateSessionInput> = {}): Promise<string> {
  return must(await createSession(h.deps, { organizerId: ORGANIZER_ID, saleId: SALE_ID, ...over })).session.id;
}

async function addTyped(h: Harness, sessionId: string, clientEntryId: string, printingId: string, over: Partial<ManualEntryInput> = {}) {
  return must(await addManualEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId, clientEntryId, printingId, ...over })).entry;
}

describe('sessions: create, list, get, discard', () => {
  it('creates an open session with normalized fields', async () => {
    const h = makeScanHarness();
    const { session } = must(
      await createSession(h.deps, { organizerId: ORGANIZER_ID, saleId: SALE_ID, label: '  Binder   one ', defaultConditionCode: 'nm' })
    );
    expect(session).toMatchObject({
      saleId: SALE_ID,
      source: 'PHOTO',
      status: 'OPEN',
      label: 'Binder one',
      defaultGame: 'MTG',
      defaultConditionCode: 'NM',
      defaultFinish: null,
    });
  });

  it('refuses a missing sale, another organizer\'s sale and invalid input', async () => {
    const h = makeScanHarness();
    const base = { organizerId: ORGANIZER_ID, saleId: SALE_ID };
    expect(failureOf(await createSession(h.deps, { ...base, saleId: 'nope' }), 404, 'SALE_NOT_FOUND').message).toBe(SCAN_API_MESSAGES.SALE_NOT_FOUND);
    failureOf(await createSession(h.deps, { ...base, saleId: OTHER_SALE_ID }), 403, 'NOT_YOUR_SALE');
    failureOf(await createSession(h.deps, { ...base, label: 'x'.repeat(61) }), 400, 'BAD_REQUEST');
    failureOf(await createSession(h.deps, { ...base, defaultConditionCode: 'ZZ' }), 400, 'BAD_REQUEST');
    failureOf(await createSession(h.deps, { ...base, defaultFinish: 'SPARKLY' }), 400, 'BAD_REQUEST');
    failureOf(await createSession(h.deps, { ...base, source: 'EMAIL' }), 400, 'BAD_REQUEST');
    failureOf(await createSession(h.deps, { ...base, defaultGame: 'CHESS' }), 400, 'BAD_REQUEST');
    expect(h.scan.sessions.size).toBe(0);
  });

  it('allows five open sessions per sale and refuses the sixth until one is discarded', async () => {
    const h = makeScanHarness();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push(await openSession(h));
    failureOf(await createSession(h.deps, { organizerId: ORGANIZER_ID, saleId: SALE_ID }), 409, 'TOO_MANY_OPEN_SESSIONS');
    must(await discardSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: ids[0] }));
    expect(must(await createSession(h.deps, { organizerId: ORGANIZER_ID, saleId: SALE_ID })).session.status).toBe('OPEN');
  });

  it('lists the caller\'s sessions with counts and never another organizer\'s', async () => {
    const h = makeScanHarness();
    const a = await openSession(h, { label: 'A' });
    const b = await openSession(h, { label: 'B' });
    await addTyped(h, a, 'm1', BOLTS[0].id);
    await addTyped(h, a, 'm2', MOX.id);
    const other = must(await createSession(h.deps, { organizerId: OTHER_ORGANIZER_ID, saleId: OTHER_SALE_ID })).session.id;

    const mine = must(await listSessions(h.deps, { organizerId: ORGANIZER_ID, saleId: SALE_ID })).sessions;
    expect(mine.map((s) => s.id).sort()).toEqual([a, b].sort());
    expect(mine.find((s) => s.id === a)?.counts).toMatchObject({ needsReview: 2, ready: 0, committed: 0 });
    expect(mine.find((s) => s.id === b)?.counts).toMatchObject({ needsReview: 0 });

    expect(must(await listSessions(h.deps, { organizerId: OTHER_ORGANIZER_ID, saleId: OTHER_SALE_ID })).sessions.map((s) => s.id)).toEqual([other]);
    failureOf(await listSessions(h.deps, { organizerId: OTHER_ORGANIZER_ID, saleId: SALE_ID }), 403, 'NOT_YOUR_SALE');
  });

  it('returns the queue in seq order, polls after a seq, and hides another organizer\'s session as not found', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    for (const n of [1, 2, 3]) await addTyped(h, sid, `m${n}`, BOLTS[0].id);
    const all = must(await getSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid }));
    expect(all.entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(all.counts.needsReview).toBe(3);
    expect(all.catalogReady).toBe(true);
    expect(all.delver).toBeNull();
    expect(must(await getSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, afterSeq: 1 })).entries.map((e) => e.seq)).toEqual([2, 3]);
    expect(must(await getSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, limit: 1 })).entries.map((e) => e.seq)).toEqual([1]);

    failureOf(await getSession(h.deps, { organizerId: OTHER_ORGANIZER_ID, sessionId: sid }), 404, 'SESSION_NOT_FOUND');
    failureOf(await getSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: 'missing' }), 404, 'SESSION_NOT_FOUND');
  });

  it('shows the Delver status only for a Delver session', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h, { source: 'DELVER' });
    const view = must(await getSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid }));
    expect(view.delver).not.toBeNull();
    expect(typeof view.delver?.lastActivityAt).toBe('string');
  });

  it('discards a session, keeps discarding idempotent, and refuses writes afterwards', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    await addTyped(h, sid, 'm1', BOLTS[0].id);
    expect(must(await discardSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid }))).toEqual({ status: 'DISCARDED' });
    expect(must(await discardSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid }))).toEqual({ status: 'DISCARDED' });
    failureOf(await addManualEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, clientEntryId: 'm2', printingId: MOX.id }), 409, 'SESSION_NOT_OPEN');
    const rec = recognizer(sees());
    failureOf(await ingestFrame(h.deps, frame(sid, 1), rec.run), 409, 'SESSION_NOT_OPEN');
    expect(rec.state.calls).toBe(0);
    failureOf(await discardSession(h.deps, { organizerId: OTHER_ORGANIZER_ID, sessionId: sid }), 404, 'SESSION_NOT_FOUND');
  });

  it('refuses to discard or change a session that is being committed', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const entry = await addTyped(h, sid, 'm1', BOLTS[0].id);
    h.scan.sessions.get(sid)!.status = 'COMMITTING';
    failureOf(await discardSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid }), 409, 'SESSION_COMMITTING');
    failureOf(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: entry.id, patch: { quantity: 2 } }), 409, 'SESSION_COMMITTING');
    failureOf(await bulkUpdate(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryIds: [entry.id], action: 'SKIP' }), 409, 'SESSION_COMMITTING');
    failureOf(await addManualEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, clientEntryId: 'm2', printingId: MOX.id }), 409, 'SESSION_COMMITTING');
  });
});

describe('lazy purge', () => {
  it('deletes this organizer\'s stale sessions and their entries, and nothing else', async () => {
    const h = makeScanHarness();
    const old = (days: number) => new Date(h.clock.ms - days * DAY);
    const idleOpen = h.scan.seedSession({ lastActivityAt: old(31) });
    const freshOpen = h.scan.seedSession({ lastActivityAt: old(1) });
    const nearlyIdle = h.scan.seedSession({ lastActivityAt: old(29) });
    const oldClosed = h.scan.seedSession({ status: 'CLOSED', lastActivityAt: old(15) });
    const recentClosed = h.scan.seedSession({ status: 'CLOSED', lastActivityAt: old(13) });
    const oldDiscarded = h.scan.seedSession({ status: 'DISCARDED', lastActivityAt: old(15) });
    const stuck = h.scan.seedSession({ status: 'COMMITTING', lastActivityAt: old(60) });
    const foreign = h.scan.seedSession({ organizerId: OTHER_ORGANIZER_ID, saleId: OTHER_SALE_ID, lastActivityAt: old(90) });
    h.scan.seedEntry({ sessionId: idleOpen.id, seq: 1 });
    h.scan.seedEntry({ sessionId: freshOpen.id, seq: 1 });

    expect(await purgeStaleSessions(h.deps, { organizerId: ORGANIZER_ID })).toBe(3);
    const left = Array.from(h.scan.sessions.keys()).sort();
    expect(left).toEqual([freshOpen.id, nearlyIdle.id, recentClosed.id, stuck.id, foreign.id].sort());
    expect(h.scan.entriesOf(idleOpen.id)).toHaveLength(0);
    expect(h.scan.entriesOf(freshOpen.id)).toHaveLength(1);
    expect(oldClosed.id).not.toBe(oldDiscarded.id);
  });

  it('runs when a session is created', async () => {
    const h = makeScanHarness();
    const idle = h.scan.seedSession({ lastActivityAt: new Date(h.clock.ms - 40 * DAY) });
    await openSession(h);
    expect(h.scan.sessions.has(idle.id)).toBe(false);
  });
});

describe('sequence numbers and the entry cap', () => {
  it('gives ten concurrent adds ten distinct sequence numbers from 1', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => addManualEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, clientEntryId: `m${i}`, printingId: BOLTS[0].id }))
    );
    const seqs = results.map((r) => must(r).entry.seq).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(h.scan.sessions.get(sid)!.nextSeq).toBe(10);
  });

  it('stops at the entry cap with SESSION_FULL, before the recognizer runs', async () => {
    const h = makeScanHarness({ env: { CARD_SCAN_MAX_ENTRIES: '2' } });
    const sid = await openSession(h);
    await addTyped(h, sid, 'm1', BOLTS[0].id);
    await addTyped(h, sid, 'm2', MOX.id);
    failureOf(await addManualEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, clientEntryId: 'm3', printingId: BOLTS[1].id }), 409, 'SESSION_FULL');
    const rec = recognizer(sees());
    failureOf(await ingestFrame(h.deps, frame(sid, 1), rec.run), 409, 'SESSION_FULL');
    expect(rec.state.calls).toBe(0);
    // A retry of an entry that already exists is still answered.
    expect(must(await addManualEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, clientEntryId: 'm1', printingId: BOLTS[0].id })).entry.seq).toBe(1);
  });
});

describe('frame intake and the early duplicate layers', () => {
  it('AT-10: the same clientEntryId twice makes one entry and calls the recognizer once', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const rec = recognizer(sees());
    const first = must(await ingestFrame(h.deps, frame(sid, 1), rec.run));
    const again = must(await ingestFrame(h.deps, frame(sid, 1, { imageSha256: sha('other bytes'), placementId: 'other' }), rec.run));
    expect(rec.state.calls).toBe(1);
    expect(first).toMatchObject({ duplicate: null, charged: true });
    expect(again).toMatchObject({ duplicate: 'SAME_ENTRY', charged: false });
    expect(again.entry.id).toBe(first.entry.id);
    expect(h.scan.entriesOf(sid)).toHaveLength(1);
  });

  it('AT-11: the same placementId returns the existing entry; one re-read is allowed after a failed read; a third attempt is refused', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const reads: FrameRecognition[] = [{ ok: false, code: 'NO_CARD', charged: true }, sees(BOLT_READ), sees(MOX_READ)];
    const rec = recognizer(() => reads.shift() as FrameRecognition);

    const first = must(await ingestFrame(h.deps, frame(sid, 1, { placementId: 'p1' }), rec.run));
    expect(first.entry.errorCode).toBe('NO_CARD');
    expect(first.entry.status).toBe('NEEDS_REVIEW');
    expect(first.entry.resolution.status).toBe('UNMATCHED');

    const second = must(await ingestFrame(h.deps, frame(sid, 2, { placementId: 'p1' }), rec.run));
    expect(rec.state.calls).toBe(2);
    expect(second.duplicate).toBeNull();
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.entry.resolution.status).toBe('EXACT');
    expect(second.entry.chosen.printingId).toBe(BOLTS[0].id);
    expect(second.entry.errorCode).toBeNull();
    expect(h.scan.entriesOf(sid)).toHaveLength(1);
    expect(h.scan.entriesOf(sid)[0].attempts).toBe(2);

    const third = must(await ingestFrame(h.deps, frame(sid, 3, { placementId: 'p1' }), rec.run));
    expect(rec.state.calls).toBe(2);
    expect(third).toMatchObject({ duplicate: 'SAME_PLACEMENT', charged: false });
    expect(third.entry.id).toBe(first.entry.id);
    expect(third.entry.chosen.printingId).toBe(BOLTS[0].id);
  });

  it('AT-11: a placement whose first reading was a usable match is never re-read', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const rec = recognizer(sees());
    const first = must(await ingestFrame(h.deps, frame(sid, 1, { placementId: 'p1' }), rec.run));
    const second = must(await ingestFrame(h.deps, frame(sid, 2, { placementId: 'p1' }), rec.run));
    expect(rec.state.calls).toBe(1);
    expect(second).toMatchObject({ duplicate: 'SAME_PLACEMENT', charged: false });
    expect(second.entry.id).toBe(first.entry.id);
  });

  it('AT-12: the same image bytes return the existing entry with no recognizer call', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const rec = recognizer(sees());
    const first = must(await ingestFrame(h.deps, frame(sid, 1), rec.run));
    const again = must(await ingestFrame(h.deps, frame(sid, 2, { imageSha256: sha('img1') }), rec.run));
    expect(rec.state.calls).toBe(1);
    expect(again).toMatchObject({ duplicate: 'SAME_IMAGE', charged: false });
    expect(again.entry.id).toBe(first.entry.id);
    expect(h.scan.entriesOf(sid)).toHaveLength(1);
  });

  it('AT-13: a repeat of the same card inside the window with no placementId is held, not counted', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h, { defaultConditionCode: 'NM' });
    const rec = recognizer(sees());
    const first = must(await ingestFrame(h.deps, frame(sid, 1, { placementId: null }), rec.run));
    expect(first.entry.status).toBe('READY');
    h.clock.ms += 1000;
    const repeat = must(await ingestFrame(h.deps, frame(sid, 2, { placementId: null }), rec.run));
    expect(repeat.duplicate).toBe('SUSPECT_REPEAT');
    expect(repeat.entry.suspectDuplicateOf).toBe(first.entry.id);
    expect(repeat.entry.status).toBe('NEEDS_REVIEW');
    expect(repeat.entry.id).not.toBe(first.entry.id);
    expect(h.scan.entriesOf(sid)).toHaveLength(2);

    const counted = must(
      await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: repeat.entry.id, patch: { countAsAnother: true } })
    ).entry;
    expect(counted.suspectDuplicateOf).toBeNull();
    expect(counted.status).toBe('READY');
  });

  it('AT-13: outside the window, with another card, with a placementId, or from an upload on a different card, it is not held', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h, { defaultConditionCode: 'NM' });
    const rec = recognizer(() => sees(BOLT_READ));
    await ingestFrame(h.deps, frame(sid, 1, { placementId: null }), rec.run);

    h.clock.ms += 5000;
    const late = must(await ingestFrame(h.deps, frame(sid, 2, { placementId: null }), rec.run));
    expect(late.duplicate).toBeNull();
    expect(late.entry.suspectDuplicateOf).toBeNull();

    h.clock.ms += 100;
    const withPlacement = must(await ingestFrame(h.deps, frame(sid, 3, { placementId: 'fresh' }), rec.run));
    expect(withPlacement.duplicate).toBeNull();

    h.clock.ms += 100;
    const moxRec = recognizer(sees(MOX_READ));
    const other = must(await ingestFrame(h.deps, frame(sid, 4, { placementId: null, source: 'UPLOAD' }), moxRec.run));
    expect(other.duplicate).toBeNull();
    expect(other.entry.source).toBe('UPLOAD');

    h.clock.ms += 100;
    const sameUpload = must(await ingestFrame(h.deps, frame(sid, 5, { placementId: null, source: 'UPLOAD' }), moxRec.run));
    expect(sameUpload.duplicate).toBe('SUSPECT_REPEAT');
  });

  it('a manual add is never held as a repeat', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const a = await addTyped(h, sid, 'm1', BOLTS[0].id);
    const b = await addTyped(h, sid, 'm2', BOLTS[0].id);
    expect(a.suspectDuplicateOf).toBeNull();
    expect(b.suspectDuplicateOf).toBeNull();
  });

  it('rejects bad frame input before the recognizer runs, and hides another organizer\'s session', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const rec = recognizer(sees());
    failureOf(await ingestFrame(h.deps, frame(sid, 1, { clientEntryId: '' }), rec.run), 400, 'BAD_REQUEST');
    failureOf(await ingestFrame(h.deps, frame(sid, 2, { imageSha256: 'not-a-hash' }), rec.run), 400, 'BAD_FRAME');
    failureOf(await ingestFrame(h.deps, frame(sid, 3, { organizerId: OTHER_ORGANIZER_ID }), rec.run), 404, 'SESSION_NOT_FOUND');
    failureOf(await ingestFrame(h.deps, frame('missing', 4), rec.run), 404, 'SESSION_NOT_FOUND');
    expect(rec.state.calls).toBe(0);
    expect(h.scan.entriesOf(sid)).toHaveLength(0);
  });
});

describe('recognizer outcomes', () => {
  it('turns scanning off, the daily cap and the monthly quota into failures with no entry and no sequence number used', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const disabled = failureOf(await ingestFrame(h.deps, frame(sid, 1), recognizer({ ok: false, code: 'DISABLED', charged: false }).run), 503, 'SCAN_DISABLED');
    expect(disabled.message).toBe(SCAN_STATUS_MESSAGES.DISABLED);
    const cap = failureOf(await ingestFrame(h.deps, frame(sid, 2), recognizer({ ok: false, code: 'CAP_REACHED', charged: false }).run), 429, 'SCAN_CAP_REACHED');
    expect(cap.message).toBe(SCAN_STATUS_MESSAGES.CAP_REACHED);
    const quota = failureOf(await ingestFrame(h.deps, frame(sid, 3), recognizer({ ok: false, code: 'QUOTA_EXCEEDED', charged: false }).run), 429, 'AI_QUOTA_EXCEEDED');
    expect(quota.message).toBe(SCAN_STATUS_MESSAGES.QUOTA_EXCEEDED);
    expect(h.scan.entriesOf(sid)).toHaveLength(0);
    expect(h.scan.sessions.get(sid)!.nextSeq).toBe(0);
  });

  it('keeps a row for an unreadable frame or a provider error so the organizer can type it or let a retry re-read it', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const unreadable = must(await ingestFrame(h.deps, frame(sid, 1), recognizer({ ok: false, code: 'UNREADABLE', charged: true }).run));
    expect(unreadable.entry).toMatchObject({ status: 'NEEDS_REVIEW', errorCode: 'UNREADABLE', read: null });
    expect(unreadable.charged).toBe(true);

    const providerError = must(await ingestFrame(h.deps, frame(sid, 2), recognizer({ ok: false, code: 'PROVIDER_ERROR', charged: false }).run));
    expect(providerError.entry).toMatchObject({ status: 'ERROR', errorCode: 'PROVIDER_ERROR' });
    expect(providerError.charged).toBe(false);

    const rateLimit = must(await ingestFrame(h.deps, frame(sid, 3), recognizer({ ok: false, code: 'RATE_LIMIT', charged: false }).run));
    expect(rateLimit.entry).toMatchObject({ status: 'ERROR', errorCode: 'RATE_LIMIT' });

    const thrown = must(
      await ingestFrame(h.deps, frame(sid, 4), recognizer(() => {
        throw new Error('network down');
      }).run)
    );
    expect(thrown.entry).toMatchObject({ status: 'ERROR', errorCode: 'PROVIDER_ERROR' });
    expect(h.scan.entriesOf(sid).map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('lets the organizer type over an error row and commit it as typed', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const row = must(await ingestFrame(h.deps, frame(sid, 1), recognizer({ ok: false, code: 'PROVIDER_ERROR', charged: false }).run)).entry;
    const fixed = must(
      await patchEntry(h.deps, {
        organizerId: ORGANIZER_ID,
        sessionId: sid,
        entryId: row.id,
        patch: { acceptAsTyped: true, cardName: 'Home Brew Card', conditionCode: 'LP' },
      })
    ).entry;
    expect(fixed).toMatchObject({ status: 'READY', errorCode: null });
    expect(fixed.chosen).toMatchObject({ acceptAsTyped: true, cardName: 'Home Brew Card', conditionCode: 'LP', printingId: null });
  });
});

describe('what a reading does and does not fill in', () => {
  it('copies the reading into the card columns and pre-selects the printing, but never a condition, finish or grading', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const rec = recognizer(
      sees({
        ...BOLT_READ,
        setCode: 'm10',
        collectorNumber: '146',
        setName: 'Magic 2010',
        language: 'en',
        finish: 'FOIL',
        suggestedConditionCode: 'NM',
        grader: 'PSA',
        grade: '9',
        certNumber: '12345678',
        confidence: 0.91,
      })
    );
    const { entry } = must(await ingestFrame(h.deps, frame(sid, 1), rec.run));
    expect(entry.resolution).toMatchObject({ status: 'EXACT', printingId: BOLTS[1].id, agreement: 'FULL' });
    expect(entry.chosen).toMatchObject({
      game: 'MTG',
      printingId: BOLTS[1].id,
      cardName: 'Lightning Bolt',
      setCode: 'm10',
      setName: 'Magic 2010',
      collectorNumber: '146',
      language: 'en',
      finish: null,
      conditionCode: null,
      grader: null,
      grade: null,
      certNumber: null,
      quantity: 1,
    });
    expect(entry.read).toMatchObject({ name: 'Lightning Bolt', setCode: 'm10', finish: 'FOIL', confidence: 0.91 });
    expect(entry.suggested).toEqual({ conditionCode: 'NM', grader: 'PSA', grade: '9', certNumber: '12345678', source: 'HAIKU' });
    expect(entry.status).toBe('NEEDS_REVIEW');
    expect(entry.needs).toEqual(['FINISH', 'CONDITION']);
  });

  it('keeps an unmatched reading as typed details the organizer can accept', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const rec = recognizer(sees({ game: 'POKEMON', cardName: 'Pikachu', setCode: 'base1', collectorNumber: '58' }));
    const { entry } = must(await ingestFrame(h.deps, frame(sid, 1), rec.run));
    expect(entry.resolution).toMatchObject({ status: 'UNMATCHED', note: 'GAME_NOT_SERVED' });
    expect(entry.chosen).toMatchObject({ game: 'POKEMON', cardName: 'Pikachu', setCode: 'base1', collectorNumber: '58', acceptAsTyped: false });
    expect(entry.needs).toEqual(['PRINTING', 'CONDITION']);
    expect(h.resolver.refCount()).toBe(0);

    const accepted = must(
      await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: entry.id, patch: { acceptAsTyped: true, conditionCode: 'LP' } })
    ).entry;
    expect(accepted.status).toBe('READY');
    expect(accepted.chosen).toMatchObject({ acceptAsTyped: true, cardName: 'Pikachu', game: 'POKEMON' });
  });

  it('a set and number whose name disagrees is AMBIGUOUS and pre-selects nothing', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const { entry } = must(await ingestFrame(h.deps, frame(sid, 1), recognizer(sees({ cardName: 'Counterspell', setCode: 'lea', collectorNumber: '161' })).run));
    expect(entry.resolution).toMatchObject({ status: 'AMBIGUOUS', note: 'NAME_MISMATCH', printingId: null });
    expect(entry.chosen.printingId).toBeNull();
    expect(entry.resolution.candidates.length).toBeGreaterThan(0);
    expect(entry.resolution.candidates.length).toBeLessThanOrEqual(5);
  });

  it('looks up candidates again only for entries that still need a pick', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    await addTyped(h, sid, 'm1', BOLTS[0].id);
    await addTyped(h, sid, 'm2', MOX.id);
    h.resolver.calls.length = 0;
    must(await getSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid }));
    expect(h.resolver.calls).toHaveLength(0);

    const { entry } = must(await ingestFrame(h.deps, frame(sid, 1), recognizer(sees({ cardName: 'Lightning Bolt' })).run));
    expect(entry.resolution.status).toBe('AMBIGUOUS');
    expect(entry.resolution.candidates).toHaveLength(5);
    expect(entry.resolution.truncated).toBe(true);
    h.resolver.calls.length = 0;
    const view = must(await getSession(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid }));
    expect(h.resolver.refCount()).toBeGreaterThan(0);
    expect(view.entries[2].resolution.candidates).toHaveLength(5);

    const picked = must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: entry.id, patch: { printingId: BOLTS[5].id } })).entry;
    expect(picked.chosen).toMatchObject({ printingId: BOLTS[5].id, setCode: 'clb', collectorNumber: '187', cardName: 'Lightning Bolt' });
    expect(picked.resolution.candidates.some((c) => c.printingId === BOLTS[5].id)).toBe(true);
  });

  it('keeps the paid reading when the catalog is off or cannot be asked', async () => {
    const off = makeScanHarness({ state: CATALOG_OFF_STATE });
    const offSid = await openSession(off);
    const { entry } = must(await ingestFrame(off.deps, frame(offSid, 1), recognizer(sees()).run));
    expect(entry.resolution).toMatchObject({ status: 'UNMATCHED', note: 'CATALOG_OFF' });
    expect(entry.chosen.cardName).toBe('Lightning Bolt');
    expect(off.resolver.refCount()).toBe(0);
    expect(must(await getSession(off.deps, { organizerId: ORGANIZER_ID, sessionId: offSid })).catalogReady).toBe(false);

    const broken = makeScanHarness();
    broken.deps.resolve = async () => {
      throw new Error('catalog unavailable');
    };
    const brokenSid = await openSession(broken);
    const kept = must(await ingestFrame(broken.deps, frame(brokenSid, 1), recognizer(sees()).run)).entry;
    expect(kept.resolution).toMatchObject({ status: 'UNMATCHED', note: 'CATALOG_OFF' });
    expect(kept.chosen.cardName).toBe('Lightning Bolt');
  });

  it('applies a session default finish only where it can: not to a single-finish printing, not after a foil-like read', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h, { defaultConditionCode: 'NM', defaultFinish: 'FOIL' });
    const twoFinishes = must(await ingestFrame(h.deps, frame(sid, 1), recognizer(sees({ ...BOLT_READ, setCode: 'm10', collectorNumber: '146' })).run)).entry;
    expect(twoFinishes.status).toBe('READY');
    const singleFinish = must(await ingestFrame(h.deps, frame(sid, 2), recognizer(sees(BOLT_READ)).run)).entry;
    expect(singleFinish.status).toBe('READY');
    expect(singleFinish.chosen.finish).toBeNull();
    const foilLike = must(
      await ingestFrame(h.deps, frame(sid, 3), recognizer(sees({ ...BOLT_READ, setCode: 'm10', collectorNumber: '146', finish: 'ETCHED' })).run)
    ).entry;
    expect(foilLike.status).toBe('NEEDS_REVIEW');
    expect(foilLike.needs).toEqual(['FINISH']);
  });
});

describe('manual add', () => {
  it('adds by catalog printing, copying the printing\'s details, and answers a retry with the same entry', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const entry = await addTyped(h, sid, 'm1', BOLTS[1].id, { quantity: 3, price: 4.5 });
    expect(entry).toMatchObject({ source: 'MANUAL', status: 'NEEDS_REVIEW', seq: 1 });
    expect(entry.chosen).toMatchObject({ printingId: BOLTS[1].id, cardName: 'Lightning Bolt', setCode: 'm10', collectorNumber: '146', quantity: 3, price: 4.5, acceptAsTyped: false });
    expect(entry.needs).toEqual(['FINISH', 'CONDITION']);
    const again = await addTyped(h, sid, 'm1', BOLTS[1].id);
    expect(again.id).toBe(entry.id);
    expect(h.scan.entriesOf(sid)).toHaveLength(1);
  });

  it('adds typed details with a name, ready when the condition is given, and works with the catalog off', async () => {
    const h = makeScanHarness({ state: CATALOG_OFF_STATE });
    const sid = await openSession(h);
    const typed = must(
      await addManualEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, clientEntryId: 't1', game: 'POKEMON', cardName: 'Pikachu', setCode: 'base1', conditionCode: 'nm' })
    ).entry;
    expect(typed).toMatchObject({ status: 'READY', source: 'MANUAL' });
    expect(typed.chosen).toMatchObject({ acceptAsTyped: true, game: 'POKEMON', cardName: 'Pikachu', conditionCode: 'NM', printingId: null });
  });

  it('refuses invalid input and unknown printings', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const base = { organizerId: ORGANIZER_ID, sessionId: sid };
    failureOf(await addManualEntry(h.deps, { ...base, clientEntryId: 'a' }), 400, 'CARD_VALIDATION');
    failureOf(await addManualEntry(h.deps, { ...base, clientEntryId: 'b', cardName: 'X', quantity: 0 }), 400, 'CARD_VALIDATION');
    failureOf(await addManualEntry(h.deps, { ...base, clientEntryId: 'c', cardName: 'X', conditionCode: 'ZZ' }), 400, 'CARD_VALIDATION');
    failureOf(await addManualEntry(h.deps, { ...base, clientEntryId: 'd', cardName: 'X', price: -1 }), 400, 'CARD_VALIDATION');
    failureOf(await addManualEntry(h.deps, { ...base, clientEntryId: 'e', printingId: 'SCRYFALL:gone' }), 404, 'CARD_NOT_FOUND');
    failureOf(await addManualEntry(h.deps, { ...base, clientEntryId: '', cardName: 'X' }), 400, 'BAD_REQUEST');
    failureOf(await addManualEntry(h.deps, { organizerId: OTHER_ORGANIZER_ID, sessionId: sid, clientEntryId: 'f', printingId: MOX.id }), 404, 'SESSION_NOT_FOUND');
    expect(h.scan.entriesOf(sid)).toHaveLength(0);
  });
});

describe('observation intake (the Delver feed)', () => {
  it('stores an observation with no recognizer, applies layer 1 only, and never holds a vendor repeat', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h, { source: 'DELVER' });
    const input = { organizerId: ORGANIZER_ID, sessionId: sid, source: 'DELVER' as const, observation: observation({ ...BOLT_READ, providerId: 'delver', suggestedConditionCode: 'LP' }) };
    const a = must(await ingestObservation(h.deps, { ...input, clientEntryId: 'delver:1', quantity: 3 }));
    expect(a.duplicate).toBeNull();
    expect(a.entry).toMatchObject({ source: 'DELVER', status: 'NEEDS_REVIEW' });
    expect(a.entry.chosen.quantity).toBe(3);
    expect(a.entry.suggested).toMatchObject({ conditionCode: 'LP', source: 'DELVER' });
    expect(a.entry.chosen.conditionCode).toBeNull();

    const again = must(await ingestObservation(h.deps, { ...input, clientEntryId: 'delver:1', quantity: 9 }));
    expect(again.duplicate).toBe('SAME_ENTRY');
    expect(again.entry.id).toBe(a.entry.id);
    expect(again.entry.chosen.quantity).toBe(3);

    const sameCard = must(await ingestObservation(h.deps, { ...input, clientEntryId: 'delver:2' }));
    expect(sameCard.duplicate).toBeNull();
    expect(sameCard.entry.suspectDuplicateOf).toBeNull();
    expect(h.scan.entriesOf(sid)).toHaveLength(2);
    failureOf(await ingestObservation(h.deps, { ...input, organizerId: OTHER_ORGANIZER_ID, clientEntryId: 'delver:3' }), 404, 'SESSION_NOT_FOUND');
  });
});

describe('patching one entry', () => {
  it('copies the chosen printing\'s details into the card columns and recomputes readiness', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const typed = must(
      await addManualEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, clientEntryId: 't1', cardName: 'lightning bolt', setCode: 'xx', finish: 'FOIL', conditionCode: 'NM' })
    ).entry;
    expect(typed.status).toBe('READY');
    const picked = must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: typed.id, patch: { printingId: BOLTS[0].id } })).entry;
    expect(picked.chosen).toMatchObject({ printingId: BOLTS[0].id, acceptAsTyped: false, cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161' });
    // The printing comes in one finish only, so the foil choice typed earlier is cleared and the card still commits.
    expect(picked.chosen.finish).toBeNull();
    expect(picked.status).toBe('READY');

    const cleared = must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: typed.id, patch: { printingId: null, conditionCode: null } })).entry;
    expect(cleared.chosen).toMatchObject({ printingId: null, conditionCode: null });
    expect(cleared.status).toBe('NEEDS_REVIEW');
  });

  it('takes a typed value over the printing\'s own value when both are sent', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const row = await addTyped(h, sid, 'm1', MOX.id);
    const out = must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: row.id, patch: { printingId: BOLTS[0].id, cardName: 'Bolt (mine)' } })).entry;
    expect(out.chosen).toMatchObject({ printingId: BOLTS[0].id, cardName: 'Bolt (mine)', setCode: 'lea' });
  });

  it('refuses a stale ifUpdatedAt with the latest entry, and accepts the current one', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const row = await addTyped(h, sid, 'm1', BOLTS[0].id);
    const edited = must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: row.id, patch: { quantity: 2, ifUpdatedAt: row.updatedAt } })).entry;
    expect(edited.chosen.quantity).toBe(2);
    expect(edited.updatedAt).not.toBe(row.updatedAt);

    const stale = failureOf(
      await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: row.id, patch: { quantity: 5, ifUpdatedAt: row.updatedAt } }),
      409,
      'ENTRY_CHANGED'
    );
    expect((stale.extra?.entry as { chosen: { quantity: number } }).chosen.quantity).toBe(2);
    const current = must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: row.id, patch: { quantity: 5, ifUpdatedAt: edited.updatedAt } })).entry;
    expect(current.chosen.quantity).toBe(5);
    failureOf(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: row.id, patch: { quantity: 1, ifUpdatedAt: 'yesterday' } }), 400, 'BAD_REQUEST');
  });

  it('skips and restores an entry, and a skipped entry stays skipped through other edits', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h, { defaultConditionCode: 'NM' });
    const row = await addTyped(h, sid, 'm1', BOLTS[0].id);
    expect(row.status).toBe('READY');
    const skipped = must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: row.id, patch: { skip: true } })).entry;
    expect(skipped.status).toBe('SKIPPED');
    const edited = must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: row.id, patch: { quantity: 2 } })).entry;
    expect(edited.status).toBe('SKIPPED');
    const back = must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: row.id, patch: { skip: false } })).entry;
    expect(back.status).toBe('READY');
  });

  it('refuses invalid values, unknown printings and a printing together with accept-as-typed', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const row = await addTyped(h, sid, 'm1', BOLTS[0].id);
    const call = (patch: EntryPatch) => patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: row.id, patch });
    failureOf(await call({ conditionCode: 'ZZ' }), 400, 'CARD_VALIDATION');
    failureOf(await call({ quantity: 0 }), 400, 'CARD_VALIDATION');
    failureOf(await call({ quantity: 1.5 }), 400, 'CARD_VALIDATION');
    failureOf(await call({ price: -2 }), 400, 'CARD_VALIDATION');
    failureOf(await call({ finish: 'SPARKLY' }), 400, 'CARD_VALIDATION');
    failureOf(await call({ game: 'CHESS' }), 400, 'CARD_VALIDATION');
    failureOf(await call({ printingId: 'SCRYFALL:gone' }), 404, 'CARD_NOT_FOUND');
    failureOf(await call({ printingId: MOX.id, acceptAsTyped: true }), 400, 'CARD_VALIDATION');
    failureOf(await call({ skip: 'yes' } as unknown as EntryPatch), 400, 'BAD_REQUEST');
    expect(h.scan.entriesOf(sid)[0].quantity).toBe(1);
  });

  it('finds an entry only inside the caller\'s own session', async () => {
    const h = makeScanHarness();
    const a = await openSession(h);
    const b = await openSession(h);
    const row = await addTyped(h, a, 'm1', BOLTS[0].id);
    failureOf(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: b, entryId: row.id, patch: { quantity: 2 } }), 404, 'ENTRY_NOT_FOUND');
    failureOf(await patchEntry(h.deps, { organizerId: OTHER_ORGANIZER_ID, sessionId: a, entryId: row.id, patch: { quantity: 2 } }), 404, 'SESSION_NOT_FOUND');
    failureOf(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: a, entryId: 'missing', patch: { quantity: 2 } }), 404, 'ENTRY_NOT_FOUND');
  });

  it('never changes a committing or committed entry', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const committing = h.scan.seedEntry({ sessionId: sid, seq: 1, status: 'COMMITTING', printingId: BOLTS[0].id, conditionCode: 'NM' });
    const committed = h.scan.seedEntry({ sessionId: sid, seq: 2, status: 'COMMITTED', printingId: MOX.id, conditionCode: 'NM' });
    failureOf(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: committing.id, patch: { quantity: 4 } }), 409, 'SESSION_COMMITTING');
    failureOf(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: committed.id, patch: { quantity: 4 } }), 409, 'ALREADY_APPLIED');
    expect(h.scan.entriesOf(sid).map((e) => e.quantity)).toEqual([1, 1]);
  });
});

describe('bulk actions', () => {
  async function three(h: Harness) {
    const sid = await openSession(h);
    const e1 = await addTyped(h, sid, 'm1', BOLTS[0].id);
    const e2 = await addTyped(h, sid, 'm2', MOX.id);
    const e3 = await addTyped(h, sid, 'm3', BOLTS[1].id);
    return { sid, e1, e2, e3 };
  }
  const bulk = (h: Harness, sid: string, entryIds: string[], action: string, extra: Partial<BulkInput> = {}) =>
    bulkUpdate(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryIds, action, ...extra });
  const statusesOf = (h: Harness, sid: string) => h.scan.entriesOf(sid).map((e) => e.status);

  it('sets a condition on many entries and recomputes each one\'s readiness', async () => {
    const h = makeScanHarness();
    const { sid, e1, e2, e3 } = await three(h);
    expect(must(await bulk(h, sid, [e1.id, e2.id, e3.id], 'SET_CONDITION', { conditionCode: 'nm' }))).toEqual({ updated: 3, ignored: 0 });
    expect(statusesOf(h, sid)).toEqual(['READY', 'READY', 'NEEDS_REVIEW']);
  });

  it('sets a finish only where the printing comes in it', async () => {
    const h = makeScanHarness();
    const { sid, e1, e3 } = await three(h);
    await bulk(h, sid, [e1.id, e3.id], 'SET_CONDITION', { conditionCode: 'NM' });
    expect(must(await bulk(h, sid, [e1.id, e3.id], 'SET_FINISH', { finish: 'FOIL' }))).toEqual({ updated: 1, ignored: 1 });
    const rows = h.scan.entriesOf(sid);
    expect(rows[0].finish).toBeNull();
    expect(rows[2]).toMatchObject({ finish: 'FOIL', status: 'READY' });
  });

  it('leaves a graded entry\'s condition alone and counts it as ignored', async () => {
    const h = makeScanHarness();
    const { sid, e2 } = await three(h);
    must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: e2.id, patch: { grader: 'PSA', grade: '9' } }));
    expect(must(await bulk(h, sid, [e2.id], 'SET_CONDITION', { conditionCode: 'LP' }))).toEqual({ updated: 0, ignored: 1 });
  });

  it('uses a suggested condition only on rows that have one and no condition of their own', async () => {
    const h = makeScanHarness();
    const sid = await openSession(h);
    const suggest = (n: number) => ingestFrame(h.deps, frame(sid, n), recognizer(sees({ ...BOLT_READ, suggestedConditionCode: 'NM' })).run);
    const f1 = must(await suggest(1)).entry;
    const f2 = must(await suggest(2)).entry;
    const f3 = must(await ingestFrame(h.deps, frame(sid, 3), recognizer(sees(MOX_READ)).run)).entry;
    must(await patchEntry(h.deps, { organizerId: ORGANIZER_ID, sessionId: sid, entryId: f2.id, patch: { conditionCode: 'LP' } }));
    expect(f1.chosen.conditionCode).toBeNull();

    expect(must(await bulk(h, sid, [f1.id, f2.id, f3.id], 'USE_SUGGESTED_CONDITION'))).toEqual({ updated: 1, ignored: 2 });
    const rows = h.scan.entriesOf(sid);
    expect(rows.map((r) => r.conditionCode)).toEqual(['NM', 'LP', null]);
  });

  it('skips, restores and deletes, and ignores ids that are not in the session or are frozen', async () => {
    const h = makeScanHarness();
    const { sid, e1, e2, e3 } = await three(h);
    await bulk(h, sid, [e1.id, e2.id, e3.id], 'SET_CONDITION', { conditionCode: 'NM' });
    expect(must(await bulk(h, sid, [e1.id, e2.id], 'SKIP'))).toEqual({ updated: 2, ignored: 0 });
    expect(must(await bulk(h, sid, [e1.id, e2.id], 'SKIP'))).toEqual({ updated: 0, ignored: 2 });
    expect(must(await bulk(h, sid, [e1.id, e3.id], 'UNSKIP'))).toEqual({ updated: 1, ignored: 1 });
    expect(statusesOf(h, sid)).toEqual(['READY', 'SKIPPED', 'NEEDS_REVIEW']);

    const frozen = h.scan.seedEntry({ sessionId: sid, seq: 9, status: 'COMMITTED' });
    expect(must(await bulk(h, sid, [e2.id, 'not-an-entry', frozen.id], 'DELETE'))).toEqual({ updated: 1, ignored: 2 });
    expect(h.scan.entriesOf(sid).map((e) => e.id)).toEqual([e1.id, e3.id, frozen.id]);
  });

  it('rejects empty, oversized and unknown requests, and hides another organizer\'s session', async () => {
    const h = makeScanHarness();
    const { sid, e1 } = await three(h);
    failureOf(await bulk(h, sid, [], 'SKIP'), 400, 'BAD_REQUEST');
    failureOf(await bulk(h, sid, Array.from({ length: 201 }, (_, i) => `id${i}`), 'SKIP'), 400, 'BAD_REQUEST');
    failureOf(await bulk(h, sid, [e1.id], 'NUKE'), 400, 'BAD_REQUEST');
    failureOf(await bulk(h, sid, [e1.id], 'SET_CONDITION'), 400, 'CARD_VALIDATION');
    failureOf(await bulk(h, sid, [e1.id], 'SET_FINISH', { finish: 'SPARKLY' }), 400, 'CARD_VALIDATION');
    failureOf(await bulkUpdate(h.deps, { organizerId: OTHER_ORGANIZER_ID, sessionId: sid, entryIds: [e1.id], action: 'DELETE' }), 404, 'SESSION_NOT_FOUND');
    expect(h.scan.entriesOf(sid)).toHaveLength(3);
  });
});
