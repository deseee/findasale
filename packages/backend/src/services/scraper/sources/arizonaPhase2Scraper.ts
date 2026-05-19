/**
 * Arizona Phase 2 — Mesa AZ Open Data (Socrata) Business Licenses Scraper
 * Source: https://data.mesaaz.gov/resource/6c65-na9e.json
 * ADR-073: Directory Scraper Phase 2 — City business license data
 *
 * Queries the Mesa AZ Open Data Socrata API for business licenses matching
 * secondary sale keywords (auction, estate sale, consignment, antique, pawn,
 * thrift, resale, secondhand, flea market, yard sale, surplus, liquidation).
 *
 * NOTE: data.mesaaz.gov covers Mesa only. Other AZ cities need separate portals:
 * TODO: Phoenix — https://www.phoenixopendata.com (check for business license dataset)
 * TODO: Scottsdale — https://data.scottsdaleaz.gov (check for business license dataset)
 * TODO: Tucson — https://data.tucsonaz.gov (check for business license dataset)
 * TODO: Chandler — https://data.chandleraz.gov or https://chandleraz.gov/open-data
 * TODO: Tempe — https://data.tempe.gov or https://tempegov.socrata.com
 */

import { getOrCreateScrapedOrganizer } from '../index';

const SOCRATA_ENDPOINT = 'https://data.mesaaz.gov/resource/6c65-na9e.json';

const SEARCH_TERMS = [
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

// False positive fragments — businesses whose names contain these are excluded
const EXCLUDE_FRAGMENTS = [
  'real estate',
  'realty',
  'realtor',
  'mortgage',
  'bank',
  'credit union',
  'financial',
  'insurance',
  'law office',
  'attorney',
  'lawyer',
  'dental',
  'dentist',
  'medical',
  'clinic',
  'pharmacy',
  'hospital',
  'restaurant',
  'hotel',
  'motel',
  'petroleum',
  'gas station',
  'automotive',
  'car wash',
  'daycare',
  'school',
  'church',
  'funeral',
  'landscaping',
  'construction',
  'plumbing',
  'electrical',
  'roofing',
  'hair salon',
  'nail salon',
  'tattoo',
  'massage',
  'yoga',
  'gym',
  'grocery',
  'supermarket',
];

interface SocrataRecord {
  business_name?: string;
  business_address?: string;
  business_city?: string;
  business_state?: string;
  business_zip?: string;
  business_phone?: string;
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((f) => lower.includes(f));
}

function mapCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('auction')) return 'auctioneer';
  if (lower.includes('estate sale')) return 'estate_sale';
  if (lower.includes('consign')) return 'consignment';
  if (lower.includes('antique')) return 'antique_dealer';
  if (lower.includes('pawn')) return 'pawnbroker';
  if (lower.includes('thrift') || lower.includes('resale') || lower.includes('secondhand'))
    return 'thrift_store';
  if (lower.includes('flea')) return 'flea_market';
  return 'secondary_sale';
}

function buildWhereClause(): string {
  return SEARCH_TERMS.map((term) => `business_name like '%${term}%'`).join(' OR ');
}

export async function runArizonaPhase2Scraper(): Promise<void> {
  console.log('[AZ-Phase2] Starting Mesa AZ Open Data business license scraper');

  const whereClause = buildWhereClause();
  const url = `${SOCRATA_ENDPOINT}?$where=${encodeURIComponent(whereClause)}&$limit=1000`;

  console.log(`[AZ-Phase2] Fetching: ${SOCRATA_ENDPOINT} with $limit=1000`);

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`[AZ-Phase2] Socrata API returned HTTP ${res.status}: ${res.statusText}`);
  }

  const records: SocrataRecord[] = await res.json();

  console.log(`[AZ-Phase2] Fetched ${records.length} raw records from Socrata`);

  if (records.length === 0) {
    throw new Error(
      '[AZ-Phase2] Zero results fetched from Mesa AZ Open Data. ' +
        'The dataset may have moved, the endpoint may have changed, or search terms returned no matches.'
    );
  }

  let totalExcluded = 0;
  let totalDupes = 0;
  let totalUpserted = 0;
  const seenKey = new Set<string>();

  for (const record of records) {
    const name = record.business_name?.trim();
    if (!name) continue;

    // False positive filter
    if (nameIsExcluded(name)) {
      totalExcluded++;
      continue;
    }

    // Deduplicate by name + city
    const city = record.business_city?.trim() || 'Mesa';
    const dedupeKey = `${name.toLowerCase()}:${city.toLowerCase()}`;
    if (seenKey.has(dedupeKey)) {
      totalDupes++;
      continue;
    }
    seenKey.add(dedupeKey);

    const state = record.business_state?.trim() || 'AZ';
    const phone = record.business_phone?.trim() || undefined;
    const category = mapCategory(name);

    console.log(`[AZ-Phase2] Matched: "${name}" — ${city}, ${state} [${category}]`);

    try {
      const orgId = await getOrCreateScrapedOrganizer(
        name,                // businessName
        'MesaAZOpenData',    // sourceName
        city,                // city
        state,               // state
        undefined,           // esnOrgId
        undefined,           // googlePlaceId
        undefined,           // foursquareVenueId
        undefined,           // hereBusinessId
        category,            // businessCategory
        undefined,           // contactEmail
        phone,               // phone
        undefined,           // website
        undefined,           // lat
        undefined,           // lng
        undefined,           // isStateLicensed
        undefined,           // licenseState
        undefined,           // licenseNumber
        'Mesa AZ Open Data'  // sourceLabel
      );
      if (orgId) totalUpserted++;
    } catch (upsertErr) {
      console.error(`[AZ-Phase2] Upsert error for "${name}":`, upsertErr);
    }
  }

  console.log(
    `[AZ-Phase2] Scraper completed: fetched=${records.length}, excluded=${totalExcluded}, dupes=${totalDupes}, upserted=${totalUpserted}`
  );
}
