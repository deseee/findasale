// W2: Label printing — generates printer-ready PDF labels via pdfkit
// Single-item label: GET /api/items/:id/label
// All items in a sale:  GET /api/sales/:saleId/labels

import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const LABEL_W = 288; // 4 inches @ 72 dpi
const LABEL_H = 216; // 3 inches @ 72 dpi
const MARGIN  = 16;

async function drawLabel(
  doc: PDFKit.PDFDocument,
  item: { title: string; price: number | null; category: string | null; condition: string | null; id: string },
  saleTitle: string,
  qrBuffer: Buffer,
  xOffset: number = MARGIN,
  yOffset: number = MARGIN,
) {
  // Use absolute positioning for grid layout
  const startY = yOffset;
  const startX = xOffset;

  // Sale name (small, top)
  doc
    .fontSize(7)
    .fillColor('#666666')
    .font('Helvetica')
    .text(saleTitle, startX + 8, startY + 8, { width: LABEL_W - 16, align: 'left', lineBreak: false });

  // Item title
  doc
    .fontSize(14)
    .fillColor('#111111')
    .font('Helvetica-Bold')
    .text(item.title, startX + 8, startY + 24, { width: LABEL_W - 56, align: 'left', height: 32 });

  // Price
  const priceText = item.price != null ? `$${item.price.toFixed(2)}` : 'Price on request';
  doc
    .fontSize(20)
    .fillColor(item.price != null ? '#16a34a' : '#999999')
    .font('Helvetica-Bold')
    .text(priceText, startX + 8, startY + 60, { width: LABEL_W - 56, align: 'left', lineBreak: false });

  // Category + condition chips
  const chips = [item.category, item.condition].filter(Boolean).join('  \u00b7  ');
  if (chips) {
    doc
      .fontSize(8)
      .fillColor('#555555')
      .font('Helvetica')
      .text(chips, startX + 8, startY + 85, { width: LABEL_W - 56, align: 'left', lineBreak: false });
  }

  // Item ID (small, bottom-left)
  doc
    .fontSize(6)
    .fillColor('#aaaaaa')
    .font('Helvetica')
    .text(`ID: ${item.id}`, startX + 8, startY + LABEL_H - 24, { width: LABEL_W - 56, align: 'left', lineBreak: false });

  // QR code in bottom-right corner (48×48 pixels, within bounds)
  const qrSize = 48;
  const qrX = startX + LABEL_W - MARGIN - qrSize;
  const qrY = startY + LABEL_H - MARGIN - qrSize;
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

  // Light border around label cell
  doc
    .rect(startX, startY, LABEL_W, LABEL_H)
    .lineWidth(0.5)
    .stroke('#e0e0e0');
}

/**
 * GET /api/items/:id/label
 * Returns a single-item 4×3" PDF label with QR code. Auth required.
 */
export const getSingleItemLabel = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const item = await prisma.item.findUnique({
      where: { id },
      include: { sale: { select: { title: true, organizer: { select: { userId: true } } } } },
    });
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    // Only organizer who owns the sale
    if (item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your item.' });
    }

    // Generate QR code for item URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const itemUrl = `${frontendUrl}/items/${id}`;
    const qrBuffer = await QRCode.toBuffer(itemUrl, {
      type: 'png',
      width: 200,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    const doc = new PDFDocument({ size: [LABEL_W, LABEL_H], margin: 0, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="label-${id}.pdf"`);
    doc.pipe(res);

    doc.moveDown(0.5);
    await drawLabel(doc, item, item.sale.title, qrBuffer);

    doc.end();
  } catch (error) {
    console.error('getSingleItemLabel error:', error);
    res.status(500).json({ message: 'Failed to generate label.' });
  }
};

/**
 * GET /api/sales/:saleId/labels
 * Returns a multi-page PDF — one 4×3" label per item, each with QR code. Auth required.
 */
export const getSaleLabels = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: { select: { userId: true } },
        items: {
          where: { status: { not: 'SOLD' } },
          select: { id: true, title: true, price: true, category: true, condition: true },
          orderBy: { title: 'asc' },
        },
      },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }
    if (!sale.items.length) {
      return res.status(400).json({ message: 'No available items in this sale to label.' });
    }

    // Generate all QR codes upfront (avoid async issues in render loop)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const qrPromises = sale.items.map((item) =>
      QRCode.toBuffer(`${frontendUrl}/items/${item.id}`, {
        type: 'png',
        width: 200,
        margin: 1,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      }),
    );
    const qrBuffers = await Promise.all(qrPromises);

    const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: false });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="labels-${saleId}.pdf"`);
    doc.pipe(res);

    // 2×3 grid = 6 labels per page: 2 columns × 3 rows
    const PAGE_W = 612; // 8.5 inches
    const PAGE_H = 792; // 11 inches
    const COLS = 2;
    const ROWS = 3;
    const MARGIN_X = (PAGE_W - COLS * LABEL_W) / 2;  // 18pt
    const MARGIN_Y = (PAGE_H - ROWS * LABEL_H) / 2;  // 72pt

    for (let i = 0; i < sale.items.length; i++) {
      // Add new page every 6 items
      if (i % (COLS * ROWS) === 0) {
        doc.addPage({ size: 'LETTER', margin: 0 });
      }

      const gridIndex = i % (COLS * ROWS);
      const col = gridIndex % COLS;
      const row = Math.floor(gridIndex / COLS);
      const x = MARGIN_X + col * LABEL_W;
      const y = MARGIN_Y + row * LABEL_H;

      await drawLabel(doc, sale.items[i], sale.title, qrBuffers[i], x, y);

      // Add dashed cut lines between label cells
      // Vertical line between columns (if not the rightmost column)
      if (col === 0 && i < sale.items.length - 1) {
        const cutX = MARGIN_X + LABEL_W;
        const cutYStart = MARGIN_Y + row * LABEL_H;
        const cutYEnd = cutYStart + LABEL_H;
        doc
          .moveTo(cutX, cutYStart)
          .lineTo(cutX, cutYEnd)
          .lineWidth(0.5)
          .dash(3, { space: 2 })
          .stroke('#cccccc')
          .undash();
      }

      // Horizontal line between rows (if not the last row)
      if (row < ROWS - 1 && i < sale.items.length - 1) {
        const cutY = MARGIN_Y + (row + 1) * LABEL_H;
        const cutXStart = MARGIN_X;
        const cutXEnd = MARGIN_X + COLS * LABEL_W;
        doc
          .moveTo(cutXStart, cutY)
          .lineTo(cutXEnd, cutY)
          .lineWidth(0.5)
          .dash(3, { space: 2 })
          .stroke('#cccccc')
          .undash();
      }
    }

    doc.end();
  } catch (error) {
    console.error('getSaleLabels error:', error);
    res.status(500).json({ message: 'Failed to generate labels.' });
  }
};
