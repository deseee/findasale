import { prisma } from '../lib/prisma';

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface SaleWithItems {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  isOngoing: boolean;
  address: string;
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
  phone: string | null;
  address: string;
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
  streetAddress: string;
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
    telephone?: string;
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
  address?: SchemaOrgPostalAddress;
  telephone?: string;
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
      streetAddress: string;
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

function conditionToSchemaOrg(condition: string | null): string | undefined {
  if (!condition) return undefined;
  const map: Record<string, string> = {
    NEW: 'https://schema.org/NewCondition',
    USED: 'https://schema.org/UsedCondition',
    REFURBISHED: 'https://schema.org/RefurbishedCondition',
    PARTS_OR_REPAIR: 'https://schema.org/DamagedCondition',
  };
  return map[condition];
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

function buildPostalAddress(
  address: string,
  city: string,
  state: string,
  zip: string
): SchemaOrgPostalAddress {
  return {
    '@type': 'PostalAddress',
    streetAddress: address,
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

  const location: SchemaOrgEvent['location'] = isOnline
    ? { '@type': 'VirtualLocation', url: saleUrl }
    : buildPostalAddress(sale.address, sale.city, sale.state, sale.zip);

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
      ...(sale.organizer.website ? { url: sale.organizer.website } : {}),
      ...(sale.organizer.phone ? { telephone: sale.organizer.phone } : {}),
    },
    url: saleUrl,
  };

  if (sale.description) {
    event.description = sale.description;
  }

  if (sale.photoUrls.length > 0) {
    event.image = sale.photoUrls;
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
  if (organizer.phone) org.telephone = organizer.phone;
  if (organizer.website) org.url = organizer.website;
  if (organizer.profilePhoto) org.logo = organizer.profilePhoto;
  if (organizer.yearFounded) org.foundingDate = String(organizer.yearFounded);

  // Build address from Organizer address field (address only — no city/state on Organizer model)
  if (organizer.address) {
    org.address = {
      '@type': 'PostalAddress',
      streetAddress: organizer.address,
      addressLocality: '',
      addressRegion: '',
      postalCode: '',
      addressCountry: 'US',
    };
  }

  // Social links
  const sameAs: string[] = [];
  if (organizer.facebook) sameAs.push(organizer.facebook);
  if (organizer.instagram) sameAs.push(organizer.instagram);
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
        streetAddress: sale.address,
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

  if (sale.lat && sale.lng) {
    entry.location.geo = {
      '@type': 'GeoCoordinates',
      latitude: sale.lat,
      longitude: sale.lng,
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
  if (item.photoUrls.length > 0) product.image = item.photoUrls;
  if (item.category) product.category = item.category;
  if (itemCondition) product.itemCondition = itemCondition;

  return product;
}

/**
 * Generate a syndication-ready JSON export for a sale.
 * Only works for PUBLISHED sales. Throws if not found or not published.
 */
export async function generateSyndicationBundle(saleId: string): Promise<SyndicationBundle> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      organizer: {
        include: {
          user: {
            select: { id: true },
          },
        },
      },
      items: {
        where: { isActive: true },
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
    throw new Error(`Sale not found: ${saleId}`);
  }

  if (sale.status !== 'PUBLISHED') {
    throw new Error(`Sale ${saleId} is not published (status: ${sale.status})`);
  }

  const saleForSyndication: SaleWithItems = {
    id: sale.id,
    title: sale.title,
    description: sale.description,
    startDate: sale.startDate,
    endDate: sale.endDate,
    isOngoing: sale.isOngoing,
    address: sale.address,
    city: sale.city,
    state: sale.state,
    zip: sale.zip,
    lat: sale.lat,
    lng: sale.lng,
    photoUrls: sale.photoUrls,
    tags: sale.tags,
    status: sale.status,
    saleType: sale.saleType,
    isOnlineOnly: sale.isOnlineOnly,
    notes: sale.notes,
    organizer: {
      id: sale.organizer.id,
      businessName: sale.organizer.businessName,
      phone: sale.organizer.phone,
      address: sale.organizer.address,
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
    items: sale.items,
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
    generatedAt: new Date(),
  };
}
