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
  padHtmlForTextExtraction,
  sanitizeEmailCandidate,
  isMalformedCandidate,
  extractEmailCandidatesFromText,
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
 *  2. hard-reject wrong-entity mega-brand/social/aggregator domains (Disney/Club33-style
 *     mis-attribution) — never acceptable regardless of confidence.
 *  3. compute confidence via the shared calibrateConfidence (which already applies a
 *     domain-mismatch penalty); reject below the store floor.
 * Returns { email, confidence } when acceptable, otherwise null (and logs the reason).
 *
 * S1186 (2026-08-04): step 2 used to be a HARD reject on any domain that didn't match the
 * org's website AND shared no business-name token (`domainMatchesBusiness`). That wrongly
 * discarded legitimate cases like a personal Gmail contact address published on an
 * otherwise-clearly-matching business website (e.g. easyestates.net → gexer878@gmail.com,
 * live-confirmed 2026-08-04) — part of the 80.3%→28.5% directory-scraper email collapse
 * since the 2026-06-22 gate. `emailDiscoveryService.ts`'s `discoverEmail()` (the daily
 * email-discovery cron) already handles the identical situation with only a soft
 * confidence penalty and has run that way in production the whole time — this brings the
 * one-time initial-enrichment path in line with the cron path already accepted as safe.
 * The mega-brand/social/aggregator hard-reject (step 2 here) is UNCHANGED and still
 * unconditional; only the plain "doesn't match, but isn't a known-bad domain either" case
 * moved from a hard reject to the existing confidence-penalty + floor.
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

  const eDomReg = registrableDomain(eDom) ?? eDom;

  // Hard reject: mega-brand / social / aggregator domain — never a real organizer's own
  // email regardless of confidence. Independent of the softer mismatch handling below.
  if (FAMOUS_UNRELATED_DOMAINS.has(eDomReg)) {
    console.warn(
      `[Enrichment] Rejected email '${normalized}' for ${organizerId} — domain '${eDomReg}' ` +
      `is a blocked mega-brand/social/aggregator host`
    );
    return null;
  }

  const confidence = calibrateConfidence(baseConfidence, source, eDomReg, orgDomain, orgAddress);
  if (confidence < ENRICHMENT_MIN_CONFIDENCE) {
    console.warn(
      `[Enrichment] Discarded email '${normalized}' for ${organizerId} — confidence ` +
      `${confidence.toFixed(2)} below ${ENRICHMENT_MIN_CONFIDENCE} ` +
      `(domain '${eDomReg}' vs website '${orgDomain ?? 'none'}')`
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
      // 2026-08-12 fix: decode URL-encoding before use — see decodeMailtoCandidate()
      // doc (leading %20 / fully percent-encoded hrefs were stored verbatim otherwise).
      mailtoPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = mailtoPattern.exec(html)) !== null) {
        const email = sanitizeEmailCandidate(match[1]).toLowerCase();
        if (!email || isMalformedCandidate(email)) continue;
        if (!excluded.test(email) && !isGenericEmail(email)) return email;
      }

      // Priority 2: bare email addresses in page text
      // 2026-08-12 fix: match against tag-padded text, not raw HTML — two elements
      // with no whitespace between their tags in the source markup (e.g. a phone
      // number directly next to an email) otherwise collapse into one glued string
      // that the local-part character class happily swallows whole. See
      // padHtmlForTextExtraction() doc.
      // 2026-08-16 fix: this path previously used its own /\b(...)\b/ regex. A `\b`
      // boundary does NOT stop a digit-run bleeding into a letter-run local part
      // ("209.232.2709hopechestthrift@…" matches it cleanly), so it was the weaker of
      // the two in-repo variants. Now delegates to the shared extractor that
      // emailDiscoveryService.scrapeWebsiteEmails() uses — decode + phone-noise strip +
      // structural malformed-candidate rejection, one implementation for all callers.
      const spacedForBareMatch = padHtmlForTextExtraction(html);
      for (const candidate of extractEmailCandidatesFromText(spacedForBareMatch)) {
        const email = candidate.toLowerCase();
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

    // 2026-08-16 fix (Blocked Queue Track A): this was the THIRD extraction path and
    // the one missed when the same bug was fixed in emailDiscoveryService.scrapeWebsiteEmails()
    // and scrapeWebsiteForEmail() on 2026-08-12. It had BOTH live failure modes:
    //   1. no URL-decode — a `mailto:%20kiro@barrettfinancial.com` in a scraped listing
    //      description was stored verbatim (the `%` is inside the local-part character
    //      class, so it matched and passed straight through);
    //   2. a /\b(...)\b/ regex with no boundary guard — `\b` sits happily between a
    //      digit-run and a letter-run, so an adjacent phone number glues onto the local
    //      part ("209.232.2709hopechestthrift@hospiceheart.org"). Scraped descriptions are
    //      concatenated-markup text, which is exactly where that happens.
    // Now runs the identical decode + boundary + structural logic as the other two paths.
    const mailtoPattern = /mailto:([^"'?#\s>)\]]+)/gi;
    const excluded = /noreply|no-reply|donotreply|bounce|example\.com/i;

    for (const sale of sales) {
      if (!sale.description) continue;

      // Priority 1: explicit mailto: links embedded in the description markup
      mailtoPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = mailtoPattern.exec(sale.description)) !== null) {
        const email = sanitizeEmailCandidate(match[1]).toLowerCase();
        if (!email || isMalformedCandidate(email)) continue;
        if (!excluded.test(email) && !isGenericEmail(email)) return email;
      }

      // Priority 2: bare addresses in the description text. Tag-pad first — descriptions
      // are scraped verbatim and routinely carry inline markup, so two adjacent elements'
      // text can otherwise collapse into one glued string before the regex runs.
      const padded = padHtmlForTextExtraction(sale.description);
      for (const candidate of extractEmailCandidatesFromText(padded)) {
        const email = candidate.toLowerCase();
        if (/\.(png|jpg|gif|js|css|svg|woff)/.test(email)) continue;
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

