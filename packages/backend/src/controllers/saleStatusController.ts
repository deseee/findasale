/**
 * GET /api/sales/:id/status (Feature #14, optionalAuthenticate) (2026-10-13, security).
 *
 * Used to return revenueToday, itemsSoldToday and activeHolds for ANY sale to anyone. Now:
 *  - the sale's organizer, its accepted workspace staff and admins get the full status (the organizer
 *    dashboard / command center SaleStatusWidget);
 *  - everyone else gets the public subset only (items remaining, public non-embargoed count), and only for
 *    a PUBLISHED or ENDED, not deleted sale; a draft / deleted / unknown sale is a 404.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getSaleStatus, toPublicSaleStatus } from '../services/saleStatusService';
import { canAccessOrganizerSales } from '../utils/saleStaffAccess';

export const getSaleStatusForViewer = async (req: AuthRequest, res: Response) => {
  try {
    const saleId = req.params.id;
    if (!saleId) {
      return res.status(400).json({ message: 'saleId is required' });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true, status: true, deletedAt: true },
    });
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const privileged = req.user ? await canAccessOrganizerSales(req.user, sale.organizerId) : false;
    if (!privileged && (sale.deletedAt || (sale.status !== 'PUBLISHED' && sale.status !== 'ENDED'))) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const status = await getSaleStatus(saleId);
    return res.json(privileged ? status : toPublicSaleStatus(status));
  } catch (error: any) {
    console.error('[sale-status] Error:', error);
    if (error?.message?.includes('not found')) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
};
