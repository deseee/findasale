/**
 * ADR-073: Organizer Enrichment via Google Places & ESN Company Profile APIs
 * Fires after organizer creation/update to populate verification data
 */

import { prisma } from '../../lib/prisma';
import { getRandomUserAgent } from './userAgents';

/**
 * Main enrichment entry point.
 * Looks up organizer data via ESN company-public-page API and Google Places.
 * Fire-and-forget; errors logged but not thrown.
 */
export async function enrichOrganizer(
  organizerId: string,
  name: string,
  city: string,
  state: string
): Promise<void> {
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: {
        id: true,
        googlePlaceId: true,
        phone: true,
        website: true,
        address: true,
        profilePhoto: true,
        bio: true,
        facebook: true,
        instagram: true,
        twitterUrl: true,
        youtubeUrl: true,
        pinterestUrl: true,
        linkedInUrl: true,
        serviceAreas: true,
        esnOrgId: true,
      },
    });

    if (!organizer) {
      console.warn(`[Enrichment] Organizer not found: ${organizerId}`);
      return;
    }

    // Skip only if already Google-enriched and no ESN data to add
    if (organizer.googlePlaceId && !organizer.esnOrgId) {
      console.info(`[Enrichment] Already enriched, no ESN ID — skipping: ${organizerId}`);
      return;
    }

    const updateData: Record<string, any> = {};

    // Step 1: ESN enrichment (highest priority for ESN-sourced organizers)
    if (organizer.esnOrgId) {
      const esnData = await lookupESNCompanyProfile(organizer.esnOrgId);
      if (esnData) {
        if (esnData.primaryPhoneNumber && !organizer.phone)
          updateData.phone = esnData.primaryPhoneNumber;
        if (esnData.websiteUrl && !organizer.website)
          updateData.website = esnData.websiteUrl;
        if (esnData.companyLogoUrl && !organizer.profilePhoto)
          updateData.profilePhoto = esnData.companyLogoUrl;
        if (esnData.description && !organizer.bio) {
          updateData.bio = esnData.description
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        }
        if (esnData.facebookUrl && !organizer.facebook)
          updateData.facebook = esnData.facebookUrl;
        if (esnData.instagramUrl && !organizer.instagram)
          updateData.instagram = esnData.instagramUrl;
        if (esnData.twitterHandle && !organizer.twitterUrl)
          updateData.twitterUrl = esnData.twitterHandle;
        if (esnData.youtubeUrl && !organizer.youtubeUrl)
          updateData.youtubeUrl = esnData.youtubeUrl;
        if (esnData.pinterestUrl && !organizer.pinterestUrl)
          updateData.pinterestUrl = esnData.pinterestUrl;
        if (esnData.linkedInUrl && !organizer.linkedInUrl)
          updateData.linkedInUrl = esnData.linkedInUrl;
        if (esnData.metroAreaNames && !organizer.serviceAreas)
          updateData.serviceAreas = esnData.metroAreaNames.join(', ');
        if (esnData.memberships)
          updateData.esnMemberships = esnData.memberships;
        if (esnData.orgPackageType)
          updateData.esnPackageType = esnData.orgPackageType;
      }
    }

    // Step 2: Google Places (fills address, phone, website, photo if still missing)
    if (!organizer.googlePlaceId) {
      const placeId = await lookupGooglePlace(name, city, state);
      if (placeId) {
        updateData.googlePlaceId = placeId;

        const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;
        if (googlePlacesKey) {
          const details = await fetchGooglePlaceDetails(placeId, googlePlacesKey);
          if (details) {
            if (details.phone && !organizer.phone && !updateData.phone)
              updateData.phone = details.phone;
            if (details.website && !organizer.website && !updateData.website)
              updateData.website = details.website;
            if (details.formattedAddress && !organizer.address)
              updateData.address = details.formattedAddress;
            if (details.photoReference && !organizer.profilePhoto && !updateData.profilePhoto) {
              const photoUrl = getGooglePhotoUrl(details.photoReference, googlePlacesKey);
              if (photoUrl) updateData.profilePhoto = photoUrl;
            }
          }
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.organizer.update({
        where: { id: organizerId },
        data: updateData,
      });
      console.info(
        `[Enrichment] Updated organizer ${organizerId}: ${JSON.stringify(updateData)}`
      );
    } else {
      console.info(`[Enrichment] No enrichment data found for ${organizerId}`);
    }
  } catch (error) {
    console.error(
      `[Enrichment] Failed to enrich organizer ${organizerId}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Lookup organizer via Google Places API.
 * Returns place ID on success, null on failure or if not found.
 */
async function lookupGooglePlace(
  name: string,
  city: string,
  state: string
): Promise<string | null> {
  const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!googlePlacesKey) return null;

  try {
    const query = `${name} ${city} ${state}`;
    const url = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
    url.searchParams.set('input', query);
    url.searchParams.set('inputtype', 'textquery');
    url.searchParams.set('fields', 'place_id,name,formatted_address');
    url.searchParams.set('key', googlePlacesKey);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(
        `[Enrichment] Google Places API error: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = (await response.json()) as {
      candidates?: Array<{ place_id: string; name: string }>;
      status: string;
    };

    if (data.status !== 'OK' || !data.candidates || data.candidates.length === 0) {
      return null;
    }

    return data.candidates[0]?.place_id || null;
  } catch (error) {
    console.warn(
      `[Enrichment] Google Places lookup failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Fetch full business details from Google Places Details API.
 */
async function fetchGooglePlaceDetails(
  placeId: string,
  apiKey: string
): Promise<{
  phone?: string;
  website?: string;
  hoursText?: string[];
  photoReference?: string;
  formattedAddress?: string;
} | null> {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set(
      'fields',
      'formatted_phone_number,website,opening_hours,photos,formatted_address'
    );
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[Enrichment] Place Details API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      result?: {
        formatted_phone_number?: string;
        website?: string;
        opening_hours?: { weekday_text?: string[] };
        photos?: Array<{ photo_reference: string }>;
        formatted_address?: string;
      };
      status: string;
    };

    if (data.status !== 'OK' || !data.result) return null;

    return {
      phone: data.result.formatted_phone_number,
      website: data.result.website,
      hoursText: data.result.opening_hours?.weekday_text,
      photoReference: data.result.photos?.[0]?.photo_reference,
      formattedAddress: data.result.formatted_address,
    };
  } catch (error) {
    console.warn(
      `[Enrichment] Place Details lookup failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Lookup EstateSales.NET company profile via company-public-page API.
 */
async function lookupESNCompanyProfile(
  esnOrgId: number
): Promise<{
  primaryPhoneNumber?: string;
  websiteUrl?: string;
  companyLogoUrl?: string;
  description?: string;
  metroAreaNames?: string[];
  instagramUrl?: string;
  pinterestUrl?: string;
  facebookUrl?: string;
  linkedInUrl?: string;
  twitterHandle?: string;
  youtubeUrl?: string;
  memberships?: Array<{ id: number; name: string; shortDescription?: string; description?: string }>;
  orgPackageType?: string;
} | null> {
  try {
    const query = JSON.stringify({ orgId: esnOrgId });
    const url = `https://www.estatesales.net/api/legacy/queries/companies/company-public-page?query=${encodeURIComponent(query)}&explicitTypes=DateTime`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'application/json',
        'Accept-Language': 'en-US',
        Referer: 'https://www.estatesales.net/',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(
        `[Enrichment] ESN company profile API error: ${response.status} for orgId=${esnOrgId}`
      );
      return null;
    }

    return (await response.json()) as any;
  } catch (error) {
    console.warn(
      `[Enrichment] ESN lookup failed for orgId=${esnOrgId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Generate a public Google Places Photo URL.
 */
function getGooglePhotoUrl(photoReference: string, apiKey: string): string {
  const url = new URL('https://maps.googleapis.com/maps/api/place/photo');
  url.searchParams.set('maxwidth', '400');
  url.searchParams.set('photo_reference', photoReference);
  url.searchParams.set('key', apiKey);
  return url.toString();
}
