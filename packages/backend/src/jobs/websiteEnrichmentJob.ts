/**
 * Website Enrichment Job — ADR-077 Phase 3
 *
 * Fixes the critical pipeline gap where state-licensed organizers have
 * isStateLicensed=true but no website, preventing emailDiscoveryService
 * from running. This job queries HERE Places (then Foursquare as fallback)
 * by businessName + city to populate the website field, after which the
 * existing emailDiscoveryJob picks them up on its next run.
 *
 * Cron: Sundays 01:00 UTC (before emailDiscoveryCron at 03:00 UTC)
 * Gate: WEBSITE_ENRICHMENT_ENABLED=true
 */

import * as cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { discoverEmail } from '../services/emailDiscoveryService';
import { updateDirectoryConfidenceScore } from '../services/directoryConfidenceService';

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 2000;
const MAX_BACKFILL_BATCHES = 200; // safety cap

// ─── HERE Places lookup ─────────────────────────────────────────────────────

async function lookupWebsiteViaHere(
  businessName: string,
  city: string,
  state: string
): Promise<{ website: string | null; phone: string | null }> {
  const apiKey = process.env.HERE_API_KEY;
  if (!apiKey) return { website: null, phone: null };

  try {
    const q = encodeURIComponent(`${businessName} ${city} ${state}`);
    const url = `https://discover.search.hereapi.com/v1/discover?q=${q}&in=countryCode:USA&limit=1&apiKey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { website: null, phone: null };
    const data = await res.json() as { items?: Array<{ contacts?: Array<{ www?: Array<{ value?: string }>; phone?: Array<{ value?: string }> }> }> };
    const item = data?.items?.[0];
    const website = item?.contacts?.[0]?.www?.[0]?.value ?? null;
    const phone = item?.contacts?.[0]?.phone?.[0]?.value ?? null;
    return { website: website || null, phone: phone || null };
  } catch {
    return { website: null, phone: null };
  }
}

// ─── Foursquare Places lookup (fallback) ─────────────────────────────────────

async function lookupWebsiteViaFoursquare(
  businessName: string,
  city: string,
  state: string
): Promise<{ website: string | null; phone: string | null }> {
  const apiKey = process.env.FOURSQUARE_API_KEY?.trim();
  if (!apiKey) return { website: null, phone: null };

  try {
    const q = encodeURIComponent(businessName);
    const near = encodeURIComponent(`${city}, ${state}`);
    const url = `https://places-api.foursquare.com/places/search?query=${q}&near=${near}&limit=1&fields=website,tel`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { website: null, phone: null };
    const data = await res.json() as { results?: Array<{ website?: string; tel?: string }> };
    const result = data?.results?.[0];
    return { website: result?.website ?? null, phone: result?.tel ?? null };
  } catch {
    return { website: null, phone: null };
  }
}

// ─── Parse city/state from organizer address ─────────────────────────────────

function parseCityState(address: string, licenseState?: string | null): { city: string; state: string } | null {
  // Address stored as "City, STATE" by scraper
  const match = address.match(/^(.+),\s*([A-Z]{2})$/);
  if (match) return { city: match[1].trim(), state: match[2].trim() };
  // Fallback: use licenseState if available
  if (licenseState) return { city: address.trim(), state: licenseState };
  return null;
}

// ─── Core enrichment logic ────────────────────────────────────────────────────

async function enrichBatch(skip: number): Promise<number> {
  const organizers = await prisma.organizer.findMany({
    where: {
      isStateLicensed: true,
      website: null,
      isUnmanagedListing: true,
    },
    select: {
      id: true,
      businessName: true,
      address: true,
      licenseState: true,
      phone: true,
    },
    skip,
    take: BATCH_SIZE,
    orderBy: { id: 'asc' },
  });

  let enriched = 0;

  for (const org of organizers) {
    const location = parseCityState(org.address, org.licenseState);
    if (!location) continue;

    const { city, state } = location;

    // Try HERE first (free up to 250K/month)
    let { website, phone } = await lookupWebsiteViaHere(org.businessName, city, state);

    // Fall back to Foursquare (Sandbox — use sparingly)
    if (!website) {
      const foursquare = await lookupWebsiteViaFoursquare(org.businessName, city, state);
      website = foursquare.website;
      if (!phone) phone = foursquare.phone;
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (website) updateData.website = website;
    if (phone && !org.phone) updateData.phone = phone;

    if (Object.keys(updateData).length > 1) {
      await prisma.organizer.update({
        where: { id: org.id },
        data: updateData,
      });
      if (website) console.log(`[WebsiteEnrichment] Found website for "${org.businessName}": ${website}`);
      if (phone && !org.phone) console.log(`[WebsiteEnrichment] Found phone for "${org.businessName}": ${phone}`);
      enriched++;

      // Chain email discovery: now that this organizer has a website, trigger
      // email discovery inline rather than waiting for emailDiscoveryJob's next run.
      if (website) {
        try {
          const email = await discoverEmail(org.id);
          if (email) console.log(`[WebsiteEnrichment] Chained email discovery found "${email}" for "${org.businessName}"`);
        } catch (err) {
          console.warn(
            `[WebsiteEnrichment] Chained email discovery failed for "${org.businessName}":`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      // Feature #458: Recalculate directory confidence score after enrichment
      try {
        await updateDirectoryConfidenceScore(org.id);
      } catch (err) {
        console.warn(`[WebsiteEnrichment] Confidence score update failed for "${org.businessName}":`, err instanceof Error ? err.message : String(err));
      }
    }

    // Small delay between individual lookups to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return organizers.length; // return count fetched (for cursor advancement)
}

// ─── Single-batch job (cron use) ─────────────────────────────────────────────

export async function runWebsiteEnrichmentJob(): Promise<void> {
  if (process.env.WEBSITE_ENRICHMENT_ENABLED !== 'true') {
    console.log('[WebsiteEnrichment] Skipped — WEBSITE_ENRICHMENT_ENABLED not set');
    return;
  }
  console.log('[WebsiteEnrichment] Starting single-batch website enrichment run');
  await enrichBatch(0);
  console.log('[WebsiteEnrichment] Single-batch run complete');
}

// ─── Full backfill (manual trigger) ──────────────────────────────────────────

export async function runWebsiteEnrichmentBackfill(): Promise<void> {
  if (process.env.WEBSITE_ENRICHMENT_ENABLED !== 'true') {
    console.log('[WebsiteEnrichment] Backfill skipped — WEBSITE_ENRICHMENT_ENABLED not set');
    return;
  }
  console.log('[WebsiteEnrichment] Starting full backfill');
  let skip = 0;
  let batchCount = 0;

  while (batchCount < MAX_BACKFILL_BATCHES) {
    const fetched = await enrichBatch(skip);
    batchCount++;
    if (fetched < BATCH_SIZE) break; // last page
    skip += BATCH_SIZE;
    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
  }

  console.log(`[WebsiteEnrichment] Backfill complete — ${batchCount} batch(es) processed`);
}

// ─── Cron registration ────────────────────────────────────────────────────────

export function initWebsiteEnrichmentCron(): void {
  // Sundays 01:00 UTC — runs before emailDiscoveryCron (03:00 UTC)
  cron.schedule('0 1 * * 0', async () => {
    console.log('[WebsiteEnrichment] Cron triggered');
    try {
      await runWebsiteEnrichmentJob();
    } catch (err) {
      console.error('[WebsiteEnrichment] Cron error:', err);
    }
  });
  console.log('[WebsiteEnrichment] Cron registered — Sundays 01:00 UTC');
}
