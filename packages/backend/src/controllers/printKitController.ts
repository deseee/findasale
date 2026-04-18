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

    const frontendUrl = process.env.FRONTEND_URL || 'https://finda.sale';
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
        .text(titleText, sX + 58, sY + 6, { width: 123, lineBreak: false });

      // Price
      const priceText = item.price != null ? `$${item.price.toFixed(2)}` : 'N/A';
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#16a34a')
        .text(priceText, sX + 58, sY + 20, { width: 100, lineBreak: false });

      // Item ID
      doc
        .font('Helvetica')
        .fontSize(5)
        .fillColor('#999999')
        .text(item.id, sX + 58, sY + 46, { width: 123, lineBreak: false });

      // QR — left side, vertically centered
      doc.image(itemQrBuffers[i], sX + 4, sY + 12, { width: QR_SIZE, height: QR_SIZE });
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

    const frontendUrl = process.env.FRONTEND_URL || 'https://finda.sale';
    const saleUrl = `${frontendUrl}/sales/${saleId}?utm_source=qr_yard_sign`;

    const qrBuffer = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 500,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({ size: 'LETTER', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="yard-sign-${saleId}.pdf"`);
    doc.pipe(res);

    // Yard sign layout: vertically centered block on letter page
    // Total content ~630pt; center offset = (792-630)/2 = 81
    const startY = 30;
    const qrSize = 500; // ~6.9 inches
    const qrX = (PAGE_W - qrSize) / 2; // = 56
    const qrY = startY + 50; // after title

    // Title
    doc
      .fontSize(22)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(sale.title, PAGE_MARGIN, startY, { width: PAGE_W - PAGE_MARGIN * 2, align: 'center' });

    // QR Code (dominant element — fills most of page)
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
      .fontSize(18)
      .fillColor('#333333')
      .font('Helvetica-Bold')
      .text(`${startDate} – ${endDate}`, PAGE_MARGIN, qrY + qrSize + 14, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    // Address
    doc
      .fontSize(13)
      .fillColor('#444444')
      .font('Helvetica')
      .text(`${sale.address}`, PAGE_MARGIN, doc.y + 6, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(13)
      .text(`${sale.city}, ${sale.state} ${sale.zip}`, PAGE_MARGIN, doc.y + 2, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    // Footer
    doc
      .fontSize(10)
      .fillColor('#888888')
      .text('Scan to browse & buy online  •  finda.sale', PAGE_MARGIN, doc.y + 10, {
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

    const frontendUrl = process.env.FRONTEND_URL || 'https://finda.sale';
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
    const doc = new PDFDocument({ size: [792, 612], margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="directional-signs-${saleId}.pdf"`);
    doc.pipe(res);

    // Draw two directional signs per page (top and bottom)
    // Each sign: 792×306 pts. Large arrow with text inside (white), QR on opposite side.
    // Sign 1 (i=0): right-pointing arrow (left zone) + QR (right zone)
    // Sign 2 (i=1): QR (left zone) + left-pointing arrow (right zone)
    for (let i = 0; i < 2; i++) {
      const yOffset = i * 306; // 612 / 2 = 306 per sign
      const cy = yOffset + 153; // vertical center of sign

      // Arrow geometry constants
      const shaftHalfH = 72;   // shaft ±72pt → 144pt tall shaft
      const headHalfH  = 118;  // head wing ±118pt → 236pt total head height (fills most of 306pt)

      // Border
      doc
        .rect(2, yOffset + 2, 788, 302)
        .lineWidth(2)
        .stroke('#cccccc');

      if (i === 0) {
        // ── RIGHT-POINTING ARROW ──────────────────────────────────────────
        // Shaft: x=15..385, Head: x=385..495, QR: x=520..740
        doc
          .polygon(
            [15,  cy - shaftHalfH],  // shaft top-left
            [385, cy - shaftHalfH],  // shaft meets head (top)
            [385, cy - headHalfH],   // head top wing
            [495, cy],               // tip →
            [385, cy + headHalfH],   // head bottom wing
            [385, cy + shaftHalfH],  // shaft meets head (bottom)
            [15,  cy + shaftHalfH],  // shaft bottom-left
          )
          .fill('#16a34a');

        // Sale name — white, inside shaft
        doc
          .font('Helvetica-Bold')
          .fontSize(19)
          .fillColor('#ffffff')
          .text(sale.title, 35, cy - 22, { width: 335, lineBreak: false });

        // "This Way →" — white, below sale name
        doc
          .font('Helvetica')
          .fontSize(14)
          .fillColor('#ffffff')
          .text('This Way', 35, cy + 6, { width: 335, lineBreak: false });

        // QR code — right zone, centered vertically
        doc.image(qrBuffer, 520, yOffset + 43, { width: 220, height: 220 });

      } else {
        // ── LEFT-POINTING ARROW ───────────────────────────────────────────
        // QR: x=30..250, Shaft: x=275..775, Head: x=275..165 (tip at left)
        doc
          .polygon(
            [775, cy - shaftHalfH],  // shaft top-right
            [775, cy + shaftHalfH],  // shaft bottom-right
            [305, cy + shaftHalfH],  // shaft meets head (bottom)
            [305, cy + headHalfH],   // head bottom wing
            [195, cy],               // tip ←
            [305, cy - headHalfH],   // head top wing
            [305, cy - shaftHalfH],  // shaft meets head (top)
          )
          .fill('#16a34a');

        // Sale name — white, inside shaft
        doc
          .font('Helvetica-Bold')
          .fontSize(19)
          .fillColor('#ffffff')
          .text(sale.title, 320, cy - 22, { width: 435, lineBreak: false });

        // "← This Way" — white, below sale name
        doc
          .font('Helvetica')
          .fontSize(14)
          .fillColor('#ffffff')
          .text('This Way', 320, cy + 6, { width: 435, lineBreak: false });

        // QR code — left zone, centered vertically
        doc.image(qrBuffer, 30, yOffset + 43, { width: 220, height: 220 });
      }
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

    const frontendUrl = process.env.FRONTEND_URL || 'https://finda.sale';
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
    const doc = new PDFDocument({ size: 'LETTER', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="table-tents-${saleId}.pdf"`);
    doc.pipe(res);

    const PANEL_W = 306;  // each half of the folded tent (612 / 2)
    const TENT_H = 396;   // two tents per letter page (792 / 2)

    const startDate = new Date(sale.startDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const endDate = new Date(sale.endDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    // Format sale type for human display
    const saleTypeLabel: Record<string, string> = {
      ESTATE: 'Estate Sale', YARD: 'Yard Sale', AUCTION: 'Auction',
      FLEA_MARKET: 'Flea Market', CONSIGNMENT: 'Consignment Sale',
    };
    const saleTypeStr = saleTypeLabel[sale.saleType ?? ''] ?? '';

    // QR centered in a 306pt panel: x = (306 - 190) / 2 = 58
    const QR_SIZE = 190;
    const QR_X_FRONT = (PANEL_W - QR_SIZE) / 2;        // 58 — left panel
    const QR_X_BACK  = PANEL_W + (PANEL_W - QR_SIZE) / 2; // 364 — right panel

    // Draw two tents per page (tent 1: y=0..396, tent 2: y=396..792)
    for (let i = 0; i < 2; i++) {
      const yOffset = i * 396;

      // ── LEFT PANEL (front — visible when tent is standing) ──────────────
      // Green header bar
      doc.rect(0, yOffset, PANEL_W, 50).fill('#16a34a');

      // Sale title — white on green header
      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor('#ffffff')
        .text(sale.title, 10, yOffset + 13, { width: 286, lineBreak: false });

      // Sale type + date range row
      const typeAndDate = saleTypeStr
        ? `${saleTypeStr}  ·  ${startDate} – ${endDate}`
        : `${startDate} – ${endDate}`;
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#1a1a2e')
        .text(typeAndDate, 12, yOffset + 60, { width: 282, lineBreak: false });

      // Address (if available)
      if (sale.address) {
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor('#666666')
          .text(sale.address, 12, yOffset + 78, { width: 282, lineBreak: false });
      }

      // Divider
      doc.moveTo(12, yOffset + 98).lineTo(294, yOffset + 98).lineWidth(0.5).stroke('#dddddd');

      // Tagline
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#16a34a')
        .text('Browse & buy before you arrive.', 12, yOffset + 106, { width: 282, align: 'center', lineBreak: false });

      // QR code — centered, 190×190, starts at y+125 → ends y+315
      doc.image(qrBuffer, QR_X_FRONT, yOffset + 125, { width: QR_SIZE, height: QR_SIZE });

      // "Scan to view items" caption
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#999999')
        .text('Scan to view items online', 12, yOffset + 322, { width: 282, align: 'center', lineBreak: false });

      // Outer border
      doc.rect(0, yOffset, PANEL_W, TENT_H).lineWidth(1).stroke('#cccccc');

      // ── RIGHT PANEL (back of tent) ───────────────────────────────────────
      // Fold / cut line (dashed vertical)
      doc
        .moveTo(PANEL_W, yOffset)
        .lineTo(PANEL_W, yOffset + TENT_H)
        .dash(5, { space: 5 })
        .lineWidth(1)
        .stroke('#aaaaaa')
        .undash();

      // Green header bar
      doc.rect(PANEL_W, yOffset, PANEL_W, 50).fill('#16a34a');

      // "finda.sale" — white on green
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor('#ffffff')
        .text('finda.sale', PANEL_W + 10, yOffset + 13, { width: 286, align: 'center', lineBreak: false });

      // Tagline
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#1a1a2e')
        .text('Browse & buy before you arrive.', PANEL_W + 12, yOffset + 60, { width: 282, align: 'center', lineBreak: false });

      // Sale name (so shoppers know which sale this is)
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#666666')
        .text(sale.title, PANEL_W + 12, yOffset + 80, { width: 282, align: 'center', lineBreak: false });

      // Divider
      doc.moveTo(PANEL_W + 12, yOffset + 98).lineTo(PANEL_W + 294, yOffset + 98).lineWidth(0.5).stroke('#dddddd');

      // Second QR code — same URL, centered in back panel
      doc.image(qrBuffer, QR_X_BACK, yOffset + 110, { width: QR_SIZE, height: QR_SIZE });

      // "Scan to view items" caption
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#999999')
        .text('Scan to view items online', PANEL_W + 12, yOffset + 307, { width: 282, align: 'center', lineBreak: false });

      // Date + type footer
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#aaaaaa')
        .text(typeAndDate, PANEL_W + 12, yOffset + 325, { width: 282, align: 'center', lineBreak: false });

      // Outer border
      doc.rect(PANEL_W, yOffset, PANEL_W, TENT_H).lineWidth(1).stroke('#cccccc');
    }

    doc.end();
  } catch (error) {
    console.error('getTableTentKit error:', error);
    res.status(500).json({ message: 'Failed to generate table tents.' });
  }
};

/**
 * GET /api/organizer/sales/:saleId/signs/hang-tag
 * Item-specific hang tags. One tag per item: item title + price + QR code pointing to item.
 * 4 cols × 3 rows = 12 tags per page. Page-break every 12 items.
 * If no items, generates one page of 12 blank tags with "No items yet" text.
 * Perforated-style dashed border with hole punch circle at top.
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
      include: {
        organizer: { select: { userId: true } },
        items: { select: { id: true, title: true, price: true }, orderBy: { title: 'asc' } },
      },
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://finda.sale';

    // Generate QR code for each item
    const itemQrBuffers: { [key: string]: Buffer } = {};
    for (const item of sale.items) {
      const itemUrl = `${frontendUrl}/items/${item.id}`;
      itemQrBuffers[item.id] = await QRCode.toBuffer(itemUrl, {
        type: 'png',
        width: 500,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({ size: 'LETTER', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="hang-tags-${saleId}.pdf"`);
    doc.pipe(res);

    // Hang tags: 4 cols × 3 rows = 12 tags per page
    const TAG_W = 140;
    const TAG_H = 220;
    const COLS = 4;
    const ROWS = 3;
    const TAGS_PER_PAGE = COLS * ROWS;
    const MARGIN_X = (612 - COLS * TAG_W) / 2;  // = 26
    const MARGIN_Y = (792 - ROWS * TAG_H) / 2;  // = 66
    const QR_SIZE = 110;

    // If no items, generate one page of 12 blank tags with "No items yet" text
    if (sale.items.length === 0) {
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

          // "No items yet" message centered
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor('#999999')
            .text('No items yet', tagX + 5, tagY + 95, { width: TAG_W - 10, align: 'center' });

          // finda.sale (bottom)
          doc
            .font('Helvetica')
            .fontSize(7)
            .fillColor('#999999')
            .text('finda.sale', tagX + 5, tagY + TAG_H - 16, { width: TAG_W - 10, align: 'center', lineBreak: false });
        }
      }
    } else {
      // For each item, create one tag
      for (let i = 0; i < sale.items.length; i++) {
        // Add page when i > 0 && i % TAGS_PER_PAGE === 0
        if (i > 0 && i % TAGS_PER_PAGE === 0) {
          doc.addPage({ size: 'LETTER', margin: 0 });
        }

        const col = i % COLS;
        const row = Math.floor((i % TAGS_PER_PAGE) / COLS);
        const tagX = MARGIN_X + col * TAG_W;
        const tagY = MARGIN_Y + row * TAG_H;
        const item = sale.items[i];

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

        // Item title (truncated to ~15 chars if needed)
        const titleText = (item.title || '').slice(0, 20);
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#1a1a2e')
          .text(titleText, tagX + 5, tagY + 26, { width: TAG_W - 10, align: 'center', lineBreak: false });

        // Price (if available)
        if (item.price != null) {
          const priceText = `$${item.price.toFixed(2)}`;
          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor('#16a34a')
            .text(priceText, tagX + 5, tagY + 45, { width: TAG_W - 10, align: 'center', lineBreak: false });
        }

        // QR code — centered horizontally
        const qrX = tagX + (TAG_W - QR_SIZE) / 2;  // = tagX + 15
        const qrY = tagY + (item.price ? 70 : 55);
        doc.image(itemQrBuffers[item.id], qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

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
 * Helper: render price sheet content to a given document/page.
 * Renders 3 cols × 10 rows = 30 cells (27 prices used).
 */
async function renderPriceSheet(doc: any, saleId: string, saleTitle: string, frontendUrl: string) {
  const prices = [0.25, 0.50, 0.75, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50,
                  4.00, 4.50, 5.00, 6, 7, 7.50, 8, 9, 10, 11, 12, 12.50, 13, 14, 15, 16, 17, 18, 19, 20, 25];
  const COLS = 3;
  const CELL_W = 189;   // Avery 5160: 2-5/8" = 189pt
  const CELL_H = 72;    // Avery 5160: 1" = 72pt
  const H_GAP = 9;      // Avery 5160: 1/8" gap between columns = 9pt
  const QR_SIZE = 48;
  const LEFT_MARGIN = 13.5;  // Avery 5160: 3/16" = 13.5pt
  const TOP_MARGIN = 36;     // Avery 5160: 1/2" = 36pt

  for (let i = 0; i < prices.length; i++) {
    if (i > 0 && i % 30 === 0) {
      doc.addPage({ size: 'LETTER', margin: 0 });
    }

    const col = i % COLS;
    const row = Math.floor((i % 30) / COLS);
    const cellX = LEFT_MARGIN + col * (CELL_W + H_GAP);
    const cellY = TOP_MARGIN + row * CELL_H;

    // Sale name — top, tiny
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#666666')
      .text(saleTitle, cellX + 58, cellY + 5, { width: 123, lineBreak: false });

    // Price — large bold
    const priceText = `$${prices[i].toFixed(2)}`;
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#1a1a2e')
      .text(priceText, cellX + 58, cellY + 18, { width: 100, lineBreak: false });

    // finda.sale — bottom left, tiny
    doc
      .font('Helvetica')
      .fontSize(5)
      .fillColor('#999999')
      .text('finda.sale', cellX + 58, cellY + 56, { width: 80, lineBreak: false });

    // QR code — left side, 48×48
    const miscQrUrl = `${frontendUrl}/pos/${saleId}?action=add-misc&price=${prices[i].toFixed(2)}`;
    const miscQrBuffer = await QRCode.toBuffer(miscQrUrl, {
      type: 'png',
      width: 200,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });
    doc.image(miscQrBuffer, cellX + 4, cellY + 12, { width: QR_SIZE, height: QR_SIZE });
  }
}

/**
 * GET /api/organizer/sales/:saleId/signs/full-kit
 * Combined multi-section PDF: page 1 = yard sign, page 2 = directional signs,
 * page 3 = table tents, page 4 = check-in QR, page 5 = treasure hunt QR,
 * page 6 = photo station QR, pages 7+ = price sheet.
 * (Hang tags excluded — download separately from the QR Item Labels section.)
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
      include: {
        organizer: { select: { userId: true } },
      },
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found.' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://finda.sale';
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
      width: 500,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    const qrTableTent = await QRCode.toBuffer(saleUrl, {
      type: 'png',
      width: 500,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // Generate QR codes for interactive pages
    const qrCheckIn = await QRCode.toBuffer(
      `${frontendUrl}/sales/${saleId}?utm_source=qr_full_kit_checkin`,
      {
        type: 'png',
        width: 500,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      }
    );

    const qrTreasureHunt = await QRCode.toBuffer(
      `${frontendUrl}/sales/${saleId}/treasure-hunt-qr?utm_source=qr_full_kit_hunt`,
      {
        type: 'png',
        width: 500,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      }
    );

    const qrPhotoStation = await QRCode.toBuffer(
      `${frontendUrl}/sales/${saleId}/photo-station?utm_source=qr_full_kit_photo`,
      {
        type: 'png',
        width: 500,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({ size: 'LETTER', margin: 0 });
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

    // PAGE 1: Yard Sign (identical layout to standalone yard sign)
    const fkQrSize = 500; // ~6.9 inches
    const fkQrX = (PAGE_W - fkQrSize) / 2;
    const fkQrY = 80;

    doc
      .fontSize(22)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(sale.title, PAGE_MARGIN, 30, { width: PAGE_W - PAGE_MARGIN * 2, align: 'center' });

    doc.image(qrYardSign, fkQrX, fkQrY, { width: fkQrSize, height: fkQrSize });

    doc
      .fontSize(18)
      .fillColor('#333333')
      .font('Helvetica-Bold')
      .text(`${startDate} – ${endDate}`, PAGE_MARGIN, fkQrY + fkQrSize + 14, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(13)
      .fillColor('#444444')
      .font('Helvetica')
      .text(`${sale.address}`, PAGE_MARGIN, doc.y + 6, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(13)
      .text(`${sale.city}, ${sale.state} ${sale.zip}`, PAGE_MARGIN, doc.y + 2, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(10)
      .fillColor('#888888')
      .text('Scan to browse & buy online  •  finda.sale', PAGE_MARGIN, doc.y + 10, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    // PAGE 2: Directional Signs (landscape orientation, 2 per page)
    // Large arrows filling most of each sign's height. Text inside arrow in white.
    // Sign 1: right-pointing arrow (left zone) + QR (right zone)
    // Sign 2: QR (left zone) + left-pointing arrow (right zone)
    doc.addPage({ size: [792, 612], margin: 0 });

    for (let i = 0; i < 2; i++) {
      const yOffset = i * 306;
      const cy = yOffset + 153;
      const shaftHalfH = 72;
      const headHalfH  = 118;

      // Border
      doc
        .rect(2, yOffset + 2, 788, 302)
        .lineWidth(2)
        .stroke('#cccccc');

      if (i === 0) {
        // Right-pointing: shaft x=15..385, head x=385..495, QR x=520..740
        doc
          .polygon(
            [15,  cy - shaftHalfH],
            [385, cy - shaftHalfH],
            [385, cy - headHalfH],
            [495, cy],
            [385, cy + headHalfH],
            [385, cy + shaftHalfH],
            [15,  cy + shaftHalfH],
          )
          .fill('#16a34a');

        doc
          .font('Helvetica-Bold').fontSize(19).fillColor('#ffffff')
          .text(sale.title, 35, cy - 22, { width: 335, lineBreak: false });
        doc
          .font('Helvetica').fontSize(14).fillColor('#ffffff')
          .text('This Way', 35, cy + 6, { width: 335, lineBreak: false });

        doc.image(qrDirectional, 520, yOffset + 43, { width: 220, height: 220 });

      } else {
        // Left-pointing: QR x=30..250, head x=195..305, shaft x=305..775
        doc
          .polygon(
            [775, cy - shaftHalfH],
            [775, cy + shaftHalfH],
            [305, cy + shaftHalfH],
            [305, cy + headHalfH],
            [195, cy],
            [305, cy - headHalfH],
            [305, cy - shaftHalfH],
          )
          .fill('#16a34a');

        doc
          .font('Helvetica-Bold').fontSize(19).fillColor('#ffffff')
          .text(sale.title, 320, cy - 22, { width: 435, lineBreak: false });
        doc
          .font('Helvetica').fontSize(14).fillColor('#ffffff')
          .text('This Way', 320, cy + 6, { width: 435, lineBreak: false });

        doc.image(qrDirectional, 30, yOffset + 43, { width: 220, height: 220 });
      }
    }

    // PAGE 3: Table Tents (switch back to portrait Letter)
    // Both panels now have QR code + full sale info. No dead space.
    doc.addPage({ size: 'LETTER', margin: 0 });

    const PANEL_W_FULL = 306;
    const TENT_H_FULL = 396;

    const fkSaleTypeLabel: Record<string, string> = {
      ESTATE: 'Estate Sale', YARD: 'Yard Sale', AUCTION: 'Auction',
      FLEA_MARKET: 'Flea Market', CONSIGNMENT: 'Consignment Sale',
    };
    const fkSaleTypeStr = fkSaleTypeLabel[sale.saleType ?? ''] ?? '';
    const fkTypeAndDate = fkSaleTypeStr
      ? `${fkSaleTypeStr}  ·  ${startDate} – ${endDate}`
      : `${startDate} – ${endDate}`;

    const FK_QR_SIZE = 190;
    const FK_QR_X_FRONT = (PANEL_W_FULL - FK_QR_SIZE) / 2;               // 58
    const FK_QR_X_BACK  = PANEL_W_FULL + (PANEL_W_FULL - FK_QR_SIZE) / 2; // 364

    for (let i = 0; i < 2; i++) {
      const yOffset = i * 396;

      // ── LEFT PANEL (front) ──────────────────────────────────────────────
      doc.rect(0, yOffset, PANEL_W_FULL, 50).fill('#16a34a');
      doc
        .font('Helvetica-Bold').fontSize(15).fillColor('#ffffff')
        .text(sale.title, 10, yOffset + 13, { width: 286, lineBreak: false });

      doc
        .font('Helvetica-Bold').fontSize(11).fillColor('#1a1a2e')
        .text(fkTypeAndDate, 12, yOffset + 60, { width: 282, lineBreak: false });

      if (sale.address) {
        doc
          .font('Helvetica').fontSize(10).fillColor('#666666')
          .text(sale.address, 12, yOffset + 78, { width: 282, lineBreak: false });
      }

      doc.moveTo(12, yOffset + 98).lineTo(294, yOffset + 98).lineWidth(0.5).stroke('#dddddd');

      doc
        .font('Helvetica').fontSize(11).fillColor('#16a34a')
        .text('Browse & buy before you arrive.', 12, yOffset + 106, { width: 282, align: 'center', lineBreak: false });

      doc.image(qrTableTent, FK_QR_X_FRONT, yOffset + 125, { width: FK_QR_SIZE, height: FK_QR_SIZE });

      doc
        .font('Helvetica').fontSize(9).fillColor('#999999')
        .text('Scan to view items online', 12, yOffset + 322, { width: 282, align: 'center', lineBreak: false });

      doc.rect(0, yOffset, PANEL_W_FULL, TENT_H_FULL).lineWidth(1).stroke('#cccccc');

      // ── RIGHT PANEL (back) ──────────────────────────────────────────────
      doc
        .moveTo(PANEL_W_FULL, yOffset).lineTo(PANEL_W_FULL, yOffset + TENT_H_FULL)
        .dash(5, { space: 5 }).lineWidth(1).stroke('#aaaaaa').undash();

      doc.rect(PANEL_W_FULL, yOffset, PANEL_W_FULL, 50).fill('#16a34a');
      doc
        .font('Helvetica-Bold').fontSize(22).fillColor('#ffffff')
        .text('finda.sale', PANEL_W_FULL + 10, yOffset + 13, { width: 286, align: 'center', lineBreak: false });

      doc
        .font('Helvetica-Bold').fontSize(12).fillColor('#1a1a2e')
        .text('Browse & buy before you arrive.', PANEL_W_FULL + 12, yOffset + 60, { width: 282, align: 'center', lineBreak: false });

      doc
        .font('Helvetica').fontSize(10).fillColor('#666666')
        .text(sale.title, PANEL_W_FULL + 12, yOffset + 80, { width: 282, align: 'center', lineBreak: false });

      doc.moveTo(PANEL_W_FULL + 12, yOffset + 98).lineTo(PANEL_W_FULL + 294, yOffset + 98).lineWidth(0.5).stroke('#dddddd');

      doc.image(qrTableTent, FK_QR_X_BACK, yOffset + 110, { width: FK_QR_SIZE, height: FK_QR_SIZE });

      doc
        .font('Helvetica').fontSize(9).fillColor('#999999')
        .text('Scan to view items online', PANEL_W_FULL + 12, yOffset + 307, { width: 282, align: 'center', lineBreak: false });

      doc
        .font('Helvetica').fontSize(9).fillColor('#aaaaaa')
        .text(fkTypeAndDate, PANEL_W_FULL + 12, yOffset + 325, { width: 282, align: 'center', lineBreak: false });

      doc.rect(PANEL_W_FULL, yOffset, PANEL_W_FULL, TENT_H_FULL).lineWidth(1).stroke('#cccccc');
    }

    // PAGE 4: Check-In / Virtual Queue QR
    doc.addPage({ size: 'LETTER', margin: 0 });
    const qrSize_interactive = 480; // ~6.7 inches
    const qrX_interactive = (PAGE_W - qrSize_interactive) / 2;

    doc
      .fontSize(26)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text('Check In & Join the Line', PAGE_MARGIN, 30, { width: PAGE_W - PAGE_MARGIN * 2, align: 'center' });

    doc.image(qrCheckIn, qrX_interactive, 75, { width: qrSize_interactive, height: qrSize_interactive });

    doc
      .fontSize(13)
      .fillColor('#333333')
      .font('Helvetica')
      .text('Scan with your phone to check in, browse items, and join the virtual queue for entry.', PAGE_MARGIN, 570, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(10)
      .fillColor('#999999')
      .text('finda.sale', PAGE_MARGIN, 750, { width: PAGE_W - PAGE_MARGIN * 2, align: 'center' });

    // PAGE 5: Treasure Hunt QR
    doc.addPage({ size: 'LETTER', margin: 0 });

    doc
      .fontSize(26)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text('Scan to Hunt for Treasure', PAGE_MARGIN, 30, { width: PAGE_W - PAGE_MARGIN * 2, align: 'center' });

    doc.image(qrTreasureHunt, qrX_interactive, 75, { width: qrSize_interactive, height: qrSize_interactive });

    doc
      .fontSize(13)
      .fillColor('#333333')
      .font('Helvetica')
      .text('Scan at each clue location to unlock the next hint and earn XP rewards.', PAGE_MARGIN, 570, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(10)
      .fillColor('#999999')
      .text('finda.sale', PAGE_MARGIN, 750, { width: PAGE_W - PAGE_MARGIN * 2, align: 'center' });

    // PAGE 6: Photo Station QR
    doc.addPage({ size: 'LETTER', margin: 0 });

    doc
      .fontSize(26)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text('Scan to Snap a Photo & Earn XP', PAGE_MARGIN, 30, { width: PAGE_W - PAGE_MARGIN * 2, align: 'center' });

    doc.image(qrPhotoStation, qrX_interactive, 75, { width: qrSize_interactive, height: qrSize_interactive });

    doc
      .fontSize(13)
      .fillColor('#333333')
      .font('Helvetica')
      .text('Take a photo of your favorite find and share it to earn XP.', PAGE_MARGIN, 570, {
        width: PAGE_W - PAGE_MARGIN * 2,
        align: 'center',
      });

    doc
      .fontSize(10)
      .fillColor('#999999')
      .text('finda.sale', PAGE_MARGIN, 750, { width: PAGE_W - PAGE_MARGIN * 2, align: 'center' });

    // PAGE 7+: Price Sheet
    doc.addPage({ size: 'LETTER', margin: 0 });
    await renderPriceSheet(doc, saleId, sale.title, frontendUrl);

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

    const frontendUrl = process.env.FRONTEND_URL || 'https://finda.sale';

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="price-sheet-${saleId}.pdf"`);
    doc.pipe(res);

    // Use helper to render price sheet content
    await renderPriceSheet(doc, saleId, sale.title, frontendUrl);

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
