/**
 * grailedCategoryMap.ts -- DATA for services/grailedCategoryResolver.ts: which Grailed Sub-category (leaf)
 * an item belongs in (S-EXT-GRAILED-CATEGORY-MAP, 2026-10-05). Dependency-free: no imports, no env, no I/O.
 * Every leaf id below is a node id from config/grailedCategoryTree.ts ("menswear:tops.polos"); the Jest
 * suite asserts that every target exists and is a LEAF, so a typo or a Grailed tree change fails CI
 * instead of mis-filing items.
 *
 * WHY: the Chrome extension walked Grailed's Department -> Category -> Sub-category picker with fuzzy text
 * matching and only two hand-confirmed overrides (tracksuits, T-shirts); 37 fix comments in
 * extension/fas-grailed.js document wrong or blank picks. The backend now names the exact leaf.
 * Grailed is FASHION ONLY: anything that is not apparel, footwear, bags, jewelry or accessories resolves
 * to null here (deliberate blanks in LAYER 2), and the existing eligibility checks are untouched.
 *
 * LAYER 1 -- GRAILED_CURATED_BY_EBAY_ID: keyed by the eBay numeric leaf category id stored on
 *   Item.ebayCategoryId. The ids come from eBay's public category pages (Men's Clothing 1059, Women's
 *   Clothing 15724, Men's/Women's Shoes 93427/3034, Men's/Women's Accessories 4250/4251) read on
 *   2026-10-05, plus 15687 / 185084 / 185708 / 137843 which already occur on production Items. eBay's
 *   Men's and Women's ids carry the DEPARTMENT, so an entry's `dept` is used when the item text names
 *   none (an explicit contradiction is a null, never a guess). An entry with no `target` only supplies
 *   that department and lets the keyword rules choose the leaf.
 * LAYER 2 -- GRAILED_RULES: ordered keyword rules over eBay category name + breadcrumb + title, specific
 *   before generic. First matching rule wins. A rule whose target is `null` is a deliberate BLANK
 *   (non-fashion, or a type Grailed has no leaf for): the later scored layer must not guess.
 *
 * Pattern syntax (strings, compiled by the resolver, case-insensitive, matched against text that has been
 * lower-cased, accent-folded, with apostrophes removed and every other non-alphanumeric run turned into
 * one space, and "&" turned into " and "): each pattern is an alternation body wrapped as \b(?:body)\b.
 * Prefix "cat:" tests only the eBay category name + breadcrumb, "title:" only title + brand, "desc:" title
 * + category + description; no prefix = category OR title. A rule matches when ALL of its `all` patterns
 * match and NONE of its `none` patterns match.
 *
 * Targets: a plain string is one leaf (its own department is implied). A department map {men, women, any}
 * is used when the leaf differs by department: the department is read from explicit words only (men's,
 * women's, boys, girls) or from the curated eBay id; `any` is used only when no department is known; a
 * `null` value is a deliberate blank for that department; a missing department key means "this rule does
 * not apply to that department" and the next rule is tried. No department and no `any` = null.
 */

export type GrailedDept = 'men' | 'women';
export interface GrailedDeptMap {
  men?: string | null;
  women?: string | null;
  /** Used only when the department is not known (an item type that exists in one department only). */
  any?: string;
}
export type GrailedTarget = string | GrailedDeptMap;

export interface GrailedCuratedEntry {
  /** The department this eBay id implies (used when the item text names none). */
  dept?: GrailedDept;
  /** The leaf for the whole id; omitted when the id is broad and the rules should choose. */
  target?: GrailedTarget | null;
  /** Sub-rules checked first: first pattern that matches wins. */
  split?: Array<[string, GrailedTarget | null]>;
}

export interface GrailedRuleDef {
  id: string;
  /** null = deliberate blank (see header). */
  target: GrailedTarget | null;
  all: string[];
  none?: string[];
}

const rule = (id: string, target: GrailedTarget | null, all: string[], none?: string[]): GrailedRuleDef =>
  none ? { id, target, all, none } : { id, target, all };
/** A deliberate blank: matching items get NO Grailed category (never guessed by the scored layer). */
const blank = (id: string, all: string[], none?: string[]): GrailedRuleDef => rule(id, null, all, none);

/** Leaf id helpers: m('tops.polos') -> 'menswear:tops.polos', w('womens_tops.polos') -> 'womenswear:womens_tops.polos'. */
const m = (p: string): string => 'menswear:' + p;
const w = (p: string): string => 'womenswear:' + p;
/** Department map shorthand. */
const dm = (men: string | null | undefined, women: string | null | undefined): GrailedDeptMap => {
  const out: GrailedDeptMap = {};
  if (men !== undefined) out.men = men;
  if (women !== undefined) out.women = women;
  return out;
};

/** Words that make a "glove" a sports, work or household glove, not a fashion accessory. */
const NOT_FASHION_GLOVE = 'baseball|softball|golf|boxing|batting|catchers?|hockey|lacrosse|goalie|football|receivers?|racquetball|handball|work|garden|gardening|welding|oven|cleaning|surgical|latex|nitrile|rubber|mechanic|disposable|dish|safety|tactical|fishing|hunting|weight lifting|gym|workout|training|mma|sparring|ufc|rawlings|easton|mizuno|youth|kids?|toddler';
/** Words that make a bag a non-fashion bag (sports, trade, household, packaging). */
const NOT_FASHION_BAG = 'golf|diaper|camera|tool|trash|garbage|sleeping|bean|tea|paper|plastic|gift|party|lunch|cooler|guitar|hockey|equipment|vacuum|air bags?|airbags?|punching|sand bags?|sandbags?|mail|dog|pet|treat|goodie|fishing|tackle|saddle|pannier|motorcycle|travel pillow|bag (of|for)|baggage tags?|bag tags?|bag clips?|bag hangers?|bag organizers?|bag charms?|bag straps?';

// ---------------------------------------------------------------------------------------------------
// LAYER 1: eBay leaf id -> Grailed leaf (or a department hint for broad ids)
// ---------------------------------------------------------------------------------------------------
export const GRAILED_CURATED_BY_EBAY_ID: Record<string, GrailedCuratedEntry> = {
  // The two rows that used to be GRAILED_CATEGORY_OVERRIDES in extension/fas-grailed.js (both live-confirmed
  // against the real picker for Menswear): tracksuits -> Tops > Sweatshirts & Hoodies. Womenswear has no
  // combined leaf, so a stated women's tracksuit goes to Sweatshirts (UNVERIFIED live, see mapping-review.md).
  '185084': { target: dm(m('tops.sweatshirts_hoodies'), w('womens_tops.sweatshirts')) }, // Tracksuits & Sets
  '185708': { target: dm(m('tops.sweatshirts_hoodies'), w('womens_tops.sweatshirts')) }, // Tracksuits & Sets
  '15687': { split: [['long sleeves?|longsleeves?', dm(m('tops.long_sleeve_shirts'), w('womens_tops.long_sleeve_shirts'))]], target: dm(m('tops.short_sleeve_shirts'), w('womens_tops.short_sleeve_shirts')) }, // T-Shirts
  // Men's Clothing (1059) and its children
  '1059': { dept: 'men' }, // Men's Clothing (broad)
  '57988': { dept: 'men' }, // Men's Coats, Jackets & Vests (the rules pick coat vs jacket vs vest)
  '11483': { dept: 'men', target: m('bottoms.denim') }, // Men's Jeans
  '57989': { dept: 'men' }, // Men's Pants (casual vs dress is decided by the title)
  '185100': { dept: 'men' }, // Men's Shirts
  '57990': { dept: 'men', target: m('tops.button_ups') }, // Casual Button-Down Shirts
  '57991': { dept: 'men', target: m('tailoring.formal_shirting') }, // Dress Shirts
  '155183': { dept: 'men', target: m('tops.sweatshirts_hoodies') }, // Hoodies & Sweatshirts
  '11484': { dept: 'men', target: m('tops.sweaters_knitwear') }, // Men's Sweaters
  '15689': { dept: 'men', target: m('bottoms.shorts') }, // Men's Shorts
  '15690': { dept: 'men', target: m('bottoms.swimwear') }, // Men's Swimwear
  '3001': { dept: 'men' }, // Suits & Suit Separates (suit vs blazer vs tuxedo vs trousers by title)
  '11507': { dept: 'men', target: m('accessories.socks_underwear') }, // Men's Underwear
  '11511': { dept: 'men', target: m('accessories.socks_underwear') }, // Men's Socks
  '11510': { dept: 'men', target: null }, // Men's Sleepwear & Robes: Grailed has no such leaf
  '185099': { dept: 'men' }, // Men's Activewear
  // Men's Shoes (93427)
  '93427': { dept: 'men' }, // Men's Shoes (broad)
  '15709': { dept: 'men' }, // Men's Athletic Shoes (hi-top vs low-top by title, else low-top)
  '11498': { dept: 'men', target: m('footwear.boots') }, // Men's Boots
  '53120': { dept: 'men', target: m('footwear.formal_shoes') }, // Men's Dress Shoes
  '24087': { dept: 'men' }, // Men's Casual Shoes (loafers, boat shoes ... left to the title)
  '11504': { dept: 'men', target: m('footwear.sandals') }, // Men's Sandals
  // Men's Accessories (4250)
  '4250': { dept: 'men' }, // Men's Accessories (broad)
  '2993': { dept: 'men', target: m('accessories.belts') }, // Men's Belts
  '15662': { dept: 'men', target: m('accessories.ties_pocketsquares') }, // Men's Ties
  '52365': { dept: 'men', target: m('accessories.hats') }, // Men's Hats
  '2996': { dept: 'men', target: m('accessories.wallets') }, // Men's Wallets
  '52382': { dept: 'men', target: m('accessories.gloves_scarves') }, // Men's Scarves
  '2994': { dept: 'men', target: m('accessories.gloves_scarves') }, // Men's Gloves & Mittens
  '179239': { dept: 'men' }, // Men's Sunglasses & Sunglasses Accessories (cases are blanked by the rules)
  '52357': { dept: 'men', target: m('accessories.bags_luggage') }, // Men's Bags
  '137843': { dept: 'men', split: [['collar (button )?stays?|button stays?|shirt studs?|tie bars?|tie clips?|tie tacks?', m('accessories.misc')]], target: dm(m('accessories.jewelry_watches'), w('womens_jewelry.cufflinks')) }, // Cufflinks (collar stays and studs filed here by eBay are accessories, not cufflinks)
  // Women's Clothing (15724) and its children
  '15724': { dept: 'women' }, // Women's Clothing (broad)
  '260010': { dept: 'women' }, // Women's Clothing, Shoes & Accessories (broad)
  '53159': { dept: 'women' }, // Women's Tops (blouse vs tee vs tank by title)
  '63866': { dept: 'women', target: w('womens_tops.sweaters') }, // Women's Sweaters
  '63861': { dept: 'women' }, // Women's Dresses (mini vs midi vs maxi vs gown by title; generic dress = blank)
  '63864': { dept: 'women' }, // Women's Skirts (length by title; generic skirt = blank)
  '63863': { dept: 'women', target: w('womens_bottoms.pants') }, // Women's Pants
  '11554': { dept: 'women', target: w('womens_bottoms.jeans') }, // Women's Jeans
  '11555': { dept: 'women', target: w('womens_bottoms.shorts') }, // Women's Shorts
  '169001': { dept: 'women', target: w('womens_bottoms.leggings') }, // Women's Leggings
  '3009': { dept: 'women', target: w('womens_bottoms.jumpsuits') }, // Women's Jumpsuits & Rompers
  '63862': { dept: 'women' }, // Women's Coats, Jackets & Vests (the rules pick the leaf)
  '63865': { dept: 'women' }, // Women's Suits & Suit Separates (only blazers have a Womenswear leaf)
  '63867': { dept: 'women', target: null }, // Women's Swimwear: Grailed has no such leaf
  '185098': { dept: 'women' }, // Women's Activewear
  '11524': { dept: 'women', target: w('womens_accessories.socks_intimates') }, // Women's Hosiery & Socks
  '11514': { dept: 'women' }, // Women's Intimates & Sleep (bras and lingerie by title; sleepwear is blank)
  '260011': { dept: 'women', target: null }, // Women's Outfits & Sets: no single leaf
  // Women's Shoes (3034)
  '3034': { dept: 'women' }, // Women's Shoes (broad)
  '95672': { dept: 'women' }, // Women's Athletic Shoes
  '53557': { dept: 'women', target: w('womens_footwear.boots') }, // Women's Boots
  '53548': { dept: 'women' }, // Women's Comfort Shoes
  '45333': { dept: 'women', target: w('womens_footwear.flats') }, // Women's Flats
  '55793': { dept: 'women', target: w('womens_footwear.heels') }, // Women's Heels
  '62107': { dept: 'women', target: w('womens_footwear.sandals') }, // Women's Sandals
  // Women's Accessories (4251)
  '4251': { dept: 'women' }, // Women's Accessories (broad)
  '3003': { dept: 'women', target: w('womens_accessories.belts') }, // Women's Belts
  '45230': { dept: 'women', target: w('womens_accessories.hats') }, // Women's Hats
  '45258': { dept: 'women', target: w('womens_accessories.wallets') }, // Women's Wallets
  '45238': { dept: 'women', target: w('womens_accessories.scarves') }, // Women's Scarves & Wraps
  '105559': { dept: 'women', target: w('womens_accessories.gloves') }, // Women's Gloves & Mittens
  '45220': { dept: 'women', target: w('womens_accessories.hair_accessories') }, // Hair Accessories
  '179247': { dept: 'women' }, // Women's Sunglasses & Sunglasses Accessories
  '169291': { dept: 'women' }, // Women's Bags & Handbags (the bag STYLE decides the leaf; unknown style = null)
};

// ---------------------------------------------------------------------------------------------------
// LAYER 2: ordered rules (first match wins). Specific before generic. A null target is a deliberate blank.
// Block order: 1 blanks (test rows, non-fashion, parts, sports gear, memorabilia)  2 watches and jewelry
//   3 tracksuits, swim, dresses, skirts, jumpsuits, leggings  4 tailoring  5 outerwear  6 tops
//   7 bottoms  8 footwear  9 accessories and bags.
// ---------------------------------------------------------------------------------------------------
export const GRAILED_RULES: GrailedRuleDef[] = [
  // ===== 1. BLANKS: nothing here is a Grailed listing =====================================================
  blank('test-rows', ['title:do not publish|qa test|test item|test prod|test card']),
  blank('fragrance-beauty', ['fragrances?|perfumes?|colognes?|eau de (toilette|parfum|cologne)']),
  blank('costumes-dolls', ['title:costumes?|cosplay|doll clothes|dolls?|plush|stuffed animals?|mannequins?|action figures?']),
  blank('signed-memorabilia', ['title:signed|autographed|game used|game worn|memorabilia|jsa|psa dna|beckett']),
  // A watch accessory, an accessory-holder or a smart device is not a Grailed fashion listing.
  blank('watch-parts-smart', ['title:watch (bands?|straps?|batteries|battery|parts?|movements?|crystals?|winders?|tools?|repair|links?|clasps?|boxes|box|cases?|stands?|displays?)|smart ?watch(es)?|apple watch|fitbit|garmin|galaxy watch']),
  blank('holders-racks-polish', ['title:(shoe|boot|hat|cap|belt|bag|glove|scarf|wallet|jewelry|sock|tie|shirt|jacket|coat|sunglass(es)?|glasses) (racks?|stands?|trees?|boxes|box|organizers?|holders?|cleaners?|polish|horns?|dryers?|stretchers?|displays?|hangers?|storage|cases?)|shoe (laces?|insoles?|inserts?|trees?|horns?)|insoles?|shoe laces?|shoelaces?']),
  blank('jewelry-supplies', ['title:jewelry (box(?:es)?|box|armoires?|organizers?|stands?|displays?|trays?|cleaners?|making|supplies|findings|tools|rolls?|pouches)|loose (gemstones?|diamonds?|beads?)|beads? (lots?|bulk|assortments?)|findings']),
  blank('sleepwear-robes', ['pajamas?|pyjamas?|sleepwear|nightgowns?|nightshirts?|nightwear|loungewear|bathrobes?|robes?|sleep (sets?|shirts?|pants)']),
  blank('sports-gear', ['title:cleats?|helmets?|shin guards?|mouth guards?|golf (clubs?|balls?|bags?)|baseball (bats?|gloves?|mitts?)|softball (gloves?|mitts?)|hockey (sticks?|pucks?)|fishing (rods?|reels?|lures?)|catchers? mitts?|batting gloves?']),
  blank('hard-hats-safety', ['title:hard hats?|safety (vests?|glasses|goggles|gloves?|boots?)|hi vis|high visibility|bulletproof|bullet proof|life (vests?|jackets?)|weighted vests?|hunting vests?|fishing vests?|reflective vests?']),
  // Non-fashion eBay top-level categories. A fashion noun in the TITLE keeps the item in play (a jacket
  // filed under "Collectibles" is still a jacket); everything else in those categories is blank.
  blank('non-fashion-l1',
    ['cat:antiques|art|baby|books and magazines|business and industrial|cameras and photo|cell phones and accessories|coins and paper money|collectibles|computers tablets and networking|consumer electronics|crafts|dolls and bears|home and garden|musical instruments and gear|pet supplies|pottery and glass|sporting goods|stamps|toys and hobbies|video games and consoles|ebay motors|everything else|music|sports mem cards and fan shop'],
    ['cat:clothing shoes and accessories|jewelry and watches|clothing|apparel|footwear|handbags|jerseys?|shoes|jewelry|watches',
      'title:t shirts?|tees?|hoodies?|sweatshirts?|jackets?|jeans|watch(es)?|wristwatch(es)?|sweaters?|dress(es)?|sneakers?|shoes|boots?|hats?|beanies?|shirts?|pants|shorts|coats?|handbags?|purses?|wallets?|belts?|scarf|scarves|sunglasses|necklaces?|bracelets?|earrings?|jerseys?|tracksuits?|vests?|blazers?|suits?']),
  // ===== 2. WATCHES AND JEWELRY ===========================================================================
  rule('collar-stays-studs', m('accessories.misc'), ['collar (button )?stays?|button stays?|shirt studs?|tie bars?|tie clips?|tie tacks?|collar (bars?|pins?|clips?)']),
  rule('cufflinks', { men: m('accessories.jewelry_watches'), women: w('womens_jewelry.cufflinks'), any: m('accessories.jewelry_watches') }, ['cufflinks?|cuff links?']),
  rule('watches', dm(m('accessories.jewelry_watches'), w('womens_accessories.watches')), ['watch(es)?|wristwatch(es)?'],
    ['watch (out|dogs?|tower|list|party|fob|chain)|stop ?watch|birdwatch|night watch|neighborhood watch|baywatch']),
  rule('jewelry-body', dm(m('accessories.jewelry_watches'), w('womens_jewelry.body_jewelry')), ['body jewelry|belly (button )?rings?|nose (rings?|studs?)|septum|tongue rings?|labrets?|piercings?']),
  rule('jewelry-brooches', { women: w('womens_jewelry.brooches'), men: m('accessories.jewelry_watches'), any: w('womens_jewelry.brooches') }, ['brooch(es)?|lapel pins?']),
  rule('jewelry-bracelets', dm(m('accessories.jewelry_watches'), w('womens_jewelry.bracelets')), ['bracelets?|bangles?|charm bracelets?']),
  rule('jewelry-necklaces', dm(m('accessories.jewelry_watches'), w('womens_jewelry.necklaces')), ['necklaces?|pendants?|chokers?|chain necklaces?']),
  rule('jewelry-earrings', dm(m('accessories.jewelry_watches'), w('womens_jewelry.earrings')), ['earrings?|ear studs?|ear cuffs?|hoop earrings?']),
  rule('jewelry-rings', dm(m('accessories.jewelry_watches'), w('womens_jewelry.rings')), ['engagement rings?|wedding bands?|signet rings?|class rings?|pinky rings?|statement rings?|cocktail rings?|band rings?'], ['key ?rings?|curtain|napkin|ring (light|toss|binder|doorbell|holder)|o rings?|split rings?']),
  rule('jewelry-charms', { women: w('womens_jewelry.charms'), men: m('accessories.jewelry_watches'), any: w('womens_jewelry.charms') }, ['pandora charms?|bracelet charms?|bead charms?|european charms?|pendant charms?']),
  // ===== 3. TRACKSUITS, SWIM, ONE-PIECE GARMENTS ==========================================================
  rule('tracksuits', dm(m('tops.sweatshirts_hoodies'), w('womens_tops.sweatshirts')), ['track ?suits?|tracksuits?|track suit sets?|jogging suits?|sweat ?suits?|warm ?up suits?|jogger sets?']),
  rule('swimwear', dm(m('bottoms.swimwear'), null), ['swim trunks?|swim shorts?|board shorts?|swimwear|swimsuits?|bathing suits?|bikinis?|one piece swimsuits?|swim briefs?|rash guards?']),
  rule('dress-gown', w('womens_dresses.gowns'), ['gowns?|ball gowns?|evening (dress(es)?|gowns?)|prom dress(es)?|wedding dress(es)?|formal dress(es)?|bridesmaid dress(es)?']),
  rule('dress-mini', w('womens_dresses.mini'), ['mini dress(es)?']),
  rule('dress-midi', w('womens_dresses.midi'), ['midi dress(es)?']),
  rule('dress-maxi', w('womens_dresses.maxi'), ['maxi dress(es)?|long dress(es)?|floor length dress(es)?']),
  // A generic dress has no length, so no honest Grailed leaf: deliberate blank rather than a coin toss.
  blank('dress-generic', ['dress(es)?|sundress(es)?|sun dress(es)?|shirt dress(es)?|sweater dress(es)?|slip dress(es)?'], ['dress (shirts?|shoes?|pants|socks?|belts?|watch|code|trousers|slacks|coats?|form|jackets?|boots?|sneakers?|up|wear|clothes|blues?|whites?|greens?|socks)|dress shirt']),
  rule('skirt-mini', w('womens_bottoms.mini_skirts'), ['mini skirts?|miniskirts?|mini skorts?']),
  rule('skirt-midi', w('womens_bottoms.midi_skirts'), ['midi skirts?']),
  rule('skirt-maxi', w('womens_bottoms.maxi_skirts'), ['maxi skirts?|long skirts?|floor length skirts?']),
  blank('skirt-generic', ['skirts?|skorts?'], ['skirt (steak|rack|hangers?|clips?)']),
  rule('jumpsuits', dm(m('bottoms.jumpsuits'), w('womens_bottoms.jumpsuits')), ['jumpsuits?|rompers?|overalls?|coveralls?|dungarees|playsuits?|boiler ?suits?'], ['dog|baby|infant|newborn|toddler|doll|pet']),
  rule('leggings', dm(m('bottoms.leggings'), w('womens_bottoms.leggings')), ['leggings?|jeggings?|yoga pants'], ['legging (warmers?|boots?)']),
  // ===== 4. TAILORING =====================================================================================
  rule('tuxedos', m('tailoring.tuxedos'), ['tuxedos?|tuxedo (jackets?|suits?|sets?)|dinner jackets?|smoking jackets?']),
  rule('blazers', dm(m('tailoring.blazers'), w('womens_outerwear.blazers')), ['blazers?|sport coats?|sports coats?|suit jackets?|suit coats?|dinner blazers?']),
  rule('tailoring-vests', dm(m('tailoring.vests'), w('womens_outerwear.vests')), ['waistcoats?|suit vests?|tuxedo vests?']),
  rule('formal-trousers', dm(m('tailoring.formal_trousers'), w('womens_bottoms.pants')), ['dress pants|dress trousers|suit pants|suit trousers|formal trousers|tuxedo pants|dress slacks'], ['pantyhose']),
  rule('suits', m('tailoring.suits'), ['title:suits?|suit sets?|two piece suits?|three piece suits?|2 piece suits?|3 piece suits?|business suits?'],
    ['suit (jackets?|coats?|pants|trousers|vests?|separates?|bags?|cases?|carriers?)|swim|bathing|wet ?suits?|space ?suits?|zoot|track|sweat|jogging|rain|snow|ski|hazmat|pantsuits?|jumpsuits?|jump suits?|suitcases?|garment bags?|play ?suits?|rompers?']),
  rule('formal-shirting', dm(m('tailoring.formal_shirting'), w('womens_tops.button_ups')), ['dress shirts?|formal shirts?|tuxedo shirts?|french cuff shirts?']),
  // ===== 5. OUTERWEAR (specific leaves before the generic coat/jacket rules) ==============================
  rule('jacket-denim', dm(m('outerwear.denim_jackets'), w('womens_outerwear.denim_jackets')), ['title:denim jackets?|jean jackets?|trucker jackets?|denim coats?']),
  rule('jacket-leather', dm(m('outerwear.leather_jackets'), w('womens_outerwear.leather_jackets')), ['title:leather (jackets?|coats?)|biker jackets?|moto jackets?|motorcycle jackets?|sheepskin jackets?|suede jackets?'], ['textile|armou?red|cordura|mesh|faux leather']),
  rule('jacket-bomber', dm(m('outerwear.bombers'), w('womens_outerwear.bombers')), ['title:bomber jackets?|bombers?|flight jackets?|ma 1 jackets?|ma1 jackets?']),
  rule('coat-parka', dm(m('outerwear.parkas'), w('womens_outerwear.coats')), ['title:parkas?']),
  rule('coat-rain', dm(m('outerwear.raincoats'), w('womens_outerwear.rain_jackets')), ['title:raincoats?|rain coats?|rain jackets?|waterproof (jackets?|coats?)']),
  rule('coat-down', dm(undefined, w('womens_outerwear.down_jackets')), ['title:down (jackets?|coats?)|puffer (jackets?|coats?)|puffy (jackets?|coats?)']),
  rule('coat-fur', dm(undefined, w('womens_outerwear.fur_faux_fur')), ['title:fur coats?|faux fur|fur jackets?|fur vests?|fur stoles?|mink|shearling coats?']),
  rule('vests', dm(m('outerwear.vests'), w('womens_outerwear.vests')), ['title:vests?|gilets?'], ['sweater vests?|vest tops?|knit vests?|hi vis|reflective']),
  rule('coat-heavy', dm(m('outerwear.heavy_coats'), w('womens_outerwear.coats')), ['title:overcoats?|peacoats?|pea coats?|topcoats?|wool coats?|winter coats?|duffle coats?|duffel coats?|heavy coats?|car coats?|long coats?|coats?'], ['coat (racks?|hangers?|hooks?|trees?|stands?|check|of arms)|lab coats?|petticoat|undercoat|waistcoat|trench']),
  rule('jacket-light', dm(m('outerwear.light_jackets'), w('womens_outerwear.jackets')), ['title:light jackets?|lightweight jackets?|windbreakers?|wind breakers?|track jackets?|coach jackets?|harrington jackets?|field jackets?|utility jackets?|chore (coats?|jackets?)|work jackets?|shackets?|overshirts?|softshell jackets?|soft shell jackets?|jackets?'],
    ['puffer|puffy|down|parka|winter|snow|ski|insulated|quilted|fleece|sherpa|shearling|wool|heavy|thermal|faux fur|fur|varsity|letterman|jacket (liners?|potatoes|dress)|life|jackets? and (pants|trousers)']),
  // ===== 6. TOPS ==========================================================================================
  rule('hoodies', dm(m('tops.sweatshirts_hoodies'), w('womens_tops.hoodies')), ['title:hoodies?|hooded sweatshirts?|zip up hoodies?|pullover hoodies?|hooded']),
  rule('sweatshirts', dm(m('tops.sweatshirts_hoodies'), w('womens_tops.sweatshirts')), ['title:sweatshirts?|crew ?neck sweatshirts?|quarter zip sweatshirts?|half zip sweatshirts?']),
  rule('sweatshirts-cat', dm(m('tops.sweatshirts_hoodies'), undefined), ['cat:hoodies and sweatshirts|sweatshirts and hoodies|hoodies|sweatshirts']),
  rule('sweaters', dm(m('tops.sweaters_knitwear'), w('womens_tops.sweaters')), ['sweaters?|knitwear|cardigans?|pullover sweaters?|sweater vests?'], ['sweater (weather|dress)|ugly|dog|pet|doll|christmas decor|sweater (shavers?|combs?|stones?)']),
  rule('tanks', dm(m('tops.sleeveless'), w('womens_tops.tank_tops')), ['tank tops?|sleeveless (tops?|shirts?|tees?)|muscle (tees?|tanks?)|camisoles?|camis?|singlets?']),
  rule('crop-tops', w('womens_tops.crop_tops'), ['crop tops?|cropped tops?']),
  rule('bodysuits', w('womens_tops.bodysuits'), ['bodysuits?|body suits?'], ['baby|infant|newborn|toddler|kids?']),
  rule('blouses', w('womens_tops.blouses'), ['blouses?']),
  rule('tshirt-long', dm(m('tops.long_sleeve_shirts'), w('womens_tops.long_sleeve_shirts')), ['long sleeve(d)? (t shirts?|tshirts?|tees?|tops?|shirts?)|long sleeve|longsleeve|ls tees?'], ['dress shirts?|button (up|down)|golf|polo|sweatshirts?|hoodies?|henley dress|jackets?|dress']),
  rule('jerseys', m('tops.jerseys'), ['jerseys?'], ['new jersey|jersey (city|shore|cow|knit|fabric|sheets?|bedding|bed sheets?|dress|skirt|pants|shorts|joggers)|cards?|mini|bobbleheads?|jersey tees?|fabric|yards?|yardage|sewing|quilting|material']),
  rule('tshirts', dm(m('tops.short_sleeve_shirts'), w('womens_tops.short_sleeve_shirts')), ['t shirts?|tshirts?|tees?|tee shirts?|short sleeve (t shirts?|tshirts?|tees?)'],
    ['golf|tee (times?|balls?|box(?:es)?|markers?|holders?|squares?|joints?)|union tee|pipe|fitting|connector|plumbing|printers?|transfers?|long sleeve|dress']),
  rule('polos', dm(m('tops.polos'), w('womens_tops.polos')), ['polo shirts?|polo tops?|golf polos?|performance polos?|pique polos?'], ['polo (ralph lauren )?(hoodie|jacket|jeans|pants|shorts|sweater|coat|vest|boots?|belt|bag|hat|cap)']),
  rule('button-ups', dm(m('tops.button_ups'), w('womens_tops.button_ups')), ['button (down|up|front)( shirts?)?|oxford shirts?|flannel shirts?|camp shirts?|western shirts?|hawaiian shirts?|work shirts?|casual shirts?']),
  // ===== 7. BOTTOMS =======================================================================================
  rule('shorts', dm(m('bottoms.shorts'), w('womens_bottoms.shorts')), ['shorts|cutoffs?|bermudas?'], ['short sleeves?|shorts? sleeves?|boxer shorts?|bike shorts? (pads?)']),
  rule('sweatpants-joggers', dm(m('bottoms.sweatpants_joggers'), w('womens_bottoms.joggers')), ['joggers?|jogger pants|cargo joggers']),
  rule('sweatpants', dm(m('bottoms.sweatpants_joggers'), w('womens_bottoms.sweatpants')), ['sweatpants?|sweat pants|track pants|fleece pants|jogging bottoms']),
  rule('denim', dm(m('bottoms.denim'), w('womens_bottoms.jeans')), ['jeans|denim pants|denim trousers'], ['jean (jackets?|shorts|skirts?|dress|shirts?)|genes']),
  rule('cropped-pants', dm(m('bottoms.cropped_pants'), w('womens_bottoms.pants')), ['cropped pants|capris?|capri pants|culottes?|cropped trousers']),
  rule('pants', dm(m('bottoms.casual_pants'), w('womens_bottoms.pants')), ['pants|trousers|slacks|chinos?|cargos?|cargo pants|khakis?|corduroys?'],
    ['pants? (hangers?|racks?|press(?:es)?|stretchers?|clips?)|sweat|yoga|snow|ski|rain|scrubs?|diapers?|pantyhose|pantsuits?|jumpsuits?|pants (and|with) (jackets?|coats?|blazers?)|dress pants|dress trousers|suit pants|suit trousers|tuxedo pants|dress slacks']),
  // ===== 8. FOOTWEAR ======================================================================================
  rule('boots', dm(m('footwear.boots'), w('womens_footwear.boots')), ['boots?|chelsea boots?|combat boots?|work boots?|cowboy boots?|hiking boots?'],
    ['boot (cut|socks?|trees?|liners?|jacks?|laces?|bags?|dryers?|polish|camp|stretchers?|scrapers?|trays?|warmers?)|boots? (cut|rack|racks)|bootcut|bootleg|rain boots? (liners?)|ski boots?|snowboard boots?|football boots?|soccer boots?|cleats?']),
  rule('heels', w('womens_footwear.heels'), ['heels?|high heels?|pumps?|stilettos?|kitten heels?'], ['pumps? (air|water|fuel|sump|oil|bike|hand|gas|bilge|aquarium|bicycle|tire|ball|breast|soap|lotion)|air pumps?|water pumps?|bike pumps?|heel (taps?|grips?|lifts?|cups?|pads?|protectors?|guards?|stoppers?)|cuban heels?']),
  rule('platforms', w('womens_footwear.platforms'), ['platform (shoes?|heels?|sandals?|sneakers?|pumps?)']),
  rule('mules', w('womens_footwear.mules'), ['mules?'], ['mule (deer|ear|team|train)|kentucky mule|moscow mule']),
  rule('flats', w('womens_footwear.flats'), ['ballet flats?|ballerina flats?|flats'], ['flat (iron|screen|panel|tv|rate|bill|brim|cap|bed|pack|lay|head|top|tire|screwdriver|washer|file|knit|seam|bread|wire|wallet)|flatware|flats of|flatbed']),
  rule('sandals', dm(m('footwear.sandals'), w('womens_footwear.sandals')), ['sandals?|flip ?flops?']),
  rule('formal-shoes', m('footwear.formal_shoes'), ['dress shoes?|oxfords?|derbys?|derbies|brogues?|monk straps?|wingtips?|balmorals?|cap toe shoes?'], ['oxford (cloth|shirts?)|brogues? (boots?)']),
  rule('slip-ons', dm(m('footwear.slip_ons'), w('womens_footwear.slip_ons')), ['slip ?ons?|slip on (shoes?|sneakers?)|espadrilles?|clogs?|crocs']),
  rule('sneakers-hitop', dm(m('footwear.hitop_sneakers'), w('womens_footwear.hitop_sneakers')),
    ['high tops?|hi tops?|high top sneakers?|hi top sneakers?|jordan [0-9]+ (retro )?high|jordan [0-9]+ og high|dunk high|dunks? hi|air force 1 high|af1 high|all star hi'], ['low top']),
  rule('sneakers-lowtop-explicit', dm(m('footwear.lowtop_sneakers'), w('womens_footwear.lowtop_sneakers')),
    ['low tops?|low top sneakers?|jordan [0-9]+ (retro )?low|dunk low|air force 1 low|af1 low|stan smiths?|gazelles?|sambas?|old skools?|superstars?|air max [0-9]+|vapormax|ultraboost|ultra boost']),
  // Basketball and numbered Jordans exist as both high and low: without the height stated it is a coin toss.
  blank('sneakers-height-unknown', ['basketball shoes?|jordans?|air jordans?|retro [0-9]+|dunks?|chuck taylors?|converse all stars?|all stars?']),
  // Running, tennis, training and skate shoes are low-cut by construction. A bare "sneakers" (or an eBay Athletic Shoes
  // category, which also holds high-top basketball shoes) does not say high or low, so it stays blank.
  rule('sneakers', dm(m('footwear.lowtop_sneakers'), w('womens_footwear.lowtop_sneakers')), ['title:running shoes?|athletic shoes?|tennis shoes?|training shoes?|trainers?|skate shoes?|runners?'], ['trainers? (pads?|wheels?)|personal trainers?|runners? (rugs?|carpets?|mats?)|table runners?']),
  blank('sneakers-height-unknown-generic', ['sneakers?|athletic shoes?|basketball']),
  // ===== 9. ACCESSORIES AND BAGS ==========================================================================
  rule('belt-bags', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.belt_bags')), ['belt bags?|fanny packs?|waist (bags?|packs?)|bum bags?'], [NOT_FASHION_BAG]),
  rule('belts', dm(m('accessories.belts'), w('womens_accessories.belts')), ['belts?'],
    ['belt (buckles?|bags?|loops?|clips?|sanders?|drive|pouch|holsters?|extenders?)|seat ?belts?|conveyor|tool belts?|utility belts?|weight (lifting )?belts?|belts? for (dog|pet)|fanny|lifting belts?|garter belts?']),
  rule('sunglasses', dm(m('accessories.sunglasses'), w('womens_accessories.sunglasses')), ['sunglasses|sun glasses|shades|aviators?'], ['cases?|pouch|cleaning|cloths?|straps?|clip ?ons?|chains?|retainers?|holders?|kids?|toddler|baby']),
  rule('glasses', dm(m('accessories.glasses'), w('womens_accessories.glasses')), ['eyeglasses|eye glasses|eyewear|glasses frames?|spectacles|optical frames?|reading glasses'], ['cases?|cleaning|cloths?|drinking|wine|shot|beer|safety|3d|magnif']),
  rule('hats', dm(m('accessories.hats'), w('womens_accessories.hats')), ['baseball caps?|ball caps?|snapbacks?|trucker (hats?|caps?)|dad hats?|bucket hats?|beanies?|fedoras?|berets?|newsboy caps?|flat caps?|fitted (hats?|caps?)|knit (hats?|caps?)|skull caps?|golf caps?|ski caps?|wool caps?|hats?'],
    ['hard hats?|hat (box(?:es)?|racks?|pins?|stretchers?|bands?)|hats? off|party hats?|witch|santa|christmas tree|cowboy hat (box(?:es)?)|top hat (box(?:es)?)']),
  rule('wallets', dm(m('accessories.wallets'), w('womens_accessories.wallets')), ['wallets?|card holders?|cardholders?|card cases?|billfolds?|money clips?|coin purses?|passport (holders?|wallets?|covers?)'],
    ['wallet (chains?)|trading|sports|baseball|toploaders?|top loaders?|penny|sleeves?|binders?|screw|magnetic|bcw|ultra pro|graded|slabs?|photo|phone cases?|cell phone|iphone|samsung']),
  rule('scarves', dm(m('accessories.gloves_scarves'), w('womens_accessories.scarves')), ['scarf|scarves|shawls?|pashmina']),
  rule('gloves', dm(m('accessories.gloves_scarves'), w('womens_accessories.gloves')), ['gloves?|mittens?'], [NOT_FASHION_GLOVE]),
  rule('hair-accessories', w('womens_accessories.hair_accessories'), ['hair (clips?|accessories|bands?|ties?|pins?|bows?|combs?)|scrunchies?|headbands?|barrettes?|hair claws?|bobby pins?']),
  rule('socks-underwear-men', dm(m('accessories.socks_underwear'), undefined), ['socks?|underwear|boxers?|boxer briefs?|briefs?|undershirts?'], ['sock (puppets?|monkey|drawer|hop)|boxers? (dog|rebellion|shorts)|briefs? cases?|socks? organizers?|boxers? shorts']),
  rule('socks-intimates-women', dm(undefined, w('womens_accessories.socks_intimates')), ['socks?|bras?|bralettes?|panties|lingerie|underwear|hosiery|stockings?|pantyhose|tights?|intimates'], ['sock (puppets?|monkey|drawer|hop)']),
  rule('ties', m('accessories.ties_pocketsquares'), ['neckties?|bow ties?|pocket squares?|bolo ties?|silk ties?|tie sets?'], ['tie (dye|dyed|front|back|waist|down|rack|tack|bar|clip|rods?|wraps?)|zip ties?|cable ties?']),
  // Bag styles. Women: one rule per Grailed bag leaf; Men: every bag is Accessories > Bags & Luggage.
  rule('bag-backpack', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.backpacks')), ['backpacks?|rucksacks?|knapsacks?|book bags?|school bags?|daypacks?'], [NOT_FASHION_BAG]),
  rule('bag-luggage', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.luggage_travel')), ['luggage|suitcases?|travel bags?|duffel(le)? bags?|duffels?|weekender bags?|weekenders?|carry ons?|garment bags?|trolley bags?|overnight bags?|gym bags?'], [NOT_FASHION_BAG]),
  rule('bag-messenger', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.messengers_satchels')), ['messenger bags?|satchels?|briefcases?|postman bags?|courier bags?|laptop messenger'], ['laptop (sleeves?|cases?)']),
  rule('bag-toiletry', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.toiletry_pouches')), ['toiletry (bags?|pouch(es)?|kits?)|cosmetic (bags?|cases?|pouch(es)?)|makeup (bags?|pouch(es)?)|dopp kits?|wash bags?|pouch(es)?'], ['coin|card|phone|jewelry|pencil|zipper pouch (lot)']),
  rule('bag-crossbody', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.crossbody_bags')), ['cross ?body( bags?)?|cross body bags?|sling bags?'], [NOT_FASHION_BAG]),
  rule('bag-clutch', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.clutches')), ['clutch(es)?|clutch bags?|evening bags?|wristlets?|minaudieres?'], ['clutch (cables?|plates?|discs?|kits?|pedals?|levers?|pressure|assembly)|clutch pencils?']),
  rule('bag-bucket', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.bucket_bags')), ['bucket bags?']),
  rule('bag-hobo', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.hobo_bags')), ['hobo bags?|hobo handbags?|hobos']),
  rule('bag-mini', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.mini_bags')), ['mini bags?|micro bags?|mini purses?|mini handbags?']),
  rule('bag-tote', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.tote_bags')), ['tote bags?|totes?|shopping totes?|canvas totes?'], [NOT_FASHION_BAG]),
  rule('bag-handle', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.handle_bags')), ['top handle bags?|handle bags?|top handle handbags?|frame bags?|doctor bags?']),
  rule('bag-shoulder', dm(m('accessories.bags_luggage'), w('womens_bags_luggage.shoulder_bags')), ['shoulder bags?|shoulder handbags?|baguettes?'], [NOT_FASHION_BAG]),
  // A men's bag of any kind has one leaf; a generic women's handbag has no style, so it stays blank.
  rule('bag-generic-men', dm(m('accessories.bags_luggage'), undefined), ['handbags?|purses?|bags?'], [NOT_FASHION_BAG]),
  blank('bag-generic-women', ['handbags?|purses?'], [NOT_FASHION_BAG]),
];
