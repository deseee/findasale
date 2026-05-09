/**
 * Minnesota Department of Commerce — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from the MN Commerce licensee database
 * Source: https://mn.gov/commerce/ — Pawnbroker licensing
 * Lookup portal: https://licenseelookup.dli.mn.gov/ (DLI — covers some commerce licenses)
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in MN)
 *
 * Minnesota pawnbrokers are licensed under MN Stat. § 325J — regulated by MN Commerce.
 * The DLI lookup portal (licenseelookup.dli.mn.gov) appears JS-rendered.
 * This scraper attempts the Commerce pawnbroker page and DLI portal, then falls
 * back to NMLS Consumer Access for MN-licensed pawnbrokers.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const MN_COMMERCE_PAWN_URL = 'https://mn.gov/commerce/industries/financial-services/pawnbrokers/';
const MN_DLI_LOOKUP_URL = 'https://licenseelookup.dli.mn.gov/';
const NMLS_API_BASE = 'https://api.nmlsconsumeraccess.org/FieldSearch/RetailSearch';

/**
 * Scrape Minnesota pawnbroker licenses from MN Commerce / DLI / NMLS.
 */
export async function runMinnesotaPhase2Scraper(): Promise<void> {
  const domain = new URL(MN_COMMERCE_PAWN_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[MinnesotaPhase2] Starting pawnbroker license scraper');

    // Step 1: MN Commerce pawnbroker page — look for static data or download links
    await defaultRateLimiter.waitBeforeRequest(domain);

    const commerceResponse = await fetch(MN_COMMERCE_PAWN_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (commerceResponse.ok) {
      const html = await commerceResponse.text();
      console.log('[MinnesotaPhase2] Fetched MN Commerce pawnbroker page');

      // Check for downloadable roster links
      const downloadRegex = /href="([^"]*(?:pawn|licens|roster|list)[^"]*\.(?:xlsx?|csv|pdf))[^"]*"/gi;
      const downloadMatches = [...html.matchAll(downloadRegex)];
      if (downloadMatches.length > 0) {
        console.log(`[MinnesotaPhase2] Found ${downloadMatches.length} potential download link(s)`);
        // TODO: Implement Excel/CSV download parsing if MN Commerce publishes a static roster
      }

      // Try parsing inline table data
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

        if (!businessName || !licenseNumber) continue;

        totalRecords++;
        await upsertMinnesotaOrganizer({ businessName, licenseNumber, city });
        createdOrganizers++;
      }
    } else {
      console.warn(`[MinnesotaPhase2] MN Commerce page returned ${commerceResponse.status}`);
    }

    // Step 2: MN DLI lookup portal
    const dliDomain = new URL(MN_DLI_LOOKUP_URL).hostname;
    await defaultRateLimiter.waitBeforeRequest(dliDomain);

    const dliResponse = await fetch(MN_DLI_LOOKUP_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (dliResponse.ok) {
      const dliHtml = await dliResponse.text();
      console.log('[MinnesotaPhase2] Fetched DLI lookup page');

      // Check if this is a JS-rendered SPA
      const hasTable = dliHtml.includes('<table') || dliHtml.includes('<tr');
      if (!hasTable) {
        console.warn('[MinnesotaPhase2] DLI lookup appears to be JS-rendered — skipping, falling back to NMLS');
      }
    } else {
      console.warn(`[MinnesotaPhase2] DLI lookup returned ${dliResponse.status}`);
    }

    // Step 3: NMLS Consumer Access fallback for MN pawnbrokers
    const nmlsDomain = 'api.nmlsconsumeraccess.org';
    const pageSize = 100;
    let pageIndex = 0;
    let hasMore = true;

    console.log('[MinnesotaPhase2] Querying NMLS Consumer Access for Minnesota pawnbrokers');

    while (hasMore) {
      await defaultRateLimiter.waitBeforeRequest(nmlsDomain);

      const nmlsUrl = `${NMLS_API_BASE}?StateRegulator=MN&LicenseType=Pawnbroker&PageIndex=${pageIndex}&PageSize=${pageSize}`;

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
        console.warn(`[MinnesotaPhase2] NMLS API returned ${nmlsResponse.status} — stopping`);
        break;
      }

      const contentType = nmlsResponse.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn('[MinnesotaPhase2] NMLS API did not return JSON — portal may require browser session');
        // TODO: Download NMLS state roster CSV from https://www.nmlsconsumeraccess.org/Downloads.aspx
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
      console.log(`[MinnesotaPhase2] NMLS page ${pageIndex}: ${companies.length} results`);

      for (const company of companies) {
        const businessName = company.EntityName?.trim();
        const city = company.City?.trim() || '';
        const licenseNumber =
          company.LicenseNumber?.toString().trim() || company.NMLSId?.toString().trim() || '';

        if (!businessName || !licenseNumber) continue;

        totalRecords++;
        await upsertMinnesotaOrganizer({ businessName, licenseNumber, city });
        createdOrganizers++;
      }

      const totalCount = data.TotalRecordCount || 0;
      pageIndex++;
      hasMore = companies.length === pageSize && pageIndex * pageSize < totalCount;

      if (totalRecords % 50 === 0 && totalRecords > 0) {
        console.log(`[MinnesotaPhase2] Progress: ${totalRecords} records, ${createdOrganizers} upserted`);
      }
    }

    console.log(
      `[MinnesotaPhase2] Scraper completed: processed ${totalRecords} records, upserted ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[MinnesotaPhase2] Scraper error:', error);
    throw error;
  }
}

async function upsertMinnesotaOrganizer(params: {
  businessName: string;
  licenseNumber: string;
  city: string;
}): Promise<void> {
  const { businessName, licenseNumber, city } = params;

  try {
    console.log(`[MinnesotaPhase2] Processing: ${businessName} (License ${licenseNumber}) in ${city}, MN`);

    const existing = await prisma.organizer.findFirst({
      where: {
        OR: [
          { licenseNumber, licenseState: 'MN' },
          {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'MN',
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
          licenseState: 'MN',
          isStateLicensed: true,
          directoryMostRecentSource: 'MinnesotaPhase2',
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
          address: city ? `${city}, MN` : 'Minnesota',
          bio: `Licensed pawnbroker in ${city || 'Minnesota'}.`,
          isClaimed: false,
          isUnmanagedListing: true,
          licenseNumber,
          licenseState: 'MN',
          isStateLicensed: true,
          businessCategory: 'PAWN_SHOP',
          directoryMostRecentSource: 'MinnesotaPhase2',
          directoryMostRecentAt: new Date(),
          user: {
            create: {
              email: `scraper+${slug}-${citySlug}-mn-mnphase2@system.finda.sale`,
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
    console.error(`[MinnesotaPhase2] Error upserting ${businessName}:`, err);
  }
}
