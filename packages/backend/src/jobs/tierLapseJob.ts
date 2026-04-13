import cron from 'node-cron';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import { buildEmail } from '../services/emailTemplateService';
import {
  processBatchTierLapses,
  queueTierLapseWarnings,
  markTierLapseWarning,
} from '../services/tierLapseService';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';

/**
 * Send tier-lapse warning email to an organizer
 */
const sendTierLapseWarningEmail = async (
  email: string,
  name: string,
  tierName: string,
  daysUntilLapse: number
): Promise<void> => {
  const billingUrl = `${FRONTEND_URL}/organizer/billing`;

  const html = buildEmail({
    preheader: `Your ${tierName} subscription expires in ${daysUntilLapse} days`,
    headline: `Your ${tierName} subscription expires soon`,
    body: `<p>Hi ${name},</p><p>Your FindA.Sale <strong>${tierName}</strong> subscription will expire in <strong>${daysUntilLapse} day${daysUntilLapse > 1 ? 's' : ''}</strong>.</p><p>When your subscription expires, you'll be downgraded to SIMPLE tier and will lose access to PRO/TEAMS features.</p><p>To keep your subscription active, reactivate it now or update your payment method.</p>`,
    ctaText: 'Reactivate Subscription',
    ctaUrl: billingUrl,
    footerNote: `Or visit: ${billingUrl}`,
  });

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Action needed: Your ${tierName} subscription expires in ${daysUntilLapse} days`,
      html,
    });
    console.log(`✓ Tier-lapse warning email sent to ${email}`);
  } catch (err) {
    console.error(`✗ Failed to send tier-lapse warning email to ${email}:`, err);
    throw err;
  }
};

/**
 * Daily task 1: Process batch tier lapses (11 PM UTC / 3 PM EST)
 * Catches any subscriptions that expired without firing a webhook
 */
export const processBatchTierLapsesJob = async (): Promise<void> => {
  console.log('[TierLapse] Starting batch tier lapse processing job...');

  try {
    const results = await processBatchTierLapses();

    console.log(
      `[TierLapse] Batch job complete. Processed: ${results.length}, Success: ${results.filter(r => r.status === 'success').length}, Errors: ${results.filter(r => r.status === 'error').length}`
    );

    // Log detailed results
    for (const result of results) {
      if (result.status === 'success') {
        console.log(
          `[TierLapse] ✓ Tier lapsed for ${result.email}: tier now ${result.tier}`
        );
      } else {
        console.error(
          `[TierLapse] ✗ Failed to lapse ${result.email}: ${result.error}`
        );
      }
    }
  } catch (err) {
    console.error('[TierLapse] Batch job failed:', err);
    throw err;
  }
};

/**
 * Daily task 2: Queue and send tier-lapse warnings (8 AM UTC / 12 AM EST)
 * Sends emails 7 days before trial/subscription expiry
 */
export const queueTierLapseWarningsJob = async (): Promise<void> => {
  console.log('[TierLapse] Starting tier-lapse warning queue job...');

  try {
    const warnings = await queueTierLapseWarnings();

    console.log(
      `[TierLapse] Found ${warnings.length} subscriptions approaching lapse`
    );

    if (warnings.length === 0) {
      console.log('[TierLapse] No tier-lapse warnings to send, job complete');
      return;
    }

    let sent = 0;
    let errors = 0;

    // Send warning emails and mark as warned
    for (const warning of warnings) {
      try {
        const daysUntilLapse = warning.trialEndsAt
          ? Math.ceil(
              (warning.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            )
          : 7;

        await sendTierLapseWarningEmail(
          warning.email,
          warning.organizerName || 'Organizer',
          warning.tier,
          daysUntilLapse
        );

        // Mark warning as sent
        await markTierLapseWarning(warning.subscriptionId);

        sent++;
      } catch (err) {
        console.error(
          `[TierLapse] Failed to send warning for subscription ${warning.subscriptionId}:`,
          err
        );
        errors++;
      }
    }

    console.log(
      `[TierLapse] Warning job complete. Sent: ${sent}, Errors: ${errors}`
    );
  } catch (err) {
    console.error('[TierLapse] Warning job failed:', err);
    throw err;
  }
};

// Run batch lapse processing daily at 11 PM UTC (3 PM EST)
// Cron format: minute hour day-of-month month day-of-week
cron.schedule('0 23 * * *', async () => {
  console.log('[TierLapse] Running batch tier lapse processing job...');
  try {
    await processBatchTierLapsesJob();
    console.log('[TierLapse] Batch tier lapse processing job completed successfully');
  } catch (error) {
    console.error('[TierLapse] Batch tier lapse processing job failed:', error);
  }
});

// Run tier-lapse warning queue daily at 8 AM UTC (12 AM EST)
cron.schedule('0 8 * * *', async () => {
  console.log('[TierLapse] Running tier-lapse warning queue job...');
  try {
    await queueTierLapseWarningsJob();
    console.log('[TierLapse] Tier-lapse warning queue job completed successfully');
  } catch (error) {
    console.error('[TierLapse] Tier-lapse warning queue job failed:', error);
  }
});
