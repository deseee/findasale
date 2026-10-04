/**
 * verifyCardEbayPolicies.ts: READ-ONLY eBay check for the three trading card categories
 * (ADR-134 #643, section 5.8, steps V1 to V3). Run by Patrick or ops, never by CI and never by a dev
 * agent. Read-only is enforced three ways: every request in this file is a GET with an explicit method,
 * the file contains no write verb at all (a test greps the source for the four write verbs and fails if
 * one appears, even in a comment), and it imports nothing that writes to a database.
 *
 * WHAT IT CALLS (EBAY_US, category tree 0), for each of 183454, 183050 and 261328, 9 calls in total:
 *   V1  GET /commerce/taxonomy/v1/category_tree/0/get_category_subtree?category_id={id}
 *       records the display name, whether the node is a leaf, and the parent id (needed to fill the
 *       `name` fields in config/cardEbayCategories.ts and to judge the Standard Envelope map, D5).
 *   V2  GET /commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id={id}
 *       records the live aspect names, required flag, mode, cardinality and values (settles the
 *       candidate names in services/ebayCardAspects.ts; Taxonomy rejects a non-leaf id, so a 400 here is
 *       itself a V1 answer).
 *   V3  GET /sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?filter=categoryIds:{id}
 *       records the condition ids, descriptor ids and values IN THE ORDER eBay returns them (settles what
 *       `spec.values[0]` was for the old fallback) and diffs them against the id tables in
 *       config/cardEbayCategories.ts (`tableCheck`).
 * Docs read for this design (fetched 2026-10-03): the OpenAPI files for Taxonomy v1.1.1 and Metadata
 * v1.12.1 list `api_scope` and a client-credentials flow for these operations, so an APPLICATION token is
 * enough and no organizer token is used. eBay states no per-call fee; 9 calls is far below the 5,000 per
 * day Taxonomy allowance (https://developer.ebay.com/develop/get-started/api-call-limits).
 *
 * TOKEN: obtained with getEbayAccessToken() (the same application token path the publish code uses). The
 * token is never printed: it is not placed in the report, and every string that goes to stdout or stderr
 * is passed through redact() first.
 *
 * HOW TO RUN (from the repo root, with EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_PROXY_SECRET and
 * FRONTEND_URL in the environment, for example through the Railway CLI which injects the service env):
 *   railway run pnpm --filter backend exec tsx src/scripts/verifyCardEbayPolicies.ts > card-ebay-policies.json
 * Attach card-ebay-policies.json to the ADR-134 PR. Progress lines go to stderr, the JSON report to stdout.
 * Exit code 0 when all 9 calls succeeded, 1 otherwise.
 *
 * NOT covered here (they are not read-only): V4, the certification-number payload shape (one draft
 * inventory item on Patrick's own account, organizer token), and V5, Standard Envelope eligibility (read
 * eBay's help page in a browser).
 */

import { ebayProxyHeaders, ebayProxyUrl, getEbayAccessToken } from '../services/ebayHttp';
import {
  CARD_DESCRIPTOR,
  CARD_GRADER_VALUE_IDS,
  CARD_GRADE_VALUE_IDS,
  CARD_CONDITION_GRADED,
  CARD_CONDITION_UNGRADED,
  PINNED_CARD_CATEGORY_IDS,
} from '../config/cardEbayCategories';

const CALL_DELAY_MS = 250;
const MAX_VALUES_PRINTED = 60;

interface CallResult {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
}

/** Remove the token (and any Bearer text) from a string before it is printed. Pure. */
export function redact(text: string, token: string | null | undefined): string {
  let out = String(text);
  if (token) out = out.split(token).join('[redacted]');
  return out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(path: string, token: string): Promise<CallResult> {
  try {
    const res = await fetch(ebayProxyUrl(encodeURIComponent(path)), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Accept-Language': 'en-US',
        ...ebayProxyHeaders(),
      },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, error: redact(body.slice(0, 400), token) };
    }
    try {
      return { ok: true, status: res.status, data: JSON.parse(body) };
    } catch {
      return { ok: false, status: res.status, data: null, error: 'response was not JSON' };
    }
  } catch (err) {
    return { ok: false, status: 0, data: null, error: redact((err as Error).message, token) };
  }
}

// ── V1 ───────────────────────────────────────────────────────────────────────

interface SubtreeNode {
  categoryTreeNodeLevel?: number;
  category?: { categoryId?: string; categoryName?: string };
  leafCategoryTreeNode?: boolean;
  parentCategoryTreeNodeHref?: string;
  childCategoryTreeNodes?: SubtreeNode[];
}

export function summarizeSubtree(data: unknown): Record<string, unknown> {
  const root = ((data as { categorySubtreeNode?: SubtreeNode } | null)?.categorySubtreeNode) ?? null;
  if (!root) return { found: false };
  return {
    found: true,
    categoryId: root.category?.categoryId ?? null,
    categoryName: root.category?.categoryName ?? null,
    level: root.categoryTreeNodeLevel ?? null,
    leafCategoryTreeNode: root.leafCategoryTreeNode === true,
    parentCategoryTreeNodeHref: root.parentCategoryTreeNodeHref ?? null,
    childCount: (root.childCategoryTreeNodes ?? []).length,
    children: (root.childCategoryTreeNodes ?? []).slice(0, 25).map((c) => ({
      categoryId: c.category?.categoryId ?? null,
      categoryName: c.category?.categoryName ?? null,
      leaf: c.leafCategoryTreeNode === true,
    })),
  };
}

// ── V2 ───────────────────────────────────────────────────────────────────────

interface TaxonomyAspect {
  localizedAspectName?: string;
  aspectConstraint?: { aspectRequired?: boolean; aspectMode?: string; itemToAspectCardinality?: string; aspectDataType?: string };
  aspectValues?: Array<{ localizedValue?: string }>;
}

export function summarizeAspects(data: unknown): Record<string, unknown> {
  const aspects = ((data as { aspects?: TaxonomyAspect[] } | null)?.aspects) ?? [];
  return {
    aspectCount: aspects.length,
    aspects: aspects.map((a) => {
      const values = (a.aspectValues ?? []).map((v) => v.localizedValue ?? '');
      return {
        name: a.localizedAspectName ?? null,
        required: a.aspectConstraint?.aspectRequired === true,
        mode: a.aspectConstraint?.aspectMode ?? null,
        cardinality: a.aspectConstraint?.itemToAspectCardinality ?? null,
        dataType: a.aspectConstraint?.aspectDataType ?? null,
        valueCount: values.length,
        values: values.slice(0, MAX_VALUES_PRINTED),
        valuesTruncated: values.length > MAX_VALUES_PRINTED,
      };
    }),
  };
}

// ── V3 ───────────────────────────────────────────────────────────────────────

interface PolicyDescriptor {
  conditionDescriptorId?: string;
  conditionDescriptorName?: string;
  conditionDescriptorConstraint?: { usage?: string };
  conditionDescriptorValues?: Array<{ conditionDescriptorValueId?: string; conditionDescriptorValueName?: string }>;
}

interface PolicyCondition {
  conditionId?: string;
  conditionDescription?: string;
  conditionDescriptors?: PolicyDescriptor[];
}

function liveConditions(data: unknown): PolicyCondition[] {
  const policies = (data as { itemConditionPolicies?: Array<{ itemConditions?: PolicyCondition[] }> } | null)?.itemConditionPolicies;
  return policies?.[0]?.itemConditions ?? [];
}

export function summarizePolicies(data: unknown): Record<string, unknown> {
  return {
    conditions: liveConditions(data).map((c) => ({
      conditionId: c.conditionId ?? null,
      conditionDescription: c.conditionDescription ?? null,
      descriptors: (c.conditionDescriptors ?? []).map((d) => ({
        id: d.conditionDescriptorId ?? null,
        name: d.conditionDescriptorName ?? null,
        usage: d.conditionDescriptorConstraint?.usage ?? null,
        // Order is exactly the order eBay returned, which is what the old values[0] fallback depended on.
        values: (d.conditionDescriptorValues ?? []).map((v) => ({
          id: v.conditionDescriptorValueId ?? null,
          name: v.conditionDescriptorValueName ?? null,
        })),
      })),
    })),
  };
}

function liveValueIds(data: unknown, conditionId: string, descriptorId: string): string[] | null {
  const cond = liveConditions(data).find((c) => c.conditionId === conditionId);
  if (!cond) return null;
  const desc = (cond.conditionDescriptors ?? []).find((d) => d.conditionDescriptorId === descriptorId);
  if (!desc) return null;
  return (desc.conditionDescriptorValues ?? []).map((v) => v.conditionDescriptorValueId ?? '');
}

/**
 * Diff the live policy for one category against the id tables compiled into
 * config/cardEbayCategories.ts. `missingFromLive` is the dangerous direction: an id the code would send
 * that eBay no longer lists (the resolver already returns `unresolved` for those, so nothing is published
 * wrong, but the table needs fixing). `extraInLive` is informational. Pure and exported for tests.
 */
export function buildTableCheck(categoryId: string, policyData: unknown): Record<string, unknown> {
  const expectedGraders = Object.entries(CARD_GRADER_VALUE_IDS)
    .filter(([, e]) => e.categories.includes(categoryId))
    .map(([, e]) => e.valueId);
  const expectedGrades = Object.values(CARD_GRADE_VALUE_IDS);
  const diff = (expected: string[], live: string[] | null): Record<string, unknown> =>
    live === null
      ? { descriptorPresent: false, missingFromLive: expected, extraInLive: [] }
      : {
          descriptorPresent: true,
          missingFromLive: expected.filter((id) => !live.includes(id)),
          extraInLive: live.filter((id) => !expected.includes(id)),
        };
  const ungradedExpected = categoryId === '183454'
    ? ['400010', '400015', '400016', '400017']
    : ['400010', '400011', '400012', '400013'];
  return {
    gradedConditionEnum: CARD_CONDITION_GRADED,
    ungradedConditionEnum: CARD_CONDITION_UNGRADED,
    grader27501: diff(expectedGraders, liveValueIds(policyData, '2750', CARD_DESCRIPTOR.GRADER)),
    grade27502: diff(expectedGrades, liveValueIds(policyData, '2750', CARD_DESCRIPTOR.GRADE)),
    certNumber27503DescriptorListed: liveValueIds(policyData, '2750', CARD_DESCRIPTOR.CERT_NUMBER) !== null,
    cardCondition40001: diff(ungradedExpected, liveValueIds(policyData, '4000', CARD_DESCRIPTOR.CARD_CONDITION)),
  };
}

// ── main ─────────────────────────────────────────────────────────────────────

export async function runVerification(): Promise<void> {
  const token = await getEbayAccessToken();
  if (!token) {
    console.error('Could not get an eBay application token. Check EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_PROXY_SECRET and FRONTEND_URL.');
    process.exitCode = 1;
    return;
  }

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    marketplace: 'EBAY_US',
    categoryTreeId: '0',
    callsPlanned: PINNED_CARD_CATEGORY_IDS.length * 3,
    categories: {} as Record<string, unknown>,
  };
  const categories = report.categories as Record<string, unknown>;
  let failures = 0;

  for (const id of PINNED_CARD_CATEGORY_IDS) {
    const entry: Record<string, unknown> = {};
    categories[id] = entry;

    console.error(`V1 category ${id}`);
    const v1 = await getJson(`/commerce/taxonomy/v1/category_tree/0/get_category_subtree?category_id=${id}`, token);
    entry.v1_subtree = v1.ok ? summarizeSubtree(v1.data) : { error: v1.error, status: v1.status };
    if (!v1.ok) failures++;
    await sleep(CALL_DELAY_MS);

    console.error(`V2 category ${id}`);
    const v2 = await getJson(`/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${id}`, token);
    entry.v2_aspects = v2.ok ? summarizeAspects(v2.data) : { error: v2.error, status: v2.status };
    if (!v2.ok) failures++;
    await sleep(CALL_DELAY_MS);

    console.error(`V3 category ${id}`);
    const v3 = await getJson(
      `/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?filter=categoryIds:%7B${id}%7D`,
      token
    );
    entry.v3_conditionPolicies = v3.ok ? summarizePolicies(v3.data) : { error: v3.error, status: v3.status };
    entry.v3_tableCheck = v3.ok ? buildTableCheck(id, v3.data) : { error: 'policy call failed, nothing to compare' };
    if (!v3.ok) failures++;
    await sleep(CALL_DELAY_MS);
  }

  report.callFailures = failures;
  console.log(redact(JSON.stringify(report, null, 2), token));
  process.exitCode = failures === 0 ? 0 : 1;
}

if (require.main === module) {
  runVerification().catch((err) => {
    console.error('verifyCardEbayPolicies failed:', redact((err as Error).message, null));
    process.exitCode = 1;
  });
}
