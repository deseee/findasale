/**
 * Label Sheet Composer — batch QR pricetag generation for Avery 5160
 *
 * Endpoints:
 *   GET  /api/organizers/:saleId/cheatsheet         → preset prices
 *   GET  /api/organizers/:saleId/items-for-labels    → paginated priced-item search
 *   POST /api/organizers/:saleId/label-batch         → create batch, assign tagIds
 *   GET  /api/organizers/batches/:batchId/print      → PDF with QR labels
 */

import { Response } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { CHEATSHEET_PRICES } from '../constants/cheatsheet';

// ---------------------------------------------------------------------------
// Avery 5160 constants (all in points, 72 DPI)
// ---------------------------------------------------------------------------
const COLS = 3;
const ROWS = 10;
const LABELS_PER_PAGE = COLS * ROWS; // 30
const CELL_W = 189;      // 2.625"
const CELL_H = 72;       // 1.0"
const H_GAP = 9;         // 0.125" gutter between columns
const LEFT_MARGIN = 13.5; // 3/16"
const TOP_MARGIN = 36;    // 0.5"

// QR code standard sizes for label printing (Avery 5160)
const QR_SIZE_LABEL = 48;     // Small label QR for price tags

// ---------------------------------------------------------------------------
// In-memory batch store (ephemeral — v1 has no DB persistence for batches)
// ---------------------------------------------------------------------------
interface TagRecord {
  tagId: string;
  price: number;
  itemId?: string;
  position: number;
}

interface StoredBatch {
  batchId: string;
  saleId: string;
  saleTitle: string;
  saleDates: string; // e.g. "4/17–19"
  tags: TagRecord[];
  createdAt: number;
}

const batchStore = new Map<string, StoredBatch>();

// Cleanup batches older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, batch] of batchStore) {
    if (batch.createdAt < cutoff) batchStore.delete(id);
  }
}, 15 * 60 * 1000);

function generateId(length = 10): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function formatDateRange(start: Date, end: Date): string {
  const sMonth = start.getMonth() + 1;
  const sDay = start.getDate();
  const eDay = end.getDate();
  if (start.getMonth() === end.getMonth()) {
    return `${sMonth}/${sDay}–${eDay}`;
  }
  const eMonth = end.getMonth() + 1;
  return `${sMonth}/${sDay}–${eMonth}/${eDay}`;
}

// ---------------------------------------------------------------------------
// Auth helper — reusable across all endpoints
// ---------------------------------------------------------------------------
type AuthResult =
  | { ok: false; error: string; status: number }
  | { ok: true; sale: NonNullable<Awaited<ReturnType<typeof prisma.sale.findUnique>>> };

async function authorizeOrganizerForSale(req: AuthRequest, saleId: string): Promise<AuthResult> {
  const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
  if (!req.user || !hasOrganizerRole) return { ok: false, error: 'Organizer access required.', status: 403 };

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { organizer: { select: { userId: true } } },
  });
  if (!sale) return { ok: false, error: 'Sale not found.', status: 404 };
  if (sale.organizer.userId !== req.user.id) return { ok: false, error: 'Not your sale.', status: 403 };

  return { ok: true, sale };
}

// ---------------------------------------------------------------------------
// GET /api/organizers/:saleId/cheatsheet
// ---------------------------------------------------------------------------
export const getCheatsheet = async (req: AuthRequest, res: Response) => {
  try {
    const auth = await authorizeOrganizerForSale(req, req.params.saleId);
    if (!auth.ok) return res.status(auth.status).json({ message: auth.error });

    return res.json({ prices: CHEATSHEET_PRICES });
  } catch (error) {
    console.error('getCheatsheet error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/organizers/:saleId/items-for-labels
// ---------------------------------------------------------------------------
export const getItemsForLabels = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const auth = await authorizeOrganizerForSale(req, saleId);
    if (!auth.ok) return res.status(auth.status).json({ message: auth.error });

    const q = (req.query.q as string || '').trim();
    const category = req.query.category as string | undefined;
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    // Build where clause for Prisma
    const titleFilter = q ? { contains: q, mode: 'insensitive' as const } : undefined;
    const categoryFilter = category ? { contains: category, mode: 'insensitive' as const } : undefined;
    const priceFilter: Record<string, number | null> = { not: null };
    if (minPrice !== undefined) priceFilter.gte = minPrice;
    if (maxPrice !== undefined) priceFilter.lte = maxPrice;

    const items = await prisma.item.findMany({
      where: {
        saleId,
        price: priceFilter,
        status: 'AVAILABLE',
        isActive: true,
        ...(titleFilter ? { title: titleFilter } : {}),
        ...(categoryFilter ? { category: categoryFilter } : {}),
      },
      select: {
        id: true,
        sku: true,
        title: true,
        price: true,
        category: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = items.length > limit;
    const results = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    return res.json({
      items: results.map((item: { id: string; sku: string | null; title: string; price: number | null; category: string | null }) => ({
        id: item.id,
        code: item.sku || item.id.slice(-6).toUpperCase(),
        name: item.title,
        price: item.price ?? 0,
        category: item.category,
        needsTag: true, // v1: always true — tag tracking is a follow-up
      })),
      nextCursor,
    });
  } catch (error) {
    console.error('getItemsForLabels error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ---------------------------------------------------------------------------
// POST /api/organizers/:saleId/label-batch
// ---------------------------------------------------------------------------
export const createLabelBatch = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const auth = await authorizeOrganizerForSale(req, saleId);
    if (!auth.ok) return res.status(auth.status).json({ message: auth.error });

    const { items, leftoverFill } = req.body as {
      items: Array<{ price: number; qty: number; source: { kind: string; itemId?: string } }>;
      leftoverFill?: number | null;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Batch must contain at least one item.' });
    }

    const batchId = generateId(12);
    const tags: TagRecord[] = [];
    let position = 0;

    for (const item of items) {
      const qty = Math.max(1, Math.min(item.qty, 300)); // cap at 300 per row
      for (let i = 0; i < qty; i++) {
        tags.push({
          tagId: generateId(10),
          price: item.price,
          itemId: item.source.kind === 'item' ? item.source.itemId : undefined,
          position: position++,
        });
      }
    }

    // Apply leftover fill if specified
    if (leftoverFill != null && leftoverFill > 0) {
      const remainder = LABELS_PER_PAGE - (tags.length % LABELS_PER_PAGE);
      if (remainder > 0 && remainder < LABELS_PER_PAGE) {
        for (let i = 0; i < remainder; i++) {
          tags.push({
            tagId: generateId(10),
            price: leftoverFill,
            position: position++,
          });
        }
      }
    }

    const sale = auth.sale;
    const saleDates = formatDateRange(new Date(sale.startDate), new Date(sale.endDate));

    batchStore.set(batchId, {
      batchId,
      saleId,
      saleTitle: sale.title,
      saleDates,
      tags,
      createdAt: Date.now(),
    });

    return res.json({
      batchId,
      tags,
      totalLabels: tags.length,
      totalPages: Math.ceil(tags.length / LABELS_PER_PAGE),
    });
  } catch (error) {
    console.error('createLabelBatch error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/organizers/batches/:batchId/print
// ---------------------------------------------------------------------------
export const printLabelBatch = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { batchId } = req.params;
    const batch = batchStore.get(batchId);
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found or expired. Please regenerate.' });
    }

    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

    // Generate all QR codes upfront as data URLs
    const qrDataUrls: string[] = [];
    for (const tag of batch.tags) {
      const qrUrl = `${FRONTEND_URL}/t/${tag.tagId}`;
      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        type: 'image/png',
        width: QR_SIZE_LABEL,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });
      qrDataUrls.push(qrDataUrl);
    }

    // Build HTML for all pages
    let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Helvetica, Arial, sans-serif; }
    .sheet {
      width: 8.5in;
      height: 11in;
      padding: 0.5in 0.1875in 0in 0.1875in;
      display: grid;
      grid-template-columns: repeat(3, 2.625in);
      grid-template-rows: repeat(10, 1in);
      column-gap: 0.125in;
      row-gap: 0;
      page-break-after: always;
    }
    .label {
      width: 2.625in;
      height: 1in;
      overflow: hidden;
      padding: 0.07in 0.07in 0.06in 0.07in;
      display: flex;
      flex-direction: row;
      align-items: stretch;
    }
    .label-qr {
      width: 0.67in;
      height: 0.67in;
      flex-shrink: 0;
      align-self: center;
    }
    .label-qr img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .label-text {
      flex: 1;
      padding-left: 0.08in;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .label-sale { font-size: 6pt; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .label-price { font-size: 16pt; font-weight: bold; color: #000; line-height: 1; }
    .label-footer { display: flex; justify-content: space-between; }
    .label-brand { font-size: 5pt; color: #999; }
    .label-dates { font-size: 5pt; color: #999; }
  </style>
</head>
<body>`;

    const totalPages = Math.ceil(batch.tags.length / LABELS_PER_PAGE);

    for (let page = 0; page < totalPages; page++) {
      htmlContent += '<div class="sheet">';

      const pageStart = page * LABELS_PER_PAGE;
      const pageEnd = Math.min(pageStart + LABELS_PER_PAGE, batch.tags.length);

      for (let i = pageStart; i < pageEnd; i++) {
        const tag = batch.tags[i];
        const qrDataUrl = qrDataUrls[i];

        htmlContent += `
          <div class="label">
            <div class="label-qr">
              <img src="${qrDataUrl}" alt="QR">
            </div>
            <div class="label-text">
              <div class="label-sale">${batch.saleTitle}</div>
              <div class="label-price">$${tag.price.toFixed(2)}</div>
              <div class="label-footer">
                <div class="label-brand">finda.sale</div>
                <div class="label-dates">${batch.saleDates}</div>
              </div>
            </div>
          </div>`;
      }

      htmlContent += '</div>';
    }

    htmlContent += '</body></html>';

    // Use Puppeteer to render HTML to PDF
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="labels-${batchId}.pdf"`);
      res.end(pdfBuffer);
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error('printLabelBatch error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Server error generating PDF.' });
    }
  }
};
