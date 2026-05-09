/**
 * Connecticut State Licenses and Credentials — Secondary Sale Business Scraper (Phase 2)
 * Source: Socrata JSON API (paginated) — same dataset as bulk CSV but memory-safe
 *   https://data.ct.gov/resource/fxib-2xng.json
 * Dataset: CT State Licenses and Credentials (~800+ credential types)
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Matches secondary sale business types:
 *   - Always-include credential_types: AUCTIONEER, PAWNBROKER,
 *     SECONDHAND DEALER, JUNK DEALER, CONSIGNMENT STORE
 *   - Broader credential_types + keyword match on business name:
 *     RETAIL, DEALER, VENDOR, CONSIGNMENT
 *
 * Uses $limit/$offset pagination instead of bulk CSV to avoid OOM on large dataset.
 */

import { defaultRateLimiter } from "../rateLimiter";
import { getOrCreateScrapedOrganizer } from "../index";

const CT_SOCRATA_URL = "https://data.ct.gov/resource/fxib-2xng.json";
const CT_OPEN_DATA_DOMAIN = "data.ct.gov";
const PAGE_SIZE = 5000;

// Credential types that always indicate a secondhand-sale business — include regardless of name
const ALWAYS_INCLUDE_ACTIVITIES = new Set([
  "AUCTIONEER",
  "PAWNBROKER",
  "SECONDHAND DEALER",
  "JUNK DEALER",
  "CONSIGNMENT STORE",
]);

// Broader credential types that require a keyword match on business name to include
const BROADER_ACTIVITIES = new Set([
  "RETAIL",
  "DEALER",
  "VENDOR",
  "CONSIGNMENT",
]);

// Case-insensitive keywords — any match includes the row (when paired with a broader credential type)
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

// False-positive name fragments — exclude row if business name contains any of these
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
];

/**
 * Return true if the business name matches at least one keyword (case-insensitive).
 */
function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Return true if the business name contains a false-positive fragment.
 */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Map a CT credential type to a valid getOrCreateScrapedOrganizer category.
 */
function mapCategory(credentialType: string): string {
  const upper = credentialType.toUpperCase();
  if (upper.includes("AUCTION")) return "AUCTION_HOUSE";
  return "RESALE_SHOP";
}

/**
 * Connecticut State Licenses and Credentials secondary sale scraper.
 * Uses Socrata paginated JSON API ($limit/$offset) — avoids OOM from bulk CSV.
 */
export async function runConnecticutPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let offset = 0;
  let hasMore = true;
  let columnsLogged = false;

  console.log("[ConnecticutPhase2] Starting secondary sale scraper via CT Socrata JSON API");
  console.log(`[ConnecticutPhase2] Source: ${CT_SOCRATA_URL}`);

  try {
    while (hasMore) {
      await defaultRateLimiter.waitBeforeRequest(CT_OPEN_DATA_DOMAIN);

      const params = new URLSearchParams({
        $limit: String(PAGE_SIZE),
        $offset: String(offset),
      });
      const url = `${CT_SOCRATA_URL}?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        console.error(`[ConnecticutPhase2] JSON fetch failed: HTTP ${response.status} at offset ${offset}`);
        break;
      }

      const rows = (await response.json()) as Record<string, string>[];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`[ConnecticutPhase2] No more records at offset ${offset}`);
        break;
      }

      if (!columnsLogged) {
        console.log("[ConnecticutPhase2] JSON columns found:", Object.keys(rows[0]).join(", "));
        columnsLogged = true;
      }

      totalFetched += rows.length;

      for (const row of rows) {
        try {
          // Column name probe — Socrata JSON uses lowercase_underscore keys
          // CT Socrata JSON uses compact keys (no separators): credentialtype, name, city
          const credentialTypeRaw =
            row["credentialtype"] ??
            row["credential_type"] ?? row["credential type"] ??
            row["license_type"]   ?? row["license type"] ?? "";
          const credentialType = credentialTypeRaw.trim().toUpperCase();

          const businessNameRaw =
            row["name"] ??
            row["credential_name"] ?? row["credential name"] ??
            row["license_name"]    ?? row["license name"] ??
            row["business_name"]   ?? row["business name"] ?? "";

          const firstName = row["first_name"] ?? row["first name"] ?? "";
          const lastName  = row["last_name"]  ?? row["last name"]  ?? "";

          const displayName =
            businessNameRaw.trim() ||
            [firstName, lastName].filter(Boolean).join(" ").trim();

          if (!displayName) continue;

          // Use substring matching — CT credentialtype values are compound strings
          // e.g. "AUCTIONEER - RESIDENT INDIVIDUAL", not just "AUCTIONEER"
          const alwaysInclude = [...ALWAYS_INCLUDE_ACTIVITIES].some((t) => credentialType.includes(t));
          const broaderMatch  = (
            [...BROADER_ACTIVITIES].some((t) => credentialType.includes(t)) || !credentialType
          ) && nameMatchesKeyword(displayName);

          if (!alwaysInclude && !broaderMatch) continue;
          if (nameIsExcluded(displayName)) continue;

          totalMatched++;

          const licenseNumber =
            (row["credentialnumber"] ??
             row["license_number"] ?? row["license number"] ??
             row["credential_number"] ?? row["credential number"] ?? "").trim();
          const city = (row["city"] ?? row["town"] ?? "").trim();

          const slugifiedName = displayName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")
            .replace(/-+/g, "-")
            .slice(0, 40);
          const dedupeKey = `CT-SECONDARY-${licenseNumber || slugifiedName}`;
          const businessCategory = mapCategory(credentialType);

          console.log(`[ConnecticutPhase2] Matched: ${dedupeKey} — ${displayName} (${credentialType})`);

          const orgId = await getOrCreateScrapedOrganizer(
            displayName,
            "ConnecticutPhase2",
            city || "Connecticut",
            "CT",
            undefined, undefined, undefined, undefined,
            businessCategory,
            undefined, undefined, undefined
          );

          if (orgId) totalUpserted++;
        } catch (rowErr) {
          console.error("[ConnecticutPhase2] Row error:", rowErr);
        }
      }

      offset += rows.length;
      if (rows.length < PAGE_SIZE) hasMore = false;
    }

    console.log(
      `[ConnecticutPhase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error("[ConnecticutPhase2] Scraper fatal error:", error);
    throw error;
  }
}
