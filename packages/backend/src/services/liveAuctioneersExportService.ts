/**
 * liveAuctioneersExportService.ts — generates a LiveAuctioneers-compatible lot-upload
 * spreadsheet (CSV) from an organizer's own FindA.Sale inventory.
 *
 * Context (see the dispatch prompt / ADR-DRAFT-universal-crosslister-buildout for full
 * background): LiveAuctioneers has no self-serve API and no public listing API for
 * new sellers — getting an account there is a real, separate B2B sales-process bottleneck
 * this feature does NOT unblock. But an organizer who is *already* a LiveAuctioneers
 * customer through their own independent business relationship needs no new access at
 * all — LiveAuctioneers' own documented mechanism for building a catalog is uploading a
 * spreadsheet (CSV/XLSX/TXT) through LiveAuctioneers' own native web upload tool. So the
 * only thing FindA.Sale needs to build is: generate that spreadsheet, correctly formatted,
 * from the organizer's own item data. No automation touches liveauctioneers.com anywhere
 * in this file or its caller — a human uploads the file themselves, through LiveAuctioneers'
 * own site, so there is no ToS/automation risk surface to design around here (unlike every
 * other marketplace connector in this project).
 *
 * Column spec (from LiveAuctioneers' own official seller docs, confirmed 2026-08-18):
 *   Required: LotNum, Title (49-char limit — LiveAuctioneers enforces this; titles over
 *     the limit are truncated here and reported back so the organizer can shorten them by
 *     hand before uploading), Description, LowEst, HighEst, StartPrice (LiveAuctioneers
 *     auto-sets this to 50% of LowEst if left blank).
 *   Optional: Condition (free text, no fixed enum — FindA.Sale's own condition string is
 *     passed straight through), Reserve (internal-only, not shown to bidders), Consignor
 *     (internal-only), ImageFile.1 through ImageFile.10 — confirmed these columns accept a
 *     plain hosted URL rather than a local file path, so FindA.Sale's existing Cloudinary
 *     photoUrls drop straight in, up to 10 images per lot, no transfer step needed.
 *
 * FindA.Sale has no native "auction estimate range" concept (LowEst/HighEst) — the mapping
 * below is a documented judgment call, not something from LiveAuctioneers' spec, and is
 * called out again at the point it's computed. Every other column maps to an existing,
 * named FindA.Sale field.
 */

import { prisma } from '../lib/prisma';

// Shape of the fields this service actually reads off Item — kept narrow and explicit so a
// future schema rename breaks this file loudly (TS error) rather than silently mismapping.
export interface LiveAuctioneersExportItem {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  auctionStartPrice: number | null;
  auctionReservePrice: number | null;
  condition: string | null;
  photoUrls: string[];
}

export interface LiveAuctioneersFlaggedItem {
  id: string;
  title: string;
}

export interface LiveAuctioneersExportResult {
  csv: string;
  itemCount: number;
  // Titles that exceeded LiveAuctioneers' 49-char limit and were truncated.
  truncatedTitles: LiveAuctioneersFlaggedItem[];
  // Items with no usable price signal at all (LowEst/HighEst/StartPrice left blank —
  // organizer must fill these in by hand before uploading; LiveAuctioneers requires
  // LowEst/HighEst as "required" columns per its own docs, so a blank is a real gap,
  // not a stylistic choice, and is surfaced rather than silently fabricated).
  missingEstimate: LiveAuctioneersFlaggedItem[];
}

const TITLE_MAX_LENGTH = 49;
const MAX_IMAGE_COLUMNS = 10;

/**
 * Dependency-free CSV field escaper — quotes a field only when it contains a comma, quote,
 * or newline, doubling any embedded quotes. Deliberately not pulling in a CSV-writer npm
 * package: packages/backend/package.json only has `csv-parse` (a parser, not a writer) as
 * an existing dependency, and this is the same escaping approach already used verbatim in
 * ebayController.ts's generateEbayCsv / exportController.ts's escapeCSV.
 */
function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function money(value: number): string {
  return value.toFixed(2);
}

/**
 * Generate the LiveAuctioneers lot-upload CSV for a set of an organizer's own items.
 * Pure function — no DB access, no ownership check (that happens before this is called;
 * see getOwnedItemsForLiveAuctioneersExport below). Order of `items` is preserved as
 * LotNum order.
 */
export function generateLiveAuctioneersCsv(
  items: LiveAuctioneersExportItem[],
  consignorName?: string | null
): LiveAuctioneersExportResult {
  const header = [
    'LotNum',
    'Title',
    'Description',
    'LowEst',
    'HighEst',
    'StartPrice',
    'Condition',
    'Reserve',
    'Consignor',
    ...Array.from({ length: MAX_IMAGE_COLUMNS }, (_, i) => `ImageFile.${i + 1}`),
  ];

  const rows: string[] = [header.join(',')];
  const truncatedTitles: LiveAuctioneersFlaggedItem[] = [];
  const missingEstimate: LiveAuctioneersFlaggedItem[] = [];

  items.forEach((item, index) => {
    const lotNum = index + 1;

    let title = item.title || '';
    if (title.length > TITLE_MAX_LENGTH) {
      truncatedTitles.push({ id: item.id, title: item.title });
      title = title.substring(0, TITLE_MAX_LENGTH).trim();
    }

    // Best available "this item is worth roughly this much" signal on a FindA.Sale item.
    // Prefer the item's own listing price (most commonly populated field); fall back to
    // auctionStartPrice for items already configured as a FindA.Sale auction listing.
    const bestPrice = item.price ?? item.auctionStartPrice ?? null;

    let lowEst = '';
    let highEst = '';
    if (bestPrice !== null && bestPrice > 0) {
      // JUDGMENT CALL (documented, not from LiveAuctioneers' spec): FindA.Sale has no
      // native low/high auction-estimate concept, so the estimate range is derived as
      // +/-20% of the best available price signal. Organizer should sanity-check this
      // before uploading — it's a starting point, not a researched appraisal range.
      lowEst = money(bestPrice * 0.8);
      highEst = money(bestPrice * 1.2);
    } else {
      missingEstimate.push({ id: item.id, title: item.title });
    }

    // StartPrice: prefer the item's own configured auction starting bid (the closest real
    // FindA.Sale equivalent) over the generic best-price fallback; leave blank if neither
    // exists so LiveAuctioneers' own 50%-of-LowEst default applies.
    let startPrice = '';
    if (item.auctionStartPrice !== null && item.auctionStartPrice > 0) {
      startPrice = money(item.auctionStartPrice);
    } else if (bestPrice !== null && bestPrice > 0) {
      startPrice = money(bestPrice);
    }

    // Reserve: FindA.Sale's own auctionReservePrice is a direct, named equivalent — use it
    // when set, otherwise leave blank (LiveAuctioneers treats blank Reserve as "no reserve").
    const reserve =
      item.auctionReservePrice !== null && item.auctionReservePrice > 0
        ? money(item.auctionReservePrice)
        : '';

    const imageUrls = (item.photoUrls || []).slice(0, MAX_IMAGE_COLUMNS);
    const imageColumns = Array.from({ length: MAX_IMAGE_COLUMNS }, (_, i) => imageUrls[i] || '');

    const row = [
      escapeCsvValue(lotNum),
      escapeCsvValue(title),
      escapeCsvValue(item.description || ''),
      escapeCsvValue(lowEst),
      escapeCsvValue(highEst),
      escapeCsvValue(startPrice),
      escapeCsvValue(item.condition || ''),
      escapeCsvValue(reserve),
      escapeCsvValue(consignorName || ''),
      ...imageColumns.map((url) => escapeCsvValue(url)),
    ];

    rows.push(row.join(','));
  });

  if (truncatedTitles.length > 0) {
    console.warn(
      `[LiveAuctioneers Export] ${truncatedTitles.length} title(s) truncated to ${TITLE_MAX_LENGTH} chars:`,
      truncatedTitles.map((t) => `${t.id} ("${t.title}")`).join('; ')
    );
  }
  if (missingEstimate.length > 0) {
    console.warn(
      `[LiveAuctioneers Export] ${missingEstimate.length} item(s) have no price signal — LowEst/HighEst/StartPrice left blank:`,
      missingEstimate.map((t) => `${t.id} ("${t.title}")`).join('; ')
    );
  }

  return {
    csv: rows.join('\n'),
    itemCount: items.length,
    truncatedTitles,
    missingEstimate,
  };
}

/**
 * Ownership-scoped item fetch for the export. Mirrors
 * reverbMarketplaceController.ts's resolveOwnedOrganizerAndItem (Item.organizerId
 * denormalized-for-inventory-items OR item.sale.organizerId) and
 * ebayController.ts's exportSaleToEbay (saleId + optional itemIds narrowing).
 * Supports two selection modes:
 *   - saleId: all of the organizer's items currently in that sale
 *   - itemIds: an explicit, organizer-owned subset (any item the organizer owns,
 *     in or out of a sale — same ownership rule as the Reverb connector)
 * At least one of saleId/itemIds must be provided by the caller.
 */
export async function getOwnedItemsForLiveAuctioneersExport(
  userId: string,
  selection: { saleId?: string; itemIds?: string[] }
): Promise<{
  organizer: { id: string; businessName: string } | null;
  items: LiveAuctioneersExportItem[];
}> {
  const organizer = await prisma.organizer.findUnique({
    where: { userId },
    select: { id: true, businessName: true },
  });
  if (!organizer) {
    return { organizer: null, items: [] };
  }

  const itemSelect = {
    id: true,
    title: true,
    description: true,
    price: true,
    auctionStartPrice: true,
    auctionReservePrice: true,
    condition: true,
    photoUrls: true,
  } as const;

  let items: LiveAuctioneersExportItem[] = [];

  if (selection.itemIds && selection.itemIds.length > 0) {
    items = await prisma.item.findMany({
      where: {
        id: { in: selection.itemIds },
        OR: [{ organizerId: organizer.id }, { sale: { organizerId: organizer.id } }],
      },
      select: itemSelect,
    });
  } else if (selection.saleId) {
    items = await prisma.item.findMany({
      where: {
        saleId: selection.saleId,
        sale: { organizerId: organizer.id },
      },
      select: itemSelect,
    });
  }

  return { organizer, items };
}
