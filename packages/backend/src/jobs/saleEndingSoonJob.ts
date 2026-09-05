import cron from 'node-cron';
import jwt from 'jsonwebtoken';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../lib/prisma';
import { sendPushNotification } from '../utils/webpush';
import { buildEmail } from '../services/emailTemplateService';
import { emailService, QuotaExceededError } from '../lib/emailService';
import { createNotification } from '../lib/notificationService';


interface EmailTemplate {
  subject: string;
  html: string;
}

const getEmailTemplate = (
  saleTitle: string,
  endDate: Date,
  city: string,
  saleUrl: string,
  topCategories: string[],
  unsubUrl: string
): EmailTemplate => {
  const formattedDate = endDate.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const categoryList =
    topCategories.length > 0
      ? topCategories.slice(0, 3).join(', ')
      : 'various items';

  const html = buildEmail({
    preheader: `Last chance: ${saleTitle} ends tomorrow`,
    headline: 'Last chance! This sale ends tomorrow',
    body: `<div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;"><h3 style="margin-top: 0; color: #333; margin-bottom: 12px;">${saleTitle}</h3><p style="margin: 8px 0; color: #666;">${city}</p><p style="margin: 8px 0; color: #666;">Ends ${formattedDate}</p><p style="margin: 8px 0; color: #666;">Featured: ${categoryList}</p></div>`,
    ctaText: 'View Sale Now',
    ctaUrl: saleUrl,
    accentColor: '#dc2626',
    unsubLabel: 'Stop sale ending soon alerts',
    unsubUrl,
  });

  return {
    subject: `Last chance: ${saleTitle} ends tomorrow`,
    html,
  };
};

export const processSaleEndingSoonNotifications = async (): Promise<void> => {
  if (process.env.OUTREACH_ENABLED !== 'true') {
    console.log('[saleEndingSoonJob] Skipped — OUTREACH_ENABLED is not "true"');
    return;
  }
  try {
    const now = new Date();

    // Find sales ending between 23 and 25 hours from now
    const soonestEnd = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const latestEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const salesToNotify = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        endingSoonNotified: false,
        isOngoing: false, // a permanent storefront is never "ending soon"
        endDate: {
          gte: soonestEnd,
          lte: latestEnd,
        },
      },
      include: {
        organizer: {
          select: {
            businessName: true,
            userId: true,
          },
        },
        subscribers: {
          select: {
            email: true,
            userId: true,
            // SaleSubscriber.userId is nullable (email-only / phone-only follow,
            // no account) -- see emailReminders.e2e.test.ts's explicit
            // "invalidSubscriber" cases. Pull the User's own notificationPrefs
            // here (single JOIN-based select) so the per-recipient unsubscribe-type
            // opt-out check below doesn't need an N+1 query per subscriber.
            user: {
              select: {
                notificationPrefs: true,
              },
            },
          },
        },
        items: {
          select: {
            category: true,
            status: true,
          },
        },
      },
    });

    console.log(`Found ${salesToNotify.length} sales ending soon`);

    for (const sale of salesToNotify) {
      try {
        // Get unique categories and count occurrences
        const categoryCount = new Map<string, number>();
        for (const item of sale.items) {
          if (item.category) {
            categoryCount.set(item.category, (categoryCount.get(item.category) || 0) + 1);
          }
        }

        // Sort by count and get top 3
        const topCategories = Array.from(categoryCount.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([cat]) => cat);

        const saleUrl = `${process.env.FRONTEND_URL || 'https://finda.sale'}/sales/${sale.id}`;

        // NOTE: the email template (and specifically its unsubscribe link) is built
        // PER RECIPIENT inside the subscriber loop below, not once here -- a single
        // shared unsubscribe link built at this scope would either point at the
        // wrong user or have to be omitted entirely. See the loop for both the
        // real-User (UnsubscribeToken) and email-only (JWT + suppression) paths.

        // Nudge the organizer too: how many items are still unsold as this sale
        // heads into its final ~24 hours. Before this, the only "ending soon" signal
        // went to shopper subscribers -- an organizer with a pile of unsold inventory
        // had no reason to know their sale was about to end until it just did.
        // Rides the same endingSoonNotified idempotency guard as the shopper alerts
        // below (set once, at the end of this sale's processing).
        if (sale.organizer?.userId) {
          const itemsRemaining = sale.items.filter(
            (item) => item.status === 'AVAILABLE' || item.status === 'RESERVED'
          ).length;

          if (itemsRemaining > 0) {
            const formattedEndDate = sale.endDate.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });

            createNotification({
              userId: sale.organizer.userId,
              type: 'sale_ending_soon_organizer',
              title: 'Your sale ends soon',
              body: `"${sale.title}" ends ${formattedEndDate}. ${itemsRemaining} item${itemsRemaining === 1 ? '' : 's'} still unsold.`,
              link: `/organizer/sales/${sale.id}`,
              sendEmail: true,
              emailSubject: `"${sale.title}" ends soon: ${itemsRemaining} item${itemsRemaining === 1 ? '' : 's'} still unsold`,
              channel: 'OPERATIONAL',
            }).catch((err) =>
              console.error(`Failed to send organizer ending-soon notification for sale ${sale.id}:`, err)
            );
          }
        }

        // Send notifications to all followers
        for (const subscriber of sale.subscribers) {
          // Send email if subscriber has email
          if (subscriber.email) {
            // Suppression check before sending
            const { suppressionService } = await import('../services/suppressionService');
            const isSuppressed = await suppressionService.isSuppressed(subscriber.email);
            if (isSuppressed) {
              continue;
            }

            // Build a per-recipient unsubscribe link. Two paths:
            //  - subscriber.userId set: real User row -> same UnsubscribeToken/
            //    buildUnsubscribeLinks scheme used everywhere else now, type
            //    'saleEndingSoon' (TYPE_TO_PREF_MAP -> emailSaleEndingSoon).
            //  - subscriber.userId null: email-only follow, no User row to hang an
            //    UnsubscribeToken off (its userId FK is required, not nullable).
            //    Reuse the exact JWT + /api/outreach/unsubscribe pattern
            //    outreachEmailsCron.ts already uses for its own no-User-row leads
            //    (organizerId is optional in that route's decoded payload -- it
            //    just calls suppressionService.processOptOut(email) either way).
            let unsubUrl: string;
            let listUnsubscribeHeader: string;

            if (subscriber.userId) {
              // Respect this subscriber's own opt-out for this alert type before
              // ever building the email. Without this check, clicking the
              // unsubscribe link below would flip the notificationPrefs flag but
              // this job would never read it back -- a fake unsubscribe.
              const prefs = (subscriber.user?.notificationPrefs as Record<string, unknown> | null) ?? {};
              if (prefs['emailSaleEndingSoon'] === false) {
                continue;
              }

              const { buildUnsubscribeLinks } = await import('../controllers/unsubscribeController');
              const links = await buildUnsubscribeLinks(subscriber.userId, 'saleEndingSoon');
              unsubUrl = links.webUrl;
              listUnsubscribeHeader = links.listUnsubscribeHeader;
            } else {
              const outreachSecret = process.env.OUTREACH_SECRET;
              const backendUrl =
                process.env.RAILWAY_BACKEND_URL ||
                process.env.BACKEND_URL ||
                (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);

              if (!outreachSecret || !backendUrl) {
                // No working one-click unsubscribe can be built for this email-only
                // recipient (missing OUTREACH_SECRET or backend URL) -- skip the
                // send rather than ship a CAN-SPAM-noncompliant email with no
                // functioning opt-out.
                console.error(
                  `[saleEndingSoonJob] Cannot build unsubscribe link for email-only subscriber ${subscriber.email} (sale ${sale.id}) -- ${!outreachSecret ? 'OUTREACH_SECRET' : 'backend URL (RAILWAY_BACKEND_URL/BACKEND_URL/RAILWAY_PUBLIC_DOMAIN)'} not set. Skipping send.`
                );
                continue;
              }

              const token = jwt.sign({ email: subscriber.email }, outreachSecret, { expiresIn: '90d' });
              unsubUrl = `${backendUrl}/api/outreach/unsubscribe?token=${token}`;
              listUnsubscribeHeader = `<mailto:unsubscribe@finda.sale?subject=unsubscribe>, <${unsubUrl}>`;
            }

            const emailTemplate = getEmailTemplate(
              sale.title,
              sale.endDate,
              sale.city,
              saleUrl,
              topCategories,
              unsubUrl
            );

            try {
              await emailService.emails.send({
                from: process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale',
                to: subscriber.email,
                subject: emailTemplate.subject,
                html: emailTemplate.html,
                jobName: 'saleEndingSoonJob',
                listUnsubscribe: listUnsubscribeHeader,
              });
              console.log(
                `Sale ending soon email sent to ${subscriber.email} for sale ${sale.id}`
              );
            } catch (emailErr) {
              if (emailErr instanceof QuotaExceededError) {
                console.warn('[saleEndingSoonJob] Daily Gmail quota reached — aborting remaining sends');
                return; // exit processSaleEndingSoonNotifications early
              }
              console.error(
                `Failed to send sale ending soon email to ${subscriber.email}:`,
                emailErr
              );
            }
          }

          // Send push notification if subscriber has userId
          if (subscriber.userId) {
            try {
              const pushSubs = await prisma.pushSubscription.findMany({
                where: { userId: subscriber.userId },
              });

              for (const ps of pushSubs) {
                await sendPushNotification(ps, {
                  title: `Last chance: ${sale.title}`,
                  body: `Sale ends tomorrow at ${sale.endDate.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })}`,
                  url: saleUrl,
                }, { userId: subscriber.userId, type: 'SALE_ENDING_SOON' }).catch((err) =>
                  console.warn(
                    `Sale ending soon push failed for user ${subscriber.userId}:`,
                    err?.message
                  )
                );
              }
            } catch (pushErr) {
              console.error(
                `Failed to send sale ending soon push for user ${subscriber.userId}:`,
                pushErr
              );
            }
          }
        }

        // Mark sale as notified
        await prisma.sale.update({
          where: { id: sale.id },
          data: { endingSoonNotified: true },
        });

        console.log(`Sale ending soon notifications sent for sale ${sale.id}`);
      } catch (saleErr) {
        console.error(`Error processing sale ${sale.id}:`, saleErr);
      }
    }

    console.log(
      `Processed sale ending soon notifications: ${salesToNotify.length} sales checked`
    );
  } catch (error) {
    console.error('Error in sale ending soon job:', error);
    throw error;
  }
};

// Run every hour to check for sales ending in ~24 hours
cron.schedule('4 * * * *', cronGuard({ jobName: 'saleEndingSoonJob' }, async () => { // staggered off saleAutoCloseCron's 0 * * * * 2026-08-04 cost-optimization batch
  console.log('Running sale ending soon job...');
  await processSaleEndingSoonNotifications();
  console.log('Sale ending soon job completed successfully');
}));
