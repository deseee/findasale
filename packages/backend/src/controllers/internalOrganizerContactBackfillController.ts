/**
 * Free (no AI) backfill: propagates contact data from scraped Sale records
 * to their associated Organizer profiles.
 *
 * Fields upgraded per organizer:
 *   address  — replaced if organizer address has no street number (city/state only)
 *   phone    — filled if null, sourced from scrapedMetadata.phone
 *   website  — filled if null, sourced from scrapedMetadata.website
 *   contactEmail — filled if null, sourced from scrapedMetadata.contactEmail or .email
 *
 * Called by GitHub Actions daily at 07:00 UTC via POST /api/internal/backfill-organizer-contacts
 * Protected by x-internal-secret header (OUTREACH_SECRET env var).
 */

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const DEFAULT_BATCH_SIZE = 500;

function hasStreetNumber(address: string | null | undefined): boolean {
  if (!address) return false;
  return /^\d/.test(address.trim());
}

function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return value.includes('@') && value.includes('.');
}

function extractFromMeta(
  meta: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!meta) return null;
  for (const key of keys) {
    const val = meta[key];
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  }
  return null;
}

export async function runOrganizerContactBackfill(req: Request, res: Response): Promise<void> {
  const batchSize = parseInt(
    process.env.ORG_CONTACT_BACKFILL_BATCH_SIZE || String(DEFAULT_BATCH_SIZE),
    10,
  );

  let processed = 0;
  let updated = 0;
  let addressFilled = 0;
  let phoneFilled = 0;
  let websiteFilled = 0;
  let emailFilled = 0;

  try {
    const organizers = await prisma.organizer.findMany({
      where: {
        sales: {
          some: { sourceUrl: { not: null } },
        },
      },
      select: {
        id: true,
        address: true,
        phone: true,
        website: true,
        contactEmail: true,
        sales: {
          where: { sourceUrl: { not: null } },
          select: {
            address: true,
            city: true,
            state: true,
            zip: true,
            scrapedMetadata: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      take: batchSize,
    });

    console.log(
      `[OrganizerContactBackfill] Processing ${organizers.length} organizers with scraped sales (batchSize=${batchSize})`,
    );

    for (const organizer of organizers) {
      processed++;
      const patch: Record<string, string> = {};

      // --- Address ---
      if (!hasStreetNumber(organizer.address)) {
        for (const sale of organizer.sales) {
          if (hasStreetNumber(sale.address)) {
            const parts = [sale.address, sale.city, `${sale.state} ${sale.zip}`]
              .filter(Boolean)
              .join(', ');
            patch.address = parts;
            addressFilled++;
            break;
          }
        }
      }

      // --- Phone ---
      if (!organizer.phone) {
        for (const sale of organizer.sales) {
          const meta = sale.scrapedMetadata as Record<string, unknown> | null;
          const found = extractFromMeta(meta, ['phone', 'phoneNumber', 'telephone']);
          if (found) {
            patch.phone = found;
            phoneFilled++;
            break;
          }
        }
      }

      // --- Website ---
      if (!organizer.website) {
        for (const sale of organizer.sales) {
          const meta = sale.scrapedMetadata as Record<string, unknown> | null;
          const found = extractFromMeta(meta, ['website', 'websiteUrl', 'url', 'siteUrl']);
          if (found) {
            patch.website = found;
            websiteFilled++;
            break;
          }
        }
      }

      // --- contactEmail ---
      if (!organizer.contactEmail) {
        for (const sale of organizer.sales) {
          const meta = sale.scrapedMetadata as Record<string, unknown> | null;
          const found = extractFromMeta(meta, ['contactEmail', 'email']);
          if (found && isValidEmail(found)) {
            patch.contactEmail = found;
            emailFilled++;
            break;
          }
        }
      }

      if (Object.keys(patch).length > 0) {
        await prisma.organizer.update({
          where: { id: organizer.id },
          data: patch,
        });
        updated++;
        console.log(
          `[OrganizerContactBackfill] Updated organizer ${organizer.id} — fields: ${Object.keys(patch).join(', ')}`,
        );
      }
    }

    console.log(
      `[OrganizerContactBackfill] Complete — processed=${processed} updated=${updated} ` +
        `addressFilled=${addressFilled} phoneFilled=${phoneFilled} websiteFilled=${websiteFilled} emailFilled=${emailFilled}`,
    );

    res.json({ processed, updated, addressFilled, phoneFilled, websiteFilled, emailFilled });
  } catch (err: any) {
    console.error('[OrganizerContactBackfill] Batch error:', err.message ?? err);
    res.status(500).json({
      error: 'Organizer contact backfill failed',
      details: err.message ?? String(err),
    });
  }
}
