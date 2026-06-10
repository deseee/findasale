/**
 * Monthly Trend Report Job — #442
 *
 * Runs on the 1st of each month at 9 AM UTC.
 * Generates per-organizer search engine visibility trend reports and emails
 * them to organizers who had at least one PUBLISHED or ENDED sale in the
 * past 30 days.
 *
 * Triggered via InternalJobRunner (POST /api/internal/jobs/run { job: "monthly-trend-report" })
 * GitHub Actions workflow: .github/workflows/pipeline-monthly-trend-report.yml
 *
 * Graceful degradation: if CrawlerVisit table has no rows (migration not yet run
 * or early in deployment), the report still sends with crawler count = 0.
 */

import { prisma } from '../lib/prisma';
import { emailService } from '../lib/emailService';
import { buildMonthlyTrendReportEmail } from '../templates/monthlyTrendReport';
import { bulkEmailEnabled } from '../utils/bulkEmailGate';
import { suppressionService } from '../services/suppressionService';

const FROM_EMAIL = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

/** Slugify a city name to match /city/[slug] URL format */
function toCitySlug(city: string, state: string): string {
  return `${city}-${state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface OrganizerTrendData {
  organizerId: string;
  organizerName: string;
  email: string;
  // Crawler data
  crawlerVisitCount: number;
  crawlerBreakdown: Record<string, number>; // { "GPTBot": 4, "ClaudeBot": 2, ... }
  priorMonthCrawlerVisitCount: number;
  // Indexed sales
  indexedSaleCount: number;
  priorMonthIndexedSaleCount: number;
  // City coverage
  saleCities: string[]; // unique cities organizer had sales in this period
  totalActiveSaleCount: number;
  // Period
  periodLabel: string; // e.g. "April 2026"
  priorPeriodLabel: string;
}

export async function runMonthlyTrendReport(): Promise<void> {
  if (!bulkEmailEnabled()) { console.log('[monthlyTrendReport] Skipped — bulk email disabled (OUTREACH_ENABLED!=true)'); return; }
  const now = new Date();

  // Current month window: past 30 days
  const periodEnd = now;
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - 30);

  // Prior month window: 30-60 days ago
  const priorPeriodEnd = new Date(periodStart);
  const priorPeriodStart = new Date(priorPeriodEnd);
  priorPeriodStart.setDate(priorPeriodStart.getDate() - 30);

  const periodLabel = periodStart.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const priorPeriodLabel = priorPeriodStart.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  console.log(`[monthlyTrendReport] Running for period: ${periodLabel}`);

  // Find real (claimed) organizers with at least one PUBLISHED or ENDED sale in the past 30 days.
  // isUnmanagedListing: false excludes scraped/unclaimed organizers — without this filter the job
  // attempts to email ~44k scraped orgs, burns through Gmail's 2,000/day cap, and blocks all
  // transactional email (payouts, notifications) for the rest of the day.
  const activeOrganizers = await prisma.organizer.findMany({
    where: {
      isUnmanagedListing: false,
      sales: {
        some: {
          status: { in: ['PUBLISHED', 'ENDED'] },
          deletedAt: null,
          updatedAt: { gte: periodStart },
        },
      },
    },
    select: {
      id: true,
      businessName: true,
      user: {
        select: { email: true, name: true },
      },
      sales: {
        where: {
          deletedAt: null,
          status: { in: ['PUBLISHED', 'ENDED'] },
        },
        select: {
          id: true,
          city: true,
          state: true,
          status: true,
          updatedAt: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  if (activeOrganizers.length === 0) {
    console.log('[monthlyTrendReport] No active organizers found — skipping.');
    return;
  }

  console.log(`[monthlyTrendReport] Processing ${activeOrganizers.length} organizer(s)`);

  // VOLUME FUSE (May 18 2026 organizer-digest incident, same-pattern hardening):
  // the isUnmanagedListing filter above is the primary scrape guard, but a scraper
  // bug that fails to set isUnmanagedListing=true on import would re-create the
  // blast condition (~44k scraped orgs, 2,000/day Gmail cap). A legitimate
  // registered-organizer list past 300 should be a deliberate decision, not an
  // accident — abort without sending and alert via error log.
  const MAX_TREND_REPORT_RECIPIENTS = 300;
  if (activeOrganizers.length > MAX_TREND_REPORT_RECIPIENTS) {
    console.error(
      `[monthlyTrendReport] VOLUME FUSE TRIPPED: query matched ${activeOrganizers.length} organizers ` +
      `(limit ${MAX_TREND_REPORT_RECIPIENTS}). Aborting without sending — verify the recipient ` +
      `filter has not regressed (see May 18 2026 scraped-organizer blast incident).`
    );
    return;
  }

  // Fetch all CrawlerVisit rows for the two periods in one query (graceful if table is empty)
  let allVisits: Array<{ crawlerName: string; saleId: string | null; createdAt: Date }> = [];
  try {
    allVisits = await prisma.crawlerVisit.findMany({
      where: {
        createdAt: { gte: priorPeriodStart },
      },
      select: {
        crawlerName: true,
        saleId: true,
        createdAt: true,
      },
    });
  } catch (err) {
    // Table may not yet exist in all environments — proceed with empty visits
    console.warn('[monthlyTrendReport] Could not query CrawlerVisit — table may not exist yet:', err instanceof Error ? err.message : String(err));
  }

  // Build a saleId → organizerId map from all active organizers' sales
  const saleToOrganizer = new Map<string, string>();
  for (const org of activeOrganizers) {
    for (const sale of org.sales) {
      saleToOrganizer.set(sale.id, org.id);
    }
  }

  // Segment visits by period
  const currentVisits = allVisits.filter(v => v.createdAt >= periodStart && v.createdAt <= periodEnd);
  const priorVisits = allVisits.filter(v => v.createdAt >= priorPeriodStart && v.createdAt < priorPeriodEnd);

  // Aggregate current visits per organizer
  const currentVisitsByOrg = new Map<string, { total: number; breakdown: Record<string, number> }>();
  for (const visit of currentVisits) {
    const orgId = visit.saleId ? saleToOrganizer.get(visit.saleId) : undefined;
    if (!orgId) continue;
    const agg = currentVisitsByOrg.get(orgId) ?? { total: 0, breakdown: {} };
    agg.total += 1;
    agg.breakdown[visit.crawlerName] = (agg.breakdown[visit.crawlerName] ?? 0) + 1;
    currentVisitsByOrg.set(orgId, agg);
  }

  // Aggregate prior visits per organizer
  const priorVisitsByOrg = new Map<string, number>();
  for (const visit of priorVisits) {
    const orgId = visit.saleId ? saleToOrganizer.get(visit.saleId) : undefined;
    if (!orgId) continue;
    priorVisitsByOrg.set(orgId, (priorVisitsByOrg.get(orgId) ?? 0) + 1);
  }

  let sentCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const org of activeOrganizers) {
    const email = org.user.email;
    if (!email) {
      skipCount++;
      continue;
    }

    // Sales active in current period
    const currentSales = org.sales.filter(
      s => s.updatedAt >= periodStart || s.startDate <= periodEnd
    );
    // Sales active in prior period
    const priorSales = org.sales.filter(
      s => s.updatedAt >= priorPeriodStart && s.updatedAt < priorPeriodEnd
    );

    // Indexed = PUBLISHED or ENDED (no noindex field exists; we treat all non-deleted active sales as indexed)
    const indexedCount = currentSales.filter(s => s.status === 'PUBLISHED' || s.status === 'ENDED').length;
    const priorIndexedCount = priorSales.filter(s => s.status === 'PUBLISHED' || s.status === 'ENDED').length;

    // Unique cities from all (non-deleted) active sales this period
    const saleCities: string[] = [...new Set<string>(
      currentSales.map(s => toCitySlug(s.city, s.state))
    )];

    const currentVisitAgg = currentVisitsByOrg.get(org.id) ?? { total: 0, breakdown: {} };
    const priorVisitTotal = priorVisitsByOrg.get(org.id) ?? 0;

    const reportData: OrganizerTrendData = {
      organizerId: org.id,
      organizerName: org.businessName || org.user.name,
      email,
      crawlerVisitCount: currentVisitAgg.total,
      crawlerBreakdown: currentVisitAgg.breakdown,
      priorMonthCrawlerVisitCount: priorVisitTotal,
      indexedSaleCount: indexedCount,
      priorMonthIndexedSaleCount: priorIndexedCount,
      saleCities,
      totalActiveSaleCount: currentSales.length,
      periodLabel,
      priorPeriodLabel,
    };

    if (await suppressionService.isSuppressed(email)) {
      skipCount++;
      console.log(`[monthlyTrendReport] Skipping suppressed recipient: ${email}`);
      continue;
    }

    try {
      const { subject, html } = buildMonthlyTrendReportEmail(reportData, FRONTEND_URL);
      await emailService.emails.send({
        from: `The FindA.Sale Team <${FROM_EMAIL}>`,
        to: email,
        subject,
        html,
      });
      sentCount++;
      console.log(`[monthlyTrendReport] Sent to ${email} (orgId: ${org.id})`);
    } catch (err) {
      errorCount++;
      console.error(`[monthlyTrendReport] Failed to send to ${email}:`, err instanceof Error ? err.message : String(err));
    }
  }

  console.log(`[monthlyTrendReport] Done. Sent: ${sentCount}, Skipped: ${skipCount}, Errors: ${errorCount}`);
}
