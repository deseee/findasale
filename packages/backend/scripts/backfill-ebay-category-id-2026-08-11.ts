// One-off backfill: Item.ebayCategoryId for items that are LIVE on eBay but carry a
// NULL numeric eBay category ID.
//
// ─── Root cause (verified against production, 2026-08-11) ────────────────────────────
// Production query:
//   SELECT count(*) FROM "Item" WHERE "ebayListingId" IS NOT NULL AND "ebayCategoryId" IS NULL;
//   -> 74. ALL 74 belong to a single organizer, ALL created 2026-04-17, and ALL 74 have a
//   correct eBay category NAME ("Coins & Paper Money:Coins: US:Dollars:Eisenhower (1971-78)",
//   etc.) with the numeric ID still NULL. Every item created after 2026-06-16 has an ID.
//
// Two independent code gaps produced that state:
//   1. controllers/ebayController.ts — the fire-and-forget GetItem ENRICHMENT pass is the only
//      sync path that re-touches every already-imported eBay item on every sync. It parsed
//      <PrimaryCategory> for CategoryName ONLY and never read CategoryID, so it could refresh
//      the category name forever while leaving ebayCategoryId NULL. (Fixed 2026-08-11 in the
//      same changeset as this script — future syncs now self-heal.)
//   2. controllers/ebayController.ts (~line 5803) — the GetMyeBaySelling import block DOES
//      backfill ebayCategoryId on existing items, but it lives after an early
//      `if (ebayApiError) return res.status(502)` guard, and
//      EbayConnection.lastEbayInventorySyncAt (written ONLY at the very end of
//      importEbayInventory) is still NULL in production for the sole eBay-connected
//      organizer — i.e. that import has never once run to completion, so that backfill has
//      never executed.
//
// Because gap #1 is now fixed, a future successful sync would eventually heal these rows.
// This script exists so the 74 stranded rows can be fixed NOW without depending on a full
// import succeeding, and so the fix is auditable row-by-row before it is written.
//
// ─── Why eBay is the source of truth here ────────────────────────────────────────────
// These items are already live on eBay, so eBay itself holds the authoritative CategoryID.
// Nothing is guessed: the script calls Trading API GetItem per listing and reads
// <PrimaryCategory><CategoryID> — the exact same field, via the exact same Vercel proxy and
// user-OAuth pattern (ebayProxyUrl/ebayProxyHeaders + refreshEbayAccessToken +
// X-EBAY-API-IAF-TOKEN) that ebayController.ts's own enrichment pass uses. No new HTTP or
// auth client is introduced.
//
// ─── Safety ──────────────────────────────────────────────────────────────────────────
// DRY RUN by default — prints a full before/after table and writes nothing. Pass --apply to
// write. --limit N and --item <id> exist so a handful of rows can be proven correct before
// any batch runs. This is production data; run the dry run and read the output first.
//
// The dry run also prints the eBay Standard Envelope category-gate verdict BEFORE and AFTER
// for every row, because evaluateStandardEnvelope() (services/ebayRateEstimateService.ts) is
// an EITHER/OR, not a fallback:
//     categoryId ? isStandardEnvelopeEligibleCategoryId(categoryId)
//                : isStandardEnvelopeEligibleCategory(category)
// Once ebayCategoryId is populated, the category-NAME substring path is never consulted again.
// So for any row whose NAME currently matches but whose real eBay leaf ID is not in
// EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS (which lists L1/near-L1 roots, matched
// EXACTLY), this backfill NARROWS envelope eligibility. Those rows are flagged
// "ENVELOPE-REGRESSION" in the output. Read that section before passing --apply.
//
// ─── Required environment ────────────────────────────────────────────────────────────
//   DATABASE_URL        (packages/database/.env holds the live Railway proxy string)
//   EBAY_CLIENT_ID      \
//   EBAY_CLIENT_SECRET   |  live in Railway, NOT in packages/backend/.env —
//   EBAY_PROXY_SECRET    |  pull with: railway variables --service backend --kv
//   FRONTEND_URL        /   (defaults to https://finda.sale)
//
// Run from packages/backend:
//   npx tsx scripts/backfill-ebay-category-id-2026-08-11.ts                      # dry run, all
//   npx tsx scripts/backfill-ebay-category-id-2026-08-11.ts --limit 3            # dry run, 3 rows
//   npx tsx scripts/backfill-ebay-category-id-2026-08-11.ts --item <itemId>      # dry run, 1 row
//   npx tsx scripts/backfill-ebay-category-id-2026-08-11.ts --apply              # WRITES

import { PrismaClient } from '@prisma/client';
import { ebayProxyUrl, ebayProxyHeaders, refreshEbayAccessToken } from '../src/services/ebayHttp';
import {
  EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORIES,
  EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS,
} from '../src/services/ebayRateEstimateService';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const parsedLimit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : NaN;
const LIMIT: number | undefined = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
const itemArg = process.argv.indexOf('--item');
const ONLY_ITEM_IDS: string[] = itemArg !== -1
  ? process.argv.slice(itemArg + 1).filter((a) => !a.startsWith('--'))
  : [];

/** Minimal XML text extractor — same shape as ebayController.ts's local xmlVal helper
 *  (that one is module-private, so it is re-declared here rather than exported for a script). */
function xmlVal(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

/** Mirrors isStandardEnvelopeEligibleCategory() in ebayRateEstimateService.ts (module-private). */
function nameGatePasses(category: string | null | undefined): boolean {
  if (!category) return false;
  const lower = category.toLowerCase();
  return EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORIES.some((c) => lower.includes(c.toLowerCase()));
}

/** Mirrors isStandardEnvelopeEligibleCategoryId() in ebayRateEstimateService.ts (module-private). */
function idGatePasses(categoryId: string | null | undefined): boolean {
  if (!categoryId) return false;
  return EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS.includes(categoryId);
}

interface Row {
  id: string;
  title: string;
  organizerId: string | null;
  ebayListingId: string;
  category: string | null;
  before: string | null;
  after: string | null;
  liveCategoryName: string | null;
  error: string | null;
}

function requireEnv(): string[] {
  const needed = ['DATABASE_URL', 'EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_PROXY_SECRET'];
  return needed.filter((k) => !process.env[k]);
}

async function fetchLiveCategory(
  ebayListingId: string,
  accessToken: string,
): Promise<{ categoryId: string | null; categoryName: string | null; error: string | null }> {
  const xml =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ItemID>${ebayListingId}</ItemID>` +
    `<OutputSelector>Item.ItemID</OutputSelector>` +
    `<OutputSelector>Item.PrimaryCategory</OutputSelector>` +
    `</GetItemRequest>`;

  try {
    const resp = await fetch(ebayProxyUrl('/ws/api.dll'), {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'GetItem',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID || '',
        // GetItem over the Vercel proxy REQUIRES this OAuth header. Without it eBay
        // rejects the call with 'Header "X-EBAY-API-DEV-NAME" does not exist.' (the proxy's
        // header allowlist does not forward the legacy dev-name header) — verified live
        // 2026-08-11 against three of these listings.
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml',
        ...ebayProxyHeaders(),
      },
      body: xml,
      signal: AbortSignal.timeout(30000),
    });

    const text = await resp.text();
    const ack = xmlVal(text, 'Ack');
    if (ack !== 'Success' && ack !== 'Warning') {
      return {
        categoryId: null,
        categoryName: null,
        error: xmlVal(text, 'LongMessage') || xmlVal(text, 'ShortMessage') || `Ack=${ack}`,
      };
    }
    const block = text.match(/<PrimaryCategory>([\s\S]*?)<\/PrimaryCategory>/)?.[1] || '';
    return {
      categoryId: block ? xmlVal(block, 'CategoryID') : null,
      categoryName: block ? xmlVal(block, 'CategoryName') : null,
      error: null,
    };
  } catch (err: any) {
    return { categoryId: null, categoryName: null, error: err?.message || String(err) };
  }
}

async function main() {
  const missing = requireEnv();
  if (missing.length > 0) {
    console.error(`Missing required env var(s): ${missing.join(', ')}`);
    console.error('The EBAY_* values live in Railway, not packages/backend/.env. Pull them with:');
    console.error('  railway variables --service backend --kv');
    process.exit(1);
  }

  console.log(
    `=== Item.ebayCategoryId backfill from live eBay — ${APPLY ? 'APPLY mode (WRITING)' : 'DRY RUN (no writes)'} ===\n`,
  );

  const items = await prisma.item.findMany({
    where: {
      ebayCategoryId: null,
      ebayListingId: { not: null },
      ...(ONLY_ITEM_IDS.length > 0 ? { id: { in: ONLY_ITEM_IDS } } : {}),
    },
    select: {
      id: true,
      title: true,
      category: true,
      ebayCategoryId: true,
      ebayListingId: true,
      organizerId: true,
      sale: { select: { organizerId: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: LIMIT, // undefined = no limit (Prisma ignores an undefined take)
  });

  console.log(`Scanned ${items.length} item(s) with a live ebayListingId and NULL ebayCategoryId.\n`);
  if (items.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // Item.organizerId is a denormalized convenience field and is not reliably populated for
  // every item — real ownership traces through Item.saleId -> Sale.organizerId. Resolve via
  // both, same as tryReconcileByTitle() in ebayController.ts.
  const tokenByOrganizer = new Map<string, string | null>();
  const getToken = async (organizerId: string): Promise<string | null> => {
    if (!tokenByOrganizer.has(organizerId)) {
      tokenByOrganizer.set(organizerId, await refreshEbayAccessToken(organizerId));
    }
    return tokenByOrganizer.get(organizerId) ?? null;
  };

  const rows: Row[] = [];

  for (const item of items) {
    const organizerId = item.organizerId ?? item.sale?.organizerId ?? null;
    const listingId = item.ebayListingId!;

    const base: Row = {
      id: item.id,
      title: item.title,
      organizerId,
      ebayListingId: listingId,
      category: item.category,
      before: item.ebayCategoryId,
      after: null,
      liveCategoryName: null,
      error: null,
    };

    if (!/^\d+$/.test(listingId)) {
      base.error = 'ebayListingId is not a numeric eBay ItemID (FAS-*/SKU) — cannot GetItem';
      rows.push(base);
      continue;
    }
    if (!organizerId) {
      base.error = 'No organizer resolvable (Item.organizerId and Sale.organizerId both null)';
      rows.push(base);
      continue;
    }

    const token = await getToken(organizerId);
    if (!token) {
      base.error = `No eBay access token for organizer ${organizerId}`;
      rows.push(base);
      continue;
    }

    const live = await fetchLiveCategory(listingId, token);
    base.after = live.categoryId;
    base.liveCategoryName = live.categoryName;
    base.error = live.error;
    rows.push(base);
  }

  // ── Report ────────────────────────────────────────────────────────────────────────
  const resolved = rows.filter((r) => r.after && !r.error);
  const failed = rows.filter((r) => !r.after || r.error);

  console.log('--- Resolved from live eBay -------------------------------------------------');
  for (const r of resolved) {
    console.log(
      `${r.id}  listing=${r.ebayListingId}\n` +
        `    title:            ${r.title.slice(0, 70)}\n` +
        `    ebayCategoryId:   ${r.before ?? 'NULL'}  ->  ${r.after}\n` +
        `    live categoryName:${r.liveCategoryName}\n` +
        `    stored category:  ${r.category}`,
    );
  }

  console.log('\n--- eBay Standard Envelope CATEGORY gate: before vs after --------------------');
  console.log(
    'evaluateStandardEnvelope() is either/or: once ebayCategoryId is set, the category NAME\n' +
      'path is never consulted again. "ENVELOPE-REGRESSION" = eligible today by name, NOT\n' +
      'eligible after the ID is written. (Category is only one of four gates — weight <=3oz,\n' +
      'price <$20 and envelope dims must also pass for a rate to be produced.)\n',
  );
  const regressions: Row[] = [];
  const gains: Row[] = [];
  for (const r of resolved) {
    const beforePass = nameGatePasses(r.category);
    const afterPass = idGatePasses(r.after);
    if (beforePass && !afterPass) regressions.push(r);
    if (!beforePass && afterPass) gains.push(r);
    const flag = beforePass && !afterPass ? '  <== ENVELOPE-REGRESSION' : !beforePass && afterPass ? '  <== newly eligible' : '';
    console.log(
      `${r.id}  cat-gate ${beforePass ? 'PASS' : 'fail'} (name) -> ${afterPass ? 'PASS' : 'fail'} (id ${r.after})${flag}`,
    );
  }
  console.log(
    `\n  ${regressions.length} row(s) would LOSE envelope category eligibility, ${gains.length} would gain it.`,
  );
  if (regressions.length > 0) {
    console.log('  REGRESSIONS:');
    for (const r of regressions) {
      console.log(`    ${r.id}  "${r.title.slice(0, 60)}"  ${r.category}  -> id ${r.after}`);
    }
    console.log(
      '  These are NOT caused by this backfill writing a wrong value — the value is eBay\'s own.\n' +
        '  They are caused by EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS listing L1/near-L1\n' +
        '  roots and matching them EXACTLY, so a real leaf ID under an eligible root does not\n' +
        '  match. Fix that gate (leaf/lineage-aware matching) before or alongside --apply.',
    );
  }

  if (failed.length > 0) {
    console.log('\n--- Could NOT resolve --------------------------------------------------------');
    for (const r of failed) {
      console.log(`${r.id}  listing=${r.ebayListingId}  reason: ${r.error ?? 'no CategoryID returned'}`);
    }
  }

  console.log(
    `\nSummary: ${resolved.length} resolvable, ${failed.length} unresolvable, out of ${rows.length} scanned.`,
  );

  if (!APPLY) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to write the values above.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const r of resolved) {
    await prisma.item.update({ where: { id: r.id }, data: { ebayCategoryId: r.after! } });
    updated++;
  }
  console.log(`\nAPPLIED — wrote ebayCategoryId on ${updated} item(s).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
