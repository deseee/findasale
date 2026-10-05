/**
 * (S-EXT-VINTED-CATEGORY-MAP, 2026-10-04) Vinted category resolver + data integrity.
 *
 * Root cause this pins: the Chrome extension used to fuzzy-search Vinted's category picker with
 * generic words from Item.category, so a youth baseball glove landed in a generic "Gloves" leaf
 * instead of Sports > Team sports > Baseball & softball > Baseball & softball gloves (leaf 4535).
 * The backend now resolves ONE leaf id + full path per item and the extension opens exactly that.
 *
 * Pure unit test: the resolver and the two config files have no imports beyond each other, so
 * nothing is mocked. NOT EXECUTED under jest when written (jest cannot run on the authoring
 * machine -- see dev-environment skill). The same assertions were executed there against a
 * minimal describe/it/expect shim using Node's TypeScript stripping; CI is the real gate.
 */
import { resolveVintedCategory, explainVintedCategory, inferVintedDepartment, normalizeVintedText } from '../vintedCategoryResolver';
import { VINTED_NODES, VINTED_ROOT_IDS, isVintedLeaf, vintedAllLeafIds } from '../../config/vintedCatalogTree';
import { VINTED_CURATED_BY_EBAY_ID, VINTED_RULES } from '../../config/vintedCategoryMap';

const GLOVE_PATH = 'Sports > Team sports > Baseball & softball > Baseball & softball gloves';

function leafOf(input: Parameters<typeof resolveVintedCategory>[0]): number | null {
  const r = resolveVintedCategory(input);
  return r ? r.leafId : null;
}

describe('vintedCategoryResolver: the youth baseball glove (the original bug)', () => {
  it('title alone resolves to leaf 4535 with the full path', () => {
    const r = resolveVintedCategory({ title: 'Rawlings youth 10.5 inch baseball glove' });
    expect(r).not.toBeNull();
    expect(r!.leafId).toBe(4535);
    expect(r!.pathText).toBe(GLOVE_PATH);
    expect(r!.path).toEqual(['Sports', 'Team sports', 'Baseball & softball', 'Baseball & softball gloves']);
  });

  it('resolves the same leaf for every eBay category wording seen in production', () => {
    const title = 'Rawlings youth 10.5 inch baseball glove';
    expect(leafOf({ title, ebayCategoryName: 'Baseball & Softball Gloves & Mitts' })).toBe(4535);
    expect(leafOf({ title, ebayCategoryName: 'Baseball &amp; Softball Gloves &amp; Mitts' })).toBe(4535);
    expect(leafOf({ title, categoryBreadcrumb: 'Sporting Goods:Baseball & Softball:Gloves & Mitts' })).toBe(4535);
    expect(leafOf({ title, ebayCategoryName: 'Gloves & Mitts', categoryBreadcrumb: 'Sporting Goods:Baseball & Softball:Gloves & Mitts' })).toBe(4535);
  });

  it('uses the curated eBay id first and still lands on 4535', () => {
    const x = explainVintedCategory({ title: 'Rawlings youth 10.5 inch baseball glove', ebayCategoryId: '16030', ebayCategoryName: 'Gloves & Mitts' });
    expect(x.result!.leafId).toBe(4535);
    expect(x.result!.source).toBe('CURATED_ID');
  });

  it('a softball glove also lands on the baseball and softball gloves leaf', () => {
    expect(leafOf({ title: 'Wilson A500 12 inch youth softball glove', categoryBreadcrumb: 'Sporting Goods:Baseball & Softball:Gloves & Mitts' })).toBe(4535);
  });
});

describe('vintedCategoryResolver: null on ambiguous input (never a random leaf)', () => {
  it('"Gloves" alone with no department does not resolve to any glove leaf', () => {
    expect(resolveVintedCategory({ title: 'Gloves' })).toBeNull();
    expect(resolveVintedCategory({ title: 'Gloves', ebayCategoryName: 'Gloves' })).toBeNull();
    const x = explainVintedCategory({ title: 'Gloves' });
    expect(x.reason).toBe('department-unknown');
  });

  it('empty and meaningless input is null, not a guess', () => {
    expect(resolveVintedCategory({})).toBeNull();
    expect(resolveVintedCategory({ title: '' })).toBeNull();
    expect(resolveVintedCategory({ title: 'Mysterious thing' })).toBeNull();
    expect(resolveVintedCategory({ title: null, description: null, brand: null })).toBeNull();
  });
});

describe('vintedCategoryResolver: regressions', () => {
  it('a comic book is filed under Comics, not Magazines', () => {
    const r = resolveVintedCategory({ title: 'Amazing Spider-Man #300 Marvel comic book', categoryBreadcrumb: 'Collectibles:Comic Books' });
    expect(r!.pathText).toBe('Books & Media > Books > Comics, manga & graphic novels');
    expect(r!.pathText).not.toContain('Magazines');
  });

  it('a magazine stays a magazine even with a game title in it', () => {
    const r = resolveVintedCategory({ title: 'Nintendo Power Magazine Vol 69 1995', ebayCategoryId: '280', ebayCategoryName: 'Magazines' });
    expect(r!.pathText).toBe('Books & Media > Magazines');
    // no eBay id: a magazine that mentions a comic in its title must still not become a comic
    const noId = resolveVintedCategory({ title: 'Nintendo Power Mag. Hybrid Heaven Vol#123 Aug 99-Pokemon Comic & stickers', categoryBreadcrumb: 'Books & Magazines:magazines', ebayCategoryName: 'Magazines' });
    expect(noId!.pathText).toBe('Books & Media > Magazines');
  });

  it('a metal advertising sign is a wall decor sign', () => {
    const r = resolveVintedCategory({ title: 'Vintage Camel Cigarette Metal Sign', ebayCategoryName: 'Signs' });
    expect(r!.pathText).toBe('Home > Home accessories > Wall decor > Signs');
  });

  it('trading cards go to trading cards, singles vs lots', () => {
    expect(leafOf({ title: 'Pokemon Charizard Holo 1st Edition Card', ebayCategoryId: '183454', ebayCategoryName: 'Individual Trading Cards' })).toBe(4875);
    expect(leafOf({ title: 'Magic the Gathering Lightning Bolt', ebayCategoryName: 'CCG Individual Cards' })).toBe(4875);
    expect(leafOf({ title: 'Topps 1989 Baseball Cards Lot', ebayCategoryName: 'Sports Trading Cards' })).toBe(4879);
  });

  it('Hockey-NHL (24510) is sports MEMORABILIA, never ice hockey equipment', () => {
    const r = resolveVintedCategory({ title: 'Detroit Red Wings Stanley Cup Commemorative Puck', ebayCategoryId: '24510', ebayCategoryName: 'Hockey-NHL' });
    expect(r!.leafId).toBe(4902);
    expect(r!.pathText).toContain('Memorabilia');
    // a real hockey stick is equipment
    const stick = resolveVintedCategory({ title: 'CCM Ice Hockey Stick Senior', categoryBreadcrumb: 'Sporting Goods:Ice Hockey' });
    expect(stick!.pathText).toBe('Sports > Winter sports > Ice hockey > Ice hockey sticks');
  });

  it('tracksuits resolve to the stated department, otherwise null', () => {
    expect(leafOf({ title: "Adidas Originals Men's Neon Yellow Tracksuit Set, Size M", ebayCategoryName: 'Tracksuits & Sets' })).toBe(582);
    expect(leafOf({ title: "Adidas Originals Women's Tracksuit Set, Size M", ebayCategoryName: 'Tracksuits & Sets' })).toBe(572);
    expect(leafOf({ title: 'Boys Nike tracksuit 8-10', ebayCategoryName: 'Tracksuits & Sets' })).toBe(1204);
    expect(leafOf({ title: 'Adidas Originals Neon Yellow Tracksuit Set, Size M', ebayCategoryName: 'Tracksuits & Sets' })).toBeNull();
  });

  it('deliberate blanks stay blank: test rows, industrial parts, adult bicycles', () => {
    expect(explainVintedCategory({ title: 'Test Prod 2', ebayCategoryName: 'Other' }).stage).toBe('blank');
    expect(explainVintedCategory({ title: 'Pipe fitting elbow 1/2 inch', ebayCategoryName: 'Pipe Fittings' }).stage).toBe('blank');
    expect(explainVintedCategory({ title: 'Trek mountain bike 26 inch', ebayCategoryName: 'Bicycles' }).stage).toBe('blank');
  });
});

describe('vintedCategoryResolver: department rules', () => {
  it('reads the department from explicit words only', () => {
    expect(inferVintedDepartment(normalizeVintedText("Levi's Women's Skinny Jeans"))).toBe('women');
    expect(inferVintedDepartment(normalizeVintedText("Men's Graphic Tee"))).toBe('men');
    expect(inferVintedDepartment(normalizeVintedText('Girls floral dress'))).toBe('girls');
    expect(inferVintedDepartment(normalizeVintedText('Boys cargo shorts'))).toBe('boys');
    expect(inferVintedDepartment(normalizeVintedText('Levis 501 jeans size 32'))).toBeNull();
    // contradictory words are not a department
    expect(inferVintedDepartment(normalizeVintedText('Mens and womens unisex hoodie'))).toBeNull();
  });

  it('a department-split leaf is chosen only when the department is stated', () => {
    expect(leafOf({ title: "Levi's 501 Women's Skinny Jeans", ebayCategoryName: "Women's Jeans" })).toBe(1844);
    expect(leafOf({ title: 'Levis 501 jeans size 32', ebayCategoryName: 'Jeans' })).toBeNull();
  });

  it('a curated eBay id that needs a department returns null without one, and a leaf with one', () => {
    const none = explainVintedCategory({ title: 'Graphic T-Shirt, Black Cotton', ebayCategoryId: '15687', ebayCategoryName: 'T-Shirts' });
    expect(none.result).toBeNull();
    expect(none.reason).toBe('department-unknown');
    const men = resolveVintedCategory({ title: "Men's Graphic T-Shirt, Black Cotton", ebayCategoryId: '15687', ebayCategoryName: 'T-Shirts' });
    expect(men!.leafId).toBe(1807);
    expect(men!.pathText.indexOf('Men > ')).toBe(0);
  });
});

describe('vintedCategoryResolver: rule layer on items WITHOUT an eBay category id (audit false positives, fixed)', () => {
  it('an Eisenhower dollar with a "Coins & Paper Money" breadcrumb is a coin, not a banknote', () => {
    const r = resolveVintedCategory({ title: '1971 D Eisenhower Dollar Circulated US Mint Coin Ike !', categoryBreadcrumb: 'Coins & Paper Money:coins: Us:dollars:eisenhower (1971-78)' });
    expect(r!.pathText).toBe('Hobbies & collectibles > Coins & banknotes > Coins');
  });

  it('a golf club set whose title says "Good Grips" and "Steel" is golf clubs, not aquarium gear', () => {
    const r = resolveVintedCategory({
      title: 'Vtg Walter Hagen HAIG-Ultra Woods 1,3,4,5 & Irons Set 2-P Steel  RH Good Grips',
      ebayCategoryName: 'Golf Clubs',
      categoryBreadcrumb: 'Sporting Goods:golf:golf Clubs & Equipment:golf Clubs',
    });
    expect(r!.leafId).toBe(4473);
    expect(r!.pathText).toBe('Sports > Golf > Golf clubs');
  });

  it('a mallet putter is a golf club, not a hammer', () => {
    expect(leafOf({ title: 'Wilson ProStaff Mallet Putter, Steel Shaft', ebayCategoryName: 'Golf Clubs', brand: 'Wilson' })).toBe(4473);
  });

  it('a chromatic guitar tuner is a tuner, not a guitar part', () => {
    const r = resolveVintedCategory({ title: 'Q12E Chromatic Guitar Tuner, Exogenic Tuning, Vintage', ebayCategoryName: 'Tuners' });
    expect(r!.pathText).toContain('Musical instrument tuners');
  });
});

describe('vinted catalog tree + mapping integrity', () => {
  it('the tree has the expected shape', () => {
    expect(VINTED_NODES.size).toBe(2899);
    expect(vintedAllLeafIds().length).toBe(2480);
    expect(Object.keys(VINTED_ROOT_IDS).length).toBeGreaterThanOrEqual(9);
    expect(isVintedLeaf(4535)).toBe(true);
    expect(isVintedLeaf(4492)).toBe(false); // "Baseball & softball" is a branch
  });

  function collectTargets(): Array<{ where: string; id: unknown }> {
    const out: Array<{ where: string; id: unknown }> = [];
    const addTarget = (where: string, t: unknown): void => {
      if (t === null || t === undefined) return;
      if (typeof t === 'number') { out.push({ where, id: t }); return; }
      const m = t as Record<string, unknown>;
      for (const k of Object.keys(m)) out.push({ where: where + '.' + k, id: m[k] });
    };
    for (const k of Object.keys(VINTED_CURATED_BY_EBAY_ID)) {
      const e: any = VINTED_CURATED_BY_EBAY_ID[k];
      if (e && typeof e === 'object' && 'split' in e) {
        for (const [, tgt] of e.split) addTarget('curated ' + k, tgt);
        addTarget('curated ' + k + ' fallback', e.fallback);
      } else addTarget('curated ' + k, e);
    }
    for (const r of VINTED_RULES) addTarget('rule ' + r.id, r.target);
    return out;
  }

  it('every curated and rule target exists in the tree and is a leaf', () => {
    const bad = collectTargets().filter((x) => typeof x.id !== 'number' || !VINTED_NODES.has(x.id as number) || !isVintedLeaf(x.id as number));
    expect(bad).toEqual([]);
  });

  it('department targets point into the matching department', () => {
    const wanted: Record<string, string> = { women: 'Women', men: 'Men', girls: 'Girls', boys: 'Boys' };
    const mismatches: string[] = [];
    for (const r of VINTED_RULES) {
      const t: any = r.target;
      if (!t || typeof t !== 'object') continue;
      for (const k of Object.keys(wanted)) {
        if (typeof t[k] !== 'number') continue;
        const node = VINTED_NODES.get(t[k] as number);
        if (!node) continue;
        const path = explainPath(t[k] as number);
        const ok = k === 'women' ? path.indexOf('Women') === 0 : k === 'men' ? path.indexOf('Men') === 0 : path.indexOf(wanted[k]) !== -1;
        if (!ok) mismatches.push(r.id + ' ' + k + ' ' + path);
      }
    }
    expect(mismatches).toEqual([]);
  });

  function explainPath(id: number): string {
    const parts: string[] = [];
    let cur = VINTED_NODES.get(id);
    while (cur) {
      parts.unshift(cur.title);
      cur = cur.parentId ? VINTED_NODES.get(cur.parentId) : undefined;
    }
    return parts.join(' > ');
  }

  it('rule ids are unique and every pattern compiles', () => {
    const seen = new Set<string>();
    const dup: string[] = [];
    const broken: string[] = [];
    for (const r of VINTED_RULES) {
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
    const bad = Object.keys(VINTED_CURATED_BY_EBAY_ID).filter((k) => !/^[0-9]+$/.test(k));
    expect(bad).toEqual([]);
  });
});
