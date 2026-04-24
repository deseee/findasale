/**
 * seedWikidata.ts — Bulk Encyclopedia seeding from Wikidata + Wikipedia
 *
 * Fetches collectible/antique brand data from Wikidata SPARQL endpoint and enriches
 * with Wikipedia summaries. Creates EncyclopediaEntry stubs with PriceBenchmark fallbacks.
 *
 * Idempotent: skips slugs that already exist.
 * Rate-limited: 300ms between Wikipedia calls.
 */

import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────

interface WikidataResult {
  item: { value: string }; // "http://www.wikidata.org/entity/Q1234"
  itemLabel: { value: string }; // "Pyrex"
  itemDescription: { value: string }; // "Brand of glassware"
}

interface WikipediaPage {
  extract?: string;
  title?: string;
  description?: string;
}

interface WikidataEntryData {
  title: string;
  description: string;
  category: string;
  tags: string[];
  priceLow: number; // in cents
  priceHigh: number; // in cents
}

// ─────────────────────────────────────────────────────────────────────────
// CATEGORY MAPPING
// ─────────────────────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  tableware: 'Kitchenware & Cookware',
  dinnerware: 'Kitchenware & Cookware',
  glassware: 'Kitchenware & Cookware',
  pottery: 'Kitchenware & Cookware',
  ceramic: 'Kitchenware & Cookware',
  furniture: 'Furniture & Home',
  toy: 'Toys & Collectibles',
  collectible: 'Toys & Collectibles',
  tool: 'Tools & Hardware',
  sewing: 'Textiles & Sewing',
  train: 'Toys & Collectibles',
  jewelry: 'Jewelry & Accessories',
};

const DEFAULT_CATEGORY = 'Antiques & Collectibles';

// ─────────────────────────────────────────────────────────────────────────
// PRICE RANGES (in cents, category-based fallback)
// ─────────────────────────────────────────────────────────────────────────

const CATEGORY_PRICE_DEFAULTS: Record<string, { low: number; high: number }> = {
  'Kitchenware & Cookware': { low: 1000, high: 15000 }, // $10–$150
  'Furniture & Home': { low: 5000, high: 100000 }, // $50–$1000
  'Toys & Collectibles': { low: 500, high: 50000 }, // $5–$500
  'Tools & Hardware': { low: 1000, high: 30000 }, // $10–$300
  'Jewelry & Accessories': { low: 1000, high: 100000 }, // $10–$1000
  'Textiles & Sewing': { low: 500, high: 20000 }, // $5–$200
  'Antiques & Collectibles': { low: 1000, high: 50000 }, // $10–$500
};

// ─────────────────────────────────────────────────────────────────────────
// HARDCODED FALLBACK BRANDS (if Wikidata is slow)
// ─────────────────────────────────────────────────────────────────────────

const FALLBACK_BRANDS = [
  // Tableware & Dinnerware
  { title: 'Pyrex', tags: ['tableware', 'glassware', 'vintage'], categoryKey: 'tableware' },
  { title: 'Fire-King', tags: ['dinnerware', 'glassware', 'vintage'], categoryKey: 'tableware' },
  { title: 'Fiestaware', tags: ['dinnerware', 'pottery', 'vintage'], categoryKey: 'dinnerware' },
  { title: 'Corelle', tags: ['dinnerware', 'tableware'], categoryKey: 'dinnerware' },
  { title: 'Noritake', tags: ['dinnerware', 'tableware', 'japanese'], categoryKey: 'dinnerware' },
  { title: 'Lenox', tags: ['dinnerware', 'fine china'], categoryKey: 'dinnerware' },
  { title: 'Wedgwood', tags: ['pottery', 'dinnerware', 'british'], categoryKey: 'pottery' },
  { title: 'Royal Doulton', tags: ['pottery', 'figurines', 'british'], categoryKey: 'pottery' },

  // Glassware
  { title: 'Depression Glass', tags: ['glassware', 'depression era'], categoryKey: 'glassware' },
  { title: 'Carnival Glass', tags: ['glassware', 'iridescent'], categoryKey: 'glassware' },
  { title: 'Heisey Glass', tags: ['glassware', 'collectible'], categoryKey: 'glassware' },
  { title: 'Fenton Glass', tags: ['glassware', 'collectible'], categoryKey: 'glassware' },
  { title: 'Blenko Glass', tags: ['glassware', 'handblown'], categoryKey: 'glassware' },

  // Furniture
  { title: 'Lane Furniture', tags: ['furniture', 'cedar chests'], categoryKey: 'furniture' },
  { title: 'Broyhill', tags: ['furniture', 'mcm'], categoryKey: 'furniture' },
  { title: 'Ethan Allen', tags: ['furniture', 'american'], categoryKey: 'furniture' },
  { title: 'Heywood-Wakefield', tags: ['furniture', 'mcm'], categoryKey: 'furniture' },
  { title: 'Herman Miller', tags: ['furniture', 'mcm', 'designer'], categoryKey: 'furniture' },
  { title: 'Eames', tags: ['furniture', 'mcm', 'iconic'], categoryKey: 'furniture' },

  // Pottery
  { title: 'McCoy Pottery', tags: ['pottery', 'american'], categoryKey: 'pottery' },
  { title: 'Hull Pottery', tags: ['pottery', 'american'], categoryKey: 'pottery' },
  { title: 'Roseville Pottery', tags: ['pottery', 'american'], categoryKey: 'pottery' },
  { title: 'Red Wing Pottery', tags: ['pottery', 'american'], categoryKey: 'pottery' },
  { title: 'Stangl Pottery', tags: ['pottery', 'american'], categoryKey: 'pottery' },
  { title: 'Weller Pottery', tags: ['pottery', 'american'], categoryKey: 'pottery' },

  // Toys
  { title: 'Tonka', tags: ['toy', 'trucks'], categoryKey: 'toy' },
  { title: 'Matchbox', tags: ['toy', 'cars'], categoryKey: 'toy' },
  { title: 'Hot Wheels', tags: ['toy', 'cars'], categoryKey: 'toy' },
  { title: 'Fisher-Price', tags: ['toy', 'educational'], categoryKey: 'toy' },
  { title: 'Ideal Toy', tags: ['toy', 'vintage'], categoryKey: 'toy' },
  { title: 'Marx Toys', tags: ['toy', 'vintage'], categoryKey: 'toy' },

  // Tools
  { title: 'Stanley Tools', tags: ['tool', 'hardware'], categoryKey: 'tool' },
  { title: 'Snap-on', tags: ['tool', 'professional'], categoryKey: 'tool' },
  { title: 'Craftsman', tags: ['tool', 'hardware'], categoryKey: 'tool' },
  { title: 'Millers Falls', tags: ['tool', 'vintage'], categoryKey: 'tool' },
  { title: 'Disston', tags: ['tool', 'saw'], categoryKey: 'tool' },

  // Collectibles
  { title: 'Hummel', tags: ['figurine', 'collectible'], categoryKey: 'collectible' },
  { title: 'Lladró', tags: ['figurine', 'spanish'], categoryKey: 'collectible' },
  { title: 'Royal Copenhagen', tags: ['pottery', 'danish'], categoryKey: 'pottery' },
  { title: 'Bing Grondahl', tags: ['pottery', 'danish'], categoryKey: 'pottery' },

  // Sewing
  { title: 'Singer', tags: ['sewing machine', 'vintage'], categoryKey: 'sewing' },

  // Trains
  { title: 'Lionel Train', tags: ['train', 'collectible'], categoryKey: 'train' },
  { title: 'American Flyer', tags: ['train', 'collectible'], categoryKey: 'train' },
  { title: 'Marx Train Set', tags: ['train', 'vintage'], categoryKey: 'train' },

  // Specialty Glass
  { title: 'American Fostoria', tags: ['glassware', 'american'], categoryKey: 'glassware' },
  { title: 'Anchor Hocking', tags: ['glassware', 'american'], categoryKey: 'glassware' },
  { title: 'Indiana Glass', tags: ['glassware', 'american'], categoryKey: 'glassware' },
  { title: 'Libbey Glass', tags: ['glassware', 'american'], categoryKey: 'glassware' },
  { title: 'Cambridge Glass', tags: ['glassware', 'american'], categoryKey: 'glassware' },
  { title: 'Imperial Glass', tags: ['glassware', 'american'], categoryKey: 'glassware' },
  { title: 'Tiffin Glass', tags: ['glassware', 'american'], categoryKey: 'glassware' },

  // Jewelry & Accessories
  { title: 'Bakelite Jewelry', tags: ['jewelry', 'bakelite'], categoryKey: 'jewelry' },
  { title: 'Celluloid', tags: ['jewelry', 'vintage'], categoryKey: 'jewelry' },
  { title: 'Lucite', tags: ['jewelry', 'mid-century'], categoryKey: 'jewelry' },
  { title: 'Catalin', tags: ['jewelry', 'vintage'], categoryKey: 'jewelry' },

  // Furniture Styles
  { title: 'Stickley Furniture', tags: ['furniture', 'mission oak'], categoryKey: 'furniture' },
  { title: 'Hoosier Cabinet', tags: ['furniture', 'kitchen'], categoryKey: 'furniture' },
];

// ─────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Convert title to URL-friendly slug.
 * lowercase, remove punctuation, replace spaces with hyphens.
 */
function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // remove non-alphanumeric except space and hyphen
    .replace(/\s+/g, '-') // collapse spaces to single hyphen
    .replace(/-+/g, '-') // collapse hyphens
    .trim();
}

/**
 * Map Wikidata category keyword to FindA.Sale category.
 * Fallback to DEFAULT_CATEGORY if no match.
 */
function categorizeByKeyword(title: string, description?: string): string {
  const text = `${title} ${description || ''}`.toLowerCase();

  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (text.includes(key)) {
      return value;
    }
  }

  return DEFAULT_CATEGORY;
}

/**
 * Get price range defaults for a category.
 */
function getPriceRange(
  category: string
): { low: number; high: number } {
  return CATEGORY_PRICE_DEFAULTS[category] || CATEGORY_PRICE_DEFAULTS[DEFAULT_CATEGORY];
}

/**
 * Sleep for N milliseconds (for rate limiting).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch Wikipedia summary for a title.
 * Returns { extract: "..." } or null if not found.
 */
async function fetchWikipediaSummary(
  title: string
): Promise<WikipediaPage | null> {
  try {
    const encoded = encodeURIComponent(title);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FindASale/1.0 (https://finda.sale; contact@finda.sale) Node.js',
      },
    });

    if (!response.ok) {
      console.log(`[Wikipedia] ${title}: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as WikipediaPage;
    return data;
  } catch (error) {
    console.error(`[Wikipedia] Error fetching ${title}:`, error);
    return null;
  }
}

/**
 * Run a Wikidata SPARQL query and return results.
 */
async function runWikidataQuery(
  sparql: string
): Promise<WikidataResult[]> {
  try {
    const url = new URL('https://query.wikidata.org/sparql');
    url.searchParams.set('query', sparql);
    url.searchParams.set('format', 'json');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'FindASale/1.0 (https://finda.sale; contact@finda.sale) Node.js',
      },
    });

    if (!response.ok) {
      console.error(`[Wikidata] Query failed: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as { results: { bindings: WikidataResult[] } };
    return data.results?.bindings || [];
  } catch (error) {
    console.error('[Wikidata] Error running query:', error);
    return [];
  }
}

/**
 * Transform Wikidata result + Wikipedia enrichment into EncyclopediaEntry data.
 */
function transformResult(
  title: string,
  description: string,
  wikipediaData: WikipediaPage | null
): WikidataEntryData {
  const category = categorizeByKeyword(title, description);
  const priceRange = getPriceRange(category);

  // Build content: Wikipedia extract if available, fallback to Wikidata description
  let content = '';
  if (wikipediaData?.extract && wikipediaData.extract.length > 80) {
    content = `## Overview\n\n${wikipediaData.extract}`;
  } else {
    content = `## Overview\n\n${description || 'Brand or collectible item.'}`;
  }

  return {
    title,
    description,
    category,
    tags: [category.toLowerCase().replace(/\s+/g, '-')],
    priceLow: priceRange.low,
    priceHigh: priceRange.high,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN SEED FUNCTION
// ─────────────────────────────────────────────────────────────────────────

async function seedWikidata() {
  try {
    // Find system admin user
    const adminUser = await prisma.user.findFirst({
      where: { roles: { has: 'ADMIN' } },
      select: { id: true },
    });

    const SYSTEM_USER_ID = adminUser?.id;
    if (!SYSTEM_USER_ID) {
      throw new Error('No admin user found. Run main seed first: npm run seed');
    }

    console.log(`\n📚 Wikidata → Encyclopedia Bulk Seed`);
    console.log(`System user ID: ${SYSTEM_USER_ID}\n`);

    // Set to hold all entries we'll create
    const allEntries: Array<{ title: string; data: WikidataEntryData }> = [];

    // ──────────────────────────────────────────────────────────────────────
    // ATTEMPT WIKIDATA QUERIES (non-fatal if they fail)
    // ──────────────────────────────────────────────────────────────────────

    console.log('Querying Wikidata SPARQL endpoint...');

    // Query 1: Tableware & Dinnerware brands (US origin)
    const query1 = `
      SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
        ?item wdt:P31/wdt:P279* wd:Q729.
        ?item wdt:P495 wd:Q30.
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        FILTER(LANG(?itemLabel) = "en")
      }
      LIMIT 100
    `;

    // Query 2: American businesses in furniture, glass, ceramic
    const query2 = `
      SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
        ?item wdt:P31 wd:Q4830453.
        { ?item wdt:P452 wd:Q14745 } UNION { ?item wdt:P452 wd:Q11642 } UNION { ?item wdt:P452 wd:Q45621 }
        ?item wdt:P17 wd:Q30.
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        FILTER(LANG(?itemLabel) = "en")
      }
      LIMIT 100
    `;

    // Query 3: Toy brands
    const query3 = `
      SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
        ?item wdt:P31 wd:Q4830453.
        ?item wdt:P452 wd:Q1164857.
        ?item wdt:P17 wd:Q30.
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        FILTER(LANG(?itemLabel) = "en")
      }
      LIMIT 100
    `;

    let results1: WikidataResult[] = [];
    let results2: WikidataResult[] = [];
    let results3: WikidataResult[] = [];

    try {
      console.log('  Query 1: Tableware & Dinnerware (US)');
      results1 = await runWikidataQuery(query1);
      console.log(`    → ${results1.length} results`);
    } catch (e) {
      console.warn('  Query 1 timed out or failed, continuing...');
    }

    try {
      console.log('  Query 2: Furniture, Glass, Ceramic (US)');
      results2 = await runWikidataQuery(query2);
      console.log(`    → ${results2.length} results`);
    } catch (e) {
      console.warn('  Query 2 timed out or failed, continuing...');
    }

    try {
      console.log('  Query 3: Toy Brands (US)');
      results3 = await runWikidataQuery(query3);
      console.log(`    → ${results3.length} results`);
    } catch (e) {
      console.warn('  Query 3 timed out or failed, continuing...');
    }

    // Combine all Wikidata results (dedup by title)
    const wikidataByTitle = new Map<string, WikidataResult>();

    for (const result of [...results1, ...results2, ...results3]) {
      const title = result.itemLabel?.value || '';
      if (title && !wikidataByTitle.has(title)) {
        wikidataByTitle.set(title, result);
      }
    }

    console.log(
      `\n✓ Collected ${wikidataByTitle.size} unique Wikidata entries\n`
    );

    // ──────────────────────────────────────────────────────────────────────
    // ENRICH WITH WIKIPEDIA + BUILD ENTRY LIST
    // ──────────────────────────────────────────────────────────────────────

    console.log('Enriching with Wikipedia summaries...');
    let wikipediaFetched = 0;
    let wikipediaSkipped = 0;

    for (const [title, result] of wikidataByTitle) {
      const description = result.itemDescription?.value || '';

      // Fetch Wikipedia (rate-limited)
      await sleep(300);
      const wikipediaData = await fetchWikipediaSummary(title);
      if (wikipediaData) {
        wikipediaFetched++;
      } else {
        wikipediaSkipped++;
      }

      const data = transformResult(title, description, wikipediaData);
      allEntries.push({ title, data });
    }

    console.log(
      `  ✓ Wikipedia: ${wikipediaFetched} fetched, ${wikipediaSkipped} not found\n`
    );

    // ──────────────────────────────────────────────────────────────────────
    // FALLBACK BRANDS (if Wikidata returned < 20 entries)
    // ──────────────────────────────────────────────────────────────────────

    if (allEntries.length < 20) {
      console.log(
        `⚠ Wikidata returned ${allEntries.length} entries (< 20). Adding fallback brands...\n`
      );

      for (const brand of FALLBACK_BRANDS) {
        if (!wikidataByTitle.has(brand.title)) {
          const category = CATEGORY_MAP[brand.categoryKey] || DEFAULT_CATEGORY;
          const priceRange = getPriceRange(category);

          allEntries.push({
            title: brand.title,
            data: {
              title: brand.title,
              description: `Collectible ${category.toLowerCase()} brand`,
              category,
              tags: brand.tags,
              priceLow: priceRange.low,
              priceHigh: priceRange.high,
            },
          });
        }
      }
    }

    console.log(`📊 Total entries to seed: ${allEntries.length}\n`);

    // ──────────────────────────────────────────────────────────────────────
    // INSERT INTO DATABASE
    // ──────────────────────────────────────────────────────────────────────

    console.log('Inserting into database...');

    // Run directly without transaction — Railway proxy latency causes P2028 timeout at 5s
    let entriesInserted = 0;
    let entriesSkipped = 0;
    let benchmarksInserted = 0;

    for (const { title, data } of allEntries) {
      const slug = toSlug(title);

      try {
        // Check if slug already exists
        const existing = await prisma.encyclopediaEntry.findUnique({
          where: { slug },
        });

        if (existing) {
          entriesSkipped++;
          continue;
        }

        // Create entry
        const entry = await prisma.encyclopediaEntry.create({
          data: {
            slug,
            title: data.title,
            subtitle: `Auto-generated from Wikidata`,
            content: `## Overview\n\n${data.description}`,
            category: data.category,
            tags: data.tags,
            status: 'AUTO_GENERATED',
            authorId: SYSTEM_USER_ID,
          },
        });

        entriesInserted++;

        // Create paired price benchmark
        await prisma.priceBenchmark.create({
          data: {
            entryId: entry.id,
            condition: 'USED',
            region: 'National',
            priceRangeLow: data.priceLow,
            priceRangeHigh: data.priceHigh,
            dataSource: 'haiku_inferred',
          },
        });

        benchmarksInserted++;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Unique constraint')
        ) {
          entriesSkipped++;
        } else {
          console.error(`  Error creating entry "${slug}":`, error);
        }
      }
    }

    console.log(`\n✅ Seed complete!`);
    console.log(
      `   Entries: inserted ${entriesInserted}, skipped ${entriesSkipped} (duplicates)`
    );
    console.log(`   Benchmarks: inserted ${benchmarksInserted}`);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────────────────

seedWikidata();
