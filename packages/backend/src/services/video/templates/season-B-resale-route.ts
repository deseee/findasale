/**
 * Season B — "The Resale Route" (Reseller Sourcing) template.
 * Source: claude_docs/marketing/video-seasons/season-B-resale-route.md
 * Format (6 beats): plan route on map -> show why each stop -> sale-by-sale find
 * + "Paid $X / Resale $Y" price pop -> one gamble buy -> haul tally -> CTA.
 * Highest-retention format (price pop on EVERY find). PROMO. ADR-080 §9.1.
 */
import { Template, BASE_POLISH } from './types';

export const seasonBResaleRoute: Template = {
  id: 'season-B-resale-route',
  displayName: 'The Resale Route — Reseller Sourcing',
  purpose: 'PROMO',
  contentSignature: {
    requiredRoles: ['MAP', 'PRICE_REVEAL'],
    boostRoles: ['HOOK', 'FIND'],
    requiresPricePairs: true,           // "Paid $X" + "Resale/Worth $Y" caption pairs
    captionHints: ['paid $', 'resale', 'worth', 'flip', 'spent $', 'route'],
    minDistinctSales: 3,
    priorWeight: 0.5,
    notes: 'Signature: repeated "Paid $X / Resale $Y" caption pairs, car/map opener, table haul tally. This is the highest-retention price-pop format.',
  },
  slots: [
    { key: 'hook',    acceptsRoles: ['HOOK'],  required: true,  overlay: 'title_card', transitionIn: 'cut', maxMs: 10000, note: 'In car, phone on mount showing route ("3 sales. 1 map. Buy low, flip high.").' },
    { key: 'map',     acceptsRoles: ['MAP'],   required: true,  overlay: 'text_lower_third', transitionIn: 'cut', note: 'Screen-record: tap the 3 sales, show the photos that made them worth it.' },
    { key: 'find_1',  acceptsRoles: ['FIND', 'PRICE_REVEAL'], required: true,  overlay: 'price_pop', transitionIn: 'cut', note: 'Sale 1 hero find + "Paid $4 · Resale $30-35" pop.' },
    { key: 'find_2',  acceptsRoles: ['FIND', 'PRICE_REVEAL'], required: true,  overlay: 'price_pop', transitionIn: 'cut', note: 'Sale 2 hero find + paid-vs-worth pop.' },
    { key: 'find_3',  acceptsRoles: ['FIND', 'PRICE_REVEAL'], required: false, overlay: 'price_pop', transitionIn: 'cut', note: 'Sale 3 find + pop.' },
    { key: 'gamble',  acceptsRoles: ['FIND', 'PRICE_REVEAL'], required: false, overlay: 'price_pop', transitionIn: 'cut', note: 'The gamble buy (box lot) — honest about the risk.' },
    { key: 'haul',    acceptsRoles: ['STYLING', 'FIND'],      required: true,  overlay: 'budget_ticker', transitionIn: 'crossfade', note: 'Whole haul on a table, top-down; tally "Spent $20 · Resale $130+".' },
    { key: 'cta',     acceptsRoles: ['CTA'],   required: true,  overlay: 'cta_card', transitionIn: 'cut', note: 'Map your route free — FindA.Sale.' },
  ],
  polish: { ...BASE_POLISH, pacing: { targetShotMs: 3000, hookMaxMs: 2000 } },
  longCut: { minSec: 300, maxSec: 360 },   // 5:00-6:00
  shortCut: { targetSec: 45, slotKeys: ['hook', 'map', 'find_1', 'find_2', 'find_3', 'haul', 'cta'] },
};

export default seasonBResaleRoute;
