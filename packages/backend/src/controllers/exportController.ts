import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getWatermarkedUrl } from '../utils/cloudinaryWatermark';
import archiver from 'archiver';

/**
 * Category mapping from FindA.Sale to EstateSales.NET format
 */
const CATEGORY_MAP: Record<string, string> = {
  furniture: 'Furniture',
  decor: 'Home Décor',
  vintage: 'Vintage & Collectibles',
  textiles: 'Clothing & Textiles',
  collectibles: 'Collectibles',
  art: 'Art & Antiques',
  antiques: 'Art & Antiques',
  jewelry: 'Jewelry & Watches',
  books: 'Books',
  tools: 'Tools & Hardware',
  electronics: 'Electronics',
  clothing: 'Clothing & Textiles',
  home: 'Home & Garden',
};

/**
 * Map FindA.Sale category to EstateSales.NET category
 */
function mapCategory(category: string | null | undefined): string {
  if (!category) return 'Other';
  const mapped = CATEGORY_MAP[category.toLowerCase()];
  return mapped || 'Other';
}

/**
 * Escape CSV field values
 */
function escapeCSV(value: string | null | undefined): string {
  if (!value) return '';
  const str = String(value);
  // Neutralize CSV formula injection: prefix =,+,-,@ with a single quote so
  // Excel/Sheets treats the cell as text, not an executable formula.
  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * Truncate text to a maximum length
 */
function truncate(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/**
 * Format date in MM/DD/YYYY format
 */
function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Export sale items as CSV for EstateSales.NET
 * GET /api/export/:saleId/estatesales-csv
 */
export const exportEstatesalesCSV = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    // Fetch sale with organizer and published items
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: true,
        items: {
          where: { draftStatus: 'PUBLISHED' },
          select: {
            id: true,
            title: true,
            price: true,
            description: true,
            category: true,
            condition: true,
            photoUrls: true,
            shippingAvailable: true,
            shippingPrice: true,
          },
        },
      },
    });

    // Verify sale exists
    if (!sale) {
      res.status(400).json({ message: 'Sale not found' });
      return;
    }

    // Verify organizer ownership
    if (sale.organizer.userId !== userId) {
      res.status(403).json({ message: 'Not authorized' });
      return;
    }

    // Verify published items exist
    if (!sale.items || sale.items.length === 0) {
      res.status(400).json({ message: 'No published items to export' });
      return;
    }

    // Build CSV headers
    const headers = [
      'Title',
      'Category',
      'Price',
      'Description',
      'Condition',
      'Photo URL',
      'Shipping Available',
      'Shipping Price',
    ];

    // Build CSV rows
    const rows = sale.items.map((item) => [
      escapeCSV(item.title),
      mapCategory(item.category),
      item.price ? item.price.toFixed(2) : '',
      escapeCSV(truncate(item.description, 500)),
      item.condition || '',
      item.photoUrls && item.photoUrls.length > 0
        ? getWatermarkedUrl(item.photoUrls[0])
        : '',
      item.shippingAvailable ? 'Yes' : 'No',
      item.shippingPrice ? item.shippingPrice.toFixed(2) : '',
    ]);

    // Combine headers and rows into CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    // Set response headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sale-${saleId}-estatesales.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('exportEstatesalesCSV error:', error);
    res.status(500).json({ message: 'Export failed' });
  }
};

/**
 * Export sale items as JSON for Facebook Marketplace
 * GET /api/export/:saleId/facebook-json
 */
export const exportFacebookJSON = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    // Fetch sale with organizer and published items
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: true,
        items: {
          where: { draftStatus: 'PUBLISHED' },
          select: {
            id: true,
            title: true,
            price: true,
            description: true,
            category: true,
            condition: true,
            photoUrls: true,
            shippingAvailable: true,
            shippingPrice: true,
          },
        },
      },
    });

    // Verify sale exists
    if (!sale) {
      res.status(400).json({ message: 'Sale not found' });
      return;
    }

    // Verify organizer ownership
    if (sale.organizer.userId !== userId) {
      res.status(403).json({ message: 'Not authorized' });
      return;
    }

    // Verify published items exist
    if (!sale.items || sale.items.length === 0) {
      res.status(400).json({ message: 'No published items to export' });
      return;
    }

    // Build Facebook JSON export
    const facebookData = {
      sale: {
        title: sale.title,
        description: sale.description || '',
        address: sale.address || '',
        city: sale.city || '',
        saleUrl: `https://finda.sale/sales/${saleId}`,
      },
      items: sale.items.map((item, index) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        description: item.description || '',
        category: item.category || '',
        condition: item.condition || '',
        images: (item.photoUrls || []).map((url, imgIndex) => ({
          url: getWatermarkedUrl(url),
          isPrimary: imgIndex === 0,
        })),
        shipping: {
          available: item.shippingAvailable,
          ...(item.shippingPrice && { price: item.shippingPrice }),
        },
      })),
    };

    res.status(200).json(facebookData);
  } catch (error) {
    console.error('exportFacebookJSON error:', error);
    res.status(500).json({ message: 'Export failed' });
  }
};

/**
 * Export sale items as plain text for Craigslist
 * GET /api/export/:saleId/craigslist-text
 */
export const exportCraigslistText = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { saleId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    // Fetch sale with organizer and published items
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: {
          include: { user: { select: { email: true } } },
        },
        items: {
          where: { draftStatus: 'PUBLISHED' },
          select: {
            id: true,
            title: true,
            price: true,
            description: true,
            condition: true,
            photoUrls: true,
          },
        },
      },
    });

    // Verify sale exists
    if (!sale) {
      res.status(400).json({ message: 'Sale not found' });
      return;
    }

    // Verify organizer ownership
    if (sale.organizer.userId !== userId) {
      res.status(403).json({ message: 'Not authorized' });
      return;
    }

    // Verify published items exist
    if (!sale.items || sale.items.length === 0) {
      res.status(400).json({ message: 'No published items to export' });
      return;
    }

    // Build Craigslist text export
    const lines: string[] = [];

    lines.push('--- SALE DETAILS ---');
    lines.push(sale.title);
    lines.push(
      `When: ${formatDate(sale.startDate)} — ${formatDate(sale.endDate)}`
    );
    lines.push(
      `Where: ${sale.address}, ${sale.city}, ${sale.state || ''} ${sale.zip || ''}`.trim()
    );
    lines.push(`More Info: https://finda.sale/sales/${saleId}`);
    lines.push('');
    lines.push('--- ITEMS FOR SALE ---');
    lines.push('');

    // Add each item
    sale.items.forEach((item) => {
      lines.push(item.title);
      const priceStr = item.price ? `$${item.price.toFixed(2)}` : 'Contact for price';
      const conditionStr = item.condition ? ` — ${item.condition}` : '';
      lines.push(`${priceStr}${conditionStr}`);
      if (item.description) {
        lines.push(item.description);
      }
      if (item.photoUrls && item.photoUrls.length > 0) {
        lines.push(getWatermarkedUrl(item.photoUrls[0]));
      }
      lines.push('');
    });

    // Add contact info
    const contactParts = [sale.organizer.phone || ''];
    if ((sale.organizer as any).user?.email) {
      contactParts.push((sale.organizer as any).user.email);
    }
    lines.push('Contact: ' + contactParts.filter(Boolean).join(' | '));

    const textContent = lines.join('\n');

    // Set response headers
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="sale-${saleId}-craigslist.txt"`);
    res.status(200).send(textContent);
  } catch (error) {
    console.error('exportCraigslistText error:', error);
    res.status(500).json({ message: 'Export failed' });
  }
};

/**
 * Feature #66: Export all organizer data as ZIP with CSVs
 * GET /api/organizer/export
 *
 * Generates three CSV files:
 * - sales.csv: all organizer's sales
 * - items.csv: all items across organizer's sales
 * - purchases.csv: all purchases on organizer's items
 *
 * Returns as a ZIP download with filename: findasale-export-{YYYY-MM-DD}.zip
 */
export const exportOrganizer = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    // Fetch organizer profile
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      res.status(404).json({ message: 'Organizer profile not found' });
      return;
    }

    // Fetch all organizer's sales
    const sales = await prisma.sale.findMany({
      where: { organizerId: organizer.id },
      take: 5000,
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        status: true,
        city: true,
        state: true,
        address: true,
        description: true,
        _count: { select: { items: true } },
      },
    });

    // Fetch all items across organizer's sales
    const items = await prisma.item.findMany({
      where: {
        sale: { organizerId: organizer.id },
      },
      take: 5000,
      select: {
        id: true,
        saleId: true,
        title: true,
        description: true,
        price: true,
        status: true,
        category: true,
        condition: true,
        tags: true,
        photoUrls: true,
        createdAt: true,
      },
    });

    // Fetch all purchases on organizer's items
    const purchases = await prisma.purchase.findMany({
      where: {
        item: { sale: { organizerId: organizer.id } },
      },
      take: 5000,
      select: {
        id: true,
        itemId: true,
        amount: true,
        platformFeeAmount: true,
        status: true,
        createdAt: true,
        item: { select: { title: true, saleId: true } },
      },
    });

    // Build sales.csv
    const salesHeaders = [
      'id',
      'title',
      'startDate',
      'endDate',
      'status',
      'city',
      'state',
      'address',
      'totalItems',
      'description',
    ];
    const salesRows = sales.map((sale: any) => [
      escapeCSV(sale.id),
      escapeCSV(sale.title),
      sale.startDate ? formatDateISO(sale.startDate) : '',
      sale.endDate ? formatDateISO(sale.endDate) : '',
      escapeCSV(sale.status),
      escapeCSV(sale.city),
      escapeCSV(sale.state),
      escapeCSV(sale.address),
      sale._count?.items || 0,
      escapeCSV(sale.description),
    ]);
    const salesCSV = [
      salesHeaders.join(','),
      ...salesRows.map((row) => row.join(',')),
    ].join('\n');

    // Build items.csv
    const itemsHeaders = [
      'id',
      'saleId',
      'title',
      'description',
      'price',
      'status',
      'category',
      'condition',
      'tags',
      'photoUrls',
      'createdAt',
    ];
    const itemsRows = items.map((item: any) => [
      escapeCSV(item.id),
      escapeCSV(item.saleId),
      escapeCSV(item.title),
      escapeCSV(item.description),
      item.price ? item.price.toFixed(2) : '',
      escapeCSV(item.status),
      escapeCSV(item.category),
      escapeCSV(item.condition),
      item.tags && item.tags.length > 0 ? escapeCSV(item.tags.join(';')) : '',
      item.photoUrls && item.photoUrls.length > 0
        ? escapeCSV(item.photoUrls.join(';'))
        : '',
      item.createdAt ? formatDateISO(item.createdAt) : '',
    ]);
    const itemsCSV = [
      itemsHeaders.join(','),
      ...itemsRows.map((row) => row.join(',')),
    ].join('\n');

    // Build purchases.csv
    const purchasesHeaders = [
      'id',
      'itemId',
      'itemTitle',
      'saleId',
      'amount',
      'platformFee',
      'status',
      'createdAt',
    ];
    const purchasesRows = purchases.map((purchase: any) => [
      escapeCSV(purchase.id),
      escapeCSV(purchase.itemId || ''),
      escapeCSV(purchase.item?.title || ''),
      escapeCSV(purchase.item?.saleId || ''),
      purchase.amount ? purchase.amount.toFixed(2) : '',
      purchase.platformFeeAmount ? purchase.platformFeeAmount.toFixed(2) : '',
      escapeCSV(purchase.status),
      purchase.createdAt ? formatDateISO(purchase.createdAt) : '',
    ]);
    const purchasesCSV = [
      purchasesHeaders.join(','),
      ...purchasesRows.map((row) => row.join(',')),
    ].join('\n');

    // Create ZIP archive and stream to response
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Set response headers
    const exportDate = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="findasale-export-${exportDate}.zip"`
    );

    // Pipe archive to response
    archive.pipe(res);

    // Add CSV files to archive
    archive.append(salesCSV, { name: 'sales.csv' });
    archive.append(itemsCSV, { name: 'items.csv' });
    archive.append(purchasesCSV, { name: 'purchases.csv' });

    // Finalize archive
    await archive.finalize();
  } catch (error) {
    console.error('exportOrganizer error:', error);
    res.status(500).json({ message: 'Export failed' });
  }
};

/**
 * Format date to ISO string (YYYY-MM-DD HH:MM:SS UTC)
 */
function formatDateISO(date: Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}
