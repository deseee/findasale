import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const requestReturn = async (
  purchaseId: string,
  reason: string,
  userId: string
): Promise<{ id: number; status: string; requestedAt: Date } | null> => {
  try {
    // Verify purchase belongs to user
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        sale: {
          select: {
            id: true,
            endDate: true,
            returnWindowHours: true,
          },
        },
      },
    });

    if (!purchase) {
      console.warn(`[return] Purchase not found: ${purchaseId}`);
      return null;
    }

    if (purchase.userId !== userId) {
      console.warn(`[return] User ${userId} does not own purchase ${purchaseId}`);
      return null;
    }

    // Check if return window is still open
    if (purchase.sale) {
      const returnWindowHours = purchase.sale.returnWindowHours || 48; // default 48 hours
      const saleEndTime = new Date(purchase.sale.endDate);
      const returnDeadline = new Date(saleEndTime.getTime() + returnWindowHours * 60 * 60 * 1000);

      if (new Date() > returnDeadline) {
        console.warn(`[return] Return window closed for purchase ${purchaseId}`);
        return null;
      }
    }

    // Check if return request already exists
    const existingReturn = await prisma.returnRequest.findFirst({
      where: {
        purchaseId,
        status: 'PENDING',
      },
    });

    if (existingReturn) {
      console.warn(`[return] Pending return request already exists for purchase ${purchaseId}`);
      return null;
    }

    // Create return request
    const returnRequest = await prisma.returnRequest.create({
      data: {
        purchaseId,
        reason,
      },
    });

    console.log(`[return] Created return request ${returnRequest.id} for purchase ${purchaseId}`);

    return {
      id: returnRequest.id,
      status: returnRequest.status,
      requestedAt: returnRequest.requestedAt,
    };
  } catch (error) {
    console.error(`[return] Failed to request return for purchase ${purchaseId}:`, error);
    return null;
  }
};

export const resolveReturn = async (
  returnRequestId: number,
  status: 'APPROVED' | 'DENIED',
  organizerId: string
): Promise<boolean> => {
  try {
    // Verify organizer owns the sale
    const returnRequest = await prisma.returnRequest.findUnique({
      where: { id: returnRequestId },
      include: {
        purchase: {
          select: {
            saleId: true,
            sale: {
              select: {
                organizerId: true,
              },
            },
          },
        },
      },
    });

    if (!returnRequest) {
      console.warn(`[return] Return request not found: ${returnRequestId}`);
      return false;
    }

    if (returnRequest.purchase.sale?.organizerId !== organizerId) {
      console.warn(`[return] Organizer ${organizerId} does not own the sale for return request ${returnRequestId}`);
      return false;
    }

    // Update return request status
    await prisma.returnRequest.update({
      where: { id: returnRequestId },
      data: {
        status,
        resolvedAt: new Date(),
      },
    });

    console.log(`[return] Resolved return request ${returnRequestId} with status ${status}`);
    return true;
  } catch (error) {
    console.error(`[return] Failed to resolve return request ${returnRequestId}:`, error);
    return false;
  }
};
