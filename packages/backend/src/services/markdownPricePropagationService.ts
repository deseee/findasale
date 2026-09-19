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
 * Scope note (Patrick's Decision, Flagged Question #2 -- "eBay ships first; Discogs/Reverb
 * is a fast-follow, not simultaneous"): eBay is wired for real below. Discogs and Reverb
 * (Dispatch 3, 2026-09-15) are now wired too, following pushToEbay's exact shape (own
 * try/catch, never throws, returns a MarketplacePropagationResult) via
 * updateDiscogsListingPrice (discogsListingConnector.ts) and updateReverbListingPrice
 * (reverbConnector.ts) -- no restructuring of this function was needed, per the file's
 * own original instruction.
 */
import { refreshEbayAccessToken } from './ebayHttp';
import { reviseEbayOfferPrice } from './ebayPriceRevisionService';
import { updateDiscogsListingPrice } from './marketplace/discogsListingConnector';
import { updateReverbListingPrice } from './marketplace/reverbConnector';

export type MarkdownPropagationPlatform = 'EBAY' | 'DISCOGS' | 'REVERB';

export interface MarkdownPropagationItem {
  id: string;
  organizerId: string;
  price: number;
  ebayOfferId?: string | null;
  ebayListingId?: string | null;
  discogsListingId?: string | null;
  reverbListingId?: string | null;
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
    // itemId passed (2026-09-19) so a category-aspect repair retry inside
    // reviseEbayOfferPrice can call reanalyzeItem for this specific item.
    const result = await reviseEbayOfferPrice(item.ebayOfferId, item.price, accessToken, item.ebayListingId, item.id);
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

async function pushToDiscogs(item: MarkdownPropagationItem): Promise<MarketplacePropagationResult> {
  try {
    const result = await updateDiscogsListingPrice(item.organizerId, item.discogsListingId as string, item.price);
    if (!result.ok) {
      console.warn(
        `[markdown-propagation] item ${item.id} Discogs push failed: ${result.reason}${result.detail ? ` — ${result.detail}` : ''}`
      );
    }
    return { platform: 'DISCOGS', ok: result.ok, reason: result.reason, detail: result.detail };
  } catch (err) {
    console.error(`[markdown-propagation] item ${item.id} Discogs push threw:`, (err as Error).message);
    return { platform: 'DISCOGS', ok: false, reason: 'threw', detail: (err as Error).message };
  }
}

async function pushToReverb(item: MarkdownPropagationItem): Promise<MarketplacePropagationResult> {
  try {
    const result = await updateReverbListingPrice(item.organizerId, item.reverbListingId as string, item.price);
    if (!result.ok) {
      console.warn(
        `[markdown-propagation] item ${item.id} Reverb push failed: ${result.reason}${result.detail ? ` — ${result.detail}` : ''}`
      );
    }
    return { platform: 'REVERB', ok: result.ok, reason: result.reason, detail: result.detail };
  } catch (err) {
    console.error(`[markdown-propagation] item ${item.id} Reverb push threw:`, (err as Error).message);
    return { platform: 'REVERB', ok: false, reason: 'threw', detail: (err as Error).message };
  }
}

/**
 * Extension-point registry: one entry per marketplace this function can push to, each
 * gated on whichever id the item actually carries. eBay/Discogs/Reverb are all wired as
 * of Dispatch 3 (2026-09-15) -- any future marketplace follows the same shape (own
 * try/catch push* function above, gated entry below).
 */
function buildHandlers(item: MarkdownPropagationItem): Array<() => Promise<MarketplacePropagationResult>> {
  const handlers: Array<() => Promise<MarketplacePropagationResult>> = [];

  if (item.ebayOfferId || item.ebayListingId) {
    // Gate widened 2026-09-18: an item can be eBay-live via the legacy Trading-API path
    // (ebayListingId set, ebayOfferId null -- April 2026 batch listings imported via
    // GetItem/GetMyeBaySelling, before FindA.Sale's Inventory-API push flow existed).
    // reviseEbayOfferPrice() (called by pushToEbay below) already has a correct legacy
    // fallback keyed on ebayListingId -- it was just never reached because this gate used
    // to require ebayOfferId alone, silently skipping every legacy item's markdown push.
    handlers.push(() => pushToEbay(item));
  }

  if (item.discogsListingId) {
    handlers.push(() => pushToDiscogs(item));
  }

  if (item.reverbListingId) {
    handlers.push(() => pushToReverb(item));
  }

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
