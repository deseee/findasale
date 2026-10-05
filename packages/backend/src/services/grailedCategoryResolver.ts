/**
 * grailedCategoryResolver.ts -- maps a FindA.Sale item to ONE Grailed Sub-category (leaf)
 * (S-EXT-GRAILED-CATEGORY-MAP, 2026-10-05). Pure TypeScript: no imports beyond the two config files below,
 * no I/O, no env, no network. BACKEND ONLY: never import this from the frontend or @findasale/shared.
 *
 * WHY: the Chrome extension walked Grailed's Department -> Category -> Sub-category picker with fuzzy text
 * matching and only two hand-confirmed overrides, so many items landed in a wrong or blank category (37 fix
 * comments in extension/fas-grailed.js). The backend now tells the extension exactly which leaf (id + full
 * path) to open.
 *
 * LAYERS, first hit wins; a miss in one layer falls to the next:
 *   1. CURATED_ID  eBay numeric leaf id -> Grailed leaf, or a department hint (config/grailedCategoryMap.ts).
 *   2. RULE        ordered keyword rules over eBay category name + breadcrumb + title; specific before
 *                  generic. A rule with a null target is a deliberate BLANK and stops everything.
 *   3. SCORED      token score of the item text against every leaf title. Conservative on purpose: a wrong
 *                  category published silently is worse than none.
 *   The Department (Menswear / Womenswear) is read from explicit words only (men's, women's, boys, girls)
 *   or implied by a curated eBay id; a leaf that differs by department is only chosen when it is known.
 *   Grailed is FASHION ONLY: anything that is not apparel, footwear, bags, jewelry or accessories resolves
 *   to null. resolveGrailedCategory() returns null when nothing is safe. explainGrailedCategory() says why.
 */
import {
  GRAILED_NODES,
  isGrailedLeaf,
  grailedPathTitles,
  grailedPathText,
  grailedDepartmentOf,
  grailedRootId,
} from '../config/grailedCategoryTree';
import type { GrailedDepartment } from '../config/grailedCategoryTree';
import { GRAILED_CURATED_BY_EBAY_ID, GRAILED_RULES } from '../config/grailedCategoryMap';
import type { GrailedDeptMap, GrailedTarget } from '../config/grailedCategoryMap';

export type GrailedCategorySource = 'CURATED_ID' | 'RULE' | 'SCORED';

export interface GrailedCategoryInput {
  ebayCategoryId?: string | number | null;
  ebayCategoryName?: string | null;
  /** Item.category, which production stores either as a plain name or as an eBay colon breadcrumb. */
  categoryBreadcrumb?: string | null;
  title?: string | null;
  description?: string | null;
  brand?: string | null;
}

export interface GrailedCategoryResult {
  /** Node id of the leaf, e.g. "menswear:tops.sweatshirts_hoodies". */
  id: string;
  /** [Department, Category, Sub-category], e.g. ["Menswear", "Tops", "Sweatshirts & Hoodies"]. */
  path: string[];
  /** "Menswear > Tops > Sweatshirts & Hoodies" */
  pathText: string;
  source: GrailedCategorySource;
}

export interface GrailedCategoryExplanation {
  result: GrailedCategoryResult | null;
  /** curated | rule | blank | scored | none */
  stage: 'curated' | 'rule' | 'blank' | 'scored' | 'none';
  /** The rule id / eBay id that decided it, when there was one. */
  detail: string;
  /** Why the answer is null (empty when there is a result). */
  reason: string;
  department: GrailedDepartment | null;
}

// ---------------------------------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------------------------------

/** Lower-case, accent-fold, drop apostrophes, "&" -> " and ", every other non-alphanumeric run -> one space. */
export function normalizeGrailedText(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).replace(/&amp;/gi, '&').replace(/&#0?39;|&apos;/gi, "'");
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  s = s.replace(/['’‘`]/g, '').replace(/&/g, ' and ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

interface PreparedInput {
  cat: string; // eBay category name + breadcrumb
  title: string; // title + brand
  desc: string; // description (trimmed)
}

function prepare(input: GrailedCategoryInput): PreparedInput {
  const catName = normalizeGrailedText(input.ebayCategoryName);
  const crumb = normalizeGrailedText(input.categoryBreadcrumb);
  const cat = catName && crumb && crumb.indexOf(catName) === -1 ? catName + ' ' + crumb : catName || crumb;
  const title = normalizeGrailedText((input.title || '') + ' ' + (input.brand || ''));
  const desc = normalizeGrailedText((input.description || '').slice(0, 1500));
  return { cat, title, desc };
}

// ---------------------------------------------------------------------------------------------------
// Pattern compilation (cached). Syntax is documented at the top of config/grailedCategoryMap.ts.
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
// Grailed has two departments, so the kid words map to the nearest one (boys -> Menswear, girls ->
// Womenswear); "unisex" or words from both sides make it null.
// ---------------------------------------------------------------------------------------------------

const MEN_WORDS = /\b(men|mens|gentlemen|gents|boy|boys)\b/;
const WOMEN_WORDS = /\b(women|womens|womans|woman|ladies|ladys|female|misses|missy|girl|girls)\b/;
const UNISEX_WORDS = /\bunisex\b/;

/** Which department the item text names, or null when absent or contradictory (unisex, "men and women"). */
export function inferGrailedDepartment(text: string): GrailedDepartment | null {
  if (UNISEX_WORDS.test(text)) return null;
  const men = MEN_WORDS.test(text);
  const women = WOMEN_WORDS.test(text);
  if (men && !women) return 'men';
  if (women && !men) return 'women';
  return null;
}

type TargetPick =
  | { kind: 'ok'; leaf: string }
  | { kind: 'skip'; why: string }
  | { kind: 'stop'; why: string }
  | { kind: 'blank' };

function pickTarget(target: GrailedTarget | null, dept: GrailedDepartment | null): TargetPick {
  if (target === null) return { kind: 'blank' };
  if (typeof target === 'string') {
    const leafDept = grailedDepartmentOf(target);
    if (dept && leafDept && dept !== leafDept) return { kind: 'skip', why: 'department-leaf-missing' };
    return { kind: 'ok', leaf: target };
  }
  const map: GrailedDeptMap = target;
  if (dept) {
    const v = map[dept];
    if (v === undefined) return { kind: 'skip', why: 'department-leaf-missing' };
    if (v === null) return { kind: 'blank' };
    return { kind: 'ok', leaf: v };
  }
  if (typeof map.any === 'string') return { kind: 'ok', leaf: map.any };
  return { kind: 'stop', why: 'department-unknown' };
}

function makeResult(leafId: string, source: GrailedCategorySource): GrailedCategoryResult | null {
  if (!isGrailedLeaf(leafId)) return null;
  const path = grailedPathTitles(leafId);
  return { id: leafId, path, pathText: path.join(' > '), source };
}

// ---------------------------------------------------------------------------------------------------
// Layer 1 + 2
// ---------------------------------------------------------------------------------------------------

function explainPick(pick: TargetPick, source: GrailedCategorySource, stage: 'curated' | 'rule', detail: string, dept: GrailedDepartment | null): GrailedCategoryExplanation | null {
  if (pick.kind === 'blank') return { result: null, stage: 'blank', detail, reason: 'deliberate-blank', department: dept };
  if (pick.kind === 'stop') return { result: null, stage: 'none', detail, reason: pick.why, department: dept };
  if (pick.kind === 'skip') return null;
  return { result: makeResult(pick.leaf, source), stage, detail, reason: '', department: dept };
}

function curatedLookup(key: string, t: PreparedInput, dept: GrailedDepartment | null): GrailedCategoryExplanation | null {
  const entry = GRAILED_CURATED_BY_EBAY_ID[key];
  if (entry === undefined) return null;
  let target: GrailedTarget | null | undefined = undefined;
  if (entry.split) {
    for (const [pat, tgt] of entry.split) {
      if (patternMatches(pat, t)) { target = tgt; break; }
    }
  }
  if (target === undefined) target = entry.target; // undefined = a department hint only: the rule layer decides the leaf
  if (target === undefined) return null;
  return explainPick(pickTarget(target, dept), 'CURATED_ID', 'curated', key, dept);
}

function ruleLookup(t: PreparedInput, dept: GrailedDepartment | null): GrailedCategoryExplanation | null {
  for (const r of GRAILED_RULES) {
    let ok = true;
    for (const p of r.all) { if (!patternMatches(p, t)) { ok = false; break; } }
    if (!ok) continue;
    if (r.none) {
      for (const p of r.none) { if (patternMatches(p, t)) { ok = false; break; } }
      if (!ok) continue;
    }
    const out = explainPick(pickTarget(r.target, dept), 'RULE', 'rule', r.id, dept);
    if (out) return out;
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
const GENERIC_LEAF_WORDS = new Set(['other', 'others', 'accessory', 'accessories', 'misc', 'miscellaneous', 'various', 'general']);
/** Leaves that are brand or non-fashion buckets: never reached by free-text scoring. */
const UNSCORED_LEAF_TITLES = new Set(['Supreme', 'Periodicals']);

function stem(w: string): string {
  if (w.length <= 3) return w;
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(sses|shes|ches|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (/ss$|us$|is$|ous$/.test(w)) return w;
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

function tokenize(normalized: string): string[] {
  const fixed = normalized.replace(/\bt shirts?\b/g, 'tshirt');
  const out: string[] = [];
  for (const w of fixed.split(' ')) {
    if (w.length < 2 || STOP_WORDS.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

interface LeafEntry {
  id: string;
  tokens: string[]; // distinct stems of the leaf title (generic words dropped)
  ancestorTokens: string[]; // stems of the top-level Category title
  head: string; // last token of the leaf title
  dept: GrailedDepartment;
  weights: Map<string, number>;
  totalWeight: number;
  topTokens: string[]; // the most distinctive token(s) of the leaf
}

let LEAF_INDEX: LeafEntry[] | null = null;

function buildLeafIndex(): LeafEntry[] {
  const entries: LeafEntry[] = [];
  const df = new Map<string, number>();
  GRAILED_NODES.forEach((n) => {
    if (n.childIds.length !== 0) return;
    if (UNSCORED_LEAF_TITLES.has(n.title)) return;
    const allToks = tokenize(normalizeGrailedText(n.title)).filter((x) => !GENERIC_LEAF_WORDS.has(x));
    const toks = Array.from(new Set(allToks));
    if (toks.length === 0) return;
    const head = allToks[allToks.length - 1];
    const parent = GRAILED_NODES.get(n.parentId);
    const anc = parent ? Array.from(new Set(tokenize(normalizeGrailedText(parent.title)))) : [];
    toks.forEach((x) => df.set(x, (df.get(x) || 0) + 1));
    entries.push({ id: n.id, tokens: toks, ancestorTokens: anc, head, dept: n.department, weights: new Map<string, number>(), totalWeight: 0, topTokens: [] });
  });
  const N = entries.length;
  for (const e of entries) {
    let max = 0;
    for (const x of e.tokens) {
      const wt = Math.log(1 + N / (df.get(x) || 1));
      e.weights.set(x, wt);
      e.totalWeight += wt;
      if (wt > max) max = wt;
    }
    e.topTokens = e.tokens.filter((x) => (e.weights.get(x) as number) >= max - 1e-9);
  }
  return entries;
}

interface ScoredCandidate { entry: LeafEntry; cov: number; score: number }

/** True when the OTHER department also has a leaf whose title ends in the same word (so the item text alone cannot say which). */
function hasTwinInOtherDept(e: LeafEntry, index: LeafEntry[]): boolean {
  for (const o of index) if (o.dept !== e.dept && o.head === e.head) return true;
  return false;
}

function scoreItem(t: PreparedInput, dept: GrailedDepartment | null): { best: ScoredCandidate | null; second: ScoredCandidate | null; reason: string } {
  if (!LEAF_INDEX) LEAF_INDEX = buildLeafIndex();
  const index: LeafEntry[] = LEAF_INDEX;
  const titleTokens = new Set<string>(tokenize(t.title));
  const itemTokens = new Set<string>([...tokenize(t.title), ...tokenize(t.cat)]);
  if (itemTokens.size === 0) return { best: null, second: null, reason: 'no-text' };
  const cands: ScoredCandidate[] = [];
  let deptBlocked = false;
  for (const e of index) {
    if (!itemTokens.has(e.head)) continue; // cheap pre-filter: the leaf's head word must be present
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
    if (dept === null) {
      if (hasTwinInOtherDept(e, index)) { deptBlocked = true; continue; }
    } else if (e.dept !== dept) continue;
    let ctx = 0;
    if (e.ancestorTokens.length) {
      let hit = 0;
      for (const x of e.ancestorTokens) if (itemTokens.has(x)) hit++;
      ctx = hit / e.ancestorTokens.length;
    }
    // a one-word leaf ("Boots", "Rings") is only trusted with its Category named in the item text
    if (e.tokens.length === 1 && ctx < 0.5) continue;
    cands.push({ entry: e, cov, score: cov + 0.25 * ctx });
  }
  if (cands.length === 0) return { best: null, second: null, reason: deptBlocked ? 'department-unknown' : 'no-candidate' };
  cands.sort((a, b) => b.score - a.score);
  return { best: cands[0], second: cands.length > 1 ? cands[1] : null, reason: '' };
}

function scoredLookup(t: PreparedInput, dept: GrailedDepartment | null): GrailedCategoryExplanation {
  const { best, second, reason } = scoreItem(t, dept);
  if (!best) return { result: null, stage: 'none', detail: '', reason: reason || 'no-candidate', department: dept };
  if (second && best.score - second.score < 0.25) {
    return { result: null, stage: 'none', detail: '', reason: 'ambiguous:' + best.entry.id + ',' + second.entry.id, department: dept };
  }
  if (best.cov < 0.6 || best.score < 0.75) return { result: null, stage: 'none', detail: '', reason: 'weak', department: dept };
  return { result: makeResult(best.entry.id, 'SCORED'), stage: 'scored', detail: best.entry.id, reason: '', department: dept };
}

// ---------------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------------

/** Full decision trail: which layer answered (or why nothing did). resolveGrailedCategory() is the thin wrapper. */
export function explainGrailedCategory(input: GrailedCategoryInput): GrailedCategoryExplanation {
  const safe: GrailedCategoryInput = input || {};
  const t = prepare(safe);
  const stated = inferGrailedDepartment(t.title + ' ' + t.cat);
  const key = safe.ebayCategoryId == null || safe.ebayCategoryId === '' ? '' : String(safe.ebayCategoryId).trim();
  const entry = key ? GRAILED_CURATED_BY_EBAY_ID[key] : undefined;
  const hint: GrailedDepartment | null = entry && entry.dept ? entry.dept : null;
  if (hint && stated && hint !== stated) {
    // eBay filed it under one department and the item text names the other: do not guess.
    return { result: null, stage: 'none', detail: 'curated:' + key, reason: 'department-conflict', department: stated };
  }
  const dept: GrailedDepartment | null = stated || hint;
  if (key) {
    const cur = curatedLookup(key, t, dept);
    if (cur) return cur;
  }
  const rul = ruleLookup(t, dept);
  if (rul) return rul;
  return scoredLookup(t, dept);
}

/** The Grailed leaf for an item, or null when no safe answer exists (the extension then falls back to its own search). */
export function resolveGrailedCategory(input: GrailedCategoryInput): GrailedCategoryResult | null {
  return explainGrailedCategory(input).result;
}

/** Re-exports so callers need only this module. */
export { grailedPathText, grailedRootId };
