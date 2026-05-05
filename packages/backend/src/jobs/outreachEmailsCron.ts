import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { suppressionService } from '../services/suppressionService';

const TEMPLATES = {
  touch1: {
    subject: 'Where do buyers find [Business Name]?',
    html: '<p>Your sale may be fantastic, but if your buyers don\'t know when and where to find you, it won\'t matter.</p><p>We built [Business Name] a free storefront on FindA.Sale — it puts you on the map before shoppers start searching, not after.</p><p>Take a look: <a href="[preview link]">[preview link]</a></p><p>2-minute walkthrough: <a href="[video link]?src=outreach-a">[video link]</a></p><p>It\'s free to claim your page. No credit card needed.</p><p>— The FindA.Sale Team</p><p>[physical address] · <a href="[unsubscribe link]">Unsubscribe</a></p>',
  },
  touch2: {
    subject: 'Most shoppers find a sale after it\'s over',
    html: '<p>By the time the Facebook post goes up or the signs hit the corners, the best things are already gone. Most people find out too late.</p><p>[Business Name] has a free page on FindA.Sale — it shows up before people start searching, not after the weekend wraps up. Takes about 30 seconds to claim.</p><p>Take a look: <a href="[preview link]">[preview link]</a></p><p>2-minute walkthrough: <a href="[video link]?src=outreach-b">[video link]</a></p><p>No credit card needed.</p><p>— The FindA.Sale Team</p><p>[physical address] · <a href="[unsubscribe link]">Unsubscribe</a></p>',
  },
  touch3: {
    subject: 'Be honest — how\'s the pricing going?',
    html: '<p>Most organizers price from memory. It works until it doesn\'t.</p><p>Unfamiliar items, everything needs to go by Saturday — guessing on a Hummel figurine or an art nouveau lamp can mean leaving real money on the table.</p><p>FindA.Sale includes Smart Pricing — it pulls recent sold comps so you can price with confidence instead of spending 20 minutes on eBay first.</p><p>Your [Business Name] storefront is here whenever you\'re ready: <a href="[preview link]">[preview link]</a></p><p>Free forever. No credit card needed.</p><p>— The FindA.Sale Team</p><p>[physical address] · <a href="[unsubscribe link]">Unsubscribe</a></p>',
  },
  touch4: {
    subject: 'Last note',
    html: '<p>Four notes, no response — we get it. This is the last one.</p><p>[Business Name]\'s storefront stays live on FindA.Sale. If anything changes and you want to claim it, it\'s here whenever you\'re ready: <a href="[preview link]">[preview link]</a></p><p>— The FindA.Sale Team</p><p>[physical address] · <a href="[unsubscribe link]">Unsubscribe</a></p>',
  },
};

const getDailyQuota = (daysSinceStart: number): number => {
  if (daysSinceStart <= 7) return 20;
  if (daysSinceStart <= 14) return 50;
  if (daysSinceStart <= 21) return 100;
  return 200;
};

const createTransport = () => {
  if (!process.env.OUTREACH_WORKSPACE_EMAIL || !process.env.OUTREACH_WORKSPACE_APP_PASSWORD) {
    throw new Error('Missing OUTREACH_WORKSPACE_EMAIL or OUTREACH_WORKSPACE_APP_PASSWORD');
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.OUTREACH_WORKSPACE_EMAIL,
      pass: process.env.OUTREACH_WORKSPACE_APP_PASSWORD,
    },
  });
};

const renderTemplate = (template: string, variables: Record<string, string>): string => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(`[${key}]`, value);
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
    const WARMUP_START = new Date('2026-05-08');
    const today = new Date();
    const daysSinceStart = Math.floor((today.getTime() - WARMUP_START.getTime()) / (1000 * 60 * 60 * 24));
    const dailyQuota = getDailyQuota(daysSinceStart);
    const quotaPerWindow = Math.max(1, Math.floor(dailyQuota / 6));
    console.log(`[OutreachCron] Day ${daysSinceStart}, quota: ${dailyQuota}/day, this window: ${quotaPerWindow}`);

    const recordsToSend = await prisma.directoryClaimEmail.findMany({
      where: {
        organizer: {
          directoryStatus: { not: 'CLOSED' },
        },
      },
      include: { organizer: true },
      take: quotaPerWindow,
      orderBy: { createdAt: 'asc' },
    });

    const transport = createTransport();
    let sent = 0;
    let failed = 0;

    for (const record of recordsToSend) {
      try {
        const isSuppressed = await suppressionService.isSuppressed(record.emailAddress);
        if (isSuppressed) {
          console.log(`[OutreachCron] Skipped ${record.emailAddress} (suppressed)`);
          continue;
        }

        // Second safety net: skip government/institutional/chain domains
        const emailDomain = record.emailAddress.toLowerCase();
        const blockedSuffixes = ['.gov', '.edu', '.mil', '.gc.ca', 'gov.bc.ca', 'gov.ab.ca', 
          'gov.on.ca', 'gov.ns.ca', 'gov.nb.ca', 'gov.pe.ca', 'gov.nl.ca', 'gov.sk.ca', 
          'gov.mb.ca', 'gov.nt.ca', 'gov.nu.ca', 'gov.yk.ca', 'goodwill.org', 
          'salvationarmy.org', 'habitatrestore.org', 'municibid.com', 'govplanet.com', 'publicsurplus.com'];
        if (blockedSuffixes.some(s => emailDomain.endsWith(s) || emailDomain.includes(`.${s}`))) {
          console.log(`[OutreachCron] Skipped ${record.emailAddress} — blocked domain`);
          continue;
        }

        const touchNum = determineTouchToSend(record);
        if (!touchNum) continue;

        const trackingPixelId = `${uuid()}:${Buffer.from(record.emailAddress).toString('base64').substring(0, 12)}`;
        const trackingToken = jwt.sign(
          { organizerId: record.organizerId, email: record.emailAddress },
          process.env.OUTREACH_SECRET || 'default-secret',
          { expiresIn: '90d' }
        );

        const template = TEMPLATES[`touch${touchNum}` as keyof typeof TEMPLATES];
        const previewLink = `https://finda.sale/organizers/${record.organizerId}`;
        const videoLink = `https://finda.sale/video`;
        const unsubscribeLink = `https://finda.sale/api/outreach/unsubscribe?token=${trackingToken}`;
        const trackingPixelUrl = `https://finda.sale/api/outreach/pixel?trackingId=${trackingPixelId}`;
        const physicalAddress = process.env.OUTREACH_PHYSICAL_ADDRESS || '123 Main St, Grand Rapids, MI 49503';

        const html = renderTemplate(template.html, {
          'Business Name': record.organizer.businessName || 'Your Business',
          'preview link': previewLink,
          'video link': videoLink,
          'unsubscribe link': unsubscribeLink,
          'physical address': physicalAddress,
        });

        const subject = renderTemplate(template.subject, {
          'Business Name': record.organizer.businessName || 'Your Business',
        });

        const htmlWithPixel = html.replace(
          '</body>',
          `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" /></body>`
        );

        await transport.sendMail({
          from: `The FindA.Sale Team <${process.env.OUTREACH_WORKSPACE_EMAIL}>`,
          to: process.env.OUTREACH_TEST_EMAIL || record.emailAddress,
          subject,
          html: htmlWithPixel,
        });

        const updateData: any = { [`touch${touchNum}SentAt`]: new Date(), trackingPixelId, trackingToken };
        await prisma.directoryClaimEmail.update({
          where: { id: record.id },
          data: updateData,
        });

        sent++;
        console.log(`[OutreachCron] Sent Touch ${touchNum} to ${record.organizerId}`);
      } catch (err: any) {
        failed++;
        console.error(`[OutreachCron] Failed to send to ${record.organizerId}:`, err.message);
      }
    }