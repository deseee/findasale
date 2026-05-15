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
 * syncLeadTierToMailerLite — upserts a single directory organizer into the correct
 * lead-tier MailerLite group (COLD / WARM / HOT).
 *
 * Kept for one-off / ad-hoc use. For bulk sync jobs use batchSyncLeadTiersToMailerLite.
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

// ---------------------------------------------------------------------------
// Batch helpers
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;           // MailerLite import endpoint accepts up to 1,000; 500 is safe
const BATCH_DELAY_MS = 500;       // 500 ms between batches — stays well under rate limits
const MAX_RETRIES = 3;            // Retry count per batch on 429 / 5xx
const RETRY_FALLBACK_MS = 60_000; // Wait this long if Retry-After header is absent on 429

/** Sleep helper */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * sendBatchImport — POSTs one batch to MailerLite's v3 bulk import endpoint.
 *
 * Endpoint: POST /api/subscribers/import
 * Docs: https://developers.mailerlite.com/docs/subscribers#import-subscribers
 *
 * The import endpoint accepts up to 1,000 subscribers per request and queues
 * the import asynchronously. It returns 200/201 immediately; per-subscriber
 * errors surface in the async import result (not in the HTTP response body),
 * so a 2xx response is treated as success.
 *
 * Retries on 429 (rate limit) and 5xx (transient server errors):
 *   - Reads Retry-After header (seconds) on 429; falls back to RETRY_FALLBACK_MS.
 *   - Waits, then re-sends the same batch.
 *   - Throws after MAX_RETRIES to let the caller log and continue.
 */
async function sendBatchImport(
  subscribers: Array<{ email: string; groups: string[]; fields: Record<string, string> }>,
  apiKey: string,
  batchIndex: number,
): Promise<void> {
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;

    const response = await fetch(`${MAILERLITE_API_URL}/subscribers/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ subscribers }),
    });

    if (response.ok) {
      // 200 or 201 — batch accepted by MailerLite
      return;
    }

    if (response.status === 429 || response.status >= 500) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const waitMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : RETRY_FALLBACK_MS;

      console.warn(
        `[mailerlite:batchSync] Batch ${batchIndex} attempt ${attempt}/${MAX_RETRIES} — ` +
        `HTTP ${response.status}, waiting ${waitMs}ms before retry`,
      );

      if (attempt < MAX_RETRIES) {
        await sleep(waitMs);
        continue;
      }
    }

    // 4xx (other than 429) or exhausted retries — give up on this batch
    const body = await response.text().catch(() => '(unreadable)');
    throw new Error(`HTTP ${response.status} after ${attempt} attempt(s): ${body}`);
  }
}

/**
 * batchSyncLeadTiersToMailerLite — bulk-syncs an array of organizers to their
 * corresponding MailerLite lead-tier groups (COLD / WARM / HOT).
 *
 * Replaces the one-at-a-time loop in syncLeadTierGroups. Sends organizers in
 * batches of BATCH_SIZE (500) with a BATCH_DELAY_MS (500 ms) pause between
 * requests to stay within MailerLite's rate limits. Retries on 429 using the
 * Retry-After response header.
 *
 * ENTERPRISE and null-tier organizers are filtered out before batching.
 *
 * @param organizers - array of { id, contactEmail, leadTier } objects (from Prisma)
 * @returns { synced, skipped, failed } counts
 */
export async function batchSyncLeadTiersToMailerLite(
  organizers: Array<{ id: string; contactEmail: string | null; leadTier: string | null }>,
): Promise<{ synced: number; skipped: number; failed: number }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[mailerlite:batchSync] MAILERLITE_API_KEY not set — skipping batch sync');
    return { synced: 0, skipped: organizers.length, failed: 0 };
  }

  const groupIdMap: Record<string, string | undefined> = {
    COLD: process.env.MAILERLITE_COLD_GROUP_ID,
    WARM: process.env.MAILERLITE_WARM_GROUP_ID,
    HOT:  process.env.MAILERLITE_HOT_GROUP_ID,
  };

  // Pre-filter: remove organizers we cannot sync (no email, ENTERPRISE, null tier, missing group env)
  type Eligible = { email: string; groupId: string; leadTier: string };
  const eligible: Eligible[] = [];
  let skipped = 0;

  for (const org of organizers) {
    if (!org.contactEmail) { skipped++; continue; }
    if (!org.leadTier || org.leadTier === 'ENTERPRISE') { skipped++; continue; }
    const groupId = groupIdMap[org.leadTier];
    if (!groupId) {
      console.warn(`[mailerlite:batchSync] MAILERLITE_${org.leadTier}_GROUP_ID not set — skipping org:${org.id}`);
      skipped++;
      continue;
    }
    eligible.push({ email: org.contactEmail, groupId, leadTier: org.leadTier });
  }

  if (eligible.length === 0) {
    console.log('[mailerlite:batchSync] No eligible organizers after filtering');
    return { synced: 0, skipped, failed: 0 };
  }

  console.log(
    `[mailerlite:batchSync] ${eligible.length} eligible organizers → ` +
    `${Math.ceil(eligible.length / BATCH_SIZE)} batch(es) of up to ${BATCH_SIZE}`,
  );

  let synced = 0;
  let failed = 0;
  let batchIndex = 0;

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    batchIndex++;
    const chunk = eligible.slice(i, i + BATCH_SIZE);

    const subscribers = chunk.map(({ email, groupId, leadTier }) => ({
      email,
      groups: [groupId],
      fields: { lead_tier: leadTier },
    }));

    try {
      await sendBatchImport(subscribers, apiKey, batchIndex);
      synced += chunk.length;
      console.log(
        `[mailerlite:batchSync] Batch ${batchIndex} — sent ${chunk.length} subscribers ` +
        `(total synced so far: ${synced})`,
      );
    } catch (err: any) {
      failed += chunk.length;
      console.error(
        `[mailerlite:batchSync] Batch ${batchIndex} failed — ${chunk.length} organizers not synced: ` +
        err.message,
      );
    }

    // Pause between batches (skip delay after the final batch)
    if (i + BATCH_SIZE < eligible.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return { synced, skipped, failed };
}
