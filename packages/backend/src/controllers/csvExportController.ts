import { Request, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { generateCsvExport, generateCsvFilename } from '../services/exportService';
import { organizerHasTier } from '../utils/tierAccess';
import { filterBulkLotsForExport } from '../services/bulkLot/bulkLotExportFilter'; // ADR-136 Addendum C (#659)

type ExportFormat = 'ebay' | 'amazon' | 'facebook' | 'quickbooks';

/** Max item ids one export request may name. The ids travel in the GET query string, so this also keeps the URL well under proxy limits. */
export const MAX_EXPORT_ITEM_IDS = 250;
const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Item.status values (plain string column) an export may be filtered to. */
const EXPORT_STATUS_FILTERS = ['AVAILABLE', 'SOLD', 'RESERVED', 'INVOICE_ISSUED', 'AUCTION_ENDED', 'DONATED'];

/**
 * Parse the optional `itemIds` query parameter: a comma-separated string ("a,b,c") or a repeated
 * parameter (itemIds=a&itemIds=b). Returns ids: null when no ids were requested (export the whole sale).
 */
export function parseItemIdsParam(raw: unknown): { ids: string[] | null; error?: string; code?: string } {
  if (raw === undefined || raw === null || raw === '') return { ids: null };
  const parts = Array.isArray(raw) ? raw : [raw];
  const ids: string[] = [];
  for (const part of parts) {
    if (typeof part !== 'string') return { ids: null, error: 'itemIds must be a comma-separated list of item ids', code: 'INVALID_ITEM_IDS' };
    for (const piece of part.split(',')) {
      const id = piece.trim();
      if (!id) continue;
      if (!ITEM_ID_PATTERN.test(id)) return { ids: null, error: 'itemIds contains an invalid item id', code: 'INVALID_ITEM_IDS' };
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (ids.length === 0) return { ids: null };
  if (ids.length > MAX_EXPORT_ITEM_IDS) {
    return {
      ids: null,
      error: `You can export at most ${MAX_EXPORT_ITEM_IDS} selected items at once. Deselect some items, or clear the selection to export the whole sale.`,
      code: 'TOO_MANY_ITEM_IDS',
    };
  }
  return { ids };
}

/**
 * GET /api/organizers/export/csv?saleId=X&format=ebay|amazon|facebook|quickbooks[&itemIds=a,b,c][&status=AVAILABLE]
 *
 * Export inventory items for a sale in platform-specific CSV formats.
 * Requires: authenticated organizer (ORGANIZER role), PRO or TEAMS subscription tier, ownership of the sale.
 *
 * Optional filters (both applied inside the caller's own sale, never across sales):
 *   itemIds - export only these items (max MAX_EXPORT_ITEM_IDS). Unknown / other-sale ids are ignored.
 *   status  - export only items with this Item.status (e.g. AVAILABLE).
 * Every text cell is formula-injection neutralised (see services/exportService.ts).
 */
export async function getCsvExportHandler(req: AuthRequest, res: Response) {
  try {
    // Auth check
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.', code: 'ORGANIZER_REQUIRED' });
    }

    // Get query parameters
    const { saleId, format } = req.query;

    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'saleId query parameter is required' });
    }

    if (!format || typeof format !== 'string' || !['ebay', 'amazon', 'facebook', 'quickbooks'].includes(format)) {
      return res.status(400).json({ message: 'format must be one of: ebay, amazon, facebook, quickbooks' });
    }

    // Optional filters: validate before any database work
    const parsedIds = parseItemIdsParam(req.query.itemIds);
    if (parsedIds.error) {
      return res.status(400).json({ message: parsedIds.error, code: parsedIds.code });
    }
    const itemIds = parsedIds.ids;

    let statusFilter: string | null = null;
    if (req.query.status !== undefined && req.query.status !== '') {
      const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
      if (!EXPORT_STATUS_FILTERS.includes(rawStatus)) {
        return res.status(400).json({ message: `status must be one of: ${EXPORT_STATUS_FILTERS.join(', ')}`, code: 'INVALID_STATUS' });
      }
      statusFilter = rawStatus;
    }

    // Fetch organizer — include removeWatermarkEnabled for watermark gate (#410)
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true, subscriptionTier: true, removeWatermarkEnabled: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Tier check: PRO required. Organizer.subscriptionTier is the truth: PRO/TEAMS features remain
    // until the subscription actually ends (the end-of-period downgrade job rewrites the column), so
    // the lapse flag no longer downgrades a still-paid organizer (Patrick D1/D2, 2026-09-29).
    const isPro = organizerHasTier(organizer.subscriptionTier, 'PRO');
    if (!isPro) {
      return res.status(403).json({
        message: 'CSV export requires a PRO or TEAMS subscription. Upgrade to unlock QuickBooks, eBay and Amazon exports.',
        code: 'TIER_REQUIRED',
        requiredTier: 'PRO',
        upgradeRequired: true,
      });
    }

    // Fetch sale and verify ownership
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, title: true, organizerId: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'You do not have access to this sale', code: 'SALE_FORBIDDEN' });
    }

    // Fetch items for the sale (all statuses unless filtered, for historical data). saleId is always part of
    // the where clause, so `itemIds` can only ever select items of the caller's own sale.
    // photoUrls required for watermark overlay (#410)
    const allItems = await prisma.item.findMany({
      where: {
        saleId: sale.id,
        listingType: { not: 'CONSIGNOR_TAG' }, // POS consignor price-tag sales are records of a sale, not listable inventory (no photo, already SOLD)
        ...(itemIds ? { id: { in: itemIds } } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      select: {
        id: true,
        title: true,
        sku: true,
        description: true,
        price: true,
        condition: true,
        category: true,
        shippingAvailable: true,
        shippingPrice: true,
        status: true,
        photoUrls: true,
        updatedAt: true,
        stockTotal: true,
        stockSold: true,
        qrEmbedEnabled: true,
        qrAssetReady: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // ADR-136 Addendum C (#659): bulk lots (cards sold by the thousand) are left out of this export and the response says
    // so (X-Skipped-Bulk-Lots headers). Answers 503 / 400 itself when it cannot check or every selected item is a lot.
    const lotSplit = await filterBulkLotsForExport(allItems, res, prisma as any);
    if (!lotSplit) return;
    const items = lotSplit.kept;
    lotSplit.markResponse(res);

    if (items.length === 0 && (itemIds || statusFilter)) {
      return res.status(404).json({
        message: itemIds
          ? 'None of the selected items were found in this sale. Refresh the page and try again.'
          : 'No items match this export.',
        code: 'NO_ITEMS',
      });
    }

    // Generate CSV — pass organizer so watermark gate applies per tier (#410)
    const includeWatermark = true; // always on; canRemoveWatermark gate inside exportService controls TEAMS opt-out
    const csvContent = generateCsvExport(items as any, format as ExportFormat, organizer, includeWatermark);
    const filename = generateCsvFilename(sale.title, format as ExportFormat);

    // Return as file download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ message: 'Server error exporting CSV' });
  }
}
