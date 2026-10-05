/**
 * (S-EXT-CRAIGSLIST-CATEGORY-MAP, 2026-10-05) Craigslist category resolver + data integrity.
 *
 * Root cause this pins: extension/fas-craigslist.js picked the posting category with a 20-rule SUBSTRING
 * table, so "Home & Garden" went to farm+garden, "Video Games & Consoles" to photo+video, "Skin Care" to
 * sporting ("ski" inside "skin"), "Smart Watches" to arts+crafts ("art" inside "smart"), and a baseball
 * glove, Pet Supplies, Music and Pottery & Glass all fell to general. The backend now resolves ONE
 * Craigslist category code per item with WHOLE-WORD matching and the extension opens exactly that.
 *
 * Pure unit test: the resolver and the two config files have no imports beyond each other, so nothing is
 * mocked. All titles are synthetic. NOT EXECUTED under jest when written (jest cannot run on the authoring
 * machine -- see dev-environment skill). The same assertions were executed there against a minimal
 * describe/it/expect shim using Node's TypeScript stripping; CI is the real gate.
 */
import { resolveCraigslistCategory, explainCraigslistCategory, normalizeCraigslistText } from '../craigslistCategoryResolver';
import {
  CRAIGSLIST_NODES,
  CRAIGSLIST_ROOT_IDS,
  isCraigslistLeaf,
  craigslistAllLeafIds,
  craigslistPathTitles,
  craigslistRootId,
} from '../../config/craigslistCategoryTree';
import {
  CRAIGSLIST_CURATED_BY_EBAY_ID,
  CRAIGSLIST_RULES,
  CRAIGSLIST_SCORED_ALIASES,
  CRAIGSLIST_NEVER_TARGETS,
} from '../../config/craigslistCategoryMap';

function idOf(input: Parameters<typeof resolveCraigslistCategory>[0]): string | null {
  const r = resolveCraigslistCategory(input);
  return r ? String(r.id) : null;
}

describe('craigslistCategoryResolver: the baseball glove (same bug class as the Vinted glove)', () => {
  it('title alone resolves to sporting goods with the full path', () => {
    const r = resolveCraigslistCategory({ title: 'Rawlings youth 10.5 inch baseball glove' });
    expect(r).not.toBeNull();
    expect(r!.id).toBe('sga');
    expect(r!.path).toEqual(['for sale', 'sporting']);
    expect(r!.pathText).toBe('for sale > sporting');
    expect(r!.source).toBe('RULE');
  });

  it('resolves the same category for every eBay category wording seen in production', () => {
    const title = 'Youth 10.5 inch baseball glove';
    expect(idOf({ title, ebayCategoryName: 'Baseball & Softball Gloves & Mitts' })).toBe('sga');
    expect(idOf({ title, ebayCategoryName: 'Baseball &amp; Softball Gloves &amp; Mitts' })).toBe('sga');
    expect(idOf({ title, categoryBreadcrumb: 'Sporting Goods:Baseball & Softball:Gloves & Mitts' })).toBe('sga');
    expect(idOf({ ebayCategoryName: 'Gloves & Mitts' })).toBe('sga');
  });

  it('a curated eBay id answers first', () => {
    const x = explainCraigslistCategory({ title: 'Youth baseball glove', ebayCategoryId: '16030', ebayCategoryName: 'Gloves & Mitts' });
    expect(x.result!.id).toBe('sga');
    expect(x.result!.source).toBe('CURATED_ID');
  });

  it('a signed glove on a display case is memorabilia, not sporting goods', () => {
    expect(idOf({ title: 'Baseball glove display case signed by the team' })).toBe('cba');
  });
});

describe('craigslistCategoryResolver: the old substring false positives, now correct', () => {
  const cases: Array<[string, string]> = [
    ['Home & Garden', 'hsa'], // was farm: the garden rule fired before household
    ['Video Games & Consoles', 'vga'], // was photo: "video"
    ['Skin Care', 'haa'], // was sporting: "ski" inside "skin"
    ['Smart Watches', 'ela'], // was arts: "art" inside "smart"
    ['Baseball Gloves', 'sga'], // was general
    ['Pet Supplies', 'foa'], // was general (no pet-supplies category on Craigslist)
    ['Music', 'ema'], // was general
    ['Pottery & Glass', 'hsa'], // was general
  ];
  for (const [name, code] of cases) {
    it('"' + name + '" -> ' + code, () => {
      expect(idOf({ ebayCategoryName: name })).toBe(code);
      expect(idOf({ categoryBreadcrumb: name })).toBe(code);
    });
  }

  it('matching is whole-word only: a word hidden inside another word never decides', () => {
    expect(idOf({ title: 'Skin care serum set' })).toBe('haa');
    expect(idOf({ title: 'Ski boots size 10' })).toBe('sga');
    expect(idOf({ title: 'Smart watch band' })).toBe('ela');
    expect(idOf({ title: 'Art deco vase' })).toBe('hsa');
    // "ring" inside spring/steering, "bed" inside bedroom, "tool" inside stool, "home" inside homemade
    expect(resolveCraigslistCategory({ title: 'Spring steering wheel cover' })).toBeNull();
    expect(idOf({ title: 'Oak bedroom dresser' })).toBe('fua');
    expect(idOf({ title: 'Wooden stool' })).toBe('fua');
    expect(idOf({ title: 'Homemade candle' })).toBe('hsa');
  });

  it('every compiled pattern is a whole-word alternation: no hidden-substring plural bugs', () => {
    // "boxes?" matches "boxe"/"boxes" but never "box"; the (es)? form is required for words ending in ch/sh/x/s/z.
    const bad: string[] = [];
    const all: string[] = [];
    for (const r of CRAIGSLIST_RULES) all.push(...r.all, ...(r.none || []));
    for (const k of Object.keys(CRAIGSLIST_CURATED_BY_EBAY_ID)) {
      const e: any = CRAIGSLIST_CURATED_BY_EBAY_ID[k];
      if (e && typeof e === 'object') for (const [p] of e.split) all.push(p);
    }
    for (const a of CRAIGSLIST_SCORED_ALIASES) all.push(a.any, ...(a.none ? [a.none] : []));
    for (const p of all) {
      const body = p.replace(/^(cat|title|desc):/, '');
      if (/(ch|sh|x)es\?/.test(body)) bad.push(p.slice(0, 50));
      if (body.indexOf(':') !== -1) bad.push('colon: ' + p.slice(0, 50));
    }
    expect(bad).toEqual([]);
  });
});

describe('craigslistCategoryResolver: honest homes', () => {
  it('barter, wanted, free stuff and garage sales are never returned', () => {
    expect(CRAIGSLIST_NEVER_TARGETS).toEqual(['bar', 'waa', 'zip', 'gms']);
    for (const t of ['Free stuff box', 'Wanted: vintage dresser', 'Barter trade', 'Garage sale signs', 'Estate sale yard sale']) {
      const r = resolveCraigslistCategory({ title: t });
      expect(r === null || CRAIGSLIST_NEVER_TARGETS.indexOf(String(r.id)) === -1).toBe(true);
    }
  });

  it('no curated entry, rule target or scored alias points at a never-target', () => {
    const targets: string[] = [];
    for (const k of Object.keys(CRAIGSLIST_CURATED_BY_EBAY_ID)) {
      const e: any = CRAIGSLIST_CURATED_BY_EBAY_ID[k];
      if (typeof e === 'string') targets.push(e);
      else if (e && typeof e === 'object') {
        for (const [, t] of e.split) if (t) targets.push(t);
        if (e.fallback) targets.push(e.fallback);
      }
    }
    for (const r of CRAIGSLIST_RULES) if (r.target) targets.push(r.target);
    for (const a of CRAIGSLIST_SCORED_ALIASES) targets.push(a.id);
    expect(targets.filter((t) => CRAIGSLIST_NEVER_TARGETS.indexOf(t) !== -1)).toEqual([]);
  });

  it('vehicle categories come from the eBay CATEGORY text only, never from a title word', () => {
    expect(idOf({ ebayCategoryName: 'Boats', title: 'Fishing boat 16 ft' })).toBe('boo');
    expect(resolveCraigslistCategory({ title: 'Gravy boat' })).toBeNull();
    expect(idOf({ title: 'Boat shoes size 9' })).toBe('cla');
    expect(idOf({ ebayCategoryName: 'Cars & Trucks', title: 'Pickup truck' })).toBe('cta');
    expect(idOf({ title: 'Toy truck die cast' })).toBe('taa');
    expect(idOf({ ebayCategoryName: 'Boat Parts', title: 'Propeller' })).toBe('bpa');
    // a car-parts category is auto parts, not cars+trucks
    expect(idOf({ ebayCategoryName: 'Car & Truck Parts & Accessories', title: 'Brake rotor' })).toBe('pta');
  });

  it('business and tickets resolve only when the eBay family implies them', () => {
    expect(idOf({ ebayCategoryName: 'Business & Industrial', title: 'Misc fixture' })).toBe('bfa');
    expect(idOf({ ebayCategoryName: 'Tickets & Experiences', title: 'Concert admission' })).toBe('tia');
    expect(idOf({ title: 'Vintage ticket stub collection' })).not.toBe('tia');
    expect(idOf({ title: 'Office desk' })).not.toBe('bfa');
  });
});

describe('craigslistCategoryResolver: null on ambiguous or meaningless input (never a random category)', () => {
  it('"Gloves" alone is null', () => {
    expect(resolveCraigslistCategory({ title: 'Gloves' })).toBeNull();
    expect(resolveCraigslistCategory({ title: 'Gloves', ebayCategoryName: 'Gloves' })).toBeNull();
  });

  it('empty and meaningless input is null, not a guess', () => {
    expect(resolveCraigslistCategory({})).toBeNull();
    expect(resolveCraigslistCategory({ title: '' })).toBeNull();
    expect(resolveCraigslistCategory({ title: 'Mysterious thing' })).toBeNull();
    expect(resolveCraigslistCategory({ title: null, description: null, brand: null })).toBeNull();
    expect(explainCraigslistCategory({}).reason).toBe('no-text');
  });

  it('the scored layer refuses when two categories match', () => {
    const one = explainCraigslistCategory({ title: 'Furniture lot' });
    expect(one.result!.id).toBe('fua');
    expect(one.result!.source).toBe('SCORED');
    const two = explainCraigslistCategory({ title: 'Appliances furniture lot' });
    expect(two.result).toBeNull();
    expect(two.reason.indexOf('ambiguous:')).toBe(0);
  });

  it('deliberate blanks stay blank: test rows, ambiguous art and decor, bladed weapons', () => {
    expect(explainCraigslistCategory({ title: 'QA Test Item 7', ebayCategoryName: 'Furniture' }).stage).toBe('blank');
    expect(explainCraigslistCategory({ title: 'Test Prod 2' }).stage).toBe('blank');
    expect(explainCraigslistCategory({ title: 'Nice piece', ebayCategoryName: 'Art & Decor' }).stage).toBe('blank');
    expect(explainCraigslistCategory({ title: 'Ornate dagger', ebayCategoryId: '88903', ebayCategoryName: 'Daggers' }).stage).toBe('blank');
  });
});

describe('craigslistCategoryResolver: regressions and layer behaviour', () => {
  it('a comic book is collectibles, not books or magazines, even though the eBay id name says "Graphic Novels"', () => {
    const r = explainCraigslistCategory({ title: 'Synthetic Hero #12 Marvel comic book', ebayCategoryId: '259104', ebayCategoryName: 'Comics & Graphic Novels' });
    expect(r.result!.id).toBe('cba');
    expect(r.result!.source).toBe('CURATED_ID');
    expect(idOf({ title: 'Synthetic Hero #12 Marvel comic book', categoryBreadcrumb: 'Collectibles:Comic Books & Memorabilia:Comics:Comics & Graphic Novels' })).toBe('cba');
    // a manga volume is a book
    expect(idOf({ title: 'Sample Manga Vol 3', ebayCategoryId: '259104', ebayCategoryName: 'Comics & Graphic Novels' })).toBe('bka');
  });

  it('a magazine stays a magazine (books) even with a game title in it', () => {
    expect(idOf({ title: 'Game Informer Magazine Vol 69 1995', ebayCategoryId: '280', ebayCategoryName: 'Magazines' })).toBe('bka');
    expect(idOf({ title: 'Nintendo Power Magazine issue', categoryBreadcrumb: 'Books & Magazines:Magazines' })).toBe('bka');
  });

  it('trading cards, coins and advertising signs are collectibles', () => {
    expect(idOf({ title: 'Synthetic Holo Rookie Card', ebayCategoryName: 'Individual Trading Cards' })).toBe('cba');
    expect(idOf({ title: '1971 Eisenhower Dollar Circulated Coin', categoryBreadcrumb: 'Coins & Paper Money:Coins: US:Dollars' })).toBe('cba');
    expect(idOf({ title: 'Vintage Metal Sign', ebayCategoryName: 'Signs' })).toBe('cba');
  });

  it('Hockey-NHL (24510) is a collectible, never sporting goods; a real hockey stick is sporting goods', () => {
    expect(idOf({ title: 'Commemorative puck', ebayCategoryId: '24510', ebayCategoryName: 'Hockey-NHL' })).toBe('cba');
    expect(idOf({ title: 'Ice hockey stick senior', categoryBreadcrumb: 'Sporting Goods:Ice Hockey' })).toBe('sga');
  });

  it('curated split patterns read the TITLE, not the eBay category name', () => {
    // 48656 "TV Stands & Mounts": the category name contains "mounts" for every item
    expect(idOf({ title: 'Oak media stand', ebayCategoryId: '48656', ebayCategoryName: 'TV Stands & Mounts' })).toBe('fua');
    expect(idOf({ title: 'Wall mount bracket for flat screen', ebayCategoryId: '48656', ebayCategoryName: 'TV Stands & Mounts' })).toBe('ela');
    expect(idOf({ title: 'Tennis ball', ebayCategoryId: '1226', ebayCategoryName: 'Tennis' })).toBe('sga');
    expect(idOf({ title: 'Signed tennis ball', ebayCategoryId: '1226', ebayCategoryName: 'Tennis' })).toBe('cba');
    expect(idOf({ title: 'Titleist golf balls dozen', ebayCategoryId: '27280', ebayCategoryName: 'Balls' })).toBe('sga');
  });

  it('music gear, game gear and electronics land in their own categories', () => {
    expect(idOf({ title: 'Acoustic guitar with case' })).toBe('msa');
    expect(idOf({ title: 'Sample console cartridge', ebayCategoryName: 'Video Games' })).toBe('vga');
    expect(idOf({ title: 'Cordless drill set' })).toBe('tla');
    expect(idOf({ title: 'Table saw' })).toBe('tla');
    expect(idOf({ title: 'Table lamp' })).toBe('hsa');
    expect(idOf({ title: 'Coffee table' })).toBe('fua');
    expect(idOf({ title: 'Shimano bicycle derailleur' })).toBe('bip');
    expect(idOf({ title: 'Mountain bike 26 inch' })).toBe('bia');
    expect(idOf({ title: 'Pokemon booster box' })).toBe('cba');
  });

  it('the result shape is { id, path, pathText, source }', () => {
    const r = resolveCraigslistCategory({ title: 'Refrigerator' })!;
    expect(Object.keys(r).sort()).toEqual(['id', 'path', 'pathText', 'source']);
    expect(r.id).toBe('ppa');
    expect(r.path).toEqual(['for sale', 'appliances']);
    expect(['CURATED_ID', 'RULE', 'SCORED']).toContain(r.source);
    const auto = resolveCraigslistCategory({ ebayCategoryName: 'Cars & Trucks' })!;
    expect(auto.path).toEqual(['autos', 'cars+trucks']);
  });

  it('normalizeCraigslistText folds entities, accents and punctuation', () => {
    expect(normalizeCraigslistText('Baseball &amp; Softball Gloves')).toBe('baseball and softball gloves');
    expect(normalizeCraigslistText("Men's Café Sign!")).toBe('mens cafe sign');
    expect(normalizeCraigslistText(null)).toBe('');
  });
});

describe('craigslist catalog tree + mapping integrity', () => {
  it('the tree has the expected shape', () => {
    expect(CRAIGSLIST_NODES.size).toBe(47);
    expect(craigslistAllLeafIds().length).toBe(45);
    expect(Object.keys(CRAIGSLIST_ROOT_IDS).length).toBe(2);
    const forSale = craigslistAllLeafIds().filter((id) => craigslistRootId(id) === CRAIGSLIST_ROOT_IDS.FOR_SALE);
    const autos = craigslistAllLeafIds().filter((id) => craigslistRootId(id) === CRAIGSLIST_ROOT_IDS.AUTOS);
    expect(forSale.length).toBe(33);
    expect(autos.length).toBe(12);
    expect(isCraigslistLeaf('sga')).toBe(true);
    expect(isCraigslistLeaf('sse')).toBe(false); // "for sale" is a parent
    expect(isCraigslistLeaf('aut')).toBe(false);
    expect(isCraigslistLeaf('zzz')).toBe(false);
    expect(craigslistPathTitles('sga')).toEqual(['for sale', 'sporting']);
    expect(craigslistPathTitles('cta')).toEqual(['autos', 'cars+trucks']);
  });

  it('ids are unique 3-letter codes and every non-root node has an existing parent', () => {
    const bad: string[] = [];
    CRAIGSLIST_NODES.forEach((n) => {
      if (!/^[a-z]{3}$/.test(n.id)) bad.push('id ' + n.id);
      if (n.parentId && !CRAIGSLIST_NODES.has(n.parentId)) bad.push('parent of ' + n.id);
      if (!n.title) bad.push('title ' + n.id);
    });
    expect(bad).toEqual([]);
  });

  function collectTargets(): Array<{ where: string; id: unknown }> {
    const out: Array<{ where: string; id: unknown }> = [];
    for (const k of Object.keys(CRAIGSLIST_CURATED_BY_EBAY_ID)) {
      const e: any = CRAIGSLIST_CURATED_BY_EBAY_ID[k];
      if (e === null) continue;
      if (typeof e === 'string') out.push({ where: 'curated ' + k, id: e });
      else {
        for (const [, t] of e.split) if (t !== null) out.push({ where: 'curated ' + k, id: t });
        if (e.fallback) out.push({ where: 'curated ' + k + ' fallback', id: e.fallback });
      }
    }
    for (const r of CRAIGSLIST_RULES) if (r.target !== null) out.push({ where: 'rule ' + r.id, id: r.target });
    for (const a of CRAIGSLIST_SCORED_ALIASES) out.push({ where: 'alias ' + a.id, id: a.id });
    return out;
  }

  it('every curated, rule and alias target exists in the tree and is a leaf', () => {
    const bad = collectTargets().filter((x) => typeof x.id !== 'string' || !CRAIGSLIST_NODES.has(x.id as string) || !isCraigslistLeaf(x.id as string));
    expect(bad).toEqual([]);
  });

  it('rule ids are unique and every pattern compiles', () => {
    const seen = new Set<string>();
    const dup: string[] = [];
    const broken: string[] = [];
    for (const r of CRAIGSLIST_RULES) {
      if (seen.has(r.id)) dup.push(r.id);
      seen.add(r.id);
      for (const p of [...r.all, ...(r.none || [])]) {
        const body = p.replace(/^(cat|title|desc):/, '');
        try { new RegExp('\\b(?:' + body + ')\\b'); } catch (e) { broken.push(r.id + ': ' + p.slice(0, 40)); }
      }
    }
    for (const a of CRAIGSLIST_SCORED_ALIASES) {
      try { new RegExp('\\b(?:' + a.any + ')\\b'); if (a.none) new RegExp('\\b(?:' + a.none + ')\\b'); } catch (e) { broken.push('alias ' + a.id); }
    }
    expect(dup).toEqual([]);
    expect(broken).toEqual([]);
  });

  it('curated eBay ids are plain numeric strings', () => {
    const bad = Object.keys(CRAIGSLIST_CURATED_BY_EBAY_ID).filter((k) => !/^[0-9]+$/.test(k));
    expect(bad).toEqual([]);
  });

  it('the curated table covers every eBay id seen in production Items plus the ids seeded for the other marketplaces', () => {
    // Deliberately absent (too broad, the item's own words decide): 13718 Replacement Parts, 177908 Large Animals,
    // 260139 Equipment, 261186 Books, 69854 Vintage/Retro/Mid-Century.
    const required = [
  '35', '44', '133', '154', '177', '280', '551', '594', '617', '801', '804', '986', '1217', '1226', '1245',
  '1333', '1438', '3631', '3893', '3984', '4713', '9355', '10805', '10834', '10843', '11226', '11673',
  '11675', '11677', '11981', '12506', '13716', '13831', '14964', '15262', '15687', '16030', '16038', '16224',
  '20542', '20684', '21766', '22669', '22670', '22672', '24510', '27280', '29909', '29946', '29948', '31388',
  '33021', '33034', '35684', '38052', '38053', '38072', '38235', '39476', '39477', '40029', '41195', '41408',
  '41419', '41459', '41511', '43506', '46677', '47075', '47091', '47346', '47779', '48094', '48515', '48605',
  '48656', '50807', '57988', '63516', '63900', '70993', '73500', '73507', '74927', '75670', '88903', '100351',
  '100355', '104043', '109431', '115280', '117042', '117414', '137843', '139921', '139971', '139973',
  '151621', '156955', '159175', '168867', '171485', '176985', '177918', '178988', '178989', '180349',
  '180964', '181382', '182174', '183050', '183438', '183439', '183454', '184148', '185084', '185258',
  '185708', '259104', '259256', '260505', '260831', '260941', '261054', '261328', '261688',
  '261713', '262374'
    ];
    const missing = required.filter((id) => !Object.prototype.hasOwnProperty.call(CRAIGSLIST_CURATED_BY_EBAY_ID, id));
    expect(missing).toEqual([]);
  });
});
