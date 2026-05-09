/**
 * Nevada Financial Institutions Division (FID) — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Nevada FID licensee database
 * Primary: https://fid.nv.gov/
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in NV)
 *
 * NV is heavily city-level regulated (Las Vegas/Clark County), but state FID
 * maintains a pawnbroker license list. We attempt state-level FID search first.
 * TODO: Clark County supplemental —
 *   https://www.clarkcountynv.gov/business/business_license/pages/business_license_search.aspx
 * requires JS rendering; implement as separate city-level scraper if state returns sparse results.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const NV_FID_BASE_URL = 'https://fid.nv.gov';
const NV_FID_SEARCH_URL = 'https://fid.nv.gov/';
const NV_FID_LICENSEE_URL = 'https://fid.nv.gov/licensee-list/pawnbrokers';
const RATE_DELAY_MS = 3000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runNevadaPhase2Scraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(NV_FID_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[NevadaPhase2] Starting Nevada FID pawnbroker license scraper');

    await rateLimiter.waitBeforeRequest(domain);

    const landingResponse = await fetch(NV_FID_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!landingResponse.ok) {
      console.warn(
        '[NevadaPhase2] Could not reach NV FID portal: ' + landingResponse.status + '. ' +
        'TODO: If FID portal unavailable, try https://fid.nv.gov/licensee-list/pawnbrokers ' +
        'or contact fid@fid.nv.gov to request a bulk licensee list.'
      );
      return;
    }

    const landingHtml = await landingResponse.text();
    console.log('[NevadaPhase2] FID landing page fetched');

    await sleep(RATE_DELAY_MS);
    await rateLimiter.waitBeforeRequest(domain);

    const listResponse = await fetch(NV_FID_LICENSEE_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: NV_FID_SEARCH_URL,
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    let html = '';

    if (listResponse.ok) {
      html = await listResponse.text();
      console.log('[NevadaPhase2] FID pawnbroker list page fetched');
    } else {
      console.warn('[NevadaPhase2] Direct licensee URL failed: ' + listResponse.status + '. Trying landing page link.');
      const pawnLinkMatch = landingHtml.match(/href="([^"]*pawn[^"]*)"/i);
      if (pawnLinkMatch) {
        const pawnUrl = pawnLinkMatch[1].startsWith('http')
          ? pawnLinkMatch[1]
          : NV_FID_BASE_URL + pawnLinkMatch[1];
        console.log('[NevadaPhase2] Found pawnbroker link: ' + pawnUrl);

        await sleep(RATE_DELAY_MS);
        await rateLimiter.waitBeforeRequest(domain);

        const fallbackResponse = await fetch(pawnUrl, {
          method: 'GET',
          headers: {
            'User-Agent': getRandomUserAgent(),
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Referer: NV_FID_SEARCH_URL,
            Connection: 'keep-alive',
          },
          signal: AbortSignal.timeout(30000),
        });

        if (fallbackResponse.ok) {
          html = await fallbackResponse.text();
          console.log('[NevadaPhase2] Pawnbroker page fetched via landing link');
        }
      }
    }

    if (!html) {
      console.warn(
        '[NevadaPhase2] Could not retrieve pawnbroker licensee page. ' +
        'TODO: NV FID may require JS navigation. ' +
        'Check https://fid.nv.gov for downloadable Excel/PDF, ' +
        'or try https://www.nvsos.gov/sos/licensing for state licensing search.'
      );
      return;
    }

    if (
      html.includes('captcha') ||
      html.includes('CAPTCHA') ||
      html.includes('Cloudflare') ||
      html.includes('cf-browser-verification') ||
      html.length < 500
    ) {
      console.warn(
        '[NevadaPhase2] Bot protection or empty page detected. ' +
        'TODO: FID portal may block server-side requests. ' +
        'Alternative: check https://fid.nv.gov for downloadable licensee PDFs per category.'
      );
      return;
    }

    const extractText = (cellHtml: string): string => {
      return cellHtml
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"\')
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

      if (!licenseNumber || !businessName || licenseNumber === 'License Number' || licenseNumber === '#') continue;

      totalRecords++;
      console.log('[NevadaPhase2] Processing: ' + businessName + ' (' + licenseNumber + ') in ' + (city || 'NV'));

      try {
        const existing = await prisma.organizer.findFirst({
          where: {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'NV',
          },
          select: { id: true },
        });

        if (existing) {
          await prisma.organizer.update({
            where: { id: existing.id },
            data: {
              licenseNumber,
              licenseState: 'NV',
              isStateLicensed: true,
              directoryMostRecentSource: 'NevadaPhase2',
              directoryMostRecentAt: new Date(),
            },
          });
        } else {
          const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
          const citySlug = (city || 'nv').toLowerCase().replace(/[^a-z0-9]/g, '-');
          await prisma.organizer.create({
            data: {
              businessName,
              phone: null,
              address: city ? city + ', NV' : 'Nevada',
              city: city || 'Nevada',
              state: 'NV',
              bio: 'Licensed pawnbroker in ' + (city || 'Nevada') + '.',
              isClaimed: false,
              isUnmanagedListing: true,
              licenseNumber,
              licenseState: 'NV',
              isStateLicensed: true,
              businessCategory: 'PAWN_SHOP',
              directoryMostRecentSource: 'NevadaPhase2',
              directoryMostRecentAt: new Date(),
              user: {
                create: {
                  email: 'scraper+' + slug + '-' + citySlug + '-nv-nvphase2@system.finda.sale',
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
          console.log('[NevadaPhase2] Progress: ' + totalRecords + ' processed, ' + createdOrganizers + ' created');
        }

        await sleep(RATE_DELAY_MS);
      } catch (err) {
        console.error('[NevadaPhase2] Error processing ' + businessName + ':', err);
      }
    }

    console.log('[NevadaPhase2] Scraper completed: ' + totalRecords + ' records processed, ' + createdOrganizers + ' created');
  } catch (error) {
    console.error('[NevadaPhase2] Scraper error:', error);
    throw error;
  }
}
