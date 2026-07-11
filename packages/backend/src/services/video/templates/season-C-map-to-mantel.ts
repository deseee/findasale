/**
 * Season C — "Map to Mantel" (Single-Item Story) template.
 * Source: claude_docs/marketing/video-seasons/season-C-map-to-mantel.md
 * Format (5 beats): listing thumbnail on map ("this caught my eye") -> the drive
 * / sale -> meeting the item + its story -> cleaned/styled in new spot -> "Found
 * on FindA.Sale." Low-effort, story-driven, single dominant item. ATTENTION.
 */
import { Template, BASE_POLISH } from './types';

export const seasonCMapToMantel: Template = {
  id: 'season-C-map-to-mantel',
  displayName: 'Map to Mantel — Single-Item Story',
  purpose: 'ATTENTION',
  contentSignature: {
    requiredRoles: ['HOOK', 'FIND'],
    boostRoles: ['AFTER', 'STYLING'],
    requiresBeforeAfterPair: false,
    captionHints: ['sat in a basement', 'years', 'found on', 'this caught my eye'],
    minDistinctSales: 1,
    priorWeight: 0.5,
    notes: 'Signature: ONE dominant item, one strong hookLine ("40 years in a basement"), a single price, a single room. Low clip count.',
  },
  slots: [
    { key: 'hook',    acceptsRoles: ['HOOK'],            required: true,  overlay: 'title_card', transitionIn: 'cut', maxMs: 8000, note: 'Phone showing the listing thumbnail + strong line ("This lamp sat in a basement for 40 years").' },
    { key: 'find',    acceptsRoles: ['FIND', 'PRICE_REVEAL'], required: true,  overlay: 'price_pop', transitionIn: 'crossfade', note: 'The drive + walk-in + meeting the item; the price.' },
    { key: 'story',   acceptsRoles: ['FIND', 'STYLING'], required: false, overlay: 'text_lower_third', transitionIn: 'cut', note: 'The item\'s story (era, estate detail) — keep it human.' },
    { key: 'styling', acceptsRoles: ['STYLING'],         required: true,  transitionIn: 'crossfade', note: 'Quick clean/style time-lapse.' },
    { key: 'after',   acceptsRoles: ['AFTER'],           required: true,  transitionIn: 'match_cut', note: 'The item glowing in its new spot (match the thumbnail framing if possible).' },
    { key: 'cta',     acceptsRoles: ['CTA'],             required: true,  overlay: 'cta_card', transitionIn: 'cut', note: '"From a basement, to this. Found on FindA.Sale."' },
  ],
  polish: { ...BASE_POLISH, pacing: { targetShotMs: 4000, hookMaxMs: 2000 } },
  longCut: { minSec: 180, maxSec: 225 },   // 3:00-3:45
  shortCut: { targetSec: 30, slotKeys: ['hook', 'find', 'styling', 'after', 'cta'] },
};

export default seasonCMapToMantel;
