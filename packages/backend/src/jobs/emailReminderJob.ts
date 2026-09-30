import cron from 'node-cron';
import { processReminderEmails } from '../services/emailReminderService';
import { cronGuard } from '../utils/cronGuard';

// Run every hour. Reminders are "due and not yet sent" (services/emailReminderService.ts): DAY_BEFORE is due
// once a sale is within 24h, TWO_HOURS within 2h, never after the sale starts, and the SaleReminderSent ledger
// keeps each one at-most-once per subscriber across these hourly runs. No ledger table = nothing is sent.
// Texts inside reminders are PRO/TEAMS only, respect quiet hours and the organizer's rolling daily text cap (a
// skip for either is retried by a later run); reminder emails honor the 'saleReminders' unsubscribe (pref +
// SaleSubscriber.emailOptOutAt, migration 20260929210000_sms_double_optin).
cron.schedule('6 * * * *', cronGuard({ jobName: 'emailReminderJob' }, async () => { // staggered off saleAutoCloseCron's 0 * * * * 2026-08-04 cost-optimization batch
  console.log('Running email reminder job...');
  const summary = await processReminderEmails();
  if (summary.ledgerUnavailable) {
    console.error('Email reminder job finished WITHOUT sending: SaleReminderSent ledger unavailable (apply migrations 20260929200000_sale_reminder_sent_marker and 20260929210000_sms_double_optin)');
  } else {
    console.log(`Email reminder job completed successfully (texts skipped: ${summary.skippedQuietHours} quiet hours, ${summary.skippedCap} daily cap, ${summary.skippedTier} not on PRO/TEAMS)`);
  }
}));
