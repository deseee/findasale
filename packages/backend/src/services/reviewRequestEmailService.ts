/**
 * Review / Testimonial Request Email Service — Outward Email Automation #2
 *
 * Two triggers:
 *   (a) Organizer testimonial-ask: 2 days after a sale ENDED with >=1 sold item.
 *       CTA -> on-site testimonial capture route (/testimonial). Optional Google
 *       Business Profile review button via GBP_REVIEW_URL env (omitted if unset).
 *   (b) Shopper review-ask: 1 day after a completed (PAID) Purchase. CTA -> the
 *       organizer storefront / sale page where the existing Review system lives.
 *
 * Throttle: max one review-ask per user per 30 days (EmailAutomationLog).
 * Idempotency: Sale.testimonialAskSentAt (organizer), Purchase.reviewAskSentAt (shopper).
 * Respects suppressionService. Reuses the FindA.Sale email design system + SES rail.
 *
 * Sender: "The FindA.Sale Team" — never a personal name.
 */

import { prisma } from '../index';
import {
  baseWrapper,
  buildHero,
  buildSpacer,
  buildCTARow,
  buildTextBlockModule,
  buildCTAButton,
  EMAIL_TOKENS as T,
} from './emailTemplateService';
import { emailService } from '../lib/emailService';
import { suppressionService } from './suppressionService';

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'hello@send.finda.sale';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const GBP_REVIEW_URL = process.env.GBP_REVIEW_URL || '';

const REVIEW_ASK_KEY = 'review_ask';
const THROTTLE_DAYS = 30;

/** Returns true if this user has been sent a review-ask within the throttle window. */
async function isThrottled(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - THROTTLE_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.emailAutomationLog.findFirst({
    where: { userId, automationKey: REVIEW_ASK_KEY, sentAt: { gte: since } },
    select: { id: true },
  });
  return !!recent;
}

async function logSent(userId: string): Promise<void> {
  await prisma.emailAutomationLog.create({
    data: { userId, automationKey: REVIEW_ASK_KEY },
  });
}

// ─────────────────────────────────────────────────────────────────
// (a) Organizer testimonial-ask
// ─────────────────────────────────────────────────────────────────

function buildOrganizerTestimonialHtml(opts: {
  saleTitle: string;
  testimonialUrl: string;
  unsubUrl: string;
}): string {
  const { saleTitle, testimonialUrl, unsubUrl } = opts;

  const googleButton = GBP_REVIEW_URL
    ? `<tr><td align="center" style="padding:0 28px 8px;">
        <div style="font-size:13px; color:${T.inkDim}; margin-bottom:10px;">Or leave a public review on Google:</div>
        ${buildCTAButton('Review us on Google →', GBP_REVIEW_URL)}
      </td></tr>`
    : '';

  const content = `
    ${buildHero({
      eyebrow: 'A quick favor',
      title: `How was your sale on FindA.Sale?`,
      sub: `Now that <strong>${saleTitle}</strong> has wrapped up, we&rsquo;d love to hear how it went.`,
    })}
    ${buildTextBlockModule({
      body: `A sentence or two about your experience helps other organizers decide to give FindA.Sale a try &mdash; and helps us keep making it better for you.`,
    })}
    ${buildSpacer(8)}
    ${buildCTARow('Share a testimonial →', testimonialUrl)}
    ${googleButton}
    ${buildSpacer(8)}
  `;

  return baseWrapper({
    preheader: `How was your sale? We'd love a quick note.`,
    content,
    unsubLabel: 'Manage email preferences',
    unsubUrl,
  });
}

/**
 * Send the organizer testimonial-ask for a single sale.
 * Idempotent via Sale.testimonialAskSentAt. Throttled per user. Respects suppression.
 */
export async function sendOrganizerTestimonialAsk(saleId: string): Promise<boolean> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      title: true,
      testimonialAskSentAt: true,
      organizer: { select: { user: { select: { id: true, email: true } } } },
    },
  });

  if (!sale || sale.testimonialAskSentAt) return false;

  const email = sale.organizer?.user?.email;
  const userId = sale.organizer?.user?.id;
  if (!email || !userId) return false;

  const stamp = () =>
    prisma.sale.update({ where: { id: saleId }, data: { testimonialAskSentAt: new Date() } });

  if (await suppressionService.isSuppressed(email)) {
    await stamp();
    return false;
  }
  if (await isThrottled(userId)) {
    await stamp();
    console.log(`[reviewRequest] Organizer ${userId} throttled — skipping testimonial-ask for sale ${saleId}`);
    return false;
  }

  const html = buildOrganizerTestimonialHtml({
    saleTitle: sale.title,
    testimonialUrl: `${FRONTEND_URL}/testimonial?saleId=${sale.id}`,
    unsubUrl: `${FRONTEND_URL}/settings/notifications`,
  });

  try {
    await emailService.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `How was your sale on FindA.Sale?`,
      html,
      jobName: 'organizerTestimonialAsk',
    });
    await stamp();
    await logSent(userId);
    console.log(`[reviewRequest] Sent testimonial-ask for sale ${saleId} to ${email}`);
    return true;
  } catch (err) {
    console.error(`[reviewRequest] Failed testimonial-ask for sale ${saleId}:`, err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// (b) Shopper review-ask
// ─────────────────────────────────────────────────────────────────

function buildShopperReviewHtml(opts: {
  organizerName: string;
  reviewUrl: string;
  unsubUrl: string;
}): string {
  const { organizerName, reviewUrl, unsubUrl } = opts;

  const content = `
    ${buildHero({
      eyebrow: 'Your recent purchase',
      title: `How did it go with ${organizerName}?`,
      sub: `Your rating helps other shoppers know who to trust on FindA.Sale.`,
    })}
    ${buildTextBlockModule({
      body: `It only takes a moment &mdash; a star rating and a sentence is plenty.`,
    })}
    ${buildSpacer(8)}
    ${buildCTARow('Rate this organizer →', reviewUrl)}
    ${buildSpacer(8)}
  `;

  return baseWrapper({
    preheader: `How did it go with ${organizerName}? Leave a quick rating.`,
    content,
    unsubLabel: 'Manage email preferences',
    unsubUrl,
  });
}

/**
 * Send the shopper review-ask for a single completed purchase.
 * Idempotent via Purchase.reviewAskSentAt. Throttled per user. Respects suppression.
 */
export async function sendShopperReviewAsk(purchaseId: string): Promise<boolean> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      status: true,
      reviewAskSentAt: true,
      user: { select: { id: true, email: true } },
      sale: {
        select: {
          id: true,
          organizer: { select: { businessName: true } },
        },
      },
    },
  });

  if (!purchase || purchase.reviewAskSentAt) return false;
  if (purchase.status !== 'PAID') return false;

  const email = purchase.user?.email;
  const userId = purchase.user?.id;
  if (!email || !userId) return false; // POS walk-ins have no account

  const stamp = () =>
    prisma.purchase.update({ where: { id: purchaseId }, data: { reviewAskSentAt: new Date() } });

  if (await suppressionService.isSuppressed(email)) {
    await stamp();
    return false;
  }
  if (await isThrottled(userId)) {
    await stamp();
    console.log(`[reviewRequest] Shopper ${userId} throttled — skipping review-ask for purchase ${purchaseId}`);
    return false;
  }

  const organizerName = purchase.sale?.organizer?.businessName || 'the organizer';
  // The existing Review system is keyed on saleId — link to the sale page where the
  // shopper can leave a rating. If there's no sale (POS / inventory), fall back to home.
  const reviewUrl = purchase.sale?.id
    ? `${FRONTEND_URL}/sales/${purchase.sale.id}?review=1`
    : FRONTEND_URL;

  const html = buildShopperReviewHtml({
    organizerName,
    reviewUrl,
    unsubUrl: `${FRONTEND_URL}/settings/notifications`,
  });

  try {
    await emailService.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `How did it go with ${organizerName}?`,
      html,
      jobName: 'shopperReviewAsk',
    });
    await stamp();
    await logSent(userId);
    console.log(`[reviewRequest] Sent review-ask for purchase ${purchaseId} to ${email}`);
    return true;
  } catch (err) {
    console.error(`[reviewRequest] Failed review-ask for purchase ${purchaseId}:`, err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Batch scanners — called by the daily cron
// ─────────────────────────────────────────────────────────────────

/** Organizer: sales that ENDED ~2 days ago with >=1 sold item, no testimonial-ask sent. */
export async function sendOrganizerTestimonialAsks(): Promise<void> {
  const now = new Date();
  // Window: ended between 48h and 72h ago (1-day-wide band so the daily run never misses)
  const windowStart = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const sales = await prisma.sale.findMany({
    where: {
      status: 'ENDED',
      testimonialAskSentAt: null,
      deletedAt: null,
      updatedAt: { gte: windowStart, lte: windowEnd },
      items: { some: { status: 'SOLD' } }, // >=1 sold item
      organizer: { isClaimed: true, isUnmanagedListing: false }, // exclude scraped organizers
    },
    select: { id: true },
    take: 200,
  });

  console.log(`[reviewRequest] Found ${sales.length} sale(s) for organizer testimonial-ask`);
  let sent = 0;
  for (const s of sales) {
    if (await sendOrganizerTestimonialAsk(s.id)) sent++;
  }
  console.log(`[reviewRequest] Sent ${sent} organizer testimonial-ask email(s)`);
}

/** Shopper: PAID purchases ~1 day old, no review-ask sent. */
export async function sendShopperReviewAsks(): Promise<void> {
  const now = new Date();
  // Window: paid between 24h and 48h ago
  const windowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const purchases = await prisma.purchase.findMany({
    where: {
      status: 'PAID',
      reviewAskSentAt: null,
      userId: { not: null },
      isTestTransaction: false,
      createdAt: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true },
    take: 200,
  });

  console.log(`[reviewRequest] Found ${purchases.length} purchase(s) for shopper review-ask`);
  let sent = 0;
  for (const p of purchases) {
    if (await sendShopperReviewAsk(p.id)) sent++;
  }
  console.log(`[reviewRequest] Sent ${sent} shopper review-ask email(s)`);
}
