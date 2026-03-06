import cron from 'node-cron';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';

// Send abandoned checkout recovery email to a single user
const sendAbandonedCheckoutEmail = async (
  email: string,
  name: string,
  itemTitle: string,
  itemPrice: number,
  itemId: string,
  saleName: string
): Promise<void> => {
  const checkoutUrl = `${FRONTEND_URL}/items/${itemId}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding:0; background:#fafaf9; font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9; padding:24px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#d97706; padding:28px 32px; text-align:center;">
              <span style="font-size:26px; font-weight:700; color:#fff;">FindA.Sale</span>
              <p style="margin:8px 0 0; font-size:15px; color:#fde68a; font-weight:500;">You left something behind 👀</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="font-size:15px; color:#374151; margin:0 0 16px;">Hi ${name},</p>
              <p style="font-size:15px; color:#374151; margin:0 0 24px;">We noticed you didn't complete your purchase. Here's what you were interested in:</p>

              <!-- Item Card -->
              <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:24px; background:#f9f7f4;">
                <div style="font-weight:600; font-size:16px; color:#1f2937; margin-bottom:4px;">${itemTitle}</div>
                <div style="color:#d97706; font-weight:700; font-size:18px; margin-bottom:8px;">$${(itemPrice / 100).toFixed(2)}</div>
                <div style="color:#6b7280; font-size:13px; margin-bottom:4px;">From: ${saleName}</div>
                <p style="font-size:13px; color:#6b7280; margin:12px 0 0;">Don't miss out — items move fast!</p>
              </div>

              <!-- CTA -->
              <div style="text-align:center;">
                <a href="${checkoutUrl}" style="display:inline-block; padding:14px 32px; background:#d97706; color:#fff; border-radius:8px; text-decoration:none; font-weight:600; font-size:15px;">Complete Your Purchase</a>
              </div>

              <p style="font-size:13px; color:#6b7280; margin:20px 0 0; text-align:center;">Or copy and paste this link: <br/>${checkoutUrl}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; background:#f9f7f4; border-top:1px solid #e5e7eb; text-align:center;">
              <p style="font-size:12px; color:#9ca3af; margin:0;">
                You're receiving this because you started checkout at <a href="${FRONTEND_URL}" style="color:#d97706;">FindA.Sale</a>.<br/>
                <a href="${FRONTEND_URL}/profile" style="color:#9ca3af; text-decoration:none;">Manage preferences</a> ·
                <a href="${FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(email)}" style="color:#9ca3af; text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'You left something behind at FindA.Sale 👀',
      html,
    });
    console.log(`✓ Abandoned checkout recovery email sent to ${email}`);
  } catch (err) {
    console.error(`✗ Failed to send abandoned checkout recovery email to ${email}:`, err);
    throw err;
  }
};

// Main job: check for abandoned checkouts and send recovery emails
export const processAbandonedCheckouts = async (): Promise<void> => {
  console.log('[AbandonedCheckout] Starting abandoned checkout recovery job...');

  try {
    // Calculate 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    // Find CheckoutAttempts created more than 2 hours ago that haven't been completed or had recovery email sent
    const abandonedCheckouts = await prisma.checkoutAttempt.findMany({
      where: {
        completedAt: null,
        recoveryEmailSent: false,
        createdAt: { lte: twoHoursAgo },
      },
      include: {
        user: { select: { email: true, name: true } },
        item: { select: { id: true, title: true, price: true, sale: { select: { title: true } } } },
      },
    });

    console.log(
      `[AbandonedCheckout] Found ${abandonedCheckouts.length} abandoned checkouts to recover`
    );

    if (abandonedCheckouts.length === 0) {
      console.log('[AbandonedCheckout] No abandoned checkouts found, job complete');
      return;
    }

    let sent = 0;
    let errors = 0;

    // Send recovery emails
    for (const checkout of abandonedCheckouts) {
      try {
        const itemPrice = checkout.item.price || 0;
        const saleName = checkout.item.sale?.title || 'Estate Sale';

        await sendAbandonedCheckoutEmail(
          checkout.user.email,
          checkout.user.name || 'Shopper',
          checkout.item.title,
          itemPrice * 100, // Convert to cents
          checkout.item.id,
          saleName
        );

        // Mark recovery email as sent
        await prisma.checkoutAttempt.update({
          where: { id: checkout.id },
          data: { recoveryEmailSent: true },
        });

        sent++;
      } catch (err) {
        console.error(
          `[AbandonedCheckout] Failed to send recovery email for checkout ${checkout.id}:`,
          err
        );
        errors++;
      }
    }

    console.log(
      `[AbandonedCheckout] Job complete. Sent: ${sent}, Errors: ${errors}`
    );
  } catch (err) {
    console.error('[AbandonedCheckout] Job failed:', err);
    throw err;
  }
};

// Run every hour to check for abandoned checkouts
cron.schedule('0 * * * *', async () => {
  console.log('[AbandonedCheckout] Running abandoned checkout recovery job...');
  try {
    await processAbandonedCheckouts();
    console.log('[AbandonedCheckout] Abandoned checkout recovery job completed successfully');
  } catch (error) {
    console.error('[AbandonedCheckout] Abandoned checkout recovery job failed:', error);
  }
});
