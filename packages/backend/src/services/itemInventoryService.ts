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
 * Sets inInventory=true and captures current values.
 */
export const addToInventory = async (itemId: string, organizerId: string) => {
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) throw new Error('Item not found');

  // Verify ownership
  const sale = await prisma.sale.findUnique({
    where: { id: item.saleId },
    select: { organizerId: true },
  });

  if (!sale || sale.organizerId !== organizerId) {
    throw new Error('Unauthorized: item does not belong to this organizer');
  }

  return prisma.item.update({
    where: { id: itemId },
    data: {
      inInventory: true,
      libraryId: itemId, // Use item ID as library reference (can be normalized later)
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
 * Pull an item from the inventory into a new sale.
 * Creates a copy of the inventory item with new saleId and optional price override.
 * Sets libraryId on the new item to link back to the inventory item.
 * Records price in ItemPriceHistory with changedBy='inventory_pulled'.
 */
export const pullFromInventory = async (
  inventoryItemId: string,
  saleId: string,
  organizerId: string,
  priceOverride?: number
) => {
  // Verify inventory item exists and is in inventory
  const inventoryItem = await prisma.item.findUnique({
    where: { id: inventoryItemId },
  });

  if (!inventoryItem || !inventoryItem.inInventory) {
    throw new Error('Inventory item not found or not in inventory');
  }

  // Verify ownership
  if (inventoryItem.organizerId !== organizerId) {
    throw new Error('Unauthorized: inventory item does not belong to this organizer');
  }

  // Verify sale exists and belongs to organizer
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { organizerId: true },
  });

  if (!sale || sale.organizerId !== organizerId) {
    throw new Error('Unauthorized: sale does not belong to this organizer');
  }

  // Deduplication check: block if this inventory item is already in the target sale
  const existing = await prisma.item.findFirst({
    where: { saleId, libraryId: inventoryItemId, inInventory: false },
    select: { id: true },
  });
  if (existing) {
    throw new Error('This item has already been pulled into this sale');
  }

  // Create new item in the sale (copy from inventory item)
  const newItem = await prisma.item.create({
    data: {
      title: inventoryItem.title,
      description: inventoryItem.description,
      category: inventoryItem.category,
      // Infer condition from conditionGrade if not explicitly set (eBay-imported items)
      condition: inventoryItem.condition ?? (
        inventoryItem.conditionGrade === 'S' ? 'NEW' :
        inventoryItem.conditionGrade === 'D' ? 'PARTS_OR_REPAIR' :
        inventoryItem.conditionGrade ? 'USED' :
        null
      ),
      conditionGrade: inventoryItem.conditionGrade,
      photoUrls: inventoryItem.photoUrls,
      tags: inventoryItem.tags,
      saleId,
      organizerId,
      libraryId: inventoryItemId, // Link back to inventory item
      inInventory: false, // New item is not in inventory, it's in a sale
      price: priceOverride ?? inventoryItem.price,
      status: 'AVAILABLE',
      isActive: true,
      embedding: [], // required field — populated later by search indexer
    },
  });

  // Record price in history with inventory_pulled reason
  if (newItem.price) {
    await prisma.itemPriceHistory.create({
      data: {
        itemId: newItem.id,
        price: newItem.price,
        changedBy: 'inventory_pulled',
        note: `Pulled from inventory item ${inventoryItemId}`,
      },
    });
  }

  // Update inventory item to mark it as in a sale
  await prisma.item.update({
    where: { id: inventoryItemId },
    data: {
      // libraryId remains the same, but status can be updated if needed
    },
  });

  return newItem;
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
