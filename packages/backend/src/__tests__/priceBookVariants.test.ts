/**
 * Pokemon variant tokens from the TCGdex rows (ADR-140 section 9.1, acceptance AT-14).
 */
import { parsePrintingVariants, variantTokensFromPrinting, variantTokensFromSetName } from '../services/priceBook/cardKey';
import { buildTcgdexPrintingId, mapTcgdexCard } from '../services/cardCatalog/tcgdexMap';

describe('AT-14 variantTokensFromPrinting', () => {
  it('reads Shadowless and 1st Edition from the set name suffix and the id', () => {
    expect(variantTokensFromPrinting({ id: 'TCGDEX:en:base1-4:shadowless+1st-edition', source: 'TCGDEX', setName: 'Base Set (Shadowless, 1st Edition)' })).toEqual([
      'SHADOWLESS',
      'FIRST_EDITION',
    ]);
  });

  it('reads 1st Edition alone', () => {
    expect(variantTokensFromPrinting({ id: 'TCGDEX:en:base1-4:1st-edition', source: 'TCGDEX', setName: 'Base Set (1st Edition)' })).toEqual(['FIRST_EDITION']);
  });

  it('reads Unlimited', () => {
    expect(variantTokensFromPrinting({ id: 'TCGDEX:en:base1-4:unlimited', source: 'TCGDEX', setName: 'Base Set (Unlimited)' })).toEqual(['UNLIMITED']);
  });

  it('maps any other token to STAMPED and keeps the raw token', () => {
    const parsed = parsePrintingVariants({ id: 'TCGDEX:en:svp-12:w-promo', source: 'TCGDEX', setName: 'Promos (W Promo)' });
    expect(parsed.tokens).toEqual(['STAMPED']);
    expect(parsed.stampedRaw).toEqual(['w-promo']);
    const both = parsePrintingVariants({ id: 'TCGDEX:en:x-1:shadowless+pre-release', source: 'TCGDEX', setName: 'X (Shadowless, Pre Release)' });
    expect(both.tokens).toEqual(['SHADOWLESS', 'STAMPED']);
    expect(both.stampedRaw).toEqual(['pre-release']);
  });

  it('a plain print has no tokens', () => {
    expect(variantTokensFromPrinting({ id: 'TCGDEX:en:base1-4', source: 'TCGDEX', setName: 'Base Set' })).toEqual([]);
    expect(variantTokensFromPrinting({ id: 'TCGDEX:en:base1-4', source: 'TCGDEX', setName: null })).toEqual([]);
  });

  it('a shortened id (hash suffix) uses the set name, which is complete', () => {
    const longKey = 'shadowless+1st-edition+some-very-long-stamp-name-that-pushes-the-id-past-the-limit-of-eighty-characters';
    const id = buildTcgdexPrintingId('en', 'base1', '4', longKey);
    expect(id.length).toBeLessThanOrEqual(80);
    expect(id).toMatch(/~[0-9a-f]{10}$/);
    expect(
      variantTokensFromPrinting({ id, source: 'TCGDEX', setName: 'Base Set (Shadowless, 1st Edition, Some Very Long Stamp Name)' })
    ).toEqual(['SHADOWLESS', 'FIRST_EDITION', 'STAMPED']);
  });

  it('a shortened id with no set name suffix falls back to the id part', () => {
    const id = buildTcgdexPrintingId('en', 'base1', '4', 'shadowless+1st-edition+some-very-long-stamp-name-that-pushes-the-id-past-the-limit-of-eighty-characters');
    expect(variantTokensFromPrinting({ id, source: 'TCGDEX', setName: 'Base Set' }).slice(0, 1)).toEqual(['SHADOWLESS']);
  });

  it('a real parenthetical in the set name of an unshortened plain id is not read as a stamp', () => {
    expect(variantTokensFromPrinting({ id: 'TCGDEX:en:promo-3', source: 'TCGDEX', setName: 'Promo Pack (Winter)' })).toEqual([]);
  });

  it('only TCGDEX rows carry variants', () => {
    expect(variantTokensFromPrinting({ id: 'SCRYFALL:abc', source: 'SCRYFALL', setName: 'Alpha (Shadowless)' })).toEqual([]);
    expect(variantTokensFromPrinting({ id: 'TCGCSV:123', source: 'TCGCSV', setName: 'Base Set (1st Edition)' })).toEqual([]);
    expect(variantTokensFromPrinting({ id: 'TCGDEX:en:base1-4:1st-edition', source: null, setName: 'Base Set (1st Edition)' })).toEqual([]);
  });

  it('is case and space tolerant on the set name', () => {
    expect(variantTokensFromPrinting({ id: 'TCGDEX:en:a-1~0123456789', source: 'tcgdex', setName: 'Set ( shadowless ,  1ST EDITION )' })).toEqual([
      'SHADOWLESS',
      'FIRST_EDITION',
    ]);
  });
});

describe('AT-14 typed set names', () => {
  it('reads the same parse from a typed set name, and gives [] when there is no parenthetical', () => {
    expect(variantTokensFromSetName('Base Set (Shadowless)')).toEqual(['SHADOWLESS']);
    expect(variantTokensFromSetName('Base Set (Shadowless, 1st Edition)')).toEqual(['SHADOWLESS', 'FIRST_EDITION']);
    expect(variantTokensFromSetName('Base Set')).toEqual([]);
    expect(variantTokensFromSetName('')).toEqual([]);
    expect(variantTokensFromSetName(null)).toEqual([]);
    expect(variantTokensFromSetName('Base Set ()')).toEqual([]);
  });
});

describe('AT-14 against the rows the real TCGdex mapper produces', () => {
  const rows = (mapTcgdexCard({
    set: { id: 'base1', names: { en: 'Base Set' }, officialCount: 102, releaseDate: '1999-01-09' },
    localId: '4',
    lang: 'en',
    card: {
      name: { en: 'Charizard' },
      rarity: 'Rare',
      variants: [
        { type: 'holo', subtype: 'shadowless' },
        { type: 'holo', subtype: 'shadowless', stamp: ['1st-edition'] },
        { type: 'holo', subtype: 'unlimited' },
        { type: 'normal', stamp: ['w-promo'] },
        { type: 'reverse' },
      ],
    },
  })?.rows ?? []);

  it('produces one row per variant identity and the tokens separate them', () => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect([...byId.keys()].sort()).toEqual(
      [
        'TCGDEX:en:base1-4:shadowless',
        'TCGDEX:en:base1-4:shadowless+1st-edition',
        'TCGDEX:en:base1-4:unlimited',
        'TCGDEX:en:base1-4:w-promo',
        'TCGDEX:en:base1-4',
      ].sort()
    );
    const tokensOf = (id: string) => {
      const r = byId.get(id);
      if (!r) throw new Error(`missing ${id}`);
      return variantTokensFromPrinting({ id: r.id, source: r.source, setName: r.setName });
    };
    expect(tokensOf('TCGDEX:en:base1-4:shadowless')).toEqual(['SHADOWLESS']);
    expect(tokensOf('TCGDEX:en:base1-4:shadowless+1st-edition')).toEqual(['SHADOWLESS', 'FIRST_EDITION']);
    expect(tokensOf('TCGDEX:en:base1-4:unlimited')).toEqual(['UNLIMITED']);
    expect(tokensOf('TCGDEX:en:base1-4:w-promo')).toEqual(['STAMPED']);
    expect(tokensOf('TCGDEX:en:base1-4')).toEqual([]);
  });

  it('the set name suffix and the id part give the same tokens for every row', () => {
    for (const r of rows) {
      const fromId = parsePrintingVariants({ id: r.id, source: r.source, setName: null }).tokens;
      const fromName = variantTokensFromSetName(r.setName);
      expect({ id: r.id, tokens: fromName }).toEqual({ id: r.id, tokens: fromId });
    }
  });
});
