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
 * eBay Coin/Card Condition Requirements (conditionDescriptors) — added 2026-09-05,
 * extended 2026-09-05 to cover GRADED coins/cards too (see resolveCoinConditionOverride
 * below). CONFIRMED live via get_item_condition_policies (category 11981, "Coins &
 * Paper Money"): this requires a `conditionDescriptors` array on the INVENTORY ITEM
 * itself — separate from `product.aspects`, never surfaced by the Taxonomy API. This
 * is why errorId 25064 ("Coin Condition (2) is a required field") kept firing no
 * matter what was injected into product.aspects.
 *
 * Populated by the SAME get_item_condition_policies call getAcceptedConditionsForCategory
 * already makes for every push (below) — one live call per category covers both the
 * accepted-conditions Set and this descriptor cache, no duplicate API usage.
 */
interface EbayConditionDescriptorSpec {
  conditionDescriptorId: string;
  conditionDescriptorName: string;
  usage: string; // 'REQUIRED' | 'OPTIONAL' — from conditionDescriptorConstraint.usage
  values: Array<{
    conditionDescriptorValueId: string;
    conditionDescriptorValueName: string;
    // Numeric-grade values are constrained to specific letter-grade values (e.g. "65"
    // only applies when letter grade is "MS/PR") — carried through so a graded coin's
    // numeric grade can be matched against the letter grade already resolved.
    applicableToConditionDescriptorValueIds?: string[];
  }>;
}

/** Key = `${categoryId}:${legacyConditionId}` (e.g. "11981:4000" for Ungraded coins). */
const CATEGORY_CONDITION_DESCRIPTOR_CACHE = new Map<string, EbayConditionDescriptorSpec[]>();

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
        itemConditions?: Array<{
          conditionId: string;
          conditionDescription?: string;
          conditionDescriptors?: Array<{
            conditionDescriptorId: string;
            conditionDescriptorName: string;
            conditionDescriptorConstraint?: { usage?: string };
            conditionDescriptorValues?: Array<{
              conditionDescriptorValueId: string;
              conditionDescriptorValueName: string;
              conditionDescriptorValueConstraints?: Array<{ applicableToConditionDescriptorValueIds?: string[] }>;
            }>;
          }>;
        }>;
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
      // Populate the conditionDescriptors cache from this SAME response — added
      // 2026-09-05 so coin/card categories (Coin/Card Condition Requirements policy)
      // don't need a second live call. A conditionId with no conditionDescriptors in
      // eBay's response caches as an empty array, which downstream code correctly
      // treats as "no descriptor requirement for this condition".
      const descKey = `${categoryId}:${c.conditionId}`;
      if (!CATEGORY_CONDITION_DESCRIPTOR_CACHE.has(descKey)) {
        CATEGORY_CONDITION_DESCRIPTOR_CACHE.set(
          descKey,
          (c.conditionDescriptors || []).map((d) => ({
            conditionDescriptorId: d.conditionDescriptorId,
            conditionDescriptorName: d.conditionDescriptorName,
            usage: d.conditionDescriptorConstraint?.usage || 'OPTIONAL',
            values: (d.conditionDescriptorValues || []).map((v) => ({
              conditionDescriptorValueId: v.conditionDescriptorValueId,
              conditionDescriptorValueName: v.conditionDescriptorValueName,
              applicableToConditionDescriptorValueIds: (v.conditionDescriptorValueConstraints || [])
                .flatMap((cons) => cons.applicableToConditionDescriptorValueIds || []),
            })),
          }))
        );
      }
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
 * getConditionDescriptorSpecs — read the descriptor requirements for a category+
 * condition out of CATEGORY_CONDITION_DESCRIPTOR_CACHE, ensuring the cache is
 * populated first (triggers getAcceptedConditionsForCategory's live call if this
 * category hasn't been seen yet — same call, no duplicate API usage).
 */
async function getConditionDescriptorSpecs(
  categoryId: string,
  conditionEnum: string
): Promise<EbayConditionDescriptorSpec[]> {
  const conditionId = ENUM_TO_LEGACY_CONDITION_ID[conditionEnum];
  if (!conditionId) return [];
  const cacheKey = `${categoryId}:${conditionId}`;
  if (!CATEGORY_CONDITION_DESCRIPTOR_CACHE.has(cacheKey)) {
    await getAcceptedConditionsForCategory(categoryId); // populates both caches from one live call
  }
  return CATEGORY_CONDITION_DESCRIPTOR_CACHE.get(cacheKey) || [];
}

// Reverse of the idToEnum map inside getAcceptedConditionsForCategory above — needed
// to find which itemConditions[] entry in the Metadata API response corresponds to
// the condition enum a publish attempt already resolved via ensureConditionValidForCategory.
const ENUM_TO_LEGACY_CONDITION_ID: Record<string, string> = {
  'NEW': '1000',
  'NEW_OTHER': '1500',
  'NEW_WITH_DEFECTS': '1750',
  'CERTIFIED_REFURBISHED': '2000',
  'EXCELLENT_REFURBISHED': '2010',
  'VERY_GOOD_REFURBISHED': '2020',
  'GOOD_REFURBISHED': '2030',
  'SELLER_REFURBISHED': '2500',
  'LIKE_NEW': '2750',
  'USED_EXCELLENT': '3000',
  'USED_VERY_GOOD': '4000',
  'USED_GOOD': '5000',
  'USED_ACCEPTABLE': '6000',
  'FOR_PARTS_OR_NOT_WORKING': '7000',
};

/**
 * Resolve the UNGRADED "Coin/Card Condition" descriptor value from the item's own
 * organizer-set text. Matches by keyword against the ACTUAL fetched value names (not
 * hardcoded IDs) so this generalizes across every coin/card category eBay applies the
 * policy to, not just category 11981.
 *
 * Confirmed live 2026-09-05 (category 11981, "Coin Condition" descriptor, id 2):
 * values are Uncirculated(7), Extremely Fine to About Uncirculated(8), Fine to Very
 * Fine(9), Below Fine(10) — no numeric ID here is hardcoded; only the name keywords are.
 */
function resolveUngradedConditionValue(
  spec: EbayConditionDescriptorSpec,
  haystack: string
): { id: string; name: string; matchedBy: 'text' | 'default' } | null {
  const findByKeyword = (re: RegExp) => spec.values.find((v) => re.test(v.conditionDescriptorValueName));

  let picked = undefined as EbayConditionDescriptorSpec['values'][number] | undefined;
  if (/extremely fine|about uncirculated|\bau\b|\bxf\b/.test(haystack)) {
    picked = findByKeyword(/Extremely Fine/i);
  } else if (/\buncirculated\b/.test(haystack)) {
    picked = findByKeyword(/^Uncirculated$/i);
  } else if (/\bvery fine\b|\bvf\b/.test(haystack)) {
    picked = findByKeyword(/Fine to Very Fine/i);
  } else if (/below fine|\bpoor\b|\bfair\b|\bag\b|\bfr\b/.test(haystack)) {
    picked = findByKeyword(/Below Fine/i);
  }
  if (picked) {
    return { id: picked.conditionDescriptorValueId, name: picked.conditionDescriptorValueName, matchedBy: 'text' };
  }
  // No specific grade language present (e.g. only a generic "Circulated" tag) —
  // default to the middle grade "Fine to Very Fine" rather than either extreme:
  // claiming Uncirculated quality when unverified risks an item-not-as-described
  // claim, and Below Fine risks under-describing a coin that may be nicer than
  // that. Falls back to the first available value if this category's descriptor
  // doesn't happen to offer that exact name.
  const fallback = findByKeyword(/Fine to Very Fine/i) || spec.values[0];
  if (!fallback) return null;
  return { id: fallback.conditionDescriptorValueId, name: fallback.conditionDescriptorValueName, matchedBy: 'default' };
}

/**
 * GRADED coin/card detection — added 2026-09-05 in direct response to Patrick's
 * correction that resolving only the Ungraded path was an incomplete fix. A coin an
 * organizer describes as professionally certified (PCGS/NGC/etc. slab) must NOT be
 * force-fit into the Ungraded "Coin Condition" bucket — that would misdescribe a
 * graded coin's actual condition. This parses the item's own title/description/tags
 * for real certification text the organizer typed in (never fabricated) and, only
 * when a grading service AND letter grade are both confidently identified, resolves
 * the full Graded descriptor set (Professional grader / Letter grade / Numerical
 * grade). If no numeric grade can be parsed, "None" is used for the numeric-grade
 * descriptor where eBay's own value list offers it (confirmed live: id 77, valid for
 * every letter grade) — a real, eBay-provided answer for "no specific number given",
 * not a guess.
 *
 * Grader detection matches the abbreviation eBay itself prints in parens in each
 * value's name (e.g. "Professional Coin Grading Service (PCGS)") against the item
 * text, so this needs no hardcoded grader list — it reads the abbreviation directly
 * out of whatever eBay returns for a given category.
 */
function parseGradedCoinInfo(
  haystack: string,
  graderSpec: EbayConditionDescriptorSpec,
  letterGradeSpec: EbayConditionDescriptorSpec,
  numericGradeSpec: EbayConditionDescriptorSpec | undefined
): { graderValueId: string; letterValueId: string; numericValueId: string | null } | null {
  // 1. Grader — match eBay's own "(ABBR)" convention against the item text.
  let graderMatch: EbayConditionDescriptorSpec['values'][number] | undefined;
  for (const v of graderSpec.values) {
    const abbrevMatch = /\(([A-Z0-9\/\-]{2,10})\)\s*$/.exec(v.conditionDescriptorValueName);
    if (!abbrevMatch) continue;
    const abbrevRe = new RegExp(`\\b${abbrevMatch[1].replace(/[/\-]/g, '\\$&')}\\b`, 'i');
    if (abbrevRe.test(haystack)) {
      graderMatch = v;
      break;
    }
  }
  if (!graderMatch) return null; // no recognized grading service named — not confidently graded, don't guess

  // 2. Letter grade — strict "LETTERS+DIGITS" numismatic shorthand (MS65, AU58, VF20,
  // G6, ...) so a stray single letter elsewhere in the description can't false-match.
  const letterDigitMatch = /\b(MS|PR|AU|EX\/XF|EXF|XF|VF|VG|AG|FR)-?(\d{1,2})\b/i.exec(haystack)
    || /\b(F|G|P)-?(\d{1,2})\b/.exec(haystack); // single-letter codes only match with attached digits
  if (!letterDigitMatch) return null; // grader named but no parseable grade — bail, don't guess

  const rawLetter = letterDigitMatch[1].toUpperCase();
  const normalizedLetter =
    rawLetter === 'MS' || rawLetter === 'PR' ? 'MS/PR' :
    rawLetter === 'EX' || rawLetter === 'XF' || rawLetter === 'EXF' || rawLetter === 'EX/XF' ? 'EX/XF' :
    rawLetter;
  const letterMatch = letterGradeSpec.values.find(
    (v) => v.conditionDescriptorValueName.toUpperCase() === normalizedLetter
  );
  if (!letterMatch) return null;

  // 3. Numeric grade — constrained to the resolved letter grade; falls back to the
  // "None" value (a real eBay-offered option) when the number couldn't be parsed or
  // doesn't match any value actually constrained to this letter grade.
  let numericValueId: string | null = null;
  if (numericGradeSpec) {
    const parsedNumber = letterDigitMatch[2];
    const numericMatch = numericGradeSpec.values.find(
      (v) =>
        v.conditionDescriptorValueName === parsedNumber &&
        (v.applicableToConditionDescriptorValueIds || []).includes(letterMatch.conditionDescriptorValueId)
    );
    if (numericMatch) {
      numericValueId = numericMatch.conditionDescriptorValueId;
    } else {
      const noneMatch = numericGradeSpec.values.find(
        (v) =>
          /^none$/i.test(v.conditionDescriptorValueName) &&
          (v.applicableToConditionDescriptorValueIds || []).includes(letterMatch.conditionDescriptorValueId)
      );
      numericValueId = noneMatch ? noneMatch.conditionDescriptorValueId : null;
    }
  }

  return { graderValueId: graderMatch.conditionDescriptorValueId, letterValueId: letterMatch.conditionDescriptorValueId, numericValueId };
}

type CoinConditionResolution =
  | { status: 'not_applicable' } // category has no coin/card condition-descriptor policy at all
  | { status: 'resolved'; condition: string; conditionDescriptors: Array<{ name: string; values: string[] }> }
  | { status: 'unresolved'; reason: string }; // policy applies but couldn't be confidently satisfied — caller must NOT guess

/**
 * Single entry point for eBay's Coin/Card Condition Requirements policy. Checks BOTH
 * the Graded and Ungraded descriptor sets for this category (one cached live call),
 * tries to detect real grading-service text first (never silently defaults a
 * certified coin into the Ungraded bucket), and only falls back to Ungraded when no
 * grading language is present at all.
 */
export async function resolveCoinConditionOverride(
  categoryId: string,
  item: { title?: string | null; description?: string | null; tags?: string[] | null }
): Promise<CoinConditionResolution> {
  const [gradedSpecs, ungradedSpecs] = await Promise.all([
    getConditionDescriptorSpecs(categoryId, 'LIKE_NEW'),
    getConditionDescriptorSpecs(categoryId, 'USED_VERY_GOOD'),
  ]);
  if (gradedSpecs.length === 0 && ungradedSpecs.length === 0) {
    return { status: 'not_applicable' };
  }

  const haystack = [item.title, item.description, ...(item.tags || [])].filter(Boolean).join(' | ');

  // Try Graded first — only when the category actually has a Graded policy AND the
  // item's own text names a real grading service.
  if (gradedSpecs.length > 0) {
    const graderSpec = gradedSpecs.find((s) => /grader/i.test(s.conditionDescriptorName));
    const letterGradeSpec = gradedSpecs.find((s) => /letter\s*grade/i.test(s.conditionDescriptorName));
    const numericGradeSpec = gradedSpecs.find((s) => /numer(ic|ical)\s*grade/i.test(s.conditionDescriptorName));
    if (graderSpec && letterGradeSpec) {
      const parsed = parseGradedCoinInfo(haystack, graderSpec, letterGradeSpec, numericGradeSpec);
      if (parsed) {
        const descriptors: Array<{ name: string; values: string[] }> = [
          { name: graderSpec.conditionDescriptorId, values: [parsed.graderValueId] },
          { name: letterGradeSpec.conditionDescriptorId, values: [parsed.letterValueId] },
        ];
        if (numericGradeSpec && parsed.numericValueId) {
          descriptors.push({ name: numericGradeSpec.conditionDescriptorId, values: [parsed.numericValueId] });
        }
        console.log(
          `[eBay ConditionDescriptors] category ${categoryId}: resolved GRADED (grader+letter grade matched in organizer text)`
        );
        return { status: 'resolved', condition: 'LIKE_NEW', conditionDescriptors: descriptors };
      }
      // A grading service WAS named but we couldn't parse a confident letter grade —
      // this is a real graded coin we can't safely describe. Do NOT fall through to
      // Ungraded (that would misdescribe it) — bail explicitly.
      const graderNamed = gradedSpecs.length > 0 && /\(([A-Z0-9\/\-]{2,10})\)/i.test(
        graderSpec.values.map((v) => v.conditionDescriptorValueName).join(' ')
      ) && graderSpec.values.some((v) => {
        const m = /\(([A-Z0-9\/\-]{2,10})\)\s*$/.exec(v.conditionDescriptorValueName);
        return m && new RegExp(`\\b${m[1].replace(/[/\-]/g, '\\$&')}\\b`, 'i').test(haystack);
      });
      if (graderNamed) {
        return { status: 'unresolved', reason: 'grading service named in item text but no parseable letter+number grade (e.g. "PCGS MS65") found — will not guess a grade' };
      }
      // else: no grading service named at all -- fall through to Ungraded below.
    }
  }

  // Ungraded path.
  if (ungradedSpecs.length === 0) {
    return { status: 'not_applicable' }; // category only has a Graded policy and this item isn't graded — unusual, treat as no-op
  }
  const descriptors: Array<{ name: string; values: string[] }> = [];
  for (const spec of ungradedSpecs) {
    if (spec.usage !== 'REQUIRED') continue; // skip optional descriptors (e.g. Certification Number) with no meaningful value
    const resolved = resolveUngradedConditionValue(spec, haystack);
    if (!resolved) {
      return { status: 'unresolved', reason: `could not resolve REQUIRED Ungraded descriptor "${spec.conditionDescriptorName}" (id ${spec.conditionDescriptorId})` };
    }
    console.log(
      `[eBay ConditionDescriptors] category ${categoryId}: UNGRADED "${spec.conditionDescriptorName}"="${resolved.name}" (${resolved.matchedBy === 'text' ? 'matched organizer text' : 'default — no specific grade language present'})`
    );
    descriptors.push({ name: spec.conditionDescriptorId, values: [resolved.id] });
  }
  if (descriptors.length === 0) {
    return { status: 'unresolved', reason: 'Ungraded policy has no REQUIRED descriptors resolvable' };
  }
  return { status: 'resolved', condition: 'USED_VERY_GOOD', conditionDescriptors: descriptors };
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
  isbn?: string | null; // ADR-089: real ISBN for the Books item-specific aspect (heal25002)
  tags?: string[] | null; // needed by heal25064 to derive a Coin/Card Condition descriptor value
  description?: string | null; // needed by heal25064's graded-coin detection (parseGradedCoinInfo reads title+description+tags)
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
  // S1215 fix (Q12E tuner / Vivitar flash stuck-offer incident, 2026-08-03): this
  // publish POST previously had NO try/catch of its own. A network hiccup or the
  // 15s AbortSignal.timeout() firing inside ebayFetch() threw an uncaught exception
  // here, which propagated straight out of ebayPublishWithSelfHeal, past every call
  // site's per-item try/catch, as a generic INTERNAL_ERROR -- AFTER the offer had
  // already been created and persisted to Item.ebayOfferId by the caller (offer
  // creation always commits before this function is ever called). Result: an item
  // permanently stuck with ebayOfferId set and ebayListingId null, no eBay errorId
  // to dispatch a healer on, and no trace of what happened. Catching here turns a
  // thrown network/timeout error into a normal { ok: false, errorBody } result so
  // the loop's existing error-surfacing (and the caller's ebayNeedsReview flagging)
  // apply uniformly instead of the exception escaping mid-flow.
  try {
    const res = await ebayFetch(`/sell/inventory/v1/offer/${ctx.offerId}/publish`, ctx.accessToken, { method: 'POST', body: {} });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as any;
      let listingId = (data?.listingId ?? null) as string | null;
      if (!listingId) {
        // eBay confirmed the publish (res.ok) but the response body didn't parse or
        // didn't include listingId. Previously this silently returned listingId: null,
        // which the caller treats as a total publish FAILURE even though eBay actually
        // created a live listing -- resulting in items live on eBay with zero trace in
        // FindA.Sale (no ebayListingId, no listedOnEbayAt, no ebayQueuedAt). Recover the
        // listingId via a follow-up GET before giving up. (Fix: eBay sync gap, 2026-07-28.)
        console.warn(`[eBay Publish] offer ${ctx.offerId}: publish returned ok but no listingId in body -- attempting recovery GET`);
        try {
          const offerGetRes = await ebayFetch(`/sell/inventory/v1/offer/${ctx.offerId}`, ctx.accessToken, { method: 'GET' });
          if (offerGetRes.ok) {
            const offerData = (await offerGetRes.json().catch(() => ({}))) as any;
            listingId = (offerData?.listingId ?? null) as string | null;
            if (listingId) {
              console.log(`[eBay Publish] offer ${ctx.offerId}: recovered listingId ${listingId} via GET after empty publish response`);
            } else {
              console.error(`[eBay Publish] offer ${ctx.offerId}: recovery GET succeeded but still no listingId -- publish may not be fully live yet`);
            }
          } else {
            console.error(`[eBay Publish] offer ${ctx.offerId}: recovery GET failed (HTTP ${offerGetRes.status}) after empty publish response`);
          }
        } catch (recoverErr) {
          console.error(`[eBay Publish] offer ${ctx.offerId}: recovery GET threw:`, recoverErr instanceof Error ? recoverErr.message : String(recoverErr));
        }
      }
      return { ok: true, listingId, errorBody: '' };
    }
    const errorBody = await res.text().catch(() => '');
    return { ok: false, listingId: null, errorBody };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[eBay Publish] offer ${ctx.offerId}: publish POST threw (network/timeout) -- treating as failed attempt, not propagating: ${msg}`);
    return { ok: false, listingId: null, errorBody: `NETWORK_ERROR: ${msg}` };
  }
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

  const invGet = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(ctx.sku)}`, ctx.accessToken, { method: 'GET' });
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
    const retryInvRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(ctx.sku)}`, ctx.accessToken, {
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
 * Parse the specific missing-aspect name(s) out of an eBay publish error body's
 * `errors[].parameters[].value` for a given errorId (P2 fix, S1050 BQ; generalized
 * 2026-09-05 for heal25064 — same parameters[] shape, different errorId). eBay
 * reports "BrandMPN" for the Brand/MPN pair requirement (25002), or a literal aspect
 * name (e.g. "Form Factor" on category 29946; "Coin Condition (2)" on category 11981
 * via 25064) for any other missing required aspect.
 */
function parseMissingRequiredAspectNames(errorBody: string, errorId: number): string[] {
  try {
    const parsed = JSON.parse(errorBody) as {
      errors?: Array<{ errorId?: number; parameters?: Array<{ name?: string; value?: string }> }>;
    };
    const names = new Set<string>();
    for (const err of parsed.errors || []) {
      if (err.errorId !== errorId) continue;
      for (const p of err.parameters || []) {
        const value = p?.value ? String(p.value).trim() : '';
        if (!value) continue;
        // Garbage filter (S1122 fix): eBay's parameters[] entries are not reliably
        // keyed by a semantic `name` like "aspectName" -- the real aspect name can
        // arrive under a purely positional/numeric `name` (confirmed via the 07-14
        // camel-jacket fix, where the real aspect "Size Type" arrived paired with a
        // numeric-index parameter). Some responses also carry the error's own
        // full-sentence message duplicated into a parameter value (e.g. "Add at
        // least 1 photo. More photos are better!"). A real aspect name is always a
        // short label, never a bare number and never a sentence.
        if (/^\d+$/.test(value)) continue; // numeric index leaked in as a value
        // 2026-09-05 (errorId 25064, Coin Condition incident): eBay can suffix a
        // legacy/duplicate-named specific with a parenthesized disambiguator, e.g.
        // "Coin Condition (2)". Strip it ONLY for the sentence-vs-label word-count
        // classification below — the real key still gets stored/injected verbatim
        // (with the suffix), since that's the exact label eBay's own error demands.
        const normalized = value.replace(/\s*\(\d+\)\s*$/, '');
        const wordCount = normalized.split(/\s+/).filter(Boolean).length;
        if (wordCount > 6 || value.length > 50 || /[.!?]/.test(value)) continue; // sentence-form message
        // ADR-089 tighten: eBay does NOT guarantee terminal punctuation, so a sentence like
        // "The ISBN field is missing" (5 words, no period) passed the filters above and would be
        // injected as a bogus aspect name. A real aspect label is <=2 words (after stripping any
        // "(N)" suffix) with no article/verb token — reject anything longer or containing one so
        // only true labels survive.
        if (wordCount > 2) continue;
        if (/\b(the|a|an|is|are|was|were|field|missing|value|add)\b/.test(normalized)) continue;
        names.add(value);
      }
    }
    return Array.from(names);
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

  const invGet = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(ctx.sku)}`, ctx.accessToken, { method: 'GET' });
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
  const missingNames = parseMissingRequiredAspectNames(errorBody, 25002);
  const dynamicNames = missingNames.filter((name) => !/^brand ?mpn$/i.test(name) && !hasKey(name));
  // ADR-089: ISBN is a REAL identifier aspect for Books — no safe default exists ("Does Not
  // Apply" is rejected by eBay for ISBN). Inject the item's real ISBN when present; SKIP entirely
  // when absent (a placeholder ISBN guarantees another 25002, so skipping lets the loop terminate
  // with a diagnosable failure rather than a guaranteed-invalid retry).
  if (dynamicNames.some((name) => /^isbn$/i.test(name))) {
    const realIsbn = item.isbn && String(item.isbn).trim() ? String(item.isbn).trim() : '';
    if (realIsbn) {
      aspectsObj['ISBN'] = [realIsbn];
      console.log(`[eBay SelfHeal 25002] ${ctx.sku}: injecting real ISBN=${realIsbn} from item`);
    } else {
      console.warn(`[eBay SelfHeal 25002] ${ctx.sku}: missing ISBN aspect but item has no ISBN — skipping (unhealable; needs auto-ISBN resolve)`);
    }
  }
  // Non-ISBN dynamic aspects: only inject when the name resolves to a REAL category aspect
  // (aspectSpec defined). A name matching no real aspect (e.g. a leaked sentence fragment) is
  // discarded rather than injected under bogus text.
  const nonIsbnNames = dynamicNames.filter((name) => !/^isbn$/i.test(name));
  if (nonIsbnNames.length > 0 && ctx.categoryId) {
    const spec = await getRequiredAspectsForCategory(ctx.categoryId);
    for (const name of nonIsbnNames) {
      const aspectSpec = spec?.find((a) => a.name.toLowerCase() === name.toLowerCase());
      if (!aspectSpec) {
        console.log(`[eBay SelfHeal 25002] ${ctx.sku}: discarding dynamic aspect "${name}" — no matching real category aspect`);
        continue;
      }
      const defaultValue = pickSafeAspectDefault(aspectSpec);
      aspectsObj[aspectSpec.name] = [defaultValue];
      console.log(`[eBay SelfHeal 25002] ${ctx.sku}: dynamically injecting missing aspect "${aspectSpec.name}"=${defaultValue}`);
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
  // ADR-089: mirror the real ISBN onto top-level product.isbn alongside the ISBN aspect.
  if (aspectsObj['ISBN'] && !invBody.product.isbn) {
    invBody.product.isbn = aspectsObj['ISBN'];
  }

  console.log(`[eBay SelfHeal 25002] ${ctx.sku}: injecting Brand=${aspectsObj['Brand']?.[0]} + MPN=${aspectsObj['MPN']?.[0]} and re-publishing`);
  const retryInvRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(ctx.sku)}`, ctx.accessToken, {
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
    const invGet = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(ctx.sku)}`, ctx.accessToken, { method: 'GET' });
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
    const retryInvRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(ctx.sku)}`, ctx.accessToken, {
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
 * 25007 -- offer/listing references a fulfillment policy eBay no longer recognizes
 * ("The eBay listing associated with the inventory item, or the unpublished offer
 * has invalid data in the associated Fulfillment policy. You've provided an invalid
 * shipping policy."). Confirmed live 2026-08-14 (Vivitar-flash item
 * cmsaozd8600vnjgvqfajiohfm, offer 221915356011): the offer's stored
 * listingPolicies.fulfillmentPolicyId (295437971011) 404s ("No Record Found") on a
 * direct GET /sell/account/v1/fulfillment_policy/{id} -- the policy itself no longer
 * exists on eBay (organizer-side deletion, or a prior provisioning left a dead
 * reference), and nothing previously re-resolved a fresh one before retrying publish.
 * A prior fix (S1184, referenced above at EbayPublishResult.lastErrorMessage) only
 * surfaced this error's real text to the toast -- it did not repair it, so the item
 * stayed permanently stuck (ebayNeedsReview=true excludes it from
 * ebayStuckOfferRetryCron's own retry pool once flagged).
 *
 * Fix: re-run the SAME routing cascade the original push used (resolvePoliciesForItem,
 * lazily imported from ebayController -- same pattern heal25005 already uses above, to
 * avoid a static circular dependency), apply the freshly-resolved policy id to the
 * existing offer (applyFulfillmentPolicyToOffer, the same primitive the resync/revise
 * paths already use), and retry publish.
 */
const heal25007: Healer = async (ctx) => {
  try {
    const dbItem = await prisma.item.findUnique({
      where: { id: ctx.item.id },
      select: {
        packageWeightOz: true,
        packageLengthIn: true,
        packageWidthIn: true,
        packageHeightIn: true,
        packageType: true,
        packageConfirmedByOrganizer: true,
        ebayShippingClassification: true,
        ebayCategoryId: true,
        category: true,
        ebayShippingOverride: true,
        ebayFulfillmentPolicyOverrideId: true,
        price: true,
        sale: { select: { zip: true, organizerId: true } },
      },
    });
    const organizerId = dbItem?.sale?.organizerId;
    if (!dbItem || !organizerId) {
      console.warn(`[eBay SelfHeal 25007] item ${ctx.item.id}: could not load item/organizer -- bailing`);
      return { published: false, retry: false };
    }

    const fetchFulfillmentPolicies = async (): Promise<any[]> => {
      try {
        const res = await ebayFetch(
          '/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100',
          ctx.accessToken,
          { method: 'GET' }
        );
        if (res.ok) {
          const data = (await res.json()) as any;
          return data.fulfillmentPolicies || [];
        }
      } catch (err) {
        console.warn('[eBay SelfHeal 25007] fulfillment policy fetch failed:', (err as Error).message);
      }
      return [];
    };

    const { resolvePoliciesForItem, applyFulfillmentPolicyToOffer } = await import('../controllers/ebayController');
    const routing = await resolvePoliciesForItem(
      organizerId,
      {
        id: ctx.item.id,
        packageWeightOz: dbItem.packageWeightOz,
        packageLengthIn: dbItem.packageLengthIn != null ? Number(dbItem.packageLengthIn) : null,
        packageWidthIn: dbItem.packageWidthIn != null ? Number(dbItem.packageWidthIn) : null,
        packageHeightIn: dbItem.packageHeightIn != null ? Number(dbItem.packageHeightIn) : null,
        packageType: dbItem.packageType,
        ebayShippingClassification: dbItem.ebayShippingClassification,
        ebayCategoryId: dbItem.ebayCategoryId,
        category: dbItem.category,
        ebayShippingOverride: dbItem.ebayShippingOverride,
        ebayFulfillmentPolicyOverrideId: dbItem.ebayFulfillmentPolicyOverrideId,
        price: dbItem.price != null ? Number(dbItem.price) : null,
        packageConfirmedByOrganizer: dbItem.packageConfirmedByOrganizer,
      },
      { fetchFulfillmentPolicies, fromZip: dbItem.sale?.zip ?? null }
    );

    if ('error' in routing) {
      console.warn(`[eBay SelfHeal 25007] item ${ctx.item.id}: routing failed (${routing.code}) -- bailing`);
      return { published: false, retry: false };
    }

    const applied = await applyFulfillmentPolicyToOffer(ctx.offerId, routing.fulfillmentPolicyId, ctx.accessToken);
    if (!applied.success) {
      console.warn(
        `[eBay SelfHeal 25007] item ${ctx.item.id}: failed to apply fresh policy ${routing.fulfillmentPolicyId} to offer ${ctx.offerId}`
      );
      return { published: false, retry: false };
    }

    console.log(
      `[eBay SelfHeal 25007] item ${ctx.item.id}: applied fresh fulfillment policy ${routing.fulfillmentPolicyId} to offer ${ctx.offerId} -- retrying publish`
    );
    const pub = await attemptPublish(ctx);
    if (pub.ok) return { published: true, listingId: pub.listingId, retry: false };
    return { published: false, retry: true };
  } catch (err) {
    console.error('[eBay SelfHeal 25007] threw:', (err as Error).message);
    return { published: false, retry: false };
  }
};

/**
 * heal25064 — eBay's Coin/Card Condition Requirements policy (see the
 * resolveCoinConditionOverride block above). errorId 25064 ("Coin
 * Condition (2) is a required field.") fires when the inventory item's
 * `conditionDescriptors` array is missing/incomplete — a top-level inventory
 * item field, NOT a product.aspects item-specific, despite the error's wording
 * and despite the Taxonomy API's getRequiredAspectsForCategory never listing it
 * as a required aspect (confirmed 2026-09-05: it logged "0 required (none)" for
 * category 11981 while the live publish call still rejected on this).
 *
 * SUPERSEDES an earlier same-day version of this healer that injected the
 * missing aspect name into `product.aspects` instead. That version's PUT
 * round-tripped cleanly on a verify-GET (`{"Coin Condition (2)":["Circulated"]}`)
 * but did NOT satisfy the publish validator, because product.aspects was simply
 * the wrong field. This version writes to `conditionDescriptors` instead, and
 * also strips out any stray Coin-Condition-shaped key a prior run may have left
 * behind in product.aspects.
 */
function parseMissing25064AspectNames(errorBody: string): string[] {
  try {
    const parsed = JSON.parse(errorBody) as { errors?: Array<{ errorId?: number; message?: string }> };
    const names = new Set<string>();
    for (const err of parsed.errors || []) {
      if (err.errorId !== 25064) continue;
      const match = /^(.+?)\s+is a required field\.?$/i.exec((err.message || '').trim());
      if (match && match[1]) names.add(match[1].trim());
    }
    return Array.from(names);
  } catch {
    return [];
  }
}

const heal25064: Healer = async (ctx, errorBody) => {
  await refreshCanonicalSku(ctx);
  if (!ctx.sku) {
    console.warn(`[eBay SelfHeal 25064] item ${ctx.item.id} offer ${ctx.offerId}: bailing — SKU could not be resolved from eBay offer GET`);
    return { published: false, retry: false };
  }

  // Sanity-check the error is actually the Coin/Card Condition Requirements one
  // before doing any work — logged loudly if 25064 ever fires for something else
  // in the future so this isn't silently misapplied.
  const missingNames = parseMissing25064AspectNames(errorBody);
  if (missingNames.length === 0) {
    console.warn(`[eBay SelfHeal 25064] item ${ctx.item.id} sku ${ctx.sku}: bailing — could not parse a missing field name out of the 25064 error body. Raw body: ${errorBody.slice(0, 800)}`);
    return { published: false, retry: false };
  }

  const categoryId = ctx.item.ebayCategoryId;
  if (!categoryId) {
    console.warn(`[eBay SelfHeal 25064] item ${ctx.item.id} sku ${ctx.sku}: bailing — no ebayCategoryId on item, cannot resolve condition descriptors`);
    return { published: false, retry: false };
  }

  // Checks BOTH Graded and Ungraded policies and detects real grading-service text in
  // the item's own title/description/tags first — never silently forces a certified
  // coin into the Ungraded bucket. See resolveCoinConditionOverride for the full logic.
  const resolution = await resolveCoinConditionOverride(categoryId, {
    title: ctx.item.title,
    description: ctx.item.description,
    tags: ctx.item.tags,
  });
  if (resolution.status !== 'resolved') {
    console.warn(
      `[eBay SelfHeal 25064] item ${ctx.item.id} sku ${ctx.sku}: bailing — ${resolution.status === 'unresolved' ? resolution.reason : 'category has no coin/card condition-descriptor policy (unexpected for a 25064 error)'}`
    );
    return { published: false, retry: false };
  }

  const invGet = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(ctx.sku)}`, ctx.accessToken, { method: 'GET' });
  if (!invGet.ok) {
    console.warn(`[eBay SelfHeal 25064] item ${ctx.item.id} sku ${ctx.sku}: bailing — inventory item GET failed (HTTP ${invGet.status})`);
    return { published: false, retry: false };
  }
  const invBody = (await invGet.json()) as any;

  // Clean up the invalid product.aspects "Coin Condition (2)"-style key a prior,
  // now-superseded version of this healer injected. Confirmed via live verify-GET
  // it round-tripped fine but never satisfied the publish validator — the real
  // requirement lives in conditionDescriptors, a separate top-level field. Left in
  // place it's inert clutter at best; removing it avoids any future eBay
  // deprecation-warning noise (code 25126).
  if (invBody.product && typeof invBody.product === 'object' && invBody.product.aspects && typeof invBody.product.aspects === 'object') {
    const aspectsObj = invBody.product.aspects as Record<string, unknown>;
    for (const key of Object.keys(aspectsObj)) {
      if (/circulated|uncirculated|coin\s*condition/i.test(key)) delete aspectsObj[key];
    }
  }

  if (invBody.condition !== resolution.condition) {
    console.log(`[eBay SelfHeal 25064] ${ctx.sku}: overriding condition ${invBody.condition ?? 'unset'} → ${resolution.condition} (organizer text indicates ${resolution.condition === 'LIKE_NEW' ? 'a professionally graded' : 'an ungraded'} coin/card)`);
  }
  invBody.condition = resolution.condition;
  invBody.conditionDescriptors = resolution.conditionDescriptors;
  const retryInvRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(ctx.sku)}`, ctx.accessToken, {
    method: 'PUT',
    body: invBody,
  });
  if (!retryInvRes.ok && retryInvRes.status !== 204) {
    console.warn(`[eBay SelfHeal 25064] item ${ctx.item.id} sku ${ctx.sku}: bailing — inventory item PUT (conditionDescriptors injection) failed (HTTP ${retryInvRes.status})`);
    return { published: false, retry: false };
  }
  try {
    const verifyRes = await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(ctx.sku)}`, ctx.accessToken, { method: 'GET' });
    if (verifyRes.ok) {
      const verifyData = (await verifyRes.json()) as any;
      console.log(`[eBay SelfHeal 25064 Verify] ${ctx.sku}: condition=${verifyData?.condition ?? null} conditionDescriptors after PUT = ${JSON.stringify(verifyData?.conditionDescriptors ?? null)}`);
    } else {
      console.warn(`[eBay SelfHeal 25064 Verify] ${ctx.sku}: verify GET failed HTTP ${verifyRes.status}`);
    }
  } catch (err) {
    console.warn(`[eBay SelfHeal 25064 Verify] ${ctx.sku}: verify GET threw:`, (err as Error).message);
  }
  const pub = await attemptPublish(ctx);
  if (pub.ok) return { published: true, listingId: pub.listingId, retry: false };
  console.warn(`[eBay SelfHeal 25064] ${ctx.sku}: re-publish after conditionDescriptors injection still failed. Raw body: ${pub.errorBody.slice(0, 800)}`);
  return { published: false, retry: true };
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
  '25007': heal25007,
  '25064': heal25064,
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

/**
 * Extract the first user-friendly error message from an eBay error response body.
 * Duplicated (not imported) from ebayController.ts's own parseEbayErrorMessage to
 * avoid a circular import (ebayController already imports from this file).
 */
function parseEbayErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed?.errors?.[0]?.message) return String(parsed.errors[0].message);
    if (parsed?.errors?.[0]?.longMessage) return String(parsed.errors[0].longMessage);
    if (parsed?.message) return String(parsed.message);
  } catch {
    // not JSON
  }
  return null;
}

export interface EbayPublishResult {
  published: boolean;
  listingId: string | null;
  /** The last eBay errorId encountered when publish ultimately failed. */
  lastErrorId?: string | null;
  /**
   * Human-readable text of the LAST publish error, parsed from eBay's raw response body
   * (or the raw body itself, truncated, when it isn't parseable JSON). Root-cause fix
   * (S1184, Vivitar-flash push failure): previously the real eBay error was only ever
   * console.warn'd inside the loop and discarded from the return value -- every publish
   * failure with an errorId outside the 4 registered healers (25005/25021/25101/25002)
   * came back to the caller as `lastErrorId: null`, which every call site then turned
   * into a completely generic "Failed to publish offer" / "eBay rejected publish" toast
   * with zero information about what actually went wrong (e.g. an invalid/stale
   * fulfillmentPolicyId). Callers should prefer this over a hardcoded generic string.
   */
  lastErrorMessage?: string | null;
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
    return { published: false, listingId: null, offerId: null, lastErrorId: null, lastErrorMessage: 'Item has no eBay offer to publish' };
  }

  const accessToken = input.accessToken ?? (await getEbayAccessToken());
  if (!accessToken) {
    return { published: false, listingId: null, offerId, lastErrorId: null, lastErrorMessage: 'Could not get a valid eBay access token' };
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
  let lastErrorMessage: string | null = null;

  for (let iteration = 0; iteration < 5; iteration++) {
    const pub = await attemptPublish(ctx);
    if (pub.ok) {
      return { published: true, listingId: pub.listingId, offerId: ctx.offerId, lastErrorId, lastErrorMessage: null };
    }

    // Capture the real eBay error text for EVERY failed attempt (not just unhealable
    // ones) so the caller always has the most recent real reason, even if a later
    // healer iteration also fails without changing the underlying cause.
    lastErrorMessage = parseEbayErrorMessage(pub.errorBody) ?? pub.errorBody.slice(0, 300) ?? null;

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
      return { published: true, listingId: result.listingId ?? null, offerId: ctx.offerId, lastErrorId, lastErrorMessage: null };
    }
    if (!result.retry) {
      // Healer could not repair — stop.
      break;
    }
    // result.retry === true → loop re-attempts the publish.
  }

  return { published: false, listingId: null, offerId: ctx.offerId, lastErrorId, lastErrorMessage };
}
