/**
 * NAA Find an Auctioneer -- public profile pages, driven by the site's own sitemap.
 * Replaces the Novi AMS list endpoint (members.auctioneers.org/members/directory-customer-list),
 * which started answering 404 on 2026-10-30 (see scrape-naa.yml and naaAuctioneerDirectory.ts).
 *
 * WHAT IS ALLOWED (checked 2026-11-01):
 *   - members.auctioneers.org/robots.txt disallows only /api/, /novi-api/, /admin/, /login,
 *     /client-login and *.axd / *.php (Crawl-delay 1 for ClaudeBot, none for *). It lists
 *     /sitemap.xml, which lists ~400 profile pages /find-an-auctioneer/<slug> (lastmod
 *     2025-09-19). This scraper re-checks robots.txt on every run and skips any disallowed URL.
 *   - members.auctioneers.org/legal and www.auctioneers.org/legal (privacy policy under a
 *     "Terms of Service" heading) contain no clause on scraping, crawling or automated access.
 *   - Profile pages render server-side without login.
 *
 * WHAT IS PARSED (public fields only, seen on live profiles 2026-11-01 via WebFetch:
 *   aaron-klesick, adam-dunn): the member's name (H1), their address line above the
 *   "Organization" heading ("7026 Winchester Southern Rd. Stoutsville, OH 43154"), and the
 *   member's own website link. NOT parsed: the "Contact" block's address and phone, which
 *   are NAA's own office (Lenexa, KS 66215, (913) 541-8084) on every profile, and the email,
 *   which is only behind NAA's secure-contact form.
 *
 * POLITENESS: one request at a time, at least NAA_PROFILE_INTERVAL_MS apart (default 3 s,
 *   3x the robots.txt crawl-delay), at most NAA_PROFILE_CAP_PER_RUN profiles per run (default
 *   150). Each run takes the next slice of the sitemap (by ISO week), so a weekly schedule
 *   covers all ~400 profiles in three weeks with no stored state.
 *
 * DEDUP: names and "City, ST" go through getOrCreateScrapedOrganizer exactly like the old
 *   directory scraper (same SOURCE_NAME, person name as businessName, AUCTION_HOUSE), so the
 *   1,944 NAA organizers already ingested are matched (name:city key, website identity key)
 *   instead of duplicated.
 */

import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { RateLimiter } from '../rateLimiter';
import { safeFetch } from '../safeFetch';
import { getOrCreateScrapedOrganizer } from '../index';
import { ScrapeStats } from '../sourceRegistry';
import { prisma } from '../../../lib/prisma';
import { parseCityState } from './naaAuctioneerDirectory';

const NAA_BASE_URL = 'https://members.auctioneers.org';
const SITEMAP_URL = `${NAA_BASE_URL}/sitemap.xml`;
const ROBOTS_URL = `${NAA_BASE_URL}/robots.txt`;
const SOURCE_NAME = 'NAAFindAnAuctioneer';
export const NAA_USER_AGENT = 'Mozilla/5.0 (compatible; FindASaleBot/1.0; +https://finda.sale)';

/** Profile URL shape in the sitemap: /find-an-auctioneer/<slug> (one path segment). */
const PROFILE_URL_RE = /^https:\/\/members\.auctioneers\.org\/find-an-auctioneer\/[a-z0-9][a-z0-9-]*\/?$/i;

/** NAA's own office, printed in the Contact block of every profile -- never the member's. */
const NAA_OFFICE_ZIP = '66215';

/** Hosts that are never the member's own website (NAA, its platform, NAA's social accounts). */
const NON_MEMBER_HOSTS = [
  'auctioneers.org',
  'noviams.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'instagram.com',
  'youtube.com',
  'youtu.be',
  'pinterest.com',
  'google.com',
  'googletagmanager.com',
  'apple.com',
];

export function profileCapPerRun(): number {
  const v = Number(process.env.NAA_PROFILE_CAP_PER_RUN);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 150;
}

export function profileIntervalMs(): number {
  const v = Number(process.env.NAA_PROFILE_INTERVAL_MS);
  return Number.isFinite(v) && v >= 1000 ? v : 3000;
}

/** Profile URLs listed in the sitemap XML, de-duplicated and sorted (stable slicing). */
export function parseSitemapProfileUrls(xml: string): string[] {
  const out = new Set<string>();
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const loc = m[1].replace(/&amp;/g, '&').trim();
    if (PROFILE_URL_RE.test(loc)) out.add(loc.replace(/\/$/, ''));
  }
  return Array.from(out).sort();
}

/** ISO-ish week index since the epoch (UTC), used to pick this run's slice. */
export function weekIndex(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (7 * 86_400_000));
}

/** This run's slice: `cap` URLs starting at (week * cap) mod total, wrapping around. */
export function sliceForRun(urls: readonly string[], cap: number, now: Date = new Date()): string[] {
  const n = urls.length;
  if (n === 0 || cap <= 0) return [];
  if (cap >= n) return urls.slice();
  const start = (weekIndex(now) * cap) % n;
  const out: string[] = [];
  for (let i = 0; i < cap; i++) out.push(urls[(start + i) % n]);
  return out;
}

const STREET_SUFFIX_RE =
  /\b(?:st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|hwy|highway|pkwy|parkway|ct|court|way|pl|place|cir|circle|trl|trail|ter|terrace|sq|square|loop|pike|tpke|turnpike|route|rte|run|row|pass|xing|crossing|plz|plaza|aly|alley|expy|expressway|fwy|freeway)\.?(?=\s|,|$)/gi;

/**
 * City from a segment that may still carry the street ("7026 Winchester Southern Rd.
 * Stoutsville"). A segment that starts with a house number keeps only what follows the last
 * street suffix (and any unit like "Suite 120"); if no suffix is found the city is unknown
 * (null) rather than a guess that would put a street name into the city.
 */
export function cityFromSegment(segment: string): string | null {
  const t = segment.replace(/\s+/g, ' ').trim().replace(/,$/, '');
  if (!t) return null;
  if (!/^\d/.test(t) && !/^(?:p\.?\s*o\.?\s*box|box)\b/i.test(t)) return t;
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  STREET_SUFFIX_RE.lastIndex = 0;
  while ((m = STREET_SUFFIX_RE.exec(t)) !== null) lastEnd = m.index + m[0].length;
  if (lastEnd < 0) {
    const box = t.match(/^(?:p\.?\s*o\.?\s*box|box)\s+\S+\s+(.+)$/i);
    return box ? box[1].trim() : null;
  }
  let rest = t.slice(lastEnd).trim();
  rest = rest.replace(/^(?:(?:suite|ste|unit|apt|bldg|building|#)\.?\s*[\w-]+[,]?\s*)+/i, '').trim();
  rest = rest.replace(/^[NSEW]{1,2}\b\.?\s+/, '').trim(); // trailing directional ("Main St NW")
  return rest && /[A-Za-z]/.test(rest) ? rest : null;
}

export interface NAAProfile {
  name: string;
  city: string;
  state: string;
  zip?: string;
  website?: string;
}

/** Visible text segments (text nodes) in document order, script/style excluded. */
function textSegments($: cheerio.CheerioAPI, root: any): string[] {
  const out: string[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (node.type === 'text') {
      const v = String(node.data || '').replace(/\s+/g, ' ').trim();
      if (v) out.push(v);
      return;
    }
    if (node.type === 'tag' || node.type === 'root') {
      const name = (node.name || '').toLowerCase();
      if (name === 'script' || name === 'style' || name === 'noscript') return;
      for (const c of node.children || []) walk(c);
    }
  };
  walk(root);
  return out;
}

// Two-letter code first, so "Mount Vernon WA 98274" splits as Mount Vernon / WA; then full
// state names ("Lenexa, Kansas 66215", "Albany, New York 12207").
const CITY_STATE_ZIP_TAIL_RES = [
  /^(.*?)(?:,\s*|\s+)([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/,
  /^(.*?),\s*([A-Za-z][A-Za-z .]*?)\s+(\d{5}(?:-\d{4})?)$/,
];

/**
 * Find the member's "City, ST ZIP" among text segments. The address may be one text node
 * ("7026 Winchester Southern Rd. Stoutsville, OH 43154") or split across elements
 * ("Mount Vernon" "," "WA" "98274"), so up to four consecutive segments are joined.
 */
export function findMemberAddress(segments: string[]): { city: string; state: string; zip: string } | null {
  // Windows end at the segment holding the ZIP and grow backwards, so the smallest window that
  // yields a city wins (a company-name line before the address is never glued onto the city).
  for (let j = 0; j < segments.length; j++) {
    if (!/\d{5}(?:-\d{4})?$/.test(segments[j])) continue;
    for (let len = 1; len <= 4 && j - len + 1 >= 0; len++) {
      const parts = segments.slice(j - len + 1, j + 1);
      const joined = parts.join(' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
      for (const re of CITY_STATE_ZIP_TAIL_RES) {
        const m = joined.match(re);
        if (!m) continue;
        const zip = m[3];
        if (zip.startsWith(NAA_OFFICE_ZIP)) continue;
        // The city is the text right before ", ST" (or "ST" for a split address).
        const { state } = parseCityState([`X, ${m[2]} ${zip}`]);
        if (!state) continue;
        const city = cityFromSegment(m[1]);
        if (!city) continue;
        const check = parseCityState([`${city}, ${state} ${zip}`]);
        if (!check.city || !check.state) continue;
        return { city: check.city, state: check.state, zip };
      }
    }
  }
  return null;
}

function isMemberWebsite(href: string): boolean {
  let host: string;
  try {
    const u = new URL(href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    host = u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  return !NON_MEMBER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Parse one public profile page. Returns a reason instead of a profile when incomplete. */
export function parseNAAProfile(html: string): { profile: NAAProfile | null; reason?: string } {
  const $ = cheerio.load(html);
  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
  const titleName = $('title').first().text().split(/\s+-\s+National Auction Association/i)[0].replace(/\s+/g, ' ').trim();
  const name = h1 || titleName;
  if (!name) return { profile: null, reason: 'no_name' };

  // Member block = everything before the "Organization" heading. The later Contact block
  // carries NAA's own office address and phone, so it is never read for the address.
  const orgHeading = html.search(/<h[1-6]\b[^>]*>\s*Organization\s*<\/h[1-6]>/i);
  const memberHtml = orgHeading > 0 ? html.slice(0, orgHeading) : html;
  const $m = cheerio.load(memberHtml);
  const body = $m('body').length ? $m('body').get(0) : $m.root().get(0);
  const segments = textSegments($m, body);
  const nameAt = segments.findIndex((s) => s === name);
  const addr = findMemberAddress(nameAt >= 0 ? segments.slice(nameAt + 1) : segments);
  if (!addr) return { profile: null, reason: 'no_us_address' };

  // Website: the member's own link, first from the member block, else anywhere on the page
  // (NAA's own and its social/platform links are excluded either way).
  const firstMemberLink = (q: cheerio.CheerioAPI): string | undefined => {
    let found: string | undefined;
    q('a[href]').each((_, el) => {
      if (found) return;
      const href = (q(el).attr('href') || '').trim();
      if (isMemberWebsite(href)) found = href;
    });
    return found;
  };
  const website = firstMemberLink($m) ?? firstMemberLink($);

  return { profile: { name, city: addr.city, state: addr.state, zip: addr.zip, website } };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<{ status: number; text: string } | { skipped: string }> {
  // Tolerant breaker: a 404 profile (member left) is page-level and must not cool the whole
  // domain down; 429/503/403 still trip it immediately (safeFetch.ts TOLERANT POLICY).
  const r = await safeFetch(url, {
    headers: { 'User-Agent': NAA_USER_AGENT, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' },
    timeoutMs: 20000,
    breakerPolicy: 'tolerant',
    breakerScope: url.split('/').pop() || url,
  });
  if (r.status !== 'FETCHED') return { skipped: r.status };
  return { status: r.response!.status, text: r.response!.ok ? await r.response!.text() : '' };
}

/**
 * Main entry point (national-once source; metro and organizerId are unused).
 */
export async function scrapeNAAProfiles(
  _metro: string,
  _organizerId: string,
  _rateLimiter?: RateLimiter
): Promise<ScrapeStats> {
  const stats: ScrapeStats = { itemsFound: 0, itemsCreated: 0, itemsUpdated: 0, itemsSkipped: 0, itemsFailed: 0 };
  const runStartedAt = new Date();
  const interval = profileIntervalMs();

  // robots.txt: re-read every run; a disallow (or an unreadable file) stops the run.
  const robotsRes = await fetchText(ROBOTS_URL);
  if ('skipped' in robotsRes || robotsRes.status !== 200) {
    throw new Error(`[NAAProfiles] robots.txt unavailable (${'skipped' in robotsRes ? robotsRes.skipped : robotsRes.status}) -- not crawling`);
  }
  const robots = robotsParser(ROBOTS_URL, robotsRes.text);
  const crawlDelayMs = Math.max(interval, (Number(robots.getCrawlDelay(NAA_USER_AGENT)) || 0) * 1000);
  await sleep(crawlDelayMs);

  const sitemapRes = await fetchText(SITEMAP_URL);
  if ('skipped' in sitemapRes || sitemapRes.status !== 200) {
    throw new Error(`[NAAProfiles] sitemap.xml unavailable (${'skipped' in sitemapRes ? sitemapRes.skipped : sitemapRes.status})`);
  }
  const all = parseSitemapProfileUrls(sitemapRes.text).filter((u) => robots.isAllowed(u, NAA_USER_AGENT) !== false);
  if (all.length === 0) {
    throw new Error('[NAAProfiles] sitemap.xml lists no allowed /find-an-auctioneer/<slug> profiles -- layout or robots changed');
  }
  const cap = profileCapPerRun();
  const batch = sliceForRun(all, cap, runStartedAt);
  console.log(`[NAAProfiles] ${all.length} profiles in sitemap; this run: ${batch.length} (cap ${cap}), ${crawlDelayMs} ms apart`);

  const reasons: Record<string, number> = {};
  let parsedOk = 0;
  for (let i = 0; i < batch.length; i++) {
    const url = batch[i];
    await sleep(crawlDelayMs * (1 + Math.random() * 0.3));

    const res = await fetchText(url).catch((err) => {
      console.warn(`[NAAProfiles] fetch failed ${url}:`, err instanceof Error ? err.message : String(err));
      return { status: 0, text: '' };
    });
    if ('skipped' in res) {
      // Breaker/cap: the host is cooling down; stop instead of skipping every remaining URL.
      console.warn(`[NAAProfiles] ${res.skipped} at ${url} -- stopping this run (${batch.length - i} not reached)`);
      stats.incompleteReason = res.skipped.toLowerCase();
      break;
    }
    if (res.status === 404 || res.status === 410) {
      stats.itemsSkipped++;
      reasons.gone = (reasons.gone || 0) + 1;
      continue;
    }
    if (res.status === 429 || res.status === 503 || res.status === 403) {
      console.warn(`[NAAProfiles] HTTP ${res.status} at ${url} -- stopping this run`);
      stats.incompleteReason = `http_${res.status}`;
      break;
    }
    if (res.status !== 200) {
      stats.itemsFailed++;
      reasons[`http_${res.status}`] = (reasons[`http_${res.status}`] || 0) + 1;
      continue;
    }

    const { profile, reason } = parseNAAProfile(res.text);
    if (!profile) {
      stats.itemsSkipped++;
      reasons[reason || 'unknown'] = (reasons[reason || 'unknown'] || 0) + 1;
      // Layout guard: if none of the first 10 profiles parse, the markup changed.
      if (parsedOk === 0 && i + 1 >= 10) {
        throw new Error(`[NAAProfiles] first ${i + 1} profiles produced no parsable member -- profile layout may have changed (${JSON.stringify(reasons)})`);
      }
      continue;
    }
    parsedOk++;
    stats.itemsFound++;

    try {
      const orgId = await getOrCreateScrapedOrganizer(
        profile.name,
        SOURCE_NAME,
        profile.city,
        profile.state,
        undefined, // esnOrgId
        undefined, // googlePlaceId
        undefined, // foursquareVenueId
        undefined, // hereBusinessId
        'AUCTION_HOUSE',
        undefined, // email: only behind NAA's secure-contact form
        undefined, // phone: the profile's phone is NAA's office number, never the member's
        profile.website
      );
      if (!orgId) {
        stats.itemsSkipped++;
        continue;
      }
      const row = await prisma.organizer.findUnique({ where: { id: orgId }, select: { createdAt: true } });
      if (row && row.createdAt >= runStartedAt) stats.itemsCreated++;
      else stats.itemsUpdated++;
    } catch (err) {
      console.error(`[NAAProfiles] ingest failed for "${profile.name}" (${profile.city}, ${profile.state}):`, err);
      stats.itemsFailed++;
    }
  }

  console.log(
    `[NAAProfiles] done -- found ${stats.itemsFound}, created ${stats.itemsCreated}, matched existing ${stats.itemsUpdated}, ` +
      `skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}` +
      (Object.keys(reasons).length ? `, reasons ${JSON.stringify(reasons)}` : '') +
      (stats.incompleteReason ? `, INCOMPLETE (${stats.incompleteReason})` : '')
  );
  return stats;
}
