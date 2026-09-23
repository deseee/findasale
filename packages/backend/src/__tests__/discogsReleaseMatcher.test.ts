/**
 * ADR-132 matcher v2 -- recorded-fixture tests (no network, no DB).
 *
 * Fixtures live in __fixtures__/discogs/*.json. They are HAND-AUTHORED in the documented Discogs
 * /database/search and /marketplace/listings shapes (no live Discogs call was made to build them;
 * see each file's _note). Item text is the real FindA.Sale item text for the ADR 9.3 acceptance
 * set. The search function below answers ONLY the exact param sets a fixture recorded and
 * returns an empty result list for anything else, so the matcher can never "discover" data the
 * fixture does not contain.
 */

import fs from 'fs';
import path from 'path';
import {
  matchDiscogsRelease,
  scoreCandidate,
  rawFromListingRelease,
  norm,
  formatClass,
  normalizeCatno,
  parseDiscogsReleaseUrl,
  validBarcode,
  DiscogsMatchResult,
} from '../services/marketplace/discogsReleaseMatcher';
import {
  deriveRecordIdentityFromText,
  RecordIdentitySources,
  RecordIdentityValues,
  applyOrganizerRecordIdentity,
  effectiveRecordIdentity,
  mergeAiRecordIdentity,
} from '../services/marketplace/recordIdentity';

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'discogs');

interface Fixture {
  item: { title: string; description: string | null; brand: string | null; upc: string | null; ean: string | null; tags: string[] };
  wrongReleaseId?: number;
  listedRelease?: any;
  searches: Array<{ params: Record<string, string>; response: { results: any[] } }>;
}

function loadFixture(name: string): Fixture {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8'));
}

function key(params: Record<string, string>): string {
  return Object.keys(params)
    .filter(k => k !== 'type' && k !== 'per_page')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
}

function fixtureSearch(fx: Fixture) {
  const calls: Array<Record<string, string>> = [];
  const table = new Map(fx.searches.map(s => [key(s.params), s.response.results]));
  const search = async (params: Record<string, string>) => {
    calls.push(params);
    return table.get(key(params)) ?? [];
  };
  return { search, calls };
}

function identityOf(fx: Fixture): RecordIdentityValues {
  return deriveRecordIdentityFromText(fx.item);
}

async function run(fx: Fixture, sources?: RecordIdentitySources, identity?: RecordIdentityValues) {
  const id = identity ?? identityOf(fx);
  const { search, calls } = fixtureSearch(fx);
  const res = await matchDiscogsRelease(
    { identity: id, sources: sources ?? { artist: 'title_parse', releaseTitle: 'title_parse' }, upc: fx.item.upc, ean: fx.item.ean, fallbackTitle: fx.item.title },
    { search }
  );
  return { res, calls, identity: id };
}

function expectNotAutoAcceptedWrong(res: DiscogsMatchResult, wrongId: number) {
  expect(!(res.status === 'auto_high' && res.releaseId === wrongId)).toBe(true);
  expect(res.releaseId).not.toBe(wrongId);
}

function listedVetoes(fx: Fixture, identity: RecordIdentityValues) {
  const raw = rawFromListingRelease(fx.listedRelease)!;
  return scoreCandidate(raw, identity, 0, fx.item.title).vetoes;
}

describe('ADR-132 normalization helpers', () => {
  it('norm keeps non-Latin scripts, strips diacritics and Discogs "(2)" suffixes', () => {
    expect(norm('ベイブ').length).toBeGreaterThan(0);
    expect(norm('Honky Château')).toBe('honky chateau');
    expect(norm('Styx (2)')).toBe('styx');
    expect(norm('Loggins & Messina')).toBe('loggins and messina');
  });

  it('formatClass is table-driven over real format arrays', () => {
    expect(formatClass(['Vinyl', 'LP', 'Album'])).toBe('LP');
    expect(formatClass(['Vinyl', '7"', '45 RPM', 'Single'])).toBe('7in');
    expect(formatClass(['CD', 'EP'])).toBe('CD');
    expect(formatClass(['Cassette', 'Album'])).toBe('Cassette');
    expect(formatClass(['Vinyl', '12"', 'Maxi-Single'])).toBe('12in_single');
    expect(formatClass(['2xLP', 'Album'])).toBe('LP');
  });

  it('catalog numbers compare spacing/dash/case-insensitively', () => {
    expect(normalizeCatno('SD 7293')).toBe(normalizeCatno('SD-7293'));
    expect(normalizeCatno('sd7293')).toBe(normalizeCatno('SD 7293'));
  });

  it('barcodes must pass their checksum', () => {
    expect(validBarcode('075678186226')).toBe('075678186226'); // valid UPC-A check digit
    expect(validBarcode('075678186223')).toBeNull();
    expect(validBarcode('4006381333931')).toBe('4006381333931'); // valid EAN-13
    expect(validBarcode('12345')).toBeNull();
  });
});

describe('ADR-132 pasted release URL parsing (strict, numeric id only)', () => {
  it('accepts release URLs in their common shapes', () => {
    expect(parseDiscogsReleaseUrl('https://www.discogs.com/release/1318188-Kenny-Loggins-Sittin-In')).toEqual({ releaseId: 1318188 });
    expect(parseDiscogsReleaseUrl('https://www.discogs.com/de/release/1318188')).toEqual({ releaseId: 1318188 });
    expect(parseDiscogsReleaseUrl('discogs.com/Kenny-Loggins-Sittin-In/release/1318188')).toEqual({ releaseId: 1318188 });
  });
  it('rejects master URLs, other hosts, credentials, ports and junk', () => {
    expect(parseDiscogsReleaseUrl('https://www.discogs.com/master/12345-Styx-Pieces-Of-Eight')).toEqual({ error: 'master_url' });
    expect(parseDiscogsReleaseUrl('https://evil.example.com/release/123')).toEqual({ error: 'invalid_url' });
    expect(parseDiscogsReleaseUrl('https://discogs.com.evil.com/release/123')).toEqual({ error: 'invalid_url' });
    expect(parseDiscogsReleaseUrl('https://user:pw@www.discogs.com/release/123')).toEqual({ error: 'invalid_url' });
    expect(parseDiscogsReleaseUrl('https://www.discogs.com:8443/release/123')).toEqual({ error: 'invalid_url' });
    expect(parseDiscogsReleaseUrl('https://www.discogs.com/release/abc')).toEqual({ error: 'invalid_url' });
    expect(parseDiscogsReleaseUrl('https://www.discogs.com/release/99999999999')).toEqual({ error: 'invalid_url' });
    expect(parseDiscogsReleaseUrl(42)).toEqual({ error: 'invalid_url' });
  });
});

describe('ADR-132 9.3 acceptance set (recorded fixtures)', () => {
  it('#1 Styx "Pieces of Eight": never auto_high to the Japanese "Babe" 7"; top 3 are all Pieces of Eight LPs', async () => {
    const fx = loadFixture('styx-pieces-of-eight');
    const { res, identity } = await run(fx);
    expect(identity.artist).toBe('Styx');
    expect(identity.releaseTitle).toBe('Pieces of Eight');
    expect(identity.format).toBe('LP');
    expectNotAutoAcceptedWrong(res, fx.wrongReleaseId!);
    expect(res.status).toBe('needs_selection'); // title_parse identity can never auto-accept on artist+title
    expect(res.candidates).toHaveLength(3);
    for (const c of res.candidates) {
      expect(c.title).toMatch(/Pieces Of Eight/);
      expect(c.formatClass).toBe('LP');
    }
    const v = listedVetoes(fx, identity);
    expect(v).toEqual(expect.arrayContaining(['format', 'title']));
    // the Babe candidate, if present in the pool, carries the script veto too
    const babe = scoreCandidate(
      { releaseId: 7001009, masterId: null, artist: 'Styx = スティクス', title: 'Babe = ベイブ', formats: ['Vinyl', '7"', 'Single'], labels: [], catno: null, year: 1979, country: 'Japan', thumb: null, community: null },
      identity, 4, fx.item.title
    );
    expect(babe.vetoes).toEqual(expect.arrayContaining(['format', 'script', 'title']));
  });

  it('#1b Styx with an organizer/AI identity: D3 relaxed picks the most-collected pressing, Draft-only', async () => {
    const fx = loadFixture('styx-pieces-of-eight');
    const { res } = await run(fx, { artist: 'ai', releaseTitle: 'ai' });
    expect(res.status).toBe('auto_high');
    expect(res.releaseId).toBe(7001001);
    expect(res.autoSelectedPressing).toBe(true);
    expect(res.reason).toBe('most_collected_pressing');
    expect(res.candidates[0].autoSelectedPressing).toBe(true);
  });

  it('#2 JUBILEE! choir LP: never auto_high to the Japanese CD EP', async () => {
    const fx = loadFixture('jubilee-choir');
    const { res, identity } = await run(fx);
    expectNotAutoAcceptedWrong(res, fx.wrongReleaseId!);
    expect(res.status).toBe('needs_selection');
    expect(listedVetoes(fx, identity)).toEqual(expect.arrayContaining(['format', 'script']));
  });

  it('#3 Loy Norrix "Peace on Earth": never auto_high to Tower (artist + format vetoes)', async () => {
    const fx = loadFixture('loy-norrix-peace-on-earth');
    const { res, identity } = await run(fx);
    expect(identity.artist).toMatch(/Loy Norrix/);
    expectNotAutoAcceptedWrong(res, fx.wrongReleaseId!);
    expect(res.status).toBe('needs_selection');
    const tower = res.candidates.find(c => c.releaseId === fx.wrongReleaseId);
    expect(tower?.vetoes).toEqual(expect.arrayContaining(['artist', 'format']));
    expect(listedVetoes(fx, identity)).toEqual(expect.arrayContaining(['artist', 'format']));
  });

  it('#4 Maggie Bell "Queen of the Night": auto_high via tier 2 (catno SD 7293 + Atlantic), never the 7"', async () => {
    const fx = loadFixture('maggie-bell-queen-of-the-night');
    const { res, identity, calls } = await run(fx);
    expect(identity.catalogNumber).toBe('SD 7293');
    expect(res.status).toBe('auto_high');
    expect(res.rule).toBe('catno');
    expect(res.candidates[0].tier).toBe(2);
    expect([7004001, 7004002]).toContain(res.releaseId);
    expect(res.releaseId).toBe(7004001); // most-collected of two SD 7293 pressings (D3 relaxed)
    expectNotAutoAcceptedWrong(res, fx.wrongReleaseId!);
    expect(calls[0]).toMatchObject({ catno: 'SD 7293', label: 'Atlantic' });
    expect(calls).toHaveLength(1); // stops at the first accepting tier
    expect(listedVetoes(fx, identity)).toEqual(expect.arrayContaining(['format', 'title']));
  });

  it('#5 Jimmy Buffett "You Had to Be There": never the self-titled reissue; correct release in top 3', async () => {
    const fx = loadFixture('jimmy-buffett-you-had-to-be-there');
    const { res, identity } = await run(fx);
    expectNotAutoAcceptedWrong(res, fx.wrongReleaseId!);
    expect(res.candidates.slice(0, 3).map(c => c.releaseId)).toContain(7005001);
    expect(listedVetoes(fx, identity)).toContain('title');
    // With the recorded catno (AK 1008/2, compacted retry) this is a catno auto-match.
    expect(res.status).toBe('auto_high');
    expect(res.rule).toBe('catno');
  });

  it('#6 Urana "ALIVE!": never auto_high to Kiss "Alive!" (title-only query)', async () => {
    const fx = loadFixture('urana-alive');
    const { res, identity } = await run(fx);
    expect(identity.artist).toBeNull();
    expectNotAutoAcceptedWrong(res, fx.wrongReleaseId!);
    expect(res.status).toBe('needs_selection');
    expect(res.reason).toBe('title_only');
    // Kiss vetoed on artist when the organizer supplies the real artist.
    const withArtist = { ...identity, artist: 'Wise Women' };
    const kiss = scoreCandidate(rawFromListingRelease(fx.listedRelease)!, withArtist, 0, fx.item.title);
    expect(kiss.vetoes).toContain('artist');
  });

  it('#7 "The 100 Voices of Christmas": classified explicitly, never auto-accepted', async () => {
    const fx = loadFixture('hundred-voices-of-christmas');
    const { res, identity } = await run(fx);
    expect(identity.releaseTitle).toBe('The 100 Voices of Christmas');
    expectNotAutoAcceptedWrong(res, fx.wrongReleaseId!);
    expect(res.status).toBe('needs_selection');
    expect(typeof res.reason).toBe('string');
    expect(listedVetoes(fx, identity)).toContain('artist');
  });

  it('weak-query guard: a lone generic title ("Christmas") never searches', async () => {
    const { search, calls } = fixtureSearch({ item: {} as any, searches: [] });
    const res = await matchDiscogsRelease(
      {
        identity: { artist: null, releaseTitle: 'Christmas', label: null, catalogNumber: null, year: null, format: 'LP', script: 'latin' },
        fallbackTitle: 'Christmas, Vinyl LP',
      },
      { search }
    );
    expect(res.status).toBe('needs_selection');
    expect(res.reason).toBe('query_too_weak');
    expect(calls).toHaveLength(0);
  });
});

describe('ADR-132 regression cases from the connector header', () => {
  it('release 1318188 (Kenny Loggins with Jim Messina "Sittin\' In") is found and auto-matched by catno', async () => {
    const fx = loadFixture('kenny-loggins-sittin-in');
    const { res } = await run(fx);
    expect(res.candidates.slice(0, 3).map(c => c.releaseId)).toContain(1318188);
    expect(res.status).toBe('auto_high');
    expect(res.releaseId).toBe(1318188);
  });

  it('release 13685723 ("Time And Chance", typo tolerance) is in the top 3 but not auto-accepted', async () => {
    const fx = loadFixture('time-and-chance-typo');
    const { res } = await run(fx);
    expect(res.candidates.slice(0, 3).map(c => c.releaseId)).toContain(13685723);
    expect(res.candidates[0].releaseId).toBe(13685723);
    expect(res.status).toBe('needs_selection');
  });
});

describe('ADR-132 accept-rule matrix', () => {
  const base: RecordIdentityValues = { artist: 'Styx', releaseTitle: 'Pieces of Eight', label: null, catalogNumber: null, year: 1978, format: 'LP', script: 'latin' };
  const lp = { masterId: 1, formats: ['Vinyl', 'LP', 'Album'], labels: ['A&M Records'], catno: 'SP-4724', year: 1978, country: 'US', thumb: null, community: { have: 10, want: 1 } };
  const oneResult = (row: any) => async () => [row];

  it('a single clean structured candidate with ai sources -> auto_high (not auto-selected)', async () => {
    const res = await matchDiscogsRelease(
      { identity: base, sources: { artist: 'ai', releaseTitle: 'ai' } },
      { search: oneResult({ id: 11, title: 'Styx - Pieces Of Eight', format: lp.formats, label: lp.labels, catno: lp.catno, year: '1978', master_id: 1 }) }
    );
    expect(res.status).toBe('auto_high');
    expect(res.rule).toBe('structured');
    expect(res.autoSelectedPressing).toBe(false);
  });

  it.each([
    ['format', { title: 'Styx - Pieces Of Eight', format: ['Vinyl', '7"', 'Single'] }],
    ['script', { title: 'Styx = スティクス - Pieces Of Eight = ピーシズ・オブ・エイト', format: lp.formats }],
    ['artist', { title: 'Tower - Pieces Of Eight', format: lp.formats }],
    ['title', { title: 'Styx - Babe', format: lp.formats }],
  ])('veto %s alone blocks auto_high', async (veto, row) => {
    const res = await matchDiscogsRelease(
      { identity: base, sources: { artist: 'organizer', releaseTitle: 'organizer' } },
      { search: oneResult({ id: 12, label: lp.labels, catno: lp.catno, year: '1978', master_id: 1, ...row }) }
    );
    expect(res.status).toBe('needs_selection');
    expect(res.candidates[0].vetoes).toContain(veto);
  });

  it('title_parse identity alone never auto-accepts on artist+title', async () => {
    const res = await matchDiscogsRelease(
      { identity: base, sources: { artist: 'title_parse', releaseTitle: 'title_parse' } },
      { search: oneResult({ id: 13, title: 'Styx - Pieces Of Eight', format: lp.formats, label: lp.labels, catno: lp.catno, year: '1978', master_id: 1 }) }
    );
    expect(res.status).toBe('needs_selection');
  });

  it('passing candidates from different albums -> needs_selection (ambiguous_album)', async () => {
    const res = await matchDiscogsRelease(
      { identity: { ...base, artist: 'Eagles', releaseTitle: 'Eagles', year: null }, sources: { artist: 'organizer', releaseTitle: 'organizer' } },
      {
        search: async () => [
          { id: 21, title: 'Eagles - Eagles', format: lp.formats, label: ['Asylum'], master_id: 100, community: { have: 5 } },
          { id: 22, title: 'Eagles (2) - Eagles', format: lp.formats, label: ['Other'], master_id: 200, community: { have: 9 } },
        ],
      }
    );
    expect(res.status).toBe('needs_selection');
    expect(res.reason).toBe('ambiguous_album');
  });
});

describe('ADR-132 recordIdentity storage helpers', () => {
  it('organizer values win over later AI output, and title_parse values are recomputed', () => {
    const org = applyOrganizerRecordIdentity(null, { artist: 'Urana', releaseTitle: 'Alive!' });
    expect('identity' in org).toBe(true);
    const stored = (org as any).identity;
    const merged = mergeAiRecordIdentity(stored, { artist: 'Kiss', releaseTitle: 'Alive!', catalogNumber: 'NBLP 7020' }, { confidence: 0.9 });
    expect(merged!.artist).toEqual({ value: 'Urana', source: 'organizer' });
    expect(merged!.catalogNumber).toEqual({ value: 'NBLP 7020', source: 'ai' });
    const eff = effectiveRecordIdentity(merged, deriveRecordIdentityFromText({ title: 'ALIVE! Vinyl LP, 1979' }));
    expect(eff.values.artist).toBe('Urana');
    expect(eff.sources.artist).toBe('organizer');
    expect(eff.values.year).toBe(1979);
    expect(eff.sources.year).toBe('title_parse');
  });

  it('low-confidence AI keeps catno/label only when present verbatim in OCR text', () => {
    const merged = mergeAiRecordIdentity(null, { artist: 'X', catalogNumber: 'SD 7293', label: 'Atlantic' }, { confidence: 0.4, ocrText: ['ATLANTIC', 'SD 7293'] });
    expect(merged!.artist).toBeUndefined();
    expect(merged!.catalogNumber).toEqual({ value: 'SD 7293', source: 'ocr' });
    const none = mergeAiRecordIdentity(null, { catalogNumber: 'SD 7293' }, { confidence: 0.4, ocrText: [] });
    expect(none).toBeNull();
  });

  it('rejects unknown fields and bad values in organizer edits', () => {
    expect(applyOrganizerRecordIdentity(null, { foo: 'x' } as any)).toEqual({ error: 'Unknown field: foo' });
    expect('error' in applyOrganizerRecordIdentity(null, { year: 1700 })).toBe(true);
    expect('error' in applyOrganizerRecordIdentity(null, { format: 'Laserdisc' })).toBe(true);
  });
});
