import { PrismaClient } from '@prisma/client';

/**
 * Shared Prisma singleton — import this everywhere instead of creating new PrismaClient().
 * Multiple instances create separate connection pools, wasting resources and risking
 * "too many connections" errors under load.
 */
export const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 5000,  // ms to wait for a transaction slot
    timeout: 10000, // ms before a transaction is aborted
  },
});
