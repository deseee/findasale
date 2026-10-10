/**
 * Cheap, deterministic relevance check for same-category SOLD comps used by the rapid-draft
 * price refinement. A comp only counts when its title shares at least one meaningful token
 * with the new item's title (or artist). Stop words, generic format words and 4-digit years
 * are ignored so "Vinyl LP 1978" never matches another record on format words alone.
 */
const STOP_WORDS = new Set([
  'vinyl', 'lp', 'record', 'records', 'album', 'the', 'and', 'a', 'an', 'of', 'in', 'on', 'for', 'with', 'to',
  'by', 'cd', 'cassette', 'tape', 'ep', 'set', 'lot', 'new', 'used', 'vintage', 'original', 'rare', 'edition',
  'rpm', 'stereo', 'mono', 'oz', 'inch', 'sealed', 'nm', 'vg', 'ex',
]);

export function meaningfulTokens(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  for (const raw of text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (!raw || raw.length < 2) continue;
    if (/^\d{4}$/.test(raw)) continue; // 4-digit years
    if (STOP_WORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

/** True when compTitle shares at least one meaningful token with the item title or artist/brand. */
export function isRelevantComp(
  compTitle: string | null | undefined,
  itemTitle: string | null | undefined,
  itemArtist?: string | null,
): boolean {
  const compTokens = meaningfulTokens(compTitle);
  if (compTokens.size === 0) return false;
  const itemTokens = meaningfulTokens(`${itemTitle ?? ''} ${itemArtist ?? ''}`);
  for (const t of itemTokens) {
    if (compTokens.has(t)) return true;
  }
  return false;
}
