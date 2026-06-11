/**
 * Shared Playwright headless browser utility
 *
 * Provides a thin, reusable wrapper around Playwright Chromium for scrapers that
 * target JS-rendered pages (Knockout.js, AngularJS, React SPAs, etc.) that return
 * only a shell via plain HTTP fetch.
 *
 * Design principles:
 *  - Always close browser on success AND error — no leaked processes.
 *  - Anti-bot evasion defaults: disable AutomationControlled flag, realistic UA,
 *    no-sandbox for Linux CI runners.
 *  - Polite defaults: 30 s navigation timeout, 10 s selector wait.
 *  - TypeScript strict — no `any`.
 *
 * Usage (most scrapers):
 *   const html = await fetchPageHTML('https://example.com', {
 *     waitForSelector: '.member-card',
 *     timeout: 30000,
 *   });
 *
 * Usage (multi-step / login flows):
 *   const browser = await getBrowser();
 *   try {
 *     const page = await browser.newPage();
 *     // ... custom interactions
 *   } finally {
 *     await browser.close();
 *   }
 *
 * Candidate scrapers to unpark with this utility:
 *   - NFMAMembers (fleamarkets.org -- Wix JS-rendered)
 *   - SellMyAntiques (/dealers -- Next.js SPA)
 *   - Bid13 (Drupal AJAX + Socket.io)
 *   - StorageTreasures (Next.js SPA, public key capped)
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';

/** Options for fetchPageHTML */
export interface FetchPageOptions {
  /**
   * CSS selector to wait for before extracting HTML.
   * Use a selector that is only present once the JS-rendered content is populated.
   * Default: no selector wait (just networkidle).
   */
  waitForSelector?: string;

  /**
   * Navigation timeout in milliseconds. Default: 30000.
   */
  timeout?: number;

  /**
   * Extra HTTP headers to inject (e.g. Accept-Language, Referer).
   */
  extraHeaders?: Record<string, string>;

  /**
   * If true, wait for network to be idle (no requests for 500 ms) after navigation.
   * Default: true.
   */
  waitForNetworkIdle?: boolean;
}

/**
 * Chromium launch args optimised for CI/server environments:
 *  - no-sandbox: required on Linux without user namespaces (GitHub Actions, Railway)
 *  - disable-setuid-sandbox: companion to no-sandbox
 *  - disable-dev-shm-usage: prevents crashes in low-shm Docker containers
 *  - AutomationControlled disabled: removes the "Chrome is being controlled by automated
 *    software" banner and the navigator.webdriver flag that many bot-detection scripts
 *    check for.
 */
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-infobars',
  '--window-size=1280,800',
];

/** Realistic desktop user-agent string */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Launch a new headless Chromium browser instance.
 * The caller is responsible for calling browser.close() when done.
 */
export async function getBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: LAUNCH_ARGS,
  });
}

/**
 * Create a new BrowserContext with anti-bot evasion settings applied.
 * Returns both the context and a convenience Page.
 */
export async function createStealthContext(
  browser: Browser
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/Chicago',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Hide navigator.webdriver to reduce bot-detection fingerprint
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  const page = await context.newPage();
  return { context, page };
}

/**
 * Navigate to url, wait for JS content to render, and return the full outer HTML.
 *
 * Handles its own browser lifecycle -- opens a browser, fetches the page, closes
 * the browser, and returns the HTML string. Throws on navigation or selector errors.
 *
 * @param url       Full URL to navigate to.
 * @param options   Optional tuning (selector, timeout, extra headers).
 * @returns         Full outer HTML of the page after JS rendering.
 */
export async function fetchPageHTML(
  url: string,
  options: FetchPageOptions = {}
): Promise<string> {
  const {
    waitForSelector,
    timeout = 30000,
    extraHeaders = {},
    waitForNetworkIdle = true,
  } = options;

  const browser = await getBrowser();
  try {
    const { context, page } = await createStealthContext(browser);

    if (Object.keys(extraHeaders).length > 0) {
      await context.setExtraHTTPHeaders(extraHeaders);
    }

    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    const waitUntil = waitForNetworkIdle ? 'networkidle' : 'domcontentloaded';
    await page.goto(url, { waitUntil, timeout });

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout });
    }

    const html = await page.content();
    await context.close();
    return html;
  } finally {
    await browser.close();
  }
}

/**
 * Convenience wrapper: navigate to url, evaluate pageFunction in the browser
 * context, and return the result. Useful when you need to extract structured data
 * from the page's JS runtime rather than parsing HTML.
 *
 * @param url           Full URL to navigate to.
 * @param pageFunction  Function evaluated in the browser -- return value must be
 *                      JSON-serialisable.
 * @param options       Same options as fetchPageHTML.
 */
export async function evaluateOnPage<T>(
  url: string,
  pageFunction: () => T,
  options: FetchPageOptions = {}
): Promise<T> {
  const {
    waitForSelector,
    timeout = 30000,
    extraHeaders = {},
    waitForNetworkIdle = true,
  } = options;

  const browser = await getBrowser();
  try {
    const { context, page } = await createStealthContext(browser);

    if (Object.keys(extraHeaders).length > 0) {
      await context.setExtraHTTPHeaders(extraHeaders);
    }

    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    const waitUntil = waitForNetworkIdle ? 'networkidle' : 'domcontentloaded';
    await page.goto(url, { waitUntil, timeout });

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout });
    }

    const result = await page.evaluate(pageFunction);
    await context.close();
    return result;
  } finally {
    await browser.close();
  }
}
