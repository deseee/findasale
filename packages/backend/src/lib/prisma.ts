import { PrismaClient, Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';

/**
 * Shared Prisma singleton — import this everywhere instead of creating new PrismaClient().
 * Multiple instances create separate connection pools, wasting resources and risking
 * "too many connections" errors under load.
 *
 * Feature #107: Database connection pooling
 * - url: pooled connection (PgBouncer via DATABASE_URL) — used at runtime
 * - directUrl: direct connection (via DATABASE_URL_UNPOOLED) — used only by migrations
 * Prisma automatically handles this split; no code changes required.
 *
 * P1017 Resilience: Railway Postgres closes idle connections; Prisma pool errors instead
 * of reconnecting. Added $extends() hook to retry once on P1017 or "server has closed"
 * errors, then reconnect automatically.
 */
const baseClient = new PrismaClient({
  transactionOptions: {
    maxWait: 5000,  // ms to wait for a transaction slot
    timeout: 10000, // ms before a transaction is aborted
  },
  log: [{ level: 'query', emit: 'event' }],
});

export const prisma = baseClient.$extends({
  query: {
    async $allOperations({ operation, args, query }) {
      try {
        return await query(args);
      } catch (error: any) {
        // Detect P1017 (connection closed) or Railway "server has closed" variants
        const isConnectionError =
          error?.code === 'P1017' ||
          (error?.message && /server has closed the connection/i.test(error.message));

        if (isConnectionError) {
          console.warn(`[Prisma] Detected connection error on ${operation}, reconnecting...`);
          await baseClient.$connect();
          try {
            return await query(args); // Retry once
          } catch (retryError) {
            console.error(`[Prisma] Retry failed for ${operation}:`, retryError);
            throw retryError;
          }
        }
        throw error;
      }
    },
  },
});

// Slow-query detection — log and alert on queries >1000ms
baseClient.$on('query', (e: Prisma.QueryEvent) => {
  if (e.duration > 1000) {
    const msg = `Slow DB query (${e.duration}ms): ${e.query.substring(0, 200)}`;
    console.warn('[prisma:slow]', msg);
    try {
      Sentry.captureMessage(msg, 'warning');
    } catch (_err) {
      // Sentry not initialized yet — continue
    }
  }
});

// Connection pool monitoring — alert if pool pressure is high (>8 busy connections)
const poolMonitorInterval = setInterval(async () => {
  try {
    const metrics = await (baseClient as any).$metrics?.json?.();
    if (metrics) {
      const busyConnections = metrics.gauges?.find((g: any) => g.key === 'prisma_pool_connections_busy')?.value ?? 0;
      if (busyConnections > 8) {
        const msg = `DB pool pressure: ${busyConnections} busy connections`;
        console.warn('[prisma:pool]', msg);
        try {
          Sentry.captureMessage(msg, 'warning');
        } catch (_err) {
          // Sentry not initialized — continue
        }
      }
    }
  } catch (_err) {
    // Metrics unavailable — continue
  }
}, 5 * 60 * 1000); // every 5 minutes

// Cleanup on exit
if (typeof process !== 'undefined') {
  process.on('exit', () => {
    clearInterval(poolMonitorInterval);
  });
}

// Graceful shutdown: ensure connection pool is drained on process exit
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    await prisma.$disconnect();
  });
  process.on('SIGTERM', async () => {
    await prisma.$disconnect();
  });
}