/**
 * Card scan readiness (ADR-138 sections 3.6 and 9, acceptance AT-8 and AT-9): what an entry needs before it can be
 * committed. A suggestion never counts as a decision; a session default does only where the rules say so.
 */
import { computeReadiness, effectiveFinish } from '../services/cardScan/readiness';
import type { ReadinessContext } from '../services/cardScan/readiness';
import type { ScanSessionDefaults } from '../services/cardScan/types';
import { BOLTS, FOIL_ONLY, MOX, scanEntry } from './__fixtures__/cardScanFakes';

const NONE: ScanSessionDefaults = { defaultConditionCode: null, defaultFinish: null };

function ctxFor(p: { finishes: string[] } | null, defaults: ScanSessionDefaults = NONE): ReadinessContext {
  return { defaults, printing: p ? { finishes: p.finishes } : null };
}

/** Lightning Bolt in m10: nonfoil and foil. */
const TWO_FINISH = BOLTS[1];

describe('AT-8 condition', () => {
  it('a suggestion alone does not satisfy readiness', () => {
    const entry = scanEntry({ printingId: MOX.id, suggestedConditionCode: 'NM', suggestionSource: 'HAIKU', suggestedGrader: 'PSA', suggestedGrade: '10' });
    const r = computeReadiness(entry, ctxFor(MOX));
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.needs).toEqual(['CONDITION']);
    expect(r.effective.conditionCode).toBeNull();
    expect(r.effective.graded).toBe(false);
  });

  it('never copies a suggestion into the condition and never changes the entry', () => {
    const entry = Object.freeze(scanEntry({ printingId: MOX.id, suggestedConditionCode: 'LP' }));
    const r = computeReadiness(entry, ctxFor(MOX));
    expect(entry.conditionCode).toBeNull();
    expect(JSON.stringify(r)).not.toContain('"LP"');
  });

  it("the organizer's condition satisfies readiness", () => {
    const r = computeReadiness(scanEntry({ printingId: MOX.id, conditionCode: 'NM' }), ctxFor(MOX));
    expect(r.status).toBe('READY');
    expect(r.needs).toEqual([]);
    expect(r.problems).toEqual([]);
    expect(r.effective.conditionCode).toBe('NM');
  });

  it('accepts a condition typed in lower case and keeps the canonical code', () => {
    const r = computeReadiness(scanEntry({ printingId: MOX.id, conditionCode: 'lp' }), ctxFor(MOX));
    expect(r.status).toBe('READY');
    expect(r.effective.conditionCode).toBe('LP');
  });

  it('a chosen session default satisfies readiness, and the row own condition wins over it', () => {
    const defaults = { defaultConditionCode: 'NM', defaultFinish: null };
    const a = computeReadiness(scanEntry({ printingId: MOX.id }), ctxFor(MOX, defaults));
    expect(a.status).toBe('READY');
    expect(a.effective.conditionCode).toBe('NM');
    const b = computeReadiness(scanEntry({ printingId: MOX.id, conditionCode: 'HP' }), ctxFor(MOX, defaults));
    expect(b.effective.conditionCode).toBe('HP');
  });

  it('without a session default the same entry is not ready', () => {
    const r = computeReadiness(scanEntry({ printingId: MOX.id }), ctxFor(MOX));
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.needs).toEqual(['CONDITION']);
  });

  it('grader plus grade satisfies readiness and the condition is left out', () => {
    const r = computeReadiness(scanEntry({ printingId: MOX.id, grader: 'psa', grade: '9.5', certNumber: ' 123456 ' }), ctxFor(MOX));
    expect(r.status).toBe('READY');
    expect(r.effective).toMatchObject({ graded: true, grader: 'PSA', grade: '9.5', certNumber: '123456', conditionCode: null });
  });

  it('a graded card ignores a typed condition and a session default condition', () => {
    const defaults = { defaultConditionCode: 'NM', defaultFinish: null };
    const r = computeReadiness(scanEntry({ printingId: MOX.id, grader: 'BGS', grade: '10', conditionCode: 'LP' }), ctxFor(MOX, defaults));
    expect(r.status).toBe('READY');
    expect(r.effective.conditionCode).toBeNull();
    expect(r.effective.graded).toBe(true);
  });

  it('a grader without a grade is invalid and still needs a condition', () => {
    const defaults = { defaultConditionCode: 'NM', defaultFinish: null };
    const r = computeReadiness(scanEntry({ printingId: MOX.id, grader: 'PSA' }), ctxFor(MOX, defaults));
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.problems).toContain('GRADER_WITHOUT_GRADE');
    expect(r.needs).toContain('CONDITION');
    expect(r.effective.conditionCode).toBeNull();
  });

  it('a grade without a grader is invalid', () => {
    const r = computeReadiness(scanEntry({ printingId: MOX.id, grade: '10', conditionCode: 'NM' }), ctxFor(MOX));
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.problems).toContain('GRADE_WITHOUT_GRADER');
  });

  it('an unknown grader, grade or condition is a problem, not a guess', () => {
    expect(computeReadiness(scanEntry({ printingId: MOX.id, grader: 'ZZZ', grade: '10' }), ctxFor(MOX)).problems).toContain('INVALID_GRADER');
    expect(computeReadiness(scanEntry({ printingId: MOX.id, grader: 'PSA', grade: '11' }), ctxFor(MOX)).problems).toContain('INVALID_GRADE');
    const defaults = { defaultConditionCode: 'NM', defaultFinish: null };
    const r = computeReadiness(scanEntry({ printingId: MOX.id, conditionCode: 'XX' }), ctxFor(MOX, defaults));
    expect(r.problems).toContain('INVALID_CONDITION');
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.effective.conditionCode).toBeNull();
  });

  it('a cert number over 30 characters is a problem', () => {
    const r = computeReadiness(scanEntry({ printingId: MOX.id, grader: 'PSA', grade: '10', certNumber: '1'.repeat(31) }), ctxFor(MOX));
    expect(r.problems).toContain('CERT_TOO_LONG');
    expect(r.status).toBe('NEEDS_REVIEW');
  });
});

describe('AT-9 finish', () => {
  it('a printing with two finishes and no finish needs FINISH', () => {
    const r = computeReadiness(scanEntry({ printingId: TWO_FINISH.id, conditionCode: 'NM' }), ctxFor(TWO_FINISH));
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.needs).toEqual(['FINISH']);
  });

  it('an explicit finish satisfies it', () => {
    const r = computeReadiness(scanEntry({ printingId: TWO_FINISH.id, conditionCode: 'NM', finish: 'foil' }), ctxFor(TWO_FINISH));
    expect(r.status).toBe('READY');
    expect(r.effective.finish).toBe('FOIL');
  });

  it('a printing with one finish needs no finish and takes no session default', () => {
    const defaults = { defaultConditionCode: null, defaultFinish: 'NONFOIL' };
    const a = computeReadiness(scanEntry({ printingId: MOX.id, conditionCode: 'NM' }), ctxFor(MOX));
    expect(a.status).toBe('READY');
    expect(a.effective.finish).toBeNull();
    const b = computeReadiness(scanEntry({ printingId: FOIL_ONLY.id, conditionCode: 'NM' }), ctxFor(FOIL_ONLY, defaults));
    expect(b.status).toBe('READY');
    expect(b.effective.finish).toBeNull();
  });

  it('the session default applies when no finish was read', () => {
    const defaults = { defaultConditionCode: null, defaultFinish: 'NONFOIL' };
    const r = computeReadiness(scanEntry({ printingId: TWO_FINISH.id, conditionCode: 'NM' }), ctxFor(TWO_FINISH, defaults));
    expect(r.status).toBe('READY');
    expect(r.effective.finish).toBe('NONFOIL');
  });

  it('the session default applies when the photo read a nonfoil card', () => {
    const defaults = { defaultConditionCode: null, defaultFinish: 'NONFOIL' };
    const r = computeReadiness(scanEntry({ printingId: TWO_FINISH.id, conditionCode: 'NM', readFinish: 'NONFOIL' }), ctxFor(TWO_FINISH, defaults));
    expect(r.status).toBe('READY');
  });

  it.each(['FOIL', 'ETCHED', 'HOLO', 'REVERSE_HOLO'])('a card read as %s always needs an explicit choice', (readFinish) => {
    const defaults = { defaultConditionCode: null, defaultFinish: 'NONFOIL' };
    const r = computeReadiness(scanEntry({ printingId: TWO_FINISH.id, conditionCode: 'NM', readFinish }), ctxFor(TWO_FINISH, defaults));
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.needs).toEqual(['FINISH']);
    expect(r.effective.finish).toBeNull();
  });

  it('an explicit finish wins over the default, even on a card read as foil', () => {
    const defaults = { defaultConditionCode: null, defaultFinish: 'NONFOIL' };
    const r = computeReadiness(scanEntry({ printingId: TWO_FINISH.id, conditionCode: 'NM', readFinish: 'FOIL', finish: 'FOIL' }), ctxFor(TWO_FINISH, defaults));
    expect(r.status).toBe('READY');
    expect(r.effective.finish).toBe('FOIL');
  });

  it('a default the printing does not come in is not applied', () => {
    const defaults = { defaultConditionCode: null, defaultFinish: 'ETCHED' };
    const r = computeReadiness(scanEntry({ printingId: TWO_FINISH.id, conditionCode: 'NM' }), ctxFor(TWO_FINISH, defaults));
    expect(r.needs).toEqual(['FINISH']);
  });

  it('an unknown typed finish is a problem and never replaced by the default', () => {
    const defaults = { defaultConditionCode: null, defaultFinish: 'NONFOIL' };
    const r = computeReadiness(scanEntry({ printingId: TWO_FINISH.id, conditionCode: 'NM', finish: 'sparkly' }), ctxFor(TWO_FINISH, defaults));
    expect(r.problems).toContain('INVALID_FINISH');
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.effective.finish).toBeNull();
  });

  it('effectiveFinish reads only the finish fields and the defaults', () => {
    const defaults = { defaultConditionCode: null, defaultFinish: 'NONFOIL' };
    expect(effectiveFinish({ finish: null, readFinish: null }, ctxFor(null, defaults))).toBe('NONFOIL');
    expect(effectiveFinish({ finish: null, readFinish: 'FOIL' }, ctxFor(null, defaults))).toBeNull();
    expect(effectiveFinish({ finish: 'etched', readFinish: null }, ctxFor(null, defaults))).toBe('ETCHED');
    expect(effectiveFinish({ finish: null, readFinish: null }, ctxFor(null))).toBeNull();
  });
});

describe('identity', () => {
  it('an entry with no printing and no typed acceptance needs PRINTING', () => {
    const r = computeReadiness(scanEntry({ conditionCode: 'NM' }), ctxFor(null));
    expect(r.needs).toEqual(['PRINTING']);
    expect(r.status).toBe('NEEDS_REVIEW');
  });

  it('typed details with a name are ready, without a name they need NAME', () => {
    const ok = computeReadiness(scanEntry({ game: 'POKEMON', acceptAsTyped: true, cardName: 'Pikachu', conditionCode: 'LP' }), ctxFor(null));
    expect(ok.status).toBe('READY');
    const noName = computeReadiness(scanEntry({ game: 'POKEMON', acceptAsTyped: true, conditionCode: 'LP' }), ctxFor(null));
    expect(noName.needs).toEqual(['NAME']);
  });

  it('an unknown game on a typed entry is a problem', () => {
    const r = computeReadiness(scanEntry({ game: 'CHESS', acceptAsTyped: true, cardName: 'Pawn', conditionCode: 'NM' }), ctxFor(null));
    expect(r.problems).toContain('INVALID_GAME');
  });

  it('a chosen printing that cannot be found is not ready', () => {
    const r = computeReadiness(scanEntry({ printingId: 'SCRYFALL:gone', conditionCode: 'NM' }), ctxFor(null));
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.needs).toContain('PRINTING');
    expect(r.problems).toContain('PRINTING_NOT_FOUND');
  });
});

describe('status handling', () => {
  const ready = { printingId: MOX.id, conditionCode: 'NM' };

  it('a complete entry is READY', () => {
    expect(computeReadiness(scanEntry(ready), ctxFor(MOX)).status).toBe('READY');
  });

  it('a held suspected repeat is never ready', () => {
    const r = computeReadiness(scanEntry({ ...ready, suspectDuplicateOf: 'entry_0' }), ctxFor(MOX));
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.held).toBe(true);
    expect(r.needs).toEqual([]);
  });

  it.each(['SKIPPED', 'COMMITTING', 'COMMITTED'] as const)('keeps the %s status and lists no needs', (status) => {
    const r = computeReadiness(scanEntry({ status }), ctxFor(null));
    expect(r.status).toBe(status);
    expect(r.needs).toEqual([]);
    expect(r.problems).toEqual([]);
  });

  it('recomputes an ERROR entry so a fixed card can become ready again', () => {
    expect(computeReadiness(scanEntry({ ...ready, status: 'ERROR', errorCode: 'X' }), ctxFor(MOX)).status).toBe('READY');
    expect(computeReadiness(scanEntry({ status: 'ERROR' }), ctxFor(null)).status).toBe('NEEDS_REVIEW');
  });

  it('a quantity outside 1 to 10000 is a problem', () => {
    for (const quantity of [0, -1, 10001, 1.5]) {
      expect(computeReadiness(scanEntry({ ...ready, quantity }), ctxFor(MOX)).problems).toContain('BAD_QUANTITY');
    }
    expect(computeReadiness(scanEntry({ ...ready, quantity: 10000 }), ctxFor(MOX)).status).toBe('READY');
  });
});
