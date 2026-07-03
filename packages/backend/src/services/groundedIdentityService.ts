/**
 * groundedIdentityService — PRODUCTION grounded item-identification orchestrator.
 * (ADR grounded-identification-production-2026-07-02)
 *
 * Conditionally escalates a base analyzeItemImages() result to a web-grounded identity
 * resolution, under a full cost-control cascade, and (when a gated winner is produced)
 * PATCHES the item's title/brand + persists groundedIdentity/-Confidence/-Source.
 *
 * Design contract (all enforced here):
 *   - MASTER kill switch OFF by default -> this whole module is a no-op (Phase 0). With
 *     GROUNDING_ENABLED != 'true' the pipeline is byte-for-byte unchanged.
 *   - ELIGIBILITY: only escalate when the base result is uncertain — confidence <
 *     GROUNDING_ESCALATE_BELOW (default 0.75) OR a distinctive-mark signal (brand empty
 *     but Vision detectedText non-trivial). High-confidence common items never pay.
 *   - COST GATES checked BEFORE any paid call: master switch, monthly ceiling (pre-flight),
 *     daily cap, rollout %. A per-item ceiling aborts remaining calls once exceeded.
 *   - COST CASCADE: Tier 1 (VALUE: perplexity/sonar text + qwen extractor + gemini-2.5-flash
 *     :online visual + Web Detection corroborator). Tier 2 (PREMIUM) runs ONLY when Tier 1
 *     produced no gated candidate — adds gpt-4o:online visual + upgrades text to sonar-pro.
 *   - COMBINE: text-grounded passes at conf>=0.7; visual = consensus across visual models;
 *     winner = higher-conf gated candidate; if NEITHER passes, base result is left unchanged.
 *   - OVERRIDE: winner may overwrite title/brand ONLY when it passed the gate AND the field
 *     is NOT in item.userEditedFields. NEVER touches price. Never overrides condition/category.
 *   - EVERYTHING error-swallowed (try/catch -> no-op). Never throws to the caller.
 *
 * Two call surfaces:
 *   - runGroundedIdentityAsync(...) — FIRE-AND-FORGET for the upload callers
 *     (batchAnalyzeController, processRapidDraft). Never blocks the base response; patches
 *     the item when it lands.
 *   - resolveGroundedIdentityInline(...) — awaitable, for reanalyzeService (already async).
 */

import { prisma } from '../lib/prisma';
import { getVisionLabels } from './cloudAIService';
import {
  groundingEnabled,
  groundingTextEnabled,
  groundingVisualEnabled,
  groundingRolloutPct,
  groundingPerItemCeilingUsd,
  isGroundingCeilingExceeded,
  isGroundingDailyCapAvailable,
  trackGroundingCall,
} from '../lib/aiCostTracker';
import {
  resolveTextGroundedCandidate,
  resolveVisualCandidate,
  GROUNDING_VISUAL_VALUE_MODELS,
  GROUNDING_VISUAL_PREMIUM_MODELS,
  type GroundedCandidate,
} from './modelBakeoffService';

const ESCALATE_BELOW = (() => {
  const n = parseFloat(process.env.GROUNDING_ESCALATE_BELOW || '0.75');
  return Number.isNaN(n) ? 0.75 : n;
})();

// If an item ALREADY has a grounded winner at/above this confidence, re-analysis skips re-grounding.
const REGROUND_SKIP_ABOVE = (() => {
  const n = parseFloat(process.env.GROUNDING_REGROUND_SKIP_ABOVE || '0.85');
  return Number.isNaN(n) ? 0.85 : n;
})();

export interface BaseResultForGrounding {
  confidence?: number;
  brand?: string;
  title?: string;
  category?: string;
}

export interface GroundedIdentityInput {
  itemId: string;
  buffers: Buffer[];
  mimeTypes: string[];
  baseResult: BaseResultForGrounding;
  /** When false (test-image runs), never write to the item. Defaults to true. */
  persist?: boolean;
  /** When true (reanalyze), skip re-grounding if item already has a strong grounded winner. */
  skipIfAlreadyGrounded?: boolean;
}

export interface GroundedIdentityOutcome {
  ran: boolean;
  reason?: string;
  winner?: GroundedCandidate | null;
  applied?: Record<string, unknown>;
}

/** Cheap eligibility probe: does the item carry a distinctive-mark signal? brand empty but the
 *  PRIMARY photo has non-trivial detected text (a backstamp / model number / printed label). */
async function hasDistinctiveMarkSignal(
  buffers: Buffer[],
  mimeTypes: string[],
  brand?: string,
): Promise<boolean> {
  try {
    if (brand && brand.trim()) return false; // brand already known — not a "distinctive mark rescue"
    if (!buffers || buffers.length === 0) return false;
    const b64 = buffers[0].toString('base64');
    const { detectedText } = await getVisionLabels(b64); // Vision cost already tracked internally
    if (!detectedText || detectedText.length === 0) return false;
    const totalChars = detectedText.reduce((sum, t) => sum + (typeof t === 'string' ? t.trim().length : 0), 0);
    // "non-trivial" = at least a few characters of real on-item text.
    return totalChars >= 4;
  } catch {
    return false;
  }
}

/** Is this base result eligible for escalation at all? */
async function isEligible(input: GroundedIdentityInput): Promise<{ eligible: boolean; reason: string }> {
  const conf = typeof input.baseResult.confidence === 'number' ? input.baseResult.confidence : 0.5;
  if (conf < ESCALATE_BELOW) {
    return { eligible: true, reason: `low-confidence (${conf} < ${ESCALATE_BELOW})` };
  }
  const mark = await hasDistinctiveMarkSignal(input.buffers, input.mimeTypes, input.baseResult.brand);
  if (mark) return { eligible: true, reason: 'distinctive-mark (brand empty + detected text)' };
  return { eligible: false, reason: `high-confidence common item (conf ${conf} >= ${ESCALATE_BELOW}, no mark)` };
}

/**
 * Core orchestration. Returns the outcome. NEVER throws. Awaited by both entry points.
 */
async function orchestrate(input: GroundedIdentityInput): Promise<GroundedIdentityOutcome> {
  const { itemId, buffers, mimeTypes } = input;
  const persist = input.persist !== false;

  try {
    // ---- Layer 0: master + sub kill switches -----------------------------------
    if (!groundingEnabled()) return { ran: false, reason: 'GROUNDING_ENABLED off (Phase 0 no-op)' };
    const textOn = groundingTextEnabled();
    const visualOn = groundingVisualEnabled();
    if (!textOn && !visualOn) return { ran: false, reason: 'both sub-switches off' };
    if (!buffers || buffers.length === 0) return { ran: false, reason: 'no image buffers' };

    // ---- Re-analyze skip: already strongly grounded ----------------------------
    if (input.skipIfAlreadyGrounded) {
      try {
        const existing = await prisma.item.findUnique({
          where: { id: itemId },
          select: { groundedConfidence: true },
        });
        if (existing?.groundedConfidence != null && existing.groundedConfidence >= REGROUND_SKIP_ABOVE) {
          return { ran: false, reason: `already grounded (conf ${existing.groundedConfidence} >= ${REGROUND_SKIP_ABOVE})` };
        }
      } catch {
        // best-effort — proceed if the lookup fails
      }
    }

    // ---- Gate evaluation (one structured decision log per attempt) --------------
    // Each gate records a compact status token; we emit exactly ONE [grounding] gate
    // line — whether we RUN or SKIP — so the ramp is self-diagnosing (you can see at a
    // glance which gate stopped a grounding attempt). Gates short-circuit in cost order:
    // eligibility (free) -> monthly ceiling -> daily cap -> rollout roll.
    const elig = await isEligible(input);
    let ceilingTok = 'na';
    let dailyCapTok = 'na';
    let rolloutTok = 'na';
    let decision: 'RUN' | 'SKIP' = 'SKIP';
    let skipReason = elig.reason;

    const pct = groundingRolloutPct();

    if (!elig.eligible) {
      decision = 'SKIP';
      skipReason = `not-eligible: ${elig.reason}`;
    } else if (await isGroundingCeilingExceeded()) {
      ceilingTok = 'exceeded';
      decision = 'SKIP';
      skipReason = 'monthly ceiling exceeded';
    } else if (!(await isGroundingDailyCapAvailable())) {
      ceilingTok = 'ok';
      dailyCapTok = 'hit';
      decision = 'SKIP';
      skipReason = 'daily cap reached';
    } else if (pct <= 0) {
      ceilingTok = 'ok';
      dailyCapTok = 'ok';
      rolloutTok = 'skip 0%';
      decision = 'SKIP';
      skipReason = 'rollout 0%';
    } else if (Math.random() * 100 >= pct) {
      ceilingTok = 'ok';
      dailyCapTok = 'ok';
      rolloutTok = `skip ${pct}%`;
      decision = 'SKIP';
      skipReason = `outside ${pct}% rollout`;
    } else {
      ceilingTok = 'ok';
      dailyCapTok = 'ok';
      rolloutTok = `hit ${pct}%`;
      decision = 'RUN';
    }

    console.log(
      `[grounding] item=${itemId} gate ` +
        `enabled=t text=${textOn ? 't' : 'f'} visual=${visualOn ? 't' : 'f'} ` +
        `eligible=${elig.eligible ? 't' : 'f'}:${elig.reason} ` +
        `rollout=${rolloutTok} ceiling=${ceilingTok} dailyCap=${dailyCapTok} perItemBudget=ok ` +
        `-> ${decision}${decision === 'SKIP' ? `(${skipReason})` : ''}`,
    );

    if (decision === 'SKIP') {
      return { ran: false, reason: skipReason };
    }

    const perItemCeilingUsd = groundingPerItemCeilingUsd();
    const spend = { usd: 0 };
    const onCall = async (costUsd: number) => {
      try { await trackGroundingCall(costUsd); } catch { /* tracking best-effort */ }
    };

    // ---- COST CASCADE ----------------------------------------------------------
    // Tier 1 (VALUE): cheap text + cheap visual roster, run in parallel.
    const tier1Tasks: Promise<GroundedCandidate | null>[] = [];
    if (textOn) {
      tier1Tasks.push(
        resolveTextGroundedCandidate(itemId, buffers, mimeTypes, {
          premium: false,
          spend,
          perItemCeilingUsd,
          onCall,
        }),
      );
    }
    if (visualOn) {
      tier1Tasks.push(
        resolveVisualCandidate(itemId, buffers, mimeTypes, {
          models: GROUNDING_VISUAL_VALUE_MODELS,
          spend,
          perItemCeilingUsd,
          onCall,
        }),
      );
    }
    const tier1 = (await Promise.all(tier1Tasks)).filter((c): c is GroundedCandidate => !!c);

    let winner = pickWinner(tier1);

    // Tier 2 (PREMIUM): ONLY if Tier 1 produced no gated candidate.
    if (!winner) {
      console.log(`[grounding] item=${itemId} Tier 1 produced no candidate -> escalating to Tier 2 (PREMIUM)`);
      const tier2Tasks: Promise<GroundedCandidate | null>[] = [];
      if (textOn) {
        tier2Tasks.push(
          resolveTextGroundedCandidate(itemId, buffers, mimeTypes, {
            premium: true,
            spend,
            perItemCeilingUsd,
            onCall,
          }),
        );
      }
      if (visualOn) {
        tier2Tasks.push(
          resolveVisualCandidate(itemId, buffers, mimeTypes, {
            models: GROUNDING_VISUAL_PREMIUM_MODELS,
            spend,
            perItemCeilingUsd,
            onCall,
          }),
        );
      }
      const tier2 = (await Promise.all(tier2Tasks)).filter((c): c is GroundedCandidate => !!c);
      winner = pickWinner(tier2);
    }

    if (!winner) {
      console.log(
        `[grounding] item=${itemId} ran, no candidate passed 0.7 gate — base result kept ` +
          `(spend=$${spend.usd.toFixed(3)})`,
      );
      return { ran: true, reason: 'no gated winner', winner: null };
    }

    console.log(
      `[grounding] item=${itemId} WINNER identity="${winner.identity}" conf=${winner.confidence} ` +
        `source=${winner.source} spend=$${spend.usd.toFixed(3)}`,
    );

    // ---- Apply / persist -------------------------------------------------------
    const applied = await applyWinner(itemId, winner, input.baseResult, persist);
    return { ran: true, reason: 'winner applied', winner, applied };
  } catch (err: any) {
    console.log(`[grounding] item=${itemId} ORCHESTRATOR ERROR (non-fatal): ${err?.message || err}`);
    return { ran: false, reason: 'orchestrator error' };
  }
}

/** Winner = highest-confidence gated candidate; text-grounded wins ties (marks beat pixels). */
function pickWinner(candidates: GroundedCandidate[]): GroundedCandidate | null {
  if (!candidates.length) return null;
  let best: GroundedCandidate | null = null;
  for (const c of candidates) {
    if (!best) { best = c; continue; }
    if (c.confidence > best.confidence) { best = c; continue; }
    if (c.confidence === best.confidence && c.source === 'text-grounded' && best.source !== 'text-grounded') {
      best = c;
    }
  }
  return best;
}

/**
 * Derive the override TITLE from the grounded identity string (the part before the " — type"
 * suffix). Brand is NOT derived here — brand comes from the winner's dedicated clean brand
 * field (the mark-extraction manufacturer name), never from slicing this description phrase
 * (that produced the "Tupperware Cool" over-capture).
 */
function deriveTitle(identity: string): string {
  return identity.split(' — ')[0]?.trim() || identity.trim();
}

/**
 * Resolve the clean brand to override with. ONLY the winner's dedicated brand field is trusted —
 * a clean manufacturer name the extractor read off the item (e.g. "Tupperware"). If that is
 * missing (visual candidates, or no legible brand), return null so brand is left unchanged.
 * We deliberately never fall back to slicing the identity/product phrase.
 */
function deriveBrand(winner: GroundedCandidate): string | null {
  const b = typeof winner.brand === 'string' ? winner.brand.trim() : '';
  if (!b || b.toLowerCase() === 'unknown') return null;
  return b;
}

/**
 * Override rule + persistence. Overwrites title/brand ONLY when unedited by the organizer;
 * NEVER price; never condition/category. Always persists groundedIdentity/-Confidence/-Source.
 */
async function applyWinner(
  itemId: string,
  winner: GroundedCandidate,
  baseResult: BaseResultForGrounding,
  persist: boolean,
): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {
    groundedIdentity: winner.identity,
    groundedConfidence: winner.confidence,
    groundedSource: winner.source,
  };

  if (!persist) {
    console.log(`[grounding] item=${itemId} persist=false (test-image run) — not writing`);
    return data;
  }

  try {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { userEditedFields: true, title: true, brand: true, category: true },
    });
    if (!item) {
      console.log(`[grounding] item=${itemId} apply: item not found`);
      return {};
    }
    const edited = item.userEditedFields ?? [];
    const groundedTitle = deriveTitle(winner.identity);
    const groundedBrand = deriveBrand(winner); // clean manufacturer name, or null

    // title — overwrite only if organizer hasn't edited it.
    if (!edited.includes('title') && groundedTitle) {
      data.title = groundedTitle;
    }
    // brand — overwrite only if organizer hasn't edited it AND base brand is empty (mark rescue).
    // groundedBrand is a clean manufacturer name (or null); never a phrase from the description.
    if (!edited.includes('brand') && !item.brand && groundedBrand) {
      data.brand = groundedBrand;
    }
    // category — deliberately NOT overridden from the grounded string (we never invent a category).
    void baseResult;

    await prisma.item.update({ where: { id: itemId }, data });
    console.log(
      `[grounding] item=${itemId} applied: ${Object.keys(data).join(', ')}` +
        `${edited.length ? ` (respected userEditedFields: ${edited.join(',')})` : ''}`,
    );
    return data;
  } catch (err: any) {
    console.log(`[grounding] item=${itemId} apply ERROR (non-fatal): ${err?.message || err}`);
    return {};
  }
}

/**
 * FIRE-AND-FORGET entry point for the UPLOAD callers. Never awaited by the response path — kicks
 * off orchestration and returns immediately. Any error is swallowed. When a winner lands it has
 * already patched the item row (the review card picks it up on its next refetch).
 */
export function runGroundedIdentityAsync(input: GroundedIdentityInput): void {
  // Cheap synchronous gate so we don't even schedule work when the master switch is off.
  if (!groundingEnabled()) return;
  void orchestrate(input).catch((err: any) => {
    console.log(`[grounding] item=${input.itemId} async invocation error (non-fatal): ${err?.message || err}`);
  });
}

/**
 * AWAITABLE entry point for reanalyzeService (already async). Returns the outcome so the caller
 * can surface it. Never throws.
 */
export async function resolveGroundedIdentityInline(
  input: GroundedIdentityInput,
): Promise<GroundedIdentityOutcome> {
  if (!groundingEnabled()) return { ran: false, reason: 'GROUNDING_ENABLED off (Phase 0 no-op)' };
  try {
    return await orchestrate(input);
  } catch (err: any) {
    console.log(`[grounding] item=${input.itemId} inline invocation error (non-fatal): ${err?.message || err}`);
    return { ran: false, reason: 'inline error' };
  }
}
