import { prisma } from '../lib/prisma';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';
import { isSaleLocked } from './rankService';
import { normalizeCondition } from '../utils/conditionMapping'; // U4: one condition vocabulary
import { coarseCoord, notEmbargoedForPublicWhere } from '../lib/saleLocationPrivacy';

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface SaleWithItems {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  isOngoing: boolean;
  // No street address: the feed is anonymous and cached, and the street address is only shown to signed-in
  // shoppers from the day before the sale starts (2026-10-13). lat/lng are coarse (2 decimals, ~1 km).
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  photoUrls: string[];
  tags: string[];
  status: string;
  saleType: string;
  isOnlineOnly: boolean;
  notes: string | null;
  organizer: OrganizerWithSales;
  items: ItemForSyndication[];
}

export interface OrganizerWithSales {
  id: string;
  businessName: string;
  // Organizer phone and organizer street address are deliberately absent from this type: the feed is
  // public, and the formatters below have no field to emit them from (security pass 2026-10-12).
  bio: string | null;
  tagline: string | null;
  yearFounded: number | null;
  website: string | null;
  profilePhoto: string | null;
  facebook: string | null;
  instagram: string | null;
  avgRating: number | null;
  totalReviews: number;
  totalSales: number;
  verificationStatus: string;
  city?: string;
  state?: string;
  sales?: { id: string }[];
}

export interface ItemForSyndication {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  category: string | null;
  condition: string | null;
  status: string;
  photoUrls: string[];
  shippingAvailable: boolean;
  shippingPrice: number | null;
  currency: string;
}

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface SchemaOrgPostalAddress {
  '@type': 'PostalAddress';
  // streetAddress is deliberately absent (public feed, 2026-10-13 address gate).
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: 'US';
}

export interface SchemaOrgOffer {
  '@type': 'Offer';
  priceCurrency: string;
  price?: number;
  lowPrice?: number;
  highPrice?: number;
  offerCount?: number;
  availability: string;
  itemCondition?: string;
  shippingDetails?: {
    '@type': 'OfferShippingDetails';
    shippingRate: {
      '@type': 'MonetaryAmount';
      value: number;
      currency: string;
    };
  };
}

export interface SchemaOrgProduct {
  '@context': 'https://schema.org';
  '@type': 'Product';
  name: string;
  description?: string;
  image?: string[];
  category?: string;
  itemCondition?: string;
  offers: SchemaOrgOffer;
  url: string;
}

export interface SchemaOrgEvent {
  '@context': 'https://schema.org';
  '@type': 'Event';
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  eventStatus: string;
  eventAttendanceMode: string;
  location: SchemaOrgPostalAddress | { '@type': 'VirtualLocation'; url: string };
  image?: string[];
  organizer: {
    '@type': 'Organization';
    name: string;
    url?: string;
  };
  offers?: SchemaOrgOffer;
  keywords?: string;
  url: string;
}

export interface SchemaOrgOrganization {
  '@context': 'https://schema.org';
  '@type': 'Organization';
  name: string;
  description?: string;
  slogan?: string;
  url?: string;
  logo?: string;
  sameAs?: string[];
  foundingDate?: string;
  aggregateRating?: {
    '@type': 'AggregateRating';
    ratingValue: number;
    reviewCount: number;
  };
}

export interface DataCommonsEntry {
  '@type': 'Event';
  name: string;
  startDate: string;
  endDate?: string;
  location: {
    '@type': 'Place';
    name: string;
    address: {
      '@type': 'PostalAddress';
      addressLocality: string;
      addressRegion: string;
      postalCode: string;
      addressCountry: 'US';
    };
    geo?: {
      '@type': 'GeoCoordinates';
      latitude: number;
      longitude: number;
    };
  };
  organizer: {
    '@type': 'Organization';
    name: string;
  };
  eventStatus: string;
  numberOfItems: number;
  priceRange?: {
    minPrice?: number;
    maxPrice?: number;
    currency: string;
  };
  source: string;
  sourceUrl: string;
}

export interface SyndicationBundle {
  event: SchemaOrgEvent;
  org: SchemaOrgOrganization;
  items: SchemaOrgProduct[];
  dataCommons: DataCommonsEntry;
  generatedAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://finda.sale';

/**
 * Returns the value only when it is an absolute http(s) URL. Organizer website/social fields and photo
 * URLs are organizer-entered (facebook/instagram are free text, and z.string().url() also accepts
 * javascript: and data: URLs), so anything else is dropped rather than handed to feed consumers that
 * may render it as a link.
 */
function safeHttpUrl(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

function safeHttpUrls(values: string[] | null | undefined): string[] {
  return (values || []).map((v) => safeHttpUrl(v)).filter((v): v is string => typeof v === 'string');
}

function saleTypeToEventCategory(saleType: string): string {
  const map: Record<string, string> = {
    ESTATE: 'Estate Sale',
    YARD: 'Yard Sale',
    AUCTION: 'Auction',
    FLEA_MARKET: 'Flea Market',
    RETAIL: 'Retail Sale',
  };
  return map[saleType] || 'Sale';
}

export function conditionToSchemaOrg(condition: string | null): string | undefined {
  // U4: read the normalized condition; unrecognized values still yield no itemCondition.
  const normalizedCondition = normalizeCondition(condition).condition;
  if (!normalizedCondition) return undefined;
  const map: Record<string, string> = {
    NEW: 'https://schema.org/NewCondition',
    USED: 'https://schema.org/UsedCondition',
    REFURBISHED: 'https://schema.org/RefurbishedCondition',
    PARTS_OR_REPAIR: 'https://schema.org/DamagedCondition',
  };
  return map[normalizedCondition];
}

function buildPriceRange(items: ItemForSyndication[]): { low: number; high: number; count: number } | null {
  const priced = items.filter((i) => typeof i.price === 'number' && i.price > 0);
  if (priced.length === 0) return null;
  const prices = priced.map((i) => i.price as number);
  return {
    low: Math.min(...prices),
    high: Math.max(...prices),
    count: priced.length,
  };
}

function buildPostalAddress(city: string, state: string, zip: string): SchemaOrgPostalAddress {
  return {
    '@type': 'PostalAddress',
    addressLocality: city,
    addressRegion: state,
    postalCode: zip,
    addressCountry: 'US',
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Format a sale for schema.org Event syndication.
 */
export function formatSaleForSchemaOrg(sale: SaleWithItems): SchemaOrgEvent {
  const isOnline = sale.isOnlineOnly;
  const saleUrl = `${BASE_URL}/sales/${sale.id}`;
  const category = saleTypeToEventCategory(sale.saleType);
  const organizerWebsite = safeHttpUrl(sale.organizer.website);

  const location: SchemaOrgEvent['location'] = isOnline
    ? { '@type': 'VirtualLocation', url: saleUrl }
    : buildPostalAddress(sale.city, sale.state, sale.zip);

  const event: SchemaOrgEvent = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: sale.title,
    startDate: sale.startDate.toISOString(),
    // Permanent storefronts (isOngoing) advertise no end date.
    ...(sale.isOngoing ? {} : { endDate: sale.endDate.toISOString() }),
    eventStatus:
      sale.status === 'ENDED'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
    eventAttendanceMode: isOnline
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    location,
    organizer: {
      '@type': 'Organization',
      name: sale.organizer.businessName,
      ...(organizerWebsite ? { url: organizerWebsite } : {}),
    },
    url: saleUrl,
  };

  if (sale.description) {
    event.description = sale.description;
  }

  const saleImages = safeHttpUrls(sale.photoUrls);
  if (saleImages.length > 0) {
    event.image = saleImages;
  }

  const allTags = [...(sale.tags || []), category].filter(Boolean);
  if (allTags.length > 0) {
    event.keywords = allTags.join(', ');
  }

  const priceRange = buildPriceRange(sale.items);
  if (priceRange) {
    event.offers = {
      '@type': 'Offer',
      priceCurrency: 'USD',
      lowPrice: priceRange.low,
      highPrice: priceRange.high,
      offerCount: priceRange.count,
      availability:
        sale.status === 'PUBLISHED'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
    };
  }

  return event;
}

/**
 * Format an organizer for schema.org Organization syndication.
 */
export function formatOrganizerForSchemaOrg(organizer: OrganizerWithSales): SchemaOrgOrganization {
  const org: SchemaOrgOrganization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: organizer.businessName,
  };

  if (organizer.bio) org.description = organizer.bio;
  if (organizer.tagline) org.slogan = organizer.tagline;
  // Organizer telephone and organizer street address are never emitted (public feed).
  const website = safeHttpUrl(organizer.website);
  if (website) org.url = website;
  const logo = safeHttpUrl(organizer.profilePhoto);
  if (logo) org.logo = logo;
  if (organizer.yearFounded) org.foundingDate = String(organizer.yearFounded);

  // Social links: only absolute http(s) URLs (the fields are free text and may hold a bare handle).
  const sameAs = safeHttpUrls([organizer.facebook || '', organizer.instagram || '']);
  if (sameAs.length > 0) org.sameAs = sameAs;

  // Aggregate rating
  if (organizer.avgRating && organizer.totalReviews > 0) {
    org.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: organizer.avgRating,
      reviewCount: organizer.totalReviews,
    };
  }

  return org;
}

/**
 * Format sale data as a JSON-LD dataset entry (for Data Commons).
 */
export function formatSaleForDataCommons(sale: SaleWithItems): DataCommonsEntry {
  const entry: DataCommonsEntry = {
    '@type': 'Event',
    name: sale.title,
    startDate: sale.startDate.toISOString(),
    ...(sale.isOngoing ? {} : { endDate: sale.endDate.toISOString() }),
    location: {
      '@type': 'Place',
      name: `${sale.city}, ${sale.state}`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: sale.city,
        addressRegion: sale.state,
        postalCode: sale.zip,
        addressCountry: 'US',
      },
    },
    organizer: {
      '@type': 'Organization',
      name: sale.organizer.businessName,
    },
    eventStatus: sale.status,
    numberOfItems: sale.items.length,
    source: 'FindA.Sale',
    sourceUrl: `${BASE_URL}/sales/${sale.id}`,
  };

  // Online-only sales have no physical location: never emit coordinates for them. Physical sales get
  // coarse coordinates only (2 decimals, ~1 km), so the pin cannot stand in for the withheld street address.
  if (!sale.isOnlineOnly && sale.lat && sale.lng) {
    entry.location.geo = {
      '@type': 'GeoCoordinates',
      latitude: coarseCoord(sale.lat),
      longitude: coarseCoord(sale.lng),
    };
  }

  const priceRange = buildPriceRange(sale.items);
  if (priceRange) {
    entry.priceRange = {
      minPrice: priceRange.low,
      maxPrice: priceRange.high,
      currency: 'USD',
    };
  }

  return entry;
}

/**
 * Format a single item as schema.org Product.
 * Returns null for items that lack enough data to form a valid Product.
 */
function formatItemForSchemaOrg(item: ItemForSyndication, saleId: string): SchemaOrgProduct | null {
  const itemUrl = `${BASE_URL}/sales/${saleId}?item=${item.id}`;

  const offer: SchemaOrgOffer = {
    '@type': 'Offer',
    priceCurrency: item.currency || 'USD',
    availability:
      item.status === 'AVAILABLE'
        ? 'https://schema.org/InStock'
        : item.status === 'SOLD'
        ? 'https://schema.org/SoldOut'
        : 'https://schema.org/LimitedAvailability',
  };

  if (typeof item.price === 'number' && item.price > 0) {
    offer.price = item.price;
  }

  const itemCondition = conditionToSchemaOrg(item.condition);
  if (itemCondition) {
    offer.itemCondition = itemCondition;
  }

  if (item.shippingAvailable && typeof item.shippingPrice === 'number') {
    offer.shippingDetails = {
      '@type': 'OfferShippingDetails',
      shippingRate: {
        '@type': 'MonetaryAmount',
        value: item.shippingPrice,
        currency: item.currency || 'USD',
      },
    };
  }

  const product: SchemaOrgProduct = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.title,
    offers: offer,
    url: itemUrl,
  };

  if (item.description) product.description = item.description;
  const itemImages = safeHttpUrls(item.photoUrls);
  if (itemImages.length > 0) product.image = itemImages;
  if (item.category) product.category = item.category;
  if (itemCondition) product.itemCondition = itemCondition;

  return product;
}

/** Thrown when a sale does not exist or is not publicly syndicable. Route maps it to a 404. */
export class SyndicationNotAvailableError extends Error {
  constructor(message = 'Sale not available for syndication') {
    super(message);
    this.name = 'SyndicationNotAvailableError';
  }
}

/** Cap on Product entries per bundle so one huge sale cannot produce a multi-megabyte response. */
export const SYNDICATION_MAX_ITEMS = 500;

/**
 * Generate a syndication-ready JSON export for a sale (GET /api/syndication/sale/:saleId).
 *
 * Visibility mirrors what the public sale page (GET /api/sales/:id, anonymous viewer) already exposes:
 *  - Sale must be PUBLISHED, not soft-deleted, and not an inventory container. ENDED sales are NOT
 *    syndicated (they are noindex on the site and useless as a live Event feed).
 *  - Anonymous viewers are rank INITIATE, so a sale still inside its early-access window is unavailable.
 *  - Items use PUBLIC_ITEM_FILTER (isActive, not GRACE_LOCKED, draftStatus PUBLISHED, not CONSIGNOR_TAG),
 *    the same filter the sale page uses, so DRAFT and PENDING_REVIEW items never leave the building.
 *    On top of that, the feed applies the anonymous-viewer gates that GET /api/items?saleId= applies
 *    (no Hunt Pass, rank INITIATE): RARE items younger than 6h and LEGENDARY items younger than 12h,
 *    Legendary items before legendaryVisibleAt, and items still under an earlyAccessUntil embargo are
 *    withheld. Soft-deleted items are excluded, and while a sale's prelaunchAt (Sage+ preview) is in
 *    the future no items are syndicated at all.
 *  - Location is city / state / postal code only (2026-10-13 address gate): the street address is shown
 *    only to signed-in shoppers from the day before the sale starts, and this feed is anonymous and
 *    cached, so the street address is never selected and coordinates are coarsened to 2 decimals
 *    (~1 km). Online-only sales carry no location at all. Organizer phone and organizer street address
 *    are never selected here.
 *
 * Throws SyndicationNotAvailableError when the sale is missing or not syndicable.
 */
export async function generateSyndicationBundle(saleId: string, now: Date = new Date()): Promise<SyndicationBundle> {
  const rareVisibleBefore = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const legendaryVisibleBefore = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, status: 'PUBLISHED', deletedAt: null, isInventoryContainer: false },
    select: {
      id: true,
      title: true,
      description: true,
      startDate: true,
      endDate: true,
      isOngoing: true,
      city: true,
      state: true,
      zip: true,
      lat: true,
      lng: true,
      photoUrls: true,
      tags: true,
      status: true,
      saleType: true,
      isOnlineOnly: true,
      publishedAt: true,
      prelaunchAt: true,
      organizer: {
        select: {
          id: true,
          businessName: true,
          bio: true,
          tagline: true,
          yearFounded: true,
          website: true,
          profilePhoto: true,
          facebook: true,
          instagram: true,
          avgRating: true,
          totalReviews: true,
          totalSales: true,
          verificationStatus: true,
        },
      },
      items: {
        where: {
          ...PUBLIC_ITEM_FILTER,
          deletedAt: null,
          AND: [
            // Hunt Pass rarity early access (itemController isItemVisibleToUser): anonymous has no Hunt Pass.
            {
              OR: [
                { rarity: { notIn: ['RARE', 'LEGENDARY'] } },
                { rarity: 'RARE', createdAt: { lte: rareVisibleBefore } },
                { rarity: 'LEGENDARY', createdAt: { lte: legendaryVisibleBefore } },
              ],
            },
            // Phase 2b Legendary early access: INITIATE sees a Legendary item only once legendaryVisibleAt passes.
            { OR: [{ isLegendary: false }, { legendaryVisibleAt: null }, { legendaryVisibleAt: { lte: now } }] },
            // Hunt Pass embargo on the item itself.
            { OR: [{ earlyAccessUntil: null }, { earlyAccessUntil: { lte: now } }] },
            // Shared public embargo gate (lib/saleLocationPrivacy), same as every other public item list.
            notEmbargoedForPublicWhere(now),
          ],
        },
        orderBy: [{ status: 'asc' }, { id: 'asc' }],
        take: SYNDICATION_MAX_ITEMS,
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          category: true,
          condition: true,
          status: true,
          photoUrls: true,
          shippingAvailable: true,
          shippingPrice: true,
          currency: true,
        },
      },
    },
  });

  if (!sale) {
    throw new SyndicationNotAvailableError('Sale not found or not published');
  }

  // Same gate as getSale for an anonymous viewer: PUBLISHED with a publishedAt still in early access is locked.
  if (sale.publishedAt && isSaleLocked(sale.publishedAt, 'INITIATE', now)) {
    throw new SyndicationNotAvailableError('Sale not yet public');
  }

  // Feature #106 prelaunch preview: before prelaunchAt only Sage+ may browse inventory, so an anonymous
  // feed carries the sale but none of its items.
  const inPrelaunch = !!sale.prelaunchAt && sale.prelaunchAt.getTime() > now.getTime();

  const saleForSyndication: SaleWithItems = {
    id: sale.id,
    title: sale.title,
    description: sale.description,
    startDate: sale.startDate,
    endDate: sale.endDate,
    isOngoing: sale.isOngoing,
    city: sale.city,
    state: sale.state,
    zip: sale.zip,
    // Online-only sales have no physical location, so coordinates are withheld; physical sales get coarse
    // coordinates only (the street address is never selected).
    lat: sale.isOnlineOnly ? null : coarseCoord(sale.lat),
    lng: sale.isOnlineOnly ? null : coarseCoord(sale.lng),
    photoUrls: sale.photoUrls,
    tags: sale.tags,
    status: sale.status,
    saleType: sale.saleType,
    isOnlineOnly: sale.isOnlineOnly,
    // Day-of approach notes (parking, entrance) can point at the house: never part of the public feed.
    notes: null,
    organizer: {
      id: sale.organizer.id,
      businessName: sale.organizer.businessName,
      // Organizer phone and organizer street address are deliberately not selected and have no slot here.
      bio: sale.organizer.bio,
      tagline: sale.organizer.tagline,
      yearFounded: sale.organizer.yearFounded,
      website: sale.organizer.website,
      profilePhoto: sale.organizer.profilePhoto,
      facebook: sale.organizer.facebook,
      instagram: sale.organizer.instagram,
      avgRating: sale.organizer.avgRating,
      totalReviews: sale.organizer.totalReviews,
      totalSales: sale.organizer.totalSales,
      verificationStatus: sale.organizer.verificationStatus,
    },
    items: inPrelaunch ? [] : sale.items,
  };

  const event = formatSaleForSchemaOrg(saleForSyndication);
  const org = formatOrganizerForSchemaOrg(saleForSyndication.organizer);
  const dataCommons = formatSaleForDataCommons(saleForSyndication);

  const items: SchemaOrgProduct[] = [];
  for (const item of saleForSyndication.items) {
    const product = formatItemForSchemaOrg(item, sale.id);
    if (product) items.push(product);
  }

  return {
    event,
    org,
    items,
    dataCommons,
    generatedAt: now,
  };
}
