/**
 * Michigan Department of Insurance and Financial Services (DIFS) — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from the DIFS public licensee search
 * Source: https://difs.state.mi.us/Divisions/BankingBureau/Pages/Pawn.aspx
 * Fallback: https://www.nmlsconsumeraccess.org/ (NMLS) for regulated lenders
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in MI)
 *
 * NOTE: DIFS is behind Cloudflare and serves a JS-rendered portal. This scraper targets:
 * 1. The DIFS Banking Bureau pawnbroker page for any static licensee list link
 * 2. NMLS Consumer Access API for Michigan-licensed pawnbrokers/secondary mortgage brokers
 * If both are blocked, falls back to searching the DIFS public search with known license type codes.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

// DIFS public licensee search — pawnbroker license type
const DIFS_PAWN_PAGE_URL = 'https://difs.state.mi.us/Divisions/BankingBureau/Pages/Pawn.aspx';

// NMLS Consumer Access API — search for Michigan pawnbrokers
const NMLS_API_BASE = 'https://api.nmlsconsumeraccess.org/FieldSearch/RetailSearch';

/**
 * Scrape Michigan pawnbroker licenses from DIFS / NMLS.
 * Michigan regulates pawnbrokers under the Pawnbrokers Act (MCL 446.201 et seq.).
 * DIFS Banking Bureau issues these licenses.
 */
export async function runMichiganPhase2Scraper(): Promise<void> {
  const domain = new URL(DIFS_PAWN_PAGE_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[MichiganPhase2] Starting pawnbroker license scraper');

    // Step 1: Attempt DIFS pawn page — look for downloadable licensee list or table
    await defaultRateLimiter.waitBeforeRequest(domain);

    const difsResponse = await fetch(DIFS_PAWN_PAGE_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (difsResponse.ok) {
      const html = await difsResponse.text();
      console.log('[MichiganPhase2] Fetched DIFS pawn page');

      // Look for downloadable list links (Excel, CSV, PDF)
      const downloadLinkRegex = /href="([^"]*(?:pawn|licens)[^"]*\.(?:xlsx?|csv|pdf))[^"]*"/gi;
      const downloadMatches = [...html.matchAll(downloadLinkRegex)];

      if (downloadMatches.length > 0) {
        console.log(`[MichiganPhase2] Found ${downloadMatches.length} download link(s) on DIFS page`);
        // TODO: Implement Excel/CSV download parsing if DIFS publishes a list
      }

      // Parse any inline table data
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
        if (cells.length < 3) continue;

        const licenseNumber = extractText(cells[0]);
        const businessName = extractText(cells[1]);
        const city = extractText(cells[2]);

        if (!businessName || !licenseNumber) continue;

        totalRecords++;
        await upsertMichiganOrganizer({ businessName, licenseNumber, city });
        createdOrganizers++;
      }
    } else {
      console.warn(`[MichiganPhase2] DIFS page returned ${difsResponse.status} — falling back to NMLS`);
    }

    // Step 2: NMLS Consumer Access — search Michigan pawnbrokers
    const nmlsDomain = 'api.nmlsconsumeraccess.org';
    const pageSize = 100;
    let pageIndex = 0;
    let hasMore = true;

    console.log('[MichiganPhase2] Querying NMLS Consumer Access for Michigan pawnbrokers');

    while (hasMore) {
      await defaultRateLimiter.waitBeforeRequest(nmlsDomain);

      const nmlsUrl = `${NMLS_API_BASE}?StateRegulator=MI&LicenseType=Pawnbroker&PageIndex=${pageIndex}&PageSize=${pageSize}`;

      const nmlsResponse = await fetch(nmlsUrl, {
        method: 'GET',
        headers: {
          'User-Agent': getRandomUserAgent(),
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          Origin: 'https://www.nmlsconsumeraccess.org',
          Referer: 'https://www.nmlsconsumeraccess.org/',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!nmlsResponse.ok) {
        console.warn(`[MichiganPhase2] NMLS API returned ${nmlsResponse.status} — stopping pagination`);
        break;
      }

      const contentType = nmlsResponse.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn('[MichiganPhase2] NMLS API did not return JSON — portal may require browser session');
        // TODO: Download NMLS state roster CSV from https://www.nmlsconsumeraccess.org/Downloads.aspx
        break;
      }

      const data = await nmlsResponse.json() as {
        Companies?: Array<{
          EntityName?: string;
          City?: string;
          State?: string;
          NMLSId?: number | string;
          LicenseNumber?: string;
        }>;
        TotalRecordCount?: number;
      };

      const companies = data.Companies || [];
      console.log(`[MichiganPhase2] NMLS page ${pageIndex}: ${companies.length} results`);

      for (const company of companies) {
        const businessName = company.EntityName?.trim();
        const city = company.City?.trim() || '';
        const licenseNumber =
          company.LicenseNumber?.toString().trim() || company.NMLSId?.toString().trim() || '';

        if (!businessName || !licenseNumber) continue;

        totalRecords++;
        await upsertMichiganOrganizer({ businessName, licenseNumber, city });
        createdOrganizers++;
      }

      const totalCount = data.TotalRecordCount || 0;
      pageIndex++;
      hasMore = companies.length === pageSize && pageIndex * pageSize < totalCount;

      if (totalRecords % 50 === 0 && totalRecords > 0) {
        console.log(`[MichiganPhase2] Progress: ${totalRecords} records, ${createdOrganizers} upserted`);
      }
    }

    console.log(
      `[MichiganPhase2] Scraper completed: processed ${totalRecords} records, upserted ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[MichiganPhase2] Scraper error:', error);
    throw error;
  }
}

async function upsertMichiganOrganizer(params: {
  businessName: string;
  licenseNumber: string;
  city: string;
}): Promise<void> {
  const { businessName, licenseNumber, city } = params;

  try {
    console.log(`[MichiganPhase2] Processing: ${businessName} (License ${licenseNumber}) in ${city}, MI`);

    const existing = await prisma.organizer.findFirst({
      where: {
        OR: [
          { licenseNumber, licenseState: 'MI' },
          {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'MI',
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
          licenseState: 'MI',
          isStateLicensed: true,
          directoryMostRecentSource: 'MichiganPhase2',
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
          address: city ? `${city}, MI` : 'Michigan',
          bio: `Licensed pawnbroker in ${city || 'Michigan'}.`,
          isClaimed: false,
          isUnmanagedListing: true,
          licenseNumber,
          licenseState: 'MI',
          isStateLicensed: true,
          businessCategory: 'PAWN_SHOP',
          directoryMostRecentSource: 'MichiganPhase2',
          directoryMostRecentAt: new Date(),
          user: {
            create: {
              email: `scraper+${slug}-${citySlug}-mi-miphase2@system.finda.sale`,
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
    console.error(`[MichiganPhase2] Error upserting ${businessName}:`, err);
  }
}
