/**
 * ADR-073: Organizer Enrichment via ESN Company Profile APIs & Website Scraping
 * Fires after organizer creation/update to populate verification data.
 * NOTE: Google Places enrichment removed — paid API, $200/run (S695).
 */

import * as Sentry from '@sentry/node';
import { prisma } from '../../lib/prisma';
import { getRandomUserAgent, getRandomReferer } from './userAgents';
import {
  isGenericEmail,
  calibrateConfidence,
  registrableDomain,
  emailDomain,
  domainMatchesBusiness,
  FAMOUS_UNRELATED_DOMAINS,
  type DiscoverySource,
} from '../emailProvenance';

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
        businessName: true,
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
        // Website-assignment guard (bounce-incident fix): only attach a website if its
        // registrable domain is not a famous-unrelated mega-brand AND it shares a meaningful
        // token with the business name. esnData.websiteUrl is a name/search match from the
        // ESN company-public-page payload, NOT a same-business verified link — so it can be
        // the wrong entity (e.g. Disney's club33.com attached to 'Club 33 Estate Sale Services').
        if (esnData.websiteUrl && !organizer.website) {
          const candDomain = registrableDomain(esnData.websiteUrl);
          if (!candDomain) {
            console.warn(`[Enrichment] Skipped website for ${organizerId} — unparseable domain: ${esnData.websiteUrl}`);
          } else if (FAMOUS_UNRELATED_DOMAINS.has(candDomain)) {
            console.warn(`[Enrichment] Skipped website for ${organizerId} — famous unrelated domain: ${candDomain}`);
          } else if (!domainMatchesBusiness(candDomain, organizer.businessName)) {
            console.warn(`[Enrichment] Skipped website for ${organizerId} — domain '${candDomain}' has no name overlap with '${organizer.businessName}'`);
          } else {
            updateData.website = esnData.websiteUrl;
          }
        }
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

    // Step 2: Contact email discovery — WITH provenance + guards (bounce-incident fix).
    // Every stored contactEmail now records method + confidence + discoveredAt, rejects
    // generic mailboxes (info@/admin@/…), and rejects wrong-entity domain mismatches —
    // identical to the good emailDiscoveryService path. Priority: website → sale descriptions.
    if (!organizer.contactEmail) {
      const websiteToCheck = (updateData.website as string | undefined) ?? organizer.website;
      const orgDomain = registrableDomain(websiteToCheck);
      const orgAddress = organizer.address ?? null;
      const businessName = organizer.businessName ?? null;

      if (websiteToCheck) {
        const emailFromWebsite = await scrapeWebsiteForEmail(websiteToCheck);
        const accepted = acceptDiscoveredEmail(
          emailFromWebsite,
          'website_scrape',
          0.8,
          orgDomain,
          orgAddress,
          businessName,
          organizerId
        );
        if (accepted) {
          updateData.contactEmail = accepted.email;
          updateData.scrapedEmail = accepted.email;
          updateData.emailDiscoveryMethod = 'website_scrape';
          updateData.emailDiscoveryConfidence = accepted.confidence;
          updateData.emailDiscoveredAt = new Date();
        }
      }

      // Fallback: parse email patterns from scraped sale listing descriptions
      if (!updateData.contactEmail) {
        const emailFromDescriptions = await extractEmailFromSaleDescriptions(organizerId);
        const accepted = acceptDiscoveredEmail(
          emailFromDescriptions,
          'sale_description',
          0.55,
          orgDomain,
          orgAddress,
          businessName,
          organizerId
        );
        if (accepted) {
          updateData.contactEmail = accepted.email;
          updateData.emailDiscoveryMethod = 'sale_description';
          updateData.emailDiscoveryConfidence = accepted.confidence;
          updateData.emailDiscoveredAt = new Date();
        }
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
    Sentry.captureException(error);
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

// Minimum confidence required for enrichment to STORE a discovered email.
// Aligned with the outreach send gate (>= 0.5). website_scrape (base 0.8) clears this
// comfortably even with both penalties; sale_description (base 0.55) clears it only when
// the domain matches the site (no -0.10 mismatch penalty), which is the intended behavior.
const ENRICHMENT_MIN_CONFIDENCE = 0.50;

/**
 * Gate a discovered email through the SAME rules the good path uses before storing it:
 *  1. reject null/generic (info@/admin@/…)
 *  2. reject wrong-entity: if the email domain != the org website domain AND shares no
 *     meaningful token with the business name, it's a wrong-entity guess — reject.
 *  3. compute confidence via the shared calibrateConfidence; reject below the store floor.
 * Returns { email, confidence } when acceptable, otherwise null (and logs the reason).
 */
function acceptDiscoveredEmail(
  email: string | null,
  source: DiscoverySource,
  baseConfidence: number,
  orgDomain: string | null,
  orgAddress: string | null,
  businessName: string | null,
  organizerId: string
): { email: string; confidence: number } | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();

  if (isGenericEmail(normalized)) {
    console.warn(`[Enrichment] Rejected generic email '${normalized}' for ${organizerId}`);
    return null;
  }

  const eDom = emailDomain(normalized);
  if (!eDom) {
    console.warn(`[Enrichment] Rejected malformed email '${normalized}' for ${organizerId}`);
    return null;
  }

  // Wrong-entity domain guard: email domain doesn't match the org website domain AND
  // doesn't share a token with the business name → reject (the guard the good path has).
  const eDomReg = registrableDomain(eDom) ?? eDom;
  const domainMatchesSite = orgDomain != null && eDomReg === orgDomain;
  if (!domainMatchesSite && !domainMatchesBusiness(eDomReg, businessName)) {
    console.warn(
      `[Enrichment] Rejected email '${normalized}' for ${organizerId} — domain '${eDomReg}' ` +
      `matches neither website domain '${orgDomain ?? 'none'}' nor business name '${businessName ?? ''}'`
    );
    return null;
  }

  const confidence = calibrateConfidence(baseConfidence, source, eDomReg, orgDomain, orgAddress);
  if (confidence < ENRICHMENT_MIN_CONFIDENCE) {
    console.warn(
      `[Enrichment] Discarded email '${normalized}' for ${organizerId} — confidence ` +
      `${confidence.toFixed(2)} below ${ENRICHMENT_MIN_CONFIDENCE}`
    );
    return null;
  }

  return { email: normalized, confidence };
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
  // Bare technical-mailbox exclusions; generic-mailbox (info@/admin@/…) rejection is
  // handled by isGenericEmail below so it matches the good-path filter exactly.
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
        if (email && !excluded.test(email) && !isGenericEmail(email)) return email;
      }

      // Priority 2: bare email addresses in page text
      bareEmailPattern.lastIndex = 0;
      while ((match = bareEmailPattern.exec(html)) !== null) {
        const email = match[1].trim().toLowerCase();
        // Skip asset paths that accidentally match the email pattern
        if (/\.(png|jpg|gif|js|css|svg|woff)/.test(email)) continue;
        if (!excluded.test(email) && !isGenericEmail(email)) return email;
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
        if (!excluded.test(email) && !isGenericEmail(email)) return email;
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

