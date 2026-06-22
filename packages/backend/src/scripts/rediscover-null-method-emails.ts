/**
 * rediscover-null-method-emails.ts
 *
 * BOUNCE-INCIDENT REMEDIATION (Jun 2026).
 *
 * 13,751 organizers have a contactEmail with emailDiscoveryMethod IS NULL — these were
 * written by the old enrichment/scraper path with NO provenance and NO validation, and
 * produced a 15-28% bounce rate that triggered a Google abuse clamp on outreach@finda.sale.
 *
 * This script RE-DISCOVERS and GATES those emails. It NEVER deletes or nulls a contactEmail.
 *
 * For each Organizer WHERE emailDiscoveryMethod IS NULL AND contactEmail IS NOT NULL:
 *   - Run the proper emailDiscoveryService.discoverEmail() pipeline (website scrape → RDAP).
 *   - If a real verified email is found → discoverEmail() already updated contactEmail +
 *     emailDiscoveryMethod + emailDiscoveryConfidence + emailDiscoveredAt. Counted as re-verified.
 *   - If NOT found → KEEP the existing contactEmail, set emailDiscoveryMethod='unverified_import'
 *     and emailDiscoveryConfidence=0.1 so the outreach send gate skips it. NEVER null/delete.
 *
 * Idempotent: re-running only re-touches rows that are still emailDiscoveryMethod IS NULL.
 * Rows marked 'unverified_import' on a prior run are no longer NULL and are skipped — so a
 * second run will only retry rows that were added/reset since the last run. To force a full
 * retry of previously-marked-unverified rows, pass RETRY_UNVERIFIED=true.
 *
 * Usage (ALWAYS dry-run first):
 *   cd packages/backend
 *   DRY_RUN=true npx ts-node src/scripts/rediscover-null-method-emails.ts
 *   npx ts-node src/scripts/rediscover-null-method-emails.ts
 *
 * Environment Variables:
 *   DRY_RUN=true            Report counts without writing anything (default: false)
 *   LIMIT=N                 Process at most N organizers (default: unlimited)
 *   BATCH_SIZE=N            Organizers per DB page (default: 200)
 *   DELAY_MS=N              Delay between each discovery network call, ms (default: 800)
 *   RETRY_UNVERIFIED=true   Also re-process rows already marked 'unverified_import'
 */

import { prisma } from '../lib/prisma';
import { discoverEmail } from '../services/emailDiscoveryService';

const UNVERIFIED_METHOD = 'unverified_import';
const UNVERIFIED_CONFIDENCE = 0.1;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN === 'true';
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;
  const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE, 10) : 200;
  const delayMs = process.env.DELAY_MS ? parseInt(process.env.DELAY_MS, 10) : 800;
  const retryUnverified = process.env.RETRY_UNVERIFIED === 'true';

  console.log('[Rediscover] Starting null-method email re-discovery...');
  console.log(
    `[Rediscover] DRY_RUN=${dryRun}, LIMIT=${limit ?? 'unlimited'}, BATCH_SIZE=${batchSize}, ` +
    `DELAY_MS=${delayMs}, RETRY_UNVERIFIED=${retryUnverified}`
  );

  const t0 = Date.now();

  // Target rows: contactEmail present, and method is NULL (or 'unverified_import' if retrying).
  // NEVER touch rows that already have a verified method.
  const methodWhere = retryUnverified
    ? { OR: [{ emailDiscoveryMethod: null }, { emailDiscoveryMethod: UNVERIFIED_METHOD }] }
    : { emailDiscoveryMethod: null };

  const baseWhere = {
    contactEmail: { not: null },
    ...methodWhere,
  };

  const total = await prisma.organizer.count({ where: baseWhere });
  console.log(`[Rediscover] ${total} organizers match (contactEmail set, method ${retryUnverified ? 'NULL or unverified_import' : 'NULL'})`);

  let processed = 0;
  let reVerified = 0;
  let markedUnverified = 0;
  let skippedNoWebsite = 0;
  let cursor: string | undefined;

  while (true) {
    if (limit && processed >= limit) break;

    const take = limit ? Math.min(batchSize, limit - processed) : batchSize;

    const organizers = await prisma.organizer.findMany({
      where: baseWhere,
      take,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      orderBy: { id: 'asc' },
      select: { id: true, businessName: true, contactEmail: true, website: true },
    });

    if (organizers.length === 0) break;

    for (const org of organizers) {
      processed++;

      if (dryRun) {
        // In dry-run we cannot run discovery side-effects safely; just classify what WOULD happen.
        if (org.website) {
          console.log(`[Rediscover][dry] would attempt discovery for ${org.id} (${org.businessName}) — website ${org.website}`);
        } else {
          skippedNoWebsite++;
          console.log(`[Rediscover][dry] would mark ${org.id} (${org.businessName}) as ${UNVERIFIED_METHOD} (no website to re-verify)`);
        }
        continue;
      }

      let discovered: string | null = null;
      if (org.website) {
        try {
          // discoverEmail() writes contactEmail + method + confidence + discoveredAt on success.
          discovered = await discoverEmail(org.id);
        } catch (err) {
          console.warn(`[Rediscover] discovery error for ${org.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        skippedNoWebsite++;
      }

      if (discovered) {
        reVerified++;
        console.log(`[Rediscover] Re-verified ${org.id} (${org.businessName}) → ${discovered}`);
      } else {
        // Not re-verified — KEEP existing contactEmail, gate it out of sends. Never null it.
        await prisma.organizer.update({
          where: { id: org.id },
          data: {
            emailDiscoveryMethod: UNVERIFIED_METHOD,
            emailDiscoveryConfidence: UNVERIFIED_CONFIDENCE,
            // contactEmail intentionally left untouched.
          },
        });
        markedUnverified++;
      }

      // Polite rate-limiting between network calls (only when we actually hit the network).
      if (org.website) await sleep(delayMs);

      if (processed % 100 === 0) {
        console.log(`[Rediscover] Progress: ${processed} processed, ${reVerified} re-verified, ${markedUnverified} marked-unverified`);
      }
    }

    cursor = organizers[organizers.length - 1]?.id;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log('[Rediscover] Summary:');
  console.log(`  Matched total:        ${total}`);
  console.log(`  Processed:            ${processed}`);
  console.log(`  Re-verified:          ${reVerified}`);
  console.log(`  Marked unverified:    ${markedUnverified}`);
  console.log(`  (no website to scrape): ${skippedNoWebsite}`);
  console.log(`  Elapsed:              ${elapsed}s`);
  if (dryRun) console.log('[Rediscover] *** DRY RUN — no records written ***');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[Rediscover] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
