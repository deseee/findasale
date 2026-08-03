// One-time recovery script for the 2 items found stuck mid-publish by
// ebay-offer-vs-listing-gap.mjs (Artifact organizer, cmnxueoas0005tfv8brnc0kky):
//   id=cmr3qfir2000d13dy3ppkn3rl offerId=214725880011 "Q12E Chromatic Guitar Tuner..."
//   id=cmsaozd8600vnjgvqfajiohfm offerId=221915356011 "Vivitar 2500 Zoom Thyristor..."
//
// SAFETY: this script NEVER calls "create offer" (POST /sell/inventory/v1/offer).
// It only ever calls "publish" (POST /sell/inventory/v1/offer/{offerId}/publish)
// against the ebayOfferId ALREADY stored on each item. Re-calling create-offer on
// an item that already has an offer is the classic eBay Inventory API footgun --
// eBay throws a duplicate-offer error and makes the situation worse. This script
// hard-fails instead of ever attempting that.
//
// Run from packages/database with DATABASE_URL set to the Railway production URL,
// AND with EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_PROXY_SECRET / FRONTEND_URL
// set the same way the backend has them configured on Railway (same envs
// refreshEbayAccessToken() in packages/backend/src/services/ebayHttp.ts uses).
//
//   node ../../scripts/patrick-queries/recover-stuck-ebay-offers.mjs
//
// This makes REAL calls to the live eBay API when you run it. It does not touch
// Stripe, does not touch money, and only ever mutates the 2 hardcoded items below.

import { PrismaClient } from '../../packages/database/node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const EBAY_PROXY_SECRET = process.env.EBAY_PROXY_SECRET;
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;

// The 2 items identified by the diagnostic script. Intentionally hardcoded --
// this is a one-time recovery script, not a general-purpose tool. Do not widen
// this list without re-running the diagnostic to confirm the item still needs it.
const TARGET_ITEM_IDS = [
  'cmr3qfir2000d13dy3ppkn3rl', // offerId 214725880011, "Q12E Chromatic Guitar Tuner..."
  'cmsaozd8600vnjgvqfajiohfm', // offerId 221915356011, "Vivitar 2500 Zoom Thyristor..."
];

function ebayProxyUrl(path) {
  return `${FRONTEND_URL}/api/proxy/ebay?path=${path}`;
}

function ebayProxyHeaders() {
  return EBAY_PROXY_SECRET ? { 'X-Proxy-Secret': EBAY_PROXY_SECRET } : {};
}

function ebayUserHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept-Language': 'en-US',
    'Content-Language': 'en-US',
  };
}

// Mirrors refreshEbayAccessToken() in packages/backend/src/services/ebayHttp.ts.
// Duplicated (not imported) because this is a standalone .mjs script run directly
// with `node`, not through the backend's TypeScript build -- same rationale
// ebayListingQueueCron.ts documents for mirroring these helpers instead of
// importing across a module boundary that isn't available here.
async function refreshAccessToken(connection) {
  const now = new Date();
  const expiresIn = (new Date(connection.tokenExpiresAt).getTime() - now.getTime()) / 1000;
  if (expiresIn > 300) {
    return connection.accessToken;
  }

  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    throw new Error('EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set in environment');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: connection.refreshToken,
  });
  const credentials = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(ebayProxyUrl(encodeURIComponent('/identity/v1/oauth2/token')), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
      ...ebayProxyHeaders(),
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Token refresh failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data?.access_token) throw new Error('Token refresh response had no access_token');

  // Persist the refreshed token so a follow-up run (or the app) doesn't re-refresh
  // unnecessarily. Mirrors what refreshEbayAccessToken() does in the backend.
  await prisma.ebayConnection.update({
    where: { organizerId: connection.organizerId },
    data: {
      accessToken: data.access_token,
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 7200) * 1000),
    },
  });

  return data.access_token;
}

// Only ever calls the publish endpoint on an EXISTING offerId. Never creates one.
async function publishExistingOffer(offerId, accessToken) {
  const publishRes = await fetch(
    ebayProxyUrl(encodeURIComponent(`/sell/inventory/v1/offer/${offerId}/publish`)),
    {
      method: 'POST',
      headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
      body: '{}',
    }
  );

  if (publishRes.ok) {
    const data = await publishRes.json().catch(() => ({}));
    let listingId = data?.listingId ?? null;
    if (!listingId) {
      // Same recovery-GET pattern as attemptPublish() in ebayPublishService.ts:
      // eBay can confirm the publish (HTTP ok) without echoing listingId in the body.
      const getRes = await fetch(
        ebayProxyUrl(encodeURIComponent(`/sell/inventory/v1/offer/${offerId}`)),
        { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
      );
      if (getRes.ok) {
        const offerData = await getRes.json().catch(() => ({}));
        listingId = offerData?.listing?.listingId ?? offerData?.listingId ?? null;
      }
    }
    return { ok: true, listingId };
  }

  const errorBody = await publishRes.text().catch(() => '');
  return { ok: false, status: publishRes.status, errorBody };
}

async function main() {
  if (!EBAY_PROXY_SECRET) {
    console.warn('WARNING: EBAY_PROXY_SECRET not set — proxy calls may be rejected.');
  }

  for (const itemId of TARGET_ITEM_IDS) {
    console.log(`\n=== Item ${itemId} ===`);

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        title: true,
        ebayOfferId: true,
        ebayListingId: true,
        ebayListedAt: true,
        draftStatus: true,
        saleId: true,
      },
    });

    if (!item) {
      console.error(`  SKIP: item not found`);
      continue;
    }

    console.log(`  title="${item.title}" ebayOfferId=${item.ebayOfferId} ebayListingId=${item.ebayListingId}`);

    if (item.ebayListingId) {
      console.log(`  SKIP: already has ebayListingId=${item.ebayListingId} — nothing to recover.`);
      continue;
    }

    if (!item.ebayOfferId) {
      console.error(`  SKIP: item has no ebayOfferId — this is NOT the stuck-mid-publish case this script handles. Do not create a new offer here manually; investigate separately.`);
      continue;
    }

    if (!item.saleId) {
      console.error(`  SKIP: item has no saleId — cannot resolve organizer/eBay connection.`);
      continue;
    }

    const sale = await prisma.sale.findUnique({
      where: { id: item.saleId },
      select: { organizerId: true },
    });
    if (!sale) {
      console.error(`  SKIP: sale ${item.saleId} not found.`);
      continue;
    }

    const connection = await prisma.ebayConnection.findUnique({
      where: { organizerId: sale.organizerId },
    });
    if (!connection) {
      console.error(`  SKIP: organizer ${sale.organizerId} has no eBay connection.`);
      continue;
    }

    let accessToken;
    try {
      accessToken = await refreshAccessToken(connection);
    } catch (err) {
      console.error(`  FAIL: could not get access token: ${err.message}`);
      continue;
    }

    console.log(`  Publishing existing offer ${item.ebayOfferId} (NOT creating a new one)...`);
    const result = await publishExistingOffer(item.ebayOfferId, accessToken);

    if (result.ok && result.listingId) {
      await prisma.item.update({
        where: { id: item.id },
        data: {
          ebayListingId: result.listingId,
          listedOnEbayAt: new Date(),
          ebayListedAt: item.ebayListedAt ?? new Date(),
          ebayNeedsReview: false,
          ...(item.draftStatus !== 'PUBLISHED' ? { draftStatus: 'PUBLISHED' } : {}),
        },
      });
      console.log(`  SUCCESS: listingId=${result.listingId} — https://www.ebay.com/itm/${result.listingId}`);
    } else if (result.ok && !result.listingId) {
      console.error(`  INCONCLUSIVE: eBay returned HTTP ok but no listingId could be recovered (even via follow-up GET). Item NOT updated. Check Railway logs / eBay Seller Hub for offer ${item.ebayOfferId} before retrying.`);
    } else {
      console.error(`  FAILED: HTTP ${result.status} — ${result.errorBody.slice(0, 500)}`);
      console.error(`  This offer still won't publish via a plain retry. Next step: open this item in the FindA.Sale item editor and use the in-app "Publish now" button, which runs the full self-heal loop (handles eBay error 25005/25021/25101/25002 automatically). If it still fails there, check Railway logs for item ${item.id} / offer ${item.ebayOfferId} around this timestamp for the real eBay error detail.`);
      try {
        await prisma.item.update({ where: { id: item.id }, data: { ebayNeedsReview: true } });
      } catch (flagErr) {
        console.warn(`  (non-fatal) could not set ebayNeedsReview: ${flagErr.message}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
