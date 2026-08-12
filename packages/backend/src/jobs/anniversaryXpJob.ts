/**
 * anniversaryXpJob.ts — 30-day account anniversary XP bonus
 *
 * Guild Primer copy (packages/frontend/pages/shopper/guild-primer.tsx, "Streaks,
 * Milestones & Referrals" table, "30-day anniversary" row): "250 XP (375 with
 * Hunt Pass) — Active month milestone. Once/month."
 *
 * Copy interpretation (read directly before building — not guessed): the row
 * label is "30-day anniversary" and the cadence column says "Once/month" for
 * BOTH this row and the sibling "7-day streak bonus" row. 30 days is ~1
 * calendar month, so "Once/month" here describes the natural cadence of a
 * recurring 30-day tenure milestone — NOT a one-time-ever award. Read as:
 * every 30 days of continuous account tenure (day 30, 60, 90, ...), the user
 * gets this bonus — which by construction can only land once every ~30 days,
 * matching "Once/month". This also matches the existing xpService.ts comment:
 * "30-day active month anniversary (once/month)". The label/cadence pairing is
 * coherent, not contradictory, once read together — flagging this reasoning
 * in the handoff per the task spec rather than silently resolving it.
 *
 * Runs daily at 02:45 UTC — after xpExpiryCron (02:15 UTC), before
 * huntPassExpiryCron (03:00 UTC), in the same daily XP-adjacent job family.
 *
 * Bug fix 2026-08-09: the candidate query never excluded scraper/prospect
 * shell User rows (email pattern scraper+...@system.finda.sale, paired 1:1
 * with Organizer.isUnmanagedListing=true rows -- these accounts never log in
 * and will never see this XP). Confirmed live: 57,160 of 57,163 existing
 * ANNIVERSARY_30DAY PointsTransaction rows (99.99%) belong to these shells.
 * Added an "email" NOT LIKE '%@system.finda.sale' filter to the SQL below,
 * matching the existing real-user filter convention used elsewhere
 * (adminController.ts getStats, backfill-warm-emails.ts, seedDirectoryClaimEmails.ts).
 * This stops NEW junk rows going forward; the 57,159 existing bad rows are
 * NOT cleaned up here -- that is a separate data-cleanup decision requiring
 * Patrick's sign-off (see claude_docs/architecture/db-space-accounting-2026-08-09.md
 * Action 6).
 *
 * Idempotency: mirrors the pattern already used by hasEarnedTrailBonus() in
 * xpService.ts (PointsTransaction.description contains a stable per-milestone
 * tag), NOT checkStreakMilestones()'s calendar-month window — because 30-day
 * tenure milestones are not calendar-month aligned per user (a user who
 * signed up mid-month hits day 30 mid-month too, not on the 1st). Tagging
 * each award with its milestone number (`anniversary-milestone:N`) in the
 * description guarantees a given milestone is only ever awarded once, even if
 * the cron re-runs the same day or after a deploy restart. No new schema
 * field required — reuses the existing PointsTransaction.description column,
 * same as hasEarnedTrailBonus(). (A dedicated tracking field was considered
 * and rejected in favor of this — see handoff note.)
 *
 * awardXp() applies the Hunt Pass 1.5x XP multiplier automatically (250 XP ->
 * 375 XP) — no manual multiplier logic here, matching the fix already shipped
 * to xpService.ts this session.
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../lib/prisma';
import { awardXp, XP_AWARDS } from '../services/xpService';

interface AnniversaryCandidate {
  id: string;
  days_tenure: number;
}

async function processAnniversaryXp(): Promise<void> {
  try {
    // Find users whose account tenure (in whole days) just crossed a new
    // 30-day multiple as of this cron run (day 30, 60, 90, ...). Raw SQL is
    // used because the modulo check can't be expressed as a Prisma filter —
    // same $queryRaw pattern already used elsewhere in jobs/ (e.g.
    // cityCoordinateBackfillJob.ts).
    const candidates = await prisma.$queryRaw<AnniversaryCandidate[]>`
      SELECT id,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 86400)::int AS days_tenure
      FROM "User"
      WHERE "deletedAt" IS NULL
        AND "fraudSuspect" = false
        AND "email" NOT LIKE '%@system.finda.sale'
        AND FLOOR(EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 86400)::int >= 30
        AND FLOOR(EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 86400)::int % 30 = 0
    `;

    if (candidates.length === 0) {
      console.log('[anniversaryXpJob] No users crossed a 30-day tenure milestone today.');
      return;
    }

    let awarded = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const milestoneNumber = Math.floor(candidate.days_tenure / 30);
      const milestoneTag = `anniversary-milestone:${milestoneNumber}`;

      // Idempotency guard — same "description contains a stable tag" pattern
      // as hasEarnedTrailBonus() in xpService.ts.
      const alreadyAwarded = await prisma.pointsTransaction.findFirst({
        where: {
          userId: candidate.id,
          type: 'ANNIVERSARY_30DAY',
          description: { contains: milestoneTag },
        },
      });

      if (alreadyAwarded) {
        skipped++;
        continue;
      }

      // awardXp() applies the Hunt Pass 1.5x multiplier automatically and
      // also enforces the fraudSuspect block internally (defense in depth —
      // this job already filters fraudSuspect = false in the SQL above).
      const result = await awardXp(candidate.id, 'ANNIVERSARY_30DAY', XP_AWARDS.ANNIVERSARY_30DAY, {
        description: `30-day anniversary bonus: milestone ${milestoneNumber} (${candidate.days_tenure} days tenure) [${milestoneTag}]`,
      });

      if (result) {
        awarded++;
      }
    }

    console.log(
      `[anniversaryXpJob] Complete: ${awarded} awarded, ${skipped} already-awarded skipped, ${candidates.length} candidates checked.`
    );
  } catch (error) {
    console.error('[anniversaryXpJob] Fatal error:', error);
  }
}

// Run daily at 02:45 UTC (between xpExpiryCron @ 02:15 and huntPassExpiryCron @ 03:00)
// Format: minute hour day month dayOfWeek
cron.schedule('45 2 * * *', cronGuard({ jobName: 'anniversaryXpJob' }, async () => {
  console.log('[anniversaryXpJob] Starting 30-day anniversary XP batch...');
  await processAnniversaryXp();
}));

console.log('[anniversaryXpJob] Registered — runs daily at 02:45 UTC');
