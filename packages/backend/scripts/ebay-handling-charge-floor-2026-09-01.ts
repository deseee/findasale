// One-off retroactive fix: apply the new $1.00 minimum handling-charge floor to an
// organizer's EXISTING live eBay CALCULATED-cost fulfillment policies.
//
// ─── Background (Patrick decision, 2026-09-01) ────────────────────────────────────
// eBay calculated-shipping presets (e.g. "Media Mail Calculated") previously computed
// their packageHandlingCost purely as an FVF-offset (see
// services/ebayShippingPresetService.ts's estimatePresetRate/createPreset and
// services/ebayCalculatedPolicyService.ts's computeCalculatedWithHandling), with no
// floor. On a cheap package that offset rounds to pennies or even $0.00 -- both live
// paths now floor at MIN_CALCULATED_HANDLING_CHARGE (services/ebayRateEstimateService.ts,
// currently $1.00) going forward. This script is the RETROACTIVE half: it finds and
// fixes policies that were already created before that floor existed.
//
// ─── What this script does ─────────────────────────────────────────────────────
// 1. Refreshes an OAuth access token for the given organizer (refreshEbayAccessToken,
//    same helper the live app uses -- services/ebayHttp.ts).
// 2. GETs every live fulfillment policy on that organizer's eBay account
//    (GET /sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100 --
//    same endpoint as fetchLivePolicies() in ebayShippingPresetService.ts).
// 3. Filters to policies whose shippingOptions[0].costType === 'CALCULATED' AND whose
//    packageHandlingCost is missing OR below MIN_CALCULATED_HANDLING_CHARGE.
// 4. For each affected policy: PUTs the COMPLETE policy object back
//    (PUT /sell/account/v1/fulfillment_policy/{fulfillmentPolicyId}) with ONLY
//    packageHandlingCost.value changed to max(current, MIN_CALCULATED_HANDLING_CHARGE)
//    -- eBay's Fulfillment Policy PUT is a full replacement, not a partial patch, so
//    the entire GET body is round-tripped with fulfillmentPolicyId stripped (read-only,
//    eBay rejects it in the PUT body -- same pattern as
//    ebayController.ts's applyFulfillmentPolicyToOffer).
//
// ─── Safety ─────────────────────────────────────────────────────────────────────
// DRY RUN BY DEFAULT. Prints exactly what would change and makes ZERO writes to eBay
// unless --apply is passed. Not wired into any cron or route -- run manually, once,
// by hand, from the main session (per this project's subagent production-write ban:
// a dev subagent must not execute this itself -- see the dispatch prompt for this
// session). No database writes anywhere in this script (read-only Prisma queries only).
//
// ─── Required environment ───────────────────────────────────────────────────────
//   DATABASE_URL        (packages/database/.env holds the live Railway proxy string)
//   EBAY_CLIENT_ID       \
//   EBAY_CLIENT_SECRET    |  live in Railway, NOT in packages/backend/.env --
//   EBAY_PROXY_SECRET     |  pull with: railway variables --service backend --kv
//   FRONTEND_URL         /   (defaults to https://finda.sale)
//
// ─── Usage (run from packages/backend) ─────────────────────────────────────────
//   npx tsx scripts/ebay-handling-charge-floor-2026-09-01.ts                       # dry run, Artifact
//   npx tsx scripts/ebay-handling-charge-floor-2026-09-01.ts --organizer <id>      # dry run, another organizer
//   npx tsx scripts/ebay-handling-charge-floor-2026-09-01.ts --apply               # WRITES to Artifact's live eBay account
//   npx tsx scripts/ebay-handling-charge-floor-2026-09-01.ts --organizer <id> --apply

import { PrismaClient } from '@prisma/client';
import { ebayProxyUrl, ebayProxyHeaders, ebayUserHeaders, refreshEbayAccessToken } from '../src/services/ebayHttp';
import { MIN_CALCULATED_HANDLING_CHARGE } from '../src/services/ebayRateEstimateService';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

// Default: Artifact (artifactmi@gmail.com) -- the account named in Patrick's ask.
// Confirmed via read-only DB lookup this session: Organizer.id for artifactmi@gmail.com.
const DEFAULT_ORGANIZER_ID = 'cmnxueoas0005tfv8brnc0kky';
const organizerId = argValue('--organizer') ?? DEFAULT_ORGANIZER_ID;

interface RawShippingService {
  [key: string]: unknown;
}

interface RawShippingOption {
  optionType?: string;
  costType?: string;
  packageHandlingCost?: { value?: string; currency?: string };
  shippingServices?: RawShippingService[];
  [key: string]: unknown;
}

interface RawFulfillmentPolicy {
  fulfillmentPolicyId: string;
  name: string;
  shippingOptions?: RawShippingOption[];
  [key: string]: unknown;
}

async function fetchLivePolicies(accessToken: string): Promise<RawFulfillmentPolicy[]> {
  const res = await fetch(
    ebayProxyUrl('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100'),
    { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`eBay returned ${res.status} listing fulfillment policies: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { fulfillmentPolicies?: RawFulfillmentPolicy[] };
  return Array.isArray(data.fulfillmentPolicies) ? data.fulfillmentPolicies : [];
}

async function putPolicy(
  accessToken: string,
  fulfillmentPolicyId: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(ebayProxyUrl(`/sell/account/v1/fulfillment_policy/${fulfillmentPolicyId}`), {
    method: 'PUT',
    headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, text };
}

async function main() {
  console.log(`[handling-floor] organizer=${organizerId} mode=${APPLY ? 'APPLY (writes to eBay)' : 'DRY RUN'}`);

  const accessToken = await refreshEbayAccessToken(organizerId);
  if (!accessToken) {
    console.error('[handling-floor] Could not obtain an eBay access token for this organizer. Aborting.');
    process.exit(1);
  }

  const policies = await fetchLivePolicies(accessToken);
  console.log(`[handling-floor] Found ${policies.length} live fulfillment policies.`);

  const affected = policies.filter((p) => {
    const opt0 = p.shippingOptions?.[0];
    if (!opt0 || opt0.costType !== 'CALCULATED') return false;
    const current = opt0.packageHandlingCost?.value != null ? Number(opt0.packageHandlingCost.value) : null;
    return current == null || current < MIN_CALCULATED_HANDLING_CHARGE;
  });

  if (affected.length === 0) {
    console.log('[handling-floor] No CALCULATED policies below the floor. Nothing to do.');
    return;
  }

  console.log(`\n[handling-floor] ${affected.length} CALCULATED policy(ies) below the $${MIN_CALCULATED_HANDLING_CHARGE.toFixed(2)} floor:\n`);

  for (const policy of affected) {
    const opt0 = policy.shippingOptions![0];
    const currentValue = opt0.packageHandlingCost?.value != null ? Number(opt0.packageHandlingCost.value) : null;
    const newValue = Math.max(currentValue ?? 0, MIN_CALCULATED_HANDLING_CHARGE);

    console.log(
      `- id=${policy.fulfillmentPolicyId} name=${JSON.stringify(policy.name)} ` +
        `current=${currentValue == null ? 'MISSING' : `$${currentValue.toFixed(2)}`} -> new=$${newValue.toFixed(2)}`
    );

    if (!APPLY) continue;

    // Full-replacement PUT: round-trip the ENTIRE GET body, only mutating
    // packageHandlingCost.value on the first shippingOption, and stripping the
    // read-only fulfillmentPolicyId field eBay rejects on PUT (same pattern as
    // ebayController.ts's applyFulfillmentPolicyToOffer).
    const updatedPolicy: Record<string, unknown> = { ...policy };
    delete updatedPolicy.fulfillmentPolicyId;
    const updatedOptions = [...(policy.shippingOptions ?? [])];
    updatedOptions[0] = {
      ...opt0,
      packageHandlingCost: { value: newValue.toFixed(2), currency: opt0.packageHandlingCost?.currency ?? 'USD' },
    };
    updatedPolicy.shippingOptions = updatedOptions;

    const result = await putPolicy(accessToken, policy.fulfillmentPolicyId, updatedPolicy);
    if (result.ok) {
      console.log(`  -> PUT ${result.status} OK`);
    } else {
      console.error(`  -> PUT ${result.status} FAILED: ${result.text.slice(0, 400)}`);
    }
  }

  if (!APPLY) {
    console.log('\n[handling-floor] DRY RUN ONLY -- no changes written. Re-run with --apply to write to eBay.');
  }
}

main()
  .catch((err) => {
    console.error('[handling-floor] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
