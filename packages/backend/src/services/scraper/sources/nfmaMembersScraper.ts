/**
 * NFMA (National Flea Market Association) member directory scraper
 * Source: https://www.fleamarkets.org/nfma-member-markets
 *
 * Method: Playwright headless (Wix JS-rendered page)
 * Run mode: national-once (full member list, metro param unused)
 * Category: FLEA_MARKET
 * Scale: ~50–200 named flea market venues (NFMA curated subset)
 *
 * ToS / robots.txt: Open. No anti-scraping language. /nfma-member-markets not disallowed.
 * Confirmed 2026-06-12: Playwright + domcontentloaded returns 580k HTML with content.
 *
 * Parsing strategy (multi-tier — Wix class names are hashed and change; text patterns are stable):
 *   Tier 1: evaluateOnPage — extract all <p> tags from [data-testid="richTextElement"] containers
 *   Tier 2: evaluateOnPage — extract all <p> tags with 2–12 words (likely name/address lines)
 *   Tier 3: fetchPageHTML + regex over raw HTML looking for repeating text blocks
 *
 * Member record shape (inferred from NFMA member directory layout):
 *   - Venue name (line 1 of each card)
 *   - City, State (line 2 or address block)
 *   - Website URL (optional)
 *
 * GitHub Actions workflow: .github/workflows/scrape-nfma-members.yml
 * Schedule: monthly (member list changes slowly)
 *
 * ADR-073: Directory Scraper — Phase 2 (Playwright unparked 2026-06-12)
 */

import { evaluateOnPage } from '../utils/playwrightBrowser';
import { getOrCreateScrapedOrganizer } from '../index';

const SOURCE_URL = 'https://www.fleamarkets.org/nfma-member-markets';
const SOURCE_ID = 'NFMAMembers';

/** Valid 2-letter US state codes for address parsing */
const US_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]);

const US_STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};

interface MemberRecord {
  name: string;
  city: string;
  state: string;
  website?: string;
}

/** Parse a "City, ST" or "City, State" address string into { city, state }. Returns null if unrecognised. */
function parseCityState(line: string): { city: string; state: string } | null {
  const trimmed = line.trim();

  // Pattern: "City, ST" or "City, State Name"
  const match = trimmed.match(/^([^,]+),\s*([A-Za-z .]+)$/);
  if (!match) return null;

  const cityRaw = match[1].trim();
  const stateRaw = match[2].trim();

  // Try 2-letter code first
  const upper = stateRaw.toUpperCase();
  if (US_STATE_CODES.has(upper)) return { city: cityRaw, state: upper };

  // Try full state name
  const code = US_STATE_NAMES[stateRaw.toLowerCase()];
  if (code) return { city: cityRaw, state: code };

  return null;
}

/** URL pattern for member website detection */
const URL_RE = /^https?:\/\//i;

/**
 * Extract member records from the browser-rendered DOM.
 * Called via evaluateOnPage — runs in browser context.
 * Returns raw arrays of text lines grouped by likely card boundary.
 */
function extractInBrowser(): {
  richTextLines: string[];
  allPLines: string[];
} {
  // This function is serialised and executed inside Playwright's browser context.
  // No Node.js APIs available — browser DOM only.

  const richTextLines: string[] = [];
  const allPLines: string[] = [];

  // Tier 1: richText containers (Wix standard layout for text blocks)
  document.querySelectorAll(
    "[data-testid=\'richTextElement\'] p, [class*=\'richText\'] p, [class*=\'RichText\'] p"
  ).forEach((el) => {
    const t = (el as HTMLElement).innerText?.trim() ?? "";
    if (t.length > 1 && t.length < 300) richTextLines.push(t);
  });

  // Tier 2: all <p> elements with 1–12 words (names and addresses)
  document.querySelectorAll("p").forEach((el) => {
    const t = (el as HTMLElement).innerText?.trim() ?? "";
    const words = t.split(/\s+/).filter((w) => w.length > 0);
    if (words.length >= 1 && words.length <= 15 && t.length < 200) {
      allPLines.push(t);
    }
  });

  return { richTextLines, allPLines };
}

/**
 * Cluster consecutive text lines into member records.
 *
 * Heuristic: a member card typically consists of:
 *   Line 1: venue name (proper nouns, > 3 chars)
 *   Line 2: city, state OR address line
 *   Line 3 (optional): website URL
 *
 * We look for groups where at least one line parses as a city/state.
 */
function clusterIntoRecords(lines: string[]): MemberRecord[] {
  const records: MemberRecord[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip very short or clearly non-content lines
    if (line.length < 3 || /^(Current NFMA Members|Members|Directory|Home|About|Contact)$/i.test(line)) {
      i++;
      continue;
    }

    // Check if next line(s) form a city/state pair
    let cityState: { city: string; state: string } | null = null;
    let nameCandidate = line;
    let website: string | undefined;
    let consumed = 1;

    // Look ahead up to 3 lines for a city/state match
    for (let j = 1; j <= 3 && i + j < lines.length; j++) {
      const next = lines[i + j].trim();
      if (!next) continue;

      if (URL_RE.test(next)) {
        website = next;
        consumed = Math.max(consumed, j + 1);
        continue;
      }

      const parsed = parseCityState(next);
      if (parsed) {
        cityState = parsed;
        consumed = Math.max(consumed, j + 1);
        break;
      }
    }

    if (cityState) {
      // Also scan forward for a website if not yet found
      if (!website) {
        for (let j = 1; j <= 3 && i + j < lines.length; j++) {
          const next = lines[i + j].trim();
          if (URL_RE.test(next)) {
            website = next;
            break;
          }
        }
      }

      const dedup = nameCandidate.toLowerCase().replace(/\s+/g, '-');
      if (!seen.has(dedup)) {
        seen.add(dedup);
        records.push({
          name: nameCandidate,
          city: cityState.city,
          state: cityState.state,
          website,
        });
      }
    }

    i += consumed;
  }

  return records;
}

/**
 * NFMA member directory scraper — Phase 2 (Playwright).
 *
 * Fetches https://www.fleamarkets.org/nfma-member-markets via headless Chromium,
 * extracts text lines from Wix-rendered DOM, clusters into member records,
 * and upserts each as a FLEA_MARKET organizer.
 *
 * MUST throw if zero records are upserted (page structure may have changed).
 */
export async function runNFMAMembersScraper(): Promise<void> {
  console.log(`[NFMAMembers] Starting NFMA member directory scraper`);
  console.log(`[NFMAMembers] Source: ${SOURCE_URL}`);

  // Fetch rendered DOM via Playwright
  const { richTextLines, allPLines } = await evaluateOnPage(
    SOURCE_URL,
    extractInBrowser as () => { richTextLines: string[]; allPLines: string[] },
    { waitForNetworkIdle: false, timeout: 45000 }
  );

  console.log(`[NFMAMembers] Extracted ${richTextLines.length} richText lines, ${allPLines.length} <p> lines`);

  // Prefer richText lines (more structured); fall back to all <p> lines
  const sourceLines = richTextLines.length >= 10 ? richTextLines : allPLines;
  console.log(`[NFMAMembers] Using ${sourceLines === richTextLines ? "richText" : "p-tag"} lines (${sourceLines.length} total)`);

  if (sourceLines.length > 0) {
    console.log(`[NFMAMembers] First 10 lines sample:`, sourceLines.slice(0, 10));
  }

  const records = clusterIntoRecords(sourceLines);
  console.log(`[NFMAMembers] Clustered into ${records.length} candidate member records`);

  if (records.length === 0) {
    // Log raw content to help diagnose DOM structure changes
    console.warn(`[NFMAMembers] Zero records parsed. richTextLines[:20]:`, richTextLines.slice(0, 20));
    console.warn(`[NFMAMembers] allPLines[:20]:`, allPLines.slice(0, 20));
    throw new Error(
      `[NFMAMembers] Zero member records found at ${SOURCE_URL}. ` +
      `richText=${richTextLines.length} lines, allP=${allPLines.length} lines. ` +
      `Wix DOM structure may have changed — inspect page and update selectors.`
    );
  }

  let upserted = 0;
  let skipped = 0;

  for (const rec of records) {
    try {
      const orgId = await getOrCreateScrapedOrganizer(
        rec.name,
        SOURCE_ID,
        rec.city,
        rec.state,
        undefined,      // esnOrgId
        undefined,      // googlePlaceId
        undefined,      // foursquareVenueId
        undefined,      // hereBusinessId
        'FLEA_MARKET',  // businessCategory
        undefined,      // contactEmail
        undefined,      // phone
        rec.website,    // website
        undefined,      // lat
        undefined,      // lng
        false,          // isStateLicensed
        undefined,      // licenseState
        undefined,      // licenseNumber
        SOURCE_ID       // sourceLabel
      );

      if (orgId) {
        upserted++;
        console.log(`[NFMAMembers] Upserted: "${rec.name}" (${rec.city}, ${rec.state})`);
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`[NFMAMembers] Upsert error for "${rec.name}":`, err);
      skipped++;
    }
  }

  console.log(
    `[NFMAMembers] Complete — ${records.length} records found, ` +
    `${upserted} upserted, ${skipped} skipped/rejected`
  );

  if (upserted === 0) {
    throw new Error(
      `[NFMAMembers] Zero records upserted (${records.length} parsed, ${skipped} skipped). ` +
      `Check businessCategory filter or DOM extraction. First record: ${JSON.stringify(records[0])}`
    );
  }
}
