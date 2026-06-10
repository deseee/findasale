import { prisma } from '../lib/prisma';

/**
 * Suppression Service — manages email suppression list for outreach pipeline
 */

/**
 * Competitor and blocked domains — all email (transactional AND outreach) to
 * these domains is hard-blocked at every send point. Add domains in lowercase.
 * No wildcards needed — exact domain match against the @-suffix.
 */
export const BLOCKED_DOMAINS: ReadonlySet<string> = new Set([
  'estatesales.net', // EstateSales.NET — direct competitor
  'estatesales.org', // EstateSales.ORG — same network
]);

/**
 * Placeholder / never-real-inbox domains. These addresses never reach a real
 * mailbox (e.g. scraped-organizer placeholders like scraper+slug@system.finda.sale,
 * which has no mail server). Sending to them produces delay/bounce DSN floods that
 * damage sender reputation. Mirrors the seeders' PLACEHOLDER_DOMAINS list.
 * `.wixpress.com` is handled as a suffix in isEmailDomainBlocked (Wix placeholder addrs).
 */
export const UNSENDABLE_DOMAINS: ReadonlySet<string> = new Set([
  'system.finda.sale',
  'domain.com',
  'domain.org',
  'domain.net',
  'example.com',
  'example.org',
  'example.net',
  'yourdomain.com',
  'yourdomain.org',
  'yourdomain.net',
  'test.com',
  'test.org',
]);

/**
 * Internal finda.sale addresses we DO legitimately send to (e.g. the contact-form
 * support inbox). Everything else in the finda.sale zone is blocked below.
 */
const SENDABLE_INTERNAL_ALLOWLIST: ReadonlySet<string> = new Set(
  [
    process.env.SUPPORT_EMAIL || 'support@finda.sale',
    // Extra internal finda.sale inboxes we DO send to — comma-separated env, e.g.
    // SENDABLE_FINDA_SALE_ADDRESSES="info@finda.sale,patrick@finda.sale"
    ...(process.env.SENDABLE_FINDA_SALE_ADDRESSES || '').split(','),
  ].map(s => s.trim().toLowerCase()).filter(Boolean),
);

/**
 * Returns true if we must NOT send to this address. Synchronous — no DB call.
 * Blocks our own finda.sale zone (no real user has an @finda.sale address — these are
 * scraped placeholders / internal-only), competitor domains, and placeholder domains.
 * Exception: SENDABLE_INTERNAL_ALLOWLIST (e.g. the contact-form support inbox).
 */
export function isEmailDomainBlocked(email: string): boolean {
  const e = email.toLowerCase().trim();
  const atIndex = e.lastIndexOf('@');
  if (atIndex === -1) return false;
  if (SENDABLE_INTERNAL_ALLOWLIST.has(e)) return false;
  const domain = e.slice(atIndex + 1);
  // Never email our own domain zone (S937 — placeholder/bounce-flood guard).
  if (domain === 'finda.sale' || domain.endsWith('.finda.sale')) return true;
  if (BLOCKED_DOMAINS.has(domain)) return true;
  if (UNSENDABLE_DOMAINS.has(domain)) return true;
  if (domain.endsWith('.wixpress.com')) return true;
  return false;
}

export const suppressionService = {
  async isSuppressed(email: string): Promise<boolean> {
    // Domain-level block — no DB call needed
    if (isEmailDomainBlocked(email)) return true;

    const suppression = await prisma.emailSuppression.findUnique({
      where: { emailAddress: email.toLowerCase() },
    });

    if (!suppression) return false;
    if (suppression.bounceHard) return true;
    if (suppression.optedOut) return true;
    if (suppression.complaintEmail) return true;
    if (suppression.bounceSoft) return true;
    return false;
  },

  async isHardSuppressed(email: string): Promise<boolean> {
    // Transactional guard: blocked-domain + hard bounce + complaint ONLY.
    // Deliberately ignores opt-out and soft-bounce — a user who unsubscribed from
    // marketing must still receive receipts/confirmations they are entitled to.
    if (isEmailDomainBlocked(email)) return true;
    const s = await prisma.emailSuppression.findUnique({ where: { emailAddress: email.toLowerCase() } });
    if (!s) return false;
    return Boolean(s.bounceHard || s.complaintEmail);
  },

  async addSuppression(
    email: string,
    reason: 'hard_bounce' | 'soft_bounce' | 'complaint' | 'opted_out' | 'manual',
    metadata?: { organizerId?: string; touchNumber?: number; resendEventId?: string }
  ): Promise<void> {
    const emailLower = email.toLowerCase();
    const update: any = { suppressionReason: reason };

    if (reason === 'hard_bounce') update.bounceHard = true;
    if (reason === 'soft_bounce') update.bounceSoft = new Date();
    if (reason === 'complaint') update.complaintEmail = new Date();
    if (reason === 'opted_out') update.optedOut = new Date();

    if (metadata?.organizerId) update.relatedOrganizerId = metadata.organizerId;
    if (metadata?.touchNumber) update.relatedTouchNumber = metadata.touchNumber;
    if (metadata?.resendEventId) {
      update.resendEventId = metadata.resendEventId;
      update.resendTimestamp = new Date();
    }

    await prisma.emailSuppression.upsert({
      where: { emailAddress: emailLower },
      create: { emailAddress: emailLower, suppressedAt: new Date(), ...update },
      update,
    });
  },

  async processBounce(email: string, type: 'hard' | 'soft'): Promise<void> {
    const reason = type === 'hard' ? 'hard_bounce' : 'soft_bounce';
    await suppressionService.addSuppression(email, reason);
  },

  async processComplaint(email: string): Promise<void> {
    await suppressionService.addSuppression(email, 'complaint');
  },

  async processOptOut(email: string): Promise<void> {
    await suppressionService.addSuppression(email, 'opted_out');
    await prisma.directoryClaimEmail.updateMany({
      where: { emailAddress: email.toLowerCase() },
      data: { status: 'OPTED_OUT' },
    });
  },

  async checkMultiple(emails: string[]): Promise<Map<string, boolean>> {
    const emailsLower = emails.map(e => e.toLowerCase());

    // Pre-filter: domain-blocked addresses never need a DB call
    const result = new Map<string, boolean>();
    const needsDbCheck: string[] = [];
    for (const email of emailsLower) {
      if (isEmailDomainBlocked(email)) {
        result.set(email, true);
      } else {
        needsDbCheck.push(email);
        result.set(email, false); // default; may be overwritten below
      }
    }

    if (needsDbCheck.length === 0) return result;

    const suppressions = await prisma.emailSuppression.findMany({
      where: { emailAddress: { in: needsDbCheck } },
    });

    for (const supp of suppressions) {
      if (supp.bounceHard || supp.optedOut || supp.complaintEmail || supp.bounceSoft) {
        result.set(supp.emailAddress, true);
      }
    }

    return result;
  },

  /**
   * Hard-only batch suppression check — the rail-level floor enforced by BOTH
   * email rails (Resend transactional + Gmail). IDENTICAL structure to
   * checkMultiple() EXCEPT the DB predicate is hard-only: a recipient is blocked
   * only if its domain is blocked (finda.sale zone, competitors, placeholders) OR
   * its EmailSuppression row has bounceHard || complaintEmail. Deliberately ignores
   * optedOut and bounceSoft — those are marketing-only signals and must NOT block
   * transactional mail (receipts, resets, payouts a user is entitled to).
   */
  async checkMultipleHard(emails: string[]): Promise<Map<string, boolean>> {
    const emailsLower = emails.map(e => e.toLowerCase());

    // Pre-filter: domain-blocked addresses never need a DB call
    const result = new Map<string, boolean>();
    const needsDbCheck: string[] = [];
    for (const email of emailsLower) {
      if (isEmailDomainBlocked(email)) {
        result.set(email, true);
      } else {
        needsDbCheck.push(email);
        result.set(email, false); // default; may be overwritten below
      }
    }

    if (needsDbCheck.length === 0) return result;

    const suppressions = await prisma.emailSuppression.findMany({
      where: { emailAddress: { in: needsDbCheck } },
    });

    for (const supp of suppressions) {
      if (supp.bounceHard || supp.complaintEmail) {
        result.set(supp.emailAddress, true);
      }
    }

    return result;
  },
};
