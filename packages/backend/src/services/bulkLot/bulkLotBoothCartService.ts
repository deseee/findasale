/**
 * bulkLotBoothCartService (ADR-136 Addendum B, roadmap #659): a bulk lot line in a multi-vendor hub cart.
 *
 * A hub cart reserves ordinary items by setting Item.status to RESERVED, which a lot cannot do (one Item row stands for
 * thousands of cards and many carts may take cards from it at once). A lot line is a BoothCartBulkLine row instead: N cards,
 * priced by the server when the line is added (price per 1,000 in cents and the rounded line total), for the booth that owns the
 * lot. The cards are taken from the lot when the line is added (the guarded stockSold increment a register sale uses) and handed
 * back when the line is removed or the cart is cancelled or abandoned. When the cart is captured the line becomes SOLD and the
 * cart controller writes the Purchase row (with bulkQuantity) for it in the same transaction; no second stock write is made,
 * the cards already left.
 *
 * Adding and removing lines run in ONE transaction together with the cart's own update (a compare-and-swap on status PENDING,
 * supplied by the caller). If checkout started in the meantime that update matches nothing, the caller throws, and the whole
 * transaction rolls back: no card is taken or returned under a cart that is no longer open.
 *
 * Money is the lot's line total only: the same pricing as the register, so a hub cart and the register always agree to the cent.
 * A client may send the total it showed (amount); a mismatch is PRICE_CHANGED and that line is refused.
 *
 * No Prisma client in this module: the database client is passed in.
 */
import { BulkLotDb, BulkLotErrorCode, SellUnitsInTx, bulkLotError, isBulkLotError, planBulkLine, releaseBulkLotUnits } from './bulkLotService';

export interface CartLotDb extends BulkLotDb {
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
  boothCartBulkLine: {
    create(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
    updateMany(args: any): Promise<{ count: number }>;
  };
}

export interface CartLotLineView {
  lineId: string;
  itemId: string;
  vendorBoothId: string;
  quantity: number;
  pricePerThousandCents: number;
  lineCents: number;
  status: string;
}

function toView(row: any): CartLotLineView {
  return {
    lineId: String(row.id),
    itemId: String(row.itemId),
    vendorBoothId: String(row.vendorBoothId),
    quantity: Number(row.quantity),
    pricePerThousandCents: Number(row.pricePerThousandCents),
    lineCents: Number(row.lineCents),
    status: String(row.status),
  };
}

export interface LotItemForCart {
  id: string;
  price: number | null;
  status: string;
  stockTotal: number | null;
  stockSold: number | null;
}

export interface CartLotRequest {
  item: LotItemForCart;
  vendorBoothId: string;
  quantity: unknown;
  /** Dollars the register showed for the line, or null. */
  amountDollars: number | null;
}

export interface CartLotRejection {
  itemId: string;
  code: BulkLotErrorCode | 'ITEM_NOT_AVAILABLE';
}

export interface ReserveResult {
  added: CartLotLineView[];
  rejected: CartLotRejection[];
}

/**
 * Prices and reserves N cards of each requested lot, in one transaction. A line that cannot be taken (not enough cards, price
 * changed, bad quantity) is rejected on its own; the others still go in. When at least one line was taken, `applyToCart` runs
 * inside the same transaction with the cents and booths added; it must update the cart (compare-and-swap on PENDING) and THROW
 * when the cart is no longer open, which rolls every line back.
 */
export async function reserveCartLotLines(
  db: CartLotDb,
  deps: { sell: SellUnitsInTx },
  args: { cartId: string; requests: ReadonlyArray<CartLotRequest> },
  applyToCart: (tx: any, added: { totalCents: number; vendorBoothIds: string[] }) => Promise<void>
): Promise<ReserveResult> {
  return db.$transaction(async (tx: any) => {
    const added: CartLotLineView[] = [];
    const rejected: CartLotRejection[] = [];
    for (const req of args.requests) {
      try {
        const plan = planBulkLine(req.item, req.quantity, req.amountDollars);
        await deps.sell(tx, req.item.id, plan.cards);
        const row = await tx.boothCartBulkLine.create({
          data: {
            boothCartTransactionId: args.cartId,
            itemId: req.item.id,
            vendorBoothId: req.vendorBoothId,
            quantity: plan.cards,
            pricePerThousandCents: plan.pricePerThousandCents,
            lineCents: plan.cents,
            status: 'RESERVED',
          },
        });
        added.push(toView(row));
      } catch (err) {
        // A refused line never touched the database (planBulkLine) or matched no row (the guarded increment), so the
        // transaction is still healthy. Anything else is a real failure and aborts the whole add.
        if (isBulkLotError(err)) rejected.push({ itemId: req.item.id, code: err.code });
        else if (err && (err as { name?: unknown }).name === 'InsufficientStockError') rejected.push({ itemId: req.item.id, code: 'INSUFFICIENT_STOCK' });
        else throw err;
      }
    }
    if (added.length > 0) {
      await applyToCart(tx, { totalCents: added.reduce((s, l) => s + l.lineCents, 0), vendorBoothIds: Array.from(new Set(added.map((l) => l.vendorBoothId))) });
    }
    return { added, rejected };
  });
}

/**
 * Removes one line (lineId) or every RESERVED line of a lot in the cart, in one transaction with the caller's cart update
 * (`applyToCart`, which must throw when the cart is no longer open). Returns the lines, cards and cents that went back.
 */
export async function removeCartLotLines(
  db: CartLotDb,
  args: { cartId: string; itemId: string; lineId?: string | null },
  applyToCart: (tx: any, removed: { cents: number; cards: number }) => Promise<void>
): Promise<{ lines: number; cards: number; cents: number }> {
  return db.$transaction(async (tx: any) => {
    const rows: any[] = await tx.boothCartBulkLine.findMany({
      where: { boothCartTransactionId: args.cartId, itemId: args.itemId, status: 'RESERVED', ...(args.lineId ? { id: args.lineId } : {}) },
    });
    let lines = 0;
    let cards = 0;
    let cents = 0;
    for (const row of rows) {
      const flip = await tx.boothCartBulkLine.updateMany({ where: { id: row.id, status: 'RESERVED' }, data: { status: 'RELEASED' } });
      if (flip.count !== 1) continue;
      await releaseBulkLotUnits(tx, row.itemId, Number(row.quantity));
      lines++;
      cards += Number(row.quantity);
      cents += Number(row.lineCents);
    }
    if (lines === 0) throw bulkLotError('BULK_NOT_FOUND', 404);
    await applyToCart(tx, { cents, cards });
    return { lines, cards, cents };
  });
}

/** CAS RESERVED to RELEASED and give the cards back, in one transaction. True when THIS call released the line. */
async function releaseOne(db: Pick<CartLotDb, '$transaction'>, line: { id: string; itemId: string; quantity: number }): Promise<boolean> {
  return db.$transaction(async (tx: any) => {
    const flip = await tx.boothCartBulkLine.updateMany({ where: { id: line.id, status: 'RESERVED' }, data: { status: 'RELEASED' } });
    if (flip.count !== 1) return false;
    await releaseBulkLotUnits(tx, line.itemId, line.quantity);
    return true;
  });
}

/** Cancelled or abandoned cart: every RESERVED line goes back. Returns the item ids whose card count changed. */
export async function releaseAllCartLotLines(db: CartLotDb, cartId: string): Promise<string[]> {
  const rows = await db.boothCartBulkLine.findMany({ where: { boothCartTransactionId: cartId, status: 'RESERVED' } });
  const changed: string[] = [];
  for (const row of rows) {
    try {
      if (await releaseOne(db, { id: row.id, itemId: row.itemId, quantity: Number(row.quantity) })) changed.push(String(row.itemId));
    } catch (err) {
      console.error(`[bulkLot] could not release hub cart line ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return changed;
}

/** RESERVED lines of a cart, optionally for one booth (the leg being priced or settled). */
export async function listCartLotLines(db: Pick<CartLotDb, 'boothCartBulkLine'>, cartId: string, vendorBoothId?: string): Promise<CartLotLineView[]> {
  const rows = await db.boothCartBulkLine.findMany({
    where: { boothCartTransactionId: cartId, status: 'RESERVED', ...(vendorBoothId ? { vendorBoothId } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toView);
}

/**
 * The cart was captured: in ONE transaction the line goes RESERVED to SOLD and the Purchase row is written for it, so a retried
 * finalize can never write a second Purchase for the same line (the second pass finds the line already SOLD and returns null).
 * `createPurchase` receives the transaction client and returns the new Purchase id. Returns the Purchase id, or null when the
 * line was no longer RESERVED.
 */
export async function settleCartLotLine(db: Pick<CartLotDb, '$transaction'>, lineId: string, createPurchase: (tx: any) => Promise<{ id: string }>): Promise<string | null> {
  return db.$transaction(async (tx: any) => {
    const flip = await tx.boothCartBulkLine.updateMany({ where: { id: lineId, status: 'RESERVED' }, data: { status: 'SOLD' } });
    if (flip.count !== 1) return null;
    const purchase = await createPurchase(tx);
    await tx.boothCartBulkLine.updateMany({ where: { id: lineId }, data: { purchaseId: purchase.id } });
    return purchase.id;
  });
}
