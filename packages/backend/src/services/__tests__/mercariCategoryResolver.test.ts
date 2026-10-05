/**
 * (S-EXT-MERCARI-CATEGORY-MAP, 2026-10-05) Mercari category resolver + data integrity.
 *
 * Root cause this pins: the Chrome extension used to fuzzy-search Mercari's category picker with eBay's
 * category name, so a youth baseball glove could land in a generic "Gloves" category instead of
 * Sports & outdoors > Baseball Equipment > Baseball Gloves & Mitts (category 3100). The backend now resolves ONE
 * category id + full path per item and the extension opens exactly that.
 *
 * Pure unit test: the resolver and the two config files have no imports beyond each other, so nothing is mocked.
 * Every fixture title is synthetic (no real listing text). NOT EXECUTED under jest when written (jest cannot run
 * on the authoring machine -- see dev-environment skill). The same assertions were run there against a minimal
 * describe/it/expect shim using Node's TypeScript stripping; CI is the real gate.
 */
import {
  resolveMercariCategory,
  explainMercariCategory,
  inferMercariDepartment,
  normalizeMercariText,
  compileAllMercariPatterns,
} from '../mercariCategoryResolver';
import {
  MERCARI_NODES,
  MERCARI_ROOT_IDS,
  MERCARI_EXPANDED_GROUP_IDS,
  isMercariLeaf,
  mercariAllLeafIds,
  mercariPathText,
  mercariRootId,
} from '../../config/mercariCategoryTree';
import { MERCARI_CURATED_BY_EBAY_ID, MERCARI_RULES } from '../../config/mercariCategoryMap';

const GLOVE_PATH = 'Sports & outdoors > Baseball Equipment > Baseball Gloves & Mitts';

function idOf(input: Parameters<typeof resolveMercariCategory>[0]): number | null {
  const r = resolveMercariCategory(input);
  return r ? r.id : null;
}

describe('mercariCategoryResolver: the youth baseball glove (the original bug)', () => {
  it('title alone resolves to 3100 with the full path', () => {
    const r = resolveMercariCategory({ title: 'Acme youth 10.5 inch baseball glove' });
    expect(r).not.toBeNull();
    expect(r!.id).toBe(3100);
    expect(r!.pathText).toBe(GLOVE_PATH);
    expect(r!.path).toEqual(['Sports & outdoors', 'Baseball Equipment', 'Baseball Gloves & Mitts']);
    expect(r!.source).toBe('RULE');
  });

  it('resolves the same leaf for every eBay category wording seen in production', () => {
    const title = 'Acme youth 10.5 inch baseball glove';
    expect(idOf({ title, ebayCategoryName: 'Baseball & Softball Gloves & Mitts' })).toBe(3100);
    expect(idOf({ title, ebayCategoryName: 'Baseball &amp; Softball Gloves &amp; Mitts' })).toBe(3100);
    expect(idOf({ title, categoryBreadcrumb: 'Sporting Goods:Baseball & Softball:Gloves & Mitts' })).toBe(3100);
    expect(idOf({ title, ebayCategoryName: 'Gloves & Mitts', categoryBreadcrumb: 'Sporting Goods:Baseball & Softball:Gloves & Mitts' })).toBe(3100);
  });

  it('uses the curated eBay id first and still lands on 3100', () => {
    const x = explainMercariCategory({ title: 'Acme youth 10.5 inch baseball glove', ebayCategoryId: '16030', ebayCategoryName: 'Gloves & Mitts' });
    expect(x.result!.id).toBe(3100);
    expect(x.result!.source).toBe('CURATED_ID');
    expect(x.stage).toBe('curated');
  });

  it('a catchers mitt and a first base mitt land on the same leaf', () => {
    expect(idOf({ title: 'Acme catchers mitt 32.5 inch' })).toBe(3100);
    expect(idOf({ title: 'Acme first base mitt 12 inch', ebayCategoryId: '16030' })).toBe(3100);
  });

  it('a softball-only glove stays null: its Mercari group was not harvested', () => {
    expect(resolveMercariCategory({ title: 'Acme 12 inch fastpitch softball glove', ebayCategoryId: '16030', ebayCategoryName: 'Gloves & Mitts' })).toBeNull();
    expect(resolveMercariCategory({ title: 'Acme youth softball glove', categoryBreadcrumb: 'Sporting Goods:Baseball & Softball:Gloves & Mitts' })).toBeNull();
  });

  it('batting gloves, a glove care kit and a bat are different leaves', () => {
    expect(idOf({ title: 'Acme batting gloves youth medium' })).toBe(3110);
    expect(idOf({ title: 'Acme baseball glove oil conditioner kit' })).toBe(3093);
    expect(idOf({ title: 'Acme youth baseball bat 30 inch drop 10' })).toBe(3095);
  });

  it('a signed baseball glove collectible goes to Autographs, not the equipment leaf', () => {
    expect(idOf({ title: 'Acme signed baseball glove with certificate' })).toBe(1640);
  });
});

describe('mercariCategoryResolver: the microphone cable must not become a welding cable', () => {
  it('an XLR microphone cable resolves to Microphone Accessories', () => {
    const r = resolveMercariCategory({ title: 'Acme XLR microphone cable 20 ft' });
    expect(r).not.toBeNull();
    expect(r!.id).toBe(2197);
    expect(r!.pathText).toBe('Electronics > Home Audio > Microphone Accessories');
    expect(r!.pathText).not.toContain('Welding');
  });

  it('the same cable through the eBay cable id and the Cables name never reaches Welding Equipment', () => {
    const viaId = resolveMercariCategory({ title: 'Acme mic cable XLR 10 ft', ebayCategoryId: '41459', ebayCategoryName: 'Cables, Snakes & Interconnects' });
    expect(viaId!.id).toBe(2197);
    const viaName = resolveMercariCategory({ title: 'Acme mic cable XLR 10 ft', ebayCategoryName: 'Cables' });
    expect(viaName).not.toBeNull();
    expect(viaName!.pathText).not.toContain('Welding');
  });

  it('a genuine welding cable resolves to nothing (Tools was not harvested), never to a guess', () => {
    expect(resolveMercariCategory({ title: 'Acme welding cable 2 gauge copper', ebayCategoryName: 'Welding Cable' })).toBeNull();
  });
});

describe('mercariCategoryResolver: department comes from explicit words only', () => {
  it('tracksuit: women, men, unstated and boys', () => {
    const base = { ebayCategoryId: '185084', ebayCategoryName: 'Tracksuits & Sets' };
    expect(idOf({ ...base, title: "Women's Acme tracksuit set medium" })).toBe(1986);
    expect(idOf({ ...base, title: 'Acme tracksuit set womens small' })).toBe(1986);
    expect(idOf({ ...base, title: 'Mens Acme tracksuit set large' })).toBe(2023);
    expect(idOf({ ...base, title: 'Acme tracksuit set medium' })).toBeNull();
    expect(explainMercariCategory({ ...base, title: 'Acme tracksuit set medium' }).reason).toBe('department-unknown');
    // only Women and Men were harvested: a boys item never falls into either
    expect(idOf({ ...base, title: 'Boys Acme tracksuit set' })).toBeNull();
    expect(explainMercariCategory({ ...base, title: 'Boys Acme tracksuit set' }).reason).toBe('department-leaf-missing');
  });

  it('golf clubs: men, women and unstated', () => {
    const base = { ebayCategoryId: '115280', ebayCategoryName: 'Golf Clubs' };
    expect(idOf({ ...base, title: "Men's Acme driver golf club right hand" })).toBe(734);
    expect(idOf({ ...base, title: 'Ladies Acme golf clubs set' })).toBe(735);
    expect(idOf({ ...base, title: 'Acme golf club set with bag' })).toBeNull();
  });

  it('jeans need both a department and a cut word', () => {
    expect(idOf({ title: 'Womens Acme skinny jeans size 8' })).toBe(1964);
    expect(idOf({ title: 'Mens Acme skinny jeans 32x30' })).toBe(2007);
    expect(idOf({ title: 'Acme skinny jeans size 8' })).toBeNull();
    expect(idOf({ title: 'Womens Acme jeans size 8' })).toBeNull();
  });

  it('t-shirt targets: women and men differ, "men and women" is contradictory and null', () => {
    expect(idOf({ title: 'Womens Acme graphic tee small' })).toBe(161);
    expect(idOf({ title: 'Mens Acme t shirt large' })).toBe(303);
    expect(idOf({ title: 'Acme t shirt men and women unisex' })).toBeNull();
  });

  it('inferMercariDepartment reads only explicit words', () => {
    expect(inferMercariDepartment('womens running shorts')).toBe('women');
    expect(inferMercariDepartment('mens running shorts')).toBe('men');
    expect(inferMercariDepartment('boys running shorts')).toBe('boys');
    expect(inferMercariDepartment('running shorts')).toBeNull();
    expect(inferMercariDepartment('men and women running shorts')).toBeNull();
  });
});

describe('mercariCategoryResolver: null on ambiguous or unharvested input (never a random leaf)', () => {
  it('empty and meaningless input is null, not a guess', () => {
    expect(resolveMercariCategory({})).toBeNull();
    expect(resolveMercariCategory({ title: '' })).toBeNull();
    expect(resolveMercariCategory({ title: 'Mysterious thing' })).toBeNull();
    expect(resolveMercariCategory({ title: null, description: null, brand: null })).toBeNull();
  });

  it('"Gloves" alone resolves to nothing', () => {
    expect(resolveMercariCategory({ title: 'Gloves' })).toBeNull();
    expect(resolveMercariCategory({ title: 'Gloves', ebayCategoryName: 'Gloves' })).toBeNull();
  });

  it('unharvested Mercari groups resolve to null, not to a neighbour', () => {
    expect(resolveMercariCategory({ title: 'Acme stoneware dinner plates set of four', ebayCategoryName: 'Dinnerware' })).toBeNull();
    expect(resolveMercariCategory({ title: 'Acme cordless drill 18V', ebayCategoryName: 'Power Drills' })).toBeNull();
    expect(resolveMercariCategory({ title: 'Acme smartphone 128GB unlocked', ebayCategoryName: 'Cell Phones & Smartphones' })).toBeNull();
    expect(resolveMercariCategory({ title: 'Acme paperback novel', ebayCategoryName: 'Fiction & Literature' })).toBeNull();
    expect(resolveMercariCategory({ title: 'Acme building bricks set 500 pieces', ebayCategoryName: 'Building Toys' })).toBeNull();
    expect(resolveMercariCategory({ title: 'Acme brake pads front set', ebayCategoryName: 'Brake Pads' })).toBeNull();
  });

  it('a deliberate blank explains itself', () => {
    const x = explainMercariCategory({ title: 'Acme fastpitch softball glove' });
    expect(x.result).toBeNull();
    expect(x.stage).toBe('blank');
    expect(x.detail).toBe('softball');
  });

  it('a firearm-like item is never filed (Mercari prohibits weapons)', () => {
    expect(resolveMercariCategory({ title: 'Acme rifle scope mount' })).toBeNull();
    expect(explainMercariCategory({ title: 'Acme replica sword wall display' }).reason).toBe('deliberate-blank');
  });
});

describe('mercariCategoryResolver: regressions', () => {
  it('vinyl records go to Handmade > Music > Vinyl (where Mercari sellers file them)', () => {
    const r = resolveMercariCategory({ title: 'Synthetic Band - Test Album LP 1979', ebayCategoryId: '176985', ebayCategoryName: 'Vinyl Records' });
    expect(r!.id).toBe(1472);
    expect(r!.pathText).toBe('Handmade > Music > Vinyl');
  });

  it('a comic book is filed under Comics, not Magazines', () => {
    const r = resolveMercariCategory({ title: 'Synthetic Heroes #12 comic book', ebayCategoryId: '259104', ebayCategoryName: 'Comics & Graphic Novels' });
    expect(r!.id).toBe(1641);
    expect(r!.pathText).not.toContain('Magazines');
  });

  it('a magazine stays a magazine', () => {
    const r = resolveMercariCategory({ title: 'Synthetic Gaming Magazine Vol 12 1995', ebayCategoryId: '280', ebayCategoryName: 'Magazines' });
    expect(r!.pathText).toContain('Magazines');
  });

  it('trading cards: a single card, a sports card by sport', () => {
    expect(idOf({ title: 'Synthetic holo rare card', ebayCategoryId: '183454' })).toBe(3509);
    expect(idOf({ title: 'Synthetic rookie baseball card', ebayCategoryId: '261328', ebayCategoryName: 'Sports Trading Card Singles' })).toBe(2597);
    expect(idOf({ title: 'Synthetic rookie hockey card', ebayCategoryId: '261328', ebayCategoryName: 'Sports Trading Card Singles' })).toBe(2601);
  });

  it('home, camping and aquarium examples', () => {
    expect(idOf({ title: 'Acme brass table lamp with shade', ebayCategoryId: '261713' })).toBe(2100);
    expect(idOf({ title: 'Acme 6 person camping tent' })).toBe(3128);
    expect(idOf({ title: 'Acme canister filter for aquarium' })).toBe(3015);
    expect(idOf({ title: 'Acme steel belted cooler 48 quart' })).toBe(3126);
  });

  it('a golf ball is not a golf club, a golf bag is not a golf club', () => {
    expect(idOf({ title: 'Acme golf balls dozen' })).toBe(739);
    expect(idOf({ title: 'Acme golf stand bag 14 way' })).toBe(738);
  });

  it('a bare camera lens is not a camera and a film camera is not a digital one', () => {
    expect(idOf({ title: 'Acme 50mm camera lens f1.8' })).toBe(2135);
    expect(idOf({ title: 'Acme 35mm film camera body' })).toBe(767);
    expect(idOf({ title: 'Acme digital camera 20 megapixel' })).toBe(759);
  });

  it('source is reported per layer', () => {
    expect(resolveMercariCategory({ title: 'x', ebayCategoryId: '176985' })!.source).toBe('CURATED_ID');
    expect(resolveMercariCategory({ title: 'Acme steel belted cooler' })!.source).toBe('RULE');
  });

  it('the result id is a number and the path ends with the leaf title', () => {
    const r = resolveMercariCategory({ title: 'Acme 6 person camping tent' })!;
    expect(typeof r.id).toBe('number');
    expect(r.path[r.path.length - 1]).toBe('Camping Tents');
    expect(r.pathText).toBe(r.path.join(' > '));
  });
});

describe('mercariCategoryResolver: tree integrity', () => {
  it('has the harvested size and no orphans', () => {
    expect(MERCARI_NODES.size).toBe(825);
    MERCARI_NODES.forEach((n) => {
      if (n.parentId !== 0) expect(MERCARI_NODES.has(n.parentId)).toBe(true);
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.depth).toBeGreaterThan(0);
      expect(n.depth).toBeLessThan(4);
    });
  });

  it('has 17 top-level families', () => {
    let roots = 0;
    MERCARI_NODES.forEach((n) => { if (n.parentId === 0) roots++; });
    expect(roots).toBe(17);
    expect(Object.keys(MERCARI_ROOT_IDS).length).toBe(17);
  });

  it('every expanded group exists and has children, and nothing outside them is a leaf', () => {
    for (const g of MERCARI_EXPANDED_GROUP_IDS) {
      const n = MERCARI_NODES.get(g)!;
      expect(n).toBeDefined();
      expect(n.depth).toBe(2);
      expect(n.childIds.length).toBeGreaterThan(0);
    }
    const leaves = mercariAllLeafIds();
    expect(leaves.length).toBe(531);
    for (const id of leaves) {
      const n = MERCARI_NODES.get(id)!;
      expect(n.childIds.length).toBe(0);
    }
    expect(isMercariLeaf(8)).toBe(false); // a family
    expect(isMercariLeaf(2126)).toBe(false); // a group
    expect(isMercariLeaf(579)).toBe(false); // Kitchen Dinnerware: group not harvested
    expect(isMercariLeaf(999999)).toBe(false);
    expect(isMercariLeaf(3100)).toBe(true);
  });

  it('path text helpers are consistent', () => {
    expect(mercariPathText(3100)).toBe(GLOVE_PATH);
    expect(mercariPathText(999999)).toBe('');
    expect(mercariRootId(3100)).toBe(MERCARI_ROOT_IDS.SPORTS_OUTDOORS);
  });
});

describe('mercariCategoryResolver: data integrity (CI fails on a typo or a Mercari tree change)', () => {
  function targetIds(t: unknown): number[] {
    if (t === null || t === undefined) return [];
    if (typeof t === 'number') return [t];
    return Object.values(t as Record<string, number>);
  }

  it('every curated target is a harvested leaf and every key is a numeric eBay id', () => {
    const keys = Object.keys(MERCARI_CURATED_BY_EBAY_ID);
    expect(keys.length).toBeGreaterThan(50);
    for (const k of keys) {
      expect(/^[0-9]+$/.test(k)).toBe(true);
      const e = MERCARI_CURATED_BY_EBAY_ID[k];
      const targets: number[] = [];
      if (typeof e === 'object' && 'split' in e) {
        for (const [, t] of e.split) targets.push(...targetIds(t));
        targets.push(...targetIds(e.fallback));
      } else {
        targets.push(...targetIds(e));
      }
      expect(targets.length).toBeGreaterThan(0);
      for (const id of targets) expect(isMercariLeaf(id)).toBe(true);
    }
  });

  it('every rule target is a harvested leaf, ids are unique, and department targets sit under Women or Men', () => {
    const seen = new Set<string>();
    for (const r of MERCARI_RULES) {
      expect(seen.has(r.id)).toBe(false);
      seen.add(r.id);
      expect(r.all.length).toBeGreaterThan(0);
      for (const id of targetIds(r.target)) expect(isMercariLeaf(id)).toBe(true);
      if (r.target !== null && typeof r.target === 'object') {
        for (const key of Object.keys(r.target)) {
          const id = (r.target as Record<string, number>)[key];
          const leafTitle = MERCARI_NODES.get(id)!.title;
          if (mercariRootId(id) === MERCARI_ROOT_IDS.SPORTS_OUTDOORS) {
            // golf clubs: the leaf titles themselves name the department
            if (key === 'women') expect(leafTitle.indexOf('Women')).toBe(0);
            if (key === 'men') expect(leafTitle.indexOf('Men')).toBe(0);
          } else {
            if (key === 'women') expect(mercariRootId(id)).toBe(MERCARI_ROOT_IDS.WOMEN);
            if (key === 'men') expect(mercariRootId(id)).toBe(MERCARI_ROOT_IDS.MEN);
          }
        }
      }
    }
    expect(MERCARI_RULES.length).toBeGreaterThan(200);
  });

  it('every pattern compiles', () => {
    expect(compileAllMercariPatterns()).toBeGreaterThan(500);
  });

  it('deliberate blank rules exist and none of them is the last-resort catch-all', () => {
    const blanks = MERCARI_RULES.filter((r) => r.target === null);
    expect(blanks.length).toBeGreaterThan(5);
    for (const b of blanks) expect(b.all.length).toBeGreaterThan(0);
  });
});

describe('mercariCategoryResolver: normalisation', () => {
  it('lower-cases, folds accents, drops apostrophes and turns & into and', () => {
    expect(normalizeMercariText("Men's Café & Bar")).toBe('mens cafe and bar');
    expect(normalizeMercariText('Baseball &amp; Softball')).toBe('baseball and softball');
    expect(normalizeMercariText(null)).toBe('');
  });
});

describe('mercariCategoryResolver: singular and plural both match (dropped-singular regex class)', () => {
  // Patterns are compiled as \b(?:body)\b, so "boxes?" matches "boxe"/"boxes" but NEVER "box". Every word whose
  // plural adds -es (x/ch/sh/ss/z), -ies (y words) or -ves (f/fe words) needs the (?:es)? / (?:y|ies) / (?:f|ves) form.
  // All titles are synthetic.
  const PAIRS: Array<[string, string, number]> = [
    ['Wooden storage shelf', 'Wooden storage shelves', 2125],
    ['Wooden jewelry box', 'Wooden jewelry boxes', 686],
    ['Pop up event canopy', 'Pop up event canopies', 3124],
    ['Bathroom shower shelf', 'Bathroom shower shelves', 677],
  ];
  for (const [singular, plural, expected] of PAIRS) {
    it('"' + singular + '" and "' + plural + '" resolve identically', () => {
      expect(idOf({ title: singular })).toBe(expected);
      expect(idOf({ title: plural })).toBe(expected);
    });
  }

  // Words whose SINGULAR genuinely ends in -e / -ie, so a bare "s?" is already correct (axe, glaze, hoodie, ...).
  const ALLOWED = new Set<string>([
    'axes?',
    'squeezes?',
    'beanies?',
    'cookies?',
    'hoodies?',
    'koozies?',
    'movies?',
    'neckties?',
    'onesies?',
    'ties?',
  ]);
  const DROPPED_SINGULAR_SHAPES: RegExp[] = [
    /\b[a-z]*(?:ch|sh|x|ss|z)es\?/g, // boxes? benches? brushes? glasses? -> box(?:es)?
    /\b[a-z]*[^aeiou\s|(?:)]ies\?/g, // batteries? tapestries? -> batter(?:y|ies)
    /\b[a-z]*(?:shel|kni|lea|scar|wol|hal|loa|cal|thie|wi|el|hoo|sel)ves\?/g, // shelves? knives? scarves? -> shel(?:f|ves)
    /\b[a-z]*(?:lens|canvas|bus|gas|bias|atlas|status|stylus|virus|bonus|campus|focus|chorus)es\?/g, // lenses? -> lens(?:es)?
  ];
  function droppedSingulars(body: string): string[] {
    const found = new Set<string>();
    for (const re of DROPPED_SINGULAR_SHAPES) for (const w of body.match(re) || []) found.add(w);
    return Array.from(found).sort();
  }
  function allPatterns(): string[] {
    const all: string[] = [];
    for (const r of MERCARI_RULES) all.push(...r.all, ...(r.none || []));
    for (const k of Object.keys(MERCARI_CURATED_BY_EBAY_ID)) {
      const e: any = MERCARI_CURATED_BY_EBAY_ID[k];
      if (e && typeof e === 'object' && Array.isArray(e.split)) for (const [p] of e.split) all.push(p);
    }
    return all;
  }

  it('the guard itself flags the four buggy shapes and leaves the correct forms alone', () => {
    expect(droppedSingulars('boxes?|knives?|batteries?|lenses?')).toEqual(['batteries?', 'boxes?', 'knives?', 'lenses?']);
    expect(droppedSingulars('box(?:es)?|kni(?:fe|ves)|batter(?:y|ies)|lens(?:es)?|boxes|hoodies?')).toEqual(['hoodies?']);
  });

  it('no pattern, in any rule, exclusion or curated split, uses a shape that drops the singular', () => {
    const bad: string[] = [];
    for (const p of allPatterns()) {
      const body = p.replace(/^(cat|title|desc):/, '');
      for (const w of droppedSingulars(body)) if (!ALLOWED.has(w)) bad.push(w + '  in  ' + p.slice(0, 60));
    }
    expect(bad).toEqual([]);
  });
});
