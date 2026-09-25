import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { createNotification } from '../services/notificationService';
import { cronGuard } from '../utils/cronGuard';

/**
 * Consignment Unclaimed Items Job (2026-09-25)
 *
 * Consignor.unsoldItemDisposition (RETURN | DONATE | RELIST, schema.prisma ~line 5404) has
 * existed since the #309 Consignor Portal build as the organizer's on-file plan for what
 * happens to a consignor's items if they don't sell -- but nothing ever surfaced it. This
 * job is the daily sweep that finally does: it finds consigned items that have sat AVAILABLE
 * past their consignor's own returnPeriodDays window (default 90, schema.prisma, organizer-
 * overridable per consignor later) and sends ONE batched notification per organizer
 * workspace nudging them to act on the disposition already on file for each affected
 * consignor.
 *
 * NOTIFICATION-ONLY, matching the field's existing "informational" posture (see its schema
 * comment): this job never changes Item.status, never auto-donates or auto-relists
 * anything, and never touches a payout, Stripe/Square/Finix, or any other financial code
 * path. It only tells the organizer what unsoldItemDisposition already says to do.
 *
 * RELATIONSHIP TO consignorExpiryNoticeJob.ts: that job (added 2026-09-24) is a different,
 * already-shipped mechanism -- a fixed 60-day-old, per-ITEM check that emails the CONSIGNOR
 * directly and alerts the organizer per item. This job is per-CONSIGNOR-configurable
 * (returnPeriodDays), grouped into one alert per organizer per day, and only ever notifies
 * the organizer (never emails the consignor). The two are intentionally independent and are
 * flagged together for product/QA review to decide whether they should be reconciled --
 * see this dispatch's handoff notes.
 *
 * WORKSPACE SCOPING: Consignor is a multi-tenant table keyed by workspaceId ->
 * OrganizerWorkspace. Every grouping and every notification below is keyed strictly by
 * workspaceId so one organizer's aging-item data can never leak into another organizer's
 * notification. See the workspace-scoping comments inline below.
 *
 * IDEMPOTENCY: Item.unclaimedNotifiedAt is stamped on every item included in a sent batch,
 * so the daily sweep's `unclaimedNotifiedAt: null` filter excludes it from every future run.
 * There is no un-stamping path -- if a consignor's returnPeriodDays is later shortened or
 * lengthened, an item already notified stays notified (matches consignorExpiryNoticeJob's
 * own "notify once" posture).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Plain-language nudge appended per consignor line, keyed off their on-file
// unsoldItemDisposition. Distinct from consignorExpiryNoticeJob.ts's ORGANIZER_DISPOSITION_STEPS
// (that copy is written per-item, at a fixed 60-day mark, for a single item's next step) --
// this copy summarizes a whole consignor's batch of aging items in one line.
const DISPOSITION_NUDGE: Record<'RETURN' | 'DONATE' | 'RELIST', string> = {
  RETURN: 'their on-file plan is to return unsold items -- worth setting these aside for pickup.',
  DONATE: 'their on-file plan is to donate unsold items -- these are cleared to donate whenever it suits you.',
  RELIST: 'their on-file plan is to relist unsold items -- consider a markdown or a fresh listing push.',
};

const dispositionNudge = (disposition: string | null): string =>
  disposition && disposition in DISPOSITION_NUDGE
    ? DISPOSITION_NUDGE[disposition as 'RETURN' | 'DONATE' | 'RELIST']
    : 'there is no return/donate/relist preference on file for them -- worth reaching out to decide what happens next.';

export const scheduleConsignmentUnclaimedItemsCron = (): void => {
  // Daily at 2:20 AM UTC -- a few minutes after the existing 2:00/2:10 AM consignor-related
  // crons (reputationScoreCron, consignorExpiryNoticeJob) so they don't all open DB
  // connections at the same instant.
  cron.schedule(
    '20 2 * * *',
    cronGuard({ jobName: 'consignmentUnclaimedItemsJob' }, async () => {
      console.log('[consignment-unclaimed-cron] Starting unclaimed consigned items sweep...');
      await processUnclaimedConsignmentItems();
      console.log('[consignment-unclaimed-cron] Starting relist-cap-exceeded sweep...');
      await processRelistCapExceededItems();
    })
  );
};

// Relist Cap (2026-09-25, Patrick): "we're not a pawn shop, no automatic disposal" --
// consigned items on a RELIST disposition were relisting on the floor forever with no
// ceiling. Researched real-world consignment-shop practice (60-120 day total period,
// escalating markdowns, and critically NO silent auto-renewal -- either a notify + short
// pickup window, an opt-in extension, or a hard ceiling) informed WorkspaceSettings.
// maxRelistDays (default 90 -- one additional full cycle past Consignor.returnPeriodDays,
// itself default 90). When a RELIST item has been unsold for returnPeriodDays +
// maxRelistDays total, this sweep flags it for a staff decision -- reusing the exact same
// per-workspace/per-consignor grouping, notification, and idempotent-stamp pattern as
// processUnclaimedConsignmentItems above, just with its own trigger (RELIST-only, a later
// threshold) and its own stamp column (Item.relistCapFlaggedAt) so it doesn't collide with
// that job's unclaimedNotifiedAt (a RELIST item typically hits the returnPeriodDays-only
// unclaimed check first and gets THAT field stamped well before it ever reaches this one).
// NOTIFICATION-ONLY / VISIBILITY-ONLY, same posture as the rest of this file: never
// changes Item.status, never auto-donates/returns/relists anything, never touches a
// payout or Stripe/Square/Finix path. The /organizer/consignors "relist cap" badge
// (relistCapExceededCount, listConsignors in consignorController.ts) is computed live
// against the same returnPeriodDays + maxRelistDays window, independent of this stamp --
// exactly mirroring how the "Unclaimed" badge is independent of unclaimedNotifiedAt.
const DEFAULT_MAX_RELIST_DAYS = 90;

export const processRelistCapExceededItems = async (): Promise<void> => {
  try {
    const now = new Date();

    const candidates = await prisma.item.findMany({
      where: {
        status: 'AVAILABLE',
        consignorId: { not: null },
        relistCapFlaggedAt: null,
        consignor: { unsoldItemDisposition: 'RELIST' },
      },
      select: {
        id: true,
        createdAt: true,
        consignor: {
          select: {
            id: true,
            name: true,
            returnPeriodDays: true,
            workspaceId: true,
            workspace: {
              select: {
                name: true,
                owner: { select: { userId: true } },
                settings: { select: { maxRelistDays: true } },
              },
            },
          },
        },
      },
    });

    // Keep only items that have crossed THEIR OWN consignor's returnPeriodDays plus
    // THEIR OWN workspace's maxRelistDays (or the platform default if unset) -- never a
    // shared/global cutoff, matching processUnclaimedConsignmentItems's own approach.
    const exceeded = candidates.filter((item) => {
      if (!item.consignor) return false;
      const maxRelistDays = item.consignor.workspace?.settings?.maxRelistDays ?? DEFAULT_MAX_RELIST_DAYS;
      const totalDays = item.consignor.returnPeriodDays + maxRelistDays;
      const cutoff = new Date(now.getTime() - totalDays * MS_PER_DAY);
      return item.createdAt < cutoff;
    });

    if (exceeded.length === 0) {
      console.log('[relist-cap-cron] No newly-relist-cap-exceeded items found');
      return;
    }

    interface ConsignorBucket {
      name: string;
      itemIds: string[];
    }
    interface WorkspaceGroup {
      organizerUserId: string | null;
      consignors: Map<string, ConsignorBucket>;
    }
    const byWorkspace = new Map<string, WorkspaceGroup>();

    for (const item of exceeded) {
      const c = item.consignor!;
      let group = byWorkspace.get(c.workspaceId);
      if (!group) {
        group = { organizerUserId: c.workspace?.owner?.userId || null, consignors: new Map() };
        byWorkspace.set(c.workspaceId, group);
      }
      let bucket = group.consignors.get(c.id);
      if (!bucket) {
        bucket = { name: c.name, itemIds: [] };
        group.consignors.set(c.id, bucket);
      }
      bucket.itemIds.push(item.id);
    }

    console.log(
      `[relist-cap-cron] Found ${exceeded.length} newly-relist-cap-exceeded item(s) across ${byWorkspace.size} workspace(s)`
    );

    for (const [workspaceId, group] of byWorkspace.entries()) {
      try {
        const consignorBuckets = Array.from(group.consignors.values());
        const totalItems = consignorBuckets.reduce((sum, b) => sum + b.itemIds.length, 0);
        const itemWord = totalItems === 1 ? 'item' : 'items';
        const title = `${totalItems} relisted consigned ${itemWord} need a decision`;
        const lines = consignorBuckets.map((b) => `${b.name} (${b.itemIds.length} ${b.itemIds.length === 1 ? 'item' : 'items'})`);
        const body =
          `${totalItems} RELIST-disposition consigned ${itemWord} from ${consignorBuckets.length} consignor(s) have passed the workspace's relist cap without selling: ` +
          lines.join(', ') +
          '. This is a visibility flag only -- nothing was donated, returned, or otherwise changed automatically. Decide next steps for each item yourself on the Consignors page.';

        if (group.organizerUserId) {
          await createNotification(
            group.organizerUserId,
            'CONSIGNOR_RELIST_CAP_EXCEEDED',
            title,
            body,
            '/organizer/consignors',
            'OPERATIONAL',
            true,
            title
          );
        } else {
          console.warn(
            `[relist-cap-cron] Workspace ${workspaceId} has no resolvable owner userId, skipping notification`
          );
        }

        const itemIds = consignorBuckets.flatMap((b) => b.itemIds);
        await prisma.item.updateMany({
          where: { id: { in: itemIds } },
          data: { relistCapFlaggedAt: now },
        });
      } catch (err) {
        console.error(`[relist-cap-cron] Failed processing workspace ${workspaceId}:`, err);
      }
    }

    console.log('[relist-cap-cron] Relist-cap-exceeded sweep completed');
  } catch (err) {
    console.error('[relist-cap-cron] Job failed:', err);
  }
};

export const processUnclaimedConsignmentItems = async (): Promise<void> => {
  try {
    const now = new Date();

    // Candidate pool: every AVAILABLE consigned item never notified for this yet. Each
    // consignor's returnPeriodDays can differ, so the "has this item crossed its window"
    // check can't be expressed as a single fixed-cutoff Prisma `where` -- it's applied in JS
    // below instead, against the pool this filter already narrows to consigned/available/
    // not-yet-notified items (kept small by the Item_consignorId_status_unclaimedNotifiedAt_idx
    // index added alongside this job).
    const candidates = await prisma.item.findMany({
      where: {
        status: 'AVAILABLE',
        consignorId: { not: null },
        unclaimedNotifiedAt: null,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        consignor: {
          select: {
            id: true,
            name: true,
            returnPeriodDays: true,
            unsoldItemDisposition: true,
            workspaceId: true,
            workspace: {
              select: {
                id: true,
                name: true,
                owner: { select: { userId: true } },
              },
            },
          },
        },
      },
    });

    // Keep only items that have actually crossed THEIR OWN consignor's window -- never a
    // shared/global cutoff.
    const unclaimed = candidates.filter((item) => {
      if (!item.consignor) return false;
      const cutoff = new Date(now.getTime() - item.consignor.returnPeriodDays * MS_PER_DAY);
      return item.createdAt < cutoff;
    });

    if (unclaimed.length === 0) {
      console.log('[consignment-unclaimed-cron] No newly-unclaimed items found');
      return;
    }

    // WORKSPACE SCOPING: grouped strictly by Consignor.workspaceId, the multi-tenant
    // boundary on this table (Consignor.workspaceId -> OrganizerWorkspace, schema.prisma
    // ~line 5391). Every map key below is a workspaceId -- there is no step anywhere in
    // this job that merges, joins, or compares data across two different workspaceIds, so
    // one organizer's batch can never include another organizer's consignor or item data.
    interface ConsignorBucket {
      name: string;
      disposition: string | null;
      itemIds: string[];
    }
    interface WorkspaceGroup {
      workspaceName: string;
      organizerUserId: string | null;
      consignors: Map<string, ConsignorBucket>; // keyed by consignorId, itself workspace-scoped
    }
    const byWorkspace = new Map<string, WorkspaceGroup>();

    for (const item of unclaimed) {
      const c = item.consignor!;
      let group = byWorkspace.get(c.workspaceId);
      if (!group) {
        group = {
          workspaceName: c.workspace?.name || 'your workspace',
          organizerUserId: c.workspace?.owner?.userId || null,
          consignors: new Map(),
        };
        byWorkspace.set(c.workspaceId, group);
      }
      let bucket = group.consignors.get(c.id);
      if (!bucket) {
        bucket = { name: c.name, disposition: c.unsoldItemDisposition, itemIds: [] };
        group.consignors.set(c.id, bucket);
      }
      bucket.itemIds.push(item.id);
    }

    console.log(
      `[consignment-unclaimed-cron] Found ${unclaimed.length} newly-unclaimed item(s) across ${byWorkspace.size} workspace(s)`
    );

    for (const [workspaceId, group] of byWorkspace.entries()) {
      try {
        const consignorBuckets = Array.from(group.consignors.values());
        const totalItems = consignorBuckets.reduce((sum, b) => sum + b.itemIds.length, 0);
        const itemWord = totalItems === 1 ? 'item' : 'items';
        const consignorWord = consignorBuckets.length === 1 ? 'consignor' : 'consignors';

        const title = `${totalItems} consigned ${itemWord} past their return window`;

        const lines = consignorBuckets.map((b) => {
          const count = b.itemIds.length;
          const bItemWord = count === 1 ? 'item' : 'items';
          return `${b.name} (${count} ${bItemWord}): ${dispositionNudge(b.disposition)}`;
        });

        const body =
          `${totalItems} consigned ${itemWord} from ${consignorBuckets.length} ${consignorWord} have been listed longer than their return window without selling. ` +
          lines.join(' ') +
          ' This is an informational nudge only -- no items were changed automatically. Review each consignor\'s on-file plan and take action yourself when you\'re ready.';

        // WORKSPACE SCOPING (continued): organizerUserId is read only from THIS group's own
        // OrganizerWorkspace.owner, resolved above from THIS workspaceId -- never from a
        // different group's data.
        if (group.organizerUserId) {
          await createNotification(
            group.organizerUserId,
            'CONSIGNOR_ITEMS_UNCLAIMED',
            title,
            body,
            '/organizer/consignors',
            'OPERATIONAL',
            true,
            title
          );
        } else {
          // Should not happen -- OrganizerWorkspace.ownerId and Organizer.userId are both
          // required, non-nullable columns. Logged defensively rather than assumed away.
          console.warn(
            `[consignment-unclaimed-cron] Workspace ${workspaceId} has no resolvable owner userId, skipping notification`
          );
        }

        // Stamp every item in this workspace's batch as notified so the next run's
        // `unclaimedNotifiedAt: null` filter excludes them, regardless of whether the
        // notification above actually reached an inbox (matches createNotification's own
        // fail-open contract -- a missing owner or a failed send must not make this job
        // retry the same items forever).
        const itemIds = consignorBuckets.flatMap((b) => b.itemIds);
        await prisma.item.updateMany({
          where: { id: { in: itemIds } },
          data: { unclaimedNotifiedAt: now },
        });
      } catch (err) {
        console.error(`[consignment-unclaimed-cron] Failed processing workspace ${workspaceId}:`, err);
      }
    }

    console.log('[consignment-unclaimed-cron] Unclaimed consigned items sweep completed');
  } catch (err) {
    console.error('[consignment-unclaimed-cron] Job failed:', err);
  }
};
