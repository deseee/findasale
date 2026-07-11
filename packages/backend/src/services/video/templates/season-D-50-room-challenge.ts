/**
 * Season D — "The $50 Room Challenge" (Collab / Competition) template.
 * Source: claude_docs/marketing/video-seasons/season-D-50-room-challenge.md
 * Format (5 beats): rules ($50 each) -> split-screen map picks -> finds (race,
 * price pops) -> side-by-side reveal -> "Vote below." Two-person duel. PROMO.
 *
 * // ROUGH DRAFT — needs refinement.
 * UNRESOLVED: Season D is the only format whose core mechanic is a TWO-PERSON
 * SPLIT-SCREEN / side-by-side composite. The ADR-080 §9 base SlotSpec vocabulary
 * (overlay + transitionIn) does not model:
 *   (1) two parallel actors ("him" vs "her") whose clips must be tracked as
 *       SIDE A vs SIDE B, and
 *   (2) simultaneous split-screen compositing (two clips on screen at once),
 *       vs the linear one-clip-per-slot model every other template uses.
 * Interim modeling below: 'split_screen' / 'split_screen_labels' were added to the
 * type unions (marked ADR-080 §9 extension in types.ts), and side is encoded via a
 * `_a`/`_b` slot-key convention + the `note` field. A proper spec needs a first-class
 * `side?: 'A' | 'B'` on SlotSpec and a `composite?: 'split'` layout hint, plus a
 * ClipAnalysis actor/side signal — deferred to the Phase-2 Season-D build (ADR-080 §12).
 */
import { Template, BASE_POLISH } from './types';

export const seasonD50RoomChallenge: Template = {
  id: 'season-D-50-room-challenge',
  displayName: 'The $50 Room Challenge — Collab / Competition',
  purpose: 'PROMO',
  contentSignature: {
    requiredRoles: ['FIND', 'PRICE_REVEAL'],
    boostRoles: ['MAP', 'STYLING', 'CTA'],
    twoPerson: true,
    captionHints: ['$50 each', '$50', 'vs', 'vote', 'who won', 'winner'],
    priorWeight: 0.4,
    notes: 'ROUGH DRAFT signature: two-person / "$50 each" / split or duel structure / vote ask. twoPerson + a vote CTA are the strongest discriminators from A/B.',
  },
  slots: [
    { key: 'rules',      acceptsRoles: ['HOOK'],                 required: true,  overlay: 'title_card', transitionIn: 'cut', maxMs: 10000, note: 'Both on camera: "$50 each. Same sales. One winner." Explain the constraint fast.' },
    { key: 'map_a',      acceptsRoles: ['MAP'],                  required: false, overlay: 'split_screen_labels', transitionIn: 'split_screen', note: 'SIDE A map picks (rough: side encoded by _a suffix).' },
    { key: 'map_b',      acceptsRoles: ['MAP'],                  required: false, overlay: 'split_screen_labels', transitionIn: 'split_screen', note: 'SIDE B map picks.' },
    { key: 'find_a',     acceptsRoles: ['FIND', 'PRICE_REVEAL'], required: true,  overlay: 'price_pop', transitionIn: 'cut', note: 'SIDE A finds + price pops (race format).' },
    { key: 'find_b',     acceptsRoles: ['FIND', 'PRICE_REVEAL'], required: true,  overlay: 'price_pop', transitionIn: 'cut', note: 'SIDE B finds + price pops.' },
    { key: 'build',      acceptsRoles: ['STYLING'],              required: false, transitionIn: 'crossfade', note: 'Both style their corners (time-lapse).' },
    { key: 'reveal',     acceptsRoles: ['AFTER'],                required: true,  overlay: 'split_screen_labels', transitionIn: 'split_screen', note: 'Side-by-side reveal of both corners — the payoff composite.' },
    { key: 'cta',        acceptsRoles: ['CTA'],                  required: true,  overlay: 'cta_card', transitionIn: 'cut', note: '"Which one wins? Vote in the comments." (comments drive the algorithm).' },
  ],
  polish: { ...BASE_POLISH, pacing: { targetShotMs: 3000, hookMaxMs: 2000 } },
  longCut: { minSec: 240, maxSec: 300 },   // 4:00-5:00
  shortCut: { targetSec: 30, slotKeys: ['rules', 'find_a', 'find_b', 'reveal', 'cta'] },
};

export default seasonD50RoomChallenge;
