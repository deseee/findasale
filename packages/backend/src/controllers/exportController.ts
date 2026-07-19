import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getWatermarkedUrl, getWatermarkedUrlWithQR } from '../utils/cloudinaryWatermark';
import { canRemoveWatermark } from '../utils/watermarkPolicy';
import archiver from 'archiver';
import ExcelJS from 'exceljs';
import { checkExportRateLimit, formatNextExportDate } from '../services/exportRateLimitService';

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

    // Platform Safety #99: Check export rate limit (PRO/TEAMS organizers are exempt — Patrick request 2026-07-14)
    const isProOrTeamsExport = req.user?.effectiveTier === 'PRO' || req.user?.effectiveTier === 'TEAMS';
    if (!isProOrTeamsExport) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastExportAt: true }
      });

      if (user) {
        const { allowed, nextExportDate } = await checkExportRateLimit(userId, user.lastExportAt);
        if (!allowed && nextExportDate) {
          res.status(429).json({
            message: `Export limit: 1 per month. Your next export is available on ${formatNextExportDate(nextExportDate)}.`
          });
          return;
        }
      }
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
            qrEmbedEnabled: true,
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
    const rows = sale.items.map((item) => {
      let photoUrl = '';
      if (item.photoUrls && item.photoUrls.length > 0) {
        const rawUrl = item.photoUrls[0];
        photoUrl = canRemoveWatermark(sale.organizer)
          ? rawUrl
          : getWatermarkedUrlWithQR(rawUrl, item.id, item.qrEmbedEnabled);
      }
      return [
        escapeCSV(item.title),
        mapCategory(item.category),
        item.price ? item.price.toFixed(2) : '',
        escapeCSV(truncate(item.description, 500)),
        item.condition || '',
        photoUrl,
        item.shippingAvailable ? 'Yes' : 'No',
        item.shippingPrice ? item.shippingPrice.toFixed(2) : '',
      ];
    });

    // Combine headers and rows into CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    // Set response headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sale-${saleId}-estatesales.csv"`);

    // Platform Safety #99: Update lastExportAt timestamp
    await prisma.user.update({
      where: { id: userId },
      data: { lastExportAt: new Date() }
    });

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

    // Platform Safety #99: Check export rate limit (PRO/TEAMS organizers are exempt — Patrick request 2026-07-14)
    const isProOrTeamsExport = req.user?.effectiveTier === 'PRO' || req.user?.effectiveTier === 'TEAMS';
    if (!isProOrTeamsExport) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastExportAt: true }
      });

      if (user) {
        const { allowed, nextExportDate } = await checkExportRateLimit(userId, user.lastExportAt);
        if (!allowed && nextExportDate) {
          res.status(429).json({
            message: `Export limit: 1 per month. Your next export is available on ${formatNextExportDate(nextExportDate)}.`
          });
          return;
        }
      }
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
            qrEmbedEnabled: true,
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
        images: (item.photoUrls || []).map((url, imgIndex) => {
          const photoUrl = canRemoveWatermark(sale.organizer)
            ? url
            : getWatermarkedUrlWithQR(url, item.id, item.qrEmbedEnabled);
          return {
            url: photoUrl,
            isPrimary: imgIndex === 0,
          };
        }),
        shipping: {
          available: item.shippingAvailable,
          ...(item.shippingPrice && { price: item.shippingPrice }),
        },
      })),
    };

    // Platform Safety #99: Update lastExportAt timestamp
    await prisma.user.update({
      where: { id: userId },
      data: { lastExportAt: new Date() }
    });

    // Stamp fbExportedAt on all exported items
    const jsonExportedItemIds = sale.items.map((item: any) => item.id);
    await prisma.item.updateMany({
      where: { id: { in: jsonExportedItemIds } },
      data: { fbExportedAt: new Date() }
    });

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

    // Platform Safety #99: Check export rate limit (PRO/TEAMS organizers are exempt — Patrick request 2026-07-14)
    const isProOrTeamsExport = req.user?.effectiveTier === 'PRO' || req.user?.effectiveTier === 'TEAMS';
    if (!isProOrTeamsExport) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastExportAt: true }
      });

      if (user) {
        const { allowed, nextExportDate } = await checkExportRateLimit(userId, user.lastExportAt);
        if (!allowed && nextExportDate) {
          res.status(429).json({
            message: `Export limit: 1 per month. Your next export is available on ${formatNextExportDate(nextExportDate)}.`
          });
          return;
        }
      }
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
            qrEmbedEnabled: true,
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
        const rawUrl = item.photoUrls[0];
        const photoUrl = canRemoveWatermark(sale.organizer)
          ? rawUrl
          : getWatermarkedUrlWithQR(rawUrl, item.id, item.qrEmbedEnabled);
        lines.push(photoUrl);
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

    // Platform Safety #99: Update lastExportAt timestamp
    await prisma.user.update({
      where: { id: userId },
      data: { lastExportAt: new Date() }
    });

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

    // Platform Safety #99: Check export rate limit (PRO/TEAMS organizers are exempt — Patrick request 2026-07-14)
    const isProOrTeamsExport = req.user?.effectiveTier === 'PRO' || req.user?.effectiveTier === 'TEAMS';
    if (!isProOrTeamsExport) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastExportAt: true }
      });

      if (user) {
        const { allowed, nextExportDate } = await checkExportRateLimit(userId, user.lastExportAt);
        if (!allowed && nextExportDate) {
          res.status(429).json({
            message: `Export limit: 1 per month. Your next export is available on ${formatNextExportDate(nextExportDate)}.`
          });
          return;
        }
      }
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
    const itemsRows = items.map((item: any) => {
      // Gate watermarks on item photos
      const photoUrls = item.photoUrls && item.photoUrls.length > 0
        ? item.photoUrls.map((url: string) =>
            canRemoveWatermark(organizer) ? url : getWatermarkedUrlWithQR(url, item.id)
          )
        : [];
      return [
        escapeCSV(item.id),
        escapeCSV(item.saleId ?? ''),
        escapeCSV(item.title),
        escapeCSV(item.description),
        item.price ? item.price.toFixed(2) : '',
        escapeCSV(item.status),
        escapeCSV(item.category),
        escapeCSV(item.condition),
        item.tags && item.tags.length > 0 ? escapeCSV(item.tags.join(';')) : '',
        photoUrls.length > 0 ? escapeCSV(photoUrls.join(';')) : '',
        item.createdAt ? formatDateISO(item.createdAt) : '',
      ];
    });
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

    // Platform Safety #99: Update lastExportAt timestamp
    await prisma.user.update({
      where: { id: userId },
      data: { lastExportAt: new Date() }
    });

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

/**
 * Map FindA.Sale item condition to Facebook Marketplace condition string
 */
function mapConditionForFacebook(condition: string | null | undefined): string {
  switch (condition) {
    case 'NEW':
      return 'New';
    case 'REFURBISHED':
      return 'Used - Like New';
    case 'PARTS_OR_REPAIR':
      return 'Used - Fair';
    case 'USED':
    default:
      return 'Used - Good';
  }
}

/**
 * Export sale items as XLSX for Facebook Marketplace bulk upload
 * GET /api/export/:saleId/facebook-xlsx
 */
export const exportFacebookXLSX = async (
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

    // Platform Safety #99: Check export rate limit (PRO/TEAMS organizers are exempt — Patrick request 2026-07-14)
    const isProOrTeamsExport = req.user?.effectiveTier === 'PRO' || req.user?.effectiveTier === 'TEAMS';
    if (!isProOrTeamsExport) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastExportAt: true }
      });

      if (user) {
        const { allowed, nextExportDate } = await checkExportRateLimit(userId, user.lastExportAt);
        if (!allowed && nextExportDate) {
          res.status(429).json({
            message: `Export limit: 1 per month. Your next export is available on ${formatNextExportDate(nextExportDate)}.`
          });
          return;
        }
      }
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
            qrEmbedEnabled: true,
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

    // Facebook limit: 50 items max
    const FACEBOOK_ITEM_LIMIT = 50;
    const truncated = sale.items.length > FACEBOOK_ITEM_LIMIT;
    const itemsToExport = sale.items.slice(0, FACEBOOK_ITEM_LIMIT);

    // Build worksheet data following Facebook's official bulk upload template layout
    // Row 1: Title row
    // Row 2: Instructions
    // Row 3: Column descriptions (REQUIRED/OPTIONAL hints)
    // Row 4: Column headers
    // Row 5+: Item data rows
    const wsData: (string | number)[][] = [
      ['Facebook Marketplace Bulk Upload Template', '', '', '', ''],
      [
        'You can create up to 50 listings at once. When you are finished, be sure to save or export this as an XLS/XLSX file.',
        '', '', '', ''
      ],
      ['REQUIRED', 'REQUIRED', 'REQUIRED', 'OPTIONAL', 'OPTIONAL'],
      ['TITLE', 'PRICE', 'CONDITION', 'DESCRIPTION', 'CATEGORY'],
    ];

    // Add item rows
    for (const item of itemsToExport) {
      const title = truncate(item.title, 150);
      const price = item.price ? Math.round(Number(item.price)) : 0;
      const condition = mapConditionForFacebook(item.condition);
      const listingUrl = `https://finda.sale/sales/${saleId}`;
      const descBase = truncate(item.description, 4950); // reserve room for appended URL
      const description = descBase
        ? `${descBase}\n\nView full listing: ${listingUrl}`
        : `View full listing: ${listingUrl}`;
      const category = item.category || '';

      wsData.push([title, price, condition, description, category]);
    }

    // Note: truncation is communicated via the API response header, not in the file.
    // Adding a note row would cause Facebook to reject the spreadsheet as having too many items.

    // Build workbook using exceljs (xlsx/SheetJS removed — GHSA prototype-pollution/ReDoS advisories, no npm-level fix)
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Listings');
    for (const row of wsData) {
      worksheet.addRow(row);
    }

    const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="facebook-marketplace-${saleId}.xlsx"`
    );

    // Platform Safety #99: Update lastExportAt timestamp
    await prisma.user.update({
      where: { id: userId },
      data: { lastExportAt: new Date() }
    });

    // Stamp fbExportedAt on all exported items
    const exportedItemIds = itemsToExport.map((item: any) => item.id);
    await prisma.item.updateMany({
      where: { id: { in: exportedItemIds } },
      data: { fbExportedAt: new Date() }
    });

    res.status(200).send(xlsxBuffer);
  } catch (error) {
    console.error('exportFacebookXLSX error:', error);
    res.status(500).json({ message: 'Export failed' });
  }
};


/**
 * Strip HTML tags from a string
 */
function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

/**
 * Map FindA.Sale item condition to Facebook Commerce Manager catalog condition enum
 * FB accepted values: new, refurbished, used_like_new, used_good, used_fair, used_poor
 */
function mapConditionForCommerceManager(condition: string | null | undefined): string {
  switch (condition) {
    case 'NEW':
      return 'new';
    case 'REFURBISHED':
      return 'used_like_new';
    case 'USED':
      return 'used_good';
    case 'PARTS_OR_REPAIR':
      return 'used_fair';
    default:
      return 'used';
  }
}

/**
 * Escape a field value for RFC 4180 CSV (quote if contains comma, double-quote, or newline)
 * Does NOT apply formula-injection prefix — Commerce Manager feed is machine-read, not spreadsheet.
 */
function escapeCommerceFeedCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Public endpoint: Export sale items as a Facebook Commerce Manager CSV data feed
 * GET /api/sales/:saleId/export/commerce-feed
 *
 * No auth required — Facebook's crawler has no session token.
 * Returns text/csv with one row per item that has at least one photo.
 * Sold items are included as "out of stock" so FB can de-list them from the catalog.
 */
export const exportCommerceManagerFeed = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { saleId } = req.params;

    // Fetch sale and all its items (no auth filter — public crawlable feed)
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        items: {
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            condition: true,
            brand: true,
            photoUrls: true,
            status: true,
            stockTotal: true,
            stockSold: true,
          },
        },
      },
    });

    if (!sale) {
      res.status(404).json({ message: 'Sale not found' });
      return;
    }

    // Only include items that have at least one photo (image_link is required by FB)
    const feedItems = (sale.items ?? []).filter(
      (item) => item.photoUrls && item.photoUrls.length > 0
    );

    // CSV headers — official FB Commerce Manager catalog column names
    const headers = [
      'id',
      'title',
      'description',
      'availability',
      'condition',
      'price',
      'link',
      'image_link',
      'additional_image_link',
      'brand',
      'quantity_to_sell_on_facebook',
      'google_product_category',
    ];

    const rows: string[] = [headers.join(',')];

    for (const item of feedItems) {
      const availability = item.status === 'SOLD' ? 'out of stock' : 'in stock';
      const condition = mapConditionForCommerceManager(item.condition);
      const price = item.price != null ? `${Number(item.price).toFixed(2)} USD` : '0.00 USD';
      const link = `https://finda.sale/items/${item.id}`;

      // photoUrls[0] is image_link; remaining (up to 19 more) are additional_image_link
      const [primaryPhoto, ...extraPhotos] = item.photoUrls;
      const additionalPhotos = extraPhotos.slice(0, 19).join('|');

      const brand = item.brand?.trim() || '';
      // google_product_category: no static category→Google/FB taxonomy mapping exists yet.
      // Left blank rather than a fabricated taxonomy ID (CLAUDE.md placeholder-value ban).
      // Follow-up: build a real category→taxonomy-ID mapping table (out of scope here).
      const googleProductCategory = '';

      const title = escapeCommerceFeedCSV(stripHtml(item.title));
      const description = escapeCommerceFeedCSV(
        truncate(stripHtml(item.description), 9999)
      );

      const remainingStock = Math.max((item.stockTotal ?? 1) - item.stockSold, 0);
      const quantity = item.status === 'SOLD' ? '0' : String(remainingStock);

      const row = [
        escapeCommerceFeedCSV(item.id),
        title,
        description,
        escapeCommerceFeedCSV(availability),
        escapeCommerceFeedCSV(condition),
        escapeCommerceFeedCSV(price),
        escapeCommerceFeedCSV(link),
        escapeCommerceFeedCSV(primaryPhoto),
        escapeCommerceFeedCSV(additionalPhotos),
        escapeCommerceFeedCSV(brand),
        escapeCommerceFeedCSV(quantity),
        escapeCommerceFeedCSV(googleProductCategory),
      ].join(',');

      rows.push(row);
    }

    const csvContent = rows.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="commerce-feed-${saleId}.csv"`
    );
    // Allow FB's crawler to cache for up to 1 hour
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.status(200).send(csvContent);
  } catch (error) {
    console.error('exportCommerceManagerFeed error:', error);
    res.status(500).json({ message: 'Feed generation failed' });
  }
};


/**
 * Public endpoint: Export ALL items across an organizer's active sales as a
 * Facebook Commerce Manager CSV data feed.
 * GET /api/organizers/:organizerId/export/commerce-feed
 *
 * No auth required — Facebook's crawler has no session token.
 * Aggregates items across all non-draft, non-archived sales for the organizer.
 * Organizers should register THIS URL (not per-sale URLs) with Commerce Manager
 * for a stable feed that persists across sale lifecycle changes.
 */
export const exportOrganizerCommerceManagerFeed = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { organizerId } = req.params;

    // Fetch all items from active sales for this organizer
    const items = await prisma.item.findMany({
      where: {
        sale: {
          organizerId,
          status: { notIn: ['DRAFT', 'ARCHIVED'] },
          deletedAt: null,
        },
        deletedAt: null,
        photoUrls: { isEmpty: false },
      },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        condition: true,
        brand: true,
        photoUrls: true,
        status: true,
        saleId: true,
        stockTotal: true,
        stockSold: true,
      },
    });

    // CSV headers — official FB Commerce Manager catalog column names
    const headers = [
      'id',
      'title',
      'description',
      'availability',
      'condition',
      'price',
      'link',
      'image_link',
      'additional_image_link',
      'brand',
      'quantity_to_sell_on_facebook',
      'google_product_category',
    ];

    const rows: string[] = [headers.join(',')];

    for (const item of items) {
      const availability = item.status === 'SOLD' ? 'out of stock' : 'in stock';
      const condition = mapConditionForCommerceManager(item.condition);
      const price = item.price != null ? `${Number(item.price).toFixed(2)} USD` : '0.00 USD';
      const link = `https://finda.sale/items/${item.id}`;

      const [primaryPhoto, ...extraPhotos] = item.photoUrls;
      const additionalPhotos = extraPhotos.slice(0, 19).join('|');

      const brand = item.brand?.trim() || '';
      // google_product_category: no static category→Google/FB taxonomy mapping exists yet.
      // Left blank rather than a fabricated taxonomy ID (CLAUDE.md placeholder-value ban).
      // Follow-up: build a real category→taxonomy-ID mapping table (out of scope here).
      const googleProductCategory = '';
      const remainingStock = Math.max((item.stockTotal ?? 1) - item.stockSold, 0);
      const quantity = item.status === 'SOLD' ? '0' : String(remainingStock);

      const title = escapeCommerceFeedCSV(stripHtml(item.title));
      const description = escapeCommerceFeedCSV(
        truncate(stripHtml(item.description), 9999)
      );

      const row = [
        escapeCommerceFeedCSV(item.id),
        title,
        description,
        escapeCommerceFeedCSV(availability),
        escapeCommerceFeedCSV(condition),
        escapeCommerceFeedCSV(price),
        escapeCommerceFeedCSV(link),
        escapeCommerceFeedCSV(primaryPhoto),
        escapeCommerceFeedCSV(additionalPhotos),
        escapeCommerceFeedCSV(brand),
        escapeCommerceFeedCSV(quantity),
        escapeCommerceFeedCSV(googleProductCategory),
      ].join(',');

      rows.push(row);
    }

    const csvContent = rows.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="commerce-feed-organizer-${organizerId}.csv"`
    );
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.status(200).send(csvContent);
  } catch (error) {
    console.error('exportOrganizerCommerceManagerFeed error:', error);
    res.status(500).json({ message: 'Feed generation failed' });
  }
};
