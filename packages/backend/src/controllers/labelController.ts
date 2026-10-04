// W2: Label printing — generates printer-ready PDF labels via Puppeteer HTML→PDF
// Single-item label: GET /api/items/:id/label
// All items in a sale:  GET /api/sales/:saleId/labels

import { Response } from 'express';
import QRCode from 'qrcode';
import type { Page } from 'puppeteer';
import { buildItemQrUrl, QR_SOURCE_ITEM_LABEL } from '../utils/qrUrl';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { resolveItemOwnerOrganizer } from '../utils/itemOwner';

/**
 * HTML-escape a value before it is interpolated into the label HTML. Item titles, sale titles, categories and
 * conditions are organizer-typed (or imported) free text, and the HTML is rendered by headless Chrome, so
 * every interpolated string goes through this. Escapes & < > " ' ; apply it AFTER any decode step so decoded
 * entities (e.g. &lt;) are escaped again instead of becoming markup.
 */
const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Defense in depth for the label renderer (Chrome runs with --no-sandbox): no page script can run, and the
 * only requests allowed are data: URLs (the inline QR PNGs) and about:blank. Anything else (an injected
 * <img src="http://..."> or <link>) is aborted, so even a missed escape cannot exfiltrate or fetch.
 * Must be called before page.setContent.
 */
async function lockDownLabelPage(page: Page): Promise<void> {
  await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('data:') || url === 'about:blank') {
      void Promise.resolve(request.continue()).catch(() => undefined);
    } else {
      void Promise.resolve(request.abort()).catch(() => undefined);
    }
  });
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
      include: {
        sale: {
          select: {
            title: true,
            organizer: { select: { id: true, userId: true, subscriptionTier: true, lat: true, lng: true } },
          },
        },
      },
    });
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    // Only the owner: the sale's organizer for a sale item, or the inventory organizer for a saleless item.
    // Default deny (a null owner is a 403). Inventory items are labelled too, just without a sale line.
    const owner = await resolveItemOwnerOrganizer(item, req.user?.id);
    if (!owner) {
      return res.status(403).json({ message: 'Not your item.' });
    }

    // Generate QR code for item URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const itemUrl = buildItemQrUrl(frontendUrl, id, QR_SOURCE_ITEM_LABEL); // utm_source=qr_item_label so the item page shows the QR scan prompt
    const qrDataUrl = await QRCode.toDataURL(itemUrl, {
      type: 'image/png',
      width: 300, // source PNG resolution; printed size is set by the .label-qr img CSS rule
      margin: 4, // QR-spec minimum quiet zone (was 1)
      errorCorrectionLevel: 'M', // explicit; the stamped utm_source makes the URL longer than a bare /items/:id
      color: { dark: '#000000', light: '#ffffff' },
    });

    // Decode category helper
    const decodeCategory = (raw: string | null): string | null => {
      if (!raw) return null;
      const decoded = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      const parts = decoded.split(':').map(s => s.trim()).filter(Boolean);
      return parts.length > 2 ? parts.slice(-2).join(': ') : decoded;
    };
    const chips = [decodeCategory(item.category), item.condition].filter(Boolean).map(esc).join('  ·  ');

    // Build HTML for single label (4"×3")
    const labelHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 4in 3.333in; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Helvetica, Arial, sans-serif; margin: 0; padding: 0; }
    .label-container {
      width: 4in;
      height: 3.333in;
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
    .avery-note { font-size: 6pt; color: #cccccc; text-align: center; padding-top: 0.05in; }
  </style>
</head>
<body>
  <div class="avery-note">Avery&#174; 5164 &middot; 4&#34; &times; 3&#8531;&#34; &middot; 6 per sheet</div>
  <div class="label-container">
    <div class="label-text">
      ${item.sale ? `<div class="label-sale">${esc(item.sale.title)}</div>` : ''}
      <div class="label-title">${esc(item.title)}</div>
      <div class="label-price">$${item.price != null ? item.price.toFixed(2) : 'POA'}</div>
      ${chips ? `<div class="label-chips">${chips}</div>` : ''}
      <div class="label-id">ID: ${esc(id)}</div>
    </div>
    <div>
      <div class="label-qr">
        <img src="${esc(qrDataUrl)}" alt="QR">
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
      await lockDownLabelPage(page);
      await page.setContent(labelHtml, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({
        width: '4in',
        height: '3.333in',
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
      const qrDataUrl = await QRCode.toDataURL(buildItemQrUrl(frontendUrl, item.id, QR_SOURCE_ITEM_LABEL), {
        type: 'image/png',
        width: 300, // source PNG resolution; printed size is set by the .label-qr img CSS rule
        margin: 4, // QR-spec minimum quiet zone (was 1)
        errorCorrectionLevel: 'M', // explicit; the stamped utm_source makes the URL longer than a bare /items/:id
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
    /* Avery 5164 — 4" × 3-1/3" shipping labels, 6 per sheet */
    .page {
      width: 8.5in;
      height: 11in;
      padding: 0.5in 0.156in 0 0.156in;
      display: grid;
      grid-template-columns: repeat(2, 4in);
      grid-template-rows: repeat(3, 3.333in);
      column-gap: 0.1875in;
      row-gap: 0;
      page-break-after: always;
    }
    .label {
      width: 4in;
      height: 3.333in;
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
    /* Avery 5164 note — prints below last label row, outside perforation area */
    .avery-note { font-size: 6pt; color: #cccccc; text-align: left; padding: 0.05in 0.156in 0; }
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
        const chips = [decodeCategory(item.category), item.condition].filter(Boolean).map(esc).join('  ·  ');
        const qrDataUrl = qrDataUrls[i];

        labelsHtml += `
          <div class="label">
            <div class="label-text">
              <div class="label-sale">${esc(sale.title)}</div>
              <div class="label-title">${esc(item.title)}</div>
              <div class="label-price">$${item.price != null ? item.price.toFixed(2) : 'POA'}</div>
              ${chips ? `<div class="label-chips">${chips}</div>` : ''}
              <div class="label-id">ID: ${esc(item.id)}</div>
            </div>
            <div>
              <div class="label-qr">
                <img src="${esc(qrDataUrl)}" alt="QR">
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

    labelsHtml += '<div class="avery-note">Avery&#174; 5164 &middot; 4&#34; &times; 3&#8531;&#34; shipping labels &middot; 6 per sheet</div>';
    labelsHtml += '</body></html>';

    // Use Puppeteer to render to PDF
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await lockDownLabelPage(page);
      await page.setContent(labelsHtml, { waitUntil: 'load' });
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
