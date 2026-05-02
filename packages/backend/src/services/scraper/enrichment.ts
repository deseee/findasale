/**
 * ADR-073: Organizer Enrichment via Google Places & Facebook Graph APIs
 * Fires after organizer creation/update to populate verification data
 */

import { prisma } from '../../lib/prisma';
import { getRandomUserAgent } from './userAgents';

/**
 * Main enrichment entry point.
 * Looks up organizer data via Google Places and Facebook Graph APIs.
 * Updates googlePlaceId and facebookPageId on the Organizer record.
 * Fire-and-forget; errors logged but not thrown.
 */
export async function enrichOrganizer(
  organizerId: string,
  name: string,
  city: string,
  state: string
): Promise<void> {
  try {
    // Fetch organizer to confirm it exists
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: {
        id: true,
        googlePlaceId: true,
        facebookPageId: true,
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

    // Already enriched — skip
    if (organizer.googlePlaceId && organizer.facebookPageId) {
      console.info(`[Enrichment] Organizer already enriched: ${organizerId}`);
      return;
    }

    // Update organizer with any found values
    const updateData: Record<string, any> = {};

    // Step 1: ESN enrichment (highest priority for ESN-sourced organizers)
    if (organizer.esnOrgId) {
      const esnData = await lookupESNCompanyProfile(organizer.esnOrgId);
      if (esnData) {
        // Map ESN fields to Organizer fields (only if organizer doesn't already have them)
        if (esnData.primaryPhoneNumber && !organizer.phone) {
          updateData.phone = esnData.primaryPhoneNumber;
        }
        if (esnData.websiteUrl && !organizer.website) {
          updateData.website = esnData.websiteUrl;
        }
        if (esnData.companyLogoUrl && !organizer.profilePhoto) {
          updateData.profilePhoto = esnData.companyLogoUrl;
        }
        if (esnData.description && !organizer.bio) {
          // Strip HTML tags from description
          const plainText = esnData.description
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          updateData.bio = plainText;
        }
        if (esnData.facebookUrl && !organizer.facebook) {
          updateData.facebook = esnData.facebookUrl;
        }
        if (esnData.instagramUrl && !organizer.instagram) {
          updateData.instagram = esnData.instagramUrl;
        }
        if (esnData.twitterHandle && !organizer.twitterUrl) {
          updateData.twitterUrl = esnData.twitterHandle;
        }
        if (esnData.youtubeUrl && !organizer.youtubeUrl) {
          updateData.youtubeUrl = esnData.youtubeUrl;
        }
        if (esnData.pinterestUrl && !organizer.pinterestUrl) {
          updateData.pinterestUrl = esnData.pinterestUrl;
        }
        if (esnData.linkedInUrl && !organizer.linkedInUrl) {
          updateData.linkedInUrl = esnData.linkedInUrl;
        }
        if (esnData.metroAreaNames && !organizer.serviceAreas) {
          updateData.serviceAreas = esnData.metroAreaNames.join(', ');
        }
        // Always update memberships and package type (structured data)
        if (esnData.memberships) {
          updateData.esnMemberships = esnData.memberships;
        }
        if (esnData.orgPackageType) {
          updateData.esnPackageType = esnData.orgPackageType;
        }
      }
    }

    // Step 2: Google Places & Facebook enrichment (fallback for fields not found in ESN)
    const [placeId, fbPageId] = await Promise.all([
      lookupGooglePlace(name, city, state),
      lookupFacebookPage(name, city, state),
    ]);

    if (placeId && !organizer.googlePlaceId) {
      updateData.googlePlaceId = placeId;
    }
    if (fbPageId && !organizer.facebookPageId) {
      updateData.facebookPageId = fbPageId;
    }

    // Fetch full Place Details if we found a place ID and Google API key is available
    const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;
    if (placeId && googlePlacesKey) {
      const details = await fetchGooglePlaceDetails(placeId, googlePlacesKey);
      if (details) {
        if (details.phone && !organizer.phone) {
          updateData.phone = details.phone;
        }
        if (details.website && !organizer.website) {
          updateData.website = details.website;
        }
        if (details.formattedAddress && !organizer.address) {
          updateData.address = details.formattedAddress;
        }
        if (details.photoReference && !organizer.profilePhoto) {
          const photoUrl = getGooglePhotoUrl(details.photoReference, googlePlacesKey);
          if (photoUrl) {
            updateData.profilePhoto = photoUrl;
          }
        }
        // Hours parsing deferred to Phase 2 — complex time format
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
    // Silent failure — enrichment is best-effort
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
  if (!googlePlacesKey) {
    console.warn('[Enrichment] GOOGLE_PLACES_API_KEY not set, skipping Places lookup');
    return null;
  }

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
      console.debug(`[Enrichment] No Google Places result for: ${query}`);
      return null;
    }

    const placeId = data.candidates[0]?.place_id;
    if (placeId) {
      console.debug(`[Enrichment] Found Google Place: ${placeId}`);
    }
    return placeId || null;
  } catch (error) {
    console.warn(
      `[Enrichment] Google Places lookup failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Lookup organizer via Facebook Graph API.
 * Searches for pages by name and performs simple name similarity check.
 * Returns page ID on success, null on failure or if not found.
 */
async function lookupFacebookPage(
  name: string,
  city: string,
  state: string
): Promise<string | null> {
  const fbAccessToken = process.env.FB_ACCESS_TOKEN;
  if (!fbAccessToken) {
    console.warn('[Enrichment] FB_ACCESS_TOKEN not set, skipping Facebook lookup');
    return null;
  }

  try {
    const query = `${name} ${city} ${state}`;
    const url = new URL('https://graph.facebook.com/v18.0/search');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'page');
    url.searchParams.set('fields', 'id,name');
    url.searchParams.set('access_token', fbAccessToken);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(
        `[Enrichment] Facebook Graph API error: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = (await response.json()) as {
      data?: Array<{ id: string; name: string }>;
    };

    if (!data.data || data.data.length === 0) {
      console.debug(`[Enrichment] No Facebook pages found for: ${query}`);
      return null;
    }

    // Find best match: prefer exact match or substring match (case-insensitive)
    const normalizedOrgName = name.toLowerCase();
    let bestMatch = data.data[0]; // Fallback to first result

    for (const page of data.data) {
      const normalizedPageName = page.name.toLowerCase();
      if (normalizedPageName === normalizedOrgName) {
        // Exact match — use this
        bestMatch = page;
        break;
      }
      if (
        normalizedOrgName.includes(normalizedPageName) ||
        normalizedPageName.includes(normalizedOrgName)
      ) {
        // Partial match — use this if we haven't found exact
        if (bestMatch.name.toLowerCase() !== normalizedOrgName) {
          bestMatch = page;
        }
      }
    }

    if (bestMatch.id) {
      console.debug(`[Enrichment] Found Facebook page: ${bestMatch.id} (${bestMatch.name})`);
    }
    return bestMatch.id || null;
  } catch (error) {
    console.warn(
      `[Enrichment] Facebook Graph lookup failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Fetch full business details from Google Places Details API.
 * Returns phone, website, hours, photo reference, and formatted address.
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

    if (data.status !== 'OK' || !data.result) {
      console.debug(`[Enrichment] No Place Details for ${placeId}`);
      return null;
    }

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
 * Returns enrichment data (phone, website, logo, bio, social links, memberships, etc.) on success, null on failure.
 */
async function lookupESNCompanyProfile(
  esnOrgId: number
): Promise<{
  primaryPhoneNumber?: string;
  secondaryPhoneNumber?: string;
  websiteUrl?: string;
  companyLogoUrl?: string;
  description?: string;
  cityName?: string;
  stateCode?: string;
  postalCodeNumber?: string;
  primaryMetroAreaName?: string;
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

    const data = (await response.json()) as {
      primaryPhoneNumber?: string;
      secondaryPhoneNumber?: string;
      websiteUrl?: string;
      companyLogoUrl?: string;
      description?: string;
      cityName?: string;
      stateCode?: string;
      postalCodeNumber?: string;
      primaryMetroAreaName?: string;
      metroAreaNames?: string[];
      instagramUrl?: string;
      pinterestUrl?: string;
      facebookUrl?: string;
      linkedInUrl?: string;
      twitterHandle?: string;
      youtubeUrl?: string;
      memberships?: Array<{ id: number; name: string; shortDescription?: string; description?: string }>;
      orgPackageType?: string;
    };

    console.debug(`[Enrichment] Found ESN company profile for orgId=${esnOrgId}`);
    return data;
  } catch (error) {
    console.warn(
      `[Enrichment] ESN company profile lookup failed for orgId=${esnOrgId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Generate a public Google Places Photo URL.
 * Returns a URL that redirects to the actual image.
 */
function getGooglePhotoUrl(photoReference: string, apiKey: string): string {
  const url = new URL('https://maps.googleapis.com/maps/api/place/photo');
  url.searchParams.set('maxwidth', '400');
  url.searchParams.set('photo_reference', photoReference);
  url.searchParams.set('key', apiKey);
  return url.toString();
}
