import { prisma } from '../index';
import { buildEmail, buildItemCardModule, buildSpacer, buildCTARow, EMAIL_TOKENS as T } from './emailTemplateService';
import { emailService } from '../lib/emailService';
import { suppressionService } from './suppressionService';

const SITE_URL = process.env.FRONTEND_URL || 'https://finda.sale';

// ─── Dedup guard: tracks (saleId, userId) pairs already emailed this run ───
const sentThisRun = new Set<string>();

function formatSaleDay(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatSaleTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function buildSneakPeekHtml(opts: {
  saleName: string;
  saleDay: string;
  saleTime: string;
  saleAddress: string;
  items: Array<{ title: string; price: number; category?: string }>;
  saleUrl: string;
}): string {
  const { saleName, saleDay, saleTime, saleAddress, items, saleUrl } = opts;

  // Item grid rows (text-only — no image src, avoids spam filters on bulk sends)
  const itemRows = items.slice(0, 6).map(item => {
    const priceStr = item.price != null ? `$${Number(item.price).toFixed(2)}` : 'Price TBD';
    const catLine = item.category
      ? `<div style="font-size:12px; color:rgba(26,24,20,0.45); margin-top:2px;">${item.category}</div>`
      : '';
    return `
<tr>
  <td style="padding:10px 0; border-bottom:1px solid #E8E2D8;">
    <div style="font-size:14px; font-weight:600; color:#1A1814; line-height:1.3;">${item.title}</div>
    ${catLine}
    <div style="font-size:15px; font-weight:700; color:#C8552B; margin-top:4px;">${priceStr}</div>
  </td>
</tr>`;
  }).join('');

  const body = `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td style="padding:14px 0 6px;">
      <div style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:rgba(26,24,20,0.45); margin-bottom:10px;">
        Sale details
      </div>
      <div style="font-size:14px; color:#1A1814; line-height:1.7;">
        &#128197; <strong>${saleDay}</strong> &middot; ${saleTime}<br>
        &#128205; ${saleAddress}
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:18px 0 6px;">
      <div style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:rgba(26,24,20,0.45); margin-bottom:4px;">
        A few items to look for
      </div>
    </td>
  </tr>
  ${itemRows}
</table>`;

  return buildEmail({
    preheader: `Save your spot. Items you won't want to miss.`,
    headline: `${saleName} — Preview`,
    body,
    ctaText: 'Browse the Full Sale →',
    ctaUrl: saleUrl,
    footerNote: `${saleDay} &middot; ${saleAddress}`,
    unsubLabel: 'Unsubscribe from sale alerts',
    unsubUrl: `${SITE_URL}/unsubscribe`,
  });
}

async function sendSneakPeekEmail(opts: {
  to: string;
  saleName: string;
  saleDay: string;
  saleTime: string;
  saleAddress: string;
  items: Array<{ title: string; price: number; category?: string }>;
  saleUrl: string;
}): Promise<void> {
  const { to, saleName, saleDay } = opts;
  if (await suppressionService.isSuppressed(to)) {
    console.log('[presaleSneakPeek] Skipped suppressed recipient:', to);
    return;
  }
  const subject = `${saleName} starts ${saleDay} — here's a sneak peek`;
  const html = buildSneakPeekHtml(opts);

  try {
    await emailService.emails.send({
      from: process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale',
      to,
      subject,
      html,
    });
    console.log(`✓ Sneak peek sent to ${to} for "${saleName}"`);
  } catch (err) {
    console.error(`✗ Failed to send sneak peek to ${to} for "${saleName}":`, err);
  }
}

export async function sendPresaleSneakPeekEmails(): Promise<void> {
  try {
    const now = new Date();
    // Window: sales starting 24–48 hours from now
    const windowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const sales = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        startDate: { gte: windowStart, lte: windowEnd },
        deletedAt: null,
        sneakPeekSentAt: null, // idempotency guard — skip sales already sent
      },
      include: {
        organizer: {
          include: {
            user: { select: { email: true, name: true } },
          },
        },
        subscribers: {
          select: { userId: true, email: true },
        },
        rsvps: {
          select: { userId: true },
        },
        items: {
          where: {
            isActive: true,
            status: 'AVAILABLE',
            photoUrls: { isEmpty: false },
            price: { not: null },
          },
          orderBy: { price: 'desc' },
          take: 6,
          select: { title: true, price: true, category: true },
        },
      },
    });

    console.log(`[presaleSneakPeekJob] Found ${sales.length} sale(s) in 24–48h window`);

    let skipped = 0;
    let sent = 0;

    for (const sale of sales) {
      if (sale.items.length === 0) {
        skipped++;
        continue;
      }

      const saleUrl     = `${SITE_URL}/sales/${sale.id}`;
      const saleDay     = formatSaleDay(sale.startDate);
      const saleTime    = formatSaleTime(sale.startDate);
      const saleAddress = `${sale.address}, ${sale.city}, ${sale.state}`;

      // Collect recipient user IDs from subscribers + RSVPs (deduplicated)
      const recipientUserIds = new Set<string>();
      for (const sub of sale.subscribers) {
        if (sub.userId) recipientUserIds.add(sub.userId);
      }
      for (const rsvp of sale.rsvps) {
        recipientUserIds.add(rsvp.userId);
      }

      // Resolve emails for user-ID-based recipients
      const userIds = [...recipientUserIds];
      const emailOnlyRecipients: Array<{ email: string; userId: string | null }> = [];

      if (userIds.length > 0) {
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        });
        for (const u of users) {
          emailOnlyRecipients.push({ email: u.email, userId: u.id });
        }
      }

      // Also include subscribers with direct email but no userId
      for (const sub of sale.subscribers) {
        if (!sub.userId && sub.email) {
          emailOnlyRecipients.push({ email: sub.email, userId: null });
        }
      }

      const itemPayload = sale.items.map(it => ({
        title: it.title,
        price: it.price ?? 0,
        category: it.category ?? undefined,
      }));

      for (const recipient of emailOnlyRecipients) {
        const dedupKey = `${sale.id}::${recipient.userId ?? recipient.email}`;
        if (sentThisRun.has(dedupKey)) continue;
        sentThisRun.add(dedupKey);

        await sendSneakPeekEmail({
          to: recipient.email,
          saleName: sale.title,
          saleDay,
          saleTime,
          saleAddress,
          items: itemPayload,
          saleUrl,
        });
      }

      // Stamp the sale so it won't be picked up on the next cron run (persistent idempotency)
      await prisma.sale.update({
        where: { id: sale.id },
        data: { sneakPeekSentAt: new Date() },
      });

      sent++;
    }

    console.log(`[presaleSneakPeekJob] Processed ${sent} of ${sales.length} sales (${skipped} skipped — no items with photos)`);
  } catch (err) {
    console.error('[presaleSneakPeekJob] Fatal error:', err);
  }
}
