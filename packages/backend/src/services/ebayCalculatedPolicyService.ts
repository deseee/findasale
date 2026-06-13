/**
 * ebayCalculatedPolicyService — auto-provisions an eBay CALCULATED-cost
 * fulfillment policy for an organizer so buyers pay the real shipping rate eBay
 * computes at checkout.
 *
 * All eBay API calls route through the Vercel proxy (Railway DNS cannot resolve
 * api.ebay.com), matching the helpers used in ebayController.ts.
 *
 * Idempotent: if the connection already has a calculatedFulfillmentPolicyId we
 * return it; if eBay reports the policy name already exists (error 20400) we GET
 * the policy list and adopt the matching one.
 */

import { prisma } from '../lib/prisma';

const CALCULATED_POLICY_NAME = 'FindA.Sale Calculated Domestic';

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
            shippingServiceCode: 'USPSGroundAdvantage',
            shippingCarrierCode: 'USPS',
            sortOrder: 1,
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
