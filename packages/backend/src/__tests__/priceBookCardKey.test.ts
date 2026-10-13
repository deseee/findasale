/**
 * Price book reference keys (ADR-140 section 6.2, acceptance AT-15).
 */
import { createHash } from 'crypto';
import { collectorNumeratorOf, lookupKey, MAX_REFERENCE_KEY_LENGTH, referenceKey } from '../services/priceBook/cardKey';
import { collectorNumerator, computeDedupKey, normalizeCardName as dedupNameNorm } from '../services/cardRecordService';
import { normalizeCardName } from '../services/cardCatalog/normalize';

/** e with an acute accent, written as a code point so this file stays ASCII. */
const E_ACUTE = String.fromCharCode(0xe9);

/** Rebuilds the hash of computeDedupKey from a printing part, exactly as that function does. */
function dedupFromPrintingPart(
  printingPart: string,
  parts: { game: string; language: string; finish: string; conditionCode: string }
): string {
  const raw = [parts.game, printingPart, parts.language, parts.finish, parts.conditionCode].join('|').toLowerCase();
  return createHash('sha1').update(raw).digest('hex').slice(0, 40);
}

/** A typed key without its trailing variant column is the printing part of computeDedupKey. */
const printingPartOf = (key: string) => key.replace(/\|[^|]*$/, '');

describe('collectorNumeratorOf agrees with collectorNumerator of cardRecordService', () => {
  const table: Array<string | null | undefined> = [
    '138/195', '007', '0', '000', '00a', 'A1', 'SWSH001', '4/102', '', null, undefined, ' 12 / 99', '0012', '12a', 'TG05/TG30', '1/1', 'x/0',
  ];
  it.each(table.map((v) => [v]))('%p', (value) => {
    expect(collectorNumeratorOf(value)).toBe(collectorNumerator(value));
  });
});

describe('AT-15 referenceKey', () => {
  const fixtures = [
    { game: 'MTG', catalogPrintingId: 'SCRYFALL:9f0e1a2b-0000-4000-8000-000000000001', setCode: 'lea', collectorNumber: '263', cardName: 'Mox Pearl', language: 'en', finish: 'NONFOIL', conditionCode: 'NM' },
    { game: 'POKEMON', catalogPrintingId: 'TCGDEX:en:base1-4:shadowless', setCode: 'base1', collectorNumber: '4/102', cardName: 'Charizard', language: 'en', finish: 'HOLO', conditionCode: 'LP' },
    { game: 'MTG', catalogPrintingId: null, setCode: 'LEA', collectorNumber: '0263/295', cardName: 'Mox  Pearl', language: 'en', finish: 'NONFOIL', conditionCode: 'MP' },
    { game: 'POKEMON', catalogPrintingId: undefined, setCode: 'base1', collectorNumber: '004/102', cardName: `Flab${E_ACUTE}b${E_ACUTE}`, language: 'fr', finish: 'REVERSE_HOLO', conditionCode: 'HP' },
    { game: 'MTG', catalogPrintingId: '', setCode: null, collectorNumber: null, cardName: null, language: 'en', finish: 'FOIL', conditionCode: 'DMG' },
    { game: 'MTG', catalogPrintingId: null, setCode: 'tsr', collectorNumber: '12a', cardName: 'Urza Saga', language: 'ja', finish: 'ETCHED', conditionCode: 'NM' },
    { game: 'MTG', catalogPrintingId: null, setCode: 'plst', collectorNumber: 'DOM-12', cardName: 'Jace, the Mind Sculptor', language: 'en', finish: 'FOIL', conditionCode: 'LP' },
  ];

  it.each(fixtures.map((f, i) => [i, f]))('fixture %i: the key is the printing part of computeDedupKey', (_i, f) => {
    const key = referenceKey(f);
    const printingPart = f.catalogPrintingId ? key : printingPartOf(key);
    const expected = computeDedupKey({
      game: f.game,
      catalogPrintingId: f.catalogPrintingId,
      setCode: f.setCode,
      collectorNumber: f.collectorNumber,
      cardName: f.cardName,
      language: f.language,
      finish: f.finish,
      conditionCode: f.conditionCode,
    });
    expect(dedupFromPrintingPart(printingPart, f)).toBe(expected);
  });

  it('KNOWN DIVERGENCE: the two name normalizers differ for apostrophes and ligatures (ADR-140 mismatch, reported)', () => {
    // cardCatalog/normalize.ts (named by the ADR for the reference key) drops an apostrophe; the dedup key's own
    // normalizer in cardRecordService.ts turns it into a space. The reference key follows the ADR text. This test pins
    // the difference so changing either normalizer is a deliberate decision.
    expect(referenceKey({ setCode: 'tsr', collectorNumber: '1', cardName: "Urza's Saga" })).toBe('s:tsr|1|urzas saga|');
    expect(dedupNameNorm("Urza's Saga")).toBe('urza s saga');
    expect(referenceKey({ setCode: 'tsr', collectorNumber: '1', cardName: 'Aether Vial' })).toBe('s:tsr|1|aether vial|');
    expect(printingPartOf(referenceKey({ setCode: 'x', collectorNumber: '1', cardName: 'Plain Name' }))).toBe(
      `s:x|1|${dedupNameNorm('Plain Name')}`
    );
  });

  it('uses p:<printingId> when a catalog printing is known and ignores the typed fields', () => {
    expect(referenceKey({ catalogPrintingId: 'SCRYFALL:abc', setCode: 'lea', collectorNumber: '1', cardName: 'X' })).toBe('p:SCRYFALL:abc');
    expect(referenceKey({ catalogPrintingId: 'SCRYFALL:abc', variantToken: 'SHADOWLESS' })).toBe('p:SCRYFALL:abc');
  });

  it('typed keys are lower case, drop leading zeros and normalize the name, with an empty variant column', () => {
    expect(referenceKey({ setCode: 'LEA', collectorNumber: '0263/295', cardName: 'Mox  Pearl' })).toBe('s:lea|263|mox pearl|');
    expect(referenceKey({ setCode: 'base1', collectorNumber: '004/102', cardName: `Flab${E_ACUTE}b${E_ACUTE}` })).toBe('s:base1|4|flabebe|');
    expect(referenceKey({})).toBe('s:|||');
    expect(referenceKey({ setCode: 'a', collectorNumber: '1', cardName: "Urza's Saga" })).toBe(`s:a|1|${normalizeCardName("Urza's Saga")}|`);
  });

  it('two Base Set printings with different variants have different keys', () => {
    const shadowless = referenceKey({ catalogPrintingId: 'TCGDEX:en:base1-4:shadowless' });
    const first = referenceKey({ catalogPrintingId: 'TCGDEX:en:base1-4:shadowless+1st-edition' });
    const unlimited = referenceKey({ catalogPrintingId: 'TCGDEX:en:base1-4' });
    expect(new Set([shadowless, first, unlimited]).size).toBe(3);
    const t1 = referenceKey({ setCode: 'base1', collectorNumber: '4/102', cardName: 'Charizard', variantToken: 'SHADOWLESS' });
    const t2 = referenceKey({ setCode: 'base1', collectorNumber: '4/102', cardName: 'Charizard', variantToken: ['SHADOWLESS', 'FIRST_EDITION'] });
    const t3 = referenceKey({ setCode: 'base1', collectorNumber: '4/102', cardName: 'Charizard' });
    expect(t1).toBe('s:base1|4|charizard|shadowless');
    expect(t2).toBe('s:base1|4|charizard|first_edition+shadowless');
    expect(t3).toBe('s:base1|4|charizard|');
    expect(new Set([t1, t2, t3]).size).toBe(3);
  });

  it('variant tokens are order independent, deduplicated and NONE is ignored', () => {
    const a = referenceKey({ setCode: 's', collectorNumber: '1', cardName: 'n', variantToken: ['FIRST_EDITION', 'SHADOWLESS'] });
    const b = referenceKey({ setCode: 's', collectorNumber: '1', cardName: 'n', variantToken: ['SHADOWLESS', 'FIRST_EDITION', 'SHADOWLESS'] });
    expect(a).toBe(b);
    expect(referenceKey({ setCode: 's', collectorNumber: '1', cardName: 'n', variantToken: 'NONE' })).toBe('s:s|1|n|');
    expect(referenceKey({ setCode: 's', collectorNumber: '1', cardName: 'n', variantToken: [] })).toBe('s:s|1|n|');
  });

  it('a very long name is cut so the key fits the column and the variant column survives', () => {
    const key = referenceKey({ setCode: 'abc', collectorNumber: '7', cardName: 'x'.repeat(500), variantToken: 'STAMPED' });
    expect(key.length).toBeLessThanOrEqual(MAX_REFERENCE_KEY_LENGTH);
    expect(key.endsWith('|stamped')).toBe(true);
    expect(key.startsWith('s:abc|7|')).toBe(true);
  });

  it('finish, language and condition are not part of the key; lookupKey adds finish and language', () => {
    expect(lookupKey('p:X', 'FOIL', 'en')).toBe('p:X|FOIL|en');
  });
});
