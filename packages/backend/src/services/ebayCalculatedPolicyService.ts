/**
 * ebayCalculatedPolicyService — auto-provisions eBay CALCULATED-cost
 * fulfillment policies for an organizer so buyers pay the real shipping rate eBay
 * computes at checkout.
 *
 * All eBay API calls route through the Vercel proxy (Railway DNS cannot resolve
 * api.ebay.com), matching the helpers used in ebayController.ts.
 *
 * Idempotent: if the connection already has a calculatedFulfillmentPolicyId we
 * return it; if eBay reports the policy name already exists (error 20400) we GET
 * the policy list and adopt the matching one.
 *
 * ensureCalculatedPolicyWithHandling (added — Patrick decision, real calculated
 * shipping + packageHandlingCost offset): CALCULATED mode previously never used
 * real eBay-calculated shipping because eBay's 13.6% FVF on the shipping charge
 * would short the organizer versus the actual USPS label cost (see
 * ebayFlatRatePolicyService.ts header for the full explanation — that flat-rate
 * system remains the fallback). eBay's Fulfillment Policy API supports a
 * `packageHandlingCost` field on a CALCULATED shippingOption (an Amount object
 * added on top of the calculated rate at checkout, not usable together with free
 * shipping) — this lets us use REAL calculated shipping while adding a handling
 * charge sized to offset eBay's FVF cut, so the organizer still nets at least the
 * estimated label cost, same protection as the flat-rate system via a different
 * mechanism. Math: bucketedRate = roundUpToBucket(estimatedRate); handlingCost =
 * computeFvfFlatRate(bucketedRate) - bucketedRate (isolates just the FVF markup
 * portion as the handling fee).
 */

import { prisma } from '../lib/prisma';
import { computeCheapestForOrigin, ShippingHardBlockError } from './ebayRateEstimateService';
import { computeFvfFlatRate, roundUpToBucket } from './ebayFlatRatePolicyService';

const CALCULATED_POLICY_NAME = 'FindA.Sale Calculated Domestic';
const CALCULATED_HANDLING_POLICY_NAME_PREFIX = 'FindA.Sale Calculated HC$';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Pure calculation shared between this file's ensureCalculatedPolicyWithHandling
 * (which provisions the real eBay policy) and ebayShippingResolver.ts's preview
 * path (which must show the SAME number the push path will actually use, without
 * provisioning anything). Bucket-then-gross-up, in this exact order -- reordering
 * (gross-up-then-bucket, the way the older FVF-flat helper computes its own flat
 * rate) lands on a different total, because bucketing is a nonlinear step function.
 */
export function computeCalculatedWithHandling(
  cheapestRate: number
): { bucketedRate: number; handlingCost: number } {
  const bucketedRate = roundUpToBucket(cheapestRate);
  // Isolate just the FVF markup portion of computeFvfFlatRate as the handling fee:
  // computeFvfFlatRate(bucketedRate) = bucketedRate / 0.864 (rounded up to the cent).
  // Subtracting bucketedRate leaves only the markup, applied as a handling charge on
  // top of the REAL calculated rate instead of replacing it outright.
  const handlingCost = round2(computeFvfFlatRate(bucketedRate) - bucketedRate);
  return { bucketedRate, handlingCost };
}

// In-process cache: `${organizerId}:${bucketedRateStr}` → eBay fulfillmentPolicyId
const handlingPolicyCache = new Map<string, string>();

const ebayProxyUrl = (path: string): string =>
  `${process.env.FRONTEND_URL ?? 'https://finda.sale'}/api/proxy/ebay?path=${path}`;

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
 * GET the organizer's fulfillment policies and return the one matching our
 * calculated policy name (used to adopt an existing policy on 20400).
 */
async function findExistingCalculatedPolicyId(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      ebayProxyUrl('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100'),
      { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const policies: any[] = data.fulfillmentPolicies || [];
    const match =
      policies.find((p) => p.name === CALCULATED_POLICY_NAME) ||
      policies.find(
        (p) =>
          Array.isArray(p.shippingOptions) &&
          p.shippingOptions.some((o: any) => o && o.costType === 'CALCULATED')
      );
    return match?.fulfillmentPolicyId || null;
  } catch (err) {
    console.warn('[eBay CalcPolicy] findExisting failed', err);
    return null;
  }
}

/**
 * Ensure the organizer has a CALCULATED-cost domestic fulfillment policy.
 * Returns the policy id, persisting it on EbayConnection.
 * Returns null if the organizer is not connected / provisioning failed.
 */
export async function ensureCalculatedFulfillmentPolicy(organizerId: string): Promise<string | null> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: { ebayConnection: true },
  });

  const conn = organizer?.ebayConnection;
  if (!conn) {
    console.warn(`[eBay CalcPolicy] organizer=${organizerId} not connected`);
    return null;
  }

  // Already provisioned
  if (conn.calculatedFulfillmentPolicyId) {
    return conn.calculatedFulfillmentPolicyId;
  }

  const accessToken = conn.accessToken;
  const handlingTimeDays = conn.handlingTimeDays ?? 3;

  const body = {
    name: CALCULATED_POLICY_NAME,
    marketplaceId: 'EBAY_US',
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    handlingTime: { unit: 'DAY', value: handlingTimeDays },
    shippingOptions: [
      {
        optionType: 'DOMESTIC',
        costType: 'CALCULATED',
        shippingServices: [
          {
            shippingServiceCode: 'USPSParcel',
            shippingCarrierCode: 'USPS',
            sortOrder: 1,
            freeShipping: false,
          },
          {
            shippingServiceCode: 'USPSPriority',
            shippingCarrierCode: 'USPS',
            sortOrder: 2,
            freeShipping: false,
          },
        ],
      },
    ],
  };

  let policyId: string | null = null;
  try {
    const res = await fetch(ebayProxyUrl('/sell/account/v1/fulfillment_policy'), {
      method: 'POST',
      headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      policyId = data.fulfillmentPolicyId || null;
      console.log(`[eBay CalcPolicy] organizer=${organizerId} created policy=${policyId}`);
    } else {
      const errText = await res.text();
      // 20400 = a policy with this name already exists -> adopt it.
      if (errText.includes('20400') || /already exists/i.test(errText)) {
        console.log(`[eBay CalcPolicy] organizer=${organizerId} policy exists (20400) — adopting existing`);
        policyId = await findExistingCalculatedPolicyId(accessToken);
      } else {
        console.warn(
          `[eBay CalcPolicy] organizer=${organizerId} create failed status=${res.status} body=${errText.slice(0, 300)}`
        );
        // Last resort: maybe a calculated policy already exists under another name.
        policyId = await findExistingCalculatedPolicyId(accessToken);
      }
    }
  } catch (err) {
    console.warn(`[eBay CalcPolicy] organizer=${organizerId} provisioning error`, err);
    policyId = await findExistingCalculatedPolicyId(accessToken);
  }

  if (policyId) {
    await prisma.ebayConnection.update({
      where: { id: conn.id },
      data: {
        calculatedFulfillmentPolicyId: policyId,
        calculatedPolicyProvisionedAt: new Date(),
      },
    });
  }

  return policyId;
}

/**
 * Compute the real-calculated-shipping-plus-handling routing for an item, then
 * get-or-create the matching eBay CALCULATED fulfillment policy (with
 * packageHandlingCost) for the organizer.
 *
 * Returns null if the organizer isn't connected or provisioning failed — caller
 * (resolvePoliciesForItem in ebayController.ts) falls back to
 * ensureFvfFlatRatePolicy (the existing flat-rate safety net) when this is null.
 */
export async function ensureCalculatedPolicyWithHandling(
  organizerId: string,
  weightOz: number,
  dims: { length?: number | null; width?: number | null; height?: number | null } | null,
  fromZip: string | null | undefined,
  packageType?: string | null,
  categoryId?: string | null
): Promise<{ policyId: string; handlingCost: number; bucketedRate: number } | null> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: { ebayConnection: true },
  });

  const conn = organizer?.ebayConnection;
  if (!conn) {
    console.warn(`[eBay CalcHandling] organizer=${organizerId} not connected`);
    return null;
  }

  // Same estimation methodology as ensureFvfFlatRatePolicy: cheapest carrier rate
  // at the organizer's farthest-CONUS coverage zone, rounded UP into the bounded
  // bucket ladder so the bucketed rate is always >= the real estimate and the
  // policy set stays small/reusable. ADR-103 Phase 4: fail safe (return null, same
  // contract as "organizer not connected") on ShippingHardBlockError rather than
  // crash -- resolvePoliciesForItem already falls through to ensureFvfFlatRatePolicy,
  // then to a soft-block-and-flag-for-review, when this returns null.
  let cheapest;
  try {
    cheapest = await computeCheapestForOrigin({
      weightOz,
      dims: dims ?? null,
      origin: { zip: fromZip ?? null, lat: organizer?.lat ?? null, lng: organizer?.lng ?? null },
      packageType: packageType ?? null,
      categoryId: categoryId ?? null,
    });
  } catch (err) {
    if (err instanceof ShippingHardBlockError) {
      console.warn(`[eBay CalcHandling] organizer=${organizerId} hard-blocked: ${err.message}`);
      return null;
    }
    throw err;
  }

  const { bucketedRate, handlingCost } = computeCalculatedWithHandling(cheapest.rate);
  const handlingCostStr = handlingCost.toFixed(2);
  const bucketedRateStr = bucketedRate.toFixed(2);
  const policyName = `${CALCULATED_HANDLING_POLICY_NAME_PREFIX}${handlingCostStr}`;

  const cacheKey = `${organizerId}:${bucketedRateStr}`;
  const cached = handlingPolicyCache.get(cacheKey);
  if (cached) {
    console.log(
      `[eBay CalcHandling] cache hit organizer=${organizerId} bucketedRate=${bucketedRateStr} handlingCost=${handlingCostStr} policy=${cached}`
    );
    return { policyId: cached, handlingCost, bucketedRate };
  }

  const accessToken = conn.accessToken;
  const handlingTimeDays = conn.handlingTimeDays ?? 3;

  // Check if a policy with this exact name already exists before creating.
  const existing = await findExistingCalculatedHandlingPolicy(accessToken, policyName);
  if (existing) {
    handlingPolicyCache.set(cacheKey, existing);
    console.log(
      `[eBay CalcHandling] adopted existing organizer=${organizerId} policyName="${policyName}" policy=${existing}`
    );
    return { policyId: existing, handlingCost, bucketedRate };
  }

  // Create the CALCULATED policy with packageHandlingCost. Per eBay's Fulfillment
  // Policy API (ShippingOption type), packageHandlingCost is a sibling of
  // optionType/costType/shippingServices at the shippingOptions[0] level — NOT
  // nested inside an individual shippingService entry.
  const body = {
    name: policyName,
    marketplaceId: 'EBAY_US',
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    handlingTime: { unit: 'DAY', value: handlingTimeDays },
    shippingOptions: [
      {
        optionType: 'DOMESTIC',
        costType: 'CALCULATED',
        packageHandlingCost: { value: handlingCostStr, currency: 'USD' },
        shippingServices: [
          {
            shippingServiceCode: 'USPSParcel',
            shippingCarrierCode: 'USPS',
            sortOrder: 1,
            freeShipping: false,
          },
          {
            shippingServiceCode: 'USPSPriority',
            shippingCarrierCode: 'USPS',
            sortOrder: 2,
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
      handlingPolicyCache.set(cacheKey, policyId);
      console.log(
        `[eBay CalcHandling] created organizer=${organizerId} bucketedRate=${bucketedRateStr} handlingCost=${handlingCostStr} policy=${policyId} estimatedRate=${cheapest.rate}`
      );
      return { policyId, handlingCost, bucketedRate };
    }

    const errText = await res.text();
    // 20400 = policy name already exists — adopt it
    if (errText.includes('20400') || /already exists/i.test(errText)) {
      const adopted = await findExistingCalculatedHandlingPolicy(accessToken, policyName);
      if (adopted) {
        handlingPolicyCache.set(cacheKey, adopted);
        console.log(
          `[eBay CalcHandling] adopted on 20400 organizer=${organizerId} policyName="${policyName}" policy=${adopted}`
        );
        return { policyId: adopted, handlingCost, bucketedRate };
      }
    }

    console.warn(
      `[eBay CalcHandling] create failed organizer=${organizerId} handlingCost=${handlingCostStr} status=${res.status} err=${errText.slice(0, 200)}`
    );
    return null;
  } catch (err) {
    console.warn(`[eBay CalcHandling] provisioning error organizer=${organizerId}`, err);
    return null;
  }
}

/**
 * Fetch the organizer's fulfillment policies and return the id of the one whose
 * name exactly matches policyName (the calculated-with-handling naming pattern).
 */
async function findExistingCalculatedHandlingPolicy(
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
    console.warn('[eBay CalcHandling] findExisting failed', err);
    return null;
  }
}
