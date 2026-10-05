/**
 * poshmarkCategoryMap.ts -- DATA for services/poshmarkCategoryResolver.ts: which Poshmark category an
 * item belongs in (S-EXT-POSHMARK-CATEGORY-MAP, 2026-10-05). Dependency-free: no imports, no env, no I/O.
 * Every id below is a node id from config/poshmarkCategoryTree.ts (Poshmark's public URL slug for the node,
 * built here with L() so a typo is a readable title, not a slug). The Jest suite asserts that every target
 * exists and is a selectable LEAF of the committed tree, so a typo or a Poshmark tree change fails CI
 * instead of mis-filing items.
 *
 * LAYER 1 -- POSHMARK_CURATED_BY_EBAY_ID: keyed by the eBay numeric leaf category id stored on
 *   Item.ebayCategoryId. Seeded from the ids that occur in the 351-item production export of 2026-10-04
 *   (category names and ids only, no item text is kept in this repo) plus the card ids pinned in
 *   cardEbayCategories.ts. An id whose eBay meaning is broad ("Books" 261186, "Replacement Parts" 13718)
 *   is deliberately absent so the item's own words decide. An id mapped to `null` is a deliberate BLANK.
 * LAYER 2 -- POSHMARK_RULES: ordered keyword rules over eBay category name + breadcrumb + title (+ the
 *   description for a few prefixes), specific before generic. First matching rule wins. A rule whose target
 *   is `null` is a deliberate BLANK: the item type has no honest Poshmark home (Poshmark has no sports,
 *   instrument, coin, stamp, book, furniture, garden or hardware department, and prohibits tobacco and
 *   weapons), so the later scored layer must not guess one.
 *
 * Pattern syntax (strings, compiled by the resolver, case-insensitive, matched against text that has been
 * lower-cased, accent-folded, with apostrophes removed and every other non-alphanumeric run turned into one
 * space, and "&" turned into " and "): each pattern is an alternation body wrapped as \b(?:body)\b. Prefix
 * "cat:" tests only the eBay category name + breadcrumb, "title:" only the title, "desc:" title + category +
 * description; no prefix = category + title. A rule matches when ALL of its `all` patterns match and NONE of
 * its `none` patterns match.
 *
 * Department-split targets are {women, men, kids, any}. The department is read from explicit words only
 * (men's, women's, boys, girls, kids ...); when it is not stated and no `any` leaf is given the item resolves
 * to nothing (blank beats wrong). If the department IS stated but that department has no leaf, the rule is
 * skipped and the next rule gets a turn.
 *
 * KNOWN GAPS, on purpose: 30 category branches (Dresses, Jeans, Shorts, Skirts, Swim, Intimates, Makeup,
 * Dog, Cat ...) were never harvested (see the header of poshmarkCategoryTree.ts), so nothing may target
 * them; items of those types resolve to null and the extension's own search handles them.
 */

export interface PoshmarkDeptMap {
  women?: string;
  men?: string;
  kids?: string;
  /** Used only when the department is not stated (an item type that exists under one department only). */
  any?: string;
}
export type PoshmarkTarget = string | PoshmarkDeptMap;

export type PoshmarkCuratedEntry =
  | PoshmarkTarget
  | null
  | { split: Array<[string, PoshmarkTarget | null]>; fallback?: PoshmarkTarget | null };

export interface PoshmarkRuleDef {
  id: string;
  /** null = deliberate blank (see header). */
  target: PoshmarkTarget | null;
  all: string[];
  none?: string[];
}

const rule = (id: string, target: PoshmarkTarget | null, all: string[], none?: string[]): PoshmarkRuleDef =>
  none ? { id, target, all, none } : { id, target, all };
/** A deliberate blank: matching items get NO Poshmark category (never guessed by the scored layer). */
const blank = (id: string, all: string[], none?: string[]): PoshmarkRuleDef => rule(id, null, all, none);

/** Node id from titles: L('Home', 'Accents', 'Decor') -> 'Home-Accents-Decor' (spaces become underscores). */
const L = (...parts: string[]): string => parts.map((p) => p.replace(/ /g, '_')).join('-');
/** Department map from the three departments' leaves; a missing argument means "no leaf there". */
const D = (women?: string, men?: string, kids?: string): PoshmarkDeptMap => {
  const m: PoshmarkDeptMap = {};
  if (women) m.women = women;
  if (men) m.men = men;
  if (kids) m.kids = kids;
  return m;
};
/** An item type that only exists under Men: used when the department is stated as men OR not stated. */
const M = (leaf: string): PoshmarkDeptMap => ({ men: leaf, any: leaf });

// ---------------------------------------------------------------------------------------------------
// Targets (ids from poshmarkCategoryTree.ts)
// ---------------------------------------------------------------------------------------------------
const VINYL = L('Electronics', 'Media', 'Vinyl Records');
const CDS = L('Electronics', 'Media', 'CDs');
const DVDS = L('Electronics', 'Media', 'DVDs & Blu-ray Discs');
const BLANK_MEDIA = L('Electronics', 'Media', 'Blank Media');
const MEDIA_CASES = L('Electronics', 'Media', 'Media Cases & Organization');
const GAMES = L('Electronics', 'Video Games & Consoles', 'Video Games');
const PC_GAMES = L('Electronics', 'Video Games & Consoles', 'PC Games');
const CONSOLES = L('Electronics', 'Video Games & Consoles', 'Consoles');
const HANDHELDS = L('Electronics', 'Video Games & Consoles', 'Handheld Consoles');
const CONTROLLERS = L('Electronics', 'Video Games & Consoles', 'Controllers');
const GAME_HEADSETS = L('Electronics', 'Video Games & Consoles', 'Headsets');
const GAME_GUIDES = L('Electronics', 'Video Games & Consoles', 'Gaming Guides');
/** Poshmark has no books department; comics and magazines live here (live-verified by the existing extension logic). */
const COFFEE_BOOKS = L('Home', 'Accents', 'Coffee Table Books');
const COOKBOOKS = L('Home', 'Kitchen', 'Cookbooks');
/** Lamps and lighting have no honest leaf; Decor is what the existing extension logic already uses (live-verified). */
const DECOR = L('Home', 'Accents', 'Decor');
const LANTERNS = L('Home', 'Accents', 'Lanterns');
const VASES = L('Home', 'Accents', 'Vases');
const FRAMES = L('Home', 'Accents', 'Picture Frames');
const BASKETS = L('Home', 'Accents', 'Baskets & Bins');
const CANDLES = L('Home', 'Accents', 'Candles & Holders');
const ACCENT_PILLOWS = L('Home', 'Accents', 'Accent Pillows');
const CURTAINS = L('Home', 'Accents', 'Curtains & Drapes');
const DOOR_MATS = L('Home', 'Accents', 'Door Mats');
const FAUX_FLORALS = L('Home', 'Accents', 'Faux Florals');
const FURNITURE_COVERS = L('Home', 'Accents', 'Furniture Covers');
const PAINTING = L('Home', 'Art', 'Painting');
const DRAWING = L('Home', 'Art', 'Drawing & Illustrations');
const POSTERS = L('Home', 'Art', 'Posters');
const PRINTS = L('Home', 'Art', 'Prints');
const PHOTOGRAPHY = L('Home', 'Art', 'Photography');
const SCULPTURE = L('Home', 'Art', 'Sculpture');
const CERAMICS = L('Home', 'Art', 'Ceramics');
const GLASS_ART = L('Home', 'Art', 'Glass Art');
const WALL_ART = L('Home', 'Wall Decor', 'Art & Decals');
const CLOCKS = L('Home', 'Wall Decor', 'Clocks');
const MIRRORS = L('Home', 'Wall Decor', 'Mirrors');
const TAPESTRIES = L('Home', 'Wall Decor', 'Tapestries');
const WALLPAPER = L('Home', 'Wall Decor', 'Wallpaper');
const HOOKS = L('Home', 'Wall Decor', 'Hooks');
const DISPLAY_SHELVES = L('Home', 'Wall Decor', 'Display Shelves');
const BOARD_GAMES = L('Home', 'Games', 'Board Games');
const CARD_GAMES = L('Home', 'Games', 'Card Games');
const OUTDOOR_GAMES = L('Home', 'Games', 'Outdoor Games');
const HOME_PUZZLES = L('Home', 'Games', 'Puzzles');
const STORAGE = L('Home', 'Storage & Organization', 'Storage');
const CLOSET = L('Home', 'Storage & Organization', 'Closet Accessories');
const BINDERS = L('Home', 'Office', 'Binders & Folders');
const FOOD_STORAGE = L('Home', 'Kitchen', 'Food Storage');
const COOKWARE = L('Home', 'Kitchen', 'Cookware');
const HOLIDAY_DECOR = L('Home', 'Holiday', 'Holiday Decor');
const CUFFLINKS = L('Men', 'Accessories', 'Cuff Links');
const MUGS = L('Home', 'Dining', 'Mugs');
const DINNERWARE = L('Home', 'Dining', 'Dinnerware');
const TRADING_CARDS = L('Kids', 'Toys', 'Trading Cards');
const KIDS_FIGURES = L('Kids', 'Toys', 'Action Figures & Playsets');
const STUFFED = L('Kids', 'Toys', 'Stuffed Animals');
const FISH_ACCESSORIES = L('Pets', 'Fish', 'Decor & Accessories');
const BINOCULARS = L('Electronics', 'Cameras, Photo & Video', 'Binoculars & Scopes');
const FLASHES = L('Electronics', 'Cameras, Photo & Video', 'Flashes');
const GPS = L('Electronics', 'Car Audio, Video & GPS', 'GPS & Navigation');
/** Tracksuits: no set leaf exists for adults, so the joggers leaf; Kids has a real Matching Sets leaf. */
const TRACKSUIT: PoshmarkDeptMap = D(
  L('Women', 'Pants & Jumpsuits', 'Track Pants & Joggers'),
  L('Men', 'Pants', 'Sweatpants & Joggers'),
  L('Kids', 'Matching Sets'),
);
const TEE_SHORT: PoshmarkDeptMap = D(
  L('Women', 'Tops', 'Tees - Short Sleeve'),
  L('Men', 'Shirts', 'Tees - Short Sleeve'),
  L('Kids', 'Shirts & Tops', 'Tees - Short Sleeve'),
);

/** Shared exclusion alternations for the sports rules: they only stop apparel and collectibles being filed as gear. */
const NOT_APPAREL = 'shirts?|jerseys?|caps?|hats?|hoodies?|jackets?|pants?|shorts?|socks?|shoes?|cleats?|costumes?|uniforms?|sweatshirts?|vests?|polos?|tees?';
const NOT_COLLECTIBLE = 'cards?|pins?|patch(?:es)?|figurines?|figures?|bobbleheads?|ornaments?|posters?|prints?|photos?|plaques?|magazines?|programs?|tickets?|pennants?|stickers?|mugs?|keychains?|signed|autographed|memorabilia|necklaces?|earrings?|bracelets?|pendants?|jewelry';

// ---------------------------------------------------------------------------------------------------
// LAYER 1: eBay leaf id -> Poshmark leaf
// ---------------------------------------------------------------------------------------------------
export const POSHMARK_CURATED_BY_EBAY_ID: Record<string, PoshmarkCuratedEntry> = {
  // Music / media
  '176985': VINYL, // Vinyl Records -> Electronics > Media > Vinyl Records (103 items in prod)
  '280': COFFEE_BOOKS, // Magazines -> Home > Accents > Coffee Table Books (Poshmark has no magazines leaf)
  '259104': COFFEE_BOOKS, // Comics & Graphic Novels -> Coffee Table Books (same reason)
  '3984': { split: [['comics?|comic books?|issues?|graphic novels?|trade paperbacks?|manga|cgc|cbcs', COFFEE_BOOKS]], fallback: DRAWING }, // Original Comic Art: a real comic stays a comic, original pages are drawings
  '139973': GAMES, // Video Games
  '139971': CONSOLES, // Video Game Consoles
  '617': DVDS, // DVDs & Blu-ray Discs
  // Trading cards (ids pinned in config/cardEbayCategories.ts)
  '183454': TRADING_CARDS, // CCG Individual Cards -> Kids > Toys > Trading Cards
  '183050': TRADING_CARDS, // Trading Card Singles
  '261328': TRADING_CARDS, // Trading Card Singles (sports)
  // Card / coin supplies seen in prod (BCW): storage products, not cards
  '39476': STORAGE, // Holders (slab inserts, penny tubes)
  '39477': STORAGE, // Coin Tubes
  '183438': STORAGE, // Card Toploaders & Holders
  '183439': BINDERS, // Albums, Binders & Pages
  '1438': CARD_GAMES, // Playing Cards
  '180349': BOARD_GAMES, // Board games, contemporary manufacture
  // Coins and paper money: no Poshmark home
  '11981': null,
  '40029': null,
  // Instruments and audio gear: no Poshmark home
  '33021': null, '33034': null, '4713': null, '16224': null, '38072': null, '46677': null, '22672': null,
  '22670': null, '22669': null, '41419': null, '29946': null, '29948': null, '41459': null, '14964': null,
  '47075': null, '21766': null, '47091': null, '41408': null,
  // Video game accessories
  '117042': { split: [['controllers?|gamepad|joy ?cons?', CONTROLLERS], ['headsets?', GAME_HEADSETS]] }, // Controllers & Attachments
  '182174': { split: [['strategy|guide|walkthrough', GAME_GUIDES]] }, // Manuals, Inserts & Box Art
  // Sports: no Poshmark home
  '115280': null, '16030': null, '16038': null, '181382': null, '15262': null, '159175': null, '24510': null,
  '1226': null, '27280': null, '50807': null,
  // Signs
  '38052': WALL_ART, '804': WALL_ART, '10805': WALL_ART, '35684': WALL_ART,
  '3893': { split: [['signs?', WALL_ART]] }, // Other Retail Store Ads (only when it is a sign)
  // Tobacco-adjacent (tins, ashtrays, lighters, cigar and cigarette collectibles): Poshmark prohibits tobacco, blank
  '38053': null, '11677': null, '801': null, '133': null, '986': null, '44': null, '70993': null, '11673': null,
  '594': null,
  // Advertising memorabilia without a clear object
  '35': null, '1333': null, '259256': null,
  // Art and decor
  '551': PAINTING, // Paintings
  '41511': { split: [['title:posters?', POSTERS], ['title:prints?|lithographs?|giclee', PRINTS]] }, // Posters & Prints
  '73500': FRAMES, // Frames
  '73507': VASES, // Vases
  '13831': BASKETS, // Baskets
  '261054': MUGS, // Cups & Mugs
  '262374': DINNERWARE, // Dishes
  '261688': FOOD_STORAGE, // Canisters & Jars
  '261713': DECOR, // Lamps
  '63516': DECOR, // Chandeliers, Sconces & Lighting Fixtures
  '168867': LANTERNS, // Lanterns
  '117414': HOLIDAY_DECOR, // Christmas Trees
  '43506': CLOSET, // Shoe Organizers
  '3631': { split: [['skillets?|frying pans?|pans?|pots?|dutch ovens?|griddles?|woks?|kettles?|cookware', COOKWARE]] }, // Cast Iron (only when it is cookware)
  '10843': { split: [['figurines?|statues?|porcelain|ceramic|resin|bronze|figures?', DECOR], ['plush|stuffed', STUFFED]] }, // Greyhound (collectible dog)
  '10834': { split: [['figurines?|statues?|porcelain|ceramic|resin|bronze|figures?', DECOR], ['plush|stuffed', STUFFED]] }, // Cocker Spaniel (collectible dog)
  '177918': KIDS_FIGURES, // Play Sets
  // Jewelry / electronics with one honest leaf
  '137843': CUFFLINKS, // Cufflinks
  '74927': BINOCULARS, // Telescopes
  '48515': FLASHES, // Flashes
  '156955': GPS, // GPS Units
  // Pets: aquarium equipment (Pets > Fish > Decor & Accessories is the only equipment leaf)
  '100351': FISH_ACCESSORIES, // Pumps (Air)
  '100355': FISH_ACCESSORIES, // Air Stones
  // Garden, hardware, furniture, industrial: no Poshmark home
  '139921': null, '178988': null, '178989': null, '20684': null, '260505': null, '151621': null, '180964': null,
  '20542': null, '260941': null, '75670': null, '184148': null, '260831': null, '185258': null, '63900': null,
  '48094': null, '48656': null, '109431': null, '12506': null, '104043': null, '177908': null, '13716': null,
  '88903': null, '11226': null, '1245': null, '38235': null,
  // Clothing with a department split
  '185708': TRACKSUIT, // Tracksuits & Sets
  '185084': TRACKSUIT, // Tracksuits & Sets (Clothing, Shoes & Accessories)
  '15687': TEE_SHORT, // T-Shirts
};

// ---------------------------------------------------------------------------------------------------
// LAYER 2: ordered keyword rules (first match wins; specific before generic)
// ---------------------------------------------------------------------------------------------------
export const POSHMARK_RULES: PoshmarkRuleDef[] = [
  // ===== 1. test rows, tobacco, weapons (blank before anything can mis-file them) =========================
  blank('test-rows', ['title:do not publish|qa test|test item|test prod|test card']),
  // Poshmark prohibits tobacco products. Signs, posters, prints and apparel that merely carry a brand are not tobacco.
  blank('tobacco-adjacent', ['tobacciana|cigarettes?|cigars?|cigarillos?|tobacco|ashtrays?|zippo|cigarette lighters?|butane lighters?|collectible lighters?|smoking pipes?|tobacco pipes?|pipe tobacco|hookahs?|vapes?|vaping|snuff|rolling papers?|humidors?|cigar (boxes|cutters)'],
    ['signs?|posters?|prints?|shirts?|tees?|hats?|caps?|hoodies?|jackets?|mugs?|books?|magazines?|dvds?|records?']),
  blank('weapons', ['firearms?|guns?|rifles?|pistols?|revolvers?|shotguns?|ammo|ammunition|bullets?|holsters?|daggers?|swords?|machetes?|switchblades?|pocket knife|pocket knives|folding kni(?:fe|ves)|hunting kni(?:fe|ves)|survival knives|tactical knives|combat knives|throwing knives|bayonets?|brass knuckles|crossbows?|bows and arrows?|airsoft|bb guns?|stun guns?|tasers?|pepper spray|rifle scopes?|gun (cases?|safes?)'],
    ['toy (guns?|swords?)|nerf|water guns?|glue guns?|heat guns?|spray guns?|staple guns?|caulk(ing)? guns?|hot glue|paintball|top gun|guns n roses|smoking gun|cap guns?|hair dryers?|steak knives|kitchen knives|knife blocks?|books?|dvds?|posters?|shirts?|tees?|figures?|figurines?|sword fish|swordfish|video games?|games?']),

  // Arcade boards, cartridges and marquees: no Poshmark home (and not a console game either).
  blank('arcade-parts', ['neo ?geo|mvs|arcade (cartridges?|boards?|parts?|cabinets?|machines?)|marquees?|jamma'], ['letters?|lights?|signs?|tents?|shirts?|tees?|posters?|hoodies?']),

  // ===== 2. media ========================================================================================
  rule('media-vinyl', VINYL, ['vinyl records?|vinyl albums?|record albums?|lps?|12 inch (single|vinyl)|45 rpm|33 rpm|vinyl'],
    ['lp gas|propane|turntables?|record (players?|cleaners?|brush|storage|crates?|racks?|holders?|bags?|sleeves?|frames?)|stylus|needles?|slipmats?|decals?|wall art|stickers?|siding|flooring|plank|wrap|bags?|toys?|htv|cricut|silhouette|figures?|dolls?|gloves?|aprons?|tiles?|sheets?|rolls?|adhesive|cling|weeding|plotter|tablecloths?|banners?|letters?|lettering|fabric|cutters?']),
  rule('media-cd', CDS, ['cds?|compact discs?'],
    ['valves?|solenoids?|vac|volts?|relays?|switch(es)?|sensors?|pumps?|motors?|fittings?|pipes?|hoses?|players?|recorders?|burners?|blank|recordable|cd r|cd rw|cases?|storage|wallets?|binders?|racks?|cleaners?|drives?|cables?|changers?|jewel|towers?|lens|repair|games?|twister|milton bradley|hasbro|parker brothers|cd roms?']),
  rule('media-dvd', DVDS, ['dvds?|dvd movies?|blu rays?|bluray|4k uhd|ultra hd blu ray|uhd blu ray'],
    ['players?|recorders?|drives?|burners?|blank|dvd r|dvd rw|cases?|storage|cleaners?|lens|cables?|adapters?|remotes?|combo|games?|racks?|towers?']),
  // VHS, cassettes, laser discs, mini discs and 8-tracks have no Poshmark leaf (Media has only CDs, DVDs and Vinyl)
  blank('media-legacy-formats', ['vhs|video tapes?|video cassettes?|laser ?discs?|mini ?discs?|8 track|cassette tapes?|audio cassettes?|mixtapes?|reel to reel'],
    ['players?|recorders?|decks?|vcrs?|cleaners?|rewinders?|blank|adapters?|walkman|boombox(?:es)?']),
  rule('blank-discs', BLANK_MEDIA, ['blank (cds?|dvds?|discs?|disks?)|recordable (cds?|dvds?|discs?)|cd r|cd rw|dvd r|dvd rw|dvd plus r']),
  rule('media-cases', MEDIA_CASES, ['(cd|dvd|blu ray|media|disc) (cases?|storage|organizers?|binders?|wallets?|towers?|racks?)']),

  // ===== 3. video games =================================================================================
  rule('game-strategy-guides', GAME_GUIDES, ['strategy guides?|game guides?|player guides?|players guides?|official guides?|walkthroughs?|cheat books?|prima guides?']),
  rule('game-headsets', GAME_HEADSETS, ['gaming headsets?|gaming headphones?']),
  rule('game-controllers', CONTROLLERS, ['game ?(controllers?|pads?)|gaming controllers?|wireless controllers?|joy ?cons?|joysticks?|arcade sticks?|dualshock|dualsense|xbox controllers?|switch pro controllers?|wii remotes?|nunchuks?|steam controllers?']),
  rule('game-handhelds', HANDHELDS, ['game ?boy|gameboy|psp|ps vita|3ds|2ds|ds lite|nintendo ds|switch lite|steam deck|handheld (game )?consoles?'],
    ['games?|cases?|covers?|chargers?|cables?|skins?|cartridges?|discs?|manuals?|boxes|box only|accessor|screen protectors?']),
  rule('game-consoles', CONSOLES, ['consoles?', 'playstation|ps[1-5]|xbox|nintendo|wii|switch|n64|snes|nes|sega|genesis|dreamcast|saturn|atari|neo geo|gamecube'],
    ['games?|cases?|stands?|covers?|chargers?|cables?|controllers?|skins?|cartridges?|discs?|boxes|box only|manuals?|accessor|decor|furniture|tables?']),
  rule('game-pc', PC_GAMES, ['pc (cd rom|games?)|windows (games?|cd rom)|big box pc|steam keys?'], ['manuals?|instructions?|booklets?|inserts?|box art|strategy guides?|guides?']),
  rule('game-video-games', GAMES, ['video games?|nintendo (switch|wii|ds|64)|playstation [1-5]|ps[1-5] games?|xbox (360|one|series)|sega (genesis|saturn|dreamcast)|gamecube games?|super nintendo|snes|n64 games?|atari 2600'],
    ['consoles?|controllers?|cases?|stands?|covers?|chargers?|cables?|skins?|boxes|box only|manuals?|instructions?|booklets?|inserts?|accessor|shirts?|tees?|hoodies?|hats?|posters?|figures?|plush|keychains?|lunch box(?:es)?|backpacks?|bedding|blankets?|pillows?|decor|mugs?|marquees?|neo geo|mvs']),

  // ===== 4. trading cards, card supplies, games and puzzles ==============================================
  // Supplies first, so a "card holder" is not filed as a card.
  rule('card-binders-albums', BINDERS, ['(card|coin|stamp|baseball|pokemon|trading) (binders?|albums?|pages?|pockets?)|binder pages?|9 pocket|card pages?']),
  rule('card-supplies', STORAGE, ['toploaders?|top loaders?|card sleeves?|penny sleeves?|screw ?downs?|card savers?|(trading|sports|baseball|pokemon|graded|collectible) card (holders?|cases?|storage|boxes)|slabs? (holders?|cases?)|coin (tubes?|holders?|capsules?|flips?|storage)|magnetic (card )?holders?|bcw|ultra pro|storage box(?:es)? for cards?']),
  rule('trading-cards', TRADING_CARDS, ['trading cards?|baseball cards?|football cards?|basketball cards?|hockey cards?|sports cards?|pokemon (cards?|tcg|booster)|magic the gathering|mtg|yu gi oh|yugioh|ccg|tcg|topps|panini|upper deck|booster (packs?|box(?:es)?)|graded cards?|psa [0-9]+|bgs [0-9]+'],
    ['binders?|pages?|sleeves?|toploaders?|top loaders?|holders?|storage|boxes|album|cases?|display|stands?|posters?|shirts?|figures?|funko|plush|mugs?|lot of dvds?|playing cards?']),
  rule('playing-cards', CARD_GAMES, ['playing cards?|card games?|tarot (cards?|decks?)|poker (cards?|decks?)|uno cards?|card decks?'],
    ['trading cards?|binders?|cases?|holders?|storage|tables?|shufflers?']),
  rule('board-games', BOARD_GAMES, ['board games?|monopoly|scrabble|trivial pursuit|yahtzee|chess sets?|checkers|backgammon|dominoes|mahjong|mah jongg|cribbage|parcheesi|chinese checkers|battleship|jenga|connect four|clue board'],
    ['video games?|shirts?|tees?|posters?|ornaments?|tables?']),
  rule('outdoor-games', OUTDOOR_GAMES, ['corn ?hole|lawn (games?|darts)|horseshoes? sets?|croquet|ladder (ball|toss)|bocce|giant (jenga|connect four)|yard games?']),
  rule('puzzles', { kids: L('Kids', 'Toys', 'Puzzles & Games'), any: HOME_PUZZLES }, ['jigsaw|puzzles?'], ['video games?|puzzle (box(?:es)?|cubes?|rings?)|rubiks?|3d wood|brain teasers?|crossword (books?)|magazines?|piece (bracelets?|necklaces?)|games? for|pc games?|dvds?']),
  rule('stamps-craft', L('Home', 'Design', 'Stamps'), ['rubber stamps?|craft stamps?|clear stamps?|stamp pads?|ink stamps?']),
  // Collectible postage stamps, coins and currency: no Poshmark home
  blank('stamps-coins-currency', ['postage stamps?|stamp (collections?|albums?|lots?|sheets?)|first day covers?|philatel|coins?|numismatic|paper money|banknotes?|currency|silver dollars?|proof sets?|mint sets?|bullion|eisenhower|morgan dollars?|peace dollars?'],
    ['coin (purses?|pouch(es)?|banks?|operated|laundry|batteries|cell|holders?|tubes?|storage|flips?|capsules?)|shirts?|tees?|necklaces?|bracelets?|earrings?|rings?|jewelry|pendants?|sports cards?|trading cards?']),

  blank('coins-category', ['cat:coins and paper money'], ['coin (purses?|pouch(es)?|banks?|operated|laundry|batteries|cell|holders?|tubes?|storage|flips?|capsules?)|sports cards?|trading cards?|books?|shirts?']),

  // ===== 5. books, comics, magazines =====================================================================
  // Comics: ALWAYS Coffee Table Books, the live-verified home on Poshmark (never a magazine or toy leaf).
  rule('comics-strong', COFFEE_BOOKS, ['comic books?|comics?|manga|graphic novels?|tpbs?|trade paperbacks?|cgc|cbcs'],
    ['magazines?|mags?|periodicals?|nintendo power|game informer|trading cards?|comic con|comicon|comic sans|figures?|funko|t shirts?|tees?|posters?|hoodies?|mugs?|costumes?|lunch box(?:es)?|keychains?|bobbleheads?|dvds?|blu rays?|video games?|statues?']),
  rule('comics-publisher', COFFEE_BOOKS, ['marvel|dark horse|valiant|idw|archie|wildstorm|vertigo', 'issue|vol|volume|first print|1st print|variant|annual|key issue|number|no [0-9]+|[0-9]+ of [0-9]+'],
    ['figures?|toys?|funko|shirts?|cards?|posters?|dvds?|blu rays?|games?']),
  rule('magazines', COFFEE_BOOKS, ['magazines?|periodicals?|nintendo power|game informer|national geographic|sports illustrated|rolling stone'], ['magazine (racks?|holders?|files?)|subscriptions?']),
  rule('cookbooks', COOKBOOKS, ['cookbooks?|cook books?|recipe books?']),
  rule('coffee-table-books', COFFEE_BOOKS, ['coffee table books?|art books?|photography books?|photo books?|picture books? for adults']),
  // General books (novels, textbooks, bibles): Poshmark has no books category, so a deliberate blank.
  blank('general-books-cat', ['cat:books'],
    ['bookends?|book ends|bookshelf|bookcase|book bags?|book lights?|booklets?|notebooks?|coloring|cookbooks?|comics?|magazines?|posters?|shirts?|tees?|mugs?|totes?|dvds?|cds?|games?|magazines? and|music|movies?']),
  blank('general-books', ['novels?|paperbacks?|hardcovers?|hardbacks?|textbooks?|first editions?|bibles?|encyclopedias?|audiobooks?'],
    ['bookends?|book ends|bookshelf|bookcase|book bags?|book lights?|booklets?|notebooks?|coloring|cookbooks?|comics?|magazines?|posters?|shirts?|tees?|mugs?|totes?|dvds?|cds?|games?']),

  // ===== 6. art, wall decor, home accents ================================================================
  rule('signs', WALL_ART, ['signs?|metal signs?|tin signs?|neon signs?|porcelain signs?|enamel signs?|advertising signs?'], ['sign (in|up|out|language)|street signs?|road signs?|traffic signs?|license|yard signs?|real estate|safety signs?|stop signs?|stop sign|digital signs?|led signs?|zodiac|signs? of the zodiac|apparel']),
  rule('paintings', PAINTING, ['paintings?|oil paintings?|acrylic paintings?|watercolors?|watercolours?|canvas art'], ['by numbers|paint (brushes|sets?|kits?)|painted (furniture|chairs?)|wall paint|spray paint|paint thinner|nail|face paint|pet|portrait of']),
  rule('posters', POSTERS, ['posters?'], ['poster (board|frames?|hangers?|tubes?)|shirts?|tees?|bed|cds?|dvds?|vinyl|records?|video games?']),
  rule('art-prints', PRINTS, ['art prints?|lithographs?|etchings?|serigraphs?|giclee|woodblock|engravings?|limited edition prints?|signed prints?'], ['print (dress|shirt|skirt|blouse|top|pants|scarf|fabric)|printers?|printing|footprints?|fingerprints?']),
  rule('drawings', DRAWING, ['drawings?|illustrations?|charcoal|pastels?|sketch(es)?|pencil drawings?|original art|ink drawings?'], ['books?|coloring|pencils?|kits?|sets?|tablets?|boards?|pads?|software|apps?']),
  rule('photography-art', PHOTOGRAPHY, ['photographs?|photography prints?|fine art photography|photo prints?'], ['cameras?|paper|albums?|frames?|lens(es)?|printers?|studio|backdrops?|equipment|books?']),
  rule('sculpture', SCULPTURE, ['sculptures?|statues?|statuettes?|bronzes?|busts?'], ['bust (size|measurement)|bras?|dress(es)?|shirts?|tops?|statue of liberty|figurines?|action figures?|toys?|dolls?|plush|keychains?|ornaments?|mugs?']),
  rule('art-glass', GLASS_ART, ['art glass|blown glass|glass sculptures?|paperweights?|stained glass|murano|studio glass'], ['vases?|bowls?|plates?|dishes|cups?|mugs?|bottles?|windows?|bulbs?|screen|cleaner|panel (lamp)?']),
  rule('art-ceramics', CERAMICS, ['art pottery|studio pottery|ceramic art|hand ?thrown (pottery|ceramic)|raku'], ['vases?|bowls?|plates?|dishes|cups?|mugs?|planters?|lamps?']),
  rule('tapestries', TAPESTRIES, ['tapestry|tapestries|wall hangings?|macrame']),
  rule('wallpaper', WALLPAPER, ['wallpapers?|wall paper'], ['software|desktop|phone|app|apps']),
  rule('wall-clocks', CLOCKS, ['clocks?|cuckoo|grandfather clocks?|mantel clocks?|wall clocks?'], ['watch|smart|bracelet|wrist|alarm clock radio|clock radios?|parts?|movements?|repair|tower|clocking|around the clock|digital clock radio']),
  rule('car-mirror-video', L('Electronics', 'Car Audio, Video & GPS', 'In-Mirror Video'), ['in mirror (video|monitors?|displays?)|mirror (monitors?|dash ?cams?|cameras?)|rear view mirror (monitors?|cameras?|dash ?cams?)']),
  rule('vanity-mirrors', L('Home', 'Bath', 'Vanity Mirrors'), ['vanity mirrors?|makeup mirrors?|cosmetic mirrors?|lighted mirrors?|compact mirrors?|shaving mirrors?']),
  rule('mirrors', MIRRORS, ['mirrors?'], ['rear ?view|side (view )?mirrors?|car|truck|auto|motorcycle|telescope|mirrorless|dash|bike|bicycle|safety|convex|parts?|glass only|cameras?|reflectors?']),
  rule('wall-hooks', HOOKS, ['wall hooks?|coat hooks?|key hooks?|hooks? and racks?|hat hooks?|robe hooks?|towel hooks?'], ['fishing|crochet|grappling|hangers?']),
  rule('display-shelves', DISPLAY_SHELVES, ['floating shelves|display shel(?:f|ves)|wall shelves|wall shelf|curio shel(?:f|ves)|plate (racks?|shelves)|shadow box(?:es)?|spice racks?'], ['bookcases?|shelving units?']),
  rule('wall-art-decals', WALL_ART, ['wall (decals?|art|stickers?|plaques?|sculptures?|decor)|metal wall art|plaques?|decals?'], ['car|truck|auto|motorcycle|helmet|window|bumper|vehicle|boat|laptop|vinyl records?|bookplates?|plaque (psoriasis|remover)|dental|trophy|trophies|military|award']),
  rule('picture-frames', FRAMES, ['picture frames?|photo frames?|poster frames?|collage frames?|document frames?|diploma frames?'], ['glasses|eyeglass|sunglass|bicycle|bike|window|door|bed|tent|truck|motorcycle|safety|parts?|screen|lens|wheel']),
  rule('picture-frames-cat', FRAMES, ['cat:frames?'], ['glasses|eyeglass|sunglass|bicycle|bike|window|door|bed|tent|truck|motorcycle|safety|parts?|screen|lens|wheel']),
  rule('candles', CANDLES, ['candles?|candle holders?|candlesticks?|votives?|tea ?lights?|tapers?|candelabras?|wax melts?|wick'], ['cake|birthday|birthday candles?|lamps?|bulbs?|electric|scented soap|power|candle (making|supplies)']),
  rule('lanterns', LANTERNS, ['lanterns?'], ['laser|projector|magic lantern|paper lanterns?|chinese lanterns?|firefly|fish']),
  rule('string-lights', L('Home', 'Holiday', 'String Lights'), ['string lights?|fairy lights?|christmas lights?|holiday lights?|icicle lights?|net lights?'], ['party']),
  rule('christmas-ornaments', L('Home', 'Holiday', 'Ornaments'), ['ornaments?|christmas ornaments?|tree ornaments?'], ['car|hood|garden|ornamental|lawn|bike|hair|wrought iron|statues?|yard|automotive|mascot']),
  rule('wreaths', L('Home', 'Holiday', 'Wreaths'), ['wreaths?']),
  rule('garland', L('Home', 'Holiday', 'Garland'), ['garlands?']),
  rule('holiday-decor', HOLIDAY_DECOR, ['christmas (trees?|decor|decorations?|villages?|stockings?|figures?|figurines?|nativity)|holiday decor|halloween (decor|decorations?)|easter (decor|decorations?)|nutcrackers?|advent calendars?|snow globes?|nativity (sets?|scenes?)|thanksgiving decor|fourth of july decor'], ['shirts?|sweaters?|pajamas?|costumes?|cards?|movies?|dvds?|cds?|records?|vinyl|books?|wrap|gift']),
  rule('faux-florals', FAUX_FLORALS, ['faux (flowers?|florals?|plants?|greenery)|artificial (flowers?|plants?|florals?|greenery)|silk (flowers?|florals?)|fake flowers?|dried flowers?']),
  rule('door-mats', DOOR_MATS, ['door ?mats?|welcome mats?|entry mats?']),
  rule('furniture-covers', FURNITURE_COVERS, ['slipcovers?|furniture covers?|sofa covers?|couch covers?|chair covers?|loveseat covers?|recliner covers?']),
  rule('curtains', CURTAINS, ['curtains?|drapes?|drapery|draperies|valances?|curtain panels?'], ['shower|curtain (rods?|rings?|hooks?)|rods?|rings?|call|raiser|wall']),
  rule('vases', VASES, ['vases?'], ['vacuum']),
  rule('accent-pillows', ACCENT_PILLOWS, ['throw pillows?|accent pillows?|decorative pillows?|pillow covers?|cushions?|cushion covers?'], ['seat cushions?|chair cushions?|pet|dog|cat|bed|boat|patio|outdoor furniture|memory foam|pillow pet|neck']),
  rule('figurines-decor', DECOR, ['figurines?|knick knacks?|knickknacks?|home decor|decorative (objects?|accents?|boxes|bowls?|trays?|items?)|bookends?|trinket (boxes|dishes)|decorative plates?|collectors? plates?|wall plates?|commemorative plates?|globes?|hummel|lladro|royal doulton|swarovski|music box(?:es)?|doorstops?|door stops?|nautical decor|farmhouse decor'], ['action|funko|pop|anime|star wars|marvel|lego|dolls?|toys?|wine|globe (valves?|lights?|bulbs?)|charms?|necklaces?|bracelets?|earrings?|rings?|pendants?|ornaments?|christmas|shirts?|tees?|mugs?']),
  rule('lighting', DECOR, ['lamps?|lamp shades?|chandeliers?|sconces?|light fixtures?|lighting fixtures?|pendant lights?|table lamps?|floor lamps?|desk lamps?|tiffany'],
    ['grow|head ?lamps?|heat lamps?|uv|led strips?|strip lights?|string lights?|flashlights?|bike|car|bulbs?|lava|salt|night ?lights?|tanning|clip on reading|surgical|dental|replacement|parts?|projector|fish|tank|aquarium|sun lamps?|therapy|work lights?|shop lights?']),
  rule('storage-bins', STORAGE, ['storage (box(?:es)?|containers?|totes?|cubes?|bins?|organizers?|solutions?)|organizers?'], ['jewelry|makeup|cosmetic|desk|shoe|closet|spice|tool|toolbox|medicine|drawer|kitchen|pantry|file|filing|mail|cable|cord|car|trunk|vacuum|storage (shed|unit|locker)|drawer organizers?']),
  rule('baskets', BASKETS, ['baskets?|wicker baskets?|woven baskets?|decorative bins?|storage baskets?'], ['basketball|basket ball|gift baskets?|easter baskets?|hampers?|bike|bicycle|shopping|laundry|fishing|picnic']),

  // ===== 7. kitchen, dining, bath, bedding, office, party ==============================================
  rule('water-bottles', L('Home', 'Dining', 'Water Bottles & Thermoses'), ['water bottles?|thermos|thermoses|stanley (cups?|tumblers?|quenchers?)|yeti (cups?|tumblers?|ramblers?)|hydro flask|insulated (tumblers?|bottles?|mugs?)|travel mugs?|sports bottles?']),
  rule('drinkware', L('Home', 'Dining', 'Drinkware'), ['drinking glass(?:es)?|wine glass(?:es)?|shot glass(?:es)?|beer glass(?:es)?|cocktail glass(?:es)?|champagne (flutes?|glass(?:es)?)|stemware|goblets?|tumblers?|steins?|beer mugs?|pint glass(?:es)?|highball|old fashioned glass(?:es)?|glassware|carafes?|pitchers?|coupe glass(?:es)?'], ['stanley|yeti|insulated|dogs?|cats?|pet|figurines?|ornaments?|shirts?|tees?']),
  rule('bar-accessories', L('Home', 'Dining', 'Bar Accessories'), ['decanters?|cocktail shakers?|bar (tools?|sets?|carts?|spoons?)|jiggers?|bottle openers?|corkscrews?|wine (openers?|stoppers?|racks?|coolers? bags?)|ice buckets?|barware|coasters?|bar mats?']),
  rule('mugs', MUGS, ['mugs?|coffee cups?|cups and mugs|tea cups?|teacups?'], ['mug (shots?|warmers?)|beer mugs?|travel|insulated|shirts?|tees?|hoodies?|ornaments?|heated|mugshot']),
  rule('flatware', L('Home', 'Dining', 'Flatware'), ['flatware|silverware|silver plated (forks?|spoons?|knives)|sterling (flatware|silver) (sets?|forks?|spoons?)|chopsticks?|cutlery sets?']),
  rule('serving-utensils', L('Home', 'Dining', 'Serving Utensils'), ['serving (spoons?|forks?|tongs?|utensils?|sets?)|salad (servers?|tongs?)|cake servers?|pie servers?|butter knives|ladles?']),
  rule('serveware', L('Home', 'Dining', 'Serveware'), ['serving (bowls?|platters?|trays?|dish(?:es)?|plates?)|platters?|tureens?|casserole dish(?:es)?|gravy boats?|butter dish(?:es)?|cake (stands?|plates?|domes?)|punch bowls?|chafing|compotes?|pedestal (bowls?|dish(?:es)?)|relish (trays?|dish(?:es)?)|deviled egg'], ['pet|dog|cat|bird|feeders?']),
  rule('dinnerware', DINNERWARE, ['dinnerware|dinner plates?|salad plates?|dessert plates?|bread plates?|china (sets?|plates?)|dish sets?|place settings?|saucers?|soup bowls?|cereal bowls?|pasta bowls?|dishes'], ['pet|dog|cat|bird|satellite|dishwasher|dish (soap|rack|drainers?|washing)|soap dish(?:es)?|baking dish(?:es)?|pie dish(?:es)?|license|hot plates?|rolling|dishwashers?']),
  rule('table-linens', L('Home', 'Dining', 'Table Linens'), ['table linens?|tablecloths?|table cloths?|table runners?|placemats?|place mats?|cloth napkins?|napkin (sets?|rings?)|napkins?'], ['paper napkins?|disposable|sanitary|diapers?|baby']),
  rule('kitchen-linens', L('Home', 'Kitchen', 'Kitchen Linens'), ['kitchen towels?|dish towels?|tea towels?|dish cloths?|oven mitts?|pot holders?|aprons?|kitchen (curtains?|mats?)'], ['work aprons?|welding|leather aprons?|lead|apron (front|sink)|aprons? sinks?']),
  rule('cookbooks-kitchen', COOKBOOKS, ['cookbooks?']),
  rule('bakeware', L('Home', 'Kitchen', 'Bakeware'), ['bakeware|baking (pans?|sheets?|dish(?:es)?|molds?|stones?|trays?)|cake pans?|muffin (pans?|tins?)|loaf pans?|cookie (sheets?|cutters?)|bundt|pie (plates?|pans?|dish(?:es)?)|springform|cooling racks?|sheet pans?|jelly roll pans?']),
  // (The extension's own prohibited-items check runs before any category is picked and refuses titles containing knife or wine; this layer only says where an allowed item belongs.)
  rule('knives-cutlery', L('Home', 'Kitchen', 'Knives & Cutlery'), ['knives|knife sets?|steak knives|chef knives|chefs knives|kitchen knives|cleavers?|knife blocks?|santoku|paring kni(?:fe|ves)|bread kni(?:fe|ves)|carving (sets?|kni(?:fe|ves))'], ['pocket|hunting|survival|switchblade|butterfly|throwing|combat|bowie|tactical|dagger|sword|machete|butter knives|books?|dvds?|video games?']),
  rule('cookware', COOKWARE, ['cookware|cast iron (skillets?|pans?|pots?|dutch ovens?|cookware)|skillets?|frying pans?|saucepans?|stock ?pots?|dutch ovens?|woks?|roasting pans?|saute pans?|pressure cookers? pots?|le creuset|calphalon|all clad|griddles?|casseroles?'], ['dishes|figurines?|decor|toys?|play|kids?|dollhouse|miniature']),
  rule('coffee-tea', L('Home', 'Kitchen', 'Coffee & Tea Accessories'), ['tea (kettles?|pots?|sets?|infusers?|strainers?|bags? holders?)|teapots?|coffee (pots?|press(?:es)?|filters?|mills?|servers?)|french press|moka pots?|percolators?|tea ?kettles?|whistling kettles?|stovetop kettles?|creamers?|sugar bowls?|tea (caddy|caddies|cozy|cozies)'], ['electric|keurig|nespresso|espresso machines?|drip|toys?|play']),
  rule('bbq-tools', L('Home', 'Kitchen', 'BBQ & Grilling Tools'), ['bbq (tools?|sets?|utensils?|accessories|brush(es)?)|grill(ing)? (tools?|sets?|utensils?|brush(es)?|tongs?|spatulas?|accessories|mats?|baskets?)|barbecue (tools?|sets?|utensils?|accessories)|smoker (box(?:es)?|chips?)|grill (covers?)']),
  rule('food-storage', FOOD_STORAGE, ['canisters?|food storage|tupperware|rubbermaid|mason jars?|cookie jars?|storage jars?|canning jars?|bread box(?:es)?|glasslock|pyrex storage|lunch box(?:es)?|bento'], ['candle|shirts?|tees?|backpacks?|figurines?|ornaments?|toys?|metal lunch box(?:es)? collectibles?']),
  rule('kitchen-tools', L('Home', 'Kitchen', 'Kitchen Tools'), ['cutting boards?|colanders?|graters?|peelers?|can openers?|measuring (cups?|spoons?)|mixing bowls?|rolling pins?|mandolines?|zesters?|garlic press|salad spinners?|kitchen scales?|kitchen gadgets?|meat (tenderizers?|thermometers?)|potato mashers?|mortar and pestle|cheese (slicers?|graters?)|nutcrackers? kitchen'], ['pet|dog|cat|toys?|play|figurines?']),
  rule('cooking-utensils', L('Home', 'Kitchen', 'Cooking Utensils'), ['cooking utensils?|spatulas?|whisks?|wooden spoons?|slotted spoons?|kitchen tongs?|utensil (sets?|holders?)|turners?|basting brush'], ['pet|toys?|play|dog|cat']),
  rule('shower-curtains', L('Home', 'Bath', 'Shower Curtains'), ['shower curtains?|shower curtain (liners?|sets?)']),
  rule('bath-towels', L('Home', 'Bath', 'Bath Towels'), ['bath towels?|bath sheets?|towel sets?']),
  rule('hand-towels', L('Home', 'Bath', 'Hand Towels'), ['hand towels?|guest towels?|fingertip towels?']),
  rule('beach-towels', L('Home', 'Bath', 'Beach Towels'), ['beach towels?|pool towels?']),
  rule('wash-cloths', L('Home', 'Bath', 'Wash Cloths'), ['wash ?cloths?|face cloths?|washcloths?']),
  rule('bath-mats', L('Home', 'Bath', 'Mats'), ['bath mats?|bath rugs?|bathroom rugs?|bathmats?|bath mat sets?|contour (mats?|rugs?)']),
  rule('bath-accessories', L('Home', 'Bath', 'Bath Accessories'), ['soap (dish(?:es)?|dispensers?|pumps?)|toothbrush holders?|bathroom accessories|tissue (box )?(holders?|covers?)|toilet paper holders?|bath accessory sets?|bathroom (sets?|canisters?)|toilet brush(es)?|bath caddy|bath caddies']),
  rule('bath-storage', L('Home', 'Bath', 'Bath Storage'), ['bathroom (shel(?:f|ves)|storage|organizers?|cabinets?)|towel (racks?|bars?|rings?|holders?)|over the toilet|shower (caddy|caddies|shel(?:f|ves))'], ['hooks?']),
  rule('vanity-trays', L('Home', 'Bath', 'Vanity Trays'), ['vanity trays?|perfume trays?|dresser trays?|jewelry trays?'], ['jewelry (organizers?|box(?:es)?)']),
  rule('comforters', L('Home', 'Bedding', 'Comforters'), ['comforters?|comforter sets?|bed in a bag'], ['pet|dog|cat|baby|crib|doll|toy']),
  rule('duvet-covers', L('Home', 'Bedding', 'Duvet Covers'), ['duvet covers?|duvet cover sets?|duvets?'], ['pet|dog|cat|baby|crib']),
  rule('quilts', L('Home', 'Bedding', 'Quilts'), ['quilts?|bedspreads?|coverlets?|patchwork (quilts?|throws?)'], ['quilting|quilted (jackets?|vests?|coats?|bags?|purses?|totes?|pants|robes?|skirts?)|quilt (fabric|batting|patterns?|kits?|rulers?|blocks?)|quilt of|baby|crib|doll|pet|dog|cat']),
  rule('sheets', L('Home', 'Bedding', 'Sheets'), ['bed ?sheets?|sheet sets?|fitted sheets?|flat sheets?|bed sheets?|pillowcases? sets?|crib sheets?'], ['sheet (music|pans?|metal|mask|masks|protectors?|cake)|baking|cookie|metal|plastic|stickers?|face|plywood|tin|foam|crib|baby|toddler']),
  rule('mattress-covers', L('Home', 'Bedding', 'Mattress Covers'), ['mattress (pads?|covers?|toppers?|protectors?)|egg ?crate|featherbeds?']),
  rule('bed-pillows', L('Home', 'Bedding', 'Pillows'), ['bed pillows?|sleeping pillows?|memory foam pillows?|down pillows?|body pillows?|pillow inserts?|pillow forms?'], ['throw|accent|decorative|pet|dog|cat|neck|travel|nursing']),
  rule('blankets-throws', L('Home', 'Bedding', 'Blankets & Throws'), ['blankets?|throws?|afghans?|throw blankets?'], ['electric|horse|saddle|dog|cat|pet|baby|swaddl|receiving|holiday|christmas|pillows?|rugs?|throw (up|away|back)|throwing|spacers?|stars?|horse blankets?|wearable|hooded|poncho|picnic']),
  rule('notebooks-journals', L('Home', 'Office', 'Notebooks & Journals'), ['notebooks?|journals?|diaries|composition books?|sketchbooks?|spiral notebooks?'], ['laptops?|notebook (computers?|pcs?|cases?|bags?|sleeves?|stands?)|chromebook|macbook|samsung|hp|dell|lenovo|acer|asus|computers?|bags?']),
  rule('planners', L('Home', 'Office', 'Planners'), ['planners?|day planners?|agendas?|datebooks?|day runner'], ['wedding planners? books?|meal prep|ridge|trip|vacation planning']),
  rule('calendars', L('Home', 'Office', 'Calendars'), ['calendars?|wall calendars?|desk calendars?'], ['advent|software|app|apps|digital']),
  rule('label-makers', L('Home', 'Office', 'Labels & Label Makers'), ['label makers?|dymo|p touch|labels? (sheets?|rolls?)|shipping labels?|address labels?|avery labels?'], ['record labels?|designer labels?|wine labels?|vintage (tags?|labels?)']),
  rule('shipping-supplies', L('Home', 'Office', 'Shipping Supplies'), ['shipping (supplies|boxes|tape|materials)|mailers?|bubble mailers?|packing (tape|supplies|peanuts)|poly mailers?|bubble wrap|packaging (supplies|materials)|tape guns?|shipping scales?'], ['pc|computers?|cat|dog|dvds?|games?']),
  rule('pencil-cases', L('Home', 'Office', 'Pencil Cases'), ['pencil (cases?|pouch(es)?|boxes|bags?)']),
  rule('stationery', L('Home', 'Office', 'Stationery'), ['stationery|stationary|note ?cards?|letterheads?|envelopes?|fountain pens?|pen sets?|notepads?|memo pads?|writing paper|desk sets?|paper clips?|staplers?|scissors|tape dispensers?|sticky notes?|post it'], ['envelope (bags?|purses?|clutch|dress)|clutch|purses?|pillows?|shirts?|tees?|cat scissors?|hair|sewing|fabric|garden|pruning|kitchen|poultry|dog']),
  rule('binders-folders', BINDERS, ['binders?|file folders?|portfolio (folders?|cases?)|three ring binders?|presentation folders?|accordion files?'], ['card|coin|stamp|baseball|pokemon|trading|photo (albums?)|album|dvds?|cds?']),
  rule('arts-and-crafts', L('Home', 'Office', 'Arts & Crafts'), ['craft (supplies|kits?|paper|lots?)|art supplies|scrapbook(ing)?|yarn|skeins?|embroidery|cross stitch|knitting|crochet|sewing (notions|patterns?|supplies|kits?)|quilting (fabric|supplies)|fabric (bolts?|remnants?|yardage|lots?)|paint (brushes|sets?)|watercolor sets?|colored pencils?|beading (supplies|kits?)|craft (beads?|buttons?)|felt (sheets?|squares?)|pom poms?|pipe cleaners?'], ['necklaces?|bracelets?|earrings?|rings?|jewelry|shirts?|dress(es)?|pants|sweaters?|cardigans?|blankets?|hats?|scarf|scarves|gloves?|mittens?|socks?|finished|completed|handmade']),
  rule('birthday-cards', L('Home', 'Design', 'Birthday Cards'), ['birthday cards?'], ['trading|game|gift cards?|playing|baseball']),
  rule('thank-you-cards', L('Home', 'Design', 'Thank You Cards'), ['thank you cards?|thank you notes?'], ['trading|game|gift cards?|playing|baseball']),
  rule('cake-toppers', L('Home', 'Party Supplies', 'Cake Toppers'), ['cake toppers?']),
  rule('cake-candles', L('Home', 'Party Supplies', 'Cake Candles'), ['birthday candles?|cake candles?|number candles?']),
  rule('gift-wrap', L('Home', 'Party Supplies', 'Gift Wrap'), ['gift wrap|wrapping paper|gift bags?|gift boxes|(?:empty|small|large|medium|cardboard|kraft|paper|decorative|magnetic|rigid|nesting) gift box(?:es)?|tissue paper|gift (tags?|bows?|ribbons?)|ribbons? (rolls?|spools?)'], ['basket|card|certificates?|cards? lot']),
  rule('party-favors', L('Home', 'Party Supplies', 'Favors'), ['party favors?|favors? (bags?|boxes)|goodie bags?|treat bags?']),
  rule('party-disposables', L('Home', 'Party Supplies', 'Disposable Tableware'), ['disposable (plates?|cups?|tableware|napkins?|cutlery|utensils?)|paper (plates?|cups?|napkins?)|plastic (cups?|plates?|cutlery)|party (plates?|cups?|napkins?)']),
  rule('party-hats', L('Home', 'Party Supplies', 'Hats'), ['party hats?|birthday hats?|cone hats?']),
  rule('party-lights', L('Home', 'Party Supplies', 'Party Lights'), ['party lights?|disco (balls?|lights?)|laser lights?|strobe lights?']),
  rule('party-invitations', L('Home', 'Party Supplies', 'Cards & Invitations'), ['invitations?|invites?|party invitations?'], ['cards? against|trading|game']),
  rule('media-streamers', L('Electronics', 'Media', 'Media Streamers'), ['media streamers?|streaming (devices?|players?|sticks?|box(?:es)?)|roku|apple tv|fire (tv )?stick|chromecast|nvidia shield']),
  rule('party-decorations', L('Home', 'Party Supplies', 'Decorations'), ['party (decorations?|supplies|decor|banners?|streamers?|balloons?|supplies)|balloons?|banners?|streamers?|confetti|pinatas?|piñatas?|photo booth props?|pom pom decorations?'], ['hot air|toy|weather|sports|football|helmets?|balloon (animals?|artist)|banner (ads?|stands?|software)|pull up|retractable|vinyl banners?|trade show']),
  rule('closet-organizers', CLOSET, ['shoe (organizers?|racks?|boxes|storage|shelves)|closet (organizers?|accessories|rods?|hangers?|systems?)|hangers?|hat (box(?:es)?|racks?)|sweater (box(?:es)?|bags?)|clothes (racks?|hangers?)'], ['clothing racks?|garment racks?|coat racks?|display|fixtures?|commercial|store|retail|photo|hanger (steak|skirt|bolts?|bearings?)']),
  rule('jewelry-organizers', L('Home', 'Storage & Organization', 'Jewelry Organizers'), ['jewelry (box(?:es)?|organizers?|stands?|trays?|holders?|armoires?|cases?|display|rolls?|boxes)|ring holders?|earring holders?|necklace (stands?|holders?|hangers?|organizers?)|watch (box(?:es)?|cases?|organizers?)']),
  rule('makeup-organizers', L('Home', 'Storage & Organization', 'Makeup Organizers'), ['makeup (organizers?|storage|cases?|train cases?|stands?|boxes|trays?|vanity organizers?)|cosmetic (organizers?|storage|trays?|towers?)|brush holders? makeup']),
  rule('garment-bags', L('Home', 'Storage & Organization', 'Garment Bags'), ['garment bags?|suit bags?|dress bags?|gown bags?|hanging garment']),
  rule('drawer-liners', L('Home', 'Storage & Organization', 'Drawer Liners'), ['drawer liners?|shelf liners?|scented liners?']),

  // ===== 8. electronics ================================================================================
  rule('cam-digital', L('Electronics', 'Cameras, Photo & Video', 'Digital Cameras'), ['digital cameras?|point and shoot|dslr|mirrorless cameras?|cybershot|powershot|coolpix|lumix|eos rebel|compact cameras?'], ['bags?|cases?|straps?|lens(es)?|tripods?|flash|chargers?|batteries|parts?|manuals?|for parts|security|surveillance|ring|nanny|baby|webcams?|dash']),
  rule('cam-film', L('Electronics', 'Cameras, Photo & Video', 'Film Photography'), ['film cameras?|35mm|polaroid|instant cameras?|medium format|disposable cameras?|rangefinder|slr film|film (rolls?|canisters?)|darkroom|enlargers?|developing tanks?'], ['bags?|cases?|straps?|posters?|prints?|shirts?|frames?|sunglasses|lens caps?|photos?']),
  rule('cam-video', L('Electronics', 'Cameras, Photo & Video', 'Video'), ['camcorders?|video cameras?|action cameras?|gopro|handycam'], ['bags?|cases?|straps?|mounts?|batteries|chargers?|parts?|for parts|dash']),
  rule('cam-lens', L('Electronics', 'Cameras, Photo & Video', 'Lenses'), ['camera lens(es)?|telephoto lens(es)?|zoom lens(es)?|prime lens(es)?|wide angle lens(es)?|macro lens(es)?|lens (caps?|hoods?|filters?)'], ['contact|eyeglass|sunglass|reading|magnifying|lens(?:es)? cleaning|glasses|cleaner|cloths?|lens (flares?)']),
  rule('cam-bags', L('Electronics', 'Cameras, Photo & Video', 'Bags & Cases'), ['camera (bags?|cases?|backpacks?|pouch(es)?)']),
  rule('cam-tripods', L('Electronics', 'Cameras, Photo & Video', 'Tripods & Monopods'), ['tripods?|monopods?|selfie sticks?'], ['telescopes?|mic|microphone|speaker|light stands?|music|drum|projector']),
  rule('cam-flash', FLASHES, ['camera flash(es)?|flash units?|speedlights?|flashes|strobes?|speedlites?'], ['flashlights?|memory|flash drives?|dash']),
  rule('cam-binoculars', BINOCULARS, ['binoculars?|telescopes?|spotting scopes?|monoculars?'], ['rifle|gun|hunting scopes?|firearms?|shirts?|tees?|toys?|play|kids?']),
  rule('cam-straps', L('Electronics', 'Cameras, Photo & Video', 'Camera Straps'), ['camera straps?|neck straps?|wrist straps? camera']),
  rule('cam-memory', L('Electronics', 'Cameras, Photo & Video', 'Memory Cards'), ['memory cards?|sd cards?|compact flash|micro ?sd|sdhc|sdxc|cf cards?'], ['readers?|adapters?|cases?|holders?|wallets?']),
  rule('laptops', L('Electronics', 'Computers, Laptops & Parts', 'Laptops'), ['laptops?|notebook (computers?|pcs?)|macbook|chromebook|thinkpad|ultrabook'], ['bags?|cases?|sleeves?|stands?|chargers?|batteries|skins?|screens?|covers?|keyboards?|desks?|backpacks?|parts?|for parts|totes?|bundles?|decals?|stickers?|docks?|hinges?|cooling|cables?|adapters?|power (adapters?|suppl(?:y|ies))|journals?']),
  rule('game-keyboards', L('Electronics', 'Video Games & Consoles', 'Keyboards'), ['gaming keyboards?|mechanical gaming keyboards?|keypads? for gaming'], ['mice|mouse|combos?|bundles?']),
  rule('tablet-keyboards', L('Electronics', 'Tablets & Accessories', 'Tablet Keyboards'), ['tablet keyboards?|ipad keyboards?|keyboard (case|folio) (for )?(ipad|tablet)|(ipad|tablet) keyboard (case|folio)']),
  // A keyboard-and-mouse bundle fits neither the Keyboards nor the Mice leaf: deliberate blank.
  blank('keyboard-mouse-combo', ['keyboards?', 'mouse|mice'], ['pads?|traps?|mickey|minnie|plush|toys?|piano|midi|synth']),
  rule('computer-keyboards', L('Electronics', 'Computers, Laptops & Parts', 'Keyboards'), ['keyboards?|keypads?'], ['piano|midi|synth|synthesizers?|casio|yamaha|roland|korg|organs?|electronic keyboards?|musical|mouse|mice|stands?|covers?|bundles?|combos?|nord|arturia|akai|novation|studio|instruments?|trays?|wrist rests?|bluetooth ipad']),
  rule('computer-mice', L('Electronics', 'Computers, Laptops & Parts', 'Mice'), ['computer mouse|wireless mouse|gaming mouse|optical mouse|bluetooth mouse|trackballs?|mice'], ['mouse (pads?|traps?|ears?|hats?|costumes?)|mickey|minnie|plush|toys?|keyboards?|bundles?|combos?|traps?|rat']),
  rule('webcams', L('Electronics', 'Computers, Laptops & Parts', 'Webcams'), ['webcams?|web cams?']),
  rule('graphics-cards', L('Electronics', 'Computers, Laptops & Parts', 'Graphics Cards'), ['graphics cards?|video cards?|gpus?|rtx|gtx|radeon|geforce'], ['laptops?|bags?|stands?|brackets?|backplates?|cables?|risers?']),
  rule('usb-hubs', L('Electronics', 'Computers, Laptops & Parts', 'USB Hubs'), ['usb hubs?|usb c hubs?|docking stations?']),
  rule('surge-protectors', L('Electronics', 'Computers, Laptops & Parts', 'Surge Protectors'), ['surge protectors?|power strips?|surge strips?']),
  rule('single-board', L('Electronics', 'Computers, Laptops & Parts', 'Single Board Computers'), ['raspberry pi|arduino|beaglebone|single board computers?|odroid']),
  rule('computer-external', L('Electronics', 'Computers, Laptops & Parts', 'External Components'), ['external (hard )?(drives?|disks?)|usb flash drives?|thumb drives?|flash drives?|usb sticks?|pen drives?|portable (ssd|hdd)'], ['cases?|enclosures?|docks?|cables?']),
  rule('surround-processors', L('Electronics', 'Car Audio, Video & GPS', 'Surround Processors'), ['surround (sound )?processors?|av processors?|home theater processors?|dolby (digital )?processors?']),
  rule('computer-internal', L('Electronics', 'Computers, Laptops & Parts', 'Internal Components'), ['motherboards?|cpus?|computer processors?|intel (core|xeon|pentium|celeron)|amd (ryzen|athlon|fx)|ryzen|threadripper|ram|memory (modules?|sticks?)|ssds?|hdds?|hard (drives?|disks?)|power supply units?|psu|cooling fans?|heat ?sinks?|sound cards?|network cards?'], ['laptops?|bags?|cases?|stands?|enclosures?|external|usb|food|kitchen|cars?|vehicles?|trucks?|auto']),
  rule('tablets', L('Electronics', 'Tablets & Accessories', 'Tablets'), ['tablets?|ipads?|galaxy tabs?|fire tablets?|surface (pro|go)'], ['cases?|covers?|stands?|keyboards?|chargers?|screen protectors?|sleeves?|skins?|stylus(?:es)?|pens?|bags?|holders?|mounts?|bundles?|aspirins?|pills?|vitamins?|medicine|writing|bed|desks?|stationery|drawing|pads?|dosage|water|tablet (cloths?|weave)|tablecloths?']),
  rule('ebook-readers', L('Electronics', 'Tablets & Accessories', 'eBook Readers'), ['ebook readers?|e readers?|kindle|nook|kobo'], ['cases?|covers?|books?|bundles?|gift|stands?|lights?']),
  rule('smartwatches', L('Electronics', 'Wearables', 'Smartwatches'), ['smart ?watch(es)?|apple watch|fitbit|garmin (forerunner|fenix|vivo|watch)|galaxy watch|fitness trackers?|activity trackers?'], ['bands?|straps?|cases?|chargers?|screen protectors?|docks?|stands?|bumpers?|covers?|bracelets?']),
  rule('cell-phones', L('Electronics', 'Cell Phones & Accessories', 'Cell Phones'), ['cell phones?|smartphones?|iphone|galaxy s[0-9]+|pixel [0-9]+|mobile phones?|flip phones?|android phones?'], ['cases?|covers?|chargers?|screen protectors?|skins?|bumpers?|stands?|holders?|mounts?|straps?|lanyards?|cables?|pop ?sockets?|wallets?|bags?|clips?|armbands?|batteries|for parts|parts|dummy|replica|toys?|tripods?']),
  rule('phone-cases', { women: L('Women', 'Accessories', 'Phone Cases'), men: L('Men', 'Accessories', 'Phone Cases'), any: L('Electronics', 'Cell Phones & Accessories', 'Cases') }, ['phone cases?|phone covers?|iphone( [0-9a-z]+){0,3} (cases?|covers?)|galaxy( [0-9a-z]+){0,3} (cases?|covers?)|pixel( [0-9a-z]+){0,2} (cases?|covers?)'], ['wallets?|bundles?']),
  rule('gps', GPS, ['gps (units?|navigators?|devices?|receivers?)|garmin (nuvi|drive|zumo|etrex)|tomtom|navigation (systems?|units?)'], ['mounts?|cases?|cables?|chargers?|antennas?|watch|trackers?|dog|pet|collars?']),
  rule('car-stereo', L('Electronics', 'Car Audio, Video & GPS', 'Car Stereo Receivers'), ['car (stereos?|receivers?|radios?|head units?)|head units?|in dash (receivers?|stereos?)|double din|single din'], ['antennas?|mounts?|trim|dash kits?|harness(es)?|wiring']),
  rule('car-amps', L('Electronics', 'Car Audio, Video & GPS', 'Amplifiers'), ['car (amps?|amplifiers?)|subwoofer amplifiers?|monoblock'], ['guitar|bass guitar|instrument|home|studio|pa|headphone']),
  rule('dash-cams', L('Electronics', 'Car Audio, Video & GPS', 'On-Dash Cameras'), ['dash ?cams?|dash cameras?|car (dvr|cameras?)'], ['mounts?|cables?|cases?|sd']),
  rule('backup-cams', L('Electronics', 'Car Audio, Video & GPS', 'Vehicle Backup Cameras'), ['backup cameras?|rear ?view cameras?|reverse cameras?|reversing cameras?'], ['mounts?|cables?|monitors? only']),
  rule('wireless-routers', L('Electronics', 'Networking', 'Wireless Routers'), ['wireless routers?|wifi routers?|wi fi routers?|mesh (wifi|routers?|systems?)|routers? (wifi|wireless|wi fi)'], ['cnc|wood|router bits?|plunge|trim|woodworking|table|laminate|bits?']),
  rule('modem-router', L('Electronics', 'Networking', 'Modem-Router Combos'), ['modem router|modem and router|gateways?|modem router combos?'], ['cnc|wood']),
  rule('modems', L('Electronics', 'Networking', 'Modems'), ['modems?|cable modems?|dsl modems?'], ['router|gateway|routers?|cnc|wood']),
  rule('headphones-earbuds', L('Electronics', 'Headphones', 'Earbud Headphones'), ['earbuds?|ear buds?|in ear (headphones?|monitors?)|earphones?|airpods?|true wireless|iems?'], ['cases?|covers?|tips?|pads?|holders?|chargers?|hooks?|replacement|cables?|adapters?|plugs?|cleaners?|shirts?|stickers?|ear plugs?|earplugs?|hearing protection|ear muffs?|earmuffs?']),
  rule('headphones-over', L('Electronics', 'Headphones', 'Over-Ear Headphones'), ['over ear headphones?|over the ear headphones?|studio headphones?|noise cancell?ing headphones?|noise canceling headphones?|beats studio|sony wh|bose (quietcomfort|qc)|gaming headsets?|dj headphones?'], ['cases?|covers?|pads?|holders?|chargers?|stands?|hooks?|replacement|cables?|adapters?|cleaners?|ear muffs?|earmuffs?|hearing protection']),
  rule('headphones-on-ear', L('Electronics', 'Headphones', 'On-Ear Headphones'), ['on ear headphones?|on the ear headphones?|beats solo'], ['cases?|covers?|pads?|stands?|replacement|cables?|adapters?']),
  rule('portable-boombox', L('Electronics', 'Portable Audio & Video', 'Boomboxes'), ['boombox(?:es)?|boom box(?:es)?|ghetto blasters?'], ['cds?|cassettes?|vinyl|records?|posters?|shirts?']),
  rule('portable-cassette', L('Electronics', 'Portable Audio & Video', 'Cassette Players'), ['cassette players?|walkman|personal cassette'], ['tapes?|cassettes? lot|vinyl|records?']),
  rule('portable-mp3', L('Electronics', 'Portable Audio & Video', 'MP3 & MP4 Players'), ['mp3 players?|mp4 players?|ipods?|zune|sansa|digital audio players?'], ['cases?|docks?|chargers?|cables?|speakers?|armbands?|covers?|adapters?|batteries']),
  rule('portable-speakers', L('Electronics', 'Portable Audio & Video', 'Portable Speakers'), ['portable speakers?|bluetooth speakers?|wireless speakers?|jbl (flip|charge|go|clip)|bose soundlink|ue boom|marshall (emberton|stockwell|willen)|sonos roam'], ['studio|monitors?|pa|car|automotive|guitar|stands?|mounts?|cases?|covers?|straps?|chargers?|home theater']),
  rule('portable-cd', L('Electronics', 'Portable Audio & Video', 'Portable CD Players'), ['portable cd players?|discman|personal cd']),
  rule('portable-dvd', L('Electronics', 'Portable Audio & Video', 'Portable DVD Players'), ['portable dvd players?']),
  rule('two-way-radios', L('Electronics', 'Portable Audio & Video', 'CB & Two-Way Radios'), ['walkie ?talkies?|two way radios?|cb radios?|ham radios?|handheld radios?|amateur radios?|baofeng|gmrs'], ['toys?|play|kids?|antennas?|microphones?|mics?|cases?|clips?|batteries|chargers?|licenses?']),
  rule('satellite-radio', L('Electronics', 'Car Audio, Video & GPS', 'Satellite Radio'), ['satellite radios?|sirius ?xm|xm radios?'], ['antennas?|subscriptions?']),
  rule('radios', L('Electronics', 'Portable Audio & Video', 'Radios'), ['radios?|transistor radios?|pocket radios?|shortwave|am fm radios?|weather radios?'], ['radio (flyers?|flyer)|car|automotive|clock|alarm|two way|cb|ham|amateur|walkie|toy|kids?|controlled|rc|remote|stations?|shows?|dvds?|books?|signs?|posters?|vinyl|records?|cds?|cases?|antennas?|microphones?|mics?|vintage radio ?(flyer|tubes?)|tubes?|repair|parts?|manuals?|schematics?|gaming|hunting|phonographs?|record players?|turntables?|stereo|receivers?|speakers?']),
  rule('computer-mounts-stands', L('Electronics', 'Computers, Laptops & Parts', 'Mounts & Stands'), ['monitor (stands?|mounts?|arms?)|laptop stands?|tv mounts? stands?'], ['tvs?|televisions?|furniture|tv stands?']),
  rule('game-batteries-chargers', L('Electronics', 'Video Games & Consoles', 'Batteries & Chargers'), ['(controller|console|game|gaming) (batteries|charging|chargers?|docks?)|charging (stations?|docks?) (for )?(controllers?|consoles?)']),
  rule('game-cables', L('Electronics', 'Video Games & Consoles', 'Cables'), ['(av|hdmi|power|composite|component|console|game) cables? (for )?(ps[1-5]|xbox|nintendo|snes|n64|sega|gamecube|wii)|(ps[1-5]|xbox|nintendo|snes|n64|sega|gamecube|wii) (av|hdmi|power|composite|component) cables?']),

  // ===== 9. toys and pets ===============================================================================
  rule('toys-building', L('Kids', 'Toys', 'Building Sets & Blocks'), ['legos?|lego sets?|building (sets?|blocks?)|mega bloks|k ?nex|duplo|erector sets?|lincoln logs|tinker toys?|magna ?tiles?|mini ?figures?'], ['shirts?|tees?|hoodies?|bedding|blankets?|posters?|mugs?|backpacks?|lunch box(?:es)?']),
  rule('toys-cars-vehicles', L('Kids', 'Toys', 'Cars & Vehicles'), ['toy (cars?|trucks?|vehicles?|trains?|planes?|tractors?)|hot wheels|matchbox|die ?cast|train sets?|rc cars?|remote control (cars?|trucks?)|tonka|model (cars?|trains?|planes?|kits?)'], ['real|parts?|bikes?|tires?|shirts?|tees?|posters?|wheels? only|carriers? (for|cases?)|display (cases?|shelves)']),
  rule('toys-dolls', L('Kids', 'Toys', 'Dolls & Accessories'), ['dolls?|barbie|american girl|porcelain dolls?|baby dolls?|doll (houses?|clothes|accessories|furniture|stands?)|cabbage patch|bratz|monster high|my little pony'], ['dress(es)?|nighties?|lingerie|pajamas?|tops?|sunglasses|shirts?|tees?|rag dolls?|dollar|dolly|voodoo|sex|inflatable|bear|posters?|costumes?']),
  rule('toys-stuffed', STUFFED, ['plush (toys?|animals?|dolls?|bears?)|stuffed (animals?|toys?|bears?)|teddy bears?|plushies?|plush|beanie babies|build a bear|squishmallows?|care bears?'], ['pillows?|blankets?|robes?|slippers?|hoodies?|keychains?|throws?|bathrobes?|sweaters?|jackets?|coats?|fabric|bedding|rugs?|seat covers?|trim']),
  rule('toys-learning', L('Kids', 'Toys', 'Learning Toys'), ['learning toys?|educational toys?|flash cards?|abacus|alphabet blocks?|leapfrog|vtech|montessori|teaching (aids?|clocks?)'], ['books?|dvds?|software|apps?']),
  rule('toys-figures-playsets', KIDS_FIGURES, ['action figures?|funko|pop vinyl|bobbleheads?|bobble heads?|anime figures?|collectible figures?|play ?sets?|dollhouses?|playhouses?|star wars (action )?figures?|transformers?|he man|gi joe|power rangers|marvel legends|hot toys|figma|nendoroid|mcfarlane|neca|kenner|mini figures?|toy figures?'],
    ['shirts?|tees?|hoodies?|posters?|mugs?|bedding|blankets?|power|electrical|voltage|doorbells?|step (up|down)|volts?|watts?|dvds?|books?|cards?|costumes?']),
  rule('fish-kits', L('Pets', 'Fish', 'Aquarium Kits'), ['aquarium (kits?|starter kits?)|fish tank (kits?|starter)|starter (aquarium|tank) kits?']),
  rule('fish-cleaning', L('Pets', 'Fish', 'Cleaning & Maintenance'), ['aquarium (cleaning|cleaners?|siphons?|gravel vacs?|algae|scrapers?|test kits?|nets?|maintenance)|fish (nets?|tank cleaners?)|algae scrapers?|gravel vacuums?|water (conditioners?|test kits?) (for )?(fish|aquariums?)']),
  rule('fish-accessories', FISH_ACCESSORIES, ['aquariums?|fish tanks?|fish|aquatic', 'pumps?|filters?|heaters?|air stones?|airstones?|gravel|decor|ornaments?|castles?|plants?|lights?|stands?|hoods?|accessor|bubblers?|diffusers?'],
    ['fishing|rods?|reels?|lures?|tackle|bait|shirts?|tees?|plush|toys?|food|pond|fountains?|waterfalls?|jewelry|necklaces?|earrings?|bracelets?|rings?|pendants?|figurines?|decor items?|bowls?|knives|forks?|spoons?|plates?|platters?|dishes|serving|sticks?']),

  // ===== 10. no Poshmark home: deliberate blanks (after the positive rules, before the fashion rules) ====
  blank('small-appliances', ['blenders?|toasters?|toaster ovens?|stand mixers?|hand mixers?|kitchenaid|air fryers?|instant pots?|crock ?pots?|slow cookers?|pressure cookers?|rice cookers?|food processors?|waffle (makers?|irons?)|juicers?|microwaves?|bread makers?|deep fryers?|electric (kettles?|skillets?|grills?)|vacuums?|vacuum cleaners?|steam (mops?|cleaners?)|clothes irons?|steam irons?|travel irons?|air purifiers?|humidifiers?|dehumidifiers?|space heaters?|air conditioners?|washing machines?|dryers?|refrigerators?|dishwashers?|ovens?|stoves?|sewing machines?|coffee makers?|espresso (machines?|makers?)|keurig|nespresso|ice makers?|dehydrators?|sous vide'],
    [NOT_COLLECTIBLE, 'books?|cookbooks?|dvds?|covers?|bags?|filters?|parts?|accessor|miniature|toy|play|kids?|decor|vintage tins?|cases?|mitts?|liners?']),
  // Grills, smokers and fire pits are outdoor equipment (the BBQ leaf is tools only).
  blank('outdoor-cooking', ['grills?|barbecues?|smokers?|fire pits?|patio heaters?|chimineas?'], [NOT_APPAREL, NOT_COLLECTIBLE, 'tools?|utensils?|tongs?|brush(es)?|spatulas?|mats?|covers?|baskets?|accessor|toys?|play|books?|cookbooks?|trays?|pans?|plates?|racks?|cleaners?|thermometers?|sets?|chips?|boxes']),
  blank('consumables', ['alcohol|liquors?|wine bottles?|whiskey|whisky|vodka|bourbon|tequila|beer cans?|vitamins?|supplements?|prescriptions?|medications?|medicines?|candy|snacks?|pet food|dog food|cat food|e liquid|cbd|cannabis|marijuana|kratom'],
    ['glasses|decanters?|shirts?|tees?|posters?|signs?|books?|bottle openers?|decor|cookbooks?|stoppers?|racks?|labels?|boxes|tins?|jars?|dispensers?|holders?|dish(es)?|bowls?|plates?|trays?|containers?|candles?|scented|wax|soap|wine glass(es)?']),
  blank('sports-gear', ['golf|baseball|softball|hockey|lacrosse|football|basketball|soccer|tennis|racquetball|badminton|volleyball|bowling|archery|fishing|hunting|camping|hiking|climbing|kayaks?|canoes?|paddles?|surfboards?|skateboards?|snowboards?|skis?|skates?|scooters?|bicycles?|bikes?|cycling|treadmills?|ellipticals?|dumbbells?|kettlebells?|barbells?|exercise|fitness|yoga|pilates|boxing|martial arts|karate|fencing|rowing|life jackets?|coolers?|tents?|sleeping bags?|backpacking|trekking|sporting goods|fan shop|sports mem|gloves? mitts?|catchers? mitts?|batting|bats?|rackets?|racquets?|paintball|disc golf|frisbees?|dart ?boards?|pool cues?|billiards?|ping pong|table tennis|helmets?|mouth ?guards?|shin guards?|knee pads?|elbow pads?|weight (benches|plates|sets)|resistance bands?|jump ropes?|punching bags?|swim (goggles?|fins?|caps?)|snorkels?|wetsuits?|fishing (rods?|reels?|lures?|tackle)|auto parts|car parts|motorcycle|tires?|hubcaps?'],
    [NOT_APPAREL, NOT_COLLECTIBLE, 'games?|toys?|puzzles?|books?|dvds?|cds?|records?|vinyl|stickers?|decals?|mugs?|signs?|prints?|lamps?|plush|ornaments?|candles?|clocks?|frames?|belts?|bags?|sunglasses|watch(?:es)?|glasses|wallets?|key ?chains?|tags?']),
  blank('musical-instruments', ['guitars?|bass guitars?|ukuleles?|violins?|cellos?|violas?|banjos?|mandolins?|trumpets?|trombones?|saxophones?|clarinets?|harmonicas?|drums?|drum (sets?|sticks?|heads?)|cymbals?|pianos?|synthesizers?|synths?|amplifiers?|amps?|effects? pedals?|pedalboards?|guitar (pedals?|picks?|straps?|strings?|cables?|tuners?|cases?|stands?)|instrument cables?|microphones?|mic stands?|xlr|midi|audio interfaces?|mixers?|studio monitors?|pa speakers?|musical instruments?|tuners?|capos?|metronomes?|pickups?'],
    [NOT_APPAREL, NOT_COLLECTIBLE, 'ties?|games?|toys?|books?|dvds?|cds?|records?|vinyl|candles?|stickers?|decals?|signs?|lamps?|mugs?|clocks?|frames?|belts?|bags?|wallets?|key ?chains?|tags?|plush|boxes|music box(?:es)?|flutes? glasses|champagne']),
  blank('musical-instruments-cat', ['cat:musical instruments and gear'], [NOT_APPAREL, NOT_COLLECTIBLE, 'games?|toys?|books?|dvds?|cds?|records?|vinyl|candles?|stickers?|decals?|signs?|lamps?|mugs?|clocks?|frames?']),
  // Industrial / lab / plumbing parts (eBay Business & Industrial) have no consumer home on Poshmark.
  blank('industrial-parts', ['pipe fittings?|valves?|manifolds?|chromatography|power transformers?|pulleys?|block and tackle|hydraulics?|pneumatics?|lab (equipment|supplies|glassware)|test equipment|industrial (plumbing|supplies|electrical|automation|hvac|equipment)|pond and fountain pumps?|utility pumps?|sump pumps?|heat exchangers?|tankless water heaters?|push to connect|npt|npt[a-z]'],
    [NOT_APPAREL, NOT_COLLECTIBLE, 'games?|toys?|books?|dvds?|cds?|records?|vinyl|candles?|signs?|lamps?|mugs?|clocks?|frames?|decor']),
  blank('garden-hardware-tools', ['grow (lights?|tents?|kits?)|hydroponics?|garden (hoses?|tools?|shears?|gloves?|carts?)|lawn (mowers?|sprinklers?)|sprinklers?|irrigation|hoses?|pressure washers?|chainsaws?|power tools?|drills?|saws?|hand tools?|wrenches|wrench sets?|screwdrivers?|hammers?|toolbox(?:es)?|tool (sets?|box(?:es)?|chests?)|door (knobs?|levers?|handles?|locks?)|cabinet (knobs?|pulls?|hardware)|faucets?|plumbing|water (filters?|heaters?)|light bulbs?|bulbs?|thermometers?|moisture meters?|ph meters?|soap (butters?|making)|carrier oils?|padlocks?|hinges?|fasteners?|screws?|bolts?|nuts and bolts|nails|lumber|building materials|home improvement'],
    [NOT_APPAREL, NOT_COLLECTIBLE, 'games?|toys?|books?|dvds?|cds?|records?|vinyl|candles?|signs?|lamps?|mugs?|clocks?|frames?|belts?|bags?|wallets?|key ?chains?|tags?|plush|decor|fixtures?|lighting|ornaments?|hooks?|wall|display']),
  blank('furniture-cat', ['cat:furniture'], [NOT_APPAREL, NOT_COLLECTIBLE, 'lamps?|decor|candles?|vases?|frames?|baskets?|trays?|clocks?|mugs?|mirrors?|books?|games?|toys?']),
  blank('industrial-cat', ['cat:business and industrial|home improvement'], ['lamps?|decor|candles?|vases?|frames?|baskets?|signs?|clocks?|mugs?']),
  blank('furniture', ['furniture|sofas?|couch(es)?|loveseats?|sectionals?|recliners?|armchairs?|chairs?|stools?|bench(?:es)?|ottomans?|tables?|desks?|dressers?|nightstands?|bookcases?|bookshel(?:f|ves)|shelving units?|cabinets?|wardrobes?|armoires?|headboards?|bed frames?|bunk beds?|mattress(es)?|futons?|tv stands?|tv mounts?|entertainment centers?|clothing racks?|garment racks?|coat racks?|hat racks?|bar carts?|plant stands?|room dividers?|area rugs?|rugs?|carpets?'],
    [NOT_APPAREL, NOT_COLLECTIBLE, 'table (cloths?|linens?|runners?|lamps?|settings?|mats?|toppers?|clocks?|salt|tennis|saws?|games?|top|football)|chair (covers?|pads?|cushions?)|cushions?|covers?|coffee table books?|desk (organizers?|pads?|calendars?|lamps?|accessories|sets?)|rug pads?|bath rugs?|nesting|games?|toys?|dollhouse|miniature|books?|dvds?|cds?|records?|vinyl|candles?|signs?|lamps?|mugs?|clocks?|frames?|belts?|bags?|wallets?|key ?chains?|tags?|plush|decor|vases?|baskets?|trays?|boxes|racks? for|hangers?|hooks?|bookends?|paperweights?|shelves|display']),

  // ===== 11. fashion (department must be stated; only branches verified in the tree can be targeted) ====
  rule('fashion-tracksuits', TRACKSUIT, ['track ?suits?|tracksuits?|track suit sets?|jogging suits?|sweat ?suits?|warm ?up suits?|athletic sets?|jogger sets?']),
  rule('fashion-jacket-bomber', D(L('Women', 'Jackets & Coats', 'Bomber Jackets'), L('Men', 'Jackets & Coats', 'Bomber & Varsity')), ['bomber (jackets?|coats?)|bombers?|flight jackets?|ma 1']),
  rule('fashion-jacket-varsity', D(L('Women', 'Jackets & Coats', 'Varsity Jackets'), L('Men', 'Jackets & Coats', 'Bomber & Varsity')), ['varsity (jackets?|coats?)|letterman|baseball jackets?']),
  rule('fashion-jacket-leather', D(L('Women', 'Jackets & Coats', 'Leather Jackets')), ['leather (jackets?|coats?)|moto jackets?|biker jackets?|faux leather jackets?']),
  rule('fashion-jacket-denim', D(L('Women', 'Jackets & Coats', 'Jean Jackets')), ['denim jackets?|jean jackets?|trucker jackets?']),
  rule('fashion-jacket-puffer', D(L('Women', 'Jackets & Coats', 'Puffers'), L('Men', 'Jackets & Coats', 'Puffers')), ['puffers?|puffer (jackets?|coats?|vests?)|down (jackets?|coats?)|quilted (jackets?|coats?)']),
  rule('fashion-jacket-pea', D(L('Women', 'Jackets & Coats', 'Pea Coats'), L('Men', 'Jackets & Coats', 'Pea Coats')), ['pea ?coats?']),
  rule('fashion-jacket-trench', D(L('Women', 'Jackets & Coats', 'Trench Coats'), L('Men', 'Jackets & Coats', 'Trench Coats')), ['trench ?coats?']),
  rule('fashion-jacket-rain', D(undefined, L('Men', 'Jackets & Coats', 'Raincoats')), ['raincoats?|rain jackets?|slickers?']),
  rule('fashion-jacket-windbreaker', D(undefined, L('Men', 'Jackets & Coats', 'Windbreakers')), ['windbreakers?|wind breakers?']),
  rule('fashion-jacket-ski', D(L('Women', 'Jackets & Coats', 'Ski & Snow Jackets'), L('Men', 'Jackets & Coats', 'Ski & Snowboard')), ['ski (jackets?|coats?)|snow (jackets?|coats?)|snowboard(ing)? jackets?']),
  rule('fashion-jacket-utility', D(L('Women', 'Jackets & Coats', 'Utility Jackets'), L('Men', 'Jackets & Coats', 'Military & Field')), ['utility jackets?|field jackets?|military jackets?|cargo jackets?|army jackets?|chore coats?']),
  rule('fashion-jacket-teddy', D(L('Women', 'Jackets & Coats', 'Teddy Jackets')), ['teddy (coats?|jackets?)|sherpa (jackets?|coats?)']),
  rule('fashion-jacket-performance', D(undefined, L('Men', 'Jackets & Coats', 'Performance Jackets')), ['performance jackets?|running jackets?|track jackets?|softshell']),
  rule('fashion-blazers', D(L('Women', 'Jackets & Coats', 'Blazers & Suit Jackets')), ['blazers?|sport coats?|suit jackets?']),
  rule('fashion-vests', D(L('Women', 'Jackets & Coats', 'Vests'), L('Men', 'Jackets & Coats', 'Vests')), ['vests?'], ['life|bulletproof|safety|hi vis|vest pockets?|dogs?|cooling|weighted|fishing|tactical|vest (extender|carrier)']),
  rule('fashion-cardigans', D(L('Women', 'Sweaters', 'Cardigans'), L('Men', 'Sweaters', 'Cardigan'), L('Kids', 'Shirts & Tops', 'Sweaters')), ['cardigans?']),
  rule('fashion-sweater-turtleneck', D(L('Women', 'Sweaters', 'Cowl & Turtlenecks'), L('Men', 'Sweaters', 'Turtleneck')), ['turtlenecks?|cowl ?necks?|roll necks?|mock ?necks?']),
  rule('fashion-sweater-vneck', D(L('Women', 'Sweaters', 'V-Necks'), L('Men', 'Sweaters', 'V-Neck')), ['v ?necks?', 'sweaters?|pullovers?|knits?']),
  rule('fashion-sweater-crew', D(L('Women', 'Sweaters', 'Crew & Scoop Necks'), L('Men', 'Sweaters', 'Crewneck')), ['crew ?necks?|scoop necks?', 'sweaters?|pullovers?|knits?'], ['sweatshirts?|hoodies?']),
  rule('fashion-sweater-zip', D(undefined, L('Men', 'Sweaters', 'Zip Up')), ['zip ?up|quarter zip|half zip|full zip', 'sweaters?|pullovers?']),
  rule('fashion-sweaters-kids', D(undefined, undefined, L('Kids', 'Shirts & Tops', 'Sweaters')), ['sweaters?|pullovers?']),
  rule('fashion-sweatshirts', D(L('Women', 'Tops', 'Sweatshirts & Hoodies'), L('Men', 'Shirts', 'Sweatshirts & Hoodies'), L('Kids', 'Shirts & Tops', 'Sweatshirts & Hoodies')), ['hoodies?|hooded sweatshirts?|sweatshirts?|crewneck sweatshirts?|zip ?up hoodies?|pullover hoodies?']),
  rule('fashion-tank-tops', D(L('Women', 'Tops', 'Tank Tops'), L('Men', 'Shirts', 'Tank Tops'), L('Kids', 'Shirts & Tops', 'Tank Tops')), ['tank tops?|muscle tanks?|racerbacks?|sleeveless tops?']),
  rule('fashion-camisoles', D(L('Women', 'Tops', 'Camisoles'), undefined, L('Kids', 'Shirts & Tops', 'Camisoles')), ['camisoles?|camis?']),
  rule('fashion-bodysuits', D(L('Women', 'Tops', 'Bodysuits')), ['bodysuits?']),
  rule('fashion-crop-tops', D(L('Women', 'Tops', 'Crop Tops')), ['crop tops?|cropped tops?']),
  rule('fashion-blouses', D(L('Women', 'Tops', 'Blouses'), undefined, L('Kids', 'Shirts & Tops', 'Blouses')), ['blouses?|peasant tops?']),
  rule('fashion-tunics', D(L('Women', 'Tops', 'Tunics')), ['tunics?']),
  rule('fashion-dress-shirts', D(undefined, L('Men', 'Shirts', 'Dress Shirts')), ['dress shirts?']),
  rule('fashion-button-down', D(L('Women', 'Tops', 'Button Down Shirts'), L('Men', 'Shirts', 'Casual Button Down Shirts'), L('Kids', 'Shirts & Tops', 'Button Down Shirts')), ['button (down|up)( shirts?| tops?)?|oxford shirts?|flannel shirts?|chambray|western shirts?|hawaiian shirts?|camp shirts?']),
  rule('fashion-polos', D(undefined, L('Men', 'Shirts', 'Polos'), L('Kids', 'Shirts & Tops', 'Polos')), ['polos?|polo shirts?'], ['cologne|fragrance|perfume|polo (grounds|ball|match|team|mints|club)|water polo|marco polo|polo (sport|blue|black|red)']),
  rule('fashion-jerseys', D(L('Women', 'Tops', 'Jerseys'), L('Men', 'Shirts', 'Jerseys'), L('Kids', 'Shirts & Tops', 'Jerseys')), ['jerseys?'], ['new jersey|jersey (sheets?|knit|fabric|material|cows?|city|shore|mikes)|jersey (dress|skirt|top|pants|tee|shorts?)']),
  rule('fashion-tee-long', D(L('Women', 'Tops', 'Tees - Long Sleeve'), L('Men', 'Shirts', 'Tees - Long Sleeve'), L('Kids', 'Shirts & Tops', 'Tees - Long Sleeve')), ['long sleeved? (tees?|t shirts?|tshirts?|graphic)|tees? long sleeved?|ls tees?|thermal shirts?']),
  rule('fashion-muscle-tees', D(L('Women', 'Tops', 'Muscle Tees')), ['muscle tees?']),
  rule('fashion-tee-short', TEE_SHORT, ['t shirts?|tee shirts?|tees?|short sleeved? (shirts?|tees?|t shirts?)|graphic tees?|tshirts?'], ['golf|tee (times?|shots?|off|ball|box|pee)|tees? (and|n)|trophy|teepee|tee ball|tee marker']),
  rule('fashion-leggings', D(L('Women', 'Pants & Jumpsuits', 'Leggings'), undefined, L('Kids', 'Bottoms', 'Leggings')), ['leggings?|jeggings?|yoga pants']),
  rule('fashion-joggers', D(L('Women', 'Pants & Jumpsuits', 'Track Pants & Joggers'), L('Men', 'Pants', 'Sweatpants & Joggers'), L('Kids', 'Bottoms', 'Sweatpants & Joggers')), ['joggers?|sweatpants?|sweat pants|track pants?|jogging pants?|training pants?|warm ?up pants?']),
  rule('fashion-cargo', D(undefined, L('Men', 'Pants', 'Cargo')), ['cargo (pants?|trousers?)|cargos']),
  rule('fashion-chinos', D(undefined, L('Men', 'Pants', 'Chinos & Khakis')), ['chinos?|khakis?']),
  rule('fashion-corduroy', D(undefined, L('Men', 'Pants', 'Corduroy')), ['corduroy (pants?|trousers?)']),
  rule('fashion-wide-leg', D(L('Women', 'Pants & Jumpsuits', 'Wide Leg')), ['wide leg (pants?|trousers?|jeans?)|palazzo pants?']),
  rule('fashion-dress-pants', D(L('Women', 'Pants & Jumpsuits', 'Trousers'), L('Men', 'Pants', 'Dress')), ['dress pants?|slacks?|trousers?|pleated pants?|suit pants?']),
  rule('fashion-jumpsuits', D(L('Women', 'Pants & Jumpsuits', 'Jumpsuits & Rompers'), undefined, L('Kids', 'Bottoms', 'Jumpsuits & Rompers')), ['jumpsuits?|rompers?|playsuits?']),
  rule('fashion-capris', D(L('Women', 'Pants & Jumpsuits', 'Capris')), ['capris?|capri pants?|cropped pants?']),
  rule('fashion-overalls', D(undefined, undefined, L('Kids', 'Bottoms', 'Overalls')), ['overalls?|dungarees?']),
  rule('fashion-shoes-athletic', D(L('Women', 'Shoes', 'Athletic Shoes'), L('Men', 'Shoes', 'Athletic Shoes')), ['running shoes?|athletic shoes?|training shoes?|cleats?|cross trainers?|basketball shoes?|golf shoes?|tennis shoes?|walking shoes?|soccer cleats?']),
  rule('fashion-shoes-sneakers', D(L('Women', 'Shoes', 'Sneakers'), L('Men', 'Shoes', 'Sneakers')), ['sneakers?|high tops?|hi tops?|low tops?|air jordans?|converse|chuck taylors?|jordans? [0-9]+']),
  rule('fashion-shoes-heels', D(L('Women', 'Shoes', 'Heels')), ['high heels?|stilettos?|heels?|block heels?|kitten heels?|pumps?'],
    ['cups?|pads?|spurs?|cracks?|balm|grips?|liners?|air|water|pump (sprayer|dispenser)|bike|breast|sump|fuel|pond|fountain|hydraulic|oil|soap|lotion|tire|ball|inflator|hand pumps?|foot pumps?|bottle|bicycle|shock|garden|well|aquarium|fish|submersible|transfer|vacuum|hose|bellows|achilles|spur']),
  rule('fashion-shoes-flats', D(L('Women', 'Shoes', 'Flats & Loafers'), L('Men', 'Shoes', 'Loafers & Slip-Ons')), ['ballet flats?|flats|loafers?|slip ons?|slip on shoes?|driving (shoes?|mocs?)'], ['sheets?|screws?|bed|panel|files?|tires?']),
  rule('fashion-shoes-sandals', D(L('Women', 'Shoes', 'Sandals'), L('Men', 'Shoes', 'Sandals & Flip-Flops')), ['sandals?|flip ?flops?']),
  rule('fashion-boots-ankle', D(L('Women', 'Shoes', 'Ankle Boots & Booties')), ['ankle boots?|booties?|chelsea boots?']),
  rule('fashion-boots-combat', D(L('Women', 'Shoes', 'Combat & Moto Boots')), ['combat boots?|moto boots?|biker boots?|lug sole boots?|doc martens?|dr martens?']),
  rule('fashion-boots-otk', D(L('Women', 'Shoes', 'Over the Knee Boots')), ['over the knee boots?|knee high boots?|thigh high boots?|otk boots?']),
  rule('fashion-boots-heeled', D(L('Women', 'Shoes', 'Heeled Boots')), ['heeled boots?|stiletto boots?|block heel boots?']),
  rule('fashion-boots-rain-snow', D(L('Women', 'Shoes', 'Winter & Rain Boots'), L('Men', 'Shoes', 'Rain & Snow Boots')), ['rain boots?|snow boots?|winter boots?|duck boots?|wellies|wellington boots?|muck boots?|galoshes|rubber boots?']),
  rule('fashion-boots-western', D(undefined, L('Men', 'Shoes', 'Cowboy & Western Boots')), ['cowboy boots?|western boots?']),
  rule('fashion-boots-chukka', D(undefined, L('Men', 'Shoes', 'Chukka Boots')), ['chukkas?|chukka boots?|desert boots?']),
  rule('fashion-boots-lace-up', D(L('Women', 'Shoes', 'Lace Up Boots'), L('Men', 'Shoes', 'Boots')), ['lace up boots?|hiking boots?|work boots?']),
  rule('fashion-shoes-oxfords', D(undefined, L('Men', 'Shoes', 'Oxfords & Derbys')), ['oxford shoes?|oxfords|derby shoes?|derbys|brogues?|wingtips?|dress shoes?|cap toe']),
  rule('fashion-shoes-boat', D(undefined, L('Men', 'Shoes', 'Boat Shoes')), ['boat shoes?|topsiders?|sperry|deck shoes?']),
  rule('fashion-shoes-moccasins', D(L('Women', 'Shoes', 'Moccasins')), ['moccasins?|mocs']),
  rule('fashion-shoes-slippers', D(L('Women', 'Shoes', 'Slippers')), ['slippers?|house shoes?|indoor shoes?']),
  rule('fashion-shoes-mules', D(L('Women', 'Shoes', 'Mules & Clogs')), ['mules?|clogs?|birkenstock'], ['moscow|mugs?|deer|pack|copper|cocktail']),
  rule('fashion-shoes-wedges', D(L('Women', 'Shoes', 'Wedges')), ['wedges?|wedge (sandals?|heels?|boots?)'], ['cheese|lemon|tire|salad|antenna']),
  rule('fashion-shoes-espadrilles', D(L('Women', 'Shoes', 'Espadrilles')), ['espadrilles?']),
  rule('fashion-boots-men', D(undefined, L('Men', 'Shoes', 'Boots')), ['boots?'], ['ski|snowboard|hockey|skate|soccer|football|baseball|cycling|riding|motorcycle|fishing|waders?|hunting|boot (cut|camp|trunk|sale|scoot|jack|lace|tree|bag|up|dryers?|liners?)|bootcut|bootleg|bootlace|cowboy|rain|snow|winter|chukka|combat|hiking|work']),
  rule('fashion-bags-backpacks', D(L('Women', 'Bags', 'Backpacks'), L('Men', 'Bags', 'Backpacks')), ['backpacks?|rucksacks?|knapsacks?|book bags?|school bags?'], ['leaf|blowers?|sprayers?|vacuums?|pet|dog|cat|carriers?']),
  rule('fashion-bags-crossbody', D(L('Women', 'Bags', 'Crossbody Bags')), ['crossbody|cross body']),
  rule('fashion-bags-totes', D(L('Women', 'Bags', 'Totes')), ['totes?|tote bags?|shopper bags?'], ['storage|bins?|boxes|tool|cooler']),
  rule('fashion-bags-clutches', D(L('Women', 'Bags', 'Clutches & Wristlets')), ['clutch(es)?|wristlets?|evening bags?|minaudieres?'], ['clutch (plates?|disks?|cables?|kits?|pedals?|assembly|discs?|housing|release)|car|auto|transmission|pencil']),
  rule('fashion-bags-satchels', D(L('Women', 'Bags', 'Satchels')), ['satchels?']),
  rule('fashion-bags-shoulder', D(L('Women', 'Bags', 'Shoulder Bags')), ['shoulder bags?|baguette bags?']),
  rule('fashion-bags-hobos', D(L('Women', 'Bags', 'Hobos')), ['hobo bags?|hobos?'], ['nickel|sign|spider']),
  rule('fashion-bags-mini', D(L('Women', 'Bags', 'Mini Bags')), ['mini bags?|micro bags?']),
  rule('fashion-bags-baby', D(L('Women', 'Bags', 'Baby Bags')), ['diaper bags?|baby bags?|nappy bags?']),
  rule('fashion-bags-laptop', D(L('Women', 'Bags', 'Laptop Bags'), L('Men', 'Bags', 'Laptop Bags')), ['laptop bags?|laptop messenger|computer bags?|laptop totes?']),
  rule('fashion-bags-toiletry', D(L('Women', 'Bags', 'Cosmetic Bags & Cases'), L('Men', 'Bags', 'Toiletry Bags')), ['cosmetic (bags?|cases?)|makeup bags?|toiletry (bags?|kits?)|dopp kits?|shave kits?']),
  rule('fashion-bags-wallets', D(L('Women', 'Bags', 'Wallets'), L('Men', 'Bags', 'Wallets')), ['wallets?|billfolds?|bifolds?|trifolds?|card wallets?'], ['chains?|crypto|hardware|ledger']),
  rule('fashion-bags-briefcases', M(L('Men', 'Bags', 'Briefcases')), ['briefcases?|attache cases?']),
  rule('fashion-bags-duffel', D(L('Women', 'Bags', 'Travel Bags'), L('Men', 'Bags', 'Duffel Bags')), ['duffel bags?|duffle bags?|gym bags?|weekender bags?|overnight bags?']),
  rule('fashion-bags-messenger', M(L('Men', 'Bags', 'Messenger Bags')), ['messenger bags?|courier bags?']),
  rule('fashion-bags-belt', M(L('Men', 'Bags', 'Belt Bags')), ['belt bags?|fanny packs?|waist (packs?|bags?)|bum bags?|hip packs?']),
  rule('fashion-bags-luggage', D(L('Women', 'Bags', 'Travel Bags'), L('Men', 'Bags', 'Luggage & Travel Bags')), ['luggage|suitcases?|travel bags?|carry ons?|rolling luggage|spinner luggage']),
  rule('fashion-acc-mittens', D(L('Women', 'Accessories', 'Gloves & Mittens'), undefined, L('Kids', 'Accessories', 'Mittens')), ['mittens?'], ['oven|kitchen|baseball|catchers?|hockey|boxing']),
  rule('fashion-acc-gloves', D(L('Women', 'Accessories', 'Gloves & Mittens'), L('Men', 'Accessories', 'Gloves')), ['gloves?|leather gloves?|driving gloves?|winter gloves?|touchscreen gloves?'],
    ['work gloves?|gardening|garden|latex|nitrile|rubber|welding|oven|baseball|batting|golf|boxing|hockey|lacrosse|football|soccer|goalie|ski|snowboard|motorcycle|cycling|bike|fishing|hunting|tactical|surgical|dishwashing|kitchen|catchers?|mitts?']),
  rule('fashion-acc-belts', D(L('Women', 'Accessories', 'Belts'), L('Men', 'Accessories', 'Belts'), L('Kids', 'Accessories', 'Belts')), ['belts?|leather belts?'],
    ['seat ?belts?|conveyor|drive belts?|serpentine|fan belts?|timing belts?|v belts?|belt (sanders?|loops?|clips?|bags?|pouch(es)?|holsters?|drive|driven)|garters?|weight|tool|utility|champion|wrestling|boxing|fanny|pet|dog|cat|vacuum|safety|harness|martial|karate|judo|taekwondo|jiu jitsu|black belt|snow|lawn|mower|blower|sander|grinder|treadmill|dryer|washer|mixer|replacement|bread machine|buckles? only']),
  rule('fashion-acc-hats', D(L('Women', 'Accessories', 'Hats'), L('Men', 'Accessories', 'Hats'), L('Kids', 'Accessories', 'Hats')), ['hats?|caps?|beanies?|fedoras?|bucket hats?|baseball caps?|trucker hats?|snapbacks?|berets?|visors?'],
    ['hard hats?|party hats?|hat (racks?|box(?:es)?|stands?|pins?|bands?|clips?)|cap (guns?|screws?|nuts?|stones?|sleeves?)|bottle caps?|lens caps?|hub ?caps?|knee ?caps?|gas caps?|toner|cap toe|caps? lock|ink caps?|valve|radiator|pen caps?|tank caps?|football|helmets?|ear|swim caps?|shower caps?|nurse caps?|hat trick']),
  rule('fashion-acc-scarves', D(L('Women', 'Accessories', 'Scarves & Wraps'), L('Men', 'Accessories', 'Scarves')), ['scarf|scarves|shawls?|pashminas?|bandanas?|neck gaiters?']),
  rule('fashion-acc-sunglasses', D(L('Women', 'Accessories', 'Sunglasses'), L('Men', 'Accessories', 'Sunglasses'), L('Kids', 'Accessories', 'Sunglasses')), ['sunglass(?:es)?|shades|aviators?|wayfarers?'], ['cases?|cleaning|chains?|straps?|holders?|clips?|replacement lens(?:es)?|doll']),
  rule('fashion-acc-glasses', D(L('Women', 'Accessories', 'Glasses'), L('Men', 'Accessories', 'Glasses')), ['eyeglass(?:es)?|reading glasses|eye glasses|prescription glasses|eyewear|glasses frames?'], ['cases?|cleaners?|chains?|holders?|stands?|cloths?']),
  rule('fashion-acc-watches', D(L('Women', 'Accessories', 'Watches'), L('Men', 'Accessories', 'Watches'), L('Kids', 'Accessories', 'Watches')), ['watch(es)?|wristwatch(es)?|wrist watch(es)?|quartz watch'],
    ['watch (bands?|straps?|cases?|boxes|winders?|parts?|repair|stands?|batteries|crystals?|tools?|links?)|smart ?watch|apple watch|fitbit|garmin|stop ?watch|pocket watch|watch (dogs?|list|tower|party|out)|nightwatch|neighborhood|bird ?watch|weight watchers|baywatch|watchtower|watchmen|heart rate|blood pressure|storm watch|baby watch|fire watch|tide watch']),
  rule('fashion-acc-cufflinks', M(CUFFLINKS), ['cuff ?links?|cufflinks?']),
  rule('fashion-acc-ties', D(undefined, L('Men', 'Accessories', 'Ties'), L('Kids', 'Accessories', 'Ties')), ['neck ?ties?|bow ?ties?|silk ties?|mens ties?|tie sets?'], ['tie (dye|dyed|down|rods?|clips?|backs?|bars?)|zip ties|cable ties|twist ties|hair ties?|railroad ties|wire']),
  rule('fashion-acc-pocket-squares', M(L('Men', 'Accessories', 'Pocket Squares')), ['pocket squares?|pocket handkerchiefs?|handkerchiefs?|hank(?:y|ie|ies)']),
  rule('fashion-acc-suspenders', D(undefined, L('Men', 'Accessories', 'Suspenders'), L('Kids', 'Accessories', 'Suspenders')), ['suspenders?']),
  rule('fashion-acc-money-clips', M(L('Men', 'Accessories', 'Money Clips')), ['money clips?']),
  rule('fashion-acc-key-card', D(L('Women', 'Accessories', 'Key & Card Holders'), L('Men', 'Accessories', 'Key & Card Holders')), ['card (holders?|cases?|wallets?)|key (holders?|cases?|pouch(es)?|wallets?)|keychains?|key chains?|key rings?|lanyards?|id holders?'],
    ['trading|baseball|toploader|bcw|coin|sports|pokemon|penny|screw|slabs?|magnetic|playing|mtg|display|storage|boxes|binder|sleeves?|christmas|ornaments?|shot|bottle|beer|pewter|enamel|flashlight|tags?']),
  rule('fashion-acc-umbrellas', D(L('Women', 'Accessories', 'Umbrellas')), ['umbrellas?|parasols?'], ['patio|beach|garden|market|outdoor|cocktail|stands?|holders?|stroller|photography|studio|reflective']),
  rule('fashion-acc-hair', D(L('Women', 'Accessories', 'Hair Accessories'), undefined, L('Kids', 'Accessories', 'Hair Accessories')), ['hair (accessories|clips?|bows?|ties?|bands?|pins?|combs?|barrettes?|claws?)|barrettes?|headbands?|scrunchies?|hairbands?'], ['hair (dryers?|straighteners?|curlers?|irons?|brush(es)?|clippers?|trimmers?|extensions?|color|dye|gel|spray|products?|care|oil|growth|loss|removal|styling)']),
  rule('fashion-acc-hosiery', D(L('Women', 'Accessories', 'Hosiery & Socks'), undefined, L('Kids', 'Accessories', 'Socks & Tights')), ['hosiery|socks?|tights|stockings?|pantyhose|leg warmers?|knee socks?|thigh highs?'], ['christmas|stockings? (stuffers?|holders?|hangers?)|sock (puppets?|monkeys?|hop)|compression|diabetic|dog|pet']),
  rule('fashion-jewelry-brooches', D(L('Women', 'Jewelry', 'Brooches'), L('Men', 'Accessories', 'Jewelry')), ['brooch(es)?|lapel pins?|hat pins?'], ['display']),
  rule('fashion-jewelry-bracelets', D(L('Women', 'Jewelry', 'Bracelets'), L('Men', 'Accessories', 'Jewelry'), L('Kids', 'Accessories', 'Jewelry')), ['bracelets?|bangles?|charm bracelets?|cuff bracelets?|tennis bracelets?'], ['medical|alert|hospital|hair|watch|bracelet (box|display|stand)|making kits?|organizers?|boxes']),
  rule('fashion-jewelry-earrings', D(L('Women', 'Jewelry', 'Earrings'), L('Men', 'Accessories', 'Jewelry'), L('Kids', 'Accessories', 'Jewelry')), ['earrings?|ear rings?|ear cuffs?'], ['earring (backs?|organizers?|holders?|stands?|displays?|cards?|box(?:es)?)']),
  rule('fashion-jewelry-necklaces', D(L('Women', 'Jewelry', 'Necklaces'), L('Men', 'Accessories', 'Jewelry'), L('Kids', 'Accessories', 'Jewelry')), ['necklaces?|pendants?|chokers?|lockets?'], ['pendant (lights?|lamps?|fixtures?|lighting)|dog|pet|cat|collars?|necklace (holders?|stands?|organizers?|displays?)']),
  rule('fashion-jewelry-rings', D(L('Women', 'Jewelry', 'Rings'), L('Men', 'Accessories', 'Jewelry'), L('Kids', 'Accessories', 'Jewelry')), ['finger rings?|engagement rings?|wedding (rings?|bands?)|promise rings?|cocktail rings?|signet rings?|band rings?|sterling (silver )?rings?|gold rings?|diamond rings?|class rings?|mood rings?|statement rings?|stackable rings?|silver rings?']),
  rule('fashion-jewelry-rings-cat', D(L('Women', 'Jewelry', 'Rings'), L('Men', 'Accessories', 'Jewelry'), L('Kids', 'Accessories', 'Jewelry')), ['cat:rings?'], ['binders?|doorbells?|light|camera|bearings?|gaskets?|key rings?|keyrings?|napkin rings?|curtain rings?|o rings?|piston|snap|boxing|tub|cock|retaining|shower']),
  rule('fashion-jewelry-generic', D(undefined, L('Men', 'Accessories', 'Jewelry'), L('Kids', 'Accessories', 'Jewelry')), ['jewelry|jewellery'], ['boxes|box only|empty box|(gift|display|presentation|storage|packaging|shipping|jewelry|ring|watch|shoe|shirt) box|organizers?|stands?|cleaners?|making|supplies|display']),
];
