/**
 * Delaware Pawnbroker License Scraper (Phase 2) — NO PUBLIC DATA SOURCE
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 *
 * RESEARCH FINDING (S701):
 * Delaware pawnbroker licenses are issued by the Delaware State Police Professional
 * Licensing Section (dsp.delaware.gov), NOT the Division of Revenue. DSP does NOT
 * publish a public online list of licensed pawnbrokers.
 *
 * The Delaware Open Data Portal (data.delaware.gov, dataset 5zy2-grhr) was checked —
 * it contains 118k+ Division of Revenue business licenses but has NO "PAWNBROKER"
 * activity category. Pawnbroker = DSP license, not a Division of Revenue license.
 *
 * ONLY PATH FORWARD: FOIA request to dsp-prolicense@delaware.gov
 * Subject: "FOIA Request — Current Licensed Pawnbroker List under Title 24 Chapter 23"
 *
 * This scraper exits cleanly with zero records until a FOIA list is obtained.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

const DE_OPEN_DATA_CSV_URL =
  'https://data.delaware.gov/api/views/5zy2-grhr/rows.csv?accessType=DOWNLOAD';
const DE_OPEN_DATA_DOMAIN = 'data.delaware.gov';

/**
 * Parse a single CSV line respecting quoted fields (commas inside quotes are ignored).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside a quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Delaware pawnbroker scraper — stubs out pending FOIA.
 * No public data source exists. See file header for details.
 */
export async function runDelawarePhase2Scraper(): Promise<void> {
  console.log('[Delaware Phase2] No public data source — pawnbroker licenses issued by DE State Police (DSP), not Division of Revenue.');
  console.log('[Delaware Phase2] Awaiting FOIA response from dsp-prolicense@delaware.gov — zero records this run.');
  return;

  // Dead code below retained for when FOIA list is received and can be imported as CSV.
  // To activate: obtain CSV from DSP, parse with parseCsvLine(), upsert via batchUpsertScrapedOrganizers().
  // eslint-disable-next-line no-unreachable
  let totalFetched = 0;
  let totalPawn = 0;
  let totalUpserted = 0;

  console.log('[Delaware Phase2] Starting pawnbroker license scraper via DE Open Data Portal');

  try {
    await defaultRateLimiter.waitBeforeRequest(DE_OPEN_DATA_DOMAIN);

    const response = await fetch(DE_OPEN_DATA_CSV_URL, {
      method: 'GET',
      headers: {
        Accept: 'text/csv,*/*',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.error(
        `[Delaware Phase2] CSV fetch failed: HTTP ${response.status} from ${DE_OPEN_DATA_CSV_URL}`
      );
      return;
    }

    const csvText = await response.text();
    const lines = csvText.split('\n');

    if (lines.length < 2) {
      console.warn('[Delaware Phase2] CSV response appears empty or malformed');
      return;
    }

    // Parse header row to build column index map
    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());

    const colIndex = (name: string): number => headers.indexOf(name);

    const iBusinessName = colIndex('business name');
    const iTradeName = colIndex('trade name');
    const iBusinessActivity = colIndex('business activity');
    const iValidTo = colIndex('current license valid to');
    const iAddress1 = colIndex('address 1');
    const iCity = colIndex('city');
    const iState = colIndex('state');
    const iZip = colIndex('zip');
    const iLicenseNumber = colIndex('license number');

    if (iBusinessActivity === -1 || iBusinessName === -1) {
      console.error(
        '[Delaware Phase2] Could not find required columns in CSV header. Headers found:',
        headers.join(', ')
      );
      return;
    }

    totalFetched = lines.length - 1;
    console.log(`[Delaware Phase2] CSV fetched — ${totalFetched} rows (excluding header)`);

    // Phase 1 — accumulate pawn rows (keeps the custom DE-PAWN dedupeKey quirk intact)
    const pawnEntries: {
      businessName: string;
      licenseNumber: string;
      city: string;
      address: string;
      dedupeKey: string;
    }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const fields = parseCsvLine(line);

      const businessActivity = iBusinessActivity >= 0 ? (fields[iBusinessActivity] || '') : '';
      if (!businessActivity.toUpperCase().includes('PAWN')) continue;

      totalPawn++;

      const businessNameRaw = iBusinessName >= 0 ? (fields[iBusinessName] || '').trim() : '';
      const tradeNameRaw = iTradeName >= 0 ? (fields[iTradeName] || '').trim() : '';
      const businessName = tradeNameRaw || businessNameRaw;
      const licenseNumber = iLicenseNumber >= 0 ? (fields[iLicenseNumber] || '').trim() : '';
      const address1 = iAddress1 >= 0 ? (fields[iAddress1] || '').trim() : '';
      const city = iCity >= 0 ? (fields[iCity] || '').trim() : '';
      const state = iState >= 0 ? (fields[iState] || '').trim() : 'DE';
      const zip = iZip >= 0 ? (fields[iZip] || '').trim() : '';
      const validTo = iValidTo >= 0 ? (fields[iValidTo] || '').trim() : '';

      if (!businessName) continue;

      const address = [address1, city, `${state} ${zip}`.trim()].filter(Boolean).join(', ');
      const dedupeKey = `DE-PAWN-${licenseNumber || businessName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      // Parse license expiry date gracefully
      let licenseExpiry: Date | null = null;
      if (validTo) {
        const parsed = new Date(validTo);
        if (!isNaN(parsed.getTime())) {
          licenseExpiry = parsed;
        }
      }

      console.log(
        `[Delaware Phase2] Processing: ${businessName} (License ${licenseNumber || 'N/A'}) in ${city}, DE`
      );

      pawnEntries.push({ businessName, licenseNumber, city, address, dedupeKey });

      if (totalPawn % 25 === 0) {
        console.log(
          `[Delaware Phase2] Progress: ${totalPawn} pawn rows processed, ${pawnEntries.length} queued`
        );
      }
    }

    // Phase 2 — batch: one findMany on the custom DE-PAWN dedupeKeys, then split into
    // existing (targeted update, same fields as before) vs new (batchUpsertScrapedOrganizers
    // + the same field backfill the old per-row flow applied after create).
    // Preserves the original DE-PAWN-<license> dedupe semantics exactly (ADR-073 perf).
    const dedupeKeys = pawnEntries.map((e) => e.dedupeKey);
    const existingRecords = await prisma.organizer.findMany({
      where: { dedupeKey: { in: dedupeKeys } },
      select: { id: true, dedupeKey: true },
    });
    const existingByKey = new Map(existingRecords.map((e) => [e.dedupeKey ?? '', e.id]));

    const newEntries: typeof pawnEntries = [];
    for (const entry of pawnEntries) {
      const existingId = existingByKey.get(entry.dedupeKey);
      if (existingId) {
        try {
          await prisma.organizer.update({
            where: { id: existingId },
            data: {
              licenseNumber: entry.licenseNumber || undefined,
              licenseState: 'DE',
              isStateLicensed: true,
              directoryMostRecentSource: 'DelawarePhase2',
              directoryMostRecentAt: new Date(),
            },
          });
          totalUpserted++;
        } catch (err) {
          console.error(`[Delaware Phase2] Error updating ${entry.businessName}:`, err);
        }
      } else {
        newEntries.push(entry);
      }
    }

    const batchRows: ScrapedOrganizerRow[] = newEntries.map((e) => ({
      businessName: e.businessName,
      sourceName: 'DelawarePhase2',
      city: e.city || 'Delaware',
      state: 'DE',
      businessCategory: 'PAWN_SHOP',
    }));
    const newIds = await batchUpsertScrapedOrganizers(batchRows, 100);

    // Zip successful new IDs with their source entries into a fully-typed pair list.
    // NOTE (S1057): CI's tsc rejected this same value under a plain `if (id)` narrowing
    // guard (both as a separately-bound const AND inline in this exact expression) with
    // TS2322 "string | null not assignable to string", while an identical local repro
    // (fresh clone, fresh pnpm install --frozen-lockfile, fresh prisma generate, same
    // TS 5.9.3 / Node 22) type-checked clean every time — a genuine, unexplained CI-only
    // divergence, not a real narrowing bug in this code. The runtime `if (id)` guard still
    // provides the actual safety; the assertion below only overrides a compiler disagreement
    // that could not be reproduced or diagnosed locally after exhausting reasonable options.
    const created: { organizerId: string; entry: (typeof newEntries)[number] }[] = [];
    for (let n = 0; n < newEntries.length; n++) {
      const id = newIds[n];
      if (id) created.push({ organizerId: id as string, entry: newEntries[n] });
    }

    for (const { organizerId, entry } of created) {
      try {
        await prisma.organizer.update({
          where: { id: organizerId },
          data: {
            address: entry.address || undefined,
            licenseNumber: entry.licenseNumber || undefined,
            licenseState: 'DE',
            isStateLicensed: true,
            isUnmanagedListing: true,
            dedupeKey: entry.dedupeKey,
            directoryMostRecentSource: 'DelawarePhase2',
            directoryMostRecentAt: new Date(),
          },
        });
        totalUpserted++;
      } catch (err) {
        console.error(`[Delaware Phase2] Error backfilling ${entry.businessName}:`, err);
      }
    }

    console.log(
      `[Delaware Phase2] Completed — ${totalFetched} rows fetched, ${totalPawn} pawn matches, ${totalUpserted} upserted`
    );
  } catch (err) {
    console.error('[Delaware Phase2] Scraper error:', err);
    return;
  }
}
