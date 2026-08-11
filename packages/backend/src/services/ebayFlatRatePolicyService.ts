/**
 * ebayFlatRatePolicyService — provisions per-organizer FVF-inclusive flat-rate
 * fulfillment policies on eBay so the organizer nets at least the USPS label
 * cost after eBay's 13.6% Final Value Fee on shipping.
 *
 * Why flat-rate instead of calculated?
 *   eBay charges 13.6% FVF on the TOTAL transaction including shipping.
 *   With calculated shipping, the buyer pays the real USPS rate but eBay
 *   takes 13.6% of that amount, leaving the organizer short ~$0.87 on a
 *   $6.36 charge. By setting a flat rate = ceil(estimatedRate / 0.864),
 *   the buyer pays slightly more and the organizer nets at least the label cost.
 *
 * Policy naming convention: "FindA.Sale Flat $X.XX" where X.XX is the flat rate.
 * An in-process cache (organizerId → rate → policyId) avoids redundant eBay API
 * calls within a session. On cache miss, the service looks up existing policies
 * by name before creating a new one (idempotent).
 *
 * No schema change required: policies are identified by name on eBay's side.
 */

import { prisma } from '../lib/prisma';
import { computeCheapestForOrigin, EBAY_SHIPPING_FVF_RATE, ShippingHardBlockError } from './ebayRateEstimateService';
import { refreshEbayAccessToken } from './ebayHttp';

// In-process cache: `${organizerId}:${flatRateStr}` → eBay fulfillmentPolicyId
const policyCache = new Map<string, string>();

const POLICY_NAME_PREFIX = 'FindA.Sale Flat $';

const ebayProxyUrl = (path: string): string =>
  `${process.env.FRONTEND_URL ?? 'https://finda.sale'}/api/proxy/ebay?path=${encodeURIComponent(path)}`;

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

/**
 * Compute the FVF-inclusive flat rate for a given estimated USPS rate.
 * ceil to nearest cent so the organizer always nets >= label cost.
 */
export function computeFvfFlatRate(estimatedRate: number): number {
  return Math.ceil((estimatedRate / (1 - EBAY_SHIPPING_FVF_RATE)) * 100) / 100;
}

/**
 * Round a rate UP to the next bounded-ladder bucket so the policy set stays small and
 * reusable: $0.50 steps <=$15, $1 <=$40, $2.50 <=$100, $5 above. Round UP so the seller
 * is never short; overage <= one bucket width.
 */
export function roundUpToBucket(rate: number): number {
  let step: number;
  if (rate <= 15) step = 0.5;
  else if (rate <= 40) step = 1;
  else if (rate <= 100) step = 2.5;
  else step = 5;
  const bucketed = Math.ceil((rate - 1e-9) / step) * step;
  return Math.round(bucketed * 100) / 100;
}

/**
 * Compute the flat rate for an item given its weight, dims, and fromZip,
 * then get-or-create the matching eBay fulfillment policy for the organizer.
 *
 * Returns the fulfillmentPolicyId, or null if provisioning failed (caller
 * falls through to the calculated policy path).
 */
export async function ensureFvfFlatRatePolicy(
  organizerId: string,
  weightOz: number,
  dims: { length?: number | null; width?: number | null; height?: number | null } | null,
  fromZip: string | null | undefined,
  packageType?: string | null,
  categoryId?: string | null,
  priceUsd?: number | null
): Promise<{ policyId: string; flatRate: number } | null> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: { ebayConnection: true },
  });

  const conn = organizer?.ebayConnection;
  if (!conn) {
    console.warn(`[eBay FvfFlat] organizer=${organizerId} not connected`);
    return null;
  }

  // Price at the cheapest carrier for the organizer's farthest-CONUS coverage zone,
  // gross up for eBay's FVF on shipping, then round UP into the bounded bucket ladder.
  // ADR-103 Phase 4: computeCheapestForOrigin can throw ShippingHardBlockError when the
  // item exceeds every carrier's absolute max -- fail safe (return null, same contract
  // as "organizer not connected" above) rather than crash; callers already fall through
  // to the calculated-policy path / soft-block-and-flag-for-review on a null return.
  let cheapest;
  try {
    cheapest = await computeCheapestForOrigin({
      weightOz,
      dims: dims ?? null,
      origin: { zip: fromZip ?? null, lat: organizer?.lat ?? null, lng: organizer?.lng ?? null },
      packageType: packageType ?? null,
      categoryId: categoryId ?? null,
      priceUsd: priceUsd ?? null,
    });
  } catch (err) {
    if (err instanceof ShippingHardBlockError) {
      console.warn(`[eBay FvfFlat] organizer=${organizerId} hard-blocked: ${err.message}`);
      return null;
    }
    throw err;
  }

  const flatRate = roundUpToBucket(computeFvfFlatRate(cheapest.rate));
  const flatRateStr = flatRate.toFixed(2);
  const policyName = `${POLICY_NAME_PREFIX}${flatRateStr}`;

  const cacheKey = `${organizerId}:${flatRateStr}`;
  const cached = policyCache.get(cacheKey);
  if (cached) {
    console.log(
      `[eBay FvfFlat] cache hit organizer=${organizerId} flatRate=${flatRateStr} policy=${cached}`
    );
    return { policyId: cached, flatRate };
  }

  const accessToken = conn.accessToken;
  const handlingTimeDays = conn.handlingTimeDays ?? 3;

  // Check if a policy with this name already exists before creating
  const existing = await findExistingFlatRatePolicy(accessToken, policyName);
  if (existing) {
    policyCache.set(cacheKey, existing);
    console.log(
      `[eBay FvfFlat] adopted existing organizer=${organizerId} flatRate=${flatRateStr} policy=${existing}`
    );
    return { policyId: existing, flatRate };
  }

  // Create the flat-rate policy
  const body = {
    name: policyName,
    marketplaceId: 'EBAY_US',
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    handlingTime: { unit: 'DAY', value: handlingTimeDays },
    shippingOptions: [
      {
        optionType: 'DOMESTIC',
        costType: 'FLAT_RATE',
        shippingServices: [
          {
            // eBay flat-rate domestic uses the GENERIC ShippingMethodStandard code
            // (matches the organizer's own working flat-rate tier policies). The
            // carrier-specific 'USPSGroundAdvantage' code is CALCULATED-only and is
            // rejected by LSAS for FLAT_RATE policies with errorId 216018
            // UNKNOWN_SHIPPING_SERVICE_CODE (proven via live eBay API, S975).
            shippingServiceCode: 'ShippingMethodStandard',
            shippingCarrierCode: 'GENERIC',
            shippingCost: { value: flatRateStr, currency: 'USD' },
            additionalShippingCost: { value: '0.00', currency: 'USD' },
            sortOrder: 1,
            freeShipping: false,
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(ebayProxyUrl('/sell/account/v1/fulfillment_policy'), {
      method: 'POST',
      headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const policyId: string = data.fulfillmentPolicyId;
      policyCache.set(cacheKey, policyId);
      console.log(
        `[eBay FvfFlat] created organizer=${organizerId} flatRate=${flatRateStr} policy=${policyId} estimatedRate=${cheapest.rate}`
      );
      return { policyId, flatRate };
    }

    const errText = await res.text();
    // 20400 = policy name already exists — adopt it
    if (errText.includes('20400') || /already exists/i.test(errText)) {
      const adopted = await findExistingFlatRatePolicy(accessToken, policyName);
      if (adopted) {
        policyCache.set(cacheKey, adopted);
        console.log(
          `[eBay FvfFlat] adopted on 20400 organizer=${organizerId} flatRate=${flatRateStr} policy=${adopted}`
        );
        return { policyId: adopted, flatRate };
      }
    }

    console.warn(
      `[eBay FvfFlat] create failed organizer=${organizerId} flatRate=${flatRateStr} status=${res.status} err=${errText.slice(0, 200)}`
    );
    return null;
  } catch (err) {
    console.warn(`[eBay FvfFlat] provisioning error organizer=${organizerId}`, err);
    return null;
  }
}

/**
 * (S-gap-fill, 2026-08-09) Provision a named, reusable weight-tier eBay fulfillment
 * policy at a specific weight bucket -- e.g. "7+ lb Ground Advantage $20.00" -- using
 * the SAME cheapest-carrier / FVF-gross-up / bucket-rounding pipeline as
 * ensureFvfFlatRatePolicy above (computeCheapestForOrigin -> computeFvfFlatRate ->
 * roundUpToBucket). No new pricing formula.
 *
 * Distinct from ensureFvfFlatRatePolicy in three ways:
 *   1. Named for a WEIGHT BUCKET the organizer can reuse across many items ("N+ lb
 *      Ground Advantage $X.XX"), not a single item's exact flat rate ("FindA.Sale
 *      Flat $X.XX"). Matches the naming convention of an organizer's existing
 *      hand-built weight-tier ladder (EbayPolicyMapping.weightTierMappings) so
 *      ebayPolicyParser.ts's `/\+\s*lb/i` weight-tier classifier still recognizes it.
 *   2. Priced at the TOP of the bucket (bucketMaxLb, no dims) rather than an item's
 *      actual measured weight/dims -- this provisions a durable, reusable ladder rung,
 *      not a one-off per-item policy.
 *   3. Obtains a guaranteed-fresh access token via refreshEbayAccessToken() (same
 *      pattern used by checkEbayPolicyLiveness/saveEbayPolicyMapping callers in
 *      ebayController.ts) instead of reading conn.accessToken directly, since this is
 *      typically invoked as a one-off provisioning action, not a hot per-item path.
 *
 * Root cause this fills: an organizer's manually-built weightTierMappings ladder can
 * have a gap between its highest granular tier and a much-larger catch-all (e.g.
 * "6+ lb / <=111oz" then nothing until "45 lb / <=720oz" FedEx catch-all). The
 * gap-overshoot guard in ebayController.ts / ebayShippingResolver.ts correctly
 * detects and blocks that overcharge scenario (safe, no fix needed there) -- this
 * function lets the caller proactively provision the missing rungs so items in the
 * gap land on a proper shared named tier instead of falling back to a one-off
 * FVF-flat policy or getting blocked for manual review.
 *
 * Returns the same shape as a WeightTierMapping entry (ebayPolicyParser.ts) plus the
 * computed flatRate, or null if provisioning failed.
 */
/**
 * (S-gap-fill, 2026-08-09) Pure, side-effect-free rate computation for a named
 * weight-tier bucket -- same pipeline as ensureNamedWeightTierPolicy below
 * (computeCheapestForOrigin -> computeFvfFlatRate -> roundUpToBucket), extracted
 * so a preview endpoint can show the organizer what a gap-fill tier WOULD cost
 * without provisioning a real eBay policy (no fetch, no DB write, no eBay call).
 * ensureNamedWeightTierPolicy calls this same function internally so preview and
 * provisioning can never disagree on the price.
 */
export async function computeNamedWeightTierRate(
  bucketMaxLb: number,
  fromZip: string | null | undefined,
  origin: { lat: number | null | undefined; lng: number | null | undefined }
): Promise<{ maxOz: number; policyName: string; flatRate: number }> {
  const maxOz = Math.round(bucketMaxLb * 16);

  // Price at the top of the bucket (no dims — this is a reusable ladder rung, not a
  // per-item policy, and out of scope for the AHS/Large-Package dimension/packaging
  // triggers, which need real per-item dims/packageType -- ADR-103 Phase 4), gross up
  // for eBay's FVF on shipping, round UP into the bucket ladder. A weight-only bucket
  // CAN still exceed a carrier's absolute weight max (e.g. a 150lb+ catch-all rung) --
  // computeCheapestForOrigin throws ShippingHardBlockError in that case; this is a rare,
  // organizer-configuration-time path (not a live per-item price), so we let it
  // propagate to the caller rather than silently returning a wrong number.
  const cheapest = await computeCheapestForOrigin({
    weightOz: maxOz,
    dims: null,
    origin: { zip: fromZip ?? null, lat: origin.lat ?? null, lng: origin.lng ?? null },
    // No item/categoryId/price in scope here -- this prices a shared weight-only ladder
    // rung (see function header), not a specific item, so Standard Envelope eligibility
    // (which requires both a categoryId and a price) intentionally cannot be evaluated
    // for this call.
    categoryId: null,
    priceUsd: null,
  });

  const flatRate = roundUpToBucket(computeFvfFlatRate(cheapest.rate));
  const policyName = `${bucketMaxLb}+ lb Ground Advantage $${flatRate.toFixed(2)}`;
  return { maxOz, policyName, flatRate };
}

export async function ensureNamedWeightTierPolicy(
  organizerId: string,
  bucketMaxLb: number,
  fromZip: string | null | undefined
): Promise<{ maxOz: number; policyId: string; policyName: string; flatRate: number } | null> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: { ebayConnection: true },
  });

  const conn = organizer?.ebayConnection;
  if (!conn) {
    console.warn(`[eBay NamedTier] organizer=${organizerId} not connected`);
    return null;
  }

  const accessToken = await refreshEbayAccessToken(organizerId);
  if (!accessToken) {
    console.warn(`[eBay NamedTier] organizer=${organizerId} could not obtain a valid access token`);
    return null;
  }

  // Same pricing pipeline as computeNamedWeightTierRate's preview-only call --
  // provisioning and preview can never disagree because they share this function.
  let maxOz: number, policyName: string, flatRate: number;
  try {
    ({ maxOz, policyName, flatRate } = await computeNamedWeightTierRate(bucketMaxLb, fromZip, {
      lat: organizer?.lat ?? null,
      lng: organizer?.lng ?? null,
    }));
  } catch (err) {
    if (err instanceof ShippingHardBlockError) {
      console.warn(`[eBay NamedTier] organizer=${organizerId} bucket=${bucketMaxLb}lb hard-blocked: ${err.message}`);
      return null;
    }
    throw err;
  }
  const flatRateStr = flatRate.toFixed(2);
  const handlingTimeDays = conn.handlingTimeDays ?? 3;

  // Idempotent: adopt an existing policy with this exact name before creating.
  const existing = await findExistingFlatRatePolicy(accessToken, policyName);
  if (existing) {
    console.log(
      `[eBay NamedTier] adopted existing organizer=${organizerId} bucket=${bucketMaxLb}lb policy=${existing} name="${policyName}"`
    );
    return { maxOz, policyId: existing, policyName, flatRate };
  }

  const body = {
    name: policyName,
    marketplaceId: 'EBAY_US',
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    handlingTime: { unit: 'DAY', value: handlingTimeDays },
    shippingOptions: [
      {
        optionType: 'DOMESTIC',
        costType: 'FLAT_RATE',
        shippingServices: [
          {
            // Generic flat-rate service code (matches ensureFvfFlatRatePolicy and the
            // organizer's own existing weight-tier policies) -- carrier-specific codes
            // are CALCULATED-only and rejected by LSAS for FLAT_RATE policies (S975).
            shippingServiceCode: 'ShippingMethodStandard',
            shippingCarrierCode: 'GENERIC',
            shippingCost: { value: flatRateStr, currency: 'USD' },
            additionalShippingCost: { value: '0.00', currency: 'USD' },
            sortOrder: 1,
            freeShipping: false,
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(ebayProxyUrl('/sell/account/v1/fulfillment_policy'), {
      method: 'POST',
      headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const policyId: string = data.fulfillmentPolicyId;
      console.log(
        `[eBay NamedTier] created organizer=${organizerId} bucket=${bucketMaxLb}lb policy=${policyId} name="${policyName}" flatRate=${flatRate}`
      );
      return { maxOz, policyId, policyName, flatRate };
    }

    const errText = await res.text();
    // 20400 = policy name already exists — adopt it
    if (errText.includes('20400') || /already exists/i.test(errText)) {
      const adopted = await findExistingFlatRatePolicy(accessToken, policyName);
      if (adopted) {
        console.log(
          `[eBay NamedTier] adopted on 20400 organizer=${organizerId} bucket=${bucketMaxLb}lb policy=${adopted} name="${policyName}"`
        );
        return { maxOz, policyId: adopted, policyName, flatRate };
      }
    }

    console.warn(
      `[eBay NamedTier] create failed organizer=${organizerId} bucket=${bucketMaxLb}lb status=${res.status} err=${errText.slice(0, 200)}`
    );
    return null;
  } catch (err) {
    console.warn(`[eBay NamedTier] provisioning error organizer=${organizerId} bucket=${bucketMaxLb}lb`, err);
    return null;
  }
}

/**
 * Fetch the organizer's fulfillment policies and return the id of the one
 * whose name exactly matches policyName.
 */
async function findExistingFlatRatePolicy(
  accessToken: string,
  policyName: string
): Promise<string | null> {
  try {
    const res = await fetch(
      ebayProxyUrl('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100'),
      { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const policies: any[] = data.fulfillmentPolicies || [];
    const match = policies.find((p) => p.name === policyName);
    return match?.fulfillmentPolicyId || null;
  } catch (err) {
    console.warn('[eBay FvfFlat] findExisting failed', err);
    return null;
  }
}
