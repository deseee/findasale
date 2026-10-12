/**
 * soldEmailSourceGuard.ts -- ties a "sold" e-mail to the sale it applies, so the same e-mail (or an OLD e-mail about a
 * listing that has since been relisted) can never consume a unit twice. No schema change.
 *
 * INCIDENT (2026-10-12, deploy 64368baf): the poller's switch from "unread only" to a 3-day window with a
 * ProcessedWebhookEvent marker per Message-ID re-applied e-mails the old poller had already handled (those were \Seen
 * but had no marker yet). For a multi-unit item the organizer had re-marked as listed on Vinted (BCW Dime Tube,
 * cmrnnvn8s000xp9wadwczh3o2) the second application consumed the manually re-posted listing and a second unit.
 * Before this file nothing but the marker tied a sale to its source e-mail.
 *
 * TWO GUARDS (both only active when an e-mail context is set by the poller; wardrobe / extension / manual callers are
 * untouched):
 *  1. PREDATES-LISTING guard: if the platform's LIVE listing row (latest non-REMOVE/SKIPPED row is POST/POSTED) was
 *     created AFTER the e-mail was sent, the e-mail cannot be about that listing. It is a no-op. This is correct for
 *     every marker-loss / bootstrap / replay case: the only way a replayed e-mail finds a live listing is that the
 *     organizer relisted after the original sale, which is exactly the "newer than the e-mail" case.
 *  2. SOURCE-KEY guard: the REMOVE row a unit sale writes is tagged "sold_on_<platform>|src:<hash of the e-mail's
 *     marker key>" (the existing startsWith('sold_on_') relist guard still matches). A later application of the same
 *     e-mail to the same item+platform finds that row and is a no-op, even if a new live row exists.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';

export interface SoldEmailSource {
  /** The ProcessedWebhookEvent marker key, "sold-email:<Label>:<Message-ID|uid:N>". */
  key: string;
  /** When the e-mail was sent/received (envelope date, else INTERNALDATE); null when unknown (date guard is then skipped). */
  sentAt: Date | null;
}

const storage = new AsyncLocalStorage<SoldEmailSource>();

/** Runs `fn` with the e-mail context visible to commitFacebookNativeSale and the listing-record closers below it. */
export function runWithSoldEmailSource<T>(source: SoldEmailSource, fn: () => Promise<T>): Promise<T> {
  return storage.run(source, fn);
}

export function getSoldEmailSource(): SoldEmailSource | undefined {
  return storage.getStore();
}

/** Short stable hash of the marker key (a Message-ID can be long; the column is a plain string). */
export function soldEmailSourceHash(key: string): string {
  return createHash('sha1').update(String(key)).digest('hex').slice(0, 16);
}

export const SOLD_EMAIL_SRC_TAG = '|src:';

/** lastErrorMessage for the unit-sale REMOVE row: `base` alone with no e-mail context, `base|src:<hash>` with one. */
export function soldRowMessage(base: string): string {
  const src = getSoldEmailSource();
  return src ? `${base}${SOLD_EMAIL_SRC_TAG}${soldEmailSourceHash(src.key)}` : base;
}

type Reason = 'predates_live_listing' | 'already_applied_by_this_email';

/**
 * Returns why the current e-mail must NOT be applied to `itemId` on `platform`, or null when it may proceed (also null
 * when there is no e-mail context). Throws on a DB error: callers treat that like any commit failure (no marker, retried).
 */
export async function soldEmailStaleReason(itemId: string, platform: string): Promise<Reason | null> {
  const src = getSoldEmailSource();
  if (!src) return null;
  const db = prisma as any;

  if (src.sentAt && !Number.isNaN(src.sentAt.getTime())) {
    const live = await db.marketplaceListingJob.findFirst({
      where: { itemId, platform, NOT: { action: 'REMOVE', status: 'SKIPPED' } },
      orderBy: { createdAt: 'desc' },
      select: { action: true, status: true, createdAt: true },
    });
    if (live && live.action === 'POST' && live.status === 'POSTED' && live.createdAt && live.createdAt.getTime() > src.sentAt.getTime()) {
      return 'predates_live_listing';
    }
  }
  return null;
}

/** Source-key check (multi-unit path): has THIS e-mail already consumed a unit of this item on this platform? */
export async function soldEmailAlreadyApplied(itemId: string, platform: string): Promise<boolean> {
  const src = getSoldEmailSource();
  if (!src) return false;
  const hit = await (prisma as any).marketplaceListingJob.findFirst({
    where: {
      itemId,
      platform,
      action: 'REMOVE',
      status: 'REMOVED',
      lastErrorMessage: { endsWith: `${SOLD_EMAIL_SRC_TAG}${soldEmailSourceHash(src.key)}` },
    },
    select: { id: true },
  });
  return !!hit;
}
