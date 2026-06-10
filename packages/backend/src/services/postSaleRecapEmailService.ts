/**
 * Post-Sale Recap Email Service — Outward Email Automation #1 (flagship)
 *
 * When a sale transitions to ENDED, the organizer receives a single recap email
 * summarizing how the sale performed: views, favorites, items listed, items sold,
 * and gross revenue. The email also carries two peak-happiness CTAs:
 *   - "List your next sale"
 *   - "Share a testimonial" (Outward Email Automation #2a entry point)
 * plus a contextual referral module (Outward Email Automation #3) built from the
 * organizer's existing referral link.
 *
 * Reuses the FindA.Sale email design system (emailTemplateService) and the
 * SES/Gmail send rail (emailService). One recap per sale, ever — guarded by
 * Sale.recapSentAt. Respects suppressionService.
 *
 * Sender: "The FindA.Sale Team" — never a personal name.
 */

import { prisma } from '../index';
import {
  baseWrapper,
  buildHero,
  buildSpacer,
  buildCTARow,
  buildMetricRowModule,
  buildTextBlockModule,
  EMAIL_TOKENS as T,
} from './emailTemplateService';
import { emailService } from '../lib/emailService';
import { getSaleSocialProof } from './socialProofService';
import { suppressionService } from './suppressionService';
import { generateReferralCode } from './referralService';

const FROM_EMAIL = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

interface RecapMetrics {
  totalViews: number;
  totalFavorites: number;
  itemsListed: number;
  itemsSold: number;
  grossRevenue: number; // dollars
}

/** Build the referral invite module from a user's existing referral code (Automation #3). */
function buildReferralModule(referralCode: string | null): string {
  if (!referralCode) return '';
  const referralUrl = `${FRONTEND_URL}/signup?ref=${referralCode}`;
  return `
<tr><td style="padding:4px 28px 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="border:1px solid ${T.borderSolid}; border-radius:10px; background:${T.accentSoft};">
    <tr><td style="padding:16px 18px;">
      <div style="font-size:14px; font-weight:600; color:${T.ink}; margin-bottom:4px;">Know another organizer?</div>
      <div style="font-size:13.5px; color:${T.inkDim}; line-height:1.55; margin-bottom:10px;">
        Invite them to FindA.Sale &mdash; when they run their first sale, you both earn a reward.
      </div>
      <a href="${referralUrl}" style="color:${T.accent}; font-weight:600; font-size:14px; text-decoration:none;">Share your invite link &rarr;</a>
    </td></tr>
  </table>
</td></tr>`;
}

function buildRecapHtml(opts: {
  businessName: string;
  saleTitle: string;
  metrics: RecapMetrics;
  newSaleUrl: string;
  testimonialUrl: string;
  referralCode: string | null;
  unsubUrl: string;
}): string {
  const { businessName, saleTitle, metrics, newSaleUrl, testimonialUrl, referralCode, unsubUrl } = opts;

  const hadActivity = metrics.itemsSold > 0 || metrics.totalFavorites > 0 || metrics.totalViews > 0;

  const metricRows = buildMetricRowModule([
    { icon: '&#128064;', stat: metrics.totalViews.toLocaleString(), label: 'views', context: 'People who looked at this sale.' },
    { icon: '&#10084;&#65039;', stat: metrics.totalFavorites.toLocaleString(), label: 'favorites', context: 'Shoppers who saved the sale or its items.' },
    { icon: '&#128230;', stat: metrics.itemsListed.toLocaleString(), label: 'items listed', context: `${metrics.itemsSold.toLocaleString()} sold.` },
    { icon: '&#128176;', stat: `$${metrics.grossRevenue.toFixed(2)}`, label: 'gross revenue', context: 'Total of items marked sold on FindA.Sale.' },
  ]);

  // Gentle copy for a sale that ended with no activity.
  const gentleNote = !hadActivity
    ? buildTextBlockModule({
        headline: 'Every sale is a head start on the next one',
        body: `This one stayed quiet, but the listing did its job &mdash; it put ${businessName} in front of shoppers searching nearby. Posting your next sale a little earlier usually gives items more time to be found.`,
      })
    : '';

  const testimonialModule = buildTextBlockModule({
    headline: 'Happy with how it went?',
    body: `A quick note about your experience helps other organizers decide to give FindA.Sale a try.`,
    linkText: 'Share a testimonial',
    linkUrl: testimonialUrl,
  });

  const content = `
    ${buildHero({
      eyebrow: 'Sale recap',
      title: `Here&rsquo;s how <span style="color:${T.accent};">${saleTitle}</span> did.`,
      sub: `The sale has wrapped up. Here are the numbers from start to finish.`,
    })}
    ${buildSpacer(8)}
    ${metricRows}
    ${buildSpacer(12)}
    ${gentleNote}
    ${testimonialModule}
    ${buildReferralModule(referralCode)}
    ${buildCTARow('List your next sale →', newSaleUrl, `Reuse your details and items in a couple of clicks.`)}
  `;

  return baseWrapper({
    preheader: hadActivity
      ? `${saleTitle} recap — ${metrics.totalViews.toLocaleString()} views, ${metrics.itemsSold} sold`
      : `${saleTitle} has wrapped up — your recap is inside`,
    content,
    unsubLabel: 'Manage email preferences',
    unsubUrl,
  });
}

/**
 * Compute recap metrics for a single sale.
 * Reuses getSaleSocialProof for favorites. Views come from qrScanCount + linkClicks.
 */
async function computeRecapMetrics(saleId: string): Promise<RecapMetrics> {
  const [sale, linkClickCount, itemsListed, soldItems] = await Promise.all([
    prisma.sale.findUnique({ where: { id: saleId }, select: { qrScanCount: true } }),
    prisma.linkClick.count({ where: { saleId } }),
    prisma.item.count({ where: { saleId } }),
    prisma.item.findMany({ where: { saleId, status: 'SOLD' }, select: { price: true } }),
  ]);

  const social = await getSaleSocialProof(saleId);

  const itemsSold = soldItems.length;
  const grossRevenue = soldItems.reduce((sum, it) => sum + (it.price ?? 0), 0);
  const totalViews = (sale?.qrScanCount ?? 0) + linkClickCount;

  return {
    totalViews,
    totalFavorites: social.totalFavorites,
    itemsListed,
    itemsSold,
    grossRevenue,
  };
}

/**
 * Send the post-sale recap to a single organizer for a single sale.
 * Idempotent: stamps Sale.recapSentAt and skips if already set.
 * Returns true if an email was sent.
 */
export async function sendPostSaleRecap(saleId: string): Promise<boolean> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      title: true,
      recapSentAt: true,
      status: true,
      organizer: {
        select: {
          businessName: true,
          user: { select: { id: true, email: true } },
        },
      },
    },
  });

  if (!sale) return false;
  if (sale.recapSentAt) return false; // already sent — idempotent
  if (sale.status !== 'ENDED') return false;

  const email = sale.organizer?.user?.email;
  const userId = sale.organizer?.user?.id;
  if (!email || !userId) return false;

  // Respect suppression list
  if (await suppressionService.isSuppressed(email)) {
    // Still stamp so we don't keep re-querying this sale forever
    await prisma.sale.update({ where: { id: saleId }, data: { recapSentAt: new Date() } });
    console.log(`[postSaleRecap] Skipped suppressed organizer ${email} for sale ${saleId}`);
    return false;
  }

  const metrics = await computeRecapMetrics(saleId);

  // Referral wiring (Automation #3) — pull/generate the organizer's existing code
  let referralCode: string | null = null;
  try {
    referralCode = await generateReferralCode(userId);
  } catch (err) {
    console.error(`[postSaleRecap] Could not resolve referral code for ${userId}:`, err);
  }

  const html = buildRecapHtml({
    businessName: sale.organizer?.businessName || 'your business',
    saleTitle: sale.title,
    metrics,
    newSaleUrl: `${FRONTEND_URL}/organizer/sales/new`,
    testimonialUrl: `${FRONTEND_URL}/testimonial?saleId=${sale.id}`,
    referralCode,
    unsubUrl: `${FRONTEND_URL}/settings/notifications`,
  });

  try {
    await emailService.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Your sale recap: ${sale.title}`,
      html,
      jobName: 'postSaleRecap',
    });
    await prisma.sale.update({ where: { id: saleId }, data: { recapSentAt: new Date() } });
    console.log(`[postSaleRecap] Sent recap for sale ${saleId} to ${email}`);
    return true;
  } catch (err) {
    console.error(`[postSaleRecap] Failed to send recap for sale ${saleId} to ${email}:`, err);
    return false;
  }
}

/**
 * Scan for sales that ENDED in the last 36h and have not yet received a recap,
 * then send each one. Called by the daily cron. The 36h window gives buffer for
 * the hourly auto-close cron and any manual end actions.
 */
export async function sendPostSaleRecaps(): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);

  const sales = await prisma.sale.findMany({
    where: {
      status: 'ENDED',
      recapSentAt: null,
      deletedAt: null,
      updatedAt: { gte: windowStart }, // ENDED transition stamps updatedAt
      organizer: { isClaimed: true, isUnmanagedListing: false }, // exclude scraped organizers
    },
    select: { id: true },
    take: 200, // safety cap per run
  });

  console.log(`[postSaleRecap] Found ${sales.length} ended sale(s) awaiting a recap`);

  let sent = 0;
  for (const s of sales) {
    const ok = await sendPostSaleRecap(s.id);
    if (ok) sent++;
  }

  console.log(`[postSaleRecap] Sent ${sent} recap email(s)`);
}
