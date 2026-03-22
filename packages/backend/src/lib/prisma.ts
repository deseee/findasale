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
 */
export const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 5000,  // ms to wait for a transaction slot
    timeout: 10000, // ms before a transaction is aborted
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