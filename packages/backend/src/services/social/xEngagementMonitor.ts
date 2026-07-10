/**
 * xEngagementMonitor.ts — X (Twitter) mention monitoring + Haiku-drafted reply staging.
 * Same shape as commentMonitor.ts (YouTube), but gated behind an explicit env flag,
 * DEFAULT OFF, because X mention reads are pay-per-use (~$0.001-0.005/read, 2M-read/
 * month cap under X's 2026 free-tier replacement per
 * claude_docs/strategy/video-pipeline-automation-research-2026-07-09.md idea 16) — a
 * small real cost Patrick has acknowledged but not yet activated ("X can wait to go
 * live but build it out").
 *
 * X_ENGAGEMENT_MONITORING_ENABLED mirrors the existing cost-gated-feature convention
 * in this codebase (VENDOR_BOOTH_LIVE_TRANSFERS in vendorBoothSettlementController.ts,
 * STRIPE_TERMINAL_SIMULATED in vendorBoothCartController.ts / terminalController.ts,
 * webDetectionEnabled() / groundingEnabled() in aiCostTracker.ts): a bare
 * process.env.FLAG === 'true' check, default OFF/unset, checked FIRST before any
 * token lookup or network call — so an unset flag guarantees zero live X API calls,
 * not just "we chose not to call it this time."
 */

import { redis } from '../../lib/redis';
import { getValidToken } from './tokenStore';
import { xPublisher } from './platforms/x';
import { listRecentMentions, getOwnUserId } from './platforms/x';
import { draftCommentReply } from './engagementReplyDrafter';
import { stageDraftedReplies, DraftedReplyEntry } from './engagementReplyStaging';

const X_LAST_CHECKED_KEY = 'social:x:engagementMonitor:lastCheckedAt';
const CURSOR_TTL_SECONDS = 90 * 24 * 60 * 60;
const SAFETY_BUFFER_MS = 5 * 60 * 1000;
const FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Kill switch. Default OFF/unset. MUST be checked before any token lookup or network
 * call in checkXMentions() below — verified by the fact that this is literally the
 * first statement executed in that function.
 */
export function xEngagementMonitoringEnabled(): boolean {
  return process.env.X_ENGAGEMENT_MONITORING_ENABLED === 'true';
}

/**
 * Poll for new X mentions since the last check, draft a reply for each via the Haiku
 * chain, and stage them all to today's comment-replies-batch-YYYY-MM-DD.md. Never
 * posts anything. No-ops (zero API calls of any kind) unless
 * X_ENGAGEMENT_MONITORING_ENABLED is exactly the string 'true'.
 */
export async function checkXMentions(): Promise<
  { disabled: true } | { checked: number; staged: number }
> {
  if (!xEngagementMonitoringEnabled()) {
    console.log(
      '[xEngagementMonitor] X_ENGAGEMENT_MONITORING_ENABLED is not "true" — skipping, no X API call made. ' +
        'Set the env var on Railway once Patrick signs off on the per-read cost to activate.'
    );
    return { disabled: true };
  }

  const fetchStartedAt = new Date();

  const { account, accessToken } = await getValidToken('X', xPublisher.refresh);
  const userId = await getOwnUserId({ accessToken, account });

  const lastCheckedRaw = await redis.get(X_LAST_CHECKED_KEY);
  const sinceIso = lastCheckedRaw || new Date(Date.now() - FIRST_RUN_LOOKBACK_MS).toISOString();

  const mentions = await listRecentMentions({ accessToken, userId, sinceIso, maxResults: 50 });

  let staged = 0;
  if (mentions.length > 0) {
    const entries: DraftedReplyEntry[] = [];
    for (const m of mentions) {
      try {
        const { replyText } = await draftCommentReply({
          platform: 'X',
          commentText: m.text,
          authorDisplayName: m.authorUsername ?? null,
        });
        entries.push({
          platform: 'X',
          commentId: m.tweetId,
          parentRefForPosting: m.tweetId,
          authorDisplayName: m.authorUsername ?? null,
          originalText: m.text,
          sourceUrl: m.authorUsername
            ? `https://twitter.com/${m.authorUsername}/status/${m.tweetId}`
            : `https://twitter.com/i/web/status/${m.tweetId}`,
          draftedReply: replyText,
        });
      } catch (err) {
        console.error(
          `[xEngagementMonitor] Failed to draft reply for X mention ${m.tweetId}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    const result = await stageDraftedReplies(entries);
    staged = result.stagedCount;
  }

  const nextCursor = new Date(fetchStartedAt.getTime() - SAFETY_BUFFER_MS).toISOString();
  await redis.setex(X_LAST_CHECKED_KEY, CURSOR_TTL_SECONDS, nextCursor);

  console.log(`[xEngagementMonitor] X: checked=${mentions.length} staged=${staged}`);
  return { checked: mentions.length, staged };
}
