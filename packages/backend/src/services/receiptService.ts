import { prisma } from '../lib/prisma';

interface ReceiptItem {
  itemTitle: string;
  photoUrl?: string;
  price: number;
}

export const generateReceipt = async (purchaseId: string): Promise<void> => {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        item: {
          select: {
            title: true,
            photoUrls: true,
            price: true,
          },
        },
        sale: {
          select: {
            id: true,
            title: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!purchase) {
      console.warn(`[receipt] Purchase not found: ${purchaseId}`);
      return;
    }

    // Check if receipt already exists
    const existingReceipt = await prisma.digitalReceipt.findUnique({
      where: { purchaseId },
    });

    if (existingReceipt) {
      console.warn(`[receipt] Receipt already exists for purchase ${purchaseId}`);
      return;
    }

    // Build items array for receipt
    const receiptItems: ReceiptItem[] = [];
    if (purchase.item) {
      receiptItems.push({
        itemTitle: purchase.item.title,
        photoUrl: purchase.item.photoUrls?.[0] || undefined,
        price: purchase.item.price || 0,
      });
    }

    // Create digital receipt
    await prisma.digitalReceipt.create({
      data: {
        purchaseId,
        items: receiptItems,
        total: purchase.amount,
      },
    });

    console.log(`[receipt] Generated receipt for purchase ${purchaseId}`);
  } catch (error) {
    console.error(`[receipt] Failed to generate receipt for purchase ${purchaseId}:`, error);
  }
};
