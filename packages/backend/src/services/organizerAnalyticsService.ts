// Organizer Analytics Weekly Email — sends performance digest to organizers
// Contains: item sales, revenue, follower growth, top categories

import { Resend } from 'resend';
import { prisma } from '../lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@finda.sale';

export interface SaleSummary {
  id: string;
  title: string;
  itemsSold: number;
}

export interface OrganizerWeeklyStats {
  organizerId: string;
  organizerEmail: string;
  organizerName: string;
  weekStart: Date;
  weekEnd: Date;
  activeSales: SaleSummary[];
  totalItemsSold: number;
  totalRevenue: number; // in cents
  newFollowers: number;
  topCategories: Array<{ category: string; count: number }>;
}

/**
 * Calculate organizer stats for the past week
 */
export async function getOrganizerWeeklyStats(organizerId: string): Promise<OrganizerWeeklyStats> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch organizer info
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: { user: { select: { email: true, name: true } } },
  });

  if (!organizer) {
    throw new Error(`Organizer not found: ${organizerId}`);
  }

  // Get active sales (PUBLISHED or ENDED in past 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const activeSales = await prisma.sale.findMany({
    where: {
      organizerId,
      status: { in: ['PUBLISHED', 'ENDED'] },
      createdAt: { gte: thirtyDaysAgo },
    },
    select: { id: true, title: true },
  });

  // Get items sold in the past 7 days (from active/recently-ended sales)
  const soldItems = await prisma.item.findMany({
    where: {
      status: 'SOLD',
      createdAt: { gte: sevenDaysAgo },
      sale: {
        organizerId,
        status: { in: ['PUBLISHED', 'ENDED'] },
      },
    },
    select: { id: true, category: true },
  });

  // Get purchases in the past 7 days for those sales
  const salesIds = activeSales.map((s) => s.id);
  const purchases = await prisma.purchase.findMany({
    where: {
      saleId: { in: salesIds },
      createdAt: { gte: sevenDaysAgo },
    },
    select: { amount: true },
  });

  // Get new followers in the past 7 days
  const newFollowers = await prisma.follow.count({
    where: {
      organizerId,
      createdAt: { gte: sevenDaysAgo },
    },
  });

  // Count sold items per sale
  const saleSoldItemMap = new Map<string, number>();
  for (const saleId of salesIds) {
    const count = await prisma.item.count({
      where: {
        saleId,
        status: 'SOLD',
        createdAt: { gte: sevenDaysAgo },
      },
    });
    saleSoldItemMap.set(saleId, count);
  }

  // Build active sales summary
  const activeSalesSummary: SaleSummary[] = activeSales
    .map((s) => ({
      id: s.id,
      title: s.title,
      itemsSold: saleSoldItemMap.get(s.id) || 0,
    }))
    .sort((a, b) => b.itemsSold - a.itemsSold);

  // Calculate revenue (sum of all purchases)
  const totalRevenue = purchases.reduce((sum, p) => sum + (p.amount * 100), 0); // convert to cents

  // Get top 3 categories by sold item count
  const categoryCounts = new Map<string, number>();
  for (const item of soldItems) {
    if (item.category) {
      categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
    }
  }

  const topCategories = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    organizerId,
    organizerEmail: organizer.user.email,
    organizerName: organizer.businessName || organizer.user.name,
    weekStart: sevenDaysAgo,
    weekEnd: now,
    activeSales: activeSalesSummary,
    totalItemsSold: soldItems.length,
    totalRevenue,
    newFollowers,
    topCategories,
  };
}

/**
 * Build HTML email template for organizer digest
 */
function buildOrganizerDigestHtml(stats: OrganizerWeeklyStats, unsubEmail: string): string {
  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const weekRange = `${formatDate(stats.weekStart)} – ${formatDate(stats.weekEnd)}`;

  // Stats grid
  const statsGrid = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
      <tr>
        <td style="background: #f0f9ff; border-radius: 8px; padding: 16px; text-align: center; margin-right: 12px;">
          <div style="font-size: 28px; font-weight: 700; color: #0284c7;">${stats.totalItemsSold}</div>
          <div style="font-size: 13px; color: #475569; margin-top: 4px;">Items Sold</div>
        </td>
        <td style="background: #fef3c7; border-radius: 8px; padding: 16px; text-align: center; margin-right: 12px;">
          <div style="font-size: 28px; font-weight: 700; color: #d97706;">$${(stats.totalRevenue / 100).toFixed(2)}</div>
          <div style="font-size: 13px; color: #475569; margin-top: 4px;">Revenue</div>
        </td>
        <td style="background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #16a34a;">${stats.newFollowers}</div>
          <div style="font-size: 13px; color: #475569; margin-top: 4px;">New Followers</div>
        </td>
      </tr>
    </table>
  `;

  // Active sales table
  const salesRows = stats.activeSales
    .map(
      (s) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
          <div style="font-weight: 600; color: #1e293b;">${s.title}</div>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right; color: #64748b;">
          ${s.itemsSold} item${s.itemsSold !== 1 ? 's' : ''} sold
        </td>
      </tr>`
    )
    .join('');

  // Top categories section
  const categoriesHtml =
    stats.topCategories.length > 0
      ? `
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-top: 24px;">
        <div style="font-weight: 600; color: #1e293b; margin-bottom: 12px;">Top Categories</div>
        ${stats.topCategories
          .map(
            (cat) => `
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
            <span style="color: #475569;">${cat.category}</span>
            <span style="color: #0284c7; font-weight: 600;">${cat.count}</span>
          </div>`
          )
          .join('')}
      </div>`
      : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin: 0; padding: 0; background: #f1f5f9; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background: #0f766e; padding: 28px 32px; text-align: center;">
              <span style="font-size: 26px; font-weight: 700; color: #fff;">FindA.Sale</span>
              <p style="margin: 8px 0 0; font-size: 15px; color: #a7f3d0; font-weight: 500;">Your Weekly Performance Summary</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 32px;">
              <p style="font-size: 15px; color: #1e293b; margin: 0 0 8px;">Hi ${stats.organizerName},</p>
              <p style="font-size: 15px; color: #475569; margin: 0 0 24px;">
                Here's how your sales performed from ${weekRange}:
              </p>

              ${statsGrid}

              ${
                stats.activeSales.length > 0
                  ? `
              <div style="margin-top: 28px;">
                <h3 style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0 0 12px;">Your Active Sales</h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${salesRows}
                </table>
              </div>`
                  : ''
              }

              ${categoriesHtml}

              <div style="text-align: center; margin-top: 28px; padding-top: 28px; border-top: 1px solid #e2e8f0;">
                <a href="${FRONTEND_URL}/organizer/dashboard" style="display: inline-block; padding: 12px 28px; background: #0f766e; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                  View Your Dashboard →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                You're receiving this because you're an organizer on <a href="${FRONTEND_URL}" style="color: #0f766e;">FindA.Sale</a>.<br/>
                <a href="${FRONTEND_URL}/organizer/settings" style="color: #94a3b8; text-decoration: none;">Manage email preferences</a> ·
                <a href="${FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(unsubEmail)}" style="color: #94a3b8; text-decoration: none;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send weekly digest email to a single organizer
 */
async function sendOrganizerDigestEmail(stats: OrganizerWeeklyStats): Promise<void> {
  const html = buildOrganizerDigestHtml(stats, stats.organizerEmail);

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: stats.organizerEmail,
      subject: `Your Weekly Performance Summary – ${stats.totalItemsSold} items sold`,
      html,
    });
    console.log(`✓ Organizer digest email sent to ${stats.organizerEmail}`);
  } catch (err) {
    console.error(`✗ Failed to send organizer digest email to ${stats.organizerEmail}:`, err);
    throw err;
  }
}

/**
 * Main job: send weekly digests to all organizers with active sales
 */
export async function sendOrganizerWeeklyDigest(): Promise<void> {
  console.log('[OrganizerDigest] Starting weekly organizer digest job...');

  try {
    // Get all organizers with active/recently-ended sales in past 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const organizers = await prisma.organizer.findMany({
      where: {
        sales: {
          some: {
            status: { in: ['PUBLISHED', 'ENDED'] },
            createdAt: { gte: thirtyDaysAgo },
          },
        },
      },
      select: { id: true },
    });

    console.log(`[OrganizerDigest] Found ${organizers.length} organizers with active sales`);

    let sent = 0;
    let errors = 0;

    // Send digest to each organizer
    for (const organizer of organizers) {
      try {
        const stats = await getOrganizerWeeklyStats(organizer.id);
        await sendOrganizerDigestEmail(stats);
        sent++;
      } catch (err) {
        console.error(`[OrganizerDigest] Failed for organizer ${organizer.id}:`, err);
        errors++;
      }
    }

    console.log(
      `[OrganizerDigest] Job complete. Sent: ${sent}, Errors: ${errors}`
    );
  } catch (err) {
    console.error('[OrganizerDigest] Job failed:', err);
    throw err;
  }
}
