#!/usr/bin/env node
/**
 * outreach-mailbox-ops.js — Gmail API ops for the outreach@finda.sale Workspace mailbox.
 *
 * WHY: bounce-back notifications from the abandoned-signup nudge ("You're one step
 * from going live") piled up after the Jun-6 Workspace sending-limit hit. This is the
 * targeted bulk-cleanup job (NOT a blanket inbox delete) + the auto-forward enabler so
 * we stop missing bounces/notices from this address.
 *
 * AUTH: reads GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_MAILBOX_REFRESH_TOKEN from env
 * (falls back to GMAIL_REFRESH_TOKEN). GMAIL_MAILBOX_REFRESH_TOKEN needs the full
 * https://mail.google.com/ scope for trash/forwarding ops. Run on Railway:
 *
 *     railway run --service backend node scripts/outreach-mailbox-ops.js trash --dry-run
 *     railway run --service backend node scripts/outreach-mailbox-ops.js trash --apply
 *     railway run --service backend node scripts/outreach-mailbox-ops.js enable-forwarding
 *
 * SCOPE NOTE: trash/forwarding need gmail.modify + gmail.settings.basic (or full
 * https://mail.google.com/). If the refresh token is send-only you'll get a 403 —
 * re-mint the token with the broader scope (the prior bulk-delete job worked, so it
 * should already have it).
 *
 * SAFETY: 'trash' targets ONLY messages matching QUERY below and moves them to Trash
 * (recoverable 30 days) — it does not permanently delete and does not touch anything
 * outside the query. Defaults to --dry-run; you must pass --apply to make changes.
 */

const { google } = require('googleapis');

// --- Targeted query — by sender + exact bounce subject. NOT a blanket inbox match. ---
const QUERY = 'from:mailer-daemon subject:"one step from going live"';
const FORWARD_TO = 'deseee@gmail.com';

function gmailClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_MAILBOX_REFRESH_TOKEN, GMAIL_REFRESH_TOKEN } = process.env;
  const token = GMAIL_MAILBOX_REFRESH_TOKEN || GMAIL_REFRESH_TOKEN;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !token) {
    throw new Error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_MAILBOX_REFRESH_TOKEN (or GMAIL_REFRESH_TOKEN) in env.');
  }
  const oauth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: token });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

async function listAllIds(gmail, q) {
  const ids = [];
  let pageToken;
  do {
    const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 500, pageToken });
    (res.data.messages || []).forEach((m) => ids.push(m.id));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function trash({ apply }) {
  const gmail = gmailClient();
  const ids = await listAllIds(gmail, QUERY);
  console.log(`[trash] Query: ${QUERY}`);
  console.log(`[trash] Matched ${ids.length} message(s).`);
  if (!ids.length) return;
  if (!apply) {
    console.log('[trash] DRY RUN — no changes. Re-run with --apply to move these to Trash.');
    return;
  }
  // batchModify adds the TRASH label (reversible). Max 1000 ids per call.
  for (let i = 0; i < ids.length; i += 1000) {
    const batch = ids.slice(i, i + 1000);
    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: { ids: batch, addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] },
    });
    console.log(`[trash] Moved ${Math.min(i + 1000, ids.length)}/${ids.length} to Trash...`);
  }
  console.log(`[trash] Done. ${ids.length} bounce notification(s) moved to Trash (recoverable 30 days).`);
}

async function enableForwarding() {
  const gmail = gmailClient();
  // Address must already be verified (Patrick confirmed the code). This enables
  // "Forward a copy" and keeps Gmail's copy in the inbox.
  const existing = await gmail.users.settings.forwardingAddresses.list({ userId: 'me' });
  const has = (existing.data.forwardingAddresses || []).some(
    (a) => a.forwardingEmail === FORWARD_TO && a.verificationStatus === 'accepted'
  );
  if (!has) {
    console.log(`[forwarding] ${FORWARD_TO} is not yet a VERIFIED forwarding address on this mailbox.`);
    console.log('[forwarding] Add + verify it first (Settings > Forwarding), then re-run.');
    return;
  }
  await gmail.users.settings.updateAutoForwarding({
    userId: 'me',
    requestBody: { enabled: true, emailAddress: FORWARD_TO, disposition: 'leaveInInbox' },
  });
  console.log(`[forwarding] Auto-forwarding ENABLED → ${FORWARD_TO} (Gmail keeps its own copy).`);
}

(async () => {
  const mode = process.argv[2];
  const apply = process.argv.includes('--apply');
  try {
    if (mode === 'trash') await trash({ apply });
    else if (mode === 'enable-forwarding') await enableForwarding();
    else {
      console.log('Usage:');
      console.log('  node scripts/outreach-mailbox-ops.js trash --dry-run   # count matches, no changes');
      console.log('  node scripts/outreach-mailbox-ops.js trash --apply     # move matches to Trash');
      console.log('  node scripts/outreach-mailbox-ops.js enable-forwarding # turn on auto-forward to ' + FORWARD_TO);
      process.exit(1);
    }
  } catch (err) {
    console.error('[error]', err.message);
    process.exit(1);
  }
})();
