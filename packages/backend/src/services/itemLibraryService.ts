import { prisma } from '../lib/prisma';

export interface LibraryFilters {
  search?: string;
  category?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: string;
}

/**
 * Add an item to the organizer's library.
 * Sets inLibrary=true and captures current values.
 */
export const addToLibrary = async (itemId: string, organizerId: string) => {
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
      inLibrary: true,
      libraryId: itemId, // Use item ID as library reference (can be normalized later)
    },
  });
};

/**
 * Remove an item from the organizer's library.
 * Sets inLibrary=false.
 */
export const removeFromLibrary = async (itemId: string) => {
  return prisma.item.update({
    where: { id: itemId },
    data: {
      inLibrary: false,
      libraryId: null,
    },
  });
};

/**
 * Pull an item from the library into a new sale.
 * Creates a copy of the library item with new saleId and optional price override.
 * Sets libraryId on the new item to link back to the library item.
 * Records price in ItemPriceHistory with changedBy='library_pulled'.
 */
export const pullFromLibrary = async (
  libraryItemId: string,
  saleId: string,
  organizerId: string,
  priceOverride?: number
) => {
  // Verify library item exists and is in library
  const libraryItem = await prisma.item.findUnique({
    where: { id: libraryItemId },
  });

  if (!libraryItem || !libraryItem.inLibrary) {
    throw new Error('Library item not found or not in library');
  }

  // Verify ownership
  if (libraryItem.organizerId !== organizerId) {
    throw new Error('Unauthorized: library item does not belong to this organizer');
  }

  // Verify sale exists and belongs to organizer
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { organizerId: true },
  });

  if (!sale || sale.organizerId !== organizerId) {
    throw new Error('Unauthorized: sale does not belong to this organizer');
  }

  // Create new item in the sale (copy from library item)
  const newItem = await prisma.item.create({
    data: {
      title: libraryItem.title,
      description: libraryItem.description,
      category: libraryItem.category,
      condition: libraryItem.condition,
      photoUrls: libraryItem.photoUrls,
      tags: libraryItem.tags,
      saleId,
      organizerId,
      libraryId: libraryItemId, // Link back to library item
      inLibrary: false, // New item is not in library, it's in a sale
      price: priceOverride ?? libraryItem.price,
      status: 'AVAILABLE',
      isActive: true,
    },
  });

  // Record price in history with library_pulled reason
  if (newItem.price) {
    await prisma.itemPriceHistory.create({
      data: {
        itemId: newItem.id,
        price: newItem.price,
        changedBy: 'library_pulled',
        note: `Pulled from library item ${libraryItemId}`,
      },
    });
  }

  // Update library item to mark it as in a sale
  await prisma.item.update({
    where: { id: libraryItemId },
    data: {
      // libraryId remains the same, but status can be updated if needed
    },
  });

  return newItem;
};

/**
 * Get all library items for an organizer with optional filters.
 */
export const getLibraryItems = async (organizerId: string, filters: LibraryFilters = {}) => {
  const where: any = {
    organizerId,
    inLibrary: true,
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
