// Feature #89: Unified Print Kit
// GET /api/organizer/sales/:saleId/print-kit
// Returns PDF with yard sign QR code (page 1) + item barcode sticker sheet (pages 2+)

import { Response } from 'express';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// Avery 5160 label dimensions: 1" × 2.625"
const STICKER_W = 189; // 2.625 inches @ 72 dpi
const STICKER_H = 72;  // 1 inch @ 72 dpi
const MARGIN = 12;
const COLS = 3;        // 3 columns per page
const ROWS = 4;        // 4 rows per page (12 stickers per page)

// Letter page dimensions
const PAGE_W = 612;    // 8.5 inches @ 72 dpi
const PAGE_H = 792;    // 11 inches @ 72 dpi
const PAGE_MARGIN = 36; // 0.5 inch margins

/**
 * GET /api/organizer/sales/:saleId/print-kit
 * Generates a combined PDF with:
 * - Page 1: Yard sign QR code (4-5 inches, centered)
 * - Pages 2+: Item barcode sticker sheet (3 cols × 4 rows per page)
 *
 * Auth: Organizer must own the sale
 */
export const getPrintKit = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;

    // Fetch sale with organizer and items
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: { select: { userId: true } },
        items: {
          select: { id: true, title: true, price: true },
          orderBy: { title: 'asc' },
        },
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found.' });
    }

    // Auth check: verify organizer owns this sale
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    // Generate QR code for yard sign
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const saleUrl = `${frontendUrl}/sales/${saleId}?utm_source=qr_print&utm_medium=print&utm_campaign=${saleId}`;

    const qrBuffer = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 400,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // Lazy-load PDFDocument to avoid server crashes before rebuild
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    // Create PDF document with LETTER size
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: 0,
      autoFirstPage: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="print-kit-${saleId}.pdf"`);
    doc.pipe(res);

    // ── PAGE 1: Yard Sign QR Code ──────────────────────────────
    const qrSize = 360; // 5 inches @ 72 dpi
    const qrX = (PAGE_W - qrSize) / 2;
    const qrY = (PAGE_H - qrSize) / 2;

    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    // Add sale title below QR
    doc
      .fontSize(16)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(sale.title, PAGE_MARGIN, qrY + qrSize + 20, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(10)
      .fillColor('#666666')
      .font('Helvetica')
      .text('Scan to browse & buy online', PAGE_MARGIN, doc.y + 8, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    // ── PAGES 2+: Item Stickers (Avery 5160 grid) ──────────────
    const items = sale.items;
    let itemIndex = 0;

    while (itemIndex < items.length) {
      doc.addPage();

      // Draw grid of stickers on this page
      for (let row = 0; row < ROWS && itemIndex < items.length; row++) {
        for (let col = 0; col < COLS && itemIndex < items.length; col++) {
          const item = items[itemIndex++];

          // Calculate sticker position
          const x = PAGE_MARGIN + col * STICKER_W;
          const y = PAGE_MARGIN + row * STICKER_H;

          drawSticker(doc, item, x, y);
        }
      }
    }

    doc.end();
  } catch (error) {
    console.error('getPrintKit error:', error);
    res.status(500).json({ message: 'Failed to generate print kit.' });
  }
};

/**
 * Draw a single item sticker at position (x, y)
 * Format: item title + price + barcode (Code128-style ID)
 */
function drawSticker(
  doc: any,
  item: { id: string; title: string; price: number | null },
  x: number,
  y: number,
) {
  const stickerX = x + MARGIN;
  const stickerY = y + MARGIN;
  const contentW = STICKER_W - MARGIN * 2;

  // Item title (bold, truncated)
  doc
    .fontSize(9)
    .fillColor('#111111')
    .font('Helvetica-Bold')
    .text(item.title, stickerX, stickerY, {
      width: contentW,
      height: 24,
      align: 'left',
      ellipsis: true,
    });

  // Price
  const priceText = item.price != null ? `$${item.price.toFixed(2)}` : 'N/A';
  doc
    .fontSize(11)
    .fillColor(item.price != null ? '#16a34a' : '#999999')
    .font('Helvetica-Bold')
    .text(priceText, stickerX, doc.y - 2, { width: contentW, align: 'left' });

  // Item ID as barcode text (Code128-style, monospace font)
  doc
    .fontSize(7)
    .fillColor('#555555')
    .font('Courier')
    .text(`ID: ${item.id}`, stickerX, doc.y - 2, { width: contentW, align: 'left' });

  // Border around sticker
  doc
    .rect(x, y, STICKER_W, STICKER_H)
    .lineWidth(0.5)
    .stroke('#e5e5e5');
}
