/**
 * etsyTaxonomy.ts -- fetch and cache Etsy's seller-taxonomy tree, and search it for the category
 * picker (ADR-135 D3.1, batch E-B3 acceptance 7).
 *
 * Etsy needs a `taxonomy_id` on every draft. The tree comes from one public call
 * (GET /v3/application/seller-taxonomy/nodes, no OAuth scope, spec operation getSellerTaxonomyNodes)
 * and is cached app-wide in EtsyTaxonomyNode. Rows are replaced in ONE transaction, and an empty or
 * unreadable response never wipes a good cache. The cache refreshes weekly from the housekeeping cron
 * (BACKGROUND priority) and on first use when it is empty (INTERACTIVE priority).
 *
 * Leaf selection is enforced (the draft endpoint only accepts a leaf node id) because whether Etsy
 * accepts a non-leaf taxonomy_id is UNVERIFIED (T4).
 *
 * UNVERIFIED (live test T4, none of this was fetched while building):
 *   - the exact response shape. The parser accepts `{ results: [...] }` or a bare array, nodes with
 *     `id`, `name`, optional `parent_id` and optional nested `children`, flat or nested. It computes
 *     level, isLeaf and fullPath itself and does NOT trust a `level` field from Etsy;
 *   - the size of the tree and the real id range (ids outside 1..2147483647 are skipped, because
 *     EtsyTaxonomyNode.id and EtsyListing.taxonomyId are 32-bit columns).
 * `level` here is 1 for a top-level node. `fullPath` joins node names with ETSY_TAXONOMY_PATH_SEPARATOR.
 *
 * Import safety: no env reads, network or database access at module load. The database, the Etsy
 * request function and the clock are injectable.
 */

import { etsyRequest, isEtsyConnectorEnabled } from './etsyHttp';
import type { EtsyHttpDeps, EtsyRequestOptions, EtsyResponse } from './etsyHttp';
import { EtsyError, captureEtsyEvent } from './etsyBudget';
import type { EtsyEnv, EtsyPriority } from './etsyBudget';
import { ETSY_HINT_PATH_SEPARATOR, getEtsyCategoryHintPrefixes } from '../../config/etsyCategoryHints';

/** Largest id that fits the 32-bit Int columns (EtsyTaxonomyNode.id, EtsyListing.taxonomyId). */
export const ETSY_TAXONOMY_MAX_NODE_ID = 2147483647;
export const ETSY_TAXONOMY_PATH_SEPARATOR = ETSY_HINT_PATH_SEPARATOR;
export const ETSY_TAXONOMY_PATH = '/v3/application/seller-taxonomy/nodes';
/** Rows per createMany call when replacing the cache. */
export const ETSY_TAXONOMY_INSERT_CHUNK = 1000;
/** Depth guard when walking parent links. */
export const ETSY_TAXONOMY_MAX_DEPTH = 12;
export const ETSY_TAXONOMY_SUGGEST_COUNT = 5;
export const ETSY_TAXONOMY_DEFAULT_LIMIT = 25;
export const ETSY_TAXONOMY_MAX_LIMIT = 50;
/** Leaves read from the database to score keyword suggestions in memory. */
export const ETSY_TAXONOMY_CANDIDATE_CAP = 300;
export const ETSY_TAXONOMY_MAX_TOKENS = 8;
/** Label the picker shows beside a keyword suggestion. */
export const ETSY_SUGGESTED_LABEL = 'Suggested';

/** Organizer-facing text. No "AI", no "estate sale", no em dashes (copy-lint test enforces it). */
export const ETSY_TAXONOMY_MESSAGES = {
  notReady: 'Etsy categories are loading. Try again in a moment.',
  searchHint: 'Type a few words to search Etsy categories.',
} as const;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'set', 'lot', 'new', 'old', 'used', 'pre', 'owned', 'vintage', 'antique',
  'size', 'color', 'colour', 'one', 'two', 'pair', 'piece', 'pieces', 'item', 'items', 'very', 'nice', 'great',
]);

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

type EtsyDb = any;

export interface EtsyTaxonomyRow {
  id: number;
  parentId: number | null;
  name: string;
  /** 1 for a top-level node. */
  level: number;
  isLeaf: boolean;
  fullPath: string;
}

export interface ParsedEtsyTaxonomy {
  rows: EtsyTaxonomyRow[];
  skippedInvalid: number;
  skippedDuplicate: number;
  skippedOrphan: number;
}

export interface EtsyTaxonomyDeps {
  /** Prisma-shaped client. Defaults to the shared client, loaded lazily. */
  db?: EtsyDb;
  env?: EtsyEnv;
  now?: () => Date;
  /** API call. Defaults to etsyRequest through the one door. */
  request?: (opts: EtsyRequestOptions) => Promise<EtsyResponse>;
  /** Passed to the default etsyRequest. */
  http?: EtsyHttpDeps;
}

function getDb(deps: EtsyTaxonomyDeps): EtsyDb {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return deps.db ?? require('../../lib/prisma').prisma;
}
const getEnv = (deps: EtsyTaxonomyDeps): EtsyEnv => deps.env ?? process.env;

// ---------------------------------------------------------------------------------------------
// Parsing (pure)
// ---------------------------------------------------------------------------------------------

function toNodeId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= ETSY_TAXONOMY_MAX_NODE_ID ? value : null;
  }
  if (typeof value === 'string' && /^\d{1,10}$/.test(value.trim())) {
    const n = Number(value.trim());
    return n >= 1 && n <= ETSY_TAXONOMY_MAX_NODE_ID ? n : null;
  }
  return null;
}

/**
 * Turn the taxonomy response into EtsyTaxonomyNode rows. Pure. Nodes with an invalid id or an empty
 * name are skipped together with their whole subtree; duplicate ids keep the first; a node whose
 * parent_id points at a node that was not kept is dropped as an orphan.
 */
export function parseEtsyTaxonomyTree(data: unknown): ParsedEtsyTaxonomy {
  const roots: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as any).results)
      ? (data as any).results
      : [];

  interface Flat { id: number; name: string; parentId: number | null }
  const flat: Flat[] = [];
  const seen = new Set<number>();
  let skippedInvalid = 0;
  let skippedDuplicate = 0;

  // Iterative walk so a deep or hostile tree cannot overflow the stack.
  const stack: Array<{ node: any; nestedParent: number | null }> = [];
  for (let i = roots.length - 1; i >= 0; i--) stack.push({ node: roots[i], nestedParent: null });
  while (stack.length > 0) {
    const { node, nestedParent } = stack.pop() as { node: any; nestedParent: number | null };
    const id = node && typeof node === 'object' ? toNodeId(node.id) : null;
    const name = node && typeof node.name === 'string' ? node.name.trim() : '';
    if (id === null || !name) {
      skippedInvalid++;
      continue;
    }
    if (seen.has(id)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(id);
    const declaredParent = node.parent_id === null || node.parent_id === undefined ? null : toNodeId(node.parent_id);
    const parentId = declaredParent ?? nestedParent;
    flat.push({ id, name, parentId });
    if (Array.isArray(node.children)) {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push({ node: node.children[i], nestedParent: id });
    }
  }

  const byId = new Map<number, Flat>();
  for (const f of flat) byId.set(f.id, f);

  const hasChild = new Set<number>();
  for (const f of flat) if (f.parentId !== null && byId.has(f.parentId)) hasChild.add(f.parentId);

  let skippedOrphan = 0;
  const rows: EtsyTaxonomyRow[] = [];
  const pathCache = new Map<number, { names: string[] } | null>();

  const resolvePath = (id: number): { names: string[] } | null => {
    if (pathCache.has(id)) return pathCache.get(id) as { names: string[] } | null;
    const names: string[] = [];
    let cursor: Flat | undefined = byId.get(id);
    const visited = new Set<number>();
    let ok = true;
    while (cursor) {
      if (visited.has(cursor.id) || names.length >= ETSY_TAXONOMY_MAX_DEPTH) {
        ok = false;
        break;
      }
      visited.add(cursor.id);
      names.unshift(cursor.name);
      if (cursor.parentId === null) break;
      const parent = byId.get(cursor.parentId);
      if (!parent) {
        ok = false;
        break;
      }
      cursor = parent;
    }
    const result = ok ? { names } : null;
    pathCache.set(id, result);
    return result;
  };

  for (const f of flat) {
    const path = resolvePath(f.id);
    if (!path) {
      skippedOrphan++;
      continue;
    }
    rows.push({
      id: f.id,
      parentId: f.parentId,
      name: f.name,
      level: path.names.length,
      isLeaf: !hasChild.has(f.id),
      fullPath: path.names.join(ETSY_TAXONOMY_PATH_SEPARATOR),
    });
  }
  return { rows, skippedInvalid, skippedDuplicate, skippedOrphan };
}

// ---------------------------------------------------------------------------------------------
// Refresh (database replace in one transaction)
// ---------------------------------------------------------------------------------------------

export interface EtsyTaxonomyRefreshResult {
  nodeCount: number;
  leafCount: number;
  skipped: number;
}

/**
 * Fetch the full tree and replace the cache in one transaction. Throws EtsyError (ETSY_UPSTREAM)
 * when Etsy fails or returns nothing usable, and leaves the existing cache untouched in that case.
 */
export async function refreshEtsyTaxonomy(
  deps: EtsyTaxonomyDeps = {},
  opts: { priority?: EtsyPriority } = {}
): Promise<EtsyTaxonomyRefreshResult> {
  const env = getEnv(deps);
  if (!isEtsyConnectorEnabled(env)) throw new EtsyError('ETSY_DISABLED', 'The Etsy connector is switched off');
  const db = getDb(deps);
  const send = deps.request ?? ((o: EtsyRequestOptions) => etsyRequest(o, { env, now: deps.now, ...(deps.http ?? {}) }));

  const res = await send({ method: 'GET', path: ETSY_TAXONOMY_PATH, priority: opts.priority ?? 'BACKGROUND', endpoint: 'GET seller-taxonomy' });
  if (!res.ok) throw new EtsyError('ETSY_UPSTREAM', `Etsy taxonomy fetch failed with HTTP ${res.status}`, { status: res.status });

  const parsed = parseEtsyTaxonomyTree(res.data);
  if (parsed.rows.length === 0) {
    captureEtsyEvent('warning', 'Etsy taxonomy response had no usable nodes; cache left unchanged', { area: 'listing', step: 'taxonomy-empty' }, env);
    throw new EtsyError('ETSY_UPSTREAM', 'Etsy taxonomy response had no usable nodes', { status: res.status });
  }

  const fetchedAt = (deps.now ?? (() => new Date()))();
  const data = parsed.rows.map((r) => ({ ...r, fetchedAt }));
  const ops: any[] = [db.etsyTaxonomyNode.deleteMany({})];
  for (let i = 0; i < data.length; i += ETSY_TAXONOMY_INSERT_CHUNK) {
    ops.push(db.etsyTaxonomyNode.createMany({ data: data.slice(i, i + ETSY_TAXONOMY_INSERT_CHUNK) }));
  }
  await db.$transaction(ops);

  return {
    nodeCount: parsed.rows.length,
    leafCount: parsed.rows.filter((r) => r.isLeaf).length,
    skipped: parsed.skippedInvalid + parsed.skippedDuplicate + parsed.skippedOrphan,
  };
}

/** Wiring helper: matches the housekeeping cron's `refreshTaxonomy?: () => Promise<void>` hook. */
export async function refreshEtsyTaxonomyCache(deps: EtsyTaxonomyDeps = {}): Promise<void> {
  await refreshEtsyTaxonomy(deps, { priority: 'BACKGROUND' });
}

let inFlightLoad: Promise<void> | null = null;

/** Load the cache on first use when it is empty. One load at a time per process. */
export async function ensureEtsyTaxonomyLoaded(deps: EtsyTaxonomyDeps = {}): Promise<boolean> {
  const db = getDb(deps);
  if ((await db.etsyTaxonomyNode.count()) > 0) return true;
  if (!inFlightLoad) {
    inFlightLoad = refreshEtsyTaxonomy(deps, { priority: 'INTERACTIVE' })
      .then(() => undefined)
      .finally(() => {
        inFlightLoad = null;
      });
  }
  try {
    await inFlightLoad;
  } catch {
    return false;
  }
  return (await db.etsyTaxonomyNode.count()) > 0;
}

// ---------------------------------------------------------------------------------------------
// Lookup and search
// ---------------------------------------------------------------------------------------------

/** One cached node by id, or null. */
export async function getEtsyTaxonomyNode(id: number, deps: EtsyTaxonomyDeps = {}): Promise<EtsyTaxonomyRow | null> {
  const row = await getDb(deps).etsyTaxonomyNode.findUnique({ where: { id } });
  return row ?? null;
}

export interface EtsyTaxonomySuggestion {
  id: number;
  name: string;
  fullPath: string;
  /** True for keyword suggestions; the picker shows ETSY_SUGGESTED_LABEL beside them. */
  suggested: boolean;
}

/** Lower-case words of 3 or more letters or digits, stop words removed, de-duplicated, capped. */
export function tokenizeForTaxonomy(text: string | null | undefined): string[] {
  const words = String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{Nd}]+/u)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return Array.from(new Set(words)).slice(0, ETSY_TAXONOMY_MAX_TOKENS);
}

/** Keyword score: 3 per token found in the leaf name, 1 per token found elsewhere in its path. */
export function scoreEtsyTaxonomyLeaf(leaf: { name: string; fullPath: string }, tokens: readonly string[]): number {
  const name = leaf.name.toLowerCase();
  const path = leaf.fullPath.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (name.includes(t)) score += 3;
    else if (path.includes(t)) score += 1;
  }
  return score;
}

function clampLimit(limit: number | undefined): number {
  const n = Number.isFinite(limit as number) ? Math.floor(limit as number) : ETSY_TAXONOMY_DEFAULT_LIMIT;
  return Math.max(1, Math.min(ETSY_TAXONOMY_MAX_LIMIT, n));
}

function hintWhere(prefixes: readonly string[]): any {
  return {
    OR: prefixes.flatMap((p) => [{ fullPath: p }, { fullPath: { startsWith: `${p}${ETSY_TAXONOMY_PATH_SEPARATOR}` } }]),
  };
}

export interface EtsyTaxonomySearchArgs {
  /** Free-text search typed by the organizer. */
  query?: string | null;
  /** Item title, used for keyword suggestions. */
  itemTitle?: string | null;
  /** Item.category (an eBay L1 name), used to look up hints. */
  itemCategory?: string | null;
  limit?: number;
}

export interface EtsyTaxonomySearchResult {
  /** False when the cache is empty and could not be loaded. */
  ready: boolean;
  suggestedLabel: string;
  suggested: EtsyTaxonomySuggestion[];
  results: EtsyTaxonomySuggestion[];
  message: string | null;
}

/**
 * Leaf categories for the picker: keyword suggestions from the item title (narrowed to a hinted
 * subtree when hints exist for the item's category) plus a searchable list. Works with an empty
 * hints file. Leaves only.
 */
export async function searchEtsyTaxonomyLeaves(
  args: EtsyTaxonomySearchArgs,
  deps: EtsyTaxonomyDeps = {},
  hints?: Readonly<Record<string, readonly (readonly string[])[]>>
): Promise<EtsyTaxonomySearchResult> {
  const db = getDb(deps);
  const limit = clampLimit(args.limit);
  const empty = (ready: boolean, message: string | null): EtsyTaxonomySearchResult => ({
    ready,
    suggestedLabel: ETSY_SUGGESTED_LABEL,
    suggested: [],
    results: [],
    message,
  });

  let ready: boolean;
  try {
    ready = await ensureEtsyTaxonomyLoaded(deps);
  } catch {
    ready = false;
  }
  if (!ready) return empty(false, ETSY_TAXONOMY_MESSAGES.notReady);

  const select = { id: true, name: true, fullPath: true };
  const prefixes = hints ? getEtsyCategoryHintPrefixes(args.itemCategory, hints) : getEtsyCategoryHintPrefixes(args.itemCategory);

  // Keyword suggestions from the title.
  const titleTokens = tokenizeForTaxonomy(args.itemTitle);
  let suggested: EtsyTaxonomySuggestion[] = [];
  if (titleTokens.length > 0) {
    const keywordWhere = { OR: titleTokens.map((t) => ({ name: { contains: t, mode: 'insensitive' } })) };
    const load = async (restrictToHints: boolean) =>
      (await db.etsyTaxonomyNode.findMany({
        where: { isLeaf: true, AND: [keywordWhere, ...(restrictToHints ? [hintWhere(prefixes)] : [])] },
        select,
        take: ETSY_TAXONOMY_CANDIDATE_CAP,
        orderBy: { fullPath: 'asc' },
      })) as Array<{ id: number; name: string; fullPath: string }>;
    let candidates = prefixes.length > 0 ? await load(true) : [];
    if (candidates.length === 0) candidates = await load(false);
    suggested = candidates
      .map((c) => ({ c, score: scoreEtsyTaxonomyLeaf(c, titleTokens) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.c.fullPath.length - b.c.fullPath.length || a.c.id - b.c.id)
      .slice(0, ETSY_TAXONOMY_SUGGEST_COUNT)
      .map((x) => ({ id: x.c.id, name: x.c.name, fullPath: x.c.fullPath, suggested: true }));
  }
  const suggestedIds = new Set(suggested.map((s) => s.id));

  // Searchable list: the typed words, else the hinted subtree, else nothing yet.
  const queryTokens = tokenizeForTaxonomy(args.query);
  let results: EtsyTaxonomySuggestion[] = [];
  if (queryTokens.length > 0) {
    const rows = (await db.etsyTaxonomyNode.findMany({
      where: { isLeaf: true, AND: queryTokens.map((t) => ({ fullPath: { contains: t, mode: 'insensitive' } })) },
      select,
      take: limit,
      orderBy: { fullPath: 'asc' },
    })) as Array<{ id: number; name: string; fullPath: string }>;
    results = rows.map((r) => ({ id: r.id, name: r.name, fullPath: r.fullPath, suggested: suggestedIds.has(r.id) }));
  } else if (prefixes.length > 0) {
    const rows = (await db.etsyTaxonomyNode.findMany({
      where: { isLeaf: true, ...hintWhere(prefixes) },
      select,
      take: limit,
      orderBy: { fullPath: 'asc' },
    })) as Array<{ id: number; name: string; fullPath: string }>;
    results = rows.map((r) => ({ id: r.id, name: r.name, fullPath: r.fullPath, suggested: suggestedIds.has(r.id) }));
  }

  return {
    ready: true,
    suggestedLabel: ETSY_SUGGESTED_LABEL,
    suggested,
    results,
    message: results.length === 0 && suggested.length === 0 && queryTokens.length === 0 ? ETSY_TAXONOMY_MESSAGES.searchHint : null,
  };
}

/** Test hook: forget an in-flight first-use load. */
export function resetEtsyTaxonomyLoadForTests(): void {
  inFlightLoad = null;
}
