/**
 * Nebraska Secretary of State — Corporate Registry Scraper
 *
 * STUB — reCAPTCHA gate confirmed: Nebraska SOS corporate search
 * (https://www.nebraska.gov/sos/corp/corpsearch.cgi) returns clean HTML with a
 * form, but requires Google reCAPTCHA completion before any search can be
 * submitted. The reCAPTCHA div is present in the static page HTML and the submit
 * button is only enabled after the challenge passes. Plain HTTP POST without a
 * valid g-recaptcha-response token returns an empty result or 400.
 *
 * Additionally, Nebraska has NO statewide auctioneer license requirement — the
 * original DHHS LUP portal (nebraska.gov/LISSearch/search.cgi) was never the
 * correct source. There is no Nebraska state auctioneer license registry.
 *
 * Probe conducted: 2026-06-24. reCAPTCHA site key 6LcmsP4SAAAAAJeHxpx9VA7CeZq_9gf74M8tJVra
 * confirmed present in page source. No bypass path available without JS rendering.
 *
 * To implement: would require Puppeteer/Playwright with reCAPTCHA solver, or a
 * headless browser integration. Out of scope for Phase 1 HTTP-only scrapers.
 *
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

// Suppress unused import warnings — kept for consistency with other state scrapers
void defaultRateLimiter;
void getOrCreateScrapedOrganizer;
void getRandomUserAgent;

/**
 * Nebraska SOS corporate registry scraper — currently a no-op stub.
 *
 * The Nebraska SOS search requires reCAPTCHA (confirmed 2026-06-24). Plain HTTP
 * scraping is not possible without a headless browser + CAPTCHA solver.
 * Nebraska also has no statewide auctioneer license — no alternative licensing
 * registry exists to fall back to.
 *
 * Function name kept as runNebraskaLicensingScraper for export compatibility.
 */
export async function runNebraskaLicensingScraper(): Promise<void> {
  // PARKED: Nebraska SOS requires reCAPTCHA — plain HTTP scraping not viable.
  // Nebraska has no statewide auctioneer license registry.
  // See file header for full research notes.
  console.log(
    '[NebraskaSOS] PARKED: Nebraska SOS corporate search requires reCAPTCHA (confirmed 2026-06-24). ' +
    'Nebraska has no statewide auctioneer license. No plain-HTTP data source available. Exiting cleanly.'
  );
}
