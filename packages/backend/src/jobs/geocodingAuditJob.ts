/**
 * Geocoding Audit Cron — Monitor scraper geocoding failure rates
 * Runs daily at 6 AM UTC to detect sources with high geocoding failure rates
 * Alerts via Sentry if failure rate exceeds threshold (>10% for last 30 days)
 */

import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';

/**
 * Audit geocoding failure rates across sources
 * Identifies sources with >10% null lat/lng over the last 30 days
 */
async function auditGeocodingFailureRate(): Promise<void> {
  try {
    // Query sales from last 30 days grouped by source, counting nulls for lat
    const results = await prisma.sale.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
        sourceName: { not: null },
      },
      select: {
        sourceName: true,
        lat: true,
      },
    });

    // Group by source and calculate failure rates
    const sourceStats = new Map<string, { total: number; nullCount: number }>();

    for (const sale of results) {
      const source = sale.sourceName || 'unknown';
      if (!sourceStats.has(source)) {
        sourceStats.set(source, { total: 0, nullCount: 0 });
      }
      const stats = sourceStats.get(source)!;
      stats.total++;
      if (sale.lat === null) {
        stats.nullCount++;
      }
    }

    // Alert on sources with >10% failure rate
    // Sources where geocoding failure is structurally expected (no street address in data)
    // are suppressed from Sentry alerts — they still log to console for visibility.
    const GEOCODING_SUPPRESSED_SOURCES = new Set([
      'Facebook Events',  // event listings have no geocodable street address
      'FacebookEvents',   // legacy source name (pre-S815 records)
      'GarageSaleFinder', // 80%+ failure expected — Nominatim cannot parse their address format
    ]);

    const failureThreshold = 0.1;
    const failingSources: Array<{ source: string; rate: number; total: number; nullCount: number }> = [];

    for (const [source, stats] of sourceStats.entries()) {
      if (stats.total > 10) {
        const failureRate = stats.nullCount / stats.total;
        if (failureRate > failureThreshold && !GEOCODING_SUPPRESSED_SOURCES.has(source)) {
          failingSources.push({
            source,
            rate: failureRate,
            total: stats.total,
            nullCount: stats.nullCount,
          });
        }
      }
    }

    // Log results
    console.log(`[geocodingAudit] Checked ${sourceStats.size} sources from last 30 days`);
    for (const { source, total, nullCount } of Array.from(sourceStats.entries()).map(([source, stats]) => ({
      source,
      ...stats,
    }))) {
      const rate = ((nullCount / total) * 100).toFixed(1);
      console.log(`[geocodingAudit] ${source}: ${total} sales, ${nullCount} geocoding failures (${rate}%)`);
    }

    // Alert on high failure rates
    if (failingSources.length > 0) {
      const alertMsg = failingSources
        .map(
          ({ source, rate, total, nullCount }) =>
            `${source}: ${nullCount}/${total} (${(rate * 100).toFixed(1)}%)`
        )
        .join(', ');

      const fullMsg = `[geocodingAudit] High geocoding failure rates detected: ${alertMsg}`;
      console.warn(fullMsg);

      try {
        Sentry.captureMessage(fullMsg, 'warning');
      } catch {
        // Sentry may not be initialized — silently continue
      }
    } else {
      console.log(`[geocodingAudit] All sources within acceptable failure rates (<${failureThreshold * 100}%)`);
    }
  } catch (error) {
    console.error('[geocodingAudit] Unexpected error:', error);
    throw error;
  }
}

/**
 * Schedule the geocoding audit cron job — 6 AM UTC daily
 * This is called during app startup (index.ts)
 */
export function scheduleGeocodingAuditCron(): void {
  cron.schedule('0 6 * * *', cronGuard({ jobName: 'geocodingAudit' }, auditGeocodingFailureRate));
  console.log('[geocodingAudit] Scheduled for 6 AM UTC daily');
}
