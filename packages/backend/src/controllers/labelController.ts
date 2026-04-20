// W2: Label printing — generates printer-ready PDF labels via Puppeteer HTML→PDF
// Single-item label: GET /api/items/:id/label
// All items in a sale:  GET /api/sales/:saleId/labels

import { Response } from 'express';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

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
    if (item.sale!.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your item.' });
    }

    // Generate QR code for item URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const itemUrl = `${frontendUrl}/items/${id}`;
    const qrDataUrl = await QRCode.toDataURL(itemUrl, {
      type: 'image/png',
      width: 200,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });

    // Decode category helper
    const decodeCategory = (raw: string | null): string | null => {
      if (!raw) return null;
      const decoded = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      const parts = decoded.split(':').map(s => s.trim()).filter(Boolean);
      return parts.length > 2 ? parts.slice(-2).join(': ') : decoded;
    };
    const chips = [decodeCategory(item.category), item.condition].filter(Boolean).join('  ·  ');

    // Build HTML for single label (4"×3")
    const labelHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 4in 3in; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Helvetica, Arial, sans-serif; margin: 0; padding: 0; }
    .label-container {
      width: 4in;
      height: 3in;
      padding: 0.1in;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .label-text {
      flex: 1;
      padding-right: 0.1in;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .label-sale { font-size: 7pt; color: #888888; }
    .label-title { font-size: 16pt; font-weight: bold; color: #111111; margin: 0.05in 0; }
    .label-price { font-size: 22pt; font-weight: bold; color: #16a34a; margin: 0.05in 0; line-height: 1; }
    .label-chips { font-size: 8pt; color: #555555; margin: 0.05in 0; }
    .label-id { font-size: 6pt; color: #cccccc; }
    .label-qr {
      width: 0.9in;
      height: 0.9in;
      flex-shrink: 0;
    }
    .label-qr img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .label-scan { font-size: 6pt; color: #aaaaaa; text-align: center; margin-top: 0.02in; }
  </style>
</head>
<body>
  <div class="label-container">
    <div class="label-text">
      <div class="label-sale">${item.sale!.title}</div>
      <div class="label-title">${item.title}</div>
      <div class="label-price">$${item.price != null ? item.price.toFixed(2) : 'POA'}</div>
      ${chips ? `<div class="label-chips">${chips}</div>` : ''}
      <div class="label-id">ID: ${id}</div>
    </div>
    <div>
      <div class="label-qr">
        <img src="${qrDataUrl}" alt="QR">
      </div>
      <div class="label-scan">Scan</div>
    </div>
  </div>
</body>
</html>`;

    // Use Puppeteer to render to PDF
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(labelHtml, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        width: '4in',
        height: '3in',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="label-${id}.pdf"`);
      res.end(pdfBuffer);
    } finally {
      await browser.close();
    }
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

    // Generate all QR codes as data URLs upfront
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const qrDataUrls: string[] = [];
    for (const item of sale.items) {
      const qrDataUrl = await QRCode.toDataURL(`${frontendUrl}/items/${item.id}`, {
        type: 'image/png',
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });
      qrDataUrls.push(qrDataUrl);
    }

    // Decode category helper
    const decodeCategory = (raw: string | null): string | null => {
      if (!raw) return null;
      const decoded = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      const parts = decoded.split(':').map(s => s.trim()).filter(Boolean);
      return parts.length > 2 ? parts.slice(-2).join(': ') : decoded;
    };

    // Build HTML for 2×3 grid layout
    let labelsHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Helvetica, Arial, sans-serif; }
    .page {
      width: 8.5in;
      height: 11in;
      padding: 1in 0.25in;
      display: grid;
      grid-template-columns: repeat(2, 4in);
      grid-template-rows: repeat(3, 3in);
      column-gap: 0;
      row-gap: 0;
      page-break-after: always;
    }
    .label {
      width: 4in;
      height: 3in;
      padding: 0.15in;
      border: 1px solid #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-sizing: border-box;
    }
    .label-text {
      flex: 1;
      padding-right: 0.1in;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .label-sale { font-size: 7pt; color: #888888; }
    .label-title { font-size: 16pt; font-weight: bold; color: #111111; margin: 0.05in 0; }
    .label-price { font-size: 22pt; font-weight: bold; color: #16a34a; margin: 0.05in 0; line-height: 1; }
    .label-chips { font-size: 8pt; color: #555555; margin: 0.05in 0; }
    .label-id { font-size: 6pt; color: #cccccc; }
    .label-qr {
      width: 0.9in;
      height: 0.9in;
      flex-shrink: 0;
    }
    .label-qr img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .label-scan { font-size: 6pt; color: #aaaaaa; text-align: center; margin-top: 0.02in; }
  </style>
</head>
<body>`;

    const LABELS_PER_PAGE = 6;
    const totalPages = Math.ceil(sale.items.length / LABELS_PER_PAGE);

    for (let page = 0; page < totalPages; page++) {
      labelsHtml += '<div class="page">';

      const pageStart = page * LABELS_PER_PAGE;
      const pageEnd = Math.min(pageStart + LABELS_PER_PAGE, sale.items.length);

      for (let i = pageStart; i < pageEnd; i++) {
        const item = sale.items[i];
        const chips = [decodeCategory(item.category), item.condition].filter(Boolean).join('  ·  ');
        const qrDataUrl = qrDataUrls[i];

        labelsHtml += `
          <div class="label">
            <div class="label-text">
              <div class="label-sale">${sale.title}</div>
              <div class="label-title">${item.title}</div>
              <div class="label-price">$${item.price != null ? item.price.toFixed(2) : 'POA'}</div>
              ${chips ? `<div class="label-chips">${chips}</div>` : ''}
              <div class="label-id">ID: ${item.id}</div>
            </div>
            <div>
              <div class="label-qr">
                <img src="${qrDataUrl}" alt="QR">
              </div>
              <div class="label-scan">Scan</div>
            </div>
          </div>`;
      }

      // Pad remaining slots with empty labels if not on last page
      for (let i = pageEnd; i < pageStart + LABELS_PER_PAGE && page < totalPages - 1; i++) {
        labelsHtml += '<div class="label"></div>';
      }

      labelsHtml += '</div>';
    }

    labelsHtml += '</body></html>';

    // Use Puppeteer to render to PDF
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(labelsHtml, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="labels-${saleId}.pdf"`);
      res.end(pdfBuffer);
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error('getSaleLabels error:', error);
    res.status(500).json({ message: 'Failed to generate labels.' });
  }
};
