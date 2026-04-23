import { PrismaClient } from '@prisma/client';

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

// Graceful shutdown: ensure connection pool is drained on process exit
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    await prisma.$disconnect();
  });
  process.on('SIGTERM', async () => {
    await prisma.$disconnect();
  });
}