/**
 * Oklahoma Department of Consumer Credit — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Oklahoma DOC pawnbroker roster PDF
 * Source: https://oklahoma.gov/content/dam/ok/en/okdocc/documents/rosters/4.30.2026.PB-ALL.pdf
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in OK)
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const OKLAHOMA_PDF_URL = 'https://oklahoma.gov/content/dam/ok/en/okdocc/documents/rosters/4.30.2026.PB-ALL.pdf';

/**
 * Scrape Oklahoma pawnbroker licenses from state DOC roster PDF.
 * Fetches the PDF and parses it as text to extract business information.
 */
export async function runOklahomaphase2Scraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(OKLAHOMA_PDF_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[OklahomaPdf2] Starting pawnbroker license scraper');

    // Fetch the PDF
    await rateLimiter.waitBeforeRequest(domain);

    const pdfResponse = await fetch(OKLAHOMA_PDF_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'application/pdf',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
    }

    const pdfContent = await pdfResponse.text();

    console.log('[OklahomaPdf2] Fetched and extracted PDF content');

    // Parse the PDF text content
    // The roster typically has entries in the format:
    // Business Name | City | License Number
    // or similar tabular format separated by whitespace

    // Split into lines and filter out empty/header lines
    const lines = pdfContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    console.log(`[OklahomaPdf2] Extracted ${lines.length} lines from PDF`);

    // Track which lines are headers (usually contain "Name", "City", "License", etc.)
    let dataStartIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].toLowerCase().includes('name') ||
        lines[i].toLowerCase().includes('business') ||
        lines[i].toLowerCase().includes('city')
      ) {
        dataStartIdx = i + 1; // Start reading data after headers
        break;
      }
    }

    // Process each line as a potential record
    for (let i = dataStartIdx; i < lines.length; i++) {
      const line = lines[i];

      // Skip page breaks, footer lines, and empty content
      if (
        line.includes('Page') ||
        line.includes('Oklahoma Department') ||
        line.includes('Pawn Broker') ||
        line.length < 5
      ) {
        continue;
      }

      // Split line by multiple spaces or tabs to extract fields
      const parts = line.split(/\s{2,}|[\t]+/).map((s) => s.trim());

      if (parts.length < 2) {
        continue; // Need at least business name and city/license
      }

      const businessName = parts[0];
      let city = '';
      let licenseNumber = '';

      // Try to extract city and license number from remaining parts
      if (parts.length >= 3) {
        city = parts[1];
        licenseNumber = parts[2];
      } else if (parts.length === 2) {
        // If only 2 parts, second could be city or license
        // License numbers are usually numeric or contain dashes
        if (/^\d+[-\d]*$/.test(parts[1])) {
          licenseNumber = parts[1];
          city = 'OK'; // Default if not specified
        } else {
          city = parts[1];
          licenseNumber = `OK-${totalRecords + 1}`;
        }
      }

      // Validate that we have a business name
      if (!businessName || businessName.length < 3) {
        continue;
      }

      totalRecords++;

      console.log(
        `[OklahomaPdf2] Processing: ${businessName} (License ${licenseNumber}) in ${city}, OK`
      );

      // Upsert organizer with pawnbroker licensing data
      try {
        const existing = await prisma.organizer.findFirst({
          where: {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'OK',
          },
          select: { id: true },
        });

        if (existing) {
          // Update existing
          await prisma.organizer.update({
            where: { id: existing.id },
            data: {
              licenseNumber,
              licenseState: 'OK',
              isStateLicensed: true,
              directoryMostRecentSource: 'OklahomaPdf2',
              directoryMostRecentAt: new Date(),
            },
          });
        } else {
          // Create new
          const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
          const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '-');
          const newOrg = await prisma.organizer.create({
            data: {
              businessName,
              phone: null,
              address: `${city}, OK`,
              bio: `Licensed pawnbroker in ${city}, Oklahoma.`,
              isClaimed: false,
              isUnmanagedListing: true,
              licenseNumber,
              licenseState: 'OK',
              isStateLicensed: true,
              businessCategory: 'PAWN_SHOP',
              directoryMostRecentSource: 'OklahomaPdf2',
              directoryMostRecentAt: new Date(),
              user: {
                create: {
                  email: `scraper+${slug}-${citySlug}-ok-oklahomapdf2@system.finda.sale`,
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
          console.log(
            `[OklahomaPdf2] Progress: processed ${totalRecords} records, created ${createdOrganizers} organizers`
          );
        }
      } catch (err) {
        console.error(`[OklahomaPdf2] Error processing ${businessName}:`, err);
      }
    }

    console.log(
      `[OklahomaPdf2] Scraper completed: processed ${totalRecords} records, created ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[OklahomaPdf2] Scraper error:', error);
    throw error;
  }
}
