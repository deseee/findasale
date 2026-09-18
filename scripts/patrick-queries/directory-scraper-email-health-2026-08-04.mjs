// Run from packages/database with DATABASE_URL set to the Railway production URL:
//   cd packages/database && node ../../scripts/patrick-queries/directory-scraper-email-health-2026-08-04.mjs
//
// WHY: We already confirmed the 2026-06-22 domain-matching gate (gateScrapedEmail() in
// packages/backend/src/services/scraper/index.ts, rules from
// packages/backend/src/services/emailProvenance.ts) silently rejects most scraped emails
// for state-license sources (individual auctioneers using personal Gmail/Yahoo/AOL
// addresses, no website field to match against) -- but a DB audit showed near-100%
// missing email is actually near-universal across ~50 state license sources both BEFORE
// and AFTER the gate shipped, meaning the gate is probably not the dominant cause there
// (those sources likely never captured emails at all).
//
// This script asks the same question for the OTHER kind of scraper source: business/company
// DIRECTORIES (EstateSale.com, EstateSales.org, Invaluable, BidSpotter, NASMM, Fleamapket,
// SwapmeetDirectory, PropertyRoom, PublicSurplus, YellowPagesCA, AuctionNinja,
// FleaMarketZone, StorageAuctionsNet, StorageAuctionsCom, EstateSalesNet, GarageSaleFinder,
// FacebookMarketplace, NAAFindAnAuctioneer -- the `enabled: true, type: 'directory'` sources
// in packages/backend/src/services/scraper/sourceRegistry.ts, confirmed by reading that file
// on 2026-08-04). These sources scrape actual companies that typically list a website AND an
// email together, so the domain-match gate should theoretically pass most of the time (email
// domain matches the company's own site) -- but this has never been checked against real data.
//
// WHICH FIELD IDENTIFIES THE SOURCE (read from schema.prisma + scraper/index.ts on 2026-08-04):
// Organizer has NO single "createdBySource" field. The closest thing is
// `directoryMostRecentSource` (String?), set inside getOrCreateScrapedOrganizer() in
// scraper/index.ts to `sourceLabel ?? sourceName ?? ('StateLicensing' if isStateLicensed)`.
// Every directory scraper file passes a literal SOURCE_NAME/sourceName string as the 2nd
// positional arg to getOrCreateScrapedOrganizer() (e.g. SOURCE_NAME = 'EstateSaleCom' in
// estateSaleComScraper.ts, 'EstateSalesOrg' in estatesalesOrgScraper.ts, 'Invaluable' in
// invaluableAuctionHouseScraper.ts, 'AuctionNinja' / 'YellowPagesCA' as inline literals,
// 'EstateSalesNet' / 'GarageSaleFinder' via a sourceName field on a batch upsert path) --
// and those literal strings match the `id` field of each entry in SOURCE_REGISTRY exactly.
// So `directoryMostRecentSource` is a real, confirmed way to attribute a row to a directory
// scraper -- but read the CAVEAT below before trusting it as "which source created this row."
//
// CAVEAT #1 (proxy, not ground truth): `directoryMostRecentSource` is the MOST RECENT source
// that touched a record, not necessarily the ORIGINATING one -- if two directory scrapers (or
// a directory scraper and a licensing scraper) matched the same organizer via
// googlePlaceId/foursquareVenueId/hereBusinessId/dedupeKey merge logic, only the latest
// touch's label survives here. For the vast majority of directory-sourced rows this will
// still be correct (most organizers are only ever touched by one source), but don't treat
// per-source counts below as exact originating-source counts.
//
// CAVEAT #2 (contactEmail IS NULL is a proxy for gate-rejection, not a precise count): an
// organizer can have no contactEmail because the directory listing never published one, not
// only because the gate rejected it. This script shows correlation with the gate's ship date
// (2026-06-22), not a confirmed loss count -- same caveat as the sibling state-license audit.
import { PrismaClient } from '../../packages/database/node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();

const GATE_SHIP_DATE = new Date('2026-06-22T00:00:00Z');

// enabled: true, type: 'directory' entries in SOURCE_REGISTRY as of 2026-08-04
// (packages/backend/src/services/scraper/sourceRegistry.ts) -- values match the SOURCE_NAME /
// sourceName string each scraper file passes into getOrCreateScrapedOrganizer(), which is what
// ends up in Organizer.directoryMostRecentSource.
const DIRECTORY_SOURCE_IDS = [
  'EstateSalesNet',
  'GarageSaleFinder',
  'FacebookMarketplace',
  'NAAFindAnAuctioneer',
  'AuctionNinja',
  'YellowPagesCA',
  'FleaMarketZone',
  'StorageAuctionsNet',
  'PropertyRoom',
  'StorageAuctionsCom',
  'PublicSurplus',
  'BidSpotter',
  'Invaluable',
  'Fleamapket',
  'EstateSalesOrg',
  'SwapmeetDirectory',
  'NASMM',
  'EstateSaleCom',
];

const rows = await prisma.organizer.findMany({
  where: { directoryMostRecentSource: { in: DIRECTORY_SOURCE_IDS } },
  select: {
    businessName: true,
    website: true,
    contactEmail: true,
    directoryMostRecentSource: true,
    createdAt: true,
  },
});

console.log(
  `Loaded ${rows.length} organizer rows where directoryMostRecentSource is one of the ${DIRECTORY_SOURCE_IDS.length} enabled directory-type sources.\n`
);

if (rows.length === 0) {
  console.log(
    'No rows matched. This could mean directoryMostRecentSource uses different string values than expected -- ' +
      're-check SOURCE_NAME constants in packages/backend/src/services/scraper/sources/*.ts against DIRECTORY_SOURCE_IDS above.'
  );
  await prisma.$disconnect();
  process.exit(0);
}

// Distinct-source summary (sanity check that our expected id list actually matches DB reality).
const distinctSources = new Set(rows.map(r => r.directoryMostRecentSource));
console.log('=== DISTINCT directoryMostRecentSource VALUES PRESENT (within our directory-id filter) ===');
console.log(`${distinctSources.size} of ${DIRECTORY_SOURCE_IDS.length} enabled directory sources have any organizer rows at all.\n`);

// Bucket + aggregate per source.
const sourceStats = new Map(); // source -> { before: {...}, after: {...}, samples: [] }
function bucketFor(source) {
  if (!sourceStats.has(source)) {
    sourceStats.set(source, {
      before: { total: 0, withWebsite: 0, withEmail: 0, withBoth: 0 },
      after: { total: 0, withWebsite: 0, withEmail: 0, withBoth: 0 },
      samples: [],
    });
  }
  return sourceStats.get(source);
}

for (const r of rows) {
  const entry = bucketFor(r.directoryMostRecentSource);
  const bucket = r.createdAt < GATE_SHIP_DATE ? entry.before : entry.after;
  bucket.total += 1;
  const hasWebsite = !!r.website;
  const hasEmail = !!r.contactEmail;
  if (hasWebsite) bucket.withWebsite += 1;
  if (hasEmail) bucket.withEmail += 1;
  if (hasWebsite && hasEmail) bucket.withBoth += 1;
  if (entry.samples.length < 5) {
    entry.samples.push({
      businessName: r.businessName,
      website: r.website,
      contactEmail: r.contactEmail ? '<set>' : null,
      createdAt: r.createdAt.toISOString().slice(0, 10),
    });
  }
}

const sortedSources = [...sourceStats.keys()].sort((a, b) => a.localeCompare(b));

console.log('=== PER-SOURCE BEFORE (pre-2026-06-22) vs AFTER (post-2026-06-22 gate) ===');
console.log(
  'Source                | BEFORE: total/website/email/both | AFTER: total/website/email/both'
);
console.log('-'.repeat(110));

const grand = {
  before: { total: 0, withWebsite: 0, withEmail: 0, withBoth: 0 },
  after: { total: 0, withWebsite: 0, withEmail: 0, withBoth: 0 },
};

for (const source of sortedSources) {
  const s = sourceStats.get(source);
  grand.before.total += s.before.total;
  grand.before.withWebsite += s.before.withWebsite;
  grand.before.withEmail += s.before.withEmail;
  grand.before.withBoth += s.before.withBoth;
  grand.after.total += s.after.total;
  grand.after.withWebsite += s.after.withWebsite;
  grand.after.withEmail += s.after.withEmail;
  grand.after.withBoth += s.after.withBoth;

  const beforeStr = `${s.before.total}/${s.before.withWebsite}/${s.before.withEmail}/${s.before.withBoth}`;
  const afterStr = `${s.after.total}/${s.after.withWebsite}/${s.after.withEmail}/${s.after.withBoth}`;
  console.log(`${source.padEnd(22)} | ${beforeStr.padEnd(33)} | ${afterStr}`);
}

console.log('-'.repeat(110));
console.log(
  `${'GRAND TOTAL'.padEnd(22)} | ${`${grand.before.total}/${grand.before.withWebsite}/${grand.before.withEmail}/${grand.before.withBoth}`.padEnd(
    33
  )} | ${grand.after.total}/${grand.after.withWebsite}/${grand.after.withEmail}/${grand.after.withBoth}`
);

console.log('\n=== SUMMARY ===');
const beforeEmailRate =
  grand.before.total > 0 ? ((grand.before.withEmail / grand.before.total) * 100).toFixed(1) : 'n/a';
const afterEmailRate =
  grand.after.total > 0 ? ((grand.after.withEmail / grand.after.total) * 100).toFixed(1) : 'n/a';
const beforeWebsiteEmailRate =
  grand.before.withWebsite > 0 ? ((grand.before.withBoth / grand.before.withWebsite) * 100).toFixed(1) : 'n/a';
const afterWebsiteEmailRate =
  grand.after.withWebsite > 0 ? ((grand.after.withBoth / grand.after.withWebsite) * 100).toFixed(1) : 'n/a';
console.log(
  `BEFORE gate (pre-2026-06-22): ${grand.before.total} organizers, ${grand.before.withEmail} with contactEmail (${beforeEmailRate}%); of the ${grand.before.withWebsite} with a website, ${grand.before.withBoth} also have contactEmail (${beforeWebsiteEmailRate}%)`
);
console.log(
  `AFTER gate (post-2026-06-22): ${grand.after.total} organizers, ${grand.after.withEmail} with contactEmail (${afterEmailRate}%); of the ${grand.after.withWebsite} with a website, ${grand.after.withBoth} also have contactEmail (${afterWebsiteEmailRate}%)`
);
console.log(
  '\nIf the "of the N with a website, M also have contactEmail" rate drops sharply after 2026-06-22 relative to'
);
console.log(
  'before, that is the directory-source analog of the Alabama finding -- the gate rejecting emails on'
);
console.log('companies that DO have a matching website domain would be a real bug, not source noise.');

console.log('\n=== SAMPLE ROWS PER SOURCE (up to 5 each, for human eyeballing) ===');
for (const source of sortedSources) {
  const s = sourceStats.get(source);
  console.log(`\n--- ${source} (${s.before.total + s.after.total} total rows) ---`);
  if (s.samples.length === 0) {
    console.log('  (no sample rows captured)');
    continue;
  }
  for (const sample of s.samples) {
    console.log(
      `  "${sample.businessName}" | website=${sample.website ?? 'null'} | contactEmail=${sample.contactEmail ?? 'null'} | createdAt=${sample.createdAt}`
    );
  }
}

console.log('\nReminder: contactEmail IS NULL is a PROXY for gate-rejection, not a precise count -- an');
console.log('organizer can also have no email because the source directory listing never published one at');
console.log('all. directoryMostRecentSource is the MOST RECENT touching source, not necessarily the');
console.log('originating one (see CAVEAT #1 in the header). This shows correlation with the gate\'s ship');
console.log('date (2026-06-22), not a confirmed loss count.');

await prisma.$disconnect();
