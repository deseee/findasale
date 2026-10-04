/**
 * Item card routes (ADR-134 #640, batch B2). Mounted by batch B9 at /api/item-cards; until then the
 * router is only exercised by unit tests.
 *
 *   GET  /api/item-cards/:itemId                 read the card of one of the caller's items (data: null when none)
 *   PUT  /api/item-cards/:itemId                 create or update the card (body = card fields, zod .strict())
 *   POST /api/item-cards/:itemId/apply-printing  copy a catalog printing into the card, skipping lockedFields
 *
 * Every route requires an ORGANIZER login and resolves the item first: an item that does not exist, or
 * that belongs to another organizer, is a 404 (never 403, never someone else's data). All writes go
 * through services/cardRecordService, the only writer of ItemCard. No paid AI service is called here.
 *
 * Responses: { success: true, data } on success; { error, code } on failure
 * (CARD_VALIDATION 400, ITEM_NOT_FOUND 404, CARD_NOT_FOUND 404, FORBIDDEN 403, SERVER_ERROR 500).
 *
 * The handlers are built by createItemCardHandlers(db) so a test can inject a fake database; the exported
 * handlers are bound to the shared Prisma client.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  CARD_EDIT_SELECT,
  CardDb,
  applyPrintingTx,
  cardValidationBody,
  isCardNotFoundError,
  isCardValidationError,
  upsertItemCardTx,
} from '../services/cardRecordService';

/** Database surface used here: the card writer's surface plus the item ownership lookup. */
export interface ItemCardDb extends CardDb {
  item: { findUnique(args: any): Promise<any> };
  organizer: { findFirst(args: any): Promise<any> };
  $transaction<T>(fn: (tx: ItemCardDb) => Promise<T>): Promise<T>;
}

interface OwnedItem {
  id: string;
  organizerId: string | null;
}

function isOrganizer(req: AuthRequest): boolean {
  return !!req.user && (!!req.user.roles?.includes('ORGANIZER') || req.user.role === 'ORGANIZER');
}

function validItemId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

export function createItemCardHandlers(db: ItemCardDb) {
  /** The item when the caller owns it (sale organizer, or the denormalized organizer of an inventory item), else null. */
  async function resolveOwnedItem(userId: string, itemId: string): Promise<OwnedItem | null> {
    const item = await db.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        organizerId: true,
        saleId: true,
        sale: { select: { organizerId: true, organizer: { select: { userId: true } } } },
      },
    });
    if (!item) return null;

    let owned = !!item.sale && item.sale.organizer?.userId === userId;
    if (!owned && !item.saleId && item.organizerId) {
      const inventoryOrganizer = await db.organizer.findFirst({
        where: { id: item.organizerId, userId },
        select: { id: true },
      });
      owned = !!inventoryOrganizer;
    }
    if (!owned) return null;
    return { id: item.id, organizerId: item.organizerId ?? item.sale?.organizerId ?? null };
  }

  function fail(res: Response, err: unknown, what: string) {
    if (isCardValidationError(err)) return res.status(400).json({ ...cardValidationBody(err), success: false });
    if (isCardNotFoundError(err)) return res.status(404).json({ error: err.message, code: 'CARD_NOT_FOUND' });
    console.error(`[itemCard] ${what} failed:`, err);
    return res.status(500).json({ error: 'Server error while saving the card.', code: 'SERVER_ERROR' });
  }

  async function guard(req: AuthRequest, res: Response): Promise<OwnedItem | null> {
    if (!isOrganizer(req)) {
      res.status(403).json({ error: 'Organizer access required.', code: 'FORBIDDEN' });
      return null;
    }
    const itemId = req.params.itemId;
    if (!validItemId(itemId)) {
      res.status(404).json({ error: 'Item not found.', code: 'ITEM_NOT_FOUND' });
      return null;
    }
    const owned = await resolveOwnedItem(req.user.id, itemId);
    if (!owned) {
      res.status(404).json({ error: 'Item not found.', code: 'ITEM_NOT_FOUND' });
      return null;
    }
    return owned;
  }

  const getItemCard = async (req: AuthRequest, res: Response) => {
    try {
      const owned = await guard(req, res);
      if (!owned) return;
      const card = await db.itemCard.findUnique({ where: { itemId: owned.id }, select: CARD_EDIT_SELECT });
      return res.json({ success: true, data: card ?? null });
    } catch (err) {
      return fail(res, err, 'read');
    }
  };

  const putItemCard = async (req: AuthRequest, res: Response) => {
    try {
      const owned = await guard(req, res);
      if (!owned) return;
      const card = await db.$transaction((tx) =>
        upsertItemCardTx(tx, { itemId: owned.id, organizerId: owned.organizerId }, req.body)
      );
      return res.json({ success: true, data: card });
    } catch (err) {
      return fail(res, err, 'save');
    }
  };

  const applyItemCardPrinting = async (req: AuthRequest, res: Response) => {
    try {
      const owned = await guard(req, res);
      if (!owned) return;
      const card = await db.$transaction((tx) =>
        applyPrintingTx(tx, { itemId: owned.id, organizerId: owned.organizerId }, req.body)
      );
      return res.json({ success: true, data: card });
    } catch (err) {
      return fail(res, err, 'apply-printing');
    }
  };

  return { getItemCard, putItemCard, applyItemCardPrinting };
}

// Bound to the shared Prisma client. The cast is one-way: ItemCardDb is a structural subset of what
// the client offers, with loosely typed args.
const handlers = createItemCardHandlers(prisma as unknown as ItemCardDb);
export const getItemCard = handlers.getItemCard;
export const putItemCard = handlers.putItemCard;
export const applyItemCardPrinting = handlers.applyItemCardPrinting;
