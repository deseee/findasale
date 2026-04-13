/**
 * Sale Status Service — Feature #14: Real-Time Status Updates
 *
 * Provides real-time counters for live organizer dashboards:
 * - Items sold today
 * - Active holds (pending reservations)
 * - Items remaining (available + reserved)
 * - Revenue today
 *
 * Emits SALE_STATUS_UPDATE socket events to sale room subscribers.
 */

import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';

export interface SaleStatus {
  saleId: string;
  itemsSoldToday: number;
  activeHolds: number;
  itemsRemaining: number;
  revenueToday: number; // in dollars
  timestamp: Date;
}

/**
 * Get current status counters for a sale
 */
export const getSaleStatus = async (saleId: string): Promise<SaleStatus> => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get sale details (needed to validate existence)
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, startDate: true, endDate: true },
    });

    if (!sale) {
      throw new Error(`Sale ${saleId} not found`);
    }

    // Items sold today — purchases with status PAID created since start of today
    const itemsSoldToday = await prisma.purchase.count({
      where: {
        saleId,
        status: 'PAID',
        createdAt: {
          gte: todayStart,
        },
      },
    });

    // Active holds — PENDING or CONFIRMED reservations that haven't expired
    const activeHolds = await prisma.itemReservation.count({
      where: {
        item: { saleId },
        status: { in: ['PENDING', 'CONFIRMED'] },
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    // Items remaining — AVAILABLE or RESERVED items
    const itemsRemaining = await prisma.item.count({
      where: {
        saleId,
        status: { in: ['AVAILABLE', 'RESERVED'] },
      },
    });

    // Revenue today — sum of paid purchases since start of today
    const revenueTodayResult = await prisma.purchase.aggregate({
      where: {
        saleId,
        status: 'PAID',
        createdAt: {
          gte: todayStart,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const revenueToday = (revenueTodayResult._sum.amount || 0);

    return {
      saleId,
      itemsSoldToday,
      activeHolds,
      itemsRemaining,
      revenueToday,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[saleStatus] Error getting sale status:', error);
    throw error;
  }
};

/**
 * Push sale status update to all subscribers in the sale room
 * Call this after hold/purchase events
 */
export const pushSaleStatus = async (io: Server, saleId: string): Promise<void> => {
  try {
    const status = await getSaleStatus(saleId);
    io.to(`sale:${saleId}`).emit('SALE_STATUS_UPDATE', status);
    console.log(
      `[saleStatus] Pushed update: ${status.itemsSoldToday} sold, ${status.activeHolds} holds, ${status.itemsRemaining} remaining, $${status.revenueToday.toFixed(2)} revenue`
    );
  } catch (error) {
    console.error('[saleStatus] Error pushing status:', error);
  }
};
