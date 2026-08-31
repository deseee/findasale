/**
 * seedPackageProfiles.ts — idempotent seed for the global PackageProfile and
 * EbayCategoryFee reference tables used by the calculated-shipping + net engine.
 *
 * Safe to run against production: it does NOT wipe any data. It upserts the
 * EbayCategoryFee default + overrides by ebayCategoryId, and only inserts
 * PackageProfile rows when the table is empty (so re-runs don't duplicate).
 *
 * Run:  npx ts-node prisma/seedPackageProfiles.ts
 *   or: npx prisma db execute is NOT needed — this uses the Prisma client.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── EbayCategoryFee: published 2026 rates ───────────────────────────────────
// Default 13.60% + $0.40 per order. Media/books category override 15.30%.
// ebayCategoryId values are eBay top-level/representative leaf IDs.
const CATEGORY_FEES: Array<{
  ebayCategoryId: string | null;
  categoryLabel: string | null;
  fvfPercent: number;
  perOrderFeeCents: number;
  notes?: string;
}> = [
  { ebayCategoryId: null, categoryLabel: 'Default (most categories)', fvfPercent: 0.136, perOrderFeeCents: 40, notes: 'eBay 2026 published default final value fee' },
  { ebayCategoryId: '267', categoryLabel: 'Books & Magazines', fvfPercent: 0.153, perOrderFeeCents: 40, notes: 'Media rate (Books)' },
  { ebayCategoryId: '11233', categoryLabel: 'Music (CDs, Vinyl)', fvfPercent: 0.153, perOrderFeeCents: 40, notes: 'Media rate (Music)' },
  { ebayCategoryId: '11232', categoryLabel: 'Movies & TV (DVD, Blu-ray)', fvfPercent: 0.153, perOrderFeeCents: 40, notes: 'Media rate (Movies)' },
  { ebayCategoryId: '1249', categoryLabel: 'Video Games & Consoles', fvfPercent: 0.153, perOrderFeeCents: 40, notes: 'Media rate (Video Games)' },
];

// ── PackageProfile: common secondary-sale item types (PACKED weights/dims) ──
// packageType uses eBay enums: PACKAGE_THICK_ENVELOPE | MAILING_BOX | LARGE_PACKAGE | USPS_FLAT_RATE_ENVELOPE
type Profile = {
  category?: string;
  keyword?: string;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  packageType: string;
  confidence: number;
};

const PROFILES: Profile[] = [
  // Glassware / ceramics (well-padded boxes)
  { category: 'Glassware', keyword: 'glass', weightOz: 28, lengthIn: 10, widthIn: 8, heightIn: 8, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'mug', weightOz: 20, lengthIn: 8, widthIn: 6, heightIn: 5, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'vase', weightOz: 40, lengthIn: 12, widthIn: 10, heightIn: 10, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'plate', weightOz: 24, lengthIn: 12, widthIn: 12, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'pyrex', weightOz: 48, lengthIn: 12, widthIn: 10, heightIn: 8, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'figurine', weightOz: 18, lengthIn: 8, widthIn: 6, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },

  // Books / media
  { category: 'Books', keyword: 'book', weightOz: 20, lengthIn: 10, widthIn: 8, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },
  // Magazines -- added 2026-08-15 (Patrick live report: magazines had zero PackageProfile
  // coverage, so real listed magazines never got a resolved weight and always fell through
  // to Facebook's local-pickup-only fallback). Matches 'Books & Magazines:Magazines' category
  // text and the bare keyword. Weight/dims sized for a typical single glossy magazine.
  { category: 'Magazines', keyword: 'magazine', weightOz: 6, lengthIn: 11, widthIn: 9, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.65 },
  // Category-only rows (keyword omitted so PackageProfile step-3 exact-category-match
  // can reach them -- a row with both category+keyword set is only ever reached via the
  // keyword/title path, never the category path, per ebayPackageEstimateService.ts's own
  // `keyword: null` filter on the category query). Exact strings observed in production
  // for real magazine listings, including the legacy HTML-entity-encoded variant.
  { category: 'Books &amp; Magazines:Magazines', weightOz: 6, lengthIn: 11, widthIn: 9, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { category: 'Books & Magazines', weightOz: 6, lengthIn: 11, widthIn: 9, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { category: 'Books & Magazines:Magazines', weightOz: 6, lengthIn: 11, widthIn: 9, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },

  // Category-gap audit follow-up (2026-08-15, same session) -- real production items with
  // no PackageProfile coverage, found via the same 'what's actually AVAILABLE with no
  // confirmed weight' audit methodology used for magazines above. Music's 48-item gap was
  // mostly a false alarm (42/48 already match the existing vinyl/record keywords -- this is
  // just a low-confidence catch-all for the box-set/plain-'Album' titles that don't).
  { category: 'Music', weightOz: 12, lengthIn: 13, widthIn: 13, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.5 },
  { keyword: 'antler', weightOz: 8, lengthIn: 14, widthIn: 6, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.5 },
  { keyword: 'shoe rack', weightOz: 48, lengthIn: 20, widthIn: 14, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.5 },
  { keyword: 'sash lock', weightOz: 4, lengthIn: 6, widthIn: 4, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { keyword: 'wall mount', weightOz: 16, lengthIn: 12, widthIn: 10, heightIn: 3, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.5 },
  { keyword: 'golf', weightOz: 28, lengthIn: 40, widthIn: 6, heightIn: 4, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'skates', weightOz: 64, lengthIn: 14, widthIn: 10, heightIn: 8, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'swim cuffs', weightOz: 4, lengthIn: 8, widthIn: 6, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { keyword: 'crock', weightOz: 64, lengthIn: 13, widthIn: 12, heightIn: 9, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'cufflink', weightOz: 3, lengthIn: 5, widthIn: 4, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.65 },
  { keyword: 'cigar mold', weightOz: 32, lengthIn: 14, widthIn: 8, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'spittoon', weightOz: 24, lengthIn: 10, widthIn: 10, heightIn: 8, packageType: 'MAILING_BOX', confidence: 0.55 },
  { category: 'Pottery & Glass', weightOz: 24, lengthIn: 11, widthIn: 11, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.45 },

  // Orphaned by the keyword-collision word-boundary fix (below) -- these items previously
  // got a WRONG estimate via a substring false-match ('doll' matching "Dollar Size", 'racket'
  // matching "Brackets") and now correctly fall through to nothing without a real row.
  { keyword: 'display slab', weightOz: 4, lengthIn: 6, widthIn: 4, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { keyword: 'hanger bracket', weightOz: 16, lengthIn: 10, widthIn: 8, heightIn: 3, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.5 },

  // Remaining smaller-category gap fill (2026-08-15, same session, second pass beyond the top 5)
  { keyword: 'pocket pages', weightOz: 4, lengthIn: 9, widthIn: 6, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { keyword: 'decorative mask', weightOz: 20, lengthIn: 10, widthIn: 8, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.5 },
  { keyword: 'balance board', weightOz: 48, lengthIn: 20, widthIn: 12, heightIn: 4, packageType: 'LARGE_PACKAGE', confidence: 0.55 },
  { keyword: 'steam link', weightOz: 8, lengthIn: 6, widthIn: 5, heightIn: 2, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'cartridge', weightOz: 4, lengthIn: 6, widthIn: 4, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.55 },
  { keyword: 'lighter', weightOz: 8, lengthIn: 5, widthIn: 4, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.55 },
  { keyword: 'telescope', weightOz: 80, lengthIn: 24, widthIn: 10, heightIn: 10, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'cuff link', weightOz: 3, lengthIn: 5, widthIn: 4, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.65 },
  { keyword: 'sign', weightOz: 40, lengthIn: 18, widthIn: 14, heightIn: 3, packageType: 'MAILING_BOX', confidence: 0.45 },
  { keyword: 'tin', weightOz: 24, lengthIn: 8, widthIn: 8, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.45 },
  { category: 'Video Games & Consoles:Video Games', weightOz: 3, lengthIn: 6, widthIn: 4, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.5 },
  { keyword: 'hardcover', weightOz: 32, lengthIn: 11, widthIn: 9, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.65 },
  { keyword: 'vinyl', weightOz: 12, lengthIn: 13, widthIn: 13, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },
  { keyword: 'record', weightOz: 12, lengthIn: 13, widthIn: 13, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.65 },
  { keyword: 'dvd', weightOz: 6, lengthIn: 8, widthIn: 6, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.75 },
  { keyword: 'cd', weightOz: 4, lengthIn: 6, widthIn: 6, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },

  // Small electronics
  { category: 'Electronics', keyword: 'camera', weightOz: 36, lengthIn: 10, widthIn: 8, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'radio', weightOz: 40, lengthIn: 12, widthIn: 8, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'speaker', weightOz: 48, lengthIn: 12, widthIn: 10, heightIn: 9, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'headphones', weightOz: 12, lengthIn: 9, widthIn: 7, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'console', weightOz: 80, lengthIn: 16, widthIn: 12, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'controller', weightOz: 10, lengthIn: 8, widthIn: 6, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.65 },

  // Jewelry / small valuables
  { category: 'Jewelry', keyword: 'ring', weightOz: 3, lengthIn: 5, widthIn: 4, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.75 },
  { keyword: 'necklace', weightOz: 4, lengthIn: 6, widthIn: 5, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },
  { keyword: 'watch', weightOz: 8, lengthIn: 6, widthIn: 5, heightIn: 3, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'brooch', weightOz: 3, lengthIn: 5, widthIn: 4, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },

  // Clothing / textiles
  { category: 'Clothing', keyword: 'shirt', weightOz: 10, lengthIn: 12, widthIn: 9, heightIn: 3, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.65 },
  { keyword: 'jacket', weightOz: 32, lengthIn: 14, widthIn: 11, heightIn: 5, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'dress', weightOz: 18, lengthIn: 13, widthIn: 10, heightIn: 4, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { keyword: 'coat', weightOz: 48, lengthIn: 16, widthIn: 12, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'boots', weightOz: 40, lengthIn: 14, widthIn: 10, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.6 },
  { category: 'Linens', keyword: 'quilt', weightOz: 56, lengthIn: 16, widthIn: 13, heightIn: 8, packageType: 'MAILING_BOX', confidence: 0.55 },

  // Kitchenware / cookware
  { category: 'Kitchenware', keyword: 'skillet', weightOz: 80, lengthIn: 14, widthIn: 12, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'cast iron', weightOz: 96, lengthIn: 14, widthIn: 12, heightIn: 5, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'pot', weightOz: 64, lengthIn: 13, widthIn: 12, heightIn: 9, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'mixer', weightOz: 112, lengthIn: 16, widthIn: 13, heightIn: 12, packageType: 'LARGE_PACKAGE', confidence: 0.55 },
  { keyword: 'utensil', weightOz: 8, lengthIn: 10, widthIn: 5, heightIn: 3, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { keyword: 'bowl', weightOz: 24, lengthIn: 11, widthIn: 11, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.6 },

  // Tools
  { category: 'Tools', keyword: 'drill', weightOz: 64, lengthIn: 13, widthIn: 10, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'wrench', weightOz: 24, lengthIn: 12, widthIn: 5, heightIn: 3, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'hammer', weightOz: 28, lengthIn: 14, widthIn: 6, heightIn: 3, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'saw', weightOz: 48, lengthIn: 26, widthIn: 8, heightIn: 4, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'tool set', weightOz: 96, lengthIn: 16, widthIn: 12, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'pump', weightOz: 80, lengthIn: 14, widthIn: 10, heightIn: 8, packageType: 'MAILING_BOX', confidence: 0.5 },

  // Art / decor
  { category: 'Art', keyword: 'framed', weightOz: 48, lengthIn: 24, widthIn: 18, heightIn: 4, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'painting', weightOz: 56, lengthIn: 26, widthIn: 20, heightIn: 4, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'print', weightOz: 12, lengthIn: 20, widthIn: 4, heightIn: 4, packageType: 'MAILING_TUBE', confidence: 0.55 },
  { keyword: 'mirror', weightOz: 64, lengthIn: 24, widthIn: 18, heightIn: 4, packageType: 'LARGE_PACKAGE', confidence: 0.45 },
  { keyword: 'clock', weightOz: 40, lengthIn: 13, widthIn: 11, heightIn: 7, packageType: 'MAILING_BOX', confidence: 0.55 },

  // Lamps / lighting / small appliances
  { keyword: 'lamp', weightOz: 80, lengthIn: 16, widthIn: 12, heightIn: 12, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'lampshade', weightOz: 20, lengthIn: 16, widthIn: 16, heightIn: 12, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'toaster', weightOz: 64, lengthIn: 13, widthIn: 9, heightIn: 9, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'blender', weightOz: 80, lengthIn: 14, widthIn: 10, heightIn: 12, packageType: 'LARGE_PACKAGE', confidence: 0.55 },
  { keyword: 'fan', weightOz: 96, lengthIn: 18, widthIn: 14, heightIn: 8, packageType: 'LARGE_PACKAGE', confidence: 0.5 },

  // Toys / games / collectibles
  { category: 'Toys', keyword: 'toy', weightOz: 16, lengthIn: 10, widthIn: 8, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'doll', weightOz: 20, lengthIn: 12, widthIn: 8, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'puzzle', weightOz: 24, lengthIn: 12, widthIn: 10, heightIn: 3, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'board game', weightOz: 32, lengthIn: 12, widthIn: 10, heightIn: 3, packageType: 'MAILING_BOX', confidence: 0.6 },
  // 2026-08-15: weightOz corrected 4->2 -- live eBay-recorded weight for 7/7 real already-listed
  // Eisenhower dollar coins agreed exactly at 2oz (confirmed via GetItem ShippingPackageDetails,
  // this session's PackageProfile weight audit). The old 4oz default was ~1oz+ over the real weight
  // of a single coin in a thick envelope and was also pushing these items over the eBay Standard
  // Envelope program's 3oz cap for no real physical reason.
  // CORRECTED FURTHER 2026-08-31 (Patrick, live guidance): "most coins are only 1oz. it's bigger
  // coins that hit 2 or 3oz for the most part" -- the 2oz value above was itself still too high
  // for the median case a single generic 'coin' keyword actually covers. Also discovered same
  // session: this row's 2oz value never reached production at all (PROFILES only inserts on an
  // empty table, so the 4->2 correction above silently never applied) -- production still had the
  // original 4oz until fixed directly 2026-08-31. Using 1oz now per Patrick's real-world default;
  // a separate bigger-coin-specific keyword (e.g. "silver dollar") is a possible follow-up if he
  // wants that split tracked distinctly, not added here.
  { category: 'Collectibles', keyword: 'coin', weightOz: 1, lengthIn: 6, widthIn: 5, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.65 },
  { keyword: 'card', weightOz: 3, lengthIn: 6, widthIn: 4, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },

  // Sports
  { category: 'Sports', keyword: 'glove', weightOz: 16, lengthIn: 11, widthIn: 9, heightIn: 5, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'racket', weightOz: 24, lengthIn: 28, widthIn: 12, heightIn: 3, packageType: 'LARGE_PACKAGE', confidence: 0.5 },

  // Furniture small (most furniture is local-pickup, but small pieces ship)
  { keyword: 'stool', weightOz: 160, lengthIn: 20, widthIn: 16, heightIn: 16, packageType: 'LARGE_PACKAGE', confidence: 0.45 },
  { keyword: 'chair', weightOz: 240, lengthIn: 24, widthIn: 22, heightIn: 36, packageType: 'LARGE_PACKAGE', confidence: 0.4 },
];

// ── Gap-fill profiles added 2026-07-22 (ADR fb-package-weight-estimator) ────
// seedPackageProfiles' PROFILES/main() above only inserts when the table is completely
// empty, so production (already seeded) would silently skip anything appended there.
// These rows are added via a separate, always-runs, per-row idempotent path instead
// (findFirst-by-keyword, skip if present) -- safe to re-run, and doesn't touch or
// re-run the original bulk insert. Sourced from USPS/UPS published box/packaging
// weights for each object class, not AI/vision estimates -- see ADR for reasoning
// (this fix exists specifically to stop depending on single-photo AI weight guesses).
const GAP_FILL_PROFILES: Profile[] = [
  // Musical instruments/gear -- zero prior coverage despite recurring category.
  { category: 'Musical Instruments & Gear', keyword: 'pedal', weightOz: 24, lengthIn: 8, widthIn: 6, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'mic stand', weightOz: 48, lengthIn: 30, widthIn: 6, heightIn: 6, packageType: 'LARGE_PACKAGE', confidence: 0.55 },
  { keyword: 'microphone', weightOz: 32, lengthIn: 10, widthIn: 8, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'guitar case', weightOz: 128, lengthIn: 42, widthIn: 16, heightIn: 6, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'guitar', weightOz: 96, lengthIn: 40, widthIn: 14, heightIn: 5, packageType: 'LARGE_PACKAGE', confidence: 0.45 },

  // Comics -- zero prior coverage, high per-batch volume for this organizer.
  // 2026-08-13 (Patrick): corrected from 8x6x1 -- a comic's long edge (Modern ~10.25in, Golden/Silver ~10.5in) didn't fit an 8in box. Real packed size is ~11x8x1 (bag+board+rigid mailer).
  // 2026-08-15: weightOz corrected 4->8 -- live eBay-recorded weight for ~20 real already-listed
  // comics (bagged+boarded in a rigid mailer) agreed consistently at 8oz, not 4oz (confirmed via
  // GetItem ShippingPackageDetails, this session's PackageProfile weight audit). The dims fix on
  // 2026-08-13 addressed the box size but left this stale weight untouched.
  // NOTE 2026-08-31: this 8oz correction never reached production either -- GAP_FILL_PROFILES only
  // inserts when the keyword is entirely absent ("skip if present"), so an UPDATE to an existing
  // row's value here never propagates on its own. Production still had 4oz until fixed directly
  // 2026-08-31 (see coin row above for the same root cause). No value change needed here, just
  // this note -- the 8oz below was already correct.
  { category: 'Comic Books & Memorabilia', keyword: 'comic', weightOz: 8, lengthIn: 11, widthIn: 8, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },

  // Tobacciana -- zero prior coverage, recurring category for this organizer.
  { keyword: 'cigar box', weightOz: 24, lengthIn: 10, widthIn: 8, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'tobacco tin', weightOz: 8, lengthIn: 6, widthIn: 5, heightIn: 3, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { keyword: 'cigar tin', weightOz: 8, lengthIn: 6, widthIn: 5, heightIn: 3, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { keyword: 'humidor', weightOz: 64, lengthIn: 12, widthIn: 10, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.5 },

  // Physical media (VHS/cassette/Blu-ray) -- 2026-08-31 (Patrick): "records, cd's comics, coins,
  // video games, vhs tapes etc... not necessarily books" already had coverage except VHS; Patrick
  // then asked to bundle in cassette and Blu-ray too, same media family. Researched USPS-typical
  // packed estimates (tape/disc + case + padded mailer), NOT eBay-recorded live data like the
  // coin/comic rows above -- confidence set lower (0.55) to reflect that. Blu-ray mirrors the
  // existing DVD keyword profile (same keep-case size) since a Blu-ray case is physically
  // identical to a DVD case; added under both the hyphenated and unhyphenated spelling since
  // real listing titles use both ("Blu-ray" / "Bluray").
  { keyword: 'vhs', weightOz: 8, lengthIn: 8, widthIn: 5, heightIn: 1.5, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.55 },
  { keyword: 'cassette', weightOz: 3, lengthIn: 5, widthIn: 3, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.55 },
  { keyword: 'blu-ray', weightOz: 6, lengthIn: 8, widthIn: 6, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.55 },
  { keyword: 'bluray', weightOz: 6, lengthIn: 8, widthIn: 6, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.55 },

  // The exact item types that got force-defaulted to pickup-only this session.
  { keyword: 'cooler', weightOz: 32, lengthIn: 14, widthIn: 10, heightIn: 10, packageType: 'MAILING_BOX', confidence: 0.5 },
  { keyword: 'insulated backpack', weightOz: 28, lengthIn: 14, widthIn: 10, heightIn: 8, packageType: 'MAILING_BOX', confidence: 0.5 },
  { keyword: 'life jacket', weightOz: 24, lengthIn: 16, widthIn: 12, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'pfd', weightOz: 24, lengthIn: 16, widthIn: 12, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.5 },
];

async function seedGapFillProfiles() {
  console.log('🌱 Seeding gap-fill PackageProfile rows (2026-07-22)...');
  let inserted = 0;
  let skipped = 0;
  for (const p of GAP_FILL_PROFILES) {
    const existing = p.keyword
      ? await prisma.packageProfile.findFirst({ where: { keyword: p.keyword } })
      : await prisma.packageProfile.findFirst({ where: { category: p.category, keyword: null } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.packageProfile.create({
      data: {
        category: p.category ?? null,
        keyword: p.keyword ?? null,
        weightOz: p.weightOz,
        lengthIn: p.lengthIn,
        widthIn: p.widthIn,
        heightIn: p.heightIn,
        packageType: p.packageType,
        confidence: p.confidence,
        source: 'SEED',
      },
    });
    inserted++;
  }
  console.log(`   • ${inserted} gap-fill profiles inserted, ${skipped} already present (skipped)`);
}

async function main() {
  console.log('🌱 Seeding EbayCategoryFee...');
  for (const fee of CATEGORY_FEES) {
    if (fee.ebayCategoryId === null) {
      // Default row — find existing null row, update or create.
      const existing = await prisma.ebayCategoryFee.findFirst({ where: { ebayCategoryId: null } });
      if (existing) {
        await prisma.ebayCategoryFee.update({
          where: { id: existing.id },
          data: { fvfPercent: fee.fvfPercent, perOrderFeeCents: fee.perOrderFeeCents, categoryLabel: fee.categoryLabel, notes: fee.notes, source: 'PUBLISHED_RATE' },
        });
      } else {
        await prisma.ebayCategoryFee.create({
          data: { ebayCategoryId: null, categoryLabel: fee.categoryLabel, fvfPercent: fee.fvfPercent, perOrderFeeCents: fee.perOrderFeeCents, notes: fee.notes, source: 'PUBLISHED_RATE' },
        });
      }
    } else {
      await prisma.ebayCategoryFee.upsert({
        where: { ebayCategoryId: fee.ebayCategoryId },
        update: { fvfPercent: fee.fvfPercent, perOrderFeeCents: fee.perOrderFeeCents, categoryLabel: fee.categoryLabel, notes: fee.notes, source: 'PUBLISHED_RATE' },
        create: { ebayCategoryId: fee.ebayCategoryId, categoryLabel: fee.categoryLabel, fvfPercent: fee.fvfPercent, perOrderFeeCents: fee.perOrderFeeCents, notes: fee.notes, source: 'PUBLISHED_RATE' },
      });
    }
  }
  console.log(`   • ${CATEGORY_FEES.length} category fee rows upserted`);

  console.log('🌱 Seeding PackageProfile...');
  const count = await prisma.packageProfile.count();
  if (count > 0) {
    console.log(`   • PackageProfile already has ${count} rows — skipping insert (idempotent)`);
  } else {
    await prisma.packageProfile.createMany({
      data: PROFILES.map((p) => ({
        category: p.category ?? null,
        keyword: p.keyword ?? null,
        weightOz: p.weightOz,
        lengthIn: p.lengthIn,
        widthIn: p.widthIn,
        heightIn: p.heightIn,
        packageType: p.packageType,
        confidence: p.confidence,
        source: 'SEED',
      })),
    });
    console.log(`   • ${PROFILES.length} package profiles inserted`);
  }
  await seedGapFillProfiles();

  console.log('✅ Done.');
}

main()
  .catch((e) => {
    console.error('❌ seedPackageProfiles error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
