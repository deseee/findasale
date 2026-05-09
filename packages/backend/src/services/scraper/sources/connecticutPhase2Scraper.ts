/**
 * Connecticut State Licenses and Credentials — Secondary Sale Business Scraper (Phase 2)
 * Source: https://data.ct.gov/api/views/fxib-2xng/rows.csv?accessType=DOWNLOAD
 * Dataset: CT State Licenses and Credentials (~800+ credential types)
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Matches secondary sale business types:
 *   - Always-include credential_types: AUCTIONEER, PAWNBROKER,
 *     SECONDHAND DEALER, JUNK DEALER, CONSIGNMENT STORE
 *   - Broader credential_types + keyword match on business name:
 *     RETAIL, DEALER, VENDOR, CONSIGNMENT
 */

import { defaultRateLimiter } from "../rateLimiter";
import { getOrCreateScrapedOrganizer } from "../index";

const CT_OPEN_DATA_CSV_URL =
  "https://data.ct.gov/api/views/fxib-2xng/rows.csv?accessType=DOWNLOAD";
const CT_OPEN_DATA_DOMAIN = "data.ct.gov";

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
 * Parse a single CSV line respecting quoted fields (commas inside quotes are ignored).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside a quoted field
        current += '"';
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
 * Map a CT credential type to a valid getOrCreateScrapedOrganizer category.
 */
function mapCategory(credentialType: string): string {
  const upper = credentialType.toUpperCase();
  if (upper.includes("AUCTION")) return "AUCTION_HOUSE";
  return "RESALE_SHOP";
}

/**
 * Connecticut State Licenses and Credentials secondary sale scraper.
 * Fetches all CT credential records and filters to secondhand-sale matches
 * using credential type codes and keyword matching on business name.
 */
export async function runConnecticutPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  console.log("[ConnecticutPhase2] Starting secondary sale scraper via CT Open Data Portal");
  console.log(`[ConnecticutPhase2] Source: ${CT_OPEN_DATA_CSV_URL}`);

  try {
    await defaultRateLimiter.waitBeforeRequest(CT_OPEN_DATA_DOMAIN);

    const response = await fetch(CT_OPEN_DATA_CSV_URL, {
      method: "GET",
      headers: {
        Accept: "text/csv,*/*",
      },
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      console.error(
        `[ConnecticutPhase2] CSV fetch failed: HTTP ${response.status} from ${CT_OPEN_DATA_CSV_URL}`
      );
      return;
    }

    const csvText = await response.text();
    const lines = csvText.split("\n");

    if (lines.length < 2) {
      console.warn("[ConnecticutPhase2] CSV response appears empty or malformed");
      return;
    }

    // Parse header row — normalise to lowercase with single spaces
    const headers = parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/\s+/g, " ").trim()
    );

    console.log("[ConnecticutPhase2] CSV headers found:", headers.join(", "));

    const col = (name: string): number => headers.indexOf(name);

    // CT Socrata column probe — try multiple common variations
    const iCredentialType =
      col("credential_type") !== -1 ? col("credential_type") :
      col("credential type") !== -1 ? col("credential type") :
      col("license_type") !== -1 ? col("license_type") :
      col("license type") !== -1 ? col("license type") : -1;

    const iBusinessName =
      col("credential_name") !== -1 ? col("credential_name") :
      col("credential name") !== -1 ? col("credential name") :
      col("license_name") !== -1 ? col("license_name") :
      col("license name") !== -1 ? col("license name") :
      col("business_name") !== -1 ? col("business_name") :
      col("business name") !== -1 ? col("business name") :
      col("name") !== -1 ? col("name") : -1;

    const iFirstName =
      col("first_name") !== -1 ? col("first_name") :
      col("first name") !== -1 ? col("first name") : -1;

    const iLastName =
      col("last_name") !== -1 ? col("last_name") :
      col("last name") !== -1 ? col("last name") : -1;

    const iCity =
      col("town") !== -1 ? col("town") :
      col("city") !== -1 ? col("city") : -1;

    const iState =
      col("state") !== -1 ? col("state") : -1;

    const iZip =
      col("zip") !== -1 ? col("zip") :
      col("zip_code") !== -1 ? col("zip_code") :
      col("zip code") !== -1 ? col("zip code") :
      col("postal_code") !== -1 ? col("postal_code") : -1;

    const iLicenseNumber =
      col("license_number") !== -1 ? col("license_number") :
      col("license number") !== -1 ? col("license number") :
      col("credential_number") !== -1 ? col("credential_number") :
      col("credential number") !== -1 ? col("credential number") : -1;

    const iAddress =
      col("address") !== -1 ? col("address") :
      col("address_1") !== -1 ? col("address_1") :
      col("address 1") !== -1 ? col("address 1") :
      col("street_address") !== -1 ? col("street_address") : -1;

    if (iCredentialType === -1 || iBusinessName === -1) {
      console.error(
        "[ConnecticutPhase2] Could not find required columns (credential_type / license_type, credential_name / license_name) in CSV header. Headers found:",
        headers.join(", ")
      );
      return;
    }

    totalFetched = lines.length - 1;
    console.log(`[ConnecticutPhase2] CSV fetched — ${totalFetched} data rows`);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const fields = parseCsvLine(line);

        const credentialTypeRaw = iCredentialType >= 0 ? (fields[iCredentialType] || "") : "";
        const credentialType    = credentialTypeRaw.trim().toUpperCase();

        const businessNameRaw = iBusinessName >= 0 ? (fields[iBusinessName] || "").trim() : "";
        const firstName       = iFirstName  >= 0 ? (fields[iFirstName]  || "").trim() : "";
        const lastName        = iLastName   >= 0 ? (fields[iLastName]   || "").trim() : "";

        // Compose display name: prefer business/license name, fall back to "First Last"
        const displayName =
          businessNameRaw ||
          (firstName || lastName ? [firstName, lastName].filter(Boolean).join(" ") : "");

        if (!displayName) continue;

        // Determine whether this row qualifies
        const alwaysInclude = ALWAYS_INCLUDE_ACTIVITIES.has(credentialType);
        const broaderMatch  = BROADER_ACTIVITIES.has(credentialType) && nameMatchesKeyword(displayName);

        if (!alwaysInclude && !broaderMatch) continue;

        // Filter out false positives by name
        if (nameIsExcluded(displayName)) continue;

        totalMatched++;

        const licenseNumber = iLicenseNumber >= 0 ? (fields[iLicenseNumber] || "").trim() : "";
        const city          = iCity          >= 0 ? (fields[iCity]          || "").trim() : "";
        const zip           = iZip           >= 0 ? (fields[iZip]           || "").trim() : "";
        const address1      = iAddress       >= 0 ? (fields[iAddress]       || "").trim() : "";

        // dedupeKey: prefer license number, fall back to slugified name
        const slugifiedName = displayName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 40);
        const dedupeKey      = `CT-SECONDARY-${licenseNumber || slugifiedName}`;
        const isStateLicensed = alwaysInclude;
        const businessCategory = mapCategory(credentialType);

        console.log(`[ConnecticutPhase2] Matched: ${dedupeKey} — ${displayName} (${credentialType})`);

        const orgId = await getOrCreateScrapedOrganizer(
          displayName,                  // businessName
          "ConnecticutPhase2",          // sourceName
          city || "Connecticut",        // city
          "CT",                         // state
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
        console.error(`[ConnecticutPhase2] Error on row ${i}:`, rowErr);
      }
    }

    console.log(
      `[ConnecticutPhase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error("[ConnecticutPhase2] Scraper fatal error:", error);
    throw error;
  }
}
