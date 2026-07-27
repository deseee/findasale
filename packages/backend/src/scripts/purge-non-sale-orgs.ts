/**
 * One-time migration: purge off-target organizers from Phase 2 licensing scrapes,
 * AND from untracked-source ingestion (sourcesJson/directoryMostRecentSource both null).
 *
 * Background: Phase 2 licensing scrapers pulled ~37k organizers from state auction
 * license databases, including non-secondary-sale businesses (delis, auto shops, etc.).
 * This script soft-deletes off-target records by setting directoryStatus = 'CLOSED'.
 *
 * Extended 2026-07-27: found via bounce-suppression review that a batch of Organizer
 * rows created 2026-05-02 to 2026-05-04 have NO source tracking at all (sourcesJson
 * AND directoryMostRecentSource both null) and are obviously not secondary-sale
 * businesses -- e.g. "Bois Scott KeyBank Real Estate Capital", "The Bingo Mall",
 * "It'Sugar", "Jason's Deli, Collin Creek Mall...", "Tourneau Watch Shop" -- with
 * contactEmail values scraped from an outlet-mall/mega-brand site (info@premiumoutlets.com,
 * info@homegoods.com, etc.). These never matched isLicensingSource() (no sourcesJson at
 * all to check), so they silently evaded this script's original scope. The current live
 * scraper pipeline (services/scraper/index.ts gateScrapedEmail/gateScrapedWebsite) already
 * rejects this exact pattern for NEW scrapes -- this is purely a historical-data cleanup,
 * not a live ingestion bug.
 *
 * Safety:
 * - Soft delete only — directoryStatus set to 'CLOSED', never hard delete
 * - --dry-run flag previews changes without writing
 * - Records with businessCategory already in VALID_CATEGORIES are always kept
 * - Records with isClaimed=true are always kept (active FindA.Sale organizers)
 *
 * Usage:
 *   npx ts-node src/scripts/purge-non-sale-orgs.ts --dry-run
 *   npx ts-node src/scripts/purge-non-sale-orgs.ts
 *
 * Environment: DATABASE_URL must point to Railway DB (not localhost).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Allowed business categories (from ADR-075 VALID_CATEGORIES in index.ts).
 * Organizers with an explicit businessCategory in this set are always kept.
 */
const VALID_CATEGORIES = new Set([
  'ESTATE_SALE_CO',
  'AUCTION_HOUSE',
  'ANTIQUE_MALL',
  'ANTIQUE_DEALER',
  'CONSIGNMENT',
  'THRIFT_STORE',
  'FLEA_MARKET',
  'VINTAGE',
  'LIQUIDATION',
  'USED_FURNITURE',
  'PAWN_SHOP',
  'USED_BOOKSTORE',
  'RECORD_STORE',
  'USED_ELECTRONICS',
  'COIN_DEALER',
  'RESALE_SHOP',
  'USED_SPORTING_GOODS',
  'JEWELRY_RESALE',
]);

/**
 * Keywords in businessName that indicate a secondary-sale business.
 * Case-insensitive. All-lowercase here.
 */
const KEEP_KEYWORDS = [
  'estate sale',
  'estate sales',
  'estate auction',
  'estate auctions',
  'yard sale',
  'yard sales',
  'garage sale',
  'garage sales',
  'auction',
  'auctioneer',
  'auctioneers',
  'consignment',
  'thrift',
  'antique',
  'antiques',
  'flea market',
  'resale',
  're-sale',
  'vintage',
  'liquidat',
  'used furniture',
  'secondhand',
  'second hand',
  'second-hand',
  'collectible',
  'collectibles',
  'pawn',
  'used goods',
  'rummage',
  'surplus',
  'salvage',
  'estate service',
  'estate services',
  'tag sale',
  'tag sales',
  'moving sale',
  'downsizing',
  'buyout',
  'buy out',
  'estate buyer',
  'estate buyers',
];

/**
 * Referral-partner keywords — Patrick's explicit call (2026-07-27 spot-check): realtors,
 * estate attorneys, estate-planning/probate professionals, and senior-move/elder-care
 * services routinely refer clients who need to liquidate a household, even though they
 * are not secondary-sale businesses themselves. Spot-check found 477 realtor-named and
 * 17 attorney/estate-planning/hospice-named records that the original keyword set would
 * have purged (e.g. "Sentinel Real Estate Group", "Bratton Estate & Elder Care
 * Attorneys", "CITY OF LOS ANGELS HOSPICE FOUNDATION"). Kept separate from
 * KEEP_KEYWORDS (not a name/domain distinction, a business-relationship distinction) so
 * future readers understand WHY these are retained.
 */
const REFERRAL_PARTNER_KEYWORDS = [
  'realty', 'realtor', 'real estate', 'properties llc', 'properties inc',
  'keller williams', 're/max', 'remax', 'century 21', 'coldwell banker',
  'exp realty', 'compass real', 'berkshire hathaway', 'sotheby', 'corcoran',
  'redfin', 'weichert', 'better homes',
  'probate', 'executor', 'estate planning', 'estate attorney', 'elder law',
  'elder care', 'assisted living', 'senior living', 'hospice', 'trustee services',
  'trust law', 'law firm', 'law office', 'attorney', 'esq.', 'esq ',
  'financial advisor', 'wealth management', 'fiduciary', 'conservator',
  'geriatric care', 'home care agency', 'move management', 'senior move',
];

function hasReferralPartnerKeyword(businessName: string): boolean {
  const lower = businessName.toLowerCase();
  return REFERRAL_PARTNER_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Round 2 (Patrick, 2026-07-27): the round-1 fix only carved out AUCTION_HOUSE, but the
 * SAME root cause applies to every non-RESALE_SHOP category assigned from a Phase2/
 * Licensing feed. Full-DB breakdown of every licensing-sourced record that fails the name-
 * keyword check, by category:
 *   13,152 RESALE_SHOP   -- confirmed generic catch-all (parking garages, barber shops,
 *                           auto-body shops, individual contractors -- genuinely off-target)
 *    2,938 AUCTION_HOUSE -- state auctioneer-license records (e.g. Alex Lyon and Son)
 *      619 FLEA_MARKET   -- LouisianaPhase2 flea-market/itinerant-vendor license records
 *                           (e.g. individual booth vendors: "JEM BEAD ART", "BIJOUTIERE")
 *        9 PAWN_SHOP     -- pawn/loan/jewelry-buy license records
 *        5 CONSIGNMENT   -- consignment-shop license records
 * RESALE_SHOP is the ONLY category where the state feed dumps everything it can't
 * otherwise classify (confirmed both by the original script author's comment above and by
 * this breakdown: RESALE_SHOP outnumbers every other category combined by ~3.7x). Every
 * OTHER VALID_CATEGORIES value from a licensing source reflects the state's own license-
 * type classification and is exactly FindA.Sale's target audience (auctioneers, flea-
 * market/itinerant vendors, pawn shops, consignment shops, antique dealers, thrift stores,
 * liquidators) — trust it outright, no keyword match required.
 *
 * Deliberately scoped to LICENSING-sourced records only, NOT the untracked-source bucket
 * (sourcesJson/directoryMostRecentSource both null) — that bucket's categorization
 * mechanism is unverified and round 1's manual review found real junk there with non-
 * RESALE_SHOP categories (e.g. "Reynolds Paper Company", "State Farm Mutual Automobile
 * Insurance Company", generic moving companies all tagged ESTATE_SALE_CO) — those still
 * need the keyword gate below.
 */
function isTrustedLicensingCategory(category: string | null, sourcesJson: unknown): boolean {
  if (!category || category === 'RESALE_SHOP') return false;
  if (!VALID_CATEGORIES.has(category)) return false;
  return isLicensingSource(sourcesJson);
}

/**
 * Round 3 (Patrick, 2026-07-27 -- "are you nuts, we have a whole flea market venue
 * targeted portion of our PWA"): FLEA_MARKET and ANTIQUE_MALL are NOT off-target junk
 * categories, regardless of source or keyword match. Confirmed via ADR-014 (Sale Hubs
 * repurposed specifically into a flea-market/vendor-booth platform, APPROVED 2026-04-10),
 * ADR-090 (VendorBooth hub-owner payment split, S1142 -- its own reference example is
 * "Maple Lake Mall"), roadmap #238 (Flea Market Vendor Management + Settlement, TEAMS
 * tier, unlimited booths), and claude_docs/research/flea-market-software-competitive-
 * analysis.md (benchmarks Booth Tracker/Seen Markets/AntiqueTrack/Zinifly/SimpleConsign --
 * farmers markets, flea markets, antique malls are explicitly researched market segments).
 * A multi-vendor venue like "Eastern Market" or "Georgetown French Market" IS the exact
 * prospect list for the TEAMS Vendor Booth Hub product, not a generic shopping mall.
 * These two categories are excluded from purge consideration entirely -- keep unconditionally,
 * both licensing-sourced and untracked-source records.
 */
const NEVER_PURGE_CATEGORIES = new Set(['FLEA_MARKET', 'ANTIQUE_MALL']);

/**
 * Source name patterns that identify a Phase 2 licensing scraper record.
 * Licensing scrapers use names like "AlabamaLicensing", "TexasPhase2", etc.
 */
function isLicensingSource(sourcesJson: unknown): boolean {
  if (!sourcesJson || !Array.isArray(sourcesJson)) return false;
  return sourcesJson.some((s: any) => {
    const name: string = s?.sourceName ?? '';
    return name.includes('Licensing') || name.includes('Phase2') || name.toLowerCase().includes('licensing');
  });
}

/**
 * Returns true if a record has NO source attribution at all (both sourcesJson and
 * directoryMostRecentSource are empty/null). These predate or bypassed the current
 * source-tagging convention and are just as untrustworthy as a licensing-scrape record --
 * businessCategory on them is equally unreliable, so only KEEP_KEYWORDS is a trustworthy
 * signal (same reasoning as isLicensingSource records, see the loop below).
 */
function isUntrackedSource(sourcesJson: unknown, directoryMostRecentSource: string | null): boolean {
  const noSourcesJson = !sourcesJson || (Array.isArray(sourcesJson) && sourcesJson.length === 0);
  return noSourcesJson && !directoryMostRecentSource;
}

/**
 * Returns true if businessName contains any secondary-sale keyword.
 */
function hasKeepKeyword(businessName: string): boolean {
  const lower = businessName.toLowerCase();
  return KEEP_KEYWORDS.some((kw) => lower.includes(kw));
}

async function main(): Promise<void> {
  console.log(`[purge-non-sale-orgs] Starting — DRY_RUN=${DRY_RUN}`);
  console.log('[purge-non-sale-orgs] Fetching unmanaged organizers...');

  const PAGE_SIZE = 500;
  let offset = 0;
  let totalScanned = 0;
  let keepCount = 0;
  let skippedClaimed = 0;
  let untrackedScanned = 0;
  let untrackedPurged = 0;
  let referralPartnerKept = 0;
  let auctioneerLicenseKept = 0;
  let vendorMarketKept = 0;
  const purgeIds: string[] = [];

  while (true) {
    const batch = await prisma.organizer.findMany({
      where: {
        isUnmanagedListing: true,
        directoryStatus: { not: 'CLOSED' },
      },
      select: {
        id: true,
        businessName: true,
        businessCategory: true,
        isClaimed: true,
        directoryStatus: true,
        sourcesJson: true,
        directoryMostRecentSource: true,
      },
      skip: offset,
      take: PAGE_SIZE,
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) break;
    offset += batch.length;
    totalScanned += batch.length;

    for (const org of batch) {
      // Safety: never purge claimed organizers
      if (org.isClaimed) {
        skippedClaimed++;
        continue;
      }

      // Only process records from licensing/Phase2 sources OR records with no source
      // attribution at all (both equally unreliable-category, same treatment).
      const licensing = isLicensingSource(org.sourcesJson);
      const untracked = isUntrackedSource(org.sourcesJson, org.directoryMostRecentSource);
      if (!licensing && !untracked) {
        keepCount++;
        continue;
      }
      if (untracked) untrackedScanned++;

      // Hard exclusion (Patrick, 2026-07-27, round 3): FLEA_MARKET / ANTIQUE_MALL are a
      // deliberately-built TEAMS-tier target segment (Vendor Booth Hubs, ADR-014/090), not
      // off-target junk. Never purge these regardless of source, keyword, or anything else.
      if (org.businessCategory && NEVER_PURGE_CATEGORIES.has(org.businessCategory)) {
        keepCount++;
        vendorMarketKept++;
        continue;
      }

      // Referral-partner carve-out (Patrick, 2026-07-27): realtors, estate attorneys,
      // estate-planning/probate/elder-care professionals are not secondary-sale
      // businesses themselves but are a real referral channel — always keep.
      if (hasReferralPartnerKeyword(org.businessName)) {
        keepCount++;
        referralPartnerKept++;
        continue;
      }

      // Non-RESALE_SHOP licensing category carve-out — see isTrustedLicensingCategory
      // doc comment for the full evidence (round 2, 2026-07-27).
      if (isTrustedLicensingCategory(org.businessCategory, org.sourcesJson)) {
        keepCount++;
        auctioneerLicenseKept++;
        continue;
      }

      // For licensing/Phase2/untracked records, skip the category check entirely —
      // categories were auto-assigned during scraping and are unreliable
      // (e.g., parking companies and construction firms got RESALE_SHOP).
      // Only business name keywords are a trustworthy signal here.
      if (hasKeepKeyword(org.businessName)) {
        keepCount++;
        continue;
      }

      // Off-target — mark for purge
      if (untracked) untrackedPurged++;
      purgeIds.push(org.id);
    }

    process.stdout.write(`\r[purge-non-sale-orgs] Scanned ${totalScanned} records...`);
  }

  const purgeCount = purgeIds.length;

  console.log(`\n[purge-non-sale-orgs] Scan complete:`);
  console.log(`  Total scanned:      ${totalScanned}`);
  console.log(`  Keep (valid):       ${keepCount}`);
  console.log(`  Skip (claimed):     ${skippedClaimed}`);
  console.log(`  Untracked scanned:  ${untrackedScanned} (no sourcesJson + no directoryMostRecentSource)`);
  console.log(`  Untracked TO PURGE: ${untrackedPurged}`);
  console.log(`  Kept (referral partner — realtor/attorney/elder-care/etc.): ${referralPartnerKept}`);
  console.log(`  Kept (non-RESALE_SHOP category from a licensing feed — auctioneer/flea-market-vendor/pawn/consignment/etc.): ${auctioneerLicenseKept}`);
  console.log(`  Kept (FLEA_MARKET / ANTIQUE_MALL — TEAMS Vendor Booth Hub target segment, never purged): ${vendorMarketKept}`);
  console.log(`  TO PURGE:           ${purgeCount}`);

  if (purgeCount === 0) {
    console.log('[purge-non-sale-orgs] Nothing to purge — done.');
    return;
  }

  if (DRY_RUN) {
    console.log(`[purge-non-sale-orgs] DRY RUN — would soft-delete ${purgeCount} organizers.`);
    console.log('[purge-non-sale-orgs] Sample purge targets (first 20):');
    const sampleIds = purgeIds.slice(0, 20);
    const samples = await prisma.organizer.findMany({
      where: { id: { in: sampleIds } },
      select: { id: true, businessName: true, businessCategory: true, sourcesJson: true },
    });
    samples.forEach((s) => {
      const sources = Array.isArray(s.sourcesJson)
        ? (s.sourcesJson as any[]).map((x: any) => x.sourceName).join(', ')
        : 'unknown';
      console.log(`  - ${s.businessName} | cat=${s.businessCategory ?? 'null'} | sources=${sources}`);
    });
    console.log('[purge-non-sale-orgs] Re-run without --dry-run to apply.');
    return;
  }

  // Apply soft-delete in batches of 100
  console.log(`[purge-non-sale-orgs] Applying soft-delete to ${purgeCount} organizers...`);
  const WRITE_BATCH = 100;
  let written = 0;

  for (let i = 0; i < purgeIds.length; i += WRITE_BATCH) {
    const chunk = purgeIds.slice(i, i + WRITE_BATCH);
    await prisma.organizer.updateMany({
      where: { id: { in: chunk } },
      data: {
        directoryStatus: 'CLOSED',
        directoryStatusReason: 'purge-non-sale-orgs: off-target business category from licensing scrape',
        directoryStatusSetAt: new Date(),
      },
    });
    written += chunk.length;
    process.stdout.write(`\r[purge-non-sale-orgs] Written ${written}/${purgeCount}...`);
  }

  console.log(`\n[purge-non-sale-orgs] Done — ${purgeCount} organizers soft-deleted (directoryStatus=CLOSED).`);
}

main()
  .catch((err) => {
    console.error('[purge-non-sale-orgs] Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
