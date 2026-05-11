// DIAGNOSTIC ONLY — dry-run, no DB writes
/**
 * diagnose-newspaper-rss.ts
 * Tests each RSS feed URL in NEWSPAPER_FEEDS exactly as scrapeRssFeed does.
 * Also tests candidate replacement feeds (Craigslist, EstateSales.NET) to
 * identify working sources.
 *
 * NOTE: As of S620-S621, all feeds in NEWSPAPER_FEEDS are deprecated (empty array).
 * This diagnostic will detect that and also probes candidates.
 *
 * Run: npx tsx src/scripts/diagnostics/diagnose-newspaper-rss.ts
 */

import * as cheerio from 'cheerio';
import { NEWSPAPER_FEEDS } from '../../services/scraper/newspaper-feeds';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
];
function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

const SALE_KEYWORDS = [
  'estate sale', 'yard sale', 'garage sale', 'moving sale',
  'tag sale', 'rummage sale', 'estate auction',
];
function passesKeywordFilter(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toLowerCase();
  return SALE_KEYWORDS.some(kw => combined.includes(kw));
}

interface FeedResult {
  name: string;
  url: string;
  status: number | string;
  itemCount: number;
  saleItemCount: number;
  sampleTitles: string[];
  error?: string;
}

async function testFeed(name: string, url: string): Promise<FeedResult> {
  const result: FeedResult = {
    name, url, status: 'error', itemCount: 0, saleItemCount: 0, sampleTitles: [],
  };

  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const response = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': `https://www.${domain}/`,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      signal: AbortSignal.timeout(15000),
    });

    result.status = response.status;

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const items = $('item');
    result.itemCount = items.length;

    items.each((_, el) => {
      const title = $('title', el).text().trim();
      const description = $('description', el).text().replace(/<[^>]+>/g, ' ').trim();
      if (result.sampleTitles.length < 5) result.sampleTitles.push(title);
      if (passesKeywordFilter(title, description)) result.saleItemCount++;
    });

  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.status = 'ERROR';
  }

  return result;
}

// Candidate replacement feeds to probe
const CANDIDATE_FEEDS = [
  { name: 'EstateSales.NET RSS — National', url: 'https://www.estatesales.net/rss' },
  { name: 'EstateSales.NET RSS — Michigan', url: 'https://www.estatesales.net/MI/rss' },
  { name: 'GarageSaleFinder RSS', url: 'https://www.garagesalefinder.com/rss' },
  { name: 'Craigslist Garage Sales — Grand Rapids', url: 'https://grandrapids.craigslist.org/search/gms?format=rss' },
  { name: 'Craigslist Garage Sales — Chicago', url: 'https://chicago.craigslist.org/search/gms?format=rss' },
  { name: 'Craigslist Garage Sales — Detroit', url: 'https://detroit.craigslist.org/search/gms?format=rss' },
];

async function main() {
  console.log('=== diagnose-newspaper-rss.ts — DRY RUN ===');
  console.log('');

  // Section 1: Configured feeds
  console.log(`NEWSPAPER_FEEDS (configured): ${NEWSPAPER_FEEDS.length} feeds`);

  if (NEWSPAPER_FEEDS.length === 0) {
    console.log('  Array is EMPTY — all sources deprecated (Oodle 403, Eventbrite paywall, Google News junk per S620-S621).');
    console.log('  Real scraper returns 0 items. This is expected, not a bug.');
  } else {
    console.log('\nTesting configured feeds:');
    for (const feed of NEWSPAPER_FEEDS) {
      const result = await testFeed(feed.name, feed.url);
      console.log(`\n  [${feed.name}]`);
      console.log(`    URL         : ${feed.url}`);
      console.log(`    Status      : ${result.status}`);
      console.log(`    Items total : ${result.itemCount}`);
      console.log(`    Sale items  : ${result.saleItemCount}`);
      if (result.error) console.log(`    Error       : ${result.error}`);
      result.sampleTitles.forEach((t, i) => console.log(`    Title [${i + 1}]  : ${t}`));
    }
  }

  // Section 2: Candidate replacement feeds
  console.log('\n\n--- CANDIDATE REPLACEMENT FEEDS ---');
  const candidateResults: FeedResult[] = [];

  for (const feed of CANDIDATE_FEEDS) {
    process.stdout.write(`Testing ${feed.name}... `);
    const result = await testFeed(feed.name, feed.url);
    candidateResults.push(result);
    console.log(`${result.status} — ${result.itemCount} items, ${result.saleItemCount} sale matches${result.error ? ' | ' + result.error : ''}`);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Section 3: Summary
  console.log('\n--- CANDIDATE RESULTS ---');
  const working = candidateResults.filter(r => r.status === 200 && r.itemCount > 0);
  const withSaleItems = candidateResults.filter(r => r.saleItemCount > 0);

  console.log(`Working feeds (200 + items) : ${working.length} / ${candidateResults.length}`);
  console.log(`Feeds with sale matches    : ${withSaleItems.length}`);

  if (withSaleItems.length > 0) {
    console.log('\nFeeds with sale listings:');
    for (const r of withSaleItems) {
      console.log(`\n  [${r.name}] — ${r.saleItemCount} sale items out of ${r.itemCount} total`);
      r.sampleTitles.slice(0, 3).forEach((t, i) => console.log(`    [${i + 1}] ${t}`));
    }
  }

  // Verdict
  console.log('\n=== VERDICT ===');
  if (NEWSPAPER_FEEDS.length === 0 && withSaleItems.length === 0) {
    console.log('RESULT: BROKEN — NEWSPAPER_FEEDS is empty AND no candidate feeds have sale listings. RSS sourcing non-functional.');
  } else if (NEWSPAPER_FEEDS.length === 0 && withSaleItems.length > 0) {
    console.log(`RESULT: EMPTY (fixable) — NEWSPAPER_FEEDS is empty but ${withSaleItems.length} candidate feed(s) have sale listings and could be added:`);
    withSaleItems.forEach(r => console.log(`  -> ${r.name} (${r.saleItemCount} sale items)`));
  } else {
    console.log(`RESULT: WORKING — ${NEWSPAPER_FEEDS.length} configured feed(s) tested`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
