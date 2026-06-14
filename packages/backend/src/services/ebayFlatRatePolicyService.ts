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
import { estimateBuyerShippingRate, EBAY_SHIPPING_FVF_RATE } from './ebayRateEstimateService';

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
  fromZip: string | null | undefined
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

  // Estimate the buyer-paid USPS rate
  const rateResult = estimateBuyerShippingRate({
    weightOz,
    dims: dims ?? null,
    fromZip: fromZip ?? null,
  });

  const flatRate = computeFvfFlatRate(rateResult.estimatedRate);
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
        `[eBay FvfFlat] created organizer=${organizerId} flatRate=${flatRateStr} policy=${policyId} estimatedRate=${rateResult.estimatedRate}`
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
