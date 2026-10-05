/**
 * vintedCategoryResolver.ts -- maps a FindA.Sale item to ONE Vinted leaf category
 * (S-EXT-VINTED-CATEGORY-MAP, 2026-10-04). Pure TypeScript: no imports beyond the two config files below,
 * no I/O, no env, no network. BACKEND ONLY: never import this from the frontend or @findasale/shared.
 *
 * WHY: the Chrome extension used to fuzzy-search Vinted's category picker with generic words from
 * Item.category, so a youth baseball glove landed in a generic "Gloves" leaf instead of
 * Sports > Team sports > Baseball & softball > Baseball & softball gloves (leaf 4535). The backend now
 * tells the extension exactly which leaf (id + full path) to open.
 *
 * LAYERS, first hit wins; a miss in one layer falls to the next:
 *   1. CURATED_ID  eBay numeric leaf id -> Vinted leaf (config/vintedCategoryMap.ts).
 *   2. RULE        ordered keyword rules over eBay category name + breadcrumb + title; specific before
 *                  generic. A rule with a null target is a deliberate BLANK and stops everything.
 *   3. SCORED      token score of the item text against every leaf title with ancestor context.
 *                  Conservative on purpose: a wrong category published silently is worse than none.
 *   Department-split leaves (Women/Men/Girls/Boys) are only chosen when the item text names the
 *   department explicitly. Sports, Home, Electronics, Books & media and Hobbies are department free.
 * resolveVintedCategory() returns null when nothing is safe. explainVintedCategory() says why.
 */
import {
  VINTED_NODES,
  getVintedNode,
  isVintedLeaf,
  vintedPathTitles,
  vintedPathText,
  vintedRootId,
  VINTED_ROOT_IDS,
} from '../config/vintedCatalogTree';
import { VINTED_CURATED_BY_EBAY_ID, VINTED_RULES } from '../config/vintedCategoryMap';
import type { VintedDeptMap, VintedTarget } from '../config/vintedCategoryMap';

export type VintedCategorySource = 'CURATED_ID' | 'RULE' | 'SCORED';

export interface VintedCategoryInput {
  ebayCategoryId?: string | number | null;
  ebayCategoryName?: string | null;
  /** Item.category, which production stores either as a plain name or as an eBay colon breadcrumb. */
  categoryBreadcrumb?: string | null;
  title?: string | null;
  description?: string | null;
  brand?: string | null;
}

export interface VintedCategoryResult {
  leafId: number;
  /** Titles from the root down to the leaf. */
  path: string[];
  /** "Sports > Team sports > Baseball & softball > Baseball & softball gloves" */
  pathText: string;
  source: VintedCategorySource;
}

export type VintedDepartment = 'women' | 'men' | 'girls' | 'boys';

export interface VintedCategoryExplanation {
  result: VintedCategoryResult | null;
  /** curated | rule | blank | scored | none */
  stage: 'curated' | 'rule' | 'blank' | 'scored' | 'none';
  /** The rule id / eBay id that decided it, when there was one. */
  detail: string;
  /** Why the answer is null (empty when there is a result). */
  reason: string;
  department: VintedDepartment | null;
}

// ---------------------------------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------------------------------

/** Lower-case, accent-fold, drop apostrophes, "&" -> " and ", every other non-alphanumeric run -> one space. */
export function normalizeVintedText(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).replace(/&amp;/gi, '&').replace(/&#0?39;|&apos;/gi, "'");
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  s = s.replace(/['’‘`]/g, '').replace(/&/g, ' and ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

interface PreparedInput {
  cat: string; // eBay category name + breadcrumb
  title: string; // title + brand
  desc: string; // description (trimmed)
  catOnlyName: string;
}

function prepare(input: VintedCategoryInput): PreparedInput {
  const catName = normalizeVintedText(input.ebayCategoryName);
  const crumb = normalizeVintedText(input.categoryBreadcrumb);
  const cat = catName && crumb && crumb.indexOf(catName) === -1 ? catName + ' ' + crumb : catName || crumb;
  const title = normalizeVintedText((input.title || '') + ' ' + (input.brand || ''));
  const desc = normalizeVintedText((input.description || '').slice(0, 1500));
  return { cat, title, desc, catOnlyName: catName };
}

// ---------------------------------------------------------------------------------------------------
// Pattern compilation (cached). Syntax is documented at the top of config/vintedCategoryMap.ts.
// ---------------------------------------------------------------------------------------------------

type PatternScope = 'both' | 'cat' | 'title' | 'desc';
interface CompiledPattern { re: RegExp; scope: PatternScope }

const PATTERN_CACHE = new Map<string, CompiledPattern>();

function compilePattern(p: string): CompiledPattern {
  const hit = PATTERN_CACHE.get(p);
  if (hit) return hit;
  let scope: PatternScope = 'both';
  let body = p;
  if (p.indexOf('cat:') === 0) { scope = 'cat'; body = p.slice(4); }
  else if (p.indexOf('title:') === 0) { scope = 'title'; body = p.slice(6); }
  else if (p.indexOf('desc:') === 0) { scope = 'desc'; body = p.slice(5); }
  const compiled: CompiledPattern = { re: new RegExp('\\b(?:' + body + ')\\b'), scope };
  PATTERN_CACHE.set(p, compiled);
  return compiled;
}

function patternMatches(p: string, t: PreparedInput): boolean {
  const c = compilePattern(p);
  if (c.scope === 'cat') return c.re.test(t.cat);
  if (c.scope === 'title') return c.re.test(t.title);
  if (c.scope === 'desc') return c.re.test(t.title) || c.re.test(t.cat) || c.re.test(t.desc);
  return c.re.test(t.cat) || c.re.test(t.title);
}

// ---------------------------------------------------------------------------------------------------
// Department inference: explicit words only. Anything unclear is null (never guessed).
// ---------------------------------------------------------------------------------------------------

const DEPT_WORDS: Array<[VintedDepartment, RegExp]> = [
  ['women', /\b(women|womens|womans|woman|ladies|ladys|lady|female|misses|missy|juniors? womens?)\b/],
  ['men', /\b(men|mens|mans|man|gentlemen|gents|male|guys)\b/],
  ['girls', /\b(girl|girls|girly|daughter)\b/],
  ['boys', /\b(boy|boys|son)\b/],
];

/** Which department the item text names, or null when absent or contradictory (unisex, "men and women"). */
export function inferVintedDepartment(text: string): VintedDepartment | null {
  const found: VintedDepartment[] = [];
  for (const [dept, re] of DEPT_WORDS) if (re.test(text)) found.push(dept);
  if (found.length === 1) return found[0];
  if (found.length === 2) {
    // "girls women's size" style double hits: the kid word wins only if it is not paired with the adult one of the same gender
    return null;
  }
  return null;
}

function resolveDept(target: VintedTarget, dept: VintedDepartment | null): { leaf: number | null; stop: boolean; why: string } {
  if (typeof target === 'number') return { leaf: target, stop: false, why: '' };
  const map = target as VintedDeptMap;
  if (dept) {
    const leaf = map[dept];
    if (typeof leaf === 'number') return { leaf, stop: false, why: '' };
    return { leaf: null, stop: false, why: 'department-leaf-missing' };
  }
  if (typeof map.any === 'number') return { leaf: map.any, stop: false, why: '' };
  return { leaf: null, stop: true, why: 'department-unknown' };
}

function makeResult(leafId: number, source: VintedCategorySource): VintedCategoryResult | null {
  if (!isVintedLeaf(leafId)) return null;
  const path = vintedPathTitles(leafId);
  return { leafId, path, pathText: path.join(' > '), source };
}

// ---------------------------------------------------------------------------------------------------
// Layer 1 + 2
// ---------------------------------------------------------------------------------------------------

function curatedLookup(input: VintedCategoryInput, t: PreparedInput, dept: VintedDepartment | null): VintedCategoryExplanation | null {
  if (input.ebayCategoryId == null || input.ebayCategoryId === '') return null;
  const key = String(input.ebayCategoryId).trim();
  const entry = VINTED_CURATED_BY_EBAY_ID[key];
  if (entry === undefined) return null;
  let target: VintedTarget | null | undefined;
  if (typeof entry === 'number' || (typeof entry === 'object' && !('split' in entry))) {
    target = entry as VintedTarget;
  } else {
    const split = entry as { split: Array<[string, VintedTarget | null]>; fallback?: VintedTarget | null };
    target = undefined;
    for (const [pat, tgt] of split.split) {
      if (patternMatches(pat, t)) { target = tgt; break; }
    }
    if (target === undefined && split.fallback !== undefined) target = split.fallback;
    if (target === undefined) return null; // no sub-rule matched: let the rule layer decide
  }
  if (target === null) {
    return { result: null, stage: 'blank', detail: 'curated:' + key, reason: 'deliberate-blank', department: dept };
  }
  const r = resolveDept(target, dept);
  if (r.leaf === null) {
    if (r.stop) return { result: null, stage: 'none', detail: 'curated:' + key, reason: r.why, department: dept };
    return null;
  }
  return { result: makeResult(r.leaf, 'CURATED_ID'), stage: 'curated', detail: key, reason: '', department: dept };
}

function ruleLookup(t: PreparedInput, dept: VintedDepartment | null): VintedCategoryExplanation | null {
  for (const r of VINTED_RULES) {
    let ok = true;
    for (const p of r.all) { if (!patternMatches(p, t)) { ok = false; break; } }
    if (!ok) continue;
    if (r.none) {
      for (const p of r.none) { if (patternMatches(p, t)) { ok = false; break; } }
      if (!ok) continue;
    }
    if (r.target === null) {
      return { result: null, stage: 'blank', detail: r.id, reason: 'deliberate-blank', department: dept };
    }
    const d = resolveDept(r.target, dept);
    if (d.leaf === null) {
      if (d.stop) return { result: null, stage: 'none', detail: r.id, reason: d.why, department: dept };
      continue;
    }
    return { result: makeResult(d.leaf, 'RULE'), stage: 'rule', detail: r.id, reason: '', department: dept };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Layer 3: scored
// ---------------------------------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'of', 'for', 'with', 'in', 'to', 'by', 'on', 'at', 'from', 'new', 'used', 'vintage',
  'lot', 'set', 'size', 'free', 'shipping', 'nice', 'great', 'good', 'rare', 'old', 'antique', 'retro',
]);
/** Words that make a leaf title generic: a leaf made only of these is never scored. */
const GENERIC_LEAF_WORDS = new Set(['other', 'others', 'accessory', 'equipment', 'supply', 'part', 'kit', 'item', 'gear', 'general', 'misc', 'various']);

function stem(w: string): string {
  if (w.length <= 3) return w;
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(sses|shes|ches|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (/ss$|us$|is$|ous$/.test(w)) return w;
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

function tokenize(normalized: string): string[] {
  const fixed = normalized.replace(/\bt shirts?\b/g, 'tshirt').replace(/\be books?\b/g, 'ebook');
  const out: string[] = [];
  for (const w of fixed.split(' ')) {
    if (w.length < 2 || STOP_WORDS.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

interface LeafEntry {
  id: number;
  tokens: string[]; // distinct stems of the leaf title (generic words dropped)
  ancestorTokens: string[]; // stems of the non-root ancestors' titles
  head: string; // last token of the leaf title
  dept: VintedDepartment | null; // the department the leaf belongs to, null = department free
  weights: Map<string, number>;
  totalWeight: number;
  topTokens: string[]; // the most distinctive token(s) of the leaf
}

let LEAF_INDEX: LeafEntry[] | null = null;

function leafDepartment(id: number): VintedDepartment | null {
  const titles = vintedPathTitles(id);
  const root = vintedRootId(id);
  if (root === VINTED_ROOT_IDS.WOMEN) return 'women';
  if (root === VINTED_ROOT_IDS.MEN) return 'men';
  if (root === VINTED_ROOT_IDS.KIDS) {
    if (titles[1] === 'Girls clothing') return 'girls';
    if (titles[1] === 'Boys clothing') return 'boys';
  }
  return null;
}

function buildLeafIndex(): LeafEntry[] {
  const entries: LeafEntry[] = [];
  const df = new Map<string, number>();
  VINTED_NODES.forEach((n) => {
    if (n.childIds.length !== 0) return;
    if (vintedRootId(n.id) === VINTED_ROOT_IDS.DESIGNER) return;
    const toks = Array.from(new Set(tokenize(normalizeVintedText(n.title)).filter((x) => !GENERIC_LEAF_WORDS.has(x))));
    if (toks.length === 0) return;
    const allToks = tokenize(normalizeVintedText(n.title)).filter((x) => !GENERIC_LEAF_WORDS.has(x));
    const head = allToks[allToks.length - 1];
    const anc: string[] = [];
    const chain = vintedPathTitles(n.id);
    for (let i = 1; i < chain.length - 1; i++) for (const x of tokenize(normalizeVintedText(chain[i]))) anc.push(x);
    toks.forEach((x) => df.set(x, (df.get(x) || 0) + 1));
    entries.push({ id: n.id, tokens: toks, ancestorTokens: Array.from(new Set(anc)), head, dept: leafDepartment(n.id), weights: new Map(), totalWeight: 0, topTokens: [] });
  });
  const N = entries.length;
  for (const e of entries) {
    let max = 0;
    for (const x of e.tokens) {
      const w = Math.log(1 + N / (df.get(x) || 1));
      e.weights.set(x, w);
      e.totalWeight += w;
      if (w > max) max = w;
    }
    e.topTokens = e.tokens.filter((x) => (e.weights.get(x) as number) >= max - 1e-9);
  }
  return entries;
}

interface ScoredCandidate { entry: LeafEntry; cov: number; score: number }

function scoreItem(t: PreparedInput, dept: VintedDepartment | null): { best: ScoredCandidate | null; second: ScoredCandidate | null; reason: string } {
  if (!LEAF_INDEX) LEAF_INDEX = buildLeafIndex();
  const titleTokens = new Set<string>(tokenize(t.title));
  const itemTokens = new Set<string>([...tokenize(t.title), ...tokenize(t.cat)]);
  if (itemTokens.size === 0) return { best: null, second: null, reason: 'no-text' };
  const cands: ScoredCandidate[] = [];
  let deptBlocked = false;
  for (const e of LEAF_INDEX) {
    // cheap pre-filter: the leaf's head word must be present
    if (!itemTokens.has(e.head)) continue;
    let matched = 0;
    let topHit = false;
    for (const x of e.tokens) {
      if (itemTokens.has(x)) {
        matched += e.weights.get(x) as number;
        if (e.topTokens.indexOf(x) !== -1) topHit = true;
      }
    }
    const cov = matched / e.totalWeight;
    if (!topHit || cov < 0.6) continue;
    // the leaf's most distinctive word must be in the TITLE itself, not only in the eBay category text
    if (!e.topTokens.some((x) => titleTokens.has(x))) continue;
    if (e.dept !== null) {
      if (dept === null) { deptBlocked = true; continue; }
      if (e.dept !== dept) continue;
    }
    let ctx = 0;
    if (e.ancestorTokens.length) {
      let hit = 0;
      for (const x of e.ancestorTokens) if (itemTokens.has(x)) hit++;
      ctx = hit / e.ancestorTokens.length;
    }
    // a one-word leaf ("Irons", "Trimmers", "Signs") is only trusted with ancestor context in the item text
    if (e.tokens.length === 1 && ctx < 0.5) continue;
    cands.push({ entry: e, cov, score: cov + 0.25 * ctx });
  }
  if (cands.length === 0) return { best: null, second: null, reason: deptBlocked ? 'department-unknown' : 'no-candidate' };
  cands.sort((a, b) => b.score - a.score);
  return { best: cands[0], second: cands.length > 1 ? cands[1] : null, reason: '' };
}

function scoredLookup(t: PreparedInput, dept: VintedDepartment | null): VintedCategoryExplanation {
  const { best, second, reason } = scoreItem(t, dept);
  if (!best) return { result: null, stage: 'none', detail: '', reason: reason || 'no-candidate', department: dept };
  if (second && best.score - second.score < 0.25) {
    return { result: null, stage: 'none', detail: '', reason: 'ambiguous:' + best.entry.id + ',' + second.entry.id, department: dept };
  }
  if (best.cov < 0.6 || best.score < 0.75) return { result: null, stage: 'none', detail: '', reason: 'weak', department: dept };
  return { result: makeResult(best.entry.id, 'SCORED'), stage: 'scored', detail: String(best.entry.id), reason: '', department: dept };
}

// ---------------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------------

/** Full decision trail: which layer answered (or why nothing did). resolveVintedCategory() is the thin wrapper. */
export function explainVintedCategory(input: VintedCategoryInput): VintedCategoryExplanation {
  const t = prepare(input || {});
  const dept = inferVintedDepartment(t.title + ' ' + t.cat);
  const cur = curatedLookup(input || {}, t, dept);
  if (cur) return cur;
  const rul = ruleLookup(t, dept);
  if (rul) return rul;
  return scoredLookup(t, dept);
}

/** The Vinted leaf for an item, or null when no safe answer exists (the extension then falls back to its own search). */
export function resolveVintedCategory(input: VintedCategoryInput): VintedCategoryResult | null {
  return explainVintedCategory(input).result;
}

/** Re-exports so callers need only this module. */
export { getVintedNode, vintedPathText };
