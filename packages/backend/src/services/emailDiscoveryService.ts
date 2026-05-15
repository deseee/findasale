import { Prisma } from '@findasale/database';
import * as cheerio from 'cheerio';
import * as dns from 'dns';
import * as net from 'net';
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

interface SMTPVerifyResult {
  valid: boolean;
  reason?: string;
}

// Strict format validation — must match before any storage
const EMAIL_FORMAT_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

// Legacy extraction regex (permissive, for scraping raw text)
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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
]);

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
          const match = href.match(/mailto:([^?]*)/);
          if (match) emails.push(match[1]);
        }
      });

      // Extract emails from text content
      const text = $('body').text();
      const textEmails = text.match(EMAIL_REGEX) || [];
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
      // Silently continue to next path
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
 * Stage 3: SMTP Verification via MX lookup + RCPT TO
 * Do NOT send any actual email. Just check if server would accept.
 */
async function verifyEmailSMTP(
  email: string,
  domain: string,
  timeoutMs: number = 3000
): Promise<SMTPVerifyResult> {
  try {
    // Step 1: MX lookup
    const mxRecords = await dns.promises.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: 'no_mx_records' };
    }

    // Step 2: Connect to first MX server
    const mxHost = mxRecords[0].exchange;
    const socket = net.createConnection({ host: mxHost, port: 25 });

    // Set timeout
    socket.setTimeout(timeoutMs);

    return await new Promise<SMTPVerifyResult>((resolve) => {
      let state = 'connecting';
      let buffer = '';

      socket.on('data', (chunk) => {
        buffer += chunk.toString();

        if (state === 'connecting' && buffer.includes('220')) {
          // Got SMTP greeting
          state = 'greeting_received';
          socket.write(`MAIL FROM:<noreply@finda.sale>\r\n`);
          buffer = '';
        } else if (state === 'greeting_received' && buffer.includes('250')) {
          // MAIL FROM accepted
          state = 'mail_from_sent';
          socket.write(`RCPT TO:<${email}>\r\n`);
          buffer = '';
        } else if (state === 'mail_from_sent') {
          // Got RCPT response
          const rcptCode = parseInt(buffer.split('\n')[0]);
          socket.write('QUIT\r\n');
          socket.end();

          if (rcptCode === 250) {
            resolve({ valid: true });
          } else if ([550, 551, 552].includes(rcptCode)) {
            resolve({ valid: false, reason: `smtp_${rcptCode}` });
          } else {
            resolve({ valid: false, reason: `smtp_unknown_${rcptCode}` });
          }
        }
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ valid: false, reason: 'timeout' });
      });

      socket.on('error', () => {
        socket.destroy();
        resolve({ valid: false, reason: 'connection_error' });
      });

      socket.on('end', () => {
        // Connection closed unexpectedly
        if (state !== 'mail_from_sent') {
          resolve({ valid: false, reason: 'connection_closed' });
        }
      });
    });
  } catch (err) {
    return { valid: false, reason: `error_${(err as Error).message}` };
  }
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
        console.debug(`[emailDiscoveryService] Discarding ${bestEmail} — confidence ${confidence.toFixed(2)} below threshold`);
        return null;
      }
      await updateOrganizerEmail(organizerId, bestEmail, 'website_scrape', confidence);
      return bestEmail;
    }

    // Stage 2 & 3: Pattern generation + SMTP verification
    const patterns = generateEmailPatterns(organizer.businessName, domain);
    for (const email of patterns) {
      // Reject junk patterns before even attempting SMTP
      if (isJunkEmail(email)) continue;

      // Rate limit: 500ms between attempts
      await new Promise((r) => setTimeout(r, 500));

      const result = await verifyEmailSMTP(email, domain);
      if (result.valid) {
        const emailDomain = email.substring(email.indexOf('@') + 1).toLowerCase();
        const confidence = calibrateConfidence(
          0.75,
          'smtp_pattern',
          emailDomain,
          domain,
          organizer.address ?? null
        );
        if (confidence < MIN_CONFIDENCE_TO_STORE) {
          console.debug(`[emailDiscoveryService] Discarding ${email} — confidence ${confidence.toFixed(2)} below threshold`);
          continue;
        }
        await updateOrganizerEmail(organizerId, email, 'smtp_pattern', confidence);
        return email;
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
): 'website_scrape' | 'smtp_probe' | 'pattern_match' {
  if (source === 'website_scrape') return 'website_scrape';
  if (source === 'smtp_pattern') return 'smtp_probe';
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
    console.debug(`[emailDiscoveryService] Final gate discarded ${email} — confidence ${confidence.toFixed(2)} below ${MIN_CONFIDENCE_TO_STORE}`);
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
): Promise<{ processed: number; discovered: number }> {
  let cursor: string | undefined;
  let processed = 0;
  let discovered = 0;

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
        if (email) discovered++;
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

  return { processed, discovered };
}
