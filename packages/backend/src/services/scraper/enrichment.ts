/**
 * ADR-073: Organizer Enrichment via ESN Company Profile APIs & Website Scraping
 * Fires after organizer creation/update to populate verification data.
 * NOTE: Google Places enrichment removed — paid API, $200/run (S695).
 */

import { prisma } from '../../lib/prisma';
import { getRandomUserAgent, getRandomReferer } from './userAgents';

const DEBUG = process.env.LOG_LEVEL === 'debug';

/**
 * Main enrichment entry point.
 * Looks up organizer data via ESN company-public-page API and Google Places.
 * Also attempts contact email discovery via website scraping and sale descriptions.
 * Fire-and-forget; errors logged but not thrown.
 */
export async function enrichOrganizer(
  organizerId: string,
  name: string,
  city: string,
  state: string
): Promise<void> {
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: {
        id: true,
        phone: true,
        website: true,
        address: true,
        profilePhoto: true,
        bio: true,
        facebook: true,
        instagram: true,
        twitterUrl: true,
        youtubeUrl: true,
        pinterestUrl: true,
        linkedInUrl: true,
        tiktokUrl: true,
        serviceAreas: true,
        esnOrgId: true,
        contactEmail: true,
        esnCompanyPageUrl: true,
        user: {
          select: { email: true }
        }
      },
    });

    if (!organizer) {
      console.warn(`[Enrichment] Organizer not found: ${organizerId}`);
      return;
    }

    // Skip test/seed accounts to prevent overwriting with real Google Places data
    if (organizer.user?.email?.endsWith('@example.com')) {
      if (DEBUG) console.info(`[Enrichment] Skipping test account ${organizerId} (@example.com)`);
      return;
    }

    // Skip if no ESN pending and contact email already found
    if (!organizer.esnOrgId && organizer.contactEmail) {
      if (DEBUG) console.info(`[Enrichment] Already fully enriched — skipping: ${organizerId}`);
      return;
    }

    const updateData: Record<string, any> = {};

    // Step 1: ESN enrichment (highest priority for ESN-sourced organizers)
    if (organizer.esnOrgId) {
      const esnData = await lookupESNCompanyProfile(organizer.esnOrgId);
      if (esnData) {
        if (esnData.primaryPhoneNumber && !organizer.phone)
          updateData.phone = esnData.primaryPhoneNumber;
        if (esnData.websiteUrl && !organizer.website)
          updateData.website = esnData.websiteUrl;
        if (esnData.companyLogoUrl && !organizer.profilePhoto)
          updateData.profilePhoto = esnData.companyLogoUrl;
        if (esnData.description && !organizer.bio) {
          updateData.bio = esnData.description
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        }
        if (esnData.facebookUrl && !organizer.facebook)
          updateData.facebook = esnData.facebookUrl;
        if (esnData.instagramUrl && !organizer.instagram)
          updateData.instagram = esnData.instagramUrl;
        if (esnData.twitterHandle && !organizer.twitterUrl)
          updateData.twitterUrl = esnData.twitterHandle;
        if (esnData.youtubeUrl && !organizer.youtubeUrl)
          updateData.youtubeUrl = esnData.youtubeUrl;
        if (esnData.pinterestUrl && !organizer.pinterestUrl)
          updateData.pinterestUrl = esnData.pinterestUrl;
        if (esnData.linkedInUrl && !organizer.linkedInUrl)
          updateData.linkedInUrl = esnData.linkedInUrl;
        if (esnData.tiktokUrl && !organizer.tiktokUrl)
          updateData.tiktokUrl = esnData.tiktokUrl;
        if (esnData.metroAreaNames && !organizer.serviceAreas)
          updateData.serviceAreas = esnData.metroAreaNames.join(', ');
        if (esnData.memberships)
          updateData.esnMemberships = esnData.memberships;
        if (esnData.orgPackageType)
          updateData.esnPackageType = esnData.orgPackageType;
        // ESN company page URL — stored as last-resort contact channel (never shown in primary outreach)
        if (esnData.companyPageUrl && !organizer.esnCompanyPageUrl) {
          updateData.esnCompanyPageUrl = esnData.companyPageUrl.startsWith('http')
            ? esnData.companyPageUrl
            : `https://www.estatesales.net${esnData.companyPageUrl}`;
        }
      }
    }

    // Step 2: Contact email discovery
    // Priority: website /contact page → sale description parsing
    if (!organizer.contactEmail) {
      const websiteToCheck = (updateData.website as string | undefined) ?? organizer.website;
      if (websiteToCheck) {
        const emailFromWebsite = await scrapeWebsiteForEmail(websiteToCheck);
        if (emailFromWebsite) updateData.contactEmail = emailFromWebsite;
      }

      // Fallback: parse email patterns from scraped sale listing descriptions
      if (!updateData.contactEmail) {
        const emailFromDescriptions = await extractEmailFromSaleDescriptions(organizerId);
        if (emailFromDescriptions) updateData.contactEmail = emailFromDescriptions;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.organizer.update({
        where: { id: organizerId },
        data: updateData,
      });
      if (DEBUG) console.info(
        `[Enrichment] Updated organizer ${organizerId}: ${Object.keys(updateData).join(', ')}`
      );
    } else {
      if (DEBUG) console.info(`[Enrichment] No enrichment data found for ${organizerId}`);
    }
  } catch (error) {
    console.error(
      `[Enrichment] Failed to enrich organizer ${organizerId}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}


/**
 * Lookup EstateSales.NET company profile via company-public-page API.
 * Returns enrichment data including company page URL (stored as last-resort contact channel).
 */
async function lookupESNCompanyProfile(
  esnOrgId: number
): Promise<{
  primaryPhoneNumber?: string;
  websiteUrl?: string;
  companyLogoUrl?: string;
  description?: string;
  metroAreaNames?: string[];
  instagramUrl?: string;
  pinterestUrl?: string;
  facebookUrl?: string;
  linkedInUrl?: string;
  twitterHandle?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
  memberships?: Array<{ id: number; name: string; shortDescription?: string }>;
  orgPackageType?: string;
  companyPageUrl?: string;
} | null> {
  try {
    const query = JSON.stringify({ orgId: esnOrgId });
    const url = `https://www.estatesales.net/api/legacy/queries/companies/company-public-page?query=${encodeURIComponent(query)}&explicitTypes=DateTime`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'application/json',
        'Accept-Language': 'en-US',
        Referer: getRandomReferer() || 'https://www.estatesales.net/',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(
        `[Enrichment] ESN company profile API error: ${response.status} for orgId=${esnOrgId}`
      );
      return null;
    }

    return (await response.json()) as any;
  } catch (error) {
    console.warn(
      `[Enrichment] ESN lookup failed for orgId=${esnOrgId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

/**
 * Scrape organizer's website for a contact email address.
 * Tries /contact, /contact-us, /about, then homepage in order.
 * Extracts mailto: links first, then bare email patterns in page text.
 */
async function scrapeWebsiteForEmail(website: string): Promise<string | null> {
  const base = website.replace(/\/+$/, '');
  const pagesToTry = [`${base}/contact`, `${base}/contact-us`, `${base}/about`, base];

  const mailtoPattern = /href=["']mailto:([^"'?\s]+)/gi;
  const bareEmailPattern = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
  const excluded = /noreply|no-reply|donotreply|do-not-reply|bounce|mailer-daemon/i;

  for (const pageUrl of pagesToTry) {
    try {
      const response = await fetch(pageUrl, {
        headers: { 'User-Agent': getRandomUserAgent(), Accept: 'text/html' },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      });

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) continue;

      const html = await response.text();

      // Priority 1: mailto: href attributes
      mailtoPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = mailtoPattern.exec(html)) !== null) {
        const email = match[1].trim().toLowerCase();
        if (email && !excluded.test(email)) return email;
      }

      // Priority 2: bare email addresses in page text
      bareEmailPattern.lastIndex = 0;
      while ((match = bareEmailPattern.exec(html)) !== null) {
        const email = match[1].trim().toLowerCase();
        // Skip asset paths that accidentally match the email pattern
        if (/\.(png|jpg|gif|js|css|svg|woff)/.test(email)) continue;
        if (!excluded.test(email)) return email;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Extract a contact email from the organizer's scraped sale listing descriptions.
 * Checks up to 20 most recent scraped listings for embedded email addresses.
 */
async function extractEmailFromSaleDescriptions(organizerId: string): Promise<string | null> {
  try {
    const sales = await prisma.sale.findMany({
      where: {
        organizerId,
        sourceName: { not: null },
        description: { not: null },
      },
      select: { description: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const emailPattern = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
    const excluded = /noreply|no-reply|donotreply|bounce|example\.com/i;

    for (const sale of sales) {
      if (!sale.description) continue;
      emailPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = emailPattern.exec(sale.description)) !== null) {
        const email = match[1].toLowerCase();
        if (!excluded.test(email)) return email;
      }
    }
  } catch (error) {
    console.warn(
      `[Enrichment] Description email parse failed for ${organizerId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return null;
}

