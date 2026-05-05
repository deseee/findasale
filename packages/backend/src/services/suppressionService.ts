import { prisma } from '../lib/prisma';

/**
 * Suppression Service — manages email suppression list for outreach pipeline
 */

export const suppressionService = {
  async isSuppressed(email: string): Promise<boolean> {
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
    const suppressions = await prisma.emailSuppression.findMany({
      where: { emailAddress: { in: emailsLower } },
    });
    
    const suppressedSet = new Set<string>();
    for (const supp of suppressions) {
      if (supp.bounceHard || supp.optedOut || supp.complaintEmail || supp.bounceSoft) {
        suppressedSet.add(supp.emailAddress);
      }
    }
    
    const result = new Map<string, boolean>();
    for (const email of emailsLower) {
      result.set(email, suppressedSet.has(email));
    }
    return result;
  },
};
