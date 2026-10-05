/**
 * craigslistCategoryMap.ts -- DATA for services/craigslistCategoryResolver.ts: which Craigslist category an
 * item belongs in (S-EXT-CRAIGSLIST-CATEGORY-MAP, 2026-10-05). Dependency-free: no imports, no env, no I/O.
 * Every target below is a 3-letter category code from config/craigslistCategoryTree.ts; the Jest suite
 * asserts that every target exists and is a LEAF, so a typo or a tree change fails CI instead of
 * mis-filing items.
 *
 * WHY: extension/fas-craigslist.js used to pick a category with a 20-rule SUBSTRING table
 * (mapCraigslistCategory), so "Home & Garden" went to farm+garden (garden rule fired first), "Video Games &
 * Consoles" to photo+video ("video"), "Skin Care" to sporting ("ski" inside "skin"), "Smart Watches" to
 * arts+crafts ("art" inside "smart"), and a baseball glove, Pet Supplies, Music and Pottery & Glass all fell
 * to general. Here every pattern is matched as WHOLE WORDS, so a substring hit is impossible.
 *
 * LAYER 1 -- CRAIGSLIST_CURATED_BY_EBAY_ID: keyed by the eBay numeric leaf category id stored on
 *   Item.ebayCategoryId. Seeded from the ids that occur on production Items (read-only export, 2026-10-04,
 *   351 items) plus every id curated in config/vintedCategoryMap.ts. Only ids whose eBay meaning is specific
 *   enough to point at ONE Craigslist category are listed; a broad eBay id (e.g. "Replacement Parts" 13718)
 *   is deliberately absent so the item's own words decide.
 * LAYER 2 -- CRAIGSLIST_RULES: ordered keyword rules over eBay category name + breadcrumb + title (+ the
 *   description for a few prefixes), specific before generic, generic category-level rules last. First
 *   matching rule wins. A rule whose target is `null` is a deliberate BLANK: the item type has no honest
 *   Craigslist home, so the later scored layer must not guess one.
 * LAYER 3 -- CRAIGSLIST_SCORED_ALIASES: one-word category names. Used only when exactly ONE category matches.
 *
 * HONEST HOMES: barter, wanted, free stuff and garage sales are NOT places a normal item belongs; no
 * curated entry, rule or alias may ever point at them (CRAIGSLIST_NEVER_TARGETS, asserted by the tests).
 * "business" and "tickets" resolve only when the eBay family truly implies them (Business & Industrial
 * equipment, event tickets). Vehicle categories resolve only from the eBay CATEGORY text, never from a
 * title word ("boat shoes", "gravy boat"). Items Craigslist prohibits are handled elsewhere
 * (craigslistRestrictionReason in the extension and marketplaceEligibilityRules.ts); this file does not
 * decide prohibitions.
 *
 * Pattern syntax (strings, compiled by the resolver, case-insensitive, matched against text that has been
 * lower-cased, accent-folded, with apostrophes removed and every other non-alphanumeric run turned into one
 * space, and "&" turned into " and "): each pattern is an alternation body wrapped as \b(?:body)\b.
 * Prefix "cat:" tests only the eBay category name + breadcrumb, "title:" only the title (+ brand), "desc:"
 * title + category + description; no prefix = category + title. A rule matches when ALL of its `all`
 * patterns match and NONE of its `none` patterns match.
 */

export type CraigslistTarget = string;

export type CraigslistCuratedEntry =
  | CraigslistTarget
  | null
  | { split: Array<[string, CraigslistTarget | null]>; fallback?: CraigslistTarget | null };

export interface CraigslistRuleDef {
  id: string;
  /** null = deliberate blank (see header). */
  target: CraigslistTarget | null;
  all: string[];
  none?: string[];
}

export interface CraigslistScoredAlias {
  id: CraigslistTarget;
  /** One-word (or short) category names, whole-word matched against category + title. */
  any: string;
  none?: string;
}

/** Categories no item is ever resolved into: barter, wanted, free stuff, garage sales. */
export const CRAIGSLIST_NEVER_TARGETS: string[] = ['bar', 'waa', 'zip', 'gms'];

const rule = (id: string, target: CraigslistTarget | null, all: string[], none?: string[]): CraigslistRuleDef =>
  none ? { id, target, all, none } : { id, target, all };
/** A deliberate blank: matching items get NO Craigslist category (never guessed by the scored layer). */
const blank = (id: string, all: string[], none?: string[]): CraigslistRuleDef => rule(id, null, all, none);

/** Shared exclusion alternations. */
const NOT_APPAREL = 'shirts?|jerseys?|caps?|hats?|hoodies?|jackets?|pants?|shorts?|socks?|shoes?|cleats?|costumes?|uniforms?';
const NOT_COLLECTIBLE = 'cards?|pins?|patch(es)?|figurines?|figures?|bobbleheads?|ornaments?|posters?|prints?|photos?|plaques?|magazines?|programs?|tickets?|pennants?|stickers?|mugs?|keychains?|signed|autographed|memorabilia';
const NOT_TOY = 'toys?|play|kids?|children|childrens|miniature|dollhouse|lego|doll|dolls';
const NOT_PART_WORDS = 'parts?|accessor(y|ies)|supplies|toys?|models?|die ?cast|collectibles?|memorabilia|signs?|decor|apparel';

// ---------------------------------------------------------------------------------------------------
// LAYER 1: eBay leaf id -> Craigslist category
// ---------------------------------------------------------------------------------------------------
export const CRAIGSLIST_CURATED_BY_EBAY_ID: Record<string, CraigslistCuratedEntry> = {
  // Music / media
  '176985': 'ema', // Vinyl Records -> cds/dvd/vhs
  '280': 'bka', // Magazines -> books
  '259104': { split: [['title:manga|graphic novels?|trade paperbacks?|tpbs?', 'bka']], fallback: 'cba' }, // Comics & Graphic Novels (comic books are collectibles)
  '3984': 'cba', // Original Comic Art
  '139973': 'vga', // Video Games
  '139971': 'vga', // Video Game Consoles
  '617': 'ema', // DVDs & Blu-ray Discs
  // Trading cards, coin and card supplies
  '183454': 'cba', // CCG Individual Cards
  '183050': 'cba', // Trading Card Singles
  '261328': 'cba', // Trading Card Singles (sports)
  '39476': 'cba', // Holders (BCW slab inserts, penny tubes)
  '39477': 'cba', // Coin Tubes
  '183438': 'cba', // Card Toploaders & Holders
  '183439': 'cba', // Albums, Binders & Pages
  '1438': 'taa', // Playing Cards
  '180349': 'taa', // Board games, contemporary manufacture
  // Coins and paper money
  '11981': 'cba', // Eisenhower dollars
  '40029': 'cba', // Federal Reserve Notes
  // Music gear (all of Craigslist's "music instr")
  '33021': 'msa', // Acoustic Guitars
  '33034': 'msa', // Electric Guitars
  '4713': 'msa', // Bass Guitars
  '16224': 'msa', // Ukuleles
  '38072': 'msa', // Guitar Amplifiers
  '46677': 'msa', // Straps (guitar)
  '22672': 'msa', // Tuners
  '22670': 'msa', // Pickups
  '22669': 'msa', // Other Guitar Effects Pedals
  '41419': 'msa', // Multi-Effects pedals
  '29946': 'msa', // Microphones & Wireless Systems
  '29948': 'msa', // Stands, Mounts & Holders (microphone stands)
  '41459': 'msa', // Cables, Snakes & Interconnects
  '14964': 'msa', // Audio Cables & Interconnects
  '47075': 'msa', // Cables & Leads (instrument cables)
  '21766': 'msa', // MIDI cables
  '47091': 'msa', // Speakers (pro audio / studio monitors)
  '41408': 'msa', // Cases (guitar / bass hard cases)
  // Video game accessories
  '117042': 'vga', // Controllers & Attachments
  '182174': 'vga', // Manuals, Inserts & Box Art
  // Sports
  '115280': 'sga', // Golf Clubs
  '16030': 'sga', // Gloves & Mitts (sporting goods)
  '16038': 'sga', // Camping Furniture
  '181382': 'sga', // Camping Ice Boxes & Coolers
  '15262': 'sga', // Life Jackets & Preservers
  '159175': 'sga', // Training Aids (swim)
  '50807': 'sga', // Equipment Bags
  '168867': 'sga', // Lanterns (camping)
  '47346': 'sga', // Inline skates
  '24510': 'cba', // Hockey-NHL (collectible puck / figure, NOT hockey equipment)
  '1226': { split: [['title:signed|autograph(ed)?|memorabilia|game used', 'cba']], fallback: 'sga' }, // Tennis (signed ball vs plain tennis ball)
  '27280': { split: [['title:golf balls?', 'sga']], fallback: 'cba' }, // Balls (golf ball is gear; a signed ball is memorabilia)
  // Collectibles, advertising, tobacciana
  '38052': 'cba', // Signs
  '804': 'cba', // Signs, original
  '10805': 'cba', // Signs, reproduction
  '35684': 'cba', // Gas & oil signs
  '3893': 'cba', // Other retail store ads
  '38053': 'cba', // Tins
  '11677': 'cba', // Tins (cigar)
  '801': 'cba', // Advertising tins
  '133': 'cba', // Other Tobacciana
  '986': 'cba', // Other Cigar Collectibles
  '44': 'cba', // Tobacciana: Cigarettes
  '70993': 'cba', // Tobacciana: Lighters
  '11673': 'cba', // Cigar Boxes
  '594': 'cba', // Ashtrays
  '35': 'cba', // Other Merch & Memorabilia Ads
  '1333': 'cba', // Seed & Feed Companies advertising
  '154': 'cba', // Other Star Wars Collectibles
  '38235': 'cba', // Masks (decorative collectible)
  '10843': 'cba', // Greyhound (figurine)
  '10834': 'cba', // Cocker Spaniel (figurine)
  '11675': 'cba', // Contemporary (collectible)
  '259256': 'cba', // Other US Politics Collectibles
  '29909': 'cba', // Music memorabilia apparel
  '1217': 'ata', // Primitives
  '3631': 'ata', // Cast Iron
  '12506': 'ata', // Thermometers (antique)
  // Home and household
  '551': 'ara', // Paintings -> arts+crafts
  '41511': 'ara', // Posters & Prints
  '73500': 'hsa', // Frames
  '73507': 'hsa', // Vases
  '13831': 'hsa', // Baskets
  '261054': 'hsa', // Cups & Mugs
  '261688': 'hsa', // Canisters & Jars
  '262374': 'hsa', // Dishes
  '261713': 'hsa', // Lamps
  '63516': 'hsa', // Chandeliers, Sconces & Lighting Fixtures
  '117414': 'hsa', // Christmas Trees
  '20684': 'hsa', // Water Filters
  '109431': 'fua', // Clothing Racks
  '43506': 'hsa', // Shoe Organizers
  '48656': { split: [['title:mounts?|brackets?', 'ela']], fallback: 'fua' }, // TV Stands & Mounts
  '260505': 'ppa', // Tankless Water Heaters
  '151621': 'gra', // Barbecues, Grills & Smokers
  '20542': 'gra', // Lawn Sprinklers
  '178988': 'gra', // Grow Lights & Light Bulbs
  '178989': 'gra', // Grow Light Kits
  '139921': 'gra', // Pond & Fountain Pumps
  '180964': 'maa', // Door Knobs & Levers
  '63900': 'maa', // Pipe Fittings
  '100351': 'foa', // Pumps (Air), aquarium -> general (Craigslist has no pet-supplies category)
  '100355': 'foa', // Air Stones, aquarium
  '177918': 'taa', // Play Sets
  // Electronics and computers
  '1245': 'syp', // Printers
  '47779': 'syp', // Keyboard & Mouse Bundles
  '11226': 'sya', // Operating Systems
  '156955': 'ela', // GPS Units
  '48605': 'pta', // Other Car Video (car audio / video lives with auto parts)
  '48515': 'pha', // Flashes
  '74927': 'pha', // Telescopes
  '9355': 'moa', // Cell Phones & Smartphones
  '177': 'sya', // PC Laptops & Netbooks
  '171485': 'ela', // Tablets & eBook Readers
  '31388': 'pha', // Digital Cameras
  // Clothing, jewelry
  '185084': 'cla', // Tracksuits & Sets
  '185708': 'cla', // Tracksuits & Sets
  '15687': 'cla', // T-Shirts
  '57988': 'cla', // Coats, Jackets & Vests
  '137843': 'jwa', // Cufflinks
  '41195': 'jwa', // Metal (jewelry studs / findings)
  // Business and industrial equipment (eBay "Business & Industrial" truly implies business)
  '184148': 'bfa', // Other Valves & Manifolds
  '260831': 'bfa', // Power Transformers
  '185258': 'bfa', // Chromatography Columns & Reservoirs
  '260941': 'bfa', // Trimming Machines
  '104043': 'tla', // Pulleys, Block & Tackle
  '75670': 'tla', // Moisture & pH Meters (hand-held measuring instrument)
  '48094': 'ara', // Soap Butters & Carrier Oils (soap making supplies)
  // Arcade
  '13716': 'vga', // Video Arcade Machines
  // Deliberately blank: the id alone is too broad or the item type has no honest home
  '88903': null, // Daggers
};

// ---------------------------------------------------------------------------------------------------
// LAYER 2: ordered rules (first match wins). Specific before generic. A null target is a deliberate blank.
// Block order: 1 blanks  2 vehicles (category text only)  3 media/books/cards/coins/memorabilia
//   4 video gaming  5 music gear  6 electronics/computers/photo  7 bikes  8 sports  9 tools/garden/materials
//   10 appliances/furniture/household  11 clothing/jewelry/beauty/baby/toys/crafts/pets  12 tickets/business
//   13 generic category-level fallbacks (every pattern there is "cat:" scoped, so a title word never
//   decides them).
// ---------------------------------------------------------------------------------------------------
export const CRAIGSLIST_RULES: CraigslistRuleDef[] = [
  // ===== 1. blanks =======================================================================================
  blank('test-rows', ['title:do not publish|qa test|test item|test prod|test card']),
  blank('weapons-blank', ['firearms?|handguns?|ammunition|ammo|daggers?|switchblades?']),
  blank('art-decor-ambiguous', ['cat:art and decor'], ['title:paintings?|prints?|posters?|vases?|lamps?|frames?|mirrors?|sculptures?|clocks?']),

  // ===== 2. vehicles: eBay category text only ============================================================
  rule('veh-wheels-tires', 'wta', ['cat:wheels tires and parts|wheels and tires|tires|wheels|rims|hubcaps?|wheel covers?'], ['cat:bicycles?|bikes?|cycling|toys?|hobbies|sporting|lawn|garden|motorcycle|boat|trailer|rv|atv|aircraft']),
  rule('veh-boat-parts', 'bpa', ['cat:boat parts|marine parts|boat accessories|marine accessories|boat parts and accessories']),
  rule('veh-motorcycle-parts', 'mpa', ['cat:motorcycle parts|motorcycle accessories|motorcycle parts and accessories|motorcycle helmets?|motorcycle apparel'], ['cat:toys?|collectibles?']),
  rule('veh-auto-parts', 'pta', ['cat:car and truck parts|auto parts|automotive parts|truck parts|car parts|vehicle parts|car parts and accessories|car audio|car video|car stereos?|car electronics|automotive tools and supplies'], ['cat:toys?|collectibles?|die ?cast|models?']),
  rule('veh-aviation', 'ava', ['cat:aircraft|aviation|aircraft parts|aviation parts'], ['cat:memorabilia|collectibles?|toys?|models?|die ?cast|signs?|decor|apparel']),
  rule('veh-boats', 'boo', ['cat:boats|watercraft|jet skis?|personal watercraft'], ['cat:' + NOT_PART_WORDS + '|trailers?|kayaks?|paddle|inflatable|fishing|boat shoes']),
  rule('veh-motorcycles', 'mca', ['cat:motorcycles?|motor scooters?|mopeds?'], ['cat:' + NOT_PART_WORDS + '|helmets?|jackets?|boots?|gloves?|kick scooters?']),
  rule('veh-rvs', 'rva', ['cat:rvs?|rvs and campers|campers and trailers|motorhomes?|camper vans?'], ['cat:' + NOT_PART_WORDS]),
  rule('veh-trailers', 'tra', ['cat:trailers?|utility trailers?|cargo trailers?|travel trailers?|other vehicles and trailers'], ['cat:' + NOT_PART_WORDS + '|hitch|hitches|couplers?|tongue|jacks?|brakes?|tires?|wheels?|lights?|boat|rv']),
  rule('veh-heavy-equipment', 'hva', ['cat:heavy equipment|excavators?|bulldozers?|skid steers?|backhoes?|forklifts?|wheel loaders?'], ['cat:' + NOT_PART_WORDS + '|attachments?|buckets?']),
  rule('veh-atv', 'sna', ['cat:atvs?|utvs?|snowmobiles?|side by sides?|powersports|go karts?'], ['cat:' + NOT_PART_WORDS + '|helmets?|jackets?|boots?']),
  rule('veh-cars', 'cta', ['cat:cars and trucks|cars trucks|passenger vehicles|pickup trucks|automobiles?'], ['cat:' + NOT_PART_WORDS + '|tools?|signs?']),

  // ===== 3. media, books, cards, coins, memorabilia ======================================================
  rule('game-strategy-guides', 'bka', ['strategy guides?|game guides?|player guides?|players guides?|official guides?|walkthroughs?|cheat books?|prima guides?']),
  rule('graphic-novels', 'bka', ['title:graphic novels?|manga|trade paperbacks?|tpbs?'], ['figures?|statues?|shirts?|posters?|funko|toys?|dvds?|blu rays?|video games?']),
  // Comic books are collectibles on Craigslist; never magazines.
  rule('comics-strong', 'cba', ['comic books?|comics?|cgc|cbcs'],
    ['magazines?|mags?|periodicals?|nintendo power|game informer|trading cards?|comic con|comicon|comic sans|figures?|funko|t shirts?|tees?|posters?|hoodies?|mugs?|costumes?|lunch box(es)?|keychains?|bobbleheads?|dvds?|blu rays?|video games?|statues?']),
  rule('comics-publisher', 'cba', ['marvel|dark horse|valiant|idw|archie|wildstorm|vertigo', 'issue|vol|volume|first print|1st print|variant|annual|key issue|number|no [0-9]+|[0-9]+ of [0-9]+'],
    ['figures?|toys?|funko|shirts?|cards?|posters?|dvds?|blu rays?|games?']),
  rule('magazine-racks', 'hsa', ['magazine (racks?|holders?|files?)|literature (racks?|holders?)']),
  rule('magazines', 'bka', ['magazines?|periodicals?|nintendo power|game informer|national geographic|sports illustrated|rolling stone']),
  rule('books', 'bka', ['books?|novels?|textbooks?|hardcovers?|paperbacks?|cookbooks?|encyclopedias?|bibles?|atlas(es)?'],
    ['bookends?|bookcases?|bookshelf|bookshelves|book (ends?|cases?|shelves|racks?|lights?|stands?|bags?|marks?|covers?|safes?)|bookmarks?|notebooks?|checkbooks?|scrapbooks?|sketchbooks?|guest books?|photo books?|address books?|record books?|audio ?books?|card books?|binders?|dust jackets?|bluebooks?|comics?|games?|dvds?|cds?']),
  // Video and audio media
  rule('media-vhs', 'ema', ['vhs|video tapes?|video cassettes?'], ['players?|vcrs?|recorders?|cleaners?|rewinders?|blank|combo|converters?|duplicators?']),
  rule('media-bluray-dvd', 'ema', ['blu rays?|bluray|dvds?|dvd movies?|laser ?discs?|hd dvds?|4k uhd'], ['players?|recorders?|drives?|burners?|blank|dvd r|dvd rw|cases?|storage|cleaners?|lens|cables?|adapters?|remotes?|combo|racks?|towers?']),
  rule('media-cassette', 'ema', ['cassette tapes?|audio cassettes?|mixtapes?|cassettes?'], ['players?|decks?|recorders?|blank|walkman|adapters?|cleaners?|cases?|storage|video|vhs|shimano|sram|derailleur|freehub|cogset|speed cassette|sprockets?']),
  rule('media-vinyl', 'ema', ['vinyl records?|vinyl albums?|record albums?|lps?|12 inch (single|vinyl)|45 rpm|33 rpm|vinyl'],
    ['lp gas|propane|turntables?|record (players?|cleaners?|brush|storage|crates?|racks?|holders?|bags?|sleeves?)|stylus|needles?|slipmats?|decals?|wall art|stickers?|siding|flooring|plank|wrap|bags?|toys?|htv|cricut|silhouette|vinyl (stickers?|decals?|wraps?|letters?|lettering|fabric|banners?|tablecloths?|cutters?|figures?|dolls?|gloves?|aprons?|tiles?|sheets?|rolls?|adhesive|cling|weeding|plotter)']),
  rule('media-cd', 'ema', ['cds?|compact discs?'],
    ['valves?|solenoids?|vac|volts?|relays?|switch(es)?|sensors?|pumps?|motors?|fittings?|pipes?|hoses?|players?|recorders?|burners?|blank|recordable|cd r|cd rw|cases?|storage|wallets?|binders?|racks?|cleaners?|drives?|cables?|changers?|jewel|towers?|lens|repair|games?|twister|milton bradley|hasbro|parker brothers']),
  // Card, coin and stamp supplies and the cards, coins and stamps themselves: collectibles
  rule('card-supplies', 'cba', ['screw ?downs?|magnetic (card )?holders?|toploaders?|top loaders?|card sleeves?|penny sleeves?|team bags?|semi rigid|card savers?|cards? holders?|card protectors?|deck box(es)?|(binder|card|trading card|9 pocket|nine pocket) (pages?|sheets?|refills?)|(card|trading card|baseball card|coin|collectors?|stamp) (binders?|albums?)|coin (holders?|tubes?|flips?|capsules?|cases?|storage|displays?|slabs?|trays?)|penny tubes?|slab inserts?|bcw']),
  rule('cards-booster', 'cba', ['booster (box(es)?|cases?|displays?|packs?)|sealed (booster )?box(es)?|hobby box(es)?|blaster box(es)?|elite trainer box(es)?|trading card packs?|card packs?']),
  rule('cards-singles', 'cba', ['trading cards?|sports cards?|baseball cards?|football cards?|basketball cards?|hockey cards?|soccer cards?|racing cards?|pokemon cards?|pokemon tcg|magic the gathering|mtg|yu gi oh|yugioh|digimon|flesh and blood|lorcana|topps|panini|upper deck|fleer|donruss|bowman|prizm|rookie cards?|psa [0-9]+|bgs [0-9]+|sgc [0-9]+|graded cards?|holofoil|ccg|tcg|trading card game|garbage pail kids|wacky packages'],
    ['plush|figures?|toys?|funko|shirts?|backpacks?|lunch|bedding|blankets?|costumes?|watch|game boy|nintendo|switch|3ds|video games?|ps[1-5]|xbox|mugs?|posters?|caps?|hats?|hoodies?|stuffed|keychains?|squishmallows?|lego|stickers?|puzzles?|statues?|pins?|decals?|frames?|displays?|comics?|books?|manga|guides?|magazines?']),
  rule('coins-and-currency', 'cba', ['coins?|silver dollars?|morgan dollars?|peace dollars?|eisenhower dollars?|ike dollars?|bullion|numismatic|wheat pennies|buffalo nickels?|mercury dimes?|walking liberty|silver eagles?|krugerrands?|banknotes?|bank notes?|paper money|federal reserve notes?|silver certificates?|confederate (notes?|currency)|proof sets?|mint sets?|stock certificates?|scripophily|challenge coins?|medals?|tokens?'],
    ['jewelry|necklaces?|pendants?|rings?|earrings?|bracelets?|purses?|wallets?|banks?|piggy|cufflinks?|keychains?|cleaning|bags?|operated|slots?|machines?|laundry|counters?|sorters?|detectors?|scales?|testers?|cell batter|lithium|cr2032|medal (hangers?|racks?|ribbons?)|medicine|medical']),
  rule('stamp-craft', 'ara', ['rubber stamps?|craft stamps?|clear stamps?|stamp pads?|ink pads?|cling stamps?|stamping (kits?|sets?|tools?)|wax (seal )?stamps?']),
  rule('stamps-and-postal', 'cba', ['postage stamps?|stamp (lots?|sets?|collections?|albums?)|first day covers?|postcards?|post cards?|philatelic|stamps?'], ['rubber|craft|clear|ink|pads?|metal|letter|number|steel|leather|date|self inking|address|notary|emboss|seal|wax|cling|stamping|dog tag|punch|stencil']),
  rule('marquees', 'cba', ['marquees?']),
  rule('memorabilia-signed', 'cba', ['signed|autographed|hand signed|game used|game worn|game issued|jsa|psa dna|coa', 'nhl|nfl|nba|mlb|nascar|baseball|football|hockey|basketball|golf|tennis|soccer|boxing|ufc|wwe|olympic|racing|jersey|bats?|balls?|pucks?|helmets?|gloves?|cleats?|hats?|caps?|pga|stadium|champion'], ['cards?|rookie|price guide|books?']),
  rule('tobacciana-advertising', 'cba', ['tobacciana|cigar (box(es)?|bands?|labels?|molds?|cutters?)|cigarettes?|cigars?|tobacco|snuff|spittoons?|cigarette lighters?|zippo|advertising|gas and oil|porcelain signs?|neon signs?|neon style signs?|electric signs?|outdoor signs?|light up signs?|lighted signs?|gas tube signs?|metal signs?|tin signs?|vintage signs?|enamel signs?|ashtrays?|humidors?|tins?|vtg lighters?|vintage lighters?|marlboro|joe camel'], ['pencil|cookie|storage|candy|bandage|altoids|mints?|tea|lunch|ammo|jackets?|windbreakers?|shirts?|t shirts?|hats?|caps?|hoodies?|transformers?']),

  // ===== 4. video gaming =================================================================================
  rule('game-vr', 'vga', ['vr headsets?|oculus|meta quest|psvr|playstation vr|virtual reality headsets?']),
  rule('game-controllers', 'vga', ['game ?(controllers?|pads?)|gaming controllers?|wireless controllers?|joy ?cons?|joysticks?|arcade sticks?|dualshock|dualsense|xbox controllers?|switch pro controllers?|wii remotes?|nunchuks?']),
  rule('game-consoles', 'vga', ['consoles?', 'playstation|ps[1-5]|xbox|nintendo|wii|switch|game ?boy|n64|snes|nes|sega|genesis|dreamcast|saturn|atari|neo geo|gamecube|ps vita|psp|3ds|ds lite'], ['games?|cases?|stands?|covers?|chargers?|cables?|controllers?|skins?|cartridges?|discs?|boxes|box only|manuals?']),
  rule('game-cartridges', 'vga', ['neo geo|mvs|arcade game|game cartridges?|game cart|arcade cartridges?|cartridges?', 'game|neo geo|mvs|snk|nintendo|sega|atari|famicom|cartridges? only'], ['ink|toner|printer|laser|vape|battery|water|filter|cleaners?|adapters?']),
  rule('game-titles', 'vga', ['video games?|ps[1-5] games?|xbox (360|one|series)? ?games?|nintendo (switch|wii|ds|64) games?|pc games?|game boy games?|gameboy games?|playstation games?|sega games?|atari games?|n64 games?|snes games?|nes games?'], ['consoles?|controllers?|cases?|headsets?|guides?|strategy|stands?']),
  rule('game-arcade-machines', 'vga', ['arcade (machines?|cabinets?)|video arcade|pinball machines?|pinball']),
  rule('game-console-accessories', 'vga', ['console (stands?|covers?|cables?|cases?)|game genie|light guns?|zapper']),

  // ===== 5. music gear ===================================================================================
  rule('music-gear-title', 'msa', ['acoustic guitars?|electric guitars?|bass guitars?|guitars?|ukuleles?|banjos?|mandolins?|violins?|violas?|cellos?|saxophones?|trumpets?|trombones?|clarinets?|harmonicas?|accordions?|synthesizers?|drum (kits?|sets?)|cymbals?|xlr|midi|microphones?|mic stands?|effects? pedals?|amp heads?|pickups?|music stands?|metronomes?|kalimbas?|pianos?|digital pianos?'],
    ['toys?|kids?|childrens?|plush|ornaments?|figurines?|shirts?|posters?|decor|pickup trucks?|truck|bed|bobbleheads?|lamps?|bench|stools?|chairs?|hero|rock band|lessons?|course|books?|dvds?|cds?|records?|vinyl|video games?']),

  // ===== 6. electronics, computers, photo ================================================================
  rule('smart-watches', 'ela', ['smart ?watch(es)?|fitness trackers?|fitbits?|apple watch|garmin|wearables?']),
  rule('tv-stands', 'fua', ['tv stands?|entertainment centers?|media consoles?'], ['mounts?|brackets?']),
  rule('cell-phones', 'moa', ['cell phones?|mobile phones?|smartphones?|iphones?|android phones?|galaxy s[0-9]+|galaxy note [0-9]+|google pixel|phone (cases?|chargers?)|cell phone (cases?|accessories)']),
  rule('computers-parts', 'syp', ['computer (keyboards?|mice|mouse|parts|components|cables?)|keyboard and mouse|usb (hubs?|drives?)|hard drives?|ssds?|graphics cards?|gpus?|motherboards?|memory modules?|cpus?|computer processors?|wifi routers?|wireless routers?|modems?|network (cards?|switch(es)?|adapters?)|printers?|ink cartridges?|toner|webcams?|monitor stands?|docking stations?'], ['guitars?|kitchen|food']),
  rule('computers-main', 'sya', ['laptops?|notebook computers?|desktop (computers?|pcs?)|macbooks?|chromebooks?|imacs?|all in one pcs?|pc laptops?|computer monitors?|operating systems?|windows (xp|7|10|11|vista)|software'], ['bags?|cases?|stands?|sleeves?|desk|covers?|skins?|batter(y|ies)|chargers?|toys?|games?|baby|heart|blood|studio']),
  rule('photo-gear', 'pha', ['cameras?|camcorders?|dslr|mirrorless|camera lenses?|tripods?|camera flash|speedlights?|strobes?|gopro|polaroid|film cameras?|binoculars?|telescopes?|light meters?|darkroom|enlargers?|camera bags?'],
    ['security|dash|baby|nanny|spy|doorbell|surveillance|toys?|ornaments?|decor|figurines?|posters?']),
  rule('electronics-main', 'ela', ['televisions?|tvs?|stereos?|headphones?|earbuds?|speakers?|soundbars?|home theater|av receivers?|stereo receivers?|amplifiers?|turntables?|cd players?|dvd players?|blu ray players?|vcrs?|radios?|walkie talkies|gps|e readers?|tablets?|ipads?|kindles?|projectors?|portable chargers?|power banks?|security cameras?|doorbell cameras?|smart home|alexa|echo dot|surge protectors?|universal remotes?|tv remotes?'],
    ['radio flyer|trailer|hitch|toys?|plush|ornaments?|decor|posters?|shirts?|writing|tablet (desks?|tables?)|speaker (cabinet|stands?)']),

  // ===== 7. bikes ========================================================================================
  rule('bike-parts', 'bip', ['(bicycle|bike|cycling) (parts?|components?|tires?|tubes?|pedals?|saddles?|seats?|chains?|wheels?|rims?|forks?|frames?|handlebars?|cranks?|derailleurs?|brakes?|racks?|pumps?|locks?|baskets?|helmets?|trainers?|computers?|lights?)|derailleurs?|freehubs?|cranksets?|bottom brackets?|shimano|sram|bicycle components']),
  rule('motorcycle-gear', 'mpa', ['motorcycle (parts?|helmets?|jackets?|gloves?|boots?|windshields?|saddlebags?|exhausts?|mirrors?|seats?|tires?|batteries|chains?)|motorcycle accessories']),
  rule('motorbikes', 'mca', ['dirt bikes?|pit bikes?|motorbikes?|motorcycles?|mopeds?'], ['parts?|accessor(y|ies)|apparel|helmets?|jackets?|toys?|models?|die ?cast|collectibles?|memorabilia|signs?|boots?|gloves?|posters?|decor']),
  rule('bikes', 'bia', ['bicycles?|bikes?|mountain bikes?|road bikes?|bmx|tricycles?|e bikes?|electric bikes?|unicycles?'], ['dirt bikes?|pit bikes?|motorbikes?|motorcycles?|exercise|stationary|spin|toys?|kids? pedal|balance bikes?|bike (racks?|shorts?|helmets?|jerseys?|gloves?)|cards?|playing']),

  // ===== 8. sports =======================================================================================
  rule('sports-gloves', 'sga', ['(baseball|softball|batting|golf|boxing|hockey|goalie|football|lacrosse|fielding|catchers?|infield|outfield|pitchers?|training|mma|sparring) (gloves?|mitts?)|catchers? mitts?|first base mitts?'], [NOT_COLLECTIBLE]),
  rule('sports-gloves-cat', 'sga', ['cat:gloves and mitts'], ['title:oven|garden|work|winter|driving|fashion|women|womens|men|mens|ski|motorcycle|welding|disposable']),
  rule('sports-baseball', 'sga', ['baseball bats?|softball bats?|baseballs|softballs|batting helmets?|batting tees?|pitching machines?|catchers? gear|baseball equipment|softball equipment'], [NOT_APPAREL, NOT_COLLECTIBLE]),
  rule('sports-golf', 'sga', ['golf (clubs?|balls?|bags?|carts?|irons?|drivers?|putters?|wedges?|woods?|sets?|gloves?|tees?|shoes?|clubs? sets?)|putters?|irons set'], [NOT_APPAREL, NOT_COLLECTIBLE]),
  rule('sports-team-balls', 'sga', ['basketballs?|footballs?|soccer balls?|volleyballs?|tennis (balls?|rackets?|racquets?)|racquetballs?|pickleball|badminton|ping pong|table tennis|bowling balls?|lacrosse sticks?|hockey sticks?|goalie (masks?|pads?)|shin guards?|mouth guards?|shoulder pads?'], [NOT_COLLECTIBLE]),
  rule('sports-fishing', 'sga', ['fishing (rods?|reels?|poles?|lures?|tackle|line|nets?|waders?|vests?)|tackle box(es)?|fly (rods?|reels?|fishing)|spinning reels?|baitcasting'], [NOT_COLLECTIBLE]),
  rule('sports-camping', 'sga', ['tents?|sleeping bags?|camping (stoves?|chairs?|furniture|gear|cots?|tents?|lanterns?|cookware|coolers?)|hiking (boots?|backpacks?|poles?|gear)|backpacking|ice chests?|coolers?|life jackets?|life vests?|kayaks?|canoes?|paddle boards?|kayak paddles?|canoe paddles?|ping pong paddles?|snorkels?|wetsuits?'], [NOT_TOY, 'dog|cat|pet|baby|nursing|gaming|computer|rice|beer|wine cooler|fridge|refrigerators?|water coolers?|oil coolers?|cpu|radiators?|laptops?|shoes?|wall (art|decor)|decorative|decor']),
  rule('sports-winter-water', 'sga', ['skis?|ski (boots?|poles?|goggles?|helmets?|bindings?)|snowboards?|snowshoes?|ice skates?|roller skates?|inline skates?|skateboards?|surfboards?|bodyboards?|sleds?|archery|compound bows?|crossbows?|bow strings?'], [NOT_TOY, NOT_COLLECTIBLE]),
  rule('sports-fitness', 'sga', ['treadmills?|ellipticals?|exercise bikes?|stationary bikes?|spin bikes?|rowing machines?|dumbbells?|kettlebells?|barbells?|weight (plates?|bench(es)?|sets?)|yoga mats?|resistance bands?|pull up bars?|punching bags?|heavy bags?|gym equipment|fitness equipment|home gyms?'], [NOT_COLLECTIBLE]),
  rule('sports-equipment-generic', 'sga', ['sports equipment|athletic equipment|equipment bags?|training aids?|batting cages?'], [NOT_APPAREL, NOT_COLLECTIBLE]),

  // ===== 9. tools, garden, building materials ============================================================
  rule('materials-building', 'maa', ['lumber|plywood|drywall|shingles?|pavers?|rebar|pipe fittings?|pvc pipes?|copper pipes?|plumbing (parts|fittings|fixtures)|door (knobs?|handles?|levers?)|cabinet (knobs?|pulls?|hardware)'], ['toys?|models?|collectibles?|signs?']),
  rule('tools-power-hand', 'tla', ['power tools?|hand tools?|cordless drills?|drills?|drill bits?|drill press(es)?|circular saws?|table saws?|miter saws?|band saws?|jig saws?|hack saws?|chain ?saws?|reciprocating saws?|saw blades?|hand saws?|wrenches|wrench sets?|socket sets?|sockets?|torque wrenches|screwdrivers?|pliers|hammers?|mallets?|chisels?|clamps?|vises?|workbench(es)?|tool (box(es)?|chests?|sets?|bags?|belts?|kits?)|toolbox(es)?|ladders?|sanders?|grinders?|planers?|jointers?|lathes?|welders?|air compressors?|nail guns?|rotary tools?|dremel|multimeters?|calipers?|micrometers?|spirit levels?|laser levels?|torpedo levels?|tape measures?|pulleys?|block and tackle|wood routers?|trim routers?|plunge routers?|router bits?'],
    ['toys?|play|kids?|plush|figurines?|ornaments?|posters?|shirts?|mallet putter|putters?|golf|croquet|sledge|meat|steak|nail (polish|art|salon)|hair|beauty|makeup|coffee|spice|herb|pepper|salt|guitars?|saw (movie|film|dvd)|massacre|dvds?|cds?|games?']),
  rule('garden-lawn', 'gra', ['lawn mowers?|mowers?|tillers?|string trimmers?|weed (eaters?|wackers?)|leaf blowers?|hedge trimmers?|garden (hoses?|tools?|decor|statues?|gnomes?|furniture|carts?)|hoses?|sprinklers?|planters?|flower pots?|plant (pots?|stands?)|seeds?|flower bulbs?|plant bulbs?|fertilizers?|grow (lights?|lamps?|tents?|kits?)|hydroponics?|greenhouses?|wheelbarrows?|shovels?|rakes?|hoes|pruners?|barbecues?|bbq|smokers? grills?|pellet smokers?|offset smokers?|grills?|fire pits?|fountains?|bird (baths?|feeders?|houses?)|tractors?|livestock|fencing|hay|chicken coops?|pond (pumps?|liners?)|irrigation|compost'],
    ['car|truck|front|jeep|dental|teeth|grille|jewelry|panini|indoor|hair|beard|nose|ear|body|clippers?|toys?|play|kids?|plush|figurines?|ornaments?|posters?|shirts?|pens?|drinking|feed|beads?|pearls?|stitch|peanuts?|foil|epee|saber|sword|mask|advertising|banners?|signs?']),

  // ===== 10. appliances, furniture, household ============================================================
  rule('appliances', 'ppa', ['refrigerators?|fridges?|freezers?|dishwashers?|washing machines?|clothes washers?|clothes dryers?|washer and dryer|washer dryer sets?|toaster ovens?|microwave ovens?|microwaves?|convection ovens?|wall ovens?|stoves?|cooktops?|gas ranges?|electric ranges?|range hoods?|water heaters?|tankless|air conditioners?|dehumidifiers?|humidifiers?|vacuum cleaners?|vacuums?|toasters?|blenders?|stand mixers?|hand mixers?|kitchen mixers?|coffee (makers?|machines?)|espresso machines?|air fryers?|slow cookers?|crock pots?|instant pots?|rice cookers?|electric kettles?|ice makers?|space heaters?|ceiling fans?|box fans?'],
    ['parts?|filters?|bags?|toys?|play|plush|ornaments?|posters?|shirts?|hair']),
  rule('furniture-patio-racks', 'fua', ['patio (sets?|furniture|chairs?|tables?)|outdoor (furniture|dining|seating)|adirondack|lawn chairs?|clothing racks?|garment racks?|coat racks?|hall trees?|shoe racks?|filing cabinets?']),
  rule('furniture-main', 'fua', ['sofas?|couch(es)?|loveseats?|sectionals?|recliners?|ottomans?|armchairs?|chairs?|stools?|bench(es)?|coffee tables?|end tables?|dining (tables?|sets?)|desks?|dressers?|nightstands?|bookcases?|bookshelf|bookshelves|armoires?|wardrobes?|bed frames?|headboards?|bunk beds?|daybeds?|futons?|mattress(es)?|shelving units?|sideboards?|credenzas?|hutch(es)?|buffets?|vanit(y|ies)|storage bench(es)?'],
    ['camping|folding camp|beach|lawn|fishing|bike|cell|high ?chairs?|car seats?|toys?|play|doll|dolls|miniature|dollhouse|lego|poker|chair covers?|cushions?|pads?|mats?|massage|gaming|plush|ornaments?|figurines?|posters?|shirts?|stool softener|desk (lamps?|organizers?|calendars?|pads?|sets?|fans?)|buffet (servers?|warmers?)|bench (grinders?|vises?|press|top)|milk stools?|riser|stands? only']),
  rule('household-kitchen-decor', 'hsa', ['lamps?|lanterns?|chandeliers?|sconces?|light fixtures?|candles?|candle holders?|candlesticks?|vases?|picture frames?|photo frames?|frames?|mirrors?|rugs?|area rugs?|curtains?|drapes?|blankets?|quilts?|comforters?|bedspreads?|bedding|towels?|linens?|tablecloths?|placemats?|napkins?|dishes|dishware|dinnerware|plates?|bowls?|mugs?|glassware|flatware|silverware|cutlery|cookware|bakeware|kitchenware|utensils?|canisters?|baskets?|wall (art|decor|clocks?)|throw pillows?|clocks?|candy dish(es)?|serving (trays?|dish(es)?)|decor|decorative|home decor|christmas (trees?|decorations?)|holiday decor'],
    ['car|rear view|rearview|side view|bike|bicycle|eyeglass|sunglass|glasses|telescope|motorcycle|toys?|play|dollhouse|plush|golf|hockey|baseball|guitars?|picture (disc|vinyl)|dvds?|cds?|records?|headlamps?|headlights?|flashlights?|grow lights?|clock radios?|bluetooth|license|number|armor|carrier|super|rose|orange|cotton|fiesta|truck|trailer']),

  // ===== 11. clothing, jewelry, beauty, baby, toys, crafts, pets =========================================
  rule('jewelry-making', 'ara', ['jewelry making|beading|beads|findings|jewelry supplies|loose beads?']),
  rule('jewelry', 'jwa', ['jewelry|jewellery|necklaces?|bracelets?|earrings?|pendants?|brooch(es)?|cufflinks?|wristwatch(es)?|pocket watch(es)?|watches|watch (bands?|straps?)|wedding rings?|engagement rings?|class rings?|signet rings?|diamond rings?|gold rings?|silver rings?|sterling (silver )?rings?|ring size|anklets?|tie (clips?|tacks?|bars?)|shirt studs?|charm bracelets?'],
    ['box(es)?|box|armoires?|organizers?|stands?|displays?|cleaners?|tools?|making|toys?|play|dress up|costume|plush|dvds?|cds?|clock radios?']),
  rule('beauty-health', 'haa', ['skin ?care|moisturizers?|serums?|lotions?|shampoos?|conditioners?|perfumes?|colognes?|fragrances?|lipsticks?|mascara|makeup|cosmetics?|nail polish|hair (dryers?|straighteners?|curlers?|clippers?|trimmers?)|razors?|electric shavers?|shavers?|beard trimmers?|massagers?|heating pads?|vitamins?|supplements?|essential oils?|eyeliner|bath (bombs?|salts?)'],
    ['toys?|play|plush|dvds?|cds?|books?']),
  rule('baby-kids', 'baa', ['strollers?|baby car seats?|infant car seats?|high ?chairs?|cribs?|bassinets?|playpens?|baby (monitors?|gates?|swings?|carriers?|bouncers?|walkers?|clothes|bottles?|toys?|bedding|blankets?|wipes?|food)|diaper (bags?|pails?)|diapers?|changing tables?|breast pumps?|bottle warmers?|nursery'], ['dolls?|dollhouse|doll (strollers?|cribs?)|toys? strollers?']),
  rule('toys-games', 'taa', ['toys?|action figures?|dolls?|barbie|lego|legos|hot wheels|matchbox|nerf|play ?sets?|model (kits?|trains?|cars?|airplanes?)|die ?cast|rc (cars?|trucks?|planes?|helicopters?)|remote control (cars?|trucks?|planes?|helicopters?)|board games?|card games?|puzzles?|jigsaws?|yo ?yos?|slinkys?|fidget|squishmallows?|funko|plush|stuffed animals?|playing cards?|dice|monopoly|scrabble|chess sets?|checkers'],
    ['video games?|ps[1-5]|xbox|nintendo|neo geo|console|cartridge|dog toys?|cat toys?|pet toys?|toys? for (dogs?|cats?)|throws?|blankets?|robes?|rugs?|towels?']),
  rule('arts-crafts', 'ara', ['paintings?|oil paintings?|watercolors?|lithographs?|etchings?|sculptures?|yarn|fabric|sewing machines?|sewing (patterns?|kits?|notions?)|knitting|crochet|cross stitch|embroidery|scrapbook|craft (supplies|kits?)|glue guns?|cricut|easels?|sketch ?books?|acrylic paints?|paint brushes|canvas (prints?|paintings?|boards?)|quilting|needlework|soap making|candle making'],
    ['toys?|play|house paints?|exterior|interior|latex|truck|car|auto|sprayers?|boats?|bike|bicycles?']),
  rule('clothing-title', 'cla', ['t shirts?|tshirts?|blouses?|dresses|jeans|trousers|skirts?|sweaters?|hoodies?|sweatshirts?|tracksuits?|jerseys?|sneakers?|sandals?|handbags?|purses?|leggings|swimsuits?|bikinis?|lingerie|pajamas?|scarves|beanies?|baseball caps?|work boots?|cowboy boots?|rain boots?|snow boots?|boots|shoes|coats?|jackets?|hats?|suit jackets?'],
    ['dust jackets?|book|life jackets?|flak|racks?|hooks?|hangers?|stands?|arms|paint|primer|hard hats?|boxes|box|pins?|toys?|play|doll|dolls|plush|ornaments?|figurines?|posters?|golf|hockey|bike|motorcycle|ski|memorabilia|dvds?|cds?|ammo|dog|pet|baby|nursery|dollhouse']),
  rule('pets-title', 'foa', ['aquariums?|fish tanks?|dog (beds?|collars?|leash(es)?|crates?|kennels?|bowls?|houses?)|cat (trees?|litter|beds?|carriers?)|bird cages?|pet (carriers?|beds?|bowls?|crates?|gates?|strollers?)|terrariums?|hamster cages?'], ['figurines?|statues?|prints?|paintings?|posters?|dvds?|cds?|books?']),

  // ===== 12. tickets, business ===========================================================================
  rule('tickets', 'tia', ['cat:tickets and experiences|tickets and passes|event tickets|concert tickets|sporting event tickets'], ['stubs?|memorabilia|ephemera|vintage|collectibles?']),
  rule('business-equipment', 'bfa', ['chromatography|lab (equipment|supplies|glassware)|laboratory|test equipment|power transformers?|hydraulics?|pneumatics?|valves? and manifolds?|other valves|manifolds?|industrial (equipment|supplies|automation)|restaurant equipment|commercial (kitchen|equipment|refrigerators?|freezers?|ovens?)|cash registers?|pos terminals?|pallet jacks?|trimming machines?|heat exchangers?|centrifuges?'], ['toys?|models?|collectibles?']),

  // ===== 13. generic category-level fallbacks (every pattern is cat: scoped) =============================
  rule('cat-sports-mem', 'cba', ['cat:sports mem|fan shop|sports memorabilia|entertainment memorabilia|historical memorabilia|music memorabilia']),
  rule('cat-yard-garden', 'gra', ['cat:yard garden and outdoor living|gardening|lawn and garden|farm and ranch|patio lawn and garden|hydroponics']),
  rule('cat-sporting', 'sga', ['cat:sporting goods|baseball and softball|camping and hiking|fishing|golf clubs|exercise and fitness|fitness running and yoga|team sports|outdoor sports|water sports|winter sports']),
  rule('cat-movies-music', 'ema', ['cat:movies and tv|music'], ['cat:memorabilia|instruments?|boxes|stands?|equipment|gear|lessons?|course']),
  rule('cat-books', 'bka', ['cat:books and magazines|books|magazines']),
  rule('cat-video-games', 'vga', ['cat:video games and consoles|video games']),
  rule('cat-music-gear', 'msa', ['cat:musical instruments and gear|musical instruments|pro audio|guitars and basses|drums and percussion|piano and organ|ukuleles|effects pedals']),
  rule('cat-electronics', 'ela', ['cat:consumer electronics|electronics']),
  rule('cat-computers', 'sya', ['cat:computers tablets and networking|computers']),
  rule('cat-cameras', 'pha', ['cat:cameras and photo|cameras']),
  rule('cat-cell-phones', 'moa', ['cat:cell phones and accessories|cell phones']),
  rule('cat-cycling-parts', 'bip', ['cat:cycling parts|bicycle parts|bike parts|bicycle components']),
  rule('cat-cycling', 'bia', ['cat:cycling|bicycles?'], ['cat:parts?|accessories|clothing|apparel|helmets?']),
  rule('cat-tools', 'tla', ['cat:tools|power tools|hand tools|tools and workshop equipment|tools and workshop']),
  rule('cat-materials', 'maa', ['cat:building materials|building supplies|flooring|roofing|insulation|plumbing|industrial plumbing|hardware']),
  rule('cat-appliances', 'ppa', ['cat:major appliances|small appliances|kitchen appliances|home appliances|appliances']),
  rule('cat-furniture', 'fua', ['cat:furniture']),
  rule('cat-household', 'hsa', ['cat:home decor|kitchen dining and bar|kitchen|dining|bedding|linens|housewares|pottery and glass|glassware|dinnerware|lamps|lighting|candles|mirrors|clocks']),
  rule('cat-jewelry', 'jwa', ['cat:jewelry and watches|jewelry|watches'], ['cat:making|supplies']),
  rule('cat-clothing', 'cla', ['cat:clothing shoes and accessories|clothing|apparel|handbags and purses|shoes']),
  rule('cat-beauty', 'haa', ['cat:health and beauty|beauty|skin care|hair care|nail care|health care|vitamins and supplements|shaving']),
  rule('cat-baby', 'baa', ['cat:baby|baby and kids|baby products|nursery']),
  rule('cat-toys', 'taa', ['cat:toys and hobbies|dolls and bears|toys|action figures|model trains?|games']),
  rule('cat-crafts', 'ara', ['cat:^art$|artwork|fine art|art supplies|arts and crafts|crafts|sewing|knitting and crochet']),
  rule('cat-pets', 'foa', ['cat:pet supplies|pets|aquariums?']),
  rule('cat-collectibles', 'cba', ['cat:collectibles|collectables']),
  rule('cat-antiques', 'ata', ['cat:antiques']),
  rule('cat-business', 'bfa', ['cat:business and industrial']),
  rule('cat-home-garden', 'hsa', ['cat:home and garden']),
  rule('cat-everything-else', 'foa', ['cat:everything else']),
];

// ---------------------------------------------------------------------------------------------------
// LAYER 3: one-word category names, used only when exactly one category matches
// ---------------------------------------------------------------------------------------------------
export const CRAIGSLIST_SCORED_ALIASES: CraigslistScoredAlias[] = [
  { id: 'ata', any: 'antiques', none: 'dvds?|books?' },
  { id: 'ppa', any: 'appliances?' },
  { id: 'baa', any: 'baby|infant|toddler', none: 'dolls?' },
  { id: 'bka', any: 'books?|novels?|paperbacks?|hardcovers?', none: 'bookends?|bookcases?|cases?|comics?' },
  { id: 'bia', any: 'bicycles?|bikes?', none: 'dirt|motor|exercise|stationary' },
  { id: 'cla', any: 'clothing|apparel' },
  { id: 'cba', any: 'collectibles?|memorabilia' },
  { id: 'sya', any: 'laptops?|computers?' },
  { id: 'ela', any: 'electronics|televisions?|headphones?' },
  { id: 'fua', any: 'furniture' },
  { id: 'jwa', any: 'jewelry|jewellery|watches', none: 'box(es)?|box|making' },
  { id: 'msa', any: 'guitars?|ukuleles?|violins?' },
  { id: 'pha', any: 'cameras?|camcorders?', none: 'security|toys?' },
  { id: 'sga', any: 'sporting goods|sports equipment' },
  { id: 'tla', any: 'tools?|toolbox(es)?', none: 'garden|nail|hair|makeup' },
  { id: 'taa', any: 'toys?|dolls?', none: 'dogs?|cats?|pets?' },
  { id: 'vga', any: 'video games?|consoles?', none: 'strategy' },
  { id: 'haa', any: 'skin care|cosmetics?|makeup|perfumes?' },
  { id: 'hsa', any: 'housewares|kitchenware|home decor|household' },
  { id: 'ara', any: 'craft supplies|art supplies|crafts?' },
];
