/**
 * Rhode Island Phase 2 — Providence Open Data (Socrata) Business License Scraper
 * Source: https://data.providenceri.gov/resource/ui7z-kv69.json
 * Fetches business licenses from Providence RI Open Data portal via Socrata API,
 * filtered for secondhand sale types (auction, estate sale, consignment, antique,
 * pawn, thrift, resale, secondhand, flea market, yard sale, surplus, liquidation).
 *
 * ADR-073: Directory Scraper Phase 2 — Providence RI Open Data
 */

import { getOrCreateScrapedOrganizer } from '../index';

const SOCRATA_ENDPOINT = 'https://data.providenceri.gov/resource/ui7z-kv69.json';
const SOURCE_NAME = 'RhodeIslandPhase2';
const SOURCE_LABEL = 'ProvidenceOpenData';

// Secondhand sale keywords for Socrata $where filter
const SALE_KEYWORDS = [
  'auction',
  'estate sale',
  'consignment',
  'antique',
  'pawn',
  'thrift',
  'resale',
  'secondhand',
  'flea market',
  'yard sale',
  'surplus',
  'liquidat',
];

// False-positive business name fragments
const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage', 'bank', 'credit union',
  'financial', 'insurance', 'law office', 'attorney', 'lawyer',
  'dental', 'dentist', 'medical', 'clinic', 'pharmacy', 'hospital',
  'restaurant', 'hotel', 'motel', 'petroleum', 'gas station',
  'automotive', 'car wash', 'daycare', 'school', 'church', 'funeral',
  'landscaping', 'construction', 'plumbing', 'electrical', 'roofing',
  'hair salon', 'nail salon', 'tattoo', 'massage', 'yoga', 'gym',
  'grocery', 'supermarket',
];

/**
 * Map a keyword match to a valid businessCategory for getOrCreateScrapedOrganizer.
 */
function mapCategory(nameAndType: string): string {
  const lower = nameAndType.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  if (lower.includes('estate sale')) return 'ESTATE_SALE_CO';
  if (lower.includes('consign')) return 'CONSIGNMENT';
  if (lower.includes('antique')) return 'ANTIQUE_DEALER';
  if (lower.includes('pawn')) return 'PAWN_SHOP';
  if (lower.includes('thrift') || lower.includes('resale') || lower.includes('secondhand')) return 'THRIFT_STORE';
  if (lower.includes('flea')) return 'FLEA_MARKET';
  if (lower.includes('yard sale')) return 'ESTATE_SALE_CO';
  if (lower.includes('surplus') || lower.includes('liquidat')) return 'LIQUIDATION';
  return 'THRIFT_STORE'; // fallback for anything that passed the keyword filter
}

/**
 * Check if a business name contains any exclude fragment.
 */
function isFalsePositive(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Build the Socrata $where clause: OR across all keyword matches on likely text fields.
 * We search across business name and business type/description fields.
 */
// Providence RI dataset uses boolean flag columns for specific license types.
// These flags reliably identify secondhand/pawn/junk businesses regardless of name.
const RI_FLAG_CLAUSES = [
  "pawnbrok = 'Y'",
  "sechandstore = 'Y'",
  "sechandaut = 'Y'",
  "junkshop = 'Y'",
  "yardsale = 'Y'",
];

function buildWhereClause(nameField: string, typeField?: string): string {
  const clauses = SALE_KEYWORDS.map((kw) => {
    const escaped = kw.replace(/'/g, "''");
    const parts = [`upper(${nameField}) like upper('%${escaped}%')`];
    if (typeField) {
      parts.push(`upper(${typeField}) like upper('%${escaped}%')`);
    }
    return `(${parts.join(' OR ')})`;
  });
  // Also include RI-specific license type flag columns
  clauses.push(...RI_FLAG_CLAUSES);
  return clauses.join(' OR ');
}

interface SocrataRecord {
  [key: string]: string | undefined;
}

/**
 * Discover field names by fetching a single record.
 * Returns the best-guess field names for business name, address, city, phone, and type.
 */
async function discoverFields(): Promise<{
  nameField: string;
  addressField?: string;
  cityField?: string;
  phoneField?: string;
  typeField?: string;
  zipField?: string;
}> {
  const url = `${SOCRATA_ENDPOINT}?$limit=1`;
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    throw new Error(`[${SOURCE_NAME}] Field discovery failed: HTTP ${resp.status}`);
  }

  const records: SocrataRecord[] = await resp.json();
  if (!records.length) {
    throw new Error(`[${SOURCE_NAME}] Field discovery returned empty dataset`);
  }

  const fields = Object.keys(records[0]);
  const lower = fields.map((f) => f.toLowerCase());

  console.log(`[${SOURCE_NAME}] Available fields: ${fields.join(', ')}`);

  // Find business name field
  const nameField =
    fields.find((f) => f.toLowerCase() === 'businessname') ??
    fields.find((f) => f.toLowerCase() === 'business_name') ??
    fields.find((f) => f.toLowerCase() === 'dba') ??
    fields.find((f) => f.toLowerCase() === 'dba_name') ??
    fields.find((f) => f.toLowerCase() === 'dbaname') ??
    fields.find((f) => f.toLowerCase() === 'company_name') ??
    fields.find((f) => f.toLowerCase() === 'companyname') ??
    fields.find((f) => lower.includes(f.toLowerCase()) && f.toLowerCase().includes('name'));

  if (!nameField) {
    throw new Error(`[${SOURCE_NAME}] Could not identify business name field from: ${fields.join(', ')}`);
  }

  // Find address field
  const addressField =
    fields.find((f) => f.toLowerCase() === 'address') ??
    fields.find((f) => f.toLowerCase() === 'business_address') ??
    fields.find((f) => f.toLowerCase() === 'street_address') ??
    fields.find((f) => f.toLowerCase() === 'location_address') ??
    fields.find((f) => f.toLowerCase().includes('address') && !f.toLowerCase().includes('email'));

  // Find city field
  const cityField =
    fields.find((f) => f.toLowerCase() === 'city') ??
    fields.find((f) => f.toLowerCase() === 'business_city') ??
    fields.find((f) => f.toLowerCase().includes('city'));

  // Find phone field
  const phoneField =
    fields.find((f) => f.toLowerCase() === 'phone') ??
    fields.find((f) => f.toLowerCase() === 'telephone') ??
    fields.find((f) => f.toLowerCase() === 'phone_number') ??
    fields.find((f) => f.toLowerCase().includes('phone'));

  // Find business type / description field
  const typeField =
    fields.find((f) => f.toLowerCase() === 'businesstype') ??
    fields.find((f) => f.toLowerCase() === 'business_type') ??
    fields.find((f) => f.toLowerCase() === 'license_type') ??
    fields.find((f) => f.toLowerCase() === 'category') ??
    fields.find((f) => f.toLowerCase() === 'description') ??
    fields.find((f) => f.toLowerCase().includes('type') || f.toLowerCase().includes('category'));

  // Find zip field
  const zipField =
    fields.find((f) => f.toLowerCase() === 'zip') ??
    fields.find((f) => f.toLowerCase() === 'zipcode') ??
    fields.find((f) => f.toLowerCase() === 'zip_code') ??
    fields.find((f) => f.toLowerCase() === 'postal_code') ??
    fields.find((f) => f.toLowerCase().includes('zip'));

  console.log(`[${SOURCE_NAME}] Field mapping: name=${nameField}, address=${addressField}, city=${cityField}, phone=${phoneField}, type=${typeField}, zip=${zipField}`);

  return { nameField, addressField, cityField, phoneField, typeField, zipField };
}

/**
 * Scrape Providence RI Open Data (Socrata) business licenses for secondhand sale businesses.
 * Uses $where filter to find relevant license types, then upserts via getOrCreateScrapedOrganizer.
 * Throws if zero results are returned.
 */
export async function runRhodeIslandPhase2Scraper(): Promise<void> {
  console.log(`[${SOURCE_NAME}] Starting Providence Open Data business license scraper`);

  // Step 1: Discover field names
  const { nameField, addressField, cityField, phoneField, typeField, zipField } = await discoverFields();

  // Step 2: Build filtered query
  const whereClause = buildWhereClause(nameField, typeField);
  const queryUrl = `${SOCRATA_ENDPOINT}?$where=${encodeURIComponent(whereClause)}&$limit=1000`;

  console.log(`[${SOURCE_NAME}] Fetching with $where filter across ${SALE_KEYWORDS.length} keywords`);

  const resp = await fetch(queryUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    throw new Error(`[${SOURCE_NAME}] Socrata API error: HTTP ${resp.status} ${resp.statusText}`);
  }

  const records: SocrataRecord[] = await resp.json();
  console.log(`[${SOURCE_NAME}] Socrata returned ${records.length} raw records`);

  if (records.length === 0) {
    console.warn(`[${SOURCE_NAME}] Zero results from Socrata API — endpoint may have changed or filter is too narrow`);
    return;
  }

  // Step 3: Deduplicate by normalized business name
  const seen = new Set<string>();
  const uniqueRecords: SocrataRecord[] = [];

  for (const rec of records) {
    const rawName = rec[nameField];
    if (!rawName) continue;

    const normalized = rawName.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueRecords.push(rec);
  }

  console.log(`[${SOURCE_NAME}] ${uniqueRecords.length} unique records after deduplication (removed ${records.length - uniqueRecords.length} dupes)`);

  // Step 4: Filter false positives and upsert
  let processed = 0;
  let created = 0;
  let skipped = 0;

  for (const rec of uniqueRecords) {
    const businessName = (rec[nameField] ?? '').trim();
    if (!businessName) {
      skipped++;
      continue;
    }

    if (isFalsePositive(businessName)) {
      skipped++;
      continue;
    }

    // Also check type field for false positives
    const typeValue = typeField ? (rec[typeField] ?? '') : '';
    if (typeValue && isFalsePositive(typeValue)) {
      skipped++;
      continue;
    }

    // Determine category from name + type
    const categoryInput = `${businessName} ${typeValue}`;
    const category = mapCategory(categoryInput);

    // Extract location fields
    const city = cityField ? (rec[cityField] ?? '').trim() : 'Providence';
    const phone = phoneField ? (rec[phoneField] ?? '').trim() || undefined : undefined;

    try {
      const result = await getOrCreateScrapedOrganizer(
        businessName,
        SOURCE_NAME,
        city || 'Providence',
        'RI',
        undefined,       // esnOrgId
        undefined,       // googlePlaceId
        undefined,       // foursquareVenueId
        undefined,       // hereBusinessId
        category,        // businessCategory
        undefined,       // contactEmail
        phone,           // phone
        undefined,       // website
        undefined,       // lat
        undefined,       // lng
        true,            // isStateLicensed
        'RI',            // licenseState
        undefined,       // licenseNumber
        SOURCE_LABEL,    // sourceLabel
      );

      processed++;
      if (result) created++;

      if (processed % 50 === 0) {
        console.log(`[${SOURCE_NAME}] Progress: ${processed} processed, ${created} created, ${skipped} skipped`);
      }
    } catch (err) {
      console.error(`[${SOURCE_NAME}] Error upserting "${businessName}":`, err);
    }
  }

  console.log(`[${SOURCE_NAME}] Complete: ${processed} processed, ${created} created, ${skipped} skipped (false positives / empty names)`);

  if (processed === 0) {
    console.warn(`[${SOURCE_NAME}] Zero valid records after filtering — all ${uniqueRecords.length} records were excluded as false positives or empty names`);
  }
}
