// @ts-nocheck
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

async function warmupSession(page: any, area: string): Promise<void> {
  // Visit a few pages naturally before scraping to establish session trust
  const warmupUrls = [
    `https://${area}.craigslist.org`,
    `https://${area}.craigslist.org/search/gss`, // garage sales section
  ];
  console.log('🔥 Warming up session...');
  for (const url of warmupUrls) {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await sleep(1500 + Math.floor(Math.random() * 800));
  }
  console.log('✅ Session warmed up\n');
}

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

  // Deduplicate by posting ID (Craigslist promoted listings appear multiple times)
  const seen = new Set<string>();
  const deduped = urls.filter((url) => {
    const match = url.match(/\/(\d+)\.html/);
    const id = match ? match[1] : url;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  console.log(`✅ Found ${deduped.length} unique listing URLs (${urls.length} raw, ${urls.length - deduped.length} duplicates removed)`);
  return deduped;
}

async function extractRelayEmail(page: any, listingUrl: string): Promise<{ email: string | null; title: string }> {
  try {
    await page.goto(listingUrl, { waitUntil: 'networkidle2', timeout: 20000 });

    // Get the listing title
    const title: string = await page.evaluate(() => {
      const el = document.querySelector('h1, #titletextonly, [class*="title"]');
      return el?.textContent?.trim() ?? 'Untitled';
    });

    // ── Step 1: Click the reply button via CSS ElementHandle ─────────────────
    // page.$(selector).click() sends real Puppeteer mouse events.
    // Try CSS class first, fall back to finding by text content.
    let replyEl = await page.$('button.reply-button, [data-action="reply"]');

    if (!replyEl) {
      // Find by button text content
      replyEl = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(
          (b) => b.textContent?.trim().toLowerCase() === 'reply' ||
                 b.className?.includes('reply')
        ) ?? null;
      }).then((h: any) => h.asElement?.() ?? null).catch(() => null);
    }

    if (!replyEl) {
      console.warn(`  ⚠️  No reply button found`);
      return { email: null, title };
    }

    await replyEl.click();
    await sleep(2500); // wait for dropdown + reply API network request

    // ── Step 2: Find + click the email option ────────────────────────────────
    // Try CSS selectors for the email option in the reply dropdown
    let emailEl =
      await page.$('[data-service="mailto"]') ||
      await page.$('li.email, button.email, .reply-option-email');

    if (!emailEl) {
      // Fallback: find by text content
      emailEl = await page.evaluateHandle(() => {
        const allEls = Array.from(document.querySelectorAll('button, li, [role="option"]'));
        return allEls.find((el) => {
          const text = el.textContent?.trim().toLowerCase() ?? '';
          const svc = el.getAttribute('data-service') ?? '';
          return svc === 'mailto' || text === 'email';
        }) ?? null;
      }).then((h: any) => h.asElement?.() ?? null).catch(() => null);
    }

    if (!emailEl) {
      // Check what reply options DO exist (chat? phone? none?)
      const replyOptions: string = await page.evaluate(() => {
        const dropdown = document.querySelector('.reply-dropdown, .reply-button-w, [class*="reply"]');
        if (dropdown) return `dropdown found: ${dropdown.textContent?.trim().substring(0, 100)}`;
        // Look for any button/option that appeared after clicking
        const btns = Array.from(document.querySelectorAll('button, li')).filter(
          (el) => (el as HTMLElement).offsetParent !== null
        );
        const relevant = btns
          .map((b) => b.textContent?.trim())
          .filter((t) => t && t.length < 30 && t.length > 1)
          .slice(0, 8);
        return `options visible: ${relevant.join(' | ')}`;
      });
      console.warn(`  ⚠️  No email reply available (${replyOptions})`);
      return { email: null, title };
    }

    await emailEl.click();

    // ── Step 3: Wait for relay email to appear ────────────────────────────────
    try {
      await page.waitForFunction(
        () => {
          const link = document.querySelector('a[href^="mailto:"]');
          if (link) return true;
          return /[a-f0-9]{32}@sale\.craigslist\.org/.test(document.body.innerText);
        },
        { timeout: 6000 }
      );
    } catch {
      console.warn(`  ⚠️  Timed out waiting for relay email`);
      return { email: null, title };
    }

    // ── Step 4: Extract the email ─────────────────────────────────────────────
    const relayEmail: string | null = await page.evaluate(() => {
      const mailtoLink = document.querySelector('a[href^="mailto:"]');
      if (mailtoLink) {
        const href = mailtoLink.getAttribute('href') ?? '';
        if (href.startsWith('mailto:')) return href.slice(7).split('?')[0];
      }
      const anonEl = document.querySelector('.anonemail');
      if (anonEl?.textContent?.includes('@')) return anonEl.textContent.trim();
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

    // Use a realistic desktop viewport so the page renders in desktop layout
    await page.setViewport({ width: 1280, height: 900 });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(10000);

    // Step 0: Warmup — browse naturally to establish a trusted session
    await warmupSession(page, args.area);

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
