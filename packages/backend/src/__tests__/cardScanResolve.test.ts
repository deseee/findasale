/**
 * Card scan identity resolution (ADR-138 section 3.4, acceptance AT-1 to AT-7). Everything runs against the in-memory
 * catalog in __fixtures__/cardScanFakes.ts: no database, no network, no recognizer.
 */
import { namesAgree } from '../services/cardScan/nameAgreement';
import { resolveObservation, resolveObservations } from '../services/cardScan/resolveObservation';
import type { ResolveObservationContext } from '../services/cardScan/resolveObservation';
import type { CardObservation } from '../services/cardScan/types';
import { BOLTS, CATALOG_OFF_STATE, COUNTERSPELLS, DELVER, MOX, makeCatalogResolver, observation, READY_STATE } from './__fixtures__/cardScanFakes';

function setup() {
  const fake = makeCatalogResolver();
  const ctx: ResolveObservationContext = { catalog: READY_STATE, resolve: fake.resolve };
  return { fake, ctx };
}

describe('namesAgree', () => {
  it('agrees on equal names ignoring case, accents and punctuation', () => {
    expect(namesAgree('lightning bolt', 'Lightning Bolt')).toBe(true);
    expect(namesAgree("Urza's Saga", 'Urzas Saga')).toBe(true);
  });
  it('agrees when the printing name starts with the read name and a space (double-faced cards)', () => {
    expect(namesAgree('Delver of Secrets', DELVER.name)).toBe(true);
    expect(namesAgree('Insectile Aberration', DELVER.name)).toBe(true);
    expect(namesAgree('Lightning', 'Lightning Bolt')).toBe(true);
  });
  it('does not agree on a different name, a partial word, or a blank name', () => {
    expect(namesAgree('Lightn', 'Lightning Bolt')).toBe(false);
    expect(namesAgree('Counterspell', 'Lightning Bolt')).toBe(false);
    expect(namesAgree('', 'Lightning Bolt')).toBe(false);
    expect(namesAgree(null, 'Lightning Bolt')).toBe(false);
    expect(namesAgree('Lightning Bolt', undefined)).toBe(false);
  });
});

describe('AT-1 set, number and name agree', () => {
  it('is EXACT with full agreement and the printing pre-selected', async () => {
    const { ctx, fake } = setup();
    const r = await resolveObservation(observation({ cardName: 'Lightning Bolt', setCode: 'LEA', collectorNumber: '161' }), ctx);
    expect(r.status).toBe('EXACT');
    expect(r.agreement).toBe('FULL');
    expect(r.printingId).toBe(BOLTS[0].id);
    expect(r.note).toBeNull();
    expect(r.candidates.map((c) => c.printingId)).toEqual([BOLTS[0].id]);
    expect(fake.calls).toHaveLength(1);
  });

  it('accepts a printed collector number such as 161/295 and a padded number', async () => {
    const { ctx } = setup();
    const a = await resolveObservation(observation({ cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161/295' }), ctx);
    const b = await resolveObservation(observation({ cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '0161' }), ctx);
    expect(a.printingId).toBe(BOLTS[0].id);
    expect(b.printingId).toBe(BOLTS[0].id);
  });

  it('agrees on a double-faced card read by its front face only', async () => {
    const { ctx } = setup();
    const r = await resolveObservation(observation({ cardName: 'Delver of Secrets', setCode: 'isd', collectorNumber: '51' }), ctx);
    expect(r.status).toBe('EXACT');
    expect(r.agreement).toBe('FULL');
    expect(r.printingId).toBe(DELVER.id);
  });
});

describe('AT-2 set and number found but the name disagrees', () => {
  it('is AMBIGUOUS with NAME_MISMATCH, nothing pre-selected, candidates include the pair printing and the name matches', async () => {
    const { ctx } = setup();
    // lea 161 is Lightning Bolt, but the photo says Counterspell.
    const r = await resolveObservation(observation({ cardName: 'Counterspell', setCode: 'lea', collectorNumber: '161' }), ctx);
    expect(r.status).toBe('AMBIGUOUS');
    expect(r.printingId).toBeNull();
    expect(r.note).toBe('NAME_MISMATCH');
    expect(r.agreement).toBe('NONE');
    const ids = r.candidates.map((c) => c.printingId);
    expect(ids[0]).toBe(BOLTS[0].id);
    for (const c of COUNTERSPELLS) expect(ids).toContain(c.id);
    expect(ids.length).toBeLessThanOrEqual(5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('caps the merged list at five and flags truncation when the name has many printings', async () => {
    const { ctx } = setup();
    // The pair points at Mox Pearl; the read name Lightning Bolt has six printings.
    const r = await resolveObservation(observation({ cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '263' }), ctx);
    expect(r.status).toBe('AMBIGUOUS');
    expect(r.note).toBe('NAME_MISMATCH');
    expect(r.candidates).toHaveLength(5);
    expect(r.candidates[0].printingId).toBe(MOX.id);
    expect(r.truncated).toBe(true);
  });

  it('never pre-selects when the pair matches a printing but no name was read', async () => {
    const { ctx } = setup();
    const r = await resolveObservation(observation({ setCode: 'lea', collectorNumber: '161' }), ctx);
    expect(r.status).toBe('AMBIGUOUS');
    expect(r.printingId).toBeNull();
    expect(r.agreement).toBe('NONE');
    expect(r.candidates.map((c) => c.printingId)).toEqual([BOLTS[0].id]);
  });
});

describe('AT-3 set and number miss, the name has one printing', () => {
  it('is EXACT by name only, with partial agreement and NAME_ONLY', async () => {
    const { ctx } = setup();
    const r = await resolveObservation(observation({ cardName: 'Mox Pearl', setCode: 'lea', collectorNumber: '999' }), ctx);
    expect(r.status).toBe('EXACT');
    expect(r.agreement).toBe('PARTIAL');
    expect(r.note).toBe('NAME_ONLY');
    expect(r.printingId).toBe(MOX.id);
  });

  it('treats a name read with no set or number the same way', async () => {
    const { ctx } = setup();
    const r = await resolveObservation(observation({ cardName: 'Mox Pearl' }), ctx);
    expect(r.status).toBe('EXACT');
    expect(r.agreement).toBe('PARTIAL');
    expect(r.note).toBe('NAME_ONLY');
  });

  it('does not call it a full match when the number is wrong but the name is unique inside the read set', async () => {
    const { ctx } = setup();
    // Right set, wrong number: the lookup falls back to the name inside the set and finds one printing.
    const r = await resolveObservation(observation({ cardName: 'Lightning Bolt', setCode: 'm10', collectorNumber: '999' }), ctx);
    expect(r.status).toBe('EXACT');
    expect(r.agreement).toBe('PARTIAL');
    expect(r.note).toBe('NAME_ONLY');
    expect(r.printingId).toBe(BOLTS[1].id);
  });
});

describe('AT-4 the name has many printings', () => {
  it('is AMBIGUOUS with the lookup candidates and passes truncated through', async () => {
    const { ctx } = setup();
    const r = await resolveObservation(observation({ cardName: 'Lightning Bolt' }), ctx);
    expect(r.status).toBe('AMBIGUOUS');
    expect(r.printingId).toBeNull();
    expect(r.agreement).toBe('NONE');
    expect(r.note).toBeNull();
    expect(r.candidates).toHaveLength(5);
    expect(r.truncated).toBe(true);
  });

  it('is AMBIGUOUS without truncation when the list fits', async () => {
    const { ctx } = setup();
    const r = await resolveObservation(observation({ cardName: 'Counterspell' }), ctx);
    expect(r.status).toBe('AMBIGUOUS');
    expect(r.candidates).toHaveLength(3);
    expect(r.truncated).toBe(false);
  });

  it('returns UNMATCHED when nothing in the catalog has that name', async () => {
    const { ctx } = setup();
    const r = await resolveObservation(observation({ cardName: 'Nonexistent Card', setCode: 'xxx', collectorNumber: '1' }), ctx);
    expect(r.status).toBe('UNMATCHED');
    expect(r.printingId).toBeNull();
    expect(r.candidates).toEqual([]);
    expect(r.note).toBeNull();
  });

  it('returns UNMATCHED for a reading with no name, set or number', async () => {
    const { ctx, fake } = setup();
    const r = await resolveObservation(observation({}), ctx);
    expect(r.status).toBe('UNMATCHED');
    expect(fake.calls).toHaveLength(0);
  });
});

describe('AT-5 an id supplied by the source', () => {
  it('is EXACT by Scryfall id without comparing names', async () => {
    const { ctx } = setup();
    const r = await resolveObservation(
      observation({ providerId: 'delver', scryfallId: BOLTS[2].scryfallId as string, cardName: 'A Name That Does Not Match' }),
      ctx
    );
    expect(r.status).toBe('EXACT');
    expect(r.agreement).toBe('FULL');
    expect(r.note).toBeNull();
    expect(r.printingId).toBe(BOLTS[2].id);
  });

  it('falls back to the set, number and name rules when the id is not in the catalog', async () => {
    const { ctx } = setup();
    const r = await resolveObservation(
      observation({ providerId: 'delver', scryfallId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161' }),
      ctx
    );
    expect(r.status).toBe('EXACT');
    expect(r.printingId).toBe(BOLTS[0].id);
  });

  it('does not fall through to a name match from the id lookup itself', async () => {
    const { ctx } = setup();
    const r = await resolveObservation(observation({ providerId: 'delver', scryfallId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }), ctx);
    expect(r.status).toBe('UNMATCHED');
  });
});

describe('AT-6 a game the catalog does not serve', () => {
  it('is UNMATCHED with GAME_NOT_SERVED and never calls the lookup', async () => {
    const { ctx, fake } = setup();
    const r = await resolveObservation(observation({ game: 'POKEMON', cardName: 'Pikachu', setCode: 'base1', collectorNumber: '58' }), ctx);
    expect(r.status).toBe('UNMATCHED');
    expect(r.note).toBe('GAME_NOT_SERVED');
    expect(r.printingId).toBeNull();
    expect(r.candidates).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it('also covers games the catalog has no source for at all', async () => {
    const { ctx, fake } = setup();
    const r = await resolveObservation(observation({ game: 'LORCANA', cardName: 'Elsa' }), ctx);
    expect(r.note).toBe('GAME_NOT_SERVED');
    expect(fake.calls).toHaveLength(0);
  });
});

describe('AT-7 the catalog is off', () => {
  it('is UNMATCHED with CATALOG_OFF and never calls the lookup', async () => {
    const fake = makeCatalogResolver();
    const r = await resolveObservation(observation({ cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161' }), {
      catalog: CATALOG_OFF_STATE,
      resolve: fake.resolve,
    });
    expect(r.status).toBe('UNMATCHED');
    expect(r.note).toBe('CATALOG_OFF');
    expect(fake.calls).toHaveLength(0);
  });
});

describe('finish and condition are never taken from a photo', () => {
  it('has no finish or condition in the result, whatever the reading suggested', async () => {
    const { ctx } = setup();
    const r = await resolveObservation(
      observation({ cardName: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161', finish: 'FOIL', suggestedConditionCode: 'NM', grader: 'PSA', grade: '10' }),
      ctx
    );
    const keys = Object.keys(r).sort();
    expect(keys).toEqual(['agreement', 'candidates', 'note', 'printingId', 'status', 'truncated']);
    expect(JSON.stringify(r)).not.toMatch(/conditionCode|suggested|"finish"/);
  });

  it('does not use the read finish or language to choose between printings', async () => {
    const { ctx } = setup();
    const a = await resolveObservation(observation({ cardName: 'Lightning Bolt', finish: 'FOIL', language: 'ja' }), ctx);
    const b = await resolveObservation(observation({ cardName: 'Lightning Bolt' }), ctx);
    expect(a).toEqual(b);
  });
});

describe('batching', () => {
  it('keeps the input order and sends no more than 500 refs per lookup call', async () => {
    const fake = makeCatalogResolver();
    const ctx: ResolveObservationContext = { catalog: READY_STATE, resolve: fake.resolve };
    const list: CardObservation[] = [];
    for (let i = 0; i < 300; i += 1) {
      list.push(observation({ cardName: i % 2 === 0 ? 'Lightning Bolt' : 'Mox Pearl', setCode: 'lea', collectorNumber: i % 2 === 0 ? '161' : '263' }));
    }
    const out = await resolveObservations(list, ctx);
    expect(out).toHaveLength(300);
    expect(fake.calls.length).toBeGreaterThan(1);
    for (const call of fake.calls) expect(call.length).toBeLessThanOrEqual(500);
    out.forEach((r, i) => expect(r.printingId).toBe(i % 2 === 0 ? BOLTS[0].id : MOX.id));
  });

  it('mixes served and unserved games in one call and keeps each answer in place', async () => {
    const { ctx, fake } = setup();
    const out = await resolveObservations(
      [observation({ cardName: 'Mox Pearl' }), observation({ game: 'POKEMON', cardName: 'Pikachu' }), observation({ cardName: 'Counterspell' })],
      ctx
    );
    expect(out.map((r) => r.status)).toEqual(['EXACT', 'UNMATCHED', 'AMBIGUOUS']);
    expect(out[1].note).toBe('GAME_NOT_SERVED');
    expect(fake.calls).toHaveLength(1);
  });

  it('answers an empty list without calling the lookup', async () => {
    const { ctx, fake } = setup();
    expect(await resolveObservations([], ctx)).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });
});
