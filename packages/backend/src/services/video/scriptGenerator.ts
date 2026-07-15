/**
 * scriptGenerator.ts — ADR-078 Wave 2b (Video Content Pipeline, TUTORIAL purpose only)
 *
 * Generates a narration script + YouTube-Search-optimized title/description for a
 * single TUTORIAL-purpose VideoJob (VideoTriggerType.GUIDE_LIBRARY). Per the ADR's
 * "Revised Phase 1 pilot scope" and its Addendum, this module intentionally does NOT
 * implement the ATTENTION (hook-driven, discovery-feed) template — that is Phase 3,
 * built once a discovery-feed platform (TikTok most likely) is actually live. PROMO
 * scripting (sale-triggered, Phase 2) is also out of scope here.
 *
 * Reuses the exact Claude Haiku call shape already locked in cloudAIService.ts
 * (same model env var, same axios + Anthropic Messages API call, same JSON-fence
 * stripping, same cost tracking via aiCostTracker.ts) rather than inventing a second
 * AI-calling convention — ADR-078 explicitly requires "matches the locked
 * Vision->Haiku AI chain for cost consistency."
 *
 * Grounding (hard constraint — see buildSystemPrompt below): the script, title, and
 * description may reference ONLY facts present in `groundedFacts`. No invented
 * numbers, prices, addresses, screen names, or claims. This mirrors the existing
 * "Do NOT make up specific items or prices — only reference what's provided" rule
 * already enforced in cloudAIService.ts's generateSaleDescription(), and the
 * "no invented figure" / "one real, specific, named detail... not a generic claim"
 * rule from claude_docs/marketing/media-pipeline-build-spec.md §2.1 (the
 * findasale-social-content task prompt).
 *
 * Brand voice (no "AI" in copy, no founder voice, no em dash, sign nothing with a
 * first name) is sourced verbatim from claude_docs/brand/brand-voice-system.md
 * Part 2 (Banned Words & Phrases, Banned Formatting) and the anti-detection
 * constraints listed in claude_docs/marketing/media-pipeline-build-spec.md §2.1:
 * "vary sentence length, no banned words, no em dash, no rule-of-three crutch,
 * sign nothing with a first name."
 */

import axios from 'axios';
import { trackAITokens, estimateTokensForRequest, isAICostCeilingExceeded, ANTHROPIC_COST_PER_M_TOKENS, recordApiUsage, recordAnthropicUsageOrEstimate } from '../../lib/aiCostTracker';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

/** Input for a single TUTORIAL-purpose script generation call. */
export interface TutorialScriptInput {
  /** Guide-library topic slug, e.g. "rapidfire-mode" — maps to VideoJob.guideTopic
   *  and to a row in claude_docs/strategy/guide-and-video-library-plan.md §4.3. */
  guideTopic: string;
  /** Real, verified facts about the topic ONLY — e.g. actual screen/button names,
   *  actual workflow steps, actual UI copy. Never invented by this function; the
   *  caller (assetCuration.ts / videoJobOrchestrator.ts) is responsible for
   *  populating this from real product content before calling here. */
  groundedFacts: Record<string, unknown>;
}

export interface TutorialScriptResult {
  scriptText: string;
  titleSuggestion: string;
  descriptionSuggestion: string;
  /** Estimated spend for this single generation call, in cents — feeds VideoJob.costCents
   *  (ADR-078: "costCents tracking is mandatory on every VideoJob... budget visibility
   *  from day one"). Uses the same $/1M-token rate aiCostTracker.ts already applies to
   *  the shared monthly ceiling, so this is consistent with that number, not a second
   *  independent estimate. */
  costCents: number;
}

/** Strip em dashes as a defensive backstop to the prompt instruction — brand-voice-
 *  system.md Part 2 "Banned Formatting" bans em dash fleet-wide (blog, UI, email,
 *  social) because it reads as an AI-written tell; a video script is customer-
 *  facing copy same as any of those. Replaces with a comma, matching one of the
 *  guide's own suggested substitutes ("a comma... vary it like a human editor"). */
function stripBannedFormatting(text: string): string {
  return text.replace(/—/g, ', ').replace(/ {2,}/g, ' ').trim();
}

/** Code-level backstop for the "never say AI/Artificial Intelligence" brand rule —
 *  the prompt already instructs this, but per the Wave 2 code review this had no
 *  verification, only prompt reliance. Throws (does not silently strip) so the
 *  orchestrator can hold/retry the job rather than ship a brand-voice violation,
 *  matching this module's existing "throw rather than fake" philosophy. */
function assertBrandVoiceCompliant(result: TutorialScriptResult): void {
  const combined = `${result.scriptText} ${result.titleSuggestion} ${result.descriptionSuggestion}`;
  const bannedPatterns = [/\bAI\b/, /\bartificial intelligence\b/i];
  for (const pattern of bannedPatterns) {
    if (pattern.test(combined)) {
      const err = new Error('BRAND_VOICE_VIOLATION: generated content mentions "AI"/"Artificial Intelligence", banned brand-wide per brand-voice-system.md Part 2');
      (err as any).errorCode = 'BRAND_VOICE_VIOLATION';
      throw err;
    }
  }
}

function buildSystemPrompt(input: TutorialScriptInput): string {
  const factsJson = JSON.stringify(input.groundedFacts, null, 2);

  return `You are writing a TUTORIAL (how-to) video narration script for FindA.Sale's official YouTube channel, plus its title and description.

GROUNDING — HARD CONSTRAINT: You may reference ONLY the facts given below in GROUNDED FACTS. Do not invent, assume, or recall from general knowledge any button label, screen name, workflow step, number, price, date, or claim that is not present in GROUNDED FACTS. If a detail is not in GROUNDED FACTS, do not mention it at all rather than guessing — omission is always correct, invention is never correct. This is the same rule already enforced for FindA.Sale sale descriptions and social copy: only state what's actually provided.

Topic: "${input.guideTopic}"

GROUNDED FACTS (JSON, the ONLY source of truth for this script):
${factsJson}

TUTORIAL purpose requirements (this is search-intent content, not a discovery-feed hook):
- Front-load a clearly stated topic in the first line of the script — the viewer and YouTube's search index should both understand within one sentence exactly what this video teaches. No cold-open hook, no withheld payoff.
- Measured, calm pace — this is instructional narration, not a fast-cut attention-grab clip.
- End with a natural next-step the viewer can take in the product (grounded in GROUNDED FACTS only).
- Title and description are written for YouTube Search (keyword clarity, matches how someone would actually type the question), NOT for the suggested/discovery feed. Use plain, specific, searchable language a FindA.Sale organizer would type — not a curiosity hook.

Brand voice (mandatory, sourced from claude_docs/brand/brand-voice-system.md):
- Never use the word "AI" or "Artificial Intelligence" anywhere in the script, title, or description. If a feature is AI-powered, describe it as "Smart," "Auto," or simply describe what it does — never name the mechanism.
- No founder voice. Never say "I" or use a personal name. Write as "we," "FindA.Sale," or "The FindA.Sale Team."
- No hype words: "disrupting," "game-changer," "unlock," "exclusive," "optimize," "leverage," "synergy," vague urgency like "act now."
- No em dash character anywhere in any field. Use a period, comma, or colon instead.
- Vary sentence length (anti-detection constraint from the findasale-social skill draft, claude_docs/marketing/media-pipeline-build-spec.md §2.1) — do not fall into a mechanical short-short-short rule-of-three cadence.
- Warm, practical, honest tone (Helpful / Honest / Practical voice pillars) — concrete outcomes, no fluff.

Respond with ONLY valid JSON (no markdown, no explanation), in exactly this shape:
{
  "scriptText": "full narration script as plain spoken text",
  "titleSuggestion": "YouTube Search optimized title",
  "descriptionSuggestion": "1-3 sentence YouTube description, keyword-clear"
}`;
}

/**
 * Generate a TUTORIAL-purpose narration script + search-optimized title/description
 * for a GUIDE_LIBRARY VideoJob. Grounded strictly in the facts passed in.
 *
 * Throws (does not silently degrade) when the API is unavailable, rate-limited,
 * over the shared AI cost ceiling, or returns unparsable output — this content
 * feeds a human-review gate (AWAITING_REVIEW), so a fabricated fallback script
 * would be worse than a visible failure the orchestrator can retry/hold on.
 * Mirrors the errorCode-tagged throw pattern already used in cloudAIService.ts's
 * getHaikuAnalysis().
 */
export async function generateTutorialScript(input: TutorialScriptInput): Promise<TutorialScriptResult> {
  if (!ANTHROPIC_API_KEY) {
    const err = new Error('AI_UNAVAILABLE: ANTHROPIC_API_KEY not configured');
    (err as any).errorCode = 'AI_UNAVAILABLE';
    throw err;
  }

  // Shared $/mo Haiku ceiling (aiCostTracker.ts) — same budget line as the image-
  // tagging AI chain, per ADR-078's "cost consistency" requirement. Checked
  // pre-flight rather than degraded silently, since this content is never posted
  // without a human approving it anyway (AWAITING_REVIEW gate).
  if (await isAICostCeilingExceeded()) {
    const err = new Error('AI_COST_CEILING_EXCEEDED: monthly AI cost ceiling reached');
    (err as any).errorCode = 'AI_COST_CEILING_EXCEEDED';
    throw err;
  }

  const systemPrompt = buildSystemPrompt(input);
  const estimatedTokens = estimateTokensForRequest(systemPrompt, false);

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 800,
        messages: [
          {
            role: 'user',
            content: systemPrompt,
          },
        ],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const content: string = response.data.content?.[0]?.text ?? '';

    const responseTokens = Math.ceil(content.length / 4) + 50; // estimate fallback + costCents display
    // Fix A: record REAL per-model usage (estimate fallback when usage absent).
    await recordAnthropicUsageOrEstimate('anthropic:video_pipeline', ANTHROPIC_MODEL, response.data.usage, estimatedTokens + responseTokens);

    const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as TutorialScriptResult;

    if (!parsed.scriptText || !parsed.titleSuggestion || !parsed.descriptionSuggestion) {
      const err = new Error('AI_PARSE_ERROR: Haiku response missing required fields');
      (err as any).errorCode = 'AI_PARSE_ERROR';
      throw err;
    }

    const costCents = Math.round(((estimatedTokens + responseTokens) / 1_000_000) * ANTHROPIC_COST_PER_M_TOKENS * 100);

    const result: TutorialScriptResult = {
      scriptText: stripBannedFormatting(parsed.scriptText),
      titleSuggestion: stripBannedFormatting(parsed.titleSuggestion),
      descriptionSuggestion: stripBannedFormatting(parsed.descriptionSuggestion),
      costCents,
    };

    assertBrandVoiceCompliant(result);

    return result;
  } catch (error: any) {
    if (error?.errorCode) throw error; // already tagged above (AI_PARSE_ERROR)

    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      const err = new Error('AI_TIMEOUT: AI service connection failed');
      (err as any).errorCode = 'AI_TIMEOUT';
      throw err;
    }
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      const err = new Error('AI_TIMEOUT: AI service timed out');
      (err as any).errorCode = 'AI_TIMEOUT';
      throw err;
    }
    if (error.response?.status === 429) {
      const err = new Error('AI_RATE_LIMIT: AI service busy — try again shortly');
      (err as any).errorCode = 'AI_RATE_LIMIT';
      throw err;
    }
    if (error instanceof SyntaxError || error.message?.includes('JSON')) {
      const err = new Error('AI_PARSE_ERROR: AI returned invalid data');
      (err as any).errorCode = 'AI_PARSE_ERROR';
      throw err;
    }
    const err = new Error('AI_ERROR: video script generation unavailable');
    (err as any).errorCode = 'AI_ERROR';
    throw err;
  }
}
