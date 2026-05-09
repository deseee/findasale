/**
 * Virginia General Business License — Secondary Sale Business Scraper (Phase 2)
 * Source: City of Norfolk Business Licenses — Socrata JSON API (paginated)
 *   Dataset ID: dpi6-sct5 (data.norfolk.gov)
 *   https://data.norfolk.gov/resource/dpi6-sct5.json
 *   ~9,800 records (all Norfolk business licenses from 2019–present)
 *
 * NOTE ON STATEWIDE COVERAGE:
 *   The Virginia Open Data Portal (data.virginia.gov) does NOT host a
 *   statewide general business license Socrata dataset. Datasets found there
 *   are city-level (Norfolk, Virginia Beach) or DPOR profession-specific.
 *   DPOR auctioneer board files are handled by virginiaPhase2Scraper.ts.
 *   This scraper covers Norfolk's open Socrata dataset — the only VA general
 *   business license dataset accessible via Socrata JSON API as of 2026-05-09.
 *   Virginia Beach publishes a CSV download only (no Socrata API — skipped).
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Matches secondary sale business types via NAICS category substring:
 *   Always-include: JUNK DEALER, PAWNSHOP, USED MERCHANDISE, CONSIGNMENT,
 *                   AUCTION, SECONDHAND, PRECIOUS METALS DEALER, ART DEALER
 *   Broader (keyword-gated): RETAIL, GENERAL MERCHANDISE, DEALER, VENDOR
 */

import { defaultRateLimiter } from "../rateLimiter";
import { getOrCreateScrapedOrganizer } from "../index";

const VA_NORFOLK_SOCRATA_URL = "https://data.norfolk.gov/resource/dpi6-sct5.json";
const VA_NORFOLK_DOMAIN = "data.norfolk.gov";
const PAGE_SIZE = 5000;

// NAICS category substrings that always indicate a secondhand-sale business.
// Norfolk uses NAICS-style free-text strings (not DPOR credential codes) —
// substring matching (includes) is required, same pattern as CT.
const ALWAYS_INCLUDE_ACTIVITIES = new Set([
  "AUCTIONEER",
  "AUCTION HOUSE",
  "AUCTION COMPANY",
  "AUCTION",
  "PAWNBROKER",
  "PAWNSHOP",
  "SECONDHAND",
  "SECOND HAND",
  "JUNK DEALER",
  "CONSIGNMENT",
  "USED MERCHANDISE",
  "USED MERCHANDISE STORES",
  "PRECIOUS METALS DEALER",
]);

// Broader NAICS substrings that require a keyword match on business name.
const BROADER_ACTIVITIES = new Set([
  "RETAIL, ART DEALER",
  "ART DEALERS",
  "RETAIL",
  "GENERAL MERCHANDISE",
  "DEALER",
  "VENDOR",
]);

// Case-insensitive keywords — any match includes a broader-category row.
const SALE_TYPE_KEYWORDS = [
  "pawn",
  "estate sale",
  "consign",
  "thrift",
  "resale",
  "antique",
  "vintage",
  "collectible",
  "flea market",
  "swap meet",
  "liquidat",
  "salvage",
  "junk dealer",
  "used goods",
  "auction",
  "secondhand",
  "second hand",
  "pre-owned",
  "preowned",
  "surplus",
  "rummage",
];

// False-positive name fragments — exclude row if business name contains any.
const EXCLUDE_FRAGMENTS = [
  "real estate",
  "realty",
  "realtor",
  "restaurant",
  "petroleum",
  "dental",
  "medical",
  "pharmacy",
  "funeral",
  "insurance",
  "tax service",
  "accounting",
  "attorney",
  "law office",
  "landscaping",
  "construction",
  "plumbing",
  "electrical",
  "roofing",
  "automotive repair",
  "car wash",
  "dry clean",
  "laundry",
  "hair salon",
  "nail salon",
  "tattoo",
  "massage",
  "yoga",
  "daycare",
  "used car",
];

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function mapCategory(naics: string): string {
  const upper = naics.toUpperCase();
  if (upper.includes("AUCTION")) return "AUCTION_HOUSE";
  return "RESALE_SHOP";
}

/**
 * Virginia General Business License secondary sale scraper.
 * Targets Norfolk City open Socrata dataset (dpi6-sct5) via paginated JSON API.
 * Statewide VA general registry not available via Socrata as of 2026-05-09.
 */
export async function runVirginiaGeneralPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let offset = 0;
  let hasMore = true;
  let columnsLogged = false;

  console.log("[VirginiaGeneralPhase2] Starting secondary sale scraper — Norfolk City Socrata dataset");
  console.log(`[VirginiaGeneralPhase2] Source: ${VA_NORFOLK_SOCRATA_URL}`);
  console.log("[VirginiaGeneralPhase2] NOTE: No statewide VA general business license Socrata API found.");
  console.log("[VirginiaGeneralPhase2] DPOR auctioneers are handled by virginiaPhase2Scraper.ts.");

  try {
    while (hasMore) {
      await defaultRateLimiter.waitBeforeRequest(VA_NORFOLK_DOMAIN);

      const params = new URLSearchParams({
        $limit: String(PAGE_SIZE),
        $offset: String(offset),
      });
      const url = `${VA_NORFOLK_SOCRATA_URL}?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        console.error(
          `[VirginiaGeneralPhase2] JSON fetch failed: HTTP ${response.status} at offset ${offset}`
        );
        break;
      }

      const rows = (await response.json()) as Record<string, string>[];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`[VirginiaGeneralPhase2] No more records at offset ${offset}`);
        break;
      }

      if (!columnsLogged) {
        console.log("[VirginiaGeneralPhase2] JSON columns found:", Object.keys(rows[0]).join(", "));
        columnsLogged = true;
      }

      totalFetched += rows.length;

      for (const row of rows) {
        try {
          // Norfolk Socrata columns (confirmed 2026-05-09):
          //   trading_as_name, naics, primary_owner, location_address,
          //   mailing_address, business_opened_date, latitude, longitude
          const naicsRaw =
            row["naics"] ??
            row["license_type"] ?? row["credential_type"] ?? "";
          const naicsType = naicsRaw.trim().toUpperCase();

          const businessNameRaw =
            row["trading_as_name"] ??
            row["business_name"] ?? row["name"] ?? "";
          const ownerName = row["primary_owner"] ?? "";

          const displayName =
            businessNameRaw.trim() || ownerName.trim();

          if (!displayName) continue;

          // Substring matching — Norfolk NAICS values are compound strings
          // e.g. "Pawnshop; All Other Miscellaneous Retailers"
          const alwaysInclude = [...ALWAYS_INCLUDE_ACTIVITIES].some((t) =>
            naicsType.includes(t)
          );
          const broaderMatch =
            ([...BROADER_ACTIVITIES].some((t) => naicsType.includes(t)) ||
              !naicsType) && nameMatchesKeyword(displayName);

          if (!alwaysInclude && !broaderMatch) continue;
          if (nameIsExcluded(displayName)) continue;

          totalMatched++;

          // Extract city from mailing_address or location_address
          // Format: "123 MAIN ST NORFOLK VA, 23510"
          const mailingAddress = (row["mailing_address"] ?? "").trim();
          const locationAddress = (row["location_address"] ?? "").trim();
          let city = "Norfolk"; // default — this dataset is Norfolk-only

          // Attempt to parse city from mailing address pattern "... CITY ST, ZIP"
          const mailingMatch = mailingAddress.match(/\s([A-Z][A-Z\s]+)\s+VA,\s*\d{5}/);
          if (mailingMatch) {
            city = mailingMatch[1].trim();
          }

          const slugifiedName = displayName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")
            .replace(/-+/g, "-")
            .slice(0, 40);

          // Use location_address as a proxy for dedupe (no license number in this dataset)
          const addressSlug = locationAddress
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")
            .replace(/-+/g, "-")
            .slice(0, 30);

          const dedupeKey = `VA-GENERAL-${slugifiedName}-${addressSlug}`;
          const businessCategory = mapCategory(naicsType);

          console.log(
            `[VirginiaGeneralPhase2] Matched: ${dedupeKey} — ${displayName} (${naicsRaw})`
          );

          const orgId = await getOrCreateScrapedOrganizer(
            displayName,
            "VirginiaGeneralPhase2",
            city || "Norfolk",
            "VA",
            undefined, undefined, undefined, undefined,
            businessCategory,
            undefined, undefined, undefined
          );

          if (orgId) totalUpserted++;
        } catch (rowErr) {
          console.error("[VirginiaGeneralPhase2] Row error:", rowErr);
        }
      }

      offset += rows.length;
      if (rows.length < PAGE_SIZE) hasMore = false;
    }

    console.log(
      `[VirginiaGeneralPhase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error("[VirginiaGeneralPhase2] Scraper fatal error:", error);
    throw error;
  }
}
