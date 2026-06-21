/**
 * Utah Department of Financial Institutions (DFI) — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Utah DFI or Utah Business Entity Search fallback
 * Primary: https://dfi.utah.gov/licensees/pawnbrokers/
 * Fallback: https://secure.utah.gov/bes/index.html (Utah Business Entity Search)
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in UT)
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const UT_DFI_BASE_URL = 'https://dfi.utah.gov';
const UT_DFI_LICENSEES_URL = 'https://dfi.utah.gov/licensees/pawnbrokers/';
const UT_BES_SEARCH_URL = 'https://secure.utah.gov/bes/index.html';
const RATE_DELAY_MS = 3000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scrape Utah DFI pawnbroker licenses.
 * Tries DFI licensee page first. Falls back to Utah Business Entity Search
 * keyword search for "pawn" if DFI is unavailable.
 */
export async function runUtahPhase2Scraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(UT_DFI_BASE_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[UtahPhase2] Starting Utah DFI pawnbroker license scraper');

    await rateLimiter.waitBeforeRequest(domain);

    const dfiResponse = await fetch(UT_DFI_LICENSEES_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    let html = '';

    if (dfiResponse.ok) {
      html = await dfiResponse.text();
      console.log('[UtahPhase2] DFI licensee page fetched (' + html.length + ' bytes)');
    } else {
      console.warn('[UtahPhase2] DFI licensee page unavailable: ' + dfiResponse.status);

      await sleep(RATE_DELAY_MS);
      await rateLimiter.waitBeforeRequest(domain);

      const landingResponse = await fetch(UT_DFI_BASE_URL, {
        method: 'GET',
        headers: {
          'User-Agent': getRandomUserAgent(),
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Connection: 'keep-alive',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (landingResponse.ok) {
        const landingHtml = await landingResponse.text();
        const pawnMatch = landingHtml.match(/href="([^"]*pawn[^"]*)"/i);
        if (pawnMatch) {
          const pawnUrl = pawnMatch[1].startsWith('http')
            ? pawnMatch[1]
            : UT_DFI_BASE_URL + pawnMatch[1];
          console.log('[UtahPhase2] Found pawnbroker link: ' + pawnUrl);

          await sleep(RATE_DELAY_MS);
          await rateLimiter.waitBeforeRequest(domain);

          const pawnResponse = await fetch(pawnUrl, {
            method: 'GET',
            headers: {
              'User-Agent': getRandomUserAgent(),
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              Referer: UT_DFI_BASE_URL,
              Connection: 'keep-alive',
            },
            signal: AbortSignal.timeout(30000),
          });

          if (pawnResponse.ok) {
            html = await pawnResponse.text();
            console.log('[UtahPhase2] Pawnbroker page fetched via landing link (' + html.length + ' bytes)');
          }
        }
      }
    }

    if (!html) {
      console.warn('[UtahPhase2] DFI unavailable. Attempting Utah BES fallback.');
      await sleep(RATE_DELAY_MS);
      const besResult = await runUtahBESFallback(rateLimiter);
      console.log('[UtahPhase2] BES fallback: ' + besResult.totalRecords + ' records, ' + besResult.created + ' created');
      if (besResult.totalRecords === 0) {
        console.warn(
          '[UtahPhase2] All approaches exhausted. ' +
          'NOTE (BLOCKED): 1. Try https://dfi.utah.gov/licensees/ for complete licensee directory. ' +
          '2. Email dfi@utah.gov to request pawnbroker licensee list. ' +
          '3. Check https://www.utah.gov/pmn/sitemap/business for business license data.'
        );
      }
      return;
    }

    if (html.includes('captcha') || html.includes('CAPTCHA') || html.includes('Cloudflare') || html.length < 300) {
      console.warn(
        '[UtahPhase2] Bot protection detected. ' +
        'NOTE (BLOCKED): Utah DFI blocking server-side requests. ' +
        'Try https://dfi.utah.gov/licensees/ or contact dfi@utah.gov for bulk data.'
      );
      return;
    }

    const xlsxMatch = html.match(/href="([^"]*\.xlsx[^"]*)"/i);
    const csvMatch = html.match(/href="([^"]*\.csv[^"]*)"/i);

    if (xlsxMatch || csvMatch) {
      const raw = xlsxMatch ? xlsxMatch[1] : csvMatch![1];
      const fileUrl = raw.startsWith('http') ? raw : UT_DFI_BASE_URL + raw;
      console.log('[UtahPhase2] Found downloadable file: ' + fileUrl);
      // NOTE (BLOCKED): Implement XLSX/CSV parsing for Utah DFI pawnbroker list.
      // File should contain: Business Name, License Number, City, Status columns.
      console.warn('[UtahPhase2] Downloadable file found — XLSX/CSV parsing not yet implemented.');
      return;
    }

    const extractText = (cellHtml: string): string => {
      return cellHtml
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    };

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(extractText(cellMatch[1]));
      }

      if (cells.length < 2) continue;

      const licenseNumber = cells[0];
      const businessName = cells[1];
      const city = cells.length > 2 ? cells[2] : '';

      if (!licenseNumber || !businessName || licenseNumber === 'License Number' || licenseNumber === 'License #') continue;

      totalRecords++;
      console.log('[UtahPhase2] Processing: ' + businessName + ' (' + licenseNumber + ') in ' + (city || 'UT'));

      try {
        const existing = await prisma.organizer.findFirst({
          where: {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'UT',
          },
          select: { id: true },
        });

        if (existing) {
          await prisma.organizer.update({
            where: { id: existing.id },
            data: {
              licenseNumber,
              licenseState: 'UT',
              isStateLicensed: true,
              directoryMostRecentSource: 'UtahPhase2',
              directoryMostRecentAt: new Date(),
            },
          });
        } else {
          const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
          const citySlug = (city || 'ut').toLowerCase().replace(/[^a-z0-9]/g, '-');
          await prisma.organizer.create({
            data: {
              businessName,
              phone: null,
              address: city ? city + ', UT' : 'Utah',
              city: city || 'Utah',
              state: 'UT',
              bio: 'Licensed pawnbroker in ' + (city || 'Utah') + '.',
              isClaimed: false,
              isUnmanagedListing: true,
              licenseNumber,
              licenseState: 'UT',
              isStateLicensed: true,
              businessCategory: 'PAWN_SHOP',
              directoryMostRecentSource: 'UtahPhase2',
              directoryMostRecentAt: new Date(),
              user: {
                create: {
                  email: 'scraper+' + slug + '-' + citySlug + '-ut-utphase2@system.finda.sale',
                  name: businessName,
                  password: null,
                  role: 'ORGANIZER',
                  roles: ['ORGANIZER'],
                },
              },
            },
          });
          createdOrganizers++;
        }

        if (totalRecords % 50 === 0) {
          console.log('[UtahPhase2] Progress: ' + totalRecords + ' processed, ' + createdOrganizers + ' created');
        }

        await sleep(RATE_DELAY_MS);
      } catch (err) {
        console.error('[UtahPhase2] Error processing ' + businessName + ':', err);
      }
    }

    console.log('[UtahPhase2] Scraper completed: ' + totalRecords + ' records processed, ' + createdOrganizers + ' created');
  } catch (error) {
    console.error('[UtahPhase2] Scraper error:', error);
    throw error;
  }
}

async function runUtahBESFallback(
  rateLimiter: typeof defaultRateLimiter
): Promise<{ totalRecords: number; created: number }> {
  const besDomain = 'secure.utah.gov';
  let totalRecords = 0;
  let created = 0;

  console.log('[UtahPhase2] BES fallback: searching for "pawn"');

  await rateLimiter.waitBeforeRequest(besDomain);

  const besResponse = await fetch(UT_BES_SEARCH_URL + '?search=pawn&type=business', {
    method: 'GET',
    headers: {
      'User-Agent': getRandomUserAgent(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Connection: 'keep-alive',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!besResponse.ok) {
    console.warn('[UtahPhase2] BES fallback failed: ' + besResponse.status);
    return { totalRecords, created };
  }

  const html = await besResponse.text();

  if (html.includes('captcha') || html.includes('CAPTCHA') || html.length < 300) {
    console.warn('[UtahPhase2] BES fallback: bot protection or empty response.');
    return { totalRecords, created };
  }

  const extractText = (cellHtml: string): string => {
    return cellHtml
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim();
  };

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(extractText(cellMatch[1]));
    }

    if (cells.length < 2) continue;

    const businessName = cells[0];
    const city = cells.length > 1 ? cells[1] : '';
    const licenseNumber = cells.length > 2 ? cells[2] : 'UT-BES-' + (totalRecords + 1);

    if (!businessName || !businessName.toLowerCase().includes('pawn')) continue;

    totalRecords++;

    try {
      const existing = await prisma.organizer.findFirst({
        where: {
          businessName: { equals: businessName, mode: 'insensitive' },
          licenseState: 'UT',
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.organizer.update({
          where: { id: existing.id },
          data: {
            licenseNumber,
            licenseState: 'UT',
            isStateLicensed: true,
            directoryMostRecentSource: 'UtahPhase2',
            directoryMostRecentAt: new Date(),
          },
        });
      } else {
        const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
        const citySlug = (city || 'ut').toLowerCase().replace(/[^a-z0-9]/g, '-');
        await prisma.organizer.create({
          data: {
            businessName,
            phone: null,
            address: city ? city + ', UT' : 'Utah',
            city: city || 'Utah',
            state: 'UT',
            bio: 'Licensed pawnbroker in ' + (city || 'Utah') + '.',
            isClaimed: false,
            isUnmanagedListing: true,
            licenseNumber,
            licenseState: 'UT',
            isStateLicensed: true,
            businessCategory: 'PAWN_SHOP',
            directoryMostRecentSource: 'UtahPhase2',
            directoryMostRecentAt: new Date(),
            user: {
              create: {
                email: 'scraper+' + slug + '-' + citySlug + '-ut-utphase2bes@system.finda.sale',
                name: businessName,
                password: null,
                role: 'ORGANIZER',
                roles: ['ORGANIZER'],
              },
            },
          },
        });
        created++;
      }

      await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
    } catch (err) {
      console.error('[UtahPhase2] BES error processing ' + businessName + ':', err);
    }
  }

  return { totalRecords, created };
}
