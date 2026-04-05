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
const ROWS = 10;       // 10 rows per page (30 stickers per page)

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

    // Lazy-load PDFDocument to avoid server crashes before rebuild
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const items = sale.items;

    // Pre-generate all item QR codes
    const itemQrBuffers: Buffer[] = [];
    for (const item of items) {
      const itemUrl = `${frontendUrl}/items/${item.id}`;
      itemQrBuffers.push(
        await QRCode.toBuffer(itemUrl, {
          type: 'png',
          width: 150,
          margin: 1,
          color: { dark: '#1a1a2e', light: '#ffffff' },
        })
      );
    }

    // Create PDF document with LETTER size
    // Page starts here — no cover page. autoFirstPage: true creates page 1
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 0,
      autoFirstPage: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="print-kit-${saleId}.pdf"`);
    doc.pipe(res);

    // ── PAGES: Item Stickers (Avery 5160 grid) ──────────────
    // Avery 5160 spec: 3 cols × 10 rows = 30 stickers per page
    const STICKER_W = 189;  // 2.625 inches
    const STICKER_H = 72;   // 1 inch
    const COLS_STICKER = 3;
    const ROWS_STICKER = 10;
    const LEFT_MARGIN = 13;
    const TOP_MARGIN = 36;
    const QR_SIZE = 48;

    // For each item (index i):
    for (let i = 0; i < items.length; i++) {
      // Add page only when i > 0 && i % 30 === 0 (page 2+)
      if (i > 0 && i % (COLS_STICKER * ROWS_STICKER) === 0) {
        doc.addPage({ size: 'LETTER', margin: 0 });
      }

      const col = i % COLS_STICKER;
      const row = Math.floor((i % (COLS_STICKER * ROWS_STICKER)) / COLS_STICKER);
      const sX = LEFT_MARGIN + col * STICKER_W;
      const sY = TOP_MARGIN + row * STICKER_H;
      const item = items[i];

      // Item title (truncate to ~30 chars)
      const titleText = (item.title || '').slice(0, 32);
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#1a1a2e')
        .text(titleText, sX + 8, sY + 6, { width: 129, lineBreak: false });

      // Price
      const priceText = item.price != null ? `$${item.price.toFixed(2)}` : 'N/A';
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#16a34a')
        .text(priceText, sX + 8, sY + 20, { width: 100, lineBreak: false });

      // Item ID
      doc
        .font('Helvetica')
        .fontSize(5)
        .fillColor('#999999')
        .text(item.id, sX + 8, sY + 46, { width: 129, lineBreak: false });

      // QR — right side, vertically centered
      doc.image(itemQrBuffers[i], sX + 137, sY + 12, { width: QR_SIZE, height: QR_SIZE });
    }

    doc.end();
  } catch (error) {
    console.error('getPrintKit error:', error);
    res.status(500).json({ message: 'Failed to generate print kit.' });
  }
};

/**
 * GET /api/organizer/sales/:saleId/signs/yard
 * Improved yard sign: Large QR (5 inches), sale title, date range, address
 * Single page, centered, letter size.
 */
export const getYardSignKit = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: { select: { userId: true } } },
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const saleUrl = `${frontendUrl}/sales/${saleId}?utm_source=qr_yard_sign`;

    const qrBuffer = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 500,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({ size: 'LETTER', margins: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="yard-sign-${saleId}.pdf"`);
    doc.pipe(res);

    const qrSize = 360; // 5 inches
    const qrX = (PAGE_W - qrSize) / 2;
    const qrY = 80;

    // Title
    doc
      .fontSize(24)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(sale.title, PAGE_MARGIN, 20, { width: PAGE_W - PAGE_MARGIN * 2, align: 'center' });

    // QR Code
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    // Date range
    const startDate = new Date(sale.startDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const endDate = new Date(sale.endDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    doc
      .fontSize(16)
      .fillColor('#666666')
      .font('Helvetica-Bold')
      .text(`${startDate} – ${endDate}`, PAGE_MARGIN, qrY + qrSize + 20, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    // Address
    doc
      .fontSize(12)
      .fillColor('#333333')
      .font('Helvetica')
      .text(`${sale.address}`, PAGE_MARGIN, doc.y + 8, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(11)
      .text(`${sale.city}, ${sale.state} ${sale.zip}`, PAGE_MARGIN, doc.y + 2, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    // Footer
    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('Scan to browse & buy online', PAGE_MARGIN, doc.y + 12, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc.end();
  } catch (error) {
    console.error('getYardSignKit error:', error);
    res.status(500).json({ message: 'Failed to generate yard sign.' });
  }
};

/**
 * GET /api/organizer/sales/:saleId/signs/directional
 * Half-page landscape (5.5"×8.5") with arrow + "Estate Sale →" text + QR
 * Two per page (or one if only one sign needed).
 */
export const getDirectionalSignKit = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: { select: { userId: true } } },
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const saleUrl = `${frontendUrl}/sales/${saleId}?utm_source=qr_directional_sign`;

    const qrBuffer = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 500,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    // Landscape Letter: 792×612 pts, 2 signs per page
    const doc = new PDFDocument({ size: [792, 612], margins: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="directional-signs-${saleId}.pdf"`);
    doc.pipe(res);

    // Draw two directional signs per page (top and bottom)
    for (let i = 0; i < 2; i++) {
      const yOffset = i * 306; // 612 / 2 = 306 per sign

      // Border
      doc
        .rect(2, yOffset + 2, 788, 302)
        .lineWidth(2)
        .stroke('#cccccc');

      // Arrow — right-pointing for sign 1 (i=0), left-pointing for sign 2 (i=1)
      const ax = 20;
      const ay = yOffset + 80;
      if (i === 0) {
        // Right-pointing arrow (LEFT third)
        doc
          .polygon(
            [ax, ay + 75],              // left-top
            [ax + 90, ay],              // right-top point
            [ax + 90, ay + 40],         // step in
            [ax + 140, ay + 40],        // arrow shaft top-right
            [ax + 140, ay + 110],       // arrow shaft bottom-right
            [ax + 90, ay + 110],        // step out
            [ax + 90, ay + 150],        // right-bottom point
          )
          .fill('#16a34a');
      } else {
        // Left-pointing arrow (tip on LEFT, shaft on RIGHT)
        doc
          .polygon(
            [ax + 140, ay + 75],        // right-center (tail right edge)
            [ax + 50, ay],              // upper-right of arrowhead
            [ax + 50, ay + 40],         // notch into shaft
            [ax, ay + 40],              // shaft top-left
            [ax, ay + 110],             // shaft bottom-left
            [ax + 50, ay + 110],        // notch out of shaft
            [ax + 50, ay + 150],        // lower-right of arrowhead
          )
          .fill('#16a34a');
      }

      // Sale name (middle section)
      doc
        .font('Helvetica-Bold')
        .fontSize(28)
        .fillColor('#1a1a2e')
        .text(sale.title, 180, yOffset + 50, { width: 250, lineBreak: false });

      // "This Way" subtext
      doc
        .font('Helvetica')
        .fontSize(14)
        .fillColor('#666666')
        .text('This Way', 180, yOffset + 140, { width: 250, lineBreak: false });

      // Address line (if available)
      if (sale.address) {
        doc
          .font('Helvetica')
          .fontSize(11)
          .fillColor('#999999')
          .text(sale.address, 180, yOffset + 165, { width: 250, lineBreak: false });
      }

      // QR code — top right, 150×150
      doc.image(qrBuffer, 630, yOffset + 30, { width: 150, height: 150 });
    }

    doc.end();
  } catch (error) {
    console.error('getDirectionalSignKit error:', error);
    res.status(500).json({ message: 'Failed to generate directional signs.' });
  }
};

/**
 * GET /api/organizer/sales/:saleId/signs/table-tent
 * 4"×6" folded tent card, landscape. Front: sale name + date/time + QR. Back: FindA.Sale URL.
 * Two per page.
 */
export const getTableTentKit = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: { select: { userId: true } } },
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const saleUrl = `${frontendUrl}/sales/${saleId}?utm_source=qr_table_tent`;

    const qrBuffer = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 500,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    // Portrait Letter = 612×792 pts
    const doc = new PDFDocument({ size: 'LETTER', margins: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="table-tents-${saleId}.pdf"`);
    doc.pipe(res);

    const PANEL_W = 306;  // each half
    const TENT_H = 396;

    const startDate = new Date(sale.startDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const endDate = new Date(sale.endDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    // Draw two tents per page (tent 1: y=0..396, tent 2: y=396..792)
    for (let i = 0; i < 2; i++) {
      const yOffset = i * 396;

      // LEFT PANEL (front — customer sees this)
      // Border
      doc
        .rect(0, yOffset, PANEL_W, TENT_H)
        .lineWidth(1.5)
        .stroke('#cccccc');

      // Sale title
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor('#1a1a2e')
        .text(sale.title, 12, yOffset + 20, { width: 282, lineBreak: false });

      // Date range
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#666666')
        .text(`${startDate} – ${endDate}`, 12, yOffset + 90, { width: 282, lineBreak: false });

      // QR code — centered in left panel, 200×200, x=(306-200)/2=53
      doc.image(qrBuffer, 53, yOffset + 160, { width: 200, height: 200 });

      // RIGHT PANEL (back)
      // Border
      doc
        .rect(PANEL_W, yOffset, PANEL_W, TENT_H)
        .lineWidth(1.5)
        .stroke('#cccccc');

      // Fold line (dashed vertical)
      doc
        .moveTo(PANEL_W, yOffset)
        .lineTo(PANEL_W, yOffset + TENT_H)
        .dash(4, { space: 4 })
        .lineWidth(1)
        .stroke('#aaaaaa')
        .undash();

      // finda.sale
      doc
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor('#16a34a')
        .text('finda.sale', PANEL_W + 18, yOffset + 20, { width: 270, align: 'center', lineBreak: false });

      // Tagline
      doc
        .font('Helvetica')
        .fontSize(14)
        .fillColor('#1a1a2e')
        .text('Browse items before you arrive.', PANEL_W + 18, yOffset + 70, { width: 270, align: 'center', lineBreak: false });

      // Small instruction
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#999999')
        .text('Scan QR code on the left to view online.', PANEL_W + 18, yOffset + 180, { width: 270, align: 'center', lineBreak: false });
    }

    doc.end();
  } catch (error) {
    console.error('getTableTentKit error:', error);
    res.status(500).json({ message: 'Failed to generate table tents.' });
  }
};

/**
 * GET /api/organizer/sales/:saleId/signs/hang-tag
 * 3"×2" hang tags, 4×2 grid (8 per page). Each tag: sale name (small) + QR.
 * Perforated-style dashed border.
 */
export const getHangTagKit = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: { select: { userId: true } } },
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const saleUrl = `${frontendUrl}/sales/${saleId}?utm_source=qr_hang_tag`;

    const qrBuffer = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 400,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({ size: 'LETTER', margins: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="hang-tags-${saleId}.pdf"`);
    doc.pipe(res);

    // Hang tags: 4 cols × 3 rows = 12 tags per page
    const TAG_W = 140;
    const TAG_H = 220;
    const COLS = 4;
    const ROWS = 3;
    const MARGIN_X = (612 - COLS * TAG_W) / 2;  // = 26
    const MARGIN_Y = (792 - ROWS * TAG_H) / 2;  // = 66
    const QR_SIZE = 110;

    // For each tag at (col, row):
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const tagX = MARGIN_X + col * TAG_W;
        const tagY = MARGIN_Y + row * TAG_H;

        // Dashed perforated border
        doc
          .rect(tagX, tagY, TAG_W, TAG_H)
          .dash(2, { space: 2 })
          .lineWidth(1)
          .stroke('#cccccc')
          .undash();

        // Hole punch circle at top center
        doc
          .circle(tagX + TAG_W / 2, tagY + 12, 6)
          .lineWidth(1)
          .stroke('#999999');

        // Sale name (below hole punch)
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#1a1a2e')
          .text(sale.title, tagX + 5, tagY + 26, { width: TAG_W - 10, align: 'center', lineBreak: false });

        // QR code — centered horizontally, filling most of the tag
        const qrX = tagX + (TAG_W - QR_SIZE) / 2;  // = tagX + 15
        const qrY = tagY + 45;
        doc.image(qrBuffer, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

        // finda.sale (bottom)
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#999999')
          .text('finda.sale', tagX + 5, tagY + TAG_H - 16, { width: TAG_W - 10, align: 'center', lineBreak: false });
      }
    }

    doc.end();
  } catch (error) {
    console.error('getHangTagKit error:', error);
    res.status(500).json({ message: 'Failed to generate hang tags.' });
  }
};

/**
 * GET /api/organizer/sales/:saleId/signs/full-kit
 * Combined multi-section PDF: page 1 = yard sign, page 2 = directional signs,
 * page 3 = table tents, page 4 = hang tags. All in one download.
 */
export const getFullSignKitPDF = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: { select: { userId: true } } },
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const saleUrl = `${frontendUrl}/sales/${saleId}?utm_source=qr_full_kit`;

    // Generate all QR codes upfront
    const qrYardSign = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 500,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    const qrDirectional = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 300,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    const qrTableTent = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 250,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    const qrHangTag = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 150,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({ size: 'LETTER', margins: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="full-sign-kit-${saleId}.pdf"`);
    doc.pipe(res);

    const startDate = new Date(sale.startDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const endDate = new Date(sale.endDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    // PAGE 1: Yard Sign
    const qrSize = 360;
    const qrX = (PAGE_W - qrSize) / 2;
    const qrY = 80;

    doc
      .fontSize(24)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(sale.title, PAGE_MARGIN, 20, { width: PAGE_W - PAGE_MARGIN * 2, align: 'center' });

    doc.image(qrYardSign, qrX, qrY, { width: qrSize, height: qrSize });

    doc
      .fontSize(16)
      .fillColor('#666666')
      .font('Helvetica-Bold')
      .text(`${startDate} – ${endDate}`, PAGE_MARGIN, qrY + qrSize + 20, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(12)
      .fillColor('#333333')
      .font('Helvetica')
      .text(`${sale.address}`, PAGE_MARGIN, doc.y + 8, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(11)
      .text(`${sale.city}, ${sale.state} ${sale.zip}`, PAGE_MARGIN, doc.y + 2, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('Scan to browse & buy online', PAGE_MARGIN, doc.y + 12, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    // PAGE 2: Directional Signs (landscape orientation, 2 per page)
    // Switch to landscape by creating a new page with custom size
    // Note: getFullSignKitPDF continues with portrait pages, so we add it before switching back
    doc.addPage({ size: [792, 612] });

    for (let i = 0; i < 2; i++) {
      const yOffset = i * 306;

      // Border
      doc
        .rect(2, yOffset + 2, 788, 302)
        .lineWidth(2)
        .stroke('#cccccc');

      // Arrow — filled right-pointing polygon (LEFT third)
      const ax = 20;
      const ay = yOffset + 80;
      doc
        .polygon(
          [ax, ay + 75],              // left-top
          [ax + 90, ay],              // right-top point
          [ax + 90, ay + 40],         // step in
          [ax + 140, ay + 40],        // arrow shaft top-right
          [ax + 140, ay + 110],       // arrow shaft bottom-right
          [ax + 90, ay + 110],        // step out
          [ax + 90, ay + 150],        // right-bottom point
        )
        .fill('#16a34a');

      // Sale name (middle section)
      doc
        .font('Helvetica-Bold')
        .fontSize(28)
        .fillColor('#1a1a2e')
        .text(sale.title, 180, yOffset + 50, { width: 250, lineBreak: false });

      // "This Way" subtext
      doc
        .font('Helvetica')
        .fontSize(14)
        .fillColor('#666666')
        .text('This Way', 180, yOffset + 140, { width: 250, lineBreak: false });

      // Address line (if available)
      if (sale.address) {
        doc
          .font('Helvetica')
          .fontSize(11)
          .fillColor('#999999')
          .text(sale.address, 180, yOffset + 165, { width: 250, lineBreak: false });
      }

      // QR code — top right, 150×150
      doc.image(qrDirectional, 630, yOffset + 30, { width: 150, height: 150 });
    }

    // PAGE 3: Table Tents (switch back to portrait Letter)
    doc.addPage({ size: 'LETTER' });

    const PANEL_W_FULL = 306;  // each half
    const TENT_H_FULL = 396;

    // Draw two tents per page (tent 1: y=0..396, tent 2: y=396..792)
    for (let i = 0; i < 2; i++) {
      const yOffset = i * 396;

      // LEFT PANEL (front — customer sees this)
      // Border
      doc
        .rect(0, yOffset, PANEL_W_FULL, TENT_H_FULL)
        .lineWidth(1.5)
        .stroke('#cccccc');

      // Sale title
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor('#1a1a2e')
        .text(sale.title, 12, yOffset + 20, { width: 282, lineBreak: false });

      // Date range
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#666666')
        .text(`${startDate} – ${endDate}`, 12, yOffset + 90, { width: 282, lineBreak: false });

      // QR code — centered in left panel, 200×200, x=(306-200)/2=53
      doc.image(qrTableTent, 53, yOffset + 160, { width: 200, height: 200 });

      // RIGHT PANEL (back)
      // Border
      doc
        .rect(PANEL_W_FULL, yOffset, PANEL_W_FULL, TENT_H_FULL)
        .lineWidth(1.5)
        .stroke('#cccccc');

      // Fold line (dashed vertical)
      doc
        .moveTo(PANEL_W_FULL, yOffset)
        .lineTo(PANEL_W_FULL, yOffset + TENT_H_FULL)
        .dash(4, { space: 4 })
        .lineWidth(1)
        .stroke('#aaaaaa')
        .undash();

      // finda.sale
      doc
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor('#16a34a')
        .text('finda.sale', PANEL_W_FULL + 18, yOffset + 20, { width: 270, align: 'center', lineBreak: false });

      // Tagline
      doc
        .font('Helvetica')
        .fontSize(14)
        .fillColor('#1a1a2e')
        .text('Browse items before you arrive.', PANEL_W_FULL + 18, yOffset + 70, { width: 270, align: 'center', lineBreak: false });

      // Small instruction
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#999999')
        .text('Scan QR code on the left to view online.', PANEL_W_FULL + 18, yOffset + 180, { width: 270, align: 'center', lineBreak: false });
    }

    // PAGE 4: Hang Tags
    doc.addPage({ size: 'LETTER' });

    const TAG_W_FULL = 140;
    const TAG_H_FULL = 220;
    const COLS_FULL = 4;
    const ROWS_FULL = 3;
    const MARGIN_X_FULL = (612 - COLS_FULL * TAG_W_FULL) / 2;  // = 26
    const MARGIN_Y_FULL = (792 - ROWS_FULL * TAG_H_FULL) / 2;  // = 66
    const QR_SIZE_FULL = 110;

    // For each tag at (col, row):
    for (let row = 0; row < ROWS_FULL; row++) {
      for (let col = 0; col < COLS_FULL; col++) {
        const tagX = MARGIN_X_FULL + col * TAG_W_FULL;
        const tagY = MARGIN_Y_FULL + row * TAG_H_FULL;

        // Dashed perforated border
        doc
          .rect(tagX, tagY, TAG_W_FULL, TAG_H_FULL)
          .dash(2, { space: 2 })
          .lineWidth(1)
          .stroke('#cccccc')
          .undash();

        // Hole punch circle at top center
        doc
          .circle(tagX + TAG_W_FULL / 2, tagY + 12, 6)
          .lineWidth(1)
          .stroke('#999999');

        // Sale name (below hole punch)
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#1a1a2e')
          .text(sale.title, tagX + 5, tagY + 26, { width: TAG_W_FULL - 10, align: 'center', lineBreak: false });

        // QR code — centered horizontally
        const qrX_full = tagX + (TAG_W_FULL - QR_SIZE_FULL) / 2;  // = tagX + 15
        const qrY_full = tagY + 45;
        doc.image(qrHangTag, qrX_full, qrY_full, { width: QR_SIZE_FULL, height: QR_SIZE_FULL });

        // finda.sale (bottom)
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#999999')
          .text('finda.sale', tagX + 5, tagY + TAG_H_FULL - 16, { width: TAG_W_FULL - 10, align: 'center', lineBreak: false });
      }
    }

    doc.end();
  } catch (error) {
    console.error('getFullSignKitPDF error:', error);
    res.status(500).json({ message: 'Failed to generate full sign kit.' });
  }
};

/**
 * GET /api/organizers/:saleId/print-kit/price-sheet
 * Generates a single-page PDF with pre-printed price tags organizers can cut out
 * and use for items without individual labels.
 * 3 columns × 9 rows = 27 price points ($0.25 to $20)
 */
export const getPriceSheet = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { saleId } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: { select: { userId: true } } },
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    // Generate QR code for sale URL (reuse for all cells)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const saleUrl = `${frontendUrl}/sales/${saleId}?utm_source=qr_price_sheet`;
    const saleQrBuffer = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 200,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const prices = [0.25, 0.50, 0.75, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50,
                    4.00, 4.50, 5.00, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    // 27 prices total — fits in 3×10 Avery 5160 grid (30 cells per page, 27 used)

    const COLS = 3;
    const CELL_W = 189;   // Avery 5160 sticker width
    const CELL_H = 72;    // Avery 5160 sticker height
    const QR_SIZE = 48;
    const LEFT_MARGIN = 13;
    const TOP_MARGIN = 36;

    // Create doc WITHOUT calling addPage() — autoFirstPage:true handles it
    const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="price-sheet-${saleId}.pdf"`);
    doc.pipe(res);

    // Draw all 27 cells (3 cols × 10 rows = 30 cells, 27 prices fit in slots 0-26)
    for (let i = 0; i < prices.length; i++) {
      if (i > 0 && i % 30 === 0) {
        doc.addPage({ size: 'LETTER', margin: 0 });
      }

      const col = i % COLS;
      const row = Math.floor((i % 30) / COLS);
      const cellX = LEFT_MARGIN + col * CELL_W;
      const cellY = TOP_MARGIN + row * CELL_H;

      // Sale name — top, tiny, no border
      doc
        .font('Helvetica')
        .fontSize(6)
        .fillColor('#666666')
        .text(sale.title, cellX + 8, cellY + 5, { width: 129, lineBreak: false });

      // Price — large bold, left-aligned
      const priceText = `$${prices[i].toFixed(2)}`;
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor('#1a1a2e')
        .text(priceText, cellX + 8, cellY + 18, { width: 100, lineBreak: false });

      // finda.sale — bottom left, tiny
      doc
        .font('Helvetica')
        .fontSize(5)
        .fillColor('#999999')
        .text('finda.sale', cellX + 8, cellY + 56, { width: 80, lineBreak: false });

      // QR code — right side, 48×48, vertically centered
      doc.image(saleQrBuffer, cellX + 137, cellY + 12, { width: QR_SIZE, height: QR_SIZE });
    }

    doc.end();
  } catch (error) {
    console.error('getPriceSheet error:', error);
    res.status(500).json({ message: 'Failed to generate price sheet.' });
  }
};

/**
 * Draw a single item sticker at position (x, y)
 * Format: item title + price + barcode (Code128-style ID) + QR code
 */
function drawSticker(
  doc: any,
  item: { id: string; title: string; price: number | null },
  x: number,
  y: number,
  qrBuffer: Buffer,
) {
  const stickerX = x + MARGIN;
  const stickerY = y + MARGIN;
  const contentW = STICKER_W - MARGIN * 2 - 52; // Reserve space for QR on right

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

  // QR code in bottom-right corner (48×48 pixels)
  const qrX = x + STICKER_W - MARGIN - 48;
  const qrY = y + STICKER_H - MARGIN - 48;
  doc.image(qrBuffer, qrX, qrY, { width: 48, height: 48 });

  // Border around sticker
  doc
    .rect(x, y, STICKER_W, STICKER_H)
    .lineWidth(0.5)
    .stroke('#e5e5e5');
}
