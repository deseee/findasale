/**
 * Season F — "Amazon Find" (Solo Product Review) template.
 * NEW 2026-08-09 (ADR-101). Solo, phone-shot Amazon Influencer Program review:
 * hold the item, say what it is and whether it's worth it, done. Short (this is
 * the lightest-lift solo format — no room, no route, no second person).
 *
 * TWO-VARIANT RENDER (ADR-101): this is the only template that ever renders in
 * an 'AMAZON' variant (see renderVariant param on buildRenderPlan/renderBatch in
 * templateRenderer.ts). The AMAZON cut drops the FindA.Sale logo watermark and
 * the closing cta_card entirely, and deriveTitleAndDescription() must never emit
 * "FindA.Sale" in that variant's title/description — that's for Amazon's own
 * review-video tool, uploaded there directly by Patrick, never through our
 * publisher. The default/primary render (this template's normal FINDASALE
 * variant) keeps full branding and is the one that goes through the existing
 * VideoJob -> Approve -> YouTube fan-out flow -- reserved for the (optional,
 * later) "then I sold it on FindA.Sale" follow-up cut once the item is relisted.
 */
import { Template, BASE_POLISH } from './types';

export const seasonFAmazonFind: Template = {
  id: 'season-F-amazon-find',
  displayName: 'Amazon Find — Solo Product Review',
  purpose: 'ATTENTION',
  contentSignature: {
    requiredRoles: ['HOOK', 'FIND'],
    boostRoles: ['PRICE_REVEAL'],
    captionHints: ['unbox', 'review', 'worth it', 'amazon', 'let me show you'],
    minDistinctSales: 0,
    priorWeight: 0.4,
    notes: 'Signature: ONE item, solo talking-to-camera HOOK + FIND, no MAP, no STYLING, no BEFORE/AFTER, no second-person split-screen signal. Shortest, simplest clip set of any template.',
  },
  slots: [
    { key: 'hook', acceptsRoles: ['HOOK'], required: true, overlay: 'title_card', transitionIn: 'cut', maxMs: 2000, note: `"Here's what I got today" — item already in frame or hand.` },
    { key: 'find', acceptsRoles: ['FIND', 'PRICE_REVEAL'], required: true, overlay: 'price_pop', transitionIn: 'cut', note: `Hold the item, say what it is, quick honest take on whether it's worth it.` },
    { key: 'cta', acceptsRoles: ['CTA'], required: false, overlay: 'cta_card', transitionIn: 'cut', note: 'FINDASALE variant only — dropped entirely for the AMAZON cut (see file header + templateRenderer renderVariant).' },
  ],
  polish: { ...BASE_POLISH, pacing: { targetShotMs: 2500, hookMaxMs: 2000 } },
  longCut: { minSec: 30, maxSec: 60 },
  shortCut: { targetSec: 45, slotKeys: ['hook', 'find', 'cta'] },
  shortOnly: true,
};

export default seasonFAmazonFind;
