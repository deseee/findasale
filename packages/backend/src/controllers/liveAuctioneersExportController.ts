/**
 * liveAuctioneersExportController.ts — HTTP layer for the LiveAuctioneers spreadsheet
 * export (services/liveAuctioneersExportService.ts). Mirrors ebayController.ts's
 * exportSaleToEbay download pattern and reverbMarketplaceController.ts's
 * resolveOwnedOrganizerAndItem ownership-check pattern.
 *
 * Security posture (CLAUDE.md §9 Security-QA Gate — read-only export of the organizer's
 * own data, not a write to any third party): `authenticate` + `requireOrganizer` gated,
 * organizer resolved strictly from the JWT subject (never a client-supplied id).
 * getOwnedItemsForLiveAuctioneersExport re-derives ownership from userId for every item
 * (Item.organizerId OR item.sale.organizerId, same OWNERSHIP/TENANT-ISOLATION invariant as
 * every other marketplace export/connector in this codebase) — a saleId or itemIds an
 * organizer doesn't own resolves to zero rows, never another organizer's data.
 *
 * No automation touches liveauctioneers.com — this endpoint only generates a file for the
 * organizer to download and upload themselves via LiveAuctioneers' own web tool.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  generateLiveAuctioneersCsv,
  getOwnedItemsForLiveAuctioneersExport,
} from '../services/liveAuctioneersExportService';

/**
 * GET /api/liveauctioneers/export
 * Query params (at least one required):
 *   - saleId: export all of the organizer's own items currently in this sale
 *   - itemIds: comma-separated explicit item id list (organizer-owned items, in or out of
 *     a sale — same selection rule as the Reverb push-to-marketplace endpoints)
 * Streams back a CSV file (not JSON) in LiveAuctioneers' documented lot-upload column
 * format, ready for the organizer to upload directly at liveauctioneers.com.
 */
export const exportLiveAuctioneersCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { saleId, itemIds: itemIdsRaw } = req.query as { saleId?: string; itemIds?: string };
    const itemIds = itemIdsRaw ? itemIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

    if (!saleId && (!itemIds || itemIds.length === 0)) {
      res.status(400).json({ message: 'saleId or itemIds is required' });
      return;
    }

    const { organizer, items } = await getOwnedItemsForLiveAuctioneersExport(userId, { saleId, itemIds });

    if (!organizer) {
      res.status(404).json({ message: 'Organizer profile not found' });
      return;
    }

    if (items.length === 0) {
      res.status(404).json({ message: 'No matching items found for this organizer' });
      return;
    }

    const { csv, itemCount, truncatedTitles, missingEstimate } = generateLiveAuctioneersCsv(
      items,
      organizer.businessName
    );

    console.log(
      `[LiveAuctioneers Export] organizer=${organizer.id} items=${itemCount} truncatedTitles=${truncatedTitles.length} missingEstimate=${missingEstimate.length}`
    );

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `liveauctioneers-export-${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('[LiveAuctioneers Export] Export error:', error);
    res.status(500).json({ message: 'Failed to generate LiveAuctioneers export' });
  }
};
