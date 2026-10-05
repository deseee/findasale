/**
 * poshmarkCategoryResolver.ts -- maps a FindA.Sale item to ONE Poshmark category path
 * (S-EXT-POSHMARK-CATEGORY-MAP, 2026-10-05). Pure TypeScript: no imports beyond the two config files below,
 * no I/O, no env, no network. BACKEND ONLY: never import this from the frontend or @findasale/shared.
 *
 * WHY: the Chrome extension used to fuzzy-match Poshmark's sell-form category picker from generic words in
 * Item.category. The backend now tells the extension exactly which Department > Category > Sub-category to
 * open, by exact visible title at every level, or says nothing (null) so the extension's old logic runs.
 *
 * LAYERS, first hit wins; a miss in one layer falls to the next:
 *   1. CURATED_ID  eBay numeric leaf id -> Poshmark leaf (config/poshmarkCategoryMap.ts).
 *   2. RULE        ordered keyword rules over eBay category name + breadcrumb + title; specific before
 *                  generic. A rule with a null target is a deliberate BLANK and stops everything.
 *   3. SCORED      token score of the item text against every selectable leaf title with ancestor context.
 *                  Conservative on purpose: a wrong category published silently is worse than none.
 *   Department-split leaves (Women/Men/Kids) are only chosen when the item text names the department
 *   explicitly. Home, Electronics, Pets and Kids > Toys are department free.
 * resolvePoshmarkCategory() returns null when nothing is safe. explainPoshmarkCategory() says why.
 *
 * Only SELECTABLE leaves can be returned (config/poshmarkCategoryTree.ts: a leaf that is not one of the
 * category branches whose sub-categories were never read).
 */
import {
  POSHMARK_NODES,
  isPoshmarkSelectable,
  poshmarkPathTitles,
  poshmarkPathText,
  poshmarkDepartmentId,
  getPoshmarkNode,
  POSHMARK_DEPARTMENT_IDS,
} from '../config/poshmarkCategoryTree';
import { POSHMARK_CURATED_BY_EBAY_ID, POSHMARK_RULES } from '../config/poshmarkCategoryMap';
import type { PoshmarkDeptMap, PoshmarkTarget } from '../config/poshmarkCategoryMap';

export type PoshmarkCategorySource = 'CURATED_ID' | 'RULE' | 'SCORED';

export interface PoshmarkCategoryInput {
  ebayCategoryId?: string | number | null;
  ebayCategoryName?: string | null;
  /** Item.category, which production stores either as a plain name or as an eBay colon breadcrumb. */
  categoryBreadcrumb?: string | null;
  title?: string | null;
  description?: string | null;
  brand?: string | null;
}

export interface PoshmarkCategoryResult {
  /** Poshmark node id (its public URL slug), e.g. "Men-Accessories-Belts". */
  id: string;
  /** Titles from the department down to the leaf, the exact text of each picker row. */
  path: string[];
  /** "Men > Accessories > Belts" */
  pathText: string;
  source: PoshmarkCategorySource;
}

export type PoshmarkDepartment = 'women' | 'men' | 'kids';

export interface PoshmarkCategoryExplanation {
  result: PoshmarkCategoryResult | null;
  /** curated | rule | blank | scored | none */
  stage: 'curated' | 'rule' | 'blank' | 'scored' | 'none';
  /** The rule id / eBay id that decided it, when there was one. */
  detail: string;
  /** Why the answer is null (empty when there is a result). */
  reason: string;
  department: PoshmarkDepartment | null;
}

// ---------------------------------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------------------------------

/** Lower-case, accent-fold, drop apostrophes, "&" -> " and ", every other non-alphanumeric run -> one space. */
export function normalizePoshmarkText(raw: string | null | undefined): string {
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

function prepare(input: PoshmarkCategoryInput): PreparedInput {
  const catName = normalizePoshmarkText(input.ebayCategoryName);
  const crumb = normalizePoshmarkText(input.categoryBreadcrumb);
  const cat = catName && crumb && crumb.indexOf(catName) === -1 ? catName + ' ' + crumb : catName || crumb;
  const title = normalizePoshmarkText((input.title || '') + ' ' + (input.brand || ''));
  const desc = normalizePoshmarkText((input.description || '').slice(0, 1500));
  return { cat, title, desc };
}

// ---------------------------------------------------------------------------------------------------
// Pattern compilation (cached). Syntax is documented at the top of config/poshmarkCategoryMap.ts.
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

/** Fictional and brand names that contain a gender word but say nothing about the department. */
const DEPT_NOISE = /\b(wonder woman|spider man|iron man|bat ?man|super ?man|ant man|aqua ?man|he man|x men|pac man|snow ?man|marlboro man|michelin man|bat woman|cat ?woman|super woman|spider woman|invisible man|rain man|man cave|men in black|boys? ?(and|n) ?girls? club|girls? generation)\b/g;

const DEPT_WORDS: Array<[PoshmarkDepartment, RegExp]> = [
  ['women', /\b(women|womens|womans|woman|ladies|ladys|lady|misses|missy|juniors?)\b/],
  ['men', /\b(men|mens|gentlemen|gents|guys)\b/],
  ['kids', /\b(boy|boys|girl|girls|kid|kids|child|childs|children|childrens|toddlers?|infants?|baby|babies|youth|juvenile)\b/],
];

/** Which department the item text names, or null when absent or contradictory (unisex, "men and women"). */
export function inferPoshmarkDepartment(text: string): PoshmarkDepartment | null {
  const clean = text.replace(DEPT_NOISE, ' ');
  const found: PoshmarkDepartment[] = [];
  for (const [dept, re] of DEPT_WORDS) if (re.test(clean)) found.push(dept);
  return found.length === 1 ? found[0] : null;
}

function resolveDept(target: PoshmarkTarget, dept: PoshmarkDepartment | null): { leaf: string | null; stop: boolean; why: string } {
  if (typeof target === 'string') return { leaf: target, stop: false, why: '' };
  const map = target as PoshmarkDeptMap;
  if (dept) {
    const leaf = map[dept];
    if (typeof leaf === 'string') return { leaf, stop: false, why: '' };
    return { leaf: null, stop: false, why: 'department-leaf-missing' };
  }
  if (typeof map.any === 'string') return { leaf: map.any, stop: false, why: '' };
  return { leaf: null, stop: true, why: 'department-unknown' };
}

function makeResult(id: string, source: PoshmarkCategorySource): PoshmarkCategoryResult | null {
  if (!isPoshmarkSelectable(id)) return null;
  const path = poshmarkPathTitles(id);
  return { id, path, pathText: path.join(' > '), source };
}

// ---------------------------------------------------------------------------------------------------
// Layer 1 + 2
// ---------------------------------------------------------------------------------------------------

function curatedLookup(input: PoshmarkCategoryInput, t: PreparedInput, dept: PoshmarkDepartment | null): PoshmarkCategoryExplanation | null {
  if (input.ebayCategoryId == null || input.ebayCategoryId === '') return null;
  const key = String(input.ebayCategoryId).trim();
  if (!Object.prototype.hasOwnProperty.call(POSHMARK_CURATED_BY_EBAY_ID, key)) return null;
  const entry = POSHMARK_CURATED_BY_EBAY_ID[key];
  let target: PoshmarkTarget | null | undefined;
  if (entry === null || typeof entry === 'string' || (typeof entry === 'object' && !('split' in entry))) {
    target = entry as PoshmarkTarget | null;
  } else {
    const split = entry as { split: Array<[string, PoshmarkTarget | null]>; fallback?: PoshmarkTarget | null };
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
  const result = makeResult(r.leaf, 'CURATED_ID');
  if (!result) return null;
  return { result, stage: 'curated', detail: key, reason: '', department: dept };
}

function ruleLookup(t: PreparedInput, dept: PoshmarkDepartment | null): PoshmarkCategoryExplanation | null {
  for (const r of POSHMARK_RULES) {
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
    const result = makeResult(d.leaf, 'RULE');
    if (!result) continue;
    return { result, stage: 'rule', detail: r.id, reason: '', department: dept };
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
const GENERIC_LEAF_WORDS = new Set(['other', 'others', 'accessory', 'accessories', 'equipment', 'supply', 'part', 'kit', 'item', 'gear', 'general', 'misc', 'various']);

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
  id: string;
  tokens: string[]; // distinct stems of the leaf title (generic words dropped)
  ancestorTokens: string[]; // stems of the non-department ancestors' titles
  head: string; // last token of the leaf title
  dept: PoshmarkDepartment | null; // the department the leaf belongs to, null = department free
  weights: Map<string, number>;
  totalWeight: number;
  topTokens: string[]; // the most distinctive token(s) of the leaf
}

let LEAF_INDEX: LeafEntry[] | null = null;

function leafDepartment(id: string): PoshmarkDepartment | null {
  const dep = poshmarkDepartmentId(id);
  const titles = poshmarkPathTitles(id);
  if (dep === POSHMARK_DEPARTMENT_IDS.WOMEN) return 'women';
  if (dep === POSHMARK_DEPARTMENT_IDS.MEN) return 'men';
  if (dep === POSHMARK_DEPARTMENT_IDS.KIDS) return titles[1] === 'Toys' ? null : 'kids';
  return null;
}

function buildLeafIndex(): LeafEntry[] {
  const entries: LeafEntry[] = [];
  const df = new Map<string, number>();
  POSHMARK_NODES.forEach((n) => {
    if (!isPoshmarkSelectable(n.id)) return;
    const allToks = tokenize(normalizePoshmarkText(n.title)).filter((x) => !GENERIC_LEAF_WORDS.has(x));
    const toks = Array.from(new Set(allToks));
    if (toks.length === 0) return;
    const head = allToks[allToks.length - 1];
    const anc: string[] = [];
    const chain = poshmarkPathTitles(n.id);
    for (let i = 1; i < chain.length - 1; i++) for (const x of tokenize(normalizePoshmarkText(chain[i]))) anc.push(x);
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

function scoreItem(t: PreparedInput, dept: PoshmarkDepartment | null): { best: ScoredCandidate | null; second: ScoredCandidate | null; reason: string } {
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
    // a one-word leaf ("Belts", "Mirrors", "Decor") is only trusted with ancestor context in the item text
    if (e.tokens.length === 1 && ctx < 0.5) continue;
    cands.push({ entry: e, cov, score: cov + 0.25 * ctx });
  }
  if (cands.length === 0) return { best: null, second: null, reason: deptBlocked ? 'department-unknown' : 'no-candidate' };
  cands.sort((a, b) => b.score - a.score);
  return { best: cands[0], second: cands.length > 1 ? cands[1] : null, reason: '' };
}

/** Titles that say the item is a paper insert, a spare part or a box, not the product a leaf title names. */
const SCORED_VETO = /\b(manuals?|instructions?|booklets?|inserts?|box only|case only|empty (box|case)|for parts|parts only|replacement parts?|spares?|decals?|stickers?)\b/;

function scoredLookup(t: PreparedInput, dept: PoshmarkDepartment | null): PoshmarkCategoryExplanation {
  if (SCORED_VETO.test(t.title)) return { result: null, stage: 'none', detail: '', reason: 'veto', department: dept };
  const { best, second, reason } = scoreItem(t, dept);
  if (!best) return { result: null, stage: 'none', detail: '', reason: reason || 'no-candidate', department: dept };
  if (second && best.score - second.score < 0.25) {
    return { result: null, stage: 'none', detail: '', reason: 'ambiguous:' + best.entry.id + ',' + second.entry.id, department: dept };
  }
  if (best.cov < 0.6 || best.score < 0.75) return { result: null, stage: 'none', detail: '', reason: 'weak', department: dept };
  const result = makeResult(best.entry.id, 'SCORED');
  if (!result) return { result: null, stage: 'none', detail: '', reason: 'not-selectable', department: dept };
  return { result, stage: 'scored', detail: best.entry.id, reason: '', department: dept };
}

// ---------------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------------

/** Full decision trail: which layer answered (or why nothing did). resolvePoshmarkCategory() is the thin wrapper. */
export function explainPoshmarkCategory(input: PoshmarkCategoryInput): PoshmarkCategoryExplanation {
  const safe = input || {};
  const t = prepare(safe);
  const dept = inferPoshmarkDepartment(t.title + ' ' + t.cat);
  const cur = curatedLookup(safe, t, dept);
  if (cur) return cur;
  const rul = ruleLookup(t, dept);
  if (rul) return rul;
  return scoredLookup(t, dept);
}

/** The Poshmark leaf for an item, or null when no safe answer exists (the extension then runs its own search). */
export function resolvePoshmarkCategory(input: PoshmarkCategoryInput): PoshmarkCategoryResult | null {
  return explainPoshmarkCategory(input).result;
}

/** Re-exports so callers need only this module. */
export { getPoshmarkNode, poshmarkPathText };
