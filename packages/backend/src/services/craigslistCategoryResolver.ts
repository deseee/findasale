/**
 * craigslistCategoryResolver.ts -- maps a FindA.Sale item to ONE Craigslist category code
 * (S-EXT-CRAIGSLIST-CATEGORY-MAP, 2026-10-05). Pure TypeScript: no imports beyond the two config files
 * below, no I/O, no env, no network. BACKEND ONLY: never import this from the frontend or @findasale/shared.
 *
 * WHY: extension/fas-craigslist.js used to pick the posting category with a 20-rule SUBSTRING table, so
 * "Home & Garden" went to farm+garden, "Video Games & Consoles" to photo+video ("video"), "Skin Care" to
 * sporting ("ski" inside "skin"), "Smart Watches" to arts+crafts ("art" inside "smart"), and a baseball
 * glove fell to general. This resolver uses WHOLE-WORD matching only, so a substring hit is impossible,
 * and tells the extension exactly which category (3-letter code + path) to open.
 *
 * LAYERS, first hit wins; a miss in one layer falls to the next:
 *   1. CURATED_ID  eBay numeric leaf id -> Craigslist category (config/craigslistCategoryMap.ts).
 *   2. RULE        ordered keyword rules over eBay category name + breadcrumb + title; specific before
 *                  generic. A rule with a null target is a deliberate BLANK and stops everything.
 *   3. SCORED      one-word category names; used only when exactly ONE category matches. Conservative on
 *                  purpose: a wrong category published silently is worse than none.
 * barter, wanted, free stuff and garage sales are never returned (CRAIGSLIST_NEVER_TARGETS).
 * resolveCraigslistCategory() returns null when nothing is safe; explainCraigslistCategory() says why.
 */
import {
  getCraigslistNode,
  isCraigslistLeaf,
  craigslistPathTitles,
  craigslistPathText,
} from '../config/craigslistCategoryTree';
import {
  CRAIGSLIST_CURATED_BY_EBAY_ID,
  CRAIGSLIST_RULES,
  CRAIGSLIST_SCORED_ALIASES,
  CRAIGSLIST_NEVER_TARGETS,
} from '../config/craigslistCategoryMap';

export type CraigslistCategorySource = 'CURATED_ID' | 'RULE' | 'SCORED';

export interface CraigslistCategoryInput {
  ebayCategoryId?: string | number | null;
  ebayCategoryName?: string | null;
  /** Item.category, which production stores either as a plain name or as an eBay colon breadcrumb. */
  categoryBreadcrumb?: string | null;
  title?: string | null;
  description?: string | null;
  brand?: string | null;
}

export interface CraigslistCategoryResult {
  /** Craigslist 3-letter category code, e.g. "sga". */
  id: string | number | null;
  /** Titles from the root down to the category, e.g. ['for sale', 'sporting']. */
  path: string[];
  /** "for sale > sporting" */
  pathText: string;
  source: CraigslistCategorySource;
}

export interface CraigslistCategoryExplanation {
  result: CraigslistCategoryResult | null;
  /** curated | rule | blank | scored | none */
  stage: 'curated' | 'rule' | 'blank' | 'scored' | 'none';
  /** The rule id / eBay id / category code that decided it, when there was one. */
  detail: string;
  /** Why the answer is null (empty when there is a result). */
  reason: string;
}

// ---------------------------------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------------------------------

/** Lower-case, accent-fold, drop apostrophes, "&" -> " and ", every other non-alphanumeric run -> one space. */
export function normalizeCraigslistText(raw: string | null | undefined): string {
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

function prepare(input: CraigslistCategoryInput): PreparedInput {
  const catName = normalizeCraigslistText(input.ebayCategoryName);
  const crumb = normalizeCraigslistText(input.categoryBreadcrumb);
  const cat = catName && crumb && crumb.indexOf(catName) === -1 ? catName + ' ' + crumb : catName || crumb;
  const title = normalizeCraigslistText((input.title || '') + ' ' + (input.brand || ''));
  const desc = normalizeCraigslistText((input.description || '').slice(0, 1500));
  return { cat, title, desc };
}

// ---------------------------------------------------------------------------------------------------
// Pattern compilation (cached). Syntax is documented at the top of config/craigslistCategoryMap.ts.
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

function makeResult(code: string, source: CraigslistCategorySource): CraigslistCategoryResult | null {
  if (!isCraigslistLeaf(code)) return null;
  if (CRAIGSLIST_NEVER_TARGETS.indexOf(code) !== -1) return null;
  const path = craigslistPathTitles(code);
  return { id: code, path, pathText: path.join(' > '), source };
}

// ---------------------------------------------------------------------------------------------------
// Layer 1 + 2
// ---------------------------------------------------------------------------------------------------

function curatedLookup(input: CraigslistCategoryInput, t: PreparedInput): CraigslistCategoryExplanation | null {
  if (input.ebayCategoryId == null || input.ebayCategoryId === '') return null;
  const key = String(input.ebayCategoryId).trim();
  if (!Object.prototype.hasOwnProperty.call(CRAIGSLIST_CURATED_BY_EBAY_ID, key)) return null;
  const entry = CRAIGSLIST_CURATED_BY_EBAY_ID[key];
  let target: string | null | undefined;
  if (entry === null || typeof entry === 'string') {
    target = entry;
  } else {
    target = undefined;
    for (const [pat, tgt] of entry.split) {
      if (patternMatches(pat, t)) { target = tgt; break; }
    }
    if (target === undefined && entry.fallback !== undefined) target = entry.fallback;
    if (target === undefined) return null; // no sub-rule matched: let the rule layer decide
  }
  if (target === null) {
    return { result: null, stage: 'blank', detail: 'curated:' + key, reason: 'deliberate-blank' };
  }
  const result = makeResult(target, 'CURATED_ID');
  if (!result) return null;
  return { result, stage: 'curated', detail: key, reason: '' };
}

function ruleLookup(t: PreparedInput): CraigslistCategoryExplanation | null {
  for (const r of CRAIGSLIST_RULES) {
    let ok = true;
    for (const p of r.all) { if (!patternMatches(p, t)) { ok = false; break; } }
    if (!ok) continue;
    if (r.none) {
      for (const p of r.none) { if (patternMatches(p, t)) { ok = false; break; } }
      if (!ok) continue;
    }
    if (r.target === null) {
      return { result: null, stage: 'blank', detail: r.id, reason: 'deliberate-blank' };
    }
    const result = makeResult(r.target, 'RULE');
    if (!result) continue;
    return { result, stage: 'rule', detail: r.id, reason: '' };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Layer 3: scored (unique one-word category name)
// ---------------------------------------------------------------------------------------------------

function scoredLookup(t: PreparedInput): CraigslistCategoryExplanation {
  const text = (t.cat + ' ' + t.title).trim();
  if (!text) return { result: null, stage: 'none', detail: '', reason: 'no-text' };
  const hits: string[] = [];
  for (const a of CRAIGSLIST_SCORED_ALIASES) {
    if (!new RegExp('\\b(?:' + a.any + ')\\b').test(text)) continue;
    if (a.none && new RegExp('\\b(?:' + a.none + ')\\b').test(text)) continue;
    if (hits.indexOf(a.id) === -1) hits.push(a.id);
  }
  if (hits.length === 0) return { result: null, stage: 'none', detail: '', reason: 'no-candidate' };
  if (hits.length > 1) return { result: null, stage: 'none', detail: '', reason: 'ambiguous:' + hits.join(',') };
  const result = makeResult(hits[0], 'SCORED');
  if (!result) return { result: null, stage: 'none', detail: '', reason: 'invalid-target' };
  return { result, stage: 'scored', detail: hits[0], reason: '' };
}

// ---------------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------------

/** Full decision trail: which layer answered (or why nothing did). resolveCraigslistCategory() is the thin wrapper. */
export function explainCraigslistCategory(input: CraigslistCategoryInput): CraigslistCategoryExplanation {
  const t = prepare(input || {});
  const cur = curatedLookup(input || {}, t);
  if (cur) return cur;
  const rul = ruleLookup(t);
  if (rul) return rul;
  return scoredLookup(t);
}

/** The Craigslist category for an item, or null when no safe answer exists (the extension then falls back to its own keyword map). */
export function resolveCraigslistCategory(input: CraigslistCategoryInput): CraigslistCategoryResult | null {
  return explainCraigslistCategory(input).result;
}

/** Re-exports so callers need only this module. */
export { getCraigslistNode, craigslistPathText };
