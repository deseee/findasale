/**
 * Shared schema.org Event JSON-LD builders.
 *
 * Why this exists (GSC 2026-09-22 "Events" report):
 *  - CRITICAL "Missing field 'location'" and non-critical "Missing field 'organizer'".
 *    Root cause: the EventSeries block on /sales/[id] emitted `subEvent` Event nodes with
 *    only name/dates/url -- no location and no organizer. Every Event node Google sees
 *    (including nested subEvents) must carry its own `location`.
 *  - City / category / this-weekend ItemList pages emitted organizer only when the
 *    listing had one, and an empty street address as-is.
 *
 * Rules enforced here:
 *  - location is always a Place with a `name` and a PostalAddress built only from the
 *    address fields the caller already has (and already shows publicly). No field is
 *    ever looked up or added here, so an address the backend withholds stays withheld.
 *    When there is no street address, the address falls back to city/region/postal level.
 *  - If there is no usable location at all (no street, city or postal code), or no
 *    startDate, the builder returns null so the caller skips that Event instead of
 *    emitting an invalid one.
 *  - organizer is an Organization with the organizer's business name and their public
 *    organizer page (canonical: /organizers/{id}); omitted only when no name exists.
 */

const SITE_URL = 'https://finda.sale';

export type JsonLdNode = Record<string, unknown>;

/**
 * Map a Sale.status (String column: DRAFT | PUBLISHED | ENDED | CANCELLED) to a valid
 * schema.org eventStatus. Google accepts EventScheduled, EventCancelled, EventPostponed,
 * EventRescheduled (the latter REQUIRES previousStartDate) and EventMovedOnline.
 *  - CANCELLED (and the 'CANCELED' spelling) -> EventCancelled.
 *  - Everything else, including ENDED -> EventScheduled. An ended sale was not
 *    rescheduled; Google treats an Event with past dates as a past event on its own.
 * We have no reschedule/postpone tracking (no previousStartDate), so this never emits
 * EventRescheduled or EventPostponed.
 */
export function saleEventStatus(status?: string | null): string {
  const s = typeof status === 'string' ? status.trim().toUpperCase() : '';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'https://schema.org/EventCancelled';
  return 'https://schema.org/EventScheduled';
}

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface EventPlaceInput {
  placeName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

/** Place + PostalAddress, or null when there is nothing locatable. */
export function buildEventPlace(input: EventPlaceInput): JsonLdNode | null {
  const street = clean(input.address);
  const city = clean(input.city);
  const state = clean(input.state);
  const zip = clean(input.zip);

  if (!street && !city && !zip) return null;

  const locality = [city, state].filter((v): v is string => Boolean(v)).join(', ');
  const name = clean(input.placeName) || locality || street || zip || '';

  const address: JsonLdNode = { '@type': 'PostalAddress' };
  if (street) address.streetAddress = street;
  if (city) address.addressLocality = city;
  if (state) address.addressRegion = state;
  if (zip) address.postalCode = zip;
  address.addressCountry = 'US';

  return { '@type': 'Place', name, address };
}

export interface EventOrganizerInput {
  id?: string | null;
  businessName?: string | null;
}

/** Organization node for the organizer, or undefined when no business name exists. */
export function buildEventOrganizer(
  organizer: EventOrganizerInput | null | undefined
): JsonLdNode | undefined {
  const name = clean(organizer?.businessName);
  if (!name) return undefined;
  const id = clean(organizer?.id);
  return {
    '@type': 'Organization',
    name,
    ...(id ? { url: `${SITE_URL}/organizers/${encodeURIComponent(id)}` } : {}),
  };
}

export interface ListingEventInput {
  id: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  photoUrl?: string | null;
  organizer?: EventOrganizerInput | null;
  status?: string | null;
}

/**
 * Event node for a sale listed on a city / category / this-weekend page ItemList.
 * Returns null when the listing cannot produce a valid Event.
 */
export function buildListingEvent(sale: ListingEventInput): JsonLdNode | null {
  const startDate = clean(sale.startDate);
  if (!startDate) return null;
  const location = buildEventPlace({
    placeName: clean(sale.organizer?.businessName) || sale.title,
    address: sale.address,
    city: sale.city,
    state: sale.state,
    zip: sale.zip,
  });
  if (!location) return null;
  const organizer = buildEventOrganizer(sale.organizer);
  const endDate = clean(sale.endDate);
  const image = clean(sale.photoUrl);
  return {
    '@type': 'Event',
    name: sale.title,
    url: `${SITE_URL}/sales/${sale.id}`,
    startDate,
    ...(endDate ? { endDate } : {}),
    eventStatus: saleEventStatus(sale.status),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location,
    ...(image ? { image } : {}),
    ...(organizer ? { organizer } : {}),
  };
}

export interface SeriesSaleInput {
  id: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
}

/**
 * Event node for an EventSeries `subEvent`. The recurring-sales endpoint returns only
 * city/state (no street address), so the location is city/region level by design.
 */
export function buildSeriesSubEvent(
  sale: SeriesSaleInput,
  organizer: EventOrganizerInput | null | undefined
): JsonLdNode | null {
  const startDate = clean(sale.startDate);
  if (!startDate) return null;
  const location = buildEventPlace({ city: sale.city, state: sale.state });
  if (!location) return null;
  const org = buildEventOrganizer(organizer);
  const endDate = clean(sale.endDate);
  return {
    '@type': 'Event',
    name: sale.title,
    startDate,
    ...(endDate ? { endDate } : {}),
    eventStatus: saleEventStatus(sale.status),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: `${SITE_URL}/sales/${sale.id}`,
    location,
    ...(org ? { organizer: org } : {}),
  };
}
