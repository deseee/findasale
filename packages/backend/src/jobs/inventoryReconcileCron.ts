/**
 * inventoryReconcileCron.ts -- every 15 minutes, the net under the single in-stock number.
 *
 * Patrick's rule: ONE platform-owned in-stock number (COALESCE(stockTotal, 1) - stockSold) is synced to every market
 * automatically. The sale and edit paths push that number out as it changes (services/inventoryStockSync.ts). This sweep
 * catches whatever slipped past them (a failed push, a hook that never ran, a listing edited by hand on the market) by
 * comparing each market's live count to the platform number and pushing the platform number out again.
 *
 * What it does, per run:
 *  0. One-time legacy cleanup (deps.fixLegacyKitDontList, itemKitService.fixLegacyKitDontList): clears the old Phase 1 'DONT_LIST' override
 *     from kits created before kits became listable on every marketplace. Marker-guarded, so it changes anything exactly once.
 *  1. Kit sweep: kits whose stored stockTotal no longer matches their components are recomputed (derived totals only).
 *     Recomputed kits are then pushed to their markets with syncItemStock.
 *  2. For each organizer, a bounded, rotating batch of candidate items (live on eBay, Etsy or Shopify, or multi-unit on a
 *     market that cannot take a count) is compared with checkOnly. Drift is repaired by a normal sync and re-checked.
 *  3. The organizer gets ONE deduped in-app notification only when something is still wrong after the repair, failed,
 *     or can only be fixed by hand (markets that cannot take a count).
 *
 * It NEVER writes a stock count itself. stockTotal / stockSold change only through sales and organizer edits; the one
 * exception is the kit total, which is derived from the components by itemKitStock and is recomputed here.
 * Idempotent: running it twice in a row changes nothing the second time. Per-organizer try/catch; one failure never
 * blocks the others. Stops early when the daily eBay call budget is used up.
 */
import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { isEbayRateLimited, getEbayRateLimitStatus } from '../lib/ebayRateLimiter';
import { createNotification } from '../lib/notificationService';
import { syncItemStock } from '../services/inventoryStockSync';
import type { MarketName, MarketSyncStatus, StockSyncResult } from '../services/inventoryStockSync';
import { findStaleKits, recomputeAllKitStock } from '../services/itemKitStock';
import type { StaleKit } from '../services/itemKitStock';
import { fixLegacyKitDontList } from '../services/itemKitService';

export const INVENTORY_RECONCILE_ALERT_TYPE = 'inventory_reconcile_drift';
const ALERT_DEDUPE_DAYS = 3;
const BATCH_SIZE = 25;
const DEFAULT_MAX_ITEMS_PER_RUN = 150;
const ID_LIST_CAP = 50;
const NO_COUNT_MARKETS_NOTE = 'These listings can\'t take a stock count automatically';

/**
 * FINDASALE-NODEJS-96 (2026-10-23): the check pass READS each market's live count. eBay's Inventory API intermittently
 * answers those reads with HTTP 500 errorId 25001 ("A system error has occurred"): Railway logs for 21 runs on 10-22/23
 * showed 0 drift and 0 still-drifting every run, but 49 read failures spread over 44 different items, almost all
 * failing once and reading fine on the next pass. Each such run raised a Sentry warning and could send the organizer
 * "We could not update the stock count" although nothing was updated or wrong. A 5xx/429 on a check-pass read is
 * now recorded as skipped (retried on the next rotation); only when the SAME item+market fails that way
 * TRANSIENT_STREAK_TO_REPORT checks in a row is it reported as failed. Non-transient failures (expired token, 4xx)
 * are reported immediately, as before.
 *
 * 2026-10-24 follow-up: the two events after that fix (10-24 01:17 "Kansas Song for America" item
 * cmt3dxydz01wia4xvv1bfe08m, 10-25 00:46 "Monster Energy branded Flags" item cmv9o1nrj012ad4uz9tpnqnqv) were the same
 * one-off pattern with a different code: GET inventory_item answered HTTP 404 errorId 25710 ("We didn't find the
 * resource") for a SKU whose offer eBay had just returned as PUBLISHED in the same pass. A published offer cannot exist
 * without its inventory item, and a direct read of both SKUs ("FAS-<id> <date>") on 2026-10-25 returned 200 with the
 * listing live, so that 404 is eBay-side read inconsistency, not a missing listing. It now gets the same 3-in-a-row
 * streak treatment. Any other 4xx (expired token, a real 404 on the offer itself, a rejected PUT) is still immediate.
 */
const TRANSIENT_READ_FAILURE_RE = /\(HTTP (5\d\d|429)\)|^eBay did not return the inventory item \(HTTP 404\).*\b25710\b/;
const TRANSIENT_STREAK_TO_REPORT = 3;
const transientStreaks = new Map<string, number>();

export interface ReconcileRepaired {
  itemId: string;
  title: string;
  market: MarketName;
  expected: number;
  live: number | null;
  fixed: boolean;
}
export interface ReconcileManual {
  itemId: string;
  title: string;
  markets: MarketName[];
}
export interface ReconcileProblem {
  itemId: string;
  title: string;
  market: MarketName | 'unknown';
  status: MarketSyncStatus;
  detail?: string;
}
export interface InventoryReconcileReport {
  itemsChecked: number;
  kitsStale: number;
  kitsRecomputed: number;
  kitsPushed: number;
  /** Drift found by the check pass (also in dryRun, where nothing is repaired). */
  drift: Array<{ itemId: string; title: string; market: MarketName; expected: number; live: number | null }>;
  repaired: ReconcileRepaired[];
  manual: ReconcileManual[];
  failed: ReconcileProblem[];
  skipped: ReconcileProblem[];
  organizersProcessed: number;
  organizersFailed: number;
  stoppedEarly?: 'item_cap' | 'ebay_rate_limited';
  notified: number;
  /** Set only on the run that performed the one-time legacy kit DONT_LIST cleanup. */
  kitsDontListCleared?: number;
}

export interface ReconcileCandidate {
  id: string;
  title: string;
}

export interface ReconcileDeps {
  listOrganizerIds(): Promise<string[]>;
  /** Next batch of candidate items for one organizer, ordered by id, strictly after `afterId`. */
  loadCandidates(organizerId: string, afterId: string | null, take: number): Promise<ReconcileCandidate[]>;
  findStaleKits(): Promise<StaleKit[]>;
  recomputeAllKits(): Promise<number>;
  findOrganizerUserId(organizerId: string): Promise<string | null>;
  hasRecentAlert(userId: string, since: Date): Promise<boolean>;
  createAlert(input: { userId: string; title: string; body: string; link: string }): Promise<void>;
  isEbayRateLimited(): boolean;
  now(): Date;
  /** Optional (2026-10-13): the one-time clean-up of DONT_LIST on kits. Absent in fakes that predate it = skipped. */
  fixLegacyKitDontList?(): Promise<{ ran: boolean; fixed: number }>;
}

// ---------------------------------------------------------------------------
// Real dependencies
// ---------------------------------------------------------------------------

const CANDIDATE_STATUSES = ['AVAILABLE', 'RESERVED', 'INVOICE_ISSUED'];

async function listOrganizerIdsReal(): Promise<string[]> {
  const ids = new Set<string>();
  const [ebay, etsy, shopify, multi] = await Promise.all([
    prisma.ebayConnection.findMany({ select: { organizerId: true } }),
    prisma.etsyListing.findMany({ where: { state: 'ACTIVE' }, select: { organizerId: true }, distinct: ['organizerId'] }),
    prisma.shopifyListing.findMany({ where: { status: 'ACTIVE' }, select: { organizerId: true }, distinct: ['organizerId'] }),
    prisma.item.findMany({
      where: {
        deletedAt: null,
        organizerId: { not: null },
        stockTotal: { gt: 1 },
        status: { in: CANDIDATE_STATUSES },
        marketplaceJobs: { some: { action: 'POST', status: 'POSTED' } },
      },
      select: { organizerId: true },
      distinct: ['organizerId'],
    }),
  ]);
  for (const r of ebay) if (r.organizerId) ids.add(r.organizerId);
  for (const r of etsy) if (r.organizerId) ids.add(r.organizerId);
  for (const r of shopify) if (r.organizerId) ids.add(r.organizerId);
  for (const r of multi) if (r.organizerId) ids.add(r.organizerId);
  return Array.from(ids);
}

async function loadCandidatesReal(organizerId: string, afterId: string | null, take: number): Promise<ReconcileCandidate[]> {
  const etsyRows = await prisma.etsyListing.findMany({
    where: { organizerId, state: 'ACTIVE' },
    select: { itemId: true },
  });
  const etsyItemIds = etsyRows.map((r) => r.itemId);
  const marketOr: Array<Record<string, unknown>> = [
    { ebayOfferId: { not: null } },
    { shopifyListing: { is: { status: 'ACTIVE' } } },
    { stockTotal: { gt: 1 }, marketplaceJobs: { some: { action: 'POST', status: 'POSTED' } } },
  ];
  if (etsyItemIds.length > 0) marketOr.push({ id: { in: etsyItemIds } });
  const rows = await prisma.item.findMany({
    where: {
      AND: [
        { OR: [{ organizerId }, { sale: { organizerId } }] },
        { OR: marketOr },
      ],
      deletedAt: null,
      status: { in: CANDIDATE_STATUSES },
      draftStatus: { not: 'DRAFT' },
      listingType: { notIn: ['CONSIGNOR_TAG'] }, // 2026-10-13: kits are listed on markets like any item, so they are swept too
      bulkLot: { is: null },
      ...(afterId ? { id: { gt: afterId } } : {}),
    } as any,
    select: { id: true, title: true },
    orderBy: { id: 'asc' },
    take,
  });
  return rows.map((r) => ({ id: r.id, title: r.title }));
}

/**
 * The sweep reads eBay (two calls per eBay item per check) from the SAME in-process daily counter that publishing, price sync and
 * the sold sync use. It stops once HALF of the daily budget is spent so it can never starve those paths (the real limiter only
 * trips at 100%, by which time the sweep alone could have used the whole day's budget).
 */
const RECONCILE_EBAY_BUDGET_SHARE = 0.5;
function reconcileEbayBudgetSpent(): boolean {
  if (isEbayRateLimited()) return true;
  const status = getEbayRateLimitStatus();
  return status.callCount >= status.limit * RECONCILE_EBAY_BUDGET_SHARE;
}

export const realReconcileDeps: ReconcileDeps = {
  listOrganizerIds: listOrganizerIdsReal,
  loadCandidates: loadCandidatesReal,
  findStaleKits: () => findStaleKits(prisma as any),
  recomputeAllKits: () => recomputeAllKitStock(prisma as any),
  findOrganizerUserId: async (organizerId) => {
    const o = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { userId: true } });
    return o ? o.userId : null;
  },
  hasRecentAlert: async (userId, since) => {
    const recent = await prisma.notification.findFirst({
      where: { userId, type: INVENTORY_RECONCILE_ALERT_TYPE, createdAt: { gte: since } },
      select: { id: true },
    });
    return !!recent;
  },
  createAlert: async ({ userId, title, body, link }) => {
    await createNotification({ userId, type: INVENTORY_RECONCILE_ALERT_TYPE, title, body, link });
  },
  isEbayRateLimited: reconcileEbayBudgetSpent,
  now: () => new Date(),
  fixLegacyKitDontList: () => fixLegacyKitDontList(),
};

// ---------------------------------------------------------------------------
// Rotating cursor so a capped run continues where the last one stopped
// ---------------------------------------------------------------------------

const cursors = new Map<string, string>();
export function resetReconcileCursors(): void {
  cursors.clear();
  transientStreaks.clear();
}

function maxItemsPerRun(): number {
  const n = parseInt(process.env.INVENTORY_RECONCILE_MAX_ITEMS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ITEMS_PER_RUN;
}

function emptyReport(): InventoryReconcileReport {
  return {
    itemsChecked: 0,
    kitsStale: 0,
    kitsRecomputed: 0,
    kitsPushed: 0,
    drift: [],
    repaired: [],
    manual: [],
    failed: [],
    skipped: [],
    organizersProcessed: 0,
    organizersFailed: 0,
    notified: 0,
  };
}

// ---------------------------------------------------------------------------
// Per-item work
// ---------------------------------------------------------------------------

async function reconcileOneItem(candidate: ReconcileCandidate, report: InventoryReconcileReport, dryRun: boolean): Promise<void> {
  const check: StockSyncResult = await syncItemStock(candidate.id, 'reconcile', { checkOnly: true });
  report.itemsChecked++;

  const driftOutcomes = check.outcomes.filter((o) => o.status === 'drift');
  for (const o of driftOutcomes) {
    report.drift.push({ itemId: candidate.id, title: candidate.title, market: o.market, expected: o.expected, live: o.live ?? null });
  }

  const manualMarkets = check.outcomes.filter((o) => o.status === 'manual').map((o) => o.market);
  if (manualMarkets.length > 0 && check.inStock > 1) {
    report.manual.push({ itemId: candidate.id, title: candidate.title, markets: manualMarkets });
  }

  for (const o of check.outcomes) {
    const streakKey = `${candidate.id}:${o.market}`;
    if (o.status === 'failed') {
      if (TRANSIENT_READ_FAILURE_RE.test(o.detail ?? '')) {
        const streak = (transientStreaks.get(streakKey) ?? 0) + 1;
        transientStreaks.set(streakKey, streak);
        if (streak < TRANSIENT_STREAK_TO_REPORT) {
          report.skipped.push({ itemId: candidate.id, title: candidate.title, market: o.market, status: 'skipped', detail: `temporary market error, will retry: ${o.detail}` });
          continue;
        }
      } else {
        transientStreaks.delete(streakKey);
      }
      report.failed.push({ itemId: candidate.id, title: candidate.title, market: o.market, status: o.status, detail: o.detail });
    } else {
      transientStreaks.delete(streakKey);
      if (o.status === 'skipped') report.skipped.push({ itemId: candidate.id, title: candidate.title, market: o.market, status: o.status, detail: o.detail });
    }
  }

  if (driftOutcomes.length === 0 || dryRun) return;

  // Repair: push the platform number out, then re-check against the live market value.
  const repair = await syncItemStock(candidate.id, 'reconcile');
  const recheck = await syncItemStock(candidate.id, 'reconcile', { checkOnly: true });
  for (const d of driftOutcomes) {
    const after = recheck.outcomes.find((o) => o.market === d.market);
    const repairOutcome = repair.outcomes.find((o) => o.market === d.market);
    const fixed = !!after && after.status !== 'drift' && after.status !== 'failed';
    report.repaired.push({
      itemId: candidate.id,
      title: candidate.title,
      market: d.market,
      expected: d.expected,
      live: (after && after.live !== undefined ? after.live : d.live) ?? null,
      fixed,
    });
    if (!fixed && repairOutcome && repairOutcome.status === 'failed') {
      report.failed.push({ itemId: candidate.id, title: candidate.title, market: d.market, status: 'failed', detail: repairOutcome.detail });
    }
  }
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

function marketLabel(m: MarketName): string {
  const names: Record<string, string> = {
    ebay: 'eBay', etsy: 'Etsy', shopify: 'Shopify', kits: 'Kits', reverb: 'Reverb', discogs: 'Discogs',
    facebook: 'Facebook', craigslist: 'Craigslist', vinted: 'Vinted', poshmark: 'Poshmark', mercari: 'Mercari',
    grailed: 'Grailed', tcgplayer: 'TCGplayer',
  };
  return names[m] || m;
}

/** Builds the plain-language notification body, or null when there is nothing the organizer needs to know. */
export function buildReconcileMessage(r: {
  repaired: ReconcileRepaired[];
  manual: ReconcileManual[];
  failed: ReconcileProblem[];
}): { title: string; body: string } | null {
  const persisting = r.repaired.filter((x) => !x.fixed);
  const fixed = r.repaired.filter((x) => x.fixed);
  if (persisting.length === 0 && r.failed.length === 0 && r.manual.length === 0) return null;

  const parts: string[] = [];
  if (fixed.length > 0) {
    const byMarket = new Map<MarketName, Set<string>>();
    for (const f of fixed) {
      const set = byMarket.get(f.market) ?? new Set<string>();
      set.add(f.itemId);
      byMarket.set(f.market, set);
    }
    for (const [m, set] of byMarket) parts.push(`Stock counts were corrected on ${marketLabel(m)} for ${set.size} item${set.size === 1 ? '' : 's'}.`);
  }
  if (persisting.length > 0) {
    const items = new Set(persisting.map((x) => x.itemId)).size;
    const markets = Array.from(new Set(persisting.map((x) => marketLabel(x.market)))).join(', ');
    parts.push(`${items} item${items === 1 ? '' : 's'} still ${items === 1 ? 'shows' : 'show'} a different stock count on ${markets}. We will keep trying.`);
  }
  if (r.failed.length > 0) {
    const items = new Set(r.failed.map((x) => x.itemId)).size;
    parts.push(`We could not update the stock count for ${items} item${items === 1 ? '' : 's'}.`);
  }
  if (r.manual.length > 0) {
    const sample = r.manual.slice(0, 5).map((m) => `${m.title} (${m.markets.map(marketLabel).join(', ')})`).join('; ');
    const more = r.manual.length > 5 ? `; and ${r.manual.length - 5} more` : '';
    parts.push(`${NO_COUNT_MARKETS_NOTE}: ${sample}${more}. Update them by hand when you sell a unit.`);
  }
  return { title: 'Some stock counts need a look', body: parts.join(' ') };
}

async function notifyOrganizer(
  deps: ReconcileDeps,
  organizerId: string,
  slice: { repaired: ReconcileRepaired[]; manual: ReconcileManual[]; failed: ReconcileProblem[] }
): Promise<boolean> {
  const msg = buildReconcileMessage(slice);
  if (!msg) return false;
  const userId = await deps.findOrganizerUserId(organizerId);
  if (!userId) return false;
  const since = new Date(deps.now().getTime() - ALERT_DEDUPE_DAYS * 24 * 60 * 60 * 1000);
  if (await deps.hasRecentAlert(userId, since)) return false;
  await deps.createAlert({ userId, title: msg.title, body: msg.body, link: '/organizer/platforms' });
  return true;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function runInventoryReconcile(
  opts: { organizerId?: string; dryRun?: boolean } = {},
  deps: ReconcileDeps = realReconcileDeps
): Promise<InventoryReconcileReport> {
  const dryRun = !!opts.dryRun;
  const report = emptyReport();
  let budget = maxItemsPerRun();

  // 0. One-time legacy cleanup (kits that still carry the old Phase 1 DONT_LIST override). Never blocks the sweep.
  if (!dryRun && deps.fixLegacyKitDontList) {
    try {
      const fix = await deps.fixLegacyKitDontList();
      if (fix.ran) {
        report.kitsDontListCleared = fix.fixed;
        console.log(`[Inventory Reconcile] cleared the legacy DONT_LIST override on ${fix.fixed} kit(s)`);
      }
    } catch (err) {
      console.error('[Inventory Reconcile] legacy kit DONT_LIST cleanup failed (will retry next run):', err);
    }
  }

  // 1. Kit sweep first: derived kit totals, then push the corrected number to the kits' markets.
  try {
    const stale = await deps.findStaleKits();
    report.kitsStale = stale.length;
    if (stale.length > 0 && !dryRun) {
      report.kitsRecomputed = await deps.recomputeAllKits();
      for (const k of stale) {
        try {
          const res = await syncItemStock(k.kitId, 'reconcile-kit');
          report.kitsPushed++;
          for (const o of res.outcomes) {
            if (o.status === 'failed') report.failed.push({ itemId: k.kitId, title: k.title, market: o.market, status: o.status, detail: o.detail });
          }
        } catch (err) {
          console.warn(`[Inventory Reconcile] kit push failed for ${k.kitId}:`, (err as Error)?.message);
        }
      }
    }
  } catch (err) {
    console.error('[Inventory Reconcile] kit sweep failed:', err);
  }

  // 2. Organizers.
  let organizerIds: string[];
  try {
    organizerIds = opts.organizerId ? [opts.organizerId] : await deps.listOrganizerIds();
  } catch (err) {
    console.error('[Inventory Reconcile] could not list organizers:', err);
    return report;
  }

  for (const organizerId of organizerIds) {
    if (budget <= 0) {
      report.stoppedEarly = 'item_cap';
      break;
    }
    if (deps.isEbayRateLimited()) {
      report.stoppedEarly = 'ebay_rate_limited';
      break;
    }
    const mine = emptyReport();
    try {
      let afterId = cursors.get(organizerId) ?? null;
      let exhausted = false;
      while (budget > 0 && !exhausted) {
        const requested = Math.min(BATCH_SIZE, budget);
        const batch = await deps.loadCandidates(organizerId, afterId, requested);
        if (batch.length === 0) {
          exhausted = true;
          break;
        }
        for (const candidate of batch) {
          if (deps.isEbayRateLimited()) {
            report.stoppedEarly = 'ebay_rate_limited';
            budget = 0;
            break;
          }
          afterId = candidate.id;
          budget--;
          try {
            await reconcileOneItem(candidate, mine, dryRun);
          } catch (err) {
            // syncItemStock never throws, but loadCandidates-side or fake errors must not stop the batch.
            mine.failed.push({ itemId: candidate.id, title: candidate.title, market: 'unknown', status: 'failed', detail: (err as Error)?.message });
          }
          if (budget <= 0) break;
        }
        if (batch.length < requested) exhausted = true;
      }
      if (!exhausted && budget <= 0 && !report.stoppedEarly) report.stoppedEarly = 'item_cap';
      if (exhausted) cursors.delete(organizerId);
      else if (afterId) cursors.set(organizerId, afterId);

      if (!dryRun) {
        const sent = await notifyOrganizer(deps, organizerId, mine);
        if (sent) report.notified++;
      }
      report.organizersProcessed++;
    } catch (err) {
      report.organizersFailed++;
      console.error(`[Inventory Reconcile] Failed for organizer ${organizerId}:`, err);
    }

    report.itemsChecked += mine.itemsChecked;
    report.drift.push(...mine.drift);
    report.repaired.push(...mine.repaired);
    report.manual.push(...mine.manual);
    report.failed.push(...mine.failed);
    report.skipped.push(...mine.skipped);

    if (mine.itemsChecked > 0 && (mine.drift.length > 0 || mine.failed.length > 0 || mine.manual.length > 0)) {
      console.log(
        `[Inventory Reconcile] RESULT ${JSON.stringify({
          organizerId,
          dryRun,
          itemsChecked: mine.itemsChecked,
          counts: { drift: mine.drift.length, repaired: mine.repaired.length, stillDrifting: mine.repaired.filter((x) => !x.fixed).length, manual: mine.manual.length, failed: mine.failed.length, skipped: mine.skipped.length },
          repaired: mine.repaired.slice(0, ID_LIST_CAP),
          manual: mine.manual.slice(0, ID_LIST_CAP),
          failed: mine.failed.slice(0, ID_LIST_CAP),
        })}`
      );
    }
  }

  const stillDrifting = report.repaired.filter((x) => !x.fixed).length;
  if (stillDrifting > 0 || report.failed.length > 0) {
    Sentry.captureMessage('Inventory reconcile: stock drift persists or sync failed', {
      level: 'warning',
      extra: { stillDrifting, failed: report.failed.length, itemsChecked: report.itemsChecked, sampleFailed: report.failed.slice(0, 5) },
    });
  }

  if (report.itemsChecked > 0 || report.kitsStale > 0 || report.organizersFailed > 0) {
    console.log(
      `[Inventory Reconcile] RESULT ${JSON.stringify({
        summary: true,
        dryRun,
        itemsChecked: report.itemsChecked,
        kitsStale: report.kitsStale,
        kitsRecomputed: report.kitsRecomputed,
        kitsPushed: report.kitsPushed,
        drift: report.drift.length,
        repaired: report.repaired.length,
        stillDrifting,
        manual: report.manual.length,
        failed: report.failed.length,
        skipped: report.skipped.length,
        organizersProcessed: report.organizersProcessed,
        organizersFailed: report.organizersFailed,
        stoppedEarly: report.stoppedEarly ?? null,
        notified: report.notified,
      })}`
    );
  }
  return report;
}

let running = false;
async function guardedRun(): Promise<void> {
  if (running) return; // a slow run must not overlap the next tick
  // Operator switches (no code change needed): INVENTORY_RECONCILE_DISABLED=true skips the sweep entirely;
  // INVENTORY_RECONCILE_DRY_RUN=true only reports drift (nothing is repaired, nobody is notified).
  if (process.env.INVENTORY_RECONCILE_DISABLED === 'true') return;
  running = true;
  try {
    await runInventoryReconcile({ dryRun: process.env.INVENTORY_RECONCILE_DRY_RUN === 'true' });
  } finally {
    running = false;
  }
}

export function startInventoryReconcileCron(): void {
  cron.schedule('*/15 * * * *', cronGuard({ jobName: 'inventoryReconcileCron' }, guardedRun));
  // One run shortly after boot so a deploy never leaves drift waiting for the next tick.
  setTimeout(() => {
    cronGuard({ jobName: 'inventoryReconcileCron-boot' }, guardedRun)().catch(() => undefined);
  }, 2 * 60 * 1000);
  console.log('[Inventory Reconcile] Cron registered (every 15 minutes, plus one run ~2 minutes after boot)');
}
