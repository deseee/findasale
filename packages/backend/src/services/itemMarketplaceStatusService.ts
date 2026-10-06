/**
 * Per-platform listing status for one item (item editor unification, Wave 2, U3).
 *
 * Holds the newest-row-wins MarketplaceListingJob logic that used to live inline in getDraftItemsBySaleId, so
 * the Add Items list and GET /items/:id/marketplace-status read the SAME rule. extensionController's
 * getExtensionItems has its own copy of this rule (it emits marketplaceListedFacebook and friends); that file is
 * deliberately left alone and a parity test (itemMarketplaceStatusService.test.ts) keeps the two from drifting.
 *
 * The rule: per (item, platform) take the NEWEST job row by createdAt, ignoring REMOVE/SKIPPED rows (a failed
 * removal attempt does not end the listing). The platform counts as listed only when that newest row is
 * action POST with status POSTED.
 *
 * Statuses per platform:
 *   live                        listed through an official API (eBay, Discogs, Reverb, Etsy, Shopify)
 *   listed_needs_manual_update  listed through the browser extension (Facebook, Craigslist, Gumtree AU,
 *                               Poshmark, Mercari, Vinted, Grailed); edits are never pushed, so the
 *                               organizer must update them by hand
 *   paused                      the eBay sync hold is set, or the organizer paused that extension marketplace
 *   eligible                    not listed yet, but this item could be
 *   none                        nothing to show
 *
 * Security: callers resolve ownership first (resolveItemOwnerOrganizer). Everything here is scoped to the
 * owner organizer id. Responses carry this item's own listing ids only: never tokens, never another
 * organizer's ids, and push history rows are returned without organizerId.
 */

import { prisma } from '../lib/prisma';
import { getAcceptedConditionsForCategory } from './ebayPublishService';
import {
  computeChannelStatusForItems,
  type ChannelStatusItemInput,
  type ChannelStatusValue,
  type ExtensionPlatformsUsed,
  type PublishedExtensionPlatformsByItemId,
} from './itemChannelStatusService';
import { isPlatformPaused, sanitizePausedPlatforms } from './pausedMarketplaces';

export const EXTENSION_PLATFORMS = ['FACEBOOK', 'CRAIGSLIST', 'GUMTREE_AU', 'GRAILED', 'POSHMARK', 'MERCARI', 'VINTED'] as const;
export type ExtensionPlatform = (typeof EXTENSION_PLATFORMS)[number];

export type MarketplaceJobRow = {
  itemId: string;
  platform: string;
  action: string;
  status: string;
  createdAt: Date;
};

/**
 * Newest job row per `${itemId}:${platform}`, ignoring REMOVE/SKIPPED rows (a failed removal attempt is not the end of
 * the listing: S-EXT-REMOVAL-SKIP-ENDS-LISTING 2026-09-22).
 */
export function latestJobByItemPlatform<T extends MarketplaceJobRow>(rows: readonly T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const job of rows) {
    if (job.action === 'REMOVE' && job.status === 'SKIPPED') continue;
    const key = `${job.itemId}:${job.platform}`;
    const existing = latest.get(key);
    if (!existing || job.createdAt > existing.createdAt) latest.set(key, job);
  }
  return latest;
}

/** Per item, the extension platforms whose newest row is POST/POSTED (listed and not removed). */
export function listedExtensionPlatformsByItemId(rows: readonly MarketplaceJobRow[]): PublishedExtensionPlatformsByItemId {
  const result: PublishedExtensionPlatformsByItemId = new Map();
  for (const job of latestJobByItemPlatform(rows).values()) {
    if (job.action !== 'POST' || job.status !== 'POSTED') continue;
    if (!result.has(job.itemId)) result.set(job.itemId, new Set());
    result.get(job.itemId)!.add(job.platform as ExtensionPlatform);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------------------------------------

export type PlatformStatusValue = 'live' | 'listed_needs_manual_update' | 'eligible' | 'none' | 'paused';

export interface LastPushOutcome {
  id: string;
  trigger: string;
  status: string;
  fieldsAttempted: string[];
  fieldsPushed: string[];
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  acknowledged: boolean;
}

export interface PlatformStatusEntry {
  platform: string;
  label: string;
  status: PlatformStatusValue;
  /** This item's own listing ids on that platform. */
  ids: Record<string, string | null>;
  lastPush: LastPushOutcome | null;
  heldAt: Date | null;
  /** True when the item is listed but would no longer pass the platform's eligibility rule. */
  ineligible?: boolean;
}

export interface ItemMarketplaceStatus {
  itemId: string;
  platforms: {
    ebay: PlatformStatusEntry;
    discogs: PlatformStatusEntry;
    reverb: PlatformStatusEntry;
    etsy: PlatformStatusEntry;
    shopify: PlatformStatusEntry;
    facebook: PlatformStatusEntry;
    craigslist: PlatformStatusEntry;
    gumtreeAu: PlatformStatusEntry;
    poshmark: PlatformStatusEntry;
    mercari: PlatformStatusEntry;
    vinted: PlatformStatusEntry;
    grailed: PlatformStatusEntry;
  };
  ebayHold: { heldAt: Date | null; heldFields: string[]; contentDirtyAt: Date | null };
  /**
   * eBay condition enums the item's eBay category accepts (for example ['NEW', 'USED_EXCELLENT']), or null when the
   * item has no category, is not on eBay, or the lookup failed. The item editor uses it to preview the condition eBay
   * will actually show. Added by getItemMarketplaceStatus; the pure builder leaves it null.
   */
  ebayAcceptedConditions: string[] | null;
  /** FAILED or PARTIAL eBay pushes the organizer has not acknowledged (drives the Edit banner). */
  failedUnacknowledgedPushCount: number;
  /** Newest eBay push attempts first, at most 10. */
  recentPushes: LastPushOutcome[];
}

export type StatusItemInput = ChannelStatusItemInput & {
  title?: string | null;
  ebayOfferId?: string | null;
  discogsListedAt?: Date | null;
  ebaySyncHeldAt?: Date | null;
  ebayHeldFields?: string[] | null;
  ebayContentDirtyAt?: Date | null;
};

const LABELS: Record<string, string> = {
  EBAY: 'eBay',
  DISCOGS: 'Discogs',
  REVERB: 'Reverb',
  ETSY: 'Etsy',
  SHOPIFY: 'Shopify',
  FACEBOOK: 'Facebook',
  CRAIGSLIST: 'Craigslist',
  GUMTREE_AU: 'Gumtree AU',
  POSHMARK: 'Poshmark',
  MERCARI: 'Mercari',
  VINTED: 'Vinted',
  GRAILED: 'Grailed',
};

const EXT_KEYS: Record<ExtensionPlatform, 'facebook' | 'craigslist' | 'gumtreeAu' | 'poshmark' | 'mercari' | 'vinted' | 'grailed'> = {
  FACEBOOK: 'facebook',
  CRAIGSLIST: 'craigslist',
  GUMTREE_AU: 'gumtreeAu',
  POSHMARK: 'poshmark',
  MERCARI: 'mercari',
  VINTED: 'vinted',
  GRAILED: 'grailed',
};

function toLastPush(row: {
  id: string;
  trigger: string;
  status: string;
  fieldsAttempted: string[];
  fieldsPushed: string[];
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  acknowledgedAt: Date | null;
}): LastPushOutcome {
  // organizerId and itemId are deliberately not copied.
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    fieldsAttempted: row.fieldsAttempted,
    fieldsPushed: row.fieldsPushed,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    acknowledged: row.acknowledgedAt != null,
  };
}

function apiStatus(value: ChannelStatusValue): { status: PlatformStatusValue; ineligible?: boolean } {
  if (value === 'PUBLISHED') return { status: 'live' };
  if (value === 'PUBLISHED_INELIGIBLE') return { status: 'live', ineligible: true };
  if (value === 'ELIGIBLE') return { status: 'eligible' };
  return { status: 'none' };
}

export interface StatusInputs {
  item: StatusItemInput;
  hasEbayConnection: boolean;
  shopifyEnabled: boolean;
  subscriptionTier: string;
  hasActiveDiscogsAccount: boolean;
  hasActiveReverbAccount: boolean;
  hasActiveEtsyAccount: boolean;
  /** Extension platforms this organizer has ever posted to (gates the "eligible" dot). */
  extensionPlatformsUsed: ExtensionPlatformsUsed;
  /** Job rows for this item (any status). */
  jobs: readonly MarketplaceJobRow[];
  pausedMarketplaces: unknown;
  etsyListingState?: string | null;
  etsyListingId?: string | null;
  recentPushRows: Array<Parameters<typeof toLastPush>[0]>;
  failedUnacknowledgedPushCount: number;
  /** Accepted eBay condition enums for the item's category, when known. */
  ebayAcceptedConditions?: string[] | null;
}

/** Pure composition: everything has been fetched by the caller. */
export function buildItemMarketplaceStatus(inputs: StatusInputs): ItemMarketplaceStatus {
  const { item } = inputs;
  const paused = sanitizePausedPlatforms(inputs.pausedMarketplaces);
  const published = listedExtensionPlatformsByItemId(inputs.jobs);
  const channel = computeChannelStatusForItems(
    [{ ...item, etsyListingState: inputs.etsyListingState ?? null }],
    {
      hasEbayConnection: inputs.hasEbayConnection,
      shopifyEnabled: inputs.shopifyEnabled,
      subscriptionTier: inputs.subscriptionTier,
      hasActiveDiscogsAccount: inputs.hasActiveDiscogsAccount,
      hasActiveReverbAccount: inputs.hasActiveReverbAccount,
      hasActiveEtsyAccount: inputs.hasActiveEtsyAccount,
    },
    inputs.extensionPlatformsUsed,
    published
  )[item.id];

  const recent = inputs.recentPushRows.slice(0, 10).map(toLastPush);
  const lastEbayPush = recent[0] ?? null;
  const heldAt = item.ebaySyncHeldAt ?? null;
  const ebayListed = !!(item.ebayListingId || item.ebayOfferId);

  const entry = (
    platform: string,
    status: PlatformStatusValue,
    ids: Record<string, string | null>,
    extra: Partial<PlatformStatusEntry> = {}
  ): PlatformStatusEntry => ({
    platform,
    label: LABELS[platform] ?? platform,
    status,
    ids,
    lastPush: null,
    heldAt: null,
    ...extra,
  });

  const ebayBase = apiStatus(channel?.ebay ?? null);
  const ebayEntry = entry(
    'EBAY',
    ebayListed && heldAt ? 'paused' : item.ebayListingId ? 'live' : ebayBase.status,
    { listingId: item.ebayListingId ?? null, offerId: item.ebayOfferId ?? null },
    { lastPush: lastEbayPush, heldAt, ...(ebayBase.ineligible ? { ineligible: true } : {}) }
  );

  const reverbBase = apiStatus(channel?.reverb ?? null);
  const etsyBase = apiStatus(channel?.etsy ?? null);

  const ext = {} as Record<(typeof EXT_KEYS)[ExtensionPlatform], PlatformStatusEntry>;
  const publishedHere = published.get(item.id) ?? new Set<string>();
  for (const platform of EXTENSION_PLATFORMS) {
    const listed = publishedHere.has(platform);
    const isPaused = isPlatformPaused(paused, platform);
    const base = (channel as unknown as Record<string, ChannelStatusValue>)?.[EXT_KEYS[platform]] ?? null;
    let status: PlatformStatusValue;
    let ineligible = false;
    if (isPaused) status = 'paused';
    else if (listed) {
      status = 'listed_needs_manual_update';
      ineligible = base === 'PUBLISHED_INELIGIBLE';
    } else status = base === 'ELIGIBLE' ? 'eligible' : 'none';
    ext[EXT_KEYS[platform]] = entry(platform, status, {}, ineligible ? { ineligible: true } : {});
  }

  return {
    itemId: item.id,
    platforms: {
      ebay: ebayEntry,
      discogs: entry('DISCOGS', apiStatus(channel?.discogs ?? null).status, { listingId: item.discogsListingId ?? null }),
      reverb: entry('REVERB', reverbBase.status, { listingId: item.reverbListingId ?? null }, reverbBase.ineligible ? { ineligible: true } : {}),
      etsy: entry('ETSY', etsyBase.status, { listingId: inputs.etsyListingId ?? null }, etsyBase.ineligible ? { ineligible: true } : {}),
      shopify: entry('SHOPIFY', apiStatus(channel?.shopify ?? null).status, { listingId: item.shopifyListing?.id ?? null }),
      ...ext,
    },
    ebayHold: {
      heldAt,
      heldFields: item.ebayHeldFields ?? [],
      contentDirtyAt: item.ebayContentDirtyAt ?? null,
    },
    ebayAcceptedConditions: inputs.ebayAcceptedConditions ?? null,
    failedUnacknowledgedPushCount: inputs.failedUnacknowledgedPushCount,
    recentPushes: recent,
  };
}

/**
 * Loads everything for one owner-resolved item and composes the status. `item` must have been loaded by the caller
 * with the fields in the selects below. Five small indexed reads, all scoped to the owner organizer.
 */
export const ITEM_STATUS_SELECT = {
  id: true,
  title: true,
  category: true,
  ebayCategoryId: true,
  ebayListingId: true,
  ebayOfferId: true,
  discogsListingId: true,
  discogsListedAt: true,
  reverbListingId: true,
  shopifyListing: { select: { id: true } },
  ebaySyncHeldAt: true,
  ebayHeldFields: true,
  ebayContentDirtyAt: true,
  aiPackageWeightOz: true,
  packageWeightOz: true,
  packageLengthIn: true,
  packageWidthIn: true,
  packageHeightIn: true,
} as const;

/** Longest the status endpoint waits for eBay's condition policy; the lookup keeps running and fills its cache. */
const ACCEPTED_CONDITIONS_WAIT_MS = 4000;

/**
 * Accepted eBay condition enums for the item's saved category, for the editor's "On eBay this shows as" preview.
 * Only looked up for an item that is on eBay and has a category (the preview shows only then). Never throws and never
 * delays the response past ACCEPTED_CONDITIONS_WAIT_MS: any miss, error or empty policy yields null.
 */
async function loadAcceptedConditions(item: StatusItemInput): Promise<string[] | null> {
  if (!item.ebayCategoryId || !(item.ebayListingId || item.ebayOfferId)) return null;
  try {
    const lookup = getAcceptedConditionsForCategory(String(item.ebayCategoryId)).catch(() => null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ACCEPTED_CONDITIONS_WAIT_MS);
    });
    const accepted = await Promise.race([lookup, timeout]);
    if (timer) clearTimeout(timer);
    return accepted && accepted.size > 0 ? Array.from(accepted) : null;
  } catch {
    return null;
  }
}

export async function getItemMarketplaceStatus(args: {
  item: StatusItemInput;
  ownerOrganizerId: string;
}): Promise<ItemMarketplaceStatus> {
  const { item, ownerOrganizerId } = args;

  const [organizer, jobs, organizerJobPlatforms, pushRows, failedCount, etsyRow, cardRow] = await Promise.all([
    prisma.organizer.findUnique({
      where: { id: ownerOrganizerId },
      select: {
        ebayConnection: { select: { id: true } },
        shopifyEnabled: true,
        subscriptionTier: true,
        pausedMarketplaces: true,
        marketplaceAccounts: {
          where: { platform: { in: ['DISCOGS', 'REVERB', 'ETSY'] }, status: 'ACTIVE' },
          select: { id: true, platform: true },
        },
      },
    }),
    prisma.marketplaceListingJob.findMany({
      where: { itemId: item.id, platform: { in: [...EXTENSION_PLATFORMS] } },
      select: { itemId: true, platform: true, action: true, status: true, createdAt: true },
    }),
    prisma.marketplaceListingJob.findMany({
      where: {
        platform: { in: [...EXTENSION_PLATFORMS] },
        item: { OR: [{ sale: { organizerId: ownerOrganizerId } }, { organizerId: ownerOrganizerId }] },
      },
      distinct: ['platform'],
      select: { platform: true },
    }),
    prisma.itemMarketplacePush.findMany({
      where: { itemId: item.id, organizerId: ownerOrganizerId, platform: 'EBAY' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        trigger: true,
        status: true,
        fieldsAttempted: true,
        fieldsPushed: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
        acknowledgedAt: true,
      },
    }),
    prisma.itemMarketplacePush.count({
      where: {
        itemId: item.id,
        organizerId: ownerOrganizerId,
        platform: 'EBAY',
        status: { in: ['FAILED', 'PARTIAL'] },
        acknowledgedAt: null,
      },
    }),
    prisma.etsyListing.findFirst({
      where: { itemId: item.id, organizerId: ownerOrganizerId },
      select: { state: true, etsyListingId: true, whenMade: true, isSupply: true },
    }),
    prisma.itemCard.findUnique({ where: { itemId: item.id }, select: { releaseYear: true } }),
  ]);

  const ebayAcceptedConditions = await loadAcceptedConditions(item);
  const accounts = organizer?.marketplaceAccounts ?? [];
  const used = (p: ExtensionPlatform) => organizerJobPlatforms.some((j) => j.platform === p);
  const extensionPlatformsUsed: ExtensionPlatformsUsed = {
    facebook: used('FACEBOOK'),
    craigslist: used('CRAIGSLIST'),
    gumtreeAu: used('GUMTREE_AU'),
    grailed: used('GRAILED'),
    poshmark: used('POSHMARK'),
    mercari: used('MERCARI'),
    vinted: used('VINTED'),
  };

  return buildItemMarketplaceStatus({
    item: {
      ...item,
      etsyWhenMade: etsyRow?.whenMade ?? null,
      etsyIsCraftSupply: etsyRow ? etsyRow.isSupply : null,
      releaseYear: cardRow?.releaseYear ?? null,
    } as StatusItemInput,
    hasEbayConnection: organizer?.ebayConnection != null,
    shopifyEnabled: organizer?.shopifyEnabled ?? false,
    subscriptionTier: organizer?.subscriptionTier ?? 'SIMPLE',
    hasActiveDiscogsAccount: accounts.some((a) => a.platform === 'DISCOGS'),
    hasActiveReverbAccount: accounts.some((a) => a.platform === 'REVERB'),
    hasActiveEtsyAccount: accounts.some((a) => a.platform === 'ETSY'),
    extensionPlatformsUsed,
    jobs,
    pausedMarketplaces: organizer?.pausedMarketplaces ?? [],
    etsyListingState: etsyRow?.state ?? null,
    etsyListingId: etsyRow?.etsyListingId ?? null,
    recentPushRows: pushRows,
    failedUnacknowledgedPushCount: failedCount,
    ebayAcceptedConditions,
  });
}

/**
 * One batched query for the Add Items list: unacknowledged FAILED or PARTIAL eBay pushes per item id, scoped to the
 * owner organizer. Returns a map of itemId to count (items with no failures are absent). Never throws: a failure
 * here only hides the badge, it never fails the list.
 */
export async function getFailedPushCountsByItemId(itemIds: string[], ownerOrganizerId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (itemIds.length === 0) return counts;
  try {
    const groups = await prisma.itemMarketplacePush.groupBy({
      by: ['itemId'],
      where: {
        itemId: { in: itemIds },
        organizerId: ownerOrganizerId,
        platform: 'EBAY',
        status: { in: ['FAILED', 'PARTIAL'] },
        acknowledgedAt: null,
      },
      _count: { _all: true },
    });
    for (const g of groups) counts.set(g.itemId, g._count._all);
  } catch (err) {
    console.warn('[Add Items] failed-push counts could not be loaded (badge hidden for this page):', (err as Error).message);
  }
  return counts;
}
