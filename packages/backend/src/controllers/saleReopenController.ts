/**
 * POST /api/items/:id/reopen-sale -- "the marketplace sale was cancelled, mark this item available again".
 *
 * One organizer endpoint that dispatches on Item.lastSoldVia (2026-10-10):
 *   EBAY                 -> the existing eBay path, verified against eBay live (reopenEbayCancelledSale)
 *   OFF_PLATFORM_MANUAL  -> the existing undo path (undoItemSoldOffPlatform)
 *   FB_NATIVE, FB_EMAIL_ORDER, MERCARI, VINTED, ETSY, POSHMARK, GRAILED, REVERB, DISCOGS, or no tag
 *                        -> organizer-attested: body { confirm: true } required (services/saleReopenService.ts)
 *   STRIPE, POS, a PAID purchase, multi-quantity, bulk lot, unknown tag -> 409 with the reason (refund flow instead)
 * commitItemSale (ADR-098) is not touched. Ownership is default-deny via resolveItemOwnerOrganizer (sale organizer,
 * or the item's own organizerId for saleless inventory), same as the eBay reopen.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { resolveItemOwnerOrganizer } from '../utils/itemOwner';
import { classifySoldChannel, reopenAttestedSale } from '../services/saleReopenService';
import { inStockOf } from '../services/inventoryStockMath';
import { organizerEditStampAlways } from '../utils/organizerEdit';
import { reopenEbayCancelledSale, undoItemSoldOffPlatform } from './itemController';

export const reopenItemSale = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const hasOrganizerRole = req.user.roles?.includes('ORGANIZER') || req.user.role === 'ORGANIZER';
    if (!hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        lastSoldVia: true,
        saleId: true,
        organizerId: true,
        listingType: true,
        stockTotal: true,
        stockSold: true,
        sale: { select: { organizer: { select: { id: true, userId: true, subscriptionTier: true, lat: true, lng: true } } } },
      },
    });
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    const owner = await resolveItemOwnerOrganizer(item as any, req.user.id);
    if (!owner) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }
    if (item.status !== 'SOLD') {
      return res.status(409).json({ message: 'This item is not marked sold, so there is nothing to reopen.', code: 'NOT_SOLD' });
    }

    // 2026-10-15 (Patrick: Sacagawea inserts stuck SOLD): a multi-unit item can be flagged SOLD by a sale report while the
    // stock count still shows units left. That is not a cancelled sale to verify, it is a wrong flag: nothing is owed back
    // and nothing is re-listed by hand, so just put it back on sale. Single-unit items (inStock 0) keep their normal paths.
    if (typeof item.stockSold === 'number' && item.listingType !== 'KIT' && item.listingType !== 'CONSIGNOR_TAG' && inStockOf(item as any) > 0) {
      const healed = await prisma.item.updateMany({
        where: { id, status: 'SOLD' },
        data: { status: 'AVAILABLE', ...organizerEditStampAlways() },
      });
      if (healed?.count === 1) return res.json({ ok: true, itemId: id, marketplace: 'FindA.Sale' });
    }

    const channel = classifySoldChannel(item.lastSoldVia);
    if (channel.kind === 'EBAY') {
      return reopenEbayCancelledSale(req, res);
    }
    if (channel.kind === 'OFF_PLATFORM') {
      return undoItemSoldOffPlatform(req, res);
    }

    const result = await reopenAttestedSale(id, {
      organizerId: owner.id,
      actorUserId: req.user.id,
      confirm: req.body?.confirm === true,
    });
    if (!result.ok) {
      return res.status(result.status).json({
        message: result.message,
        code: result.code,
        ...(result.requiresConfirmation ? { requiresConfirmation: true } : {}),
        ...(result.marketplace ? { marketplace: result.marketplace } : {}),
      });
    }
    return res.json({ ok: true, itemId: result.itemId, marketplace: result.marketplace });
  } catch (error) {
    console.error('Error reopening sale:', error);
    return res.status(500).json({ message: 'Server error while reopening this item' });
  }
};
