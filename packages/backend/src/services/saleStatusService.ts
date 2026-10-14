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
import { publicItemWhere } from '../lib/publicSaleGate';

export interface SaleStatus {
  saleId: string;
  itemsSoldToday: number;
  activeHolds: number;
  itemsRemaining: number;
  revenueToday: number; // in dollars
  timestamp: Date;
}

/**
 * Public view of a sale's status (2026-10-13, security). Revenue, sold counts and hold counts are the
 * organizer's business data: only the sale's organizer, its workspace staff and admins receive them
 * (GET /api/sales/:id/status gates with canAccessOrganizerSales; the socket push goes to the private
 * sale-status:<id> room). Everyone else gets only the public, non-embargoed items-remaining count.
 */
export interface PublicSaleStatus {
  saleId: string;
  itemsRemaining: number;
  timestamp: Date;
}

export const toPublicSaleStatus = (status: SaleStatus): PublicSaleStatus => ({
  saleId: status.saleId,
  itemsRemaining: status.itemsRemaining,
  timestamp: status.timestamp,
});

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
    // isTestTransaction exclusion (2026-08-29): test-transaction rows must never count as a real sale here
    const itemsSoldToday = await prisma.purchase.count({
      where: {
        saleId,
        status: 'PAID',
        isTestTransaction: false,
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

    // Items remaining — AVAILABLE or RESERVED items that shoppers can actually see.
    // 2026-10-13 (security): GET /api/sales/:id/status is public, so this count must not reveal
    // draft / hidden / consignor-tag items or items still inside an early-access window.
    const itemsRemaining = await prisma.item.count({
      where: {
        saleId,
        AND: [{ status: { in: ['AVAILABLE', 'RESERVED'] } }, publicItemWhere(now)],
      },
    });

    // Revenue today — sum of paid purchases since start of today
    // isTestTransaction exclusion (2026-08-29): test-transaction rows must never count as a real sale here
    const revenueTodayResult = await prisma.purchase.aggregate({
      where: {
        saleId,
        status: 'PAID',
        isTestTransaction: false,
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
    // 2026-10-13 (security): revenue and hold counts go to the private sale-status:<id> room
    // (organizer / staff / admin, see lib/socket canJoinPrivateSaleRoom), never to the public
    // sale:<id> room that anonymous shoppers join for the live feed.
    io.to(`sale-status:${saleId}`).emit('SALE_STATUS_UPDATE', status);
    console.log(
      `[saleStatus] Pushed update: ${status.itemsSoldToday} sold, ${status.activeHolds} holds, ${status.itemsRemaining} remaining, $${status.revenueToday.toFixed(2)} revenue`
    );
  } catch (error) {
    console.error('[saleStatus] Error pushing status:', error);
  }
};
