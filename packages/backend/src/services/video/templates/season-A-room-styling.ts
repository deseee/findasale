/**
 * Season A — "Found It On FindA.Sale" (Room Styling) template.
 * Source: claude_docs/marketing/video-seasons/season-A-room-styling.md
 * Format (6 beats): sad empty room + budget -> map (3 pins) -> hit sales
 * (finds + price tags) -> style time-lapse -> before->after match-cut -> budget
 * total (spent vs retail). PROMO purpose. ADR-080 §9.1.
 */
import { Template, BASE_POLISH } from './types';

export const seasonARoomStyling: Template = {
  id: 'season-A-room-styling',
  displayName: 'Found It On FindA.Sale — Room Styling',
  purpose: 'PROMO',
  contentSignature: {
    requiredRoles: ['BEFORE', 'AFTER'],
    boostRoles: ['MAP', 'FIND', 'PRICE_REVEAL', 'STYLING'],
    requiresBeforeAfterPair: true,      // empty-room BEFORE + finished-room AFTER (shared room)
    captionHints: ['before', 'after', 'budget', '/200', '/$200', 'retail', 'spent'],
    minDistinctSales: 2,
    priorWeight: 0.5,
    notes: 'Strongest signal: empty-room BEFORE + finished-room AFTER pair sharing a room, plus a running budget ticker ("$90 / $200").',
  },
  slots: [
    { key: 'title',     acceptsRoles: ['BEFORE', 'HOOK'], required: true,  overlay: 'title_card', transitionIn: 'cut', maxMs: 8000, note: 'Sad empty room + budget stated ("$200. One weekend.").' },
    { key: 'before',    acceptsRoles: ['BEFORE'],         required: true,  transitionIn: 'cut', note: 'Bare corner from ONE fixed frame — reused for the match-cut at the end.' },
    { key: 'map',       acceptsRoles: ['MAP'],            required: true,  overlay: 'text_lower_third', transitionIn: 'cut', note: 'Screen-record the map, tap 3 listings (real photos + prices).' },
    { key: 'find_1',    acceptsRoles: ['FIND', 'PRICE_REVEAL'], required: true,  overlay: 'budget_ticker', transitionIn: 'cut', note: 'Sale 1 find + price tag; budget ticker ticks up.' },
    { key: 'find_2',    acceptsRoles: ['FIND', 'PRICE_REVEAL'], required: false, overlay: 'budget_ticker', transitionIn: 'cut' },
    { key: 'find_3',    acceptsRoles: ['FIND', 'PRICE_REVEAL'], required: false, overlay: 'budget_ticker', transitionIn: 'cut' },
    { key: 'styling',   acceptsRoles: ['STYLING'],        required: true,  transitionIn: 'crossfade', note: 'Time-lapse build, music up, VO off.' },
    { key: 'after',     acceptsRoles: ['AFTER'],          required: true,  overlay: 'budget_ticker', transitionIn: 'match_cut', note: 'Match-cut from the exact BEFORE frame; overlay "Spent $90 · Retail $430+".' },
    { key: 'cta',       acceptsRoles: ['CTA'],            required: true,  overlay: 'cta_card', transitionIn: 'cut', note: '"Free to browse, there\'s a sale near you, FindA.Sale."' },
  ],
  polish: { ...BASE_POLISH, pacing: { targetShotMs: 3500, hookMaxMs: 2000 } },
  longCut: { minSec: 270, maxSec: 330 },   // 4:30-5:30
  shortCut: { targetSec: 60, slotKeys: ['before', 'map', 'find_1', 'find_2', 'find_3', 'styling', 'after', 'cta'] },
};

export default seasonARoomStyling;
