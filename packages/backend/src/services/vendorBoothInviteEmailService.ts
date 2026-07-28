/**
 * Vendor Booth Invite Email Service (2026-07-28)
 *
 * Sends the booth-claim invite to VendorBooth.vendorEmail. Fills the gap where an
 * organizer typed a vendor's email into the Add Booth form and nothing was ever
 * sent -- the only delivery path was the manual "Invite Link" clipboard button in
 * pages/organizer/hubs/[hubId]/vendor-booths.tsx (handleCopyInviteLink :237).
 *
 * Rail: Resend transactional (lib/transactionalEmailService.ts), same as
 * receiptService.sendBoothCartReceiptEmail and consignorEmailService. NOT the
 * Gmail/bulk rail -- a booth invite is a one-to-one operational message.
 *
 * Template: buildEmail() from emailTemplateService, same as consignorEmailService.
 * Sender: "The FindA.Sale Team" (CLAUDE.md brand voice rule) -- never a person.
 *
 * Fire-and-forget from createVendorBooth; awaited by the organizer resend endpoint.
 * Never throws: every failure path returns a reason string instead.
 */

import { buildEmail } from './emailTemplateService';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService } from './suppressionService';
import { prisma } from '../lib/prisma';

const FROM_EMAIL = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

/** Booth statuses whose claim link actually works. claimVendorBooth (vendorBoothController.ts)
 *  409s on anything else, and getPublicBoothSummary 404s on CANCELLED -- so an invite for a
 *  REJECTED or CANCELLED booth would send the vendor to a dead page. */
const CLAIMABLE_STATUSES = ['PENDING', 'CONFIRMED'];

/** Same implementation as jobs/outreachEmailsCron.ts escapeHtml. Vendor/hub/organizer
 *  names are organizer-typed free text and land inside an HTML email body. */
export const escapeHtml = (str: string): string => {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

export type BoothInviteResult = { sent: boolean; reason?: string };

/**
 * Send (or re-send) the claim invite for one booth.
 * Returns { sent: false, reason } rather than throwing, for every skip and every failure.
 */
export async function sendVendorBoothInviteEmail(boothId: string): Promise<BoothInviteResult> {
  try {
    const booth = await prisma.vendorBooth.findUnique({
      where: { id: boothId },
      select: {
        id: true,
        boothNumber: true,
        vendorName: true,
        vendorEmail: true,
        boothFee: true,
        revenueSharePercent: true,
        status: true,
        userId: true,
        deletedAt: true,
        boothToken: true,
        hub: { select: { name: true, organizer: { select: { businessName: true } } } },
      },
    });

    if (!booth) return { sent: false, reason: 'Booth not found' };
    if (booth.deletedAt) return { sent: false, reason: 'Booth has been removed' };
    if (!CLAIMABLE_STATUSES.includes(booth.status)) {
      return { sent: false, reason: `Booth status ${booth.status} cannot be claimed, so no invite was sent` };
    }
    if (booth.userId) return { sent: false, reason: 'Booth is already claimed' };
    if (!booth.vendorEmail) return { sent: false, reason: 'No vendor email on this booth' };

    // Recipient gate. isHardSuppressed covers hard bounces, complaints, AND the
    // isEmailDomainBlocked domain policy in suppressionService.ts -- which blocks the
    // whole finda.sale zone unless the address is in SENDABLE_FINDA_SALE_ADDRESSES.
    // An organizer typing a finda.sale address therefore gets a clear skip reason
    // instead of a silent no-op. transactionalEmailService re-checks this at the rail.
    if (await suppressionService.isHardSuppressed(booth.vendorEmail)) {
      console.log(`[booth-invite] Skipping blocked or suppressed address: ${booth.vendorEmail}`);
      return { sent: false, reason: 'That email address cannot be emailed by FindA.Sale' };
    }

    // Environment gate. transactionalEmailService returns without sending (and without
    // throwing) when RESEND_API_KEY is unset, so check it here too -- otherwise we would
    // stamp inviteSentAt for an email that never left the building.
    if (!process.env.RESEND_API_KEY) {
      console.error('[booth-invite] RESEND_API_KEY not set, invite NOT sent for booth', booth.id);
      return { sent: false, reason: 'Email is not configured on this server' };
    }

    const vendorName = escapeHtml(booth.vendorName);
    const boothNumber = escapeHtml(booth.boothNumber);
    const hubName = escapeHtml(booth.hub?.name || 'the market');
    const organizerName = escapeHtml(booth.hub?.organizer?.businessName || 'The market organizer');
    const claimUrl = `${FRONTEND_URL}/vendor-booth/${booth.boothToken}`;

    const boothFee = Number(booth.boothFee) || 0;
    const revenueShare = Number(booth.revenueSharePercent) || 0;

    // Real stored values only. The vendor is agreeing to these by claiming, so the
    // block is omitted entirely when both are zero rather than showing "$0.00 / 0%".
    const termsHtml =
      boothFee > 0 || revenueShare > 0
        ? `<p><strong>Your terms for this booth</strong></p>
        <ul>
          ${boothFee > 0 ? `<li>Booth rent: $${boothFee.toFixed(2)}</li>` : ''}
          ${revenueShare > 0 ? `<li>Revenue share: ${revenueShare}% of what sells at your booth</li>` : ''}
        </ul>
        <p>Claiming the booth means you agree to these terms with ${organizerName}. If they are not what you agreed to, talk to ${organizerName} before you claim.</p>`
        : '';

    const rentBullet =
      boothFee > 0 ? '<li>Set up auto-pay for your booth rent with a card, so you do not have to remember it</li>' : '';

    const html = buildEmail({
      preheader: `${organizerName} saved Booth ${boothNumber} for you at ${hubName}.`,
      headline: `Claim your booth at ${hubName}`,
      body: `<p>Hi ${vendorName},</p>
        <p>${organizerName} added you as a vendor at ${hubName} and saved Booth ${boothNumber} for you.</p>
        <p>Use the button below to claim it. You will be asked to log in or create a free FindA.Sale account first. Claiming links Booth ${boothNumber} to your account, so the sales rung up at your booth count as yours.</p>
        ${termsHtml}
        <p><strong>Once you claim the booth you can:</strong></p>
        <ul>
          <li>See the fees for this booth in one place</li>
          <li>Connect your Stripe account so card payments from your booth go straight to you</li>
          <li>See the total that sold at your booth in each period</li>
          ${rentBullet}
        </ul>
        <p>If the button does not work, copy this link into your browser:<br />${claimUrl}</p>
        <p>If you were not expecting this, you can ignore this email. Nothing happens until you claim the booth.</p>
        <p>The FindA.Sale Team</p>`,
      ctaText: `Claim Booth ${boothNumber}`,
      ctaUrl: claimUrl,
    });

    await transactionalEmailService.emails.send({
      from: FROM_EMAIL,
      to: booth.vendorEmail,
      subject: `Claim Booth ${booth.boothNumber} at ${booth.hub?.name || 'the market'}`,
      html,
    });

    // Observability: the answer to "did the invite go out?" is stored on the row and
    // surfaced in the organizer table. Stamped only after a send that did not throw.
    await prisma.vendorBooth.update({
      where: { id: booth.id },
      data: { inviteSentAt: new Date(), inviteSentCount: { increment: 1 } },
    });

    console.log(`[booth-invite] Invite sent to ${booth.vendorEmail} for booth ${booth.id}`);
    return { sent: true };
  } catch (error) {
    console.error(`[booth-invite] Failed to send booth invite email for booth ${boothId}:`, error);
    return { sent: false, reason: 'Could not send the invite email. Try again in a moment.' };
  }
}
