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
) {
  const x = MARGIN;
  const y = doc.y;

  // Sale name (small, top)
  doc
    .fontSize(7)
    .fillColor('#666666')
    .text(saleTitle, x, y, { width: LABEL_W - MARGIN * 2, align: 'left' });

  // Item title
  doc
    .fontSize(14)
    .fillColor('#111111')
    .font('Helvetica-Bold')
    .text(item.title, x, doc.y + 4, { width: LABEL_W - MARGIN * 2 - 50, align: 'left' });

  // Price
  const priceText = item.price != null ? `$${item.price.toFixed(2)}` : 'Price on request';
  doc
    .fontSize(20)
    .fillColor(item.price != null ? '#16a34a' : '#999999')
    .text(priceText, x, doc.y + 8, { width: LABEL_W - MARGIN * 2 - 50, align: 'left' });

  // Category + condition chips
  const chips = [item.category, item.condition].filter(Boolean).join('  \u00b7  ');
  if (chips) {
    doc
      .fontSize(8)
      .fillColor('#555555')
      .font('Helvetica')
      .text(chips, x, doc.y + 6, { width: LABEL_W - MARGIN * 2 - 50 });
  }

  // Item ID (small, bottom-left — useful for checkout scanning)
  doc
    .fontSize(6)
    .fillColor('#aaaaaa')
    .font('Helvetica')
    .text(`ID: ${item.id}`, x, doc.y + 10, { width: LABEL_W - MARGIN * 2 - 50 });

  // QR code in bottom-right corner (40×40 pixels)
  const qrX = LABEL_W - MARGIN - 40;
  const qrY = y + LABEL_H - MARGIN - 40;
  doc.image(qrBuffer, qrX, qrY, { width: 40, height: 40 });

  // Border around label
  const labelH = doc.y - y + 12;
  doc
    .rect(0, y - 4, LABEL_W, Math.max(labelH, 50))
    .lineWidth(0.5)
    .stroke('#dddddd');
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

    const doc = new PDFDocument({ size: [LABEL_W, LABEL_H], margin: 0, autoFirstPage: false });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="labels-${saleId}.pdf"`);
    doc.pipe(res);

    for (let i = 0; i < sale.items.length; i++) {
      doc.addPage({ size: [LABEL_W, LABEL_H], margin: 0 });
      doc.moveDown(0.5);
      await drawLabel(doc, sale.items[i], sale.title, qrBuffers[i]);
    }

    doc.end();
  } catch (error) {
    console.error('getSaleLabels error:', error);
    res.status(500).json({ message: 'Failed to generate labels.' });
  }
};
