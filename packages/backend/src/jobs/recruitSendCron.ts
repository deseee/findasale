/**
 * recruitSendCron.ts -- ADR-139 §5 organizer recruit channel sender.
 *
 * Every 10 minutes. Exits without sending unless ALL of: RECRUIT_SEND_ENABLED=true, FeatureFlag
 * recruit_send_enabled on, RECRUIT_TRANSPORT not 'none', transport isolation checks pass, and
 * the bounce/complaint health check is clean (a failing check auto-pauses the channel).
 *
 * Step 1 of the sequence goes out on the first tick after confirmation, any day. Steps 2 and 3
 * go out only inside the 14:00-22:00 UTC Monday-Friday window. At most 3 sends per tick.
 */
import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { getRecruitConfig } from '../services/recruit/recruitConfig';
import { channelOpenForSend, inSendWindow } from '../services/recruit/recruitGuards';
import { sendNextStepForLead, sweepConversions } from '../services/recruit/recruitLeadService';

const MAX_SENDS_PER_TICK = 3;

export async function runRecruitSendTick(now: Date = new Date()): Promise<{ sent: number; reason?: string }> {
  const cfg = getRecruitConfig();
  const gate = await channelOpenForSend(cfg);
  if (!gate.open) return { sent: 0, reason: gate.reason };

  await sweepConversions();

  const due = await prisma.recruitLead.findMany({
    where: {
      status: 'APPROVED',
      nextSendAt: { lte: now },
      ...(inSendWindow(now) ? {} : { sequenceStep: 0 }),
    },
    orderBy: { nextSendAt: 'asc' },
    select: { id: true },
    take: MAX_SENDS_PER_TICK * 2,
  });

  let sent = 0;
  let attempts = 0;
  for (const { id } of due) {
    if (attempts >= MAX_SENDS_PER_TICK) break;
    const outcome = await sendNextStepForLead(id, cfg);
    if (outcome === 'not_claimed') continue;
    attempts++;
    if (outcome === 'sent') sent++;
    if (outcome === 'cap_reached') return { sent, reason: 'cap_reached' };
    if (outcome === 'refused') return { sent, reason: 'transport_refused' };
  }
  return { sent };
}

export function scheduleRecruitSendCron(): void {
  cron.schedule(
    '*/10 * * * *',
    cronGuard({ jobName: 'recruit-send' }, async () => {
      const res = await runRecruitSendTick();
      if (res.sent > 0) console.log(`[recruit] tick sent ${res.sent}`);
    })
  );
}
