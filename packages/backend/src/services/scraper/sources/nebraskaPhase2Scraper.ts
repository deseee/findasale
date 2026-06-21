/**
 * Nebraska Department of Banking and Finance (NDBF) — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from NDBF public licensee database
 * Source: https://www.ndbf.nebraska.gov/licensing/
 * Search: https://www.ndbf.nebraska.gov/licensing/search.aspx
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in NE)
 *
 * Nebraska pawnbrokers are licensed under the Nebraska Pawnbroker Act (Neb. Rev. Stat. § 69-201 et seq.)
 * regulated by the Department of Banking and Finance.
 * NDBF maintains a searchable online licensee database with an ASP.NET WebForms interface.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const NDBF_SEARCH_URL = 'https://www.ndbf.nebraska.gov/licensing/search.aspx';
const NDBF_LICENSING_URL = 'https://www.ndbf.nebraska.gov/licensing/';
const NMLS_API_BASE = 'https://api.nmlsconsumeraccess.org/FieldSearch/RetailSearch';

/**
 * Scrape Nebraska pawnbroker licenses from NDBF licensee database.
 * NDBF uses ASP.NET WebForms — this scraper extracts ViewState tokens and submits
 * a search for license type "Pawnbroker".
 */
export async function runNebraskaPhase2Scraper(): Promise<void> {
  const domain = new URL(NDBF_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[NebraskaPhase2] Starting pawnbroker license scraper');

    // Step 1: Fetch NDBF licensing overview for any static lists
    await defaultRateLimiter.waitBeforeRequest(domain);

    const licensingPageResponse = await fetch(NDBF_LICENSING_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (licensingPageResponse.ok) {
      const html = await licensingPageResponse.text();
      console.log('[NebraskaPhase2] Fetched NDBF licensing page');

      // Check for downloadable roster links
      const downloadRegex = /href="([^"]*(?:pawn|licens|roster|list)[^"]*\.(?:xlsx?|csv|pdf))[^"]*"/gi;
      const downloadMatches = [...html.matchAll(downloadRegex)];
      if (downloadMatches.length > 0) {
        console.log(`[NebraskaPhase2] Found ${downloadMatches.length} download link(s)`);
        // NOTE (BLOCKED): Implement Excel/CSV download parsing for any NDBF static roster
      }
    } else {
      console.warn(`[NebraskaPhase2] NDBF licensing page returned ${licensingPageResponse.status}`);
    }

    // Step 2: Fetch search page for ASP.NET WebForms tokens
    await defaultRateLimiter.waitBeforeRequest(domain);

    const searchPageResponse = await fetch(NDBF_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (searchPageResponse.ok) {
      const html = await searchPageResponse.text();
      console.log('[NebraskaPhase2] Fetched NDBF search page');

      const viewStateMatch = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
      const eventValidationMatch = html.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);
      const viewStateGenMatch = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);

      // Locate pawnbroker option value in license type dropdown
      const licenseTypeOptions = [
        ...html.matchAll(/<option[^>]+value="([^"]+)"[^>]*>([^<]*pawn[^<]*)<\/option>/gi),
      ];
      const pawnbrokerOptionValue =
        licenseTypeOptions.length > 0 ? licenseTypeOptions[0][1] : 'Pawnbroker';

      console.log(`[NebraskaPhase2] Pawnbroker option value: ${pawnbrokerOptionValue}`);

      if (viewStateMatch && eventValidationMatch) {
        console.log('[NebraskaPhase2] Found ASP.NET form tokens — submitting pawnbroker search');

        await defaultRateLimiter.waitBeforeRequest(domain);

        const formData = new URLSearchParams();
        formData.append('__VIEWSTATE', viewStateMatch[1]);
        formData.append('__EVENTVALIDATION', eventValidationMatch[1]);
        if (viewStateGenMatch) {
          formData.append('__VIEWSTATEGENERATOR', viewStateGenMatch[1]);
        }
        formData.append('ctl00$ContentPlaceHolder1$ddlLicenseType', pawnbrokerOptionValue);
        formData.append('ctl00$ContentPlaceHolder1$txtName', '');
        formData.append('ctl00$ContentPlaceHolder1$btnSearch', 'Search');

        const searchResultsResponse = await fetch(NDBF_SEARCH_URL, {
          method: 'POST',
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Referer: NDBF_SEARCH_URL,
          },
          body: formData.toString(),
          signal: AbortSignal.timeout(30000),
        });

        if (searchResultsResponse.ok) {
          const resultsHtml = await searchResultsResponse.text();

          const extractText = (cellHtml: string): string =>
            cellHtml
              .replace(/<[^>]*>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .trim();

          const rows = resultsHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
          console.log(`[NebraskaPhase2] Search returned ${rows.length} rows`);

          for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
            if (cells.length < 2) continue;

            const licenseNumber = extractText(cells[0]);
            const businessName = extractText(cells[1]);
            const city = cells.length > 2 ? extractText(cells[2]) : '';

            if (!businessName || !licenseNumber) continue;

            totalRecords++;
            await upsertNebraskaOrganizer({ businessName, licenseNumber, city });
            createdOrganizers++;

            if (totalRecords % 50 === 0) {
              console.log(`[NebraskaPhase2] Progress: ${totalRecords} records, ${createdOrganizers} upserted`);
            }
          }
        } else {
          console.warn(`[NebraskaPhase2] Search POST returned ${searchResultsResponse.status}`);
        }
      } else {
        console.warn(
          '[NebraskaPhase2] ASP.NET form tokens not found — page may be JS-rendered or have different structure'
        );
        // NOTE (BLOCKED): If NDBF is a JS SPA, consider requesting a data export or using their API
      }
    } else {
      console.warn(`[NebraskaPhase2] NDBF search page returned ${searchPageResponse.status} — falling back to NMLS`);
    }

    // Step 3: NMLS fallback for NE pawnbrokers
    const nmlsDomain = 'api.nmlsconsumeraccess.org';
    const pageSize = 100;
    let pageIndex = 0;
    let hasMore = true;

    console.log('[NebraskaPhase2] Querying NMLS Consumer Access for Nebraska pawnbrokers');

    while (hasMore) {
      await defaultRateLimiter.waitBeforeRequest(nmlsDomain);

      const nmlsUrl = `${NMLS_API_BASE}?StateRegulator=NE&LicenseType=Pawnbroker&PageIndex=${pageIndex}&PageSize=${pageSize}`;

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
        console.warn(`[NebraskaPhase2] NMLS API returned ${nmlsResponse.status} — stopping`);
        break;
      }

      const contentType = nmlsResponse.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn('[NebraskaPhase2] NMLS API did not return JSON — portal may require browser session');
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
      console.log(`[NebraskaPhase2] NMLS page ${pageIndex}: ${companies.length} results`);

      for (const company of companies) {
        const businessName = company.EntityName?.trim();
        const city = company.City?.trim() || '';
        const licenseNumber =
          company.LicenseNumber?.toString().trim() || company.NMLSId?.toString().trim() || '';

        if (!businessName || !licenseNumber) continue;

        totalRecords++;
        await upsertNebraskaOrganizer({ businessName, licenseNumber, city });
        createdOrganizers++;
      }

      const totalCount = data.TotalRecordCount || 0;
      pageIndex++;
      hasMore = companies.length === pageSize && pageIndex * pageSize < totalCount;

      if (totalRecords % 50 === 0 && totalRecords > 0) {
        console.log(`[NebraskaPhase2] Progress: ${totalRecords} records, ${createdOrganizers} upserted`);
      }
    }

    console.log(
      `[NebraskaPhase2] Scraper completed: processed ${totalRecords} records, upserted ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[NebraskaPhase2] Scraper error:', error);
    throw error;
  }
}

async function upsertNebraskaOrganizer(params: {
  businessName: string;
  licenseNumber: string;
  city: string;
}): Promise<void> {
  const { businessName, licenseNumber, city } = params;

  try {
    console.log(`[NebraskaPhase2] Processing: ${businessName} (License ${licenseNumber}) in ${city}, NE`);

    const existing = await prisma.organizer.findFirst({
      where: {
        OR: [
          { licenseNumber, licenseState: 'NE' },
          {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'NE',
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
          licenseState: 'NE',
          isStateLicensed: true,
          directoryMostRecentSource: 'NebraskaPhase2',
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
          address: city ? `${city}, NE` : 'Nebraska',
          bio: `Licensed pawnbroker in ${city || 'Nebraska'}.`,
          isClaimed: false,
          isUnmanagedListing: true,
          licenseNumber,
          licenseState: 'NE',
          isStateLicensed: true,
          businessCategory: 'PAWN_SHOP',
          directoryMostRecentSource: 'NebraskaPhase2',
          directoryMostRecentAt: new Date(),
          user: {
            create: {
              email: `scraper+${slug}-${citySlug}-ne-nephase2@system.finda.sale`,
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
    console.error(`[NebraskaPhase2] Error upserting ${businessName}:`, err);
  }
}
