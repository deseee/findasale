/**
 * ADR-073: Internal Enrichment Backfill Controller
 * One-time backfill endpoint to enrich unmanaged listings with Google Places data
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { enrichOrganizer } from '../services/scraper/enrichment';

export async function runEnrichmentBackfill(req: Request, res: Response): Promise<void> {
  try {
    const enrichAll = req.query.all === 'true';

    // Build where clause — ?all=true re-enriches everyone, default targets unenriched only
    const where: Record<string, unknown> = {
      isUnmanagedListing: true,
      businessName: {
        not: 'FindA.Sale Directory',
      },
    };

    if (!enrichAll) {
      where.googlePlaceId = null;
    }

    // Add guard: skip test accounts with @example.com emails
    const emailFilter = {
      user: {
        email: { not: { endsWith: '@example.com' } }
      }
    };
    const whereWithEmailGuard = { ...where, ...emailFilter };

    const organizers = await prisma.organizer.findMany({
      where: whereWithEmailGuard as Parameters<typeof prisma.organizer.findMany>[0]['where'],
      select: {
        id: true,
        businessName: true,
        address: true,
      },
      include: {
        user: { select: { email: true } }
      }
    });

    const count = organizers.length;
    const mode = enrichAll ? 'ALL (including previously enriched)' : 'UNENRICHED ONLY (googlePlaceId is null)';
    console.log(`[Backfill] Mode: ${mode} — queued ${count} organizers`);

    // Respond immediately
    res.status(202).json({ queued: count, mode });

    // Process in background
    setImmediate(async () => {
      let processed = 0;

      try {
        for (const org of organizers) {
          // Parse address format: "city, state"
          let city = '';
          let state = '';

          if (org.address) {
            const parts = org.address.split(', ');
            if (parts.length >= 2) {
              city = parts[0].trim();
              state = parts[1].trim();
            }
          }

          // Skip if we couldn't parse the address
          if (!city || !state) {
            console.warn(`[Backfill] Skipping ${org.id}: unparseable address "${org.address}"`);
            processed++;
            continue;
          }

          // Call enrichment
          await enrichOrganizer(org.id, org.businessName, city, state);

          processed++;

          // Log progress every 10 records
          if (processed % 10 === 0) {
            console.log(`[Backfill] ${processed}/${count} — ${org.businessName}`);
          }

          // Throttle API calls
          await new Promise((r) => setTimeout(r, 300));
        }

        console.log(`[Backfill] Complete: ${processed}/${count} organizers processed`);
      } catch (error) {
        console.error(
          `[Backfill] Background loop failed:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  } catch (error) {
    console.error(
      `[Backfill] Request handler error:`,
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: 'Internal server error' });
  }
}
