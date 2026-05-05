/**
 * Craigslist Relay Email Scraper
 *
 * Scrapes Craigslist garage/yard/estate sale listings and extracts
 * relay emails by simulating the "reply → email" browser interaction.
 *
 * MUST be run from a residential IP (home machine). Datacenter IPs
 * are blocked by Craigslist's bot detection.
 *
 * Usage:
 *   npx ts-node packages/backend/src/scripts/craigslistScraper.ts \
 *     --url "https://grandrapids.craigslist.org/search/gms" \
 *     --area "grandrapids" \
 *     --max 50 \
 *     --delay 1500
 *
 * Output: craigslist-leads-[timestamp].json in current directory
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  postingId: string;
  title: string;
  listingUrl: string;
  relayEmail: string;
  area: string;
  category: string;
  scrapedAt: string;
}

interface CLIArgs {
  url: string;
  area: string;
  max: number;
  delay: number;
}

// ─── CLI Arg Parser ───────────────────────────────────────────────────────────

function parseArgs(): CLIArgs {
  const args: Record<string, string> = {};

  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--')) {
      const key = process.argv[i].slice(2);
      const value = process.argv[i + 1];
      if (value && !value.startsWith('--')) {
        args[key] = value;
        i++;
      }
    }
  }

  if (!args['url'] || !args['area']) {
    console.error('❌ Missing required arguments');
    console.error('Usage: npx ts-node craigslistScraper.ts --url <search-url> --area <area-name> [--max <count>] [--delay <ms>]');
    console.error('Example: npx ts-node craigslistScraper.ts --url "https://grandrapids.craigslist.org/search/gms" --area grandrapids');
    process.exit(1);
  }

  return {
    url: args['url'],
    area: args['area'],
    max: parseInt(args['max'] ?? '50', 10),
    delay: parseInt(args['delay'] ?? '1500', 10),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPostingMeta(url: string): { postingId: string; category: string } | null {
  // https://grandrapids.craigslist.org/gms/d/grand-rapids-dorm-move-out/7931868493.html
  const match = url.match(/\/([a-z]+)\/d\/[^/]+\/(\d+)\.html/);
  if (!match) return null;
  return { category: match[1], postingId: match[2] };
}

// ─── Scraper Logic ────────────────────────────────────────────────────────────

async function getListingUrls(page: any, searchUrl: string, max: number): Promise<string[]> {
  console.log('🌐 Loading search page...');
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for the listing grid (Craigslist search is React-rendered)
  try {
    await page.waitForSelector('a[data-id]', { timeout: 12000 });
  } catch {
    console.warn('⚠️  data-id selector not found — trying fallback selectors');
    try {
      await page.waitForSelector('.cl-search-result a', { timeout: 8000 });
    } catch {
      console.error('❌ Could not find listing grid. The search page may have changed or is blocking the request.');
      return [];
    }
  }

  const urls: string[] = await page.evaluate((maxCount: number) => {
    // Try multiple selector patterns for Craigslist's listing links
    let links = Array.from(document.querySelectorAll('a[data-id]')) as HTMLAnchorElement[];
    if (links.length === 0) {
      links = Array.from(document.querySelectorAll('.cl-search-result a.cl-app-anchor')) as HTMLAnchorElement[];
    }
    if (links.length === 0) {
      links = Array.from(document.querySelectorAll('li.result-row a.result-title')) as HTMLAnchorElement[];
    }
    return links
      .slice(0, maxCount)
      .map((el) => el.href)
      .filter((href) => href && href.includes('.html'));
  }, max);

  console.log(`✅ Found ${urls.length} listing URLs`);
  return urls;
}

async function extractRelayEmail(page: any, listingUrl: string): Promise<{ email: string | null; title: string }> {
  try {
    await page.goto(listingUrl, { waitUntil: 'networkidle2', timeout: 20000 });

    // Get the listing title
    const title: string = await page.evaluate(() => {
      const el = document.querySelector('h1, #titletextonly, [class*="title"]');
      return el?.textContent?.trim() ?? 'Untitled';
    });

    // Find and click the reply button
    const replyClicked = await page.evaluate(() => {
      // Craigslist reply button: <button class="reply-button">reply</button>
      const btns = Array.from(document.querySelectorAll('button'));
      const replyBtn = btns.find(
        (b) => b.textContent?.trim().toLowerCase() === 'reply' ||
               b.getAttribute('aria-label')?.toLowerCase().includes('reply')
      );
      if (replyBtn) {
        (replyBtn as HTMLButtonElement).click();
        return true;
      }
      return false;
    });

    if (!replyClicked) {
      console.warn(`  ⚠️  No reply button found`);
      return { email: null, title };
    }

    // Wait for the email/chat dropdown to appear
    await sleep(600);

    // Click the "email" row in the dropdown
    const emailClicked = await page.evaluate(() => {
      // The email row in the dropdown
      const allEls = Array.from(document.querySelectorAll('button, li, [role="option"], a'));
      const emailEl = allEls.find((el) => {
        const text = el.textContent?.trim().toLowerCase() ?? '';
        const service = el.getAttribute('data-service') ?? '';
        return service === 'mailto' || text === 'email';
      });
      if (emailEl) {
        (emailEl as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (!emailClicked) {
      console.warn(`  ⚠️  No email option found in dropdown`);
      return { email: null, title };
    }

    // Wait for the relay email to render
    try {
      await page.waitForFunction(
        () => {
          const link = document.querySelector('a[href^="mailto:"]');
          if (link) return true;
          const body = document.body.innerText;
          return /[a-f0-9]{32}@sale\.craigslist\.org/.test(body);
        },
        { timeout: 5000 }
      );
    } catch {
      console.warn(`  ⚠️  Timed out waiting for relay email`);
      return { email: null, title };
    }

    // Extract the relay email
    const relayEmail: string | null = await page.evaluate(() => {
      // 1. mailto link
      const mailtoLink = document.querySelector('a[href^="mailto:"]');
      if (mailtoLink) {
        const href = mailtoLink.getAttribute('href') ?? '';
        if (href.startsWith('mailto:')) return href.slice(7).split('?')[0];
      }
      // 2. .anonemail text
      const anonEl = document.querySelector('.anonemail');
      if (anonEl?.textContent?.includes('@')) return anonEl.textContent.trim();
      // 3. regex fallback in visible text
      const match = document.body.innerText.match(/[a-f0-9]{32}@sale\.craigslist\.org/);
      return match ? match[0] : null;
    });

    return { email: relayEmail, title };
  } catch (err: any) {
    console.warn(`  ❌ Error: ${err.message}`);
    return { email: null, title: 'Untitled' };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('\n🔍 FindA.Sale — Craigslist Lead Scraper');
  console.log(`📍 Area:      ${args.area}`);
  console.log(`🔗 URL:       ${args.url}`);
  console.log(`📦 Max:       ${args.max}`);
  console.log(`⏱️  Delay:     ${args.delay}ms\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const leads: Lead[] = [];
  const skipped: string[] = [];

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(10000);

    // Step 1: Get listing URLs from the search page
    const listingUrls = await getListingUrls(page, args.url, args.max);

    if (listingUrls.length === 0) {
      console.error('❌ No listings found. Try running with headless: false to debug visually.');
      process.exit(1);
    }

    console.log(`\n📋 Processing ${listingUrls.length} listings...\n`);

    // Step 2: Visit each listing and extract relay email
    for (let i = 0; i < listingUrls.length; i++) {
      const url = listingUrls[i];
      const meta = extractPostingMeta(url);
      if (!meta) {
        skipped.push(url);
        continue;
      }

      console.log(`[${i + 1}/${listingUrls.length}] ${meta.postingId}`);

      const { email, title } = await extractRelayEmail(page, url);

      if (email) {
        console.log(`  ✅ ${email}`);
        leads.push({
          postingId: meta.postingId,
          title,
          listingUrl: url,
          relayEmail: email,
          area: args.area,
          category: meta.category,
          scrapedAt: new Date().toISOString(),
        });
      } else {
        skipped.push(url);
      }

      // Rate limiting
      if (i < listingUrls.length - 1) {
        const jitter = Math.floor(Math.random() * 500);
        await sleep(args.delay + jitter);
      }
    }
  } finally {
    await browser.close();
  }

  // ─── Output ─────────────────────────────────────────────────────────────────

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Extracted: ${leads.length} relay emails`);
  console.log(`⏭️  Skipped:   ${skipped.length} listings (no email / errors)`);

  if (leads.length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputFile = `craigslist-leads-${timestamp}.json`;
    const outputPath = path.join(process.cwd(), outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(leads, null, 2));
    console.log(`📁 Saved to:  ${outputPath}`);
    console.log(`\nSample: ${leads[0].relayEmail} (${leads[0].title})`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
