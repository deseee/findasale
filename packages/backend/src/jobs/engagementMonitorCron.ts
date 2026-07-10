import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { checkYouTubeComments } from '../services/social/commentMonitor';
import { checkXMentions } from '../services/social/xEngagementMonitor';
import { postApprovedReplies } from '../services/social/engagementReplyStaging';

/**
 * Comment/mention engagement monitor + approved-reply poster cron.
 *
 * Two schedules registered here (video-pipeline-automation-research-2026-07-09.md
 * idea 13; media-pipeline-build-spec.md §0):
 *
 *  - Hourly (`0 * * * *`) — polling/drafting: checks YouTube comments (always live —
 *    YouTube Data API's free 10,000 unit/day quota makes 24 commentThreads.list
 *    calls/day trivial) and X mentions (checkXMentions() no-ops immediately unless
 *    X_ENGAGEMENT_MONITORING_ENABLED='true' — default off pending Patrick's cost
 *    sign-off). Drafts replies via Haiku and stages them to
 *    claude_docs/marketing/content-pipeline/comment-replies-batch-YYYY-MM-DD.md.
 *    NEVER posts anything.
 *
 *  - Every 30 minutes (`*\/30 * * * *`) — acting: scans staged files for entries
 *    Patrick has hand-flipped to STATUS: APPROVED and posts ONLY those, via the real
 *    YouTube/X publisher posting mechanism, then marks each POSTED YYYY-MM-DD.
 *    Chosen tighter than the weekly findasale-social-scheduler cadence (§2.2 of the
 *    build spec) because a reply is time-sensitive in a way a scheduled social post
 *    is not — a reply approved by Patrick that then sits for up to a week reads as
 *    ignoring the commenter. Scanning a handful of small markdown files every 30
 *    minutes has no meaningful cost or rate concern, unlike posting itself.
 *
 * Both wrapped in cronGuard exactly like scheduleSocialPublisherCron (ADR-077),
 * so failures land in Sentry monitors the same way as the other ~40 jobs.
 */
export function scheduleEngagementMonitorCron(): void {
  cron.schedule(
    '0 * * * *',
    cronGuard(
      { jobName: 'engagementMonitorPoll', alertThresholdConsecutiveFailures: 3 },
      async () => {
        await checkYouTubeComments();
        await checkXMentions();
      }
    )
  );

  cron.schedule(
    '*/30 * * * *',
    cronGuard(
      { jobName: 'engagementReplyPoster', alertThresholdConsecutiveFailures: 3 },
      async () => {
        await postApprovedReplies();
      }
    )
  );

  console.log(
    '[engagement-monitor-cron] Registered comment/mention monitor (hourly) + approved-reply poster (every 30 min)'
  );
}
