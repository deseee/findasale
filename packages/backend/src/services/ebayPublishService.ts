/**
 * eBay Publish Self-Heal Service (Phase 2 of the consolidation — ADR 2026-06-30).
 *
 * Holds the unified eBay publish plumbing and the four self-heal implementations
 * as an error-dispatch registry, plus the ebayPublishWithSelfHeal() loop.
 *
 * PHASE 2 STATE: nothing calls ebayPublishWithSelfHeal() yet — the inline heal
 * blocks in ebayController.pushSaleToEbay / publishItemOffer and the bare-POST
 * republish in itemController.PushSync remain the live code paths. Phase 3 rewires
 * those call-sites to this loop and deletes the inline blocks. This file compiles
 * cleanly and changes NO existing behavior.
 *
 * Dependency rule (keeps the DAG acyclic): this service statically imports ONLY
 * from services/ebayHttp (leaf HTTP + OAuth, built S1048) and lib/prisma. The one
 * cross-controller need — suggestEbayCategoryForTitle for the 25005 category healer
 * — is pulled via a lazy `await import('../controllers/ebayController')` so there is
 * no static import cycle with the controller (the controller re-imports the moved
 * helpers below).
 *
 * Moved verbatim from ebayController (getAcceptedConditionsForCategory,
 * ensureConditionValidForCategory, getRequiredAspectsForCategory, their caches,
 * the RequiredAspect interface) and from itemController (republishEbayOffer).
 * ebayController re-exports ensureConditionValidForCategory + RequiredAspect so its
 * external importers stay unbroken; itemController imports republishEbayOffer from here.
 */

import { prisma } from '../lib/prisma';
import {
  ebayProxyUrl,
  ebayProxyHeaders,
  ebayUserHeaders,
  getEbayAccessToken,
} from './ebayHttp';

// ────────────────────────────────────────────────────────────────────────────
// Relocated category/condition/aspect helpers (moved verbatim from ebayController)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Cache of per-category accepted condition enums (eBay getItemConditionPolicies).
 * Key = categoryId, value = Set of valid condition enum strings for that category.
 * Cleared implicitly on server restart; eBay policies change rarely.
 */
const CATEGORY_CONDITION_CACHE = new Map<string, Set<string>>();

/**
 * Fetch accepted conditions for a given eBay category via the Metadata API.
 * Uses the app token (client credentials) — the sell.metadata scope is app-level.
 * Returns a Set of valid enum strings, or null if the call fails (caller falls
 * back to sending the default and letting eBay reject if wrong).
 */
export async function getAcceptedConditionsForCategory(categoryId: string): Promise<Set<string> | null> {
  const cached = CATEGORY_CONDITION_CACHE.get(categoryId);
  if (cached) return cached;

  try {
    const appToken = await getEbayAccessToken();
    if (!appToken) return null;
    // Metadata API: item condition policies per marketplace, filtered by categoryId
    const path = encodeURIComponent(
      `/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?filter=categoryIds:%7B${categoryId}%7D`
    );
    const res = await fetch(ebayProxyUrl(path), {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'Accept': 'application/json',
        'Accept-Language': 'en-US',
        ...ebayProxyHeaders(),
      },
      signal: AbortSignal.timeout(15000), // 15s per-call timeout (Node 20); AbortError caught by surrounding try/catch
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[eBay ConditionPolicies] ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as {
      itemConditionPolicies?: Array<{
        categoryId: string;
        itemConditions?: Array<{ conditionId: string; conditionDescription?: string }>;
      }>;
    };
    const policy = data.itemConditionPolicies?.[0];
    if (!policy?.itemConditions?.length) return null;
    // Map numeric conditionId → Inventory API enum (same map as mapConditionIdToEbayCondition)
    const idToEnum: Record<string, string> = {
      '1000': 'NEW',
      '1500': 'NEW_OTHER',
      '1750': 'NEW_WITH_DEFECTS',
      '2000': 'CERTIFIED_REFURBISHED',
      '2010': 'EXCELLENT_REFURBISHED',
      '2020': 'VERY_GOOD_REFURBISHED',
      '2030': 'GOOD_REFURBISHED',
      '2500': 'SELLER_REFURBISHED',
      '2750': 'LIKE_NEW',
      // eBay conditionId 3000 ("Used") maps to the Inventory API enum USED_EXCELLENT.
      // Confirmed empirically 2026-05-13: category 22669 accepts conditionId 3000, and
      // publishing succeeds ONLY when the inventory item's condition enum is USED_EXCELLENT
      // (USED_GOOD = conditionId 5000, which 22669 does NOT accept → errorId 25021).
      // This matches eBay's official condition-id-values table. The real prior bug was
      // the phantom "accepted.add('USED_VERY_GOOD')" alias, now removed.
      '3000': 'USED_EXCELLENT',
      '4000': 'USED_VERY_GOOD',
      '5000': 'USED_GOOD',
      '6000': 'USED_ACCEPTABLE',
      '7000': 'FOR_PARTS_OR_NOT_WORKING',
    };
    const accepted = new Set<string>();
    for (const c of policy.itemConditions) {
      const enumName = idToEnum[c.conditionId];
      if (enumName) accepted.add(enumName);
    }
    CATEGORY_CONDITION_CACHE.set(categoryId, accepted);
    console.log(
      `[eBay ConditionPolicies] category ${categoryId} accepts: ${Array.from(accepted).join(', ')}`
    );
    return accepted;
  } catch (err) {
    console.error('[eBay ConditionPolicies] Error:', err);
    return null;
  }
}

/**
 * Remap a condition enum to one accepted by the target category.
 * If the desired condition is accepted, return it unchanged.
 * Otherwise pick the best-available substitute using a quality-ordered fallback.
 * If the policy call fails, returns desired unchanged (eBay will reject at publish
 * if invalid — logged for diagnosis).
 */
export async function ensureConditionValidForCategory(
  desired: string,
  categoryId: string
): Promise<string> {
  const accepted = await getAcceptedConditionsForCategory(categoryId);
  if (!accepted) return desired;
  if (accepted.has(desired)) return desired;

  // Ordered fallback — pick the closest accepted enum for the desired condition.
  const fallbacksByDesired: Record<string, string[]> = {
    'NEW':                      ['NEW_OTHER', 'NEW_WITH_DEFECTS', 'USED_VERY_GOOD', 'USED_GOOD'],
    'LIKE_NEW':                 ['USED_VERY_GOOD', 'USED_EXCELLENT', 'USED_GOOD', 'NEW_OTHER'],
    'USED_VERY_GOOD':           ['USED_EXCELLENT', 'USED_GOOD', 'USED_ACCEPTABLE', 'NEW_OTHER'],
    'USED_EXCELLENT':           ['USED_VERY_GOOD', 'USED_GOOD', 'USED_ACCEPTABLE'],
    'USED_GOOD':                ['USED_VERY_GOOD', 'USED_ACCEPTABLE', 'USED_EXCELLENT', 'NEW_OTHER'],  // never downgrade to FOR_PARTS unless organizer set PARTS_OR_REPAIR
    'USED_ACCEPTABLE':          ['USED_GOOD', 'USED_VERY_GOOD', 'NEW_OTHER'],  // never downgrade to FOR_PARTS unless organizer set PARTS_OR_REPAIR
    'FOR_PARTS_OR_NOT_WORKING': ['USED_ACCEPTABLE', 'USED_GOOD'],
  };
  const chain = fallbacksByDesired[desired] || ['USED_GOOD', 'USED_VERY_GOOD', 'NEW'];
  for (const candidate of chain) {
    if (accepted.has(candidate)) {
      console.log(
        `[eBay ConditionRemap] category ${categoryId}: ${desired} not accepted, using ${candidate}`
      );
      return candidate;
    }
  }
  // Nothing matched — return the first accepted enum as a last resort.
  const firstAccepted = Array.from(accepted)[0];
  if (firstAccepted) {
    console.log(
      `[eBay ConditionRemap] category ${categoryId}: no chain match for ${desired}, using ${firstAccepted}`
    );
    return firstAccepted;
  }
  return desired;
}

/**
 * Per-category required-aspect metadata (eBay Taxonomy getItemAspectsForCategory).
 *   name        - aspect name as eBay returns it (e.g. "Type", "Brand", "Color")
 *   required    - true if eBay will reject the listing when this aspect is missing
 *   enumValues  - constrained picklist; empty array when the aspect is free-text
 *   mode        - SELECTION_ONLY means the value MUST come from enumValues
 *   cardinality - SINGLE or MULTI (how many values the aspect accepts)
 */
export interface RequiredAspect {
  name: string;
  required: boolean;
  enumValues: string[];
  cardinality: 'SINGLE' | 'MULTI';
  mode: 'SELECTION_ONLY' | 'FREE_TEXT';
}

/**
 * Cache of per-category aspect definitions. Key = categoryId.
 * Cleared implicitly on server restart; eBay aspect specs change rarely.
 */
const CATEGORY_ASPECTS_CACHE = new Map<string, RequiredAspect[]>();

/**
 * Fetch required + recommended aspects for a given eBay category via the
 * Taxonomy API. Uses the app token (commerce.taxonomy.readonly is app-level).
 * Returns the parsed aspect list or null on failure.
 */
export async function getRequiredAspectsForCategory(categoryId: string): Promise<RequiredAspect[] | null> {
  const cached = CATEGORY_ASPECTS_CACHE.get(categoryId);
  if (cached) return cached;

  try {
    const appToken = await getEbayAccessToken();
    if (!appToken) return null;
    const treeId = '0'; // EBAY_US
    const path = encodeURIComponent(
      `/commerce/taxonomy/v1/category_tree/${treeId}/get_item_aspects_for_category?category_id=${categoryId}`
    );
    const res = await fetch(ebayProxyUrl(path), {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'Accept': 'application/json',
        'Accept-Language': 'en-US',
        ...ebayProxyHeaders(),
      },
      signal: AbortSignal.timeout(15000), // 15s per-call timeout (Node 20); AbortError caught by surrounding try/catch
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[eBay RequiredAspects] ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as {
      aspects?: Array<{
        localizedAspectName: string;
        aspectConstraint?: {
          aspectRequired?: boolean;
          aspectMode?: string;
          itemToAspectCardinality?: string;
        };
        aspectValues?: Array<{ localizedValue: string }>;
      }>;
    };
    const parsed: RequiredAspect[] = (data.aspects || []).map((a) => ({
      name: a.localizedAspectName,
      required: a.aspectConstraint?.aspectRequired === true,
      enumValues: (a.aspectValues || []).map((v) => v.localizedValue),
      cardinality: a.aspectConstraint?.itemToAspectCardinality === 'MULTI' ? 'MULTI' : 'SINGLE',
      mode: a.aspectConstraint?.aspectMode === 'SELECTION_ONLY' ? 'SELECTION_ONLY' : 'FREE_TEXT',
    }));
    CATEGORY_ASPECTS_CACHE.set(categoryId, parsed);
    const requiredNames = parsed.filter((a) => a.required).map((a) => a.name);
    console.log(
      `[eBay RequiredAspects] category ${categoryId}: ${requiredNames.length} required (${requiredNames.join(', ') || 'none'})`
    );
    return parsed;
  } catch (err) {
    console.error('[eBay RequiredAspects] Error:', err);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Relocated offer republish helper (moved verbatim from itemController)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Bug #469: POST the offer publish endpoint so the live listing reflects pushed
 * inventory/offer changes. Best-effort, never throws. Returns true on any 2xx.
 */
export async function republishEbayOffer(
  ebayOfferId: string,
  authHeaders: Record<string, string>,
  frontendUrl: string,
  logTag: string
): Promise<boolean> {
  try {
    const publishPath = `/sell/inventory/v1/offer/${encodeURIComponent(ebayOfferId)}/publish`;
    const res = await fetch(
      `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(publishPath)}`,
      { method: 'POST', headers: authHeaders, body: JSON.stringify({}), signal: AbortSignal.timeout(15000) }
    );
    if (res.ok) {
      console.log(`${logTag}: republish ok (HTTP ${res.status})`);
      return true;
    }
    let bodyText = '';
    try { bodyText = await res.text(); } catch { /* ignore */ }
    console.warn(`${logTag}: republish failed HTTP ${res.status} ${bodyText.slice(0, 300)}`);
    return false;
  } catch (err) {
    console.warn(`${logTag}: republish failed:`, (err as Error).message);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Unified eBay publish plumbing
// ────────────────────────────────────────────────────────────────────────────

/**
 * Unified eBay REST call through the Vercel proxy. All publish-path fetches route
 * here so headers (user token + proxy secret) and URL construction are consistent.
 * `path` is the raw eBay REST path (e.g. `/sell/inventory/v1/offer/{id}/publish`);
 * it is URL-encoded into the proxy's ?path= param exactly like the existing call sites.
 */
export async function ebayFetch(
  path: string,
  accessToken: string,
  init: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const proxySecret = process.env.EBAY_PROXY_SECRET;
  const headers: Record<string, string> = {
    ...ebayUserHeaders(accessToken),
    ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
  };
  const reqInit: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal } = {
    method: init.method ?? 'GET',
    headers,
    signal: AbortSignal.timeout(15000), // 15s per-call timeout (Node 20)
  };
  if (init.body !== undefined) {
    reqInit.body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
  }
  return fetch(ebayProxyUrl(encodeURIComponent(path)), reqInit);
}

/**
 * The item fields the healers read. Mirrors the subset of the Prisma Item model the
 * inline self-heals use today (all confirmed present in schema.prisma):
 *   id, title, condition, brand, mpn, ebayCategoryId, ebayCategoryName,
 *   ebayOfferId, category.
 */
export interface EbayPublishItem {
  id: string;
  title: string;
  condition?: string | null;
  brand?: string | null;
  mpn?: string | null;
  ebayCategoryId?: string | null;
  ebayCategoryName?: string | null;
  ebayOfferId?: string | null;
  category?: string | null;
}

/**
 * Shared mutable context threaded through every publish attempt + healer.
 *
 * Canonical decisions (ADR 2026-06-30 — these fix the confirmed S1047/S1048 bugs):
 *  - `isUsedFamily` is derived from the DB `item.condition` (single source of truth),
 *     NOT from whatever condition is currently stored on the eBay inventory item.
 *  - `currentCondition` is the condition live on the eBay inventory item and is the
 *     value healers EXCLUDE from their retry candidates (never the DB value).
 *  - `categoryId` + `currentCondition` carry state across iterations so heal order is
 *     emergent from eBay's returned errorId, not a hardcoded sequence.
 */
export interface EbayPublishContext {
  item: EbayPublishItem;
  accessToken: string;
  offerId: string;
  /** Canonical SKU resolved from the live offer; refreshed as heals recreate offers. */
  sku: string | null;
  /** Category currently on the offer; a 25005 heal mutates this in place. */
  categoryId: string | null;
  /** Condition live on the eBay inventory item; a 25021 heal mutates this in place. */
  currentCondition: string | null;
  /**
   * DB-derived used-family flag (source of truth = item.condition). Set once from the
   * DB value; a null DB condition falls back to the inventory item's condition family.
   */
  isUsedFamily: boolean;
  /** Set by a healer when it successfully publishes. */
  listingId?: string | null;
}

/** Result a healer returns to the loop. */
interface HealResult {
  /** Healer produced a successful publish — loop stops with this listingId. */
  published: boolean;
  listingId?: string | null;
  /** Healer mutated live state and the loop should re-attempt the publish. */
  retry: boolean;
}

/**
 * A healer takes the shared context and the last publish error body and attempts a
 * targeted repair against the live eBay inventory/offer, then (usually) re-publishes.
 * Registered by the eBay errorId it repairs.
 */
type Healer = (ctx: EbayPublishContext, errorBody: string) => Promise<HealResult>;

/** POST the offer publish endpoint; returns the parsed listingId on success, else null. */
async function attemptPublish(ctx: EbayPublishContext): Promise<{ ok: boolean; listingId: string | null; errorBody: string }> {
  const res = await ebayFetch(`/sell/inventory/v1/offer/${ctx.offerId}/publish`, ctx.accessToken, { method: 'POST', body: {} });
  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as any;
    return { ok: true, listingId: (data?.listingId ?? null) as string | null, errorBody: '' };
  }
  const errorBody = await res.text().catch(() => '');
  return { ok: false, listingId: null, errorBody };
}

/** GET the live offer and refresh ctx.sku from it (guards against SKU drift). */
async function refreshCanonicalSku(ctx: EbayPublishContext): Promise<void> {
  try {
    const res = await ebayFetch(`/sell/inventory/v1/offer/${ctx.offerId}`, ctx.accessToken, { method: 'GET' });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data?.sku) ctx.sku = data.sku;
    }
  } catch (err) {
    console.warn(`[eBay SelfHeal] refreshCanonicalSku: GET offer ${ctx.offerId} threw — falling back to existing ctx.sku (${ctx.sku ?? 'null'}). Error: ${(err as Error).message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Healers (canonical logic mirrored from the PublishNow inline self-heals)
// ────────────────────────────────────────────────────────────────────────────

/**
 * 25021 — condition invalid for the offer's category.
 * Walk the accepted-conditions list, biased by the DB-derived used family, retrying
 * a fresh inventory PUT + publish. Excludes ctx.currentCondition (the value already
 * live on the inventory item) so the same rejected condition is never retried.
 */
const heal25021: Healer = async (ctx) => {
  if (!ctx.categoryId) {
    console.warn(`[eBay SelfHeal 25021] item ${ctx.item.id} offer ${ctx.offerId}: bailing — ctx.categoryId is missing, cannot look up accepted conditions`);
    return { published: false, retry: false };
  }
  await refreshCanonicalSku(ctx);
  if (!ctx.sku) {
    console.warn(`[eBay SelfHeal 25021] item ${ctx.item.id} offer ${ctx.offerId}: bailing — SKU could not be resolved from eBay offer GET`);
    return { published: false, retry: false };
  }

  const invGet = await ebayFetch(`/sell/inventory/v1/inventory_item/${ctx.sku}`, ctx.accessToken, { method: 'GET' });
  if (!invGet.ok) {
    console.warn(`[eBay SelfHeal 25021] item ${ctx.item.id} sku ${ctx.sku}: bailing — inventory item GET failed (HTTP ${invGet.status})`);
    return { published: false, retry: false };
  }
  const invBody = (await invGet.json()) as any;

  const accepted = await getAcceptedConditionsForCategory(ctx.categoryId);
  // isUsedFamily comes from ctx (DB item.condition = source of truth). Only fall back
  // to the inventory item's condition string when the DB value was null.
  const isUsedFamily = ctx.isUsedFamily
    || (typeof invBody.condition === 'string' && invBody.condition.startsWith('USED_'));
  const excludeCondition = ctx.currentCondition ?? invBody.condition;
  const retryOrder = (isUsedFamily
    ? ['USED_GOOD', 'USED_VERY_GOOD', 'USED_EXCELLENT', 'USED_ACCEPTABLE', 'FOR_PARTS_OR_NOT_WORKING', 'NEW_OTHER', 'NEW']
    : ['NEW_OTHER', 'NEW', 'NEW_WITH_DEFECTS', 'USED_EXCELLENT', 'USED_GOOD']
  ).filter((c) => c !== excludeCondition && (!accepted || accepted.has(c)));

  for (const retryCondition of retryOrder) {
    console.log(`[eBay SelfHeal 25021] ${ctx.sku}: retrying with condition=${retryCondition}`);
    const retryInvRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${ctx.sku}`, ctx.accessToken, {
      method: 'PUT',
      body: { ...invBody, condition: retryCondition },
    });
    if (!retryInvRes.ok && retryInvRes.status !== 204) continue;
    // Reflect the new live condition in the shared context so later heals exclude it.
    ctx.currentCondition = retryCondition;
    const pub = await attemptPublish(ctx);
    if (pub.ok) return { published: true, listingId: pub.listingId, retry: false };
  }
  // Condition was mutated toward a valid value; let the loop re-attempt / re-dispatch.
  return { published: false, retry: true };
};

/**
 * Parse the specific missing-aspect name(s) out of a 25002 error body's
 * `errors[].parameters[].value` (P2 fix, S1050 BQ). eBay reports "BrandMPN" for the
 * Brand/MPN pair requirement, or a literal aspect name (e.g. "Form Factor", confirmed
 * via raw API test on category 29946) for any other missing required aspect.
 */
function parseMissing25002AspectNames(errorBody: string): string[] {
  try {
    const parsed = JSON.parse(errorBody) as {
      errors?: Array<{ errorId?: number; parameters?: Array<{ name?: string; value?: string }> }>;
    };
    const names: string[] = [];
    for (const err of parsed.errors || []) {
      if (err.errorId !== 25002) continue;
      for (const p of err.parameters || []) {
        if (p?.value) names.push(String(p.value));
      }
    }
    return names;
  } catch {
    return [];
  }
}

/**
 * Pick a safe default value for a dynamically-resolved required aspect, mirroring the
 * neutral-value preference in ebayController's fillRequiredAspects (never fabricate a
 * specific-sounding value like an enum's first entry when a neutral option exists).
 */
function pickSafeAspectDefault(aspectSpec: RequiredAspect | undefined): string {
  if (!aspectSpec || aspectSpec.enumValues.length === 0) return 'Does Not Apply';
  const neutral = aspectSpec.enumValues.find((v) =>
    /^(universal|other|not\s*specified|unspecified|any|multiple|n\/?a|various)$/i.test(v)
  );
  return neutral || aspectSpec.enumValues[0];
}

/**
 * 25002 — missing required item-specific(s). GET the inventory item, inject
 * Brand+MPN(+Model) into product.aspects (covers the common BrandMPN-pair case — safe
 * to send even when eBay asked for something else), mirror Brand/MPN onto the
 * top-level product fields, PUT back, re-publish once.
 *
 * P2 fix (S1050 BQ): previously ONLY Brand/MPN/Model were ever injected. If the
 * primary pre-flight (fillRequiredAspects) missed a different required aspect (e.g.
 * Form Factor, confirmed via raw API test on category 29946), eBay kept rejecting with
 * 25002 for that named aspect and the self-heal loop's one-retry-per-errorId guard gave
 * up — the item got permanently stuck. Now parses the missing aspect name(s) out of
 * eBay's error `parameters` and, for any name not already covered by Brand/MPN/Model,
 * dynamically resolves it via getRequiredAspectsForCategory and injects a safe default.
 */
const heal25002: Healer = async (ctx, errorBody) => {
  await refreshCanonicalSku(ctx);
  if (!ctx.sku) {
    console.warn(`[eBay SelfHeal 25002] item ${ctx.item.id} offer ${ctx.offerId}: bailing — SKU could not be resolved from eBay offer GET (aspect-injection repair never ran)`);
    return { published: false, retry: false };
  }

  const invGet = await ebayFetch(`/sell/inventory/v1/inventory_item/${ctx.sku}`, ctx.accessToken, { method: 'GET' });
  if (!invGet.ok) {
    console.warn(`[eBay SelfHeal 25002] item ${ctx.item.id} sku ${ctx.sku}: bailing — inventory item GET failed (HTTP ${invGet.status})`);
    return { published: false, retry: false };
  }
  const invBody = (await invGet.json()) as any;
  const item = ctx.item;

  if (!invBody.product || typeof invBody.product !== 'object') invBody.product = {};
  const aspectsObj: Record<string, string[]> =
    invBody.product.aspects && typeof invBody.product.aspects === 'object' ? invBody.product.aspects : {};
  const hasKey = (key: string): boolean =>
    Object.keys(aspectsObj).some((k) => k.toLowerCase() === key.toLowerCase());

  if (!hasKey('Brand')) {
    aspectsObj['Brand'] = item.brand && item.brand.trim() ? [item.brand.trim()] : ['Unbranded'];
  }
  // Brand+MPN pairing (evidence 2026-06-13, errorId 25002 param BrandMPN): a Brand
  // aspect requires a paired MPN or eBay re-rejects with <BrandMPN>.
  if (!hasKey('MPN')) {
    aspectsObj['MPN'] = [item.mpn?.trim() || 'Does Not Apply'];
  }
  if (!hasKey('Model')) {
    const modelVal = item.mpn?.trim()
      || item.title?.replace(new RegExp('\\b' + (item.brand || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), '').trim().slice(0, 65)
      || 'Unspecified';
    aspectsObj['Model'] = [modelVal];
  }

  // Dynamic fallback (P2 fix): inject any missing aspect eBay actually named that
  // Brand/MPN/Model injection above didn't already cover.
  const missingNames = parseMissing25002AspectNames(errorBody);
  const dynamicNames = missingNames.filter((name) => !/^brand ?mpn$/i.test(name) && !hasKey(name));
  if (dynamicNames.length > 0 && ctx.categoryId) {
    const spec = await getRequiredAspectsForCategory(ctx.categoryId);
    for (const name of dynamicNames) {
      const aspectSpec = spec?.find((a) => a.name.toLowerCase() === name.toLowerCase());
      const defaultValue = pickSafeAspectDefault(aspectSpec);
      const finalName = aspectSpec?.name ?? name;
      aspectsObj[finalName] = [defaultValue];
      console.log(`[eBay SelfHeal 25002] ${ctx.sku}: dynamically injecting missing aspect "${finalName}"=${defaultValue}`);
    }
  }

  invBody.product.aspects = aspectsObj;
  // Mirror Brand into product.brand — required alongside aspects.Brand for the pair.
  if (!invBody.product.brand) {
    const injectedBrand = aspectsObj['Brand']?.[0];
    invBody.product.brand = (injectedBrand && injectedBrand.toLowerCase() !== 'unbranded')
      ? injectedBrand
      : (item.brand?.trim() || null);
  }
  if (!invBody.product.mpn) {
    invBody.product.mpn = item.mpn?.trim() || 'Does Not Apply';
  }

  console.log(`[eBay SelfHeal 25002] ${ctx.sku}: injecting Brand=${aspectsObj['Brand']?.[0]} + MPN=${aspectsObj['MPN']?.[0]} and re-publishing`);
  const retryInvRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${ctx.sku}`, ctx.accessToken, {
    method: 'PUT',
    body: invBody,
  });
  if (!retryInvRes.ok && retryInvRes.status !== 204) {
    console.warn(`[eBay SelfHeal 25002] item ${ctx.item.id} sku ${ctx.sku}: bailing — inventory item PUT (aspect injection) failed (HTTP ${retryInvRes.status})`);
    return { published: false, retry: false };
  }
  const pub = await attemptPublish(ctx);
  if (pub.ok) return { published: true, listingId: pub.listingId, retry: false };
  return { published: false, retry: true };
};

/**
 * 25101 — invalid ShippingPackage / packageType conflicts with the fulfillment policy.
 * GET the inventory item, strip packageType from packageWeightAndSize, PUT back, retry.
 */
const heal25101: Healer = async (ctx) => {
  await refreshCanonicalSku(ctx);
  if (!ctx.sku) {
    console.warn(`[eBay SelfHeal 25101] item ${ctx.item.id} offer ${ctx.offerId}: bailing — SKU could not be resolved from eBay offer GET`);
    return { published: false, retry: false };
  }
  console.warn(`[eBay SelfHeal 25101] sku=${ctx.sku} — stripping packageType and retrying`);
  try {
    const invGet = await ebayFetch(`/sell/inventory/v1/inventory_item/${ctx.sku}`, ctx.accessToken, { method: 'GET' });
    if (!invGet.ok) {
      console.warn(`[eBay SelfHeal 25101] item ${ctx.item.id} sku ${ctx.sku}: bailing — inventory item GET failed (HTTP ${invGet.status})`);
      return { published: false, retry: false };
    }
    const invBody = (await invGet.json()) as any;
    if (invBody.packageWeightAndSize) {
      const pkg = { ...(invBody.packageWeightAndSize as Record<string, unknown>) };
      delete (pkg as any).packageType;
      invBody.packageWeightAndSize = pkg;
    }
    const retryInvRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${ctx.sku}`, ctx.accessToken, {
      method: 'PUT',
      body: invBody,
    });
    if (!retryInvRes.ok && retryInvRes.status !== 204) {
      console.warn(`[eBay SelfHeal 25101] item ${ctx.item.id} sku ${ctx.sku}: bailing — inventory item PUT (packageType strip) failed (HTTP ${retryInvRes.status})`);
      return { published: false, retry: false };
    }
    const pub = await attemptPublish(ctx);
    if (pub.ok) {
      console.log(`[eBay SelfHeal 25101] ${ctx.sku}: succeeded after stripping packageType`);
      return { published: true, listingId: pub.listingId, retry: false };
    }
    return { published: false, retry: true };
  } catch (err) {
    console.error('[eBay SelfHeal 25101] threw:', (err as Error).message);
    return { published: false, retry: false };
  }
};

/**
 * 25005 — invalid / deprecated / non-leaf category.
 * Re-resolve a fresh leaf category from eBay taxonomy, swap it onto the offer (PUT,
 * or delete+recreate if PUT fails), persist the new category on the item, re-publish.
 * Mutates ctx.categoryId + ctx.offerId so subsequent heals target the current offer.
 * suggestEbayCategoryForTitle is pulled lazily to avoid a static controller cycle.
 */
const heal25005: Healer = async (ctx) => {
  const item = ctx.item;
  console.warn(`[eBay SelfHeal 25005] item ${item.id}: invalid category — attempting full self-heal`);
  try {
    const { suggestEbayCategoryForTitle } = await import('../controllers/ebayController');
    const freshCategory = await suggestEbayCategoryForTitle(item.title, item.category ?? null);
    const newCategoryId = freshCategory?.categoryId;
    if (!newCategoryId) {
      console.warn(`[eBay SelfHeal 25005] taxonomy returned no category for "${item.title.slice(0, 40)}"`);
      return { published: false, retry: false };
    }

    const offerGetRes = await ebayFetch(`/sell/inventory/v1/offer/${ctx.offerId}`, ctx.accessToken, { method: 'GET' });
    if (!offerGetRes.ok) {
      console.warn(`[eBay SelfHeal 25005] offer GET failed (${offerGetRes.status})`);
      return { published: false, retry: false };
    }
    const offerBody = (await offerGetRes.json()) as Record<string, unknown>;
    const updatedOffer: Record<string, unknown> = { ...offerBody, categoryId: newCategoryId };
    for (const ro of ['offerId', 'status', 'listing', 'listingId', 'listingStatus', 'marketplaceId']) {
      delete updatedOffer[ro];
    }
    // P1 fix (S1050 BQ): eBay defaults includeCatalogProductDetails to true on offer
    // PUT/create and silently overrides our computed Brand with a catalog match. This
    // recreate path rebuilds the offer from a GET (which never echoes the flag back),
    // so it must be re-asserted explicitly — same fix as the primary offer-creation
    // payload in ebayController.ts.
    updatedOffer.includeCatalogProductDetails = false;

    let activeOfferId = ctx.offerId;
    const offerPutRes = await ebayFetch(`/sell/inventory/v1/offer/${ctx.offerId}`, ctx.accessToken, {
      method: 'PUT',
      body: updatedOffer,
    });
    if (offerPutRes.ok || offerPutRes.status === 204) {
      console.log(`[eBay SelfHeal 25005] offer PUT succeeded with category=${newCategoryId}`);
      await prisma.item.update({
        where: { id: item.id },
        data: { ebayCategoryId: newCategoryId, ebayCategoryName: freshCategory.categoryName },
      });
    } else {
      const putErrText = await offerPutRes.text();
      console.warn(`[eBay SelfHeal 25005] PUT failed (${offerPutRes.status} ${putErrText.slice(0, 200)}) — deleting + recreating offer`);
      await ebayFetch(`/sell/inventory/v1/offer/${ctx.offerId}`, ctx.accessToken, { method: 'DELETE' });
      updatedOffer.marketplaceId = 'EBAY_US';
      const createRes = await ebayFetch(`/sell/inventory/v1/offer`, ctx.accessToken, { method: 'POST', body: updatedOffer });
      if (createRes.ok) {
        const createData = (await createRes.json()) as any;
        activeOfferId = createData.offerId;
        console.log(`[eBay SelfHeal 25005] new offer created: offerId=${activeOfferId} category=${newCategoryId}`);
        await prisma.item.update({
          where: { id: item.id },
          data: { ebayOfferId: activeOfferId, ebayCategoryId: newCategoryId, ebayCategoryName: freshCategory.categoryName },
        });
      } else {
        const createErr = await createRes.text();
        console.error(`[eBay SelfHeal 25005] offer recreate failed: ${createErr.slice(0, 300)}`);
        return { published: false, retry: false };
      }
    }

    // Update shared context so any subsequent heal targets the corrected offer/category.
    ctx.offerId = activeOfferId;
    ctx.categoryId = newCategoryId;

    const pub = await attemptPublish(ctx);
    if (pub.ok) {
      console.log(`[eBay SelfHeal 25005] self-heal published: listingId=${pub.listingId}`);
      return { published: true, listingId: pub.listingId, retry: false };
    }
    return { published: false, retry: true };
  } catch (healErr) {
    console.error('[eBay SelfHeal 25005] threw:', (healErr as Error).message);
    return { published: false, retry: false };
  }
};

/**
 * Registry mapping eBay errorId → healer. New eBay error codes are added here in
 * exactly one place (ADR constraint). Heal order is emergent: the loop reads the
 * returned errorId and dispatches to the matching entry.
 */
const HEALERS: Record<string, Healer> = {
  '25005': heal25005,
  '25021': heal25021,
  '25101': heal25101,
  '25002': heal25002,
};

/** Ordered errorIds to probe in an error body (registry order). */
const HEALER_ERROR_IDS = Object.keys(HEALERS);

/** Return the first registered errorId present in the publish error body, else null. */
function matchErrorId(errorBody: string): string | null {
  for (const id of HEALER_ERROR_IDS) {
    if (errorBody.includes(id)) return id;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Self-heal publish loop
// ────────────────────────────────────────────────────────────────────────────

export interface EbayPublishInput {
  item: EbayPublishItem;
  /** Optional pre-resolved user access token; fetched via getEbayAccessToken() if omitted. */
  accessToken?: string | null;
  /** Optional pre-resolved canonical SKU; refreshed from the live offer as needed. */
  sku?: string | null;
}

export interface EbayPublishResult {
  published: boolean;
  listingId: string | null;
  /** The last eBay errorId encountered when publish ultimately failed. */
  lastErrorId?: string | null;
  /** The final (or last) offerId, which a 25005 heal may have recreated. */
  offerId: string | null;
}

/**
 * Error-dispatch self-heal publish loop.
 *
 * Attempt publish → parse eBay errorId → dispatch to the matching healer → the
 * healer repairs live state (shared ctx) and re-attempts → repeat. Caps at 5
 * iterations. Each errorId's healer runs at most once per publish (tracked in
 * `attempted`) so one heal never loops. Returns success as soon as any attempt or
 * healer publishes; returns the last errorId when it exhausts healers / iterations.
 *
 * ZERO CALLERS in Phase 2 — Phase 3 wires pushSaleToEbay / publishItemOffer / PushSync
 * to this and deletes their inline heal blocks.
 */
export async function ebayPublishWithSelfHeal(input: EbayPublishInput): Promise<EbayPublishResult> {
  const item = input.item;
  const offerId = item.ebayOfferId;
  if (!offerId) {
    return { published: false, listingId: null, offerId: null, lastErrorId: null };
  }

  const accessToken = input.accessToken ?? (await getEbayAccessToken());
  if (!accessToken) {
    return { published: false, listingId: null, offerId, lastErrorId: null };
  }

  // isUsedFamily source of truth = DB item.condition (ADR canonical decision 1).
  const isUsedFamily = item.condition === 'USED' || item.condition === 'PARTS_OR_REPAIR';

  const ctx: EbayPublishContext = {
    item,
    accessToken,
    offerId,
    sku: input.sku ?? null,
    categoryId: item.ebayCategoryId ?? null,
    currentCondition: null,
    isUsedFamily,
    listingId: null,
  };

  const attempted = new Set<string>();
  let lastErrorId: string | null = null;

  for (let iteration = 0; iteration < 5; iteration++) {
    const pub = await attemptPublish(ctx);
    if (pub.ok) {
      return { published: true, listingId: pub.listingId, offerId: ctx.offerId, lastErrorId };
    }

    const errorId = matchErrorId(pub.errorBody);
    lastErrorId = errorId;
    if (!errorId) {
      // Unhealable / unknown error — stop.
      console.warn(`[eBay SelfHeal] no healer for publish error (offer ${ctx.offerId}): ${pub.errorBody.slice(0, 200)}`);
      break;
    }
    if (attempted.has(errorId)) {
      // Already ran this heal once — do not run it twice for the same publish.
      console.warn(`[eBay SelfHeal] errorId ${errorId} already healed once for offer ${ctx.offerId}; stopping`);
      break;
    }
    attempted.add(errorId);

    const healer = HEALERS[errorId];
    const result = await healer(ctx, pub.errorBody);
    if (result.published) {
      return { published: true, listingId: result.listingId ?? null, offerId: ctx.offerId, lastErrorId };
    }
    if (!result.retry) {
      // Healer could not repair — stop.
      break;
    }
    // result.retry === true → loop re-attempts the publish.
  }

  return { published: false, listingId: null, offerId: ctx.offerId, lastErrorId };
}
