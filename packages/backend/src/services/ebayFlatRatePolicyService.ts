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
import {
  computeCheapestForOrigin,
  EBAY_SHIPPING_FVF_RATE,
  ShippingHardBlockError,
  billableLb,
  DIM_DIVISOR_USPS,
  USPS_CUBIC_MAX_CU_IN,
  USPS_CUBIC_RATE_TABLE,
} from './ebayRateEstimateService';
import { refreshEbayAccessToken } from './ebayHttp';

// roundUpToBucket + applyCharmPricing moved to utils/shippingPriceMath.ts (2026-08-16)
// when charm pricing was extended to native-checkout shipping, so the native path no
// longer has to import shared arithmetic out of an eBay-specific service. Bodies are
// unchanged; re-exported here so every existing import of this module (and the jest mock
// of it in __tests__/ebayShippingResolver.standardEnvelope.test.ts) is unaffected.
import { roundUpToBucket, applyCharmPricing } from '../utils/shippingPriceMath';
export { roundUpToBucket, applyCharmPricing };

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
 * Regions excluded from every fulfillment policy the app creates (sibling of
 * shippingOptions, NOT inside shippingServices).
 * NOTE: these strings match the eBay UI labels and Trading-API prose; they are NOT yet
 * confirmed from a live eBay response. 'US Protectorates' is intended to cover
 * USVI/Puerto Rico/Guam etc. Background: a guitar case was sold to USVI on a flat
 * policy on 2026-10-07. Measured cost data lives in ebayRateEstimateService.ts
 * ISLAND_AK_RATE_TABLE. Because the strings are unconfirmed, creates go through
 * postFulfillmentPolicyWithFallback, which retries once without shipToLocations.
 */
export const DEFAULT_EXCLUDED_SHIP_TO = {
  regionExcluded: [
    { regionName: 'Alaska/Hawaii' },
    { regionName: 'APO/FPO' },
    { regionName: 'US Protectorates' },
  ],
};

/**
 * Zone-9 (AK / HI / PR / USVI / protectorates) shipping tiers. Zone-9 destinations are only
 * allowed for light, small packages; each tier maps to a seller-created eBay shipping
 * rate table in Surcharge mode (T1 +$4.99, T2 +$9.99, T3 +$11.99; see ZONE9_RATE_TABLES).
 * The policy body references it via shippingOptions[].rateTableId (resolved by exact table
 * name from GET /sell/account/v1/rate_table). SAFETY: a T1-T3 policy (light exclusions)
 * is only ever built when its rate table id was resolved; otherwise the item is demoted
 * to T4 (full AK/HI/PR exclusions) so it can never ship to AK/HI/PR without the surcharge.
 *   T1: billable <= 2 lb  and <= 1 cu ft
 *   T2: billable > 2 to 6 lb  and <= 1 cu ft
 *   T3: billable > 6 to 20 lb and <= 1 cu ft
 *   T4: anything over 20 lb OR over 1 cu ft (or unknown weight/dims) -- Lower 48 only.
 */
export type Zone9Tier = 'T1' | 'T2' | 'T3' | 'T4';

export function zone9Tier(billableLbValue: number, cubicFt: number): Zone9Tier {
  if (!Number.isFinite(billableLbValue) || !Number.isFinite(cubicFt)) return 'T4';
  if (billableLbValue <= 0 || cubicFt < 0) return 'T4';
  if (cubicFt > 1 || billableLbValue > 20) return 'T4';
  if (billableLbValue <= 2) return 'T1';
  if (billableLbValue <= 6) return 'T2';
  return 'T3';
}

/**
 * Tier for a concrete package. Missing/zero weight or missing/zero dims -> T4 (safe:
 * Lower 48 only). Uses the USPS billable weight (dim weight applies only above 1 cu ft,
 * which is T4 anyway) and cubic feet = LxWxH / 1728.
 */
export function zone9TierForPackage(
  weightOz: number | null | undefined,
  dims: { length?: number | null; width?: number | null; height?: number | null } | null | undefined
): Zone9Tier {
  const oz = Number(weightOz);
  const L = Number(dims?.length);
  const W = Number(dims?.width);
  const H = Number(dims?.height);
  if (!Number.isFinite(oz) || oz <= 0) return 'T4';
  if (!(L > 0) || !(W > 0) || !(H > 0)) return 'T4';
  const { lb } = billableLb(oz, dims ?? null, DIM_DIVISOR_USPS, USPS_CUBIC_MAX_CU_IN);
  return zone9Tier(lb, (L * W * H) / 1728);
}

const ZONE9_TIER_LABEL: Record<Zone9Tier, string> = {
  T1: 'Up to 2 lb',
  T2: '3-6 lb',
  T3: '7-20 lb',
  T4: 'Lower 48 only',
};

/**
 * Single source of truth for the seller's hand-made AK/HI/PR surcharge rate tables
 * (eBay Seller Hub > Shipping rate tables, Surcharge mode). `tableName` must match the
 * seller's table EXACTLY; `surchargeUsd` drives the "AK/HI/PR +$Y" policy-name suffix.
 */
export const ZONE9_RATE_TABLES: Record<'T1' | 'T2' | 'T3', { tableName: string; surchargeUsd: number }> = {
  T1: { tableName: 'T1 up to 2 lb AK HI PR surcharge 4.99', surchargeUsd: 4.99 },
  T2: { tableName: 'T2 3 to 6 lb AK HI PR surcharge 9.99', surchargeUsd: 9.99 },
  T3: { tableName: 'T3 7 to 20 lb AK HI PR surcharge 11.99', surchargeUsd: 11.99 },
};

const zone9SurchargeSuffix = (t: 'T1' | 'T2' | 'T3'): string =>
  ` | AK/HI/PR +$${ZONE9_RATE_TABLES[t].surchargeUsd.toFixed(2)}`;

const ZONE9_TIER_SUFFIX: Record<Zone9Tier, string> = {
  T1: zone9SurchargeSuffix('T1'),
  T2: zone9SurchargeSuffix('T2'),
  T3: zone9SurchargeSuffix('T3'),
  T4: '',
};

export const zone9TierLabel = (tier: Zone9Tier): string => ZONE9_TIER_LABEL[tier];
export const zone9TierSuffix = (tier: Zone9Tier): string => ZONE9_TIER_SUFFIX[tier];

/** eBay caps policy names at 64 characters. */
const EBAY_POLICY_NAME_MAX = 64;

// ── Price basis (WHY the flat price is what it is) ───────────────────────────────────
//
// The flat price is the cheapest modeled rate across the USPS weight ladder, UPS, FedEx,
// USPS cubic and Standard Envelope. A T1-T3 policy name carries a BASIS segment so
// "$13.99" (a cubic-foot price) is never confused with "$18.99" (a weight price).

export interface PriceBasis {
  kind: 'cubic' | 'weight';
  /** Stable key for cache keys: two different bases with the same price must not collide. */
  key: string;
  /** Name segment. cubic: rung range ("0.1-0.2 cu ft"); weight/other: band text. */
  text: string;
}

const fmtCuFt = (n: number): string => String(parseFloat(n.toFixed(2)));

/**
 * Weight band text for a billable weight in lb: <1 "Under 1 lb"; ==1 "1 lb";
 * otherwise "Over N-1 to N lb" with N = ceil(lb) (2.06 -> "Over 2 to 3 lb").
 */
export function weightBandText(lb: number): string {
  const b = Number.isFinite(lb) && lb > 0 ? lb : 0;
  if (b < 1 - 1e-9) return 'Under 1 lb';
  if (b <= 1 + 1e-9) return '1 lb';
  const n = Math.ceil(b - 1e-9);
  return `Over ${n - 1} to ${n} lb`;
}

/** Rung range text for a USPS_CUBIC_RATE_TABLE tierLabel, or null if unknown. */
export function cubicRungText(tierLabel: string | null | undefined): { text: string; key: string } | null {
  if (!tierLabel || !Array.isArray(USPS_CUBIC_RATE_TABLE)) return null;
  const idx = USPS_CUBIC_RATE_TABLE.findIndex((r) => r.tierLabel === tierLabel);
  if (idx < 0) return null;
  const max = USPS_CUBIC_RATE_TABLE[idx].maxCuFt;
  const prev = idx > 0 ? USPS_CUBIC_RATE_TABLE[idx - 1].maxCuFt : null;
  const text = prev == null ? `Up to ${fmtCuFt(max)} cu ft` : `${fmtCuFt(prev)}-${fmtCuFt(max)} cu ft`;
  return { text, key: `cubic:${fmtCuFt(max)}` };
}

const CARRIER_WORD: Record<string, string> = { UPS: 'UPS', FEDEX: 'FedEx' };

/**
 * Derive the price basis from computeCheapestForOrigin's result. Pure and deterministic,
 * so the preview (ebayShippingResolver) and the push path (ensureFvfFlatRatePolicy /
 * ensureCalculatedPolicyWithHandling) produce identical names for the same item.
 * Billable weight is recomputed from weightOz + dims (all three carriers share the 139
 * dim divisor; USPS applies dim weight only above 1 cu ft -- same gate as the engine).
 */
export function priceBasisFromCheapest(
  cheapest: { carrier?: string; basis?: string; cubicTierLabel?: string | null } | null | undefined,
  weightOz: number,
  dims: { length?: number | null; width?: number | null; height?: number | null } | null | undefined
): PriceBasis | null {
  if (!cheapest) return null;
  const b = cheapest.basis;
  if (b === 'cubic') {
    const rung = cubicRungText(cheapest.cubicTierLabel);
    if (rung) return { kind: 'cubic', key: rung.key, text: rung.text };
    // unknown rung label -> fall through to a weight band rather than guess
  }
  // standard_envelope (unmatched fall-through only -- matched envelope wins are routed to the
  // seller's own envelope policy and never named here) is labelled by its weight band, NOT
  // "Std Envelope": classifyPolicy would otherwise mistake our own flat policy for the
  // seller's real envelope policy in matchStandardEnvelopePolicy.
  const carrier = cheapest.carrier === 'UPS' || cheapest.carrier === 'FEDEX' ? cheapest.carrier : 'USPS';
  const { lb } = billableLb(weightOz, dims ?? null, DIM_DIVISOR_USPS, carrier === 'USPS' ? USPS_CUBIC_MAX_CU_IN : undefined);
  const band = weightBandText(lb);
  const word = b === 'media_mail' ? 'Media Mail' : CARRIER_WORD[carrier];
  const text = word ? `${word} ${band.charAt(0).toLowerCase()}${band.slice(1)}` : band;
  return { kind: 'weight', key: `${b === 'media_mail' ? 'MEDIA' : carrier}:${band}`, text };
}

/** Cache-key segment for a basis (T4 names carry no basis, so it never splits T4 keys). */
export const priceBasisKey = (tier: Zone9Tier, basis: PriceBasis | null | undefined): string =>
  tier === 'T4' ? 'na' : basis?.key ?? 'none';

/**
 * Compose a T1-T3 name "<head> | <pricePart><AK/HI/PR suffix>" where head is
 *   cubic: "<tier label> | <rung range>"; weight/other: the band text (carries the tier).
 * Never exceeds 64 chars and the AK/HI/PR suffix is never truncated: if too long the head
 * is shortened first (compact cu-ft, then tier label only, then hard-trimmed).
 */
export function composeTieredPolicyName(
  tier: Exclude<Zone9Tier, 'T4'>,
  basis: PriceBasis | null | undefined,
  pricePart: string
): string {
  const label = ZONE9_TIER_LABEL[tier];
  const tail = ` | ${pricePart}${ZONE9_TIER_SUFFIX[tier]}`;
  const heads: string[] = [];
  if (basis?.kind === 'cubic') {
    heads.push(`${label} | ${basis.text}`, `${label} | ${basis.text.replace(' cu ft', 'cf')}`);
  } else if (basis) {
    heads.push(basis.text);
  }
  heads.push(label);
  for (const h of heads) {
    if (h.length + tail.length <= EBAY_POLICY_NAME_MAX) return `${h}${tail}`;
  }
  return `${label.slice(0, Math.max(0, EBAY_POLICY_NAME_MAX - tail.length))}${tail}`.slice(-EBAY_POLICY_NAME_MAX);
}

/**
 * Flat policy name.
 *   T1-T3: "3-6 lb | 0.1-0.2 cu ft | Flat $13.99 | AK/HI/PR +$9.99" (cubic win) or
 *          "Over 2 to 3 lb | Flat $18.99 | AK/HI/PR +$9.99" (weight win) or
 *          "UPS over 1 to 2 lb | Flat $19.99 | AK/HI/PR +$4.99" (UPS/FedEx win).
 *   T4:    "Lower 48 only | Flat $49.99" (no basis; unchanged).
 * `basis` null (no cheapest result available) falls back to the bare tier label.
 */
export function buildFlatPolicyName(tier: Zone9Tier, flatRateStr: string, basis: PriceBasis | null): string {
  if (tier === 'T4') return `${ZONE9_TIER_LABEL.T4} | Flat $${flatRateStr}`.slice(0, EBAY_POLICY_NAME_MAX);
  return composeTieredPolicyName(tier, basis, `Flat $${flatRateStr}`);
}

/**
 * Legacy (pre-tier) flat policy name "FindA.Sale Flat $X.XX". Legacy policies exclude
 * AK/HI + protectorates, i.e. they are semantically T4, so they are only adopted for T4.
 */
export const legacyFlatPolicyName = (flatRateStr: string): string => `${POLICY_NAME_PREFIX}${flatRateStr}`;

/**
 * Names to look up for (tier, price, basis), preferred first. T1-T3: the new basis name
 * ONLY (old tier-only names are intentionally never adopted). T4: new name, then legacy.
 */
export function flatPolicyNameCandidates(tier: Zone9Tier, flatRateStr: string, basis: PriceBasis | null): string[] {
  const names = [buildFlatPolicyName(tier, flatRateStr, basis)];
  if (tier === 'T4') names.push(legacyFlatPolicyName(flatRateStr));
  return names;
}

// ── Seller rate-table lookup (Account API GET /rate_table) ───────────────────────────
// Response shape (eBay Account API getRateTables): { rateTables: [{ rateTableId, name,
// locality: 'DOMESTIC'|'INTERNATIONAL', countryCode }] }. Cached per organizer.

const RATE_TABLE_CACHE_TTL_MS = 10 * 60 * 1000;
/** Within this window a cached miss/failure is trusted (avoids a GET per item). */
const RATE_TABLE_RETRY_AFTER_MS = 60 * 1000;

interface RateTableCacheEntry {
  fetchedAt: number;
  /** table name -> rateTableId; null when the last fetch failed. */
  ids: Map<string, string> | null;
}
const rateTableCache = new Map<string, RateTableCacheEntry>();

/** Test hook: clear the per-organizer rate-table cache. */
export function clearZone9RateTableCache(): void {
  rateTableCache.clear();
}

async function fetchRateTableIds(accessToken: string): Promise<Map<string, string> | null> {
  try {
    const res = await fetch(
      ebayProxyUrl('/sell/account/v1/rate_table?country_code=US'),
      { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
    );
    if (!res.ok) {
      console.warn(`[eBay RateTable] GET rate_table failed status=${res.status}`);
      return null;
    }
    const data = (await res.json()) as any;
    const tables: any[] = Array.isArray(data?.rateTables) ? data.rateTables : [];
    const ids = new Map<string, string>();
    for (const t of tables) {
      if (!t?.name || !t?.rateTableId) continue;
      if (t.locality && String(t.locality).toUpperCase() !== 'DOMESTIC') continue;
      ids.set(String(t.name), String(t.rateTableId));
    }
    return ids;
  } catch (err) {
    console.warn('[eBay RateTable] GET rate_table error', err);
    return null;
  }
}

/**
 * rateTableId of the seller's surcharge table for a T1-T3 tier (exact name match), or
 * null when the lookup fails / the table does not exist. Never throws.
 */
export async function getZone9RateTableId(
  accessToken: string,
  organizerId: string,
  tier: Zone9Tier
): Promise<string | null> {
  if (tier === 'T4') return null;
  const wanted = ZONE9_RATE_TABLES[tier].tableName;
  const now = Date.now();
  const entry = rateTableCache.get(organizerId);
  if (entry) {
    const age = now - entry.fetchedAt;
    const hit = entry.ids?.get(wanted) ?? null;
    if (hit && age < RATE_TABLE_CACHE_TTL_MS) return hit;
    if (age < RATE_TABLE_RETRY_AFTER_MS) return hit; // recent miss/failure: do not hammer eBay
  }
  const ids = await fetchRateTableIds(accessToken);
  rateTableCache.set(organizerId, { fetchedAt: now, ids });
  const id = ids?.get(wanted) ?? null;
  if (!id) {
    console.warn(
      `[eBay RateTable] organizer=${organizerId} tier=${tier} table "${wanted}" ${ids ? 'NOT FOUND among the seller rate tables' : 'lookup failed'}`
    );
  }
  return id;
}

/**
 * Decide the effective tier + rate table for a package. FAIL SAFE: a T1-T3 package whose
 * surcharge table cannot be resolved is demoted to T4 (full exclusions, T4 name) -- a
 * light-exclusion policy is never built without its rate table.
 */
export async function resolveZone9TierWithRateTable(
  accessToken: string,
  organizerId: string,
  weightOz: number,
  dims: { length?: number | null; width?: number | null; height?: number | null } | null | undefined,
  tag: string
): Promise<{ tier: Zone9Tier; rateTableId: string | null }> {
  const tier = zone9TierForPackage(weightOz, dims);
  if (tier === 'T4') return { tier, rateTableId: null };
  const rateTableId = await getZone9RateTableId(accessToken, organizerId, tier);
  if (!rateTableId) {
    console.warn(
      `[eBay ${tag}] organizer=${organizerId} rate table for ${tier} unavailable -- falling back to T4 (Lower 48 only, full exclusions)`
    );
    return { tier: 'T4', rateTableId: null };
  }
  return { tier, rateTableId };
}

/**
 * Adoption guard for an EXISTING T1-T3 policy found by name. Reuse only if (a) its
 * exclusions are light (do not exclude Alaska/Hawaii/US Protectorates) and (b) its
 * domestic shippingOption carries the expected rateTableId. If the response omits
 * rateTableId we cannot prove the surcharge is attached, so we log and refuse.
 */
export function isZone9PolicyAdoptable(policy: any, expectedRateTableId: string, tag: string): boolean {
  const excluded: string[] = (policy?.shipToLocations?.regionExcluded ?? [])
    .map((r: any) => String(r?.regionName ?? ''))
    .filter(Boolean);
  if (excluded.some((n) => /alaska|hawaii|protectorate/i.test(n))) {
    console.warn(`[eBay ${tag}] not adopting "${policy?.name}": exclusions are not light (${JSON.stringify(excluded)})`);
    return false;
  }
  const opts: any[] = Array.isArray(policy?.shippingOptions) ? policy.shippingOptions : [];
  const dom = opts.find((o) => o?.optionType === 'DOMESTIC') ?? opts[0];
  const stored = dom?.rateTableId;
  if (stored == null || stored === '') {
    console.warn(`[eBay ${tag}] not adopting "${policy?.name}": response carries no shippingOptions[].rateTableId`);
    return false;
  }
  if (String(stored) !== String(expectedRateTableId)) {
    console.warn(`[eBay ${tag}] not adopting "${policy?.name}": rateTableId ${stored} != expected ${expectedRateTableId}`);
    return false;
  }
  return true;
}

/**
 * Exclusions per tier: T4 keeps the full DEFAULT_EXCLUDED_SHIP_TO (AK/HI, APO/FPO,
 * US Protectorates); T1-T3 exclude only APO/FPO so AK/HI/PR/USVI stay shippable (priced
 * by the manually-attached rate-table surcharge).
 */
export const TIER_LIGHT_EXCLUDED_SHIP_TO = {
  regionExcluded: [{ regionName: 'APO/FPO' }],
};
export function shipToLocationsForTier(tier: Zone9Tier) {
  return tier === 'T4' ? DEFAULT_EXCLUDED_SHIP_TO : TIER_LIGHT_EXCLUDED_SHIP_TO;
}

/**
 * POST a fulfillment-policy create body. If eBay rejects it (HTTP 400, or an error that
 * mentions region/shipToLocations/regionName/exclude) and the body carries shipToLocations,
 * warn and retry ONCE without it so a bad region string can never block policy creation.
 * 20400 (name already exists) is NOT retried -- callers adopt-by-name as before.
 * The returned Response body is still readable by the caller.
 */
export async function postFulfillmentPolicyWithFallback(
  accessToken: string,
  body: Record<string, any>,
  tag: string
): Promise<Response> {
  const post = (b: Record<string, any>) =>
    fetch(ebayProxyUrl('/sell/account/v1/fulfillment_policy'), {
      method: 'POST',
      headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() },
      body: JSON.stringify(b),
    });
  const res = await post(body);
  if (res.ok || !body.shipToLocations) return res;
  let errText = '';
  try { errText = await res.clone().text(); } catch { /* ignore */ }
  if (errText.includes('20400') || /already exists/i.test(errText)) return res;
  if (res.status === 400 || /region|shipToLocations|regionName|exclude/i.test(errText)) {
    console.warn(
      `[eBay ${tag}] create rejected with shipToLocations (status=${res.status}) -- region strings may be wrong; retrying once WITHOUT shipToLocations. err=${errText.slice(0, 300)}`
    );
    const { shipToLocations: _omit, ...rest } = body;
    return post(rest);
  }
  return res;
}

/** Best-effort: GET the created policy and log whether regionExcluded came back. Never throws. */
export async function logPolicyShipToLocations(
  accessToken: string,
  policyId: string,
  tag: string,
  expectedRateTableId?: string | null
): Promise<void> {
  try {
    const res = await fetch(
      ebayProxyUrl(`/sell/account/v1/fulfillment_policy/${encodeURIComponent(policyId)}`),
      { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
    );
    if (!res.ok) {
      console.warn(`[eBay ${tag}] shipToLocations check: GET policy=${policyId} status=${res.status}`);
      return;
    }
    const data = (await res.json()) as any;
    const names: string[] = (data?.shipToLocations?.regionExcluded ?? [])
      .map((r: any) => r?.regionName)
      .filter(Boolean);
    if (expectedRateTableId) {
      const dom = (Array.isArray(data?.shippingOptions) ? data.shippingOptions : []).find((o: any) => o?.optionType === 'DOMESTIC');
      console.warn(
        dom?.rateTableId === expectedRateTableId
          ? `[eBay ${tag}] policy=${policyId} rateTableId attached (${expectedRateTableId})`
          : `[eBay ${tag}] policy=${policyId} rateTableId NOT confirmed on returned policy (expected ${expectedRateTableId}, got ${dom?.rateTableId ?? 'absent'})`
      );
    }
    console.warn(
      names.length
        ? `[eBay ${tag}] policy=${policyId} regionExcluded populated: ${JSON.stringify(names)}`
        : `[eBay ${tag}] policy=${policyId} regionExcluded EMPTY/absent on returned policy (exclusions not applied)`
    );
  } catch (err) {
    console.warn(`[eBay ${tag}] shipToLocations check failed (non-fatal) policy=${policyId}`, err);
  }
}

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

  const flatRate = applyCharmPricing(roundUpToBucket(computeFvfFlatRate(cheapest.rate)));
  const flatRateStr = flatRate.toFixed(2);
  const accessToken = conn.accessToken;
  // Tier decides the name, ship-to exclusions and rate table: a heavy/big (or unmeasured)
  // item is T4 and can never land on a T1-T3 (AK/HI/PR-allowed) policy. FAIL SAFE: a
  // T1-T3 item whose surcharge rate table cannot be resolved is demoted to T4.
  const { tier, rateTableId } = await resolveZone9TierWithRateTable(accessToken, organizerId, weightOz, dims, 'FvfFlat');
  // Basis (why the price is what it is) is part of the T1-T3 name and the cache key.
  const basis = priceBasisFromCheapest(cheapest, weightOz, dims);
  const policyNames = flatPolicyNameCandidates(tier, flatRateStr, basis);
  const policyName = policyNames[0];

  const cacheKey = `${organizerId}:${tier}:${priceBasisKey(tier, basis)}:${flatRateStr}`;
  const cached = policyCache.get(cacheKey);
  if (cached) {
    console.log(
      `[eBay FvfFlat] cache hit organizer=${organizerId} flatRate=${flatRateStr} policy=${cached}`
    );
    return { policyId: cached, flatRate };
  }

  const handlingTimeDays = conn.handlingTimeDays ?? 3;

  // Check if a policy with this name already exists before creating (T1-T3: only if it
  // is light AND carries the expected rate table).
  const existing = await findExistingFlatRatePolicy(accessToken, policyNames, rateTableId);
  if (existing) {
    policyCache.set(cacheKey, existing);
    console.log(
      `[eBay FvfFlat] adopted existing organizer=${organizerId} tier=${tier} flatRate=${flatRateStr} policy=${existing}`
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
        // AK/HI/PR surcharge table (T1-T3 only; null for T4 -- tier is T4 whenever the
        // table could not be resolved, so light exclusions never ship without it).
        ...(rateTableId ? { rateTableId } : {}),
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
    shipToLocations: shipToLocationsForTier(tier),
  };

  try {
    const res = await postFulfillmentPolicyWithFallback(accessToken, body, 'FvfFlat');

    if (res.ok) {
      const data = (await res.json()) as any;
      const policyId: string = data.fulfillmentPolicyId;
      policyCache.set(cacheKey, policyId);
      void logPolicyShipToLocations(accessToken, policyId, 'FvfFlat', rateTableId);
      console.log(
        `[eBay FvfFlat] created organizer=${organizerId} tier=${tier} flatRate=${flatRateStr} policy=${policyId} estimatedRate=${cheapest.rate}`
      );
      return { policyId, flatRate };
    }

    const errText = await res.text();
    // 20400 = policy name already exists — adopt it
    if (errText.includes('20400') || /already exists/i.test(errText)) {
      const adopted = await findExistingFlatRatePolicy(accessToken, policyNames, rateTableId);
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

  const flatRate = applyCharmPricing(roundUpToBucket(computeFvfFlatRate(cheapest.rate)));
  const policyName = `${bucketMaxLb}+ lb Ground Advantage $${flatRate.toFixed(2)}`;
  return { maxOz, policyName, flatRate };
}

// NOTE (zone-9 tiers): named weight-tier rungs ("N+ lb Ground Advantage $X") are priced
// weight-only with NO dims, so cube is unknown -> they are always treated as T4 (Lower 48
// only, full DEFAULT_EXCLUDED_SHIP_TO). Their names are intentionally unchanged because
// ebayPolicyParser's weight-tier classifier keys on the "+ lb" text.
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
    shipToLocations: DEFAULT_EXCLUDED_SHIP_TO,
  };

  try {
    const res = await postFulfillmentPolicyWithFallback(accessToken, body, 'NamedTier');

    if (res.ok) {
      const data = (await res.json()) as any;
      const policyId: string = data.fulfillmentPolicyId;
      void logPolicyShipToLocations(accessToken, policyId, 'NamedTier');
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
  policyName: string | string[],
  /** T1-T3 only: required rateTableId. When set, a name match is reused only if it is
   *  light-excluded and carries this rate table (see isZone9PolicyAdoptable). */
  expectedRateTableId?: string | null
): Promise<string | null> {
  try {
    const res = await fetch(
      ebayProxyUrl('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100'),
      { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const policies: any[] = data.fulfillmentPolicies || [];
    // Candidates are in preference order (tiered name first, legacy name second for T4).
    const names = Array.isArray(policyName) ? policyName : [policyName];
    for (const n of names) {
      const match = policies.find((p) => p.name === n);
      if (!match?.fulfillmentPolicyId) continue;
      if (expectedRateTableId && !isZone9PolicyAdoptable(match, expectedRateTableId, 'FvfFlat')) continue;
      return match.fulfillmentPolicyId;
    }
    return null;
  } catch (err) {
    console.warn('[eBay FvfFlat] findExisting failed', err);
    return null;
  }
}
