/**
 * ebayLiveListingsService.ts -- eBay sync hardening (2026-10-01)
 *
 * Read-only helpers over the eBay Trading API GetMyeBaySelling ActiveList (the set of listings that
 * are live right now) and the Inventory API offer-by-SKU lookup. Used by:
 *   - ebayController.syncEndedListingsForOrganizer (relist adoption)
 *   - ebaySoldSyncCron / ebaySaleReopenService (is the listing live before an item is reopened)
 *   - ebayReconciliationCron (nightly FindA vs eBay comparison)
 * Never writes to eBay or the database.
 */

import { ebayProxyUrl, ebayProxyHeaders, ebayUserHeaders } from './ebayHttp';
import { trackEbayCall } from '../lib/ebayRateLimiter';

export interface LiveEbayListing {
  itemId: string; // eBay ItemID (== Item.ebayListingId)
  sku: string | null;
  title: string | null;
  quantity: number | null; // total listed quantity
  quantityAvailable: number | null;
}

function xmlVal(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}
function xmlAll(block: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) results.push(m[1]);
  return results;
}
const decodeXml = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const toInt = (v: string | null): number | null => {
  if (v === null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * The FindA item id carried by a live listing's SKU: "FAS-<id>" or "FAS-<id> 2026-07-16 ..." -> "<id>".
 * Returns null for non-FAS SKUs.
 */
export function itemIdFromFasSku(sku: string | null | undefined): string | null {
  if (!sku || !sku.startsWith('FAS-')) return null;
  const id = sku.substring(4).split(/\s+/)[0];
  return id || null;
}

/**
 * Fetch every live (ActiveList) listing for the connected seller, paginated (200 per page).
 * Returns { listings, complete }. complete=false means a page failed, so callers MUST NOT treat
 * absence from `listings` as proof a listing is not live.
 */
export async function fetchLiveEbayListings(
  accessToken: string
): Promise<{ listings: LiveEbayListing[]; complete: boolean }> {
  const listings: LiveEbayListing[] = [];
  let page = 1;
  let totalPages = 1;
  let complete = true;
  const MAX_PAGES = 50; // hard stop: 10,000 listings

  while (page <= totalPages && page <= MAX_PAGES) {
    const xml =
      `<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<RequesterCredentials></RequesterCredentials>` +
      `<OutputSelector>ActiveList.ItemArray.Item.ItemID</OutputSelector>` +
      `<OutputSelector>ActiveList.ItemArray.Item.SKU</OutputSelector>` +
      `<OutputSelector>ActiveList.ItemArray.Item.Title</OutputSelector>` +
      `<OutputSelector>ActiveList.ItemArray.Item.Quantity</OutputSelector>` +
      `<OutputSelector>ActiveList.ItemArray.Item.QuantityAvailable</OutputSelector>` +
      `<OutputSelector>ActiveList.PaginationResult</OutputSelector>` +
      `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>` +
      `</GetMyeBaySellingRequest>`;
    try {
      const resp = await fetch(ebayProxyUrl('/ws/api.dll'), {
        method: 'POST',
        headers: {
          'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
          'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID || '',
          'X-EBAY-API-IAF-TOKEN': accessToken,
          'Content-Type': 'text/xml',
          ...ebayProxyHeaders(),
        },
        body: xml,
      });
      trackEbayCall();
      const text = await resp.text();
      const ack = xmlVal(text, 'Ack');
      if (!resp.ok || (ack !== 'Success' && ack !== 'Warning')) {
        console.warn(`[eBay Live] GetMyeBaySelling page ${page} failed: HTTP ${resp.status} ack=${ack}`);
        complete = false;
        break;
      }
      const tp = toInt(xmlVal(text, 'TotalNumberOfPages'));
      if (tp) totalPages = tp;
      const activeBlock = text.match(/<ActiveList>([\s\S]*?)<\/ActiveList>/)?.[1] || '';
      for (const block of xmlAll(activeBlock, 'Item')) {
        const itemId = xmlVal(block, 'ItemID');
        if (!itemId) continue;
        const sku = xmlVal(block, 'SKU');
        const title = xmlVal(block, 'Title');
        listings.push({
          itemId,
          sku: sku ? decodeXml(sku) : null,
          title: title ? decodeXml(title) : null,
          quantity: toInt(xmlVal(block, 'Quantity')),
          quantityAvailable: toInt(xmlVal(block, 'QuantityAvailable')),
        });
      }
    } catch (err: any) {
      console.warn(`[eBay Live] GetMyeBaySelling page ${page} error:`, err?.message);
      complete = false;
      break;
    }
    page++;
  }
  if (page <= totalPages) complete = false; // stopped by MAX_PAGES or an error
  return { listings, complete };
}

/**
 * Read the Inventory API offer for a SKU (read-only). Returns the offerId whose listing is `listingId`
 * when given, else the first offer. null when none can be read (legacy / unmanaged listings have no offer).
 */
export async function lookupOfferIdForSku(
  accessToken: string,
  sku: string,
  listingId?: string
): Promise<string | null> {
  try {
    const res = await fetch(
      ebayProxyUrl(encodeURIComponent(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`)),
      { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
    );
    trackEbayCall();
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const offers: any[] = data?.offers || [];
    if (listingId) {
      const hit = offers.find((o) => o?.listing?.listingId === listingId);
      if (hit?.offerId) return hit.offerId as string;
      return null; // an offer for a different (stale / unpublished) listing must not be adopted
    }
    return offers[0]?.offerId ?? null;
  } catch (err: any) {
    console.warn(`[eBay Live] offer lookup for sku "${sku}" failed:`, err?.message);
    return null;
  }
}

/**
 * Trading API GetItem -> { status, quantitySold } for one ItemID (read-only). status is eBay's
 * ListingStatus (Active | Ended | Completed | ...), null when it could not be read.
 */
export async function fetchEbayListingStatus(
  accessToken: string,
  ebayItemId: string
): Promise<{ status: string | null; quantitySold: number | null }> {
  try {
    const resp = await fetch(ebayProxyUrl('/ws/api.dll'), {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'GetItem',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID || '',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml',
        ...ebayProxyHeaders(),
      },
      body:
        `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
        `<ItemID>${ebayItemId}</ItemID><OutputSelector>ListingStatus</OutputSelector><OutputSelector>SellingStatus</OutputSelector></GetItemRequest>`,
    });
    trackEbayCall();
    if (!resp.ok) return { status: null, quantitySold: null };
    const text = await resp.text();
    const ack = xmlVal(text, 'Ack');
    if (ack !== 'Success' && ack !== 'Warning') return { status: null, quantitySold: null };
    return { status: xmlVal(text, 'ListingStatus'), quantitySold: toInt(xmlVal(text, 'QuantitySold')) };
  } catch {
    return { status: null, quantitySold: null };
  }
}
