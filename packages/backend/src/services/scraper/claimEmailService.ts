import { Resend } from 'resend';
import { prisma } from '../../lib/prisma';
import { buildEmail } from '../emailTemplateService';

let _resend: any = null;
const getResendClient = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    try {
      _resend = new Resend(process.env.RESEND_API_KEY);
    } catch {
      _resend = null;
    }
  }
  return _resend;
};

const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@finda.sale';
const siteUrl = process.env.FRONTEND_URL || 'https://finda.sale';

/**
 * D-073-B: 3-touch Day 1/3/7 sequence to unmanaged organizers
 * Sends claim emails daily, cycling through touch 1, 2, 3 based on last send date
 */
export const sendClaimEmailBatch = async (): Promise<void> => {
  // Gate: check if claim email is enabled
  if (process.env.CLAIM_EMAIL_ENABLED !== 'true') {
    console.log('[ClaimEmail] Disabled (set CLAIM_EMAIL_ENABLED=true to enable)');
    return;
  }

  const resend = getResendClient();
  if (!resend) {
    console.warn('[ClaimEmail] Resend not configured, skipping batch');
    return;
  }

  try {
    console.log('[ClaimEmail] Starting batch send');

    // Find unmanaged organizers eligible for claim emails
    const eligibleOrganizers = await prisma.organizer.findMany({
      where: {
        // Only unmanaged/imported listings
        isUnmanagedListing: true,
        // Has not been claimed yet
        isClaimed: false,
        // Must have a user with email
        user: {
          email: { not: null },
        },
      },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
        claimEmails: {
          select: {
            touchNumber: true,
            sentAt: true,
          },
          orderBy: { sentAt: 'desc' },
        },
      },
      take: 50, // Batch size limit to respect Resend rate limits
    });

    console.log(`[ClaimEmail] Found ${eligibleOrganizers.length} eligible unmanaged organizers`);

    let sent = 0;
    let failed = 0;

    for (const organizer of eligibleOrganizers) {
      const email = organizer.user?.email;
      const name = organizer.user?.name || organizer.businessName || 'there';

      if (!email) {
        console.warn(`[ClaimEmail] Organizer ${organizer.id} has no email, skipping`);
        continue;
      }

      try {
        // Determine which touch to send
        const lastEmail = organizer.claimEmails[0];
        const now = new Date();

        // Determine next touch number
        let touchNumber = 1;
        if (lastEmail) {
          const daysSinceLastEmail = (now.getTime() - lastEmail.sentAt.getTime()) / (1000 * 60 * 60 * 24);

          if (lastEmail.touchNumber === 1 && daysSinceLastEmail >= 3) {
            touchNumber = 2; // Send touch 2 on day 3+
          } else if (lastEmail.touchNumber === 2 && daysSinceLastEmail >= 4) {
            touchNumber = 3; // Send touch 3 on day 7+
          } else if (lastEmail.touchNumber === 3) {
            // All touches sent, skip this organizer
            continue;
          } else {
            // Not enough time has passed since last email
            continue;
          }
        }

        // Check if this touch has already been sent (unique constraint)
        const existingEmail = await prisma.organizerClaimEmail.findUnique({
          where: {
            organizerId_touchNumber: {
              organizerId: organizer.id,
              touchNumber,
            },
          },
        });

        if (existingEmail) {
          console.log(`[ClaimEmail] Touch ${touchNumber} already sent to ${organizer.id}, skipping`);
          continue;
        }

        // Get email content based on touch number
        const emailContent = getEmailContent(touchNumber, name, organizer.businessName);

        const html = buildEmail({
          preheader: emailContent.preheader,
          headline: emailContent.headline,
          body: emailContent.body,
          ctaText: emailContent.ctaText,
          ctaUrl: emailContent.ctaUrl,
          accentColor: '#d97706', // Amber
        });

        // Send email
        await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: emailContent.subject,
          html,
        });

        // Record successful send
        await prisma.organizerClaimEmail.create({
          data: {
            organizerId: organizer.id,
            touchNumber,
            sentAt: new Date(),
            status: 'sent',
          },
        });

        console.log(`[ClaimEmail] Sent touch ${touchNumber} to ${email} (organizer: ${organizer.id})`);
        sent++;
      } catch (err) {
        console.error(`[ClaimEmail] Failed to send to organizer ${organizer.id}:`, err);
        failed++;
      }
    }

    console.log(`[ClaimEmail] Batch complete: ${sent} sent, ${failed} failed`);
  } catch (err) {
    console.error('[ClaimEmail] Batch failed:', err);
  }
};

/**
 * Get email content for each touch in the 3-touch sequence
 */
function getEmailContent(
  touchNumber: 1 | 2 | 3,
  organizerName: string,
  businessName: string
): {
  preheader: string;
  headline: string;
  body: string;
  subject: string;
  ctaText: string;
  ctaUrl: string;
} {
  const claimUrl = `${siteUrl}/claim`;

  switch (touchNumber) {
    case 1:
      return {
        preheader: 'Your sale is listed on FindA.Sale — claim it for free',
        headline: 'Your sale is live on FindA.Sale',
        subject: 'Your sale is listed on FindA.Sale — claim it for free',
        body: `
          <p>Hi ${organizerName},</p>
          <p>We found your <strong>${businessName || 'sale'}</strong> listed online and added it to FindA.Sale to help more shoppers find you.</p>
          <p>Claim your listing for free to:</p>
          <ul style="margin: 16px 0; padding-left: 24px;">
            <li>Manage your details and photos</li>
            <li>Track shopper interest</li>
            <li>Respond to questions</li>
            <li>Boost your reach</li>
          </ul>
          <p>Takes just 2 minutes. Let's get started!</p>
        `,
        ctaText: 'Claim Your Listing',
        ctaUrl: claimUrl,
      };

    case 2:
      return {
        preheader: 'Shoppers are looking at your listing',
        headline: 'Your listing is getting views',
        subject: 'Shoppers are looking at your listing',
        body: `
          <p>Hi ${organizerName},</p>
          <p>Good news — your <strong>${businessName || 'sale'}</strong> on FindA.Sale is getting attention from shoppers in your area.</p>
          <p>Claim your listing to:</p>
          <ul style="margin: 16px 0; padding-left: 24px;">
            <li>See how many shoppers viewed your sale</li>
            <li>Add more photos and details</li>
            <li>Respond to shopper questions in real time</li>
            <li>Stand out from the competition</li>
          </ul>
          <p>Just confirmed: claimed listings get 3× more engagement. Claim yours now!</p>
        `,
        ctaText: 'Claim Your Listing',
        ctaUrl: claimUrl,
      };

    case 3:
      return {
        preheader: 'Last reminder — your FindA.Sale listing',
        headline: 'Your final reminder',
        subject: 'Last reminder — your FindA.Sale listing',
        body: `
          <p>Hi ${organizerName},</p>
          <p>This is our final email about your <strong>${businessName || 'sale'}</strong> on FindA.Sale.</p>
          <p>You have two options:</p>
          <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d97706;">
            <p style="margin: 8px 0;"><strong>Option 1:</strong> Claim your listing free to control your presence and reach more shoppers.</p>
            <p style="margin: 8px 0;"><strong>Option 2:</strong> Reply to this email if you'd prefer we remove your listing.</p>
          </div>
          <p>We're here to help you succeed. Let's make this happen!</p>
        `,
        ctaText: 'Claim Your Listing',
        ctaUrl: claimUrl,
      };
  }
}
