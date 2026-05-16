/**
 * Wyoming Division of Banking — Pawnbroker License Scraper (Phase 2)
 * Source: https://wyomingbankingdivision.wyo.gov/consumer-lending/licensee-list
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 *
 * Investigation (2026-05-16):
 * - The licensee-list page is hosted on Google Sites (sites.google.com/wyo.gov/banking).
 * - The page is 100% JS-rendered. Static HTML fetch returns only Google Sites shell
 *   with zero licensee data. data-embedded-items-count="15" is populated client-side.
 * - The Google Drive files linked from the consumer-lending page are PDFs unrelated
 *   to the licensee list (PDCC Code Book, Wyoming Telework Memo, etc.).
 * - NMLS Consumer Access API returns 403 for unauthenticated requests.
 * - No downloadable CSV/Excel/JSON endpoint found on any wyo.gov path.
 *
 * Status: Active scraper — fetches page, parses HTML tables if present, returns gracefully
 * when page is JS-rendered (empty result expected until headless browser support is added).
 */

export interface ScrapeStats {
  itemsFound: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  itemsFailed: number;
}

const SOURCE_URL = 'https://wyomingbankingdivision.wyo.gov/consumer-lending/licensee-list';

interface WyomingLicensee {
  name: string;
  address?: string;
  city?: string;
  state: string;
  zip?: string;
  phone?: string;
  licenseNumber?: string;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
}

function parseLicensees(html: string): WyomingLicensee[] {
  const licensees: WyomingLicensee[] = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    // skip header row (index 0)
    for (const row of rows.slice(1)) {
      const cells = (row.match(/<td[\s\S]*?<\/td>/gi) ?? []).map(stripHtml);
      if (cells.length >= 1 && cells[0]) {
        licensees.push({
          name: cells[0],
          address: cells[1] ?? undefined,
          city: cells[2] ?? undefined,
          state: 'WY',
          zip: cells[3] ?? undefined,
          phone: cells[4] ?? undefined,
          licenseNumber: cells[5] ?? undefined,
        });
      }
    }
  }
  return licensees;
}

export async function runWyomingPhase2Scraper(): Promise<ScrapeStats> {
  const stats: ScrapeStats = {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };

  try {
    const res = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': 'FindASale-Directory/1.0 (+https://finda.sale)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[WyomingPhase2] HTTP ${res.status} from source — skipping`);
      return stats;
    }

    const html = await res.text();
    const licensees = parseLicensees(html);
    stats.itemsFound = licensees.length;

    if (licensees.length === 0) {
      // Expected: page is JS-rendered, static fetch returns Google Sites shell only.
      console.log('[WyomingPhase2] No licensee table found in static HTML (page is JS-rendered). No data fetched.');
      return stats;
    }

    console.log(`[WyomingPhase2] Found ${licensees.length} licensees — upserting...`);

    // Upsert logic pending headless browser support — page is JS-rendered so this
    // branch is never reached. Wire prisma import and upsert when Playwright is added.
    stats.itemsSkipped = licensees.length;
  } catch (err: any) {
    console.error('[WyomingPhase2] Fetch error:', err?.message ?? err);
  }

  console.log('[WyomingPhase2] Done:', stats);
  return stats;
}
