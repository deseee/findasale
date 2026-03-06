import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { Resend } from 'resend';
import { sendPushNotification } from '../utils/webpush';

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

interface EmailTemplate {
  subject: string;
  html: string;
}

const getEmailTemplate = (
  saleTitle: string,
  endDate: Date,
  city: string,
  saleUrl: string,
  topCategories: string[]
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

  return {
    subject: `⏰ Last chance: ${saleTitle} ends tomorrow`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Don't miss out! This sale ends tomorrow</h2>

        <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <h3 style="margin-top: 0; color: #333;">${saleTitle}</h3>
          <p style="margin: 8px 0; color: #666;">
            📍 ${city}
          </p>
          <p style="margin: 8px 0; color: #666;">
            ⏰ Ends ${formattedDate}
          </p>
          <p style="margin: 8px 0; color: #666;">
            Featured: ${categoryList}
          </p>
        </div>

        <p style="font-size: 16px;">
          <a href="${saleUrl}"
             style="background: #dc2626; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
            View Sale Now
          </a>
        </p>

        <p style="font-size: 14px; color: #999; margin-top: 30px;">
          You're receiving this because you're following this sale on FindA.Sale.
        </p>
      </div>
    `,
  };
};

export const processSaleEndingSoonNotifications = async (): Promise<void> => {
  try {
    const now = new Date();

    // Find sales ending between 23 and 25 hours from now
    const soonestEnd = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const latestEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const salesToNotify = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        endingSoonNotified: false,
        endDate: {
          gte: soonestEnd,
          lte: latestEnd,
        },
      },
      include: {
        organizer: {
          select: {
            businessName: true,
          },
        },
        subscribers: {
          select: {
            email: true,
            userId: true,
          },
        },
        items: {
          select: {
            category: true,
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
        const emailTemplate = getEmailTemplate(
          sale.title,
          sale.endDate,
          sale.city,
          saleUrl,
          topCategories
        );

        // Send notifications to all followers
        for (const subscriber of sale.subscribers) {
          // Send email if subscriber has email
          if (subscriber.email) {
            try {
              const resend = getResendClient();
              if (resend) {
                await resend.emails.send({
                  from: process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale',
                  to: subscriber.email,
                  subject: emailTemplate.subject,
                  html: emailTemplate.html,
                });
                console.log(
                  `✓ Sale ending soon email sent to ${subscriber.email} for sale ${sale.id}`
                );
              }
            } catch (emailErr) {
              console.error(
                `✗ Failed to send sale ending soon email to ${subscriber.email}:`,
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
                  title: `⏰ Last chance: ${sale.title}`,
                  body: `Sale ends tomorrow at ${sale.endDate.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })}`,
                  url: saleUrl,
                }).catch((err) =>
                  console.warn(
                    `⚠ Sale ending soon push failed for user ${subscriber.userId}:`,
                    err?.message
                  )
                );
              }
            } catch (pushErr) {
              console.error(
                `✗ Failed to send sale ending soon push for user ${subscriber.userId}:`,
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

        console.log(`✓ Sale ending soon notifications sent for sale ${sale.id}`);
      } catch (saleErr) {
        console.error(`✗ Error processing sale ${sale.id}:`, saleErr);
      }
    }

    console.log(
      `✓ Processed sale ending soon notifications: ${salesToNotify.length} sales checked`
    );
  } catch (error) {
    console.error('✗ Error in sale ending soon job:', error);
  }
};

// Run every hour to check for sales ending in ~24 hours
cron.schedule('0 * * * *', async () => {
  console.log('Running sale ending soon job...');
  try {
    await processSaleEndingSoonNotifications();
    console.log('Sale ending soon job completed successfully');
  } catch (error) {
    console.error('Sale ending soon job failed:', error);
  }
});
