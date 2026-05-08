/**
 * mailerliteService.ts
 * Handles MailerLite API v2 integration for subscriber field updates.
 *
 * Current usage:
 *   - mark organizer as "sale_published" when a sale is published,
 *     triggering the automation exit condition in MailerLite.
 *   - syncLeadTierToMailerLite: assign a directory organizer to the
 *     COLD / WARM / HOT MailerLite group based on their leadTier.
 *
 * API docs: https://developers.mailerlite.com/docs/subscribers
 * Base URL: https://connect.mailerlite.com/api
 */

const MAILERLITE_API_URL = 'https://connect.mailerlite.com/api';

function getApiKey(): string | null {
  return process.env.MAILERLITE_API_KEY || null;
}

/**
 * markSalePublished — sets the `sale_published` custom field on a MailerLite subscriber.
 *
 * Called when an organizer publishes their first (or any) sale.
 * This triggers the exit condition in the Beta Organizer Onboarding automation.
 *
 * @param organizerEmail - the organizer's email address (MailerLite subscriber email)
 */
export async function markSalePublished(organizerEmail: string): Promise<void> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.warn('[mailerlite] MAILERLITE_API_KEY not set — skipping sale_published field update');
    return;
  }

  if (!organizerEmail) {
    console.warn('[mailerlite] markSalePublished called with empty email — skipping');
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
        email: organizerEmail,
        fields: {
          sale_published: 'yes',
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[mailerlite] Failed to update subscriber ${organizerEmail}: HTTP ${response.status} — ${body}`);
      return;
    }

    console.log(`[mailerlite] sale_published field set for ${organizerEmail}`);
  } catch (err) {
    // Non-critical — do not throw; log and continue
    console.error('[mailerlite] Network error updating subscriber field:', err);
  }
}

/**
 * addShopperSubscriber — adds a shopper to the Weekly Digest subscribers group.
 *
 * Called when a shopper (role === 'USER') registers, to enroll them in the weekly
 * personalized sale picks email digest.
 *
 * @param email - the shopper's email address
 * @param name - the shopper's name
 */
export async function addShopperSubscriber(email: string, name: string): Promise<void> {
  const apiKey = getApiKey();
  const groupId = process.env.MAILERLITE_SHOPPERS_GROUP_ID;

  if (!apiKey) {
    console.warn('[mailerlite] MAILERLITE_API_KEY not set — skipping shopper subscription');
    return;
  }

  if (!groupId) {
    console.warn('[mailerlite] MAILERLITE_SHOPPERS_GROUP_ID not set — skipping shopper subscription');
    return;
  }

  if (!email) {
    console.warn('[mailerlite] addShopperSubscriber called with empty email — skipping');
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
        name,
        groups: [groupId],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[mailerlite] Failed to add shopper subscriber ${email}: HTTP ${response.status} — ${body}`);
      return;
    }

    console.log(`[mailerlite] Shopper ${email} added to weekly digest group`);
  } catch (err) {
    // Non-critical — do not throw; log and continue
    console.error('[mailerlite] Network error adding shopper subscriber:', err);
  }
}

/**
 * addOrganizerSubscriber — adds an organizer to the Beta Organizer Onboarding automation.
 *
 * Called when an organizer (role === 'ORGANIZER') registers, to enroll them in the
 * onboarding automation drip sequence. The automation exits when the organizer publishes
 * their first sale (via markSalePublished).
 *
 * @param email - the organizer's email address
 * @param name - the organizer's name
 */
export async function addOrganizerSubscriber(email: string, name: string): Promise<void> {
  const apiKey = getApiKey();
  const groupId = process.env.MAILERLITE_ORGANIZERS_GROUP_ID;

  if (!apiKey) {
    console.warn('[mailerlite] MAILERLITE_API_KEY not set — skipping organizer subscription');
    return;
  }

  if (!groupId) {
    console.warn('[mailerlite] MAILERLITE_ORGANIZERS_GROUP_ID not set — skipping organizer subscription');
    return;
  }

  if (!email) {
    console.warn('[mailerlite] addOrganizerSubscriber called with empty email — skipping');
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
        name,
        groups: [groupId],
        fields: {
          sale_published: 'no',
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[mailerlite] Failed to add organizer subscriber ${email}: HTTP ${response.status} — ${body}`);
      return;
    }

    console.log(`[mailerlite] Organizer ${email} added to onboarding automation group`);
  } catch (err) {
    // Non-critical — do not throw; log and continue
    console.error('[mailerlite] Network error adding organizer subscriber:', err);
  }
}

/**
 * syncLeadTierToMailerLite — upserts a directory organizer into the correct
 * lead-tier MailerLite group (COLD / WARM / HOT).
 *
 * Uses the MailerLite v2 subscriber upsert endpoint with `groups` array.
 * The API adds the subscriber to the group if not already present and
 * creates the subscriber record if it doesn't exist.
 *
 * ENTERPRISE organizers are intentionally skipped — they receive manual outreach.
 *
 * Required env vars:
 *   MAILERLITE_COLD_GROUP_ID
 *   MAILERLITE_WARM_GROUP_ID
 *   MAILERLITE_HOT_GROUP_ID
 *
 * @param email     - organizer's contact email (contactEmail field on Organizer)
 * @param leadTier  - "COLD" | "WARM" | "HOT" | "ENTERPRISE" | null
 * @param orgId     - organizer ID, used only for logging
 */
export async function syncLeadTierToMailerLite(
  email: string,
  leadTier: string | null,
  orgId: string,
): Promise<void> {
  if (!email) {
    console.warn(`[mailerlite:leadSync] Skipping org:${orgId} — no contact email`);
    return;
  }

  if (!leadTier || leadTier === 'ENTERPRISE') {
    // ENTERPRISE is handled manually; null means not yet scored — skip both
    return;
  }

  const groupIdMap: Record<string, string | undefined> = {
    COLD: process.env.MAILERLITE_COLD_GROUP_ID,
    WARM: process.env.MAILERLITE_WARM_GROUP_ID,
    HOT:  process.env.MAILERLITE_HOT_GROUP_ID,
  };

  const groupId = groupIdMap[leadTier];

  if (!groupId) {
    console.warn(`[mailerlite:leadSync] MAILERLITE_${leadTier}_GROUP_ID not set — skipping org:${orgId}`);
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[mailerlite:leadSync] MAILERLITE_API_KEY not set — skipping lead tier sync');
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
        groups: [groupId],
        fields: {
          lead_tier: leadTier,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[mailerlite:leadSync] Failed to sync org:${orgId} (${leadTier}) — HTTP ${response.status}: ${body}`,
      );
      return;
    }

    console.log(`[mailerlite:leadSync] org:${orgId} → ${leadTier} group (${groupId})`);
  } catch (err) {
    // Non-critical — do not throw; caller logs and continues
    console.error(`[mailerlite:leadSync] Network error syncing org:${orgId}:`, err);
  }
}
