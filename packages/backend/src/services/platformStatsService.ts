/**
 * platformStatsService.ts — Platform distribution stats and gap analysis
 *
 * Computes per-organizer metrics for each external platform (eBay, Google Merchant,
 * Facebook, Shopify), a coverage score, and paginated gap lists of unlisted items.
 * Results are cached in-memory for 60 seconds to avoid hammering the DB on
 * every dashboard render.
 */

import { prisma } from '../lib/prisma';

// ─── Cache ───────────────────────────────────────────────────────────────────

const statsCache = new Map<string, { data: PlatformStatsResponse; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformCount {
  connected: boolean;
  listed: number;
  limit: number | null;
  limitSource: 'KNOWN' | 'ESTIMATED' | 'UNKNOWN';
  overLimit: boolean;
  utilizationPct: number | null;
}

export interface GooglePlatformCount extends PlatformCount {
  eligible: number;
  ineligible: number;
  ineligibilityBreakdown: {
    noPhoto: number;
    noPrice: number;
    auctionType: number;
    notPublished: number;
    saleNotPublished: number;
  };
}

export interface EbayPlatformCount extends PlatformCount {
  storeDetected: boolean;
  queueMode: boolean;
  queueRotation: boolean;
  queued: number;
  activeSlots: number;
  freeSlots: number;
  warningLevel: 'ok' | 'warning' | 'critical' | 'over';
}

export interface FacebookPlatformCount extends PlatformCount {
  note: 'EXPORT_ONLY';
}

export interface PlatformStatsResponse {
  organizerId: string;
  computedAt: string;
  coverageScore: number;
  ebay: EbayPlatformCount;
  googleMerchant: GooglePlatformCount;
  facebook: FacebookPlatformCount;
  shopify: PlatformCount;
  totals: {
    totalAvailableItems: number;
    totalListedAnywhere: number;
    totalUnlisted: number;
  };
}

export type GapPlatform = 'ebay' | 'google' | 'facebook' | 'shopify';

export type GoogleIneligibilityReason =
  | 'NO_PHOTO' | 'NO_PRICE' | 'AUCTION_TYPE' | 'NOT_PUBLISHED' | 'SALE_NOT_PUBLISHED';

export interface GapItem {
  id: string;
  title: string;
  primaryPhotoUrl: string | null;
  price: number | null;
  status: string;
  saleId: string | null;
  saleTitle: string | null;
  listingType: string;
  ebayQueuedAt: string | null;
  ineligibilityReasons?: GoogleIneligibilityReason[];
}

export interface PlatformGapResponse {
  platform: GapPlatform;
  totalNotListed: number;
  page: number;
  pageSize: number;
  items: GapItem[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveEbayLimit(org: { ebayStoreUrl: string | null }): {
  limit: number;
  limitSource: 'ESTIMATED';
  storeDetected: boolean;
} {
  if (org.ebayStoreUrl) {
    return { limit: 1000, limitSource: 'ESTIMATED', storeDetected: true };
  }
  return { limit: 250, limitSource: 'ESTIMATED', storeDetected: false };
}

function ebayWarningLevel(listed: number, limit: number): EbayPlatformCount['warningLevel'] {
  if (listed > limit) return 'over';
  const pct = listed / limit;
  if (pct >= 1.0) return 'critical';
  if (pct >= 0.8) return 'warning';
  return 'ok';
}

// ─── Main: computePlatformStats ───────────────────────────────────────────────

export async function computePlatformStats(organizerId: string): Promise<PlatformStatsResponse> {
  // Cache hit
  const cached = statsCache.get(organizerId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Fetch organizer
  const org = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: {
      id: true,
      ebayStoreUrl: true,
      shopifyEnabled: true,
      facebookPageId: true,
      ebayQueueMode: true,
      ebayQueueRotation: true,
      ebayConnection: { select: { id: true } },
    },
  });

  if (!org) {
    throw new Error(`Organizer ${organizerId} not found`);
  }

  const baseWhere = { organizerId, deletedAt: null } as const;
  const availableWhere = { ...baseWhere, status: 'AVAILABLE', isActive: true } as const;

  // Run all count queries in parallel
  const [
    ebayListed,
    ebayQueued,
    shopifyCount,
    facebookCount,
    totalAvailable,
    totalListedAnywhere,
    googleCandidates,
  ] = await Promise.all([
    // eBay listed: AVAILABLE items with an offerId
    prisma.item.count({
      where: { ...availableWhere, ebayOfferId: { not: null } },
    }),

    // eBay queued: AVAILABLE items in queue waiting for a slot (no offerId yet)
    prisma.item.count({
      where: { ...availableWhere, ebayQueuedAt: { not: null }, ebayOfferId: null },
    }),

    // Shopify: count via ShopifyListing model (ACTIVE status)
    prisma.shopifyListing.count({
      where: { organizerId, status: 'ACTIVE' },
    }),

    // Facebook: items ever exported (fbExportedAt stamped) — not restricted to AVAILABLE
    // so organizer sees honest "X items exported" count across all statuses
    prisma.item.count({
      where: { ...baseWhere, fbExportedAt: { not: null } },
    }),

    // Total AVAILABLE items
    prisma.item.count({ where: availableWhere }),

    // Listed on at least one platform (deduped via OR) — AVAILABLE only
    prisma.item.count({
      where: {
        ...availableWhere,
        OR: [
          { ebayOfferId: { not: null } },
          { fbExportedAt: { not: null } },
          { shopifyListing: { status: 'ACTIVE' } },
        ],
      },
    }),

    // Google candidates: fetch minimal shape for eligibility check
    prisma.item.findMany({
      where: {
        ...availableWhere,
        draftStatus: 'PUBLISHED',
        price: { gt: 0 },
        listingType: { notIn: ['AUCTION', 'REVERSE_AUCTION'] },
        sale: { status: 'PUBLISHED', deletedAt: null },
      },
      select: {
        id: true,
        photoUrls: true,
        price: true,
        listingType: true,
        draftStatus: true,
        sale: { select: { status: true, deletedAt: true } },
      },
    }),
  ]);

  // Compute Google eligibility breakdown
  const googleEligible = googleCandidates.filter(i => i.photoUrls.length > 0).length;
  const googleIneligible = googleCandidates.length - googleEligible;
  // Breakdown: items failing eligibility predicates (can fail multiple, counted per reason)
  // These are items that DON'T meet ALL criteria for the full candidate set
  const allAvailableGoogleBreakdown = await prisma.item.findMany({
    where: { ...availableWhere },
    select: {
      photoUrls: true,
      price: true,
      listingType: true,
      draftStatus: true,
      sale: { select: { status: true, deletedAt: true } },
    },
  });

  const breakdown = {
    noPhoto: 0,
    noPrice: 0,
    auctionType: 0,
    notPublished: 0,
    saleNotPublished: 0,
  };
  for (const item of allAvailableGoogleBreakdown) {
    if (item.photoUrls.length === 0) breakdown.noPhoto++;
    if (!item.price || item.price <= 0) breakdown.noPrice++;
    if (item.listingType === 'AUCTION' || item.listingType === 'REVERSE_AUCTION') breakdown.auctionType++;
    if (item.draftStatus !== 'PUBLISHED') breakdown.notPublished++;
    if (!item.sale || item.sale.status !== 'PUBLISHED' || item.sale.deletedAt) breakdown.saleNotPublished++;
  }

  // eBay limit resolution
  const { limit: ebayLimit, limitSource, storeDetected } = resolveEbayLimit(org);
  const ebayFreeSlots = Math.max(0, ebayLimit - ebayListed);
  const ebayOverLimit = ebayListed > ebayLimit;
  const ebayUtilPct = Math.round((ebayListed / ebayLimit) * 100);

  // Coverage score
  const coverageScore =
    totalAvailable === 0 ? 0 : Math.round((totalListedAnywhere / totalAvailable) * 100);

  const result: PlatformStatsResponse = {
    organizerId,
    computedAt: new Date().toISOString(),
    coverageScore,

    ebay: {
      connected: !!org.ebayConnection,
      listed: ebayListed,
      limit: ebayLimit,
      limitSource,
      overLimit: ebayOverLimit,
      utilizationPct: ebayUtilPct,
      storeDetected,
      queueMode: org.ebayQueueMode,
      queueRotation: org.ebayQueueRotation,
      queued: ebayQueued,
      activeSlots: ebayListed,
      freeSlots: ebayFreeSlots,
      warningLevel: ebayWarningLevel(ebayListed, ebayLimit),
    },

    googleMerchant: {
      connected: true, // feed is always available (public TSV endpoint)
      listed: googleEligible,
      limit: null,
      limitSource: 'UNKNOWN',
      overLimit: false,
      utilizationPct: null,
      eligible: googleEligible,
      ineligible: googleIneligible,
      ineligibilityBreakdown: breakdown,
    },

    facebook: {
      connected: !!org.facebookPageId,
      listed: facebookCount,
      limit: null,
      limitSource: 'UNKNOWN',
      overLimit: false,
      utilizationPct: null,
      note: 'EXPORT_ONLY',
    },

    shopify: {
      connected: org.shopifyEnabled,
      listed: shopifyCount,
      limit: null,
      limitSource: 'UNKNOWN',
      overLimit: false,
      utilizationPct: null,
    },

    totals: {
      totalAvailableItems: totalAvailable,
      totalListedAnywhere,
      totalUnlisted: totalAvailable - totalListedAnywhere,
    },
  };

  // Cache and return
  statsCache.set(organizerId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

// ─── invalidatePlatformStatsCache ─────────────────────────────────────────────

/** Call after any queue mutation to force fresh stats on next request */
export function invalidatePlatformStatsCache(organizerId: string): void {
  statsCache.delete(organizerId);
}

// ─── computePlatformGap ────────────────────────────────────────────────────────

export async function computePlatformGap(
  organizerId: string,
  platform: GapPlatform,
  page: number,
  pageSize = 50,
): Promise<PlatformGapResponse> {
  const baseWhere = { organizerId, deletedAt: null } as const;
  const availableWhere = { ...baseWhere, status: 'AVAILABLE', isActive: true } as const;
  const skip = (page - 1) * pageSize;

  const itemSelect = {
    id: true,
    title: true,
    photoUrls: true,
    price: true,
    status: true,
    saleId: true,
    listingType: true,
    ebayQueuedAt: true,
    sale: { select: { title: true } },
  } as const;

  let totalNotListed = 0;
  let rawItems: any[] = [];

  if (platform === 'ebay') {
    const where = { ...availableWhere, ebayOfferId: null };
    [totalNotListed, rawItems] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({ where, select: itemSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
    ]);
  } else if (platform === 'shopify') {
    const where = { ...availableWhere, shopifyListing: { is: null } };
    [totalNotListed, rawItems] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({ where, select: itemSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
    ]);
  } else if (platform === 'facebook') {
    const where = { ...availableWhere, fbExportedAt: null };
    [totalNotListed, rawItems] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({ where, select: itemSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
    ]);
  } else if (platform === 'google') {
    // Google: find AVAILABLE items that fail at least one eligibility predicate
    const allAvailable = await prisma.item.findMany({
      where: availableWhere,
      select: {
        ...itemSelect,
        draftStatus: true,
        sale: { select: { title: true, status: true, deletedAt: true } },
      },
    });

    type RawGoogleItem = (typeof allAvailable)[number];

    const ineligible: Array<RawGoogleItem & { reasons: GoogleIneligibilityReason[] }> = [];
    for (const item of allAvailable) {
      const reasons: GoogleIneligibilityReason[] = [];
      if (item.photoUrls.length === 0) reasons.push('NO_PHOTO');
      if (!item.price || item.price <= 0) reasons.push('NO_PRICE');
      if (item.listingType === 'AUCTION' || item.listingType === 'REVERSE_AUCTION') reasons.push('AUCTION_TYPE');
      if (item.draftStatus !== 'PUBLISHED') reasons.push('NOT_PUBLISHED');
      if (!item.sale || (item.sale as any).status !== 'PUBLISHED' || (item.sale as any).deletedAt) {
        reasons.push('SALE_NOT_PUBLISHED');
      }
      if (reasons.length > 0) ineligible.push({ ...item, reasons });
    }

    totalNotListed = ineligible.length;
    const paged = ineligible.slice(skip, skip + pageSize);
    return {
      platform,
      totalNotListed,
      page,
      pageSize,
      items: paged.map(item => ({
        id: item.id,
        title: item.title,
        primaryPhotoUrl: item.photoUrls[0] ?? null,
        price: item.price ?? null,
        status: item.status,
        saleId: item.saleId ?? null,
        saleTitle: item.sale?.title ?? null,
        listingType: item.listingType,
        ebayQueuedAt: item.ebayQueuedAt ? item.ebayQueuedAt.toISOString() : null,
        ineligibilityReasons: item.reasons,
      })),
    };
  }

  return {
    platform,
    totalNotListed,
    page,
    pageSize,
    items: rawItems.map((item: any) => ({
      id: item.id,
      title: item.title,
      primaryPhotoUrl: item.photoUrls[0] ?? null,
      price: item.price ?? null,
      status: item.status,
      saleId: item.saleId ?? null,
      saleTitle: item.sale?.title ?? null,
      listingType: item.listingType,
      ebayQueuedAt: item.ebayQueuedAt ? item.ebayQueuedAt.toISOString() : null,
    })),
  };
}
