/**
 * Oregon Active Businesses — Secondary Sale Business Scraper (Phase 2)
 * Source: https://data.oregon.gov/api/views/tckn-sxa6/rows.csv?accessType=DOWNLOAD
 * Dataset: Oregon Active Businesses statewide CSV
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Oregon has no state auctioneer licensing — this scraper uses business name
 * keyword filtering only (no license_type column available).
 *
 * Matches secondary sale business types via SALE_TYPE_KEYWORDS on
 * business name, excluding false-positive fragments in EXCLUDE_FRAGMENTS.
 */

import { defaultRateLimiter } from "../rateLimiter";
import { getOrCreateScrapedOrganizer } from "../index";

const OR_OPEN_DATA_CSV_URL =
  "https://data.oregon.gov/api/views/tckn-sxa6/rows.csv?accessType=DOWNLOAD";
const OR_OPEN_DATA_DOMAIN = "data.oregon.gov";

// Case-insensitive keywords — any match includes the row
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
 * Parse a single CSV line respecting quoted fields (commas inside quotes are ignored).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === """) {
      if (inQuotes && line[i + 1] === """) {
        // Escaped quote inside a quoted field
        current += """;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

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
 * Map a business name to a valid getOrCreateScrapedOrganizer category.
 * Oregon has no license type column — infer from business name.
 */
function mapCategory(businessName: string): string {
  const lower = businessName.toLowerCase();
  if (lower.includes("auction")) return "AUCTION_HOUSE";
  return "RESALE_SHOP";
}

/**
 * Oregon Active Businesses secondary sale scraper.
 * Fetches all Oregon active business records and filters to secondhand-sale
 * matches using keyword matching on business name.
 */
export async function runOregonPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  console.log("[OregonPhase2] Starting secondary sale scraper via OR Open Data Portal");
  console.log(`[OregonPhase2] Source: ${OR_OPEN_DATA_CSV_URL}`);

  try {
    await defaultRateLimiter.waitBeforeRequest(OR_OPEN_DATA_DOMAIN);

    const response = await fetch(OR_OPEN_DATA_CSV_URL, {
      method: "GET",
      headers: {
        Accept: "text/csv,*/*",
      },
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      console.error(
        `[OregonPhase2] CSV fetch failed: HTTP ${response.status} from ${OR_OPEN_DATA_CSV_URL}`
      );
      return;
    }

    const csvText = await response.text();
    const lines = csvText.split("
");

    if (lines.length < 2) {
      console.warn("[OregonPhase2] CSV response appears empty or malformed");
      return;
    }

    // Parse header row — normalise to lowercase with single spaces
    const headers = parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/\s+/g, " ").trim()
    );

    console.log("[OregonPhase2] CSV headers found:", headers.join(", "));

    const col = (name: string): number => headers.indexOf(name);

    // OR Socrata column probe — try multiple common variations
    const iBusinessName =
      col("business name") !== -1 ? col("business name") :
      col("business_name") !== -1 ? col("business_name") :
      col("entity name") !== -1 ? col("entity name") :
      col("entity_name") !== -1 ? col("entity_name") :
      col("name") !== -1 ? col("name") : -1;

    const iCity =
      col("city") !== -1 ? col("city") :
      col("principal city") !== -1 ? col("principal city") :
      col("principal_city") !== -1 ? col("principal_city") :
      col("mailing city") !== -1 ? col("mailing city") : -1;

    const iZip =
      col("zip") !== -1 ? col("zip") :
      col("zip code") !== -1 ? col("zip code") :
      col("zip_code") !== -1 ? col("zip_code") :
      col("postal code") !== -1 ? col("postal code") :
      col("principal zip") !== -1 ? col("principal zip") : -1;

    const iAddress =
      col("address") !== -1 ? col("address") :
      col("principal address") !== -1 ? col("principal address") :
      col("principal_address") !== -1 ? col("principal_address") :
      col("street address") !== -1 ? col("street address") : -1;

    const iRegistryNumber =
      col("registry number") !== -1 ? col("registry number") :
      col("registry_number") !== -1 ? col("registry_number") :
      col("business id") !== -1 ? col("business id") :
      col("business_id") !== -1 ? col("business_id") :
      col("entity number") !== -1 ? col("entity number") : -1;

    if (iBusinessName === -1) {
      console.error(
        "[OregonPhase2] Could not find business name column in CSV header. Headers found:",
        headers.join(", ")
      );
      return;
    }

    totalFetched = lines.length - 1;
    console.log(`[OregonPhase2] CSV fetched — ${totalFetched} data rows`);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const fields = parseCsvLine(line);

        const displayName = iBusinessName >= 0 ? (fields[iBusinessName] || "").trim() : "";

        if (!displayName) continue;

        // Filter: business name must match at least one sale-type keyword
        if (!nameMatchesKeyword(displayName)) continue;

        // Filter out false positives by name
        if (nameIsExcluded(displayName)) continue;

        totalMatched++;

        const registryNumber = iRegistryNumber >= 0 ? (fields[iRegistryNumber] || "").trim() : "";
        const city           = iCity           >= 0 ? (fields[iCity]           || "").trim() : "";
        const zip            = iZip            >= 0 ? (fields[iZip]            || "").trim() : "";
        const address1       = iAddress        >= 0 ? (fields[iAddress]        || "").trim() : "";

        // dedupeKey: prefer registry number, fall back to slugified name
        const slugifiedName = displayName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 40);
        const dedupeKey      = `OR-SECONDARY-${registryNumber || slugifiedName}`;
        const businessCategory = mapCategory(displayName);

        console.log(`[OregonPhase2] Matched: ${dedupeKey} — ${displayName}`);

        const orgId = await getOrCreateScrapedOrganizer(
          displayName,                  // businessName
          "OregonPhase2",               // sourceName
          city || "Oregon",             // city
          "OR",                         // state
          undefined,                    // esnOrgId
          undefined,                    // googlePlaceId
          undefined,                    // foursquareVenueId
          undefined,                    // hereBusinessId
          businessCategory,             // businessCategory
          undefined,                    // contactEmail
          undefined,                    // phone
          undefined                     // website
        );

        if (orgId) {
          totalUpserted++;
        }
      } catch (rowErr) {
        console.error(`[OregonPhase2] Error on row ${i}:`, rowErr);
      }
    }

    console.log(
      `[OregonPhase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error("[OregonPhase2] Scraper fatal error:", error);
    throw error;
  }
}
