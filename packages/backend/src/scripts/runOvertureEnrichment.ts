/**
 * runOvertureEnrichment.ts — Stage B of the Overture/BrightQuery enrichment job (#556).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ATTRIBUTION (CDLA Permissive 2.0)
 * Source data: Overture Maps Foundation — Places theme.
 * Licensed under the Community Data License Agreement – Permissive, Version 2.0
 * (CDLA-Permissive-2.0). Commercial use is permitted; the license text must ship
 * with the repository. See NOTICE-overture.md in the repo root.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Two-stage design (DuckDB is kept OUT of the backend runtime bundle):
 *  - Stage A (GitHub Actions, Python + DuckDB): queries the Overture Places
 *    parquet on AWS Open Data (anonymous S3), applies the secondhand allowlist
 *    regex + bbox/category pushdown, and writes a candidates NDJSON file. See
 *    scripts/overture/extract_overture.py + .github/workflows/scrape-overture-enrichment.yml.
 *  - Stage B (THIS script, tsx): reads that NDJSON and runs each candidate
 *    through the existing classifier/dedup/ingest chain that all other directory
 *    scrapers use — isValidOutreachTarget → BLOCKED_DOMAINS → mxValidator →
 *    suppression → dedup precedence → category map → batchUpsertScrapedOrganizers.
 *
 * Pacing: batched DB writes only (batchUpsertScrapedOrganizers default 100) +
 * the existing OUTREACH_DAILY_CAP send gate downstream. There is NO ban risk
 * (open S3) — state chunking in Stage A is for memory bounding, not throttling.
 *
 * NDJSON candidate record shape (one JSON object per line) produced by Stage A:
 *   {
 *     "gersId":    string,            // Overture place `id` (GERS) — required
 *     "name":      string,            // names.primary — required
 *     "websites":  string[] | null,   // websites[]
 *     "emails":    string[] | null,   // emails[]
 *     "phones":    string[] | null,   // phones[]
 *     "city":      string | null,     // addresses[0].locality
 *     "state":     string | null,     // addresses[0].region (2-letter)
 *     "category":  string | null,     // categories.primary (Overture taxonomy)
 *     "lat":       number | null,
 *     "lng":       number | null,
 *     "confidence":number | null
 *   }
 *
 * Usage: npx tsx src/scripts/runOvertureEnrichment.ts <candidates.ndjson>
 *   or  OVERTURE_CANDIDATES_FILE=<path> npx tsx src/scripts/runOvertureEnrichment.ts
 */

import fs from 'fs';
import readline from 'readline';

import { prisma } from '../lib/prisma';
import {
  batchUpsertScrapedOrganizers,
  ScrapedOrganizerRow,
} from '../services/scraper/index';
import { isValidOutreachTarget } from '../utils/outreachFilter';
import {
  BLOCKED_DOMAINS,
  isEmailDomainBlocked,
  suppressionService,
} from '../services/suppressionService';
import { domainCanReceiveMail } from '../lib/mxValidator';
import { registrableDomain, emailDomain } from '../services/emailProvenance';

const SOURCE_NAME = 'OvertureBrightQuery';
const BATCH_SIZE = 100;

// ── Category mapping ───────────────────────────────────────────────────────
// Overture Places taxonomy `categories.primary` → internal VALID_CATEGORIES.
// Overture uses lowercase snake/dot categories; we lowercase before lookup.
// Anything not mapped here falls back to keyword inference on the name, then to
// undefined (which lets batchUpsertScrapedOrganizers accept it as an
// uncategorized secondhand lead rather than reject it).
const OVERTURE_CATEGORY_MAP: Record<string, string> = {
  // Estate / liquidation
  estate_sale_company: 'ESTATE_SALE_CO',
  estate_liquidator: 'ESTATE_SALE_CO',
  liquidator: 'LIQUIDATION',
  // Auction
  auction_house: 'AUCTION_HOUSE',
  auctioneer: 'AUCTION_HOUSE',
  auction_service: 'AUCTION_HOUSE',
  // Antique / vintage
  antique_store: 'ANTIQUE_DEALER',
  antiques: 'ANTIQUE_DEALER',
  antique_dealer: 'ANTIQUE_DEALER',
  antique_mall: 'ANTIQUE_MALL',
  vintage_clothing_store: 'VINTAGE',
  vintage_store: 'VINTAGE',
  // Consignment / resale
  consignment_shop: 'CONSIGNMENT',
  consignment_store: 'CONSIGNMENT',
  resale_shop: 'RESALE_SHOP',
  used_goods_store: 'RESALE_SHOP',
  // Thrift
  thrift_store: 'THRIFT_STORE',
  charity_shop: 'THRIFT_STORE',
  second_hand_store: 'THRIFT_STORE',
  // Flea / swap
  flea_market: 'FLEA_MARKET',
  swap_meet: 'FLEA_MARKET',
  // Used furniture
  used_furniture_store: 'USED_FURNITURE',
  furniture_store: 'USED_FURNITURE', // accepted as lead; allowlist on name still gates outreach
  // Pawn / coin / jewelry
  pawn_shop: 'PAWN_SHOP',
  pawnbroker: 'PAWN_SHOP',
  coin_dealer: 'COIN_DEALER',
  // Books / media / electronics / sporting / records
  used_book_store: 'USED_BOOKSTORE',
  used_bookstore: 'USED_BOOKSTORE',
  record_store: 'RECORD_STORE',
  used_electronics_store: 'USED_ELECTRONICS',
  used_sporting_goods_store: 'USED_SPORTING_GOODS',
};

// Keyword → category fallback when Overture omits a category (or it's unmapped).
// Ordered: first hit wins. Used only when OVERTURE_CATEGORY_MAP misses.
const KEYWORD_CATEGORY_RULES: { kw: string; cat: string }[] = [
  { kw: 'estate sale', cat: 'ESTATE_SALE_CO' },
  { kw: 'estate liquidat', cat: 'ESTATE_SALE_CO' },
  { kw: 'auction', cat: 'AUCTION_HOUSE' },
  { kw: 'antique mall', cat: 'ANTIQUE_MALL' },
  { kw: 'antique', cat: 'ANTIQUE_DEALER' },
  { kw: 'consign', cat: 'CONSIGNMENT' },
  { kw: 'thrift', cat: 'THRIFT_STORE' },
  { kw: 'flea market', cat: 'FLEA_MARKET' },
  { kw: 'swap meet', cat: 'FLEA_MARKET' },
  { kw: 'pawn', cat: 'PAWN_SHOP' },
  { kw: 'coin', cat: 'COIN_DEALER' },
  { kw: 'vintage', cat: 'VINTAGE' },
  { kw: 'resale', cat: 'RESALE_SHOP' },
  { kw: 'liquidation', cat: 'LIQUIDATION' },
  { kw: 'used book', cat: 'USED_BOOKSTORE' },
  { kw: 'record', cat: 'RECORD_STORE' },
];

function mapCategory(overtureCategory: string | null | undefined, name: string): string | undefined {
  if (overtureCategory) {
    const key = overtureCategory.toLowerCase().trim();
    if (OVERTURE_CATEGORY_MAP[key]) return OVERTURE_CATEGORY_MAP[key];
  }
  const lname = name.toLowerCase();
  for (const rule of KEYWORD_CATEGORY_RULES) {
    if (lname.includes(rule.kw)) return rule.cat;
  }
  return undefined; // uncategorized — accepted as a generic secondhand lead
}

// ── NDJSON candidate type (Stage A output) ─────────────────────────────────
interface OvertureCandidate {
  gersId: string;
  name: string;
  websites?: string[] | null;
  emails?: string[] | null;
  phones?: string[] | null;
  city?: string | null;
  state?: string | null;
  category?: string | null;
  lat?: number | null;
  lng?: number | null;
  confidence?: number | null;
}

// Normalized last-10-digits of a phone for dedup matching.
function phoneLast10(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

interface Stats {
  read: number;
  rejectedName: number;
  rejectedNoContact: number;
  rejectedBlockedDomain: number;
  rejectedNoMx: number;
  rejectedSuppressed: number;
  updatedByGers: number;
  updatedByEmail: number;
  updatedByDomain: number;
  updatedByPhone: number;
  handedToBatch: number;
  batchCreated: number;
  gersBackfilled: number;
  failed: number;
}

const stats: Stats = {
  read: 0,
  rejectedName: 0,
  rejectedNoContact: 0,
  rejectedBlockedDomain: 0,
  rejectedNoMx: 0,
  rejectedSuppressed: 0,
  updatedByGers: 0,
  updatedByEmail: 0,
  updatedByDomain: 0,
  updatedByPhone: 0,
  handedToBatch: 0,
  batchCreated: 0,
  gersBackfilled: 0,
  failed: 0,
};

/**
 * Pick the first usable contact email from the candidate.
 * Rejects blocked / unsendable domains (competitors, finda.sale zone, placeholders).
 */
function pickEmail(c: OvertureCandidate): string | null {
  for (const raw of c.emails ?? []) {
    const e = (raw ?? '').trim().toLowerCase();
    if (!e || !e.includes('@')) continue;
    if (isEmailDomainBlocked(e)) {
      stats.rejectedBlockedDomain++;
      continue;
    }
    return e;
  }
  return null;
}

/** Pick the first website whose registrable domain is not a BLOCKED_DOMAIN. */
function pickWebsite(c: OvertureCandidate): string | null {
  for (const raw of c.websites ?? []) {
    const w = (raw ?? '').trim();
    if (!w) continue;
    const dom = registrableDomain(w);
    if (dom && BLOCKED_DOMAINS.has(dom)) continue;
    return w;
  }
  return null;
}

/**
 * Append a source entry to an existing org's sourcesJson + set overtureGersId +
 * refresh directoryMostRecent fields. Used by all dedup-match update paths.
 */
async function applyMatchUpdate(
  orgId: string,
  candidate: OvertureCandidate,
  existing: { sourcesJson: unknown; sourceCount: number | null; overtureGersId: string | null; contactEmail: string | null; phone: string | null; website: string | null; lat: number | null; lng: number | null },
  email: string | null,
  website: string | null,
): Promise<void> {
  const updates: Record<string, unknown> = {};

  if (!existing.overtureGersId) updates.overtureGersId = candidate.gersId;

  // Backfill missing contact fields only (never overwrite organizer/curated data).
  if (email && !existing.contactEmail) {
    updates.contactEmail = email;
    updates.emailDiscoveryMethod = 'directory_listing';
    updates.emailDiscoveryConfidence = 0.3;
    updates.emailDiscoveredAt = new Date();
  }
  const firstPhone = candidate.phones?.find((p) => !!p) ?? null;
  if (firstPhone && !existing.phone) updates.phone = firstPhone;
  if (website && !existing.website) updates.website = website;
  if (candidate.lat != null && existing.lat == null) updates.lat = candidate.lat;
  if (candidate.lng != null && existing.lng == null) updates.lng = candidate.lng;

  // Source corroboration: append Overture source if not already present.
  const currentSources = (existing.sourcesJson as any[]) || [];
  const present = currentSources.some((s: any) => s?.sourceName === SOURCE_NAME);
  if (!present) {
    updates.sourceCount = (existing.sourceCount || 1) + 1;
    updates.sourcesJson = [
      ...currentSources,
      { sourceName: SOURCE_NAME, sourceId: candidate.gersId, lastSeen: new Date().toISOString() },
    ];
  }

  updates.directoryMostRecentSource = SOURCE_NAME;
  updates.directoryMostRecentAt = new Date();
  updates.updatedAt = new Date();

  await prisma.organizer.update({ where: { id: orgId }, data: updates });
}

const EXISTING_SELECT = {
  id: true,
  sourcesJson: true,
  sourceCount: true,
  overtureGersId: true,
  contactEmail: true,
  phone: true,
  website: true,
  lat: true,
  lng: true,
} as const;

/**
 * Resolve a candidate against existing organizers using the ADR dedup precedence:
 *   1. overtureGersId exact   2. contactEmail exact   3. website/email domain
 *   4. normalized name + city/state   5. phone (last 10).
 * Returns the matched org id, or null if no match (caller hands it to the batch path).
 * On match it applies the merge update and increments the matching-method stat.
 */
async function resolveAndUpdate(
  candidate: OvertureCandidate,
  email: string | null,
  website: string | null,
): Promise<string | null> {
  // 1. overtureGersId exact
  const byGers = await prisma.organizer.findUnique({
    where: { overtureGersId: candidate.gersId },
    select: EXISTING_SELECT,
  });
  if (byGers) {
    await applyMatchUpdate(byGers.id, candidate, byGers, email, website);
    stats.updatedByGers++;
    return byGers.id;
  }

  // 2. contactEmail exact
  if (email) {
    const byEmail = await prisma.organizer.findFirst({
      where: { contactEmail: email },
      select: EXISTING_SELECT,
    });
    if (byEmail) {
      await applyMatchUpdate(byEmail.id, candidate, byEmail, email, website);
      stats.updatedByEmail++;
      return byEmail.id;
    }
  }

  // 3. website/email domain (minus BLOCKED_DOMAINS) — match on stored website domain.
  const candDomain =
    (website ? registrableDomain(website) : null) ??
    (email ? registrableDomain(emailDomain(email) ?? '') : null);
  if (candDomain && !BLOCKED_DOMAINS.has(candDomain)) {
    // Find unmanaged orgs whose website contains this registrable domain.
    const domainCandidates = await prisma.organizer.findMany({
      where: { website: { contains: candDomain } },
      select: EXISTING_SELECT,
      take: 25,
    });
    const hit = domainCandidates.find((o) => registrableDomain(o.website ?? '') === candDomain);
    if (hit) {
      await applyMatchUpdate(hit.id, candidate, hit, email, website);
      stats.updatedByDomain++;
      return hit.id;
    }
  }

  // 4. normalized businessName + city/state — handled by the batch path's name+city
  //    dedupeKey logic, so we DON'T resolve it here (avoids double work). Fall through.

  // 5. phone (last 10 digits)
  const p10 = phoneLast10(candidate.phones?.find((p) => !!p) ?? null);
  if (p10) {
    const phoneCandidates = await prisma.organizer.findMany({
      where: { phone: { contains: p10 } },
      select: EXISTING_SELECT,
      take: 25,
    });
    const hit = phoneCandidates.find((o) => phoneLast10(o.phone) === p10);
    if (hit) {
      await applyMatchUpdate(hit.id, candidate, hit, email, website);
      stats.updatedByPhone++;
      return hit.id;
    }
  }

  return null; // no precedence match → batch path (name+city create/dedup)
}

async function main(): Promise<void> {
  const file = process.argv[2] || process.env.OVERTURE_CANDIDATES_FILE;
  if (!file) {
    console.error(
      '[overture] No candidates file. Usage: npx tsx src/scripts/runOvertureEnrichment.ts <candidates.ndjson>',
    );
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`[overture] Candidates file not found: ${file}`);
    process.exit(1);
  }

  console.log(`[overture] Reading candidates from ${file}`);

  // Rows destined for the batch create/update path (no precedence match found),
  // accumulated and flushed in chunks of BATCH_SIZE to bound memory.
  let batchRows: { row: ScrapedOrganizerRow; gersId: string }[] = [];

  async function flushBatch(): Promise<void> {
    if (batchRows.length === 0) return;
    const rows = batchRows.map((b) => b.row);
    let ids: (string | null)[] = [];
    try {
      ids = await batchUpsertScrapedOrganizers(rows, BATCH_SIZE);
    } catch (err) {
      console.error('[overture] batchUpsert failed for chunk:', err);
      stats.failed += batchRows.length;
      batchRows = [];
      return;
    }
    // Backfill overtureGersId on every org the batch created/matched.
    for (let i = 0; i < batchRows.length; i++) {
      const orgId = ids[i];
      const gersId = batchRows[i].gersId;
      if (!orgId) {
        stats.failed++;
        continue;
      }
      stats.batchCreated++;
      try {
        // Only set gersId if not already set (idempotent monthly re-sync). Unique
        // constraint means a different org can't hold this gersId; tolerate P2002.
        const org = await prisma.organizer.findUnique({
          where: { id: orgId },
          select: { overtureGersId: true },
        });
        if (org && !org.overtureGersId) {
          await prisma.organizer.update({
            where: { id: orgId },
            data: { overtureGersId: gersId },
          });
          stats.gersBackfilled++;
        }
      } catch (err: any) {
        if (err?.code !== 'P2002') {
          console.error(`[overture] gers backfill failed for ${orgId}:`, err?.message ?? err);
        }
      }
    }
    batchRows = [];
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let c: OvertureCandidate;
    try {
      c = JSON.parse(trimmed) as OvertureCandidate;
    } catch {
      continue; // skip malformed line
    }
    if (!c.gersId || !c.name) continue;
    stats.read++;

    // Filter 1: outreach-target name allow/block list.
    if (!isValidOutreachTarget(c.name)) {
      stats.rejectedName++;
      continue;
    }

    const email = pickEmail(c);
    const website = pickWebsite(c);

    // Filter 2: require at least one contact channel (email, website, or phone)
    // so we never seed a dead-end record.
    const firstPhone = c.phones?.find((p) => !!p) ?? null;
    if (!email && !website && !firstPhone) {
      stats.rejectedNoContact++;
      continue;
    }

    // Filter 3 (email-bearing only): MX validation + suppression before we store
    // an email, mirroring the outreach send gate. A failed MX / suppressed address
    // drops the email but the record still flows in via website/phone.
    let usableEmail: string | null = email;
    if (usableEmail) {
      const mx = await domainCanReceiveMail(usableEmail);
      if (!mx.ok) {
        stats.rejectedNoMx++;
        usableEmail = null;
      }
    }
    if (usableEmail) {
      const suppressed = await suppressionService.isSuppressed(usableEmail);
      if (suppressed) {
        stats.rejectedSuppressed++;
        usableEmail = null;
      }
    }

    // Dedup precedence (gers → email → domain → phone). name+city is left to the
    // batch path. A match updates in place and returns; no match falls through.
    let matchedId: string | null = null;
    try {
      matchedId = await resolveAndUpdate(c, usableEmail, website);
    } catch (err) {
      console.error(`[overture] dedup resolve failed for ${c.name}:`, err);
      stats.failed++;
      continue;
    }
    if (matchedId) continue;

    // No precedence match → hand to the batch create/dedup path.
    const category = mapCategory(c.category, c.name);
    const row: ScrapedOrganizerRow = {
      businessName: c.name,
      sourceName: SOURCE_NAME,
      city: c.city ?? '',
      state: c.state ?? '',
      businessCategory: category,
      contactEmail: usableEmail ?? undefined,
      phone: firstPhone ?? undefined,
      website: website ?? undefined,
      lat: c.lat ?? undefined,
      lng: c.lng ?? undefined,
      sourceLabel: SOURCE_NAME,
    };
    batchRows.push({ row, gersId: c.gersId });
    stats.handedToBatch++;

    if (batchRows.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('[overture] ── Ingestion complete ──');
  console.log(`  candidates read:        ${stats.read}`);
  console.log(`  rejected (name filter): ${stats.rejectedName}`);
  console.log(`  rejected (no contact):  ${stats.rejectedNoContact}`);
  console.log(`  email dropped (blocked):${stats.rejectedBlockedDomain}`);
  console.log(`  email dropped (no MX):  ${stats.rejectedNoMx}`);
  console.log(`  email dropped (suppr.): ${stats.rejectedSuppressed}`);
  console.log(`  updated by gersId:      ${stats.updatedByGers}`);
  console.log(`  updated by email:       ${stats.updatedByEmail}`);
  console.log(`  updated by domain:      ${stats.updatedByDomain}`);
  console.log(`  updated by phone:       ${stats.updatedByPhone}`);
  console.log(`  handed to batch path:   ${stats.handedToBatch}`);
  console.log(`  batch create/match:     ${stats.batchCreated}`);
  console.log(`  gersId backfilled:      ${stats.gersBackfilled}`);
  console.log(`  failed:                 ${stats.failed}`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      const lines = [
        '## Overture/BrightQuery Enrichment',
        '',
        `**${stats.read}** candidates read · `
          + `**${stats.batchCreated}** created/matched (batch) · `
          + `**${stats.updatedByGers + stats.updatedByEmail + stats.updatedByDomain + stats.updatedByPhone}** updated (dedup) · `
          + `**${stats.failed}** failed`,
        '',
        '| Stage | Count |',
        '| --- | --- |',
        `| Rejected — name filter | ${stats.rejectedName} |`,
        `| Rejected — no contact | ${stats.rejectedNoContact} |`,
        `| Email dropped — blocked domain | ${stats.rejectedBlockedDomain} |`,
        `| Email dropped — no MX | ${stats.rejectedNoMx} |`,
        `| Email dropped — suppressed | ${stats.rejectedSuppressed} |`,
        `| Updated by gersId | ${stats.updatedByGers} |`,
        `| Updated by email | ${stats.updatedByEmail} |`,
        `| Updated by domain | ${stats.updatedByDomain} |`,
        `| Updated by phone | ${stats.updatedByPhone} |`,
        `| Handed to batch path | ${stats.handedToBatch} |`,
        `| gersId backfilled | ${stats.gersBackfilled} |`,
        '',
      ];
      fs.appendFileSync(summaryPath, lines.join('\n') + '\n');
    } catch (e) {
      console.error('[overture] Failed to write GITHUB_STEP_SUMMARY:', e);
    }
  }

  console.log(
    `OVERTURE_SUMMARY read=${stats.read} created=${stats.batchCreated} `
      + `updated=${stats.updatedByGers + stats.updatedByEmail + stats.updatedByDomain + stats.updatedByPhone} `
      + `failed=${stats.failed}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[overture] Fatal error:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
