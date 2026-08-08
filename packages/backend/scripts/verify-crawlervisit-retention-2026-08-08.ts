#!/usr/bin/env node
/**
 * verify-crawlervisit-retention-2026-08-08.ts
 *
 * READ-ONLY. No writes anywhere in this file. Confirms whether the CrawlerVisit
 * retention cron (packages/backend/src/jobs/logRetentionCron.ts, added 2026-08-04,
 * runs daily 03:20 UTC, 60-day cutoff) is actually pruning rows, rather than assuming
 * it is just because the code exists and is registered.
 *
 * CONTEXT: this session's DB audit found CrawlerVisit at 106,528 rows / 42MB with what
 * looked like no retention policy. A full read of packages/backend/src/jobs/
 * logRetentionCron.ts shows that assumption would have been WRONG — a 60-day retention
 * sweep for CrawlerVisit was already added 2026-08-04 (4 days before this audit,
 * Patrick-approved cost-optimization batch, per the code comment at that file's line 68).
 * So no new pruning script is proposed here. What IS worth checking: the cron is only
 * 4 days old, so most of the current 106,528-row backlog predates it and should be
 * getting swept nightly — this script reports the actual age distribution so that can be
 * confirmed with a tool rather than assumed.
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node packages/backend/scripts/verify-crawlervisit-retention-2026-08-08.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = Date.now();
  const cutoff60d = new Date(now - 60 * 24 * 60 * 60 * 1000);
  const cutoff7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [total, olderThan60d, last7d, oldest, newest] = await Promise.all([
    prisma.crawlerVisit.count(),
    prisma.crawlerVisit.count({ where: { createdAt: { lt: cutoff60d } } }),
    prisma.crawlerVisit.count({ where: { createdAt: { gte: cutoff7d } } }),
    prisma.crawlerVisit.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.crawlerVisit.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  console.log('CrawlerVisit retention check (read-only)');
  console.log(`  Total rows: ${total}`);
  console.log(`  Rows older than 60d (should be 0 if the cron is running and caught up): ${olderThan60d}`);
  console.log(`  Rows from the last 7 days (expected ~2-8k/day per the cron's own comment => ~14k-56k): ${last7d}`);
  console.log(`  Oldest row: ${oldest?.createdAt?.toISOString() ?? 'n/a'}`);
  console.log(`  Newest row: ${newest?.createdAt?.toISOString() ?? 'n/a'}`);

  if (olderThan60d > 0) {
    console.log(
      '\n  FINDING: rows older than the 60-day cutoff still exist. Either the cron has not run' +
        ' successfully yet, or it is failing silently for this table (it isolates per-table' +
        ' failures — check Railway backend logs for "[log-retention] CrawlerVisit: deletion failed"' +
        ' around 03:20 UTC). Do not assume — check the logs.'
    );
  } else {
    console.log('\n  FINDING: no rows older than 60 days — retention cron confirmed working as of this run.');
  }
}

main()
  .catch((err) => {
    console.error('[verify-crawlervisit-retention] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
