/**
 * Montana Division of Banking and Financial Institutions (DBFI) — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Montana DBFI licensee publications
 * Source: https://banking.mt.gov/ — Division of Banking and Financial Institutions
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in MT)
 *
 * Montana pawnbrokers are licensed under MCA § 31-1-801 et seq., regulated by DBFI.
 * MT DBFI publishes periodic licensee lists — often PDF or Excel on the banking.mt.gov site.
 * This scraper fetches the DBFI licensee index page and attempts to locate and download
 * any published pawnbroker roster. Falls back to NMLS Consumer Access.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const MT_DBFI_LICENSEES_URL = 'https://banking.mt.gov/Consumers/Licensees';
const MT_DBFI_HOME_URL = 'https://banking.mt.gov/';
const NMLS_API_BASE = 'https://api.nmlsconsumeraccess.org/FieldSearch/RetailSearch';

/**
 * Scrape Montana pawnbroker licenses from DBFI licensee publications / NMLS.
 * MT DBFI typically publishes Excel/PDF licensee rosters organized by license type.
 */
export async function runMontanaPhase2Scraper(): Promise<void> {
  const domain = new URL(MT_DBFI_HOME_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[MontanaPhase2] Starting pawnbroker license scraper');

    // Step 1: Fetch DBFI licensees page — look for downloadable pawnbroker list
    await defaultRateLimiter.waitBeforeRequest(domain);

    const licenseesResponse = await fetch(MT_DBFI_LICENSEES_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (licenseesResponse.ok) {
      const html = await licenseesResponse.text();
      console.log('[MontanaPhase2] Fetched DBFI licensees page');

      // MT DBFI often links to Excel/PDF rosters by license category
      const linkRegex = /href="([^"]*(?:pawn|licens|roster|list|excel|xlsx?|csv)[^"]*)"/gi;
      const linkMatches = [...html.matchAll(linkRegex)];

      if (linkMatches.length > 0) {
        console.log(`[MontanaPhase2] Found ${linkMatches.length} potential download link(s)`);

        for (const match of linkMatches) {
          let downloadUrl = match[1];
          if (downloadUrl.startsWith('/')) {
            downloadUrl = `https://banking.mt.gov${downloadUrl}`;
          }

          // Only process Excel/CSV files (PDF parsing not implemented)
          if (!downloadUrl.match(/\.(xlsx?|csv)(\?.*)?$/i)) {
            console.log(`[MontanaPhase2] Skipping non-Excel/CSV link: ${downloadUrl}`);
            continue;
          }

          console.log(`[MontanaPhase2] Found Excel/CSV download: ${downloadUrl}`);
          await defaultRateLimiter.waitBeforeRequest(domain);

          const downloadResponse = await fetch(downloadUrl, {
            method: 'GET',
            headers: {
              'User-Agent': getRandomUserAgent(),
              Accept: '*/*',
              Referer: MT_DBFI_LICENSEES_URL,
            },
            signal: AbortSignal.timeout(30000),
          });

          if (downloadResponse.ok) {
            console.log('[MontanaPhase2] TODO: implement Excel parsing for MT DBFI roster download');
            // TODO: Parse Excel binary with xlsx library:
            //   const buffer = await downloadResponse.arrayBuffer();
            //   const workbook = xlsx.read(buffer, { type: 'buffer' });
            //   const sheet = workbook.Sheets[workbook.SheetNames[0]];
            //   const rows = xlsx.utils.sheet_to_json(sheet);
          }
        }
      }

      // Try parsing any inline table data
      const extractText = (cellHtml: string): string =>
        cellHtml
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .trim();

      const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
        if (cells.length < 2) continue;

        const licenseNumber = extractText(cells[0]);
        const businessName = extractText(cells[1]);
        const city = cells.length > 2 ? extractText(cells[2]) : '';

        // Only include rows that look like pawnbroker entries
        const rowText = rows[i].toLowerCase();
        if (!rowText.includes('pawn') && cells.length < 3) continue;
        if (!businessName || !licenseNumber) continue;

        totalRecords++;
        await upsertMontanaOrganizer({ businessName, licenseNumber, city });
        createdOrganizers++;
      }
    } else {
      console.warn(`[MontanaPhase2] DBFI licensees page returned ${licenseesResponse.status}`);
    }

    // Step 2: Try DBFI home for alternate pawnbroker links
    await defaultRateLimiter.waitBeforeRequest(domain);

    const homeResponse = await fetch(MT_DBFI_HOME_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (homeResponse.ok) {
      const homeHtml = await homeResponse.text();
      const pawnLinks = [...homeHtml.matchAll(/href="([^"]*pawn[^"]*)"/gi)];
      if (pawnLinks.length > 0) {
        console.log(`[MontanaPhase2] Found ${pawnLinks.length} pawn-related link(s) on DBFI home`);
        // TODO: Follow these links in a future enhancement
      } else {
        console.warn('[MontanaPhase2] No pawnbroker links found on DBFI home — site may be JS-rendered');
      }
    }

    // Step 3: NMLS fallback for MT pawnbrokers
    const nmlsDomain = 'api.nmlsconsumeraccess.org';
    const pageSize = 100;
    let pageIndex = 0;
    let hasMore = true;

    console.log('[MontanaPhase2] Querying NMLS Consumer Access for Montana pawnbrokers');

    while (hasMore) {
      await defaultRateLimiter.waitBeforeRequest(nmlsDomain);

      const nmlsUrl = `${NMLS_API_BASE}?StateRegulator=MT&LicenseType=Pawnbroker&PageIndex=${pageIndex}&PageSize=${pageSize}`;

      const nmlsResponse = await fetch(nmlsUrl, {
        method: 'GET',
        headers: {
          'User-Agent': getRandomUserAgent(),
          Accept: 'application/json, text/plain, */*',
          Origin: 'https://www.nmlsconsumeraccess.org',
          Referer: 'https://www.nmlsconsumeraccess.org/',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!nmlsResponse.ok) {
        console.warn(`[MontanaPhase2] NMLS API returned ${nmlsResponse.status} — stopping`);
        break;
      }

      const contentType = nmlsResponse.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn('[MontanaPhase2] NMLS API did not return JSON — portal may require browser session');
        break;
      }

      const data = await nmlsResponse.json() as {
        Companies?: Array<{
          EntityName?: string;
          City?: string;
          NMLSId?: number | string;
          LicenseNumber?: string;
        }>;
        TotalRecordCount?: number;
      };

      const companies = data.Companies || [];
      console.log(`[MontanaPhase2] NMLS page ${pageIndex}: ${companies.length} results`);

      for (const company of companies) {
        const businessName = company.EntityName?.trim();
        const city = company.City?.trim() || '';
        const licenseNumber =
          company.LicenseNumber?.toString().trim() || company.NMLSId?.toString().trim() || '';

        if (!businessName || !licenseNumber) continue;

        totalRecords++;
        await upsertMontanaOrganizer({ businessName, licenseNumber, city });
        createdOrganizers++;
      }

      const totalCount = data.TotalRecordCount || 0;
      pageIndex++;
      hasMore = companies.length === pageSize && pageIndex * pageSize < totalCount;

      if (totalRecords % 50 === 0 && totalRecords > 0) {
        console.log(`[MontanaPhase2] Progress: ${totalRecords} records, ${createdOrganizers} upserted`);
      }
    }

    console.log(
      `[MontanaPhase2] Scraper completed: processed ${totalRecords} records, upserted ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[MontanaPhase2] Scraper error:', error);
    throw error;
  }
}

async function upsertMontanaOrganizer(params: {
  businessName: string;
  licenseNumber: string;
  city: string;
}): Promise<void> {
  const { businessName, licenseNumber, city } = params;

  try {
    console.log(`[MontanaPhase2] Processing: ${businessName} (License ${licenseNumber}) in ${city}, MT`);

    const existing = await prisma.organizer.findFirst({
      where: {
        OR: [
          { licenseNumber, licenseState: 'MT' },
          {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'MT',
          },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.organizer.update({
        where: { id: existing.id },
        data: {
          licenseNumber,
          licenseState: 'MT',
          isStateLicensed: true,
          directoryMostRecentSource: 'MontanaPhase2',
          directoryMostRecentAt: new Date(),
        },
      });
    } else {
      const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
      const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);

      await prisma.organizer.create({
        data: {
          businessName,
          phone: null,
          address: city ? `${city}, MT` : 'Montana',
          bio: `Licensed pawnbroker in ${city || 'Montana'}.`,
          isClaimed: false,
          isUnmanagedListing: true,
          licenseNumber,
          licenseState: 'MT',
          isStateLicensed: true,
          businessCategory: 'PAWN_SHOP',
          directoryMostRecentSource: 'MontanaPhase2',
          directoryMostRecentAt: new Date(),
          user: {
            create: {
              email: `scraper+${slug}-${citySlug}-mt-mtphase2@system.finda.sale`,
              name: businessName,
              password: null,
              role: 'ORGANIZER',
              roles: ['ORGANIZER'],
            },
          },
        },
      });
    }
  } catch (err) {
    console.error(`[MontanaPhase2] Error upserting ${businessName}:`, err);
  }
}
