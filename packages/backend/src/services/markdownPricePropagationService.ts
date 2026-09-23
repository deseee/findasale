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

/**
 * ADR-128 (2026-09-19) -- eBay price-sync failure handling. The `reason` vocabulary above
 * collapses two radically different situations into one string: failures a retry can clear
 * (throttling, a lapsed token, a network blip, an eBay-side 5xx) and failures no retry will
 * ever clear (eBay evaluated the write and rejected the listing's content, or there is no
 * eBay offer to revise at all). Classifying them HERE -- at the propagation boundary, where
 * the reason and detail already exist -- is what lets ebayListingSyncCron.ts stop burning a
 * 4-hourly eBay API call on an item that can never succeed, and lets the organizer be told
 * once, with eBay's actual message, instead of every day forever.
 */
export type EbaySyncFailureClass = 'retryable' | 'terminal';

/**
 * Pull eBay's HTTP status out of a MarketplacePropagationResult.detail.
 *
 * reviseEbayOfferPrice() formats failure details as `HTTP <status> <first 200-600 chars of body>`,
 * but that body slice can itself contain the token "HTTP", and the legacy Trading-API path
 * produces details with no status in them at all (`<Ack>:<LongMessage>`, or a raw exception
 * message). So: prefer a status anchored at the very start of the detail, fall back to the
 * first one found anywhere, and return null when there is genuinely no status to read --
 * callers treat null as "cannot tell", which ADR-128 requires to mean retryable.
 */
function parseHttpStatusFromDetail(detail?: string | null): number | null {
  if (!detail) return null;
  const match = /^\s*HTTP\s+(\d{3})\b/.exec(detail) ?? /\bHTTP\s+(\d{3})\b/.exec(detail);
  if (!match) return null;
  const status = Number(match[1]);
  return Number.isInteger(status) ? status : null;
}

/**
 * Classify a failed MarketplacePropagationResult as retryable or terminal (ADR-128,
 * Decision #3 + #4). Scoped to the eBay reason vocabulary defined by
 * EbayPriceRevisionResult in ebayPriceRevisionService.ts plus the two this file adds
 * itself ('no-token' in pushToEbay, 'threw' in its catch blocks).
 *
 * The hard rule from the ADR: when the reason or the HTTP status cannot be read with
 * confidence, return 'retryable'. Nothing is ever silently marked terminal -- a wrong
 * 'retryable' costs one wasted API call every 4h, a wrong 'terminal' silently strands the
 * organizer's price change forever.
 */
export function classifyPropagationFailure(
  reason: string | null | undefined,
  detail?: string | null
): EbaySyncFailureClass {
  switch (reason) {
    // Throttling / auth / transport: the push never reached a verdict on the listing's
    // content, so nothing about the listing needs fixing. Retrying is the right move --
    // 'no-token' clears when the organizer reconnects eBay, the rest clear on their own.
    case 'rate-limited':
    case 'no-token':
    case 'error':
    case 'threw':
      return 'retryable';

    // No Offer object AND no legacy ItemID -- there is nothing on eBay to revise. This will
    // be just as true in 4 hours and in 4 months; retrying is a guaranteed no-op forever.
    case 'no-offer-id':
      return 'terminal';

    // A write eBay actually evaluated and rejected. A 4xx other than 429 is a listing-content
    // error -- unsupported aspect value, missing item specific, price below eBay's floor,
    // invalid shipping type -- and only the organizer editing the listing can clear it.
    // 429 (throttled) and 5xx (eBay-side) are transient and stay retryable.
    // NOTE (2026-09-23 port): reviseEbayOfferPrice() now runs its own Best-Offer-threshold and
    // category-aspect auto-repair retries before returning 'put-failed', so a 4xx that reaches
    // this point has already survived one automatic repair attempt.
    case 'put-failed':
    case 'legacy-revise-failed': {
      const status = parseHttpStatusFromDetail(detail);
      if (status === null) return 'retryable'; // unreadable detail -- never guess terminal
      // 401 = the token lapsed mid-run and 408 = eBay timed out the request: neither is a
      // verdict on the listing's content, so both stay retryable (same bucket as 'no-token' /
      // 'error' above) rather than being wrongly stranded as terminal.
      if (status === 401 || status === 408 || status === 429 || status >= 500) return 'retryable';
      if (status >= 400) return 'terminal';
      return 'retryable';
    }

    // Deliberately NOT terminal on a 4xx. ADR-128's table only commits `get-failed` 5xx to
    // "retry helps", and this failure is a READ of the offer -- not eBay's verdict on the
    // price we tried to write. Treating a 404 here as terminal would strand items whose
    // offer id is merely stale, so it stays retryable per the ADR's never-guess-terminal rule.
    case 'get-failed':
      return 'retryable';

    // An unset reason, or a vocabulary this function has not been taught (a future
    // marketplace connector's). Retryable by construction, same rule as above.
    default:
      return 'retryable';
  }
}

/**
 * ADR-128 Decision #4 ("backoff + cap") -- the cap half. A content 4xx from eBay only becomes
 * FAILED_TERMINAL after this many CONSECUTIVE failed pushes (Item.ebaySyncAttempts, which is
 * reset to 0 on every confirmed sync). Added 2026-09-23 because reviseEbayOfferPrice()'s
 * auto-repair (25129 aspect values, 25101/25002 packageType/aspects, category-aspect
 * injection) often needs more than one sync cycle to converge: an aspect fixed on cycle N
 * only takes effect on eBay by cycle N+1. Terminal-on-first-4xx stranded exactly those items.
 */
export const TERMINAL_AFTER_ATTEMPTS = 3;

/**
 * Map a pure classification plus the consecutive-failure count (INCLUDING the failure being
 * recorded now) to the ebaySyncState to persist. classifyPropagationFailure() stays pure --
 * it answers "can a retry ever fix this kind of failure?"; this decides "have we given the
 * auto-repair loop enough cycles yet?". 'no-offer-id' stays immediately terminal: there is
 * nothing on eBay to revise, and no repair loop touches that case.
 */
export function resolveSyncStateAfterFailure(
  failureClass: EbaySyncFailureClass,
  attemptsAfterThisFailure: number,
  reason?: string | null
): 'FAILED_TERMINAL' | 'FAILED_RETRYABLE' {
  if (failureClass !== 'terminal') return 'FAILED_RETRYABLE';
  if (reason === 'no-offer-id') return 'FAILED_TERMINAL';
  return attemptsAfterThisFailure >= TERMINAL_AFTER_ATTEMPTS ? 'FAILED_TERMINAL' : 'FAILED_RETRYABLE';
}

/**
 * Build the string stored in Item.ebaySyncFailureReason. ADR-128, Decision #2 is explicit
 * that this column holds "the real eBay error text, not a category", because Decision #5's
 * one-time terminal alert has to be able to say "Size aspect value not supported" rather
 * than "sync failed" -- so the machine-readable reason and eBay's own detail are kept
 * together. Capped so one oversized eBay error body cannot bloat the Item row.
 */
export function formatPropagationFailureReason(
  reason: string | null | undefined,
  detail?: string | null
): string {
  const head = reason ?? 'unknown';
  const full = detail ? `${head} — ${detail}` : head;
  return full.slice(0, 500);
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
