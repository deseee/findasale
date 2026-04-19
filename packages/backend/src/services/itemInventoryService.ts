import { prisma } from '../lib/prisma';

export interface InventoryFilters {
  search?: string;
  category?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: string;
}

/**
 * Add an item to the organizer's inventory.
 * Sets inInventory=true. saleId may be null for eBay-imported items.
 * Feature #300: removed saleId-based ownership check — items may have no saleId.
 */
export const addToInventory = async (itemId: string, organizerId: string) => {
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) throw new Error('Item not found');

  // Verify ownership directly on item (saleId may be null for eBay-imported items)
  if (item.organizerId !== organizerId) {
    // Fallback: check via sale if organizerId not denormalized
    if (item.saleId) {
      const sale = await prisma.sale.findUnique({
        where: { id: item.saleId },
        select: { organizerId: true },
      });
      if (!sale || sale.organizerId !== organizerId) {
        throw new Error('Unauthorized: item does not belong to this organizer');
      }
    } else {
      throw new Error('Unauthorized: item does not belong to this organizer');
    }
  }

  return prisma.item.update({
    where: { id: itemId },
    data: {
      inInventory: true,
      libraryId: itemId, // self-referential — deprecated, keep for backward compat
    },
  });
};

/**
 * Remove an item from the organizer's inventory.
 * Sets inInventory=false.
 */
export const removeFromInventory = async (itemId: string) => {
  return prisma.item.update({
    where: { id: itemId },
    data: {
      inInventory: false,
      libraryId: null,
    },
  });
};

/**
 * Pull an item from the inventory into a sale.
 * Feature #300: MOVE not COPY — updates saleId on existing item (no new record created).
 * One item record per physical object, forever.
 */
export const pullFromInventory = async (
  inventoryItemId: string,
  saleId: string,
  organizerId: string,
  priceOverride?: number
) => {
  const item = await prisma.item.findUnique({ where: { id: inventoryItemId } });

  if (!item || !item.inInventory) {
    throw new Error('Inventory item not found or not in inventory');
  }

  if (item.organizerId !== organizerId) {
    throw new Error('Unauthorized: inventory item does not belong to this organizer');
  }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { organizerId: true },
  });

  if (!sale || sale.organizerId !== organizerId) {
    throw new Error('Unauthorized: sale does not belong to this organizer');
  }

  // Dedup: item already pulled into this sale
  if (item.saleId === saleId) {
    throw new Error('This item has already been pulled into this sale');
  }

  // MOVE (update in place) — no copy created
  const movedItem = await prisma.item.update({
    where: { id: inventoryItemId },
    data: {
      saleId,
      inInventory: false,
      lastSaleId: item.saleId ?? (item as any).lastSaleId, // preserve history
      price: priceOverride ?? item.price,
      status: 'AVAILABLE',
    },
  });

  if (movedItem.price) {
    await prisma.itemPriceHistory.create({
      data: {
        itemId: movedItem.id,
        price: movedItem.price,
        changedBy: 'inventory_pulled',
        note: `Pulled to sale ${saleId}`,
      },
    });
  }

  return movedItem;
};

/**
 * Return items from an ENDED sale back to the organizer's inventory.
 * Feature #300: Sets saleId=null, inInventory=true, lastSaleId=oldSaleId.
 * Skips SOLD, DONATED, INVOICE_ISSUED items.
 * Cancels active reservations and notifies shoppers.
 * Clears waitlists.
 */
export const returnItemsToInventory = async (
  saleId: string,
  itemIds: string[],
  organizerId: string
) => {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { organizerId: true, status: true },
  });

  if (!sale || sale.organizerId !== organizerId) {
    throw new Error('Unauthorized');
  }

  if (sale.status !== 'ENDED') {
    throw new Error('Sale must be ENDED to return items to inventory');
  }

  const query =
    itemIds.length > 0
      ? { id: { in: itemIds }, saleId }
      : { saleId, status: { notIn: ['SOLD', 'DONATED'] as const } };

  const items = await prisma.item.findMany({ where: query });

  let returned = 0;
  const skipped: Array<{ id: string; title: string; reason: string }> = [];

  for (const item of items) {
    if (['SOLD', 'DONATED'].includes(item.status)) {
      skipped.push({ id: item.id, title: item.title, reason: item.status });
      continue;
    }
    if (item.status === 'INVOICE_ISSUED') {
      skipped.push({ id: item.id, title: item.title, reason: 'INVOICE_ISSUED' });
      continue;
    }

    // Cancel active reservation + notify shopper
    const reservation = await prisma.itemReservation.findUnique({
      where: { itemId: item.id },
    });
    if (
      reservation &&
      ['PENDING', 'CONFIRMED', 'HOLD_IN_CART'].includes(reservation.status)
    ) {
      await prisma.itemReservation.update({
        where: { id: reservation.id },
        data: { status: 'EXPIRED' },
      });
      await prisma.notification.create({
        data: {
          userId: reservation.userId,
          type: 'RESERVATION_CANCELLED',
          body: `A hold on "${item.title}" was released — the sale has ended.`,
        },
      });
    }

    // Clear waitlist
    await prisma.itemWaitlist.deleteMany({ where: { itemId: item.id } });

    // Return to inventory
    await prisma.item.update({
      where: { id: item.id },
      data: {
        inInventory: true,
        returnedToInventoryAt: new Date(),
        saleId: null,
        lastSaleId: item.saleId,
      },
    });

    await prisma.itemPriceHistory.create({
      data: {
        itemId: item.id,
        price: item.price ?? 0,
        changedBy: 'returned_from_sale',
        note: `Returned to inventory from sale ${saleId}`,
      },
    });

    returned++;
  }

  return { returned, skipped };
};

/**
 * Get all inventory items for an organizer with optional filters.
 */
export const getInventoryItems = async (organizerId: string, filters: InventoryFilters = {}) => {
  const where: any = {
    inInventory: true,
    OR: [
      { organizerId },
      { sale: { organizerId } },
    ],
  };

  if (filters.search) {
    where.title = { contains: filters.search, mode: 'insensitive' };
  }

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.condition) {
    where.condition = filters.condition;
  }

  if (filters.minPrice !== undefined) {
    where.price = { gte: filters.minPrice };
  }

  if (filters.maxPrice !== undefined) {
    if (where.price) {
      where.price.lte = filters.maxPrice;
    } else {
      where.price = { lte: filters.maxPrice };
    }
  }

  if (filters.status) {
    where.status = filters.status;
  }

  return prisma.item.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      priceHistory: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
};

/**
 * Get price history for an item.
 */
export const getPriceHistory = async (itemId: string) => {
  return prisma.itemPriceHistory.findMany({
    where: { itemId },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Get pricing suggestion for an item in a sale.
 * Returns suggested price based on similar items sold in same category.
 * For now, returns item.price ± 10% (ML stub for Phase 5).
 */
export const getPricingSuggestion = async (itemId: string, saleId: string) => {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    throw new Error('Item not found');
  }

  // Stub: return price ± 10%
  const basePrice = item.price || 0;
  const minPrice = basePrice * 0.9;
  const maxPrice = basePrice * 1.1;
  const suggested = basePrice;

  return { suggested, min: minPrice, max: maxPrice };
};
