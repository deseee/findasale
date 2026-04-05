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

    // Pre-generate all item QR codes
    const itemQrBuffers: { [itemId: string]: Buffer } = {};
    for (const item of items) {
      const itemUrl = `${frontendUrl}/items/${item.id}`;
      itemQrBuffers[item.id] = await QRCode.toBuffer(itemUrl, {
        type: 'png',
        width: 200,
        margin: 1,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      });
    }

    while (itemIndex < items.length) {
      doc.addPage();

      // Draw grid of stickers on this page
      for (let row = 0; row < ROWS && itemIndex < items.length; row++) {
        for (let col = 0; col < COLS && itemIndex < items.length; col++) {
          const item = items[itemIndex++];

          // Calculate sticker position
          const x = PAGE_MARGIN + col * STICKER_W;
          const y = PAGE_MARGIN + row * STICKER_H;

          drawSticker(doc, item, x, y, itemQrBuffers[item.id]);
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

    // Landscape half-page: 8.5" wide, 5.5" tall
    const doc = new PDFDocument({ size: [612, 396], margins: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="directional-signs-${saleId}.pdf"`);
    doc.pipe(res);

    const saleType = sale.saleType || 'ESTATE_SALE';
    const saleTypeText =
      saleType === 'ESTATE_SALE'
        ? 'Estate Sale'
        : saleType === 'YARD_SALE'
          ? 'Yard Sale'
          : 'Sale';

    // Draw two directional signs per page
    for (let i = 0; i < 2; i++) {
      const yOffset = i * 198; // Half-page height = 396 / 2 = 198

      // Border
      doc
        .rect(12, yOffset + 12, 588, 174)
        .lineWidth(1)
        .stroke('#1a1a2e');

      // Arrow and text (left side)
      doc
        .fontSize(32)
        .fillColor('#1a1a2e')
        .font('Helvetica-Bold')
        .text('▶', 30, yOffset + 40, { width: 40, align: 'center' });

      doc
        .fontSize(18)
        .fillColor('#1a1a2e')
        .font('Helvetica-Bold')
        .text(saleTypeText, 90, yOffset + 50, { width: 300, align: 'left' });

      doc
        .fontSize(14)
        .fillColor('#666666')
        .font('Helvetica')
        .text('→ This Way', 90, yOffset + 75, { width: 300, align: 'left' });

      // QR (right side)
      doc.image(qrBuffer, 430, yOffset + 40, { width: 150, height: 150 });
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

    // 4" × 6" landscape
    const doc = new PDFDocument({ size: [576, 288], margins: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="table-tents-${saleId}.pdf"`);
    doc.pipe(res);

    const startDate = new Date(sale.startDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const endDate = new Date(sale.endDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    // Draw two table tents per page
    for (let i = 0; i < 2; i++) {
      const yOffset = i * 144; // Half page

      // Border (fold line in middle)
      doc
        .rect(12, yOffset + 12, 552, 120)
        .lineWidth(1)
        .stroke('#1a1a2e');

      // Fold line indicator (dashed)
      doc
        .moveTo(300, yOffset + 12)
        .lineTo(300, yOffset + 132)
        .lineWidth(0.5)
        .dash(2, { space: 2 })
        .stroke('#cccccc')
        .undash();

      // Front (left half): Sale title, date, QR
      doc
        .fontSize(14)
        .fillColor('#1a1a2e')
        .font('Helvetica-Bold')
        .text(sale.title, 25, yOffset + 25, { width: 260, align: 'center' });

      doc
        .fontSize(10)
        .fillColor('#666666')
        .font('Helvetica')
        .text(`${startDate} – ${endDate}`, 25, yOffset + 50, { width: 260, align: 'center' });

      doc.image(qrBuffer, 100, yOffset + 65, { width: 110, height: 110 });

      // Back (right half): FindA.Sale URL
      doc
        .fontSize(10)
        .fillColor('#1a1a2e')
        .font('Helvetica')
        .text('finda.sale', 325, yOffset + 60, { width: 250, align: 'center' });

      doc
        .fontSize(8)
        .fillColor('#666666')
        .text('Browse items before you arrive', 325, yOffset + 75, { width: 250, align: 'center' });
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
      width: 150,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({ size: 'LETTER', margins: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="hang-tags-${saleId}.pdf"`);
    doc.pipe(res);

    // 3" × 2" tags in landscape orientation = 144 × 216 points (wide × tall)
    const TAG_W = 144;
    const TAG_H = 216;
    const COLS = 5;
    const ROWS = 2;
    const START_X = 36;
    const START_Y = 36;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = START_X + col * TAG_W;
        const y = START_Y + row * TAG_H;

        // Perforated border (dashed)
        doc
          .rect(x + 6, y + 6, TAG_W - 12, TAG_H - 12)
          .lineWidth(0.5)
          .dash(3, { space: 2 })
          .stroke('#cccccc')
          .undash();

        // Sale name (small)
        doc
          .fontSize(8)
          .fillColor('#1a1a2e')
          .font('Helvetica-Bold')
          .text(sale.title, x + 10, y + 15, {
            width: TAG_W - 20,
            align: 'center',
            ellipsis: true,
          });

        // QR code (centered)
        const qrX = x + (TAG_W - 100) / 2;
        const qrY = y + 35;
        doc.image(qrBuffer, qrX, qrY, { width: 100, height: 100 });
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

    // PAGE 2: Directional Signs
    doc.addPage();
    const saleType = sale.saleType || 'ESTATE_SALE';
    const saleTypeText =
      saleType === 'ESTATE_SALE'
        ? 'Estate Sale'
        : saleType === 'YARD_SALE'
          ? 'Yard Sale'
          : 'Sale';

    // Title
    doc
      .fontSize(20)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text('Directional Signs', PAGE_MARGIN, 20, { width: PAGE_W - PAGE_MARGIN * 2, align: 'center' });

    for (let i = 0; i < 2; i++) {
      const yOffset = 100 + i * 300;

      doc
        .rect(PAGE_MARGIN, yOffset, PAGE_W - PAGE_MARGIN * 2, 250)
        .lineWidth(1)
        .stroke('#1a1a2e');

      doc
        .fontSize(32)
        .fillColor('#1a1a2e')
        .font('Helvetica-Bold')
        .text('▶', PAGE_MARGIN + 20, yOffset + 30, { width: 40, align: 'center' });

      doc
        .fontSize(18)
        .fillColor('#1a1a2e')
        .font('Helvetica-Bold')
        .text(saleTypeText, PAGE_MARGIN + 80, yOffset + 40, { width: 300, align: 'left' });

      doc
        .fontSize(14)
        .fillColor('#666666')
        .font('Helvetica')
        .text('→ This Way', PAGE_MARGIN + 80, yOffset + 65, { width: 300, align: 'left' });

      doc.image(qrDirectional, PAGE_W - PAGE_MARGIN - 150, yOffset + 30, {
        width: 120,
        height: 120,
      });
    }

    // PAGE 3: Table Tents
    doc.addPage();
    doc
      .fontSize(20)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text('Table Tents (Fold in Half)', PAGE_MARGIN, 20, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    for (let i = 0; i < 2; i++) {
      const yOffset = 100 + i * 300;

      doc
        .rect(PAGE_MARGIN, yOffset, PAGE_W - PAGE_MARGIN * 2, 250)
        .lineWidth(1)
        .stroke('#1a1a2e');

      // Fold line
      const foldX = PAGE_MARGIN + (PAGE_W - PAGE_MARGIN * 2) / 2;
      doc
        .moveTo(foldX, yOffset)
        .lineTo(foldX, yOffset + 250)
        .lineWidth(0.5)
        .dash(2, { space: 2 })
        .stroke('#cccccc')
        .undash();

      // Front
      doc
        .fontSize(14)
        .fillColor('#1a1a2e')
        .font('Helvetica-Bold')
        .text(sale.title, PAGE_MARGIN + 20, yOffset + 30, {
          width: (PAGE_W - PAGE_MARGIN * 2) / 2 - 40,
          align: 'center',
        });

      doc
        .fontSize(10)
        .fillColor('#666666')
        .font('Helvetica')
        .text(`${startDate} – ${endDate}`, PAGE_MARGIN + 20, yOffset + 60, {
          width: (PAGE_W - PAGE_MARGIN * 2) / 2 - 40,
          align: 'center',
        });

      doc.image(qrTableTent, PAGE_MARGIN + 40, yOffset + 80, { width: 100, height: 100 });

      // Back
      doc
        .fontSize(10)
        .fillColor('#1a1a2e')
        .font('Helvetica')
        .text('finda.sale', PAGE_MARGIN + (PAGE_W - PAGE_MARGIN * 2) / 2 + 20, yOffset + 50, {
          width: (PAGE_W - PAGE_MARGIN * 2) / 2 - 40,
          align: 'center',
        });

      doc
        .fontSize(8)
        .fillColor('#666666')
        .text('Browse items before you arrive', PAGE_MARGIN + (PAGE_W - PAGE_MARGIN * 2) / 2 + 20, yOffset + 70, {
          width: (PAGE_W - PAGE_MARGIN * 2) / 2 - 40,
          align: 'center',
        });
    }

    // PAGE 4: Hang Tags
    doc.addPage();
    doc
      .fontSize(20)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text('Hang Tags (Cut Along Dashed Lines)', PAGE_MARGIN, 20, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    const TAG_W = 216;
    const TAG_H = 144;
    const COLS = 4;
    const ROWS = 2;
    const START_X = 36;
    const START_Y = 100;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = START_X + col * TAG_W;
        const y = START_Y + row * TAG_H;

        doc
          .rect(x + 6, y + 6, TAG_W - 12, TAG_H - 12)
          .lineWidth(0.5)
          .dash(3, { space: 2 })
          .stroke('#cccccc')
          .undash();

        doc
          .fontSize(8)
          .fillColor('#1a1a2e')
          .font('Helvetica-Bold')
          .text(sale.title, x + 10, y + 15, {
            width: TAG_W - 20,
            align: 'center',
            ellipsis: true,
          });

        const qrX = x + (TAG_W - 100) / 2;
        const qrY = y + 35;
        doc.image(qrHangTag, qrX, qrY, { width: 100, height: 100 });
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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({ size: 'LETTER', margins: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="price-sheet-${saleId}.pdf"`);
    doc.pipe(res);

    // Layout: 3 columns × 9 rows = 27 price points
    const COLS = 3;
    const ROWS = 9;
    const CELL_W = 612 / COLS; // 204 points per column
    const CELL_H = 792 / ROWS; // 88 points per row
    const MARGIN = 12;

    // Price points: $0.25, $0.50, $0.75, $1–$5 (0.25 increments), then $6–$20
    const prices: number[] = [
      0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5,
      4.0, 4.5, 5.0, 6, 7, 8, 9, 10, 11,
      12, 13, 14, 15, 16, 17, 18, 19, 20,
    ];

    let priceIndex = 0;
    for (let row = 0; row < ROWS && priceIndex < prices.length; row++) {
      for (let col = 0; col < COLS && priceIndex < prices.length; col++) {
        const x = col * CELL_W;
        const y = row * CELL_H;
        const price = prices[priceIndex++];

        // Perforated border (dashed)
        doc
          .rect(x + MARGIN / 2, y + MARGIN / 2, CELL_W - MARGIN, CELL_H - MARGIN)
          .lineWidth(0.5)
          .dash(2, { space: 2 })
          .stroke('#cccccc')
          .undash();

        // Sale name (tiny, top)
        doc
          .fontSize(6)
          .fillColor('#666666')
          .font('Helvetica')
          .text(sale.title, x + MARGIN, y + 4, {
            width: CELL_W - MARGIN * 2,
            align: 'center',
            ellipsis: true,
          });

        // Price (large, centered)
        const priceText = `$${price.toFixed(2)}`;
        doc
          .fontSize(28)
          .fillColor('#16a34a')
          .font('Helvetica-Bold')
          .text(priceText, x + MARGIN, y + 25, {
            width: CELL_W - MARGIN * 2,
            align: 'center',
          });

        // Website (tiny, bottom)
        doc
          .fontSize(6)
          .fillColor('#999999')
          .font('Helvetica')
          .text('finda.sale', x + MARGIN, y + CELL_H - 12, {
            width: CELL_W - MARGIN * 2,
            align: 'center',
          });
      }
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
