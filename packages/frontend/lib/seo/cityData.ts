/**
 * FindA.Sale — City SEO Framework
 *
 * Single source of truth for all city-based SEO landing pages.
 * Used by:
 *   - /estate-sales/[city-slug]  (live)
 *   - /yard-sales/[city-slug]    (future)
 *   - /auctions/[city-slug]      (future)
 *   - /flea-markets/[city-slug]  (future)
 *
 * To add a new city: add a row to CITY_DATA below.
 * To add a new page type: call getEstateSalesFaqs() with a saleType param,
 *   or create a parallel getFaqs() function for that type.
 *
 * Framework exports:
 *   CityMeta         — type for per-city content
 *   FaqItem          — type for FAQ entries
 *   getCityMeta()        — returns CityMeta for a slug, or a generated fallback
 *   getYardSaleMeta()   — returns yard-sale-specific knownFor/tip for the About section
 *   getEstateSalesFaqs() — returns FAQ array for a city (estate-sales)
 *   getYardSaleFaqs()   — returns FAQ array for a city (yard-sales)
 *   buildFaqJsonLd() — returns FAQPage JSON-LD object
 *   buildSeoTitle()  — consistent <title> builder
 *   buildSeoDescription() — consistent meta description builder
 *   getNearbyLinks() — returns [{slug, label}] for nearby city links
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CityMeta {
  /** URL slug — must match the page route (e.g. "denver-co") */
  slug: string;
  /** Human-readable city name (e.g. "Denver") */
  displayName: string;
  /** Two-letter state code (e.g. "CO") */
  stateCode: string;
  /**
   * One sentence unique to this city describing what makes its estate sales
   * interesting — what to expect, what's commonly found, regional character.
   * Keep under 200 chars. Used in the "About" section on the landing page.
   */
  knownFor: string;
  /**
   * One actionable shopper tip specific to this city — best time to go,
   * neighborhoods to target, seasonal patterns, etc.
   * Keep under 200 chars.
   */
  tip: string;
  /**
   * 4–6 nearby city slugs for the "Nearby Cities" section.
   * Pick geographic neighbors — same metro or within ~2h drive.
   */
  nearbySlugs: string[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

// ---------------------------------------------------------------------------
// City data table
// ---------------------------------------------------------------------------
// Keys are URL slugs. Add new cities here — the page picks them up automatically.
// Fields: displayName, stateCode, knownFor, tip, nearbySlugs

const CITY_DATA: Record<string, Omit<CityMeta, 'slug'>> = {
  // --- Midwest ---
  'grand-rapids-mi': {
    displayName: 'Grand Rapids',
    stateCode: 'MI',
    knownFor:
      'Grand Rapids estate sales reflect the city\'s Dutch heritage and furniture-industry roots — mid-century modern pieces, Craftsman-era woodwork, and quality Dutch Colonial antiques appear regularly.',
    tip:
      'Sales in the East Hills and Heritage Hill neighborhoods often feature the oldest and most valuable pieces. Check listings Thursday evening and plan to arrive 15 minutes before doors open.',
    nearbySlugs: ['detroit-mi', 'kalamazoo-mi', 'lansing-mi', 'chicago-il', 'toledo-oh'],
  },
  'detroit-mi': {
    displayName: 'Detroit',
    stateCode: 'MI',
    knownFor:
      'Detroit estate sales span the full spectrum — from opulent Grosse Pointe and Indian Village estates with fine furniture and silverware, to mid-century bungalow sales full of Motown-era collectibles.',
    tip:
      'The Grosse Pointe suburbs and Birmingham hold the region\'s most-anticipated sales. Arrive early on day one — jewelry and art move within the first hour.',
    nearbySlugs: ['grand-rapids-mi', 'toledo-oh', 'lansing-mi', 'cleveland-oh', 'chicago-il'],
  },
  'kalamazoo-mi': {
    displayName: 'Kalamazoo',
    stateCode: 'MI',
    knownFor:
      'Kalamazoo sales blend college-town variety with small-city charm — vintage books, mid-century furniture, and Upjohn-era household goods are common finds in this Southwest Michigan market.',
    tip:
      'Sales in the Stuart neighborhood and Vine neighborhoods tend to feature older homes with well-preserved contents. The market is less competitive than Detroit, so day-two bargains are real.',
    nearbySlugs: ['grand-rapids-mi', 'lansing-mi', 'chicago-il', 'south-bend-in'],
  },
  'lansing-mi': {
    displayName: 'Lansing',
    stateCode: 'MI',
    knownFor:
      'Lansing and East Lansing estate sales are driven by the state-government and university communities — expect quality mid-century furniture, vintage academic memorabilia, and well-maintained household collections.',
    tip:
      'MSU faculty and state-employee estates often contain extensive book and art collections. Saturday morning is prime time; many sales discount 25–50% on Sunday.',
    nearbySlugs: ['grand-rapids-mi', 'detroit-mi', 'kalamazoo-mi', 'toledo-oh'],
  },
  'chicago-il': {
    displayName: 'Chicago',
    stateCode: 'IL',
    knownFor:
      'Chicago\'s estate sale scene is one of the largest in the country — North Shore suburbs like Winnetka and Lake Forest produce high-end sales with fine art, antiques, and designer furnishings on a near-weekly basis.',
    tip:
      'The North Shore suburbs (Evanston, Wilmette, Winnetka, Glencoe) are the richest hunting grounds. Check listings Tuesday–Wednesday; popular sales fill their preview slots by Thursday.',
    nearbySlugs: ['milwaukee-wi', 'indianapolis-in', 'detroit-mi', 'minneapolis-mn', 'grand-rapids-mi'],
  },
  'minneapolis-mn': {
    displayName: 'Minneapolis',
    stateCode: 'MN',
    knownFor:
      'Minneapolis estate sales reflect the region\'s Scandinavian heritage — mid-century modern Scandinavian furniture, handcrafted items, and well-preserved winter-home collections are signature finds.',
    tip:
      'Sales in Edina, Minnetonka, and Wayzata suburbs offer the best volume of quality furniture. Spring (April–June) is peak season as families downsize after winter.',
    nearbySlugs: ['milwaukee-wi', 'chicago-il', 'des-moines-ia', 'madison-wi'],
  },
  'milwaukee-wi': {
    displayName: 'Milwaukee',
    stateCode: 'WI',
    knownFor:
      'Milwaukee estate sales reflect the city\'s German and Polish heritage — quality hand-crafted furniture, pre-war household goods, and vintage brewing memorabilia are standout finds.',
    tip:
      'The East Side and Shorewood neighborhoods produce some of the most well-stocked sales. Milwaukee is less competitive than Chicago, making it an underrated market for serious buyers.',
    nearbySlugs: ['chicago-il', 'minneapolis-mn', 'madison-wi', 'grand-rapids-mi'],
  },
  'indianapolis-in': {
    displayName: 'Indianapolis',
    stateCode: 'IN',
    knownFor:
      'Indianapolis estate sales draw from a broad Midwest base — Meridian-Kessler and Broad Ripple neighborhood sales produce quality period furniture, vintage Americana, and Indy 500 collectibles.',
    tip:
      'Carmel and Zionsville suburbs to the north often yield higher-end furniture and art. Most sales run Friday–Sunday; Sunday afternoon brings the best deals.',
    nearbySlugs: ['chicago-il', 'columbus-oh', 'cincinnati-oh', 'louisville-ky'],
  },
  'columbus-oh': {
    displayName: 'Columbus',
    stateCode: 'OH',
    knownFor:
      'Columbus estate sales benefit from the city\'s rapid growth — estates from long-established German Village and Bexley families sit alongside university-adjacent collections with a wide range of items.',
    tip:
      'German Village and Upper Arlington estates are the most sought-after. Ohio State faculty estates frequently include extensive book, art, and instrument collections.',
    nearbySlugs: ['cleveland-oh', 'cincinnati-oh', 'indianapolis-in', 'pittsburgh-pa', 'detroit-mi'],
  },
  'cleveland-oh': {
    displayName: 'Cleveland',
    stateCode: 'OH',
    knownFor:
      'Cleveland\'s historic neighborhoods — Shaker Heights, Lakewood, Rocky River — produce estate sales with exceptional vintage furniture, Depression-era glassware, and Great Lakes maritime antiques.',
    tip:
      'Shaker Heights estates are renowned for quality and volume. The market is active year-round; winter sales often see less competition and better prices.',
    nearbySlugs: ['columbus-oh', 'pittsburgh-pa', 'detroit-mi', 'cincinnati-oh'],
  },
  'cincinnati-oh': {
    displayName: 'Cincinnati',
    stateCode: 'OH',
    knownFor:
      'Cincinnati estate sales draw from one of Ohio\'s oldest settled regions — Federal and Victorian-era antiques, Ohio River Valley art pottery, and Rookwood ceramics are signature finds.',
    tip:
      'Hyde Park, Anderson Township, and Indian Hill produce the region\'s most valuable estates. Rookwood and Roseville pottery appear more here than almost anywhere in the Midwest.',
    nearbySlugs: ['columbus-oh', 'indianapolis-in', 'louisville-ky', 'dayton-oh'],
  },
  'pittsburgh-pa': {
    displayName: 'Pittsburgh',
    stateCode: 'PA',
    knownFor:
      'Pittsburgh estate sales reflect the city\'s industrial heritage — quality hand-forged tools, vintage steel-industry memorabilia, Carnegie-era furniture, and Western Pennsylvania folk art appear regularly.',
    tip:
      'Shadyside, Squirrel Hill, and Fox Chapel suburbs hold the most well-appointed sales. Steel-era estates can contain unexpected fine art collections from culturally engaged families.',
    nearbySlugs: ['cleveland-oh', 'philadelphia-pa', 'columbus-oh', 'baltimore-md'],
  },
  'kansas-city-mo': {
    displayName: 'Kansas City',
    stateCode: 'MO',
    knownFor:
      'Kansas City estate sales blend Midwest charm with Southern influence — Country Club Plaza-area estates produce fine furniture, Western art, and Jazz-era collectibles unique to KC\'s cultural history.',
    tip:
      'Leawood and Prairie Village on the Kansas side, and Mission Hills on the Missouri side, consistently produce the region\'s strongest sales. Art and antique jewelry move fast on day one.',
    nearbySlugs: ['st-louis-mo', 'omaha-ne', 'oklahoma-city-ok', 'wichita-ks'],
  },
  'st-louis-mo': {
    displayName: 'St. Louis',
    stateCode: 'MO',
    knownFor:
      'St. Louis estate sales are shaped by the city\'s French colonial and Victorian-era roots — Ladue and Webster Groves estates produce antique furniture, art glass, and World\'s Fair memorabilia.',
    tip:
      'Ladue, Kirkwood, and Webster Groves are the most productive neighborhoods. St. Louis is an underrated market nationally — quality is high and competition is manageable.',
    nearbySlugs: ['kansas-city-mo', 'chicago-il', 'indianapolis-in', 'memphis-tn'],
  },

  // --- South ---
  'atlanta-ga': {
    displayName: 'Atlanta',
    stateCode: 'GA',
    knownFor:
      'Atlanta estate sales reflect the city\'s rapid growth and diversity — Buckhead and Druid Hills estates yield fine Southern antiques and art, while intown neighborhoods offer mid-century and vintage design finds.',
    tip:
      'Buckhead and Sandy Springs consistently produce the largest-volume sales. Fall (October–November) is Atlanta\'s peak estate sale season; summer heat slows activity considerably.',
    nearbySlugs: ['birmingham-al', 'charlotte-nc', 'nashville-tn', 'memphis-tn'],
  },
  'birmingham-al': {
    displayName: 'Birmingham',
    stateCode: 'AL',
    knownFor:
      'Birmingham estate sales draw from the city\'s Deep South heritage — Mountain Brook and Homewood estates produce antique Southern furniture, Civil War-era collectibles, and regional folk art at accessible prices.',
    tip:
      'Mountain Brook is Birmingham\'s premier estate sale neighborhood — homes here have been in families for generations and the contents reflect it. Sales typically run Thursday–Saturday.',
    nearbySlugs: ['atlanta-ga', 'nashville-tn', 'memphis-tn', 'montgomery-al'],
  },
  'nashville-tn': {
    displayName: 'Nashville',
    stateCode: 'TN',
    knownFor:
      'Nashville\'s estate sale scene has grown rapidly alongside the city — Belle Meade and Green Hills estates feature Southern antiques and music-industry memorabilia, while newer neighborhoods offer modern collections.',
    tip:
      'Belle Meade is Nashville\'s top estate sale neighborhood. The market has gotten competitive — sign up for email alerts and plan to arrive right at opening time for desirable sales.',
    nearbySlugs: ['memphis-tn', 'atlanta-ga', 'louisville-ky', 'birmingham-al', 'knoxville-tn'],
  },
  'memphis-tn': {
    displayName: 'Memphis',
    stateCode: 'TN',
    knownFor:
      'Memphis estate sales are steeped in Delta blues and Civil Rights history — Midtown and East Memphis estates produce unique Southern furniture, music memorabilia, and antebellum-era household goods.',
    tip:
      'East Memphis and Germantown suburbs produce the most consistent quality. Memphis is a buyers\' market compared to Nashville — prices are lower and day-two bargains are abundant.',
    nearbySlugs: ['nashville-tn', 'birmingham-al', 'st-louis-mo', 'little-rock-ar'],
  },
  'louisville-ky': {
    displayName: 'Louisville',
    stateCode: 'KY',
    knownFor:
      'Louisville estate sales blend Southern and Midwestern character — the Highlands and Cherokee Triangle yield Victorian-era antiques, bourbon-country collectibles, and Churchill Downs memorabilia.',
    tip:
      'The Highlands neighborhood and St. Matthews suburb are the most productive. Derby week (late April/early May) brings added competition as collectors visit from out of town.',
    nearbySlugs: ['cincinnati-oh', 'indianapolis-in', 'nashville-tn', 'lexington-ky'],
  },
  'charlotte-nc': {
    displayName: 'Charlotte',
    stateCode: 'NC',
    knownFor:
      'Charlotte estate sales reflect the city\'s banking-sector affluence — Myers Park and Dilworth neighborhoods produce quality furniture and art collections from established families.',
    tip:
      'Myers Park and SouthPark area estates yield the most high-end pieces. Charlotte\'s market is growing quickly — monitor listings mid-week for new Saturday additions.',
    nearbySlugs: ['raleigh-nc', 'atlanta-ga', 'richmond-va', 'columbia-sc'],
  },
  'raleigh-nc': {
    displayName: 'Raleigh',
    stateCode: 'NC',
    knownFor:
      'Raleigh estate sales are shaped by the Research Triangle\'s tech and university communities — Cameron Park and North Hills estates feature quality contemporary furnishings alongside older Piedmont-region antiques.',
    tip:
      'Cameron Park and North Hills suburbs offer the best mix of quality and selection. The Triangle is a growing market — new organizers are active and listings have increased significantly year over year.',
    nearbySlugs: ['charlotte-nc', 'richmond-va', 'columbia-sc', 'greensboro-nc'],
  },
  'richmond-va': {
    displayName: 'Richmond',
    stateCode: 'VA',
    knownFor:
      'Richmond estate sales are among the most historically rich on the East Coast — The Fan, Monument Avenue, and Windsor Farms estates produce Federal and Colonial-era antiques, Civil War artifacts, and Virginia fine art.',
    tip:
      'Windsor Farms and the West End neighborhoods hold the most valuable sales. Richmond buyers are knowledgeable — do your research on antique values before day-one shopping.',
    nearbySlugs: ['philadelphia-pa', 'charlotte-nc', 'baltimore-md', 'raleigh-nc'],
  },
  'jacksonville-fl': {
    displayName: 'Jacksonville',
    stateCode: 'FL',
    knownFor:
      'Jacksonville estate sales serve a large and active retiree community — Avondale, San Marco, and Ponte Vedra estates produce quality furniture, coastal art, and vintage Florida collectibles.',
    tip:
      'Avondale and San Marco neighborhoods have the most established inventory. Winter months (November–March) bring an influx of snowbird estates; plan ahead as competition rises.',
    nearbySlugs: ['orlando-fl', 'tampa-fl', 'savannah-ga', 'miami-fl'],
  },
  'orlando-fl': {
    displayName: 'Orlando',
    stateCode: 'FL',
    knownFor:
      'Orlando estate sales reflect the city\'s transient and retirement population — Winter Park and Doctor Phillips estates produce a wide range of finds from Disney-adjacent careers and seasonal residents.',
    tip:
      'Winter Park is Orlando\'s most productive estate sale neighborhood. January through March is peak season; spring break and summer slow the market considerably.',
    nearbySlugs: ['tampa-fl', 'jacksonville-fl', 'miami-fl', 'sarasota-fl'],
  },
  'miami-fl': {
    displayName: 'Miami',
    stateCode: 'FL',
    knownFor:
      'Miami estate sales reflect the city\'s Latin American and Caribbean cultural mix — Coral Gables and Coconut Grove estates produce Art Deco furnishings, tropical art, and international collectibles rare elsewhere in the US.',
    tip:
      'Coral Gables and Coconut Grove are Miami\'s premier estate sale neighborhoods. Arrive early — Miami buyers are competitive and the best pieces go quickly, especially art and jewelry.',
    nearbySlugs: ['orlando-fl', 'jacksonville-fl', 'tampa-fl', 'fort-lauderdale-fl'],
  },
  'tampa-fl': {
    displayName: 'Tampa',
    stateCode: 'FL',
    knownFor:
      'Tampa estate sales blend old Florida charm with Bay Area prosperity — Hyde Park, Palma Ceia, and South Tampa estates produce quality furniture and Gulf Coast antiques from multi-generational Florida families.',
    tip:
      'Hyde Park and Palma Ceia neighborhoods host Tampa\'s most-watched sales. Florida\'s year-round mild weather means the market is active all year, peaking October–April.',
    nearbySlugs: ['orlando-fl', 'jacksonville-fl', 'sarasota-fl', 'miami-fl'],
  },
  'oklahoma-city-ok': {
    displayName: 'Oklahoma City',
    stateCode: 'OK',
    knownFor:
      'Oklahoma City estate sales reflect the region\'s oil-boom heritage — Nichols Hills and Edmond estates produce quality Western art, Native American crafts, and oil-industry-era furnishings at accessible prices.',
    tip:
      'Nichols Hills is OKC\'s most productive estate sale neighborhood. Oklahoma City is an underrated buyer\'s market — prices are lower than comparable Midwest cities and selection is strong.',
    nearbySlugs: ['kansas-city-mo', 'dallas-tx', 'tulsa-ok', 'wichita-ks'],
  },

  // --- Southwest / West ---
  'denver-co': {
    displayName: 'Denver',
    stateCode: 'CO',
    knownFor:
      'Denver estate sales blend mountain heritage with urban sophistication — Cherry Creek and Washington Park estates regularly feature mid-century modern furniture, Western art, and outdoor sports collectibles.',
    tip:
      'Cherry Creek and the Highlands neighborhoods produce Denver\'s most-watched sales. Spring (March–May) is the strongest season; ski-town moves and relocations add volume in fall.',
    nearbySlugs: ['colorado-springs-co', 'boulder-co', 'salt-lake-city-ut', 'albuquerque-nm'],
  },
  'phoenix-az': {
    displayName: 'Phoenix',
    stateCode: 'AZ',
    knownFor:
      'Phoenix estate sales draw from a large, active retiree market — Scottsdale and Paradise Valley estates produce Southwestern art, Native American jewelry, and quality contemporary furnishings year-round.',
    tip:
      'Scottsdale is Phoenix\'s top estate sale suburb — estates there often include significant art and jewelry collections. October through April is peak season; summer heat reduces activity.',
    nearbySlugs: ['tucson-az', 'las-vegas-nv', 'albuquerque-nm', 'salt-lake-city-ut'],
  },
  'tucson-az': {
    displayName: 'Tucson',
    stateCode: 'AZ',
    knownFor:
      'Tucson estate sales are rich in Southwestern character — Catalina Foothills and Oro Valley estates produce Native American art, Spanish Colonial antiques, and unique desert-region collectibles.',
    tip:
      'Catalina Foothills estates consistently offer the best selection of Southwestern art and jewelry. Tucson is less competitive than Phoenix — quality buyers should compare both markets.',
    nearbySlugs: ['phoenix-az', 'albuquerque-nm', 'el-paso-tx'],
  },
  'albuquerque-nm': {
    displayName: 'Albuquerque',
    stateCode: 'NM',
    knownFor:
      'Albuquerque estate sales are unlike anywhere else in the US — the Old Town and Nob Hill areas produce authentic Pueblo pottery, Navajo textiles, turquoise jewelry, and Spanish Colonial furniture.',
    tip:
      'Nob Hill and the Northeast Heights neighborhoods hold Albuquerque\'s most valuable sales. Native American and Spanish Colonial pieces require authentication — research makers and hallmarks before buying.',
    nearbySlugs: ['phoenix-az', 'tucson-az', 'el-paso-tx', 'denver-co'],
  },
  'las-vegas-nv': {
    displayName: 'Las Vegas',
    stateCode: 'NV',
    knownFor:
      'Las Vegas estate sales are driven by a transient population and entertainment-industry workers — Summerlin and Henderson estates produce an eclectic mix of high-end contemporary furnishings, casino collectibles, and showbiz memorabilia.',
    tip:
      'Henderson and Summerlin suburbs yield the most consistent quality. Las Vegas sales often include high-end appliances and electronics from short-tenancy homes — arrival timing is critical.',
    nearbySlugs: ['phoenix-az', 'los-angeles-ca', 'san-diego-ca', 'salt-lake-city-ut'],
  },
  'salt-lake-city-ut': {
    displayName: 'Salt Lake City',
    stateCode: 'UT',
    knownFor:
      'Salt Lake City estate sales reflect the region\'s pioneering and LDS heritage — Avenues and Sugar House districts produce handcrafted pioneer-era furniture, Utah artist works, and well-preserved mid-century collections.',
    tip:
      'The Avenues neighborhood produces Salt Lake\'s oldest and most-storied estates. Spring and fall are peak seasons; summer and winter see reduced activity.',
    nearbySlugs: ['denver-co', 'phoenix-az', 'boise-id', 'las-vegas-nv'],
  },
  'dallas-tx': {
    displayName: 'Dallas',
    stateCode: 'TX',
    knownFor:
      'Dallas estate sales are among the largest in the South — Highland Park and University Park estates produce fine furniture, Texas art, designer clothing, and jewelry from some of the region\'s most established families.',
    tip:
      'Highland Park and Lakewood are Dallas\'s premier estate sale neighborhoods. Arrive at opening — Dallas buyers are competitive and high-value items move within the first 30 minutes.',
    nearbySlugs: ['fort-worth-tx', 'houston-tx', 'austin-tx', 'oklahoma-city-ok', 'san-antonio-tx'],
  },
  'fort-worth-tx': {
    displayName: 'Fort Worth',
    stateCode: 'TX',
    knownFor:
      'Fort Worth estate sales are shaped by the city\'s deep Western heritage — Westover Hills and Ridglea estates produce Western art, cattle-industry antiques, and Texas ranch collectibles alongside quality traditional furnishings.',
    tip:
      'Westover Hills and the Monticello neighborhood offer Fort Worth\'s most valuable sales. Fort Worth is less competitive than Dallas — same quality at better prices.',
    nearbySlugs: ['dallas-tx', 'houston-tx', 'austin-tx', 'oklahoma-city-ok'],
  },
  'houston-tx': {
    displayName: 'Houston',
    stateCode: 'TX',
    knownFor:
      'Houston estate sales reflect the city\'s oil-industry wealth and international character — River Oaks and West University estates produce fine art, antiques, and collections from decades of global travel.',
    tip:
      'River Oaks is Houston\'s most prestigious estate sale neighborhood — arrive early and expect competition. The market is active year-round; spring and fall bring the most estate activity.',
    nearbySlugs: ['dallas-tx', 'austin-tx', 'san-antonio-tx', 'new-orleans-la'],
  },
  'austin-tx': {
    displayName: 'Austin',
    stateCode: 'TX',
    knownFor:
      'Austin estate sales blend Texas tradition with tech-boom affluence — Tarrytown and Old Enfield estates produce eclectic finds from musicians, artists, and tech-industry families drawn by the city\'s unique culture.',
    tip:
      'Tarrytown and West Lake Hills produce Austin\'s most eclectic estates. Austin\'s rapid growth means new organizers appear frequently — check listings Thursday for weekend additions.',
    nearbySlugs: ['san-antonio-tx', 'dallas-tx', 'houston-tx'],
  },
  'san-antonio-tx': {
    displayName: 'San Antonio',
    stateCode: 'TX',
    knownFor:
      'San Antonio estate sales are rich in Texas-Mexican cultural heritage — Alamo Heights and Olmos Park estates produce Spanish Colonial antiques, Texas ranch furniture, and military collectibles from this historic city.',
    tip:
      'Alamo Heights is San Antonio\'s premier estate sale neighborhood. Military-connected estates near JBSA bases often contain travel-acquired collectibles from postings around the world.',
    nearbySlugs: ['austin-tx', 'houston-tx', 'dallas-tx', 'el-paso-tx'],
  },
  'el-paso-tx': {
    displayName: 'El Paso',
    stateCode: 'TX',
    knownFor:
      'El Paso estate sales reflect the unique Tejano and borderland culture — estates in the Upper Valley and Kern Place neighborhoods produce Mexican folk art, Spanish Colonial antiques, and Southwest regional pieces.',
    tip:
      'Upper Valley and Mission Hills neighborhoods hold El Paso\'s best estates. Cross-border cultural items are the city\'s specialty — authenticate folk art and pottery carefully.',
    nearbySlugs: ['albuquerque-nm', 'tucson-az', 'san-antonio-tx'],
  },

  // --- West Coast ---
  'los-angeles-ca': {
    displayName: 'Los Angeles',
    stateCode: 'CA',
    knownFor:
      'Los Angeles estate sales are world-class — Bel Air, Beverly Hills, and Pasadena estates produce film-industry memorabilia, Hollywood Regency furnishings, Mid-Century Modern icons, and designer clothing from some of the most recognizable estates in the country.',
    tip:
      'Pasadena and San Marino estates offer the best quality-to-competition ratio in LA. Beverly Hills and Bel Air command premium prices. Sign up for organizer email lists — good LA sales fill preview slots days in advance.',
    nearbySlugs: ['long-beach-ca', 'san-diego-ca', 'san-francisco-ca', 'sacramento-ca', 'phoenix-az'],
  },
  'long-beach-ca': {
    displayName: 'Long Beach',
    stateCode: 'CA',
    knownFor:
      'Long Beach estate sales draw from a port city with deep naval history — Naples Island, Bixby Knolls, and Belmont Shore estates produce Art Deco pieces, maritime collectibles, and mid-century California furniture.',
    tip:
      'Naples Island and Bixby Knolls neighborhoods host Long Beach\'s best sales. Long Beach is more accessible than LA\'s Westside — arrive at opening for first pick on Art Deco and mid-century finds.',
    nearbySlugs: ['los-angeles-ca', 'san-diego-ca', 'orange-ca', 'pasadena-ca'],
  },
  'san-diego-ca': {
    displayName: 'San Diego',
    stateCode: 'CA',
    knownFor:
      'San Diego estate sales reflect the city\'s military history and coastal lifestyle — Mission Hills, Kensington, and La Jolla estates produce Craftsman bungalow antiques, Pacific Rim collectibles, and classic California furniture.',
    tip:
      'Mission Hills and Kensington are San Diego\'s most historic neighborhoods for estate sales. La Jolla yields higher-end pieces; arrive early on day one as the market is active and knowledgeable.',
    nearbySlugs: ['los-angeles-ca', 'long-beach-ca', 'phoenix-az', 'las-vegas-nv'],
  },
  'san-francisco-ca': {
    displayName: 'San Francisco',
    stateCode: 'CA',
    knownFor:
      'San Francisco estate sales are shaped by Victorian architecture and tech-boom wealth — the Pacific Heights and Noe Valley neighborhoods produce Eastlake Victorian furniture, Asian antiques, and contemporary art from diverse, globe-trotting estates.',
    tip:
      'Pacific Heights and St. Francis Wood produce San Francisco\'s most valuable estates. The Bay Area estate market is sophisticated — research makers and periods before day-one shopping.',
    nearbySlugs: ['los-angeles-ca', 'sacramento-ca', 'san-diego-ca', 'portland-or', 'seattle-wa'],
  },
  'sacramento-ca': {
    displayName: 'Sacramento',
    stateCode: 'CA',
    knownFor:
      'Sacramento estate sales draw from one of California\'s oldest settled cities — Land Park, East Sacramento, and Midtown estates produce Gold Rush-era antiques, California Craftsman furniture, and regional art from the state capital\'s long history.',
    tip:
      'East Sacramento and Land Park are Sacramento\'s most productive neighborhoods. Sales here are less competitive than the Bay Area — excellent quality at reasonable prices.',
    nearbySlugs: ['san-francisco-ca', 'los-angeles-ca', 'reno-nv', 'portland-or'],
  },
  'portland-or': {
    displayName: 'Portland',
    stateCode: 'OR',
    knownFor:
      'Portland estate sales are shaped by the city\'s Arts and Crafts heritage and progressive culture — Irvington and Alameda neighborhood estates produce exceptional Craftsman-era furniture, Pacific Northwest art, and vintage mid-century pieces.',
    tip:
      'Irvington and Alameda neighborhoods consistently offer Portland\'s finest estates. Portland buyers are knowledgeable — mid-century and Craftsman pieces go quickly; art and ceramics reward research.',
    nearbySlugs: ['seattle-wa', 'san-francisco-ca', 'sacramento-ca', 'boise-id'],
  },
  'seattle-wa': {
    displayName: 'Seattle',
    stateCode: 'WA',
    knownFor:
      'Seattle estate sales reflect the city\'s Boeing and tech-industry history — Capitol Hill, Madrona, and Queen Anne estates produce mid-century modern furniture, Pacific Northwest art, and Asian antiques from decades of international trade.',
    tip:
      'Madrona, Windermere, and Medina are Seattle\'s most valuable estate sale neighborhoods. Spring (April–June) is peak season. Tech-executive estates trend toward designer contemporary furniture.',
    nearbySlugs: ['portland-or', 'san-francisco-ca', 'boise-id', 'vancouver-wa'],
  },

  // --- Northeast ---
  'new-york-ny': {
    displayName: 'New York',
    stateCode: 'NY',
    knownFor:
      'New York estate sales span the full spectrum — from Manhattan co-op estates with museum-quality art and antiques, to Brooklyn brownstones packed with Art Deco and mid-century design, to Long Island gold coast estates with fine furniture and silverware.',
    tip:
      'Westchester County and the North Shore of Long Island produce the most volume of high-quality sales. Manhattan sales require appointment registration — sign up the day listings appear.',
    nearbySlugs: ['philadelphia-pa', 'boston-ma', 'hartford-ct', 'newark-nj'],
  },
  'philadelphia-pa': {
    displayName: 'Philadelphia',
    stateCode: 'PA',
    knownFor:
      'Philadelphia estate sales are steeped in colonial and Federal history — Main Line suburb estates produce exceptional American antiques, Pennsylvania German folk art, and Quaker-era household goods that rarely appear in other markets.',
    tip:
      'The Main Line suburbs (Wayne, Bryn Mawr, Villanova) produce Philadelphia\'s most valuable estates. Pennsylvania antiques buyers are knowledgeable — research American period furniture before shopping.',
    nearbySlugs: ['new-york-ny', 'pittsburgh-pa', 'richmond-va', 'baltimore-md'],
  },
  'boston-ma': {
    displayName: 'Boston',
    stateCode: 'MA',
    knownFor:
      'Boston estate sales draw from one of America\'s oldest cities — Newton, Brookline, and the North Shore suburbs produce Federal and Victorian-era antiques, maritime collectibles, and New England folk art with deep historical provenance.',
    tip:
      'Newton, Brookline, and Wellesley are Boston\'s most productive estate sale suburbs. New England antiques buyers are highly competitive — popular sales often have online preview registration.',
    nearbySlugs: ['new-york-ny', 'hartford-ct', 'providence-ri', 'manchester-nh'],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns CityMeta for a slug, or generates a reasonable fallback. */
export function getCityMeta(slug: string): CityMeta {
  const data = CITY_DATA[slug];
  if (data) {
    return { slug, ...data };
  }

  // Fallback: parse slug for display name + state
  const parts = slug.split('-');
  const stateCode = parts[parts.length - 1].toUpperCase();
  const displayName = parts
    .slice(0, -1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    slug,
    displayName,
    stateCode,
    knownFor: `Estate sales in ${displayName} offer a mix of furniture, antiques, collectibles, and household goods from local families and estates. New sales are added regularly.`,
    tip: `Arrive early on the first day for the best selection. Many estate sale organizers offer discounts of 25–50% on the final day.`,
    nearbySlugs: [],
  };
}

/**
 * Returns FAQ items for an estate sales city page.
 * Questions are city-name-aware where useful.
 * Extend this function with a `saleType` param to support yard-sales, auctions, etc.
 */
export function getEstateSalesFaqs(cityName: string, stateCode: string): FaqItem[] {
  return [
    {
      question: `What can I find at estate sales in ${cityName}, ${stateCode}?`,
      answer: `Estate sales in ${cityName} typically include furniture, antiques, artwork, jewelry, clothing, kitchenware, tools, books, collectibles, and electronics. Every sale is different — items reflect the life and interests of the family. Browsing the photo gallery before you go is the best way to know what to expect.`,
    },
    {
      question: `Are estate sales in ${cityName} open to the public?`,
      answer: `Yes — estate sales are open to any member of the public during posted hours. No invitation or membership is required. Some high-demand sales use a numbered entry system or require online registration for the first hour; check the individual listing for details.`,
    },
    {
      question: `What time should I arrive at an estate sale in ${cityName}?`,
      answer: `For desirable sales, arriving 15–30 minutes before opening gives you the best selection. Jewelry, art, and antiques move quickly in the first hour. If a sale uses a numbered entry system, arrive earlier. Day-two and day-three visits reward patient shoppers with steeper discounts — often 25–50% off.`,
    },
    {
      question: `Can I negotiate prices at estate sales?`,
      answer: `Negotiation is common at estate sales, especially on the second or third day when organizers are motivated to clear inventory. On the first day, prices are usually firm on high-value items. Always negotiate respectfully — organizers set prices on behalf of the family and most are open to reasonable offers on slower-moving items.`,
    },
    {
      question: `How do I find estate sales near me in ${cityName}?`,
      answer: `FindA.Sale lists every estate sale in ${cityName} as soon as it's published. Bookmark this page and check back Thursday evening — most ${cityName}-area organizers post weekend sales by end of day Thursday. You can also browse by map to find sales within a specific distance from your location.`,
    },
    {
      question: `What should I bring to an estate sale?`,
      answer: `Bring cash (some organizers don't accept cards), a tape measure if you're buying furniture, bags or boxes for smaller items, and a phone to look up values. Wear comfortable shoes — estate sales involve a lot of walking through a home. If you're buying large items, bring a vehicle that can transport them or arrange same-day pickup.`,
    },
    {
      question: `How do estate sales work?`,
      answer: `Estate sales are run by professional organizers who price and sell the entire contents of a home, usually over a weekend. Buyers browse the home room by room, select items, and pay at a checkout area. Everything is for sale unless marked otherwise. Prices are set to move — the goal is to clear the estate, not maximize every individual price.`,
    },
  ];
}

/** Builds a FAQPage JSON-LD object from an array of FAQ items. */
export function buildFaqJsonLd(faqs: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Builds a consistent SEO title for city landing pages.
 * Hits multiple query variants: "estate sales in [city]", "estate sale [city]",
 * "[city] estate sales".
 *
 * @param cityName   Display name (e.g. "Denver")
 * @param stateCode  Two-letter code (e.g. "CO")
 * @param count      Number of active listings (0 = omit count)
 */
export function buildSeoTitle(
  cityName: string,
  stateCode: string,
  count: number,
  saleType = 'Estate Sales'
): string {
  // Include count only when > 0 — a count of 0 communicates thin content
  if (count > 0) {
    return `${count} ${saleType} in ${cityName}, ${stateCode} — Find Local Sales | FindA.Sale`;
  }
  return `${saleType} in ${cityName}, ${stateCode} — Find Local Sales | FindA.Sale`;
}

/**
 * Builds a consistent SEO meta description for city landing pages.
 */
export function buildSeoDescription(
  cityName: string,
  stateCode: string,
  count: number,
  saleType = 'estate sales'
): string {
  const listed =
    count > 0 ? `${count} upcoming ${saleType}` : `upcoming ${saleType}`;
  return `Browse ${listed} in ${cityName}, ${stateCode}. Find furniture, antiques, collectibles, jewelry, and more at local sales. Listings updated daily on FindA.Sale.`;
}

/**
 * Returns nearby city link data for the "Nearby Cities" section.
 * Each item has a URL slug and a human-readable label.
 */
export function getNearbyLinks(
  cityMeta: CityMeta
): Array<{ slug: string; label: string }> {
  return cityMeta.nearbySlugs.map((slug) => {
    const nearby = CITY_DATA[slug];
    if (nearby) {
      return { slug, label: `${nearby.displayName}, ${nearby.stateCode}` };
    }
    // Fallback: parse slug
    const parts = slug.split('-');
    const sc = parts[parts.length - 1].toUpperCase();
    const name = parts
      .slice(0, -1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return { slug, label: `${name}, ${sc}` };
  });
}

// ---------------------------------------------------------------------------
// Yard-sale-specific About content
// ---------------------------------------------------------------------------
// knownFor and tip for yard/garage sale city pages.
// Estate-sale content in CITY_DATA is specific to estate sale culture and
// should NOT be reused on yard-sales pages.
// Cities not listed here get a generic yard-sale fallback.

const YARD_SALE_ABOUT: Record<string, { knownFor: string; tip: string }> = {
  'grand-rapids-mi': {
    knownFor:
      'Grand Rapids yard sales and garage sales thrive in established West Michigan neighborhoods — expect furniture, tools, outdoor gear, and household goods from family-friendly subdivisions and Dutch Colonial homes throughout the city.',
    tip:
      'East Hills, Heritage Hill, and the East Beltline corridor are reliable hunting grounds for weekend garage sales. Check listings Thursday evening — popular sales in GR fill up fast on Saturday mornings.',
  },
  'denver-co': {
    knownFor:
      "Denver yard sales reflect the city's outdoor-active culture — expect camping gear, ski equipment, bikes, and sporting goods alongside furniture and household items from Washington Park, Capitol Hill, and the suburbs.",
    tip:
      "Washington Park and the Highlands neighborhoods are hotspots for quality garage sales. Denver's mile-high sunshine means sales run year-round, with peak volume April through October.",
  },
  'chicago-il': {
    knownFor:
      "Chicago's garage sale scene is massive — North Side neighborhoods like Lincoln Square, Andersonville, and Irving Park see hundreds of sales each spring weekend, with everything from vintage finds to everyday household goods.",
    tip:
      'North Side neighborhoods are the best hunting ground for weekend garage sales. Subscribe to FindA.Sale alerts mid-week — new Chicago listings are added constantly through Friday.',
  },
  'phoenix-az': {
    knownFor:
      'Phoenix yard sales are a year-round activity thanks to the desert climate — Scottsdale, Tempe, and Chandler neighborhoods produce a steady flow of outdoor gear, patio furniture, and household goods from relocating families.',
    tip:
      'October through April is peak garage sale season in Phoenix (the weather is perfect). Start early — Arizona heat makes afternoon shopping uncomfortable, and the best items are claimed by 9 AM.',
  },
  'dallas-tx': {
    knownFor:
      'Dallas garage sales are abundant across the metro — Highland Park, Plano, and Frisco suburbs see heavy weekend activity with furniture, clothing, toys, and tools from active families and frequent movers.',
    tip:
      'Preston Hollow and the Park Cities are consistent sources of quality garage sales in Dallas. Spring (March–May) sees the highest volume as families clear out before the summer heat.',
  },
  'los-angeles-ca': {
    knownFor:
      'Los Angeles yard sales span the full spectrum of California life — Silver Lake, Echo Park, and the Valley produce eclectic finds from creative professionals, while San Fernando Valley suburbia yields classic garage sale staples.',
    tip:
      'Silver Lake, Los Feliz, and Pasadena are the best neighborhoods for LA garage sales. LA sales tend to list late (Thursday or Friday) — check often for last-minute weekend additions.',
  },
  'new-york-ny': {
    knownFor:
      "New York City yard sales are a treasure hunt — Brooklyn's Park Slope, Ditmas Park, and Astoria in Queens produce some of the most eclectic garage and stoop sales in the country, packed with vintage finds and quality castoffs.",
    tip:
      'Brooklyn and Queens neighborhoods host the most yard and stoop sales. NYC sales list quickly and move fast — set up FindA.Sale alerts and be ready to move on Saturday morning.',
  },
  'houston-tx': {
    knownFor:
      'Houston garage sales are plentiful across the sprawling metro — River Oaks, Memorial, and The Woodlands suburbs see regular weekend sales from active families, and the warm climate keeps them running nearly year-round.',
    tip:
      'Memorial and River Oaks areas yield the highest-quality Houston garage sales. November through March is the most comfortable weather for morning shopping — arrive by 8 AM for the best picks.',
  },
  'seattle-wa': {
    knownFor:
      'Seattle yard sales reflect Pacific Northwest life — Capitol Hill, Ballard, and Fremont neighborhoods produce sales packed with outdoor gear, Pacific Rim finds, artisan goods, and quality mid-century furniture.',
    tip:
      "Ballard and Queen Anne are Seattle's best garage sale neighborhoods. Target dry weekends in May–September — Seattle's rainy season (October–April) significantly reduces outdoor sale activity.",
  },
  'atlanta-ga': {
    knownFor:
      "Atlanta garage sales are active across the metro's many suburban communities — Decatur, Smyrna, and Marietta produce a steady stream of family sales with furniture, clothing, toys, and Southern household goods.",
    tip:
      "Decatur and the Intown neighborhoods host the most eclectic Atlanta yard sales. Spring (March–May) is Atlanta's peak garage sale season — summer heat slows outdoor selling considerably.",
  },
  'minneapolis-mn': {
    knownFor:
      'Minneapolis garage sales are a Midwest staple — Uptown, South Minneapolis, and the western suburbs produce well-organized weekend sales with furniture, winter gear, sports equipment, and Scandinavian-influenced household goods.',
    tip:
      'South Minneapolis and Edina suburbs are reliable for quality garage sales. Season runs May through September — Minneapolis winters shut down outdoor sales entirely, making spring sales particularly stocked.',
  },
  'portland-or': {
    knownFor:
      "Portland yard sales capture the city's creative, DIY spirit — SE Portland, Sellwood, and Mississippi Avenue neighborhoods produce eclectic finds: vintage clothing, handmade goods, vinyl records, and quality furniture.",
    tip:
      'Sellwood and SE Portland are the best neighborhoods for Portland garage sales. The season runs April through October — aim for clear weekend days and check listings Friday morning for new additions.',
  },
  'austin-tx': {
    knownFor:
      "Austin garage sales reflect the city's rapid growth and diverse population — Hyde Park, Cherrywood, and South Austin neighborhoods produce sales ranging from vintage finds and music gear to outdoor equipment and family household goods.",
    tip:
      "Hyde Park and the 78704 zip code (South Austin) are Austin's best garage sale zones. October through April offers the most comfortable weather for morning shopping.",
  },
  'boston-ma': {
    knownFor:
      "Boston yard sales draw from one of America's oldest cities — Brookline, Newton, and Arlington suburbs produce sales with a mix of colonial-era antiques, university-adjacent books and furniture, and quality New England household goods.",
    tip:
      'Brookline and Newton are consistently the best Boston-area neighborhoods for garage sales. Spring sales (April–June) are the richest as families clear out after long winters.',
  },
  'nashville-tn': {
    knownFor:
      "Nashville garage sales have surged with the city's growth — 12South, East Nashville, and the surrounding suburbs produce a mix of vintage finds, music memorabilia, furniture, and household goods from a rapidly changing population.",
    tip:
      'East Nashville and Donelson are the most active Nashville garage sale areas. Spring (March–May) is peak season — summer heat makes outdoor sales less common in Middle Tennessee.',
  },
};

/**
 * Returns yard-sale-specific About content (knownFor + tip) for a city page.
 * Falls back to a generic yard-sale template for cities not in YARD_SALE_ABOUT.
 */
export function getYardSaleMeta(
  slug: string,
  cityName: string,
  stateCode: string
): { knownFor: string; tip: string } {
  if (YARD_SALE_ABOUT[slug]) {
    return YARD_SALE_ABOUT[slug];
  }
  // Generic yard-sale fallback — accurate and not estate-sale-branded
  return {
    knownFor: `${cityName} yard sales and garage sales offer a wide range of finds — furniture, tools, clothing, toys, and household goods from families across the metro. Sales are posted throughout the week with new listings added regularly.`,
    tip: `Check listings Thursday evening for the freshest weekend sales in ${cityName}. Arrive at or before posted start times for the best selection — popular items go quickly on Saturday mornings.`,
  };
}

/**
 * Returns FAQ items for a yard sales city page.
 * Questions are city-name-aware and specific to yard/garage sale culture.
 */
export function getYardSaleFaqs(cityName: string, stateCode: string): FaqItem[] {
  return [
    {
      question: `When are yard sales typically held in ${cityName}, ${stateCode}?`,
      answer: `In ${cityName}, yard sales are most common on Friday mornings, Saturdays, and Sundays between April and October. Weekend mornings — especially Saturday from 7–8 AM — are peak time for serious shoppers. Spring cleaning season (April–May) and fall (September–October) bring the highest volume of sales.`,
    },
    {
      question: `How do I find yard sales near me in ${cityName}?`,
      answer: `FindA.Sale lists yard sales in ${cityName} as soon as they're posted. Check this page Thursday evening — most organizers post weekend sales mid-week. You can also use the map view to find sales within a specific distance from your current location.`,
    },
    {
      question: `What's the best app for finding yard sales in ${cityName}, ${stateCode}?`,
      answer: `FindA.Sale is your best resource for finding yard sales in ${cityName}. It lists yard sales, garage sales, estate sales, and flea markets in one place — updated daily. Bookmark this page or browse the map to find sales near you this weekend.`,
    },
    {
      question: `Are there garage sales this weekend in ${cityName}?`,
      answer: `This page is updated daily with yard and garage sales in ${cityName}. Check back Thursday night or Friday morning for the most complete weekend listing. Sales go up throughout the week, so the freshest listings appear as the weekend approaches.`,
    },
    {
      question: `What time do yard sales start in ${cityName}?`,
      answer: `Most yard sales in ${cityName} start between 7–9 AM and run until early afternoon. Experienced shoppers arrive at or before posted start times for the best selection on furniture, tools, and collectibles. Many sellers mark prices down 25–50% in the final hour to avoid hauling items back inside.`,
    },
    {
      question: `How do I post a yard sale in ${cityName}, ${stateCode}?`,
      answer: `You can list your yard or garage sale on FindA.Sale for free. Create an account, add your sale date, address, and a few photos of what you're selling — listings go live immediately and appear in local search results. Adding photos significantly increases how many shoppers find and attend your sale.`,
    },
    {
      question: `What items sell best at yard sales in ${cityName}?`,
      answer: `Furniture, tools, sporting goods, kitchen items, children's toys, clothing, and vintage or collectible items consistently sell well at yard sales in ${cityName}. Anything priced under $10 moves quickly. Electronics sell well when they're demonstrated to work. Clear labeling and organized displays help shoppers find what they want and increase total sales.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Auction-specific About content
// ---------------------------------------------------------------------------

const AUCTION_ABOUT: Record<string, { knownFor: string; tip: string }> = {
  'grand-rapids-mi': {
    knownFor:
      'Grand Rapids auctions draw on West Michigan\'s deep furniture and manufacturing history — live and online auctions regularly feature estate lots, farm equipment, industrial tools, and quality vintage furniture from the area\'s long-established families.',
    tip:
      'Register early for Grand Rapids area auctions — bidder registration often closes 24 hours before the live event. Preview days are usually the day before; inspect large lots in person before bidding.',
  },
  'denver-co': {
    knownFor:
      'Denver auctions span a wide range — from high-country ranch equipment and Western art at live estate auctions, to downtown gallery auctions featuring Colorado artists and contemporary collectibles.',
    tip:
      'Western art and Native American pieces command premiums at Denver auctions. Research artists and makers before bidding — Colorado collectors are knowledgeable and prices reflect it.',
  },
  'chicago-il': {
    knownFor:
      'Chicago\'s auction scene is one of the most active in the Midwest — the city hosts weekly estate auctions, specialty art auctions, and large-format industrial and real estate auctions year-round.',
    tip:
      'North Shore estate auctions (Evanston, Winnetka, Lake Forest) consistently offer the highest-quality lots. Many Chicago auction houses now offer real-time online bidding — register in advance for access.',
  },
  'phoenix-az': {
    knownFor:
      'Phoenix auctions reflect the region\'s active retiree and collector communities — estate auctions in Scottsdale and Paradise Valley regularly feature Southwestern art, Native American jewelry, and quality contemporary furnishings.',
    tip:
      'Scottsdale auction houses are the premier destination for Native American and Western art bidding in the Southwest. Authenticate turquoise and Navajo textiles carefully — provenance matters significantly for value.',
  },
  'dallas-tx': {
    knownFor:
      'Dallas hosts some of the largest estate and art auctions in the South — Highland Park and Preston Hollow estate auctions produce Texas art, fine furniture, jewelry, and luxury goods from established families.',
    tip:
      'Major Dallas auction events are listed weeks in advance. Set your maximum bid before the live event — competitive Dallas bidders can drive prices well beyond estimate on desirable Texas art lots.',
  },
  'los-angeles-ca': {
    knownFor:
      'Los Angeles is a world-class auction market — Hollywood memorabilia, fine art, Mid-Century Modern furniture, and entertainment-industry estates appear at LA auction houses alongside major international auction house satellite sales.',
    tip:
      'Preview events at LA auction houses are essential — descriptions don\'t capture condition on vintage furniture and art. Online bidding platforms for LA auctions are highly competitive; set a ceiling and stick to it.',
  },
  'new-york-ny': {
    knownFor:
      'New York City is the epicenter of the US auction world — Sotheby\'s, Christie\'s, and hundreds of regional auction houses handle everything from fine art and jewelry to mid-century design and rare books every week.',
    tip:
      'For regional NYC estate auctions, Brooklyn and Queens houses offer better value than Manhattan boutiques. Register online in advance — New York auction registration requirements vary significantly by house.',
  },
  'houston-tx': {
    knownFor:
      'Houston auctions reflect the city\'s oil-industry wealth and global connections — River Oaks estate auctions feature fine art, antiques, and collections from decades of international travel and executive-level acquisitions.',
    tip:
      'Houston estate auctions are most active in spring and fall. Oil-industry estate lots often contain international antiques and rare pieces — research provenance carefully before bidding.',
  },
  'seattle-wa': {
    knownFor:
      'Seattle auctions capture the Pacific Northwest\'s eclectic character — estate auctions in Bellevue and Capitol Hill produce Pacific Rim antiques, mid-century modern furniture, and unique technology-era collectibles from Boeing and early tech families.',
    tip:
      'Seattle auction houses are increasingly offering hybrid live/online formats. Pacific Rim antiques (Japanese, Chinese, Korean) require authentication — research makers before bidding.',
  },
  'atlanta-ga': {
    knownFor:
      'Atlanta auctions serve one of the South\'s largest metropolitan markets — Buckhead estate auctions produce Southern antiques, fine art, and jewelry, while specialty auction houses handle real estate and commercial lots.',
    tip:
      'Buckhead and Sandy Springs estate auctions are the most active in the Atlanta metro. Fall (October–November) brings the most estate auction volume in the region.',
  },
  'minneapolis-mn': {
    knownFor:
      'Minneapolis auctions blend Scandinavian heritage with active Midwest collector culture — estate auctions in Edina and Wayzata produce quality furniture, Nordic decorative arts, and regional Minnesota artist works.',
    tip:
      'Spring auctions in Minneapolis are the most stocked — families clear estates after winter and before summer moves. Scandinavian decorative arts are a specialty of this market.',
  },
};

/**
 * Returns auction-specific About content (knownFor + tip) for a city page.
 * Falls back to a generic auction template for cities not in AUCTION_ABOUT.
 */
export function getAuctionMeta(
  slug: string,
  cityName: string,
  stateCode: string
): { knownFor: string; tip: string } {
  if (AUCTION_ABOUT[slug]) {
    return AUCTION_ABOUT[slug];
  }
  return {
    knownFor: `${cityName} auctions offer competitive bidding on estate lots, antiques, collectibles, furniture, and specialty items. Local auction houses run regular events throughout the year with online and in-person bidding options.`,
    tip: `Register for bidder access before auction day — most ${cityName} auction houses require advance registration. Attend preview events to inspect lots in person before placing bids.`,
  };
}

/**
 * Returns FAQ items for an auctions city page.
 */
export function getAuctionFaqs(cityName: string, stateCode: string): FaqItem[] {
  return [
    {
      question: `How do I bid at an auction in ${cityName}, ${stateCode}?`,
      answer: `To bid at auctions in ${cityName}, you typically need to register in advance with a valid ID and, for higher-value auctions, a credit card for deposit. Once registered, you receive a bidder number. Bidding starts at an opening price and rises in increments until only one bidder remains. Many ${cityName} auction houses now offer online absentee bidding so you can participate remotely.`,
    },
    {
      question: `What types of auctions are held in ${cityName}?`,
      answer: `${cityName} hosts a variety of auction formats including estate auctions (selling the complete contents of a home), art and antique auctions, vehicle auctions, real estate auctions, and specialty collector auctions. Estate auctions are the most common and are usually held on weekends. Online auction platforms have expanded access to many ${cityName} area auction events.`,
    },
    {
      question: `Are there buyer's premiums at auctions in ${cityName}?`,
      answer: `Yes — most auction houses in ${cityName} charge a buyer's premium, typically 10–25% of the hammer price, added to your winning bid. Always factor the buyer's premium into your maximum bid calculation. The premium percentage is always disclosed in the auction terms before you register.`,
    },
    {
      question: `How do I find upcoming auctions in ${cityName}, ${stateCode}?`,
      answer: `FindA.Sale lists upcoming auctions in ${cityName} as soon as they're posted. Check this page regularly or browse the map view to find auctions near you. Many auctioneers also post preview schedules — attending a preview before auction day lets you inspect lots and set informed maximum bids.`,
    },
    {
      question: `Can I sell items at an auction in ${cityName}?`,
      answer: `Yes — most ${cityName} auction houses accept consignments from individuals and estates. Contact the auction house directly to discuss consignment terms, minimum lot values, and commission rates. Estate auction companies can also come to your home to evaluate and catalog items for a dedicated estate auction.`,
    },
    {
      question: `What should I know before attending my first auction in ${cityName}?`,
      answer: `Before your first ${cityName} auction: register for a bidder number, attend the preview to inspect lots, research estimated values for items you want, set a maximum bid per item and don't exceed it, factor in the buyer's premium when calculating your limit, and bring cash or a card for payment. Popular items move fast — don't hesitate if something you want comes up.`,
    },
    {
      question: `Are ${cityName} auctions open to the public?`,
      answer: `Most estate and general auctions in ${cityName} are open to the public — no invitation or membership required. Registration (free) is typically all that's needed to bid. Some specialty auctions (art, jewelry) may require proof of financial qualification to participate. Check individual auction listings for specific requirements.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Flea-market-specific About content
// ---------------------------------------------------------------------------

const FLEA_MARKET_ABOUT: Record<string, { knownFor: string; tip: string }> = {
  'grand-rapids-mi': {
    knownFor:
      'Grand Rapids flea markets draw vendors from across West Michigan — expect vintage furniture, vinyl records, handmade crafts, farm surplus, and antique glassware alongside everyday household goods and local food vendors.',
    tip:
      'The early bird hours at Grand Rapids area flea markets (first hour before posted open) often offer the best vendor selection. Bring cash — many small vendors don\'t accept cards.',
  },
  'denver-co': {
    knownFor:
      'Denver flea markets blend Colorado\'s outdoor culture with eclectic urban creativity — vintage clothing, artisan goods, camping gear, vinyl records, and handcrafted jewelry are staples at weekend markets across the metro.',
    tip:
      'Arrive before 9 AM at popular Denver flea markets for the best selection. The summer months bring the most vendors and the widest variety — spring markets can be cold but are less crowded.',
  },
  'chicago-il': {
    knownFor:
      'Chicago flea markets are a weekend institution — from the famous Randolph Street Market to neighborhood rummage sales, the city\'s market scene spans vintage fashion, art, antiques, vinyl, and unique handcrafted goods.',
    tip:
      'Chicago\'s most popular flea markets fill up early — arrive at opening time for the best vendor selection. Indoor winter markets (November–March) keep the scene active year-round.',
  },
  'phoenix-az': {
    knownFor:
      'Phoenix flea markets run year-round thanks to the desert climate — Southwestern crafts, vintage turquoise jewelry, retro Americana, and outdoor goods are common finds at the metro\'s many weekend markets.',
    tip:
      'October through April is the best season for Phoenix flea markets — comfortable morning temperatures make browsing enjoyable. Summer heat drives most outdoor markets to very early morning hours only.',
  },
  'dallas-tx': {
    knownFor:
      'Dallas flea markets are diverse and well-attended — from the sprawling Canton First Monday Trade Days to neighborhood weekend markets, the Dallas area offers one of the largest flea market ecosystems in Texas.',
    tip:
      'Canton First Monday Trade Days (held the weekend before the first Monday of each month) is one of the largest flea markets in the US and worth the drive from Dallas. Local Dallas weekend markets are most active March–May.',
  },
  'los-angeles-ca': {
    knownFor:
      'Los Angeles flea markets are world-famous — the Rose Bowl Flea Market, Melrose Trading Post, and Fairfax High Flea Market attract vintage clothing enthusiasts, prop stylists, and collectors from around the globe.',
    tip:
      'The Rose Bowl Flea Market (second Sunday of each month) is LA\'s most iconic flea market event. Arrive at early-bird opening (7 AM) for the best selection before crowds arrive.',
  },
  'new-york-ny': {
    knownFor:
      'New York City flea markets are legendary for eclectic finds — Brooklyn Flea, Hell\'s Kitchen Flea Market, and seasonal markets across the boroughs produce vintage fashion, art, antiques, vinyl, and artisan food in a uniquely NYC atmosphere.',
    tip:
      'Brooklyn Flea is the most well-known NYC market — arrive early on Saturday or Sunday for the best vendor selection. Bring cash; smaller vendors often don\'t accept cards and ATMs have lines.',
  },
  'houston-tx': {
    knownFor:
      'Houston flea markets reflect the city\'s diverse cultural character — from the sprawling Sunny Flea Market to weekend neighborhood markets, buyers find Latin American crafts, vintage Americana, antiques, and food alongside everyday goods.',
    tip:
      'Sunny Flea Market is one of Houston\'s largest and most eclectic — open weekends year-round. The weather is comfortable October through April; summer morning sessions start as early as 6 AM to beat the heat.',
  },
  'seattle-wa': {
    knownFor:
      'Seattle flea markets capture the city\'s creative, independent spirit — vintage clothing, Pacific Northwest art, vinyl records, handcrafted goods, and Asian antiques are regular finds at weekend markets across the metro.',
    tip:
      'Seattle flea markets are most active May through September. Many Seattle vendors specialize in Pacific Northwest and Japanese vintage goods — arrive early for the best selection in those categories.',
  },
  'atlanta-ga': {
    knownFor:
      'Atlanta flea markets serve a large and diverse metro — the Scott Antique Markets (monthly) and neighborhood weekend markets offer Southern antiques, vintage clothing, crafts, and collectibles from the region\'s rich cultural history.',
    tip:
      'Scott Antique Markets (held monthly at the Atlanta Expo Centers) is one of the largest antique and flea markets in the Southeast. Shop both buildings — the two venues have different vendor mixes.',
  },
  'minneapolis-mn': {
    knownFor:
      'Minneapolis flea markets are a warm-weather highlight — Minnehaha, Powderhorn, and suburban market events produce vintage furniture, Scandinavian household goods, vinyl records, and handcrafted items from local artists and vendors.',
    tip:
      'Minneapolis flea market season runs May through September. Arrive at opening time for vintage furniture and vinyl — those categories move fastest at metro-area markets.',
  },
};

/**
 * Returns flea-market-specific About content (knownFor + tip) for a city page.
 * Falls back to a generic flea-market template for cities not in FLEA_MARKET_ABOUT.
 */
export function getFleaMarketMeta(
  slug: string,
  cityName: string,
  stateCode: string
): { knownFor: string; tip: string } {
  if (FLEA_MARKET_ABOUT[slug]) {
    return FLEA_MARKET_ABOUT[slug];
  }
  return {
    knownFor: `${cityName} flea markets bring together local vendors selling vintage goods, antiques, handmade crafts, collectibles, and everyday household items. Weekend markets draw buyers and sellers from across the metro area.`,
    tip: `Bring cash to ${cityName} flea markets — many vendors don't accept cards. Arrive early for the best vendor selection; popular items go quickly in the first hour of market hours.`,
  };
}

/**
 * Returns FAQ items for a flea markets city page.
 */
export function getFleaMarketFaqs(cityName: string, stateCode: string): FaqItem[] {
  return [
    {
      question: `Are there flea markets in ${cityName}, ${stateCode}?`,
      answer: `Yes — ${cityName} has an active flea market scene with weekend markets, monthly events, and seasonal outdoor markets operating throughout the area. FindA.Sale lists flea markets in ${cityName} as they're posted so you can find the ones happening near you this weekend.`,
    },
    {
      question: `What can I find at flea markets in ${cityName}?`,
      answer: `${cityName} flea markets typically offer vintage clothing, antiques, furniture, vinyl records, handmade crafts, collectibles, artwork, jewelry, tools, books, and local food vendors. Every market has a different mix — checking the listing photos before you go is the best way to know what to expect.`,
    },
    {
      question: `What time do flea markets open in ${cityName}, ${stateCode}?`,
      answer: `Most flea markets in ${cityName} open between 7–9 AM on weekends and run until early afternoon. Some markets offer early-bird access for a small fee — this gives you first pick before the general public arrives. Check individual market listings for specific hours.`,
    },
    {
      question: `Can I sell at a flea market in ${cityName}?`,
      answer: `Yes — most flea markets in ${cityName} rent vendor spaces by the day or season. Contact the market organizer directly to ask about booth fees, size options, and availability. Vendor spaces at popular ${cityName} markets book quickly for peak season, so reach out early.`,
    },
    {
      question: `Are flea markets in ${cityName} cash only?`,
      answer: `Many individual vendors at ${cityName} flea markets prefer cash, though larger markets often have ATMs on site and some vendors accept cards or mobile payments. Bringing cash gives you the most flexibility and can help with price negotiation.`,
    },
    {
      question: `How do I find flea markets near me in ${cityName}?`,
      answer: `FindA.Sale lists flea markets in ${cityName} and nearby cities as they're posted. Check this page on Thursday or Friday for the most complete weekend listing. You can also use the map view to find flea markets within a specific distance from your location.`,
    },
    {
      question: `What's the difference between a flea market and an estate sale?`,
      answer: `Flea markets are recurring vendor markets where multiple sellers set up booths to sell goods — vendors rent their spaces and return week after week. Estate sales are one-time events that liquidate the entire contents of a single home or estate over a weekend. Both offer great finds, but flea markets provide a more consistent, browsable shopping experience while estate sales are time-limited and location-specific.`,
    },
  ];
}
