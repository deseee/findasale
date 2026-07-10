/**
 * commentMonitor.ts — YouTube comment monitoring + Haiku-drafted reply staging
 * (video-pipeline-automation-research-2026-07-09.md idea 13; media-pipeline-build-spec.md
 * §0 "stage, hold, approve, act").
 *
 * Fully live-capable by default: YouTube's Data API free quota (10,000 units/day,
 * commentThreads.list = 1 unit/call) comfortably covers hourly polling, unlike X
 * (see xEngagementMonitor.ts, which stays behind an explicit cost-sign-off env flag).
 * Replies are ALWAYS staged only, never auto-posted — posting only ever happens in
 * engagementReplyStaging.ts's postApprovedReplies(), gated on a human hand-edited
 * STATUS: APPROVED per entry.
 *
 * lastCheckedAt cursor: stored in Redis (packages/backend/src/lib/redis.ts — the same
 * get/setex interface aiCostTracker.ts already relies on, with an automatic in-memory
 * fallback if Redis is unavailable). A dedicated Prisma model was considered and
 * rejected for this dispatch: it would need a schema migration + Patrick's manual
 * `prisma migrate deploy` before this could ever run, for a value that is genuinely
 * ephemeral bookkeeping (a lost cursor just means one extra bounded re-scan window,
 * never data loss — the entry-key dedupe in engagementReplyStaging.ts absorbs
 * re-fetched-but-already-staged comments harmlessly). Redis, already used this way
 * elsewhere in the codebase (aiCostTracker.ts's monthly token counters), is the
 * simplest correct fit.
 *
 * Cursor safety margin: the next cursor is set to (this run's start time minus 5
 * minutes), not "now" after the fetch completes. Using a post-fetch "now" would risk
 * permanently missing a comment posted during the few seconds the API call was in
 * flight (it would fall before the next run's cursor and never be seen again). The
 * 5-minute overlap trades a small amount of redundant re-fetching (harmlessly
 * deduped by engagementReplyStaging.ts's entry-key check) for the guarantee that no
 * comment is ever silently skipped.
 */

import { redis } from '../../lib/redis';
import { getValidToken } from './tokenStore';
import { youtubePublisher } from './platforms/youtube';
import { listRecentChannelComments } from './platforms/youtube';
import { draftCommentReply } from './engagementReplyDrafter';
import { stageDraftedReplies, DraftedReplyEntry } from './engagementReplyStaging';

const YT_LAST_CHECKED_KEY = 'social:youtube:commentMonitor:lastCheckedAt';
// Long-lived cursor — re-set on every successful run, so this TTL only matters if the
// job stops running entirely for 90 days (in which case a fresh 24h bootstrap window
// on the next run is the correct, safe behavior anyway).
const CURSOR_TTL_SECONDS = 90 * 24 * 60 * 60;
const SAFETY_BUFFER_MS = 5 * 60 * 1000;
// First-ever run (no cursor in Redis yet): only backfill the last 24h, not the
// channel's entire comment history, to avoid a flood of stale drafts on first deploy.
const FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Poll for new YouTube comments since the last check, draft a reply for each via the
 * Haiku chain, and stage them all to today's comment-replies-batch-YYYY-MM-DD.md.
 * Never posts anything. Safe to call on any cadence; the cron wires it to hourly.
 */
export async function checkYouTubeComments(): Promise<{ checked: number; staged: number }> {
  const fetchStartedAt = new Date();

  const { account, accessToken } = await getValidToken('YOUTUBE', youtubePublisher.refresh);
  const channelId = account.platformUserId;
  if (!channelId) {
    console.warn(
      '[commentMonitor] YouTube SocialAccount has no platformUserId (channel id) on record — cannot scope comment listing; skipping this run.'
    );
    return { checked: 0, staged: 0 };
  }

  const lastCheckedRaw = await redis.get(YT_LAST_CHECKED_KEY);
  const sinceIso = lastCheckedRaw || new Date(Date.now() - FIRST_RUN_LOOKBACK_MS).toISOString();

  const comments = await listRecentChannelComments({
    accessToken,
    channelId,
    sinceIso,
    maxResults: 50,
  });

  let staged = 0;
  if (comments.length > 0) {
    const entries: DraftedReplyEntry[] = [];
    for (const c of comments) {
      try {
        const { replyText } = await draftCommentReply({
          platform: 'YOUTUBE',
          commentText: c.textOriginal,
          authorDisplayName: c.authorDisplayName,
        });
        entries.push({
          platform: 'YOUTUBE',
          commentId: c.commentId,
          parentRefForPosting: c.commentId,
          authorDisplayName: c.authorDisplayName,
          originalText: c.textOriginal,
          sourceUrl: `https://www.youtube.com/watch?v=${c.videoId}&lc=${c.commentId}`,
          draftedReply: replyText,
        });
      } catch (err) {
        console.error(
          `[commentMonitor] Failed to draft reply for YouTube comment ${c.commentId}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    const result = await stageDraftedReplies(entries);
    staged = result.stagedCount;
  }

  const nextCursor = new Date(fetchStartedAt.getTime() - SAFETY_BUFFER_MS).toISOString();
  await redis.setex(YT_LAST_CHECKED_KEY, CURSOR_TTL_SECONDS, nextCursor);

  console.log(`[commentMonitor] YouTube: checked=${comments.length} staged=${staged}`);
  return { checked: comments.length, staged };
}
