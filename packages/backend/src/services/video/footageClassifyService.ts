/**
 * footageClassifyService.ts — ADR-080 §5.4 / §6 / §10.
 *
 * BATCH-LEVEL CLASSIFICATION (understanding stage — NO rendering; that is the
 * separate render stage, see the TODO handoff at the bottom). Given a SEALED
 * FootageBatch, this service:
 *   1. Analyzes every clip -> ClipAnalysis[] (clipAnalysisService.analyzeBatch).
 *   2. FORMAT INFERENCE (ADR-080 §10): a deterministic content-signature score of
 *      the batch's role histogram + caption patterns against every Template in
 *      templates/index.ts, with a Claude Haiku tiebreak ONLY when the top two are
 *      within 0.15 (keeps cost near-zero — most batches resolve on rules alone).
 *   3. CONFIDENCE GATE (ADR-080 §6): per-clip role gate (assemble >=0.75, flag
 *      0.50-0.75, ambiguous <0.50) + batch format gate (assemble >=0.70). Never
 *      auto-ships a guess; when either gate is unmet it stages exactly ONE
 *      targeted, highest-leverage question and moves the batch to NEEDS_INPUT.
 *
 * On the happy path the batch is set to ASSEMBLING (classified, ready for the
 * render stage) with templateId + templateConfidence recorded. On any unrecoverable
 * error the batch is set to FAILED (raw footage retained regardless — ADR-080 §7).
 *
 * WIRING: footageIngestService.sealStaleFootageBatches() triggers classifyBatch()
 * fire-and-forget after a successful seal, failure-isolated so a classify error can
 * never crash the seal cron.
 */

import axios from 'axios';

import { prisma } from '../../lib/prisma';
import { createNotification } from '../notificationService';
import { analyzeBatch, type ClipAnalysis, type ClipRole } from './clipAnalysisService';
import { ALL_TEMPLATES, TEMPLATES_BY_ID, type Template } from './templates';
import { renderBatch } from './templateRenderer';
import {
  trackAITokens,
  estimateTokensForRequest,
  isAICostCeilingExceeded,
  recordApiUsage,
  ANTHROPIC_COST_PER_M_TOKENS,
} from '../../lib/aiCostTracker';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// ADR-080 §6 thresholds (env-tunable per §11 decision #4).
function num(envName: string, def: number): number {
  const raw = process.env[envName];
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : def;
}
const CLIP_ASSEMBLE_THRESHOLD = num('FOOTAGE_CLIP_ASSEMBLE_THRESHOLD', 0.75);
const CLIP_AMBIGUOUS_THRESHOLD = num('FOOTAGE_CLIP_AMBIGUOUS_THRESHOLD', 0.5);
const BATCH_FORMAT_THRESHOLD = num('FOOTAGE_FORMAT_THRESHOLD', 0.7);
const LLM_TIEBREAK_MARGIN = num('FOOTAGE_FORMAT_TIEBREAK_MARGIN', 0.15);

// ---------------------------------------------------------------------------
// Format inference (ADR-080 §10) — content-signature scoring.
// ---------------------------------------------------------------------------

export interface TemplateInference {
  templateId: string;
  confidence: number; // normalized top-vs-runner-up margin (0-1) -> §6.2 gate
  rationale: string;
  scores: Record<string, number>;
}

function roleHistogram(analyses: ClipAnalysis[]): Record<ClipRole, number> {
  const hist = {
    HOOK: 0, FIND: 0, PRICE_REVEAL: 0, BEFORE: 0, AFTER: 0, MAP: 0, STYLING: 0, CTA: 0, UNKNOWN: 0,
  } as Record<ClipRole, number>;
  for (const a of analyses) hist[a.role] = (hist[a.role] ?? 0) + 1;
  return hist;
}

function distinctSaleOrdinals(analyses: ClipAnalysis[]): number {
  const s = new Set<number>();
  for (const a of analyses) if (typeof a.facts.saleOrdinal === 'number') s.add(a.facts.saleOrdinal);
  return s.size;
}

function hasPricePairs(analyses: ClipAnalysis[]): boolean {
  // "Paid $X / Resale $Y" -> a PRICE_REVEAL clip carrying >=2 prices.
  return analyses.some((a) => a.role === 'PRICE_REVEAL' && a.facts.prices.length >= 2);
}

function beforeAfterPairPresent(analyses: ClipAnalysis[]): boolean {
  return analyses.some((a) => a.role === 'BEFORE') && analyses.some((a) => a.role === 'AFTER');
}

/**
 * Score one template's SignatureRule against the batch. Returns a raw non-negative
 * score. A missing REQUIRED role is a hard disqualifier (score 0) — a batch with no
 * MAP clip cannot be Season E, etc.
 */
function scoreTemplate(t: Template, analyses: ClipAnalysis[]): number {
  const sig = t.contentSignature;
  const hist = roleHistogram(analyses);
  const total = analyses.length || 1;
  const allCaptions = analyses.flatMap((a) => a.rawCaptions.map((c) => c.toLowerCase()));
  const captionBlob = allCaptions.join(' ');

  // Hard requirement: every requiredRole must be present at least once.
  if (sig.requiredRoles) {
    for (const r of sig.requiredRoles) {
      if ((hist[r] ?? 0) === 0) return 0;
    }
  }

  let score = sig.priorWeight ?? 0.3;

  // boostRoles present raise the score.
  for (const r of sig.boostRoles ?? []) {
    if ((hist[r] ?? 0) > 0) score += 0.25;
  }

  // roleFractionMin gates (e.g. E: MAP >= 0.6).
  if (sig.roleFractionMin) {
    for (const [role, minFrac] of Object.entries(sig.roleFractionMin)) {
      const frac = (hist[role as ClipRole] ?? 0) / total;
      if (frac >= (minFrac as number)) score += 0.6;
      else score -= 0.4; // strongly against if the dominant-role signature is unmet
    }
  }

  // caption hint substrings.
  let hintHits = 0;
  for (const hint of sig.captionHints ?? []) {
    if (captionBlob.includes(hint.toLowerCase())) hintHits++;
  }
  score += Math.min(hintHits, 4) * 0.2;

  if (sig.requiresBeforeAfterPair) {
    score += beforeAfterPairPresent(analyses) ? 0.5 : -0.4;
  }
  if (sig.requiresPricePairs) {
    score += hasPricePairs(analyses) ? 0.5 : -0.2;
  }
  if (typeof sig.minDistinctSales === 'number') {
    score += distinctSaleOrdinals(analyses) >= sig.minDistinctSales ? 0.3 : 0;
  }
  if (sig.screenRecordDominant) {
    const srFrac = analyses.filter((a) => a.facts.isScreenRecording).length / total;
    score += srFrac >= 0.5 ? 0.4 : -0.2;
  }

  return Math.max(0, score);
}

async function llmTiebreak(
  analyses: ClipAnalysis[],
  candidates: { template: Template; score: number }[]
): Promise<string | null> {
  if (!ANTHROPIC_API_KEY || (await isAICostCeilingExceeded())) return null;

  const hist = roleHistogram(analyses);
  const topCaptions = analyses.flatMap((a) => a.rawCaptions).slice(0, 25);
  const options = candidates.map((c) => ({ id: c.template.id, name: c.template.displayName }));
  const prompt = `You pick which social-video FORMAT best fits a batch of clips, using ONLY the evidence below. Do not invent evidence.

Role histogram: ${JSON.stringify(hist)}
On-screen captions seen (sample): ${JSON.stringify(topCaptions)}

Choose the single best-fitting format id from these candidates:
${JSON.stringify(options, null, 2)}

Respond with ONLY valid JSON: {"templateId":"<one id from the list>"}`;

  try {
    const estimatedTokens = estimateTokensForRequest(prompt, false);
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: ANTHROPIC_MODEL, max_tokens: 80, messages: [{ role: 'user', content: prompt }] },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 20000,
      }
    );
    const content: string = response.data.content?.[0]?.text ?? '';
    await trackAITokens(estimatedTokens + Math.ceil(content.length / 4) + 20);
    await recordApiUsage('anthropic:video_pipeline', (estimatedTokens + Math.ceil(content.length / 4) + 20) / 1_000_000 * ANTHROPIC_COST_PER_M_TOKENS);
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());
    const id = parsed?.templateId;
    return candidates.some((c) => c.template.id === id) ? id : null;
  } catch (err: any) {
    console.warn('[footageClassify] LLM format tiebreak failed — using rule winner:', err?.message ?? err);
    return null;
  }
}

/**
 * ADR-080 §10 format inference. Deterministic rule score first; Haiku tiebreak
 * ONLY when the top two are within LLM_TIEBREAK_MARGIN. `confidence` is the
 * normalized top-vs-runner-up margin fed to the §6.2 batch gate.
 */
export async function inferTemplate(analyses: ClipAnalysis[]): Promise<TemplateInference> {
  const scored = ALL_TEMPLATES.map((t) => ({ template: t, score: scoreTemplate(t, analyses) }))
    .sort((a, b) => b.score - a.score);

  const scores: Record<string, number> = {};
  for (const s of scored) scores[s.template.id] = Number(s.score.toFixed(3));

  const top = scored[0];
  const runnerUp = scored[1];
  const topScore = top?.score ?? 0;
  const runnerScore = runnerUp?.score ?? 0;

  // Normalized margin in 0-1. If nothing scored (all zero) confidence is 0.
  const confidence = topScore > 0 ? Math.max(0, Math.min(1, (topScore - runnerScore) / topScore)) : 0;

  let chosenId = top?.template.id ?? ALL_TEMPLATES[0].id;
  let rationale = `Rule score selected ${chosenId} (score ${topScore.toFixed(2)} vs runner-up ${runnerScore.toFixed(2)}).`;

  // Tiebreak only when the two leaders are genuinely close AND both plausible.
  if (top && runnerUp && topScore > 0 && topScore - runnerScore < LLM_TIEBREAK_MARGIN) {
    const pick = await llmTiebreak(analyses, [top, runnerUp]);
    if (pick) {
      chosenId = pick;
      rationale = `Rule scores were close (${topScore.toFixed(2)} vs ${runnerScore.toFixed(2)}); language-model tiebreak chose ${chosenId}.`;
    }
  }

  return { templateId: chosenId, confidence: Number(confidence.toFixed(3)), rationale, scores };
}

// ---------------------------------------------------------------------------
// Confidence gate (ADR-080 §6) + question staging.
// ---------------------------------------------------------------------------

interface GateDecision {
  status: 'ASSEMBLING' | 'NEEDS_INPUT';
  question?: string;
  questionField?: string;
}

function ambiguousClips(analyses: ClipAnalysis[]): ClipAnalysis[] {
  return analyses.filter((a) => a.roleConfidence < CLIP_AMBIGUOUS_THRESHOLD);
}

function softClips(analyses: ClipAnalysis[]): ClipAnalysis[] {
  return analyses.filter(
    (a) => a.roleConfidence >= CLIP_AMBIGUOUS_THRESHOLD && a.roleConfidence < CLIP_ASSEMBLE_THRESHOLD
  );
}

/**
 * Decide the batch outcome per ADR-080 §6.3. Highest-leverage ambiguity first:
 * format > individual clip role. Exactly ONE question, ever.
 */
function decideGate(analyses: ClipAnalysis[], inference: TemplateInference): GateDecision {
  const ambiguous = ambiguousClips(analyses);
  const formatOk = inference.confidence >= BATCH_FORMAT_THRESHOLD;

  // Happy path: format confident AND no genuinely-ambiguous clip.
  if (formatOk && ambiguous.length === 0) {
    return { status: 'ASSEMBLING' };
  }

  // Otherwise stage exactly ONE question, resolving the highest-leverage ambiguity.
  // Format first — resolving it usually disambiguates the clips (§6.3).
  if (!formatOk) {
    const top = TEMPLATES_BY_ID[inference.templateId];
    // Present the top-two candidates as the choice.
    const sortedIds = Object.entries(inference.scores).sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const a = TEMPLATES_BY_ID[sortedIds[0]] ?? top;
    const b = TEMPLATES_BY_ID[sortedIds[1]];
    const optionA = a?.displayName ?? sortedIds[0];
    const optionB = b?.displayName ?? sortedIds[1] ?? 'a different format';
    return {
      status: 'NEEDS_INPUT',
      question: `This shoot could be "${optionA}" or "${optionB}". Which is it?  [${optionA}] [${optionB}]`,
      questionField: 'batch.templateId',
    };
  }

  // Format is fine but one or more clips are ambiguous — ask about the single most
  // ambiguous clip (lowest confidence). (Per §6.3, even with >=2 ambiguous clips we
  // ask ONE question and re-run the gate after the answer.)
  const worst = [...ambiguous].sort((x, y) => x.roleConfidence - y.roleConfidence)[0];
  const capHint = worst.rawCaptions[0] ? ` (caption "${worst.rawCaptions[0]}")` : '';
  return {
    status: 'NEEDS_INPUT',
    question: `Clip ${worst.ordering.uploadIndex + 1}${capHint} — what is this clip showing? We could not read it confidently.`,
    questionField: `assetId:${worst.assetId}.role`,
  };
}

// ---------------------------------------------------------------------------
// classifyBatch — the entry point wired to the seal sweep.
// ---------------------------------------------------------------------------

/**
 * Alert every ADMIN user the moment a batch needs a human -- either a staged
 * question (NEEDS_INPUT) or an unrecoverable error (FAILED). Added 2026-07-13:
 * before this, the ONLY way to discover a blocked batch was to poll
 * GET /api/admin/video-pipeline/footage-batch/needs-input by hand -- a batch
 * could sit silently forever with zero signal to anyone. Fire-and-forget and
 * failure-isolated (matches createNotification's own graceful-degradation
 * contract): a notification failure must never fail classification.
 *
 * No admin UI page exists yet for this route (API-only, curl/fetch), so the
 * notification link is intentionally omitted rather than pointing at a 404 --
 * the batch id is in the body text so it can be looked up directly.
 */
async function notifyAdminsBatchNeedsAttention(
  batchId: string,
  kind: 'NEEDS_INPUT' | 'FAILED',
  question?: string,
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { OR: [{ roles: { has: 'ADMIN' } }, { role: 'ADMIN' }] },
      select: { id: true },
    });
    if (admins.length === 0) {
      console.warn(`[footageClassify] No ADMIN users found -- batch ${batchId} (${kind}) has no one to notify`);
      return;
    }
    const title = kind === 'FAILED' ? 'Video batch failed' : 'Video batch needs your input';
    const body =
      kind === 'FAILED'
        ? `Footage batch ${batchId} hit an unrecoverable error during classification. Check Railway logs.`
        : `Footage batch ${batchId}: ${question ?? 'a question is staged'}. Answer via POST /api/admin/video-pipeline/footage-batch/${batchId}/answer.`;
    await Promise.all(
      admins.map((a) => createNotification(a.id, 'video_batch_attention', title, body, undefined, 'OPERATIONAL')),
    );
  } catch (err: any) {
    console.warn(`[footageClassify] Failed to notify admins for batch ${batchId} (${kind}):`, err?.message ?? err);
  }
}


export interface ClassifyBatchResult {
  batchId: string;
  status: 'ASSEMBLING' | 'NEEDS_INPUT' | 'FAILED' | 'SKIPPED';
  templateId?: string;
  templateConfidence?: number;
  question?: string;
  clipCount: number;
  ambiguousCount: number;
  softCount: number;
}

/**
 * Analyze + format-infer + gate a SEALED batch. Guarded SEALED -> ANALYZING
 * transition (idempotent: a second concurrent trigger sees a non-SEALED batch and
 * skips). Sets ASSEMBLING (ready for render) or NEEDS_INPUT (one question), or
 * FAILED on an unrecoverable error. Raw footage is NEVER deleted here (ADR-080 §7).
 */
export async function classifyBatch(batchId: string): Promise<ClassifyBatchResult> {
  // Guarded claim: only a SEALED batch may enter analysis, and only once.
  const claimed = await prisma.footageBatch.updateMany({
    where: { id: batchId, status: 'SEALED' },
    data: { status: 'ANALYZING' },
  });
  if (claimed.count !== 1) {
    const current = await prisma.footageBatch.findUnique({ where: { id: batchId }, select: { status: true } });
    console.log(`[footageClassify] Batch ${batchId} not claimable for analysis (status=${current?.status ?? 'MISSING'}) — skipping`);
    return { batchId, status: 'SKIPPED', clipCount: 0, ambiguousCount: 0, softCount: 0 };
  }

  // TEMPLATE LOCK (2026-07-13, real bug found via live test): read whatever
  // templateId/templateConfidence is already on the row BEFORE doing any fresh
  // inference. If it's already locked at confidence 1.0 -- because a human
  // answered the 'batch.templateId' question (routes/videoPipelineAdmin.ts sets
  // templateConfidence:1.0 there) or an earlier pass hit an unambiguous
  // auto-detection -- inferTemplate() below is skipped entirely and this value
  // is reused as-is. Before this fix, inferTemplate() recomputed from scratch on
  // EVERY call with zero awareness of anything a human had just confirmed, so a
  // human's answer to the template question was written to the DB and then
  // immediately thrown away by the very next line -- the batch re-asked the
  // identical question forever. This mirrors the identical-shape fix already
  // applied to analyzeBatch() (clipAnalysisService.ts) for per-clip roles.
  const lockedTemplate = await prisma.footageBatch.findUnique({
    where: { id: batchId },
    select: { templateId: true, templateConfidence: true },
  });

  try {
    const analyses = await analyzeBatch(batchId);

    if (analyses.length === 0) {
      // A sealed-but-empty batch should not exist (ingest guards it), but never
      // silently proceed — surface it as a question rather than assemble nothing.
      await prisma.footageBatch.update({
        where: { id: batchId },
        data: {
          status: 'NEEDS_INPUT',
          openQuestion: 'This shoot has no analyzable clips. Re-upload the footage or reject this batch.',
          questionField: 'batch.footage',
        },
      });
      await notifyAdminsBatchNeedsAttention(batchId, 'NEEDS_INPUT', 'no analyzable clips');
      return { batchId, status: 'NEEDS_INPUT', question: 'no analyzable clips', clipCount: 0, ambiguousCount: 0, softCount: 0 };
    }

    const inference: TemplateInference =
      lockedTemplate?.templateId && lockedTemplate.templateConfidence === 1.0
        ? {
            templateId: lockedTemplate.templateId,
            confidence: 1.0,
            rationale: 'Template locked at confidence 1.0 (human-confirmed answer, or a prior unambiguous auto-detection) -- format inference skipped so it can never be silently overwritten.',
            scores: { [lockedTemplate.templateId]: 1.0 },
          }
        : await inferTemplate(analyses);
    const decision = decideGate(analyses, inference);
    const ambiguous = ambiguousClips(analyses);
    const soft = softClips(analyses);

    if (decision.status === 'ASSEMBLING') {
      await prisma.footageBatch.update({
        where: { id: batchId },
        data: {
          status: 'ASSEMBLING',
          templateId: inference.templateId,
          templateConfidence: inference.confidence,
          openQuestion: null,
          questionField: null,
          reviewNotes: inference.rationale,
        },
      });
      console.log(
        `[footageClassify] Batch ${batchId} CLASSIFIED -> ${inference.templateId} ` +
          `(format conf ${inference.confidence}, ${analyses.length} clips, ${soft.length} soft-flagged). Ready for render stage.`
      );
      // RENDER STAGE (ADR-080 §9 — templateRenderer.ts). The batch is fully
      // classified and ready to render. Trigger the render fire-and-forget AND
      // failure-isolated: renderBatch never throws (on any error it sets the batch
      // to FAILED + logs), so a render failure can never crash this classify path.
      // It loads templateId + the persisted ClipAnalysis[], runs slot-fill (§9.2),
      // assembles the finished 9:16 cut on the proven ffmpeg engine, creates the
      // VideoJob, sets FootageBatch.videoJobId, stages the review markdown, and
      // moves the batch -> AWAITING_REVIEW (or NEEDS_INPUT on missing required footage).
      void renderBatch(batchId).catch((e) =>
        console.error(`[footageClassify] renderBatch trigger error for ${batchId} (isolated):`, e?.message ?? e),
      );
      return {
        batchId,
        status: 'ASSEMBLING',
        templateId: inference.templateId,
        templateConfidence: inference.confidence,
        clipCount: analyses.length,
        ambiguousCount: ambiguous.length,
        softCount: soft.length,
      };
    }

    // NEEDS_INPUT — record templateConfidence for visibility even though we ask.
    await prisma.footageBatch.update({
      where: { id: batchId },
      data: {
        status: 'NEEDS_INPUT',
        templateId: inference.templateId,
        templateConfidence: inference.confidence,
        openQuestion: decision.question,
        questionField: decision.questionField,
        reviewNotes: inference.rationale,
      },
    });
    console.log(
      `[footageClassify] Batch ${batchId} NEEDS_INPUT — one question staged (${decision.questionField}): ${decision.question}`
    );
    await notifyAdminsBatchNeedsAttention(batchId, 'NEEDS_INPUT', decision.question);
    return {
      batchId,
      status: 'NEEDS_INPUT',
      templateId: inference.templateId,
      templateConfidence: inference.confidence,
      question: decision.question,
      clipCount: analyses.length,
      ambiguousCount: ambiguous.length,
      softCount: soft.length,
    };
  } catch (err: any) {
    console.error(`[footageClassify] Batch ${batchId} analysis FAILED:`, err?.message ?? err);
    // Best-effort: mark FAILED (raw footage retained regardless — §7). If even this
    // write fails, the error propagates to the fire-and-forget caller's catch.
    await prisma.footageBatch
      .update({ where: { id: batchId }, data: { status: 'FAILED', reviewNotes: `Analysis error: ${err?.message ?? String(err)}`.slice(0, 1000) } })
      .catch((e) => console.error(`[footageClassify] Could not mark batch ${batchId} FAILED:`, e?.message ?? e));
    await notifyAdminsBatchNeedsAttention(batchId, 'FAILED');
    return { batchId, status: 'FAILED', clipCount: 0, ambiguousCount: 0, softCount: 0 };
  }
}
