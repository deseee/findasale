import { Request, Response } from 'express';
import { parse } from 'csv-parse';
import { AuthRequest } from '../middleware/auth';
import { Readable } from 'stream';
import { prisma } from '../index';
import { v2 as cloudinary } from 'cloudinary';
import { Decimal } from '@prisma/client/runtime/library';
import { ItemRarity } from '@prisma/client';
import axios from 'axios';
import FormData from 'form-data';
import { z } from 'zod';
import { getIO } from '../lib/socket'; // V1: live bidding broadcast
import { fireWebhooks } from '../services/webhookService'; // X1
import { analyzeItemImage, isCloudAIAvailable } from '../services/cloudAIService'; // CB5
import { checkAiTagQuota, incrementAiTagCount } from '../lib/aiTagsQuotaTracker';
import { notifyPriceDropAlerts } from '../services/priceDropService'; // Price drop alerts
import { pushEvent } from '../services/liveFeedService'; // Feature #70: Live Sale Feed
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries'; // Phase 1B: Rapidfire Mode public item filtering
import { computeHealthScore, HealthResult } from '../utils/listingHealthScore'; // Sprint 1: Listing Health Score
import { invalidateCommandCenterCache } from '../services/commandCenterService'; // P2-3: Cache invalidation
import { checkSaleOverLimit, checkItemOverPhotoLimit } from '../lib/tierEnforcement'; // Feature #75: Tier lapse enforcement
import { getClientIp } from '../utils/getClientIp'; // Platform Safety #94: Same-IP Bidder Detection
import { createNotification } from '../services/notificationService'; // P0: Bid notifications
import { closeAuction } from '../services/auctionService'; // Auction close flow
import { haversineDistance } from '../lib/placesService'; // Geofencing for QR scans
import { resetRapidDraftDebounce, rapidfireAIDebounce, heldAnalysisItems } from './uploadController'; // Rapidfire Mode: AI analysis debounce
import { evaluateAutoHighValueFlag, shouldRetainAutoFlag } from '../utils/highValueFlagging'; // Feature #371: Auto high-value flagging
import { awardXp, XP_AWARDS, spendXp, getSpendableXp, checkMonthlyXpCap } from '../services/xpService'; // Phase 2a: XP awards
import { getRankBenefits } from '../utils/rankUtils'; // Phase 2b: Legendary early access filtering
import { enqueueFetchEbayComps } from '../jobs/fetchEbayComps'; // ADR-069 Phase 2: Async eBay comps
import { fetchEbayPriceComps } from './ebayController'; // Bug #326: live listings for EbayCompTiles image grid
import { composeDescription, stripShippingPhrases, DescriptionSource } from '../services/descriptionMerger'; // Item Description Authoring Contract (2026-05-12)
import { checkAndAward } from '../services/achievementService'; // Feature #58: Achievement tracking
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService'; // Bug #461: FB nudge on single-item SOLD
import { republishEbayOffer, ebayPublishWithSelfHeal, ensureConditionValidForCategory } from '../services/ebayPublishService'; // Phase 2 relocation + Phase 3 rewire (ADR 2026-06-30)
import { assertCheckoutAllowed, CheckoutGuardError } from '../services/checkoutGuard'; // S1072 Finding #4: collusion/wash-trade guard

/** Decode HTML entities from CSV/eBay data before writing to the DB. */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Bug #469: Live-listing edit propagation.
 *
 * eBay updates the live listing ONLY after the offer is (re)published — updating
 * the inventory item / offer alone does NOT touch what shoppers see. This helper
 * encapsulates the GET-merge-PUT(inventory item)+republish dance so both the
 * push-on-save path (updateItem) and the internal /reanalyze-item apply path can
 * reuse it without duplicating the eBay proxy/auth boilerplate.
 *
 * It is best-effort and NEVER throws — callers treat a thrown/failed sync as a
 * non-fatal warning. eBay PUT endpoints are full REPLACE (not partial-merge), so
 * we always GET the full inventory item, mutate the changed field(s), and PUT the
 * complete object back. A `25402` business-policy *warning* in a 2xx publish body
 * is benign — any 2xx publish is treated as success.
 *
 * Primary eBay category is intentionally NOT changed here: eBay locks the primary
 * category on active listings (changing it requires an end + relist). Callers that
 * detect a category drift should surface it separately.
 */
export async function syncListedItemFieldsToEbay(params: {
  organizerId: string;
  ebayOfferId: string;
  title?: string | null;
  description?: string | null;
  /** eBay Inventory API condition enum (e.g. NEW, USED_GOOD) — already mapped by caller. */
  conditionEnum?: string | null;
  /** Optional pre-refreshed access token; if omitted the helper refreshes its own. */
  accessToken?: string | null;
  logTag?: string;
}): Promise<{ synced: boolean; published: boolean; reason?: string }> {
  const tag = params.logTag ?? `[eBay Sync] offer ${params.ebayOfferId}`;
  try {
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    const proxySecret = process.env.EBAY_PROXY_SECRET;
    const proxyHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Language': 'en-US',
      'Accept-Language': 'en-US',   // Bug #506: missing header caused errorId 25709 on republish
      ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
    };

    let accessToken = params.accessToken ?? null;
    if (!accessToken) {
      const { refreshEbayAccessToken } = await import('./ebayController');
      accessToken = await refreshEbayAccessToken(params.organizerId);
    }
    if (!accessToken) {
      console.warn(`${tag}: could not obtain eBay access token`);
      return { synced: false, published: false, reason: 'no-token' };
    }
    const authHeaders = { ...proxyHeaders, Authorization: `Bearer ${accessToken}` };

    // 1. GET the offer to recover the REAL SKU (carries a date suffix).
    const offerPath = `/sell/inventory/v1/offer/${encodeURIComponent(params.ebayOfferId)}`;
    let offerObject: Record<string, unknown> | null = null;
    try {
      const offerGetRes = await fetch(
        `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(offerPath)}`,
        { method: 'GET', headers: authHeaders }
      );
      if (offerGetRes.ok) {
        offerObject = (await offerGetRes.json()) as Record<string, unknown>;
      } else {
        console.warn(`${tag}: offer GET failed HTTP ${offerGetRes.status}`);
      }
    } catch (offerGetErr) {
      console.warn(`${tag}: offer GET failed:`, (offerGetErr as Error).message);
    }

    const sku = offerObject ? (offerObject.sku as string | undefined) : undefined;
    if (!sku) {
      return { synced: false, published: false, reason: 'no-sku' };
    }

    // 2. GET-merge-PUT the FULL inventory item with the changed fields.
    const invPath = `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
    let invObject: Record<string, unknown> | null = null;
    try {
      const invGetRes = await fetch(
        `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(invPath)}`,
        { method: 'GET', headers: authHeaders }
      );
      if (invGetRes.ok) {
        invObject = (await invGetRes.json()) as Record<string, unknown>;
      } else {
        console.warn(`${tag}: inventory item GET failed for SKU ${sku}: HTTP ${invGetRes.status}`);
      }
    } catch (invGetErr) {
      console.warn(`${tag}: inventory item GET failed for SKU ${sku}:`, (invGetErr as Error).message);
    }

    let changedAny = false;
    if (invObject) {
      const wantTitle = params.title !== undefined && params.title !== null && params.title !== '';
      const wantDesc = params.description !== undefined && params.description !== null && params.description !== '';
      if (wantTitle || wantDesc) {
        const existingProduct = (invObject.product as Record<string, unknown> | undefined) ?? {};
        invObject.product = {
          ...existingProduct,
          ...(wantTitle ? { title: params.title } : {}),
          ...(wantDesc ? { description: params.description } : {}),
        };
        changedAny = true;
      }
      if (params.conditionEnum !== undefined && params.conditionEnum !== null && params.conditionEnum !== '') {
        invObject.condition = params.conditionEnum;
        changedAny = true;
      }

      if (changedAny) {
        const invRes = await fetch(
          `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(invPath)}`,
          { method: 'PUT', headers: authHeaders, body: JSON.stringify(invObject) }
        );
        if (!invRes.ok && invRes.status !== 204) {
          console.warn(`${tag}: inventory item PUT failed for SKU ${sku}: HTTP ${invRes.status}`);
          return { synced: false, published: false, reason: `inv-put-${invRes.status}` };
        }
      }
    } else {
      return { synced: false, published: false, reason: 'no-inventory-item' };
    }

    if (!changedAny) {
      return { synced: false, published: false, reason: 'no-changes' };
    }

    // 3. Republish the offer so the LIVE listing reflects the changes. Any 2xx
    //    (including a 25402 business-policy warning in the body) is success.
    const published = await republishEbayOffer(params.ebayOfferId, authHeaders, frontendUrl, tag);
    return { synced: true, published };
  } catch (err) {
    console.warn(`${tag}: non-fatal sync error:`, (err as Error).message);
    return { synced: false, published: false, reason: 'exception' };
  }
}

// republishEbayOffer moved to services/ebayPublishService.ts (Phase 2 of the eBay
// publish self-heal consolidation, ADR 2026-06-30). Imported at the top of this file.

// Feature #408: Scan & Split — in-memory tracker for simultaneous QR scans on the same item.
// Maps itemId → array of { userId, scannedAt } entries. TTL: 60 seconds.
// No Redis needed — single-instance, ephemeral, POS-day-of-sale usage only.
interface ScanEntry { userId: string; scannedAt: number }
const recentItemScans = new Map<string, ScanEntry[]>();
const SCAN_SPLIT_WINDOW_MS = 60_000; // 60-second window for simultaneous scan detection

/** Prune entries older than the window for a given itemId, then return active entries. */
function getActiveScans(itemId: string): ScanEntry[] {
  const now = Date.now();
  const entries = (recentItemScans.get(itemId) || []).filter(e => now - e.scannedAt < SCAN_SPLIT_WINDOW_MS);
  recentItemScans.set(itemId, entries);
  return entries;
}

// Feature #5: Item listing/transaction types (inlined from shared package)
enum ListingType {
  FIXED = 'FIXED',
  AUCTION = 'AUCTION',
  REVERSE_AUCTION = 'REVERSE_AUCTION',
  LIVE_DROP = 'LIVE_DROP',
  POS = 'POS',
}
const VALID_LISTING_TYPES = Object.values(ListingType) as string[];

// U1: Fire-and-forget embedding helper — never throws, non-blocking
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = 'nomic-embed-text';

function scheduleItemEmbedding(itemId: string, text: string): void {
  setImmediate(async () => {
    try {
      const embedRes = await axios.post(
        `${OLLAMA_URL}/api/embeddings`,
        { model: OLLAMA_EMBED_MODEL, prompt: text },
        { timeout: 10000 }
      );
      const vec: number[] | undefined = embedRes.data?.embedding;
      if (!Array.isArray(vec) || vec.length === 0) return;
      await prisma.item.update({ where: { id: itemId }, data: { embedding: vec } });
    } catch {
      // Ollama unavailable — embedding stays empty, search falls back to text
    }
  });
}

// H7: Zod schema for CSV row validation — prevents injection and malformed data
const csvRowSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long (max 200 chars)').trim(),
  description: z.string().max(2000, 'Description too long (max 2000 chars)').optional().default(''),
  price: z.string().optional(),
  auctionStartPrice: z.string().optional(),
  bidIncrement: z.string().optional(),
  auctionEndTime: z.string().optional(),
  status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'AUCTION_ENDED']).optional().default('AVAILABLE'),
  photoUrls: z.string().optional(),
  category: z.string().max(50).optional(),
  condition: z.string().max(50).optional(),
  // CD2 Phase 4: Reverse Auction
  reverseAuction: z.string().optional(),
  reverseDailyDrop: z.string().optional(),
  reverseFloorPrice: z.string().optional(),
  reverseStartDate: z.string().optional(),
});

// Helper function to convert string to number safely
const toNumber = (value: string | undefined | null): number | null => {
  if (!value) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

// Feature #57: Helper to assign item rarity based on price
// Auto-assignment tiers: price >= 500 → LEGENDARY, >= 200 → ULTRA_RARE, >= 75 → RARE, >= 25 → UNCOMMON, else → COMMON
const assignRarity = (price: number | undefined | null): ItemRarity => {
  if (!price || price < 25) return ItemRarity.COMMON;
  if (price >= 500) return ItemRarity.LEGENDARY;
  if (price >= 200) return ItemRarity.ULTRA_RARE;
  if (price >= 75) return ItemRarity.RARE;
  return ItemRarity.UNCOMMON;
};

// Hunt Pass Feature: Helper to check if item is visible to user based on rarity + Hunt Pass status
// Rare/Ultra-Rare: 6 hours early access for Hunt Pass holders
// Legendary: 12 hours early access for Hunt Pass holders
const isItemVisibleToUser = (
  item: { rarity: string; createdAt: Date },
  hasHuntPass: boolean
): boolean => {
  const now = new Date();
  const createdAt = new Date(item.createdAt);
  const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

  if (item.rarity === 'LEGENDARY') {
    // 12 hours early access for Hunt Pass
    return hasHuntPass || hoursSinceCreation >= 12;
  } else if (item.rarity === 'RARE' || item.rarity === 'ULTRA_RARE') {
    // 6 hours early access for Hunt Pass
    return hasHuntPass || hoursSinceCreation >= 6;
  }
  // Common/Uncommon always visible
  return true;
};

// Feature #310: Helper to calculate effective price after applying active discount rules
// Returns null if item has no price, otherwise returns price with discount applied
function getEffectivePrice(
  item: { price: any; tagColor: string | null },
  activeRules: Array<{ tagColor: string; discountPercent: any; activeFrom: Date | null; activeTo: Date | null }>
): number | null {
  if (!item.price) return null;
  const now = new Date();
  const rule = activeRules.find(r =>
    r.tagColor === item.tagColor &&
    (!r.activeFrom || r.activeFrom <= now) &&
    (!r.activeTo || r.activeTo >= now)
  );
  if (!rule) return Number(item.price);
  return Number(item.price) * (1 - Number(rule.discountPercent) / 100);
}

// Simulated image upload function - replace with your actual upload logic
const uploadImages = async (files: Express.Multer.File[]): Promise<string[]> => {
  // Example: upload to Cloudinary and return URLs
  // Replace with your own implementation
  return files.map(file => `https://example.com/uploads/${file.filename}`);
};

// Bulk import items from CSV
export const importItemsFromCSV = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    // Check if sale exists and belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: {
          select: { userId: true }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    // Parse CSV
    const records: any[] = [];
    const parser = Readable.from(file.buffer).pipe(
      parse({
        columns: true,
        skip_empty_lines: true
      })
    );

    for await (const record of parser) {
      records.push(record);
    }

    // H7: Validate and sanitise each row with Zod before inserting
    const itemsToCreate: any[] = [];
    const rowErrors: { row: number; errors: string[] }[] = [];

    records.forEach((record, idx) => {
      // Convert empty strings to undefined for optional fields before validation
      const cleanedRecord = Object.fromEntries(
        Object.entries(record).map(([k, v]) => [k, v === '' ? undefined : v])
      );
      const result = csvRowSchema.safeParse(cleanedRecord);
      if (!result.success) {
        rowErrors.push({
          row: idx + 2, // +2 for 1-indexed + header row
          errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        });
      } else {
        const d = result.data;
        itemsToCreate.push({
          saleId,
          organizerId: sale.organizerId,
          title: d.title,
          description: d.description || '',
          price: toNumber(d.price),
          auctionStartPrice: toNumber(d.auctionStartPrice),
          bidIncrement: toNumber(d.bidIncrement),
          auctionEndTime: d.auctionEndTime ? new Date(d.auctionEndTime) : null,
          status: d.status || 'AVAILABLE',
          category: d.category || null,
          condition: d.condition || null,
          photoUrls: d.photoUrls ? d.photoUrls.split(',').map((url: string) => url.trim()) : [],
          // CD2 Phase 4: Reverse Auction
          reverseAuction: d.reverseAuction === 'true' || d.reverseAuction === '1',
          reverseDailyDrop: d.reverseDailyDrop ? Math.round(parseFloat(d.reverseDailyDrop) * 100) : null,
          reverseFloorPrice: d.reverseFloorPrice ? Math.round(parseFloat(d.reverseFloorPrice) * 100) : null,
          reverseStartDate: d.reverseStartDate ? new Date(d.reverseStartDate) : null,
          embedding: [], // embedding default dropped in migration — must supply explicitly; Ollama will backfill async
          draftStatus: 'PUBLISHED', // Phase 1A: CSV-imported items are deliberate organizer actions — publish immediately
        });
      }
    });

    if (itemsToCreate.length === 0) {
      return res.status(400).json({
        message: 'No valid rows found — all rows failed validation',
        errors: rowErrors,
      });
    }

    // Create items in database
    const createdItems = await prisma.item.createMany({
      data: itemsToCreate,
      skipDuplicates: false
    });

    res.json({
      message: `Successfully imported ${createdItems.count} items${rowErrors.length > 0 ? ` (${rowErrors.length} row(s) skipped due to validation errors)` : ''}`,
      itemCount: createdItems.count,
      ...(rowErrors.length > 0 ? { rowErrors } : {}),
    });
  } catch (error: any) {
    console.error('CSV import error:', error);
    res.status(500).json({
      message: 'Failed to import items from CSV',
      error: error.message
    });
  }
};

// ─── Feature #395: Bulk Import Tool (Phase 1) ────────────────────────────────
// POST /api/items/:saleId/bulk-import
// Accepts multipart/form-data with field `file` (CSV)
// ?confirm=true → performs actual import (createMany)
// Without confirm → returns preview of first 5 rows + detected column names
// Max 200 items per import. draftStatus: DRAFT.

const BULK_IMPORT_MAX = 200;

// Supported column names per FindA.Sale field (case-insensitive)
const FIELD_ALIASES: Record<string, string[]> = {
  title:       ['title', 'name', 'item name', 'item', 'product', 'product name'],
  price:       ['price', 'cost', 'amount', 'sale price', 'retail price', 'asking price'],
  description: ['description', 'desc', 'details', 'notes', 'about'],
  condition:   ['condition', 'grade', 'quality', 'state'],
  category:    ['category', 'type', 'genre', 'department'],
};

const VALID_CONDITIONS = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'];

function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(lower) && !mapping[field]) {
        mapping[field] = header;
        break;
      }
    }
  }
  return mapping;
}

export const bulkImportCSV = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const confirm = req.query.confirm === 'true';
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded. Send a CSV as field "file".' });
      return;
    }

    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      res.status(403).json({ error: 'Organizer access required.' });
      return;
    }

    // Verify organizer owns the sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: { select: { userId: true } } },
    });
    if (!sale) {
      res.status(404).json({ error: 'Sale not found.' });
      return;
    }
    if (sale.organizer.userId !== req.user.id) {
      res.status(403).json({ error: 'Access denied. This sale does not belong to you.' });
      return;
    }

    // Parse CSV from memory buffer
    const records: Record<string, string>[] = [];
    const parser = Readable.from(file.buffer).pipe(
      parse({ columns: true, skip_empty_lines: true, trim: true })
    );
    for await (const record of parser) {
      records.push(record);
    }

    if (records.length === 0) {
      res.status(400).json({ error: 'CSV is empty or has no data rows.' });
      return;
    }

    const headers = Object.keys(records[0]);

    // Preview mode: return first 5 rows + detected column mapping
    if (!confirm) {
      const preview = records.slice(0, 5);
      const detectedMapping = detectColumnMapping(headers);
      res.json({
        headers,
        preview,
        detectedMapping,
        totalRows: records.length,
      });
      return;
    }

    // Confirm mode: read column mapping from request body
    // columnMap: { title: 'Title', price: 'Price', ... } (FindA.Sale field → CSV header)
    const rawMapping = req.body.columnMap;
    let columnMap: Record<string, string> = {};
    try {
      columnMap = typeof rawMapping === 'string' ? JSON.parse(rawMapping) : rawMapping;
    } catch {
      res.status(400).json({ error: 'columnMap must be valid JSON: { "title": "YourTitleColumn", "price": "YourPriceColumn" }' });
      return;
    }

    if (!columnMap.title) {
      res.status(400).json({ error: 'columnMap must include a mapping for "title".' });
      return;
    }
    if (!columnMap.price) {
      res.status(400).json({ error: 'columnMap must include a mapping for "price".' });
      return;
    }

    // Cap at 200 items
    const rowsToProcess = records.slice(0, BULK_IMPORT_MAX);
    const skippedDueToCap = records.length > BULK_IMPORT_MAX ? records.length - BULK_IMPORT_MAX : 0;

    const itemsToCreate: any[] = [];
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < rowsToProcess.length; i++) {
      const record = rowsToProcess[i];
      const rowNum = i + 2; // +2: 1-indexed + header row

      const rawTitle = columnMap.title ? (record[columnMap.title] ?? '').trim() : '';
      const rawPrice = columnMap.price ? (record[columnMap.price] ?? '').trim() : '';
      const rawDescription = columnMap.description ? (record[columnMap.description] ?? '').trim() : '';
      const rawCondition = columnMap.condition ? (record[columnMap.condition] ?? '').trim().toUpperCase() : '';
      const rawCategory = decodeHtmlEntities(columnMap.category ? (record[columnMap.category] ?? '').trim() : '');

      if (!rawTitle) {
        errors.push({ row: rowNum, reason: 'title is required and cannot be empty' });
        continue;
      }

      let price: number | null = null;
      if (rawPrice) {
        const parsed = parseFloat(rawPrice.replace(/[^0-9.]/g, ''));
        if (isNaN(parsed)) {
          errors.push({ row: rowNum, reason: `price "${rawPrice}" is not a valid number` });
          continue;
        }
        price = parsed;
      } else {
        errors.push({ row: rowNum, reason: 'price is required and cannot be empty' });
        continue;
      }

      const condition = rawCondition && VALID_CONDITIONS.includes(rawCondition) ? rawCondition : null;

      itemsToCreate.push({
        saleId,
        organizerId: sale.organizerId,
        title: rawTitle,
        description: rawDescription || '',
        price,
        condition,
        category: rawCategory || null,
        status: 'AVAILABLE',
        draftStatus: 'DRAFT',
        embedding: [],
      });
    }

    if (itemsToCreate.length === 0) {
      res.status(400).json({
        imported: 0,
        skipped: records.length,
        errors,
        message: 'No valid rows to import.',
      });
      return;
    }

    const result = await prisma.item.createMany({
      data: itemsToCreate,
      skipDuplicates: false,
    });

    res.json({
      imported: result.count,
      skipped: errors.length + skippedDueToCap,
      errors,
      ...(skippedDueToCap > 0 ? { cappedAt200: true, rowsIgnoredBeyondCap: skippedDueToCap } : {}),
    });
  } catch (error: any) {
    console.error('Bulk import error:', error);
    res.status(500).json({ error: 'Bulk import failed.', detail: error.message });
  }
};
// ─── End Feature #395 ─────────────────────────────────────────────────────────

export const getItemById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;

    // Use select instead of include to avoid querying columns that may not
    // exist in production yet (tags) or that crash serialization (embedding).
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        saleId: true,
        organizerId: true,
        title: true,
        sku: true,
        description: true,
        price: true,
        auctionStartPrice: true,
        auctionReservePrice: true,
        auctionClosed: true,
        bidIncrement: true,
        auctionEndTime: true,
        currentBid: true,
        status: true,
        category: true,
        ebayCategoryId: true,
        ebayCategoryName: true,
        ebayListingId: true, // S725: surfaces "Live on eBay" badge on edit-item page
        ebayOfferId: true, // S725: surfaces "Pending Publish" + Publish-now button
        ebayNeedsReview: true,
        condition: true,
        photoUrls: true,
        shippingAvailable: true,
        shippingPrice: true,
        listingType: true,
        isAiTagged: true,
        isActive: true,
        isLiveDrop: true,
        liveDropAt: true,
        reverseAuction: true,
        reverseDailyDrop: true,
        reverseFloorPrice: true,
        reverseStartDate: true,
        draftStatus: true,
        conditionGrade: true,
        packageWeightOz: true,
        packageLengthIn: true,
        packageWidthIn: true,
        packageHeightIn: true,
        packageType: true,
        brand: true,
        mpn: true,
        upc: true,
        catalogSuggestions: true,
        tags: true,
        qrEmbedEnabled: true,
        isLegendary: true,
        legendaryVisibleAt: true,
        legendaryPublishedAt: true,
        rarity: true,
        priceBeforeMarkdown: true,
        markdownApplied: true,
        organizerDiscountAmount: true,
        organizerDiscountXp: true,
        createdAt: true,
        updatedAt: true,
        // embedding intentionally excluded — crashes serialization
        sale: {
          select: {
            title: true,
            id: true,
            description: true,
            startDate: true,
            endDate: true,
            zip: true,
            address: true,
            city: true,
            organizerId: true,
            status: true,
            organizer: {
              select: {
                userId: true,
                businessName: true,
                user: {
                  select: { name: true }
                }
              }
            }
          }
        },
        checkoutAttempts: {
          select: { id: true }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Auto-close expired auctions (Phase 1 P0 fix — ADR-013 lazy close)
    if (item.auctionEndTime && new Date(item.auctionEndTime) < new Date() && !item.auctionClosed) {
      await prisma.item.update({
        where: { id: item.id },
        data: { auctionClosed: true }
      }).catch(err => console.warn('[getItemById] Failed to auto-close auction:', err));
      item.auctionClosed = true;
    }

    // Compute cartCount and views
    const cartCount = item.checkoutAttempts?.length ?? 0;
    const views = 0; // Placeholder: item-level view tracking not yet implemented; can be enhanced with dedicated tracking table

    // ADR-013 Phase 2: Compute auction status badge
    let auctionStatus: 'INACTIVE' | 'ACTIVE' | 'ENDING_SOON' | 'ENDED' = 'INACTIVE';
    if (item.listingType === 'AUCTION' && item.auctionEndTime) {
      const timeToEnd = new Date(item.auctionEndTime).getTime() - Date.now();
      if (item.auctionClosed || timeToEnd <= 0) {
        auctionStatus = 'ENDED';
      } else if (timeToEnd < 5 * 60 * 1000) {
        auctionStatus = 'ENDING_SOON';
      } else {
        auctionStatus = 'ACTIVE';
      }
    }

    // Return item with computed fields
    const itemWithCounts = {
      ...item,
      cartCount,
      views,
      auctionStatus, // ADR-013 Phase 2: auction status for UI badge
      checkoutAttempts: undefined // exclude from response
    };

    // Organizer who owns the sale can always access their items (e.g. to edit/un-hide them)
    let isOwner = authReq.user?.id === item.sale?.organizer?.userId;

    // For inventory items (saleId=null), check ownership via denormalized organizerId field
    // (sale join returns null for these items, so the sale-path isOwner check fails)
    if (!isOwner && !item.saleId && (item as any).organizerId && authReq.user) {
      const inventoryOrganizer = await prisma.organizer.findFirst({
        where: { id: (item as any).organizerId, userId: authReq.user.id },
        select: { id: true }
      });
      if (inventoryOrganizer) isOwner = true;
    }

    // Admin can always view any item
    const isAdmin = authReq.user?.role === 'ADMIN';

    // Security: gate items belonging to non-published (DRAFT/ENDED) sales.
    // Owner and admin may still preview; anonymous/other users → 404.
    if (!isOwner && !isAdmin && item.sale && item.sale.status !== 'PUBLISHED') {
      return res.status(404).json({ message: 'Item not found' });
    }

    // For everyone else, enforce public visibility rules: must be active.
    // Allow NULL draftStatus (legacy/seeded items pre-Rapidfire) and PUBLISHED items.
    // Only explicitly DRAFT items are blocked (Rapidfire items being AI-analyzed by organizer).
    if (!isOwner && !isAdmin && (!item.isActive || item.draftStatus === 'DRAFT')) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json(itemWithCounts);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ message: 'Server error while fetching item' });
  }
};

export const getItemsBySaleId = async (req: Request, res: Response) => {
  try {
    const { saleId, status: statusFilter, q: searchQuery, limit: limitParam } = req.query;
    // Try to get user from AuthRequest (optional — public endpoint)
    const user = (req as any).user;

    // Security: gate items of non-published (DRAFT/ENDED) sales. Owner + admin may
    // still preview their own draft sale's items; everyone else gets an empty list.
    if (saleId && typeof saleId === 'string') {
      const parentSale = await prisma.sale.findUnique({
        where: { id: saleId },
        select: { status: true, organizer: { select: { userId: true } } }
      });
      const isSaleOwner = !!user && parentSale?.organizer?.userId === user.id;
      const isSaleAdmin = user?.role === 'ADMIN';
      if (parentSale && parentSale.status !== 'PUBLISHED' && !isSaleOwner && !isSaleAdmin) {
        return res.json([]);
      }
    }

    // Check if user has active Hunt Pass
    const hasHuntPass = user?.huntPassActive && user?.huntPassExpiry && user.huntPassExpiry > new Date();

    // Phase 2b: Get user rank for Legendary item filtering
    const userRank = user?.explorerRank ?? 'INITIATE';

    // Hunt Pass Feature: Rarity-based visibility filtering
    // Query items without visibility restrictions, then filter in app code based on rarity + Hunt Pass
    const filterWhere: any = {
      saleId: saleId as string,
      ...PUBLIC_ITEM_FILTER,
    };

    // POS / organizer item search: respect ?status=AVAILABLE to exclude PENDING_REVIEW items,
    // and ?q= for title/description text filtering. Both params are optional (public browse ignores them).
    if (statusFilter === 'AVAILABLE') {
      filterWhere.status = 'AVAILABLE';
    }
    if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim()) {
      const q = searchQuery.trim();
      filterWhere.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const takeLimit = limitParam ? Math.min(parseInt(limitParam as string, 10) || 500, 500) : 500;

    let items = await prisma.item.findMany({
      where: filterWhere,
      take: takeLimit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        saleId: true,
        title: true,
        description: true,
        price: true,
        auctionStartPrice: true,
        auctionReservePrice: true,
        auctionClosed: true,
        bidIncrement: true,
        auctionEndTime: true,
        status: true,
        category: true,
        ebayCategoryId: true,
        ebayCategoryName: true,
        condition: true,
        photoUrls: true,
        shippingAvailable: true,
        shippingPrice: true,
        listingType: true,
        isAiTagged: true,
        isActive: true,
        isLiveDrop: true,
        liveDropAt: true,
        reverseAuction: true,
        reverseDailyDrop: true,
        reverseFloorPrice: true,
        reverseStartDate: true,
        rarity: true,
        priceBeforeMarkdown: true,
        markdownApplied: true,
        draftStatus: true,
        organizerDiscountAmount: true,
        organizerDiscountXp: true,
        isLegendary: true, // Phase 2b: Legendary early access
        legendaryVisibleAt: true, // Phase 2b: Legendary early access (internal only)
        ebayListingId: true,
        ebayOfferId: true,
        ebayNeedsReview: true,
        isHighValue: true,
        highValueThreshold: true,
        highValueSource: true,
        isHighValueLocked: true,
        tagColor: true, // Feature #310: Color-tagged discount rules
        createdAt: true,
        updatedAt: true,
        // Exclude embedding (binary) and tags (may not exist in prod yet) for lighter response
      }
    });

    // Feature #310: Pre-fetch active discount rules for this workspace (via sale)
    // Get workspace from sale's organizer
    let activeRules: Array<{ tagColor: string; discountPercent: any; activeFrom: Date | null; activeTo: Date | null }> = [];
    if (items.length > 0) {
      const sale = await prisma.sale.findUnique({
        where: { id: saleId as string },
        select: { organizerId: true },
      });
      if (sale) {
        const workspace = await prisma.organizerWorkspace.findFirst({
          where: { ownerId: sale.organizerId },
        });
        if (workspace) {
          activeRules = await prisma.discountRule.findMany({
            where: { workspaceId: workspace.id },
            select: { tagColor: true, discountPercent: true, activeFrom: true, activeTo: true },
          });
        }
      }
    }

    // Fetch active boosts for these items
    const itemIds = items.map(item => item.id);
    const boostsByItemId: Record<string, any> = {};
    if (itemIds.length > 0) {
      const boosts = await prisma.boostPurchase.findMany({
        where: {
          targetType: 'ITEM',
          targetId: { in: itemIds },
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        select: {
          targetId: true,
          boostType: true,
          expiresAt: true,
          status: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      // Index boosts by targetId, keeping only the latest per item
      boosts.forEach((boost: any) => {
        if (boost.targetId && !boostsByItemId[boost.targetId]) {
          boostsByItemId[boost.targetId] = {
            boostType: boost.boostType,
            expiresAt: boost.expiresAt,
            status: boost.status,
          };
        }
      });
    }

    // Filter based on rarity visibility + Hunt Pass status
    items = items.filter(item => isItemVisibleToUser(item, hasHuntPass));

    // Phase 2b: Filter Legendary items based on user rank
    const isSageOrHigher = ['SAGE', 'GRANDMASTER'].includes(userRank);
    items = items.filter(item => {
      if (!item.isLegendary || !item.legendaryVisibleAt) {
        return true; // Non-legendary items always visible
      }
      // Legendary item: check visibility
      const now = new Date();
      const legendaryVisibleAtTime = new Date(item.legendaryVisibleAt);
      if (isSageOrHigher) {
        // Sage/Grandmaster see all legendary items
        return true;
      }
      // Lower ranks see only if time has passed
      return now >= legendaryVisibleAtTime;
    });

    // Remove internal fields and add boost data before sending to client
    const itemsForClient = items.map(item => {
      const { legendaryVisibleAt, ...rest } = item;
      return {
        ...rest,
        boost: boostsByItemId[item.id] ?? null,
        // Feature #310: Add effective price after discount (if any rule applies)
        effectivePrice: getEffectivePrice(item, activeRules),
        tagColor: item.tagColor ?? null,
      };
    });

    res.json(itemsForClient);
  } catch (error) {
    console.error('Error fetching items by sale ID:', error);
    res.status(500).json({ message: 'Server error while fetching items' });
  }
};

export const createItem = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { saleId, title, description, price, auctionStartPrice, auctionReservePrice, bidIncrement, auctionEndTime, status, category, condition, shippingAvailable, shippingPrice, reverseAuction, reverseDailyDrop, reverseFloorPrice, reverseStartDate, listingType, isAiTagged, rarity, aiConfidence } = req.body;
    const files = req.files as Express.Multer.File[];

    // #102: Validate price >= 0
    if (price !== undefined && price !== null) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Price must be a non-negative number.' });
      }
    }

    // #102: Validate auction prices >= 0
    if (auctionStartPrice !== undefined && auctionStartPrice !== null) {
      const parsedPrice = parseFloat(auctionStartPrice);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Auction start price must be a non-negative number.' });
      }
    }

    if (auctionReservePrice !== undefined && auctionReservePrice !== null) {
      const parsedPrice = parseFloat(auctionReservePrice);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Auction reserve price must be a non-negative number.' });
      }
    }

    // Feature #5: Validate listing type if provided
    if (listingType !== undefined && !VALID_LISTING_TYPES.includes(listingType)) {
      return res.status(400).json({
        message: `Invalid listing type "${listingType}". Must be one of: ${VALID_LISTING_TYPES.join(', ')}`
      });
    }

    // Check if sale exists and belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: {
          select: { userId: true }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    // Feature #75: Check tier limits if organizer is in SIMPLE tier
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { subscriptionTier: true }
    });

    if (organizer?.subscriptionTier === 'SIMPLE') {
      const saleLimit = await checkSaleOverLimit(saleId, organizer.subscriptionTier);
      if (saleLimit.isOverLimit) {
        return res.status(403).json({
          message: `Your subscription has lapsed. You have ${saleLimit.itemCount} items (limit: ${saleLimit.limit}). Upgrade to add more items.`,
          code: 'TIER_LIMIT_EXCEEDED'
        });
      }
    }

    // Resolve photo URLs: accept pre-uploaded URLs from body, or upload files now
    let photoUrls: string[] = [];
    if (files && files.length > 0) {
      photoUrls = await uploadImages(files);
    } else if (req.body.photoUrls) {
      photoUrls = Array.isArray(req.body.photoUrls) ? req.body.photoUrls : [req.body.photoUrls];
    }

    // CB5: Legacy standalone tagger removed. AI tagging is now done via
    // POST /upload/analyze-photo (cloudAIService: Google Vision + Claude Haiku).
    // Organizers review suggestions before saving — no silent pre-fill.
    const suggestedTags: string[] = [];

    // Feature #57: Rarity is always auto-assigned from price — organizers cannot set it manually
    const parsedPrice = price ? parseFloat(price) : null;
    const assignedRarity = assignRarity(parsedPrice);

    // Create the item in database
    const item = await prisma.item.create({
      data: {
        saleId,
        organizerId: sale.organizerId,
        title,
        description: description || '',
        price: price ? parseFloat(price) : null,
        auctionStartPrice: auctionStartPrice ? parseFloat(auctionStartPrice) : null,
        auctionReservePrice: auctionReservePrice ? parseFloat(auctionReservePrice) : null,
        bidIncrement: bidIncrement ? parseFloat(bidIncrement) : null,
        auctionEndTime: auctionEndTime ? new Date(auctionEndTime) : null,
        status: status || 'AVAILABLE',
        category: category || null,
        condition: condition || null,
        rarity: assignedRarity,
        photoUrls,
        // W1: Shipping
        shippingAvailable: shippingAvailable === true || shippingAvailable === 'true',
        shippingPrice: shippingPrice ? parseFloat(shippingPrice) : null,
        // B1: Listing type — Feature #5: Default to FIXED if not provided; already validated above
        listingType: listingType || 'FIXED',
        // CD2 Phase 4: Reverse Auction — deprecated, maintained for backwards compat
        reverseAuction: reverseAuction === true || reverseAuction === 'true',
        reverseDailyDrop: reverseDailyDrop ? parseInt(reverseDailyDrop, 10) : null,
        reverseFloorPrice: reverseFloorPrice ? parseInt(reverseFloorPrice, 10) : null,
        reverseStartDate: reverseStartDate ? new Date(reverseStartDate) : null,
        // B2: AI tagging disclosure
        isAiTagged: isAiTagged === true || isAiTagged === 'true',
        // CD2 Phase 2: AI confidence score from batch upload (0.0–1.0); defaults to 0.5
        aiConfidence: aiConfidence ? parseFloat(aiConfidence) : 0.5,
        // U1: satisfies NOT NULL constraint; scheduleItemEmbedding fills it async
        embedding: [],
        // Phase 1A: regular item creation is a deliberate organizer action — publish immediately
        // (Only Rapidfire/uploadRapidfire creates DRAFT items intentionally)
        draftStatus: 'PUBLISHED',
      }
    });

    // #319/#325/#328: Sync Photo table — fire-and-forget, never blocks item creation response
    if (photoUrls.length > 0) {
      prisma.photo.createMany({
        data: photoUrls.map((url, idx) => ({
          itemId: item.id,
          url,
          isPrimary: idx === 0,
          orderIndex: idx,
        })),
      }).catch(err => console.warn('[Photo sync] createMany failed on item create:', err));
    }

    // Return item with suggested tags (could be used by frontend to pre-fill fields)
    res.status(201).json({
      ...item,
      suggestedTags, // optional
    });

    // Feature #58: Award ITEM_LISTED achievement (fire-and-forget)
    checkAndAward(req.user.id, 'ITEM_LISTED').catch(err =>
      console.warn('[achievement] Failed to check ITEM_LISTED:', err)
    );

    // P2-3: Invalidate command center cache after item creation
    invalidateCommandCenterCache(req.user.organizer!.id).catch((err) =>
      console.warn('Failed to invalidate command center cache:', err)
    );

    // U1: Queue embedding generation (non-blocking — after response sent)
    scheduleItemEmbedding(item.id, [title, description, category].filter(Boolean).join(' '));
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ message: 'Server error while creating item' });
  }
};

export const updateItem = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    const { title, description, price, auctionStartPrice, auctionReservePrice, bidIncrement, auctionEndTime, status, category, condition, conditionGrade, shippingAvailable, shippingPrice, reverseAuction, reverseDailyDrop, reverseFloorPrice, reverseStartDate, listingType, isAiTagged, rarity, qrEmbedEnabled, tags, backgroundRemoved, draftStatus, isHighValue, estimatedValue, aiSuggestedPrice, aiConfidence, packageWeightOz, packageLengthIn, packageWidthIn, packageHeightIn, packageType, upc, ean, isbn, mpn, brand, ebayEpid, conditionNotes, allowBestOffer, bestOfferAutoAcceptAmt, bestOfferMinimumAmt, ebaySecondaryCategoryId, ebaySubtitle, ebayCategoryId, ebayCategoryName, isLegendary, lotNumber, costBasis, roomTag } = req.body;

    // #102: Validate price >= 0
    if (price !== undefined && price !== null) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Price must be a non-negative number.' });
      }
    }

    // #102: Validate auction prices >= 0
    if (auctionStartPrice !== undefined && auctionStartPrice !== null) {
      const parsedPrice = parseFloat(auctionStartPrice);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Auction start price must be a non-negative number.' });
      }
    }

    if (auctionReservePrice !== undefined && auctionReservePrice !== null) {
      const parsedPrice = parseFloat(auctionReservePrice);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Auction reserve price must be a non-negative number.' });
      }
    }

    // Feature #5: Validate listing type if provided
    if (listingType !== undefined && !VALID_LISTING_TYPES.includes(listingType)) {
      return res.status(400).json({
        message: `Invalid listing type "${listingType}". Must be one of: ${VALID_LISTING_TYPES.join(', ')}`
      });
    }

    // Feature #363: Validate lot number if provided
    if (lotNumber !== undefined && lotNumber !== null) {
      const lotStr = String(lotNumber).trim();
      if (lotStr.length > 20) {
        return res.status(400).json({ message: 'Lot number must be 20 characters or less' });
      }
    }

    // Fetch item to verify ownership
    const item = await prisma.item.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: { userId: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.sale!.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    // Build update object
    const updateData: any = {};

    // Track which fields the organizer is explicitly editing (D-006)
    const fieldsBeingEdited: string[] = [];

    // Only update fields that are explicitly provided
    if (title !== undefined) {
      updateData.title = title;
      fieldsBeingEdited.push('title');
    }
    if (description !== undefined) {
      updateData.description = description;
      fieldsBeingEdited.push('description');
    }
    if (price !== undefined) {
      updateData.price = price ? parseFloat(price) : null;
      fieldsBeingEdited.push('price');
    }
    if (category !== undefined) {
      updateData.category = category || null;
      fieldsBeingEdited.push('category');
    }
    if (condition !== undefined) {
      updateData.condition = condition || null;
      fieldsBeingEdited.push('condition');
    }
    if (brand !== undefined) {
      // brand is also set later in the eBay parity block — skip here to avoid conflict
      fieldsBeingEdited.push('brand');
    }

    // Feature #57: Rarity is always auto-assigned from price — organizers cannot override it
    if (price !== undefined) {
      const newPrice = price ? parseFloat(price) : null;
      updateData.rarity = assignRarity(newPrice);

      // Bug fix: Initialize priceBeforeMarkdown if not already set by auto-markdown cron
      // This ensures the strikethrough price display works when organizers manually edit prices
      if (!item.priceBeforeMarkdown && newPrice && newPrice > 0) {
        updateData.priceBeforeMarkdown = newPrice;
        updateData.markdownApplied = false;
      }
    }
    if (auctionStartPrice !== undefined) updateData.auctionStartPrice = auctionStartPrice ? parseFloat(auctionStartPrice) : null;
    if (auctionReservePrice !== undefined) updateData.auctionReservePrice = auctionReservePrice ? parseFloat(auctionReservePrice) : null;
    if (bidIncrement !== undefined) updateData.bidIncrement = bidIncrement ? parseFloat(bidIncrement) : null;
    if (auctionEndTime !== undefined) updateData.auctionEndTime = auctionEndTime ? new Date(auctionEndTime) : null;
    if (status !== undefined) updateData.status = status;
    if (ebayCategoryId !== undefined) updateData.ebayCategoryId = ebayCategoryId || null;
    if (ebayCategoryName !== undefined) updateData.ebayCategoryName = ebayCategoryName || null;
    if (conditionGrade !== undefined) updateData.conditionGrade = conditionGrade || null; // #145: Persist condition grade
    if (tags !== undefined) updateData.tags = tags; // #145: Persist tags from review page
    if (backgroundRemoved !== undefined) updateData.backgroundRemoved = backgroundRemoved === true || backgroundRemoved === 'true'; // #145: Persist background removal state
    if (shippingAvailable !== undefined) updateData.shippingAvailable = shippingAvailable === true || shippingAvailable === 'true';
    if (shippingPrice !== undefined) updateData.shippingPrice = shippingPrice ? parseFloat(shippingPrice) : null;
    if (reverseAuction !== undefined) updateData.reverseAuction = reverseAuction === true || reverseAuction === 'true';
    if (reverseDailyDrop !== undefined) updateData.reverseDailyDrop = reverseDailyDrop ? parseInt(reverseDailyDrop, 10) : null;
    if (reverseFloorPrice !== undefined) updateData.reverseFloorPrice = reverseFloorPrice ? parseInt(reverseFloorPrice, 10) : null;
    if (reverseStartDate !== undefined) updateData.reverseStartDate = reverseStartDate ? new Date(reverseStartDate) : null;
    if (listingType !== undefined) updateData.listingType = listingType;
    if (isAiTagged !== undefined) updateData.isAiTagged = isAiTagged === true || isAiTagged === 'true';
    if (qrEmbedEnabled !== undefined) updateData.qrEmbedEnabled = qrEmbedEnabled === true || qrEmbedEnabled === 'true';

    // Handle Legendary toggle: set legendaryPublishedAt when toggling from false→true
    if (isLegendary !== undefined) {
      const newIsLegendary = isLegendary === true || isLegendary === 'true';
      updateData.isLegendary = newIsLegendary;
      if (newIsLegendary && !item.isLegendary) {
        // Transitioning from false to true: set the publish timestamp
        updateData.legendaryPublishedAt = new Date();
      }
    }

    if (draftStatus !== undefined) updateData.draftStatus = draftStatus; // Allow publish/unpublish via generic update

    // Feature #371: Handle high-value flag and AI analysis fields
    if (estimatedValue !== undefined) updateData.estimatedValue = estimatedValue ? parseFloat(estimatedValue) : null;
    if (aiSuggestedPrice !== undefined) updateData.aiSuggestedPrice = aiSuggestedPrice ? parseFloat(aiSuggestedPrice) : null;
    if (aiConfidence !== undefined) updateData.aiConfidence = aiConfidence ? parseFloat(aiConfidence) : null;

    // Feature #371: Handle isHighValue toggle with auto-flag lock logic
    if (isHighValue !== undefined) {
      const newIsHighValue = isHighValue === true || isHighValue === 'true';
      updateData.isHighValue = newIsHighValue;

      // When organizer explicitly toggles isHighValue, lock the decision
      if (newIsHighValue === false) {
        // Organizer said "no" — lock it
        updateData.isHighValueLocked = true;
        updateData.highValueSource = 'MANUAL';
        updateData.highValueFlaggedAt = null;
      } else if (newIsHighValue === true) {
        // Organizer manually flagged it
        updateData.isHighValueLocked = false;
        updateData.highValueSource = 'MANUAL';
        updateData.highValueFlaggedAt = new Date();
      }
    }

    // Phase B: eBay Listing Parity fields
    if (packageWeightOz !== undefined) updateData.packageWeightOz = packageWeightOz === null ? null : Number(packageWeightOz);
    if (packageLengthIn !== undefined) updateData.packageLengthIn = packageLengthIn === null ? null : Number(packageLengthIn);
    if (packageWidthIn !== undefined) updateData.packageWidthIn = packageWidthIn === null ? null : Number(packageWidthIn);
    if (packageHeightIn !== undefined) updateData.packageHeightIn = packageHeightIn === null ? null : Number(packageHeightIn);
    if (packageType !== undefined) updateData.packageType = packageType || null;
    console.log(`[updateItem] id=${id} body.packageType=${JSON.stringify(packageType)} body.packageWeightOz=${JSON.stringify(packageWeightOz)} body.packageLengthIn=${JSON.stringify(packageLengthIn)} updateData.packageType=${JSON.stringify(updateData.packageType)}`);
    if (upc !== undefined) updateData.upc = upc || null;
    if (ean !== undefined) updateData.ean = ean || null;
    if (isbn !== undefined) updateData.isbn = isbn || null;
    if (mpn !== undefined) updateData.mpn = mpn || null;
    if (brand !== undefined) updateData.brand = brand || null;
    if (ebayEpid !== undefined) updateData.ebayEpid = ebayEpid || null;
    if (conditionNotes !== undefined) updateData.conditionNotes = conditionNotes || null;
    if (allowBestOffer !== undefined) updateData.allowBestOffer = allowBestOffer === true || allowBestOffer === 'true';
    if (bestOfferAutoAcceptAmt !== undefined) updateData.bestOfferAutoAcceptAmt = bestOfferAutoAcceptAmt === null ? null : Number(bestOfferAutoAcceptAmt);
    if (bestOfferMinimumAmt !== undefined) updateData.bestOfferMinimumAmt = bestOfferMinimumAmt === null ? null : Number(bestOfferMinimumAmt);
    if (ebaySecondaryCategoryId !== undefined) updateData.ebaySecondaryCategoryId = ebaySecondaryCategoryId || null;
    if (ebaySubtitle !== undefined) updateData.ebaySubtitle = ebaySubtitle ? String(ebaySubtitle).substring(0, 55) : null;
    // Feature #363: Auction Lot Number
    if (lotNumber !== undefined) updateData.lotNumber = lotNumber ? String(lotNumber).trim() : null;
    // Feature #407: Flip Tracker ROI — cost basis for profit/ROI calculation
    if (costBasis !== undefined) updateData.costBasis = costBasis !== null && costBasis !== '' ? parseFloat(costBasis) : null;
    // Feature #411: Dorm Dash — room/area tag for college move-out sales
    if (roomTag !== undefined) updateData.roomTag = roomTag ? String(roomTag).trim() : null;

    // D-006: Update userEditedFields array to track which fields organizer has explicitly set
    // This prevents AI results from overwriting organizer-set values during rapid processing
    if (fieldsBeingEdited.length > 0) {
      const currentEdited = item.userEditedFields || [];
      const mergedEdited = Array.from(new Set([...currentEdited, ...fieldsBeingEdited]));
      updateData.userEditedFields = mergedEdited;
    }

    const updatedItem = await prisma.item.update({
      where: { id },
      data: updateData
    });

    // Feature #314: Log price overrides (fire-and-forget, don't block update if logging fails)
    if (price !== undefined && item.saleId) {
      try {
        const newPrice = price ? parseFloat(price) : null;
        const oldAiSuggested = item.aiSuggestedPrice ? parseFloat(item.aiSuggestedPrice.toString()) : null;

        // Only log if price changed and is non-null
        if (newPrice !== null && newPrice !== (item.price || null)) {
          const sale = await prisma.sale.findUnique({
            where: { id: item.saleId },
            select: { organizerId: true }
          });

          if (sale) {
            const delta = oldAiSuggested !== null ? (newPrice - oldAiSuggested) : null;
            await prisma.priceOverrideLog.create({
              data: {
                itemId: id,
                organizerId: sale.organizerId,
                aiSuggestedPrice: oldAiSuggested,
                organizerPrice: newPrice,
                delta,
                category: item.category || null,
              }
            });
          }
        }
      } catch (err) {
        console.warn(`[priceOverrideLog] Failed to log price override for item ${id}:`, err);
        // Non-blocking: don't fail the update if logging fails
      }
    }

    // Feature #145: Award XP for condition rating (once per item, when organizer submits a grade)
    // Bug #280 (S720): Previously gated on `!item.conditionGrade`, which blocked the award
    // whenever AI auto-populated conditionGrade (via processRapidDraft) before the
    // organizer's first manual save. The pointsTransaction lookup below is the
    // authoritative "once per item" guard, so the in-memory check is unnecessary
    // and was suppressing the legitimate award.
    if (conditionGrade !== undefined && conditionGrade) {
      try {
        // Check if this item has already earned CONDITION_RATING XP
        const existingConditionXp = await prisma.pointsTransaction.findFirst({
          where: {
            userId: req.user.id,
            type: 'CONDITION_RATING',
            itemId: id,
          },
        });

        if (!existingConditionXp) {
          // Check monthly XP cap for CONDITION_RATING (50 XP/month max)
          const monthlyRemaining = await checkMonthlyXpCap(req.user.id, 'CONDITION_RATING');
          if (monthlyRemaining > 0) {
            // Award XP to the organizer (capped at remaining monthly allowance)
            const xpToAward = Math.min(XP_AWARDS.CONDITION_RATING, monthlyRemaining);
            const xpResult = await awardXp(
              req.user.id,
              'CONDITION_RATING',
              xpToAward,
              {
                itemId: id,
                saleId: item.saleId ?? '',
                description: `Condition rating S-D for item "${updatedItem.title}"`,
              }
            );
            // Include rank change in response if available
            if (xpResult?.rankIncreased) {
              (updatedItem as any).rankIncreased = true;
              (updatedItem as any).newRank = xpResult.newRank;
            }
          }
        }
      } catch (err) {
        console.warn('[xpService] Failed to award condition rating XP:', err);
      }
    }

    // Feature #372: Wire auto high-value flagging after AI analysis
    // If aiConfidence or estimatedValue was just updated, re-evaluate auto-flagging
    if ((aiConfidence !== undefined || estimatedValue !== undefined || price !== undefined) && !updatedItem.isHighValueLocked) {
      try {
        const sale = updatedItem.saleId ? await prisma.sale.findUnique({
          where: { id: updatedItem.saleId },
          select: { autoFlagHighValue: true, highValueThresholdUSD: true }
        }) : null;

        if (sale) {
          const shouldFlag = evaluateAutoHighValueFlag(
            updatedItem,
            sale.highValueThresholdUSD?.toNumber() || 500,
            sale.autoFlagHighValue
          );

          // If auto-flagging logic says it should be flagged, update it
          if (shouldFlag && !updatedItem.isHighValue) {
            await prisma.item.update({
              where: { id },
              data: {
                isHighValue: true,
                highValueSource: 'AUTO',
                highValueFlaggedAt: new Date()
              }
            });
          }
        }
      } catch (err) {
        console.warn(`[auto-flag] failed to evaluate item "${id}" for auto-flagging:`, err);
      }
    }

    // Feature #70: Emit price drop event if price was reduced (skip-if-null: inventory items have no saleId)
    if (price !== undefined && item.price && updateData.price !== undefined && updateData.price < item.price && item.saleId) {
      try {
        const io = getIO();
        pushEvent(io, item.saleId, {
          type: 'PRICE_DROP',
          itemTitle: updatedItem.title,
          amount: updateData.price || undefined,
          saleId: item.saleId,
          timestamp: new Date(),
        });
      } catch (err) {
        console.warn('[liveFeed] Failed to emit price drop event:', err);
      }
    }

    // ADR Part B: detect whether this save changed any shipping-determining
    // package input vs. the pre-update item. Used below to trigger a live-offer
    // shipping-policy re-sync. Compare normalized numbers so Decimal/number/null
    // shapes line up (e.g. Prisma Decimal vs. request number).
    const numOrNull = (v: any): number | null =>
      v === undefined || v === null || v === '' ? null : Number(v);
    const shippingInputsChanged =
      (packageWeightOz !== undefined && numOrNull(updatedItem.packageWeightOz) !== numOrNull(item.packageWeightOz)) ||
      (packageLengthIn !== undefined && numOrNull(updatedItem.packageLengthIn) !== numOrNull(item.packageLengthIn)) ||
      (packageWidthIn !== undefined && numOrNull(updatedItem.packageWidthIn) !== numOrNull(item.packageWidthIn)) ||
      (packageHeightIn !== undefined && numOrNull(updatedItem.packageHeightIn) !== numOrNull(item.packageHeightIn)) ||
      (packageType !== undefined && (updatedItem.packageType ?? null) !== (item.packageType ?? null));

    res.json(updatedItem);

    // Bug #461: FB nudge on single-item status → SOLD transition
    if (status === 'SOLD' && item.status !== 'SOLD' && item.fbExportedAt) {
      notifyFacebookExportedItemSold(id).catch(err =>
        console.warn(`[FB Nudge] single-item failed for item ${id}:`, err.message)
      );
    }

    // P2-3: Invalidate command center cache after item update
    invalidateCommandCenterCache(req.user.organizer!.id).catch((err) =>
      console.warn('Failed to invalidate command center cache:', err)
    );

    // Feature #244 Phase 4: Push-on-save eBay sync (fire-and-forget, non-blocking)
    // Only fires if this item is currently live on eBay (has an offer ID)
    if (updatedItem.ebayOfferId) {
      const ebayOfferId = updatedItem.ebayOfferId;
      (async () => {
        try {
          const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
          const proxySecret = process.env.EBAY_PROXY_SECRET;
          const proxyHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Content-Language': 'en-US',
            'Accept-Language': 'en-US',
            ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
          };

          // Refresh access token for this organizer
          const { refreshEbayAccessToken } = await import('../controllers/ebayController');
          const organizer = await prisma.organizer.findUnique({
            where: { userId: req.user!.id },
            select: {
              id: true,
              ebayPolicyMapping: { select: { defaultDescriptionHtml: true } },
            },
          });
          if (!organizer) return;

          const accessToken = await refreshEbayAccessToken(organizer.id);
          if (!accessToken) {
            console.warn(`[eBay PushSync] Could not refresh token for organizer ${organizer.id}`);
            return;
          }

          const authHeaders = { ...proxyHeaders, Authorization: `Bearer ${accessToken}` };

          // eBay PUT endpoints are full REPLACE (not partial-merge). Sending a partial
          // body causes HTTP 400. So we always GET the full object, mutate the changed
          // field(s), then PUT the complete object back. We also fetch the offer first
          // to recover the REAL SKU (which carries a date suffix) — `FAS-${id}` is wrong.
          const offerPath = `/sell/inventory/v1/offer/${encodeURIComponent(ebayOfferId)}`;
          let offerObject: Record<string, unknown> | null = null;
          try {
            const offerGetRes = await fetch(
              `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(offerPath)}`,
              { method: 'GET', headers: authHeaders }
            );
            if (offerGetRes.ok) {
              offerObject = (await offerGetRes.json()) as Record<string, unknown>;
            } else {
              console.warn(`[eBay PushSync] offer GET failed for item ${id}: HTTP ${offerGetRes.status}`);
            }
          } catch (offerGetErr) {
            console.warn(`[eBay PushSync] offer GET failed for item ${id}:`, (offerGetErr as Error).message);
          }

          // Push price if updated — GET-merge-PUT the FULL offer object
          if (offerObject && price !== undefined && updatedItem.price !== null) {
            const pricingSummary = (offerObject.pricingSummary as Record<string, unknown> | undefined) ?? {};
            const priceObj = (pricingSummary.price as Record<string, unknown> | undefined) ?? {};
            offerObject.pricingSummary = {
              ...pricingSummary,
              price: { ...priceObj, value: String(updatedItem.price), currency: (priceObj.currency as string) ?? 'USD' },
            };
            const offerRes = await fetch(
              `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(offerPath)}`,
              { method: 'PUT', headers: authHeaders, body: JSON.stringify(offerObject) }
            );
            if (!offerRes.ok && offerRes.status !== 204) {
              console.warn(`[eBay PushSync] Offer price push failed for item ${id}: HTTP ${offerRes.status}`);
            }
          }

          // Push inventory item fields (title, description, condition) if any were updated
          const inventoryUpdates: Record<string, unknown> = {};
          if (title !== undefined && updatedItem.title) {
            inventoryUpdates['product.title'] = updatedItem.title;
          }
          if (description !== undefined && updatedItem.description !== undefined) {
            // Apply organizer's eBay description template if configured.
            // Bug #424: use split/join to replace ALL occurrences of {{DESCRIPTION}} —
            // String.replace() with a string argument only replaces the first match.
            const templateHtml = organizer.ebayPolicyMapping?.defaultDescriptionHtml ?? null;
            const rawDesc = updatedItem.description ?? '';
            let finalDesc = rawDesc;
            if (templateHtml) {
              if (templateHtml.includes('{{DESCRIPTION}}')) {
                finalDesc = templateHtml.split('{{DESCRIPTION}}').join(rawDesc);
              } else {
                finalDesc = rawDesc ? `${rawDesc}\n\n${templateHtml}` : templateHtml;
              }
            }
            if (finalDesc) {
              inventoryUpdates['product.description'] = finalDesc;
            }
          }
          if (condition !== undefined && updatedItem.condition) {
            // Map FindA.Sale condition → eBay Inventory API condition enum.
            // Then remap to a condition the item's eBay category actually accepts —
            // flat USED_GOOD is rejected (25021) by categories that only accept
            // USED_EXCELLENT (conditionId 3000), e.g. GPS category 156955.
            // ensureConditionValidForCategory() calls eBay's Metadata API and walks
            // the accepted-conditions list to find the closest valid match.
            const condMap: Record<string, string> = {
              NEW: 'NEW',
              USED: 'USED_GOOD',
              REFURBISHED: 'SELLER_REFURBISHED',
              PARTS_OR_REPAIR: 'FOR_PARTS_OR_NOT_WORKING',
            };
            const rawCondition = condMap[updatedItem.condition] ?? 'USED_GOOD';
            // Use the updated ebayCategoryId if the organizer just changed it,
            // otherwise fall back to the pre-update value from item (also selected above).
            const categoryIdForCond = (updatedItem as any).ebayCategoryId ?? item.ebayCategoryId ?? null;
            let finalCondition = rawCondition;
            if (categoryIdForCond) {
              try {
                finalCondition = await ensureConditionValidForCategory(rawCondition, categoryIdForCond);
              } catch (condErr) {
                console.warn(`[eBay PushSync] ensureConditionValidForCategory failed (non-fatal): ${(condErr as Error).message}`);
              }
            }
            inventoryUpdates['condition'] = finalCondition;
          }

          // Use the REAL SKU from the offer object (carries a date suffix) — not `FAS-${id}`.
          const sku = offerObject ? (offerObject.sku as string | undefined) : undefined;
          if (Object.keys(inventoryUpdates).length > 0 && sku) {
            const invPath = `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
            // GET the full inventory item, MERGE changed fields, PUT the FULL object back.
            // This preserves valid existing fields (imageUrls/aspects/brand/mpn,
            // packageWeightAndSize) so we don't trigger packageType/partial-body 400s.
            let invObject: Record<string, unknown> | null = null;
            try {
              const invGetRes = await fetch(
                `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(invPath)}`,
                { method: 'GET', headers: authHeaders }
              );
              if (invGetRes.ok) {
                invObject = (await invGetRes.json()) as Record<string, unknown>;
              } else {
                console.warn(`[eBay PushSync] inventory item GET failed for SKU ${sku}: HTTP ${invGetRes.status}`);
              }
            } catch (invGetErr) {
              console.warn(`[eBay PushSync] inventory item GET failed for SKU ${sku}:`, (invGetErr as Error).message);
            }

            if (invObject) {
              if ('product.title' in inventoryUpdates || 'product.description' in inventoryUpdates) {
                const existingProduct = (invObject.product as Record<string, unknown> | undefined) ?? {};
                invObject.product = {
                  ...existingProduct,
                  ...(inventoryUpdates['product.title'] ? { title: inventoryUpdates['product.title'] } : {}),
                  ...(inventoryUpdates['product.description'] ? { description: inventoryUpdates['product.description'] } : {}),
                };
              }
              if ('condition' in inventoryUpdates) {
                invObject.condition = inventoryUpdates['condition'];
              }

              // Ensure product.brand is set — missing product.brand causes 25002 BrandMPN
              // on republish (confirmed 2026-06-30). Mirror from aspects if item.brand is null.
              // This heals items that were originally pushed before Fix A was deployed.
              const invProduct = invObject.product as Record<string, unknown> | undefined;
              if (invProduct && !invProduct.brand) {
                const invAspects = invProduct.aspects as Record<string, string[]> | undefined;
                const aspectBrand = invAspects
                  ? Object.entries(invAspects).find(([k]) => k.toLowerCase() === 'brand')?.[1]?.[0]
                  : null;
                if (aspectBrand && aspectBrand.toLowerCase() !== 'unbranded') {
                  invProduct.brand = aspectBrand;
                }
              }

              const invRes = await fetch(
                `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(invPath)}`,
                { method: 'PUT', headers: authHeaders, body: JSON.stringify(invObject) }
              );
              if (!invRes.ok && invRes.status !== 204) {
                console.warn(`[eBay PushSync] Inventory item push failed for SKU ${sku}: HTTP ${invRes.status}`);
              }
            }
          }

          const pushedFields = [
            price !== undefined ? 'price' : null,
            title !== undefined ? 'title' : null,
            description !== undefined ? 'description' : null,
            condition !== undefined ? 'condition' : null,
          ].filter(Boolean);

          // Bug #469: Republish the offer so the LIVE listing reflects the pushed
          // inventory/offer changes. Updating the inventory item / offer alone does
          // NOT update what shoppers see — only a (re)publish does.
          // Phase 3 (ADR 2026-06-30): route the on-save republish through the
          // consolidated self-heal loop instead of a bare POST. A live-item edit that
          // trips 25101/25021/25002/25005 on republish now self-heals reactively
          // instead of silently failing (the organizer edits a live item and would
          // otherwise see nothing). isUsedFamily is derived from DB item.condition
          // inside the loop; a 25005 heal recreates the offer and persists it.
          if (pushedFields.length > 0 && updatedItem.ebayOfferId) {
            console.log(`[eBay PushSync] Item ${id}: pushed ${pushedFields.join('/')} to eBay`);
            const healResult = await ebayPublishWithSelfHeal({
              item: {
                id: updatedItem.id,
                title: updatedItem.title,
                condition: updatedItem.condition,
                brand: updatedItem.brand,
                mpn: updatedItem.mpn,
                ebayCategoryId: updatedItem.ebayCategoryId,
                ebayCategoryName: updatedItem.ebayCategoryName,
                ebayOfferId: updatedItem.ebayOfferId,
                category: updatedItem.category,
              },
              accessToken,
            });
            if (!healResult.published) {
              console.warn(
                `[eBay PushSync] Item ${id}: republish did not publish (lastErrorId=${healResult.lastErrorId ?? 'none'})`
              );
            }
          }

          // ADR Part B: if the organizer changed a shipping-determining input
          // (weight/dims/packageType) on a LIVE listing, re-resolve and re-apply
          // the eBay fulfillment policy so the live buyer is charged the correct
          // shipping. resyncItemShippingPolicy internally guards on ebayListingId
          // + ebayOfferId + the rate limiter and never throws.
          if (shippingInputsChanged && updatedItem.ebayListingId) {
            try {
              const { resyncItemShippingPolicy } = await import('../controllers/ebayController');
              const resync = await resyncItemShippingPolicy(id);
              console.log(
                `[eBay PushSync] Item ${id}: shipping resync changed=${resync.changed} reason=${resync.reason}`
              );
            } catch (resyncErr) {
              console.warn(
                `[eBay PushSync] Item ${id}: shipping resync failed (non-fatal):`,
                (resyncErr as Error).message
              );
            }
          }
        } catch (err) {
          console.warn(`[eBay PushSync] Non-fatal error pushing item ${id} to eBay:`, (err as Error).message);
        }
      })().catch(err => console.warn(`[eBay PushSync] Unhandled error for item ${id}:`, err));
    }
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Server error while updating item' });
  }
};

/**
 * POST /api/items/:id/description/append
 *
 * Item Description Authoring Contract (architect-locked 2026-05-12).
 * Appends voice transcripts or auto-generated text to item.description
 * without overwriting prior content. Source enum is "VOICE" | "AUTO"
 * (D-006: never expose "AI" in API surfaces).
 *
 * Voice writes always append AND lock 'description' in userEditedFields
 * so later AI runs (processRapidDraft, batchAnalyze) defer to the organizer.
 * Auto writes are deduped by composeDescription's novelty check.
 */
export const appendDescription = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    const {
      text,
      source,
      weightOz,
      lengthIn,
      widthIn,
      heightIn,
    } = req.body as {
      text?: unknown;
      source?: unknown;
      weightOz?: unknown;
      lengthIn?: unknown;
      widthIn?: unknown;
      heightIn?: unknown;
    };

    if (typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ message: 'Field "text" is required and must be a non-empty string' });
    }
    if (source !== 'VOICE' && source !== 'AUTO') {
      return res.status(400).json({ message: 'Field "source" must be "VOICE" or "AUTO"' });
    }

    // Optional dimension fields — only written if item fields are currently null
    const dimensionPatch: {
      packageWeightOz?: number;
      packageLengthIn?: number;
      packageWidthIn?: number;
      packageHeightIn?: number;
    } = {};
    if (typeof weightOz === 'number' && Number.isFinite(weightOz) && weightOz > 0) {
      dimensionPatch.packageWeightOz = Math.round(weightOz);
    }
    if (typeof lengthIn === 'number' && Number.isFinite(lengthIn) && lengthIn > 0) {
      dimensionPatch.packageLengthIn = lengthIn;
    }
    if (typeof widthIn === 'number' && Number.isFinite(widthIn) && widthIn > 0) {
      dimensionPatch.packageWidthIn = widthIn;
    }
    if (typeof heightIn === 'number' && Number.isFinite(heightIn) && heightIn > 0) {
      dimensionPatch.packageHeightIn = heightIn;
    }

    const callerUserId = req.user.id;

    // Atomic: load, compose, persist in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({
        where: { id },
        include: { sale: { include: { organizer: { select: { userId: true } } } } },
      });

      if (!item) return { status: 404 as const };

      // Ownership check — match updateItem's pattern, plus inventory-item fallback
      let ownerUserId: string | undefined;
      if (item.sale) {
        ownerUserId = item.sale.organizer.userId;
      } else if (item.organizerId) {
        const org = await tx.organizer.findUnique({
          where: { id: item.organizerId },
          select: { userId: true },
        });
        ownerUserId = org?.userId ?? undefined;
      }
      if (!ownerUserId || ownerUserId !== callerUserId) {
        return { status: 403 as const };
      }

      // Strip weight/dimension phrases from the transcript when those values were extracted
      const cleanedText = stripShippingPhrases(text, {
        hasWeight: typeof weightOz === 'number',
        hasDimensions: typeof lengthIn === 'number' || typeof widthIn === 'number' || typeof heightIn === 'number',
      });
      const compose = composeDescription(item.description, cleanedText, source as DescriptionSource);

      // Build dimension update: only fill fields that are currently null on the item
      const dimensionUpdate: Record<string, unknown> = {};
      if (dimensionPatch.packageWeightOz != null && item.packageWeightOz == null) {
        dimensionUpdate.packageWeightOz = dimensionPatch.packageWeightOz;
      }
      if (dimensionPatch.packageLengthIn != null && item.packageLengthIn == null) {
        dimensionUpdate.packageLengthIn = dimensionPatch.packageLengthIn;
      }
      if (dimensionPatch.packageWidthIn != null && item.packageWidthIn == null) {
        dimensionUpdate.packageWidthIn = dimensionPatch.packageWidthIn;
      }
      if (dimensionPatch.packageHeightIn != null && item.packageHeightIn == null) {
        dimensionUpdate.packageHeightIn = dimensionPatch.packageHeightIn;
      }

      if (!compose.appended) {
        // Description unchanged — but still apply any dimension patch
        if (Object.keys(dimensionUpdate).length > 0) {
          await tx.item.update({ where: { id: item.id }, data: dimensionUpdate });
        }
        return {
          status: 200 as const,
          payload: {
            id: item.id,
            description: item.description ?? '',
            source,
            appended: false,
            reason: compose.reason,
            dimensionsFilled: Object.keys(dimensionUpdate),
          },
        };
      }

      // Voice writes lock the description field against future AI overwrites (D-006)
      const userEdited = item.userEditedFields ?? [];
      const nextUserEdited = source === 'VOICE' && !userEdited.includes('description')
        ? [...userEdited, 'description']
        : userEdited;

      await tx.item.update({
        where: { id: item.id },
        data: {
          description: compose.description,
          userEditedFields: nextUserEdited,
          ...dimensionUpdate,
        },
      });

      return {
        status: 200 as const,
        payload: {
          id: item.id,
          description: compose.description,
          source,
          appended: true,
          dimensionsFilled: Object.keys(dimensionUpdate),
        },
      };
    });

    if (result.status === 404) {
      return res.status(404).json({ message: 'Item not found' });
    }
    if (result.status === 403) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }
    return res.status(200).json(result.payload);
  } catch (error) {
    console.error('[appendDescription] Error:', error);
    return res.status(500).json({ message: 'Server error while appending description' });
  }
};

export const deleteItem = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    // Fetch item to verify ownership
    const item = await prisma.item.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: { userId: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.sale!.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    // Cleanup Cloudinary images before deleting item from DB
    if (item.photoUrls && item.photoUrls.length > 0) {
      const cloudinaryPublicIds: string[] = [];

      for (const photoUrl of item.photoUrls) {
        try {
          // Extract public_id from Cloudinary URL
          // Format: https://res.cloudinary.com/{cloud}/image/upload/v{version}/{public_id}.{ext}
          const match = photoUrl.match(/\/upload\/v\d+\/(.+?)\./);
          if (match && match[1]) {
            cloudinaryPublicIds.push(match[1]);
          }
        } catch (err) {
          console.error('Error extracting Cloudinary public_id:', err);
        }
      }

      // Delete images from Cloudinary
      for (const publicId of cloudinaryPublicIds) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          // Log error but don't fail deletion — cleanup is best-effort
          console.error(`Error deleting Cloudinary image ${publicId}:`, err);
        }
      }
    }

    await prisma.item.delete({
      where: { id }
    });

    res.json({ message: 'Item deleted successfully' });

    // P2-3: Invalidate command center cache after item deletion
    invalidateCommandCenterCache(req.user.organizer!.id).catch((err) =>
      console.warn('Failed to invalidate command center cache:', err)
    );
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Server error while deleting item' });
  }
};

export const getBids = async (req: AuthRequest, res: Response) => {
  try {
    const itemId = req.params.id;

    // Get the item to check if requester is the organizer
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: { select: { userId: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const isOrganizer = req.user?.id === item.sale!.organizer.userId;

    // Fetch all bids, ordered by amount DESC (most recent winning first)
    const bids = await prisma.bid.findMany({
      where: { itemId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    });

    // ADR-013 Phase 2: Anonymize bidder names (unless requester is organizer)
    const mappedBids = bids.map((b: any, index: number) => ({
      id: b.id,
      bidAmount: b.amount,
      timestamp: b.createdAt,
      status: b.status,
      bidderLabel: isOrganizer ? b.user.name : `Bidder ${index + 1}`, // Bidder 1 = most recent
      // Organizer sees real name, shoppers see anonymized label
      ...(isOrganizer && { realBidderName: b.user.name, bidderId: b.user.id })
    }));

    res.json(mappedBids);
  } catch (error) {
    console.error('Error fetching bids:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * ADR-069 Phase 2: Get top 3 eBay comparable sales for an item.
 * GET /api/items/:id/ebay-comps
 *
 * Bug #326 fix: Previously returned the singleton ItemCompLookup row (1 record max,
 * with at most ONE ebayImageUrl), so EbayCompTiles couldn't render an image grid.
 * Now returns the top 3 live eBay listings (each with its own image, price, condition)
 * sourced from the same fetchEbayPriceComps pipeline that powers the comp summary
 * card — reusing the in-memory findingApiCache to avoid duplicate API calls.
 */
export const getItemEbayComps = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Look up the item to get title + condition for the eBay search
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        conditionGrade: true,
      },
    });

    if (!item || !item.title) {
      return res.json({ comps: [] });
    }

    // Fetch live top listings (cache-backed via findingApiCache in ebayController)
    const result = await fetchEbayPriceComps({
      title: item.title,
      condition: item.conditionGrade || undefined,
      maxResults: 10,
    });

    // If no real listings (e.g. mock-data fallback or empty), return empty so the
    // component renders nothing rather than placeholder tiles.
    if (!result.listings || result.listings.length === 0 || result.isMockData) {
      return res.json({ comps: [] });
    }

    // Map up to 3 listings to the EbayComp shape the frontend hook expects.
    // Each listing becomes its own tile with its own image/price/condition.
    const comps = result.listings.slice(0, 3).map((listing, idx) => ({
      id: `${id}-ebay-${idx}`,
      ebayPrice: listing.price,
      ebayCondition: listing.condition,
      ebayImageUrl: listing.imageUrl || null,
      ebayListingUrl: listing.url,
      ebayTitle: listing.title,
      fetchedAt: result.compsRunAt,
    }));

    res.json({ comps });
  } catch (error) {
    console.error('Error fetching eBay comps:', error);
    res.status(500).json({ message: 'Server error', comps: [] });
  }
};

// ADR-013 Phase 2: Dynamic bid increment calculation
function calculateBidIncrement(currentBid: number): number {
  if (currentBid < 1) return 0.05;
  if (currentBid < 5) return 0.25;
  if (currentBid < 25) return 0.50;
  if (currentBid < 100) return 1.00;
  if (currentBid < 250) return 2.50;
  if (currentBid < 500) return 5.00;
  if (currentBid < 1000) return 10.00;
  if (currentBid < 2500) return 25.00;
  if (currentBid < 5000) return 50.00;
  return 100.00;
}

export const placeBid = async (req: AuthRequest, res: Response) => {
  try {
    const itemId = req.params.itemId || req.params.id;
    const { maxBidAmount } = req.body; // ADR-013: renamed from bidAmount to maxBidAmount (user's ceiling)

    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Fetch item with current bid, maxBids, and organizer
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        sale: { include: { organizer: { select: { userId: true } } } },
        maxBids: { orderBy: { maxAmount: 'desc' } } // ADR-013: get all max bids
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // S1072 Finding #4: collusion/wash-trade guard — identity-grade device/card fingerprint match
    try {
      await assertCheckoutAllowed({
        buyerUserId: req.user.id,
        saleId: item.sale!.id,
        itemId: item.id,
        prisma,
        context: 'placeBid',
      });
    } catch (guardError) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ message: guardError.message });
      }
      throw guardError;
    }

    // Security: reject bids on items whose parent sale is not published
    if (item.sale!.status !== 'PUBLISHED') {
      return res.status(403).json({ message: 'This sale is not currently available for bidding.' });
    }

    // Reject bids on auctions that have already closed
    if (item.auctionClosed) {
      return res.status(400).json({ message: 'This auction has closed.' });
    }

    // Validate bid amount: must be positive number
    if (!maxBidAmount || typeof maxBidAmount !== 'number' || maxBidAmount <= 0) {
      return res.status(400).json({ error: 'Bid amount must be a positive number.' });
    }

    // Ensure bid meets current high bid (if one exists)
    const currentHighBid = item.currentBid;
    if (currentHighBid && maxBidAmount <= currentHighBid) {
      return res.status(400).json({
        error: `Bid must be higher than the current high bid of $${currentHighBid.toFixed(2)}.`,
        currentHighBid,
      });
    }

    // Reserve price enforcement (Phase 1 P0 fix — ADR-013)
    if (item.auctionReservePrice && maxBidAmount < item.auctionReservePrice) {
      return res.status(400).json({
        message: `Bid must be at least $${item.auctionReservePrice.toFixed(2)} to meet reserve`,
        minimumBid: item.auctionReservePrice,
        reservePrice: item.auctionReservePrice
      });
    }

    // Check auction end time
    if (item.auctionEndTime && new Date(item.auctionEndTime) < new Date()) {
      return res.status(400).json({ message: 'Auction has ended' });
    }

    // ADR-013 Phase 2: Proxy bidding logic
    // Find the current winning max bid (highest max bid from another user)
    const currentWinner = item.maxBids.find((m: any) => m.userId !== req.user.id);

    let actualBidAmount: number;
    let outbidWinnerId: string | null = null;

    if (!currentWinner) {
      // No other bids — this is the first bid. Use the submitted maxBidAmount directly.
      // (Validation above already ensures maxBidAmount > currentHighBid and >= reservePrice)
      actualBidAmount = maxBidAmount;
    } else if (currentWinner.maxAmount < maxBidAmount) {
      // New bidder's max is higher — they win with auto-increment
      actualBidAmount = currentWinner.maxAmount + calculateBidIncrement(currentWinner.maxAmount);
      outbidWinnerId = currentWinner.userId;
    } else {
      // Current winner's max >= new bidder's max — new bidder loses
      return res.status(400).json({
        message: 'Another bidder has a higher maximum bid',
        currentBid: currentWinner.maxAmount,
        yourMax: maxBidAmount
      });
    }

    // Upsert MaxBidByUser record for this user
    await prisma.maxBidByUser.upsert({
      where: { itemId_userId: { itemId, userId: req.user.id } },
      create: { itemId, userId: req.user.id, maxAmount: maxBidAmount },
      update: { maxAmount: maxBidAmount }
    });

    // Mark all previous WINNING bids as LOST, create new bid
    const previousWinning = await prisma.bid.findFirst({
      where: { itemId, status: 'WINNING' },
      select: { id: true, userId: true, amount: true }
    });

    if (previousWinning) {
      await prisma.bid.update({
        where: { id: previousWinning.id },
        data: { status: 'OUTBID' }
      });
    }

    // Create the bid (store actualBidAmount, not maxBidAmount)
    const bid = await prisma.bid.create({
      data: {
        itemId,
        userId: req.user.id,
        amount: actualBidAmount,
        status: 'WINNING' // ADR-013: new bid is immediately WINNING
      }
    });

    // Platform Safety #94: Track IP for same-IP bidder detection
    const clientIp = getClientIp(req);
    if (clientIp !== 'unknown') {
      prisma.bidIpRecord.create({
        data: {
          bidId: bid.id,
          userId: req.user.id,
          ipAddress: clientIp
        }
      }).catch(err => console.warn('[placeBid] Failed to record bid IP:', err));
    }

    // Update item's current bid
    await prisma.item.update({
      where: { id: itemId },
      data: { currentBid: actualBidAmount }
    });

    // Soft-close: extend auction if bid placed in final 5 minutes (ADR-013 Phase 2)
    if (item.auctionEndTime) {
      const timeToEnd = new Date(item.auctionEndTime).getTime() - Date.now();
      const EXTENSION_WINDOW_MS = 5 * 60 * 1000;
      const EXTENSION_DURATION_MS = 5 * 60 * 1000;

      if (timeToEnd > 0 && timeToEnd < EXTENSION_WINDOW_MS) {
        const newEndTime = new Date(new Date(item.auctionEndTime).getTime() + EXTENSION_DURATION_MS);
        await prisma.item.update({
          where: { id: itemId },
          data: { auctionEndTime: newEndTime }
        });

        // Notify watchers of extension via socket
        const io = getIO();
        if (io) {
          io.to(`item-${itemId}`).emit('auctionExtended', {
            itemId,
            newEndTime: newEndTime.toISOString(),
            message: 'Auction extended by 5 minutes due to a last-minute bid'
          });
        }
      }
    }

    // V1: Broadcast live bid update via Socket.io
    const io = getIO();
    if (io) {
      io.to(`item-${itemId}`).emit('bidPlaced', {
        itemId,
        bidAmount: actualBidAmount,
        bidderId: req.user.id,
        bidTime: new Date(),
      });
    }

    // Fire webhooks for bid placed (item.saleId! — auction items always have saleId by domain invariant)
    fireWebhooks(item.sale!.organizer.userId, 'bid.placed', {
      itemId: item.id,
      saleId: item.saleId!,
      bidAmount: actualBidAmount,
      bidderId: req.user.id,
    }).catch(err => console.error('Webhook fire error:', err));

    // Wire bid-placed notifications (P0 fix)
    // Notify bidder: "Your bid of $[amount] was placed on [item name]"
    createNotification(
      req.user.id,
      'BID_PLACED',
      'Bid Placed',
      `Your bid of $${actualBidAmount.toFixed(2)} was placed on ${item.title}`,
      `/items/${itemId}`,
      'OPERATIONAL'
    ).catch(err => console.warn('[placeBid] Failed to create bidder notification:', err));

    // Notify organizer: "New bid of $[amount] on [item name]"
    createNotification(
      item.sale!.organizer.userId,
      'NEW_BID',
      'New Bid Received',
      `New bid of $${actualBidAmount.toFixed(2)} on ${item.title}`,
      `/items/${itemId}`,
      'OPERATIONAL'
    ).catch(err => console.warn('[placeBid] Failed to create organizer notification:', err));

    // Notify displaced bidder of outbid (Phase 1 P0 fix — ADR-013)
    if (outbidWinnerId && previousWinning && previousWinning.userId !== req.user.id) {
      createNotification(
        outbidWinnerId,
        'OUTBID',
        'You Were Outbid',
        `You were outbid at $${actualBidAmount.toFixed(2)} on ${item.title}`,
        `/items/${itemId}`,
        'OPERATIONAL'
      ).catch(err => console.warn('[placeBid] Failed to create outbid notification:', err));
    }

    res.status(201).json(bid);
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(500).json({ message: 'Server error while placing bid' });
  }
};

export const analyzeItemTags = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    const item = await prisma.item.findUnique({
      where: { id },
      include: { sale: { select: { organizer: { select: { isUnmanagedListing: true, userId: true, id: true, subscriptionTier: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Guard: reject actions on unmanaged listings
    if (item.sale?.organizer?.isUnmanagedListing) {
      return res.status(403).json({
        message: 'This listing is not yet claimed by an organizer. Try one of our verified organizer sales.',
        code: 'UNMANAGED_LISTING'
      });
    }

    if (item.sale!.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }

    const firstPhotoUrl = item.photoUrls?.[0];
    if (!firstPhotoUrl) {
      return res.json({ suggestedTags: [] });
    }

    // Security: AI Tags Quota Enforcement (P0)
    const organizerId = item.sale!.organizer.id;
    const tier = item.sale!.organizer.subscriptionTier || 'SIMPLE';
    const quotaStatus = await checkAiTagQuota(organizerId, tier);

    if (quotaStatus.exceeded) {
      return res.status(429).json({
        code: 'AI_QUOTA_EXCEEDED',
        message: `Monthly auto-tag limit reached for ${tier} tier. Upgrade to continue.`,
        usedThisMonth: quotaStatus.used,
        limit: quotaStatus.limit,
        remaining: quotaStatus.remaining,
      });
    }

    // Organizer-intent gate (D-006): if all 5 core fields are already organizer-set,
    // skip Vision + Haiku entirely — organizer values always win over AI suggestions.
    // This prevents unnecessary API calls when the organizer has already filled everything.
    const CORE_FIELDS = ['title', 'category', 'condition', 'price', 'brand'];
    const allCoreFieldsOrganizerSet = CORE_FIELDS.every(f => item.userEditedFields.includes(f));
    if (allCoreFieldsOrganizerSet) {
      return res.json({ suggestedTags: item.tags || [] });
    }

    let suggestedTags: string[] = [];
    if (isCloudAIAvailable()) {
      try {
        const imageResponse = await axios.get(firstPhotoUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });
        const imageBuffer = Buffer.from(imageResponse.data);
        const aiResult = await analyzeItemImage(imageBuffer, 'image/jpeg');
        if (aiResult?.tags) {
          suggestedTags = aiResult.tags;
          // Increment quota counter after successful analysis
          await incrementAiTagCount(organizerId, suggestedTags.length);
        }
      } catch (err: any) {
        console.warn(`[cloudAI/analyze] error for item "${id}": ${err.message} — returning empty tags`);
      }
    }

    res.json({ suggestedTags });
  } catch (error) {
    console.error('Error analyzing item tags:', error);
    res.status(500).json({ message: 'Server error while analyzing tags' });
  }
};

// Phase 16: Photo management

const getItemForOrganizer = async (id: string, userId: string) => {
  const item = await prisma.item.findUnique({
    where: { id },
    include: { sale: { include: { organizer: { select: { userId: true } } } } },
  });
  if (!item) return null;
  if (item.sale!.organizer.userId !== userId) return null;
  return item;
};

export const addItemPhoto = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerAccess = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { id } = req.params;
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: 'url is required' });
    }
    const item = await getItemForOrganizer(id, req.user.id);
    if (!item) return res.status(404).json({ message: 'Item not found or access denied' });

    // Feature #75: Check photo limit before adding (item.saleId! — photo upload only runs for sale items)
    const sale = await prisma.sale.findUnique({
      where: { id: item.saleId! },
      include: { organizer: { select: { subscriptionTier: true } } }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Determine tier: use PRO tier limits for ala carte sales even if organizer is SIMPLE
    let effectiveTier = sale.organizer.subscriptionTier;
    if (sale.purchaseModel === 'ALA_CARTE') {
      effectiveTier = 'PRO';
    }

    const photoLimit = await checkItemOverPhotoLimit(id, effectiveTier);
    if (photoLimit.isOverLimit) {
      return res.status(403).json({
        error: 'Photo limit reached',
        limit: photoLimit.limit,
        tier: effectiveTier,
        upgradeRequired: true,
        message: `Item has reached the photo limit for ${effectiveTier} tier (${photoLimit.limit} photos)`
      });
    }

    const updated = await prisma.item.update({
      where: { id },
      data: { photoUrls: [...item.photoUrls, url] },
    });
    // #319/#325/#328: Sync Photo table — fire-and-forget
    prisma.photo.create({
      data: {
        itemId: id,
        url,
        isPrimary: item.photoUrls.length === 0,
        orderIndex: item.photoUrls.length,
      },
    }).catch(err => console.warn('[Photo sync] create failed on addItemPhoto:', err));
    // If item is in DRAFT status, reset the AI analysis debounce timer to give user
    // more time to add additional photos via the "+" button (multi-angle grouping)
    if (item.draftStatus === 'DRAFT') {
      resetRapidDraftDebounce(id);
    }
    res.json({ photoUrls: updated.photoUrls });
  } catch (error) {
    console.error('addItemPhoto error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const removeItemPhoto = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerAccess = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { id, photoIndex } = req.params;
    const idx = parseInt(photoIndex, 10);
    if (isNaN(idx)) return res.status(400).json({ message: 'Invalid photoIndex' });
    const item = await getItemForOrganizer(id, req.user.id);
    if (!item) return res.status(404).json({ message: 'Item not found or access denied' });
    if (idx < 0 || idx >= item.photoUrls.length) {
      return res.status(400).json({ message: 'Photo index out of range' });
    }
    const removedUrl = item.photoUrls[idx];
    const updated = await prisma.item.update({
      where: { id },
      data: { photoUrls: item.photoUrls.filter((_, i) => i !== idx) },
    });
    // #319/#325/#328: Sync Photo table — delete the removed record, re-index remaining
    const remainingUrls = updated.photoUrls;
    prisma.photo.deleteMany({ where: { itemId: id, url: removedUrl } })
      .then(() =>
        Promise.all(
          remainingUrls.map((u, newIdx) =>
            prisma.photo.updateMany({
              where: { itemId: id, url: u },
              data: { orderIndex: newIdx, isPrimary: newIdx === 0 },
            })
          )
        )
      )
      .catch(err => console.warn('[Photo sync] sync failed on removeItemPhoto:', err));
    res.json({ photoUrls: updated.photoUrls });
  } catch (error) {
    console.error('removeItemPhoto error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const reorderItemPhotos = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerAccess = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { id } = req.params;
    const { photoUrls } = req.body;
    if (!Array.isArray(photoUrls)) {
      return res.status(400).json({ message: 'photoUrls must be an array' });
    }
    const item = await getItemForOrganizer(id, req.user.id);
    if (!item) return res.status(404).json({ message: 'Item not found or access denied' });
    const existing = new Set(item.photoUrls);
    const allValid = photoUrls.every((u: any) => typeof u === 'string' && existing.has(u));
    if (!allValid || photoUrls.length !== item.photoUrls.length) {
      return res.status(400).json({ message: 'Invalid photoUrls — can only reorder existing photos' });
    }
    const updated = await prisma.item.update({
      where: { id },
      data: { photoUrls },
    });
    // #319/#325/#328: Sync Photo table — update orderIndex and isPrimary to match new order
    Promise.all(
      photoUrls.map((u: string, newIdx: number) =>
        prisma.photo.updateMany({
          where: { itemId: id, url: u },
          data: { orderIndex: newIdx, isPrimary: newIdx === 0 },
        })
      )
    ).catch(err => console.warn('[Photo sync] updateMany failed on reorderItemPhotos:', err));
    res.json({ photoUrls: updated.photoUrls });
  } catch (error) {
    console.error('reorderItemPhotos error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Phase 2B: Rapidfire Mode — Draft status polling endpoint
export const getItemDraftStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;

    // Fetch item with minimal fields — lightweight poll response
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        saleId: true,
        draftStatus: true,
        aiErrorLog: true,
        title: true,
        photoUrls: true,
        sale: {
          select: {
            organizer: {
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Auth: only the organizer who owns the sale can poll this item's draft status
    const isOwner = req.user?.id === item.sale!.organizer.userId;
    if (!isOwner) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Return lightweight draft status response
    res.json({
      itemId: item.id,
      draftStatus: item.draftStatus,
      aiErrorLog: item.aiErrorLog,
      title: item.title,
      thumbnailUrl: item.photoUrls && item.photoUrls.length > 0 ? item.photoUrls[0] : null
    });
  } catch (error) {
    console.error('Error fetching draft status:', error);
    res.status(500).json({ message: 'Server error while fetching draft status' });
  }
};

// Phase 2B: Rapidfire Mode — Publish endpoint with optimistic lock and draftStatus gate
export const publishItem = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { itemId } = req.params;
    const { title, price, category, condition, optimisticLockVersion } = req.body;

    // Fetch current item state
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        saleId: true,
        draftStatus: true,
        optimisticLockVersion: true,
        sale: {
          select: {
            organizer: {
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Auth: only the organizer who owns the sale can publish items
    if (item.sale!.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    // B2 blocker: reject if already published or in an unexpected state
    if (item.draftStatus !== 'PENDING_REVIEW' && item.draftStatus !== 'DRAFT') {
      return res.status(400).json({
        message: item.draftStatus === 'PUBLISHED'
          ? 'Item is already published.'
          : 'Item not ready — AI analysis still in progress.'
      });
    }

    // B5 blocker: optimistic lock check — prevent concurrent edits
    if (optimisticLockVersion !== undefined && optimisticLockVersion !== item.optimisticLockVersion) {
      return res.status(409).json({
        message: 'Item was updated. Refresh and try again.'
      });
    }

    // Prepare update data with optional organizer edits
    const updateData: any = {
      draftStatus: 'PUBLISHED',
      optimisticLockVersion: (item.optimisticLockVersion ?? 0) + 1
    };

    // Apply optional organizer edits from request body
    // D-006: Track which fields organizer explicitly edits at publish time
    const publishEditedFields: string[] = [];
    if (title !== undefined) { updateData.title = title; publishEditedFields.push('title'); }
    if (price !== undefined) { updateData.price = price !== null ? parseFloat(price) : null; publishEditedFields.push('price'); }
    if (category !== undefined) { updateData.category = category; publishEditedFields.push('category'); }
    if (condition !== undefined) { updateData.condition = condition; publishEditedFields.push('condition'); }
    if (publishEditedFields.length > 0) {
      // Fetch current userEditedFields to merge (item was re-fetched above as fullItem — but we need userEditedFields)
      const existingEdited = (await prisma.item.findUnique({ where: { id: itemId }, select: { userEditedFields: true } }))?.userEditedFields ?? [];
      updateData.userEditedFields = Array.from(new Set([...existingEdited, ...publishEditedFields]));
    }

    // Hunt Pass Feature: Set 6-hour early access embargo for LEGENDARY items
    // Fetch full item to check rarity
    const fullItem = await prisma.item.findUnique({
      where: { id: itemId },
      select: { rarity: true, createdAt: true }
    });

    if (fullItem && fullItem.rarity === 'LEGENDARY') {
      const now = new Date();
      const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours in ms
      updateData.earlyAccessUntil = sixHoursLater;
    }

    // Update item with new state
    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: updateData,
      select: {
        id: true,
        saleId: true,
        title: true,
        description: true,
        price: true,
        category: true,
        ebayCategoryId: true,
        ebayCategoryName: true,
        condition: true,
        draftStatus: true,
        optimisticLockVersion: true,
        photoUrls: true,
        status: true,
        updatedAt: true
      }
    });

    // Fire webhooks for published item (X1: Zapier integration)
    fireWebhooks(req.user.id, 'item.published', {
      itemId: updatedItem.id,
      saleId: updatedItem.saleId,
      title: updatedItem.title,
      status: updatedItem.draftStatus
    }).catch(err => console.error('Webhook fire error:', err));

    // ADR-069 Phase 2: Queue async eBay comps fetch (non-blocking)
    enqueueFetchEbayComps(updatedItem.id);

    res.json(updatedItem);

    // P2-3: Invalidate command center cache after item publish (status change)
    invalidateCommandCenterCache(req.user.organizer!.id).catch((err) =>
      console.warn('Failed to invalidate command center cache:', err)
    );
  } catch (error) {
    console.error('Error publishing item:', error);
    res.status(500).json({ message: 'Server error while publishing item' });
  }
};

// Phase 2B: Rapidfire Mode — Hold AI analysis debounce when entering add-mode
// Resets the 4.5s debounce timer so organizer has full window to reposition/relight before next photo
export const holdAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    // Fetch item with ownership verification
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        draftStatus: true,
        sale: {
          select: {
            organizer: {
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Auth: only the organizer who owns the sale can hold analysis
    if (item.sale!.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    // Only DRAFT items can hold analysis (rapidfire adds-in-progress)
    if (item.draftStatus !== 'DRAFT') {
      return res.status(400).json({
        message: 'Item must be in DRAFT status to hold analysis.'
      });
    }

    // Cancel the AI analysis timer entirely — organizer is repositioning/relighting
    const existing = rapidfireAIDebounce.get(id);
    if (existing) clearTimeout(existing);
    rapidfireAIDebounce.delete(id);

    // Mark this item as held so that photo appends (via +) don't restart the timer
    heldAnalysisItems.add(id);

    res.json({ held: true });
  } catch (error) {
    console.error('Error holding analysis:', error);
    res.status(500).json({ message: 'Server error while holding analysis' });
  }
};

// Phase 2B: Rapidfire Mode — Release AI analysis hold when exiting add-mode
// Starts a fresh 4.5s debounce so AI fires after the organizer is done adding photos
export const releaseAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }
    const { id } = req.params;
    const item = await prisma.item.findUnique({
      where: { id },
      select: { id: true, draftStatus: true, sale: { select: { organizer: { select: { userId: true } } } } }
    });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (item.sale!.organizer.userId !== req.user.id) return res.status(403).json({ message: 'Access denied.' });
    if (item.draftStatus !== 'DRAFT') return res.status(400).json({ message: 'Item is not in DRAFT status.' });

    // Remove from held set so that resetRapidDraftDebounce will work normally
    heldAnalysisItems.delete(id);

    // Now start the AI analysis debounce timer
    resetRapidDraftDebounce(id);
    res.json({ released: true });
  } catch (error) {
    console.error('Error releasing analysis hold:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Sprint 1: Listing Health Score + getDraftItemsBySaleId with health computation
// Used by the review-before-publish page. Requires organizer ownership of the sale.
export const getDraftItemsBySaleId = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerAccess = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerAccess) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const { saleId, page = '1', limit = '500' } = req.query;

    if (!saleId) {
      return res.status(400).json({ message: 'saleId is required' });
    }

    // Verify organizer owns the sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId as string },
      include: { organizer: { select: { userId: true } } },
    });

    if (!sale || sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale' });
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit as string) || 500));

    const items = await prisma.item.findMany({
      where: {
        saleId: saleId as string,
        // Show ALL sale items regardless of publish state — Add Items is the
        // organizer's home base for inventory. Published items remain visible
        // with a status chip (see draftStatus + ebayListingId fields below).
        // Filter disabled 2026-04-14 per Patrick UX feedback.
      },
      select: {
        id: true,
        saleId: true,
        title: true,
        description: true,
        category: true,
        ebayCategoryId: true,
        ebayCategoryName: true,
        condition: true,
        conditionGrade: true, // #64
        price: true,
        photoUrls: true,
        draftStatus: true,
        aiErrorLog: true,
        optimisticLockVersion: true,
        // Camera Workflow v2: Add new fields for publishing page
        aiConfidence: true,
        isAiTagged: true,
        backgroundRemoved: true,
        faceDetected: true,
        autoEnhanced: true,
        createdAt: true,
        updatedAt: true,
        // Sprint 1: Listing Health Score + AI tag suggestions
        tags: true,
        // Status chip data — distinguish Draft / Published / On eBay
        status: true,
        ebayListingId: true,
        ebayOfferId: true, // S725: surfaces "Pending Publish" state in organizer UI
        listedOnEbayAt: true,
        ebayNeedsReview: true, // S791: #295 fix — badge persists across page loads
        // Feature #91: Auto-Markdown (P3: Fix 2)
        priceBeforeMarkdown: true,
        markdownApplied: true,
        // Phase 2b: Legendary early access (P2: Fix 1)
        isLegendary: true,
        legendaryPublishedAt: true,
        tagColor: true, // Feature #310: Color-tagged discount rules
        // eBay push card + editState shipping fields — required for review page
        packageWeightOz: true,
        packageLengthIn: true,
        packageWidthIn: true,
        packageHeightIn: true,
        ebayShippingOverride: true,
        // eBay product identifiers — required for review page Brand/MPN/UPC inputs
        brand: true,
        mpn: true,
        upc: true,
        // editState fields for auction/reverse-auction display
        quantity: true,
        listingType: true,
        reverseDailyDrop: true,
        reverseFloorPrice: true,
        // Feature #565: Grounded-identity provenance (behind GROUNDING_ENABLED flag)
        groundedIdentity: true,
        groundedConfidence: true,
        groundedSource: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });

    // Feature #310: Pre-fetch active discount rules for this workspace
    let activeRules: Array<{ tagColor: string; discountPercent: number; activeFrom: Date | null; activeTo: Date | null }> = [];
    const workspace = await prisma.organizerWorkspace.findFirst({
      where: { ownerId: req.user.id },
    });
    if (workspace) {
      const rawRules = await prisma.discountRule.findMany({
        where: { workspaceId: workspace.id },
        select: { tagColor: true, discountPercent: true, activeFrom: true, activeTo: true },
      });
      // Convert Prisma Decimal to number for JSON serialization
      activeRules = rawRules.map(r => ({
        tagColor: r.tagColor,
        discountPercent: typeof r.discountPercent === 'object' && 'toNumber' in r.discountPercent
          ? r.discountPercent.toNumber()
          : Number(r.discountPercent),
        activeFrom: r.activeFrom,
        activeTo: r.activeTo,
      }));
    }

    // Sprint 1: Compute health score for each item
    const itemsWithHealth = items.map(item => ({
      ...item,
      healthScore: computeHealthScore({
        photoUrls: item.photoUrls,
        title: item.title,
        description: item.description,
        tags: item.tags,
        price: item.price,
        conditionGrade: item.conditionGrade, // #64
        category: item.category ?? undefined,
      }),
      // Feature #310: Add effective price after discount (if any rule applies)
      effectivePrice: getEffectivePrice(item, activeRules),
      tagColor: item.tagColor ?? null,
    }));

    res.json(itemsWithHealth);
  } catch (error) {
    console.error('Error fetching draft items:', error);
    res.status(500).json({ message: 'Server error while fetching draft items' });
  }
};

// Feature #78: Inspiration Gallery — top items by AI confidence from published sales
export const getInspirationItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 48, 100);

    const items = await prisma.item.findMany({
      where: {
        status: 'AVAILABLE',
        // draftStatus filter disabled — legacy/seeded items have NULL draftStatus
        // Re-enable when Rapidfire Mode launches: draftStatus: 'PUBLISHED',
        ...PUBLIC_ITEM_FILTER,
        photoUrls: { isEmpty: false },
        sale: {
          status: 'PUBLISHED',
        },
      },
      select: {
        id: true,
        title: true,
        photoUrls: true,
        price: true,
        aiConfidence: true,
        category: true,
        ebayCategoryId: true,
        ebayCategoryName: true,
        // Feature #91: Auto-Markdown (P3: Fix 2)
        priceBeforeMarkdown: true,
        markdownApplied: true,
        sale: {
          select: {
            id: true,
            title: true,
            organizer: {
              select: { businessName: true },
            },
          },
        },
      },
      orderBy: { aiConfidence: 'desc' },
      take: limit,
    });

    res.json({ items });
  } catch (err) {
    console.error('GET /api/items/inspiration error:', err);
    res.status(500).json({ message: 'Failed to fetch inspiration items.' });
  }
};

// Feature #85: Treasure Hunt QR — Generate QR code for item
export const getQrCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    if (!itemId) {
      res.status(400).json({ message: 'itemId is required.' });
      return;
    }

    // Verify item exists
    const item = await prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      res.status(404).json({ message: 'Item not found.' });
      return;
    }

    // Generate QR code pointing to item page
    const qrContent = `https://finda.sale/items/${itemId}`;

    const QRCode = await import('qrcode');
    const qrImageBuffer = await QRCode.toBuffer(qrContent, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
    });

    res.set('Content-Type', 'image/png');
    res.set('Content-Length', String(qrImageBuffer.length));
    res.send(qrImageBuffer);
  } catch (error) {
    console.error('QR code generation error:', error);
    res.status(500).json({ message: 'Failed to generate QR code.' });
  }
};

// Feature #85: Treasure Hunt QR — Record QR scan and award badge + XP
export const recordQrScan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    const userId = req.user?.id;
    const latitude = req.query.latitude ? parseFloat(req.query.latitude as string) : undefined;
    const longitude = req.query.longitude ? parseFloat(req.query.longitude as string) : undefined;

    if (!itemId || !userId) {
      res.status(400).json({ message: 'itemId and authentication required.' });
      return;
    }

    // Verify item exists and fetch sale location for geofencing
    // Also select sale.id for Feature #408 Scan & Split socket emit
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        sale: {
          select: { id: true, lat: true, lng: true },
        },
      },
    });

    if (!item) {
      res.status(404).json({ message: 'Item not found.' });
      return;
    }

    // Geofence check: if client provided lat/lng, enforce 100m radius from sale location
    if (latitude !== undefined && longitude !== undefined && item.sale && item.sale.lat !== null && item.sale.lng !== null) {
      const distance = haversineDistance(latitude, longitude, item.sale.lat, item.sale.lng);
      const MAX_DISTANCE = 100; // 100 meters
      if (distance > MAX_DISTANCE) {
        res.status(403).json({ error: 'You must be at the sale location to scan this QR code.' });
        return;
      }
    }

    // Import awardXp and cap check here to avoid circular dependency
    const { awardXp, checkDailyXpCap, XP_AWARDS, getRankXpMultiplier } = await import('../services/xpService');

    // Check if user has already scanned this item today (prevent duplicate scans)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const alreadyScannedToday = await prisma.pointsTransaction.findFirst({
      where: {
        userId,
        type: 'TREASURE_HUNT_SCAN',
        itemId,
        createdAt: {
          gte: today,
        },
      },
    });

    if (alreadyScannedToday) {
      res.status(200).json({
        message: 'Item already scanned today.',
        guildXp: (await prisma.user.findUnique({ where: { id: userId }, select: { guildXp: true } }))?.guildXp,
      });
      return;
    }

    // Get user's current rank and Hunt Pass status for XP multiplier calculation
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { explorerRank: true, huntPassActive: true, huntPassExpiry: true },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    // Apply rank-based multiplier to base XP
    const baseXp = XP_AWARDS.TREASURE_HUNT_SCAN;
    const rankMultiplier = getRankXpMultiplier(user.explorerRank);
    let multipliedXp = Math.round(baseXp * rankMultiplier);

    // Apply Hunt Pass bonus: +10% XP on top of rank multiplier
    if (user.huntPassActive && user.huntPassExpiry && user.huntPassExpiry > new Date()) {
      multipliedXp = Math.round(multipliedXp * 1.1);
    }

    // Check daily cap for TREASURE_HUNT_SCAN XP
    const dailyRemaining = await checkDailyXpCap(userId, 'TREASURE_HUNT_SCAN');
    const xpToAward = Math.min(multipliedXp, dailyRemaining);

    if (xpToAward === 0) {
      res.status(200).json({
        message: 'Daily item scan XP cap reached. Try again tomorrow.',
        guildXp: (await prisma.user.findUnique({ where: { id: userId }, select: { guildXp: true } }))?.guildXp,
      });
      return;
    }

    // Award XP (respecting daily cap and rank multiplier)
    const xpResult = await awardXp(userId, 'TREASURE_HUNT_SCAN', xpToAward, { itemId });

    // Find or create "Item Scout" badge
    let badge = await prisma.badge.findUnique({
      where: { name: 'Item Scout' },
    });

    if (!badge) {
      // Create badge if it doesn't exist
      badge = await prisma.badge.create({
        data: {
          name: 'Item Scout',
          description: 'Scanned an item\'s QR code',
          criteria: { type: 'qr_scan' },
        },
      });
    }

    // Award badge to user (upsert to avoid duplicates)
    const existingBadge = await prisma.userBadge.findUnique({
      where: {
        userId_badgeId: { userId, badgeId: badge.id },
      },
    });

    if (!existingBadge) {
      await prisma.userBadge.create({
        data: {
          userId,
          badgeId: badge.id,
        },
      });
    }

    // Fetch updated user profile
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        guildXp: true,
        explorerRank: true,
        userBadges: {
          include: { badge: true },
        },
      },
    });

    // Feature #408: Scan & Split — track this scan and check for simultaneous scans.
    // If 2+ different users scan the same item within 60s, emit SCAN_AND_SPLIT to the
    // organizer's POS so the split-bill panel auto-opens with the scanned item pre-filled.
    let scanAndSplitTriggered = false;
    try {
      const activeScans = getActiveScans(itemId);
      const alreadyInWindow = activeScans.some(e => e.userId === userId);
      if (!alreadyInWindow) {
        activeScans.push({ userId, scannedAt: Date.now() });
        recentItemScans.set(itemId, activeScans);
      }

      if (activeScans.length >= 2) {
        // Fetch item title for POS panel context
        const scannerIds = activeScans.map(e => e.userId);
        const io = getIO();
        // Emit to the sale's item room — organizer POS listens on sale room or item room.
        // Also emit to a broad 'pos:scan_and_split' event on the sale room.
        io.to(`item:${itemId}`).emit('SCAN_AND_SPLIT', {
          itemId,
          scannerIds,
          scannedAt: Date.now(),
        });
        // Also emit to sale room in case organizer POS is listening there
        if (item.sale?.id) {
          io.to(`sale:${item.sale.id}`).emit('SCAN_AND_SPLIT', {
            itemId,
            scannerIds,
            scannedAt: Date.now(),
          });
        }
        scanAndSplitTriggered = true;
        // Clear the window after triggering so repeated fast scans don't re-fire every time
        recentItemScans.set(itemId, []);
      }
    } catch (err) {
      // Non-critical — never block the scan response
      console.warn('[Scan & Split] emit error:', err);
    }

    res.json({
      message: 'QR scan recorded successfully.',
      xpAwarded: xpResult?.xpAwarded || 0,
      newRank: updatedUser?.explorerRank,
      rankIncreased: xpResult?.rankIncreased || false,
      totalXp: updatedUser?.guildXp,
      badgeAwarded: !existingBadge ? badge.name : null,
      scanAndSplitTriggered,
    });
  } catch (error) {
    console.error('QR scan recording error:', error);
    res.status(500).json({ message: 'Failed to record QR scan.' });
  }
};

// Organizer: Close an auction manually
export const closeAuctionEndpoint = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { itemId } = req.params;

    // Verify ownership
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: { select: { userId: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.sale!.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    if (item.listingType !== 'AUCTION') {
      return res.status(400).json({ message: 'Item is not an auction' });
    }

    if (item.auctionClosed) {
      return res.status(400).json({ message: 'Auction already closed' });
    }

    // Call the shared close logic
    await closeAuction(itemId);

    res.json({ message: 'Auction closed successfully' });
  } catch (error) {
    console.error('Close auction error:', error);
    res.status(500).json({ message: 'Failed to close auction' });
  }
};

// Feature #78: Rare Finds endpoint for Hunt Pass subscribers
export const getRareFindsItems = async (req: AuthRequest, res: Response) => {
  try {
    // Auth required for Hunt Pass check
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Hunt Pass required
    const hasHuntPass = req.user.huntPassActive && req.user.huntPassExpiry && req.user.huntPassExpiry > new Date();
    if (!hasHuntPass) {
      return res.status(403).json({ message: 'Hunt Pass subscription required' });
    }

    const { limit: rawLimit = 20, offset: rawOffset = 0 } = req.query;
    const limit = Math.min(Math.max(1, parseInt(String(rawLimit)) || 20), 100);
    const offset = Math.max(0, parseInt(String(rawOffset)) || 0);

    // Get rare/legendary items from active sales
    const rareItems = await prisma.item.findMany({
      where: {
        rarity: {
          in: ['RARE', 'LEGENDARY', 'ULTRA_RARE']
        },
        isActive: true,
        ...PUBLIC_ITEM_FILTER,
        sale: {
          status: {
            in: ['LIVE', 'ACTIVE']
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: offset,
      select: {
        id: true,
        saleId: true,
        title: true,
        description: true,
        price: true,
        photoUrls: true,
        category: true,
        ebayCategoryId: true,
        ebayCategoryName: true,
        condition: true,
        rarity: true,
        listingType: true,
        isAiTagged: true,
        createdAt: true,
        updatedAt: true,
        // Feature #91: Auto-Markdown (P3: Fix 2)
        priceBeforeMarkdown: true,
        markdownApplied: true,
        sale: {
          select: {
            id: true,
            title: true,
            organizerId: true,
            organizer: {
              select: { businessName: true }
            }
          }
        }
      }
    });

    // Get total count for pagination
    const total = await prisma.item.count({
      where: {
        rarity: {
          in: ['RARE', 'LEGENDARY', 'ULTRA_RARE']
        },
        isActive: true,
        ...PUBLIC_ITEM_FILTER,
        sale: {
          status: {
            in: ['LIVE', 'ACTIVE']
          }
        }
      }
    });

    res.json({
      data: rareItems,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    });
  } catch (error) {
    console.error('Error fetching rare finds:', error);
    res.status(500).json({ message: 'Server error while fetching rare finds' });
  }
};

/**
 * D-XP-003: Apply organizer-funded discount to an item
 * POST /api/items/:itemId/organizer-discount
 * Body: { xpToSpend: number } — must be 200, 400, or 500
 * Validates organizer ownership, XP balance, and applies discount permanently
 */
export const applyOrganizerDiscount = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { itemId } = req.params;
    const { xpToSpend } = req.body;

    // Validate authenticated user
    if (!authReq.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Validate xpToSpend is one of the allowed values
    if (![200, 400, 500].includes(xpToSpend)) {
      return res.status(400).json({ message: 'xpToSpend must be 200, 400, or 500' });
    }

    // Fetch item with sale and organizer details
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: { include: { user: { select: { id: true, guildXp: true } } } } } } },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Verify organizer ownership
    if (item.sale!.organizer.userId !== authReq.user.id) {
      return res.status(403).json({ message: 'You do not own this item' });
    }

    // Check spendable XP (accounts for holds)
    const spendable = await getSpendableXp(authReq.user.id);
    if (spendable < xpToSpend) {
      return res.status(400).json({
        message: `Insufficient XP. You have ${spendable} spendable XP, but this discount costs ${xpToSpend}.`
      });
    }

    // Calculate discount amount: (xpToSpend / 200) * $2
    const discountAmount = (xpToSpend / 200) * 2;

    // Spend XP (creates transaction record, deducts from guildXp)
    // item.saleId! — organizer discount path always operates on a sale item
    const spendSuccess = await spendXp(authReq.user.id, xpToSpend, 'ORGANIZER_ITEM_DISCOUNT', {
      saleId: item.saleId!,
      description: `Organizer discount on item "${item.title}"`,
    });

    if (!spendSuccess) {
      return res.status(400).json({ message: 'Failed to spend XP. Please try again.' });
    }

    // Update item with discount fields
    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: {
        organizerDiscountXp: xpToSpend,
        organizerDiscountAmount: new Decimal(discountAmount.toFixed(2)),
      },
      include: { sale: { select: { id: true, title: true } } },
    });

    // Audit log
    console.log(`[Organizer Discount] User ${authReq.user.id} applied $${discountAmount} discount to item ${itemId} for ${xpToSpend} XP`);

    res.status(200).json({
      message: 'Organizer Special applied successfully',
      item: updatedItem,
    });
  } catch (error) {
    console.error('[applyOrganizerDiscount] Error:', error);
    res.status(500).json({ message: 'Server error while applying discount' });
  }
};

/**
 * D-XP-003: Remove organizer-funded discount from an item
 * DELETE /api/items/:itemId/organizer-discount
 * XP is NOT refunded (burning is permanent per spec)
 */
export const removeOrganizerDiscount = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { itemId } = req.params;

    // Validate authenticated user
    if (!authReq.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Fetch item with sale and organizer details
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: { select: { userId: true } } } } },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Verify organizer ownership
    if (item.sale!.organizer.userId !== authReq.user.id) {
      return res.status(403).json({ message: 'You do not own this item' });
    }

    // Check if discount is active (organizerDiscountXp > 0)
    if (!item.organizerDiscountXp || item.organizerDiscountXp === 0) {
      return res.status(400).json({ message: 'This item does not have an active discount' });
    }

    // Remove discount — XP is NOT refunded (permanent burn)
    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: {
        organizerDiscountXp: null,
        organizerDiscountAmount: null,
      },
      include: { sale: { select: { id: true, title: true } } },
    });

    // Audit log
    console.log(`[Organizer Discount] User ${authReq.user.id} removed discount from item ${itemId} (XP not refunded)`);

    res.status(200).json({
      message: 'Organizer Special removed (XP was permanently burned)',
      item: updatedItem,
    });
  } catch (error) {
    console.error('[removeOrganizerDiscount] Error:', error);
    res.status(500).json({ message: 'Server error while removing discount' });
  }
};

/**
 * Feature #338: Get comp summary for an item
 * GET /api/items/:id/comp-summary
 * Returns multi-source pricing data: sourceCount, medianLow, medianHigh, lastUpdated
 * Auth: organizer JWT required
 */
export const getCompSummary = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id: itemId } = req.params;

    // Verify authenticated user is an organizer
    if (!authReq.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Fetch item with sale and organizer details
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: { select: { userId: true } } } } },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Verify organizer ownership
    if (item.sale!.organizer.userId !== authReq.user.id) {
      return res.status(403).json({ message: 'You do not own this item' });
    }

    // Fetch ItemCompLookup for this item
    const compLookup = await prisma.itemCompLookup.findUnique({
      where: { itemId },
    });

    // If no comp data exists yet, return empty response
    if (!compLookup) {
      return res.status(200).json({
        sourceCount: 0,
        medianLow: null,
        medianHigh: null,
        lastUpdated: null,
      });
    }

    // Extract priceRange from pricingResultJson if available
    let medianLow: number | null = null;
    let medianHigh: number | null = null;

    if (compLookup.pricingResultJson && typeof compLookup.pricingResultJson === 'object') {
      const result = compLookup.pricingResultJson as any;
      if (result.priceRange) {
        // priceRange contains low and high in cents
        medianLow = Math.round(result.priceRange.low / 100 * 100) / 100; // Convert cents to dollars
        medianHigh = Math.round(result.priceRange.high / 100 * 100) / 100;
      }
    }

    // Count actual sources consulted (filter out null/undefined)
    const sourceCount = compLookup.sourcesConsulted?.length || 0;

    // Format lastUpdated date
    const lastUpdated = compLookup.dataFreshness ? compLookup.dataFreshness.toISOString() : null;

    res.status(200).json({
      sourceCount,
      medianLow,
      medianHigh,
      lastUpdated,
    });
  } catch (error) {
    console.error('[getCompSummary] Error:', error);
    res.status(500).json({ message: 'Server error fetching comp summary' });
  }
};

/**
 * Get similar items for a given item
 * GET /api/items/:id/similar
 * Returns up to 6 items in the same category from active sales, excluding the current item
 */
export const getSimilarItems = async (req: Request, res: Response) => {
  try {
    const { id: itemId } = req.params;

    const currentItem = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, category: true },
    });

    if (!currentItem) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const similarItems = await prisma.item.findMany({
      where: {
        // Spread PUBLIC_ITEM_FILTER first so draftStatus='PUBLISHED' gating applies
        // (blocks PENDING_REVIEW / GRACE_LOCKED / inactive draft items from surfacing).
        // Explicit status override kept AFTER the spread so the narrower
        // AVAILABLE/PUBLISHED filter wins over the filter's status clause.
        ...PUBLIC_ITEM_FILTER,
        category: currentItem.category,
        status: { in: ['AVAILABLE', 'PUBLISHED'] },
        id: { not: itemId },
        saleId: { not: null },
        sale: { status: 'PUBLISHED' },
      },
      select: {
        id: true,
        title: true,
        price: true,
        photoUrls: true,
        condition: true,
        saleId: true,
        sale: {
          select: {
            title: true,
            city: true,
          },
        },
      },
      take: 6,
      orderBy: { createdAt: 'desc' },
    });

    const items = similarItems.map(item => ({
      id: item.id,
      title: item.title,
      price: item.price,
      photoUrl: item.photoUrls[0] ?? null,
      condition: item.condition,
      saleId: item.saleId!,
      sale: item.sale ? { title: item.sale.title, city: item.sale.city } : null,
    }));

    res.json({ items });
  } catch (error) {
    console.error('[getSimilarItems] Error:', error);
    res.status(500).json({ message: 'Server error fetching similar items' });
  }
};
// SEO: Sitemap items endpoint — returns id + updatedAt for all items in PUBLISHED sales
// Public, no auth required. Cap at 10,000 to keep response lightweight.
export const getSitemapItems = async (req: Request, res: Response) => {
  try {
    const items = await prisma.item.findMany({
      where: {
        sale: {
          status: 'PUBLISHED',
        },
      },
      select: {
        id: true,
        updatedAt: true,
      },
      take: 10000,
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ items });
  } catch (error) {
    console.error('[getSitemapItems] Error:', error);
    res.status(500).json({ message: 'Server error fetching sitemap items' });
  }
};
