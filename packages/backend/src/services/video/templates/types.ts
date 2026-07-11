/**
 * templates/types.ts — ADR-080 §9 Template contract (typed data only).
 *
 * A `Template` is an ORDERED SLOT SPEC + POLISH RULES that maps one of the five
 * season formats (claude_docs/marketing/video-seasons/A-E) into a machine-fillable
 * shape. The auto-classify assembler (a LATER ADR-080 stage) fills each slot from
 * a `ClipAnalysis[]` and renders via Revideo — NONE of that rendering logic lives
 * here. This file is pure configuration/data so it can be reviewed, versioned, and
 * unit-tested without pulling in ffmpeg/Revideo.
 *
 * Foundation-stage scope (ADR-080 Phase 1, stage 1): the contract + all five
 * season Template definitions as data. `inferTemplate()` (§10) and the slot-fill /
 * render engine (§9.2, §5) are separate later stages.
 */

/**
 * Canonical clip roles. MIRRORS the `ClipRole` union that ADR-080 §5.2 places in
 * `clipAnalysis.ts` (not built yet) and the `FootageRole` enum in schema.prisma.
 * Defined locally here so the template data type-checks without depending on the
 * unbuilt clipAnalysis module; when clipAnalysis.ts lands, the two unions must be
 * kept identical (single canonical list — do not diverge).
 */
export type ClipRole =
  | 'HOOK' | 'FIND' | 'PRICE_REVEAL' | 'BEFORE' | 'AFTER'
  | 'MAP' | 'STYLING' | 'CTA' | 'UNKNOWN';

export type SlotOverlay =
  | 'price_pop'          // "Paid $X / Worth $Y" pop on a PRICE_REVEAL find
  | 'budget_ticker'      // running "$90 / $200" total (Season A/B haul)
  | 'title_card'         // opening title + budget/rules card
  | 'cta_card'           // closing "Free to browse — FindA.Sale" card
  | 'text_lower_third'   // caption/label lower-third
  | 'split_screen_labels'; // ADR-080 §9 extension (Season D) — his/her side labels

export type SlotTransition =
  | 'cut'
  | 'crossfade'
  | 'match_cut'          // before->after from the SAME frame (A, C)
  | 'split_screen';      // ADR-080 §9 extension (Season D) — side-by-side reveal

export interface SlotSpec {
  key: string;                 // 'hook','map','find_1','price_1','before','after','styling','cta'
  acceptsRoles: ClipRole[];    // which ClipAnalysis roles may fill this slot
  required: boolean;           // if required & unfilled -> §6 NEEDS_INPUT/fail-loud, never ship blank
  minMs?: number;
  maxMs?: number;
  overlay?: SlotOverlay;
  transitionIn?: SlotTransition;
  /** Free-text intent for the assembler + staged-review file (not rendered). */
  note?: string;
}

export interface PolishRules {
  captionStyle: 'tiktok_word_by_word';                 // Revideo animated captions (Remotion createTikTokStyleCaptions model)
  pricePop: { fromCaptionFact: 'prices'; anim: 'pop_scale'; brand: '#F97316' };
  beforeAfter: { matchCutOnSharedRoom: true };
  music: { bed: 'upbeat_light'; duckUnderVO: true; loudnorm: true }; // ffmpeg loudnorm + sidechain duck
  pacing: { targetShotMs: number; hookMaxMs: 2000 };   // hook <=2s (algo window, ADR-078 addendum)
  endCard: { logo: 'pin_star'; sender: 'The FindA.Sale Team' };
}

/**
 * SignatureRule — content-signature used by §10 format inference to recognize a
 * batch as THIS template from its ClipAnalysis[] (role histogram + caption text).
 *
 * ROUGH DRAFT — needs refinement: the exact scoring math (weights, normalization,
 * the <0.15 margin LLM tiebreak) is owned by `inferTemplate()` in a later stage.
 * These fields are the SIGNALS that stage will score; their shape may tighten once
 * inferTemplate is implemented. Captured now so inference has a concrete base.
 */
export interface SignatureRule {
  requiredRoles?: ClipRole[];                 // must all be present for a plausible match
  boostRoles?: ClipRole[];                    // presence raises the score
  roleFractionMin?: Partial<Record<ClipRole, number>>; // e.g. E: { MAP: 0.6 }
  captionHints?: string[];                    // lowercase substrings that signal this format ("paid $", "resale", "$50 each")
  requiresBeforeAfterPair?: boolean;          // A, C
  requiresPricePairs?: boolean;               // B "paid vs worth"
  minDistinctSales?: number;                  // B/E multi-stop
  twoPerson?: boolean;                        // D
  screenRecordDominant?: boolean;             // E
  priorWeight?: number;                       // template prior for tie handling (0-1)
  notes?: string;
}

export interface Template {
  id: string;                  // 'season-A-room-styling' ... 'season-E-sold-near-you'
  displayName: string;
  purpose: 'ATTENTION' | 'PROMO' | 'TUTORIAL';
  contentSignature: SignatureRule;   // §10 — how format inference recognizes this template
  slots: SlotSpec[];                 // ordered
  polish: PolishRules;
  longCut: { minSec: number; maxSec: number };
  /** shortCut carries targetSec + the ORDERED slot-key subset that appears in the
   *  30-60s cut (the season files specify an explicit short beat order). slotKeys
   *  is an additive ADR-080 §9 extension over the bare `{ targetSec }` in the ADR. */
  shortCut: { targetSec: number; slotKeys?: string[] };
  /** Season E is short-only (no long cut). Additive optional flag; when true the
   *  longCut window mirrors shortCut and the long render is skipped. */
  shortOnly?: boolean;
}

/** Shared house-style polish baseline. Individual templates override `pacing`. */
export const BASE_POLISH: PolishRules = {
  captionStyle: 'tiktok_word_by_word',
  pricePop: { fromCaptionFact: 'prices', anim: 'pop_scale', brand: '#F97316' },
  beforeAfter: { matchCutOnSharedRoom: true },
  music: { bed: 'upbeat_light', duckUnderVO: true, loudnorm: true },
  pacing: { targetShotMs: 3000, hookMaxMs: 2000 },
  endCard: { logo: 'pin_star', sender: 'The FindA.Sale Team' },
};
