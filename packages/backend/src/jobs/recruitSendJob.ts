/**
 * Organizer-recruitment cold-send channel jobs (triggered through
 * /api/internal/jobs/run by .github/workflows/pipeline-recruit-send.yml and
 * pipeline-recruit-verify.yml).
 *
 *   runRecruitSend   - sends touch 1 / touch 2 to VERIFIED (or SENT, for touch 2) leads
 *   runRecruitVerify - verifies NEW leads (syntax, suppression, MX, SMTP probe)
 *
 * Gate order copies jobs/outreachEmailsCron.ts sendOutreachEmails(): hard kill
 * switch first, then an in-process overlap lock, then the remaining gates.
 * Send gates: RECRUIT_SEND_ENABLED === "true"; provider key, unsubscribe secret,
 * warmup start date, physical address and backend URL all present; pause flag
 * not set; health passes (re-checked before every send); daily cap has room.
 * Only leads with nextSendAt <= now are picked, max 2 touches, touch 2 at
 * least 5 days after touch 1 (nextSendAt is set that way by sendOne).
 */

import { prisma } from '../lib/prisma';
import {
  computeDailyCap,
  evaluateHealth,
  getPauseState,
  getRecruitSendBlockers,
  getTodayAttempted,
  recruitSendEnabled,
  sendOne,
} from '../services/recruitSendService';
import { RECRUIT_MAX_TOUCHES } from '../services/recruitTemplates';
import { verifyRecruitAddress } from '../services/recruitVerifyService';

// The workflow fires hourly 14:00-21:00 UTC on weekdays (8 runs). Spreading the
// daily cap over those runs avoids sending a whole day's volume in one burst.
const RUNS_PER_DAY = 8;
const SEND_SPACING_MS = 4000;
const VERIFY_BATCH = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let sendRunInProgress = false;
let verifyRunInProgress = false;

export const runRecruitSend = async (): Promise<void> => {
  if (!recruitSendEnabled()) {
    console.log('[RecruitSend] RECRUIT_SEND_ENABLED is not "true" - aborting send run');
    return;
  }
  if (sendRunInProgress) {
    console.warn('[RecruitSend] A send run is already in progress - aborting overlapping run');
    return;
  }
  sendRunInProgress = true;
  try {
    await runRecruitSendInner();
  } finally {
    sendRunInProgress = false;
  }
};

const runRecruitSendInner = async (): Promise<void> => {
  const blockers = getRecruitSendBlockers();
  if (blockers.length > 0) {
    console.log(`[RecruitSend] Not sending: ${blockers.join('; ')}`);
    return;
  }

  const pause = await getPauseState();
  if (pause.paused) {
    console.log(`[RecruitSend] Channel paused (${pause.reason || 'no reason recorded'}) - not sending`);
    return;
  }

  const health = await evaluateHealth();
  if (!health.ok) {
    console.warn(`[RecruitSend] Health check failed (${health.reason}) - not sending`);
    return;
  }

  const cap = computeDailyCap();
  const attempted = await getTodayAttempted();
  const remainingToday = cap - attempted;
  if (remainingToday <= 0) {
    console.log(`[RecruitSend] Daily cap reached (${attempted}/${cap}) - not sending`);
    return;
  }
  const perRun = Math.max(1, Math.ceil(cap / RUNS_PER_DAY));
  const budget = Math.min(remainingToday, perRun);

  const now = new Date();
  const leads = await prisma.recruitLead.findMany({
    where: {
      status: { in: ['VERIFIED', 'SENT'] },
      touchCount: { lt: RECRUIT_MAX_TOUCHES },
      nextSendAt: { lte: now },
      businessName: { not: '' },
    },
    orderBy: { nextSendAt: 'asc' },
    take: budget,
    select: { id: true, email: true, businessName: true, contactName: true, city: true, touchCount: true, status: true },
  });
  if (leads.length === 0) {
    console.log('[RecruitSend] No leads due');
    return;
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const lead of leads) {
    // Personalization requirement: never send a lead without a business name.
    if (!lead.businessName || !lead.businessName.trim()) {
      skipped++;
      continue;
    }
    // Health and pause are re-checked before every send (a webhook may have paused mid-run).
    const p = await getPauseState();
    if (p.paused) {
      console.warn('[RecruitSend] Channel paused mid-run - stopping');
      break;
    }
    const h = await evaluateHealth();
    if (!h.ok) {
      console.warn(`[RecruitSend] Health failed mid-run (${h.reason}) - stopping`);
      break;
    }
    if ((await getTodayAttempted()) >= cap) {
      console.log('[RecruitSend] Daily cap reached mid-run - stopping');
      break;
    }

    try {
      const outcome = await sendOne(lead);
      if (outcome.ok) {
        sent++;
        console.log(`[RecruitSend] Sent touch ${outcome.touchNumber} to lead ${lead.id}`);
      } else {
        skipped++;
        console.log(`[RecruitSend] Skipped lead ${lead.id}: ${outcome.skipped}`);
      }
    } catch (err: any) {
      failed++;
      console.error(`[RecruitSend] Send failed for lead ${lead.id}:`, err?.message || err);
    }
    await sleep(SEND_SPACING_MS);
  }
  console.log(`[RecruitSend] Run complete: ${sent} sent, ${skipped} skipped, ${failed} failed (cap ${cap}, budget ${budget})`);
};

export const runRecruitVerify = async (): Promise<void> => {
  if (!recruitSendEnabled()) {
    console.log('[RecruitVerify] RECRUIT_SEND_ENABLED is not "true" - aborting verify run');
    return;
  }
  if (verifyRunInProgress) {
    console.warn('[RecruitVerify] A verify run is already in progress - aborting overlapping run');
    return;
  }
  verifyRunInProgress = true;
  try {
    const leads = await prisma.recruitLead.findMany({
      where: { status: 'NEW' },
      orderBy: { updatedAt: 'asc' },
      take: VERIFY_BATCH,
      select: { id: true, email: true },
    });
    const counts: Record<string, number> = {};
    for (const lead of leads) {
      try {
        const result = await verifyRecruitAddress(lead.email);
        counts[result.status] = (counts[result.status] || 0) + 1;
        const now = new Date();
        await prisma.recruitLead.update({
          where: { id: lead.id },
          data: {
            status: result.status,
            verifyReason: result.reason,
            verifiedAt: result.status === 'NEW' ? null : now,
            nextSendAt: result.status === 'VERIFIED' ? now : null,
          },
        });
      } catch (err: any) {
        counts.error = (counts.error || 0) + 1;
        console.error(`[RecruitVerify] Verify failed for lead ${lead.id}:`, err?.message || err);
      }
    }
    console.log(`[RecruitVerify] Run complete: ${leads.length} checked`, counts);
  } finally {
    verifyRunInProgress = false;
  }
};
