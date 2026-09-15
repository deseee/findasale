/**
 * markdownPricePropagationService.ts — propagate a FindA.Sale price change to every
 * marketplace FindA.Sale has a real server-side write API for.
 *
 * ADR markdown-cycle-ebay-price-sync (2026-09-15), Decision #1 + #2, Dev Instructions
 * step 6: fires synchronously in markdownCycleCron.ts's per-item loop immediately after
 * each price-changing prisma.item.update, via Promise.allSettled across whichever
 * platform IDs are actually present on the item (eBay/Discogs/Reverb) so one platform's
 * failure never blocks another.
 *
 * Scope note (Patrick's Decision, Flagged Question #2 — "eBay ships first; Discogs/Reverb
 * is a fast-follow, not simultaneous"): eBay is wired for real below. Discogs and Reverb
 * are marked as explicit EXTENSION POINTS in the `handlers` array — their connector
 * functions (`updateDiscogsListingPrice` / `updateReverbListingPrice`) do not exist yet
 * (next-session-prompt.md Dispatch 3). Do NOT add a stub call for either here; when that
 * dispatch lands, add a handler entry below following pushToEbay's exact shape (own
 * try/catch, never throws, returns a MarketplacePropagationResult) — no restructuring of
 * this function should be needed.
 */
import { refreshEbayAccessToken } from './ebayHttp';
import { reviseEbayOfferPrice } from './ebayPriceRevisionService';

export type MarkdownPropagationPlatform = 'EBAY' | 'DISCOGS' | 'REVERB';

export interface MarkdownPropagationItem {
  id: string;
  organizerId: string;
  price: number;
  ebayOfferId?: string | null;
  // discogsListingId / reverbListingId are already on the Item model (schema.prisma) but
  // are not read here yet — no connector function exists to push to for either (see file
  // header). Wiring them in is a fast-follow, not this dispatch's scope.
}

export interface MarketplacePropagationResult {
  platform: MarkdownPropagationPlatform;
  ok: boolean;
  reason?: string;
  detail?: string;
}

async function pushToEbay(item: MarkdownPropagationItem): Promise<MarketplacePropagationResult> {
  try {
    const accessToken = await refreshEbayAccessToken(item.organizerId);
    if (!accessToken) {
      return { platform: 'EBAY', ok: false, reason: 'no-token' };
    }
    const result = await reviseEbayOfferPrice(item.ebayOfferId, item.price, accessToken);
    if (!result.ok) {
      console.warn(
        `[markdown-propagation] item ${item.id} eBay push failed: ${result.reason}${result.detail ? ` — ${result.detail}` : ''}`
      );
    }
    return { platform: 'EBAY', ok: result.ok, reason: result.reason, detail: result.detail };
  } catch (err) {
    console.error(`[markdown-propagation] item ${item.id} eBay push threw:`, (err as Error).message);
    return { platform: 'EBAY', ok: false, reason: 'threw', detail: (err as Error).message };
  }
}

/**
 * Extension-point registry: one entry per marketplace this function can push to, each
 * gated on whichever id the item actually carries. Add Discogs/Reverb entries here
 * (following pushToEbay's shape) once their connector functions exist — no other
 * change to this function should be required.
 */
function buildHandlers(item: MarkdownPropagationItem): Array<() => Promise<MarketplacePropagationResult>> {
  const handlers: Array<() => Promise<MarketplacePropagationResult>> = [];

  if (item.ebayOfferId) {
    handlers.push(() => pushToEbay(item));
  }

  // --- Discogs extension point (not wired — updateDiscogsListingPrice doesn't exist yet) ---
  // if (item.discogsListingId) handlers.push(() => pushToDiscogs(item));

  // --- Reverb extension point (not wired — updateReverbListingPrice doesn't exist yet) ---
  // if (item.reverbListingId) handlers.push(() => pushToReverb(item));

  return handlers;
}

/**
 * Propagate `item`'s current price to every marketplace it's live on, via
 * Promise.allSettled so one platform's failure/throw never blocks another. Each
 * individual handler already catches its own errors and never throws, but the settled
 * wrapper is kept as a last-resort safety net per the ADR's explicit instruction to use
 * Promise.allSettled here.
 */
export async function propagateMarkdownPriceToMarketplaces(
  item: MarkdownPropagationItem
): Promise<MarketplacePropagationResult[]> {
  const handlers = buildHandlers(item);
  if (handlers.length === 0) {
    return [];
  }

  const settled = await Promise.allSettled(handlers.map(h => h()));
  return settled.map(s => {
    if (s.status === 'fulfilled') {
      return s.value;
    }
    console.error(`[markdown-propagation] item ${item.id} a marketplace push handler threw unexpectedly:`, s.reason);
    return { platform: 'EBAY', ok: false, reason: 'threw', detail: String(s.reason) } as MarketplacePropagationResult;
  });
}
