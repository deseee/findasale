/**
 * ADR-073: Organizer Enrichment via Google Places & Facebook Graph APIs
 * Fires after organizer creation/update to populate verification data
 */

import { prisma } from '../../lib/prisma';

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
      select: { id: true, googlePlaceId: true, facebookPageId: true },
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

    // Lookup and update in parallel, but independently
    const [placeId, fbPageId] = await Promise.all([
      lookupGooglePlace(name, city, state),
      lookupFacebookPage(name, city, state),
    ]);

    // Update organizer with any found values
    const updateData: Record<string, any> = {};
    if (placeId && !organizer.googlePlaceId) {
      updateData.googlePlaceId = placeId;
    }
    if (fbPageId && !organizer.facebookPageId) {
      updateData.facebookPageId = fbPageId;
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
  const googlePlacesKey = process.env.GOOGLE_PLACES_KEY;
  if (!googlePlacesKey) {
    console.warn('[Enrichment] GOOGLE_PLACES_KEY not set, skipping Places lookup');
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
