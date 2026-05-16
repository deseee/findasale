/**
 * categorySyncCron.ts
 * Nightly job (05:00 UTC) — syncs top eBay listings per FindA.Sale category
 * into the CategoryTopFinds table. Gated by CATEGORY_SYNC_ENABLED=true.
 */
import cron from 'node-cron';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';

const CATEGORY_EBAY_MAP: Record<string, { display: string; ebayIds: string[] }> = {
  'furniture':      { display: 'Furniture',       ebayIds: ['3199'] },
  'jewelry':        { display: 'Jewelry',          ebayIds: ['6000', '281'] },
  'art-decor':      { display: 'Art & Decor',      ebayIds: ['550', '156323'] },
  'clothing':       { display: 'Clothing',         ebayIds: ['11450', '15724'] },
  'kitchenware':    { display: 'Kitchenware',      ebayIds: ['20625', '11700'] },
  'tools-hardware': { display: 'Tools & Hardware', ebayIds: ['631', '3244'] },
  'collectibles':   { display: 'Collectibles',     ebayIds: ['1'] },
  'electronics':    { display: 'Electronics',      ebayIds: ['293', '58058'] },
  'books-media':    { display: 'Books & Media',    ebayIds: ['267', '11232'] },
};

interface EbayItem {
  itemId: string;
  title: string;
  price?: { value: string };
  image?: { imageUrl: string };
  itemWebUrl?: string;
  condition?: string;
}

let cachedToken: { token: string; expires: number } | null = null;

async function fetchEbayToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.token;
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) { console.error('[CategorySync] No eBay credentials'); return null; }
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  try {
    const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    });
    if (!res.ok) { console.error(`[CategorySync] Token fetch failed: ${res.status}`); return null; }
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) { console.error('[CategorySync] No access_token in response'); return null; }
    cachedToken = { token: data.access_token, expires: Date.now() + ((data.expires_in ?? 7200) - 300) * 1000 };
    console.log('[CategorySync] eBay OAuth token fetched');
    return data.access_token;
  } catch (err) { console.error('[CategorySync] Token fetch error:', err); return null; }
}

async function syncCategory(slug: string, config: { display: string; ebayIds: string[] }): Promise<number> {
  const accessToken = await fetchEbayToken();
  if (!accessToken) { console.error(`[CategorySync] No eBay token — skipping ${slug}`); return -1; }

  const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
  const proxySecret = process.env.EBAY_PROXY_SECRET;
  // eBay Browse API uses category_ids as a direct query param (comma-separated), not filter syntax.
  const ids = config.ebayIds.join(',');
  const apiPath = `/buy/browse/v1/item_summary/search?category_ids=${ids}&sort=newlyListed&limit=12`;

  try {
    const res = await fetch(
      `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(apiPath)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
        },
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[CategorySync] eBay API error for ${slug}: ${res.status} — ${body.slice(0, 200)}`);
      return -res.status;
    }
    const data = await res.json() as { itemSummaries?: EbayItem[] };
    const items = data.itemSummaries ?? [];
    console.log(`[CategorySync] ${slug}: ${items.length} items from eBay`);

    for (const item of items) {
      await prisma.categoryTopFinds.upsert({
        where: { categorySlug_ebayListingId: { categorySlug: slug, ebayListingId: item.itemId } },
        update: {
          itemTitle: item.title,
          listingPrice: new Decimal(item.price?.value ?? '0'),
          imageUrl: item.image?.imageUrl ?? null,
          ebayUrl: item.itemWebUrl ?? null,
          updatedAt: new Date(),
        },
        create: {
          categorySlug: slug,
          categoryDisplay: config.display,
          itemTitle: item.title,
          itemCategory: item.condition ?? null,
          listingPrice: new Decimal(item.price?.value ?? '0'),
          imageUrl: item.image?.imageUrl ?? null,
          ebayListingId: item.itemId,
          ebayUrl: item.itemWebUrl ?? null,
        },
      });
    }
  } catch (err) { console.error(`[CategorySync] Error for ${slug}:`, err); return -1; }
  return 0;
}

export async function runCategorySync(): Promise<Record<string, number>> {
  console.log('[CategorySync] Starting...');
  const results: Record<string, number> = {};
  for (const [slug, config] of Object.entries(CATEGORY_EBAY_MAP)) {
    results[slug] = await syncCategory(slug, config);
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('[CategorySync] Done.', results);
  return results;
}

export function initCategorySyncCron(): void {
  if (process.env.CATEGORY_SYNC_ENABLED !== 'true') {
    console.log('[CategorySync] Disabled (set CATEGORY_SYNC_ENABLED=true to enable)');
    return;
  }
  cron.schedule('0 5 * * *', cronGuard({ jobName: 'categorySyncCron' }, () => runCategorySync()), { timezone: 'UTC' });
  console.log('[CategorySync] Scheduled: 05:00 UTC daily');
}
