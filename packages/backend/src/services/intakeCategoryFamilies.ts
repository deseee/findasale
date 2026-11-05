/**
 * intakeCategoryFamilies.ts -- category-family table for the item-intake pipeline (2026-11-05).
 *
 * Why: an audit of 316 live items found the same category-specific gaps again and again (vinyl with no
 * vinyl/jacket grade, cards with no back photo, coins with no mint mark, golf clubs with no handedness,
 * clothing with no size, a single comic weighed at 16 oz). This module is the single table those checks
 * read from. Pure (no I/O, no imports with side effects) so it is cheap to unit test and safe to import
 * from the tagging service, the rapidfire job and the eligibility rules.
 *
 * Used by:
 *   - cloudAIService (pass-1 prompt: required facts per family + a hint when Vision already suggests one)
 *   - intakeVerifyPass (pass-2 prompt: required shots to check)
 *   - intakeReview (deterministic required-fact / missing-photo notes, weight bounds)
 *   - marketplaceEligibilityRules (collectible families are not suggested for Poshmark/Vinted new listings)
 */

export type CategoryFamily =
  | 'VINYL_RECORD'
  | 'TRADING_CARD'
  | 'COIN_CURRENCY'
  | 'COMIC'
  | 'VIDEO_GAME'
  | 'GOLF_CLUB'
  | 'BOOK'
  | 'CLOTHING_SHOES'
  | 'ELECTRONICS';

export interface RequiredFact {
  /** Stable id used in review notes. */
  id: string;
  /** Short label shown to the organizer ("Size"). */
  label: string;
  /** Prompt line telling the model what to state. */
  promptHint: string;
  /** Evidence regex over title + description (case-insensitive). Missing match -> "missing fact" note. */
  evidence: RegExp;
}

export interface RequiredShot {
  id: string;
  /** Organizer-facing label, e.g. "the back of the card". */
  label: string;
  /** Photos needed before this shot can possibly be present (a front-only listing has 1 photo). */
  minPhotos: number;
}

export interface CategoryFamilySpec {
  family: CategoryFamily;
  label: string;
  /** Collectibles sell on eBay; low-value shippable collectibles do not sell on fashion-led markets. */
  collectible: boolean;
  requiredFacts: RequiredFact[];
  requiredShots: RequiredShot[];
  /** Plausible PACKED weight for ONE unit, ounces. Omitted when the family is too varied to bound. */
  singleUnitWeightOz?: { min: number; max: number };
  /** Photos must be sharp enough to read fine detail (grade, mint mark). Low Vision quality -> note. */
  needsSharpPhotos?: boolean;
}

// Shared evidence fragments.
const GRADE_WORDS = '(mint|near mint|nm|vg\\+?|vg|very good|good|fair|poor|ex|excellent|g\\+|m-|nm-|ex\\+)';

export const CATEGORY_FAMILY_TABLE: Readonly<Record<CategoryFamily, CategoryFamilySpec>> = {
  VINYL_RECORD: {
    family: 'VINYL_RECORD',
    label: 'Vinyl record',
    collectible: true,
    requiredFacts: [
      {
        id: 'vinyl_grade',
        label: 'Vinyl grade',
        promptHint: 'a separate grade for the vinyl itself (Goldmine scale: M, NM, VG+, VG, G+, G, F, P)',
        evidence: new RegExp(`\\b(vinyl|disc|record|media)\\b[^.]{0,40}\\b${GRADE_WORDS}\\b|\\b${GRADE_WORDS}\\b[^.]{0,20}\\b(vinyl|disc|record|media)\\b`, 'i'),
      },
      {
        id: 'jacket_grade',
        label: 'Jacket grade',
        promptHint: 'a separate grade for the jacket/sleeve (ring wear, seam splits, writing)',
        evidence: /\b(jacket|sleeve|cover)\b/i,
      },
      {
        id: 'label_catalog',
        label: 'Record label and catalog number',
        promptHint: 'the record label and catalog number exactly as printed',
        evidence: /\b(cat(alog)?\.?\s*(no\.?|#|number)|label)\b|\b[A-Z]{1,5}[- ]?\d{2,6}\b/,
      },
      {
        id: 'play_tested',
        label: 'Play tested or not',
        promptHint: 'whether it was play tested (say "not play tested" when you cannot know)',
        evidence: /\b(play[- ]?tested|not (been )?play[- ]?tested|untested|plays (well|great|through))\b/i,
      },
    ],
    requiredShots: [
      { id: 'vinyl_disc', label: 'the record itself out of the sleeve', minPhotos: 2 },
      { id: 'vinyl_label', label: 'the center label', minPhotos: 2 },
    ],
    singleUnitWeightOz: { min: 12, max: 24 },
  },
  TRADING_CARD: {
    family: 'TRADING_CARD',
    label: 'Trading card',
    collectible: true,
    requiredFacts: [
      { id: 'card_set', label: 'Set', promptHint: 'the set name (only if printed)', evidence: /\b(set|series|edition|base|expansion|\d{4}\s+[A-Z][a-z]+)\b/ },
      { id: 'card_number', label: 'Card number', promptHint: 'the card number as printed (e.g. 138/195 or #25)', evidence: /(#\s?\d+|\b\d{1,4}\s?\/\s?\d{1,4}\b|\bno\.?\s?\d+)/i },
      { id: 'card_grade', label: 'Graded or raw', promptHint: 'graded (grader + grade from the slab label) or raw', evidence: /\b(raw|ungraded|psa|bgs|beckett|cgc|sgc|graded|slab)\b/i },
      { id: 'card_corners', label: 'Corners and edges', promptHint: 'corner and edge condition (whitening, dings, soft corners)', evidence: /\b(corner|edge|whitening|ding|centering)s?\b/i },
    ],
    requiredShots: [
      { id: 'card_back', label: 'the back of the card', minPhotos: 2 },
    ],
    singleUnitWeightOz: { min: 1, max: 3 },
    needsSharpPhotos: true,
  },
  COIN_CURRENCY: {
    family: 'COIN_CURRENCY',
    label: 'Coin or currency',
    collectible: true,
    requiredFacts: [
      { id: 'coin_year', label: 'Year', promptHint: 'the year as struck/printed', evidence: /\b(1[6-9]\d\d|20[0-4]\d)\b/ },
      { id: 'coin_mint', label: 'Mint mark', promptHint: 'the mint mark (P, D, S, CC, O, W) or "no mint mark"', // Case-sensitive on purpose: "1970s" must not read as a 1970-S mint mark.
        evidence: /\b([Mm]int ?[Mm]ark|[Nn]o mint mark|Philadelphia|Denver|San Francisco|Carson City|New Orleans|West Point)\b|\b\d{4}\s?-?\s?(P|D|S|CC|O|W)\b/ },
      { id: 'coin_composition', label: 'Composition', promptHint: 'composition (90% silver, 40% silver, copper-nickel clad, copper, etc.)', evidence: /\b(silver|clad|copper|nickel|gold|bronze|zinc|steel|brass|composition|paper)\b/i },
    ],
    requiredShots: [
      { id: 'coin_obverse_reverse', label: 'both sides, in focus', minPhotos: 2 },
    ],
    singleUnitWeightOz: { min: 1, max: 6 },
    needsSharpPhotos: true,
  },
  COMIC: {
    family: 'COMIC',
    label: 'Comic book',
    collectible: true,
    requiredFacts: [
      { id: 'comic_issue', label: 'Issue number', promptHint: 'title and issue number(s) exactly as on the covers', evidence: /(#\s?\d+|\bissue\b|\bno\.?\s?\d+|\bvol\.?\s?\d+)/i },
      { id: 'comic_publisher', label: 'Publisher', promptHint: 'publisher (Marvel, DC, Image, etc.) when printed', evidence: /\b(marvel|dc|image|dark horse|idw|archie|boom|dynamite|valiant|harvey|gold key|charlton|dell|publisher|comics)\b/i },
      { id: 'comic_condition', label: 'Condition details', promptHint: 'cover and spine condition (spine stress, creases, tears, bag and board)', evidence: /\b(spine|crease|tear|bag(ged)?|board(ed)?|cover|grade|cgc|nm|vf|fn|vg)\b/i },
    ],
    requiredShots: [
      { id: 'comic_back', label: 'the back cover', minPhotos: 2 },
    ],
    singleUnitWeightOz: { min: 3, max: 8 },
  },
  VIDEO_GAME: {
    family: 'VIDEO_GAME',
    label: 'Video game',
    collectible: true,
    requiredFacts: [
      { id: 'game_platform', label: 'Platform', promptHint: 'the platform/system exactly as printed (e.g. Neo Geo MVS, Super Nintendo)', evidence: /\b(nintendo|nes|snes|n64|gamecube|wii|switch|game ?boy|sega|genesis|saturn|dreamcast|playstation|ps[1-5]|xbox|atari|neo ?geo|mvs|aes|arcade|pc)\b/i },
      { id: 'game_contents', label: 'What is included', promptHint: 'what is included (cartridge/disc only, box, manual, inserts)', evidence: /\b(cart(ridge)?( only)?|disc( only)?|loose|complete|cib|box|manual|insert|case)\b/i },
      { id: 'game_tested', label: 'Tested or not', promptHint: 'whether it was tested working (say "untested" when you cannot know)', evidence: /\b(tested|untested|not tested|works|working)\b/i },
    ],
    requiredShots: [],
    singleUnitWeightOz: { min: 3, max: 40 },
  },
  GOLF_CLUB: {
    family: 'GOLF_CLUB',
    label: 'Golf club',
    collectible: false,
    requiredFacts: [
      { id: 'golf_hand', label: 'Handedness', promptHint: 'right or left handed (RH/LH)', evidence: /\b(right[- ]hand(ed)?|left[- ]hand(ed)?|rh|lh)\b/i },
      { id: 'golf_flex', label: 'Shaft flex', promptHint: 'shaft flex (L, A, R, S, X) and shaft material as printed', evidence: /\b(flex|regular|stiff|senior|ladies|extra stiff|graphite|steel)\b/i },
      { id: 'golf_loft', label: 'Club type or loft', promptHint: 'club type and loft/number (e.g. 7 iron, 56 degree wedge, 10.5 driver)', evidence: /\b(\d{1,2}(\.\d)?\s?(°|deg(ree)?s?)|\d\s?-?\s?iron|driver|putter|wedge|wood|hybrid|irons?)\b/i },
    ],
    requiredShots: [],
    singleUnitWeightOz: { min: 16, max: 96 },
  },
  BOOK: {
    family: 'BOOK',
    label: 'Book',
    collectible: false,
    requiredFacts: [
      { id: 'book_author', label: 'Author', promptHint: 'title and author exactly as printed', evidence: /\b(by|author|edited|ed\.)\b/i },
      { id: 'book_binding', label: 'Binding', promptHint: 'hardcover or paperback, and dust jacket present or not', evidence: /\b(hardcover|hardback|paperback|softcover|dust ?jacket|board|binding|spiral)\b/i },
      { id: 'book_edition', label: 'Edition or year', promptHint: 'edition/printing and year when printed on the copyright page or cover', evidence: /\b(edition|printing|\b1[5-9]\d\d\b|\b20[0-4]\d\b|reprint|first)\b/i },
    ],
    requiredShots: [],
    singleUnitWeightOz: { min: 6, max: 80 },
  },
  CLOTHING_SHOES: {
    family: 'CLOTHING_SHOES',
    label: 'Clothing or shoes',
    collectible: false,
    requiredFacts: [
      { id: 'clothing_size', label: 'Size', promptHint: 'tag size exactly as printed on the size tag', evidence: /\b(size|sz)\b|\b(xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl|one size|os)\b|\b\d{1,2}(\.5)?\s?(w|m|us|uk|eu)\b|\bw\d{2}\s?l\d{2}\b/i },
      { id: 'clothing_measurements', label: 'Measurements', promptHint: 'key flat measurements when visible (pit to pit, length, inseam, insole) or say they are not measured', evidence: /\b(pit to pit|p2p|chest|waist|inseam|length|insole|measure(ment)?s?|inches|in\.|cm)\b/i },
    ],
    requiredShots: [
      { id: 'clothing_tag', label: 'the size or brand tag', minPhotos: 2 },
    ],
    singleUnitWeightOz: { min: 4, max: 96 },
  },
  ELECTRONICS: {
    family: 'ELECTRONICS',
    label: 'Electronics',
    collectible: false,
    requiredFacts: [
      { id: 'electronics_model', label: 'Model number', promptHint: 'brand and model number exactly as printed on the label', evidence: /\b(model|m\/n|mn|part|p\/n)\b|\b[A-Z]{1,5}-?\d{2,6}[A-Z]?\b/ },
      { id: 'electronics_tested', label: 'Tested or not', promptHint: 'whether it was tested (powers on, fully tested, or untested / for parts)', evidence: /\b(tested|untested|not tested|powers on|works|working|for parts|as[- ]is)\b/i },
      { id: 'electronics_included', label: 'What is included', promptHint: 'what is included (power cord, remote, cables) and what is not', evidence: /\b(includ(es|ed|ing)|comes with|no (power )?(cord|cable|remote|adapter)|cord|cable|remote|adapter|only)\b/i },
    ],
    requiredShots: [],
  },
};

const FAMILY_ORDER: CategoryFamily[] = [
  'TRADING_CARD', 'VINYL_RECORD', 'COIN_CURRENCY', 'COMIC', 'VIDEO_GAME', 'GOLF_CLUB', 'BOOK', 'CLOTHING_SHOES', 'ELECTRONICS',
];

export interface FamilyDetectInput {
  category?: string | null;
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  /** Vision labels / OCR tokens (used for the pre-pass-1 hint). */
  labels?: string[] | null;
  recordIdentity?: { format?: unknown } | null;
  card?: unknown;
}

// Words that mean "a thing for X", never X itself.
const CARD_NOT_A_CARD = /\b(card table|greeting card|gift card|sd card|micro ?sd|memory card|graphics card|video card|sound card|card reader|card holder|card case|card stand|business card|playing cards?|cardboard|cardigan|recipe card|post ?card|credit card|sim card|network card)\b/i;
const COIN_ACCESSORY = /\b(coin (purse|bank|holder|tube|album|folder|sorter|counter|wrapper|operated|op)|coin[- ]op)\b/i;
const VINYL_NOT_RECORD = /\b(record player|turntable|vinyl (tablecloth|flooring|siding|fence|chair|seat|bag|jacket|pants|skirt|boots|banner|sticker|decal|tile|cover|wrap|record (storage|crate|cleaner|shelf|cabinet)))\b|\brecord (storage|crate|cleaner|shelf|cabinet|holder|rack)\b/i;
const CLOTHING_FIXTURE = /\b(rack|hanger|bracket|mannequin|display|fixture|grid|hook|garment bag|shoe rack|shoe horn|closet|organizer)\b/i;

function hasAny(text: string, re: RegExp): boolean {
  return re.test(text);
}

/**
 * Best-guess category family for an item. Returns null when no family fits. Never throws.
 * Order matters: a graded trading card wins over "collectible", a comic wins over "book".
 */
export function detectCategoryFamily(input: FamilyDetectInput): CategoryFamily | null {
  try {
    const category = (input.category || '').toLowerCase();
    const text = [input.title, input.description, ...(input.tags || []), ...(input.labels || [])]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' \n ')
      .toLowerCase();
    const titleTags = [input.title, ...(input.tags || [])].filter(Boolean).join(' ').toLowerCase();

    for (const family of FAMILY_ORDER) {
      switch (family) {
        case 'TRADING_CARD': {
          if (input.card && typeof input.card === 'object') return 'TRADING_CARD';
          if (category.includes('sports mem, cards') && /\bcards?\b/.test(titleTags) && !CARD_NOT_A_CARD.test(titleTags)) return 'TRADING_CARD';
          if (/\b(trading card|pokemon card|pok[eé]mon tcg|magic the gathering|mtg|yu-?gi-?oh|lorcana|one piece card|baseball card|football card|basketball card|hockey card|rookie card|tcg|psa \d|bgs \d|sgc \d)\b/.test(titleTags)
            && !CARD_NOT_A_CARD.test(titleTags)) return 'TRADING_CARD';
          break;
        }
        case 'VINYL_RECORD': {
          const fmt = String((input.recordIdentity as { format?: unknown } | null | undefined)?.format ?? '');
          if (['LP', '7in', '10in', '12in_single'].includes(fmt)) return 'VINYL_RECORD';
          if (VINYL_NOT_RECORD.test(titleTags)) break;
          if (/\b(vinyl (record|lp|album|single)|record album|lp record|\d{2} ?rpm|33 1\/3|vinyl lp)\b/.test(titleTags)) return 'VINYL_RECORD';
          if (category === 'music' && /\b(vinyl|lp|record|album|45)\b/.test(titleTags) && !/\b(cd|cassette|tape|8[- ]track)\b/.test(titleTags)) return 'VINYL_RECORD';
          break;
        }
        case 'COIN_CURRENCY': {
          if (COIN_ACCESSORY.test(titleTags)) break;
          if (category === 'coins & paper money') return 'COIN_CURRENCY';
          if (/\b(coins?|morgan dollar|peace dollar|eisenhower dollar|ike dollar|half dollar|silver dollar|wheat (penny|cent)|indian head (penny|cent)|buffalo nickel|mercury dime|barber (dime|quarter|half)|proof set|mint set|banknote|silver certificate|paper money|gold certificate)\b/.test(titleTags)) return 'COIN_CURRENCY';
          break;
        }
        case 'COMIC': {
          if (/\b(comic book|comic books|comics|comic)\b/.test(titleTags) && !/\b(comic strip art|comic sans|comic-con badge)\b/.test(titleTags)) return 'COMIC';
          break;
        }
        case 'VIDEO_GAME': {
          if (category === 'video games & consoles') return 'VIDEO_GAME';
          if (/\b(video game|game cartridge|mvs cart|neo ?geo|arcade (game|cart|board|pcb)|game manual|instruction (booklet|manual)\b.*\b(nintendo|sega|atari|playstation|xbox)|nintendo|super nintendo|snes|sega genesis|atari 2600|playstation|xbox|game ?boy|n64|gamecube)\b/.test(titleTags)) return 'VIDEO_GAME';
          break;
        }
        case 'GOLF_CLUB': {
          if (/\bgolf\b/.test(text) && /\b(club|clubs|iron|irons|putter|wedge|driver|fairway|wood|hybrid)\b/.test(titleTags)) return 'GOLF_CLUB';
          if (/\bputter\b/.test(titleTags)) return 'GOLF_CLUB';
          break;
        }
        case 'BOOK': {
          if (category === 'books & magazines' && !/\b(magazine|comic)\b/.test(titleTags)) return 'BOOK';
          if (/\b(hardcover|paperback|first edition|novel|cookbook)\b/.test(titleTags)) return 'BOOK';
          break;
        }
        case 'CLOTHING_SHOES': {
          if (CLOTHING_FIXTURE.test(titleTags)) break;
          if (category === 'clothing, shoes & accessories') return 'CLOTHING_SHOES';
          if (/\b(shirt|t-shirt|tee shirt|blouse|jacket|coat|dress|jeans|pants|trousers|shorts|skirt|sweater|hoodie|sweatshirt|cardigan|blazer|vest|shoes|sneakers|boots|sandals|heels|loafers)\b/.test(titleTags)) return 'CLOTHING_SHOES';
          break;
        }
        case 'ELECTRONICS': {
          if (['consumer electronics', 'computers/tablets & networking', 'cell phones & accessories', 'cameras & photo'].includes(category)) return 'ELECTRONICS';
          break;
        }
        default:
          break;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function getCategoryFamilySpec(family: CategoryFamily | null | undefined): CategoryFamilySpec | null {
  if (!family) return null;
  return CATEGORY_FAMILY_TABLE[family] ?? null;
}

export function isCollectibleFamily(family: CategoryFamily | null | undefined): boolean {
  return !!getCategoryFamilySpec(family)?.collectible;
}

/**
 * Pass-1 prompt block: the required facts for every family (compact), with the family Vision already
 * suggests (if any) marked. Cheap (about 300 tokens) and does not depend on guessing the family first.
 */
export function buildCategoryFactsPrompt(hintFamily?: CategoryFamily | null): string {
  const lines: string[] = [];
  for (const family of FAMILY_ORDER) {
    const spec = CATEGORY_FAMILY_TABLE[family];
    const facts = spec.requiredFacts.map((f) => f.promptHint).join('; ');
    lines.push(`- ${spec.label}${family === hintFamily ? ' (the photos look like this kind of item)' : ''}: ${facts}.`);
  }
  return `\nCategory-specific facts: when the item is one of these kinds, the description MUST state each listed fact. If a fact cannot be read or judged from the photos, say so plainly (e.g. "not play tested", "size tag not visible") instead of guessing or leaving it out:\n${lines.join('\n')}`;
}

/** Text (title + description) is missing these facts for the family. */
export function findMissingFacts(family: CategoryFamily | null | undefined, title: string | null | undefined, description: string | null | undefined): RequiredFact[] {
  const spec = getCategoryFamilySpec(family);
  if (!spec) return [];
  const text = `${title || ''}\n${description || ''}`;
  if (!text.trim()) return [...spec.requiredFacts];
  return spec.requiredFacts.filter((f) => {
    try {
      return !f.evidence.test(text);
    } catch {
      return false;
    }
  });
}

/**
 * Plausible packed-weight range for the family, scaled for a lot of `unitCount` units (lower bound stays the
 * single-unit minimum because a lot can be shipped flat; upper bound grows with the count). Null when unbounded.
 */
export function weightBoundsFor(
  family: CategoryFamily | null | undefined,
  unitCount = 1,
  opts?: { recordFormat?: string | null; slabbed?: boolean }
): { min: number; max: number } | null {
  const spec = getCategoryFamilySpec(family);
  if (!spec || !spec.singleUnitWeightOz) return null;
  let { min, max } = spec.singleUnitWeightOz;
  if (family === 'VINYL_RECORD' && opts?.recordFormat) {
    if (opts.recordFormat === '7in') { min = 3; max = 10; }
    else if (opts.recordFormat === '10in') { min = 8; max = 18; }
    else if (opts.recordFormat === 'Box') return null;
  }
  if (family === 'TRADING_CARD' && opts?.slabbed) { min = 2; max = 8; }
  const n = Number.isFinite(unitCount) && unitCount > 1 ? Math.min(Math.floor(unitCount), 200) : 1;
  return { min, max: max * n };
}
