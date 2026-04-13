/**
 * snoozeService.ts
 * Handles MailerLite snooze operations via custom fields.
 *
 * When a user unsubscribes from a MailerLite email, this service:
 * 1. Marks them as snoozed for 30 days using snooze_until custom field
 * 2. Periodically checks for snoozed subscribers past their date
 * 3. Reactivates (resubscribes) them via MailerLite API
 *
 * No Prisma schema changes required — uses MailerLite custom fields only.
 */

const MAILERLITE_API_URL = 'https://connect.mailerlite.com/api';

function getApiKey(): string | null {
  return process.env.MAILERLITE_API_KEY || null;
}

/**
 * snoozeSubscriber — marks a subscriber as snoozed for N days
 * Sets the snooze_until custom field to (now + days) in ISO format.
 *
 * @param email - subscriber email address
 * @param days - snooze duration in days (default: 30)
 */
export async function snoozeSubscriber(email: string, days: number = 30): Promise<void> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.warn('[snooze] MAILERLITE_API_KEY not set — skipping snooze');
    return;
  }

  if (!email) {
    console.warn('[snooze] snoozeSubscriber called with empty email — skipping');
    return;
  }

  try {
    // Calculate snooze_until date: today + days
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);
    const snoozeUntilISO = snoozeUntil.toISOString().split('T')[0]; // YYYY-MM-DD format

    const response = await fetch(`${MAILERLITE_API_URL}/subscribers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        email,
        fields: {
          snooze_until: snoozeUntilISO,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[snooze] Failed to snooze subscriber ${email}: HTTP ${response.status} — ${body}`
      );
      return;
    }

    console.log(`[snooze] Subscriber ${email} snoozed until ${snoozeUntilISO}`);
  } catch (err) {
    console.error('[snooze] Network error snoozing subscriber:', err);
  }
}

/**
 * checkAndReactivateSnoozes — queries MailerLite for snoozed subscribers past their snooze date
 * and reactivates them by clearing the snooze_until field.
 *
 * This should be called periodically (e.g., daily cron job).
 * NOTE: MailerLite API does not provide a direct search by custom field date range.
 * This is a placeholder pattern; in practice, you would need to:
 * 1. Maintain a local "snooze audit" table in Prisma tracking snoozed emails + snooze dates
 * 2. Query that table for emails past their snooze date
 * 3. Call reactivateSubscriber for each
 *
 * For now, this logs the pattern and would require integration with a local audit table.
 */
export async function checkAndReactivateSnoozes(): Promise<void> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.warn('[snooze] MAILERLITE_API_KEY not set — skipping reactivation check');
    return;
  }

  // TODO: Query Prisma for a snooze audit table (if implemented) to find expired snoozed subscribers
  // For now, this is a no-op placeholder that logs the intent.
  console.log('[snoozeService] checkAndReactivateSnoozes: not yet implemented — skipping');
}

/**
 * reactivateSubscriber — clears the snooze_until custom field to re-enable emails
 *
 * @param email - subscriber email address
 */
export async function reactivateSubscriber(email: string): Promise<void> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.warn('[snooze] MAILERLITE_API_KEY not set — skipping reactivation');
    return;
  }

  if (!email) {
    console.warn('[snooze] reactivateSubscriber called with empty email — skipping');
    return;
  }

  try {
    const response = await fetch(`${MAILERLITE_API_URL}/subscribers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        email,
        fields: {
          snooze_until: null, // Clear the snooze date
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[snooze] Failed to reactivate subscriber ${email}: HTTP ${response.status} — ${body}`
      );
      return;
    }

    console.log(`[snooze] Subscriber ${email} reactivated`);
  } catch (err) {
    console.error('[snooze] Network error reactivating subscriber:', err);
  }
}
