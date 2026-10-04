/**
 * Label Sheet Composer — batch QR pricetag generation for Avery 5160
 *
 * Endpoints:
 *   GET  /api/organizers/:saleId/cheatsheet         → preset prices
 *   GET  /api/organizers/:saleId/items-for-labels    → paginated priced-item search
 *                                                      (?style=card lists items that have an ItemCard)
 *   POST /api/organizers/:saleId/label-batch         → create batch, assign tagIds
 *   GET  /api/organizers/batches/:batchId/print      → PDF with QR labels
 *
 * ADR-134 section 6 (batch B6): adds labelStyle 'card' and fixes four defects:
 *   1. item lookup is scoped to the authorized sale (no cross-sale item ids)
 *   2. item prices are read from the database, never taken from the request body
 *   3. a batch can only be printed by the user who created it
 *   4. every interpolated string in the label HTML is escaped
 */

import { Response } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { buildItemQrUrl, QR_SOURCE_ITEM_LABEL } from '../utils/qrUrl';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { CHEATSHEET_PRICES } from '../constants/cheatsheet';
import {
  CardLabelSource,
  buildCardLabelText,
  escapeHtml,
  formatLabelPrice,
  renderCardLabelTextHtml,
} from '../services/cardLabelText';

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
const QR_SIZE_LABEL = 600;    // Source PNG resolution for label QR (was 48px -- too few raw pixels per module for a real phone-camera scan of a small printed label; physical print size is unchanged, fixed by the 0.67in CSS box below)

// ---------------------------------------------------------------------------
// In-memory batch store (ephemeral — v1 has no DB persistence for batches)
// ---------------------------------------------------------------------------
interface TagRecord {
  tagId: string;
  price: number | null; // item tags: Item.price read from the database (null prints PRICE?); preset/blank tags: validated number
  itemId?: string;
  position: number;
  room?: string | null; // per-item room tag (Item.roomTag); null when item has none or for preset/blank tags
  name?: string | null; // per-item title (Item.title); shown after the price
  blank?: boolean; // leading skip-slot for partially-used Avery sheets (no QR / no price rendered)
  card?: CardLabelSource | null; // set only for labelStyle 'card' tags whose item has an ItemCard; read from the database
}

type LabelStyle = 'standard' | 'card';

// Largest price accepted for a preset (non-item) label.
const MAX_PRESET_PRICE = 100000;

interface StoredBatch {
  batchId: string;
  saleId: string;
  saleTitle: string;
  saleDates: string; // e.g. "4/17–19"
  tags: TagRecord[];
  createdAt: number;
  organizerUserId: string; // creator; printLabelBatch only serves the batch to this user
  labelStyle: LabelStyle;
}

const batchStore = new Map<string, StoredBatch>();

// Cleanup batches older than 2 hours
const batchSweepTimer = setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, batch] of batchStore) {
    if (batch.createdAt < cutoff) batchStore.delete(id);
  }
}, 15 * 60 * 1000);
// Do not keep the process (or a test runner) alive just for the sweep.
if (typeof batchSweepTimer.unref === 'function') batchSweepTimer.unref();

/** A finite, non-negative price within range, rounded to cents; null when invalid. */
function parsePresetPrice(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > MAX_PRESET_PRICE) return null;
  return Math.round(n * 100) / 100;
}

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
    const cardStyle = req.query.style === 'card';
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

    // Card style lists items that have an ItemCard, including items with no price yet (their label
    // prints PRICE? and the picker shows a warning). Every other style keeps the priced-only filter.
    const items = await prisma.item.findMany({
      where: {
        saleId,
        ...(cardStyle ? { card: { isNot: null } } : { price: priceFilter }),
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
        roomTag: true,
        stockTotal: true,
        stockSold: true,
        card: {
          select: {
            cardName: true,
            setCode: true,
            collectorNumber: true,
            finish: true,
            conditionCode: true,
            grader: true,
            grade: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = items.length > limit;
    const results = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    // Does this sale have any item with a card record? Drives the card option in the style picker.
    const firstCardItem = await prisma.item.findFirst({
      where: { saleId, card: { isNot: null } },
      select: { id: true },
    });

    return res.json({
      items: results.map((item) => ({
        id: item.id,
        code: item.sku || item.id.slice(-6).toUpperCase(),
        name: item.title,
        price: item.price ?? (cardStyle ? null : 0),
        priceMissing: item.price == null,
        category: item.category,
        room: item.roomTag ?? null,
        needsTag: true, // v1: always true — tag tracking is a follow-up
        // Server-built label lines for the picker and the preview, so the browser never formats card text.
        labelText: item.card ? buildCardLabelText(item.card, item.price, item.title) : null,
        // One label per remaining copy (stockTotal - stockSold), at least 1; the per-row cap of 300 applies.
        defaultQty: Math.max(1, Math.min((item.stockTotal ?? 1) - (item.stockSold ?? 0), 300)),
      })),
      nextCursor,
      saleHasCards: firstCardItem !== null,
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

    const body = (req.body ?? {}) as {
      items?: unknown;
      leftoverFill?: unknown;
      startPosition?: unknown;
      labelStyle?: unknown;
    };

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ message: 'Batch must contain at least one item.' });
    }
    if (body.labelStyle != null && body.labelStyle !== 'standard' && body.labelStyle !== 'card') {
      return res.status(400).json({ message: 'Unknown label style.' });
    }
    const labelStyle: LabelStyle = body.labelStyle === 'card' ? 'card' : 'standard';

    // Validate every row. Item rows carry an item id and a count; the price is NEVER read from
    // the request for them (it comes from the database below). Preset rows carry a price because
    // they have no database row, so it is validated instead.
    interface ParsedRow { qty: number; itemId?: string; presetPrice?: number }
    const rows: ParsedRow[] = [];
    for (const raw of body.items as unknown[]) {
      const row = (raw && typeof raw === 'object' ? raw : {}) as {
        price?: unknown;
        qty?: unknown;
        source?: { kind?: unknown; itemId?: unknown };
      };
      const source = row.source;
      if (!source || typeof source !== 'object') {
        return res.status(400).json({ message: 'Each label row needs a source.' });
      }
      const qtyNum = Number(row.qty);
      const qty = Number.isFinite(qtyNum) ? Math.max(1, Math.min(Math.floor(qtyNum), 300)) : 1; // cap at 300 per row
      if (source.kind === 'item') {
        if (typeof source.itemId !== 'string' || source.itemId.length === 0) {
          return res.status(400).json({ message: 'Item rows need an item id.' });
        }
        rows.push({ qty, itemId: source.itemId });
      } else {
        const presetPrice = parsePresetPrice(row.price);
        if (presetPrice === null) {
          return res.status(400).json({ message: 'Invalid label price.' });
        }
        rows.push({ qty, presetPrice });
      }
    }

    let leftoverFill: number | null = null;
    if (body.leftoverFill != null) {
      const parsed = parsePresetPrice(body.leftoverFill);
      if (parsed === null) return res.status(400).json({ message: 'Invalid fill price.' });
      leftoverFill = parsed > 0 ? parsed : null;
    }

    const batchId = generateId(12);
    const tags: TagRecord[] = [];
    let position = 0;

    // Partial-sheet support: pad the first sheet with leading blank slots so the
    // first real label lands at `startPosition` (1 = top-left / normal, no offset).
    const startSlot = Math.max(1, Math.min(Math.floor(Number(body.startPosition)) || 1, LABELS_PER_PAGE));
    for (let i = 0; i < startSlot - 1; i++) {
      tags.push({
        tagId: generateId(10),
        price: 0,
        position: position++,
        blank: true,
      });
    }

    // Authoritative item lookup, scoped to the sale the caller was just authorized for. An item id
    // from another sale or another organizer is not found here, so the whole batch is rejected
    // instead of printing that item's title, price or QR code. Price, title, room and the card
    // record all come from this query, never from the request body.
    const referencedItemIds = Array.from(new Set(rows.filter((r) => r.itemId).map((r) => r.itemId as string)));
    const itemMap = new Map<
      string,
      {
        title: string;
        price: number | null;
        roomTag: string | null;
        card: CardLabelSource | null;
      }
    >();
    if (referencedItemIds.length > 0) {
      const itemRows = await prisma.item.findMany({
        where: { id: { in: referencedItemIds }, saleId },
        select: {
          id: true,
          title: true,
          price: true,
          roomTag: true,
          card: {
            select: {
              cardName: true,
              setCode: true,
              collectorNumber: true,
              finish: true,
              conditionCode: true,
              grader: true,
              grade: true,
            },
          },
        },
      });
      for (const row of itemRows) {
        itemMap.set(row.id, {
          title: row.title,
          price: row.price ?? null,
          roomTag: row.roomTag ?? null,
          card: row.card ?? null,
        });
      }
      if (itemMap.size !== referencedItemIds.length) {
        return res.status(404).json({ message: 'One or more items were not found in this sale.', code: 'ITEM_NOT_IN_SALE' });
      }
    }

    const priceMissingItemIds = new Set<string>();
    let cardLabelCount = 0;
    for (const row of rows) {
      if (row.itemId) {
        const dbItem = itemMap.get(row.itemId);
        if (!dbItem) continue; // unreachable: missing ids were rejected above
        const card = labelStyle === 'card' ? dbItem.card : null;
        if (dbItem.price === null) priceMissingItemIds.add(row.itemId);
        for (let i = 0; i < row.qty; i++) {
          tags.push({
            tagId: generateId(10),
            price: dbItem.price,
            itemId: row.itemId,
            position: position++,
            room: dbItem.roomTag,
            name: dbItem.title,
            card: card ? { ...card, cardName: card.cardName ?? dbItem.title } : null,
          });
          if (card) cardLabelCount++;
        }
      } else {
        for (let i = 0; i < row.qty; i++) {
          tags.push({
            tagId: generateId(10),
            price: row.presetPrice as number,
            position: position++,
          });
        }
      }
    }

    // Apply leftover fill if specified
    if (leftoverFill !== null && leftoverFill > 0) {
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
      organizerUserId: (req.user as { id: string }).id,
      labelStyle,
    });

    return res.json({
      batchId,
      tags,
      totalLabels: tags.length,
      totalPages: Math.ceil(tags.length / LABELS_PER_PAGE),
      labelStyle,
      cardLabelCount,
      priceMissingItemIds: Array.from(priceMissingItemIds),
    });
  } catch (error) {
    console.error('createLabelBatch error:', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/organizers/batches/:batchId/print
// ---------------------------------------------------------------------------
// --- Warm shared Puppeteer browser ---------------------------------------------
// Launching Chromium per request causes the first/cold print to time out. Keep one
// browser warm and reuse it (open a fresh page per request); relaunch if it dies.
let sharedBrowser: any = null;
let browserLaunching: Promise<any> | null = null;

async function getLabelBrowser(): Promise<any> {
  if (sharedBrowser && sharedBrowser.isConnected && sharedBrowser.isConnected()) return sharedBrowser;
  if (browserLaunching) return browserLaunching;
  browserLaunching = (async () => {
    const puppeteer = await import('puppeteer');
    const b = await puppeteer.default.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    b.on('disconnected', () => { if (sharedBrowser === b) sharedBrowser = null; });
    sharedBrowser = b;
    browserLaunching = null;
    return b;
  })();
  return browserLaunching;
}

// Warm the browser on boot so the first label print doesn't pay the cold-launch cost.
getLabelBrowser().catch((e) => console.warn('[labels] browser warm-up failed (will retry on demand):', (e as Error)?.message));

export const printLabelBatch = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { batchId } = req.params;
    const batch = batchStore.get(batchId);
    // Same 404 for "no such batch" and "someone else's batch" so a batch id cannot be probed.
    if (!batch || batch.organizerUserId !== req.user.id) {
      return res.status(404).json({ message: 'Batch not found or expired. Please regenerate.' });
    }

    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

    // Generate all QR codes upfront as data URLs
    const qrDataUrls: string[] = [];
    for (const tag of batch.tags) {
      if (tag.blank) {
        qrDataUrls.push(''); // leading skip-slot — no QR, keeps index aligned with tags
        continue;
      }
      // Direct-resolve URL: item-specific tags link straight to the item page;
      // price-only/misc tags link to POS quick-add (mirrors printKitController.ts
      // patterns). The old `/t/${tagId}` short-link had no resolver route and no
      // DB persistence (batchStore is in-memory, wiped on every restart/deploy) --
      // removed in favor of these permanent, always-resolvable URLs.
      const qrUrl = tag.itemId
        ? buildItemQrUrl(FRONTEND_URL, tag.itemId, QR_SOURCE_ITEM_LABEL)
        : `${FRONTEND_URL}/pos/${batch.saleId}?action=add-misc&price=${(tag.price ?? 0).toFixed(2)}`;
      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        type: 'image/png',
        width: QR_SIZE_LABEL,
        errorCorrectionLevel: 'M', // explicit; the stamped utm_source makes the URL longer than a bare /items/:id
        margin: 4, // QR-spec minimum quiet zone (was 1 -- well below spec, a documented cause of scan failures once printed next to other label content)
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
      position: relative;
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
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
    .label-text {
      flex: 1;
      padding-left: 0.08in;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .label-sale { font-size: 6pt; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .label-price { font-size: 16pt; font-weight: bold; color: #000; line-height: 1; }
    .label-name { font-size: 8pt; color: #000; line-height: 1.12; margin-top: 1px; width: 100%; white-space: normal; overflow-wrap: anywhere; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; max-height: 2.3em; }
    .label-footer { display: flex; justify-content: space-between; align-items: flex-end; }
    .label-brand { font-size: 5pt; color: #000; }
    .label-room { font-size: 5pt; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 1in; text-align: right; }
    .label-date-corner { position: absolute; top: 0.05in; right: 0.06in; font-size: 5pt; color: #000; }
    .card-text { justify-content: space-between; }
    .card-price { font-size: 16pt; font-weight: bold; color: #000; line-height: 1; white-space: nowrap; overflow: hidden; }
    .card-name { font-size: 7.5pt; font-weight: bold; color: #000; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card-set { font-size: 6.5pt; color: #000; line-height: 1.1; white-space: pre; overflow: hidden; text-overflow: ellipsis; min-height: 1.1em; }
    .card-cond { font-size: 7pt; font-weight: bold; color: #000; line-height: 1.1; white-space: nowrap; overflow: hidden; min-height: 1.1em; }
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

        if (tag.blank) {
          htmlContent += '<div class="label"></div>';
          continue;
        }

        // Card label: text comes from the ItemCard row and Item.price read at batch creation.
        // Items without a card record inside a card-style batch fall through to the standard label.
        if (tag.card) {
          htmlContent += `
          <div class="label">
            <div class="label-qr">
              <img src="${qrDataUrl}" alt="QR">
            </div>
            ${renderCardLabelTextHtml(buildCardLabelText(tag.card, tag.price, tag.name))}
          </div>`;
          continue;
        }

        // Every interpolated string is escaped: sale titles, item names and room tags are user input.
        htmlContent += `
          <div class="label">
            <div class="label-date-corner">${escapeHtml(batch.saleDates)}</div>
            <div class="label-qr">
              <img src="${qrDataUrl}" alt="QR">
            </div>
            <div class="label-text">
              <div class="label-sale">${escapeHtml(batch.saleTitle)}</div>
              <div class="label-price">${escapeHtml(formatLabelPrice(tag.price))}</div>
              <div class="label-name">${escapeHtml(tag.name ?? '')}</div>
              <div class="label-footer">
                <div class="label-brand">finda.sale</div>
                <div class="label-room">${escapeHtml(tag.room ?? '')}</div>
              </div>
            </div>
          </div>`;
      }

      htmlContent += '</div>';
    }

    htmlContent += '</body></html>';

    // Render to PDF using the warm shared browser (fast after boot). All images are
    // inline data URLs, so 'load' resolves quickly. Retry once with a fresh browser if
    // the shared instance is stale/crashed.
    const renderPdf = async () => {
      const browser = await getLabelBrowser();
      const page = await browser.newPage();
      try {
        await page.setContent(htmlContent, { waitUntil: 'load' });
        return await page.pdf({
          format: 'Letter',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });
      } finally {
        await page.close().catch(() => {});
      }
    };

    let pdfBuffer;
    try {
      pdfBuffer = await renderPdf();
    } catch (firstErr) {
      console.warn('[labels] render failed, relaunching browser and retrying:', (firstErr as Error)?.message);
      try { if (sharedBrowser) await sharedBrowser.close(); } catch {}
      sharedBrowser = null;
      browserLaunching = null;
      pdfBuffer = await renderPdf();
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="labels-${batchId}.pdf"`);
    res.end(pdfBuffer);
  } catch (error) {
    console.error('printLabelBatch error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Server error generating PDF.' });
    }
  }
};
