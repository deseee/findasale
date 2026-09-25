import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { sendConsignorPickupWindowReminder } from '../services/consignorEmailService';
import { createNotification } from '../services/notificationService';
import { cronGuard } from '../utils/cronGuard';

const frontendBaseUrl = process.env.FRONTEND_URL || 'https://finda.sale';

/**
 * Consignor Pickup-Window Notice Job
 *
 * RECONCILED 2026-09-25 per Patrick's stated policy (verbatim): "15 days should be fine
 * for settlement after an item is unsold for 90 days and marked return to consignor...
 * as long as we send a couple emails in that 15 day window to state they should contact
 * [the organizer] or set a pickup window online if [the organizer] has those enabled...
 * to arrange pickup/donation."
 *
 * ORIGINAL BEHAVIOR (2026-09-24, superseded by this rewrite): fixed 60-day-old-item check
 * keyed to Item.createdAt, fired for EVERY unsoldItemDisposition (RETURN/DONATE/RELIST),
 * and sent the consignor exactly one email. That did not match Patrick's policy on three
 * counts -- the trigger day, the disposition scope, and the single-email design -- so this
 * job has been rewritten in place rather than left to conflict with a second one:
 *
 *   1. Trigger is now the consignor's own Consignor.returnPeriodDays (default 90, already
 *      used by consignmentUnclaimedItemsJob.ts below) instead of a fixed 60 days.
 *   2. Scope is now RETURN-disposition items ONLY. DONATE/RELIST items need no pickup
 *      arrangement (nothing for the consignor to come get), and consignmentUnclaimedItemsJob.ts
 *      already gives the ORGANIZER a batched nudge across all three dispositions daily --
 *      duplicating that here for DONATE/RELIST would double-notify the organizer for the
 *      same item on two different schedules. See that job's file for the organizer-facing
 *      side; this job is now the CONSIGNOR-facing, RETURN-only half.
 *   3. Once a RETURN item crosses its returnPeriodDays window, this job opens a 15-day
 *      "pickup-arrangement window" and sends the consignor TWO reminder emails during it
 *      (window-open, then a mid-window nudge ~7 days in) instead of one, each telling them
 *      to contact the organizer or use the workspace's consignor-intake link (if enabled)
 *      to arrange a pickup time. Item.pickupWindowStartedAt / pickupReminder2SentAt track
 *      idempotency so each email fires exactly once per item. No action is taken at the
 *      15-day window close -- that is a settlement/disposition decision for the organizer to
 *      make themselves; this job remains notification-only and never touches Item.status,
 *      never auto-donates/relists/returns anything, and never touches a payout or any
 *      Stripe/Square/Finix code path.
 *
 * FLAGGED FOR REVIEW: the original job also sent DONATE/RELIST consignors a single
 * "here's what's happening" email and alerted the organizer per item for all three
 * dispositions -- that behavior is now GONE for DONATE/RELIST (see point 2 above). If
 * product wants a consignor-facing "your item is being donated/relisted" email to keep
 * existing for those dispositions, that would need to be reintroduced as its own thing
 * (or restored here) -- it wasn't part of the pickup-window ask, so it was removed instead
 * of guessed at. Flagging in the dispatch handoff rather than assuming.
 */
export const scheduleConsignorExpiryNoticeCron = (): void => {
  // Run daily at 2 AM UTC (unchanged schedule/slot)
  cron.schedule('10 2 * * *', cronGuard({ jobName: 'consignorExpiryNoticeJob' }, async () => {
    console.log('[consignor-pickup-window-cron] Starting consignor pickup-window notice job...');
    await processConsignorExpiryNotices();
  }));
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Mid-window reminder fires this many days after the window opens (roughly the midpoint
// of the 15-day window Patrick described).
const MID_WINDOW_REMINDER_DAYS = 7;

// Feature 1 (2026-09-25): if the workspace has its consignor-intake link enabled, hand the
// consignor a direct link to it in the pickup-window reminder emails so they can self-serve
// a pickup time instead of only being told to "contact the organizer". Reuses the same
// public /consign/:token page and WorkspaceSettings.intakeLinkToken built for consignor
// self-serve intake (2026-09-25) -- there is no separate "pickup appointment" flow yet, so
// this points at the general intake/appointment link, same as staff would hand out.
const buildPickupAppointmentLink = (settings?: { intakeLinkEnabled: boolean; intakeLinkToken: string | null } | null): string | undefined => {
  if (!settings || !settings.intakeLinkEnabled || !settings.intakeLinkToken) return undefined;
  return `${frontendBaseUrl}/consign/${settings.intakeLinkToken}`;
};

export const processConsignorExpiryNotices = async (): Promise<void> => {
  try {
    const now = new Date();

    await openPickupWindowsForNewlyUnclaimedReturnItems(now);
    await sendMidWindowReminders(now);

    console.log('[consignor-pickup-window-cron] Consignor pickup-window notice job completed');
  } catch (err) {
    console.error('[consignor-pickup-window-cron] Job failed:', err);
  }
};

/**
 * Reminder #1 / window open: find RETURN-disposition items that have crossed their own
 * consignor's returnPeriodDays and never had a pickup window opened for them yet.
 */
const openPickupWindowsForNewlyUnclaimedReturnItems = async (now: Date): Promise<void> => {
  // Candidate pool, narrowed by the indexed columns; the actual "has this item crossed
  // ITS consignor's own returnPeriodDays" check can't be a single Prisma `where` because
  // returnPeriodDays varies per consignor -- same approach as consignmentUnclaimedItemsJob.ts.
  const candidates = await prisma.item.findMany({
    where: {
      consignorId: { not: null },
      status: 'AVAILABLE',
      pickupWindowStartedAt: null,
    },
    include: {
      consignor: {
        select: {
          id: true,
          name: true,
          email: true,
          unsoldItemDisposition: true,
          returnPeriodDays: true,
          workspace: {
            select: {
              settings: { select: { intakeLinkEnabled: true, intakeLinkToken: true } },
            },
          },
        },
      },
      sale: {
        select: {
          title: true,
          organizer: { select: { userId: true, user: { select: { email: true, name: true } } } },
        },
      },
    },
  });

  const dueForWindow = candidates.filter((item) => {
    if (!item.consignor) return false;
    if (item.consignor.unsoldItemDisposition !== 'RETURN') return false;
    const cutoff = new Date(now.getTime() - item.consignor.returnPeriodDays * MS_PER_DAY);
    return item.createdAt < cutoff;
  });

  if (dueForWindow.length === 0) {
    console.log('[consignor-pickup-window-cron] No newly-unclaimed RETURN items to open a pickup window for');
    return;
  }

  console.log(`[consignor-pickup-window-cron] Opening pickup window for ${dueForWindow.length} RETURN item(s)`);

  for (const item of dueForWindow) {
    if (!item.consignor?.email) {
      console.warn(`[consignor-pickup-window-cron] Item ${item.id} has no consignor email, skipping reminder email (window still opened)`);
    }

    const organizerName = item.sale?.organizer?.user?.name || 'Your organizer';
    const organizerEmail = item.sale?.organizer?.user?.email || 'support@finda.sale';
    const organizerUserId = item.sale?.organizer?.userId || null;
    const saleId = item.saleId || '';

    try {
      if (item.consignor?.email) {
        // Fire-and-forget, matching this job's existing pattern.
        setImmediate(() => {
          sendConsignorPickupWindowReminder({
            consignorName: item.consignor!.name,
            consignorEmail: item.consignor!.email!,
            itemName: item.title,
            organizerName,
            organizerEmail,
            saleId,
            reminderNumber: 1,
            pickupAppointmentLinkUrl: buildPickupAppointmentLink(item.consignor!.workspace?.settings),
          }).catch(err =>
            console.warn(
              `[consignor-pickup-window-cron] Failed to send window-open reminder for item ${item.id}:`,
              err
            )
          );
        });
      }

      // Organizer-facing heads-up that the window just opened for this item, in-app +
      // email (this is a physical-item action with a real 15-day deadline, not just
      // informational -- mirrors the sendEmail:true choice the original job made here).
      if (organizerUserId) {
        const title = 'Consigned item ready to return -- pickup window opened';
        const body = `"${item.title}" from ${item.consignor!.name} has been listed ${item.consignor!.returnPeriodDays} days without selling. A 15-day pickup-arrangement window just opened -- they've been emailed to contact you or book a pickup time. Set it aside for pickup.`;
        setImmediate(() => {
          createNotification(
            organizerUserId,
            'CONSIGNOR_ITEM_EXPIRING',
            title,
            body,
            `/organizer/consignors/${item.consignor!.id}`,
            'OPERATIONAL',
            true,
            title
          ).catch(err =>
            console.warn(
              `[consignor-pickup-window-cron] Failed to create organizer alert for item ${item.id}:`,
              err
            )
          );
        });
      } else {
        console.warn(`[consignor-pickup-window-cron] Item ${item.id} has no organizer userId, skipping organizer alert`);
      }

      // Stamp regardless of whether the email/notification actually reached an inbox --
      // matches consignmentUnclaimedItemsJob.ts's fail-open idempotency contract, so a
      // missing address or a failed send never makes this job retry the same item forever.
      await prisma.item.update({
        where: { id: item.id },
        data: { pickupWindowStartedAt: now },
      });
    } catch (err) {
      console.error(`[consignor-pickup-window-cron] Error opening pickup window for item ${item.id}:`, err);
    }
  }
};

/**
 * Reminder #2 / mid-window nudge: RETURN items whose pickup window opened at least
 * MID_WINDOW_REMINDER_DAYS ago, are still unsold, and haven't gotten the second reminder yet.
 */
const sendMidWindowReminders = async (now: Date): Promise<void> => {
  const midWindowCutoff = new Date(now.getTime() - MID_WINDOW_REMINDER_DAYS * MS_PER_DAY);

  const dueForReminder = await prisma.item.findMany({
    where: {
      consignorId: { not: null },
      status: 'AVAILABLE',
      pickupWindowStartedAt: { not: null, lte: midWindowCutoff },
      pickupReminder2SentAt: null,
    },
    include: {
      consignor: {
        select: {
          id: true,
          name: true,
          email: true,
          unsoldItemDisposition: true,
          workspace: {
            select: {
              settings: { select: { intakeLinkEnabled: true, intakeLinkToken: true } },
            },
          },
        },
      },
      sale: {
        select: {
          organizer: { select: { user: { select: { email: true, name: true } } } },
        },
      },
    },
  });

  // Disposition can only be RETURN here in practice (that's the only path that opens a
  // window), but re-checked defensively in case an organizer changes it mid-window.
  const stillReturn = dueForReminder.filter((item) => item.consignor?.unsoldItemDisposition === 'RETURN');

  if (stillReturn.length === 0) {
    console.log('[consignor-pickup-window-cron] No items due for the mid-window reminder');
    return;
  }

  console.log(`[consignor-pickup-window-cron] Sending mid-window reminder for ${stillReturn.length} item(s)`);

  for (const item of stillReturn) {
    if (!item.consignor?.email) {
      console.warn(`[consignor-pickup-window-cron] Item ${item.id} has no consignor email, skipping mid-window reminder`);
      // Still stamp so this item is not re-evaluated forever.
      await prisma.item.update({ where: { id: item.id }, data: { pickupReminder2SentAt: now } }).catch(() => {});
      continue;
    }

    const organizerName = item.sale?.organizer?.user?.name || 'Your organizer';
    const organizerEmail = item.sale?.organizer?.user?.email || 'support@finda.sale';
    const saleId = item.saleId || '';

    try {
      setImmediate(() => {
        sendConsignorPickupWindowReminder({
          consignorName: item.consignor!.name,
          consignorEmail: item.consignor!.email!,
          itemName: item.title,
          organizerName,
          organizerEmail,
          saleId,
          reminderNumber: 2,
          pickupAppointmentLinkUrl: buildPickupAppointmentLink(item.consignor!.workspace?.settings),
        }).catch(err =>
          console.warn(
            `[consignor-pickup-window-cron] Failed to send mid-window reminder for item ${item.id}:`,
            err
          )
        );
      });

      await prisma.item.update({
        where: { id: item.id },
        data: { pickupReminder2SentAt: now },
      });
    } catch (err) {
      console.error(`[consignor-pickup-window-cron] Error sending mid-window reminder for item ${item.id}:`, err);
    }
  }
};
