/**
 * Season G — "How It Works" (Feature Walkthrough) template.
 * NEW 2026-09-18. First implementation of the TUTORIAL purpose (Template['purpose']
 * already carried 'TUTORIAL' in the types.ts union — nothing built it until now).
 *
 * Added to fix stalled batch `cmtusdrov001djrsvh5wp40pt`: Patrick uploaded 9 clips
 * on 2026-09-09 — a how-to walkthrough of RapidFire listing mode (4 talking-head
 * HOOK clips explaining what's about to be shown + 4 screen-record MAP clips
 * demonstrating the dashboard/camera/upload flow + 1 flubbed UNKNOWN take). Every
 * existing active template (A/B/C/E/F) is a "show" format whose contentSignature
 * requires a physical find, a price reveal, or a before/after pair — none of which
 * exist in a software demo — so every one of them scored 0.0 and the batch sat in
 * NEEDS_INPUT for 9 days asking an unanswerable "Room Styling or Resale Route?"
 * question. This template gives instructional screen-record footage a real home.
 *
 * Format (flexible beats, 1-4 steps): talking-head intro stating what will be
 * shown -> one or more screen-record steps through the actual app flow -> closing
 * card. No physical find, no price reveal, no before/after pair, no dedicated CTA
 * clip — a synthesized cta_card (see templateRenderer.ts tryFill()) closes it out
 * instead. TUTORIAL. ADR-080 §9.1 extension.
 */
import { Template, BASE_POLISH } from './types';

export const seasonGFeatureTutorial: Template = {
  id: 'season-G-feature-tutorial',
  displayName: 'How It Works, Feature Walkthrough',
  purpose: 'TUTORIAL',
  contentSignature: {
    requiredRoles: ['MAP'],
    boostRoles: ['HOOK'],
    // Real stalled batch was 4/9 = 0.44 MAP — well under season E's 0.6 dominant-
    // screen-record floor (which is exactly why E also scored this batch a 0, not
    // just the show formats). 0.3 catches a tutorial without needing E's near-100%
    // screen-record shape.
    roleFractionMin: { MAP: 0.3 },
    screenRecordDominant: true,
    captionHints: [
      'how to', 'show you how', "i'm going to show you", 'walk you through',
      "here's how", 'step', 'click', 'tap', 'dashboard', 'open the camera',
    ],
    // Deliberately the LOWEST priorWeight of any template (A/B/C=0.5, E=0.6,
    // F=0.4). A real Season A-F shoot always carries its own much stronger signal
    // (a BEFORE/AFTER pair, a PRICE_REVEAL pair, a physical FIND) that scores far
    // above what this template can reach on MAP-fraction + caption hints alone, so
    // a low prior here means this template only wins when the batch genuinely has
    // none of those show-format signals — it can surface as a tiebreak candidate
    // but never hijack a genuine shoot outright.
    priorWeight: 0.3,
    notes: 'Signature: MAP (screen-record) clips demonstrating the app UI, narrated by a talking-head HOOK, with NO physical find, NO PRICE_REVEAL, NO BEFORE/AFTER pair, NO CTA clip. If a batch is instructional screen-record + narration with zero sales-trip signal, it is a tutorial, not a show format.',
  },
  slots: [
    { key: 'hook',    acceptsRoles: ['HOOK'], required: true,  overlay: 'title_card', transitionIn: 'cut', maxMs: 5000, note: "Talking-head: what this video is about to show (\"I'm going to show you how to...\")." },
    { key: 'step_1',  acceptsRoles: ['MAP'],  required: true,  transitionIn: 'cut', note: 'Screen-record: first step of the walkthrough (e.g. open the dashboard).' },
    { key: 'step_2',  acceptsRoles: ['MAP'],  required: false, transitionIn: 'cut', note: 'Screen-record: next step, if the flow has one.' },
    { key: 'step_3',  acceptsRoles: ['MAP'],  required: false, transitionIn: 'cut', note: 'Screen-record: next step, if the flow has one.' },
    { key: 'step_4',  acceptsRoles: ['MAP'],  required: false, transitionIn: 'cut', note: 'Screen-record: final step, if the flow has one.' },
    { key: 'cta',     acceptsRoles: ['CTA'],  required: false, overlay: 'cta_card', transitionIn: 'cut', note: 'Closing card. This footage shape has no dedicated CTA clip — templateRenderer.ts synthesizes the brand card instead (never a hard requirement). "Try it yourself — FindA.Sale."' },
  ],
  // Slower, more deliberate pacing than season E's 2200ms fast cut — instructional
  // steps need room to read on screen, not a highlight-reel cut rate.
  polish: { ...BASE_POLISH, pacing: { targetShotMs: 5000, hookMaxMs: 2000 } },
  longCut: { minSec: 60, maxSec: 180 },   // walkthroughs legitimately run long
  shortCut: { targetSec: 55, slotKeys: ['hook', 'step_1', 'step_2', 'step_3', 'step_4', 'cta'] },
};

export default seasonGFeatureTutorial;
