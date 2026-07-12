/**
 * engagementReplyDrafter.ts — Haiku-drafted reply text for comment/mention monitoring
 * (video-pipeline-automation-research-2026-07-09.md idea 13; media-pipeline-build-spec.md
 * "stage, hold, approve, act" pattern §0).
 *
 * Reuses the EXACT Claude Haiku call shape already locked in
 * packages/backend/src/services/video/scriptGenerator.ts (same ANTHROPIC_API_KEY /
 * ANTHROPIC_MODEL env vars, same axios Anthropic Messages API call, same JSON-fence
 * stripping, same cost-ceiling gate + token tracking via aiCostTracker.ts, same
 * em-dash strip + "no AI" brand-voice assertion) rather than inventing a second
 * AI-calling convention. scriptGenerator.ts itself is NOT imported/edited here (it is
 * a video-pipeline file owned by a parallel ADR-079 dispatch) — this module is its own
 * standalone leaf with the identical pattern, tailored to comment-reply drafting
 * instead of video-script drafting.
 *
 * GROUNDING — hard constraint identical to scriptGenerator.ts: the drafted reply may
 * reference ONLY the actual text of the comment/mention being replied to. No invented
 * facts about the commenter, no fabricated product claims, no guessed names beyond what
 * the platform gave us. If the comment is unclear, spammy, or nonsensical, the reply
 * still drafts something brief and neutral — it is NEVER auto-posted (staged only), so
 * the worst case is Patrick declines to approve it, not that a bad reply reaches a
 * real person.
 */

import axios from 'axios';
import {
  trackAITokens,
  estimateTokensForRequest,
  isAICostCeilingExceeded,
  ANTHROPIC_COST_PER_M_TOKENS,
  recordApiUsage,
} from '../../lib/aiCostTracker';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

/** X caps a full tweet (including any reply) at 280 chars; YouTube comment replies have
 *  a much higher platform ceiling but are kept short here to read like a real reply,
 *  not a form letter. */
const X_REPLY_MAX_CHARS = 280;
const YOUTUBE_REPLY_MAX_CHARS = 500;

export interface DraftCommentReplyInput {
  platform: 'YOUTUBE' | 'X';
  /** The actual, real text of the comment or mention being replied to — the ONLY
   *  source of truth for what the reply may reference. */
  commentText: string;
  /** Display name / handle of the commenter, for tone only (never invented if absent). */
  authorDisplayName?: string | null;
}

export interface DraftCommentReplyResult {
  replyText: string;
  /** Estimated spend for this single generation call, in cents — same $/1M-token rate
   *  aiCostTracker.ts already applies elsewhere, so this is consistent across the
   *  whole AI chain, not a second independent estimate. */
  costCents: number;
}

/** Strip em dashes as a defensive backstop to the prompt instruction — identical to
 *  scriptGenerator.ts's stripBannedFormatting(). Banned fleet-wide per
 *  claude_docs/brand/brand-voice-system.md Part 2. */
function stripBannedFormatting(text: string): string {
  return text.replace(/—/g, ', ').replace(/ {2,}/g, ' ').trim();
}

/** Code-level backstop for the "never say AI/Artificial Intelligence" brand rule —
 *  identical assertion to scriptGenerator.ts's assertBrandVoiceCompliant(). Throws
 *  (does not silently strip) so the caller can skip staging that one reply rather than
 *  ship a brand-voice violation into a human-review queue. */
function assertBrandVoiceCompliant(replyText: string): void {
  const bannedPatterns = [/\bAI\b/, /\bartificial intelligence\b/i];
  for (const pattern of bannedPatterns) {
    if (pattern.test(replyText)) {
      const err = new Error(
        'BRAND_VOICE_VIOLATION: generated reply mentions "AI"/"Artificial Intelligence", banned brand-wide per brand-voice-system.md Part 2'
      );
      (err as any).errorCode = 'BRAND_VOICE_VIOLATION';
      throw err;
    }
  }
}

function maxCharsFor(platform: 'YOUTUBE' | 'X'): number {
  return platform === 'X' ? X_REPLY_MAX_CHARS : YOUTUBE_REPLY_MAX_CHARS;
}

function buildSystemPrompt(input: DraftCommentReplyInput): string {
  const maxChars = maxCharsFor(input.platform);
  const authorLine = input.authorDisplayName
    ? `The commenter's display name/handle is "${input.authorDisplayName}" (for tone only, do not fabricate anything else about them).`
    : 'No commenter display name was provided — do not invent one.';

  return `You are drafting a short reply to a real ${input.platform === 'X' ? 'X (Twitter) mention' : 'YouTube comment'} on FindA.Sale's official ${input.platform === 'X' ? 'X' : 'YouTube'} account.

GROUNDING — HARD CONSTRAINT: The ONLY source of truth is the actual comment text below. Do not invent, assume, or recall from general knowledge any fact about the commenter, their situation, or FindA.Sale that is not directly supported by the comment text itself. If the comment asks a specific product question you cannot verify from the comment alone, keep the reply general and helpful (e.g., invite them to check the app or reach out) rather than guessing at a specific answer.

${authorLine}

REAL COMMENT TEXT (verbatim, the only thing you are replying to):
"""
${input.commentText}
"""

Reply requirements:
- Keep it under ${maxChars} characters.
- One short, warm, genuine reply — not a form letter, not defensive, not overly formal.
- If the comment is spam, nonsensical, or abusive, still draft a brief neutral reply (e.g. a simple thank-you or acknowledgment) rather than refusing to draft anything — a human reviews every reply before it ever posts, so the safe default is always "draft something reviewable," never silence.

Brand voice (mandatory, sourced from claude_docs/brand/brand-voice-system.md):
- Never use the word "AI" or "Artificial Intelligence" anywhere in the reply.
- No founder voice. Never say "I" as a named individual or sign with a first name. Speak as "we" / "FindA.Sale" / "The FindA.Sale Team" if any self-reference is needed at all (usually none is needed in a short reply).
- No hype words: "disrupting," "game-changer," "unlock," "exclusive," "leverage," "synergy."
- No em dash character anywhere. Use a period, comma, or colon instead.
- Warm, practical, honest tone. Concrete, no fluff, no corporate-speak.

Respond with ONLY valid JSON (no markdown, no explanation), in exactly this shape:
{
  "replyText": "the drafted reply text"
}`;
}

/**
 * Draft a reply to a single real comment/mention. Throws (does not silently degrade)
 * when the API is unavailable, over the shared AI cost ceiling, rate-limited, or
 * returns unparsable output — the caller (commentMonitor.ts / xEngagementMonitor.ts)
 * catches per-comment so one bad draft never aborts the whole polling run, matching
 * scriptGenerator.ts's "throw rather than fake" philosophy.
 */
export async function draftCommentReply(
  input: DraftCommentReplyInput
): Promise<DraftCommentReplyResult> {
  if (!ANTHROPIC_API_KEY) {
    const err = new Error('AI_UNAVAILABLE: ANTHROPIC_API_KEY not configured');
    (err as any).errorCode = 'AI_UNAVAILABLE';
    throw err;
  }

  // Shared $/mo Haiku ceiling (aiCostTracker.ts) — same budget line as the video-script
  // and image-tagging AI chains. Checked pre-flight rather than degraded silently, since
  // this content is never posted without a human approving it anyway (staged-markdown gate).
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
        max_tokens: 300,
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

    const responseTokens = Math.ceil(content.length / 4) + 50;
    await trackAITokens(estimatedTokens + responseTokens);
    await recordApiUsage('anthropic:social_engagement', (estimatedTokens + responseTokens) / 1_000_000 * ANTHROPIC_COST_PER_M_TOKENS);

    const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as { replyText?: string };

    if (!parsed.replyText) {
      const err = new Error('AI_PARSE_ERROR: Haiku response missing replyText');
      (err as any).errorCode = 'AI_PARSE_ERROR';
      throw err;
    }

    const costCents = Math.round(
      ((estimatedTokens + responseTokens) / 1_000_000) * ANTHROPIC_COST_PER_M_TOKENS * 100
    );

    let replyText = stripBannedFormatting(parsed.replyText);
    const maxChars = maxCharsFor(input.platform);
    if (replyText.length > maxChars) {
      replyText = replyText.slice(0, maxChars);
    }

    assertBrandVoiceCompliant(replyText);

    return { replyText, costCents };
  } catch (error: any) {
    if (error?.errorCode) throw error; // already tagged above

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
    const err = new Error('AI_ERROR: comment reply drafting unavailable');
    (err as any).errorCode = 'AI_ERROR';
    throw err;
  }
}
