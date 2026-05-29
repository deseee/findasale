import cron from 'node-cron';
import { google } from 'googleapis';
import { cronGuard } from '../utils/cronGuard';
import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { suppressionService } from '../services/suppressionService';
import { batchSyncLeadTiersToMailerLite } from '../services/mailerliteService';

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
      subject: '[Business Name]: built for the volume you run',
      html: '<p>Hi [Business Name],</p><p>We\'ve been talking to organizers in [state] running multiple sale events a month — licensed auctioneers, professional liquidators, consignment shops moving real volume.</p><p>The throughput tools we built for that group:</p><p>• RapidFire phone capture: 100 items in under an hour, tagged and priced as you shoot<br>• Staff accounts: delegate photo, pricing, and listing review work<br>• Printable inventory sheets for sale day<br>• Inventory export to eBay, Shopify, accounting and your other systems anytime</p><p>Your storefront is built and waiting:<br><a href="[preview href]">[preview link]</a></p><p>45-second walkthrough: <a href="[video href]?src=outreach-hot-1">finda.sale/video</a></p><p>The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
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

export const sendOutreachEmails = async (): Promise<void> => {
  console.log('[OutreachCron] Starting email batch send');
  if (process.env.OUTREACH_TEST_EMAIL) {
    console.log(`[OutreachCron] TEST MODE — all sends redirected to ${process.env.OUTREACH_TEST_EMAIL}`);
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
    const dailyQuota = getDailyQuota(daysSinceStart);
    // NOTE: the `/ 6` divisor assumes 6 send windows per day. It is coupled to the
    // every-4-hours workflow cadence (.github/workflows/pipeline-outreach-emails.yml,
    // cron '0 */4 * * *' = 6 runs/day). If that workflow schedule changes, update this
    // divisor to match — otherwise the daily quota will be over- or under-sent.
    const quotaPerWindow = Math.max(1, Math.floor(dailyQuota / 6));
    console.log(`[OutreachCron] Day ${daysSinceStart}, quota: ${dailyQuota}/day, this window: ${quotaPerWindow}`);

    // ADR-075: Base filter criteria (reused across all three leadTier passes)
    const baseWhere = {
      status: { notIn: ['BOUNCED', 'OPTED_OUT', 'CLAIMED'] },
      organizer: {
        directoryStatus: { not: 'CLOSED' },
        // Only legitimate organizer types (estate sale, auction, antique, consignment, etc.).
        // NULL businessCategory is ALSO eligible: those organizers were already filtered at
        // seed time by autoSeedOutreachCron — the existence of a DirectoryClaimEmail row IS
        // the eligibility signal. Excluding NULL silently hid ~1,661 legitimate leads forever.
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
        // Respect suppressOutreach flag
        suppressOutreach: false,
        // Canada outreach is paused by default (OUTREACH_CANADA_ENABLED != 'true').
        // Canadian orgs are identified by province abbreviation or full name in the address field
        // (no country column on Organizer — detection is address-string based).
        // To enable Canada outreach: set OUTREACH_CANADA_ENABLED=true in Railway env vars.
        // Exclude consumer posts from GarageSaleFinder — homeowner yard sale listings,
        // not organizer businesses. Retained for shopper-side discovery; never outreach targets.
        NOT: [
          { directoryMostRecentSource: 'GarageSaleFinder' },
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

    if (hotQuota > 0) {
      const hotRecords = await prisma.directoryClaimEmail.findMany({
        where: {
          ...baseWhere,
          ...exhaustedFilter,
          organizer: { ...baseWhere.organizer, leadTier: 'HOT' },
        },
        include: { organizer: true },
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
        include: { organizer: true },
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
        include: { organizer: true },
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
        include: { organizer: true },
        take: untieredQuota * CANDIDATE_MULTIPLIER,
        orderBy: [{ touch1SentAt: { sort: 'asc', nulls: 'first' } }],
      });
      recordsToSend.push(...untieredRecords);
    }

    console.log(`[OutreachCron] Fetched ${recordsToSend.length} candidates across all tiers (quota: ${quotaPerWindow})`)

    const gmail = createGmailClient();
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
    let sent = 0;
    let failed = 0;

    for (const record of recordsToSend) {
      // Stop once we've hit the per-window quota (candidates pool is larger than quota)
      if (sent >= quotaPerWindow) break;

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

        const touchNum = determineTouchToSend(record);
        if (!touchNum) continue;

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
        const previewLinkRaw = `${frontendUrl}/organizers/${record.organizerId}?utm_source=outreach&utm_medium=email&utm_campaign=touch${touchNum}&utm_content=${tier.toLowerCase()}&ref=outreach`;
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
        const listUnsubscribeHeader = `<mailto:unsubscribe@finda.sale?subject=unsubscribe>, <${unsubscribeLink}>`;

        const rawMessage = buildRawEmail({
          from: `The FindA.Sale Team <${fromEmail}>`,
          to: toEmail,
          subject,
          html: htmlWithPixel,
          listUnsubscribe: listUnsubscribeHeader,
        });

        await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: rawMessage },
        });

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

        const updateData: any = {
          [`touch${touchNum}SentAt`]: new Date(),
          trackingPixelId,
          trackingToken,
          status: 'SENT',
          lastAttemptAt: new Date(),
          attemptCount: { increment: 1 },
          ...(touchNum === 1 && !record.sentAt ? { sentAt: new Date() } : {}),
        };
        await prisma.directoryClaimEmail.update({
          where: { id: record.id },
          data: updateData,
        });

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
      }
    }

    console.log(`[OutreachCron] Batch complete: ${sent} sent, ${failed} failed`);
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
      userId: { not: null },  // Only sync registered users — exclude scraped directory entries
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
      console.log(`[OutreachEmails] Startup catch-up: last send was ${Math.round(hoursSinceLast * 10) / 10}h ago, no catch-up needed`);
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

  // Every 4 hours — spreads daily quota across 6 windows
  cron.schedule('0 */4 * * *', cronGuard({ jobName: 'outreach-emails' }, async () => {    await sendOutreachEmails();
  }), { timezone: 'UTC' });
  console.log('[OutreachCron] Registered — runs every 4 hours UTC');

  // Weekly Sunday 04:00 UTC — sync lead tiers to MailerLite groups (offset from scoring at 02:00 to avoid race)
  cron.schedule('0 4 * * 0', cronGuard({ jobName: 'sync-lead-tier-groups' }, async () => {
    await syncLeadTierGroups();
  }), { timezone: 'UTC' });
  console.log('[OutreachCron] syncLeadTierGroups registered — runs Sundays 04:00 UTC');

  // Startup catch-up: 30s after boot, check if a send window was missed and fire immediately
  setTimeout(() => {
    startupCatchUp();
  }, 30_000);
}
