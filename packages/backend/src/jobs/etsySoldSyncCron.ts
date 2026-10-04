/**
 * etsySoldSyncCron.ts -- Etsy sold-sync tick (ADR-135 D5.7, D6.1, D6.2, D6.3; batch E-B4, acceptance 4 to 6).
 *
 * Every 15 minutes (schedule '13,28,43,58 * * * *', offset from the Reverb '11,26,41,56' poll) one tick
 * does, in this order, each part inside its own try/catch so one failure never blocks the next:
 *   0. Kill switch: ETSY_CONNECTOR_ENABLED must be exactly 'true' or the whole tick returns early.
 *   1. POLL (sold ON Etsy, the fallback for the webhook): for every ACTIVE ETSY account that has at least
 *      one ACTIVE EtsyListing and is due, one call per page to getShopReceipts (paid, not canceled,
 *      changed since receiptCursor, oldest change first), then processEtsyTransactions -> recordEtsySale.
 *      Cursor: newest updated_timestamp seen minus 5 minutes, never moved backwards, never moved when a
 *      sale failed to record or when a truncated page was not returned in ascending order. At most
 *      ETSY_POLL_MAX_PAGES pages per account per tick. Interval (D5.7): max(15, ceil(1440 * accounts with
 *      live listings / 2000)) minutes; 60 minutes at least while a webhook arrived in the last 24 hours
 *      (EtsyShopSettings.lastWebhookAt). A failing account never blocks the others.
 *   2. SWEEP (sold ELSEWHERE, backstop for the inline sold paths that have no Etsy call, ADR-135 D-2 A):
 *      per ACTIVE account, the organizer's live EtsyListing rows (state in the withdrawable set, with an
 *      Etsy listing id) are checked against their Item rows in memory:
 *        - Item row gone or soft-deleted, or Item.status SOLD (except lastSoldVia 'ETSY'), or no stock
 *          left (max(stockTotal - stockSold, 0) is 0): withdrawEtsyListingIfExists (up to
 *          ETSY_WITHDRAW_SWEEP_LIMIT per organizer per tick, oldest first; failures stay live and are
 *          retried on a later tick).
 *        - Units remain on an ACTIVE listing whose syncedQuantity differs from what Etsy should hold
 *          (computeEtsyQuantity): updateEtsyListingInventory instead of withdrawing (BACKGROUND, at most
 *          ETSY_RECONCILE_LIMIT per tick across all organizers). Quantity 0 always withdraws, never a
 *          zero-quantity PUT. Listings whose syncedQuantity is null (never synced) are left alone.
 *   3. DRAFT SWEEP: sweepStaleEtsyDrafts (etsyDraftSweep.ts) resumes DRAFT_PENDING rows whose worker died.
 *      It lives in this tick so no separate cron is needed.
 *   4. Budget log line and Sentry thresholds (reportEtsyBudget; alerts at most hourly).
 *
 * Exports a schedule function; it is NOT registered here. The wiring batch calls startEtsySoldSyncCron()
 * from index.ts. Overlapping ticks are refused (a tick still running when the next one fires is skipped).
 *
 * Import safety: no env reads or network at module load; everything is injectable through deps.
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { EtsyError, reportEtsyBudget, scrubEtsySecrets, captureEtsyEvent } from '../services/marketplace/etsyBudget';
import type { EtsyEnv } from '../services/marketplace/etsyBudget';
import { isEtsyConnectorEnabled } from '../services/marketplace/etsyHttp';
import {
  ETSY_WITHDRAWABLE_STATES,
  updateEtsyListingInventory,
  withdrawEtsyListingIfExists,
} from '../services/marketplace/etsyConnector';
import type { EtsyInventoryUpdateResult, EtsyWithdrawOutcome } from '../services/marketplace/etsyConnector';
import { computeEtsyQuantity } from '../services/marketplace/etsyMapping';
import { ETSY_RECEIPT_PAGE_LIMIT, ETSY_MIN_LAST_MODIFIED_SECONDS, fetchEtsyReceiptsPage } from '../services/marketplace/etsyReceipts';
import type { EtsyReceiptsPageResult } from '../services/marketplace/etsyReceipts';
import { processEtsyTransactions } from '../services/marketplace/etsySoldService';
import type { EtsySoldDeps, EtsyTransactionsOutcome } from '../services/marketplace/etsySoldService';
import { sweepStaleEtsyDrafts } from '../services/marketplace/etsyDraftSweep';
import type { EtsyDraftSweepResult } from '../services/marketplace/etsyDraftSweep';

export const ETSY_SOLD_SYNC_SCHEDULE = '13,28,43,58 * * * *';
export const ETSY_POLL_MIN_INTERVAL_MINUTES = 15;
/** Polling may use at most 40 percent of the daily budget: 2,000 of 5,000 calls (D5.7). */
export const ETSY_POLL_DAILY_CALL_SHARE = 2000;
export const ETSY_POLL_WEBHOOK_INTERVAL_MINUTES = 60;
/** A webhook seen this recently lets the poll relax to the 60 minute safety-net interval. */
export const ETSY_WEBHOOK_FRESH_MS = 24 * 60 * 60 * 1000;
/** The cron fires every 15 minutes and may jitter by seconds; a poll counts as due one minute early. */
export const ETSY_POLL_DUE_SLACK_MS = 60 * 1000;
export const ETSY_CURSOR_OVERLAP_MS = 5 * 60 * 1000;
/** First poll for an account with no cursor looks back this far. */
export const ETSY_FIRST_POLL_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
export const ETSY_POLL_MAX_PAGES = 3;
/** Withdrawals per organizer per tick. */
export const ETSY_WITHDRAW_SWEEP_LIMIT = 10;
/** Inventory updates per tick across all organizers (each may cost 2 Etsy calls). */
export const ETSY_RECONCILE_LIMIT = 20;
/** Live listing rows read per organizer per tick (a safety cap; rows are small and no Etsy call is made to read them). */
export const ETSY_SWEEP_SCAN_MAX = 2000;
const ITEM_LOOKUP_CHUNK = 500;
const DAY_MINUTES = 1440;

export interface EtsySoldSyncDeps extends EtsySoldDeps {
  /** Fetch one receipts page. Defaults to fetchEtsyReceiptsPage. */
  fetchReceiptsPage?: (
    args: { organizerId: string; shopId: string; minLastModified: Date; offset: number; limit?: number }
  ) => Promise<EtsyReceiptsPageResult>;
  /** Record the transactions of a page. Defaults to processEtsyTransactions. */
  processTransactions?: (
    args: { shopId: string; organizerId?: string; transactions: any[]; source: 'POLL' }
  ) => Promise<EtsyTransactionsOutcome>;
  /** Withdraw one item's Etsy listing. Defaults to withdrawEtsyListingIfExists. */
  withdraw?: (itemId: string) => Promise<EtsyWithdrawOutcome>;
  /** Push the remaining quantity. Defaults to updateEtsyListingInventory. */
  updateInventory?: (itemId: string) => Promise<EtsyInventoryUpdateResult>;
  /** Resume stale drafts. Defaults to sweepStaleEtsyDrafts. */
  sweepDrafts?: () => Promise<EtsyDraftSweepResult>;
  /** Budget log and alerts. Defaults to reportEtsyBudget. */
  reportBudget?: () => Promise<unknown>;
}

export interface EtsySoldSyncResult {
  skipped: boolean;
  accounts: number;
  accountsWithLiveListings: number;
  pollIntervalMinutes: number;
  polled: number;
  pollNotDue: number;
  pollFailed: number;
  receiptsPages: number;
  recorded: number;
  alreadyRecorded: number;
  unmatched: number;
  withdrawn: number;
  withdrawnGone: number;
  withdrawFailed: number;
  reconcileAttempted: number;
  reconciled: number;
  reconcileFailed: number;
  drafts: EtsyDraftSweepResult | null;
}

function emptyResult(skipped: boolean): EtsySoldSyncResult {
  return {
    skipped,
    accounts: 0,
    accountsWithLiveListings: 0,
    pollIntervalMinutes: ETSY_POLL_MIN_INTERVAL_MINUTES,
    polled: 0,
    pollNotDue: 0,
    pollFailed: 0,
    receiptsPages: 0,
    recorded: 0,
    alreadyRecorded: 0,
    unmatched: 0,
    withdrawn: 0,
    withdrawnGone: 0,
    withdrawFailed: 0,
    reconcileAttempted: 0,
    reconciled: 0,
    reconcileFailed: 0,
    drafts: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

/**
 * D5.7: per-account interval in minutes = max(15, ceil(1440 * accountsWithLiveListings / 2000)); when a
 * webhook has been arriving, at least 60. 30 accounts give 22, 100 accounts give 72, never under 15.
 */
export function computeEtsyPollIntervalMinutes(accountsWithLiveListings: number, webhookActive = false): number {
  const n = Number.isFinite(accountsWithLiveListings) && accountsWithLiveListings > 0 ? Math.floor(accountsWithLiveListings) : 0;
  const base = Math.max(ETSY_POLL_MIN_INTERVAL_MINUTES, Math.ceil((DAY_MINUTES * n) / ETSY_POLL_DAILY_CALL_SHARE));
  return webhookActive ? Math.max(base, ETSY_POLL_WEBHOOK_INTERVAL_MINUTES) : base;
}

export function isEtsyPollDue(lastPollAt: Date | null | undefined, intervalMinutes: number, now: Date): boolean {
  if (!(lastPollAt instanceof Date)) return true;
  return now.getTime() - lastPollAt.getTime() >= intervalMinutes * 60 * 1000 - ETSY_POLL_DUE_SLACK_MS;
}

/** Cursor rule: newest updated_timestamp seen minus 5 minutes, never earlier than the current cursor. */
export function computeNextReceiptCursor(current: Date | null, maxUpdatedAt: Date | null): Date | null {
  if (!maxUpdatedAt) return current;
  const candidate = new Date(maxUpdatedAt.getTime() - ETSY_CURSOR_OVERLAP_MS);
  if (current && current.getTime() >= candidate.getTime()) return current;
  return candidate;
}

export type EtsySweepAction = 'withdraw' | 'reconcile' | 'none';

/**
 * Pure classification of one live listing against its item (ADR-135 D6.1, D6.3, addendum b).
 * Withdraw when the item row is gone or soft-deleted, is SOLD (unless it sold on Etsy), or has no stock
 * left. Reconcile when units remain on an ACTIVE listing whose recorded Etsy quantity differs.
 */
export function classifyLiveEtsyListing(
  listing: { state: string; syncedQuantity: number | null },
  item: { status?: string | null; deletedAt?: Date | null; lastSoldVia?: string | null; stockTotal?: number | null; stockSold?: number | null } | null | undefined
): EtsySweepAction {
  if (!item || item.deletedAt) return 'withdraw';
  if (item.status === 'SOLD') return item.lastSoldVia === 'ETSY' ? 'none' : 'withdraw';
  const remaining = Math.max((item.stockTotal ?? 1) - (item.stockSold ?? 0), 0);
  if (remaining === 0) return 'withdraw';
  if (listing.state === 'ACTIVE' && typeof listing.syncedQuantity === 'number') {
    const target = computeEtsyQuantity({ stockTotal: item.stockTotal, stockSold: item.stockSold });
    if (target >= 1 && target !== listing.syncedQuantity) return 'reconcile';
  }
  return 'none';
}

// ---------------------------------------------------------------------------------------------
// Poll
// ---------------------------------------------------------------------------------------------

type Db = any;

function getDb(deps: EtsySoldSyncDeps): Db {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return deps.db ?? require('../lib/prisma').prisma;
}

const POSITIVE_ID = /^[1-9]\d{0,17}$/;

function isBudgetStop(err: any): boolean {
  return err instanceof EtsyError && (err.code === 'ETSY_BLOCKED' || err.code === 'ETSY_BUDGET' || err.code === 'ETSY_DISABLED');
}

/** Poll one account. Returns 'polled', 'not-due', 'skipped' or 'failed'; throws only EtsyError budget stops. */
export async function pollEtsyReceiptsForAccount(
  organizerId: string,
  opts: { intervalMinutes: number; webhookIntervalMinutes: number },
  deps: EtsySoldSyncDeps,
  result: EtsySoldSyncResult
): Promise<'polled' | 'not-due' | 'skipped' | 'failed'> {
  const db = getDb(deps);
  const env: EtsyEnv = deps.env ?? process.env;
  const now = (deps.now ?? (() => new Date()))();
  const settings: any = (await db.etsyShopSettings.findUnique({ where: { organizerId } })) ?? null;
  if (!settings || !POSITIVE_ID.test(String(settings.shopId))) return 'skipped';

  const webhookActive =
    settings.lastWebhookAt instanceof Date && now.getTime() - settings.lastWebhookAt.getTime() < ETSY_WEBHOOK_FRESH_MS;
  const interval = webhookActive ? Math.max(opts.intervalMinutes, opts.webhookIntervalMinutes) : opts.intervalMinutes;
  if (!isEtsyPollDue(settings.lastReceiptPollAt, interval, now)) return 'not-due';

  const shopId = String(settings.shopId);
  const prevCursor: Date | null = settings.receiptCursor instanceof Date ? settings.receiptCursor : null;
  const since = prevCursor ?? new Date(now.getTime() - ETSY_FIRST_POLL_LOOKBACK_MS);
  const minSince = new Date(ETSY_MIN_LAST_MODIFIED_SECONDS * 1000);
  const start = since.getTime() < minSince.getTime() ? minSince : since;

  const fetchPage = deps.fetchReceiptsPage ?? ((a: any) => fetchEtsyReceiptsPage(a, deps));
  const processTx = deps.processTransactions ?? ((a: any) => processEtsyTransactions(a, deps));

  let offset = 0;
  let pages = 0;
  let maxUpdatedAt: Date | null = null;
  let reachedEnd = false;
  let ordered = true;
  let failedSales = 0;

  for (;;) {
    const page = await fetchPage({ organizerId, shopId, minLastModified: start, offset, limit: ETSY_RECEIPT_PAGE_LIMIT });
    if (!page.ok) {
      console.warn(`[Etsy Sold Sync] receipts fetch failed for organizer ${organizerId}: HTTP ${page.status}`);
      return 'failed';
    }
    pages++;
    result.receiptsPages++;
    if (page.maxUpdatedAt && (!maxUpdatedAt || page.maxUpdatedAt.getTime() > maxUpdatedAt.getTime())) maxUpdatedAt = page.maxUpdatedAt;
    if (!page.ascending) ordered = false;

    if (page.transactions.length > 0) {
      const o = await processTx({ shopId, organizerId, transactions: page.transactions, source: 'POLL' });
      result.recorded += o.recorded;
      result.alreadyRecorded += o.alreadyRecorded;
      result.unmatched += o.unmatched;
      failedSales += o.failed;
    }
    if (page.receiptCount < ETSY_RECEIPT_PAGE_LIMIT) {
      reachedEnd = true;
      break;
    }
    if (pages >= ETSY_POLL_MAX_PAGES) break;
    offset += ETSY_RECEIPT_PAGE_LIMIT;
  }

  if (failedSales > 0) {
    // A sale that could not be recorded must be seen again: keep the cursor and the due time.
    console.warn(`[Etsy Sold Sync] ${failedSales} sale(s) could not be recorded for organizer ${organizerId}; cursor not advanced`);
    return 'failed';
  }

  let nextCursor = prevCursor;
  if (reachedEnd || ordered) {
    nextCursor = computeNextReceiptCursor(prevCursor, maxUpdatedAt);
  } else {
    captureEtsyEvent('warning', 'Etsy receipts came back out of order on a truncated page; poll cursor not advanced', {
      area: 'sync',
      step: 'receipt-order',
      extra: { organizerId, pages },
    }, env);
  }
  await db.etsyShopSettings.update({
    where: { id: settings.id },
    data: { lastReceiptPollAt: now, ...(nextCursor && nextCursor !== prevCursor ? { receiptCursor: nextCursor } : {}) },
  });
  return 'polled';
}

// ---------------------------------------------------------------------------------------------
// Sweep (sold elsewhere) and quantity reconcile
// ---------------------------------------------------------------------------------------------

export interface EtsySweepBudget {
  reconcileLeft: number;
}

export async function sweepEtsyLiveListingsForOrganizer(
  organizerId: string,
  deps: EtsySoldSyncDeps,
  budget: EtsySweepBudget,
  result: EtsySoldSyncResult
): Promise<void> {
  const db = getDb(deps);
  const withdraw = deps.withdraw ?? ((id: string) => withdrawEtsyListingIfExists(id, deps));
  const updateInventory = deps.updateInventory ?? ((id: string) => updateEtsyListingInventory(id, deps));

  const rows: Array<{ id: string; itemId: string; state: string; syncedQuantity: number | null }> = await db.etsyListing.findMany({
    where: { organizerId, etsyListingId: { not: null }, state: { in: [...ETSY_WITHDRAWABLE_STATES] } },
    orderBy: { updatedAt: 'asc' },
    take: ETSY_SWEEP_SCAN_MAX,
    select: { id: true, itemId: true, state: true, syncedQuantity: true },
  });
  if (rows.length === 0) return;

  const itemById = new Map<string, any>();
  const ids = Array.from(new Set(rows.map((r) => r.itemId)));
  for (let i = 0; i < ids.length; i += ITEM_LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + ITEM_LOOKUP_CHUNK);
    const items: any[] = await db.item.findMany({
      where: { id: { in: chunk } },
      select: { id: true, status: true, deletedAt: true, lastSoldVia: true, stockTotal: true, stockSold: true },
    });
    for (const it of items) itemById.set(it.id, it);
  }

  const toWithdraw: string[] = [];
  const toReconcile: string[] = [];
  for (const row of rows) {
    const action = classifyLiveEtsyListing(row, itemById.get(row.itemId));
    if (action === 'withdraw') toWithdraw.push(row.itemId);
    else if (action === 'reconcile') toReconcile.push(row.itemId);
  }

  for (const itemId of toWithdraw.slice(0, ETSY_WITHDRAW_SWEEP_LIMIT)) {
    let outcome: EtsyWithdrawOutcome;
    try {
      outcome = await withdraw(itemId);
    } catch (err: any) {
      outcome = 'failed';
      console.error(`[Etsy Sold Sync] withdraw threw for item ${itemId}:`, scrubEtsySecrets(err?.message || String(err)));
    }
    if (outcome === 'withdrawn') result.withdrawn++;
    else if (outcome === 'gone') result.withdrawnGone++;
    else if (outcome === 'failed') result.withdrawFailed++;
  }

  for (const itemId of toReconcile) {
    if (budget.reconcileLeft <= 0) break;
    budget.reconcileLeft--;
    result.reconcileAttempted++;
    try {
      const r = await updateInventory(itemId);
      if (r.outcome === 'updated') result.reconciled++;
      else if (r.outcome === 'failed') result.reconcileFailed++;
    } catch (err: any) {
      result.reconcileFailed++;
      console.error(`[Etsy Sold Sync] inventory update threw for item ${itemId}:`, scrubEtsySecrets(err?.message || String(err)));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------------------------

export async function runEtsySoldSync(deps: EtsySoldSyncDeps = {}): Promise<EtsySoldSyncResult> {
  const env: EtsyEnv = deps.env ?? process.env;
  if (!isEtsyConnectorEnabled(env)) {
    console.log('[Etsy Sold Sync] ETSY_CONNECTOR_ENABLED is not true; skipping');
    return emptyResult(true);
  }
  const result = emptyResult(false);
  const db = getDb(deps);

  let organizerIds: string[] = [];
  try {
    const accounts: Array<{ organizerId: string }> = await db.marketplaceAccount.findMany({
      where: { platform: 'ETSY', status: 'ACTIVE' },
      select: { organizerId: true },
    });
    organizerIds = accounts.map((a) => a.organizerId);
  } catch (err: any) {
    console.error('[Etsy Sold Sync] could not load Etsy accounts:', scrubEtsySecrets(err?.message || String(err), env));
  }
  result.accounts = organizerIds.length;

  // 1. Poll accounts that have a live listing and are due.
  let liveOrganizers: string[] = [];
  try {
    if (organizerIds.length > 0) {
      const groups: Array<{ organizerId: string }> = await db.etsyListing.groupBy({
        by: ['organizerId'],
        where: { state: 'ACTIVE', organizerId: { in: organizerIds } },
      });
      liveOrganizers = groups.map((g) => g.organizerId);
    }
  } catch (err: any) {
    console.error('[Etsy Sold Sync] could not count accounts with live listings:', scrubEtsySecrets(err?.message || String(err), env));
  }
  result.accountsWithLiveListings = liveOrganizers.length;
  const intervalMinutes = computeEtsyPollIntervalMinutes(liveOrganizers.length, false);
  result.pollIntervalMinutes = intervalMinutes;

  for (const organizerId of liveOrganizers) {
    try {
      const r = await pollEtsyReceiptsForAccount(
        organizerId,
        { intervalMinutes, webhookIntervalMinutes: ETSY_POLL_WEBHOOK_INTERVAL_MINUTES },
        deps,
        result
      );
      if (r === 'polled') result.polled++;
      else if (r === 'not-due') result.pollNotDue++;
      else if (r === 'failed') result.pollFailed++;
    } catch (err: any) {
      result.pollFailed++;
      if (isBudgetStop(err)) {
        console.warn(`[Etsy Sold Sync] polling stopped for this tick: ${err.code}`);
        break;
      }
      // One account failing (needs reauth, a bad response) never blocks the others.
      console.error(`[Etsy Sold Sync] poll failed for organizer ${organizerId}:`, err?.code || scrubEtsySecrets(err?.message || String(err), env));
    }
  }

  // 2. Sweep: withdraw what sold elsewhere, reconcile quantities.
  const budget: EtsySweepBudget = { reconcileLeft: ETSY_RECONCILE_LIMIT };
  for (const organizerId of organizerIds) {
    try {
      await sweepEtsyLiveListingsForOrganizer(organizerId, deps, budget, result);
    } catch (err: any) {
      console.error(`[Etsy Sold Sync] sweep failed for organizer ${organizerId}:`, err?.code || scrubEtsySecrets(err?.message || String(err), env));
    }
  }

  // 3. Resume stale drafts (no separate cron).
  try {
    result.drafts = await (deps.sweepDrafts ?? (() => sweepStaleEtsyDrafts(deps)))();
  } catch (err: any) {
    console.error('[Etsy Sold Sync] draft sweep failed:', scrubEtsySecrets(err?.message || String(err), env));
  }

  // 4. Budget log line and alerts.
  try {
    await (deps.reportBudget ?? (() => reportEtsyBudget({ db, now: deps.now, env })))();
  } catch (err: any) {
    console.warn('[Etsy Sold Sync] budget report failed:', scrubEtsySecrets(err?.message || String(err), env));
  }

  console.log(
    `[Etsy Sold Sync] accounts=${result.accounts} live=${result.accountsWithLiveListings} polled=${result.polled} recorded=${result.recorded} ` +
      `withdrawn=${result.withdrawn + result.withdrawnGone} withdrawFailed=${result.withdrawFailed} reconciled=${result.reconciled}`
  );
  return result;
}

let running = false;

/** Schedule the tick. Not called in this batch: the wiring batch invokes it from index.ts. */
export function startEtsySoldSyncCron(deps: EtsySoldSyncDeps = {}): void {
  cron.schedule(
    ETSY_SOLD_SYNC_SCHEDULE,
    cronGuard({ jobName: 'etsySoldSyncCron' }, async () => {
      if (running) {
        console.warn('[Etsy Sold Sync] previous tick still running; skipping this one');
        return;
      }
      running = true;
      try {
        await runEtsySoldSync(deps);
      } finally {
        running = false;
      }
    })
  );
  console.log('[Etsy Sold Sync] Cron registered -- runs every 15 minutes');
}
