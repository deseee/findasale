/**
 * marketplacePlaywrightClient.ts — the ONLY module that drives a real browser
 * session against Facebook Marketplace (ADR-083).
 *
 * No official Marketplace API exists (confirmed 2026-07-14 — deliberately
 * excluded from the Graph API). This module simulates a logged-in browser
 * session using Playwright against a FindA.Sale-owned dedicated "poster"
 * account's saved session (never an organizer's own account — legal review
 * 2026-07-14, HIGH risk mitigated by using disposable accounts only).
 *
 * IMPORTANT — no live account exists yet as of this dispatch (2026-07-14).
 * Account creation/login is a Patrick-only action (Claude's own standing rules
 * prohibit creating accounts or entering passwords, even authorized) — see
 * claude_docs/feature-notes/ADR-083-marketplace-poster.md "Flagged for Patrick".
 * Until a MarketplacePosterAccount row exists with a real sessionCookie, every
 * call here fails fast with a clear, expected "no pool account" error that the
 * caller (marketplacePosterService.ts) treats as SKIPPED, not FAILED.
 *
 * Playwright is already a project dependency (playwright + playwright-extra in
 * package.json) — no new package installation needed.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import { decryptToken, encryptToken } from '../../utils/tokenCrypto';
import type { MarketplacePosterAccount } from '@prisma/client';

const MARKETPLACE_CREATE_URL = 'https://www.facebook.com/marketplace/create/item';

export interface PostResult {
  remoteListingId: string;
  permalink?: string;
}

export interface PostInput {
  title: string;
  price: number;
  description: string;
  photoUrls: string[]; // Cloudinary URLs — downloaded and re-uploaded via the file input
  category?: string;
}

/**
 * Human-like pacing — never fixed-interval (a detection signal on its own).
 * Called by the cron/service layer between account actions, not inside a
 * single post's internal steps (those need their own shorter randomized waits,
 * added when the real form-fill flow is implemented against a live account).
 */
export function randomPacingDelayMs(): number {
  const MIN_MS = 8_000;
  const MAX_MS = 45_000;
  return MIN_MS + Math.floor(Math.random() * (MAX_MS - MIN_MS));
}

/** Load a pool account's saved Playwright storageState from its encrypted sessionCookie. */
function loadStorageState(account: MarketplacePosterAccount): Record<string, unknown> {
  const plaintext = decryptToken(account.sessionCookie);
  try {
    return JSON.parse(plaintext);
  } catch {
    throw new Error(
      `[marketplacePlaywrightClient] sessionCookie for account ${account.label} is not valid ` +
        'Playwright storageState JSON — re-register this account.'
    );
  }
}

/** Encrypt a freshly-exported Playwright storageState for storage (used by the admin register route). */
export function encryptStorageState(storageState: Record<string, unknown>): string {
  return encryptToken(JSON.stringify(storageState));
}

async function withBrowserContext<T>(
  account: MarketplacePosterAccount,
  fn: (context: BrowserContext) => Promise<T>
): Promise<T> {
  const storageState = loadStorageState(account) as any;
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState });
    try {
      return await fn(context);
    } finally {
      await context.close();
    }
  } finally {
    await browser?.close();
  }
}

/**
 * Post an item to Marketplace using the given pool account's saved session.
 *
 * NOT YET WIRED to the real Marketplace create-listing form — that requires
 * iterating against a live logged-in session (evidence-first debugging, same
 * standard as the rest of this codebase: real DOM selectors from a real page,
 * not guessed ones). Throws NotImplementedError until a real account exists
 * and this is built out against it. The queue/state machine around this call
 * is fully real and testable today with a mocked implementation of this
 * function (see marketplacePosterService.spec pattern).
 */
export async function postListing(
  account: MarketplacePosterAccount,
  _input: PostInput
): Promise<PostResult> {
  return withBrowserContext(account, async (_context) => {
    throw new Error(
      '[marketplacePlaywrightClient] postListing is not yet implemented against a live ' +
        'session — no MarketplacePosterAccount has been exercised against the real ' +
        'Marketplace create-listing UI yet. Build this out once Patrick has registered a ' +
        'real pool account (see ADR-083 "Flagged for Patrick"), reading the actual DOM at ' +
        'that time rather than guessing selectors now.'
    );
  });
}

/**
 * Remove a previously-posted listing using the given pool account's saved session.
 * Same not-yet-implemented status as postListing — see that function's comment.
 */
export async function removeListing(
  account: MarketplacePosterAccount,
  _remoteListingId: string
): Promise<void> {
  return withBrowserContext(account, async (_context) => {
    throw new Error(
      '[marketplacePlaywrightClient] removeListing is not yet implemented against a live ' +
        'session — see postListing() comment for why and what unblocks it.'
    );
  });
}
