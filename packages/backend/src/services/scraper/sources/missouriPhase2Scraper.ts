/**
 * Missouri Division of Finance — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Missouri Division of Finance / DCI licensee database
 * Source: https://finance.mo.gov/banking/pawnbrokers/
 * Lookup: https://dci.mo.gov/licensing/search (Division of Credit Institutions)
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in MO)
 *
 * Missouri pawnbrokers are licensed under the Missouri Pawnbroker Act (RSMo § 367.011 et seq.)
 * regulated by the Division of Finance. DCI publishes a searchable licensee directory.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const MO_FINANCE_PAWN_URL = 'https://finance.mo.gov/banking/pawnbrokers/';
const MO_DCI_SEARCH_URL = 'https://dci.mo.gov/licensing/search';
const NMLS_API_BASE = 'https://api.nmlsconsumeraccess.org/FieldSearch/RetailSearch';

/**
 * Scrape Missouri pawnbroker licenses from the Division of Finance / DCI.
 */
export async function runMissouriPhase2Scraper(): Promise<void> {
  const domain = new URL(MO_FINANCE_PAWN_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[MissouriPhase2] Starting pawnbroker license scraper');

    // Step 1: MO Division of Finance pawnbroker page — look for static data or downloads
    await defaultRateLimiter.waitBeforeRequest(domain);

    const financeResponse = await fetch(MO_FINANCE_PAWN_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (financeResponse.ok) {
      const html = await financeResponse.text();
      console.log('[MissouriPhase2] Fetched MO Finance pawnbroker page');

      // Check for downloadable roster links
      const downloadRegex = /href="([^"]*(?:pawn|licens|roster|list)[^"]*\.(?:xlsx?|csv|pdf))[^"]*"/gi;
      const downloadMatches = [...html.matchAll(downloadRegex)];
      if (downloadMatches.length > 0) {
        console.log(`[MissouriPhase2] Found ${downloadMatches.length} download link(s)`);
        // TODO: Implement Excel/CSV download parsing if MO Finance publishes a static roster
      }

      // Parse inline table
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

        const businessName = extractText(cells[0]);
        const city = cells.length > 1 ? extractText(cells[1]) : '';
        const licenseNumber = cells.length > 2 ? extractText(cells[2]) : '';

        if (!businessName) continue;

        totalRecords++;
        await upsertMissouriOrganizer({
          businessName,
          licenseNumber: licenseNumber || `MO-PAWN-${businessName.slice(0, 10).replace(/\W/g, '')}`,
          city,
        });
        createdOrganizers++;
      }
    } else {
      console.warn(`[MissouriPhase2] MO Finance page returned ${financeResponse.status}`);
    }

    // Step 2: MO DCI licensing search — form-based ASP.NET lookup
    const dciDomain = new URL(MO_DCI_SEARCH_URL).hostname;
    await defaultRateLimiter.waitBeforeRequest(dciDomain);

    const dciPageResponse = await fetch(MO_DCI_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (dciPageResponse.ok) {
      const dciHtml = await dciPageResponse.text();
      console.log('[MissouriPhase2] Fetched MO DCI search page');

      const viewStateMatch = dciHtml.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
      const eventValidationMatch = dciHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);

      if (viewStateMatch && eventValidationMatch) {
        console.log('[MissouriPhase2] DCI uses ASP.NET WebForms — submitting pawnbroker search');

        await defaultRateLimiter.waitBeforeRequest(dciDomain);

        const formData = new URLSearchParams();
        formData.append('__VIEWSTATE', viewStateMatch[1]);
        formData.append('__EVENTVALIDATION', eventValidationMatch[1]);
        formData.append('ctl00$ContentPlaceHolder1$ddlLicenseType', 'Pawnbroker');
        formData.append('ctl00$ContentPlaceHolder1$btnSearch', 'Search');

        const searchResponse = await fetch(MO_DCI_SEARCH_URL, {
          method: 'POST',
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Referer: MO_DCI_SEARCH_URL,
          },
          body: formData.toString(),
          signal: AbortSignal.timeout(30000),
        });

        if (searchResponse.ok) {
          const searchHtml = await searchResponse.text();

          const extractText = (cellHtml: string): string =>
            cellHtml
              .replace(/<[^>]*>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .trim();

          const rows = searchHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
          console.log(`[MissouriPhase2] DCI search returned ${rows.length} rows`);

          for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
            if (cells.length < 2) continue;

            const licenseNumber = extractText(cells[0]);
            const businessName = extractText(cells[1]);
            const city = cells.length > 2 ? extractText(cells[2]) : '';

            if (!businessName || !licenseNumber) continue;

            totalRecords++;
            await upsertMissouriOrganizer({ businessName, licenseNumber, city });
            createdOrganizers++;
          }
        }
      } else {
        console.warn('[MissouriPhase2] DCI page does not appear to be ASP.NET WebForms — may be JS-rendered');
        // TODO: If DCI is a JS SPA, implement a headless approach or request a data export
      }
    } else {
      console.warn(`[MissouriPhase2] DCI search page returned ${dciPageResponse.status}`);
    }

    // Step 3: NMLS fallback for MO pawnbrokers
    const nmlsDomain = 'api.nmlsconsumeraccess.org';
    const pageSize = 100;
    let pageIndex = 0;
    let hasMore = true;

    console.log('[MissouriPhase2] Querying NMLS Consumer Access for Missouri pawnbrokers');

    while (hasMore) {
      await defaultRateLimiter.waitBeforeRequest(nmlsDomain);

      const nmlsUrl = `${NMLS_API_BASE}?StateRegulator=MO&LicenseType=Pawnbroker&PageIndex=${pageIndex}&PageSize=${pageSize}`;

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
        console.warn(`[MissouriPhase2] NMLS API returned ${nmlsResponse.status} — stopping`);
        break;
      }

      const contentType = nmlsResponse.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn('[MissouriPhase2] NMLS API did not return JSON — portal may require browser session');
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
      console.log(`[MissouriPhase2] NMLS page ${pageIndex}: ${companies.length} results`);

      for (const company of companies) {
        const businessName = company.EntityName?.trim();
        const city = company.City?.trim() || '';
        const licenseNumber =
          company.LicenseNumber?.toString().trim() || company.NMLSId?.toString().trim() || '';

        if (!businessName || !licenseNumber) continue;

        totalRecords++;
        await upsertMissouriOrganizer({ businessName, licenseNumber, city });
        createdOrganizers++;
      }

      const totalCount = data.TotalRecordCount || 0;
      pageIndex++;
      hasMore = companies.length === pageSize && pageIndex * pageSize < totalCount;

      if (totalRecords % 50 === 0 && totalRecords > 0) {
        console.log(`[MissouriPhase2] Progress: ${totalRecords} records, ${createdOrganizers} upserted`);
      }
    }

    console.log(
      `[MissouriPhase2] Scraper completed: processed ${totalRecords} records, upserted ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[MissouriPhase2] Scraper error:', error);
    throw error;
  }
}

async function upsertMissouriOrganizer(params: {
  businessName: string;
  licenseNumber: string;
  city: string;
}): Promise<void> {
  const { businessName, licenseNumber, city } = params;

  try {
    console.log(`[MissouriPhase2] Processing: ${businessName} (License ${licenseNumber}) in ${city}, MO`);

    const existing = await prisma.organizer.findFirst({
      where: {
        OR: [
          { licenseNumber, licenseState: 'MO' },
          {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'MO',
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
          licenseState: 'MO',
          isStateLicensed: true,
          directoryMostRecentSource: 'MissouriPhase2',
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
          address: city ? `${city}, MO` : 'Missouri',
          bio: `Licensed pawnbroker in ${city || 'Missouri'}.`,
          isClaimed: false,
          isUnmanagedListing: true,
          licenseNumber,
          licenseState: 'MO',
          isStateLicensed: true,
          businessCategory: 'PAWN_SHOP',
          directoryMostRecentSource: 'MissouriPhase2',
          directoryMostRecentAt: new Date(),
          user: {
            create: {
              email: `scraper+${slug}-${citySlug}-mo-mophase2@system.finda.sale`,
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
    console.error(`[MissouriPhase2] Error upserting ${businessName}:`, err);
  }
}
