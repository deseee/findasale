/**
 * Oklahoma Department of Consumer Credit (ODCC) — Pawnbroker License Scraper (Phase 2)
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 *
 * Source: https://oklahoma.gov/okdocc/licenses-we-regulate.html
 * The ODCC publishes a monthly PDF roster of active pawnbroker licensees linked from that page.
 * ~215 active licensees as of 2026.
 *
 * Strategy:
 *   1. Fetch the ODCC "licenses we regulate" page
 *   2. Find the pawnbroker PDF link (href ending in .pdf, link text contains "pawn")
 *   3. Download the PDF as a binary buffer via axios
 *   4. Parse with pdf-parse to extract text
 *   5. Parse lines to extract business name, city, license number
 *   6. Upsert each record via getOrCreateScrapedOrganizer
 */

import axios from 'axios';
import pdfParse from 'pdf-parse';
import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const ODCC_PAGE_URL = 'https://oklahoma.gov/okdocc/licenses-we-regulate.html';
const SOURCE_ID = 'OklahomaODCC';
const STATE = 'OK';

export async function runOklahomaphase2Scraper(): Promise<void> {
  const pageDomain = new URL(ODCC_PAGE_URL).hostname;
  let totalRecords = 0;
  let upsertedCount = 0;

  try {
    console.log('[OklahomaPhase2] Fetching ODCC licenses page to locate pawnbroker PDF');

    await defaultRateLimiter.waitBeforeRequest(pageDomain);

    const pageResponse = await axios.get<string>(ODCC_PAGE_URL, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 30000,
      responseType: 'text',
    });

    const html = pageResponse.data;

    // Find the pawnbroker PDF link: href ending in .pdf, containing "pawn" in href or nearby text
    const pdfLinkRegex = /href="([^"]*\.pdf)"/gi;
    const allPdfLinks: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pdfLinkRegex.exec(html)) !== null) {
      allPdfLinks.push(match[1]);
    }

    // Filter to pawnbroker PDF (href or surrounding HTML contains "pawn")
    let pdfHref: string | null = null;
    for (const href of allPdfLinks) {
      if (/pawn/i.test(href)) {
        pdfHref = href;
        break;
      }
    }

    // Fallback: look at anchor text context around each PDF link
    if (!pdfHref) {
      const anchorRegex = /<a[^>]+href="([^"]*\.pdf)"[^>]*>([^<]*)<\/a>/gi;
      let anchorMatch: RegExpExecArray | null;
      while ((anchorMatch = anchorRegex.exec(html)) !== null) {
        const linkText = anchorMatch[2];
        if (/pawn/i.test(linkText)) {
          pdfHref = anchorMatch[1];
          break;
        }
      }
    }

    if (!pdfHref) {
      console.warn(
        `[OklahomaPhase2] No pawnbroker PDF link found on ODCC page. Found ${allPdfLinks.length} total PDF links: ${allPdfLinks.slice(0, 5).join(', ')}`
      );
      return;
    }

    // Resolve relative URLs
    const pdfUrl = pdfHref.startsWith('http')
      ? pdfHref
      : new URL(pdfHref, ODCC_PAGE_URL).href;

    console.log(`[OklahomaPhase2] Found pawnbroker PDF: ${pdfUrl}`);

    // Download PDF as binary buffer
    const pdfDomain = new URL(pdfUrl).hostname;
    await defaultRateLimiter.waitBeforeRequest(pdfDomain);

    const pdfResponse = await axios.get<ArrayBuffer>(pdfUrl, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'application/pdf,*/*',
        Referer: ODCC_PAGE_URL,
      },
      timeout: 60000,
      responseType: 'arraybuffer',
    });

    const pdfBuffer = Buffer.from(pdfResponse.data);
    console.log(`[OklahomaPhase2] Downloaded PDF (${Math.round(pdfBuffer.length / 1024)} KB) — parsing`);

    const parsed = await pdfParse(pdfBuffer);
    const rawText = parsed.text;

    // Split into lines and parse records
    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
    console.log(`[OklahomaPhase2] PDF extracted ${lines.length} lines`);

    for (const line of lines) {
      // Skip obvious headers/footers/blank lines
      if (
        /^\s*$/.test(line) ||
        /page\s+\d+/i.test(line) ||
        /pawnbroker\s+licens/i.test(line) ||
        /oklahoma\s+department/i.test(line) ||
        /consumer\s+credit/i.test(line) ||
        /license\s+number/i.test(line) ||
        /business\s+name/i.test(line) ||
        /city.*state/i.test(line) ||
        /^\d{1,3}$/.test(line) // lone page numbers
      ) {
        continue;
      }

      // Parse line: formats vary but commonly tab- or multi-space-delimited
      // Expected patterns:
      //   "ACME PAWN SHOP   TULSA   PB-12345"
      //   "ACME PAWN SHOP\tTULSA, OK\t12345"
      //   or fixed-width columns

      // Try tab-delimited first
      let parts = line.split('\t').map((p) => p.trim()).filter(Boolean);

      // Fall back to 2+ consecutive spaces
      if (parts.length < 2) {
        parts = line.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
      }

      if (parts.length < 2) {
        // Try to detect a license number pattern at the end of the line
        const licenseMatch = line.match(/^(.+?)\s+((?:PB-?|LICENSE-?|LIC-?|OK-?)?\d{3,})\s*$/i);
        if (licenseMatch) {
          parts = [licenseMatch[1].trim(), licenseMatch[2].trim()];
        } else {
          continue;
        }
      }

      // Extract fields — business name is always first
      let businessName = parts[0];
      let city = '';
      let licenseNumber = '';

      if (parts.length >= 3) {
        // [businessName, city, licenseNumber]
        city = parts[1].replace(/,?\s*OK\s*$/i, '').trim();
        licenseNumber = parts[2];
      } else if (parts.length === 2) {
        // Could be [businessName, licenseNumber] or [businessName, city]
        const last = parts[1];
        if (/\d/.test(last)) {
          licenseNumber = last;
        } else {
          city = last.replace(/,?\s*OK\s*$/i, '').trim();
        }
      }

      // Clean up license number — strip non-alphanumeric prefix labels
      licenseNumber = licenseNumber.replace(/^(?:license|lic|no\.?|#)\s*/i, '').trim();

      // Validate: must have a business name with at least 2 characters
      businessName = businessName.replace(/,?\s*OK\s*$/i, '').trim();
      if (businessName.length < 2) continue;

      totalRecords++;

      try {
        await getOrCreateScrapedOrganizer(
          businessName,
          SOURCE_ID,
          city || 'Oklahoma',
          STATE,
          undefined, // esnOrgId
          undefined, // googlePlaceId
          undefined, // foursquareVenueId
          undefined, // hereBusinessId
          'PAWN_SHOP',
          undefined, // contactEmail
          undefined, // phone
          undefined, // website
          undefined, // lat
          undefined, // lng
          true,      // isStateLicensed
          STATE,     // licenseState
          licenseNumber || undefined,
          SOURCE_ID  // sourceLabel
        );
        upsertedCount++;
      } catch (err) {
        console.error(`[OklahomaPhase2] Error upserting "${businessName}":`, err);
      }

      if (totalRecords % 50 === 0) {
        console.log(`[OklahomaPhase2] Progress: ${totalRecords} records processed, ${upsertedCount} upserted`);
      }
    }

    console.log(
      `[OklahomaPhase2] Scraper completed: ${totalRecords} records processed, ${upsertedCount} upserted`
    );
  } catch (error) {
    console.error('[OklahomaPhase2] Scraper error:', error);
    throw error;
  }
}
