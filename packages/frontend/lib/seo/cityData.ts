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
 *   getCityMeta()    — returns CityMeta for a slug, or a generated fallback
 *   getEstateSalesFaqs() — returns FAQ array for a city
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
