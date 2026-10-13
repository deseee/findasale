/**
 * TCGdex Pokemon identity ingest: the restricted data-file reader, the pure card mapping, the
 * archive path filter and the streaming tar reader. No network, no database, nothing executed.
 */
import { Readable } from 'stream';
import {
  LiteralParseError,
  MAX_LITERAL_DEPTH,
  MAX_LITERAL_SOURCE_CHARS,
  isRefMarker,
  parseTcgdexDataFile,
} from '../services/cardCatalog/tcgdexLiteralParser';
import {
  MAX_PRINTING_ID_LENGTH,
  TCGDEX_VARIANT_FINISH,
  assertIdentityOnly,
  buildTcgdexPrintingId,
  formatCollectorNumber,
  humanizeVariantToken,
  mapTcgdexCard,
  readSetMeta,
  readVariantEntries,
} from '../services/cardCatalog/tcgdexMap';
import { DEFAULT_TAR_LIMITS, iterateTar, parsePaxRecords } from '../services/cardCatalog/tcgdexTarReader';
import { classifyTcgdexPath } from '../services/cardCatalog/tcgdexIngest';
import type { PrintingRow } from '../services/cardCatalog/types';
import { chunked } from './__fixtures__/cardCatalogFixtures';
import {
  CARD_BASE1_4_CHARIZARD_TS,
  CARD_SV01_001_PINECO_TS,
  CARD_SV035_003_VENUSAUR_TS,
  CARD_SWSHP_SWSH001_TS,
  CARD_SWSHP_SWSH002_PRICED_TS,
  CARD_SWSHP_SWSH003_CALL_TS,
  CARD_SWSHP_SWSH004_FR_ONLY_TS,
  FIXTURE_ROOT,
  SET_BASE1_TS,
  SET_SV01_TS,
  SET_SV035_TS,
  SET_SWSHP_TS,
  buildTar,
  paxRecord,
} from './__fixtures__/tcgdexFixtures';

const BACKSLASH = String.fromCharCode(92);
const TICK = String.fromCharCode(96);

const setMeta = (src: string) => {
  const meta = readSetMeta(parseTcgdexDataFile(src));
  if (!meta) throw new Error('fixture set has no id');
  return meta;
};
const map = (setSrc: string, localId: string, cardSrc: string, lang = 'en') =>
  mapTcgdexCard({ set: setMeta(setSrc), localId, card: parseTcgdexDataFile(cardSrc), lang });
const rowsOf = (setSrc: string, localId: string, cardSrc: string, lang = 'en'): PrintingRow[] => {
  const r = map(setSrc, localId, cardSrc, lang);
  if (!r) throw new Error('card unexpectedly not mapped');
  return r.rows;
};

// ---------------------------------------------------------------------------------------------
describe('restricted data-file reader', () => {
  it('reads the real Base Set Charizard file', () => {
    const card = parseTcgdexDataFile(CARD_BASE1_4_CHARIZARD_TS) as any;
    expect(card.name.en).toBe('Charizard');
    expect(card.rarity).toBe('Rare');
    expect(card.hp).toBe(120);
    expect(isRefMarker(card.set)).toBe(true);
    expect(card.set.$ref).toBe('Set');
    expect(card.variants).toHaveLength(4);
    expect(card.variants[1].subtype).toBe('shadowless');
    expect(card.variants[1].stamp).toEqual(['1st-edition']);
  });

  it('reads a set file', () => {
    const set = parseTcgdexDataFile(SET_BASE1_TS) as any;
    expect(set.id).toBe('base1');
    expect(set.name.en).toBe('Base Set');
    expect(set.cardCount.official).toBe(102);
    expect(set.releaseDate).toBe('1999-01-09');
  });

  it('handles comments, trailing commas, string concatenation, numbers, booleans and a trailing type assertion', () => {
    const src = [
      'const card: Card = {',
      '  /* block comment */ a: "x" + "y", // line comment',
      "  b: [1, 2, 3,],",
      '  c: -3, d: 0x10, e: 1.5,',
      "  'quoted-key': true, f: false, g: null, h: undefined,",
      '  i: ' + TICK + 'plain' + TICK + ',',
      '  j: "a' + BACKSLASH + 'x41b' + BACKSLASH + 'n",',
      '} as Card',
      'export default card',
    ].join('\n');
    const out = parseTcgdexDataFile(src) as any;
    expect(out.a).toBe('xy');
    expect(out.b).toEqual([1, 2, 3]);
    expect(out.c).toBe(-3);
    expect(out.d).toBe(16);
    expect(out.e).toBe(1.5);
    expect(out['quoted-key']).toBe(true);
    expect(out.f).toBe(false);
    expect(out.g).toBeNull();
    expect(out.h).toBeUndefined();
    expect(out.i).toBe('plain');
    expect(out.j).toBe('aAb\n');
  });

  it('reads an exported default object', () => {
    expect((parseTcgdexDataFile('export default { id: "x1" }') as any).id).toBe('x1');
  });

  it.each([
    ['a function call', 'const c = { name: { en: makeName("Broken") } }'],
    ['a spread', 'const c = { ...other, a: 1 }'],
    ['a template interpolation', 'const c = { a: ' + TICK + 'x${y}' + TICK + ' }'],
    ['a shorthand property', 'const c = { a, b: 1 }'],
    ['an array hole', 'const c = { a: [1,,2] }'],
    ['an arrow function', 'const c = { a: () => 1 }'],
    ['a parenthesized expression', 'const c = { a: (1 + 2) }'],
    ['a computed key', 'const c = { [k]: 1 }'],
    ['an unterminated object', 'const c = { a: 1'],
    ['an unterminated string', 'const c = { a: "abc }'],
    ['no data object at all', 'export default card'],
    ['a top-level array', 'const c = [1, 2]'],
  ])('rejects %s with LiteralParseError', (_label, src) => {
    expect(() => parseTcgdexDataFile(src)).toThrow(LiteralParseError);
  });

  it('rejects an over-deep nesting and an over-long source', () => {
    const deep = 'const c = ' + '{ a: '.repeat(MAX_LITERAL_DEPTH + 2) + '1' + ' }'.repeat(MAX_LITERAL_DEPTH + 2);
    expect(() => parseTcgdexDataFile(deep)).toThrow(LiteralParseError);
    const big = 'const c = { a: "' + 'x'.repeat(MAX_LITERAL_SOURCE_CHARS) + '" }';
    expect(() => parseTcgdexDataFile(big)).toThrow(LiteralParseError);
  });

  it('never executes anything: no side effect, identifiers stay inert markers, no prototype pollution', () => {
    const g = globalThis as any;
    g.__tcgdexSideEffect = false;
    expect(() => parseTcgdexDataFile('const c = { a: (globalThis.__tcgdexSideEffect = true) }')).toThrow(LiteralParseError);
    expect(() => parseTcgdexDataFile('const c = { a: process.exit(1) }')).toThrow(LiteralParseError);
    expect(g.__tcgdexSideEffect).toBe(false);

    const out = parseTcgdexDataFile('const c = { a: globalThis.__tcgdexSideEffect }') as any;
    expect(isRefMarker(out.a)).toBe(true);
    expect(out.a.$ref).toBe('globalThis.__tcgdexSideEffect');
    expect(g.__tcgdexSideEffect).toBe(false);

    const polluted = parseTcgdexDataFile('const c = { "__proto__": { polluted: true }, a: 1 }') as any;
    expect(polluted.a).toBe(1);
    expect(polluted.polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
    delete g.__tcgdexSideEffect;
  });
});

// ---------------------------------------------------------------------------------------------
describe('set and variant readers', () => {
  it('reads set identity fields only', () => {
    const meta = setMeta(SET_BASE1_TS);
    expect(meta.id).toBe('base1');
    expect(meta.names.en).toBe('Base Set');
    expect(meta.names.fr).toBe('Set de Base');
    expect(meta.officialCount).toBe(102);
    expect(meta.releaseDate).toBe('1999-01-09');
    const text = JSON.stringify(meta);
    expect(text).not.toMatch(/1523|604|thirdParty|tcgplayer|cardmarket/);
  });

  it('returns null for a set without an id and ignores a bad card count', () => {
    expect(readSetMeta({ name: { en: 'x' } })).toBeNull();
    expect(readSetMeta(null)).toBeNull();
    expect(readSetMeta({ id: 'a', name: { en: 'A' }, cardCount: { official: -4 } })?.officialCount).toBeNull();
    expect(readSetMeta({ id: 'a', name: { en: 'A' } })?.officialCount).toBeNull();
  });

  it('reads detailed variant entries and the older flag object', () => {
    const notes: string[] = [];
    expect(readVariantEntries(undefined, notes)).toEqual([{ type: 'normal', subtype: null, stamps: [], size: null, languages: null }]);
    const detailed = readVariantEntries(
      [{ type: 'holo', subtype: 'Shadowless', stamp: ['1st-edition'], size: 'jumbo', languages: ['EN'], thirdParty: { tcgplayer: 1 } }],
      notes,
    );
    expect(detailed).toEqual([{ type: 'holo', subtype: 'shadowless', stamps: ['1st-edition'], size: 'jumbo', languages: ['en'] }]);
    const flags = readVariantEntries({ normal: true, reverse: true, holo: true, firstEdition: true, wPromo: true }, notes);
    expect(flags.map((e) => `${e.type}:${e.stamps.join('+')}`)).toEqual([
      'normal:',
      'normal:1st-edition',
      'normal:w-promo',
      'reverse:',
      'reverse:1st-edition',
      'holo:',
      'holo:1st-edition',
    ]);
    const noNormal = readVariantEntries({ normal: false, holo: true }, notes);
    expect(noNormal.map((e) => e.type)).toEqual(['holo']);
  });

  it('notes malformed and unsupported shapes instead of throwing', () => {
    const notes: string[] = [];
    expect(readVariantEntries([{ nothing: 1 }, 'x', { type: 'reverse' }], notes).map((e) => e.type)).toEqual(['reverse']);
    expect(readVariantEntries('weird', notes)).toEqual([]);
    expect(readVariantEntries({ jumbo: true }, notes).length).toBeGreaterThan(0);
    expect(notes).toEqual(expect.arrayContaining(['variant:malformed', 'variants:unsupported', 'flag:jumbo']));
  });
});

// ---------------------------------------------------------------------------------------------
describe('mapping to catalog rows', () => {
  it('maps the finish vocabulary exactly: normal, holo, reverse', () => {
    expect(TCGDEX_VARIANT_FINISH).toEqual({ normal: 'NONFOIL', holo: 'HOLO', reverse: 'REVERSE_HOLO' });
  });

  it('Base Set Charizard: four rows, shadowless and first edition kept apart, all HOLO', () => {
    const rows = rowsOf(SET_BASE1_TS, '4', CARD_BASE1_4_CHARIZARD_TS);
    expect(rows.map((r) => r.id)).toEqual([
      'TCGDEX:en:base1-4:unlimited',
      'TCGDEX:en:base1-4:shadowless+1st-edition',
      'TCGDEX:en:base1-4:shadowless',
      'TCGDEX:en:base1-4:1999-2000-copyright',
    ]);
    expect(rows.map((r) => r.setName)).toEqual([
      'Base Set (Unlimited)',
      'Base Set (Shadowless, 1st Edition)',
      'Base Set (Shadowless)',
      'Base Set (1999-2000 Copyright)',
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({
        source: 'TCGDEX',
        game: 'POKEMON',
        name: 'Charizard',
        nameNorm: 'charizard',
        setCode: 'base1',
        collectorNumber: '4/102',
        language: 'en',
        rarity: 'Rare',
        releaseYear: 1999,
        finishes: ['HOLO'],
      });
    }
    expect(new Set(rows.map((r) => r.id)).size).toBe(4);
  });

  it('modern card with a reverse holo: one row with NONFOIL and REVERSE_HOLO', () => {
    const rows = rowsOf(SET_SV01_TS, '001', CARD_SV01_001_PINECO_TS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'TCGDEX:en:sv01-001',
      name: 'Pineco',
      setCode: 'sv01',
      setName: 'Scarlet & Violet',
      collectorNumber: '001/198',
      rarity: 'Common',
      releaseYear: 2023,
      finishes: ['NONFOIL', 'REVERSE_HOLO'],
    });
  });

  it('holo-only modern card', () => {
    const rows = rowsOf(SET_SV035_TS, '003', CARD_SV035_003_VENUSAUR_TS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'TCGDEX:en:sv03.5-003', setCode: 'sv03.5', setName: '151', collectorNumber: '003/165', rarity: 'Double rare', finishes: ['HOLO'] });
  });

  it('a card with no rarity gets rarity null; the legacy flag object yields a plain row and a W Promo row', () => {
    const rows = rowsOf(SET_SWSHP_TS, 'SWSH001', CARD_SWSHP_SWSH001_TS);
    expect(rows.map((r) => r.id)).toEqual(['TCGDEX:en:swshp-SWSH001', 'TCGDEX:en:swshp-SWSH001:w-promo']);
    expect(rows.map((r) => r.setName)).toEqual(['SWSH Black Star Promos', 'SWSH Black Star Promos (W Promo)']);
    expect(rows.every((r) => r.rarity === null)).toBe(true);
    expect(rows.every((r) => r.collectorNumber === 'SWSH001')).toBe(true);
    expect(rows.every((r) => r.finishes.length === 1 && r.finishes[0] === 'NONFOIL')).toBe(true);
  });

  it('the text "None" counts as no rarity', () => {
    const set = setMeta(SET_SWSHP_TS);
    const r = mapTcgdexCard({ set, localId: '9', card: { name: { en: 'X' }, rarity: 'None' }, lang: 'en' });
    expect(r?.rows[0].rarity).toBeNull();
  });

  it('a card carrying third-party ids, prices and an image: nothing of it survives', () => {
    const result = map(SET_SWSHP_TS, 'SWSH002', CARD_SWSHP_SWSH002_PRICED_TS);
    const rows = result?.rows ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].finishes).toEqual(['NONFOIL', 'HOLO']);
    const text = JSON.stringify(result);
    for (const needle of ['888001', '888002', '888003', '888004', 'assets.tcgdex.net', 'marketPrice', 'lowPrice', 'pricing', 'thirdParty', 'cardtrader', 'masterball']) {
      expect(text).not.toContain(needle);
    }
    expect(rows[0].scryfallId).toBeNull();
    expect(rows[0].tcgplayerProductId).toBeNull();
    expect(rows[0].cardmarketId).toBeNull();
    expect(rows[0].imageSmallUrl).toBeNull();
    expect(rows[0].imageNormalUrl).toBeNull();
  });

  it('none of the real third-party ids in the Base Set, Scarlet and Violet and 151 files reach a row', () => {
    const all = [
      ...rowsOf(SET_BASE1_TS, '4', CARD_BASE1_4_CHARIZARD_TS),
      ...rowsOf(SET_SV01_TS, '001', CARD_SV01_001_PINECO_TS),
      ...rowsOf(SET_SV035_TS, '003', CARD_SV035_003_VENUSAUR_TS),
    ];
    const text = JSON.stringify(all);
    for (const needle of ['42382', '106999', '273699', '660224', '487828', '702298', '502554', '733598', '261103', '1523', '5322', '5402', '23237']) {
      expect(text).not.toContain(needle);
    }
  });

  it('every row has exactly the catalog columns and only identity data', () => {
    const rows = rowsOf(SET_BASE1_TS, '4', CARD_BASE1_4_CHARIZARD_TS);
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        'cardmarketId', 'collectorNumber', 'finishes', 'game', 'id', 'imageNormalUrl', 'imageSmallUrl', 'language', 'name',
        'nameNorm', 'rarity', 'releaseYear', 'scryfallId', 'setCode', 'setName', 'source', 'tcgplayerProductId',
      ].sort(),
    );
  });

  it('returns null when the card has no name in the requested language, and rows when it has', () => {
    expect(map(SET_SWSHP_TS, 'SWSH004', CARD_SWSHP_SWSH004_FR_ONLY_TS, 'en')).toBeNull();
    expect(map(SET_SWSHP_TS, 'SWSH004', CARD_SWSHP_SWSH004_FR_ONLY_TS, 'xx')).toBeNull();
    const fr = rowsOf(SET_SWSHP_TS, 'SWSH004', CARD_SWSHP_SWSH004_FR_ONLY_TS, 'fr');
    expect(fr[0]).toMatchObject({ id: 'TCGDEX:fr:swshp-SWSH004', language: 'fr', name: 'Seulement francais' });
  });

  it('uses the language name of the set when present, English as the fallback', () => {
    const fr = rowsOf(SET_BASE1_TS, '4', CARD_BASE1_4_CHARIZARD_TS, 'fr');
    expect(fr[0].name).toBe('Dracaufeu');
    expect(fr[0].setName).toBe('Set de Base (Unlimited)');
    const set = { id: 'zz1', names: { en: 'English Name' }, officialCount: null, releaseDate: null };
    const r = mapTcgdexCard({ set, localId: '1', card: { name: { en: 'A', fr: 'B' } }, lang: 'fr' });
    expect(r?.rows[0].setName).toBe('English Name');
    expect(r?.rows[0].releaseYear).toBeNull();
  });

  it('a type with no finish is reported, and the row keeps its other finishes', () => {
    const set = setMeta(SET_SWSHP_TS);
    const r = mapTcgdexCard({ set, localId: '5', card: { name: { en: 'M' }, variants: [{ type: 'normal' }, { type: 'metal' }] }, lang: 'en' });
    expect(r?.rows).toHaveLength(1);
    expect(r?.rows[0].finishes).toEqual(['NONFOIL']);
    expect(r?.notes).toContain('type:metal');
  });

  it('a jumbo print is its own row, and an entry limited to other languages is left out', () => {
    const set = setMeta(SET_SWSHP_TS);
    const card = { name: { en: 'J' }, variants: [{ type: 'holo' }, { type: 'holo', size: 'jumbo' }, { type: 'normal', languages: ['ja'] }] };
    const r = mapTcgdexCard({ set, localId: '6', card, lang: 'en' });
    expect(r?.rows.map((x) => x.id)).toEqual(['TCGDEX:en:swshp-6', 'TCGDEX:en:swshp-6:jumbo']);
    expect(r?.rows[1].setName).toBe('SWSH Black Star Promos (Jumbo)');
    expect(r?.rows.every((x) => x.finishes.join() === 'HOLO')).toBe(true);
  });

  it('is deterministic: the same input gives the same rows', () => {
    const a = rowsOf(SET_BASE1_TS, '4', CARD_BASE1_4_CHARIZARD_TS);
    const b = rowsOf(SET_BASE1_TS, '4', CARD_BASE1_4_CHARIZARD_TS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('printing ids and labels', () => {
  it('keeps ids within 80 characters and unique, using a hash suffix for long ones', () => {
    const k1 = 'a-very-long-variant-name-' + 'x'.repeat(80);
    const k2 = 'a-very-long-variant-name-' + 'x'.repeat(80) + '-two';
    const id1 = buildTcgdexPrintingId('en', 'sv01', '001', k1);
    const id2 = buildTcgdexPrintingId('en', 'sv01', '001', k2);
    expect(id1.length).toBeLessThanOrEqual(MAX_PRINTING_ID_LENGTH);
    expect(id2.length).toBeLessThanOrEqual(MAX_PRINTING_ID_LENGTH);
    expect(id1).not.toBe(id2);
    expect(id1.startsWith('TCGDEX:en:sv01-001:')).toBe(true);
    expect(buildTcgdexPrintingId('en', 'sv01', '001', k1)).toBe(id1);
    expect(buildTcgdexPrintingId('en', 'sv01', '001', '')).toBe('TCGDEX:en:sv01-001');
  });

  it('humanizes variant tokens', () => {
    expect(humanizeVariantToken('shadowless')).toBe('Shadowless');
    expect(humanizeVariantToken('1st-edition')).toBe('1st Edition');
    expect(humanizeVariantToken('w-promo')).toBe('W Promo');
    expect(humanizeVariantToken('1999-2000-copyright')).toBe('1999-2000 Copyright');
    expect(humanizeVariantToken('pokemon-center')).toBe('Pokemon Center');
  });

  it('formats collector numbers', () => {
    expect(formatCollectorNumber('4', 102)).toBe('4/102');
    expect(formatCollectorNumber('001', 198)).toBe('001/198');
    expect(formatCollectorNumber('4', null)).toBe('4');
    expect(formatCollectorNumber('SWSH001', 307)).toBe('SWSH001');
  });
});

describe('assertIdentityOnly', () => {
  const good = (): PrintingRow => rowsOf(SET_SV01_TS, '001', CARD_SV01_001_PINECO_TS)[0];

  it('accepts a mapped row', () => {
    expect(() => assertIdentityOnly(good())).not.toThrow();
  });

  it('rejects any third-party id, image, foreign source or foreign game', () => {
    expect(() => assertIdentityOnly({ ...good(), tcgplayerProductId: 5 })).toThrow(/third-party/);
    expect(() => assertIdentityOnly({ ...good(), cardmarketId: 5 })).toThrow(/third-party/);
    expect(() => assertIdentityOnly({ ...good(), scryfallId: 'x' })).toThrow(/third-party/);
    expect(() => assertIdentityOnly({ ...good(), imageSmallUrl: 'https://example.com/a.png' })).toThrow(/image/);
    expect(() => assertIdentityOnly({ ...good(), imageNormalUrl: 'https://example.com/a.png' })).toThrow(/image/);
    expect(() => assertIdentityOnly({ ...good(), source: 'SCRYFALL' })).toThrow(/non-TCGdex/);
    expect(() => assertIdentityOnly({ ...good(), game: 'MTG' })).toThrow(/non-TCGdex/);
    expect(() => assertIdentityOnly({ ...good(), id: 'SCRYFALL:abc' })).toThrow(/non-TCGdex/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('archive path filter', () => {
  const root = FIXTURE_ROOT;
  it('recognizes set files and card files under data and data-asia', () => {
    expect(classifyTcgdexPath(`${root}/data/Base/Base Set.ts`)).toEqual({ kind: 'set', family: 'data', setDir: 'data/Base/Base Set', localId: null });
    expect(classifyTcgdexPath(`${root}/data/Base/Base Set/4.ts`)).toEqual({ kind: 'card', family: 'data', setDir: 'data/Base/Base Set', localId: '4' });
    expect(classifyTcgdexPath(`${root}/data-asia/SV/Test Set JA/001.ts`)).toEqual({ kind: 'card', family: 'data-asia', setDir: 'data-asia/SV/Test Set JA', localId: '001' });
  });

  it('ignores everything else', () => {
    for (const p of [
      `${root}/README.md`,
      `${root}/data/Base.ts`,
      `${root}/data/Base/Base Set/4.png`,
      `${root}/data/Base/Base Set/x/y.ts`,
      `${root}/server/compiler/index.ts`,
      `${root}/data/Base/../Base Set.ts`,
      `${root}/data/Base//4.ts`,
      `${root}/data/Base/.ts`,
      'data/Base/Base Set.ts',
    ]) {
      expect(classifyTcgdexPath(p)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('streaming tar reader', () => {
  const files = [
    { path: 'README.md', content: 'readme' },
    { path: 'data/A/One.ts', content: 'const a = { id: "one" }' },
    { path: 'data/A/One/1.ts', content: 'x'.repeat(1300) },
    { path: 'data/A/Two.ts', content: 'const a = { id: "two" }' },
  ];
  const wantsData = (p: string) => p.includes('/data/');

  async function collect(buf: Buffer, wants: (p: string, s: number) => boolean = () => true, size = 512, limits = DEFAULT_TAR_LIMITS) {
    const out: Array<{ path: string; text: string }> = [];
    for await (const f of iterateTar(chunked(buf, size), wants, limits)) out.push({ path: f.path, text: f.data.toString('utf8') });
    return out;
  }

  it('yields only wanted regular files, with paths as stored and exact content', async () => {
    const got = await collect(buildTar(files), wantsData);
    expect(got.map((g) => g.path)).toEqual([`${FIXTURE_ROOT}/data/A/One.ts`, `${FIXTURE_ROOT}/data/A/One/1.ts`, `${FIXTURE_ROOT}/data/A/Two.ts`]);
    expect(got[1].text).toBe('x'.repeat(1300));
    expect(got[0].text).toBe('const a = { id: "one" }');
  });

  it('gives the same result whatever the chunk size', async () => {
    const buf = buildTar(files);
    const a = await collect(buf, wantsData, 7);
    const b = await collect(buf, wantsData, 100000);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });

  it('reads PAX paths: long and non-ASCII', async () => {
    const longDir = 'd'.repeat(120);
    const accent = 'caf' + String.fromCodePoint(0xe9);
    const got = await collect(
      buildTar([
        { path: `data/${longDir}/Set.ts`, content: 'long' },
        { path: `data/${accent}/Set.ts`, content: 'accent' },
        { path: 'data/plain/Set.ts', content: 'forced', pax: true },
      ]),
    );
    expect(got.map((g) => g.path)).toEqual([
      `${FIXTURE_ROOT}/data/${longDir}/Set.ts`,
      `${FIXTURE_ROOT}/data/${accent}/Set.ts`,
      `${FIXTURE_ROOT}/data/plain/Set.ts`,
    ]);
    expect(got.map((g) => g.text)).toEqual(['long', 'accent', 'forced']);
  });

  it('skips an entry above the per-entry limit and continues with the next', async () => {
    const buf = buildTar([
      { path: 'data/A/Big.ts', content: 'y'.repeat(5000) },
      { path: 'data/A/Small.ts', content: 'small' },
    ]);
    const got = await collect(buf, () => true, 512, { maxTotalBytes: DEFAULT_TAR_LIMITS.maxTotalBytes, maxEntryBytes: 1000 });
    expect(got.map((g) => g.path)).toEqual([`${FIXTURE_ROOT}/data/A/Small.ts`]);
  });

  it('gives up when the decompressed archive exceeds the total limit', async () => {
    const buf = buildTar(files);
    await expect(collect(buf, () => true, 512, { maxTotalBytes: 2048, maxEntryBytes: 1024 * 1024 })).rejects.toThrow(/larger than the allowed size/);
  });

  it('rejects a truncated archive', async () => {
    const buf = buildTar(files);
    await expect(collect(buf.subarray(0, 512 * 6 + 100))).rejects.toThrow(/Unexpected end of archive/);
  });

  it('accepts an empty archive and one that simply ends', async () => {
    expect(await collect(Buffer.alloc(1024, 0))).toEqual([]);
    expect(await collect(Buffer.alloc(0))).toEqual([]);
  });

  function rawHeader(name: string, size: number, typeflag: string, prefix = ''): Buffer {
    const h = Buffer.alloc(512, 0);
    h.write(name, 0, 100, 'utf8');
    h.write(size.toString(8).padStart(11, '0'), 124, 'latin1');
    h.write(typeflag, 156, 'latin1');
    h.write('ustar', 257, 'latin1');
    if (prefix) h.write(prefix, 345, 155, 'utf8');
    return h;
  }
  const pad = (b: Buffer): Buffer => (b.length % 512 === 0 ? b : Buffer.concat([b, Buffer.alloc(512 - (b.length % 512), 0)]));

  it('joins the ustar prefix field to the name', async () => {
    const body = Buffer.from('prefixed');
    const tar = Buffer.concat([rawHeader('file.ts', body.length, '0', 'root/data/A'), pad(body), Buffer.alloc(1024, 0)]);
    const got = await collect(tar);
    expect(got).toEqual([{ path: 'root/data/A/file.ts', text: 'prefixed' }]);
  });

  it('understands GNU long names', async () => {
    const longName = 'root/data/' + 'g'.repeat(150) + '.ts';
    const nameBody = Buffer.concat([Buffer.from(longName), Buffer.alloc(1, 0)]);
    const body = Buffer.from('gnu');
    const tar = Buffer.concat([
      rawHeader('././@LongLink', nameBody.length, 'L'),
      pad(nameBody),
      rawHeader('short', body.length, '0'),
      pad(body),
      Buffer.alloc(1024, 0),
    ]);
    const got = await collect(tar);
    expect(got).toEqual([{ path: longName, text: 'gnu' }]);
  });

  it('skips directories and links', async () => {
    const body = Buffer.from('real');
    const tar = Buffer.concat([
      rawHeader('root/dir/', 0, '5'),
      rawHeader('root/link', 0, '2'),
      rawHeader('root/real.ts', body.length, '0'),
      pad(body),
      Buffer.alloc(1024, 0),
    ]);
    expect((await collect(tar)).map((g) => g.path)).toEqual(['root/real.ts']);
  });

  it('parses PAX records', () => {
    const body = Buffer.concat([paxRecord('path', 'a/b/c.ts'), paxRecord('comment', 'hello')]);
    expect(parsePaxRecords(body)).toEqual({ path: 'a/b/c.ts', comment: 'hello' });
    expect(parsePaxRecords(Buffer.from('not a record'))).toEqual({});
  });

  it('accepts any async iterable as the source', async () => {
    const buf = buildTar(files);
    async function* gen() {
      yield buf.subarray(0, 1000);
      yield buf.subarray(1000);
    }
    const out: string[] = [];
    for await (const f of iterateTar(gen(), wantsData)) out.push(f.path);
    expect(out).toHaveLength(3);
    expect(Readable.from([buf])).toBeDefined();
  });
});

describe('unreadable fixture files', () => {
  it('the function-call card cannot be read, the French-only card can', () => {
    expect(() => parseTcgdexDataFile(CARD_SWSHP_SWSH003_CALL_TS)).toThrow(LiteralParseError);
    expect(() => parseTcgdexDataFile(CARD_SWSHP_SWSH004_FR_ONLY_TS)).not.toThrow();
  });
});
