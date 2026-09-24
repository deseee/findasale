/**
 * platformSoldDetectionService.ts -- platform-parameterized sibling of vintedSoldDetectionService
 * (2026-09-23, ADR-131 multi-marketplace sold emails).
 *
 * WHY: every inbound "you sold it" email (Vinted, Mercari, and the Facebook title fallback) needs
 * the same three steps: (1) resolve the sold listing to exactly one of the organizer's items,
 * (2) close THAT platform's listing record so getPendingRemovals never asks the extension to
 * delete the listing that just sold there, (3) commit the sale through commitFacebookNativeSale
 * (SOLD + lastSoldVia + eBay/Shopify/Discogs withdrawal). Every other still-POSTED platform then
 * shows up in getPendingRemovals and the extension pulls it.
 *
 * MATCHING reuses vintedSoldDetectionService's pure matcher unchanged (it is platform-agnostic:
 * it only sees a list of { itemId, remoteListingId } job rows and the organizer's items):
 *   (a) remote listing id, when the email carries one and a job row for this platform has it;
 *   (b) otherwise an exact NORMALIZED title that is UNIQUE across the organizer's items, at least
 *       VINTED_SOLD_MIN_TITLE_LEN characters long. More than one hit -> 'ambiguous', never guessed.
 *       A title hit whose item already has a DIFFERENT remote id on record for this platform is
 *       refused. No fuzzy matching.
 * vintedSoldDetectionService.ts keeps its own copy of this flow for Vinted (unchanged behaviour
 * and tests); Mercari, Poshmark, Grailed and the Facebook fallback use this one.
 */

import { prisma } from '../lib/prisma';
import { commitFacebookNativeSale } from './facebookNativeSaleService';
import {
  buildVintedSoldMatchContext,
  matchVintedSoldEntry,
  type VintedSoldCandidateItem,
} from './vintedSoldDetectionService';

// Each value must also exist in the MarketplaceJobPlatform Prisma enum (it is used as the
// marketplaceListingJob.platform filter). GRAILED already does; no schema change.
export type SoldDetectionPlatform = 'VINTED' | 'MERCARI' | 'POSHMARK' | 'GRAILED' | 'FACEBOOK';

export type PlatformSoldResultKind = 'sold' | 'alreadySold' | 'notAvailable' | 'ambiguous' | 'notFound' | 'error';

export interface PlatformSoldReport {
  /** The platform's own listing id if the email carries one (Mercari "m55401730709"), else ''. */
  remoteListingId: string;
  title: string;
}

export interface PlatformSoldResult {
  platform: SoldDetectionPlatform;
  remoteListingId: string;
  title: string;
  result: PlatformSoldResultKind;
  itemId?: string;
  via?: 'remoteId' | 'title';
  itemStatus?: string;
  listingClosed?: boolean;
  candidateCount?: number;
  reason?: string;
}

export interface PlatformSoldDeps {
  loadCandidateItems?: (organizerId: string) => Promise<VintedSoldCandidateItem[]>;
  loadPlatformJobs?: (
    organizerId: string,
    platform: SoldDetectionPlatform,
  ) => Promise<Array<{ itemId: string; remoteListingId: string | null }>>;
  /** Writes <platform> REMOVE/REMOVED when the item's listing there is live on record; true if written. */
  closeListingRecord?: (itemId: string, platform: SoldDetectionPlatform) => Promise<boolean>;
  commitSale?: (itemId: string, soldVia: string) => Promise<{ alreadyCommitted: boolean }>;
  getItemStatus?: (itemId: string) => Promise<string | null>;
}

function organizerItemScope(organizerId: string) {
  return {
    deletedAt: null,
    OR: [
      { sale: { organizerId, deletedAt: null } },
      { saleId: null, organizerId },
    ],
  };
}

async function defaultLoadCandidateItems(organizerId: string): Promise<VintedSoldCandidateItem[]> {
  return prisma.item.findMany({
    where: organizerItemScope(organizerId),
    select: { id: true, title: true, status: true },
  });
}

async function defaultLoadPlatformJobs(organizerId: string, platform: SoldDetectionPlatform) {
  return prisma.marketplaceListingJob.findMany({
    where: { platform, remoteListingId: { not: null }, item: organizerItemScope(organizerId) },
    select: { itemId: true, remoteListingId: true },
  });
}

// Same row markItemRemoved writes, same latest-row rule getPendingRemovals applies (a
// REMOVE/SKIPPED row is a failed attempt, not a state change). Only written while the latest
// row for this platform is POST/POSTED, so a repeat email is a no-op.
export async function closePlatformListingRecord(itemId: string, platform: SoldDetectionPlatform): Promise<boolean> {
  const latest = await prisma.marketplaceListingJob.findFirst({
    where: { itemId, platform, NOT: { action: 'REMOVE', status: 'SKIPPED' } },
    orderBy: { createdAt: 'desc' },
    select: { action: true, status: true },
  });
  if (!latest || latest.action !== 'POST' || latest.status !== 'POSTED') return false;
  await prisma.marketplaceListingJob.create({
    data: {
      itemId,
      action: 'REMOVE',
      status: 'REMOVED',
      platform,
      lastAttemptAt: new Date(),
      lastErrorMessage: `sold_on_${platform.toLowerCase()}`,
    },
  });
  return true;
}

async function defaultCommitSale(itemId: string, soldVia: string) {
  const r = await commitFacebookNativeSale(itemId, soldVia);
  return { alreadyCommitted: r.alreadyCommitted };
}

async function defaultGetItemStatus(itemId: string): Promise<string | null> {
  const it = await prisma.item.findUnique({ where: { id: itemId }, select: { status: true } });
  return it?.status ?? null;
}

/**
 * Resolves one sold report for `platform` against `organizerId`'s items and, on a unique match,
 * closes that platform's listing record and commits the sale with `soldVia`. Never throws for a
 * no-match / ambiguous case; a failed commit resolves to result 'error' (caller decides retry).
 */
export async function processPlatformSoldReport(
  platform: SoldDetectionPlatform,
  soldVia: string,
  organizerId: string,
  report: PlatformSoldReport,
  deps: PlatformSoldDeps = {},
): Promise<PlatformSoldResult> {
  if (!organizerId) throw new Error('organizerId required'); // never an unscoped lookup
  const loadCandidateItems = deps.loadCandidateItems ?? defaultLoadCandidateItems;
  const loadPlatformJobs = deps.loadPlatformJobs ?? defaultLoadPlatformJobs;
  const closeListingRecord = deps.closeListingRecord ?? closePlatformListingRecord;
  const commitSale = deps.commitSale ?? defaultCommitSale;
  const getItemStatus = deps.getItemStatus ?? defaultGetItemStatus;

  const remoteListingId = String(report.remoteListingId ?? '').trim().slice(0, 100);
  const title = String(report.title ?? '').slice(0, 500);
  const base = { platform, remoteListingId, title };

  const [items, jobs] = await Promise.all([loadCandidateItems(organizerId), loadPlatformJobs(organizerId, platform)]);
  const ctx = buildVintedSoldMatchContext(items, jobs);
  const m = matchVintedSoldEntry({ vintedId: remoteListingId, title }, ctx);
  if (m.kind === 'ambiguous') return { ...base, result: 'ambiguous', via: m.via, candidateCount: m.candidateCount };
  if (m.kind === 'notFound') return { ...base, result: 'notFound', reason: m.reason };

  // Listing record first, so a pending-removals poll racing this can never see the item SOLD with
  // this platform's listing still marked live (which would queue a delete of the sold listing).
  let listingClosed = false;
  let alreadyCommitted: boolean;
  try {
    listingClosed = await closeListingRecord(m.itemId, platform);
    ({ alreadyCommitted } = await commitSale(m.itemId, soldVia));
  } catch (err: any) {
    console.error(`[PlatformSoldDetection] ${platform} commit failed for item`, m.itemId, err?.message || err);
    return { ...base, result: 'error', itemId: m.itemId, via: m.via, listingClosed, reason: 'commit_failed' };
  }
  if (!alreadyCommitted) {
    return { ...base, result: 'sold', itemId: m.itemId, via: m.via, itemStatus: 'SOLD', listingClosed };
  }
  const status = await getItemStatus(m.itemId);
  return {
    ...base,
    result: status === 'SOLD' ? 'alreadySold' : 'notAvailable',
    itemId: m.itemId,
    via: m.via,
    itemStatus: status ?? undefined,
    listingClosed,
  };
}
