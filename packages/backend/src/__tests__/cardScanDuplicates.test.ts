/**
 * The four duplicate layers for scans of one physical card (ADR-138 section 3.5, acceptance AT-13 for the pure
 * decision; the HTTP level checks of AT-10 to AT-12 belong to the session service and route batches).
 */
import {
  decideEarlyDuplicate,
  decideRepeatHold,
  identityKeyFor,
  identityKeyForReading,
} from '../services/cardScan/duplicateRules';
import type { DuplicateCandidateRow } from '../services/cardScan/duplicateRules';
import { selectReadyEntries } from '../services/cardScan/entryRecords';
import { BOLTS, MOX, printingMap, scanEntry } from './__fixtures__/cardScanFakes';

function row(over: Partial<DuplicateCandidateRow> = {}): DuplicateCandidateRow {
  return {
    id: 'e1',
    seq: 1,
    clientEntryId: null,
    placementId: null,
    imageSha256: null,
    attempts: 1,
    status: 'NEEDS_REVIEW',
    resolution: 'EXACT',
    acceptAsTyped: false,
    ...over,
  };
}

const NO_PROBE = { clientEntryId: null, placementId: null, imageSha256: null };

describe('layer 1: the same clientEntryId (a retried upload)', () => {
  it('returns the existing entry', () => {
    const d = decideEarlyDuplicate({ ...NO_PROBE, clientEntryId: 'c-1' }, [row({ id: 'a', clientEntryId: 'c-1' })]);
    expect(d).toEqual({ kind: 'SAME_ENTRY', entryId: 'a' });
  });

  it('wins over a placement or image match on another entry', () => {
    const d = decideEarlyDuplicate({ clientEntryId: 'c-1', placementId: 'p-1', imageSha256: 'h-1' }, [
      row({ id: 'b', placementId: 'p-1' }),
      row({ id: 'c', imageSha256: 'h-1' }),
      row({ id: 'a', clientEntryId: 'c-1' }),
    ]);
    expect(d).toEqual({ kind: 'SAME_ENTRY', entryId: 'a' });
  });

  it('never matches on blank or missing ids', () => {
    expect(decideEarlyDuplicate(NO_PROBE, [row()])).toEqual({ kind: 'NONE' });
    expect(decideEarlyDuplicate({ clientEntryId: '', placementId: '', imageSha256: '' }, [row({ clientEntryId: '', placementId: '', imageSha256: '' })])).toEqual({ kind: 'NONE' });
  });
});

describe('layer 2: the same placementId', () => {
  const probe = { ...NO_PROBE, placementId: 'p-1', imageSha256: 'h-new' };

  it('returns the existing entry without a re-read when the first reading was usable', () => {
    const d = decideEarlyDuplicate(probe, [row({ id: 'a', placementId: 'p-1', resolution: 'EXACT' })]);
    expect(d).toEqual({ kind: 'SAME_PLACEMENT', entryId: 'a', retry: false });
  });

  it('allows ONE re-read when the first reading was unmatched', () => {
    const d = decideEarlyDuplicate(probe, [row({ id: 'a', placementId: 'p-1', resolution: 'UNMATCHED', attempts: 1 })]);
    expect(d).toEqual({ kind: 'SAME_PLACEMENT', entryId: 'a', retry: true });
  });

  it('allows ONE re-read when the first attempt ended in an error', () => {
    const d = decideEarlyDuplicate(probe, [row({ id: 'a', placementId: 'p-1', status: 'ERROR', attempts: 1 })]);
    expect(d).toEqual({ kind: 'SAME_PLACEMENT', entryId: 'a', retry: true });
  });

  it('refuses a third attempt', () => {
    const d = decideEarlyDuplicate(probe, [row({ id: 'a', placementId: 'p-1', resolution: 'UNMATCHED', attempts: 2 })]);
    expect(d).toEqual({ kind: 'SAME_PLACEMENT', entryId: 'a', retry: false });
  });

  it('does not re-read an unmatched entry the organizer already accepted as typed', () => {
    const d = decideEarlyDuplicate(probe, [row({ id: 'a', placementId: 'p-1', resolution: 'UNMATCHED', acceptAsTyped: true })]);
    expect(d).toEqual({ kind: 'SAME_PLACEMENT', entryId: 'a', retry: false });
  });

  it('does not re-read an entry the organizer skipped or that is already committed', () => {
    for (const status of ['SKIPPED', 'COMMITTED', 'READY'] as const) {
      const d = decideEarlyDuplicate(probe, [row({ id: 'a', placementId: 'p-1', resolution: 'UNMATCHED', status })]);
      expect(d).toEqual({ kind: 'SAME_PLACEMENT', entryId: 'a', retry: false });
    }
  });

  it('never re-reads the very same image bytes', () => {
    const d = decideEarlyDuplicate({ ...probe, imageSha256: 'h-1' }, [row({ id: 'a', placementId: 'p-1', imageSha256: 'h-1', resolution: 'UNMATCHED' })]);
    expect(d).toEqual({ kind: 'SAME_IMAGE', entryId: 'a' });
  });
});

describe('layer 3: the same image bytes', () => {
  it('returns the existing entry', () => {
    const d = decideEarlyDuplicate({ ...NO_PROBE, imageSha256: 'h-1' }, [row({ id: 'a', imageSha256: 'h-1' }), row({ id: 'b', imageSha256: 'h-2' })]);
    expect(d).toEqual({ kind: 'SAME_IMAGE', entryId: 'a' });
  });

  it('reports NONE for a new frame', () => {
    const d = decideEarlyDuplicate({ clientEntryId: 'c-9', placementId: 'p-9', imageSha256: 'h-9' }, [row({ clientEntryId: 'c-1', placementId: 'p-1', imageSha256: 'h-1' })]);
    expect(d).toEqual({ kind: 'NONE' });
    expect(decideEarlyDuplicate({ clientEntryId: 'c-9', placementId: null, imageSha256: 'h-9' }, [])).toEqual({ kind: 'NONE' });
  });
});

describe('identity keys', () => {
  it('is null when nothing identifies the card', () => {
    expect(identityKeyFor({ game: 'MTG' })).toBeNull();
    expect(identityKeyFor({ game: 'MTG', cardName: '  ', setCode: 'lea', collectorNumber: '161' })).toBeNull();
  });

  it('is equal for the same printing and different for another one', () => {
    const a = identityKeyFor({ game: 'MTG', printingId: BOLTS[0].id });
    const b = identityKeyFor({ game: 'MTG', printingId: BOLTS[0].id, cardName: 'something else' });
    const c = identityKeyFor({ game: 'MTG', printingId: BOLTS[1].id });
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('is equal for the same typed reading regardless of case, number padding and a printed total', () => {
    const a = identityKeyFor({ game: 'POKEMON', cardName: 'Pikachu', setCode: 'BASE1', collectorNumber: '058/102' });
    const b = identityKeyFor({ game: 'POKEMON', cardName: 'pikachu', setCode: 'base1', collectorNumber: '58' });
    expect(a).toBe(b);
    expect(a).not.toBe(identityKeyFor({ game: 'POKEMON', cardName: 'Raichu', setCode: 'base1', collectorNumber: '58' }));
  });

  it('uses the pre-selected printing when the reading is EXACT and the read text otherwise', () => {
    const read = { cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161' };
    const exact = identityKeyForReading('MTG', read, { status: 'EXACT', printingId: BOLTS[0].id });
    expect(exact).toBe(identityKeyFor({ game: 'MTG', printingId: BOLTS[0].id }));
    const ambiguous = identityKeyForReading('MTG', read, { status: 'AMBIGUOUS', printingId: null });
    expect(ambiguous).toBe(identityKeyFor({ game: 'MTG', ...read }));
    expect(exact).not.toBe(ambiguous);
  });
});

describe('layer 4 and AT-13: a repeat of the same card inside the window is held', () => {
  const key = identityKeyFor({ game: 'MTG', printingId: BOLTS[0].id });
  const previous = { id: 'prev', identityKey: key, createdAtMs: 1_000_000 };
  const base = { source: 'UPLOAD' as const, placementId: null, identityKey: key, nowMs: 1_001_000, previous, windowMs: 3000 };

  it('holds a repeat inside the window and points at the previous entry', () => {
    expect(decideRepeatHold(base)).toEqual({ hold: true, suspectDuplicateOf: 'prev' });
    expect(decideRepeatHold({ ...base, source: 'PHOTO' })).toEqual({ hold: true, suspectDuplicateOf: 'prev' });
  });

  it('holds just inside the window and not at or past it', () => {
    expect(decideRepeatHold({ ...base, nowMs: 1_002_999 }).hold).toBe(true);
    expect(decideRepeatHold({ ...base, nowMs: 1_003_000 }).hold).toBe(false);
    expect(decideRepeatHold({ ...base, nowMs: 1_010_000 }).hold).toBe(false);
  });

  it('does not hold a different card', () => {
    expect(decideRepeatHold({ ...base, identityKey: identityKeyFor({ game: 'MTG', printingId: BOLTS[1].id }) }).hold).toBe(false);
  });

  it('does not hold a frame that carries a placementId (layer 2 covers it)', () => {
    expect(decideRepeatHold({ ...base, placementId: 'p-2' }).hold).toBe(false);
  });

  it('does not hold a manual or Delver entry', () => {
    expect(decideRepeatHold({ ...base, source: 'MANUAL' }).hold).toBe(false);
    expect(decideRepeatHold({ ...base, source: 'DELVER' }).hold).toBe(false);
  });

  it('never calls an unidentified card a repeat', () => {
    expect(decideRepeatHold({ ...base, identityKey: null }).hold).toBe(false);
    expect(decideRepeatHold({ ...base, previous: { ...previous, identityKey: null } }).hold).toBe(false);
    expect(decideRepeatHold({ ...base, previous: null }).hold).toBe(false);
  });

  it('ignores a previous entry dated after this frame', () => {
    expect(decideRepeatHold({ ...base, nowMs: 999_000 }).hold).toBe(false);
  });

  it('a held entry is not summed at commit until the organizer counts it, then both are', () => {
    const defaults = { defaultConditionCode: 'NM', defaultFinish: null };
    const first = scanEntry({ id: 'prev', seq: 1, printingId: MOX.id, status: 'READY' });
    const held = scanEntry({ id: 'dup', seq: 2, printingId: MOX.id, suspectDuplicateOf: 'prev', status: 'NEEDS_REVIEW' });
    const before = selectReadyEntries([first, held], defaults, printingMap());
    expect(before.ready.map((r) => r.entry.id)).toEqual(['prev']);
    expect(before.notCommitted).toEqual([{ entryId: 'dup', reason: 'SUSPECT_REPEAT' }]);

    const counted = { ...held, suspectDuplicateOf: null };
    const after = selectReadyEntries([first, counted], defaults, printingMap());
    expect(after.ready.map((r) => r.entry.id)).toEqual(['prev', 'dup']);
    expect(after.notCommitted).toEqual([]);
  });
});
