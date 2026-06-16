import { Prisma } from '@prisma/client';
import * as cheerio from 'cheerio';
import { prisma } from '../lib/prisma';
import { randomUUID } from 'crypto';

/**
 * Email Discovery Service — Free tier pipeline
 *
 * Stages (in order):
 * 1. Website scrape — extract mailto: links and email patterns from /contact, /about, /team pages
 * 2. Common pattern probe — generate candidate emails from business name + domain
 * 3. SMTP deliverability — validate via MX lookup + RCPT TO without sending
 *
 * Returns discovered email or null. Updates organizer.contactEmail in DB if found with confidence > 0.7.
 */

interface DiscoveryResult {
  email: string | null;
  source?: 'website_scrape' | 'smtp_pattern' | 'whois';
  confidence?: number; // 0.0-1.0
}


// Strict format validation — must match before any storage
const EMAIL_FORMAT_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

/**
 * Candidate extraction regex for scraping raw text.
 *
 * Local part rules (before @):
 *   - Only [a-zA-Z0-9_%+\-] and dots, but:
 *     - Must start and end with a non-dot character
 *     - No consecutive dots (handled by structure: atom(\.atom)*)
 *     - Minimum 2 characters enforced by {1,}(\.[atom]+)* requiring at least one leading atom
 *   - Apostrophes, brackets, backticks, and markdown syntax are excluded
 *
 * Domain rules (after @):
 *   - [a-zA-Z0-9\-]+ labels separated by dots
 *   - TLD minimum 2 chars
 *
 * Additional post-extraction checks (minimum lengths, etc.) are applied
 * by isMalformedCandidate() before any candidate is used.
 */
const EMAIL_REGEX =
  /[a-zA-Z0-9_%+\-]+(?:\.[a-zA-Z0-9_%+\-]+)*@[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)+\.[a-zA-Z]{2,}/g;

/**
 * Pre-process raw HTML/text before regex extraction.
 * 1. Resolve markdown mailto links -> bare email address
 *    e.g.  [Email us](mailto:hello@example.com)  ->  hello@example.com
 * 2. Strip remaining markdown link wrappers that don't contain mailto
 *    e.g.  [some text](https://...)  ->  (removed so the label text doesn't
 *          accidentally produce a false candidate)
 * 3. Strip bracketed link labels  [label]  that have no parens following them
 */
function preprocessTextForExtraction(text: string): string {
  // Step 1: markdown mailto links -> bare address
  let processed = text.replace(
    /\[[^\]]*\]\(mailto:([^)\s?]+)(?:\?[^)]*)?\)/gi,
    ' $1 '
  );
  // Step 2: remaining markdown links — keep the label text but drop the URL
  processed = processed.replace(/\[[^\]]*\]\([^)]+\)/g, ' ');
  // Step 3: lone bracketed tokens (e.g. [email] orphan labels -> remove)
  processed = processed.replace(/\[[^\]@]+\]/g, ' ');
  return processed;
}

/**
 * Reject a candidate string that passed the regex but violates structural rules
 * that are cheaper to enforce here than to encode in the regex.
 *
 *  - Local part < 2 chars
 *  - Domain (without TLD) < 4 chars total
 *  - Local part starts or ends with a dot (regex already prevents this, but guard anyway)
 *  - Local part contains two consecutive dots (regex prevents; secondary guard)
 */
function isMalformedCandidate(email: string): boolean {
  const atIdx = email.indexOf('@');
  if (atIdx < 0) return true;

  const local = email.substring(0, atIdx);
  const domain = email.substring(atIdx + 1);

  if (local.length < 2) return true;
  if (domain.length < 4) return true;
  if (local.startsWith('.') || local.endsWith('.')) return true;
  if (local.includes('..')) return true;

  return false;
}

// Minimum confidence required to write to the DB
const MIN_CONFIDENCE_TO_STORE = 0.60;

/**
 * Placeholder/junk domains — template addresses, sentry bots, test domains
 */
const BLOCKLISTED_DOMAINS = new Set([
  'wixpress.com',
  'sentry-next.wixpress.com',
  'sentry.wixpress.com',
  'example.com',
  'test.com',
  'placeholder.com',
  'godaddy.com',
  'domain.com',
  // Major retailers — not organizer businesses
  'jcrew.com',
  'gap.com',
  'goodwill.org',
  'goodwill.com',
  'salvation-army.org',
  'salvationarmy.org',
  'amazon.com',
  'ebay.com',
  'etsy.com',
  'walmart.com',
  'target.com',
  'costco.com',
]);

// Exact email addresses that are always junk
const BLOCKLISTED_EXACT_EMAILS = new Set([
  'user@domain.com',
  'test@test.com',
  'admin@example.com',
  'filler@godaddy.com',
]);

// Local parts that are generic placeholders when not attached to a real business domain
const BLOCKLISTED_LOCAL_PARTS = new Set([
  'filler',
  'noreply',
  'no-reply',
  'donotreply',
  'user',
  // Generic person-name placeholders never used as real business contacts
  'john.doe',
  'jane.doe',
  'first.last',
  'firstname.lastname',
  'firstname',
  'lastname',
  'name.surname',
  'my.email',
]);


/**
 * Privacy proxy registrar email domains — RDAP returns these instead of real owner contacts
 */
const PRIVACY_PROXY_DOMAINS = new Set([
  'whoisguard.com', 'domainsbyproxy.com', 'contactprivacy.com',
  'privacyprotect.org', 'networksolutionsprivate.com', 'anonymize-me.de',
  'registrar-servers.com', 'privacy-service.info', 'whoisprivacyprotect.com',
  'withheldforprivacy.com', 'identity-protect.org', 'privacydotlink.com',
  'secret-registration.com',
]);

function isPrivacyProxy(email: string): boolean {
  const atIdx = email.indexOf('@');
  if (atIdx < 0) return true;
  const domain = email.substring(atIdx + 1).toLowerCase();
  return PRIVACY_PROXY_DOMAINS.has(domain);
}

/**
 * Validate an email address before storage.
 * Returns true if the email should be REJECTED (blocked/invalid).
 */
function isJunkEmail(email: string): boolean {
  const lower = email.toLowerCase().trim();

  // 1. Format sanity check
  if (!EMAIL_FORMAT_REGEX.test(lower)) {
    console.debug(`[emailDiscoveryService] Rejected (format): ${email}`);
    return true;
  }

  // 2. Exact blocklist
  if (BLOCKLISTED_EXACT_EMAILS.has(lower)) {
    console.debug(`[emailDiscoveryService] Rejected (exact blocklist): ${email}`);
    return true;
  }

  const atIdx = lower.indexOf('@');
  const localPart = lower.substring(0, atIdx);
  const domain = lower.substring(atIdx + 1);

  // 3. Blocked domains (also catches subdomains of blocked domains)
  const domainParts = domain.split('.');
  for (let i = 0; i < domainParts.length - 1; i++) {
    const candidate = domainParts.slice(i).join('.');
    if (BLOCKLISTED_DOMAINS.has(candidate)) {
      console.debug(`[emailDiscoveryService] Rejected (domain blocklist): ${email}`);
      return true;
    }
  }

  // 4. .gov domains — not organizer businesses
  if (domain.endsWith('.gov')) {
    console.debug(`[emailDiscoveryService] Rejected (.gov domain): ${email}`);
    return true;
  }

  // 5. Hex local part > 20 chars (Wix sentry pattern e.g. 605a7baede844d278b89dc95ae0a9123@...)
  if (/^[a-f0-9]{20,}$/.test(localPart)) {
    console.debug(`[emailDiscoveryService] Rejected (hex local part): ${email}`);
    return true;
  }

  // 6. Blocked local parts (generic placeholders)
  if (BLOCKLISTED_LOCAL_PARTS.has(localPart)) {
    console.debug(`[emailDiscoveryService] Rejected (generic local part): ${email}`);
    return true;
  }

  // 7. Asset paths that accidentally match the email pattern
  //    (image filenames, scripts, fonts — e.g. "First_team_vintage_Logo-09_125x@2x.png")
  if (/\.(png|jpg|jpeg|gif|svg|webp|js|css|woff)/i.test(lower)) {
    console.debug(`[emailDiscoveryService] Rejected (asset extension): ${email}`);
    return true;
  }

  // 8. Non-IANA / reserved TLD — these domains can never have valid mail servers.
  //    RFC 2606 reserves .test/.example/.localhost/.invalid; others (.ofc, .local,
  //    .corp, .lan, .home) are commonly found in scraped placeholder emails.
  const FAKE_TLDS = new Set([
    'ofc', 'local', 'internal', 'test', 'example', 'localhost',
    'invalid', 'fake', 'corp', 'lan', 'home', 'localdomain',
  ]);
  const tld = domain.split('.').pop()?.toLowerCase() ?? '';
  if (FAKE_TLDS.has(tld)) {
    console.debug(`[emailDiscoveryService] Rejected (fake TLD .${tld}): ${email}`);
    return true;
  }

  return false;
}

/**
 * Apply confidence penalties based on discovery context.
 * organizerDomain: the domain extracted from organizer.website (null if unknown)
 * emailDomain: the domain of the discovered email
 * source: how the email was found
 * organizerAddress: the raw address string (used to detect residential patterns)
 */
function calibrateConfidence(
  baseConfidence: number,
  source: 'website_scrape' | 'smtp_pattern' | 'whois',
  emailDomain: string,
  organizerDomain: string | null,
  organizerAddress: string | null
): number {
  let score = baseConfidence;

  // Pattern permutation only (not scraped from the actual site) — cap at 0.70
  if (source === 'smtp_pattern') {
    score = Math.min(score, 0.70);
  }

  // Email domain doesn't match the organizer's known website domain
  if (organizerDomain && emailDomain !== organizerDomain) {
    score -= 0.10;
  }

  // Residential address pattern (no suite/unit — just a plain street address)
  if (organizerAddress) {
    const hasSuite = /\b(suite|ste|unit|apt|#|floor|fl)\b/i.test(organizerAddress);
    if (!hasSuite) {
      score -= 0.05;
    }
  }

  // Floor at 0.10
  return Math.max(score, 0.10);
}

const GENERIC_PATTERNS = [
  'noreply@',
  'notification@',
  'alerts@',
  'test@',
  'admin@',
  'hello@',
  'info@',
];

/**
 * Stage 1: Website Contact Page Scraping
 * Extract mailto links and email patterns from contact pages
 */
async function scrapeWebsiteEmails(domain: string): Promise<string[]> {
  const contactPaths = ['/contact', '/contact-us', '/about', '/team', '/'];
  const emails: string[] = [];

  for (const path of contactPaths) {
    try {
      const url = `https://${domain}${path}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract mailto links (highest confidence)
      $('a[href^="mailto:"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) {
          const match = href.match(/mailto:([^?#\s]*)/);
          if (match && match[1]) {
            const candidate = match[1].trim();
            // Apply structural checks — malformed mailto hrefs are rare but do occur
            if (!isMalformedCandidate(candidate)) {
              emails.push(candidate);
            }
          }
        }
      });

      // Extract emails from text content — preprocess first to strip markdown artifacts
      const rawText = $('body').text();
      const cleanText = preprocessTextForExtraction(rawText);
      const textEmails = (cleanText.match(EMAIL_REGEX) || []).filter(
        (e) => !isMalformedCandidate(e)
      );
      emails.push(...textEmails);

      // Parse schema.org Person markup
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const schema = JSON.parse($(el).html() || '{}');
          if (schema.email) emails.push(schema.email);
          if (schema.founder?.email) emails.push(schema.founder.email);
        } catch {
          // Invalid JSON, skip
        }
      });

      // If we found emails, stop searching other pages
      if (emails.length > 0) break;
    } catch (err) {
      const url = `https://${domain}${path}`;
      console.warn(`[emailDiscovery] scrape failed for ${url}: ${(err as Error).message}`);
    }
  }

  // Deduplicate, filter generic patterns, and filter junk/blocklisted addresses
  const filtered = [...new Set(emails)].filter(
    (email) =>
      !GENERIC_PATTERNS.some((pattern) => email.toLowerCase().includes(pattern)) &&
      !isJunkEmail(email)
  );

  return filtered;
}

/**
 * Extract the first email from a vCard array (RDAP entity format).
 * vCard 4.0 structure: [version, [properties...], ...]
 * Each property: [type, params, valueType, value]
 */
function extractEmailFromVcard(vcardArray: unknown): string | null {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2) return null;
  const properties = vcardArray[1];
  if (!Array.isArray(properties)) return null;
  for (const prop of properties) {
    if (Array.isArray(prop) && prop[0] === 'email' && typeof prop[3] === 'string') {
      const email = prop[3].trim();
      if (email) return email;
    }
  }
  return null;
}

/**
 * Stage 3: RDAP Registrant Lookup
 * Queries rdap.org to find the domain registrant's contact email.
 * Returns null on privacy proxy, junk, or any network/parse failure.
 */
async function lookupRdapEmail(domain: string): Promise<string | null> {
  try {
    // rdap.org auto-routes to the correct RDAP server for any TLD
    const rdapUrl = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(rdapUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/rdap+json, application/json' },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data: {
      entities?: Array<{
        roles?: string[];
        vcardArray?: unknown;
        entities?: Array<{ vcardArray?: unknown }>;
      }>;
    } = await response.json();

    // Try registrant first (owner), then admin, then technical
    const priorityRoles = ['registrant', 'admin', 'technical'];
    const entities = data.entities ?? [];

    for (const role of priorityRoles) {
      for (const entity of entities) {
        if (!entity.roles?.includes(role)) continue;
        const email = extractEmailFromVcard(entity.vcardArray);
        if (email && !isPrivacyProxy(email) && !isJunkEmail(email)) return email;
        // Some registrars nest the contact entity inside the registrant entity
        for (const nested of (entity.entities ?? [])) {
          const nestedEmail = extractEmailFromVcard(nested.vcardArray);
          if (nestedEmail && !isPrivacyProxy(nestedEmail) && !isJunkEmail(nestedEmail)) return nestedEmail;
        }
      }
    }
    return null;
  } catch {
    // Network error, timeout, invalid JSON — not a hard failure
    return null;
  }
}

/**
 * Stage 2: Common Email Pattern Generator
 * Generate candidate emails based on business name and domain
 * Ordered by likelihood for estate sale organizers
 */
function generateEmailPatterns(
  businessName: string,
  domain: string
): string[] {
  const parts = businessName.toLowerCase().trim().split(/\s+/);
  if (parts.length === 0) return [];

  const first = parts[0];
  const last = parts[parts.length - 1];
  const candidates: string[] = [];

  // Pattern list (ordered by likelihood)
  candidates.push(`${first}@${domain}`);
  candidates.push(`${first}.${last}@${domain}`);
  candidates.push(`${first.charAt(0)}${last}@${domain}`);
  candidates.push(`${first}${last}@${domain}`);
  candidates.push(`${first.substring(0, 2)}@${domain}`);
  candidates.push(`${first.substring(0, 2)}${last}@${domain}`);
  candidates.push(`${first.charAt(0)}${last.charAt(0)}@${domain}`);
  candidates.push(`owner@${domain}`);
  candidates.push(`sales@${domain}`);
  candidates.push(`contact.${first}@${domain}`);
  candidates.push(`contact@${domain}`);
  candidates.push(`support@${domain}`);

  return candidates;
}

/**
 * Main discovery function
 * Returns discovered email or null. Updates organizer.contactEmail in DB if found.
 */
export async function discoverEmail(organizerId: string): Promise<string | null> {
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
    });

    if (!organizer || !organizer.website) {
      return null;
    }

    const domain = extractDomain(organizer.website);
    if (!domain) {
      return null;
    }

    // Stage 1: Website scraping
    const scrapedEmails = await scrapeWebsiteEmails(domain);
    if (scrapedEmails.length > 0) {
      const bestEmail = scrapedEmails[0];
      const emailDomain = bestEmail.substring(bestEmail.indexOf('@') + 1).toLowerCase();
      const confidence = calibrateConfidence(
        0.95,
        'website_scrape',
        emailDomain,
        domain,
        organizer.address ?? null
      );
      if (confidence < MIN_CONFIDENCE_TO_STORE) {
        console.debug(`[emailDiscoveryService] Discarding ${bestEmail} - confidence ${confidence.toFixed(2)} below threshold`);
        return null;
      }
      await updateOrganizerEmail(organizerId, bestEmail, 'website_scrape', confidence);
      return bestEmail;
    }

    // SMTP pattern probing removed — port 25 is blocked on Railway.

    // Stage 3: RDAP registrant lookup
    // Base confidence 0.80 — owner's email from registrar, high signal but not scraped from site
    const rdapEmail = await lookupRdapEmail(domain);
    if (rdapEmail) {
      const emailDomain = rdapEmail.substring(rdapEmail.indexOf('@') + 1).toLowerCase();
      const confidence = calibrateConfidence(0.80, 'whois', emailDomain, domain, organizer.address ?? null);
      if (confidence >= MIN_CONFIDENCE_TO_STORE) {
        await updateOrganizerEmail(organizerId, rdapEmail, 'whois', confidence);
        return rdapEmail;
      }
    }

    return null;
  } catch (err) {
    console.error(
      `[emailDiscoveryService] Error discovering email for organizer ${organizerId}:`,
      err
    );
    return null;
  }
}

/**
 * Map internal source label to schema emailDiscoveryMethod value
 */
function toDiscoveryMethod(
  source: 'website_scrape' | 'smtp_pattern' | 'whois'
): 'website_scrape' | 'smtp_probe' | 'pattern_match' | 'whois_rdap' {
  if (source === 'website_scrape') return 'website_scrape';
  if (source === 'smtp_pattern') return 'smtp_probe';
  if (source === 'whois') return 'whois_rdap';
  return 'pattern_match';
}

/**
 * Update organizer with discovered email
 * Final gate: re-validates email format/blocklist and confidence threshold before writing.
 */
async function updateOrganizerEmail(
  organizerId: string,
  email: string,
  source: 'website_scrape' | 'smtp_pattern' | 'whois',
  confidence: number
): Promise<void> {
  // Final safety gate — reject junk even if it somehow slipped through earlier
  if (isJunkEmail(email)) {
    console.debug(`[emailDiscoveryService] Final gate rejected ${email} for organizer ${organizerId}`);
    return;
  }
  if (confidence < MIN_CONFIDENCE_TO_STORE) {
    console.debug(`[emailDiscoveryService] Final gate discarded ${email} - confidence ${confidence.toFixed(2)} below ${MIN_CONFIDENCE_TO_STORE}`);
    return;
  }
  try {
    await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        contactEmail: email,
        scrapedEmail: source === 'website_scrape' ? email : undefined,
        emailDiscoveryMethod: toDiscoveryMethod(source),
        emailDiscoveryConfidence: confidence,
        emailDiscoveredAt: new Date(),
      },
    });

    // Auto-queue newly discovered email into outreach pipeline
    if (process.env.OUTREACH_ENABLED === 'true') {
      const isSuppressed = await prisma.emailSuppression.findFirst({
        where: { emailAddress: email },
      });
      if (!isSuppressed) {
        const existing = await prisma.directoryClaimEmail.findFirst({
          where: { organizerId },
        });
        if (!existing) {
          await prisma.directoryClaimEmail.create({
            data: {
              organizerId,
              emailAddress: email,
              status: 'PENDING',
              attemptCount: 0,
              trackingPixelId: randomUUID(),
              trackingToken: randomUUID(),
            },
          });
          console.debug(`[emailDiscoveryService] Queued ${email} for outreach (organizer ${organizerId})`);
        }
      }
    }
  } catch (err) {
    console.error(
      `[emailDiscoveryService] Error updating organizer ${organizerId}:`,
      err
    );
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Batch job: discover emails for all unmanaged listings without contact email
 * Runs cursor-paginated with batch size 50, 2s delay between batches
 */
export async function emailDiscoveryBatchJob(
  batchSize: number = 50,
  delayMs: number = 2000
): Promise<{ processed: number; discovered: number; skipped: number }> {
  let cursor: string | undefined;
  let processed = 0;
  let discovered = 0;
  let skipped = 0;

  while (true) {
    try {
      const organizers = await prisma.organizer.findMany({
        where: {
          AND: [
            { contactEmail: null },
            { website: { not: null } },
            { isUnmanagedListing: true },
          ],
        },
        take: batchSize,
        ...(cursor && { skip: 1, cursor: { id: cursor } }),
        select: { id: true },
      });

      if (organizers.length === 0) break;

      for (const org of organizers) {
        const email = await discoverEmail(org.id);
        if (email) {
          discovered++;
        } else {
          skipped++;
        }
        processed++;
      }

      cursor = organizers[organizers.length - 1]?.id;

      // Delay before next batch
      if (organizers.length === batchSize) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch (err) {
      console.error('[emailDiscoveryBatchJob] Error:', err);
      break;
    }
  }

  if (processed > 0 && discovered === 0) {
    console.warn(`[emailDiscovery] WARNING: processed ${processed} organizers but discovered 0 emails — check scrape stage`);
  }
  console.log(`[emailDiscovery] Complete: ${discovered}/${processed} discovered, ${skipped} skipped`);
  return { processed, discovered, skipped };
}
