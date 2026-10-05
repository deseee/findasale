/**
 * (S-EXT-GRAILED-CATEGORY-MAP, 2026-10-05) Grailed category resolver + data integrity.
 *
 * Root cause this pins: the Chrome extension walked Grailed's Department -> Category -> Sub-category picker
 * with fuzzy text matching and only two hand-confirmed overrides (tracksuits, T-shirts), so many items landed
 * in a wrong or blank category. The backend now resolves ONE leaf id + full path per item and the extension
 * opens exactly that. Grailed is fashion only, so anything that is not apparel, footwear, bags, jewelry or
 * accessories must resolve to null.
 *
 * Pure unit test: the resolver and the two config files have no imports beyond each other, so nothing is
 * mocked. All titles below are synthetic. NOT EXECUTED under jest when written (jest cannot run on the
 * authoring machine -- see dev-environment skill). The same assertions were executed there against a
 * minimal describe/it/expect shim using Node's TypeScript stripping; CI is the real gate.
 */
import { resolveGrailedCategory, explainGrailedCategory, inferGrailedDepartment, normalizeGrailedText } from '../grailedCategoryResolver';
import { GRAILED_NODES, GRAILED_DEPARTMENT_TITLES, grailedAllLeafIds, grailedPathText, isGrailedLeaf } from '../../config/grailedCategoryTree';
import { GRAILED_CURATED_BY_EBAY_ID, GRAILED_RULES } from '../../config/grailedCategoryMap';

function idOf(input: Parameters<typeof resolveGrailedCategory>[0]): string | null {
  const r = resolveGrailedCategory(input);
  return r ? r.id : null;
}
function pathOf(input: Parameters<typeof resolveGrailedCategory>[0]): string | null {
  const r = resolveGrailedCategory(input);
  return r ? r.pathText : null;
}

describe('grailedCategoryResolver: the two old GRAILED_CATEGORY_OVERRIDES rows', () => {
  it('tracksuits resolve to Tops > Sweatshirts & Hoodies for the stated department', () => {
    const r = resolveGrailedCategory({ title: "Acme Originals Men's Neon Tracksuit Set, Size M", ebayCategoryName: 'Tracksuits & Sets' });
    expect(r).not.toBeNull();
    expect(r!.id).toBe('menswear:tops.sweatshirts_hoodies');
    expect(r!.pathText).toBe('Menswear > Tops > Sweatshirts & Hoodies');
    expect(r!.path).toEqual(['Menswear', 'Tops', 'Sweatshirts & Hoodies']);
    expect(r!.source).toBe('RULE');
  });

  it('uses the curated eBay ids for tracksuits first', () => {
    const x = explainGrailedCategory({ title: "Acme Men's Tracksuit", ebayCategoryId: '185084', ebayCategoryName: 'Tracksuits & Sets' });
    expect(x.result!.id).toBe('menswear:tops.sweatshirts_hoodies');
    expect(x.result!.source).toBe('CURATED_ID');
    expect(idOf({ title: "Acme Women's Tracksuit", ebayCategoryId: '185708' })).toBe('womenswear:womens_tops.sweatshirts');
  });

  it('a tracksuit with no department stays null (the extension then runs its old override logic)', () => {
    const x = explainGrailedCategory({ title: 'Acme Neon Tracksuit Set, Size M', ebayCategoryId: '185084', ebayCategoryName: 'Tracksuits & Sets' });
    expect(x.result).toBeNull();
    expect(x.reason).toBe('department-unknown');
  });

  it('T-shirts resolve to Short Sleeve T-Shirts, and Long Sleeve when the title says so', () => {
    expect(pathOf({ title: "Men's Graphic T-Shirt, Black Cotton", ebayCategoryId: '15687', ebayCategoryName: 'T-Shirts' })).toBe('Menswear > Tops > Short Sleeve T-Shirts');
    expect(pathOf({ title: "Women's Graphic T-Shirt, Black Cotton", ebayCategoryId: '15687', ebayCategoryName: 'T-Shirts' })).toBe('Womenswear > Tops > Short Sleeve T-Shirts');
    expect(pathOf({ title: "Men's Long Sleeve T-Shirt, Navy", ebayCategoryId: '15687', ebayCategoryName: 'T-Shirts' })).toBe('Menswear > Tops > Long Sleeve T-Shirts');
    // no eBay id at all: the rule layer reaches the same leaf from the words
    expect(pathOf({ title: "Men's Vintage Band Tee", ebayCategoryName: 'T-Shirts' })).toBe('Menswear > Tops > Short Sleeve T-Shirts');
  });

  it('a T-shirt with no department is null, never a coin toss', () => {
    const x = explainGrailedCategory({ title: 'Graphic T-Shirt, Black Cotton', ebayCategoryId: '15687', ebayCategoryName: 'T-Shirts' });
    expect(x.result).toBeNull();
    expect(x.reason).toBe('department-unknown');
  });
});

describe('grailedCategoryResolver: department rules', () => {
  it('reads the department from explicit words only', () => {
    expect(inferGrailedDepartment(normalizeGrailedText("Men's Graphic Tee"))).toBe('men');
    expect(inferGrailedDepartment(normalizeGrailedText("Women's Skinny Jeans"))).toBe('women');
    expect(inferGrailedDepartment(normalizeGrailedText('Boys cargo shorts'))).toBe('men');
    expect(inferGrailedDepartment(normalizeGrailedText('Girls floral dress'))).toBe('women');
    expect(inferGrailedDepartment(normalizeGrailedText('Straight leg jeans size 32'))).toBeNull();
    // contradictory or unisex words are not a department
    expect(inferGrailedDepartment(normalizeGrailedText('Mens and womens hoodie'))).toBeNull();
    expect(inferGrailedDepartment(normalizeGrailedText("Unisex men's hoodie"))).toBeNull();
    // "women" must not be read as "men"
    expect(inferGrailedDepartment(normalizeGrailedText("Women's hoodie"))).toBe('women');
  });

  it('a leaf that differs by department is chosen only when the department is known', () => {
    expect(idOf({ title: "Acme Men's Hoodie" })).toBe('menswear:tops.sweatshirts_hoodies');
    expect(idOf({ title: "Acme Women's Hoodie" })).toBe('womenswear:womens_tops.hoodies');
    expect(idOf({ title: 'Acme Hoodie' })).toBeNull();
  });

  it('an eBay Men or Women category id supplies the department the title leaves out', () => {
    // 57988 = Men's Coats, Jackets & Vests, 63862 = Women's Coats, Jackets & Vests
    expect(pathOf({ title: 'Acme Windbreaker, Size L', ebayCategoryId: '57988', ebayCategoryName: 'Coats, Jackets & Vests' })).toBe('Menswear > Outerwear > Light Jackets');
    expect(pathOf({ title: 'Acme Leather Jacket, Size S', ebayCategoryId: '63862', ebayCategoryName: 'Coats, Jackets & Vests' })).toBe('Womenswear > Outerwear > Leather Jackets');
  });

  it('a title that contradicts the eBay category department is null, not a guess', () => {
    const x = explainGrailedCategory({ title: "Acme Men's Ripped Jeans", ebayCategoryId: '11554', ebayCategoryName: 'Jeans' });
    expect(x.result).toBeNull();
    expect(x.reason).toBe('department-conflict');
  });

  it('types that exist in one department only do not need a department word', () => {
    expect(pathOf({ title: 'Acme Mini Dress, Black' })).toBe('Womenswear > Dresses > Mini Dresses');
    expect(pathOf({ title: 'Acme Tuxedo Jacket, Black' })).toBe('Menswear > Tailoring > Tuxedos');
    expect(pathOf({ title: 'Acme Silk Tie, Navy' })).toBe('Menswear > Accessories > Ties & Pocketsquares');
    // a department the leaf does not exist in is a miss, not a wrong leaf
    expect(idOf({ title: "Acme Men's Mini Dress" })).toBeNull();
  });
});

describe('grailedCategoryResolver: non-fashion items are null (Grailed is fashion only)', () => {
  const nonFashion: string[] = [
    'Acme youth 10.5 inch baseball glove',
    'Acme Golf Driver Graphite Shaft',
    'Vintage Acme Cigarette Metal Sign',
    'Acme Wireless Gaming Headset',
    'Acme Pokemon Card Toploader 25 pack',
    'Acme Vinyl Record LP 1975 Pressing',
    'Acme Hat Rack Wall Mounted Oak',
    'Acme Coat Rack Stand Metal',
    'Acme Belt Sander 4x24',
    'Acme Shoe Polish Kit Brown',
    'Acme Jewelry Box Wooden Lined',
    'Acme Watch Band Replacement Strap 22mm',
    'Acme Smart Watch Series 5',
    'Acme Halloween Costume Pirate',
    'Acme Dress Form Mannequin Adjustable',
    'Acme Hard Hat Yellow Safety',
    'Acme Fishing Vest Mesh Pockets',
    'Acme Knit Fabric Jersey By The Yard',
    'Acme Christmas Tree Skirt Red Velvet',
    'Acme Hockey Jersey Signed Framed',
  ];
  it('every synthetic non-fashion title resolves to null', () => {
    const bad = nonFashion.filter((t) => resolveGrailedCategory({ title: t }) !== null);
    expect(bad).toEqual([]);
  });

  it('a baseball glove in a Sporting Goods category is a deliberate blank, even with a department word', () => {
    const x = explainGrailedCategory({ title: "Acme Men's Baseball Glove", ebayCategoryId: '16030', ebayCategoryName: 'Gloves & Mitts', categoryBreadcrumb: 'Sporting Goods:Baseball & Softball:Gloves & Mitts' });
    expect(x.result).toBeNull();
    expect(x.stage).toBe('blank');
  });

  it('non-fashion eBay top-level categories are blank, but a fashion noun in the title keeps the item in play', () => {
    expect(explainGrailedCategory({ title: 'Acme Test Item', categoryBreadcrumb: 'Collectibles:Tobacciana:Signs' }).result).toBeNull();
    expect(explainGrailedCategory({ title: 'Acme Comic Book Issue 12', categoryBreadcrumb: 'Collectibles:Comic Books' }).stage).toBe('blank');
    expect(pathOf({ title: "Acme Men's Leather Belt", categoryBreadcrumb: 'Collectibles' })).toBe('Menswear > Accessories > Belts');
  });

  it('fragrance and sleepwear have no Grailed leaf', () => {
    expect(explainGrailedCategory({ title: "Acme Men's Cologne 3.4 oz" }).stage).toBe('blank');
    expect(explainGrailedCategory({ title: "Acme Women's Pajama Set" }).stage).toBe('blank');
  });

  it('empty and meaningless input is null, not a guess', () => {
    expect(resolveGrailedCategory({})).toBeNull();
    expect(resolveGrailedCategory({ title: '' })).toBeNull();
    expect(resolveGrailedCategory({ title: 'Mysterious thing' })).toBeNull();
    expect(resolveGrailedCategory({ title: null, description: null, brand: null })).toBeNull();
  });
});

describe('grailedCategoryResolver: ambiguity returns null (never a random leaf)', () => {
  it('a generic dress or skirt has no length, so no leaf', () => {
    expect(explainGrailedCategory({ title: "Acme Women's Floral Dress" }).stage).toBe('blank');
    expect(explainGrailedCategory({ title: "Acme Women's Pleated Skirt" }).stage).toBe('blank');
  });

  it('a sneaker with no stated height is blank; stated height or a running shoe resolves', () => {
    expect(explainGrailedCategory({ title: "Acme Men's Sneakers Size 10" }).stage).toBe('blank');
    expect(explainGrailedCategory({ title: "Acme Men's Basketball Shoes Size 10" }).stage).toBe('blank');
    expect(pathOf({ title: "Acme Men's High Top Sneakers Size 10" })).toBe('Menswear > Footwear > Hi-Top Sneakers');
    expect(pathOf({ title: "Acme Men's Low Top Sneakers Size 10" })).toBe('Menswear > Footwear > Low-Top Sneakers');
    expect(pathOf({ title: "Acme Women's Running Shoes Size 8" })).toBe('Womenswear > Footwear > Low-Top Sneakers');
  });

  it('a generic women\'s handbag has no bag style, so no leaf; a styled one resolves', () => {
    expect(explainGrailedCategory({ title: "Acme Women's Handbag Black" }).stage).toBe('blank');
    expect(pathOf({ title: "Acme Women's Crossbody Bag Black" })).toBe('Womenswear > Bags & Luggage > Crossbody Bags');
    expect(pathOf({ title: "Acme Men's Messenger Bag Black" })).toBe('Menswear > Accessories > Bags & Luggage');
  });

  it('gloves, hats and boots with no department do not pick a department', () => {
    expect(resolveGrailedCategory({ title: 'Acme Leather Gloves' })).toBeNull();
    expect(resolveGrailedCategory({ title: 'Acme Wool Beanie' })).toBeNull();
    expect(resolveGrailedCategory({ title: 'Acme Chelsea Boots' })).toBeNull();
    expect(pathOf({ title: "Acme Men's Leather Gloves" })).toBe('Menswear > Accessories > Gloves & Scarves');
  });

  it('words that are fashion words in another sense do not map (a first name, a rod, a rack)', () => {
    expect(resolveGrailedCategory({ title: "Acme Jean Paul Men's Shirt" })).toBeNull();
    expect(resolveGrailedCategory({ title: 'Acme Tie Rod End' })).toBeNull();
    expect(resolveGrailedCategory({ title: "Acme Men's Boot Scraper Cast Iron" })).toBeNull();
  });

  it('polo only counts when it is a polo shirt, not a brand word on another garment', () => {
    expect(pathOf({ title: "Acme Men's Polo Shirt" })).toBe('Menswear > Tops > Polos');
    expect(pathOf({ title: "Polo Acme Men's Hoodie" })).toBe('Menswear > Tops > Sweatshirts & Hoodies');
  });
});

describe('grailedCategoryResolver: a sample across the fashion family', () => {
  it('maps tops, bottoms, outerwear, footwear, tailoring, accessories, bags and jewelry', () => {
    expect(pathOf({ title: "Acme Men's Flannel Button Down Shirt" })).toBe('Menswear > Tops > Shirts (Button Ups)');
    expect(pathOf({ title: "Acme Women's Silk Blouse" })).toBe('Womenswear > Tops > Blouses');
    expect(pathOf({ title: "Acme Men's Wool Sweater" })).toBe('Menswear > Tops > Sweaters & Knitwear');
    expect(pathOf({ title: "Acme Men's Cargo Shorts" })).toBe('Menswear > Bottoms > Shorts');
    expect(pathOf({ title: "Acme Women's Black Leggings" })).toBe('Womenswear > Bottoms > Leggings');
    expect(pathOf({ title: "Acme Men's Denim Jacket" })).toBe('Menswear > Outerwear > Denim Jackets');
    expect(pathOf({ title: "Acme Women's Puffer Jacket" })).toBe('Womenswear > Outerwear > Down Jackets');
    expect(pathOf({ title: "Acme Men's Navy Blazer" })).toBe('Menswear > Tailoring > Blazers');
    expect(pathOf({ title: "Acme Women's Black Blazer" })).toBe('Womenswear > Outerwear > Blazers');
    expect(pathOf({ title: "Acme Men's Oxford Dress Shoes" })).toBe('Menswear > Footwear > Formal Shoes');
    expect(pathOf({ title: "Acme Women's Red Heels" })).toBe('Womenswear > Footwear > Heels');
    expect(pathOf({ title: "Acme Men's Leather Wallet" })).toBe('Menswear > Accessories > Wallets');
    expect(pathOf({ title: "Acme Women's Gold Earrings" })).toBe('Womenswear > Jewelry > Earrings');
    expect(pathOf({ title: "Acme Men's Silver Bracelet" })).toBe('Menswear > Accessories > Jewelry & Watches');
    expect(pathOf({ title: "Acme Men's Dive Watch" })).toBe('Menswear > Accessories > Jewelry & Watches');
    expect(pathOf({ title: "Acme Women's Dress Watch Gold" })).toBe('Womenswear > Accessories > Watches');
  });

  it('every Grailed leaf title, with its department word, resolves to a leaf of that department or to null', () => {
    const wrong: string[] = [];
    for (const id of grailedAllLeafIds()) {
      const n = GRAILED_NODES.get(id)!;
      const word = n.department === 'men' ? 'Mens' : 'Womens';
      const r = resolveGrailedCategory({ title: word + ' ' + n.title });
      if (r && GRAILED_NODES.get(r.id)!.department !== n.department) wrong.push(word + ' ' + n.title + ' => ' + r.pathText);
    }
    expect(wrong).toEqual([]);
  });
});

describe('grailed catalog tree + mapping integrity', () => {
  it('the tree has the expected shape', () => {
    expect(GRAILED_NODES.size).toBe(142);
    expect(grailedAllLeafIds().length).toBe(128);
    const top = Array.from(GRAILED_NODES.values()).filter((n) => n.parentId === '');
    expect(top.length).toBe(14);
    expect(top.filter((n) => n.department === 'men').length).toBe(6);
    expect(top.filter((n) => n.department === 'women').length).toBe(8);
    expect(GRAILED_DEPARTMENT_TITLES).toEqual({ men: 'Menswear', women: 'Womenswear' });
    expect(isGrailedLeaf('menswear:tops.sweatshirts_hoodies')).toBe(true);
    expect(isGrailedLeaf('menswear:tops')).toBe(false); // "Tops" is a Category, not a Sub-category
    expect(isGrailedLeaf('nope')).toBe(false);
  });

  it('every id is prefixed with its department and every leaf path is [Department, Category, Sub-category]', () => {
    const bad: string[] = [];
    for (const n of Array.from(GRAILED_NODES.values())) {
      const prefix = n.department === 'men' ? 'menswear:' : 'womenswear:';
      if (n.id.indexOf(prefix) !== 0) bad.push('prefix ' + n.id);
      if (n.childIds.length === 0) {
        const parts = grailedPathText(n.id).split(' > ');
        if (parts.length !== 3) bad.push('depth ' + n.id);
        if (parts[0] !== GRAILED_DEPARTMENT_TITLES[n.department]) bad.push('department ' + n.id);
      }
      if (n.parentId !== '' && !GRAILED_NODES.has(n.parentId)) bad.push('parent ' + n.id);
    }
    expect(bad).toEqual([]);
    expect(grailedPathText('menswear:tops.sweatshirts_hoodies')).toBe('Menswear > Tops > Sweatshirts & Hoodies');
    expect(grailedPathText('womenswear:womens_bags_luggage.crossbody_bags')).toBe('Womenswear > Bags & Luggage > Crossbody Bags');
  });

  function collectTargets(): Array<{ where: string; id: unknown; dept: string }> {
    const out: Array<{ where: string; id: unknown; dept: string }> = [];
    const addTarget = (where: string, t: unknown, entryDept: string): void => {
      if (t === null || t === undefined) return;
      if (typeof t === 'string') { out.push({ where, id: t, dept: entryDept }); return; }
      const mp = t as Record<string, unknown>;
      for (const k of Object.keys(mp)) {
        if (mp[k] === null || mp[k] === undefined) continue;
        out.push({ where: where + '.' + k, id: mp[k], dept: k });
      }
    };
    for (const k of Object.keys(GRAILED_CURATED_BY_EBAY_ID)) {
      const e = GRAILED_CURATED_BY_EBAY_ID[k];
      for (const [, tgt] of e.split || []) addTarget('curated ' + k + ' split', tgt, e.dept || 'any');
      addTarget('curated ' + k, e.target, e.dept || 'any');
    }
    for (const r of GRAILED_RULES) addTarget('rule ' + r.id, r.target, 'any');
    return out;
  }

  it('every curated and rule target exists in the tree and is a leaf', () => {
    const bad = collectTargets().filter((x) => typeof x.id !== 'string' || !GRAILED_NODES.has(x.id as string) || !isGrailedLeaf(x.id as string));
    expect(bad).toEqual([]);
  });

  it('department-map targets point into the matching department', () => {
    const mismatches: string[] = [];
    for (const x of collectTargets()) {
      const node = GRAILED_NODES.get(x.id as string);
      if (!node) continue;
      if (x.dept === 'men' && node.department !== 'men') mismatches.push(x.where + ' ' + String(x.id));
      if (x.dept === 'women' && node.department !== 'women') mismatches.push(x.where + ' ' + String(x.id));
    }
    expect(mismatches).toEqual([]);
  });

  it('a curated entry with a department only targets leaves of that department (or a department map)', () => {
    const bad: string[] = [];
    for (const k of Object.keys(GRAILED_CURATED_BY_EBAY_ID)) {
      const e = GRAILED_CURATED_BY_EBAY_ID[k];
      if (!e.dept || typeof e.target !== 'string') continue;
      const node = GRAILED_NODES.get(e.target);
      if (!node || node.department !== e.dept) bad.push(k);
    }
    expect(bad).toEqual([]);
  });

  it('rule ids are unique and every pattern compiles', () => {
    const seen = new Set<string>();
    const dup: string[] = [];
    const broken: string[] = [];
    const all: Array<[string, string]> = [];
    for (const r of GRAILED_RULES) {
      if (seen.has(r.id)) dup.push(r.id);
      seen.add(r.id);
      for (const p of [...r.all, ...(r.none || [])]) all.push([r.id, p]);
    }
    for (const k of Object.keys(GRAILED_CURATED_BY_EBAY_ID)) {
      for (const [p] of GRAILED_CURATED_BY_EBAY_ID[k].split || []) all.push(['curated ' + k, p]);
    }
    for (const [id, p] of all) {
      const body = p.replace(/^(cat|title|desc):/, '');
      try { new RegExp('\\b(?:' + body + ')\\b'); } catch (e) { broken.push(id + ': ' + p.slice(0, 40)); }
    }
    expect(dup).toEqual([]);
    expect(broken).toEqual([]);
  });

  it('curated eBay ids are plain numeric strings', () => {
    const bad = Object.keys(GRAILED_CURATED_BY_EBAY_ID).filter((k) => !/^[0-9]+$/.test(k));
    expect(bad).toEqual([]);
  });
});

describe('grailedCategoryResolver: singular and plural both match (dropped-singular regex class)', () => {
  // Patterns are compiled as \b(?:body)\b, so "boxes?" matches "boxe"/"boxes" but NEVER "box". Every word whose
  // plural adds -es (x/ch/sh/ss/z), -ies (y words) or -ves (f/fe words) needs the (?:es)? / (?:y|ies) / (?:f|ves) form.
  // All titles are synthetic.
  const PAIRS: Array<[string, string, string | null]> = [
    ['Mens Chino Pants pants press', 'Mens Chino Pants pants presses', null],
    ['Mens Graphic Tee Shirt tee box', 'Mens Graphic Tee Shirt tee boxes', null],
  ];
  for (const [singular, plural, expected] of PAIRS) {
    it('"' + singular + '" and "' + plural + '" resolve identically', () => {
      expect(idOf({ title: singular })).toBe(expected);
      expect(idOf({ title: plural })).toBe(expected);
    });
  }

  it('the plain garment titles still resolve (the pairs above are blank because of the exclusion, not by accident)', () => {
    expect(idOf({ title: 'Mens Chino Pants' })).toBe('menswear:bottoms.casual_pants');
    expect(idOf({ title: 'Mens Graphic Tee Shirt' })).toBe('menswear:tops.short_sleeve_shirts');
  });

  // Words whose SINGULAR genuinely ends in -e / -ie, so a bare "s?" is already correct (axe, glaze, hoodie, ...).
  const ALLOWED = new Set<string>([
    'beanies?',
    'hoodies?',
    'neckties?',
    'scrunchies?',
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
    for (const r of GRAILED_RULES) all.push(...r.all, ...(r.none || []));
    for (const k of Object.keys(GRAILED_CURATED_BY_EBAY_ID)) {
      const e: any = GRAILED_CURATED_BY_EBAY_ID[k];
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
