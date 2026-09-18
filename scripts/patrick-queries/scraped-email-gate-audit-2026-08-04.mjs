// Run from packages/database with DATABASE_URL set to the Railway production URL:
//   cd packages/database && node ../../scripts/patrick-queries/scraped-email-gate-audit-2026-08-04.mjs
//
// WHY: On 2026-06-22 (commit 1b733107b) a domain-matching gate went live in
// packages/backend/src/services/scraper/index.ts (gateScrapedEmail()) that rejects any
// scraped contact email unless its domain matches the organizer's website or shares a
// name-token with the business name. This structurally rejects personal Gmail/Yahoo/AOL/
// Hotmail/MSN addresses for individual state-license scrapers. Live Railway logs already
// confirmed today's Alabama scraper run alone had ~239 of 596 scraped emails rejected by
// this gate. This script checks whether OTHER state-license scraper runs show the same
// pattern since the gate shipped.
//
// WHAT IT DOES: For every Organizer row with licenseState IS NOT NULL, splits rows into
// two time buckets by createdAt -- before 2026-06-22T00:00:00Z (pre-gate) and on/after it
// (post-gate) -- then for each licenseState in each bucket reports: total rows, rows WITH
// a contactEmail, and rows WITHOUT one. Prints per-state before/after side by side, plus a
// grand-total summary per bucket, plus a separate count of how many distinct licenseState
// values exist at all (bounds how many of the ~90 state scrapers in the codebase have ever
// actually produced data).
//
// CAVEAT (read before drawing conclusions): contactEmail IS NULL is a PROXY for
// gate-rejection, not a precise count -- an organizer can also have no email because the
// source licensing site never published one at all. This shows correlation with the gate's
// ship date (2026-06-22), not a confirmed loss count.
import { PrismaClient } from '../../packages/database/node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();

const GATE_SHIP_DATE = new Date('2026-06-22T00:00:00Z');

const rows = await prisma.organizer.findMany({
  where: { licenseState: { not: null } },
  select: { licenseState: true, contactEmail: true, createdAt: true },
});

console.log(`Loaded ${rows.length} organizer rows with licenseState IS NOT NULL.\n`);

// Distinct-state summary (bounds how many of the ~90 state scrapers have ever run).
const distinctStates = new Set(rows.map(r => r.licenseState));
console.log('=== DISTINCT licenseState VALUES PRESENT ===');
console.log(`${distinctStates.size} distinct state(s) have any scraped data at all (out of ~90 state scraper files in the codebase).\n`);

// Bucket + aggregate per state.
const stateStats = new Map(); // state -> { before: {total,withEmail,withoutEmail}, after: {...} }
function bucketFor(state) {
  if (!stateStats.has(state)) {
    stateStats.set(state, {
      before: { total: 0, withEmail: 0, withoutEmail: 0 },
      after: { total: 0, withEmail: 0, withoutEmail: 0 },
    });
  }
  return stateStats.get(state);
}

for (const r of rows) {
  const bucket = r.createdAt < GATE_SHIP_DATE ? 'before' : 'after';
  const stats = bucketFor(r.licenseState)[bucket];
  stats.total += 1;
  if (r.contactEmail) stats.withEmail += 1;
  else stats.withoutEmail += 1;
}

const sortedStates = [...stateStats.keys()].sort((a, b) => a.localeCompare(b));

console.log('=== PER-STATE BEFORE (pre-2026-06-22) vs AFTER (post-2026-06-22 gate) ===');
console.log('State                | BEFORE: total/withEmail/withoutEmail | AFTER: total/withEmail/withoutEmail');
console.log('-'.repeat(100));

const grand = {
  before: { total: 0, withEmail: 0, withoutEmail: 0 },
  after: { total: 0, withEmail: 0, withoutEmail: 0 },
};

for (const state of sortedStates) {
  const s = stateStats.get(state);
  grand.before.total += s.before.total;
  grand.before.withEmail += s.before.withEmail;
  grand.before.withoutEmail += s.before.withoutEmail;
  grand.after.total += s.after.total;
  grand.after.withEmail += s.after.withEmail;
  grand.after.withoutEmail += s.after.withoutEmail;

  const beforeStr = `${s.before.total}/${s.before.withEmail}/${s.before.withoutEmail}`;
  const afterStr = `${s.after.total}/${s.after.withEmail}/${s.after.withoutEmail}`;
  console.log(`${state.padEnd(21)} | ${beforeStr.padEnd(37)} | ${afterStr}`);
}

console.log('-'.repeat(100));
console.log(`${'GRAND TOTAL'.padEnd(21)} | ${`${grand.before.total}/${grand.before.withEmail}/${grand.before.withoutEmail}`.padEnd(37)} | ${grand.after.total}/${grand.after.withEmail}/${grand.after.withoutEmail}`);

console.log('\n=== SUMMARY ===');
const beforeRate = grand.before.total > 0 ? ((grand.before.withoutEmail / grand.before.total) * 100).toFixed(1) : 'n/a';
const afterRate = grand.after.total > 0 ? ((grand.after.withoutEmail / grand.after.total) * 100).toFixed(1) : 'n/a';
console.log(`BEFORE gate (pre-2026-06-22): ${grand.before.total} organizers, ${grand.before.withoutEmail} with no contactEmail (${beforeRate}%)`);
console.log(`AFTER gate (post-2026-06-22): ${grand.after.total} organizers, ${grand.after.withoutEmail} with no contactEmail (${afterRate}%)`);
console.log('\nReminder: contactEmail IS NULL is a PROXY for gate-rejection, not a precise count -- an');
console.log('organizer can also have no email because the source licensing site never published one at');
console.log('all. This shows correlation with the gate\'s ship date (2026-06-22), not a confirmed loss count.');

await prisma.$disconnect();
