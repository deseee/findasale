/**
 * NFMA (National Flea Market Association) member directory scraper
 * Source: https://www.fleamarkets.org/nfma-member-markets
 *
 * Method: Playwright headless (Wix JS-rendered, authenticated CMS XHR)
 * Run mode: national-once (full member list, metro param unused)
 * Category: FLEA_MARKET
 * Schedule: monthly (member list changes slowly)
 *
 * Wix loading behaviour confirmed 2026-06-12:
 *   - Static HTML / domcontentloaded: only nav items (11 p-tags). No member data.
 *   - Wix Data API direct call: 403 — requires session token from the browser.
 *   - networkidle: times out — Wix has perpetual background XHR.
 *
 *   Solution: navigate with domcontentloaded, then page.waitForFunction() until
 *   body text length grows beyond nav-only baseline (~500 chars), then dump ALL
 *   short text nodes from every element type (not just <p>).
 *
 * Parsing strategy:
 *   1. Wait for real content (body innerText > 1500 chars) with 30s timeout.
 *   2. Extract all leaf text nodes 2–20 words, deduplicated.
 *   3. Cluster consecutive lines into (name, city, state) records using parseCityState().
 *   4. Upsert each as FLEA_MARKET organizer.
 *
 * If zero records: log raw text sample and throw (never silently succeed with 0).
 */

import { chromium } from 'playwright';
import { createStealthContext } from '../utils/playwrightBrowser';
import { getOrCreateScrapedOrganizer } from '../index';

const SOURCE_URL = 'https://www.fleamarkets.org/nfma-member-markets';
const SOURCE_ID = 'NFMAMembers';

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

function parseCityState(line: string): { city: string; state: string } | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^([^,]+),\s*([A-Za-z .]+)$/);
  if (!match) return null;
  const cityRaw = match[1].trim();
  const stateRaw = match[2].trim();
  const upper = stateRaw.toUpperCase();
  if (US_STATE_CODES.has(upper)) return { city: cityRaw, state: upper };
  const code = US_STATE_NAMES[stateRaw.toLowerCase()];
  if (code) return { city: cityRaw, state: code };
  return null;
}

const URL_RE = /^https?:\/\//i;

const SKIP_LINES = new Set([
  'home', 'members', 'about us', 'contact', 'conference', 'leadership',
  'legislative', 'membership', 'scholarship', 'partners', 'more',
  'current nfma members', 'nfma logo gear', 'member market photos',
  'nfma privacy policy', 'flea market job board', 'become a partner',
  'nfma committees', 'travel & entertainment discounts',
]);

function clusterIntoRecords(lines: string[]): MemberRecord[] {
  const records: MemberRecord[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (
      line.length < 3 ||
      SKIP_LINES.has(line.toLowerCase()) ||
      /^[©\d]/.test(line) ||
      /copyright/i.test(line) ||
      /privacy policy/i.test(line)
    ) {
      i++;
      continue;
    }

    let cityState: { city: string; state: string } | null = null;
    let website: string | undefined;
    let consumed = 1;

    for (let j = 1; j <= 4 && i + j < lines.length; j++) {
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
      const dedup = line.toLowerCase().replace(/\s+/g, '-');
      if (!seen.has(dedup)) {
        seen.add(dedup);
        records.push({ name: line, city: cityState.city, state: cityState.state, website });
      }
    }

    i += consumed;
  }

  return records;
}

export async function runNFMAMembersScraper(): Promise<void> {
  console.log(`[NFMAMembers] Starting — ${SOURCE_URL}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  let allTextLines: string[] = [];
  let rawBodyText = '';

  try {
    const { context, page } = await createStealthContext(browser);

    page.setDefaultTimeout(45000);
    page.setDefaultNavigationTimeout(45000);

    console.log('[NFMAMembers] Navigating (domcontentloaded)...');
    await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Wait until the page body has real content beyond nav items.
    // Nav-only body text is ~500 chars. Member data should push it well past 1500.
    console.log('[NFMAMembers] Waiting for member content to load...');
    try {
      await page.waitForFunction(
        () => (document.body?.innerText?.length ?? 0) > 1500,
        { timeout: 30000 }
      );
      console.log('[NFMAMembers] Content loaded (body text > 1500 chars)');
    } catch {
      // waitForFunction timed out — content may still be only nav items.
      // Log what we have and attempt extraction anyway.
      const bodyLen = await page.evaluate(() => document.body?.innerText?.length ?? 0);
      console.warn(`[NFMAMembers] waitForFunction timed out. Body text length: ${bodyLen}. Attempting extraction anyway.`);
    }

    // Dump full body innerText for diagnostics
    rawBodyText = await page.evaluate(() => document.body?.innerText ?? '');
    console.log(`[NFMAMembers] Body innerText length: ${rawBodyText.length}`);
    console.log('[NFMAMembers] Body text sample (first 2000 chars):\n', rawBodyText.substring(0, 2000));

    // Extract all short leaf text nodes from every element type
    allTextLines = await page.evaluate(() => {
      const lines: string[] = [];
      const seen = new Set<string>();

      // Walk all elements and collect their direct text content
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node: Node | null;
      while ((node = walker.nextNode()) !== null) {
        const text = node.textContent?.trim() ?? '';
        const words = text.split(/\s+/).filter(w => w.length > 0);
        if (words.length >= 1 && words.length <= 20 && text.length >= 2 && text.length < 250) {
          if (!seen.has(text)) {
            seen.add(text);
            lines.push(text);
          }
        }
      }
      return lines;
    });

    await context.close();
  } finally {
    await browser.close();
  }

  console.log(`[NFMAMembers] Extracted ${allTextLines.length} text nodes`);
  console.log('[NFMAMembers] All text lines:', JSON.stringify(allTextLines, null, 2));

  if (rawBodyText.length < 600) {
    throw new Error(
      `[NFMAMembers] Page body text only ${rawBodyText.length} chars — content did not load. ` +
      `Check if page requires login or if Wix structure changed.`
    );
  }

  const records = clusterIntoRecords(allTextLines);
  console.log(`[NFMAMembers] Clustered ${records.length} member records`);

  if (records.length === 0) {
    // Log all lines to help diagnose structure
    console.error('[NFMAMembers] All extracted lines:\n', allTextLines.slice(0, 100).join('\n'));
    throw new Error(
      `[NFMAMembers] Zero records parsed from ${allTextLines.length} text nodes. ` +
      `Page loaded (${rawBodyText.length} chars) but city/state pattern not found. ` +
      `Check parseCityState against actual page content above.`
    );
  }

  let upserted = 0;
  let skipped = 0;

  for (const rec of records) {
    try {
      const orgId = await getOrCreateScrapedOrganizer(
        rec.name, SOURCE_ID, rec.city, rec.state,
        undefined, undefined, undefined, undefined,
        'FLEA_MARKET', undefined, undefined, rec.website,
        undefined, undefined, false, undefined, undefined, SOURCE_ID
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

  console.log(`[NFMAMembers] Done — ${records.length} parsed, ${upserted} upserted, ${skipped} skipped`);

  if (upserted === 0 && records.length > 0) {
    throw new Error(`[NFMAMembers] ${records.length} records parsed but zero upserted. Check getOrCreateScrapedOrganizer.`);
  }
}
