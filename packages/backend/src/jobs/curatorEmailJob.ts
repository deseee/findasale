// Phase 30: Weekly curator email
// Runs every Monday at 8 AM — sends followers a digest of upcoming sales
// for each organizer they follow.

import cron from 'node-cron';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL   = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';

// ─── Email template ──────────────────────────────────────────────────────────────────────

interface UpcomingSale {
  id: string;
  title: string;
  city: string;
  state: string;
  startDate: Date;
  endDate: Date;
}

const buildDigestHtml = (
  organizerName: string,
  sales: UpcomingSale[],
  unsubEmail: string
): string => {
  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const saleRows = sales
    .map(
      (s) => `
      <tr>
        <td style="padding: 14px 0; border-bottom: 1px solid #e8e0d8;">
          <a href="${FRONTEND_URL}/sales/${s.id}"
             style="font-size:15px; font-weight:600; color:#1a1a1a; text-decoration:none;">
            ${s.title}
          </a><br/>
          <span style="font-size:13px; color:#6b5f52;">
            📍 ${s.city}, ${s.state} &nbsp;·&nbsp;
            ${formatDate(s.startDate)} – ${formatDate(s.endDate)}
          </span>
        </td>
        <td style="padding:14px 0; border-bottom:1px solid #e8e0d8; text-align:right; white-space:nowrap;">
          <a href="${FRONTEND_URL}/sales/${s.id}"
             style="background:#d97706; color:#fff; padding:8px 16px; border-radius:6px;
                    text-decoration:none; font-size:13px; font-weight:600;">
            View Sale
          </a>
        </td>
      </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding:0; background:#f9f7f4; font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4; padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff; border-radius:12px; overflow:hidden;
                      box-shadow:0 1px 4px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#d97706; padding:24px 32px;">
              <span style="font-size:22px; font-weight:700; color:#fff;">FindA.Sale</span>
              <p style="margin:6px 0 0; font-size:14px; color:#fde68a;">
                Weekly picks from ${organizerName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="font-size:16px; color:#3d342a; margin:0 0 20px;">
                Here are the upcoming sales from
                <strong>${organizerName}</strong> this week:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                ${saleRows}
              </table>

              <p style="margin:28px 0 0; font-size:14px; color:#6b5f52;">
                Want to see all sales in Grand Rapids?
                <a href="${FRONTEND_URL}"
                   style="color:#d97706; text-decoration:underline;">Browse FindA.Sale →</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; background:#f9f7f4; border-top:1px solid #e8e0d8;">
              <p style="font-size:12px; color:#9e8f82; margin:0;">
                You're receiving this because you follow ${organizerName} on FindA.Sale.<br/>
                <a href="${FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(unsubEmail)}"
                   style="color:#9e8f82;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ─── Core logic ──────────────────────────────────────────────────────────────────────

export const sendWeeklyCuratorDigest = async (): Promise<void> => {
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Find all organizers that have:
  //  - at least one follower with notifyEmail = true
  //  - at least one upcoming PUBLISHED sale in the next 7 days
  const organizers = await prisma.organizer.findMany({
    where: {
      followers: { some: { notifyEmail: true } },
      sales: {
        some: {
          status: 'PUBLISHED',
          startDate: { gte: now, lte: sevenDaysOut },
        },
      },
    },
    include: {
      user: { select: { name: true } },
      followers: {
        where: { notifyEmail: true },
        include: {
          user: { select: { email: true } },
        },
      },
      sales: {
        where: {
          status: 'PUBLISHED',
          startDate: { gte: now, lte: sevenDaysOut },
        },
        orderBy: { startDate: 'asc' },
        select: { id: true, title: true, city: true, state: true, startDate: true, endDate: true },
      },
    },
  });

  let sentCount = 0;

  for (const organizer of organizers) {
    if (!organizer.sales.length || !organizer.followers.length) continue;

    const organizerName =
      organizer.businessName ||
      organizer.user.name;

    for (const follow of organizer.followers) {
      const recipientEmail = follow.user?.email;
      if (!recipientEmail) continue;

      const html = buildDigestHtml(organizerName, organizer.sales as UpcomingSale[], recipientEmail);

      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: recipientEmail,
          subject: `This week from ${organizerName} on FindA.Sale`,
          html,
        });
        sentCount++;
      } catch (err) {
        console.error(`✗ Curator digest failed → ${recipientEmail}:`, err);
      }
    }
  }

  console.log(`✓ Weekly curator digest: sent ${sentCount} emails across ${organizers.length} organizers`);
};

// ─── Schedule: every Monday at 8 AM ─────────────────────────────────────────────────────

cron.schedule('0 8 * * 1', async () => {
  console.log('📧 Running weekly curator email digest…');
  try {
    await sendWeeklyCuratorDigest();
  } catch (err) {
    console.error('Weekly curator email job failed:', err);
  }
});
