/**
 * Season E — "Sold in Your Neighborhood" (Weekly Discovery) template.
 * Source: claude_docs/marketing/video-seasons/season-E-sold-near-you.md
 * Format (4 beats, <=60s, SHORT-ONLY): "here's what's near you this weekend" ->
 * screen-record the map with 3-5 standout listings + price pops -> one line each
 * -> "all within X minutes of you, free to browse." The weekly heartbeat; 100%
 * screen-record + text, no sales-trip clips. ATTENTION. ADR-080 §9.1.
 */
import { Template, BASE_POLISH } from './types';

export const seasonESoldNearYou: Template = {
  id: 'season-E-sold-near-you',
  displayName: 'Sold in Your Neighborhood — Weekly Discovery',
  purpose: 'ATTENTION',
  contentSignature: {
    requiredRoles: ['MAP'],
    boostRoles: ['PRICE_REVEAL', 'CTA'],
    roleFractionMin: { MAP: 0.6 },      // >=60% MAP / screen-record
    screenRecordDominant: true,
    captionHints: ['near you', 'this weekend', 'minutes from you', 'under $'],
    priorWeight: 0.6,                    // weekly cadence -> most common batch shape
    notes: 'Signature: mostly MAP / screen-record clips, NO physical sales-trip finds, weekly cadence. If >=60% of clips are screen-record MAP and there is no BEFORE/AFTER, it is almost certainly E.',
  },
  slots: [
    { key: 'hook',    acceptsRoles: ['MAP', 'HOOK'],          required: true,  overlay: 'title_card', transitionIn: 'cut', maxMs: 5000, note: 'Map on screen: "You have no idea what\'s this close."' },
    { key: 'map',     acceptsRoles: ['MAP'],                  required: true,  transitionIn: 'cut', note: 'Screen-record zooming to pins.' },
    { key: 'find_1',  acceptsRoles: ['PRICE_REVEAL', 'FIND', 'MAP'], required: true,  overlay: 'price_pop', transitionIn: 'cut', note: 'Standout listing + price pop + one-line reason.' },
    { key: 'find_2',  acceptsRoles: ['PRICE_REVEAL', 'FIND', 'MAP'], required: true,  overlay: 'price_pop', transitionIn: 'cut' },
    { key: 'find_3',  acceptsRoles: ['PRICE_REVEAL', 'FIND', 'MAP'], required: true,  overlay: 'price_pop', transitionIn: 'cut' },
    { key: 'find_4',  acceptsRoles: ['PRICE_REVEAL', 'FIND', 'MAP'], required: false, overlay: 'price_pop', transitionIn: 'cut' },
    { key: 'find_5',  acceptsRoles: ['PRICE_REVEAL', 'FIND', 'MAP'], required: false, overlay: 'price_pop', transitionIn: 'cut' },
    { key: 'cta',     acceptsRoles: ['CTA'],                  required: true,  overlay: 'cta_card', transitionIn: 'cut', note: '"All within 15 minutes of you, all this weekend. Map\'s free — FindA.Sale."' },
  ],
  polish: { ...BASE_POLISH, pacing: { targetShotMs: 2200, hookMaxMs: 2000 } }, // fast cut
  longCut: { minSec: 45, maxSec: 60 },   // short-only: mirrors shortCut
  shortCut: { targetSec: 55, slotKeys: ['hook', 'map', 'find_1', 'find_2', 'find_3', 'find_4', 'find_5', 'cta'] },
  shortOnly: true,
};

export default seasonESoldNearYou;
