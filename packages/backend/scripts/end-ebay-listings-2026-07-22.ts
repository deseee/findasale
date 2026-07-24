// One-off follow-up to reconcile-2026-07-22-pos-sale.ts.
//
// REWRITE 2: the real production `endEbayListingIfExists` (ebayController.ts) has
// been patched this session (S1157 fix) to recover a stale-missing ebayOfferId by
// looking the offer up on eBay by SKU when ebayListingId is set but ebayOfferId is
// null -- this is exactly the state all 3 of these items were found in (genuinely
// still live on eBay, but the locally-tracked offerId needed to withdraw them was
// lost at some point, likely via the stale-category delete+recreate path never
// completing a follow-up republish). This script mirrors that same fixed logic,
// inline, using the known-good fresh Prisma client (packages/database's, not the
// backend's broken ambient one -- see REWRITE 1 note below) since importing
// ebayController.ts directly still isn't possible from a standalone script.
//
// REWRITE 1 (kept for context): the first version imported the real
// endEbayListingIfExists directly, which imports the backend's own ambient
// PrismaClient -- the same broken pnpm-junctioned client that's been unreliable
// all session. That failed at construction time before any logic ran. This
// version uses ONLY the fresh packages/database/node_modules/@prisma/client.
//
// Requires EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_PROXY_SECRET in the
// environment (not in packages/backend/.env locally -- pass via $env: alongside
// DATABASE_URL, same as before).
//
// Run from packages/backend:
//   npx tsx scripts/end-ebay-listings-2026-07-22.ts

import { PrismaClient } from '../../database/node_modules/@prisma/client';

const prisma = new PrismaClient();

const ITEM_IDS = [
  'cmo3esm950009jqsu66xrvh7c', // Moon Knight #12 Newsstand Variant
  'cmo3esng8000djqsutud3v3sx', // Spawn #5
  'cmo3etnjh0055jqsuof67w01w', // Moon Knight #11 Newsstand Variant
];

// The SKU lookup via buildCustomLabel() returned 404/25713 "This Offer is not
// available" even after correcting the SKU to the real value read off each
// eBay page. Root cause found: these 3 listings are old enough (Jul/Sep 2025)
// that they were never represented as Inventory API "offer" objects at all --
// they exist purely as classic Trading API listings. The modern
// /sell/inventory/v1/offer endpoints (used by buildCustomLabel-based lookup
// and the normal withdraw flow) can only ever see offers created through the
// Inventory API, so no SKU value -- correct or not -- will ever resolve an
// offerId for these 3. Confirmed via GetItem/EndedSync elsewhere in this same
// file already using the Trading API (/ws/api.dll, X-EBAY-API-IAF-TOKEN) for
// exactly this class of legacy listing.
//
// Fix for these 3: end them directly via Trading API EndFixedPriceItem using
// their real numeric eBay ItemIDs (read off each "View on eBay" link), instead
// of going through the Inventory API offer/withdraw path at all.
const TRADING_API_ITEM_IDS: Record<string, string> = {
  'cmo3esm950009jqsu66xrvh7c': '136164799934', // Moon Knight #12
  'cmo3esng8000djqsutud3v3sx': '136471635370', // Spawn #5
  'cmo3etnjh0055jqsuof67w01w': '136164361001', // Moon Knight #11
};

function xmlVal(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}

async function endViaTradingApi(itemId: string, ebayItemId: string, accessToken: string): Promise<void> {
  const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${ebayItemId}</ItemID>
  <EndingReason>NotAvailable</EndingReason>
</EndFixedPriceItemRequest>`;

  const response = await fetch(ebayProxyUrl('/ws/api.dll'), {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'EndFixedPriceItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID || '',
      'X-EBAY-API-IAF-TOKEN': accessToken,
      'Content-Type': 'text/xml',
      ...ebayProxyHeaders(),
    },
    body: requestXml,
  });

  const text = await response.text();
  const ack = xmlVal(text, 'Ack');
  if (ack === 'Success' || ack === 'Warning') {
    console.log(`[eBay Trading API] Successfully ended eBay ItemID ${ebayItemId} (item ${itemId})${ack === 'Warning' ? ' (with warning -- see raw response if needed)' : ''}`);
  } else {
    const errMsg = xmlVal(text, 'LongMessage') || xmlVal(text, 'ShortMessage') || 'Unknown error';
    console.error(`[eBay Trading API] Failed to end eBay ItemID ${ebayItemId} (item ${itemId}): ${ack} -- ${errMsg}`);
  }
}

// Force the real production frontend URL regardless of local FRONTEND_URL --
// this script intentionally targets production data (DATABASE_URL points at
// Railway), so the eBay proxy must be the real one too. Deferring to
// process.env.FRONTEND_URL was the bug in the previous run: locally that's
// http://localhost:3000 (dev server, not running), causing ECONNREFUSED.
const ebayProxyUrl = (path: string): string =>
  `https://finda.sale/api/proxy/ebay?path=${path}`;

const ebayProxyHeaders = (): Record<string, string> => {
  const secret = process.env.EBAY_PROXY_SECRET;
  return secret ? { 'X-Proxy-Secret': secret } : {};
};

const ebayUserHeaders = (accessToken: string): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  'Accept-Language': 'en-US',
  'Content-Language': 'en-US',
});

// Verbatim copy of ebayController.ts's buildCustomLabel (pure function, no
// Prisma/import dependency -- safe to duplicate here rather than import).
function buildCustomLabel(
  itemId: string,
  organizer: { skuAppendDate?: boolean; skuAppendCost?: boolean; skuAppendLocation?: boolean },
  item: { createdAt?: Date | null; costBasis?: number | null; roomTag?: string | null }
): string {
  const parts: string[] = [`FAS-${itemId}`];
  if (organizer.skuAppendDate && item.createdAt) {
    parts.push(item.createdAt.toISOString().slice(0, 10));
  }
  if (organizer.skuAppendCost && item.costBasis != null) {
    parts.push(`$${item.costBasis.toFixed(2)}`);
  }
  if (organizer.skuAppendLocation && item.roomTag) {
    parts.push(item.roomTag);
  }
  return parts.join(' ');
}

async function refreshEbayAccessToken(organizerId: string): Promise<string | null> {
  const connection = await prisma.ebayConnection.findUnique({ where: { organizerId } });
  if (!connection) {
    console.warn(`[eBay] No connection found for organizer ${organizerId}`);
    return null;
  }

  const now = new Date();
  const expiresIn = (connection.tokenExpiresAt.getTime() - now.getTime()) / 1000;
  if (expiresIn > 300) {
    return connection.accessToken;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[eBay] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured');
    return null;
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: connection.refreshToken,
  });
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(ebayProxyUrl('/identity/v1/oauth2/token'), {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...ebayProxyHeaders(),
    },
    body: params.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorMsg = `Token refresh failed: ${response.status}`;
    console.error(`[eBay] ${errorMsg}`);
    await prisma.ebayConnection.update({
      where: { organizerId },
      data: { lastErrorAt: new Date(), lastErrorMessage: errorMsg },
    });
    return null;
  }

  const data = (await response.json()) as any;
  const newAccessToken = data.access_token;
  const newRefreshToken = data.refresh_token || connection.refreshToken;
  const newExpiresIn = data.expires_in || 7200;

  await prisma.ebayConnection.update({
    where: { organizerId },
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenExpiresAt: new Date(Date.now() + newExpiresIn * 1000),
      lastRefreshedAt: new Date(),
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });

  return newAccessToken;
}

// Mirrors the now-fixed production endEbayListingIfExists, including the S1157
// SKU-fallback recovery for a stale-missing ebayOfferId.
async function endEbayListingIfExists(itemId: string): Promise<void> {
  try {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        ebayOfferId: true,
        ebayListingId: true,
        saleId: true,
        createdAt: true,
        costBasis: true,
        roomTag: true,
        title: true,
      },
    });

    if (!item) {
      console.warn(`[eBay] Item ${itemId} not found`);
      return;
    }

    let offerId: string | null = item.ebayOfferId;

    if (!offerId && item.ebayListingId && item.saleId) {
      const saleForOrganizer = await prisma.sale.findUnique({
        where: { id: item.saleId },
        select: { organizerId: true },
      });
      const organizerForSku = saleForOrganizer
        ? await prisma.organizer.findUnique({
            where: { id: saleForOrganizer.organizerId },
            select: { skuAppendDate: true, skuAppendCost: true, skuAppendLocation: true },
          })
        : null;

      if (saleForOrganizer && organizerForSku) {
        const accessTokenForLookup = await refreshEbayAccessToken(saleForOrganizer.organizerId);
        if (accessTokenForLookup) {
          const sku = buildCustomLabel(itemId, organizerForSku, item);
          try {
            const getOfferRes = await fetch(
              ebayProxyUrl(encodeURIComponent(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`)),
              { headers: { ...ebayUserHeaders(accessTokenForLookup), ...ebayProxyHeaders() } }
            );
            if (getOfferRes.ok) {
              const getOfferData = (await getOfferRes.json()) as any;
              const existing = getOfferData.offers?.[0];
              if (existing?.offerId) {
                offerId = existing.offerId;
                await prisma.item.update({ where: { id: itemId }, data: { ebayOfferId: offerId } });
                console.log(`[eBay] Recovered ebayOfferId for item ${itemId} via SKU lookup (sku=${sku}) -> ${offerId}`);
              } else {
                console.warn(`[eBay] SKU lookup for item ${itemId} (sku=${sku}) returned no offers`);
              }
            } else {
              const body = await getOfferRes.text().catch(() => '(unreadable)');
              console.warn(`[eBay] SKU lookup failed for item ${itemId} (sku=${sku}): ${getOfferRes.status} ${body}`);
            }
          } catch (lookupErr) {
            console.warn(`[eBay] SKU lookup error for item ${itemId}:`, lookupErr);
          }
        }
      }
    }

    if (!offerId) {
      console.log(`[eBay] Item ${itemId} ("${item.title}") has no resolvable ebayOfferId -- nothing to withdraw.`);
      return;
    }

    if (!item.saleId) {
      console.warn(`[eBay] Item ${itemId} has no saleId -- skipping`);
      return;
    }

    const sale = await prisma.sale.findUnique({ where: { id: item.saleId }, select: { organizerId: true } });
    if (!sale) {
      console.warn(`[eBay] Sale ${item.saleId} not found for item ${itemId}`);
      return;
    }

    const accessToken = await refreshEbayAccessToken(sale.organizerId);
    if (!accessToken) {
      console.error(`[eBay] Could not get access token to withdraw offer for item ${itemId}`);
      return;
    }

    const response = await fetch(
      ebayProxyUrl(encodeURIComponent(`/sell/inventory/v1/offer/${offerId}/withdraw`)),
      {
        method: 'POST',
        headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
        body: '{}',
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[eBay] Failed to withdraw offer ${offerId} for item ${itemId} ("${item.title}"): ${response.status} ${errorData}`);
      return;
    }

    console.log(`[eBay] Successfully withdrew offer ${offerId} for item ${itemId} ("${item.title}")`);
  } catch (error) {
    console.error(`[eBay] Error withdrawing eBay listing for item ${itemId}:`, error);
  }
}

async function main() {
  for (const id of ITEM_IDS) {
    console.log(`--- ${id} ---`);

    const ebayItemId = TRADING_API_ITEM_IDS[id];
    if (ebayItemId) {
      const item = await prisma.item.findUnique({ where: { id }, select: { saleId: true } });
      const sale = item?.saleId ? await prisma.sale.findUnique({ where: { id: item.saleId }, select: { organizerId: true } }) : null;
      if (!sale) {
        console.error(`[eBay] Could not resolve organizer for item ${id} -- skipping Trading API end call`);
        continue;
      }
      const accessToken = await refreshEbayAccessToken(sale.organizerId);
      if (!accessToken) {
        console.error(`[eBay] Could not get access token for item ${id} -- skipping Trading API end call`);
        continue;
      }
      await endViaTradingApi(id, ebayItemId, accessToken);
      continue;
    }

    await endEbayListingIfExists(id);
  }
  console.log('\nAll done — see per-item log lines above for success/no-op/error.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
