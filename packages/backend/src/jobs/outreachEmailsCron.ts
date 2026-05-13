import cron from 'node-cron';
import { google } from 'googleapis';
import { cronGuard } from '../utils/cronGuard';
import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { suppressionService } from '../services/suppressionService';
import { syncLeadTierToMailerLite } from '../services/mailerliteService';

// Tier-specific T1 templates (strategy doc §2.1–2.3). T2–T4 are shared across tiers.
// Token format: [Token Name] — replaced by renderTemplate() below.
// Available tokens: Business Name, state, preview link, video link, unsubscribe link, physical address
const TEMPLATES: Record<string, Record<string, { subject: string; html: string }>> = {
  COLD: {
    touch1: {
      subject: 'You have something people want — let\'s help you sell it',
      html: '<p>Hi [Business Name],</p><p>We found your [state] business running estate sales, yard sales, auctions, or consignment.</p><p>And we built something for people exactly like you.</p><p>It\'s a marketplace where you list once, and shoppers come find you. No commission until you sell. No monthly fee. You keep your data.</p><p><strong>How it works:</strong></p><p>1. List your items with a phone camera. Our system tags them automatically so shoppers can find exactly what they want.<br>2. Shoppers reserve items or bid. You collect money, pack, or have them pick up.<br>3. Settle up in your dashboard. See which items sold, profit per item, hold deposit from each shopper.</p><p>We\'re handling 8,000+ sales a month. Estate sale organizers are moving 30–100 items per week through the platform.</p><p>Your free storefront is ready to claim:<br><a href="[preview link]">[preview link]</a></p><p>Or see the 45-second walkthrough first: <a href="[video link]?src=outreach-cold-1">finda.sale/video</a></p><p>No obligation. You\'re already selling — we just make it easier.</p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch2: {
      subject: 'One thing we left out',
      html: '<p>Hi [Business Name],</p><p>I sent you an email last week about FindA.Sale and didn\'t get a response.</p><p>You might have been busy. Or maybe the first email didn\'t land right. So I\'m sending this one.</p><p>One thing I didn\'t mention: it\'s completely free to try.</p><p>List one item. See if it sells. Then decide if the platform is worth your time.</p><p>Zero risk. You don\'t pay anything unless an item sells. We keep 10%.</p><p>If you want to give it a shot:<br><a href="[preview link]">[preview link]</a></p><p>Or see the 45-second walkthrough first: <a href="[video link]?src=outreach-cold-2">finda.sale/video</a></p><p>Or if now\'s not the right time, just let me know and I\'ll stop emailing.</p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch3: {
      subject: 'Quick question from [Business Name]\'s biggest competitor',
      html: '<p>Hi [Business Name],</p><p>You opened my email but didn\'t click through.</p><p>So maybe the pitch wasn\'t compelling. Let me try a different angle.</p><p>Here\'s the thing: right now, shoppers are searching for what you sell on Google and eBay. But they\'re not finding your inventory. They\'re finding your competitors instead.</p><p>FindA.Sale exists to fix that.</p><p>When you list on our platform, we surface your items to shoppers actively looking for estate sales, auctions, and used goods in [state]. The people who buy from you <em>want</em> what you\'re selling.</p><p>Claim your storefront (takes 30 seconds):<br><a href="[preview link]">[preview link]</a></p><p>Or see the 45-second walkthrough first: <a href="[video link]?src=outreach-cold-3">finda.sale/video</a></p><p>Then add 3 items from your next sale. If no one buys, you lose nothing. If someone does, you pocket 90%.</p><p>No risk. No monthly subscription. No data lock-in.</p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch4: {
      subject: 'One last thought',
      html: '<p>Hi [Business Name],</p><p>This is my last email. I promise.</p><p>I\'ve reached out a few times because I genuinely think FindA.Sale can help you reach more customers. But maybe the timing isn\'t right, or maybe online listing isn\'t for you.</p><p>No judgment either way.</p><p>But before I let you go: if you ever get curious — about how the platform works, what the 10% split looks like, whether it\'s worth trying — just reply to this email. I\'ll answer within a day.</p><p>Your storefront is ready whenever you change your mind:<br><a href="[preview link]">[preview link]</a></p><p>If you\'d rather just see what the platform does: <a href="[video link]?src=outreach-cold-4">finda.sale/video</a> (45 seconds)</p><p>Good luck with your sales.</p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
  },
  WARM: {
    touch1: {
      subject: 'We built [Business Name] a free storefront',
      html: '<p>Hi [Business Name],</p><p>We\'ve been researching [state] estate sale organizers and found your business. So we built you a free storefront on FindA.Sale.</p><p>Your items are already getting some exposure on Google or local listings. We\'ve created a dedicated channel where your inventory lives in one place — and shoppers can discover all of it at once.</p><p><strong>What we built for you:</strong></p><p>• 1 listing, discovered everywhere (phone camera with smart tags)<br>• Shoppers reserve or bid directly (deposits held by us, not you)<br>• Dashboard shows profit per item, hold status, payout calendar<br>• Export your catalog to eBay, Amazon, or anywhere anytime</p><p>You own your data. We only take 10% when something sells.</p><p>See your storefront here:<br><a href="[preview link]">[preview link]</a></p><p>Or see the 45-second walkthrough first: <a href="[video link]?src=outreach-warm-1">finda.sale/video</a></p><p>It\'s ready to go live whenever you want. Just claim it, add a few items, and start selling.</p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch2: {
      subject: 'One thing we left out',
      html: '<p>Hi [Business Name],</p><p>I sent you an email last week about FindA.Sale and didn\'t get a response.</p><p>You might have been busy. Or maybe the first email didn\'t land right. So I\'m sending this one.</p><p>One thing I didn\'t mention: it\'s completely free to try.</p><p>List one item. See if it sells. Then decide if the platform is worth your time.</p><p>Zero risk. You don\'t pay anything unless an item sells. We keep 10%.</p><p>Take a look at your storefront:<br><a href="[preview link]">[preview link]</a></p><p>Or see the 45-second walkthrough first: <a href="[video link]?src=outreach-warm-2">finda.sale/video</a></p><p>Or if now\'s not the right time, just let me know and I\'ll stop emailing.</p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch3: {
      subject: 'Quick question from [Business Name]\'s biggest competitor',
      html: '<p>Hi [Business Name],</p><p>You opened my email but didn\'t click through.</p><p>Here\'s the thing: right now, shoppers are searching for what you sell on Google and eBay. But they\'re not finding your inventory — they\'re finding your competitors instead.</p><p>FindA.Sale exists to fix that. When you list on our platform, we surface your items to shoppers actively looking for estate sales, auctions, and used goods in [state].</p><p>Claim your storefront (takes 30 seconds):<br><a href="[preview link]">[preview link]</a></p><p>Or see the 45-second walkthrough first: <a href="[video link]?src=outreach-warm-3">finda.sale/video</a></p><p>Then add 3 items from your next sale. If no one buys, you lose nothing. If someone does, you pocket 90%.</p><p>No risk. No monthly subscription. No data lock-in.</p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch4: {
      subject: 'One last thought',
      html: '<p>Hi [Business Name],</p><p>This is my last email. I promise.</p><p>I\'ve reached out a few times because I genuinely think FindA.Sale can help you reach more customers. But maybe the timing isn\'t right, or maybe online listing isn\'t for you.</p><p>No judgment either way.</p><p>But before I let you go: if you ever get curious — about how the platform works, what the 10% split looks like, whether it\'s worth trying — just reply to this email.</p><p>Your storefront is ready whenever you change your mind:<br><a href="[preview link]">[preview link]</a></p><p>If you\'d rather just see what the platform does: <a href="[video link]?src=outreach-warm-4">finda.sale/video</a> (45 seconds)</p><p>Good luck with your sales.</p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
  },
  HOT: {
    touch1: {
      subject: '[Business Name] + FindA.Sale: Your next growth channel',
      html: '<p>Hi [Business Name],</p><p>We\'re reaching out directly to licensed auctioneers and estate sale professionals in [state] who are running multiple events a month.</p><p>You\'re among a select group of organizers we\'re inviting to a white-glove onboarding.</p><p><strong>For High-Volume Sellers:</strong></p><p>• Bulk photo upload (RapidFire: 100 items in 20 minutes via phone camera)<br>• Smart tagging powered by pricing data<br>• Printable inventory sheets for your sale event<br>• API export to eBay, Shopify, or your own system</p><p><strong>For Professional Organizers:</strong></p><p>• Staff accounts (delegate photos, pricing, listing reviews)<br>• Hold management dashboard (reserves, deposits, customer pickup scheduling)<br>• Commission-only pricing (10% on sales, zero monthly fees)</p><p>Your storefront is built and ready. Just claim it and add items:<br><a href="[preview link]">[preview link]</a></p><p>Or see the 45-second walkthrough first: <a href="[video link]?src=outreach-hot-1">finda.sale/video</a></p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch2: {
      subject: 'One thing we left out',
      html: '<p>Hi [Business Name],</p><p>I sent you an email last week and didn\'t hear back.</p><p>One thing I didn\'t lead with: it\'s commission-only. You pay nothing until something sells. We keep 10%.</p><p>For a high-volume operation like yours, that math gets very favorable very fast.</p><p>See your storefront:<br><a href="[preview link]">[preview link]</a></p><p>Or see the 45-second walkthrough first: <a href="[video link]?src=outreach-hot-2">finda.sale/video</a></p><p>Or if timing\'s off, just reply and I\'ll stop emailing.</p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch3: {
      subject: 'Quick question from [Business Name]\'s biggest competitor',
      html: '<p>Hi [Business Name],</p><p>You opened my email but didn\'t click through.</p><p>Here\'s what I know: your competitors in [state] are already listing on FindA.Sale. Their items are being discovered by shoppers who are looking specifically for what you sell.</p><p>The platform is commission-only (10%), no monthly fee, and you export your data anytime.</p><p>Claim your storefront in 30 seconds:<br><a href="[preview link]">[preview link]</a></p><p>Or see the 45-second walkthrough first: <a href="[video link]?src=outreach-hot-3">finda.sale/video</a></p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
    },
    touch4: {
      subject: 'One last thought',
      html: '<p>Hi [Business Name],</p><p>This is my last email.</p><p>I\'ve reached out because I think a high-volume operation like yours is exactly what FindA.Sale was built for. But maybe the timing isn\'t right.</p><p>If that changes, your storefront is here:<br><a href="[preview link]">[preview link]</a></p><p>Or see what the platform does: <a href="[video link]?src=outreach-hot-4">finda.sale/video</a> (45 seconds)</p><p>Good luck with your sales.</p><p>— The FindA.Sale Team<br><a href="[unsubscribe link]">Unsubscribe</a> · [physical address]</p>',
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
  const rawLines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `List-Unsubscribe: ${opts.listUnsubscribe}`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    '',
    opts.html,
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
    const quotaPerWindow = Math.max(1, Math.floor(dailyQuota / 6));
    console.log(`[OutreachCron] Day ${daysSinceStart}, quota: ${dailyQuota}/day, this window: ${quotaPerWindow}`);

    // ADR-075: Base filter criteria (reused across all three leadTier passes)
    const baseWhere = {
      status: { notIn: ['BOUNCED', 'OPTED_OUT', 'CLAIMED'] },
      organizer: {
        directoryStatus: { not: 'CLOSED' },
        // Only legitimate organizer types (estate sale, auction, antique, consignment, etc.)
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

    // Three-pass query: HOT → WARM → COLD, then fallback to untiered/ENTERPRISE if quota remains
    const recordsToSend: any[] = [];

    if (hotQuota > 0) {
      const hotRecords = await prisma.directoryClaimEmail.findMany({
        where: {
          ...baseWhere,
          organizer: { ...baseWhere.organizer, leadTier: 'HOT' },
        },
        include: { organizer: true },
        take: hotQuota,
        orderBy: { createdAt: 'asc' },
      });
      recordsToSend.push(...hotRecords);
    }

    if (warmQuota > 0 && recordsToSend.length < quotaPerWindow) {
      const warmRecords = await prisma.directoryClaimEmail.findMany({
        where: {
          ...baseWhere,
          organizer: { ...baseWhere.organizer, leadTier: 'WARM' },
        },
        include: { organizer: true },
        take: warmQuota,
        orderBy: { createdAt: 'asc' },
      });
      recordsToSend.push(...warmRecords);
    }

    if (coldQuota > 0 && recordsToSend.length < quotaPerWindow) {
      const coldRecords = await prisma.directoryClaimEmail.findMany({
        where: {
          ...baseWhere,
          organizer: { ...baseWhere.organizer, leadTier: 'COLD' },
        },
        include: { organizer: true },
        take: coldQuota,
        orderBy: { createdAt: 'asc' },
      });
      recordsToSend.push(...coldRecords);
    }

    // Fallback: fill remaining quota with ENTERPRISE or untiered (leadTier IS NULL)
    if (untieredQuota > 0 && recordsToSend.length < quotaPerWindow) {
      const untieredRecords = await prisma.directoryClaimEmail.findMany({
        where: {
          ...baseWhere,
          organizer: {
            ...baseWhere.organizer,
            OR: [{ leadTier: 'ENTERPRISE' }, { leadTier: null }],
          },
        },
        include: { organizer: true },
        take: untieredQuota,
        orderBy: { createdAt: 'asc' },
      });
      recordsToSend.push(...untieredRecords);
    }

    const gmail = createGmailClient();
    let sent = 0;
    let failed = 0;

    for (const record of recordsToSend) {
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
        const previewLink = `${frontendUrl}/organizers/${record.organizerId}`;
        const videoLink = `${frontendUrl}/video`;
        const unsubscribeLink = `${backendUrl}/api/outreach/unsubscribe?token=${trackingToken}`;
        const trackingPixelUrl = `${backendUrl}/api/outreach/pixel?trackingId=${trackingPixelId}`;
        const physicalAddress = process.env.OUTREACH_PHYSICAL_ADDRESS || '219 E Michigan Ave, Suite F, Paw Paw, MI 49079';
        // licenseState is the most reliable state field on Organizer for scraped listings
        const stateValue = escapeHtml(record.organizer.licenseState || '');

        const html = renderTemplate(template.html, {
          'Business Name': escapeHtml(record.organizer.businessName || 'Your Business'),
          'state': stateValue,
          'preview link': previewLink,
          'video link': videoLink,
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
 * Syncs all organizers that:
 *   - have a valid contactEmail
 *   - have a non-null leadTier (ENTERPRISE skipped inside syncLeadTierToMailerLite)
 *   - were scored in the past 7 days (lastScoredAt > now - 7d)
 *
 * Errors per-organizer are caught and logged without stopping the batch.
 * Runs weekly on Sundays at 02:00 UTC via initOutreachEmailsCron.
 */
export async function syncLeadTierGroups(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const organizers = await prisma.organizer.findMany({
    where: {
      contactEmail: { not: null },
      leadTier: { not: null },
      lastScoredAt: { gte: sevenDaysAgo },
    },
    select: { id: true, contactEmail: true, leadTier: true },
  });

  console.log(`[syncLeadTierGroups] Syncing ${organizers.length} organizers to MailerLite`);
  let synced = 0;
  let failed = 0;

  for (const org of organizers) {
    try {
      await syncLeadTierToMailerLite(org.contactEmail!, org.leadTier!, org.id);
      synced++;
    } catch (err: any) {
      failed++;
      console.error(`[syncLeadTierGroups] Failed for org ${org.id}:`, err.message);
    }
  }

  console.log(`[syncLeadTierGroups] Complete: ${synced} synced, ${failed} failed`);
}

/**
 * initOutreachEmailsCron — registers outreach email jobs in the cron scheduler.
 *
 * sendOutreachEmails: runs every 4 hours (6 windows/day) to distribute the daily quota.
 * syncLeadTierGroups: runs weekly on Sundays at 02:00 UTC.
 *
 * Both gates on OUTREACH_ENABLED=true.
 */
export function initOutreachEmailsCron(): void {
  if (process.env.OUTREACH_ENABLED !== 'true') {
    console.log('[OutreachCron] Disabled — set OUTREACH_ENABLED=true to activate');
    return;
  }

  // Every 4 hours — spreads daily quota across 6 windows
  cron.schedule('0 */4 * * *', cronGuard({ jobName: 'outreach-emails' }, async () => {
    await sendOutreachEmails();
  }), { timezone: 'UTC' });
  console.log('[OutreachCron] Registered — runs every 4 hours UTC');

  // Weekly Sunday 04:00 UTC — sync lead tiers to MailerLite groups (offset from scoring at 02:00 to avoid race)
  cron.schedule('0 4 * * 0', cronGuard({ jobName: 'sync-lead-tier-groups' }, async () => {
    await syncLeadTierGroups();
  }), { timezone: 'UTC' });
  console.log('[OutreachCron] syncLeadTierGroups registered — runs Sundays 04:00 UTC');
}

