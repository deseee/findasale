// One-off reconciliation for the 2026-07-26 eBay shipping-drift audit.
//
// Background: an audit found 32 items in one sale that are live on eBay with
// no packageWeightOz recorded in FindA.Sale's own DB. This initially looked
// like an active pricing failure ("shipping computed off zero data"), but
// checking eBay's real live listing pages directly showed every one of the 32
// already has a WORKING shipping setup on eBay's side (local-pickup-only,
// free flat-rate, eBay-authenticator-program shipping, or a real specific
// dollar shipping charge) -- these listings were evidently hand-configured or
// revised directly on eBay itself at some point, and FindA.Sale's database
// was simply never updated to reflect that.
//
// This script queries every Item with an ebayListingId, asks eBay's Trading
// API GetItem what shipping configuration is ACTUALLY live right now (same
// GetItem calling pattern as ebayController.ts's syncEndedListingsForOrganizer
// and the new fetchEbayLiveShippingConfig safety check added to
// publishItemOffer this session), and:
//   (a) backfills ebayShippingOverride='LOCAL_PICKUP_ONLY' for any item eBay
//       shows as pickup-only that FindA.Sale doesn't yet reflect.
//   (b) for items eBay already shows a real flat/free rate on: logs which
//       items these are (title, id, ebayListingId, eBay's shipping type/cost).
//       Does NOT invent or write a packageWeightOz value FindA.Sale never
//       actually confirmed -- that is explicitly out of scope for this script.
//   (c) separately logs a clear list of items where eBay's GetItem response
//       shows the listing is relying on CALCULATED (weight-based) shipping
//       with no real weight data behind it on FindA.Sale's side -- these are
//       the genuinely still-open risk items that need a real decision (weigh
//       the item, or set it to local-pickup), not items that are already fine.
//
// Dry-run by default -- prints what it would change, makes NO writes unless
// --apply is passed. Not wired into any cron; run manually, once, by hand.
//
// Requires EBAY_CLIENT_ID / EBAY_CLIENT_SECRET in the environment (pass
// alongside DATABASE_URL, not read from packages/backend/.env).
//
// UPDATE 2026-07-27: calls eBay's API DIRECTLY (https://api.ebay.com), not
// through the finda.sale Vercel proxy that ebayController.ts and the other
// one-off scripts use. That proxy exists specifically because RAILWAY's
// network can't resolve/reach api.ebay.com (see ebayController.ts's own
// "Route through Vercel proxy to avoid Railway DNS block" comment) -- a
// restriction that has nothing to do with a normal machine on a normal
// internet connection. Running this locally on Patrick's own PC needs no
// proxy and no EBAY_PROXY_SECRET at all. If this script is ever adapted to
// run from Railway or GitHub Actions instead, route it back through
// ebayProxyUrl() below and restore the EBAY_PROXY_SECRET requirement.
//
// Run from packages/backend:
//   npx tsx scripts/reconcile-2026-07-27-ebay-shipping-drift.ts
//   npx tsx scripts/reconcile-2026-07-27-ebay-shipping-drift.ts --apply

import { PrismaClient } from '../../database/node_modules/@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// DIRECT eBay calls (2026-07-27) -- see header comment above for why this
// script does NOT go through the finda.sale Vercel proxy the way the real
// backend controller and the other one-off scripts do. A plain browser-like
// User-Agent is added on every call since Akamai (eBay's edge/WAF) is known
// to 504 requests that look too bare -- same reasoning finda.sale's own
// proxy uses, just applied directly here instead of via a relay.
const EBAY_API_BASE = 'https://api.ebay.com';
const ebayProxyUrl = (path: string): string => `${EBAY_API_BASE}${path}`;

const ebayProxyHeaders = (): Record<string, string> => ({
  'User-Agent': 'FindASale-Reconcile/1.0 (+https://finda.sale)',
});

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

async function refreshEbayAccessToken(organizerId: string): Promise<string | null> {
  const connection = await prisma.ebayConnection.findUnique({ where: { organizerId } });
  if (!connection) {
    console.warn(`[eBay] No connection found for organizer ${organizerId}`);
    return null;
  }
  const now = new Date();
  const expiresIn = (connection.tokenExpiresAt.getTime() - now.getTime()) / 1000;
  if (expiresIn > 300) return connection.accessToken;

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[eBay] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured');
    return null;
  }
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: connection.refreshToken });
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
    console.error(`[eBay] Token refresh failed for organizer ${organizerId}: ${response.status}`);
    return null;
  }
  const data = (await response.json()) as any;
  await prisma.ebayConnection.update({
    where: { organizerId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || connection.refreshToken,
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 7200) * 1000),
      lastRefreshedAt: new Date(),
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });
  return data.access_token;
}

type LiveShippingResult =
  | { ok: true; isPickupOnly: boolean; hasFlatOrFreeRate: boolean; isCalculated: boolean; shippingType: string | null; sampleCost: string | null }
  | { ok: false; reason: string };

// Same GetItem calling pattern as ebayController.ts's syncEndedListingsForOrganizer
// and the fetchEbayLiveShippingConfig safety check added to publishItemOffer this
// session (Trading API via the Vercel proxy, XML request/response).
async function fetchEbayLiveShippingConfig(
  ebayListingId: string,
  accessToken: string
): Promise<LiveShippingResult> {
  try {
    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${ebayListingId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`;

    const ebayResponse = await fetch(ebayProxyUrl('/ws/api.dll'), {
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
      body: requestXml,
    });

    // FAIL-FAST on the first 403/401 (2026-07-27) -- these calls now go
    // straight to eBay (no relay in front), so a 401/403 here is a real eBay
    // auth problem: an invalid/expired access token, wrong OAuth scope for
    // Trading API GetItem, or eBay itself rate-limiting/blocking this IP.
    // Stop on the FIRST occurrence with the raw eBay response body instead of
    // silently repeating the identical failure for all 122 items.
    if (ebayResponse.status === 401 || ebayResponse.status === 403) {
      const bodyText = await ebayResponse.text();
      console.error(
        `\n[FATAL] eBay itself returned HTTP ${ebayResponse.status} on the first GetItem call. ` +
          `Body: ${bodyText.slice(0, 500)}\nThis is a real eBay-side auth rejection (bad/expired ` +
          `token, wrong scope, or IP-level block) -- not the old proxy-secret issue. Stopping now ` +
          `rather than repeating this for every remaining item.\n`
      );
      process.exit(1);
    }

    if (!ebayResponse.ok) {
      return { ok: false, reason: `HTTP ${ebayResponse.status}` };
    }

    const ebayText = await ebayResponse.text();
    const ack = xmlVal(ebayText, 'Ack');
    if (ack && ack !== 'Success' && ack !== 'Warning') {
      const errMsg = xmlVal(ebayText, 'LongMessage') || xmlVal(ebayText, 'ShortMessage') || 'Unknown error';
      return { ok: false, reason: `${ack}: ${errMsg}` };
    }

    const shippingBlockMatch = ebayText.match(/<ShippingDetails(?:\s[^>]*)?>([\s\S]*?)<\/ShippingDetails>/);
    const shippingBlock = shippingBlockMatch ? shippingBlockMatch[1] : '';

    const shippingType = xmlVal(shippingBlock, 'ShippingType');
    const serviceOptionBlocks = xmlAll(shippingBlock, 'ShippingServiceOptions');

    let hasFlatOrFreeRate = false;
    let sampleCost: string | null = null;
    for (const opt of serviceOptionBlocks) {
      const cost = xmlVal(opt, 'ShippingServiceCost');
      const freeShipping = xmlVal(opt, 'FreeShipping');
      if (freeShipping === 'true' || cost != null) {
        hasFlatOrFreeRate = true;
        if (sampleCost == null) {
          sampleCost = freeShipping === 'true' ? '0.00 (FreeShipping)' : cost;
        }
      }
    }

    const localPickupFlag = xmlVal(shippingBlock, 'LocalPickup') === 'true';
    const isPickupOnly = serviceOptionBlocks.length === 0 && (localPickupFlag || !shippingType);
    const isCalculated = shippingType === 'Calculated' || shippingType === 'CalculatedDomesticFlatInternational';

    return { ok: true, isPickupOnly, hasFlatOrFreeRate, isCalculated, shippingType, sampleCost };
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'EXCEPTION' };
  }
}

async function main() {
  // SELF-HEALING PREFLIGHT (2026-07-27, upgraded after a real failed run) --
  // every one of the 3 required eBay env vars gets used RAW as an HTTP header
  // value somewhere in this script (X-EBAY-API-APP-NAME, X-Proxy-Secret,
  // etc.), which Node's fetch rejects outright if the value contains any
  // character outside Latin-1/ByteString range. A real run hit this on
  // 122/122 items with the identical error, root-caused to a single stray
  // non-Latin1 character in one of these vars at the moment they were set --
  // exact origin (clipboard, terminal, dashboard) could not be pinned down
  // from outside the terminal session. Rather than requiring a clean re-paste
  // (unreliable -- already failed once despite following the same steps),
  // STRIP any such character in place and continue with the cleaned value, so
  // the run succeeds regardless of how the corruption happened. Logs exactly
  // what was stripped from where, so it's never silent.
  for (const name of ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET'] as const) {
    const raw = process.env[name];
    if (!raw) {
      console.error(`[preflight] ${name} is not set. Set it via $env:${name}="..." before running.`);
      process.exit(1);
    }
    const badChars: string[] = [];
    let cleaned = '';
    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i);
      if (code > 255) {
        badChars.push(`index ${i} (code ${code}, "${raw[i]}")`);
      } else {
        cleaned += raw[i];
      }
    }
    if (badChars.length > 0) {
      console.warn(
        `[preflight] ${name} had ${badChars.length} invalid character(s) stripped: ${badChars.join(', ')}. ` +
          `Continuing with the cleaned value (length ${raw.length} -> ${cleaned.length}).`
      );
      process.env[name] = cleaned;
    }
    if (!process.env[name]) {
      console.error(`[preflight] ${name} was empty after stripping invalid characters -- nothing usable left. Re-copy it from Railway and try again.`);
      process.exit(1);
    }
  }

  // DATABASE TARGET PREFLIGHT (2026-08-04) -- this script has no self-check
  // on which database it's about to read/write; it relies entirely on
  // whatever DATABASE_URL is already in the shell environment at the moment
  // PrismaClient was instantiated above. Make the target unambiguous BEFORE
  // any DB query runs, so a human running it can see exactly what they're
  // pointed at and Ctrl-C if it's wrong. Visibility only -- no hardcoded
  // "production" vs "localhost" comparison, no blocking. The script's actual
  // write safety still comes from the --apply dry-run gate above.
  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (!rawDatabaseUrl) {
    console.error('[preflight] DATABASE_URL is not set. Set it via $env:DATABASE_URL="..." before running.');
    process.exit(1);
  }
  try {
    const dbUrl = new URL(rawDatabaseUrl);
    console.log(`[preflight] Target database host: ${dbUrl.host}  db: ${dbUrl.pathname}`);
  } catch (err: any) {
    console.error(`[preflight] DATABASE_URL is set but could not be parsed as a URL: ${err?.message || err}`);
    process.exit(1);
  }

  console.log('--- DRY RUN ---'.concat(APPLY ? ' (will APPLY backfills)' : ' (pass --apply to write ebayShippingOverride backfills)'));

  const items = await prisma.item.findMany({
    where: { ebayListingId: { not: null } },
    select: {
      id: true,
      title: true,
      ebayListingId: true,
      ebayShippingOverride: true,
      packageWeightOz: true,
      saleId: true,
      sale: { select: { organizerId: true } },
    },
  });

  console.log(`Found ${items.length} items with an ebayListingId set.\n`);

  if (items.length === 0) {
    console.log('Nothing to reconcile.');
    return;
  }

  // Group by organizer so we refresh each organizer's eBay token once, not once per item.
  const byOrganizer = new Map<string, typeof items>();
  for (const item of items) {
    const organizerId = item.sale?.organizerId;
    if (!organizerId) {
      console.warn(`[skip] item ${item.id} ("${item.title}") has no sale/organizer -- cannot check eBay.`);
      continue;
    }
    const bucket = byOrganizer.get(organizerId) ?? [];
    bucket.push(item);
    byOrganizer.set(organizerId, bucket);
  }

  const pickupBackfills: Array<{ id: string; title: string; ebayListingId: string }> = [];
  const alreadyFineFlatOrFree: Array<{ id: string; title: string; ebayListingId: string; shippingType: string | null; cost: string | null }> = [];
  const openRiskCalculatedNoWeight: Array<{ id: string; title: string; ebayListingId: string }> = [];
  const inconclusive: Array<{ id: string; title: string; ebayListingId: string; reason: string }> = [];

  for (const [organizerId, orgItems] of byOrganizer) {
    const accessToken = await refreshEbayAccessToken(organizerId);
    if (!accessToken) {
      console.warn(`[skip organizer ${organizerId}] no usable eBay access token -- skipping ${orgItems.length} item(s).`);
      continue;
    }

    // Batch GetItem calls in groups of 20 concurrent requests, mirroring
    // syncEndedListingsForOrganizer's batching (Phase 3 optimization).
    const batchSize = 20;
    for (let i = 0; i < orgItems.length; i += batchSize) {
      const batch = orgItems.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (item) => {
          const check = await fetchEbayLiveShippingConfig(item.ebayListingId as string, accessToken);
          return { item, check };
        })
      );

      for (const { item, check } of results) {
        if (!check.ok) {
          inconclusive.push({ id: item.id, title: item.title, ebayListingId: item.ebayListingId as string, reason: check.reason });
          continue;
        }

        if (check.isPickupOnly) {
          if (item.ebayShippingOverride !== 'LOCAL_PICKUP_ONLY') {
            pickupBackfills.push({ id: item.id, title: item.title, ebayListingId: item.ebayListingId as string });
          }
          continue;
        }

        if (check.hasFlatOrFreeRate) {
          alreadyFineFlatOrFree.push({
            id: item.id,
            title: item.title,
            ebayListingId: item.ebayListingId as string,
            shippingType: check.shippingType,
            cost: check.sampleCost,
          });
          continue;
        }

        if (check.isCalculated && (item.packageWeightOz == null || item.packageWeightOz <= 0)) {
          openRiskCalculatedNoWeight.push({ id: item.id, title: item.title, ebayListingId: item.ebayListingId as string });
        }
      }

      if (i + batchSize < orgItems.length) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // respect rate limits between batches
      }
    }
  }

  console.log(`\n=== (a) Pickup-only on eBay, ebayShippingOverride NOT yet LOCAL_PICKUP_ONLY in FindA.Sale (${pickupBackfills.length}) ===`);
  for (const row of pickupBackfills) {
    console.log(`  item=${row.id} ebayListingId=${row.ebayListingId} "${row.title}"`);
  }
  if (APPLY && pickupBackfills.length > 0) {
    for (const row of pickupBackfills) {
      await prisma.item.update({ where: { id: row.id }, data: { ebayShippingOverride: 'LOCAL_PICKUP_ONLY' } });
      console.log(`  [applied] item=${row.id} ebayShippingOverride -> LOCAL_PICKUP_ONLY`);
    }
  } else if (pickupBackfills.length > 0) {
    console.log('  (dry run -- re-run with --apply to write these)');
  }

  console.log(`\n=== (b) Already has a real flat/free rate on eBay -- no action needed, logged only (${alreadyFineFlatOrFree.length}) ===`);
  for (const row of alreadyFineFlatOrFree) {
    console.log(`  item=${row.id} ebayListingId=${row.ebayListingId} shippingType=${row.shippingType ?? '(none)'} cost=${row.cost ?? '(unknown)'} "${row.title}"`);
  }

  console.log(`\n=== (c) OPEN RISK -- CALCULATED shipping on eBay with NO real weight in FindA.Sale (${openRiskCalculatedNoWeight.length}) ===`);
  console.log('  These are the genuinely still-open items Patrick needs to see: weigh the item for real,');
  console.log('  or explicitly mark it Local pickup only. Nothing in this script writes a guessed weight.');
  for (const row of openRiskCalculatedNoWeight) {
    console.log(`  item=${row.id} ebayListingId=${row.ebayListingId} "${row.title}"`);
  }

  if (inconclusive.length > 0) {
    console.log(`\n=== Inconclusive / GetItem failed (${inconclusive.length}) -- not classified, needs manual look ===`);
    for (const row of inconclusive) {
      console.log(`  item=${row.id} ebayListingId=${row.ebayListingId} reason=${row.reason} "${row.title}"`);
    }
  }

  console.log(`\nSummary: ${items.length} checked, ${pickupBackfills.length} pickup-backfilled${APPLY ? '' : ' (dry run)'}, ${alreadyFineFlatOrFree.length} already fine (flat/free), ${openRiskCalculatedNoWeight.length} open risk (calculated, no weight), ${inconclusive.length} inconclusive.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
