/**
 * verifyBulkLotEbayBundle.ts: READ-ONLY eBay check for the bulk lot bundle listing (ADR-136 Addendum C, roadmap #659).
 * Run by Patrick or ops, never by CI and never by a dev agent. Read-only is enforced three ways: every request in this
 * file is a GET with an explicit method, the file contains no write verb at all (a test greps the source for the four
 * write verbs and fails if one appears, even in a comment), and it imports nothing that writes to a database.
 *
 * WHAT IT CALLS (EBAY_US), 5 calls in total, application token only (no organizer token, no seller account touched):
 *   V0  GET /commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US
 *       confirms the tree id the other calls use (0).
 *   V1  GET /commerce/taxonomy/v1/category_tree/0/get_category_subtree?category_id=183455
 *       records the display name, whether 183455 is a LEAF (a bundle can only be listed in a leaf) and its parent.
 *       The same call for the parent (2536) lists the sibling categories, in case 183455 is not the right leaf.
 *   V2  GET /commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=183455
 *       records every aspect name, required flag, mode and values, and checks the two aspects the listing sends
 *       (Game and Language) against the live names and values. A required aspect the listing does not send is reported
 *       in `requiredAspectsNotSent`: the first live publish would be refused for it.
 *   V3  GET /sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?filter=categoryIds:{183455}
 *       records the condition ids eBay accepts in the category and whether the two ids the listing can send are listed
 *       (1000 for NEW, 3000 for USED). The condition mapping in services/ebayInventoryMapping or the push pipeline must
 *       agree; this only reports what eBay says.
 * Sources for the design: https://developer.ebay.com/api-docs/commerce/taxonomy/overview.html and
 * https://developer.ebay.com/api-docs/sell/metadata/overview.html (client-credentials scope works for these reads).
 *
 * TOKEN: obtained with getEbayAccessToken() (the same application token path the publish code uses). The token is never
 * printed: every string that goes to stdout or stderr is passed through redact() first.
 *
 * HOW TO RUN (from the repo root, with EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_PROXY_SECRET and FRONTEND_URL in the
 * environment, for example through the Railway CLI which injects the service env):
 *   railway run pnpm --filter backend exec tsx src/scripts/verifyBulkLotEbayBundle.ts > bulk-lot-ebay-bundle.json
 * Attach bulk-lot-ebay-bundle.json to the ADR-136 PR. Progress goes to stderr, the JSON report to stdout.
 * Exit code 0 when all 5 calls succeeded, 1 otherwise.
 *
 * NOT covered here (they are not read-only, each needs Patrick's go-ahead): the revise of a live bundle quantity, the
 * quantity zero behavior, the end and relist round trip, and the one live publish of a real bundle. They are listed in
 * ADR-136 Addendum C under "Live checks owed".
 */

import { ebayProxyHeaders, ebayProxyUrl, getEbayAccessToken } from '../services/ebayHttp';
import { BULK_EBAY_CATEGORY, bundleTags } from '../services/bulkLot/bulkLotEbayBundle';
import { summarizeAspects, summarizePolicies, summarizeSubtree } from './verifyCardEbayPolicies';

const CALL_DELAY_MS = 250;
/** The aspect names the bundle listing sends (see bundleTags: "Game:..." and "Language:..."). */
export const SENT_ASPECT_NAMES: readonly string[] = ['Game', 'Language'];
/** The two condition ids the bundle listing can send: NEW and USED. */
export const SENT_CONDITION_IDS: Readonly<Record<string, string>> = { NEW: '1000', USED: '3000' };
const PARENT_CATEGORY_ID = '2536';

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
    if (!res.ok) return { ok: false, status: res.status, data: null, error: redact(body.slice(0, 400), token) };
    try {
      return { ok: true, status: res.status, data: JSON.parse(body) };
    } catch {
      return { ok: false, status: res.status, data: null, error: 'response was not JSON' };
    }
  } catch (err) {
    return { ok: false, status: 0, data: null, error: redact((err as Error).message, token) };
  }
}

interface AspectSummary {
  name: string | null;
  required: boolean;
  mode: string | null;
  values: string[];
  valueCount: number;
}

/**
 * Compares the aspects the listing sends with the live aspect list. Pure and exported for tests.
 *  - sentAspectsMissing: names we send that the category does not list (eBay would ignore or refuse them)
 *  - sentValueNotListed: for a SELECTION_ONLY aspect, a value we send that is not in eBay's list
 *  - requiredAspectsNotSent: required aspects the listing does not send (the first publish would be refused)
 */
export function buildAspectCheck(aspectSummary: Record<string, unknown>, game: string | null = 'MTG', language = 'English'): Record<string, unknown> {
  const aspects = ((aspectSummary as { aspects?: AspectSummary[] }).aspects ?? []) as AspectSummary[];
  const sent = new Map<string, string>();
  for (const t of bundleTags({ game, language })) {
    const at = t.indexOf(':');
    sent.set(t.slice(0, at), t.slice(at + 1));
  }
  const byName = new Map(aspects.map((a) => [String(a.name), a]));
  const sentAspectsMissing: string[] = [];
  const sentValueNotListed: Array<{ aspect: string; sent: string; mode: string | null }> = [];
  for (const [name, value] of sent) {
    const live = byName.get(name);
    if (!live) {
      sentAspectsMissing.push(name);
      continue;
    }
    if (live.mode === 'SELECTION_ONLY' && live.valueCount > 0 && !live.values.includes(value)) {
      sentValueNotListed.push({ aspect: name, sent: value, mode: live.mode });
    }
  }
  const requiredAspectsNotSent = aspects.filter((a) => a.required && !sent.has(String(a.name))).map((a) => a.name);
  return { sent: Object.fromEntries(sent), sentAspectsMissing, sentValueNotListed, requiredAspectsNotSent };
}

interface PolicyConditionSummary {
  conditionId: string | null;
  conditionDescription: string | null;
}

/** Whether the two condition ids the listing can send are listed for the category. Pure and exported for tests. */
export function buildConditionCheck(policySummary: Record<string, unknown>): Record<string, unknown> {
  const listed = (((policySummary as { conditions?: PolicyConditionSummary[] }).conditions) ?? []).map((c) => String(c.conditionId));
  return {
    listedConditionIds: listed,
    newListed: listed.includes(SENT_CONDITION_IDS.NEW),
    usedListed: listed.includes(SENT_CONDITION_IDS.USED),
  };
}

export async function runVerification(): Promise<void> {
  const token = await getEbayAccessToken();
  if (!token) {
    console.error('Could not get an eBay application token. Check EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_PROXY_SECRET and FRONTEND_URL.');
    process.exitCode = 1;
    return;
  }
  const id = BULK_EBAY_CATEGORY.id;
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    marketplace: 'EBAY_US',
    categoryId: id,
    callsPlanned: 5,
  };
  let failures = 0;

  console.error('V0 default category tree');
  const v0 = await getJson('/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US', token);
  report.v0_defaultTree = v0.ok ? { categoryTreeId: (v0.data as { categoryTreeId?: string })?.categoryTreeId ?? null, version: (v0.data as { categoryTreeVersion?: string })?.categoryTreeVersion ?? null } : { error: v0.error, status: v0.status };
  if (!v0.ok) failures++;
  await sleep(CALL_DELAY_MS);

  console.error(`V1 category ${id}`);
  const v1 = await getJson(`/commerce/taxonomy/v1/category_tree/0/get_category_subtree?category_id=${id}`, token);
  report.v1_subtree = v1.ok ? summarizeSubtree(v1.data) : { error: v1.error, status: v1.status };
  if (!v1.ok) failures++;
  await sleep(CALL_DELAY_MS);

  console.error(`V1 parent category ${PARENT_CATEGORY_ID}`);
  const v1p = await getJson(`/commerce/taxonomy/v1/category_tree/0/get_category_subtree?category_id=${PARENT_CATEGORY_ID}`, token);
  report.v1_parentSubtree = v1p.ok ? summarizeSubtree(v1p.data) : { error: v1p.error, status: v1p.status };
  if (!v1p.ok) failures++;
  await sleep(CALL_DELAY_MS);

  console.error(`V2 aspects ${id}`);
  const v2 = await getJson(`/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${id}`, token);
  const aspects = v2.ok ? summarizeAspects(v2.data) : null;
  report.v2_aspects = aspects ?? { error: v2.error, status: v2.status };
  report.v2_aspectCheck = aspects ? buildAspectCheck(aspects) : { error: 'aspect call failed, nothing to compare (a 400 here usually means the id is not a leaf, see V1)' };
  if (!v2.ok) failures++;
  await sleep(CALL_DELAY_MS);

  console.error(`V3 condition policies ${id}`);
  const v3 = await getJson(`/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?filter=categoryIds:%7B${id}%7D`, token);
  const policies = v3.ok ? summarizePolicies(v3.data) : null;
  report.v3_conditionPolicies = policies ?? { error: v3.error, status: v3.status };
  report.v3_conditionCheck = policies ? buildConditionCheck(policies) : { error: 'policy call failed, nothing to compare' };
  if (!v3.ok) failures++;

  report.callFailures = failures;
  console.log(redact(JSON.stringify(report, null, 2), token));
  process.exitCode = failures === 0 ? 0 : 1;
}

if (require.main === module) {
  runVerification().catch((err) => {
    console.error('verifyBulkLotEbayBundle failed:', redact((err as Error).message, null));
    process.exitCode = 1;
  });
}
