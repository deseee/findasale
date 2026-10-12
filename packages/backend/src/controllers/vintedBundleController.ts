/**
 * vintedBundleController.ts -- organizer-facing manual reconciliation for a Vinted bundle sale
 * (2026-10-12). Vinted's bundle email names no items, so the organizer ticks them on the web page
 * (frontend/pages/organizer/vinted-bundle.tsx). Cookie-authenticated web routes mounted at
 * /api/organizer/vinted-bundle (NOT under /api/extension, whose router refuses cookie-only writes).
 *
 *   GET  /api/organizer/vinted-bundle            -> { notices, tracked, other }
 *   POST /api/organizer/vinted-bundle/mark-sold  -> { itemIds: string[] } (<= 50)
 *
 * mark-sold runs the SAME sold flow as the Vinted sold-email / wardrobe paths for each selected item the
 * organizer owns (vintedSoldDetectionService.markItemsSoldOnVinted: close the Vinted job record, then
 * commitFacebookNativeSale with soldVia VINTED, which cascades removals to every other channel), then
 * acknowledges the bundle notification. Idempotent for already-sold items. No prices are read or guessed.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  markItemsSoldOnVinted,
  sanitizeManualSoldItemIds,
  VINTED_MANUAL_SOLD_MAX_ITEMS,
} from '../services/vintedSoldDetectionService';
import {
  acknowledgeVintedBundleSale,
  listPendingVintedBundleNotices,
  listVintedBundleSelectionOptions,
} from '../services/vintedBundleSaleService';

async function organizerIdFor(userId: string): Promise<string | null> {
  const organizer = await prisma.organizer.findUnique({ where: { userId }, select: { id: true } });
  return organizer?.id ?? null;
}

export const getVintedBundleOptions = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  try {
    const organizerId = await organizerIdFor(userId);
    if (!organizerId) { res.status(404).json({ message: 'Organizer profile not found' }); return; }
    const [notices, options] = await Promise.all([
      listPendingVintedBundleNotices(userId),
      listVintedBundleSelectionOptions(organizerId),
    ]);
    res.json({ notices, tracked: options.tracked, other: options.other, maxSelectable: VINTED_MANUAL_SOLD_MAX_ITEMS });
  } catch (err: any) {
    console.error('[VintedBundle] options failed:', err?.message || err);
    res.status(500).json({ message: 'Could not load Vinted bundle options' });
  }
};

export const markVintedBundleItemsSold = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: 'Authentication required' }); return; }
  const raw = req.body?.itemIds;
  if (!Array.isArray(raw)) { res.status(400).json({ message: 'itemIds must be an array', reason: 'invalid_items' }); return; }
  if (raw.length > VINTED_MANUAL_SOLD_MAX_ITEMS) {
    res.status(400).json({ message: `Select at most ${VINTED_MANUAL_SOLD_MAX_ITEMS} items at a time`, reason: 'too_many_items' });
    return;
  }
  const itemIds = sanitizeManualSoldItemIds(raw);
  if (!itemIds.length) { res.status(400).json({ message: 'Select at least one item', reason: 'no_items' }); return; }
  try {
    const organizerId = await organizerIdFor(userId);
    if (!organizerId) { res.status(404).json({ message: 'Organizer profile not found' }); return; }
    const results = await markItemsSoldOnVinted(organizerId, itemIds);
    const summary: Record<string, number> = { sold: 0, alreadySold: 0, notAvailable: 0, notFound: 0, error: 0 };
    for (const r of results) summary[r.result] = (summary[r.result] || 0) + 1;
    // The bundle is reconciled once at least one selected item is (or already was) sold.
    if (summary.sold || summary.alreadySold) await acknowledgeVintedBundleSale(userId);
    console.log('[VintedManualSold]', JSON.stringify({ organizerId, requested: raw.length, accepted: itemIds.length, summary }));
    res.json({ ok: true, results, summary });
  } catch (err: any) {
    console.error('[VintedManualSold] failed:', err?.message || err);
    res.status(500).json({ message: 'Marking the selected items sold failed' });
  }
};
