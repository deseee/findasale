import cron from 'node-cron';
import { google } from 'googleapis';
import { cronGuard } from '../utils/cronGuard';
import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { suppressionService, isEmailDomainBlocked } from '../services/suppressionService';
import { isGenericEmail } from '../services/emailProvenance';
import { domainCanReceiveMail } from '../lib/mxValidator';
import { batchSyncLeadTiersToMailerLite } from '../services/mailerliteService';
import { checkAndIncrementQuota, getDailyEmailCount, QuotaExceededError } from '../lib/emailService';

// Tier-specific T1 templates (strategy doc §2.1–2.3). T2–T4 are shared across tiers.
// Token format: [Token Name] — replaced by renderTemplate() below.
// Available tokens: Business Name, state, preview link, video link, unsubscribe link, physical address
const TEMPLATES: Record<string, Record<string, { subject: string; html: string }>> = {
  COLD: {
    touch1: {
      subject: 'Shoppers in [state] are already looking for what you sell',
      html: '<p>Hi [Business Name],</p><p>Right now, people in [state] are searching for estate sales, yard sales, auctions, and consignment finds. They\'re typing the search. They\'re scrolling ebay and Facebook groups. They\'re refreshing.</p><p>They just can\'t find your inventory in one place.</p><p>We\'ve built [Business Name] a storefront on FindA.Sale. One page where your inventory can live, discoverable by the shoppers already looking.</p><p>See your storefront:<br><a href="[preview href]">[preview link]</a></p><p>Or watch the 45-second walkthrough: <a href="[video href]?src=outreach-cold-1">finda.sale/video</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch2: {
      subject: 'Five places to find one dresser',
      html: '<p>Hi [Business Name],</p><p>A shopper in [state] looking for what you sell visits five places: Facebook Marketplace, Craigslist, eBay, the sale listing directories, and Google. By the time they find you (if they find you) they\'ve usually bought from someone else.</p><p>The fix is one place where your inventory can live, always discoverable to shoppers already searching.</p><p>Your storefront is already built:<br><a href="[preview href]">[preview link]</a></p><p>45-second walkthrough: <a href="[video href]?src=outreach-cold-2">finda.sale/video</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch3: {
      subject: 'The reason most organizers haven\'t listed yet',
      html: '<p>Hi [Business Name],</p><p>If you\'re like most organizers we talk to, the reason you haven\'t started listing online is time. Pricing everything, writing descriptions, taking decent photos, it\'s hours per sale you don\'t have.</p><p>So we built it to take none of that. Point your phone camera at an item. It tags itself, suggests a price, drops into your storefront. Twenty items in twenty minutes.</p><p>See it work: <a href="[video href]?src=outreach-cold-3">finda.sale/video</a></p><p>Your storefront:<br><a href="[preview href]">[preview link]</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch4: {
      subject: 'Leaving your storefront here',
      html: '<p>Hi [Business Name],</p><p>Last note from us.</p><p>[Business Name]\'s storefront stays up whether you claim it or not. If a moment comes when listing online makes sense (different season, slower week, new inventory) it\'s already there.</p><p>Storefront:<br><a href="[preview href]">[preview link]</a></p><p>Walkthrough: <a href="[video href]?src=outreach-cold-4">finda.sale/video</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
  },
  WARM: {
    touch1: {
      subject: 'We built [Business Name] a storefront',
      html: '<p>Hi [Business Name],</p><p>We\'ve been mapping [state]\'s active estate sale, yard sale, auction, and consignment organizers. Your name kept coming up.</p><p>So we built [Business Name] a storefront on FindA.Sale. One place where your inventory can live, so shoppers can browse everything you\'re selling without hunting across five platforms.</p><p>It\'s already set up. You just need to claim it.</p><p>See your storefront:<br><a href="[preview href]">[preview link]</a></p><p>45-second walkthrough: <a href="[video href]?src=outreach-warm-1">finda.sale/video</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch2: {
      subject: 'What shoppers search for, what they find',
      html: '<p>Hi [Business Name],</p><p>Quick thought on what FindA.Sale changes for a business like yours.</p><p>Your shoppers are searching by item, not by sale. Someone wants a mid-century dresser, a Snap-on socket set, a Pyrex set in good shape. They search the item. Most secondary-market platforms surface big retailers and individual listings, not organizer inventory.</p><p>Your storefront puts your inventory in front of those searches.</p><p>Your storefront:<br><a href="[preview href]">[preview link]</a></p><p>Walkthrough: <a href="[video href]?src=outreach-warm-2">finda.sale/video</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch3: {
      subject: 'Two reasons you haven\'t claimed yet',
      html: '<p>Hi [Business Name],</p><p>You looked at the email but didn\'t click through. Probably one of two reasons.</p><p>Either claiming a storefront sounds like work, or you don\'t know what shows up there until you do.</p><p>It\'s neither. Your storefront is already populated with the public info we found on your business. Claiming it means clicking one link, confirming your email, and adding items when you have time.</p><p>Claim in 30 seconds:<br><a href="[preview href]">[preview link]</a></p><p>Or see it first: <a href="[video href]?src=outreach-warm-3">finda.sale/video</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch4: {
      subject: 'Your storefront stays live',
      html: '<p>Hi [Business Name],</p><p>Last note.</p><p>[Business Name]\'s storefront stays live. Nothing expires, nothing gets reassigned. If listing online makes sense for a future sale, you can claim it then.</p><p>Storefront:<br><a href="[preview href]">[preview link]</a></p><p>Walkthrough: <a href="[video href]?src=outreach-warm-4">finda.sale/video</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
  },
  HOT: {
    touch1: {
      subject: '[Business Name]: built for the volume you\'re running in [state]',
      html: '<p>Hi [Business Name],</p><p>We track sale activity across [state]. You\'re in the group running real, consistent volume — the kind where standard listing tools stop keeping up.</p><p>What we built for that level:</p><p>• RapidFire phone capture — 100 items tagged and priced as you shoot, not at a desk afterward<br>• Staff accounts — delegate photos and listing review without sharing your login<br>• Printable inventory sheets for sale day<br>• Export to eBay, Shopify, and accounting platforms anytime</p><p>Buyers who find you on FindA.Sale can follow your profile — they see your next sale the moment it goes live, not if they catch a Facebook post in time.</p><p>Your storefront is built:<br><a href="[preview href]">[preview link]</a></p><p>45-second walkthrough: <a href="[video href]?src=outreach-hot-1">finda.sale/video</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch2: {
      subject: 'Why repeat buyers stop showing up',
      html: '<p>Hi [Business Name],</p><p>Quick thought on what a persistent storefront changes for a high-volume operation.</p><p>Right now, every sale you run is its own discovery problem. New flyers, new posts, new Facebook events, new email to your list. Inventory from your last sale is invisible the day after.</p><p>Your storefront keeps everything you\'ve ever listed discoverable. Shoppers searching for a specific item find it whether the sale was last week or last month. Repeat buyers come back to one place.</p><p>Storefront:<br><a href="[preview href]">[preview link]</a></p><p>Walkthrough: <a href="[video href]?src=outreach-hot-2">finda.sale/video</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch3: {
      subject: 'Runs alongside what you already do',
      html: '<p>Hi [Business Name],</p><p>Two emails, two opens, no clicks. Fair guess: you have a system that works and adding another platform sounds like learning curve you don\'t need.</p><p>FindA.Sale isn\'t replacing what you do. It makes everything you do faster. Photos taken on your phone push into your storefront automatically. Sale-day exports go to spreadsheets, eBay, Shopify, or print. Your team can use it without onboarding training.</p><p>See the workflow in 45 seconds: <a href="[video href]?src=outreach-hot-3">finda.sale/video</a></p><p>Your storefront:<br><a href="[preview href]">[preview link]</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch4: {
      subject: 'Here when a sale comes up that needs it',
      html: '<p>Hi [Business Name],</p><p>Last note from us.</p><p>You run a serious operation. We built FindA.Sale for organizers exactly at your volume, and we\'ll be here when a sale comes up where a public, persistent inventory page helps you move more.</p><p>Storefront:<br><a href="[preview href]">[preview link]</a></p><p>Walkthrough: <a href="[video href]?src=outreach-hot-4">finda.sale/video</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
  },
};

const getDailyQuota = (daysSinceStart: number): number => {
  if (daysSinceStart <= 7) return 20;
  if (daysSinceStart <= 14) return 50;
  if (daysSinceStart <= 21) return 100;
  return 200;
};

const createGmailClient = () => {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    throw new Error('Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN');
  }
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
};

/**
 * RFC 2047 encode a header value if it contains non-ASCII characters.
 */
function encodeSubject(subject: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
}

/**
 * Convert HTML to plain text for the text/plain MIME part.
 * Strips tags, decodes common HTML entities, collapses whitespace.
 */
const htmlToPlainText = (html: string): string => {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
};

/**
 * Build an RFC 2822 raw email message string with proper MIME headers.
 * Returns base64url-encoded string ready for Gmail API.
 */
const buildRawEmail = (opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  listUnsubscribe: string;
}): string => {
  const boundary = `boundary_${uuid().replace(/-/g, '')}`;
  const plainText = htmlToPlainText(opts.html);
  const plainBase64 = Buffer.from(plainText, 'utf-8').toString('base64');
  const htmlBase64 = Buffer.from(opts.html, 'utf-8').toString('base64');
  const rawLines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `List-Unsubscribe: ${opts.listUnsubscribe}`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    '',
    plainBase64,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    '',
    htmlBase64,
    '',
    `--${boundary}--`,
  ];
  const rawEmail = rawLines.join('\r\n');
  return Buffer.from(rawEmail).toString('base64url');
};

/**
 * Determine whether a Gmail send error is a rate/limit/throttle/quota signal that
 * should trigger the day-stop backoff. Inline matcher (the outreach send rail is
 * Gmail-only; previously this lived in the now-removed outreachSender lib).
 * Matches Gmail API HTTP 429 + "reached a limit for sending mail" style messages.
 */
function isOutreachLimitError(err: any): boolean {
  const status = err?.code ?? err?.responseCode ?? err?.response?.status;
  const msg: string = err?.message || err?.response || '';
  if (status === 429) return true;
  return /rate|too many|throttl|limit|quota|exceeded/i.test(String(msg));
}

const escapeHtml = (str: string): string => {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

const renderTemplate = (template: string, variables: Record<string, string>): string => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    // replaceAll — placeholders like [preview link] appear twice (href AND visible text)
    result = result.split(`[${key}]`).join(value);
  }
  return result;
};

const MIN_DAYS: Record<number, number> = { 2: 3, 3: 5, 4: 7 };

const determineTouchToSend = (record: any): number | null => {
  const now = new Date();
  const daysSince = (from: Date | null | undefined): number =>
    from ? (now.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24) : Infinity;

  if (!record.touch1SentAt) return 1;
  if (!record.touch2SentAt && daysSince(record.touch1SentAt) >= MIN_DAYS[2]) return 2;
  if (!record.touch3SentAt && record.touch2SentAt && daysSince(record.touch2SentAt) >= MIN_DAYS[3]) return 3;
  if (!record.touch4SentAt && record.touch3SentAt && daysSince(record.touch3SentAt) >= MIN_DAYS[4]) return 4;
  return null;
};

// In-process overlap guard. The internal job runner has its own runningJobs lock,
// but the manual route (/api/internal/outreach/send) and any other direct caller
// bypass it — two concurrent runs would both fetch the same NULL-touch candidates
// and double-send. This flag serializes runs within one process.
let sendRunInProgress = false;

export const sendOutreachEmails = async (): Promise<void> => {
  // HARD KILL SWITCH (incident 2026-05-18: Gmail sending clamp from duplicate blasts).
  // The OUTREACH_ENABLED gate previously existed only at cron registration — every
  // direct caller (internal job runner, manual route, startup catch-up) bypassed it.
  // This check makes the env var an actual kill switch for ALL trigger paths.
  if (process.env.OUTREACH_ENABLED !== 'true') {
    console.log('[OutreachCron] OUTREACH_ENABLED is not true — aborting send run');
    return;
  }
  if (sendRunInProgress) {
    console.warn('[OutreachCron] A send run is already in progress — aborting overlapping run');
    return;
  }
  sendRunInProgress = true;
  try {
    await sendOutreachEmailsInner();
  } finally {
    sendRunInProgress = false;
  }
};

const sendOutreachEmailsInner = async (): Promise<void> => {
  console.log('[OutreachCron] Starting email batch send');
  if (process.env.OUTREACH_TEST_EMAIL) {
    console.log(`[OutreachCron] TEST MODE — all sends redirected to ${process.env.OUTREACH_TEST_EMAIL}`);
  }

  // Pre-run quota check — abort the entire window if the binding daily cap is already
  // reached. The binding cap is min(OUTREACH_DAILY_CAP, GMAIL_DAILY_HARD_LIMIT): the
  // outreach sender is reputation-throttled FAR below the hard limit, so the smaller
  // OUTREACH_DAILY_CAP (default 75) is what actually protects us (incident 2026-06-21).
  try {
    const quota = await getDailyEmailCount();
    const outreachCap = Math.max(1, parseInt(process.env.OUTREACH_DAILY_CAP || '75', 10));
    const hardLimit = parseInt(process.env.GMAIL_DAILY_HARD_LIMIT || '1500', 10);
    const bindingCap = Math.min(outreachCap, hardLimit);
    if (quota.sent >= bindingCap) {
      console.error(`[OutreachCron] ABORT: daily attempts already at ${quota.sent}/${bindingCap} (outreachCap=${outreachCap}) — no sends this window`);
      return;
    }
    console.log(`[OutreachCron] Quota check: ${quota.sent}/${bindingCap} attempts used`);
  } catch (err) {
    console.error('[OutreachCron] Quota pre-check failed — proceeding with caution:', err);
  }

  try {
    // Email links must resolve in recipients' inboxes — localhost fallback would silently break in production.
    // Backend routes (/api/outreach/pixel, /api/outreach/unsubscribe) live on Railway, not Vercel.
    // Resolution order:
    //   1. RAILWAY_BACKEND_URL — manual override (matches the convention used by 7 scraper scripts)
    //   2. BACKEND_URL — generic override
    //   3. RAILWAY_PUBLIC_DOMAIN — Railway auto-injects this (no manual setup needed)
    const backendUrl =
      process.env.RAILWAY_BACKEND_URL ||
      process.env.BACKEND_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);
    if (!backendUrl) {
      console.error('[OutreachCron] ABORT: no backend URL available (RAILWAY_BACKEND_URL / BACKEND_URL / RAILWAY_PUBLIC_DOMAIN all unset). Cannot generate tracking URLs for outbound emails.');
      return;
    }
    const frontendUrl = process.env.FRONTEND_URL || 'https://finda.sale';
    const WARMUP_START = new Date(process.env.OUTREACH_WARMUP_START_DATE || '2026-05-06');
    const today = new Date();
    const daysSinceStart = Math.floor((today.getTime() - WARMUP_START.getTime()) / (1000 * 60 * 60 * 24));
    const warmupQuota = getDailyQuota(daysSinceStart);

    // TACTICAL CAP (incident 2026-06-21): outreach@finda.sale is reputation-throttled by
    // Google to ~200-300 sends/day — FAR below the GMAIL_DAILY_HARD_LIMIT (1500) the quota
    // guard assumes. On 2026-06-21 ~305 attempts ran and 136 hit Gmail's "reached a limit
    // for sending mail" daily clamp and were never delivered. OUTREACH_DAILY_CAP (default 75)
    // is the real binding limit; it must never be exceeded by SEND ATTEMPTS in a UTC day.
    const outreachDailyCap = Math.max(1, parseInt(process.env.OUTREACH_DAILY_CAP || '75', 10));
    const gmailHardLimit = parseInt(process.env.GMAIL_DAILY_HARD_LIMIT || '1500', 10);
    // The binding daily limit is the SMALLER of the outreach cap and the global hard limit,
    // also never above the warmup ramp.
    const dailyCap = Math.min(outreachDailyCap, gmailHardLimit, warmupQuota);

    // How many sends have already been ATTEMPTED today (DB-backed, survives restarts).
    // EmailQuotaLog.count is incremented on every attempt via checkAndIncrementQuota, so
    // it reflects attempts across all 6 windows of the UTC day — not just this window.
    let attemptsToday = 0;
    try {
      const q = await getDailyEmailCount();
      attemptsToday = q.sent;
    } catch (err) {
      console.error('[OutreachCron] Could not read daily attempt count — assuming 0:', err);
    }

    // Remaining headroom for the whole day. Once this hits 0, no window may send.
    const remainingToday = Math.max(0, dailyCap - attemptsToday);

    // NOTE: the `/ 6` divisor assumes 6 send windows per day (every-4-hours GH Actions
    // cadence, .github/workflows/pipeline-outreach-emails.yml). Per-window slice is bounded
    // by remainingToday so catch-up / overlapping windows can never push the day past the cap.
    const perWindowSlice = Math.max(1, Math.floor(dailyCap / 6));
    const quotaPerWindow = Math.min(perWindowSlice, remainingToday);
    console.log(`[OutreachCron] Day ${daysSinceStart}, daily cap: ${dailyCap} (outreachCap=${outreachDailyCap}, hardLimit=${gmailHardLimit}, warmup=${warmupQuota}), attempts today: ${attemptsToday}, remaining: ${remainingToday}, this window: ${quotaPerWindow}`);

    if (quotaPerWindow <= 0) {
      console.log(`[OutreachCron] Daily cap reached (${attemptsToday}/${dailyCap} attempts) — no sends this window`);
      return;
    }

    // ADR-075: Base filter criteria (reused across all three leadTier passes)
    const baseWhere = {
      status: { notIn: ['BOUNCED', 'OPTED_OUT', 'CLAIMED', 'ARCHIVED'] },
      organizer: {
        directoryStatus: { not: 'CLOSED' },
        // BUG FIX (S948): Null-safe GarageSaleFinder exclusion.
        // The original `NOT: [{ directoryMostRecentSource: 'GarageSaleFinder' }]` generated
        // SQL: `NOT (directoryMostRecentSource = 'GarageSaleFinder')` which evaluates to
        // `NOT NULL = NULL` (falsy) for records where directoryMostRecentSource IS NULL,
        // silently excluding every null-source US organizer from all tier passes.
        // 22 organizers were stuck for up to 31 days (May 11–June 11 2026).
        // Fix: nest in AND + null-safe OR so null-source records pass the check correctly.
        AND: [
          {
            // Exclude GarageSaleFinder (consumer homeowner posts, not organizer businesses).
            // NULL source must pass — those are legitimate leads with no source attribution.
            OR: [
              { directoryMostRecentSource: null },
              { directoryMostRecentSource: { not: 'GarageSaleFinder' } },
            ],
          },
          {
            // Only legitimate organizer types. NULL businessCategory is ALSO eligible:
            // seeded organizers without a category still qualify — their existence in
            // DirectoryClaimEmail IS the eligibility signal. Excluding NULL silently
            // hid ~1,661 legitimate leads forever (prior fix).
            OR: [
              {
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
              },
              { businessCategory: null },
            ],
          },
        ],
        // Respect suppressOutreach flag
        suppressOutreach: false,
        // EMAIL-VERIFICATION GATE (bounce-incident fix, Jun 2026): only send to organizers
        // whose contactEmail was discovered by a verified method with sufficient confidence.
        // Excludes emailDiscoveryMethod IS NULL (13.7k legacy unprovenanced guesses),
        // 'directory_listing', 'unverified_import', 'low_confidence_mismatch', and any record
        // below 0.5 confidence. Unverified guesses stay in the DB but are NOT emailed until
        // rediscover-null-method-emails re-verifies them. This is what stopped the 15-28%
        // bounce rate that triggered the Google abuse clamp on outreach@finda.sale.
        emailDiscoveryMethod: { in: ['website_scrape', 'whois_rdap', 'smtp_pattern', 'sale_description'] },
        emailDiscoveryConfidence: { gte: 0.5 },
        // Canada outreach is paused by default (OUTREACH_CANADA_ENABLED != 'true').
        // Canadian orgs are identified by province abbreviation or full name in the address field
        // (no country column on Organizer — detection is address-string based).
        // To enable Canada outreach: set OUTREACH_CANADA_ENABLED=true in Railway env vars.
        NOT: [
          ...(process.env.OUTREACH_CANADA_ENABLED === 'true' ? [] : [
            { address: { contains: ', ON', mode: 'insensitive' } },
            { address: { contains: ', BC', mode: 'insensitive' } },
            { address: { contains: ', AB', mode: 'insensitive' } },
            { address: { contains: ', MB', mode: 'insensitive' } },
            { address: { contains: ', SK', mode: 'insensitive' } },
            { address: { contains: ', QC', mode: 'insensitive' } },
            { address: { contains: ', NS', mode: 'insensitive' } },
            { address: { contains: ', NB', mode: 'insensitive' } },
            { address: { contains: ', NL', mode: 'insensitive' } },
            { address: { contains: ', PE', mode: 'insensitive' } },
            { address: { contains: ', YT', mode: 'insensitive' } },
            { address: { contains: ', NT', mode: 'insensitive' } },
            { address: { contains: ', NU', mode: 'insensitive' } },
            { address: { contains: 'Ontario', mode: 'insensitive' } },
            { address: { contains: 'British Columbia', mode: 'insensitive' } },
            { address: { contains: 'Alberta', mode: 'insensitive' } },
            { address: { contains: 'Canada', mode: 'insensitive' } },
          ] as const),
        ],
      },
    };

    // Allocate quota proportionally: HOT 40%, WARM 35%, COLD 25% (floor 1 each)
    const hotQuota = Math.max(1, Math.floor(quotaPerWindow * 0.4));
    const warmQuota = Math.max(1, Math.floor(quotaPerWindow * 0.35));
    const coldQuota = Math.max(1, Math.floor(quotaPerWindow * 0.25));
    const untieredQuota = quotaPerWindow - (hotQuota + warmQuota + coldQuota);

    // BUG FIX (S751): Previous queries used `take: tierQuota` which fetched only
    // N records per tier. Records waiting between touches (e.g. touch1 sent yesterday,
    // touch2 not due for 2 more days) consumed those N slots but got skipped by
    // determineTouchToSend — starving the queue. Only ~2/day were sending instead of 50.
    //
    // Fix: Fetch a larger candidate pool (10x quota) per tier so waiting records don't
    // block fresh ones. Exclude fully-exhausted records (touch4SentAt != null).
    // Order by touch1SentAt asc (nulls first in Postgres) so untouched records get
    // priority. The send loop enforces the actual quota cap.
    const CANDIDATE_MULTIPLIER = 10;
    const exhaustedFilter = { touch4SentAt: null }; // exclude records that finished all 4 touches

    // Three-pass query: HOT → WARM → COLD, then fallback to untiered/ENTERPRISE if quota remains
    const recordsToSend: any[] = [];

    // Sentry slow query fix (2026-06-05): `include: { organizer: true }` was fetching all
    // 80+ Organizer columns for every candidate record. The send loop only needs 4 organizer
    // fields. Replaced with explicit select to eliminate the full table scan on Organizer
    // and reduce per-row data transfer from ~4 KB to ~150 bytes.
    const OUTREACH_SELECT = {
      id: true,
      organizerId: true,
      emailAddress: true,
      sentAt: true,
      touch1SentAt: true,
      touch2SentAt: true,
      touch3SentAt: true,
      touch4SentAt: true,
      organizer: {
        select: {
          leadTier: true,
          licenseState: true,
          address: true,
          businessName: true,
        },
      },
    } as const;

    if (hotQuota > 0) {
      const hotRecords = await prisma.directoryClaimEmail.findMany({
        where: {
          ...baseWhere,
          ...exhaustedFilter,
          organizer: { ...baseWhere.organizer, leadTier: 'HOT' },
        },
        select: OUTREACH_SELECT,
        take: hotQuota * CANDIDATE_MULTIPLIER,
        orderBy: [{ touch1SentAt: { sort: 'asc', nulls: 'first' } }],
      });
      recordsToSend.push(...hotRecords);
    }

    if (warmQuota > 0) {
      const warmRecords = await prisma.directoryClaimEmail.findMany({
        where: {
          ...baseWhere,
          ...exhaustedFilter,
          organizer: { ...baseWhere.organizer, leadTier: 'WARM' },
        },
        select: OUTREACH_SELECT,
        take: warmQuota * CANDIDATE_MULTIPLIER,
        orderBy: [{ touch1SentAt: { sort: 'asc', nulls: 'first' } }],
      });
      recordsToSend.push(...warmRecords);
    }

    if (coldQuota > 0) {
      const coldRecords = await prisma.directoryClaimEmail.findMany({
        where: {
          ...baseWhere,
          ...exhaustedFilter,
          organizer: { ...baseWhere.organizer, leadTier: 'COLD' },
        },
        select: OUTREACH_SELECT,
        take: coldQuota * CANDIDATE_MULTIPLIER,
        orderBy: [{ touch1SentAt: { sort: 'asc', nulls: 'first' } }],
      });
      recordsToSend.push(...coldRecords);
    }

    // Fallback: fill remaining quota with ENTERPRISE or untiered (leadTier IS NULL)
    if (untieredQuota > 0) {
      // baseWhere.organizer already owns an `OR` (the businessCategory filter).
      // A second top-level `OR` here would silently overwrite it, so the leadTier
      // condition is combined via `AND` to preserve the category filter.
      const untieredRecords = await prisma.directoryClaimEmail.findMany({
        where: {
          ...baseWhere,
          ...exhaustedFilter,
          organizer: {
            ...baseWhere.organizer,
            AND: [{ OR: [{ leadTier: 'ENTERPRISE' }, { leadTier: null }] }],
          },
        },
        select: OUTREACH_SELECT,
        take: untieredQuota * CANDIDATE_MULTIPLIER,
        orderBy: [{ touch1SentAt: { sort: 'asc', nulls: 'first' } }],
      });
      recordsToSend.push(...untieredRecords);
    }

    console.log(`[OutreachCron] Fetched ${recordsToSend.length} candidates across all tiers (quota: ${quotaPerWindow})`)

    // Deduplicate by emailAddress across all tier buckets — keep the most-progressed record
    // (highest touch number sent) so we never send two emails to the same address in one window.
    // In test mode the effective address is OUTREACH_TEST_EMAIL for all records, so dedup by
    // the real emailAddress (not the redirected address) to avoid sending only one email total.
    const seenEmails = new Set<string>();
    const dedupedRecords = recordsToSend
      .sort((a, b) => {
        // Higher touch count = more progressed; sort descending so first-seen wins
        const touchCount = (r: any) =>
          (r.touch1SentAt ? 1 : 0) + (r.touch2SentAt ? 1 : 0) +
          (r.touch3SentAt ? 1 : 0) + (r.touch4SentAt ? 1 : 0);
        return touchCount(b) - touchCount(a);
      })
      .filter(record => {
        const email = record.emailAddress.toLowerCase();
        if (seenEmails.has(email)) return false;
        seenEmails.add(email);
        return true;
      });

    if (dedupedRecords.length < recordsToSend.length) {
      console.log(`[OutreachCron] Deduped ${recordsToSend.length - dedupedRecords.length} duplicate email address(es) from candidate pool`);
    }

    const gmail = createGmailClient();
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
    let sent = 0;
    let failed = 0;
    let limitHit = false;

    for (const record of dedupedRecords) {
      // Stop once we've hit the per-window quota (candidates pool is larger than quota)
      if (sent >= quotaPerWindow) break;

      // Declared outside the try so the catch block's BOUNCED audit entry can
      // reference it (catch blocks cannot see const declarations inside the try).
      let touchNum: number | null = null;
      try {
        const isSuppressed = await suppressionService.isSuppressed(record.emailAddress);
        if (isSuppressed) {
          console.log(`[OutreachCron] Skipped org:${record.organizerId} (suppressed)`);
          continue;
        }

        // Second safety net: skip government/institutional/chain domains
        const emailDomain = record.emailAddress.toLowerCase();
        const blockedSuffixes = ['.gov', '.edu', '.mil', '.gc.ca', 'gov.bc.ca', 'gov.ab.ca',
          'gov.on.ca', 'gov.ns.ca', 'gov.nb.ca', 'gov.pe.ca', 'gov.nl.ca', 'gov.sk.ca',
          'gov.mb.ca', 'gov.nt.ca', 'gov.nu.ca', 'gov.yk.ca', 'goodwill.org',
          'salvationarmy.org', 'habitatrestore.org', 'municibid.com', 'govplanet.com', 'publicsurplus.com'];
        if (blockedSuffixes.some(s => emailDomain.endsWith(s) || emailDomain.includes(`.${s}`))) {
          console.log(`[OutreachCron] Skipped org:${record.organizerId} — blocked domain`);
          continue;
        }

        // Third safety net: unsendable/reserved TLDs (e.g. .ofc, .local) — no valid mail
        // server exists. Catches scraped placeholder emails that slipped past seeding filters.
        const emailTld = record.emailAddress.split('.').pop()?.toLowerCase() ?? '';
        const UNSENDABLE_TLDS = new Set([
          'ofc', 'local', 'internal', 'test', 'example', 'localhost',
          'invalid', 'fake', 'corp', 'lan', 'home', 'localdomain',
        ]);
        if (UNSENDABLE_TLDS.has(emailTld)) {
          console.warn(`[OutreachCron] Skipped org:${record.organizerId} — unsendable TLD .${emailTld}; suppressing`);
          await suppressionService.addSuppression(record.emailAddress, 'manual', { organizerId: record.organizerId });
          continue;
        }

        // Fourth safety net: well-known placeholder local-part patterns (e.g. john.doe, first.last).
        // These are template/dummy addresses scraped from websites that were never filled in.
        const emailAtIdx = record.emailAddress.indexOf('@');
        const emailLocal = emailAtIdx >= 0 ? record.emailAddress.substring(0, emailAtIdx).toLowerCase() : '';
        const PLACEHOLDER_LOCALS = new Set([
          'john.doe', 'jane.doe', 'first.last', 'firstname.lastname',
          'firstname', 'lastname', 'name.surname', 'my.email',
        ]);
        if (PLACEHOLDER_LOCALS.has(emailLocal)) {
          console.warn(`[OutreachCron] Skipped org:${record.organizerId} — placeholder local-part "${emailLocal}"; suppressing`);
          await suppressionService.addSuppression(record.emailAddress, 'manual', { organizerId: record.organizerId });
          continue;
        }

        // Fifth safety net (bounce-incident fix): generic mailbox prefixes (info@, admin@,
        // hello@, sales@, …). These were the bulk of the wrong-entity guesses that bounced.
        // Belt-and-suspenders to the verified-method query gate above — skip without suppressing,
        // since the same address could later be re-discovered as a real per-person inbox.
        if (isGenericEmail(record.emailAddress)) {
          console.warn(`[OutreachCron] Skipped org:${record.organizerId} — generic mailbox prefix`);
          continue;
        }

        touchNum = determineTouchToSend(record);
        if (!touchNum) continue;

        // DB-backed cross-run dedup: if another row with the same emailAddress has already
        // had this touch sent (in a previous run window), mark this row as sent too and skip.
        // This prevents two DirectoryClaimEmail rows for the same address from each independently
        // sending touch N in different 4-hour windows — the in-memory seenEmails Set only
        // dedups within a single run; this check covers across runs.
        const relevantTouchField = `touch${touchNum}SentAt` as const;
        const alreadySentByOtherRow = await prisma.directoryClaimEmail.findFirst({
          where: {
            emailAddress: record.emailAddress,
            id: { not: record.id },
            [relevantTouchField]: { not: null },
          },
          select: { id: true },
        });
        if (alreadySentByOtherRow) {
          console.log(`[OutreachCron] Cross-run dedup: org:${record.organizerId} touch${touchNum} already sent via row ${alreadySentByOtherRow.id} — marking and skipping`);
          await prisma.directoryClaimEmail.update({
            where: { id: record.id },
            data: { [relevantTouchField]: new Date() },
          });
          continue;
        }

        const outreachSecret = process.env.OUTREACH_SECRET;
        if (!outreachSecret) throw new Error('OUTREACH_SECRET env var is required');

        // Use opaque UUID only (no PII in URLs — email goes in signed JWT token instead)
        const trackingPixelId = uuid();
        const trackingToken = jwt.sign(
          { organizerId: record.organizerId, email: record.emailAddress },
          outreachSecret,
          { expiresIn: '90d' }
        );

        // Select tier-specific template — fall back to COLD if tier is unset or unrecognised
        const tier = (record.organizer.leadTier || 'COLD').toUpperCase();
        const tierTemplates = TEMPLATES[tier] ?? TEMPLATES['COLD'];
        const template = tierTemplates[`touch${touchNum}`];
        const previewLinkRaw = `${frontendUrl}/organizers/${record.organizerId}?fsa_src=outreach&fsa_med=email&fsa_cmp=touch${touchNum}&fsa_cnt=${tier.toLowerCase()}&ref=outreach`;
        const previewLink = previewLinkRaw;
        const videoLink = `${frontendUrl}/video`;
        const previewHref = `${backendUrl}/api/outreach/click?trackingId=${encodeURIComponent(trackingToken)}&original=${encodeURIComponent(previewLink)}`;
        const videoHref = `${backendUrl}/api/outreach/click?trackingId=${encodeURIComponent(trackingToken)}&original=${encodeURIComponent(videoLink)}`;
        const unsubscribeLink = `${backendUrl}/api/outreach/unsubscribe?token=${trackingToken}`;
        const trackingPixelUrl = `${backendUrl}/api/outreach/pixel?trackingId=${trackingPixelId}`;
        const physicalAddress = process.env.OUTREACH_PHYSICAL_ADDRESS || '219 E Michigan Ave, Suite F, Paw Paw, MI 49079';

        // Resolve the [state] token. licenseState is NULL for the entire scraped
        // outreach queue, so fall back to parsing the trailing 2-letter code from
        // the address (e.g. "Clayton, AL" -> "AL"). If neither source yields a
        // state, SKIP the row — sending an email with a blank [state] token
        // ("Shoppers in  are already looking") is worse than skipping.
        // Normalize dotted territory abbreviations before regex matching.
        const normalizeDottedState = (s: string) =>
          s.replace(/Washington,?\s*D\.C\./gi, 'Washington, DC')
           .replace(/\bD\.C\./gi, 'DC')
           .replace(/\bP\.R\./gi, 'PR')
           .replace(/\bU\.S\.V\.I\./gi, 'VI')
           .replace(/\bG\.U\./gi, 'GU')
           .replace(/\bA\.S\./gi, 'AS');
        const licenseState = normalizeDottedState((record.organizer.licenseState || '').trim());
        const normalizedAddress = normalizeDottedState(record.organizer.address || '');
        const addressStateMatch = normalizedAddress.match(/,\s*([A-Z]{2})\s*(?:\d{5}(?:-\d{4})?)?\s*$/i);
        const resolvedState = licenseState || (addressStateMatch ? addressStateMatch[1] : '');
        if (!resolvedState) {
          console.log(`[OutreachCron] Skipped org:${record.organizerId} — no state resolvable (licenseState NULL, address="${record.organizer.address}")`);
          continue;
        }
        const stateValue = escapeHtml(resolvedState);

        const html = renderTemplate(template.html, {
          'Business Name': escapeHtml(record.organizer.businessName || 'Your Business'),
          'state': stateValue,
          'preview link': previewLink,
          'preview href': previewHref,
          'video link': videoLink,
          'video href': videoHref,
          'unsubscribe link': unsubscribeLink,
          'physical address': escapeHtml(physicalAddress),
        });

        const subject = renderTemplate(template.subject, {
          'Business Name': escapeHtml((record.organizer.businessName || 'Your Business').replace(/[\r\n\t]/g, ' ')),
          'state': stateValue,
        });

        // Append tracking pixel — templates don't include <body> tags, so just concat
        const htmlWithPixel = `${html}<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

        // FROM uses OUTREACH_FROM_EMAIL if set, else falls back to outreach@finda.sale.
        // Required when authenticating via OAuth2 as the Workspace user (outreach@finda.sale)
        // but sending FROM a brand-aligned alias on the subdomain whose SPF/DKIM is configured
        // (e.g. find@outreach.finda.sale).
        const fromEmail = process.env.OUTREACH_FROM_EMAIL || 'outreach@finda.sale';
        const toEmail = process.env.OUTREACH_TEST_EMAIL || record.emailAddress;

        // HARD GUARD (defense-in-depth): the central emailService choke-point is
        // bypassed here because this cron calls gmail.users.messages.send directly.
        // Skip placeholder/blocked recipients (e.g. scraper+<slug>@system.finda.sale)
        // BEFORE the atomic claim and quota increment so no SENT row is written and
        // quota is not consumed. Sending to these produced a Google DSN bounce flood.
        if (isEmailDomainBlocked(toEmail)) {
          console.warn('[OutreachCron] Skipped blocked/placeholder recipient:', toEmail);
          continue;
        }

        // PRE-SEND MX CHECK (bounce-rate guard — top Gmail-reputation signal).
        // Scraped directory domains frequently have NO MX record (cannot receive
        // mail) and hard-bounce every send ("DNS Error: no MX"). Verify the domain
        // can receive mail BEFORE the atomic claim + quota increment so no SENT row
        // is written and no quota is consumed on a guaranteed-undeliverable address.
        // Fails OPEN on transient lookup errors (handled inside domainCanReceiveMail).
        const mxCheck = await domainCanReceiveMail(toEmail);
        if (!mxCheck.ok) {
          const category = mxCheck.reason || 'NO_MX'; // 'NO_MX' | 'NXDOMAIN'
          // Permanent suppression: the domain genuinely cannot receive mail.
          await suppressionService.addSuppression(toEmail, 'hard_bounce', { organizerId: record.organizerId });
          // Record the classification fields (addSuppression's metadata does not set these).
          await prisma.emailSuppression.update({
            where: { emailAddress: toEmail.toLowerCase() },
            data: {
              bounceCategory: category,
              bounceHard: true,
              diagnosticCode: 'pre-send MX check: no MX record',
              classifiedAt: new Date(),
            },
          }).catch((updErr: any) => {
            console.error('[OutreachCron] Failed to set MX classification fields for', toEmail, '—', updErr?.message);
          });
          console.log(`[OutreachCron] Skipped ${toEmail} — domain has no MX (pre-send), suppressed ${category}`);
          continue;
        }
        const listUnsubscribeHeader = `<mailto:unsubscribe@finda.sale?subject=unsubscribe>, <${unsubscribeLink}>`;

        const rawMessage = buildRawEmail({
          from: `The FindA.Sale Team <${fromEmail}>`,
          to: toEmail,
          subject,
          html: htmlWithPixel,
          listUnsubscribe: listUnsubscribeHeader,
        });

        // ATOMIC CLAIM BEFORE SEND (incident 2026-05-18: duplicate touch blasts).
        // Previously the row was marked sent AFTER the Gmail send — a crash, restart,
        // or failed update between send and mark left the row eligible and the next
        // window re-sent the same touch (audit log showed 3x touch-1 SENT for rows
        // whose touch1SentAt was never persisted). Marking first via a conditional
        // updateMany makes the claim atomic: if another concurrent run (or a prior
        // run) already set this touch's timestamp, count === 0 and we skip without
        // sending. Failure mode is now "one email possibly not sent" (recoverable)
        // instead of "same email sent repeatedly" (Gmail sending clamp).
        const claimed = await prisma.directoryClaimEmail.updateMany({
          where: {
            id: record.id,
            [`touch${touchNum}SentAt`]: null,
          },
          data: {
            [`touch${touchNum}SentAt`]: new Date(),
            trackingPixelId,
            trackingToken,
            status: 'SENT',
            lastAttemptAt: new Date(),
            attemptCount: { increment: 1 },
            ...(touchNum === 1 && !record.sentAt ? { sentAt: new Date() } : {}),
          },
        });
        if (claimed.count === 0) {
          console.log(`[OutreachCron] Claim lost for org:${record.organizerId} touch${touchNum} — already sent by a concurrent/prior run, skipping`);
          continue;
        }

        // Quota gate — throws QuotaExceededError if daily hard limit reached.
        // Must come before gmail.users.messages.send to prevent over-sending.
        try {
          await checkAndIncrementQuota('outreachEmailsCron', toEmail);
        } catch (quotaErr) {
          if (quotaErr instanceof QuotaExceededError) {
            console.error(`[OutreachCron] QUOTA EXCEEDED — aborting remaining sends for this window`);
            break;
          }
          throw quotaErr;
        }

        try {
          await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: rawMessage },
          });
        } catch (sendErr: any) {
          // LIMIT-AWARE BACKOFF (incident 2026-06-21). A throttled Gmail sender gets clamped:
          //   - Gmail: "You have reached a limit for sending mail." (HTTP 429 / 4xx)
          // isOutreachLimitError matches the Gmail clamp. When it fires, STOP immediately and
          // prevent any further sends for the rest of the UTC day. NO-MIGRATION mechanism:
          // force today's EmailQuotaLog.count up to the daily cap so the next window's
          // remaining-headroom check returns 0.
          const sendStatus = sendErr?.code ?? sendErr?.responseCode ?? sendErr?.response?.status;
          const sendMsg = sendErr?.message || '';
          if (isOutreachLimitError(sendErr)) {
            console.warn(`[OutreachCron] Outreach send-limit hit (gmail) — backing off for the day (status=${sendStatus}, msg="${sendMsg}")`);
            try {
              // Pin today's counter to the cap so under-cap checks block subsequent sends.
              await prisma.emailQuotaLog.upsert({
                where: { date: new Date().toISOString().slice(0, 10) },
                update: { count: dailyCap },
                create: { date: new Date().toISOString().slice(0, 10), count: dailyCap },
              });
            } catch (pinErr) {
              console.error('[OutreachCron] Failed to pin EmailQuotaLog count on backoff:', pinErr);
            }
            limitHit = true;
            break; // stop the send loop entirely
          }
          throw sendErr; // non-limit failure — let the outer catch log it as a send error
        }

        // Log SENT event for CAN-SPAM audit trail
        try {
          await prisma.outreachAuditLog.create({
            data: {
              organizerId: record.organizerId,
              event: 'SENT',
              touchNumber: touchNum,
            },
          });
        } catch (auditErr: any) {
          console.error('[OutreachAudit] Failed to log SENT event for org:', record.organizerId, '—', auditErr.message);
        }

        sent++;
        console.log(`[OutreachCron] Sent Touch ${touchNum} to ${record.organizerId}`);

        // Rate-limit guard: Gmail allows ~1 send/second per user; without this
        // delay the loop fires 21 sends in ~300ms and every one hits
        // "User-rate limit exceeded". 1100ms gives ~10% headroom.
        await sleep(1100);
      } catch (err: any) {
        failed++;
        // SECURITY FIX P3: Only log the error message, not the full error object which may contain transport config with credentials
        const errorMsg = err.message || 'Unknown error';
        console.error(`[OutreachCron] Failed to send to ${record.organizerId} — ${errorMsg}`);
        // Log BOUNCED event to audit log for deliverability tracking
        // Uses BOUNCED enum value (no FAILED value in OutreachAuditEvent); metadata distinguishes send errors from SMTP bounces
        try {
          await prisma.outreachAuditLog.create({
            data: {
              organizerId: record.organizerId,
              event: 'BOUNCED',
              touchNumber: touchNum ?? 0,
              metadata: { failureType: 'SEND_ERROR', errorMessage: err.message || 'Unknown error' },
            },
          });
        } catch (auditErr: any) {
          console.error('[OutreachAudit] Failed to log BOUNCED event:', auditErr.message);
        }
      }
    }

    console.log(`[OutreachCron] Batch complete: ${sent} sent, ${failed} failed${limitHit ? ' — backed off after Gmail send-limit hit' : ''}`);
  } catch (err) {
    console.error('[OutreachCron] Batch failed:', err);
  }
};

/**
 * syncLeadTierGroups — weekly job that syncs Organizer.leadTier to the
 * matching MailerLite group (COLD / WARM / HOT).
 *
 * Previously sent one HTTP request per organizer, generating thousands of 429
 * errors when scoring jobs ran over 55k+ organizers. Now uses
 * batchSyncLeadTiersToMailerLite which POSTs to MailerLite's bulk import
 * endpoint in batches of 500 with 500ms inter-batch delay and Retry-After
 * aware retry logic.
 *
 * Syncs all organizers that:
 *   - have a valid contactEmail
 *   - have a non-null, non-ENTERPRISE leadTier
 *   - were scored in the past 7 days (lastScoredAt > now - 7d)
 *
 * Runs weekly on Sundays at 04:00 UTC via initOutreachEmailsCron.
 */
export async function syncLeadTierGroups(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Fetch all recently-scored organizers with an email and a lead tier.
  // ENTERPRISE/null filtering and group assignment happen inside batchSyncLeadTiersToMailerLite.
  const organizers = await prisma.organizer.findMany({
    where: {
      contactEmail: { not: null },
      leadTier: { not: null },
      lastScoredAt: { gte: sevenDaysAgo },
      // NOTE: Organizer.userId is a required (non-null) column, so every row is a registered user; the prior { not: null } filter was a no-op and is a type error against the non-nullable StringFilter.
    },
    select: { id: true, contactEmail: true, leadTier: true },
  });

  console.log(`[syncLeadTierGroups] ${organizers.length} organizers fetched — starting batch sync`);

  const { synced, skipped, failed } = await batchSyncLeadTiersToMailerLite(organizers);

  console.log(`[syncLeadTierGroups] Complete: ${synced} synced, ${skipped} skipped, ${failed} failed`);
}

/**
 * startupCatchUp — fires once on boot after a 30s delay.
 * If the most recent send was >5 hours ago, immediately triggers one send window
 * so Railway deploys/restarts don't leave the queue idle until the next GH Actions trigger.
 */
export async function startupCatchUp(): Promise<void> {
  try {
    const lastSent = await prisma.directoryClaimEmail.findFirst({
      where: { sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });

    const hoursSinceLast = lastSent?.sentAt
      ? (Date.now() - new Date(lastSent.sentAt).getTime()) / (1000 * 60 * 60)
      : Infinity;

    if (hoursSinceLast > 5) {
      console.log(`[OutreachEmails] Startup catch-up: last send was ${Math.round(hoursSinceLast)}h ago, firing immediate window`);
      await sendOutreachEmails();
    } else {
      console.log(`[OutreachEmails] Startup catch-up: last send was ${Math.round(hoursSinceLast * 10) / 10}hago, no catch-up needed`);
    }
  } catch (err: any) {
    console.error('[OutreachEmails] Startup catch-up failed:', err.message);
  }
}

/**
 * initOutreachEmailsCron — registers outreach email jobs in the cron scheduler.
 *
 * sendOutreachEmails: runs every 4 hours (6 windows/day) to distribute the daily quota.
 * syncLeadTierGroups: runs weekly on Sundays at 04:00 UTC.
 *
 * Both gates on OUTREACH_ENABLED=true.
 */
export function initOutreachEmailsCron(): void {
  if (process.env.OUTREACH_ENABLED !== 'true') {
    console.log('[OutreachCron] Disabled — set OUTREACH_ENABLED=true to activate');
    return;
  }

  // sendOutreachEmails scheduling removed — GitHub Actions is the durable trigger (S725 Step 3)
  console.log('[OutreachCron] sendOutreachEmails scheduling removed — GitHub Actions is the durable trigger (S725 Step 3)');

  // Weekly Sunday 04:00 UTC — sync lead tiers to MailerLite groups (offset from scoring at 02:00 to avoid race)
  cron.schedule('0 4 * * 0', cronGuard({ jobName: 'sync-lead-tier-groups' }, async () => {
    await syncLeadTierGroups();
  }), { timezone: 'UTC' });
  console.log('[OutreachCron] syncLeadTierGroups registered — runs Sundays 04:00 UTC');
}
