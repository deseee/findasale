/**
 * SMTP Permutation Verify Job
 *
 * Re-hosted (S1172, Patrick-authorized) from the standalone CLI script
 * `packages/backend/scripts/smtpPermutationVerifier.ts`, which can no longer
 * run at all because its GitHub Actions workflow
 * (`.github/workflows/smtp-permutation-verify.yml`) is untracked in git after
 * the public-repo redaction sweep (S1157/S1171) -- an untracked workflow file
 * never runs on GitHub's side even though it still exists on disk locally.
 *
 * This follows the same "Railway-triggered internal job" pattern as every
 * other pipeline job in `internalJobRunnerController.ts`'s JOB_MAP: the real
 * logic lives here as an exported, callable function (no CLI auto-invoke),
 * and a lightweight GitHub Actions workflow triggers it via a plain curl POST
 * to `/api/internal/jobs/run` -- no checkout, no pnpm install, no direct DB
 * connection from the Actions runner.
 *
 * NOTE (known trade-off, flagged intentionally rather than silently):
 * the original CLI script at `packages/backend/scripts/smtpPermutationVerifier.ts`
 * is left completely UNTOUCHED and still works standalone for manual/local
 * runs (`npx ts-node scripts/smtpPermutationVerifier.ts`). That means the
 * email-permutation/SMTP-probe logic now exists in two places. This was a
 * deliberate choice: the script lives outside `src/` and the backend's
 * tsconfig.json pins `rootDir: "./src"` with an include glob covering everything under src, so a
 * file under `src/` (this file) cannot safely import the opposite direction
 * without risking a `tsc --noEmit` rootDir violation on the mandatory
 * TypeScript check gate. Duplicating instead of restructuring the shared
 * tsconfig was the lower-risk option for a project-code change of this size.
 * Flagged in STATE.md as a "consolidate later" item -- if the CLI script is
 * ever edited, this file must be updated to match, and vice versa.
 */

import { prisma } from '../lib/prisma';
import { randomUUID } from 'crypto';
import * as net from 'net';
import * as dns from 'dns';
import { promisify } from 'util';

/**
 * Auto-queue a newly discovered email into the outreach pipeline.
 * No-op if OUTREACH_ENABLED is not 'true', email is suppressed, or a row already exists.
 */
async function queueForOutreach(organizerId: string, email: string): Promise<void> {
  if (process.env.OUTREACH_ENABLED !== 'true') return;
  try {
    const isSuppressed = await prisma.emailSuppression.findFirst({
      where: { emailAddress: email },
    });
    if (isSuppressed) return;
    const existing = await prisma.directoryClaimEmail.findFirst({
      where: { organizerId },
    });
    if (!existing) {
      await prisma.directoryClaimEmail.create({
        data: {
          organizerId,
          emailAddress: email,
          status: 'PENDING',
          attemptCount: 0,
          trackingPixelId: randomUUID(),
          trackingToken: randomUUID(),
        },
      });
      console.log(`[SMTP] Queued ${email} for outreach (organizer ${organizerId})`);
    }
  } catch (err) {
    console.error(`[SMTP] queueForOutreach error for organizer ${organizerId}:`, err);
  }
}
const resolveMx = promisify(dns.resolveMx);

// ---- Config ----------------------------------------------------------------

const BATCH_SIZE = 500;       // Organizers to process per run
const CONCURRENCY = 5;        // Concurrent SMTP workers (connections are heavier than HTTP)
const SMTP_TIMEOUT_MS = 8000; // Per-connection timeout
const SMTP_VERIFY = (process.env.SMTP_VERIFY ?? 'true') !== 'false';

// Prefixes in priority order — most likely to exist first
const COMMON_PREFIXES = [
  'info',
  'contact',
  'hello',
  'office',
  'admin',
  'booking',
  'sales',
  'inquiries',
  'team',
  'support',
  'mail',
  'us',
  'hire',
  'book',
  'getintouch',
];

// Fake address used for catch-all detection
const CATCH_ALL_PROBE = 'xyzzy_notreal_84729';

// Third-party platform domains — organizer's website points to a platform, not their own domain.
// Probing these finds platform emails, not organizer emails. Skip entirely.
const PLATFORM_DOMAINS = new Set([
  'facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com',
  'youtube.com', 'tiktok.com',
  'ctbids.com',           // Caring Transitions platform
  'hibid.com',            // HiBid auction platform
  'estatesales.net',      // EstateSales.NET
  'estatesales.org',      // EstateSales.org
  'gsalr.com',            // GSALR
  'garagesalefinder.com',
  'estatesale.com',
  'auctionzip.com',
  'proxibid.com',
  'invaluable.com',
  'liveauctioneers.com',
  'biddingowl.com',
  'maxanet.com',
  'linqapp.com',          // Contact link generator — not an email
  'cardscan.com',
  'linktr.ee',
  'bio.link',
  'square.site',
  'squarespace.com',
  'wixsite.com',
]);

// Government, institutional, and large-chain domains — not target organizers
const BLOCKED_EMAIL_SUFFIXES = new Set([
  // US/international government + institutional
  '.gov', '.edu', '.mil',
  // Canadian federal
  '.gc.ca',
  // Canadian provincial/territorial governments
  'gov.bc.ca', 'gov.ab.ca', 'gov.on.ca', 'gov.ns.ca', 'gov.nb.ca',
  'gov.pe.ca', 'gov.nl.ca', 'gov.sk.ca', 'gov.mb.ca', 'gov.nt.ca',
  'gov.nu.ca', 'gov.yk.ca',
  // Large national chains — not independent organizers
  'goodwill.org', 'salvationarmy.org', 'habitatrestore.org',
  'municibid.com', 'govplanet.com', 'publicsurplus.com',
]);

const isBlockedDomain = (email: string): boolean => {
  const lower = email.toLowerCase();
  for (const suffix of BLOCKED_EMAIL_SUFFIXES) {
    if (lower.endsWith(suffix) || lower.includes(`@${suffix}`) || lower.includes(`.${suffix}`)) return true;
  }
  return false;
};

// MX hostnames whose port 25 is reliably blocked from cloud/GitHub Actions runners.
// Fall back to best-guess info@ rather than burning timeout budget.
const BLOCKED_MX_HOSTS = new Set([
  'smtp.secureserver.net',    // GoDaddy
  'mailstore1.secureserver.net',
  'pphosted.com',             // Proofpoint
  'mx1-us1.ppe-hosted.com',   // Proofpoint hosted
  'mx2-us1.ppe-hosted.com',
  'mimecast.com',             // Mimecast
  'us-smtp-inbound-1.mimecast.com',
  'us-smtp-inbound-2.mimecast.com',
  'protection.outlook.com',   // Microsoft 365 (often blocks port 25 probes)
  'mail.protection.outlook.com',
  // Smaller shared hosts confirmed blocked from GitHub Actions/cloud runners
  'hostedemail.com',          // Hosted Email (cust.*.hostedemail.com pattern)
  'ipage.com',                // iPage hosting
  'homesteadmail.com',        // Homestead
  'magicbrain.net',           // Magic Brain hosting
  'inbound.homesteadmail.com',
  'mx.ipage.com',
]);

// ---- Helpers ---------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDomain(websiteUrl: string): string | null {
  try {
    const url = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    const hostname = url.hostname.replace(/^www\./, '');
    // Strip subdomains for platform detection (e.g. foo.hibid.com → hibid.com)
    const parts = hostname.split('.');
    const apex = parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    if (PLATFORM_DOMAINS.has(hostname) || PLATFORM_DOMAINS.has(apex)) return null;
    return hostname;
  } catch {
    return null;
  }
}

function isBlockedMxHost(mxHost: string): boolean {
  const lower = mxHost.toLowerCase();
  for (const blocked of BLOCKED_MX_HOSTS) {
    if (lower === blocked || lower.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

async function processWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number, total: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  let idx = 0;
  const total = items.length;
  async function runSlot(): Promise<void> {
    while (idx < total) {
      const i = idx++;
      await worker(items[i], i, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, runSlot));
}

// ---- MX lookup (cached per domain) ----------------------------------------

const mxCache = new Map<string, string | null>();

async function getMxHost(domain: string): Promise<string | null> {
  if (mxCache.has(domain)) return mxCache.get(domain)!;

  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) {
      mxCache.set(domain, null);
      return null;
    }
    // Pick lowest priority (most preferred) MX record
    records.sort((a, b) => a.priority - b.priority);
    const host = records[0].exchange;
    mxCache.set(domain, host);
    return host;
  } catch {
    mxCache.set(domain, null);
    return null;
  }
}

// ---- SMTP verification -----------------------------------------------------

type SmtpResult = 'accepted' | 'rejected' | 'timeout' | 'error';

function smtpCheck(email: string, mxHost: string): Promise<SmtpResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buffer = '';
    let stage: 'banner' | 'ehlo' | 'mail_from' | 'rcpt_to' | 'done' = 'banner';
    let settled = false;

    function done(result: SmtpResult) {
      if (settled) return;
      settled = true;
      try {
        socket.write('QUIT\r\n');
      } catch { /* ignore */ }
      socket.destroy();
      resolve(result);
    }

    socket.setTimeout(SMTP_TIMEOUT_MS);
    socket.connect(25, mxHost);

    socket.on('data', (chunk) => {
      buffer += chunk.toString();

      // Only process complete lines
      if (!buffer.includes('\n')) return;

      if (stage === 'banner' && /^220[ -]/m.test(buffer)) {
        buffer = '';
        stage = 'ehlo';
        socket.write('EHLO verify.finda.sale\r\n');
        return;
      }

      if (stage === 'ehlo' && /^250[ -]/m.test(buffer)) {
        buffer = '';
        stage = 'mail_from';
        socket.write('MAIL FROM:<verify@finda.sale>\r\n');
        return;
      }

      if (stage === 'mail_from' && /^250[ -]/m.test(buffer)) {
        buffer = '';
        stage = 'rcpt_to';
        socket.write(`RCPT TO:<${email}>\r\n`);
        return;
      }

      if (stage === 'rcpt_to') {
        if (/^250[ -]/m.test(buffer)) {
          stage = 'done';
          done('accepted');
        } else if (/^5\d\d[ -]/m.test(buffer)) {
          stage = 'done';
          done('rejected');
        }
        // 4xx = temporary failure, treat as error
        else if (/^4\d\d[ -]/m.test(buffer)) {
          stage = 'done';
          done('error');
        }
      }
    });

    socket.on('timeout', () => done('timeout'));
    socket.on('error', () => done('error'));
    socket.on('close', () => {
      if (!settled) done('error');
    });
  });
}

/**
 * Verify a single email address.
 * Returns true if the server accepted it AND it's not a catch-all domain.
 * Returns null if catch-all detected (can't verify).
 * Returns false if rejected.
 */
async function verifyEmail(
  email: string,
  domain: string,
  mxHost: string
): Promise<boolean | null> {
  const result = await smtpCheck(email, mxHost);
  if (result !== 'accepted') return false;

  // Catch-all detection: probe with a clearly fake address
  const fakeEmail = `${CATCH_ALL_PROBE}@${domain}`;
  const catchAllResult = await smtpCheck(fakeEmail, mxHost);
  if (catchAllResult === 'accepted') {
    return null; // catch-all — can't trust positive result
  }

  return true;
}

// ---- Best-guess fallback (no SMTP verification) ----------------------------

function bestGuessEmail(domain: string): string {
  return `info@${domain}`;
}

// ---- Main ------------------------------------------------------------------

/**
 * Entry point invoked by internalJobRunnerController.ts's JOB_MAP
 * (key: 'smtp-permutation-verify'). Uses the shared prisma singleton — does
 * NOT disconnect it at the end (unlike the standalone CLI script), since the
 * singleton is shared with the rest of the long-lived backend process.
 */
export async function runSmtpPermutationVerify(): Promise<void> {
  console.log('[SMTP] Starting email permutation verifier...');
  console.log(`[SMTP] Mode: ${SMTP_VERIFY ? 'SMTP verification enabled' : 'best-guess only (no SMTP)'}\n`);

  const startTime = Date.now();
  let found = 0;
  let catchAll = 0;
  let noMx = 0;
  let smtpFail = 0;
  let noMatch = 0;
  let errors = 0;

  // Fetch organizers with website but no email
  const organizers = await prisma.organizer.findMany({
    where: {
      website: { not: null },
      contactEmail: null,
      isUnmanagedListing: true,
      // ADR-075: Only legitimate organizer types (estate sale, auction, antique, consignment, etc.)
      businessCategory: {
        in: [
          'ESTATE_SALE_CO',
          'AUCTION_HOUSE',
          'ANTIQUE_MALL',
          'ANTIQUE_DEALER',
          'CONSIGNMENT',
          'THRIFT_STORE',
          'FLEA_MARKET',
          'VINTAGE',
          'LIQUIDATION',
          'USED_FURNITURE',
          'PAWN_SHOP',
          'USED_BOOKSTORE',
          'RECORD_STORE',
          'USED_ELECTRONICS',
          'COIN_DEALER',
          'RESALE_SHOP',
          'USED_SPORTING_GOODS',
          'JEWELRY_RESALE',
        ],
      },
      // ADR-075: Respect suppressOutreach flag
      suppressOutreach: false,
    },
    select: {
      id: true,
      businessName: true,
      website: true,
    },
    take: BATCH_SIZE,
  });

  const total = organizers.length;
  console.log(`[SMTP] Found ${total} organizers to process\n`);

  if (total === 0) {
    console.log('[SMTP] Nothing to do.');
    return;
  }

  await processWithConcurrency(organizers, async (org, i) => {
    const processed = i + 1;
    const prefix = `[SMTP] (${processed}/${total}) ${org.businessName}`;

    const domain = getDomain(org.website!);
    if (!domain) {
      console.log(`${prefix}: platform domain or invalid URL — skipping`);
      errors++;
      return;
    }

    // Block government, institutional, and large-chain domains
    if (isBlockedDomain(`dummy@${domain}`)) {
      console.log(`${prefix}: blocked domain (government/institutional/chain) — skipping`);
      errors++;
      return;
    }

    // No SMTP mode — write best-guess and move on
    if (!SMTP_VERIFY) {
      const email = bestGuessEmail(domain);
      await prisma.organizer.update({
        where: { id: org.id },
        data: { contactEmail: email },
      });
      await queueForOutreach(org.id, email);
      console.log(`${prefix}: best-guess → ${email}`);
      found++;
      return;
    }

    // Look up MX records
    const mxHost = await getMxHost(domain);
    if (!mxHost) {
      console.log(`${prefix}: no MX record for ${domain}`);
      noMx++;
      return;
    }

    // Known-blocked MX host — fall back to best-guess rather than timing out
    if (isBlockedMxHost(mxHost)) {
      const email = bestGuessEmail(domain);
      await prisma.organizer.update({
        where: { id: org.id },
        data: { contactEmail: email },
      });
      await queueForOutreach(org.id, email);
      console.log(`${prefix}: ${mxHost} blocked from cloud runners → best-guess ${email}`);
      found++;
      return;
    }

    // Try each prefix in order
    let verified = false;

    for (const prefix_ of COMMON_PREFIXES) {
      const email = `${prefix_}@${domain}`;
      let result: boolean | null;

      try {
        result = await verifyEmail(email, domain, mxHost);
      } catch {
        result = false;
      }

      if (result === null) {
        // Catch-all detected on first probe — use info@ as best guess
        const catchAllEmail = `info@${domain}`;
        await prisma.organizer.update({
          where: { id: org.id },
          data: { contactEmail: catchAllEmail },
        });
        await queueForOutreach(org.id, catchAllEmail);
        console.log(`${prefix}: catch-all domain → writing ${catchAllEmail} (unverified)`);
        catchAll++;
        verified = true;
        break;
      }

      if (result === true) {
        await prisma.organizer.update({
          where: { id: org.id },
          data: { contactEmail: email },
        });
        await queueForOutreach(org.id, email);
        console.log(`${prefix}: verified → ${email}`);
        found++;
        verified = true;
        break;
      }

      // Small delay between probes to the same server
      await sleep(300);
    }

    if (!verified) {
      // Check if we got timeouts/errors (port 25 likely blocked)
      const probe = await smtpCheck(`info@${domain}`, mxHost);
      if (probe === 'timeout' || probe === 'error') {
        // Server unreachable — write best-guess rather than lose the organizer
        const email = bestGuessEmail(domain);
        await prisma.organizer.update({
          where: { id: org.id },
          data: { contactEmail: email },
        });
        await queueForOutreach(org.id, email);
        console.log(`${prefix}: SMTP unreachable (${mxHost}) → best-guess ${email}`);
        smtpFail++;
      } else {
        // Server reachable but rejected all prefixes — write info@ as last-resort fallback
        // The domain has active email hosting; info@ is the safest guess
        const email = bestGuessEmail(domain);
        await prisma.organizer.update({
          where: { id: org.id },
          data: { contactEmail: email },
        });
        await queueForOutreach(org.id, email);
        console.log(`${prefix}: no pattern matched, server reachable → fallback ${email}`);
        noMatch++;
      }
    }
  }, CONCURRENCY);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n[SMTP] === SUMMARY ===');
  console.log(`  Verified & written:  ${found}`);
  console.log(`  Catch-all (written): ${catchAll}`);
  console.log(`  No MX record:        ${noMx}`);
  console.log(`  SMTP unreachable (best-guess written): ${smtpFail}`);
  console.log(`  No pattern matched (fallback written): ${noMatch}`);
  console.log(`  Errors:              ${errors}`);
  console.log(`  Duration: ${elapsed}s\n`);

  if (smtpFail > total * 0.5) {
    console.log('[SMTP] WARNING: >50% SMTP failures. Port 25 is likely blocked on this runner.');
    console.log('[SMTP] Run this script locally or set SMTP_VERIFY=false for best-guess mode.\n');
  }
}
