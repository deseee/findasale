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
 * Returns true if the email's domain is in BLOCKED_DOMAINS.
 * Synchronous — no DB call required.
 */
export function isEmailDomainBlocked(email: string): boolean {
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return false;
  const domain = email.slice(atIndex + 1).toLowerCase();
  return BLOCKED_DOMAINS.has(domain);
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
};
