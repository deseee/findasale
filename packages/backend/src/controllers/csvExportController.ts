import { Request, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { generateCsvExport, generateCsvFilename } from '../services/exportService';

type ExportFormat = 'ebay' | 'amazon' | 'facebook';

/**
 * GET /api/organizer/export/csv?saleId=X&format=ebay|amazon|facebook
 *
 * Export inventory items for a sale in platform-specific CSV formats.
 * Requires: authenticated organizer (ORGANIZER role), PRO subscription tier
 */
export async function getCsvExportHandler(req: AuthRequest, res: Response) {
  try {
    // Auth check
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    // Get query parameters
    const { saleId, format } = req.query;

    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'saleId query parameter is required' });
    }

    if (!format || typeof format !== 'string' || !['ebay', 'amazon', 'facebook'].includes(format)) {
      return res.status(400).json({ message: 'format must be one of: ebay, amazon, facebook' });
    }

    // Fetch organizer
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true, subscriptionTier: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Tier check: PRO required
    const isPro = organizer.subscriptionTier === 'PRO' || organizer.subscriptionTier === 'TEAMS';
    if (!isPro) {
      return res.status(403).json({
        message: 'CSV export requires PRO or TEAMS subscription',
      });
    }

    // Fetch sale and verify ownership
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, title: true, organizerId: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'You do not have access to this sale' });
    }

    // Fetch all items for the sale (include all statuses for historical data)
    const items = await prisma.item.findMany({
      where: { saleId: sale.id },
      select: {
        id: true,
        title: true,
        sku: true,
        description: true,
        price: true,
        condition: true,
        category: true,
        shippingAvailable: true,
        shippingPrice: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Generate CSV
    const csvContent = generateCsvExport(items as any, format as ExportFormat);
    const filename = generateCsvFilename(sale.title, format as ExportFormat);

    // Return as file download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ message: 'Server error exporting CSV' });
  }
}
