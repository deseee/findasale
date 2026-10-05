/**
 * (S-EXT-POSHMARK-CATEGORY-MAP, 2026-10-05) Poshmark category resolver + data integrity.
 *
 * Root cause this pins: the Chrome extension used to fuzzy-match Poshmark's sell-form category picker from
 * generic words, so a tracksuit, a comic or a lamp could land in whatever row the old logic liked best. The
 * backend now resolves ONE Department > Category > Sub-category path per item (exact picker titles) or
 * null, and the extension opens exactly that path or falls back to its old logic.
 *
 * Pure unit test: the resolver and the two config files have no imports beyond each other, so nothing is
 * mocked. All titles below are synthetic. NOT EXECUTED under jest when written (jest cannot run on the
 * authoring machine -- see dev-environment skill). The same assertions were executed there against a
 * minimal describe/it/expect shim using Node's TypeScript stripping; CI is the real gate.
 */
import { resolvePoshmarkCategory, explainPoshmarkCategory, inferPoshmarkDepartment, normalizePoshmarkText } from '../poshmarkCategoryResolver';
import {
  POSHMARK_NODES,
  POSHMARK_UNVERIFIED_BRANCHES,
  POSHMARK_VERIFIED_CHILDLESS,
  POSHMARK_DEPARTMENT_IDS,
  isPoshmarkLeaf,
  isPoshmarkSelectable,
  poshmarkAllSelectableIds,
  poshmarkPathTitles,
  poshmarkPathText,
} from '../../config/poshmarkCategoryTree';
import { POSHMARK_CURATED_BY_EBAY_ID, POSHMARK_RULES } from '../../config/poshmarkCategoryMap';

function pathOf(input: Parameters<typeof resolvePoshmarkCategory>[0]): string | null {
  const r = resolvePoshmarkCategory(input);
  return r ? r.pathText : null;
}

describe('poshmarkCategoryResolver: tracksuits (department from explicit words only)', () => {
  it('a men\'s tracksuit lands on the men\'s joggers leaf, with the exact picker titles', () => {
    const r = resolvePoshmarkCategory({ title: "Brandname Men's Teal Tracksuit Set, Size M", ebayCategoryId: '185084', ebayCategoryName: 'Tracksuits & Sets' });
    expect(r).not.toBeNull();
    expect(r!.id).toBe('Men-Pants-Sweatpants_&_Joggers');
    expect(r!.path).toEqual(['Men', 'Pants', 'Sweatpants & Joggers']);
    expect(r!.pathText).toBe('Men > Pants > Sweatpants & Joggers');
    expect(r!.source).toBe('CURATED_ID');
  });

  it('women and kids land on their own leaves (kids has a real Matching Sets leaf)', () => {
    expect(pathOf({ title: "Nike Women's Tracksuit Set, Size S", ebayCategoryName: 'Tracksuits & Sets' })).toBe('Women > Pants & Jumpsuits > Track Pants & Joggers');
    expect(pathOf({ title: 'Boys Nike tracksuit 8-10', ebayCategoryName: 'Tracksuits & Sets' })).toBe('Kids > Matching Sets');
  });

  it('the rule layer finds a tracksuit even without an eBay category id', () => {
    const x = explainPoshmarkCategory({ title: "Puma Men's jogging suit set" });
    expect(x.result!.pathText).toBe('Men > Pants > Sweatpants & Joggers');
    expect(x.result!.source).toBe('RULE');
  });

  it('a tracksuit with NO stated department resolves to nothing (never a guess)', () => {
    const x = explainPoshmarkCategory({ title: 'Brandname Teal Tracksuit Set, Size M', ebayCategoryName: 'Tracksuits & Sets', ebayCategoryId: 185084 });
    expect(x.result).toBeNull();
    expect(x.reason).toBe('department-unknown');
    expect(resolvePoshmarkCategory({ title: 'Nike tracksuit set' })).toBeNull();
  });
});

describe('poshmarkCategoryResolver: comics, magazines, books', () => {
  it('a comic book goes to Coffee Table Books, the live-verified Poshmark home', () => {
    const r = resolvePoshmarkCategory({ title: 'Synthetic Heroes #300 comic book', categoryBreadcrumb: 'Collectibles:Comic Books' });
    expect(r!.path).toEqual(['Home', 'Accents', 'Coffee Table Books']);
    expect(r!.source).toBe('RULE');
    const byId = explainPoshmarkCategory({ title: 'Synthetic Heroes Issue 12', ebayCategoryId: '259104', ebayCategoryName: 'Comics & Graphic Novels' });
    expect(byId.result!.pathText).toBe('Home > Accents > Coffee Table Books');
    expect(byId.result!.source).toBe('CURATED_ID');
  });

  it('a comic is never filed under a toy or trading card leaf', () => {
    const r = resolvePoshmarkCategory({ title: 'Synthetic Heroes comic book first print with cards', categoryBreadcrumb: 'Collectibles:Comic Books' });
    expect(r!.pathText).not.toContain('Toys');
  });

  it('a comic character in a figure title is a toy, not a comic', () => {
    expect(pathOf({ title: 'Marvel Legends Spider-Man action figure' })).toBe('Kids > Toys > Action Figures & Playsets');
  });

  it('a magazine stays a magazine', () => {
    expect(pathOf({ title: 'Synthetic Gaming Monthly Magazine Vol 69 1995', ebayCategoryId: '280', ebayCategoryName: 'Magazines' })).toBe('Home > Accents > Coffee Table Books');
  });

  it('a cookbook goes to Cookbooks; a plain novel is a deliberate blank (Poshmark has no books category)', () => {
    expect(pathOf({ title: 'Synthetic Family Cookbook, hardcover' })).toBe('Home > Kitchen > Cookbooks');
    const novel = explainPoshmarkCategory({ title: 'A Synthetic Mystery, paperback novel' });
    expect(novel.result).toBeNull();
    expect(novel.stage).toBe('blank');
  });
});

describe('poshmarkCategoryResolver: items with a real Poshmark home', () => {
  it('vinyl records resolve by eBay id and by words', () => {
    const byId = explainPoshmarkCategory({ title: 'Synthetic Jazz Quartet LP', ebayCategoryId: '176985', ebayCategoryName: 'Vinyl Records' });
    expect(byId.result!.pathText).toBe('Electronics > Media > Vinyl Records');
    expect(byId.result!.source).toBe('CURATED_ID');
    expect(pathOf({ title: 'Synthetic Rock Band 12 inch vinyl album' })).toBe('Electronics > Media > Vinyl Records');
    // a record player is not a record
    expect(pathOf({ title: 'Synthetic record player turntable' })).toBeNull();
  });

  it('lamps and lighting go to Decor (no lamp leaf exists), signs to Art & Decals', () => {
    expect(pathOf({ title: 'Synthetic ceramic table lamp with shade' })).toBe('Home > Accents > Decor');
    expect(pathOf({ title: 'Synthetic Brand Cigarette Metal Sign', ebayCategoryName: 'Signs' })).toBe('Home > Wall Decor > Art & Decals');
  });

  it('trading cards go to Kids > Toys > Trading Cards, card supplies to Storage', () => {
    expect(pathOf({ title: 'Synthetic monster battle holo card', ebayCategoryId: '183454' })).toBe('Kids > Toys > Trading Cards');
    expect(pathOf({ title: 'Baseball cards 1990 lot' })).toBe('Kids > Toys > Trading Cards');
    expect(pathOf({ title: 'Penny sleeves and toploaders for cards', ebayCategoryId: '183438' })).toBe('Home > Storage & Organization > Storage');
  });

  it('aquarium pumps go to Pets > Fish > Decor & Accessories', () => {
    expect(pathOf({ title: 'Synthetic dual outlet aquarium air pump', ebayCategoryId: '100351' })).toBe('Pets > Fish > Decor & Accessories');
  });

  it('kitchen, dining, bedding and bath words resolve to their leaves', () => {
    expect(pathOf({ title: 'Cast iron skillet 10 inch' })).toBe('Home > Kitchen > Cookware');
    expect(pathOf({ title: 'Set of 4 wine glasses' })).toBe('Home > Dining > Drinkware');
    expect(pathOf({ title: 'Queen size comforter set' })).toBe('Home > Bedding > Comforters');
    expect(pathOf({ title: 'Bath towel set 6 piece' })).toBe('Home > Bath > Bath Towels');
  });

  it('a phone case follows the stated department, else the electronics leaf', () => {
    expect(pathOf({ title: "Women's iPhone case floral" })).toBe('Women > Accessories > Phone Cases');
    expect(pathOf({ title: 'iPhone 12 case silicone' })).toBe('Electronics > Cell Phones & Accessories > Cases');
  });
});

describe('poshmarkCategoryResolver: null on ambiguous input (never a random leaf)', () => {
  it('apparel without a stated department resolves to nothing', () => {
    expect(resolvePoshmarkCategory({ title: 'Gloves' })).toBeNull();
    expect(resolvePoshmarkCategory({ title: 'Leather belt black 34' })).toBeNull();
    const x = explainPoshmarkCategory({ title: 'Leather belt black 34' });
    expect(x.reason).toBe('department-unknown');
    expect(pathOf({ title: "Men's leather belt black 34" })).toBe('Men > Accessories > Belts');
  });

  it('two departments in one title is not a department', () => {
    expect(inferPoshmarkDepartment(normalizePoshmarkText('Mens and womens unisex hoodie'))).toBeNull();
    expect(resolvePoshmarkCategory({ title: 'Mens and womens unisex hoodie' })).toBeNull();
  });

  it('an eBay id that needs a department returns null without one, and a leaf with one', () => {
    const none = explainPoshmarkCategory({ title: 'Graphic T-Shirt, Black Cotton', ebayCategoryId: '15687', ebayCategoryName: 'T-Shirts' });
    expect(none.result).toBeNull();
    expect(none.reason).toBe('department-unknown');
    const men = resolvePoshmarkCategory({ title: "Men's Graphic T-Shirt, Black Cotton", ebayCategoryId: '15687', ebayCategoryName: 'T-Shirts' });
    expect(men!.pathText).toBe('Men > Shirts > Tees - Short Sleeve');
  });

  it('two equally good leaves score as ambiguous, which is null', () => {
    // "Screen Protectors" is a leaf under both Cell Phones & Accessories and Tablets & Accessories
    const x = explainPoshmarkCategory({ title: 'Screen Protectors' });
    expect(x.result).toBeNull();
    expect(x.stage).toBe('none');
    expect(x.reason.indexOf('ambiguous:')).toBe(0);
  });

  it('empty and meaningless input is null, not a guess', () => {
    expect(resolvePoshmarkCategory({})).toBeNull();
    expect(resolvePoshmarkCategory({ title: '' })).toBeNull();
    expect(resolvePoshmarkCategory({ title: 'Mysterious thing' })).toBeNull();
    expect(resolvePoshmarkCategory({ title: null, description: null, brand: null })).toBeNull();
  });

  it('apparel branches that were never read (dresses, jeans) resolve to nothing, not a made-up leaf', () => {
    expect(resolvePoshmarkCategory({ title: "Women's floral maxi dress size 8" })).toBeNull();
    expect(resolvePoshmarkCategory({ title: "Men's slim fit jeans size 32" })).toBeNull();
  });

  it('a paper insert or manual is vetoed from the scored layer', () => {
    const x = explainPoshmarkCategory({ title: 'Synthetic PC Game Instruction Manual Only', ebayCategoryName: 'Manuals, Inserts & Box Art' });
    expect(x.result).toBeNull();
  });
});

describe('poshmarkCategoryResolver: categories with no Poshmark home are deliberate blanks', () => {
  it('golf clubs, baseball gloves, guitars and coins resolve to nothing, and say why', () => {
    expect(explainPoshmarkCategory({ title: 'Synthetic left handed 5 iron', ebayCategoryId: '115280', ebayCategoryName: 'Golf Clubs' }).stage).toBe('blank');
    expect(explainPoshmarkCategory({ title: 'Synthetic youth baseball glove' }).stage).toBe('blank');
    expect(explainPoshmarkCategory({ title: 'Synthetic acoustic guitar', ebayCategoryId: '33021' }).stage).toBe('blank');
    expect(explainPoshmarkCategory({ title: 'Synthetic 1974 silver dollar coin' }).stage).toBe('blank');
    expect(resolvePoshmarkCategory({ title: 'Synthetic youth baseball glove' })).toBeNull();
  });

  it('tobacco and weapon items are blank, but a branded sign or shirt is not', () => {
    expect(explainPoshmarkCategory({ title: 'Synthetic cigar humidor' }).stage).toBe('blank');
    expect(explainPoshmarkCategory({ title: 'Synthetic pocket knife' }).stage).toBe('blank');
    expect(pathOf({ title: 'Synthetic Brand Cigarettes tin sign', ebayCategoryName: 'Signs' })).toBe('Home > Wall Decor > Art & Decals');
  });

  it('sports apparel is still apparel, not a blank', () => {
    expect(pathOf({ title: "Men's golf polo shirt" })).toBe('Men > Shirts > Polos');
  });

  it('test rows, industrial parts, furniture and small appliances stay blank', () => {
    expect(explainPoshmarkCategory({ title: 'Test Prod 2', ebayCategoryName: 'Other' }).stage).toBe('blank');
    expect(explainPoshmarkCategory({ title: 'Pipe fitting elbow 1/2 inch', ebayCategoryName: 'Pipe Fittings' }).stage).toBe('blank');
    expect(explainPoshmarkCategory({ title: 'Synthetic oak dining table' }).stage).toBe('blank');
    expect(explainPoshmarkCategory({ title: 'Synthetic countertop blender' }).stage).toBe('blank');
  });
});

describe('poshmarkCategoryResolver: department rules', () => {
  it('reads the department from explicit words only', () => {
    expect(inferPoshmarkDepartment(normalizePoshmarkText("Levi's Women's Skinny Jeans"))).toBe('women');
    expect(inferPoshmarkDepartment(normalizePoshmarkText("Men's Graphic Tee"))).toBe('men');
    expect(inferPoshmarkDepartment(normalizePoshmarkText('Girls floral dress'))).toBe('kids');
    expect(inferPoshmarkDepartment(normalizePoshmarkText('Boys cargo shorts'))).toBe('kids');
    expect(inferPoshmarkDepartment(normalizePoshmarkText('Girls and boys playset'))).toBe('kids');
    expect(inferPoshmarkDepartment(normalizePoshmarkText('Levis 501 jeans size 32'))).toBeNull();
  });

  it('fictional names that contain a gender word are not a department', () => {
    expect(inferPoshmarkDepartment(normalizePoshmarkText('Wonder Woman tracksuit'))).toBeNull();
    expect(inferPoshmarkDepartment(normalizePoshmarkText('Spider-Man graphic tee'))).toBeNull();
    expect(inferPoshmarkDepartment(normalizePoshmarkText("Men's Spider-Man graphic tee"))).toBe('men');
  });

  it('a department-split leaf is chosen only when the department is stated, and only if that department has it', () => {
    expect(pathOf({ title: "Women's black leather jacket" })).toBe('Women > Jackets & Coats > Leather Jackets');
    expect(resolvePoshmarkCategory({ title: 'Black leather jacket' })).toBeNull();
    // Men has no leather jacket leaf, so the rule is skipped rather than guessed
    expect(resolvePoshmarkCategory({ title: "Men's black leather jacket" })).toBeNull();
  });
});

describe('poshmark result shape', () => {
  it('returns id, path, pathText and source, and the path is the id\'s own chain of picker titles', () => {
    const r = resolvePoshmarkCategory({ title: 'Synthetic jazz LP', ebayCategoryId: '176985' })!;
    expect(typeof r.id).toBe('string');
    expect(r.path).toEqual(poshmarkPathTitles(r.id));
    expect(r.pathText).toBe(r.path.join(' > '));
    expect(r.pathText).toBe(poshmarkPathText(r.id));
    expect(['CURATED_ID', 'RULE', 'SCORED']).toContain(r.source);
  });

  it('a result is always a selectable leaf, 2 or 3 levels deep, starting at a real department', () => {
    const samples = [
      { title: 'Synthetic jazz LP', ebayCategoryId: '176985' },
      { title: "Men's cufflinks silver" },
      { title: 'Kids tracksuit boys', ebayCategoryName: 'Tracksuits & Sets' },
      { title: 'Synthetic wall mirror round' },
    ];
    for (const s of samples) {
      const r = resolvePoshmarkCategory(s);
      expect(r).not.toBeNull();
      expect(isPoshmarkSelectable(r!.id)).toBe(true);
      expect(r!.path.length === 2 || r!.path.length === 3).toBe(true);
      expect(Object.values(POSHMARK_DEPARTMENT_IDS)).toContain(r!.path[0]);
    }
  });
});

describe('poshmark category tree + mapping integrity', () => {
  it('the tree has the expected shape', () => {
    expect(POSHMARK_NODES.size).toBe(507);
    expect(Object.keys(POSHMARK_DEPARTMENT_IDS).length).toBe(6);
    expect(poshmarkAllSelectableIds().length).toBe(427);
    expect(POSHMARK_UNVERIFIED_BRANCHES.size).toBe(30);
    expect(POSHMARK_VERIFIED_CHILDLESS.size).toBe(1);
    expect(isPoshmarkSelectable('Men-Accessories-Belts')).toBe(true);
    expect(isPoshmarkLeaf('Men-Accessories')).toBe(false); // a category with sub-categories is a branch
    expect(isPoshmarkSelectable('Women-Dresses')).toBe(false); // unverified branch: its children were never read
    expect(isPoshmarkSelectable('Kids-Matching_Sets')).toBe(true); // verified childless
  });

  it('every node id is the slug of its own parent chain', () => {
    const bad: string[] = [];
    POSHMARK_NODES.forEach((n) => {
      const expected = poshmarkPathTitles(n.id).map((t) => t.replace(/ /g, '_')).join('-');
      if (expected !== n.id) bad.push(n.id);
    });
    expect(bad).toEqual([]);
  });

  function collectTargets(): Array<{ where: string; id: unknown }> {
    const out: Array<{ where: string; id: unknown }> = [];
    const addTarget = (where: string, t: unknown): void => {
      if (t === null || t === undefined) return;
      if (typeof t === 'string') { out.push({ where, id: t }); return; }
      const m = t as Record<string, unknown>;
      for (const k of Object.keys(m)) out.push({ where: where + '.' + k, id: m[k] });
    };
    for (const k of Object.keys(POSHMARK_CURATED_BY_EBAY_ID)) {
      const e: any = POSHMARK_CURATED_BY_EBAY_ID[k];
      if (e && typeof e === 'object' && 'split' in e) {
        for (const [, tgt] of e.split) addTarget('curated ' + k, tgt);
        addTarget('curated ' + k + ' fallback', e.fallback);
      } else addTarget('curated ' + k, e);
    }
    for (const r of POSHMARK_RULES) addTarget('rule ' + r.id, r.target);
    return out;
  }

  it('every curated and rule target exists in the tree and is a selectable leaf', () => {
    const bad = collectTargets().filter((x) => typeof x.id !== 'string' || !POSHMARK_NODES.has(x.id as string) || !isPoshmarkSelectable(x.id as string));
    expect(bad).toEqual([]);
  });

  it('there is a healthy number of targets (the check above is not vacuous)', () => {
    expect(collectTargets().length).toBeGreaterThanOrEqual(150);
  });

  it('department targets point into the matching department', () => {
    const wanted: Record<string, string> = { women: 'Women', men: 'Men', kids: 'Kids' };
    const mismatches: string[] = [];
    const check = (where: string, t: any): void => {
      if (!t || typeof t !== 'object') return;
      for (const k of Object.keys(wanted)) {
        if (typeof t[k] !== 'string') continue;
        const titles = poshmarkPathTitles(t[k] as string);
        if (titles[0] !== wanted[k]) mismatches.push(where + ' ' + k + ' ' + titles.join(' > '));
      }
    };
    for (const r of POSHMARK_RULES) check('rule ' + r.id, r.target);
    for (const k of Object.keys(POSHMARK_CURATED_BY_EBAY_ID)) {
      const e: any = POSHMARK_CURATED_BY_EBAY_ID[k];
      if (e && typeof e === 'object' && !('split' in e)) check('curated ' + k, e);
    }
    expect(mismatches).toEqual([]);
  });

  it('no mapping ever targets an unverified branch, an "Other" row or a department itself', () => {
    const bad = collectTargets().filter((x) => {
      const id = x.id as string;
      const n = POSHMARK_NODES.get(id);
      return !n || POSHMARK_UNVERIFIED_BRANCHES.has(id) || n.title === 'Other' || n.parentId === '0';
    });
    expect(bad).toEqual([]);
  });

  it('rule ids are unique and every pattern compiles', () => {
    const seen = new Set<string>();
    const dup: string[] = [];
    const broken: string[] = [];
    for (const r of POSHMARK_RULES) {
      if (seen.has(r.id)) dup.push(r.id);
      seen.add(r.id);
      for (const p of [...r.all, ...(r.none || [])]) {
        const body = p.replace(/^(cat|title|desc):/, '');
        try { new RegExp('\\b(?:' + body + ')\\b'); } catch (e) { broken.push(r.id + ': ' + p.slice(0, 40)); }
      }
    }
    expect(dup).toEqual([]);
    expect(broken).toEqual([]);
  });

  it('curated eBay ids are plain numeric strings', () => {
    const bad = Object.keys(POSHMARK_CURATED_BY_EBAY_ID).filter((k) => !/^[0-9]+$/.test(k));
    expect(bad).toEqual([]);
  });
});

describe('poshmarkCategoryResolver: singular and plural both match (dropped-singular regex class)', () => {
  // Patterns are compiled as \b(?:body)\b, so "boxes?" matches "boxe"/"boxes" but NEVER "box". Every word whose
  // plural adds -es (x/ch/sh/ss/z), -ies (y words) or -ves (f/fe words) needs the (?:es)? / (?:y|ies) / (?:f|ves) form.
  // All titles are synthetic.
  const PAIRS: Array<[string, string, string]> = [
    ['Wooden jewelry box', 'Wooden jewelry boxes', 'Home > Storage & Organization > Jewelry Organizers'],
    ['Wooden display shelf', 'Wooden display shelves', 'Home > Wall Decor > Display Shelves'],
    ['Stainless paring knife', 'Stainless paring knives', 'Home > Kitchen > Knives & Cutlery'],
    ['Ceramic butter dish', 'Ceramic butter dishes', 'Home > Dining > Serveware'],
  ];
  for (const [singular, plural, expected] of PAIRS) {
    it('"' + singular + '" and "' + plural + '" resolve identically', () => {
      expect(pathOf({ title: singular })).toBe(expected);
      expect(pathOf({ title: plural })).toBe(expected);
    });
  }

  // Words whose SINGULAR genuinely ends in -e / -ie, so a bare "s?" is already correct (axe, glaze, hoodie, ...).
  const ALLOWED = new Set<string>([
    'bronzes?',
    'beanies?',
    'booties?',
    'hoodies?',
    'movies?',
    'nighties?',
    'plushies?',
    'scrunchies?',
    'talkies?',
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
    for (const r of POSHMARK_RULES) all.push(...r.all, ...(r.none || []));
    for (const k of Object.keys(POSHMARK_CURATED_BY_EBAY_ID)) {
      const e: any = POSHMARK_CURATED_BY_EBAY_ID[k];
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
