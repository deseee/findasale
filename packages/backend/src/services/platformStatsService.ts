/**
 * platformStatsService.ts — Platform distribution stats and gap analysis
 *
 * Computes per-organizer metrics for each external platform (eBay, Google Merchant,
 * Facebook, Shopify), a coverage score, and paginated gap lists of unlisted items.
 * Results are cached in-memory for 60 seconds to avoid hammering the DB on
 * every dashboard render.
 */

import { prisma } from '../lib/prisma';
import { getCacheMeta } from './googleMerchantFeedService';
import { refreshEbayAccessToken } from '../controllers/ebayController';

// ─── eBay proxy helpers (mirrors ebayController — Railway blocks api.ebay.com at DNS) ──

const _ebayProxyUrl = (path: string): string =>
  `${process.env.FRONTEND_URL ?? 'https://finda.sale'}/api/proxy/ebay?path=${encodeURIComponent(path)}`;

const _ebayProxyHeaders = (): Record<string, string> => {
  const secret = process.env.EBAY_PROXY_SECRET;
  return secret ? { 'X-Proxy-Secret': secret } : {};
};

/**
 * Fetch the live PUBLISHED offer count from eBay Inventory API via Vercel proxy.
 * Returns the count on success, or null on failure (caller falls back to DB count).
 */
async function fetchEbayLivePublishedCount(accessToken: string): Promise<number | null> {
  // Trading API GetMyeBaySelling with EntriesPerPage=1 returns TotalNumberOfEntries
  // (Inventory API /sell/inventory/v1/offer requires a SKU param — not a list endpoint)
  try {
    const xml = `<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials></RequesterCredentials><OutputSelector>ActiveList.PaginationResult</OutputSelector><ActiveList><Include>true</Include><Pagination><EntriesPerPage>1</EntriesPerPage><PageNumber>1</PageNumber></Pagination></ActiveList></GetMyeBaySellingRequest>`;
    const res = await fetch(_ebayProxyUrl('/ws/api.dll'), {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID ?? '',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml',
        ..._ebayProxyHeaders(),
      },
      body: xml,
    });
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

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
  storeUrl: string | null; // Direct link to the organizer's page/store on this platform, when known
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
  liveCountAvailable: boolean; // true = listed count came from eBay API; false = DB fallback
}

export interface FacebookPlatformCount extends PlatformCount {
  note: 'EXPORT_ONLY' | 'COMMERCE_MANAGER';
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
    totalVisibleOnSite: number; // items shoppers can see on finda.sale right now
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
      shopifyShopDomain: true,
      facebook: true,
      facebookPageId: true,
      fbCatalogEnabled: true,
      ebayQueueMode: true,
      ebayQueueRotation: true,
      ebayConnection: { select: { id: true, accessToken: true, tokenExpiresAt: true, ebayUserId: true } },
    },
  });

  if (!org) {
    throw new Error(`Organizer ${organizerId} not found`);
  }

  const baseWhere = { organizerId, deletedAt: null } as const;
  const availableWhere = { ...baseWhere, status: 'AVAILABLE', isActive: true } as const;

  // Run all count queries in parallel
  const [
    ebayListedDb,
    ebayQueued,
    shopifyCount,
    facebookCount,
    totalAvailable,
    totalListedAnywhereDb,
    googleCandidates,
    findasaleVisible,
  ] = await Promise.all([
    // eBay listed (DB fallback): AVAILABLE items with an offerId
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

    // Facebook: items ever exported (fbExportedAt stamped) — Marketplace users
    prisma.item.count({
      where: { ...baseWhere, fbExportedAt: { not: null } },
    }),

    // Total AVAILABLE items
    prisma.item.count({ where: availableWhere }),

    // totalListedAnywhereDb — kept for reference but recalculated below
    // to include findasaleVisible in the OR; result stored in totalListedAnywhereDb
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

    // Items shoppers can actually see on finda.sale right now
    prisma.item.count({
      where: {
        ...availableWhere,
        draftStatus: 'PUBLISHED',
        deletedAt: null,
        sale: { status: 'PUBLISHED', deletedAt: null },
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

  // eBay: attempt live count from eBay Inventory API if token is valid
  let ebayListed = ebayListedDb;
  let ebayLiveCountAvailable = false;
  if (org.ebayConnection) {
    const freshToken = await refreshEbayAccessToken(organizerId);
    if (freshToken) {
      const liveCount = await fetchEbayLivePublishedCount(freshToken);
      if (liveCount !== null) {
        ebayListed = liveCount;
        ebayLiveCountAvailable = true;
      }
    }
  }

  // totalListedAnywhere: recalculate to include findasaleVisible in the OR
  // (items on our own site count as "listed somewhere")
  const totalListedAnywhere = await prisma.item.count({
    where: {
      ...availableWhere,
      OR: [
        { ebayOfferId: { not: null } },
        { fbExportedAt: { not: null } },
        { shopifyListing: { status: 'ACTIVE' } },
        { draftStatus: 'PUBLISHED', deletedAt: null, sale: { status: 'PUBLISHED', deletedAt: null } },
      ],
    },
  });

  // ── Clickable platform links — organizer's actual store/page on each platform ──
  // eBay: prefer the explicit store URL; fall back to the public seller page (My eBay World)
  const ebayStoreUrl: string | null =
    org.ebayStoreUrl ?? (org.ebayConnection ? `https://www.ebay.com/usr/${org.ebayConnection.ebayUserId}` : null);
  // Facebook: prefer the organizer-entered Page URL (Settings), fall back to the
  // auto-enrichment Page ID (ADR-073) which is often unset for self-serve organizers.
  const facebookPageUrl: string | null = org.facebook?.trim()
    ? org.facebook.trim()
    : (org.facebookPageId ? `https://www.facebook.com/${org.facebookPageId}` : null);
  // Shopify: shop domain is the public storefront
  const shopifyStoreUrl: string | null = org.shopifyShopDomain
    ? `https://${org.shopifyShopDomain}`
    : null;

  // eBay limit resolution
  const { limit: ebayLimit, limitSource, storeDetected } = resolveEbayLimit(org);
  const ebayFreeSlots = Math.max(0, ebayLimit - ebayListed);
  const ebayOverLimit = ebayListed > ebayLimit;
  const ebayUtilPct = Math.round((ebayListed / ebayLimit) * 100);

  // Coverage score
  // Google Merchant feed: use nightly-cached item count as the live "in feed" count
  // Falls back to computed eligibility if the feed cache hasn't been built yet.
  const googleFeedMeta = getCacheMeta();
  const googleInFeed = googleFeedMeta?.itemCount ?? googleEligible;

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
      liveCountAvailable: ebayLiveCountAvailable,
      storeUrl: ebayStoreUrl,
    },

    googleMerchant: {
      connected: true, // feed is always available (public TSV endpoint)
      listed: googleInFeed,
      limit: null,
      limitSource: 'UNKNOWN',
      overLimit: false,
      utilizationPct: null,
      eligible: googleEligible,
      ineligible: googleIneligible,
      ineligibilityBreakdown: breakdown,
      storeUrl: null, // Google Merchant is a feed, not a public organizer-facing page
    },

    facebook: {
      connected: !!(org as any).fbCatalogEnabled || !!org.facebookPageId,
      listed: (org as any).fbCatalogEnabled
        ? findasaleVisible  // Catalog feed covers items in published sales (shopper-visible)
        : facebookCount,   // Marketplace: only items with fbExportedAt stamped
      limit: null,
      limitSource: 'UNKNOWN',
      overLimit: false,
      utilizationPct: null,
      note: (org as any).fbCatalogEnabled ? 'COMMERCE_MANAGER' : 'EXPORT_ONLY',
      storeUrl: facebookPageUrl,
    },

    shopify: {
      connected: org.shopifyEnabled,
      listed: shopifyCount,
      limit: null,
      limitSource: 'UNKNOWN',
      overLimit: false,
      utilizationPct: null,
      storeUrl: shopifyStoreUrl,
    },

    totals: {
      totalAvailableItems: totalAvailable,
      totalListedAnywhere,
      totalUnlisted: totalAvailable - totalListedAnywhere,
      totalVisibleOnSite: findasaleVisible,
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
