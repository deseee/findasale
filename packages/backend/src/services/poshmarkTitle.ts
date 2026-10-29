/**
 * Poshmark-only title form (2026-10-29, owner-approved).
 *
 * Poshmark's own listing validator flags a title containing "Cartridge" as a "potential prohibited item" (vape cartridges).
 * Prod evidence: FAS_FLOW_DIAG poshmark_prohibited_flag on Neo Geo MVS arcade cartridges, while Neo Geo mini marquees in the
 * same category posted fine. The extension (fas-poshmark.js poshmarkCartTitle, fas-edit-core.js poshmarkCartTitle) therefore
 * posts "Cart"/"Carts" in place of the whole word "Cartridge"/"Cartridges" (any case) and collapses a doubled word this creates
 * ("Arcade Cartridge Cartridge," -> "Arcade Cart,"). Titles that are really about vaping (vape, e-cig, THC, oil, 510) are left
 * alone. The FindA.Sale title and every other marketplace are unchanged.
 *
 * The backend never builds the Poshmark title; it only needs to RECOGNISE a Poshmark listing posted under the "Cart" form, so a
 * Poshmark sold email carrying that title still matches the FindA.Sale item. Keep the transform identical to the extension's.
 */
import type { VintedSoldCandidateItem, VintedSoldMatchContext } from './vintedSoldDetectionService';
import { normalizeListingTitle } from './vintedSoldDetectionService';

const VAPE_RE = /\b(?:vapes?|vaping|vaper|e-?cigs?|e-?cigarettes?|thc|oils?|510)\b/i;
const POSHMARK_TITLE_MAX = 80;

const isUpper = (w: string): boolean => w === w.toUpperCase();

/** The title with whole-word Cartridge(s) -> Cart(s), as the extension types it into Poshmark. Unchanged when vape-related. */
export function poshmarkCartTitle(title: string | null | undefined): string {
  const t = String(title ?? '');
  if (!/\bcartridges?\b/i.test(t) || VAPE_RE.test(t)) return t;
  let out = t.replace(/\b(cartridge)(s?)\b/gi, (_m, w: string, pl: string) => {
    const base = isUpper(w) ? 'CART' : w.charAt(0) === 'C' ? 'Cart' : 'cart';
    return base + (pl ? (isUpper(w) ? 'S' : 's') : '');
  });
  let prev: string;
  do {
    prev = out;
    out = out.replace(/\b(carts?)\s+(carts?)\b/i, (_m, a: string, b: string) =>
      /s$/i.test(a) || !/s$/i.test(b) ? a : a + (isUpper(a) ? 'S' : 's'));
  } while (out !== prev);
  return out;
}

/** Poshmark's 80-character cut, identical to truncatePoshmarkTitle in fas-poshmark.js. */
export function truncatePoshmarkTitle(title: string | null | undefined): string {
  const t = String(title ?? '');
  if (t.length <= POSHMARK_TITLE_MAX) return t;
  const cut = t.slice(0, POSHMARK_TITLE_MAX);
  const sp = cut.lastIndexOf(' ');
  return (sp > POSHMARK_TITLE_MAX - 15 ? cut.slice(0, sp) : cut).trimEnd();
}

/**
 * Adds each item's "Cart" Poshmark title (full and 80-char trimmed) as extra keys of ctx.itemsByNormTitle, so a Poshmark sold
 * report carrying the posted title resolves to the item. Only items whose title actually changes get extra keys; an item is
 * never listed twice under one key, and two different items sharing a key stay ambiguous (never guessed).
 */
export function addPoshmarkTitleKeys(ctx: VintedSoldMatchContext, items: VintedSoldCandidateItem[]): void {
  for (const it of items) {
    const cart = poshmarkCartTitle(it.title);
    if (cart === String(it.title ?? '')) continue;
    const own = normalizeListingTitle(it.title);
    for (const variant of [cart, truncatePoshmarkTitle(cart)]) {
      const key = normalizeListingTitle(variant);
      if (!key || key === own) continue;
      const arr = ctx.itemsByNormTitle.get(key) || [];
      if (!arr.some((x) => x.id === it.id)) arr.push(it);
      ctx.itemsByNormTitle.set(key, arr);
    }
  }
}
