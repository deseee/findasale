import { Request, Response } from 'express';
import { parse } from 'csv-parse';
import { AuthRequest } from '../middleware/auth';
import { Readable } from 'stream';
import { prisma } from '../index';
import { actualDiscountPct, loadStickerContext, resolveStickerPct } from '../utils/markdownSticker';
import { v2 as cloudinary } from 'cloudinary';
import { Decimal } from '@prisma/client/runtime/library';
import { ItemRarity } from '@prisma/client';
import axios from 'axios';
import { isSafeFetchUrl, SAFE_FETCH_AXIOS_OPTIONS } from '../utils/safeFetchUrl'; // SSRF guard for stored photoUrls
import { classifyPackageSurchargeTrigger } from '../services/ebayRateEstimateService'; // ADR-103 Phase 5: persisted margin-risk flag
import FormData from 'form-data';
import { z } from 'zod';
import { getIO } from '../lib/socket'; // V1: live bidding broadcast
import { fireWebhooks } from '../services/webhookService'; // X1
import { dispatchApiTierAutoFanout } from '../services/marketplace/autoFanoutDispatcher'; // ADR-DRAFT approve-to-autolist-fanout
import { analyzeItemImage, isCloudAIAvailable } from '../services/cloudAIService'; // CB5
import { checkAiTagQuota, incrementAiTagCount } from '../lib/aiTagsQuotaTracker';
import { retrieveCheckoutSessionAcrossAccounts } from '../utils/expireCheckoutSession'; // Hold-to-Pay checkout URL live-lookup
import { notifyPriceDropAlerts } from '../services/priceDropService'; // Price drop alerts
import { pushEvent } from '../services/liveFeedService'; // Feature #70: Live Sale Feed
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries'; // Phase 1B: Rapidfire Mode public item filtering
import { listPublicItemIds, parseSitemapPaging } from '../services/publicItemIndexService'; // GET /items/sitemap
import { computeHealthScore, HealthResult } from '../utils/listingHealthScore'; // Sprint 1: Listing Health Score
import { invalidateCommandCenterCache } from '../services/commandCenterService'; // P2-3: Cache invalidation
import { classifyEbayShipping } from '../utils/ebayShippingClassifier'; // P0 fix: ebayShippingClassification was never written anywhere
import { checkSaleOverLimit, checkItemOverPhotoLimit } from '../lib/tierEnforcement'; // Feature #75: Tier lapse enforcement
import { getClientIp } from '../utils/getClientIp'; // Platform Safety #94: Same-IP Bidder Detection
import { createNotification } from '../services/notificationService'; // P0: Bid notifications
import { closeAuction } from '../services/auctionService'; // Auction close flow
import { haversineDistance } from '../lib/placesService'; // Geofencing for QR scans
import { resetRapidDraftDebounce, rapidfireAIDebounce, heldAnalysisItems } from './uploadController'; // Rapidfire Mode: AI analysis debounce
import { evaluateAutoHighValueFlag, shouldRetainAutoFlag } from '../utils/highValueFlagging'; // Feature #371: Auto high-value flagging
import { awardXp, applyHuntPassMultiplier, XP_AWARDS, spendXp, getSpendableXp, checkMonthlyXpCap } from '../services/xpService'; // Phase 2a: XP awards
import { getRankBenefits } from '../utils/rankUtils'; // Phase 2b: Legendary early access filtering
import { enqueueFetchEbayComps } from '../jobs/fetchEbayComps'; // ADR-069 Phase 2: Async eBay comps
import { enqueueMarketplacePostJob } from '../services/marketplace/marketplacePosterService'; // ADR-083
import { fetchEbayPriceComps, endEbayListingIfExists, computeEffectivePackageWeight, refreshEbayAccessToken } from './ebayController'; // Bug #326: live listings for EbayCompTiles image grid; endEbayListingIfExists: P2 S1122 withdraw-on-SOLD; computeEffectivePackageWeight: package-estimation isolation ADR 2026-08-05
import { composeDescription, stripShippingPhrases, DescriptionSource } from '../services/descriptionMerger'; // Item Description Authoring Contract (2026-05-12)
import { checkAndAward } from '../services/achievementService'; // Feature #58: Achievement tracking
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService'; // Bug #461: FB nudge on single-item SOLD
import { sendItemSoldAlert } from '../services/saleAlertEmailService'; // P1 fix (2026-09-08): off-platform BYOR sold handler had zero organizer notification; reuse the same "item sold" email alert Stripe checkout already sends (stripeController.ts ~2144)
import { republishEbayOffer } from '../services/ebayPublishService'; // Phase 2 relocation + Phase 3 rewire (ADR 2026-06-30)
import { assertCheckoutAllowed, CheckoutGuardError } from '../services/checkoutGuard'; // S1072 Finding #4: collusion/wash-trade guard
import { commitItemSale, ItemAlreadyCommittedError } from '../services/itemSaleGuard'; // ADR-098: atomic double-sell guard
import { removeItemFromShopify, updateShopifyProductFields, markShopifyItemSold } from '../services/shopifyService'; // Cross-platform sync: unpublish on delete + propagate price/quantity edits + mark-sold-elsewhere
import { withdrawDiscogsListingIfExists } from '../services/marketplace/discogsListingConnector'; // P0 (S-discogs-sold-parity 2026-09-15): withdraw Discogs listing on SOLD, mirrors endEbayListingIfExists/markShopifyItemSold
import { evaluateLotItemEdit, lotDeleteBlocker, LOT_INVARIANT_MESSAGES } from '../services/bulkLot/bulkLotInvariants'; // ADR-136 Addendum B (#659): a lot stays a lot through the generic item form
import { findBulkLotItemIds } from '../services/bulkLot/bulkLotService';
import { isBulkLotsEnabled } from '../services/bulkLot/bulkLotConfig';
import { prepareItemForDeletion, recordItemDeletion } from '../services/itemDeletionService'; // eBay sync hardening (2026-10-01): shared withdraw+snapshot+audit for every hard delete
import { reopenEbayCancelledSale as reopenEbayCancelledSaleService } from '../services/ebaySaleReopenService'; // eBay sync hardening (2026-10-01): reopen an item whose eBay sale was cancelled/refunded
import { withdrawReverbListingIfExists } from '../services/marketplace/reverbConnector'; // 2026-09-23: withdraw Reverb listing on SOLD, beside Discogs
import { suggestNativeShippingPrice, ShippingHardBlockError as NativeShippingHardBlockError } from '../services/nativeShippingSuggestionService'; // ADR-104 Sec3: native-checkout suggested shipping price
import { getShippingRates } from '../services/shippingLabelService'; // ADR-115 Phase 3: live Shippo rate-check preview on the edit-item page (Finding 2, order-fulfillment-and-shipping-price-validation-2026-09-05.md)
import { computeChannelStatusForItems, ChannelStatusItemInput, ExtensionPlatformsUsed, PublishedExtensionPlatformsByItemId } from '../services/itemChannelStatusService'; // Add Items collapsed-row multi-channel status (2026-09-14), see ADR-2026-09-14-add-items-multichannel-status-aggregation.md
import type { ActingOrganizerRequest } from '../utils/actingOrganizer'; // 2026-09-29: Markdown Re-tag handlers read req.actingOrganizer (owner or TEAMS staff)
import { decodeHtmlEntities } from '../utils/htmlEntities'; // 2026-09-29: single-pass decode + tag strip for imported category text
import { checkQrScan, qrScanRejectionBody } from '../services/qrScanGuardService'; // 2026-09-29: sale window, rate limits, radius, impossible-speed guard shared by every location-gated XP path
import { parseLatitude, parseLongitude, parseAccuracyMeters, buildQrScanLockKey } from '../utils/qrScanGuards'; // 2026-09-29: strict scan coordinates + advisory-lock key for the QR-scan dedupe
import { IMPORT_FIELD_KEYS, IMPORT_MAX_ROWS, buildImportItem, detectImportColumnMapping, importPhotoCapForTier, RawImportRow, ImportRowContext } from '../services/itemCsvImport'; // 2026-09-29: one shared, hardened row validator for bulk-import + legacy import-items
import { CARD_PUBLIC_SELECT, CARD_EDIT_SELECT, parseCardInput, buildCardCreateData, buildCardNestedUpsert, isCardValidationError, cardValidationBody } from '../services/cardRecordService'; // ADR-134 #640 (B2): card record, the only ItemCard writer
import { organizerEditStamp, organizerEditStampAlways } from '../utils/organizerEdit'; // 2026-10-04: Item.lastEditedAt, stamped only by organizer request handlers
import { resolveItemOwnerOrganizer } from '../utils/itemOwner'; // 2026-10-04 (B1): default-deny owner resolution for sale items and inventory items (saleId null)
import { getPinnedCardCategory, isPinnedCardCategoryId, standardEnvelopePriceCrossing } from '../config/cardEbayCategories'; // ADR-134 5.4 (W4): pinned eBay category for a card record (pure module, no env or network)
import { normalizeCondition, normalizeGrade, type ConditionGrade } from '../utils/conditionMapping'; // 2026-10-04 (U4): one condition vocabulary; coerces legacy values, never 400s on them
import { pushItemToEbay, computeEbayPushFields, buildEbayPlan, buildExtensionPlan, EBAY_CONTENT_FIELDS, EBAY_PUSH_FIELDS, type EbayPushField, type MarketplacePlan } from '../services/ebayItemPushService'; // 2026-10-04 (U1/U2): structured, recorded eBay push extracted from updateItem
import { importedOnlyEditNeedsDirtyMark } from '../utils/ebayImportedEditMarker'; // imported-only eBay items: a local category/tags/photos edit must survive the next import
import { listedExtensionPlatformsByItemId, getItemMarketplaceStatus, getFailedPushCountsByItemId, ITEM_STATUS_SELECT, EXTENSION_PLATFORMS } from '../services/itemMarketplaceStatusService'; // 2026-10-04 (U3): newest-row-wins listing status shared by the Add Items list and GET /items/:id/marketplace-status

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
  /**
   * eBay condition note built by buildEbayConditionDescription. undefined leaves the existing note alone; null
   * removes it (a NEW item carries none); a string replaces it. Pass it with a condition change so the note
   * never keeps the old condition's text.
   */
  conditionDescription?: string | null;
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
      if (params.conditionDescription !== undefined) {
        if (params.conditionDescription) invObject.conditionDescription = params.conditionDescription;
        else delete invObject.conditionDescription;
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
// Auto-assignment tiers: price >= 500 → LEGENDARY, >= 75 → RARE, >= 25 → UNCOMMON, else → COMMON
// S261 (Architect, locked): ULTRA_RARE removed from the 4-tier scheme (COMMON/UNCOMMON/RARE/LEGENDARY).
// The former $200-499 ULTRA_RARE band now falls under RARE — its existing >= 75 boundary already covers it,
// no new price breakpoint introduced.
const assignRarity = (price: number | undefined | null): ItemRarity => {
  if (!price || price < 25) return ItemRarity.COMMON;
  if (price >= 500) return ItemRarity.LEGENDARY;
  if (price >= 75) return ItemRarity.RARE;
  return ItemRarity.UNCOMMON;
};

// B1 (2026-10-04): the organizer columns every ownership check needs. Handlers that call
// resolveItemOwnerOrganizer() load the item with `sale: { include: { organizer: { select: OWNER_ORGANIZER_SELECT } } }`
// (or the equivalent select) so a legitimate sale owner resolves without an extra query. Inventory items (saleId null)
// resolve through Item.organizerId plus the caller's userId inside the helper.
const OWNER_ORGANIZER_SELECT = { id: true, userId: true, subscriptionTier: true, lat: true, lng: true } as const;

// U7 (2026-10-04): true only when a submitted field value really differs from the stored one. Blank values
// (undefined, null, empty string) all mean "no value"; numbers compare numerically; arrays compare element by
// element; dates compare as instants. Used so userEditedFields (D-006) only records fields that actually changed.
/**
 * FCC ID normalizer: trim, uppercase, keep only letters, digits and hyphens, max 20 chars.
 * Empty or non-string input becomes null.
 */
export const normalizeFccId = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const cleaned = v.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
  return cleaned.length > 0 ? cleaned : null;
};

const fieldValueChanged = (existing: unknown, next: unknown): boolean => {
  const norm = (v: unknown): unknown => (v === undefined || v === '' ? null : v);
  const a = norm(existing);
  const b = norm(next);
  if (a === null || b === null) return a !== b;
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : new Date(a as string | number).getTime();
    const tb = b instanceof Date ? b.getTime() : new Date(b as string | number).getTime();
    return !Object.is(ta, tb);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return true;
    return a.some((v: unknown, i: number) => fieldValueChanged(v, b[i]));
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return Math.abs(na - nb) >= 1e-9;
    return String(a) !== String(b);
  }
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) !== JSON.stringify(b);
    } catch {
      return true;
    }
  }
  return a !== b;
};

// Configurable Consignment Intake Floor (2026-09-25, Patrick): the intake-time minimum
// price for a consigned item used to be hard-coded to $40 (4000 cents) below -- now
// organizer-settable via WorkspaceSettings.consignmentMinimumPriceCents (GET/PATCH
// /api/workspace/:workspaceId/settings, workspaceController.ts). Null/unset = platform
// default of 4000 cents ($40). Stored/compared in cents to avoid float rounding on a
// dollars comparison. ADVISORY only as of 2026-10-07 (no longer enforced by createItem/
// updateItem); still read by consignorAgreementService for the agreement wording.
const DEFAULT_CONSIGNMENT_MINIMUM_PRICE_CENTS = 4000;

export async function getConsignmentMinimumPriceCents(organizerId: string): Promise<number> {
  const workspace = await prisma.organizerWorkspace.findFirst({
    where: { ownerId: organizerId },
    select: { settings: { select: { consignmentMinimumPriceCents: true } } },
  });
  const cents = workspace?.settings?.consignmentMinimumPriceCents;
  return cents !== null && cents !== undefined ? cents : DEFAULT_CONSIGNMENT_MINIMUM_PRICE_CENTS;
}

// Hunt Pass Feature: Helper to check if item is visible to user based on rarity + Hunt Pass status
// Rare: 6 hours early access for Hunt Pass holders
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
  } else if (item.rarity === 'RARE') {
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

// ─── CSV item import (shared helpers for bulk-import + legacy import-items) ───────────────────────
// Row validation lives in services/itemCsvImport.ts (unit-tested). Every imported row lands as a DRAFT
// (draftStatus DRAFT, status AVAILABLE) so the organizer reviews + publishes it; photoUrls are https-only
// strings; max 200 rows per import; `status` cannot be used to create SOLD / AUCTION_ENDED items.

const BULK_IMPORT_MAX = IMPORT_MAX_ROWS;

/** Parse an uploaded CSV buffer (BOM-safe: Excel "CSV UTF-8" files start with a byte-order mark). */
async function parseImportCsv(buffer: Buffer): Promise<Record<string, string>[]> {
  const records: Record<string, string>[] = [];
  const parser = Readable.from(buffer).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true, bom: true })
  );
  for await (const record of parser) {
    records.push(record);
  }
  return records;
}

/**
 * Turn CSV rows into createMany-ready item data. columnMap: FindA.Sale field -> CSV header.
 * Never throws for bad rows: they are reported in `errors` (row is skipped) or `warnings` (row imported).
 */
function collectImportRows(
  rows: Record<string, string>[],
  columnMap: Record<string, string>,
  ctx: ImportRowContext
): { items: any[]; errors: { row: number; reason: string }[]; warnings: { row: number; reason: string }[] } {
  const items: any[] = [];
  const errors: { row: number; reason: string }[] = [];
  const warnings: { row: number; reason: string }[] = [];

  rows.forEach((record, i) => {
    const rowNum = i + 2; // +2: 1-indexed + header row
    const rawRow: Record<string, string> = {};
    for (const key of IMPORT_FIELD_KEYS) {
      const col = columnMap[key];
      if (typeof col === 'string' && col && Object.prototype.hasOwnProperty.call(record, col)) {
        rawRow[key] = String(record[col] ?? '');
      }
    }
    if (rawRow.category !== undefined) rawRow.category = decodeHtmlEntities(rawRow.category.trim());

    const result = buildImportItem(rawRow as RawImportRow, ctx);
    if (!result.ok) {
      errors.push({ row: rowNum, reason: result.error });
      return;
    }
    result.warnings.forEach((reason) => warnings.push({ row: rowNum, reason }));
    items.push({
      ...result.data,
      // Same derived fields createItem sets (Feature #57 rarity, eBay shipping tier)
      rarity: assignRarity(result.data.price),
      ebayShippingClassification: classifyEbayShipping(result.data.category, []),
    });
  });

  return { items, errors, warnings };
}

const MAX_WARNINGS_RETURNED = 50;

// Bulk import items from CSV (legacy route: POST /api/items/:saleId/import-items).
// Header names are matched case-insensitively against the same aliases bulk-import uses (title, price,
// description, condition, category, photoUrls, status, auctionStartPrice, bidIncrement, auctionEndTime,
// reverseAuction, reverseDailyDrop, reverseFloorPrice, reverseStartDate). Rows import as DRAFT.
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
          select: { userId: true, subscriptionTier: true }
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
    let records: Record<string, string>[];
    try {
      records = await parseImportCsv(file.buffer);
    } catch (parseErr: any) {
      return res.status(400).json({ message: `Could not read the CSV file: ${parseErr?.message ?? 'invalid format'}` });
    }

    if (records.length === 0) {
      return res.status(400).json({ message: 'CSV is empty or has no data rows.' });
    }

    const columnMap = detectImportColumnMapping(Object.keys(records[0]));
    if (!columnMap.title) {
      return res.status(400).json({ message: 'CSV must include a title column (title, name, item name, product).' });
    }

    // Cap at 200 rows (same cap as bulk-import)
    const rowsToProcess = records.slice(0, BULK_IMPORT_MAX);
    const skippedDueToCap = Math.max(0, records.length - BULK_IMPORT_MAX);

    const { items: itemsToCreate, errors: rowErrors, warnings } = collectImportRows(rowsToProcess, columnMap, {
      saleId,
      organizerId: sale.organizerId,
      maxPhotos: importPhotoCapForTier(sale.organizer.subscriptionTier),
      requirePrice: false,
    });

    if (itemsToCreate.length === 0) {
      return res.status(400).json({
        message: 'No valid rows found. All rows failed validation.',
        errors: rowErrors,
      });
    }

    // Create items in database (DRAFT: organizer reviews and publishes from Review & Publish)
    const createdItems = await prisma.item.createMany({
      data: itemsToCreate,
      skipDuplicates: false
    });

    res.json({
      message: `Successfully imported ${createdItems.count} items as drafts${rowErrors.length > 0 ? ` (${rowErrors.length} row(s) skipped due to validation errors)` : ''}`,
      itemCount: createdItems.count,
      savedAs: 'DRAFT',
      ...(rowErrors.length > 0 ? { rowErrors } : {}),
      ...(warnings.length > 0 ? { warnings: warnings.slice(0, MAX_WARNINGS_RETURNED), warningCount: warnings.length } : {}),
      ...(skippedDueToCap > 0 ? { cappedAt200: true, rowsIgnoredBeyondCap: skippedDueToCap } : {}),
    });
  } catch (error: any) {
    console.error('CSV import error:', error);
    res.status(500).json({
      message: 'Failed to import items from CSV'
    });
  }
};

// ─── Feature #395: Bulk Import Tool (Phase 1) ────────────────────────────────
// POST /api/items/:saleId/bulk-import
// Accepts multipart/form-data with field `file` (CSV)
// ?confirm=true → performs actual import (createMany)
// Without confirm → returns preview of first 5 rows + detected column names
// Max 200 items per import. draftStatus: DRAFT.
// Mappable fields: title, price, description, condition, category, photoUrls, status (DRAFT/AVAILABLE only),
// auctionStartPrice, bidIncrement, auctionEndTime, reverseAuction, reverseDailyDrop, reverseFloorPrice,
// reverseStartDate (see services/itemCsvImport.ts for the per-row rules).

function detectColumnMapping(headers: string[]): Record<string, string> {
  return detectImportColumnMapping(headers);
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
      include: { organizer: { select: { userId: true, subscriptionTier: true } } },
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
    let records: Record<string, string>[];
    try {
      records = await parseImportCsv(file.buffer);
    } catch (parseErr: any) {
      res.status(400).json({ error: `Could not read the CSV file: ${parseErr?.message ?? 'invalid format'}` });
      return;
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
    if (!columnMap || typeof columnMap !== 'object' || Array.isArray(columnMap)) {
      res.status(400).json({ error: 'columnMap must be a JSON object: { "title": "YourTitleColumn", "price": "YourPriceColumn" }' });
      return;
    }

    if (!columnMap.title) {
      res.status(400).json({ error: 'columnMap must include a mapping for "title".' });
      return;
    }
    if (!columnMap.price && !columnMap.auctionStartPrice) {
      res.status(400).json({ error: 'columnMap must include a mapping for "price" (or "auctionStartPrice" for auction files).' });
      return;
    }

    // Cap at 200 items
    const rowsToProcess = records.slice(0, BULK_IMPORT_MAX);
    const skippedDueToCap = records.length > BULK_IMPORT_MAX ? records.length - BULK_IMPORT_MAX : 0;

    const { items: itemsToCreate, errors, warnings } = collectImportRows(rowsToProcess, columnMap, {
      saleId,
      organizerId: sale.organizerId,
      maxPhotos: importPhotoCapForTier(sale.organizer.subscriptionTier),
      requirePrice: true,
    });

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
      savedAs: 'DRAFT',
      ...(warnings.length > 0 ? { warnings: warnings.slice(0, MAX_WARNINGS_RETURNED), warningCount: warnings.length } : {}),
      ...(skippedDueToCap > 0 ? { cappedAt200: true, rowsIgnoredBeyondCap: skippedDueToCap } : {}),
    });
  } catch (error: any) {
    console.error('Bulk import error:', error);
    res.status(500).json({ error: 'Bulk import failed.' });
  }
};
// ─── End Feature #395 ─────────────────────────────────────────────────────────

// Shared field selection for full item-detail responses. Extracted so
// getItemById (public/shopper-facing, permissive visibility gate) and
// getItemForEdit (organizer-only, strict-ownership — see below) always return
// the exact same response shape, avoiding drift between the two read paths.
// Use select instead of include to avoid querying columns that may not
// exist in production yet (tags) or that crash serialization (embedding).
const ITEM_DETAIL_SELECT = {
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
        shippingPriceSource: true,
        shippingPriceConfirmedByOrganizer: true,
        crosslisterFreeShipping: true,
        // 2026-08-27: lets the item edit page know an item was already pushed to Discogs
        // without re-checking eligibility every load.
        discogsListingId: true,
        discogsListedAt: true,
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
        // S1124 QA finding: these 4 fields are correctly write-whitelisted in updateItem
        // (ADR-085 Track A) but were NEVER in this read select -- saves succeeded in the
        // DB but the edit-item form always displayed stale/default values on reload,
        // making the fix look broken even though the write path was correct.
        quantity: true,
        // ADR-087 P1: stockTotal must be in this read select so the edit-item form
        // round-trips the saved "Units available" value on reload (same S1124 bug class
        // as the quantity note above). ADR-087 P2/D5: stockSold is now also exposed so the
        // public storefront can compute units remaining ((stockTotal ?? 1) - stockSold).
        // Both are server-owned unit counts -- read-only exposure, no private-field leak.
        stockTotal: true,
        stockSold: true,
        ebayShippingOverride: true,
        ebayFulfillmentPolicyOverrideId: true,
        packageConfirmedByOrganizer: true,
        packageEstimateSource: true,
        brand: true,
        size: true,
        color: true,
        material: true,
        mpn: true,
        fccId: true,
        upc: true,
        // BUG FIX 2026-09-03 (ADR-090 follow-up, Patrick-reported "still don't see the isbn on
        // the edit item page"): isbn was never in this shared select at all -- mpn/upc (same
        // identifier category, same public-shopper-select precedent below) were, isbn just got
        // missed. Without this, getItemForEdit could never return isbn to the frontend no matter
        // what the edit-item page itself does with it.
        isbn: true,
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
        // ADR-134 #640 (B2): optional 1:1 card record (null for non-card items). PUBLIC select: never
        // lockedFields, dedupKey, organizerId or catalogPrintingId. getItemForEdit overrides this key
        // with CARD_EDIT_SELECT (owner-only). Item.organizerId above is pre-existing and unchanged.
        card: { select: CARD_PUBLIC_SELECT },
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
            // #402: whether the ORGANIZER absorbs the premium instead of the winner — the bid
            // preview must not quote a premium the buyer will never be charged. The premium
            // RATE itself is the platform constant and is not read from the sale at all.
            coversFee: true,
            organizer: {
              select: {
                userId: true,
                businessName: true,
                // Square migration single-item-checkout fix (2026-09-11, findasale-dev BUG
                // MODE): CheckoutModal.tsx needs to know if this organizer is Square-only
                // BEFORE calling checkout, same reasoning as CartDrawer.tsx's own
                // squareOnboarded/squareMerchantId/squareLocationId fix (2026-09-10, see
                // saleController.ts getSale). Without this, single-item Buy Now always tried
                // Stripe even for organizers with no live Stripe Connect account.
                squareOnboarded: true,
                squareMerchantId: true,
                squareLocationId: true,
                user: {
                  select: { name: true }
                }
              }
            }
          }
        },
        checkoutAttempts: {
          select: { id: true }
        },
        // Hold-to-Pay (#221): the item's single active hold (ItemReservation.itemId is
        // @unique, so this is a to-one relation). Selected here so BOTH read paths can
        // derive the buyer-identity fields the organizer's Hold-to-Pay modal needs.
        // PRIVACY: the raw object is NEVER returned. getItemById strips it and replaces
        // it with an ownership-gated, flattened subset (buildHoldFieldsForViewer below);
        // getItemForEdit is organizer-only + ownership-checked and does the same for
        // response-shape parity. Nothing here may be spread into a public response.
        reservation: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            userId: true,
            user: { select: { name: true, email: true } },
            invoice: { select: { expiresAt: true, stripeSessionId: true, stripeAccountId: true, status: true, totalAmount: true, itemIds: true } }
          }
        }
} as const;

// Hold-to-Pay (#221) — buyer-identity fields derived from an item's active hold.
//
// SECURITY: every field below identifies the shopper who is holding the item, so the
// full set is returned ONLY to the organizer who owns the sale, or to an admin. The
// single narrower exception is the holding shopper themselves: they get their own user
// id back (so the item page can render their own "payment requested" card) plus the
// payment deadline. They learn nothing they did not already know. Everyone else —
// anonymous visitors and any other signed-in shopper — gets an empty object, i.e. the
// response is byte-for-byte what it was before this feature existed.
type HoldForViewer = {
  id: string;
  status: string;
  expiresAt: Date;
  userId: string;
  user?: { name: string | null; email: string } | null;
  invoice?: { expiresAt: Date; stripeSessionId: string | null; stripeAccountId: string | null; status: string; totalAmount: number; itemIds: string[] } | null;
} | null | undefined;

// Statuses in which a hold is genuinely live. A settled ('COMPLETED'), cancelled or
// expired hold exposes nothing about its former holder.
const ACTIVE_HOLD_STATUSES = ['PENDING', 'CONFIRMED', 'HOLD_IN_CART', 'INVOICE_ISSUED'];

// exported (2026-09-29) so the single-item discounted-invoice total is unit-testable
export async function buildHoldFieldsForViewer(
  reservation: HoldForViewer,
  viewer: { isOwnerOrAdmin: boolean; viewerUserId?: string }
): Promise<Record<string, unknown>> {
  if (!reservation || !ACTIVE_HOLD_STATUSES.includes(reservation.status)) return {};

  // Payment deadline: the invoice's own expiry once one exists, otherwise the hold
  // timer itself — markSoldAndCreateInvoice sets the invoice window equal to the hold
  // remainder (LOCKED DECISION #7), so the hold expiry is the correct pre-invoice
  // preview of the deadline the shopper will get.
  const invoiceExpiresAt = reservation.invoice?.expiresAt ?? reservation.expiresAt;

  if (viewer.isOwnerOrAdmin) {
    return {
      // reservationId is what POST /api/reservations/:id/mark-sold keys on. The item id
      // is NOT interchangeable with it (the frontend used to pass the item id there,
      // which could only ever 404).
      reservationId: reservation.id,
      reservationStatus: reservation.status,
      reservedBy: reservation.userId,
      reservedByName: reservation.user?.name ?? null,
      reservedByEmail: reservation.user?.email ?? null,
      invoiceExpiresAt,
    };
  }

  if (viewer.viewerUserId && viewer.viewerUserId === reservation.userId) {
    // P0 fix (2026-08-23, live $0.50 Hold-to-Pay test): this used to return no checkout
    // URL at all -- item.invoiceCheckoutUrl was a phantom frontend field the backend never
    // populated, so HoldInvoiceStatusCard's "Complete Payment" button silently no-opped for
    // every shopper who wasn't reading the raw Stripe link out of their invoice email. The
    // Session URL is never persisted (HoldInvoice only stores stripeSessionId), so retrieve
    // it live -- reusing the same platform-then-connected-account fallback helper the
    // expiry/dead-invoice jobs already rely on for Direct-charge sessions. Only attempted
    // while the invoice is still PENDING; a PAID/EXPIRED/CANCELLED session isn't payable
    // and isn't worth a Stripe round-trip on every page view.
    let invoiceCheckoutUrl: string | null = null;
    if (reservation.invoice?.stripeSessionId && reservation.invoice.status === 'PENDING') {
      try {
        const session = await retrieveCheckoutSessionAcrossAccounts(
          reservation.invoice.stripeSessionId,
          reservation.invoice.stripeAccountId
        );
        invoiceCheckoutUrl = session.url ?? null;
      } catch (err: any) {
        console.warn(
          `[getItemById] Failed to retrieve checkout session for invoice checkout URL (item=${reservation.id}): ${err?.message ?? err}`
        );
      }
    }
    // Bug fix (2026-08-30, Patrick: bundled Hold-to-Pay invoice email link only showed
    // this item's own price, not the real bundled total shown on the actual Stripe
    // checkout -- e.g. a 2-item $1.50 invoice showed "Amount Due $0.75" on the item
    // page, even though clicking through correctly charged $1.50 for both items.
    // Expose the invoice's real total + item count so the card can show the true amount.
    const invoiceItemCount = reservation.invoice?.itemIds?.length ?? 1;
    // 2026-09-29 (Crew Invasion): the invoice's real total is returned for EVERY invoice, not just
    // bundled ones, so a single-item invoice carrying the crew discount shows the true (lower)
    // amount instead of the list price. The card still treats it as "bundled" only when
    // invoiceItemCount > 1 (see HoldInvoiceStatusCard.isBundled) and compares against the item
    // price to show the discount line, so multi-item behavior is unchanged. null only when the
    // reservation has no invoice.
    const invoiceTotalAmount = reservation.invoice
      ? reservation.invoice.totalAmount / 100
      : null;
    return {
      reservedBy: reservation.userId,
      invoiceExpiresAt,
      invoiceCheckoutUrl,
      invoiceItemCount,
      invoiceTotalAmount,
    };
  }

  return {};
}

export const getItemById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;

    const item = await prisma.item.findUnique({
      where: { id },
      select: ITEM_DETAIL_SELECT
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // ADR-013 lazy-close REMOVED 2026-08-08 (shipped-batch verification finding, roadmap #609
    // knock-on): this used to write auctionClosed:true directly from a GET/page-view path with
    // zero payment/winner-notification logic. Today's #609 fix made auctionClosed:false the
    // required precondition for BOTH the cron (auctionJob.ts) and the manual-close atomic claim
    // (auctionService.ts) to ever run their real close logic -- so a page view (near-certain to
    // happen before the 5-min cron) was permanently stranding ended auctions: flag flipped true,
    // no winner ever charged or notified, no reconciliation job to catch it. Display of the
    // "ended" state for this response does NOT depend on this write -- auctionStatus below is
    // already computed independently from auctionEndTime vs now. Real closure (payment + winner
    // notification) now happens ONLY via the cron / organizer manual-close, both of which use the
    // atomic auctionClosed:false->true claim. Late-bid rejection is enforced independently and
    // authoritatively in placeBid() via an explicit auctionEndTime check (see itemController.ts
    // placeBid), not by this now-removed write.
    // (item.auctionClosed is left exactly as read from the DB -- not mutated here.)

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
      checkoutAttempts: undefined, // exclude from response
      // Hold-to-Pay (#221): NEVER return the raw hold row from this endpoint — it is a
      // public, optionally-authenticated read. Buyer identity is flattened and
      // ownership-gated below via buildHoldFieldsForViewer.
      reservation: undefined
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

    // Security: gate items belonging to non-public (DRAFT/CANCELLED) sales.
    // Owner and admin may still preview. ENDED sales are allowed through for anonymous
    // viewers (S1099) — matches the sale-level fix in saleController.getSale; frontend's
    // own noindex policy handles SEO treatment, this endpoint just needs to not 404 first.
    if (!isOwner && !isAdmin && item.sale && item.sale.status !== 'PUBLISHED' && item.sale.status !== 'ENDED') {
      return res.status(404).json({ message: 'Item not found' });
    }

    // For everyone else, enforce public visibility rules: must be active.
    // Allow NULL draftStatus (legacy/seeded items pre-Rapidfire) and PUBLISHED items.
    // Only explicitly DRAFT items are blocked (Rapidfire items being AI-analyzed by organizer).
    if (!isOwner && !isAdmin && (!item.isActive || item.draftStatus === 'DRAFT' || item.listingType === 'CONSIGNOR_TAG')) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Hold-to-Pay (#221): buyer-identity fields, gated on the SAME isOwner/isAdmin
    // signals this endpoint already uses for its DRAFT-sale and inactive-item gates —
    // deliberately not a second, parallel notion of ownership.
    const holdFields = await buildHoldFieldsForViewer(item.reservation, {
      isOwnerOrAdmin: isOwner || isAdmin,
      viewerUserId: authReq.user?.id,
    });

    res.json({ ...itemWithCounts, ...holdFields });
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ message: 'Server error while fetching item' });
  }
};

// GET /api/items/:id/edit — organizer-only, strict-ownership item fetch dedicated
// to the edit-item page. getItemById above is intentionally shared with the public
// shopper-facing item page and therefore uses a permissive "is this item publicly
// visible" gate (any PUBLISHED+active item, regardless of who is asking) rather than
// an ownership check. That permissive gate is correct for the public page, but the
// edit-item frontend was calling that SAME endpoint with no additional client-side
// ownership check of its own — so a second signed-in user could load (though not
// save — updateItem's ownership check already correctly rejected the PUT) another
// organizer's item into the edit form (OWASP A01 / IDOR). This endpoint closes that
// gap by requiring the SAME ownership check updateItem already enforces, before ever
// returning item data, and the edit-item page now calls this endpoint instead.
export const getItemForEdit = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    // (2026-08-14 bug fix) allowBestOffer/bestOfferAutoAcceptAmt/bestOfferMinimumAmt are
    // deliberately NOT in the shared ITEM_DETAIL_SELECT -- that select is also used by the
    // PUBLIC shopper-facing getItemById below, and these are the seller's accept/decline
    // negotiation thresholds; exposing them to a shopper would let them lowball exactly at
    // the floor. Extend the select with those 3 fields ONLY here, on the organizer-only,
    // ownership-checked edit endpoint -- never add them to the shared constant itself.
    // Root cause this was covering for: updateItem writes these correctly (confirmed via
    // direct DB read after a real save), but no read path ever returned them, so every
    // refetch of this endpoint (including the one the eBay-push success handler triggers
    // via queryClient.invalidateQueries) reset the edit-item form's percent fields back to
    // blank, because the reverse dollars-to-percent calc always saw undefined amounts.
    const item = await prisma.item.findUnique({
      where: { id },
      // ADR-134 #640 (B2): the owner's edit read adds lockedFields + catalogPrintingId to the card block (never dedupKey/organizerId).
      // 2026-10-04 (U3): reverbListingId (so the Edit page can show the Reverb chip) and the eBay hold state (U2: the
      // "eBay sync paused" chip) are owner-only reads, added to THIS extra select only, never to the shared ITEM_DETAIL_SELECT.
      select: { ...ITEM_DETAIL_SELECT, allowBestOffer: true, bestOfferAutoAcceptAmt: true, bestOfferMinimumAmt: true, excludeFromMarkdown: true, consignorId: true, lastEditedAt: true, reverbListingId: true, ebaySyncHeldAt: true, ebayHeldFields: true, ebayContentDirtyAt: true, card: { select: CARD_EDIT_SELECT } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Ownership check — mirrors updateItem's sale-based check, extended to also
    // cover denormalized inventory items (saleId=null) the same way getItemById
    // already does for its own (looser) visibility gate.
    let isOwner = req.user.id === item.sale?.organizer?.userId;
    if (!isOwner && !item.saleId && (item as any).organizerId) {
      const inventoryOrganizer = await prisma.organizer.findFirst({
        where: { id: (item as any).organizerId, userId: req.user.id },
        select: { id: true }
      });
      if (inventoryOrganizer) isOwner = true;
    }

    if (!isOwner) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }

    // ADR-013 lazy-close REMOVED 2026-08-08 -- same fix and same reasoning as getItemById
    // above (see that comment for the full explanation). item.auctionClosed is left exactly as
    // read from the DB -- not mutated here.

    const cartCount = item.checkoutAttempts?.length ?? 0;
    const views = 0;

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

    const itemWithCounts = {
      ...item,
      cartCount,
      views,
      auctionStatus,
      checkoutAttempts: undefined,
      // Hold-to-Pay (#221): same strip-and-flatten as getItemById, so the two read
      // paths keep the identical response shape this shared select exists to guarantee.
      // This endpoint is organizer-only AND ownership-checked above, so the viewer is
      // always the owner by the time we get here.
      reservation: undefined
    };

    const holdFields = await buildHoldFieldsForViewer(item.reservation, {
      isOwnerOrAdmin: true,
      viewerUserId: req.user.id,
    });

    res.json({ ...itemWithCounts, ...holdFields });
  } catch (error) {
    console.error('Error fetching item for edit:', error);
    res.status(500).json({ message: 'Server error while fetching item' });
  }
};

// ---------------------------------------------------------------------------------------------------------
// Marketplace status and eBay push controls (item editor unification, Wave 2: U1, U2, U3).
// Every handler resolves the owner through resolveItemOwnerOrganizer (default deny, inventory safe). A caller who is
// not the owner, and a missing item, get the SAME 404 { message: 'Item not found' } so existence never leaks.
// ---------------------------------------------------------------------------------------------------------

const MARKETPLACE_ITEM_OWNER_SELECT = {
  saleId: true,
  organizerId: true,
  sale: { select: { organizer: { select: { id: true, userId: true, subscriptionTier: true, lat: true, lng: true } } } },
} as const;

/**
 * Shared prelude: organizer role, item lookup, owner resolution. Sends the 403/404 itself and returns null when the
 * request must stop; otherwise returns the item row (with `extraSelect` fields) and the resolved owner.
 */
async function loadOwnedItemForMarketplace<S extends Record<string, unknown>>(
  req: AuthRequest,
  res: Response,
  extraSelect: S
) {
  const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
  if (!req.user || !hasOrganizerRole) {
    res.status(403).json({ message: 'Access denied. Organizer access required.' });
    return null;
  }
  const { id } = req.params;
  const item = await prisma.item.findUnique({
    where: { id },
    select: { id: true, ...MARKETPLACE_ITEM_OWNER_SELECT, ...extraSelect } as any,
  });
  if (!item) {
    res.status(404).json({ message: 'Item not found' });
    return null;
  }
  const owner = await resolveItemOwnerOrganizer(item as any, req.user.id);
  if (!owner) {
    res.status(404).json({ message: 'Item not found' });
    return null;
  }
  return { item: item as any, owner };
}

// GET /api/items/:id/marketplace-status
export const getItemMarketplaceStatusHandler = async (req: AuthRequest, res: Response) => {
  try {
    const loaded = await loadOwnedItemForMarketplace(req, res, ITEM_STATUS_SELECT);
    if (!loaded) return;
    const status = await getItemMarketplaceStatus({ item: loaded.item, ownerOrganizerId: loaded.owner.id });
    res.json(status);
  } catch (error) {
    console.error('Error fetching item marketplace status:', error);
    res.status(500).json({ message: 'Server error while fetching marketplace status' });
  }
};

// POST /api/items/:id/marketplace-push/ack: dismisses this organizer's own FAILED or PARTIAL eBay push rows for the item.
export const acknowledgeItemMarketplacePush = async (req: AuthRequest, res: Response) => {
  try {
    const loaded = await loadOwnedItemForMarketplace(req, res, {});
    if (!loaded) return;
    // organizerId is the RESOLVED owner, never anything from the request, so another organizer's rows are untouchable.
    const result = await prisma.itemMarketplacePush.updateMany({
      where: {
        itemId: loaded.item.id,
        organizerId: loaded.owner.id,
        platform: 'EBAY',
        status: { in: ['FAILED', 'PARTIAL'] },
        acknowledgedAt: null,
      },
      data: { acknowledgedAt: new Date() },
    });
    res.json({ acknowledged: result.count });
  } catch (error) {
    console.error('Error acknowledging marketplace push:', error);
    res.status(500).json({ message: 'Server error while acknowledging the update' });
  }
};

const HOLD_SELECT = { ebaySyncHeldAt: true, ebayHeldFields: true, ebayContentDirtyAt: true } as const;
const holdView = (row: { ebaySyncHeldAt?: Date | null; ebayHeldFields?: string[] | null; ebayContentDirtyAt?: Date | null } | null) => ({
  heldAt: row?.ebaySyncHeldAt ?? null,
  heldFields: row?.ebayHeldFields ?? [],
  contentDirtyAt: row?.ebayContentDirtyAt ?? null,
});

// Item ids with an "Update eBay now" or retry in flight on THIS process. A second click (or a scripted burst) for the same
// item gets 409 instead of a second GET, PUT and republish round trip against the organizer's eBay account. The route's
// per-user limiter (ebayRepushLimiter, Redis-backed) bounds the rate across instances; this bounds concurrency per item.
const repushInFlight = new Set<string>();

// POST /api/items/:id/ebay-repush: the explicit "Update eBay now". Body { retry: true } retries the newest failed push.
export const repushItemToEbay = async (req: AuthRequest, res: Response) => {
  let guardedItemId: string | null = null;
  try {
    const loaded = await loadOwnedItemForMarketplace(req, res, { ebayOfferId: true, ebayListingId: true, ...HOLD_SELECT });
    if (!loaded) return;
    const { item, owner } = loaded;

    // Default (Patrick D8): pushing a saleless inventory item to eBay is not built yet. Message only, no eBay call.
    if (!item.saleId) {
      return res.json({
        outcome: null,
        ebayHold: holdView(item),
        message: 'Updating eBay from here is not available for inventory items yet. Edit the listing on eBay, or add the item to a sale first.',
      });
    }

    // Check and add are adjacent with no await between them, so two concurrent requests cannot both pass.
    if (repushInFlight.has(item.id)) {
      return res.status(409).json({ message: 'An eBay update for this item is already running. Give it a moment, then check the status.' });
    }
    repushInFlight.add(item.id);
    guardedItemId = item.id;

    const retry = (req.body as { retry?: unknown } | undefined)?.retry === true;
    let trigger: 'REPUSH' | 'RETRY' = 'REPUSH';
    let fields: EbayPushField[] | null = null;

    if (retry) {
      const failed = await prisma.itemMarketplacePush.findFirst({
        where: { itemId: item.id, organizerId: owner.id, platform: 'EBAY', status: { in: ['FAILED', 'PARTIAL'] } },
        orderBy: { createdAt: 'desc' },
        select: { fieldsAttempted: true, fieldsPushed: true },
      });
      if (failed) {
        const left = failed.fieldsAttempted.filter((f: string) => !failed.fieldsPushed.includes(f));
        const valid = (left.length > 0 ? left : failed.fieldsAttempted).filter((f: string): f is EbayPushField =>
          (EBAY_PUSH_FIELDS as readonly string[]).includes(f)
        );
        if (valid.length > 0) {
          trigger = 'RETRY';
          fields = valid;
        }
      }
    }

    if (!fields) {
      // Held fields plus, when the item is dirty or nothing is recorded as held, the three content fields. With nothing
      // held and nothing dirty this is a full sync of title, description, condition and price.
      const held = ((item.ebayHeldFields ?? []) as string[]).filter((f) => (EBAY_PUSH_FIELDS as readonly string[]).includes(f)) as EbayPushField[];
      const set = new Set<EbayPushField>(held);
      if (item.ebayContentDirtyAt || set.size === 0) EBAY_CONTENT_FIELDS.forEach((f) => set.add(f));
      if (!item.ebayContentDirtyAt && held.length === 0) set.add('price');
      fields = Array.from(set);
    }

    const outcome = await pushItemToEbay({ itemId: item.id, organizerId: owner.id, trigger, fields });
    const after = await prisma.item.findUnique({ where: { id: item.id }, select: HOLD_SELECT });

    const message =
      outcome.status === 'SUCCESS'
        ? 'eBay is up to date.'
        : outcome.status === 'PARTIAL'
          ? 'eBay was only partly updated.'
          : outcome.status === 'SKIPPED_NOT_LISTED'
            ? outcome.errorCode === 'ITEM_NOT_ACTIVE'
              ? 'This item is no longer for sale, so eBay was not changed.'
              : 'This item is not listed on eBay.'
            : 'eBay could not be updated.';
    res.json({ outcome, ebayHold: holdView(after), message });
  } catch (error) {
    console.error('Error re-pushing item to eBay:', error);
    res.status(500).json({ message: 'Server error while updating eBay' });
  } finally {
    if (guardedItemId) repushInFlight.delete(guardedItemId);
  }
};

// POST /api/items/:id/ebay-hold/release: "Resume syncing". Clears the hold WITHOUT pushing, so the next pull-sync
// cycle takes eBay's current values again.
export const releaseEbayHold = async (req: AuthRequest, res: Response) => {
  try {
    const loaded = await loadOwnedItemForMarketplace(req, res, {});
    if (!loaded) return;
    await prisma.item.update({
      where: { id: loaded.item.id },
      data: { ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null },
    });
    res.json({ released: true, ebayHold: holdView(null) });
  } catch (error) {
    console.error('Error releasing eBay hold:', error);
    res.status(500).json({ message: 'Server error while resuming syncing' });
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
      // S1099: ENDED sales allowed through (matches getSale/getItemById) — only DRAFT/CANCELLED
      // (and any future non-public status) are hidden from non-owner/non-admin callers.
      if (parentSale && parentSale.status !== 'PUBLISHED' && parentSale.status !== 'ENDED' && !isSaleOwner && !isSaleAdmin) {
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
        crosslisterFreeShipping: true,
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

/**
 * U4 (2026-10-04): one condition vocabulary. Coerces a submitted condition to the canonical four
 * (NEW, USED, REFURBISHED, PARTS_OR_REPAIR) through normalizeCondition. It never rejects: the current frontend
 * still sends legacy values such as LIKE_NEW and GOOD, and those coerce (LIKE_NEW to USED with hint grade A).
 *   empty or null  -> write null (clears the field)
 *   recognized     -> write the canonical value (plus an optional hint grade)
 *   unknown        -> logged, and NOT written: the stored value stays as it is (null on create)
 */
function coerceConditionInput(raw: unknown, ctx: string): { write: boolean; value: string | null; hintGrade?: ConditionGrade } {
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) return { write: true, value: null };
  const normalized = normalizeCondition(raw);
  if (normalized.condition === null) {
    console.warn(`[${ctx}] unrecognized condition ${JSON.stringify(typeof raw === 'string' ? raw.slice(0, 40) : typeof raw)} ignored (existing value kept)`);
    return { write: false, value: null };
  }
  return { write: true, value: normalized.condition, ...(normalized.hintGrade ? { hintGrade: normalized.hintGrade } : {}) };
}

/** Grade counterpart of coerceConditionInput: empty clears, a valid S to D grade is kept (trimmed, uppercased), anything else is ignored with a log. */
function coerceGradeInput(raw: unknown, ctx: string): { write: boolean; value: ConditionGrade | null } {
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) return { write: true, value: null };
  const grade = normalizeGrade(raw);
  if (grade === null) {
    console.warn(`[${ctx}] unrecognized conditionGrade ${JSON.stringify(typeof raw === 'string' ? raw.slice(0, 40) : typeof raw)} ignored (existing value kept)`);
    return { write: false, value: null };
  }
  return { write: true, value: grade };
}

export const createItem = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { saleId, title, description, price, auctionStartPrice, auctionReservePrice, bidIncrement, auctionEndTime, status, category, condition, conditionGrade, shippingAvailable, shippingPrice, reverseAuction, reverseDailyDrop, reverseFloorPrice, reverseStartDate, listingType, isAiTagged, rarity, aiConfidence, consignorId, card } = req.body;
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

    // ADR-134 #640 (B2): optional card record. Validated up front (unknown key or bad value -> 400
    // CARD_VALIDATION) so nothing is written for a bad card. Multipart bodies send `card` as a JSON string.
    // organizerId is filled in below from the sale; it is never taken from the request.
    let cardCreateBase: ReturnType<typeof buildCardCreateData> | undefined;
    if (card !== undefined && card !== null && card !== '') {
      try {
        cardCreateBase = buildCardCreateData(card, null);
      } catch (cardErr) {
        if (isCardValidationError(cardErr)) return res.status(400).json(cardValidationBody(cardErr));
        throw cardErr;
      }
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
      select: { id: true, subscriptionTier: true }
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

    // Feature #309/#70 follow-up (2026-09-24): resolve an optional consignor attribution at
    // create time. Item.consignorId already existed in the schema (Feature #70/#309) but
    // nothing anywhere ever wrote to it -- this is the first write path. TEAMS-gated (same
    // tier every other consignor endpoint requires) and scoped to this organizer's own
    // workspace so a client can never attribute an item to another organizer's consignor.
    let resolvedConsignorId: string | null = null;
    if (consignorId) {
      if (organizer?.subscriptionTier !== 'TEAMS') {
        return res.status(403).json({ message: 'TEAMS subscription required to attach a consignor.' });
      }
      const consignorWorkspace = await prisma.organizerWorkspace.findFirst({ where: { ownerId: organizer.id } });
      const matchedConsignor = consignorWorkspace
        ? await prisma.consignor.findFirst({ where: { id: consignorId, workspaceId: consignorWorkspace.id } })
        : null;
      if (!matchedConsignor) {
        return res.status(404).json({ message: 'Consignor not found.' });
      }
      resolvedConsignorId = matchedConsignor.id;
    }

    // Consignment minimum is ADVISORY only (Patrick, 2026-10-07): organizers part out lots
    // and take in collections where some pieces are not worth the configured floor
    // (WorkspaceSettings.consignmentMinimumPriceCents, default $40) individually, so a
    // consigned item priced under it is never rejected here. The setting is surfaced in
    // the UI as a non-blocking hint and in the consignor agreement wording only.
    // (Previously a hard 400 -- removed.)

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

    // U4 (2026-10-04): condition and grade are coerced to the canonical vocabulary (legacy values such as LIKE_NEW or
    // GOOD coerce and are never a 400). A legacy LIKE_NEW or EXCELLENT carries a hint grade of A, used only when the
    // request sends no grade of its own.
    const conditionCoerced = coerceConditionInput(condition, 'createItem');
    const gradeCoerced = conditionGrade !== undefined ? coerceGradeInput(conditionGrade, 'createItem') : { write: false, value: null as ConditionGrade | null };
    const createGrade: ConditionGrade | null = gradeCoerced.write && gradeCoerced.value ? gradeCoerced.value : (conditionCoerced.hintGrade ?? null);

    // Create the item in database
    const item = await prisma.item.create({
      data: {
        saleId,
        organizerId: sale.organizerId,
        title,
        description: description || '',
        price: price ? parseFloat(price) : null,
        // ADR cashier-discretionary-discount (2026-09-25): anchor set once at creation.
        originalPrice: price ? parseFloat(price) : null,
        auctionStartPrice: auctionStartPrice ? parseFloat(auctionStartPrice) : null,
        auctionReservePrice: auctionReservePrice ? parseFloat(auctionReservePrice) : null,
        bidIncrement: bidIncrement ? parseFloat(bidIncrement) : null,
        auctionEndTime: auctionEndTime ? new Date(auctionEndTime) : null,
        status: status || 'AVAILABLE',
        category: category || null,
        condition: conditionCoerced.write ? conditionCoerced.value : null,
        ...(createGrade ? { conditionGrade: createGrade } : {}),
        // Feature #309/#70 follow-up (2026-09-24): optional consignor attribution, resolved
        // and validated above. null when not provided -- same default the column already had.
        consignorId: resolvedConsignorId,
        // P0 fix: ebayShippingClassification was never written by any backend write path.
        // tags is not set on manual create (organizer AI tagging happens via a separate
        // endpoint), so classify against category + empty tags here.
        ebayShippingClassification: classifyEbayShipping(category || null, []),
        rarity: assignedRarity,
        photoUrls,
        // W1: Shipping
        shippingAvailable: shippingAvailable === true || shippingAvailable === 'true',
        shippingPrice: shippingPrice ? parseFloat(shippingPrice) : null,
        // ADR-106: an organizer who explicitly sets shipping at item-creation time has
        // confirmed it -- locks provenance the same way updateItem's explicit-edit path
        // does, so a later auto-suggest pass (once package weight becomes known) never
        // overwrites a value the organizer typed in on create.
        ...(shippingAvailable !== undefined || shippingPrice !== undefined
          ? { shippingPriceConfirmedByOrganizer: true, shippingPriceSource: 'ORGANIZER' }
          : {}),
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
        // ADR-134 #640 (B2): card record created in the same nested write (atomic with the Item).
        // Built by cardRecordService from a whitelisted, strictly validated object; the request body is never spread.
        ...(cardCreateBase ? { card: { create: { ...cardCreateBase, organizerId: sale.organizerId ?? null } } } : {}),
        // ADR-134 5.4 (1): a pinned-game card starts with its pinned eBay category (createItem never takes one from the body).
        ...(cardCreateBase ? pinnedCardCategoryFields(cardCreateBase, null, null) : {}),
      }
    });

    // ADR-134 #640 (B2): read the stored card back in its owner shape (includes lockedFields). Card path only.
    const createdCard = cardCreateBase
      ? await prisma.itemCard.findUnique({ where: { itemId: item.id }, select: CARD_EDIT_SELECT })
      : undefined;

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
      ...(cardCreateBase ? { card: createdCard ?? null } : {}),
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

/**
 * ADR-106 (2026-08-15): shared auto-suggest-and-set helper for native (non-eBay)
 * checkout shipping. Wraps suggestNativeShippingPrice() (ADR-104 Sec3, the same
 * engine getSuggestedShippingPriceHandler already calls on-demand) and returns the
 * Item fields to write, or null when no confident auto-price should be written.
 * Callers MUST fail safe on null -- never block or fail the caller's save on this
 * (mirrors ADR-104 Sec3 Rollback: "the frontend must fail silently").
 */
async function computeAutoShippingPatch(input: {
  itemId: string;
  weightOz: number;
  dims: { length: number | null; width: number | null; height: number | null };
  packageType: string | null;
  origin: { zip: string | null; lat: number | null; lng: number | null };
  subscriptionTier: string | null;
  categoryId: string | null;
  /** Item.category (eBay L1 category name) -- gates Media Mail eligibility, see
   *  nativeShippingSuggestionService.ts's NativeShippingPriceInput.category. */
  category: string | null;
  priceUsd: number | null;
}): Promise<{ shippingAvailable: true; shippingPrice: number; shippingPriceSource: 'AUTO' } | null> {
  try {
    const suggestion = await suggestNativeShippingPrice({
      weightOz: input.weightOz,
      dims: input.dims,
      packageType: input.packageType,
      origin: input.origin,
      subscriptionTier: input.subscriptionTier as any,
      categoryId: input.categoryId,
      category: input.category,
      priceUsd: input.priceUsd,
    });
    return { shippingAvailable: true, shippingPrice: suggestion.suggestedPrice, shippingPriceSource: 'AUTO' };
  } catch (err) {
    if (err instanceof NativeShippingHardBlockError) {
      // ADR-104 Sec3 Rollback contract: fail safe -- leave shippingAvailable as-is
      // (today's manual behavior), never flip it or write a price for a package that
      // exceeds carrier limits for every modeled carrier.
      console.log(`[ADR-106 auto-shipping] hard-blocked for item ${input.itemId}: ${(err as Error).message}`);
    } else {
      console.warn(`[ADR-106 auto-shipping] failed for item ${input.itemId} (non-fatal):`, (err as Error).message);
    }
    return null;
  }
}

/**
 * ADR-134 5.4 item (1) (W4 wiring): a card record in a pinned game (productType SINGLE) gives the item its pinned eBay
 * category, but ONLY while the item has no category yet. A non-null value is never overwritten. The name is added only
 * when the pin has a verified name and the item has none. Returns {} when there is nothing to set (non-card, unpinned
 * game or product type, or a category already present), so non-card items are untouched.
 */
function pinnedCardCategoryFields(
  card: { game: string; productType: string } | null | undefined,
  currentCategoryId: string | null | undefined,
  currentCategoryName: string | null | undefined
): { ebayCategoryId?: string; ebayCategoryName?: string } {
  if (currentCategoryId) return {};
  const pinned = getPinnedCardCategory(card);
  if (!pinned) return {};
  const fields: { ebayCategoryId?: string; ebayCategoryName?: string } = { ebayCategoryId: pinned.id };
  if (pinned.name && !currentCategoryName) fields.ebayCategoryName = pinned.name;
  return fields;
}

export const updateItem = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    // U2 (2026-10-04): "Save without updating marketplaces". Accepted ONLY as the boolean true (strict ===): the strings
    // "true", 1 and every other truthy value are ignored. The hold columns (ebaySyncHeldAt, ebayHeldFields,
    // ebayContentDirtyAt) are never read from the request body at all: this handler picks its fields explicitly.
    const skipMarketplaceSyncRequested = (req.body as { skipMarketplaceSync?: unknown } | undefined)?.skipMarketplaceSync === true;
    const { title, description, price, auctionStartPrice, auctionReservePrice, bidIncrement, auctionEndTime, status, category, condition, conditionGrade, shippingAvailable, shippingPrice, crosslisterFreeShipping, reverseAuction, reverseDailyDrop, reverseFloorPrice, reverseStartDate, listingType, isAiTagged, rarity, qrEmbedEnabled, tags, backgroundRemoved, draftStatus, isHighValue, estimatedValue, aiSuggestedPrice, aiConfidence, quantity, stockTotal, ebayShippingOverride, ebayFulfillmentPolicyOverrideId, packageWeightOz, packageLengthIn, packageWidthIn, packageHeightIn, packageType, packageConfirmedByOrganizer, packageEstimateSource, upc, ean, isbn, mpn, fccId, brand, size, color, material, ebayEpid, conditionNotes, allowBestOffer, bestOfferAutoAcceptAmt, bestOfferMinimumAmt, ebaySecondaryCategoryId, ebaySubtitle, ebayCategoryId, ebayCategoryName, isLegendary, lotNumber, costBasis, roomTag, consignorId, excludeFromMarkdown, card } = req.body;

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

    // ADR-134 #640 (B2): optional card patch. Parsed with the strict whitelist before anything is written
    // (unknown key or bad value -> 400 CARD_VALIDATION). `card: null`/absent leaves the card untouched.
    let cardPatch: ReturnType<typeof parseCardInput> | undefined;
    if (card !== undefined && card !== null) {
      try {
        cardPatch = parseCardInput(card);
      } catch (cardErr) {
        if (isCardValidationError(cardErr)) return res.status(400).json(cardValidationBody(cardErr));
        throw cardErr;
      }
    }

    // ADR-085: Validate quantity if provided (was silently dropped -- never in
    // updateData -- so organizer edits to "Quantity" never persisted, S1085)
    if (quantity !== undefined && quantity !== null) {
      const parsedQty = parseInt(quantity, 10);
      if (isNaN(parsedQty) || parsedQty < 1) {
        return res.status(400).json({ message: 'Quantity must be a positive whole number.' });
      }
    }

    // ADR-087 P1 (D1): Validate stockTotal (organizer's real sellable unit count).
    // Must be an integer >= 1. The < stockSold check runs after the item is fetched
    // (stockSold is server-owned and never accepted from the client).
    if (stockTotal !== undefined && stockTotal !== null) {
      const parsedStockTotal = parseInt(stockTotal, 10);
      if (isNaN(parsedStockTotal) || parsedStockTotal < 1) {
        return res.status(400).json({ message: 'Units available must be a positive whole number.' });
      }
    }

    // 2026-10-08: costBasis arrives from the Add Items expanded row as a number or numeric string. parseFloat of a
    // non-numeric string yields NaN, which Prisma rejects as a 500; refuse it up front as a 400 instead.
    if (costBasis !== undefined && costBasis !== null && costBasis !== '') {
      const parsedCostBasis = parseFloat(costBasis);
      if (!Number.isFinite(parsedCostBasis) || parsedCostBasis < 0) {
        return res.status(400).json({ message: 'Cost basis must be a number zero or greater.' });
      }
    }

    // ADR-085 follow-up: Validate ebayShippingOverride if provided via the generic
    // update endpoint (was also silently dropped -- the edit-item page's "Local pickup
    // only" checkbox relies on this endpoint but the field was never in updateData;
    // the dedicated PATCH /ebay/organizer/items/:id/ebay-shipping endpoint remains the
    // other valid way to set this and is unaffected by this fix)
    const VALID_EBAY_SHIPPING_OVERRIDES = ['SHIPPABLE', 'LOCAL_PICKUP_ONLY', 'DONT_LIST'];
    if (ebayShippingOverride !== undefined && ebayShippingOverride !== null && !VALID_EBAY_SHIPPING_OVERRIDES.includes(ebayShippingOverride)) {
      return res.status(400).json({
        message: `Invalid ebayShippingOverride "${ebayShippingOverride}". Must be one of: ${VALID_EBAY_SHIPPING_OVERRIDES.join(', ')}, or null`
      });
    }

    // Fetch item to verify ownership. ADR-106: also pull sale.zip + organizer
    // lat/lng/subscriptionTier -- the same origin/fee context
    // getSuggestedShippingPriceHandler already reads -- so the auto-suggest-and-set
    // logic below can call suggestNativeShippingPrice() without a second query.
    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        sale: {
          include: {
            organizer: { select: { id: true, userId: true, subscriptionTier: true, lat: true, lng: true } },
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Inventory items (saleId = null) have no sale, so ownership resolves through the denormalized
    // Item.organizerId instead, same as getItemForEdit. Anyone who is not the owning organizer is denied.
    let ownerOrganizerRow = item.sale?.organizer ?? null;
    if (!ownerOrganizerRow && !item.saleId && item.organizerId) {
      ownerOrganizerRow = await prisma.organizer.findFirst({
        where: { id: item.organizerId, userId: req.user.id },
        select: { id: true, userId: true, subscriptionTier: true, lat: true, lng: true },
      });
    }

    if (!ownerOrganizerRow || ownerOrganizerRow.userId !== req.user.id) {
      return res.status(403).json({ message: item.saleId ? 'Access denied. Not your sale.' : 'Access denied. Not your item.' });
    }
    // Sale-derived organizer when present, else the inventory organizer: id/tier/lat/lng for the code below.
    const ownerOrganizer = ownerOrganizerRow;

    // ADR-136 Addendum B (#659): a bulk lot keeps its card count, status, listing type and fixed-price shape whatever this
    // form sends (the card count changes only through POST /api/bulk-lots/item/:id/adjust so every change is recorded).
    // The lookup fails open with the flag off and closed (503) with it on. `lotForced` is written on top of updateData
    // just before the update: price rounded to whole cents, excluded from markdown, never an eBay single listing.
    let lotForced: Record<string, unknown> | null = null;
    {
      const lotFlagOn = isBulkLotsEnabled();
      let isLot = false;
      try {
        isLot = (await findBulkLotItemIds(prisma as any, [id], lotFlagOn)).has(id);
      } catch (lotErr) {
        return res.status(503).json({ message: LOT_INVARIANT_MESSAGES.BULK_CHECK_FAILED, code: 'BULK_CHECK_FAILED' });
      }
      if (isLot) {
        const lotDecision = evaluateLotItemEdit(req.body as Record<string, unknown>, {
          stockTotal: item.stockTotal,
          stockSold: item.stockSold,
          status: item.status,
          listingType: item.listingType,
        });
        if (!lotDecision.ok) {
          return res.status(lotDecision.refusal.status).json({ message: lotDecision.refusal.message, code: lotDecision.refusal.code, field: lotDecision.refusal.field });
        }
        lotForced = lotDecision.forced as unknown as Record<string, unknown>;
      }
    }

    // ADR-087 P1 (D1): stockTotal can never drop below units already sold. stockSold is
    // server-owned -- it is intentionally NOT in the updateItem whitelist above, so a
    // client can never set it; we compare the requested stockTotal against the DB value.
    if (stockTotal !== undefined && stockTotal !== null) {
      const parsedStockTotal = parseInt(stockTotal, 10);
      if (parsedStockTotal < item.stockSold) {
        return res.status(400).json({ message: `Units available (${parsedStockTotal}) cannot be less than the ${item.stockSold} unit(s) already sold.` });
      }
    }

    // Build update object
    const updateData: any = {};

    // Track which fields the organizer is explicitly editing (D-006)
    const fieldsBeingEdited: string[] = [];

    // Feature #309/#70 follow-up (2026-09-24): optional consignor (re)attribution on edit.
    // Mirrors createItem's resolution logic. undefined = untouched (default, matches every
    // other optional field in this function); null explicitly clears the attribution; a
    // string id (re)assigns it, TEAMS-gated and scoped to this organizer's own workspace so a
    // client can never attribute an item to another organizer's consignor. Mutually exclusive
    // with vendorBoothId per the schema's own comment on Item.vendorBoothId ("an item should
    // never have both set") -- enforced here since this is the only place either FK is written
    // from the organizer-facing item forms.
    // 2026-10-08: re-sending the item's CURRENT consignorId (the Add Items row echoes every field on Save) is a no-op,
    // so it is neither tier-gated nor re-validated; only a real change goes through the checks below.
    if (consignorId !== undefined && !(consignorId !== null && consignorId === item.consignorId)) {
      if (consignorId === null) {
        updateData.consignorId = null;
      } else {
        if (ownerOrganizer.subscriptionTier !== 'TEAMS') {
          return res.status(403).json({ message: 'TEAMS subscription required to attach a consignor.' });
        }
        if (item.vendorBoothId) {
          return res.status(409).json({ message: 'This item is attributed to a vendor booth and cannot also be attached to a consignor. Clear the vendor booth attribution first.' });
        }
        const consignorWorkspace = await prisma.organizerWorkspace.findFirst({ where: { ownerId: ownerOrganizer.id } });
        const matchedConsignor = consignorWorkspace
          ? await prisma.consignor.findFirst({ where: { id: consignorId, workspaceId: consignorWorkspace.id } })
          : null;
        if (!matchedConsignor) {
          return res.status(404).json({ message: 'Consignor not found.' });
        }
        updateData.consignorId = matchedConsignor.id;
      }
      if (fieldValueChanged(item.consignorId, updateData.consignorId)) fieldsBeingEdited.push('consignorId');
    }

    // Consignment minimum is ADVISORY only (Patrick, 2026-10-07): see createItem. The
    // price is never rejected here based on the consignment floor.

    // Only update fields that are explicitly provided
    if (title !== undefined) {
      updateData.title = title;
      if (fieldValueChanged(item.title, title)) fieldsBeingEdited.push('title');
    }
    if (description !== undefined) {
      updateData.description = description;
      if (fieldValueChanged(item.description, description)) fieldsBeingEdited.push('description');
    }
    // Price-changed guard: a resave that sends the unchanged price must not reset priceUpdatedAt,
    // originalPrice, the markdown anchor or the eBay sync state. Number(item.price) is Prisma Decimal safe.
    let priceChanged = false;
    if (price !== undefined) {
      const nextPriceNum = price ? parseFloat(price) : null;
      const currentPriceNum = item.price != null ? Number(item.price) : null;
      priceChanged = nextPriceNum === null || currentPriceNum === null
        ? nextPriceNum !== currentPriceNum
        : Math.abs(nextPriceNum - currentPriceNum) >= 0.005;
    }
    if (price !== undefined) {
      updateData.price = price ? parseFloat(price) : null;
      // ADR markdown-cycle-ebay-price-sync (2026-09-15), Dev Instructions step 8: stamp
      // whenever the organizer's own manual edit writes Item.price, same as the markdown
      // cron does -- this is what extends the ebayListingSyncCron.ts push-first/pull-sync
      // clobber guard to manual price edits, not just markdown-driven ones.
      if (priceChanged) updateData.priceUpdatedAt = new Date();
      // ADR-128 (2026-09-19, ported 2026-09-23): a new organizer-chosen price re-opens the
      // eBay sync. Without this, an item parked in FAILED_TERMINAL would be skipped by
      // ebayListingSyncCron.ts forever, so the organizer's manual fix (e.g. a price above
      // eBay's floor) would never be pushed. PENDING puts it back on the push-first path.
      // Gated on the same eBay-live condition as markdownPricePropagationService.ts's
      // buildHandlers(), so a non-eBay item is never marked PENDING.
      // An unchanged price only re-opens the sync when the item is parked in a failed state (organizer
      // resave-to-retry); a same-price resave on a healthy item leaves ebaySyncState alone.
      if ((item.ebayOfferId || item.ebayListingId) &&
          (priceChanged || item.ebaySyncState === 'FAILED_RETRYABLE' || item.ebaySyncState === 'FAILED_TERMINAL')) {
        updateData.ebaySyncState = 'PENDING';
        updateData.ebaySyncAttempts = 0; // a new organizer price gets a fresh set of push attempts
      }
      if (priceChanged) fieldsBeingEdited.push('price');
    }
    // U7 (2026-10-04): the edit page sends every key on every save, so a field is recorded in userEditedFields (D-006)
    // only when its value really differs from the stored row. Genuinely edited fields keep the overwrite guard.
    if (category !== undefined) {
      updateData.category = category || null;
      if (fieldValueChanged(item.category, category || null)) fieldsBeingEdited.push('category');
    }
    // U4 (2026-10-04): condition is coerced to the canonical vocabulary (never a 400 on a legacy value). A recognized
    // value that already means the same thing as the stored one is left untouched, so a resave of an unedited legacy row
    // is not mistaken for an edit. LIKE_NEW and EXCELLENT carry a hint grade (A), applied below only when the row and
    // the request have no grade.
    let conditionHintGrade: ConditionGrade | null = null;
    if (condition !== undefined) {
      const coerced = coerceConditionInput(condition, 'updateItem');
      if (coerced.write) {
        const sameMeaning = coerced.value !== null && normalizeCondition(item.condition).condition === coerced.value;
        if (!sameMeaning) {
          updateData.condition = coerced.value;
          if (fieldValueChanged(item.condition, coerced.value)) fieldsBeingEdited.push('condition');
        }
        conditionHintGrade = coerced.hintGrade ?? null;
      }
    }
    if (brand !== undefined) {
      // brand is also set later in the eBay parity block — skip here to avoid conflict
      if (fieldValueChanged(item.brand, brand || null)) fieldsBeingEdited.push('brand');
    }
    if (size !== undefined && fieldValueChanged(item.size, size || null)) fieldsBeingEdited.push('size');
    if (color !== undefined && fieldValueChanged(item.color, color || null)) fieldsBeingEdited.push('color');
    if (material !== undefined && fieldValueChanged(item.material, material || null)) fieldsBeingEdited.push('material');

    // Feature #57: Rarity is always auto-assigned from price — organizers cannot override it
    if (price !== undefined) {
      const newPrice = price ? parseFloat(price) : null;
      // B5 (2026-10-04): recompute only when the price really changed, or when the row still carries the
      // unassigned schema default (COMMON, set by the draft path) and a price now exists. A same-price resave
      // leaves rarity untouched, so a save never changes rarity the organizer did not touch.
      const nextRarity = assignRarity(newPrice);
      if (nextRarity !== item.rarity && (priceChanged || item.rarity === ItemRarity.COMMON)) {
        updateData.rarity = nextRarity;
      }

      // Anchor fix (corrected 2026-09-28 -- see STATE.md P0 pricing-audit entry under
      // ## Blocked Queue for the full root-cause writeup). priceBeforeMarkdown must only
      // be treated as "already anchored" once a markdown cron has actually cut this
      // item's price at least once. The OLD guard (`!item.priceBeforeMarkdown`) locked
      // the anchor onto whichever manual price edit happened to land FIRST after item
      // creation, then silently ignored every later organizer price correction -- so
      // markdownCycleCron.ts / markdownCron.ts kept discounting from a stale, sometimes
      // wildly wrong, first-ever price forever after. markdownApplied is the one flag
      // BOTH crons set to true, and ONLY when they apply a real cut (markdownCron.ts
      // ~line 118, markdownCycleCron.ts ~line 163) -- it starts false on every new item
      // and stays false through any number of manual edits until a cron actually marks
      // the item down, which is exactly the "no real markdown history yet, keep
      // re-anchoring on every edit" window this needs. Once a cron sets
      // markdownApplied=true, priceBeforeMarkdown becomes cron-owned and a later manual
      // edit must leave it alone -- matches its own schema comment ("captured once, at
      // the first-ever step applied... never cumulative", markdownCycleCron.ts ~line 141)
      // and Item.originalPrice's schema comment, which explicitly calls
      // priceBeforeMarkdown "markdown-cron-owned... NEVER touched by either markdown
      // cron[via manual edit], by design".
      if (priceChanged && newPrice && newPrice > 0 && !item.markdownApplied) {
        updateData.priceBeforeMarkdown = newPrice;
        updateData.markdownApplied = false;
      }

      // ADR cashier-discretionary-discount (2026-09-25): originalPrice RESETS on every
      // organizer-initiated price change, UNCONDITIONALLY (not gated like
      // priceBeforeMarkdown above, which only backfills once) -- this endpoint is the
      // one and only "deliberate re-listing" signal the cashier-discretion cap anchors
      // on (see Item.originalPrice's own schema comment). A null/zero newPrice clears it
      // back to null rather than anchoring a discretion cap on a delisted/unpriced item.
      // Anchor when the price changed OR the item has never been anchored (published drafts and other non-createItem rows
      // can have originalPrice null; skipping would leave the cashier-discretion cap at zero forever).
      if (priceChanged || item.originalPrice == null) updateData.originalPrice = newPrice && newPrice > 0 ? newPrice : null;
    }
    if (auctionStartPrice !== undefined) updateData.auctionStartPrice = auctionStartPrice ? parseFloat(auctionStartPrice) : null;
    if (auctionReservePrice !== undefined) updateData.auctionReservePrice = auctionReservePrice ? parseFloat(auctionReservePrice) : null;
    if (bidIncrement !== undefined) updateData.bidIncrement = bidIncrement ? parseFloat(bidIncrement) : null;
    if (auctionEndTime !== undefined) updateData.auctionEndTime = auctionEndTime ? new Date(auctionEndTime) : null;
    // ADR-098 (2026-07-29): SOLD is a sale-completing transition -- route it through
    // the atomic commitItemSale() guard (services/itemSaleGuard.ts) instead of folding
    // it straight into the generic updateData write below. This closes the double-sell
    // race where a concurrent POS/terminal/checkout sale could win the same item at the
    // same time as this generic single-item edit endpoint (confirmed real incident,
    // ADR-098 Section 1). Throws ItemAlreadyCommittedError (caught below -> 409) if
    // another request already won the race. All other status values keep the existing
    // plain-write path -- flagged as a P2 follow-up in ADR-098 Section 5 (can an
    // organizer revert SOLD -> AVAILABLE and re-sell?), not fixed in this pass.
    // B6 (2026-10-04): commitItemSale writes the SOLD status on its own, so updateData never carries `status` and the
    // generic stamp below would miss it. Remember that the organizer-driven SOLD transition ran.
    let soldTransitionCommitted = false;
    if (status !== undefined && status === 'SOLD' && item.status !== 'SOLD') {
      // S1179 fix: include RESERVED so an organizer manually finalizing a previously-held
      // item as SOLD via this generic edit page (a very common "sold outside POS" case) doesn't
      // get silently rejected -- terminalController.ts / reservationController.ts already pass
      // ['AVAILABLE', 'RESERVED'] for the same reason (see itemSaleGuard.ts JSDoc); this call site
      // was left at the ['AVAILABLE']-only default in the original ADR-098 pass.

      // Notification-gap fix (S1195 sweep continuation, 2026-08-08): when this manual
      // "mark sold" override targets a RESERVED item, a DIFFERENT shopper may still hold
      // an active ItemReservation on it (e.g. the organizer sold it in person / via
      // another channel while that shopper's hold timer was still counting down).
      // commitItemSale() below only flips Item.status -- it never touches the
      // ItemReservation row or tells that shopper their hold is now worthless, leaving
      // both a dangling active-status reservation row and a silently stranded shopper.
      // Fetch the active hold BEFORE the commit so we know who to notify. Same "active
      // hold" status pair (PENDING/CONFIRMED) and same revert+notify shape as
      // saleController.ts's cancelSale hold-release fix earlier this session.
      const supersededHold = item.status === 'RESERVED'
        ? await prisma.itemReservation.findFirst({
            where: { itemId: id, status: { in: ['PENDING', 'CONFIRMED'] } },
            select: { id: true, userId: true },
          })
        : null;

      await commitItemSale(id, 'SOLD', ['AVAILABLE', 'RESERVED']);
      soldTransitionCommitted = true;

      if (supersededHold) {
        try {
          await prisma.itemReservation.update({
            where: { id: supersededHold.id },
            data: { status: 'CANCELLED' },
          });
          createNotification(
            supersededHold.userId,
            'item_sold_hold_superseded',
            'Item no longer available. Your hold was released.',
            `"${item.title}" was marked sold by the organizer through another channel. Your hold on this item has been released.`,
            `/items/${id}`,
            'OPERATIONAL',
            true,
            'Item no longer available. Your hold was released.'
          ).catch((err: unknown) => console.error('[updateItem] Failed to create item_sold_hold_superseded notification:', err));
        } catch (holdRevertErr) {
          // Non-fatal: the item is already committed SOLD above. Log loudly so this
          // isn't silently lost -- a failure here leaves the reservation row dangling
          // and the shopper unnotified, same failure shape cancelSale guards against.
          console.error(`[updateItem] Failed to revert/notify superseded hold for item ${id}:`, holdRevertErr);
        }
      }
    } else if (status !== undefined) {
      updateData.status = status;
    }
    if (ebayCategoryId !== undefined) updateData.ebayCategoryId = ebayCategoryId || null;
    if (ebayCategoryName !== undefined) updateData.ebayCategoryName = ebayCategoryName || null;
    // #145: Persist condition grade. U4 (2026-10-04): validated to S, A, B, C, D (case-insensitive); an unrecognized value is
    // logged and ignored (existing grade kept) rather than rejected.
    let gradeFromBody: ConditionGrade | null = null;
    if (conditionGrade !== undefined) {
      const gradeCoerced = coerceGradeInput(conditionGrade, 'updateItem');
      if (gradeCoerced.write) {
        updateData.conditionGrade = gradeCoerced.value;
        gradeFromBody = gradeCoerced.value;
      }
    } else if (conditionHintGrade && !item.conditionGrade) {
      updateData.conditionGrade = conditionHintGrade;
    }
    if (tags !== undefined) updateData.tags = tags; // #145: Persist tags from review page
    // P0 fix: keep ebayShippingClassification in sync whenever this endpoint changes
    // category and/or tags (classifyEbayShipping was previously only ever computed
    // ephemeral for API display in ebayController.ts — never persisted).
    if (category !== undefined || tags !== undefined) {
      const classificationCategory = category !== undefined ? (category || null) : item.category;
      const classificationTags = tags !== undefined ? tags : item.tags;
      updateData.ebayShippingClassification = classifyEbayShipping(classificationCategory, classificationTags);
    }
    if (backgroundRemoved !== undefined) updateData.backgroundRemoved = backgroundRemoved === true || backgroundRemoved === 'true'; // #145: Persist background removal state
    if (shippingAvailable !== undefined) updateData.shippingAvailable = shippingAvailable === true || shippingAvailable === 'true';
    if (shippingPrice !== undefined) updateData.shippingPrice = shippingPrice ? parseFloat(shippingPrice) : null;
    // 2026-08-27: organizer's per-item crosslister free-shipping toggle (Mercari via
    // fas-mercari.js today) -- SEPARATE from shippingAvailable/shippingPrice above (FindA.Sale's
    // own native-checkout shipping). Same true/'true' coercion pattern as every other boolean
    // field in this handler.
    if (crosslisterFreeShipping !== undefined) updateData.crosslisterFreeShipping = crosslisterFreeShipping === true || crosslisterFreeShipping === 'true';
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

    // ADR-103 Phase 5 (2026-09-03): keep the persisted margin-risk flag in sync with
    // whatever package dims/weight/type this save leaves in effect -- zone-independent
    // classification (see classifyPackageSurchargeTrigger's own comment for why zone
    // isn't needed here). Computed from the EFFECTIVE post-save values (new value if this
    // request touched the field, otherwise the item's existing value) so the flag never
    // goes stale even on a save that only touches unrelated fields.
    {
      const riskLengthIn = packageLengthIn !== undefined ? (packageLengthIn === null ? null : Number(packageLengthIn)) : (item.packageLengthIn != null ? Number(item.packageLengthIn) : null);
      const riskWidthIn = packageWidthIn !== undefined ? (packageWidthIn === null ? null : Number(packageWidthIn)) : (item.packageWidthIn != null ? Number(item.packageWidthIn) : null);
      const riskHeightIn = packageHeightIn !== undefined ? (packageHeightIn === null ? null : Number(packageHeightIn)) : (item.packageHeightIn != null ? Number(item.packageHeightIn) : null);
      const riskWeightOz = packageWeightOz !== undefined ? (packageWeightOz === null ? null : Number(packageWeightOz)) : item.packageWeightOz;
      const riskPackageType = packageType !== undefined ? (packageType || null) : item.packageType;
      const riskTier = classifyPackageSurchargeTrigger(
        { length: riskLengthIn, width: riskWidthIn, height: riskHeightIn },
        riskWeightOz,
        riskPackageType
      );
      updateData.shippingMarginRiskTier = riskTier === 'SAFE' ? null : riskTier;
    }
    if (upc !== undefined) updateData.upc = upc || null;
    if (ean !== undefined) updateData.ean = ean || null;
    if (isbn !== undefined) updateData.isbn = isbn || null;
    if (mpn !== undefined) updateData.mpn = mpn || null;
    if (fccId !== undefined) updateData.fccId = normalizeFccId(fccId);
    if (brand !== undefined) updateData.brand = brand || null;
    if (size !== undefined) updateData.size = size || null;
    if (color !== undefined) updateData.color = color || null;
    if (material !== undefined) updateData.material = material || null;
    if (ebayEpid !== undefined) updateData.ebayEpid = ebayEpid || null;
    if (conditionNotes !== undefined) updateData.conditionNotes = conditionNotes || null;
    if (allowBestOffer !== undefined) updateData.allowBestOffer = allowBestOffer === true || allowBestOffer === 'true';
    // ADR item-exclude-from-markdown (2026-09-28): organizer opt-out from both auto-markdown crons
    if (excludeFromMarkdown !== undefined) updateData.excludeFromMarkdown = excludeFromMarkdown === true || excludeFromMarkdown === 'true';
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
    // ADR-085: Quantity was destructured nowhere and never written to updateData --
    // organizer edits to the Quantity field silently no-opped (S1085, found via
    // real-item investigation on Solenoid Valve Actuator, 18 physical units).
    if (quantity !== undefined) updateData.quantity = quantity === null ? 1 : parseInt(quantity, 10);
    // ADR-087 P1 (D1): stockTotal write (validated above: integer >= 1 and >= stockSold).
    // stockSold is intentionally absent from the destructure/whitelist -- it stays server-owned.
    if (stockTotal !== undefined) updateData.stockTotal = stockTotal === null ? 1 : parseInt(stockTotal, 10);
    // ADR-085 follow-up: same silent-drop bug for ebayShippingOverride (edit-item page's
    // "Local pickup only" checkbox never actually persisted via this endpoint) and for
    // packageConfirmedByOrganizer/packageEstimateSource (PostSaleEbayPanel's "confirm
    // package details" action was silently no-opped -- organizer confirmations lost,
    // meaning later AI estimates could keep overwriting confirmed values, defeating the
    // field's whole purpose per its schema comment "never overwritten by estimates").
    if (ebayShippingOverride !== undefined) updateData.ebayShippingOverride = ebayShippingOverride || null;
    if (ebayFulfillmentPolicyOverrideId !== undefined) updateData.ebayFulfillmentPolicyOverrideId = ebayFulfillmentPolicyOverrideId || null;
    if (packageConfirmedByOrganizer !== undefined) updateData.packageConfirmedByOrganizer = packageConfirmedByOrganizer === true || packageConfirmedByOrganizer === 'true';
    if (packageEstimateSource !== undefined) updateData.packageEstimateSource = packageEstimateSource || null;

    // ADR-106 (2026-08-15): native-checkout shipping auto-pricing. Two mutually
    // exclusive branches, matching the Contract in
    // claude_docs/architecture/ADR-106-native-checkout-shipping-autopricing.md:
    //   (a) The organizer's PATCH body explicitly includes shippingAvailable/
    //       shippingPrice -- a REAL edit, not an incidental re-save of unrelated
    //       fields (the edit-item frontend only sends these keys when the organizer
    //       actually touched the checkbox/price input -- see shippingTouched there).
    //       Lock provenance to ORGANIZER so auto-suggest never overwrites it again.
    //   (b) Otherwise, if this save leaves the item's package weight known and
    //       shipping is not yet organizer-confirmed, call suggestNativeShippingPrice()
    //       (same engine getSuggestedShippingPriceHandler already exposes on-demand)
    //       and auto-set shippingAvailable/shippingPrice/shippingPriceSource='AUTO'.
    //       Skips items explicitly marked local-pickup-only via ebayShippingOverride
    //       (same field the FB extension already checks -- extensionController.ts
    //       L281) per ADR-106 Risk.
    const organizerExplicitlySettingShipping = shippingAvailable !== undefined || shippingPrice !== undefined;
    if (organizerExplicitlySettingShipping) {
      updateData.shippingPriceConfirmedByOrganizer = true;
      updateData.shippingPriceSource = 'ORGANIZER';
    } else {
      const priorShippingConfirmed = item.shippingPriceConfirmedByOrganizer === true;
      const priorShippingSource = item.shippingPriceSource ?? null;

      const packageFieldsTouched =
        packageWeightOz !== undefined ||
        packageLengthIn !== undefined ||
        packageWidthIn !== undefined ||
        packageHeightIn !== undefined ||
        packageType !== undefined;

      const effWeightOz = packageWeightOz !== undefined
        ? (packageWeightOz === null ? null : Number(packageWeightOz))
        : item.packageWeightOz;
      const effLengthIn = packageLengthIn !== undefined
        ? (packageLengthIn === null ? null : Number(packageLengthIn))
        : (item.packageLengthIn != null ? Number(item.packageLengthIn) : null);
      const effWidthIn = packageWidthIn !== undefined
        ? (packageWidthIn === null ? null : Number(packageWidthIn))
        : (item.packageWidthIn != null ? Number(item.packageWidthIn) : null);
      const effHeightIn = packageHeightIn !== undefined
        ? (packageHeightIn === null ? null : Number(packageHeightIn))
        : (item.packageHeightIn != null ? Number(item.packageHeightIn) : null);
      const effPackageType = packageType !== undefined ? (packageType || null) : item.packageType;
      const effEbayCategoryId = ebayCategoryId !== undefined ? (ebayCategoryId || null) : item.ebayCategoryId;
      // Media Mail gate (ebayRateEstimateService.ts's isMediaMailEligibleCategory) reads
      // Item.category (the eBay L1 name), same "current unsaved value first" precedence
      // already established for effEbayCategoryId/effPrice above.
      const effCategory = category !== undefined ? (category || null) : item.category;
      const effPrice = price !== undefined ? (price ? parseFloat(price) : null) : item.price;
      const effEbayShippingOverride = ebayShippingOverride !== undefined ? (ebayShippingOverride || null) : item.ebayShippingOverride;

      // Backfill case: weight already known from some other write path (AI batch
      // analyze, processRapidDraft, voice-appended dims, etc.) but this item was
      // never auto-priced through this endpoint -- catch it up on the next touch of
      // this item via updateItem, not only on a request that literally changes weight.
      const neverAutoPricedYet = priorShippingSource == null && item.shippingPrice == null;

      const hasOrigin = (item.sale?.zip != null) || (ownerOrganizer.lat != null && ownerOrganizer.lng != null); // inventory items (no sale) fall back to the organizer's lat/lng

      const shouldAttemptAutoSuggest =
        !priorShippingConfirmed &&
        effEbayShippingOverride !== 'LOCAL_PICKUP_ONLY' &&
        effWeightOz != null && effWeightOz > 0 &&
        (packageFieldsTouched || neverAutoPricedYet) &&
        hasOrigin;

      if (shouldAttemptAutoSuggest) {
        const shippingPatch = await computeAutoShippingPatch({
          itemId: id,
          weightOz: effWeightOz as number,
          dims: { length: effLengthIn, width: effWidthIn, height: effHeightIn },
          packageType: effPackageType,
          origin: {
            zip: item.sale?.zip ?? null,
            lat: ownerOrganizer.lat,
            lng: ownerOrganizer.lng,
          },
          subscriptionTier: ownerOrganizer.subscriptionTier,
          categoryId: effEbayCategoryId ?? null,
          category: effCategory ?? null,
          priceUsd: effPrice ?? null,
        });
        if (shippingPatch) Object.assign(updateData, shippingPatch);
      }
    }

    // D-006: Update userEditedFields array to track which fields organizer has explicitly set
    // This prevents AI results from overwriting organizer-set values during rapid processing
    if (fieldsBeingEdited.length > 0) {
      const currentEdited = item.userEditedFields || [];
      const mergedEdited = Array.from(new Set([...currentEdited, ...fieldsBeingEdited]));
      updateData.userEditedFields = mergedEdited;
    }

    // ADR-134 #640 (B2): card patch applied as a nested upsert inside the same Item update (atomic).
    // lockedFields/dedupKey are computed by cardRecordService from the stored row; never from the body.
    if (cardPatch !== undefined) {
      try {
        const existingCard = await prisma.itemCard.findUnique({ where: { itemId: id } });
        updateData.card = { upsert: buildCardNestedUpsert(existingCard, cardPatch, item.organizerId ?? item.sale?.organizerId ?? ownerOrganizer.id) };
        // ADR-134 5.4 (1): set the pinned eBay category from the merged card, only while the effective category is null
        // (the stored value, or what this same request is setting). Never overwrites a non-null category.
        Object.assign(
          updateData,
          pinnedCardCategoryFields(
            updateData.card.upsert.create,
            updateData.ebayCategoryId !== undefined ? updateData.ebayCategoryId : item.ebayCategoryId,
            updateData.ebayCategoryName !== undefined ? updateData.ebayCategoryName : item.ebayCategoryName
          )
        );
      } catch (cardErr) {
        if (isCardValidationError(cardErr)) return res.status(400).json(cardValidationBody(cardErr));
        throw cardErr;
      }
    }

    // U1/U2 (2026-10-04): which marketplace-relevant fields REALLY changed (stored row vs what this save writes), not
    // which keys were present in the body. This drives the push, the held-fields union, the dirty flag and the plan.
    const numOrNull = (v: any): number | null =>
      v === undefined || v === null || v === '' ? null : Number(v);
    // ADR Part B: did this save change a shipping-determining package input vs. the pre-update item? Triggers a
    // live-offer shipping-policy re-sync. Compare normalized numbers so Decimal/number/null shapes line up.
    const shippingInputsChanged =
      (packageWeightOz !== undefined && numOrNull(updateData.packageWeightOz) !== numOrNull(item.packageWeightOz)) ||
      (packageLengthIn !== undefined && numOrNull(updateData.packageLengthIn) !== numOrNull(item.packageLengthIn)) ||
      (packageWidthIn !== undefined && numOrNull(updateData.packageWidthIn) !== numOrNull(item.packageWidthIn)) ||
      (packageHeightIn !== undefined && numOrNull(updateData.packageHeightIn) !== numOrNull(item.packageHeightIn)) ||
      (packageType !== undefined && (updateData.packageType ?? null) !== (item.packageType ?? null));
    // ADR-137 (#660): a CARD whose price crosses eBay's Standard Envelope ceiling ($20) must have its live offer's shipping
    // policy re-resolved by this save (the same 'shipping' push field a package edit uses), not at the next daily drift
    // sweep. Without it a card raised from $15 to $25 would stay on the untracked envelope policy until then. Cards only
    // (pinned card category); every other item keeps today's behavior.
    const cardEnvelopePriceCrossed =
      priceChanged &&
      isPinnedCardCategoryId(updateData.ebayCategoryId !== undefined ? updateData.ebayCategoryId : item.ebayCategoryId) &&
      standardEnvelopePriceCrossing(item.price, updateData.price);
    const ebayListedBeforeSave = !!(item.ebayOfferId || item.ebayListingId);
    // Resaving an unchanged price on an item whose price sync is parked in a failed state re-opens the sync (see the
    // ebaySyncState = PENDING branch above), and the old push re-sent the price in that case, so it stays an attempted field.
    const priceReopen =
      price !== undefined && !priceChanged && ebayListedBeforeSave &&
      (item.ebaySyncState === 'FAILED_RETRYABLE' || item.ebaySyncState === 'FAILED_TERMINAL');
    const changedMarketplaceFields: EbayPushField[] = computeEbayPushFields(
      item,
      {
        title: updateData.title,
        description: updateData.description,
        condition: updateData.condition,
        conditionGrade: updateData.conditionGrade,
        price: updateData.price,
      },
      { priceReopen, shippingInputsChanged: shippingInputsChanged || cardEnvelopePriceCrossed }
    );
    // Hold: "Save without updating marketplaces" on an eBay-listed item, or an item that is already held (the hold
    // persists until an explicit "Update eBay now" or "Resume syncing"; a normal save never releases it).
    const heldThisSave = ebayListedBeforeSave && (skipMarketplaceSyncRequested || item.ebaySyncHeldAt != null);
    if (heldThisSave) {
      updateData.ebaySyncHeldAt = item.ebaySyncHeldAt ?? new Date();
      updateData.ebayHeldFields = Array.from(new Set([...(item.ebayHeldFields ?? []), ...changedMarketplaceFields]));
    }
    // Dirty: a real title/description/condition change on an eBay-listed item keeps the pull-sync cron from overwriting
    // it with eBay's older value until a push confirms (cleared by pushItemToEbay on success).
    if (ebayListedBeforeSave && changedMarketplaceFields.some((f) => (EBAY_CONTENT_FIELDS as readonly string[]).includes(f))) {
      updateData.ebayContentDirtyAt = new Date();
    }
    // Imported-only eBay item (listing id, no offer id): a real category/tags/photos change sets the same flag so the
    // enrich pass and Trading backfill do not revert it from eBay. Items with an offer id are unaffected.
    if (importedOnlyEditNeedsDirtyMark(item, { category: updateData.category, tags: updateData.tags, photoUrls: updateData.photoUrls })) {
      updateData.ebayContentDirtyAt = new Date();
    }

    if (lotForced) Object.assign(updateData, lotForced); // ADR-136 Addendum B (#659): the lot invariants win over the form

    // Item.lastEditedAt: a card patch is always an organizer edit; otherwise stamp only when a user-visible
    // field in updateData differs from the stored row. lastEditedAt is never read from req.body.
    const updatedItem = await prisma.item.update({
      where: { id },
      data: {
        ...updateData,
        ...(cardPatch !== undefined || soldTransitionCommitted ? organizerEditStampAlways() : organizerEditStamp(item, updateData)),
      }
    });

    // ADR-134 #640 (B2): owner-shaped card block for the response (card path only).
    const updatedCard = cardPatch !== undefined
      ? await prisma.itemCard.findUnique({ where: { itemId: id }, select: CARD_EDIT_SELECT })
      : undefined;

    // Tell anyone who favorited this item that its price just dropped. Was previously
    // dead code -- notifyPriceDropAlerts was imported above but never called from any
    // code path in this file (or anywhere else that edits Item.price).
    // U7 (2026-10-04): only when the price really changed (numeric compare via priceChanged), not on every resave.
    if (price !== undefined && priceChanged) {
      notifyPriceDropAlerts(id, item.price, updatedItem.price).catch(err =>
        console.warn(`[priceDrop] price drop alert failed for item ${id}:`, err)
      );
    }

    // Feature #314: Log price overrides (fire-and-forget, don't block update if logging fails)
    if (priceChanged && item.saleId) {
      try {
        const newPrice = price ? parseFloat(price) : null;
        const oldAiSuggested = item.aiSuggestedPrice ? parseFloat(item.aiSuggestedPrice.toString()) : null;

        // Only log if price changed and is non-null
        if (newPrice !== null && priceChanged) {
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
    if (gradeFromBody) {
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
            // Award XP to the organizer (Hunt Pass 1.5x applied pre-cap, capped at remaining monthly allowance)
            const baseXp = XP_AWARDS.CONDITION_RATING;
            const multipliedXp = await applyHuntPassMultiplier(req.user.id, baseXp);
            const xpToAward = Math.min(multipliedXp, monthlyRemaining);
            const xpResult = await awardXp(
              req.user.id,
              'CONDITION_RATING',
              xpToAward,
              {
                itemId: id,
                saleId: item.saleId ?? '',
                description: `Condition rating S-D for item "${updatedItem.title}"`,
                preMultipliedHuntPassXp: true,
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
    if ((aiConfidence !== undefined || estimatedValue !== undefined || (price !== undefined && priceChanged)) && !updatedItem.isHighValueLocked) {
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

    // U1 (2026-10-04): what this save will push, computed from the real diff. eBay is pushed through
    // pushItemToEbay; extension marketplaces (Facebook, Vinted, ...) stay prompt-only. Best effort: a failure here only
    // omits the plan, it never fails the save.
    let marketplacePlan: MarketplacePlan | undefined;
    try {
      let extensionPlan: MarketplacePlan['extension'] = [];
      if (changedMarketplaceFields.length > 0) {
        try {
          const jobRows = await prisma.marketplaceListingJob.findMany({
            where: { itemId: id, platform: { in: [...EXTENSION_PLATFORMS] } },
            select: { itemId: true, platform: true, action: true, status: true, createdAt: true },
          });
          extensionPlan = buildExtensionPlan(listedExtensionPlatformsByItemId(jobRows).get(id) ?? [], changedMarketplaceFields);
        } catch (planErr) {
          console.warn(`[updateItem] marketplace plan: extension listing lookup failed for item ${id}:`, (planErr as Error).message);
        }
      }
      marketplacePlan = {
        ebay: buildEbayPlan({
          ebayOfferId: updatedItem.ebayOfferId,
          ebayListingId: updatedItem.ebayListingId,
          held: heldThisSave,
          changedFields: changedMarketplaceFields,
        }),
        extension: extensionPlan,
      };
    } catch (planErr) {
      console.warn(`[updateItem] marketplace plan failed for item ${id}:`, (planErr as Error).message);
    }

    res.json({
      ...(cardPatch !== undefined ? { ...updatedItem, card: updatedCard ?? null } : updatedItem),
      ...(marketplacePlan ? { marketplacePlan } : {}),
    });

    // Bug #461: FB nudge on single-item status → SOLD transition
    if (status === 'SOLD' && item.status !== 'SOLD' && item.fbExportedAt) {
      notifyFacebookExportedItemSold(id).catch(err =>
        console.warn(`[FB Nudge] single-item failed for item ${id}:`, err.message)
      );
    }

    // P2 (S1122 BQ): withdraw the matching eBay listing when this item flips to
    // SOLD via a non-eBay channel through this generic single-item edit path.
    // Every other sold-trigger call site (POS/terminal, checkout, reservations,
    // vendor-booth cart, bulk-items PUT) already calls endEbayListingIfExists --
    // confirmed by diffing its call sites against notifyFacebookExportedItemSold's
    // (which fires on all of them, including here). This updateItem path was the
    // one gap. endEbayListingIfExists re-queries the item, self-guards on
    // ebayOfferId being set (no-ops if never pushed to eBay), and never throws --
    // fire-and-forget, same as the FB nudge above.
    if (status === 'SOLD' && item.status !== 'SOLD') {
      endEbayListingIfExists(id).catch(err =>
        console.warn(`[eBay] withdraw-on-SOLD failed for item ${id}:`, err.message)
      );
    }

    // BUG (2026-07-18): this generic single-item edit path had the exact same
    // gap for Shopify that S1122 found + fixed for eBay above -- every other
    // sold-trigger call site (POS/terminal, checkout x4 Stripe sites,
    // reservations, vendor-booth cart, bulk-items PUT) calls markShopifyItemSold
    // alongside endEbayListingIfExists + notifyFacebookExportedItemSold; this
    // path called the eBay+FB hooks but never the Shopify one. markShopifyItemSold
    // re-queries the item's ShopifyListing, self-guards (no-ops if never pushed to
    // Shopify), and never throws -- fire-and-forget, same as the hooks above.
    if (status === 'SOLD' && item.status !== 'SOLD') {
      markShopifyItemSold(id).catch(err =>
        console.warn(`[Shopify] mark-sold-on-SOLD failed for item ${id}:`, err.message)
      );
    }

    // P0 (2026-09-15, S-discogs-sold-parity, Patrick-reported): same gap this file already fixed
    // for eBay (S1122) and Shopify (2026-07-18) existed for Discogs too -- unlike Facebook (no
    // API at all), Discogs has a real server-side delete call (deleteDiscogsListing in
    // discogsListingConnector.ts, already used by the manual organizer-triggered delete in
    // discogsMarketplaceController.ts) and was never wired into any SOLD-trigger call site.
    // withdrawDiscogsListingIfExists re-queries the item, self-guards on discogsListingId being
    // set (no-ops if never pushed to Discogs), and never throws -- fire-and-forget, same as above.
    if (status === 'SOLD' && item.status !== 'SOLD') {
      withdrawDiscogsListingIfExists(id).catch(err =>
        console.warn(`[Discogs] withdraw-on-SOLD failed for item ${id}:`, err.message)
      );
      withdrawReverbListingIfExists(id).catch(err =>
        console.warn(`[Reverb] withdraw-on-SOLD failed for item ${id}:`, err.message)
      );
    }

    // P2-3: Invalidate command center cache after item update
    invalidateCommandCenterCache(req.user.organizer!.id).catch((err) =>
      console.warn('Failed to invalidate command center cache:', err)
    );

    // Feature #244 Phase 4: Push-on-save eBay sync (fire-and-forget, non-blocking), now in
    // services/ebayItemPushService.ts (U1, 2026-10-04). It pushes only the fields that REALLY changed, returns a
    // structured outcome and records one ItemMarketplacePush row per attempt. A held item (U2) records SKIPPED_HELD and
    // makes no eBay call. Only fires if this item is live on eBay (has an offer ID); never awaited, never throws.
    if (changedMarketplaceFields.length > 0 && (updatedItem.ebayOfferId || updatedItem.ebayListingId)) {
      if (heldThisSave) {
        pushItemToEbay({ itemId: id, organizerId: ownerOrganizer.id, trigger: 'SAVE', fields: changedMarketplaceFields, hold: true })
          .catch(err => console.warn(`[eBay PushSync] Unhandled error recording held save for item ${id}:`, err));
      } else if (updatedItem.ebayOfferId) {
        pushItemToEbay({
          itemId: id,
          organizerId: ownerOrganizer.id,
          trigger: 'SAVE',
          fields: changedMarketplaceFields,
          dirtyBefore: item.ebayContentDirtyAt ?? null,
        }).catch(err => console.warn(`[eBay PushSync] Unhandled error for item ${id}:`, err));
      }
    }

    // Shopify companion sync (ADR-086): propagate price/quantity edits to an
    // already-pushed Shopify product. Fire-and-forget, self-guarding:
    // updateShopifyProductFields re-queries the item's ShopifyListing and no-ops
    // if the item was never cross-listed / the listing isn't ACTIVE, and never
    // throws — mirrors removeItemFromShopify's call style above. Only fires when
    // price or quantity ACTUALLY changed vs. the pre-update item, so an edit that
    // leaves both untouched makes zero Shopify calls.
    const shopifyPriceChanged =
      price !== undefined && (updatedItem.price ?? null) !== (item.price ?? null);
    const shopifyQuantityChanged =
      quantity !== undefined && (updatedItem.quantity ?? null) !== (item.quantity ?? null);
    if (shopifyPriceChanged || shopifyQuantityChanged) {
      const shopifyFields: { price?: number; quantity?: number } = {};
      if (shopifyPriceChanged && updatedItem.price !== null && updatedItem.price !== undefined) {
        shopifyFields.price = updatedItem.price;
      }
      if (shopifyQuantityChanged && updatedItem.quantity !== null && updatedItem.quantity !== undefined) {
        shopifyFields.quantity = updatedItem.quantity;
      }
      if (Object.keys(shopifyFields).length > 0) {
        updateShopifyProductFields(id, shopifyFields).catch((err) =>
          console.warn(`[Shopify PushSync] price/quantity propagation failed for item ${id}:`, err.message)
        );
      }
    }
  } catch (error) {
    // ADR-098: another request already committed this item's sale (double-sell race lost).
    if (error instanceof ItemAlreadyCommittedError) {
      return res.status(409).json({ message: `Couldn't mark this item sold: ${error.message}. Refresh the page to see its current status.` });
    }
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Server error while updating item' });
  }
};

/**
 * POST /api/items/:id/mark-sold-off-platform
 *
 * Bring-Your-Own-Rails (BYOR, 2026-09-06). Organizer marks a plain AVAILABLE item sold using
 * their own payment method outside FindA.Sale entirely (their own Stripe/Square/Venmo/cash).
 * FindA.Sale never sees or touches the real transaction -- zero Stripe calls anywhere in this
 * function. Records an OffPlatformSale row for later flat-fee billing.
 *
 * Scope note (2026-09-06 dispatch): this builds steps 1-4 of the architect's build order only
 * (schema, this endpoint, opt-in/consent, read endpoints). byorFeeCalculator.ts,
 * byorInvoicingCron.ts, and the billingController.ts invoice-webhook extension (step 5) are a
 * separate, later dispatch pending Patrick's fee-amount decision -- PlatformInvoice rows are
 * never created by this code path. See claude_docs/feature-notes/
 * bring-your-own-rails-architecture-and-scoping-2026-09-06.md.
 *
 * v1 restriction (findasale-dev scoping correction #6, 2026-09-06): commitItemSale() and
 * itemStockService.sellItemUnits()/stockSold are two entirely separate mechanisms --
 * commitItemSale() never touches stockSold. A future multi-unit BYOR needs to call
 * sellItemUnits() instead of just relaxing the stockTotal<=1 check below -- do not "simplify"
 * this away.
 */
export const markItemSoldOffPlatform = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const hasOrganizerRole = req.user.roles?.includes('ORGANIZER') || req.user.role === 'ORGANIZER';
    if (!hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    const { quantity, reportedAmount, paymentMethodNote, buyerNameNote, buyerEmailNote } = req.body as {
      quantity?: unknown;
      reportedAmount?: unknown;
      paymentMethodNote?: unknown;
      buyerNameNote?: unknown;
      buyerEmailNote?: unknown;
    };

    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        price: true,
        status: true,
        stockTotal: true,
        saleId: true,
        sale: {
          select: {
            id: true,
            title: true,
            organizerId: true,
            organizer: {
              select: {
                userId: true,
                offPlatformSalesEnabled: true,
                user: { select: { email: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!item || !item.sale) {
      return res.status(404).json({ message: 'Item not found' });
    }
    if (item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }

    const stockTotal = item.stockTotal ?? 1;
    if (stockTotal > 1) {
      return res.status(400).json({
        message: 'Marking an item sold off-platform is only supported for single-unit items right now.',
      });
    }
    if (item.status !== 'AVAILABLE') {
      return res.status(409).json({
        message: `This item is not available to mark sold (current status: ${item.status}).`,
      });
    }

    const organizer = item.sale.organizer;
    if (!organizer.offPlatformSalesEnabled) {
      return res.status(403).json({
        message: 'Off-platform sales are not enabled for this account. Enable it in Billing settings first.',
      });
    }

    // Consent chain built from scratch (findasale-dev scoping correction #3, 2026-09-06):
    // RoleConsent.paymentMethodAcceptedAt has zero call sites anywhere in the backend and is
    // NOT a working reference to copy -- confirmed there is also no existing write path
    // anywhere that creates a UserRoleSubscription row for an organizer who predates it
    // (authController.ts's registration-time consent write silently no-ops via
    // `if (orgRoleSubscription)` when none exists). The opt-in endpoint below is the only
    // writer of this chain; this read must not assume either row exists.
    const roleSubscription = await prisma.userRoleSubscription.findFirst({
      where: { userId: req.user.id, role: 'ORGANIZER' },
      select: { consentRecord: { select: { offPlatformSalesConsentedAt: true } } },
    });
    if (!roleSubscription?.consentRecord?.offPlatformSalesConsentedAt) {
      return res.status(403).json({
        message: 'Off-platform sales consent has not been recorded for this account. Enable it in Billing settings first.',
      });
    }

    let quantityInt = 1;
    if (quantity !== undefined) {
      const parsed = parseInt(String(quantity), 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return res.status(400).json({ message: 'quantity must be a positive integer.' });
      }
      quantityInt = parsed;
    }

    let reportedAmountValue: number | null = null;
    if (reportedAmount !== undefined && reportedAmount !== null && reportedAmount !== '') {
      const parsed = parseFloat(String(reportedAmount));
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ message: 'reportedAmount must be a non-negative number.' });
      }
      reportedAmountValue = parsed;
    }

    let updatedItem;
    try {
      // ADR-098 atomic guard -- same commitItemSale() used by every other sale-completing
      // transition in this codebase (see itemSaleGuard.ts). Throws ItemAlreadyCommittedError
      // if the item was not in an allowed prior state (someone else already sold it, e.g. a
      // concurrent POS/checkout sale won the race), caught below -> 409.
      updatedItem = await commitItemSale(id, 'SOLD', ['AVAILABLE']);
    } catch (err: any) {
      if (err instanceof ItemAlreadyCommittedError) {
        return res.status(409).json({
          message: `Couldn't mark this item sold: ${err.message}. Refresh the page to see its current status.`,
        });
      }
      throw err;
    }

    const now = new Date();
    const billingPeriodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const offPlatformSale = await prisma.offPlatformSale.create({
      data: {
        itemId: id,
        saleId: item.sale.id,
        organizerId: item.sale.organizerId,
        markedByUserId: req.user.id,
        quantity: quantityInt,
        reportedAmount: reportedAmountValue,
        paymentMethodNote: paymentMethodNote != null ? String(paymentMethodNote).slice(0, 500) : null,
        buyerNameNote: buyerNameNote != null ? String(buyerNameNote).slice(0, 200) : null,
        buyerEmailNote: buyerEmailNote != null ? String(buyerEmailNote).slice(0, 200) : null,
        billingPeriodKey,
      },
    });

    await prisma.item.update({ where: { id }, data: { lastSoldVia: 'OFF_PLATFORM_MANUAL', ...organizerEditStampAlways() } }); // B6: organizer action

    // P1 fix (2026-09-08, Patrick-reported): this off-platform (BYOR) sold handler is the ONLY
    // code path that records a sale for every extension-only marketplace (Vinted, Poshmark,
    // Depop, Grailed, Reverb, Etsy, Discogs -- anything with no API integration) and it never
    // sent the organizer any "sold" alert, in-app or email. Reusing the EXACT existing "item
    // sold" organizer email alert the Stripe checkout-completion path already sends (see the
    // sendItemSoldAlert call in stripeController.ts ~line 2144) rather than inventing a new
    // notification mechanism -- same service, same dedup guard (15-min Redis cooldown keyed on
    // organizerEmail+saleId+itemTitle in saleAlertEmailService.ts), same fire-and-forget shape.
    // No separate in-app Notification row is created here: the on-platform Stripe path this
    // mirrors doesn't create one either (confirmed by reading it end-to-end -- only
    // sendItemSoldAlert fires there), so parity with the existing pattern means email-only here.
    if (organizer.user?.email) {
      const alertPrice = reportedAmountValue ?? item.price ?? 0;
      sendItemSoldAlert({
        organizerEmail: organizer.user.email,
        organizerName: organizer.user.name || 'there',
        itemTitle: item.title,
        saleTitle: item.sale.title,
        price: alertPrice,
        saleId: item.sale.id,
      }).catch((err: any) =>
        console.warn(`[alert] Failed to send off-platform item sold email for item ${id}:`, err.message)
      );
    }

    // Cross-channel delisting cascade (verified 2026-09-06, findasale-dev scoping correction #1
    // on Patrick's own direction to verify rather than trust the doc's phrasing -- read both
    // files cited below before relying on this):
    //
    // extensionController.ts's getPendingRemovals (~line 806-812) polls
    // `prisma.item.findMany({ where: { sale: { organizerId, deletedAt: null }, status: 'SOLD' } })`
    // -- purely keyed on Item.status === 'SOLD' scoped to the organizer, with ZERO dependency on
    // which code path set that status. It is the poll target the browser extension uses for
    // the genuinely API-less, extension-only platforms in VALID_LISTING_PLATFORMS (Facebook
    // Marketplace, Grailed, Mercari, Poshmark, Vinted -- anything with a MarketplaceListingJob
    // row and no server-side delete call), so those channels self-heal once commitItemSale()
    // above flips the item to SOLD, but only while the organizer's browser extension is open and
    // polling. NO explicit call needed for them here.
    //
    // CORRECTION (2026-09-15, S-discogs-sold-parity -- item cmtsyyhig007o6p9vlk04ocvh sold on
    // eBay but never delisted from Discogs, confirmed zero MarketplaceListingJob rows for it):
    // this comment previously lumped Discogs in with the extension-only platforms above -- wrong.
    // Discogs is an official-API connector (discogsListingConnector.ts) with a real server-side
    // deleteDiscogsListing() call, same as eBay/Shopify, and is NOT in VALID_LISTING_PLATFORMS /
    // getPendingRemovals's poll at all, so it was never self-healing. It now gets the same
    // explicit synchronous withdraw below, alongside eBay and Shopify.
    //
    // eBay and Shopify are official-API integrations (not extension-based), so they DO need an
    // explicit synchronous withdraw call -- confirmed by reading both markItemSoldOnFacebook
    // (extensionController.ts:1203-1239) and routes/internal.ts's mark-item-sold-elsewhere
    // (:1175-1212), which both call commitItemSale() then fire endEbayListingIfExists() +
    // markShopifyItemSold() fire-and-forget. This mirrors that exact pattern.
    //
    // notifyFacebookExportedItemSold is ALSO included here (a correction beyond the 2-call
    // minimum): facebookNudgeService.ts:17 unconditionally calls
    // enqueueMarketplaceRemoveJobIfPosted() -- a REAL removal-job enqueue for the ADR-083
    // in-house Marketplace Poster (Playwright, dedicated FindA.Sale-owned accounts),
    // independent of the FB-export nudge check below it, "on every one of the 11 existing
    // sold-trigger call sites" per its own comment. Skipping it here would silently reopen
    // that exact gap for off-platform sales. itemController.ts's own updateItem() SOLD path
    // (~line 2096-2130) calls all four of these together for the same reason.
    notifyFacebookExportedItemSold(id).catch((err: any) =>
      console.warn(`[FB Nudge] mark-sold-off-platform failed for item ${id}:`, err.message)
    );
    endEbayListingIfExists(id).catch((err: any) =>
      console.warn(`[eBay] withdraw-on-SOLD (off-platform) failed for item ${id}:`, err.message)
    );
    markShopifyItemSold(id).catch((err: any) =>
      console.warn(`[Shopify] mark-sold-on-SOLD (off-platform) failed for item ${id}:`, err.message)
    );
    withdrawDiscogsListingIfExists(id).catch((err: any) =>
      console.warn(`[Discogs] withdraw-on-SOLD (off-platform) failed for item ${id}:`, err.message)
    );
    withdrawReverbListingIfExists(id).catch((err: any) =>
      console.warn(`[Reverb] withdraw-on-SOLD (off-platform) failed for item ${id}:`, err.message)
    );

    res.json({
      ok: true,
      item: { id: updatedItem.id, status: updatedItem.status, lastSoldVia: 'OFF_PLATFORM_MANUAL' },
      offPlatformSale,
    });
  } catch (error) {
    console.error('Error marking item sold off-platform:', error);
    res.status(500).json({ message: 'Server error while marking item sold off-platform' });
  }
};

/**
 * POST /api/items/:id/undo-sold-off-platform
 *
 * Undo Off-Platform Sale (BYOR) -- 2026-09-07, added same-day after Patrick correctly
 * pointed out that once an item was marked "Sold -- outside FindA.Sale", there was
 * NO way to undo it anywhere in the app. Root cause investigated, not assumed: the
 * generic bulk-status endpoint (routes/items.ts POST /bulk, statusSafeMatrix) hard-
 * blocks any transition FROM 'SOLD' for every sale type -- by design, since a normal
 * Stripe-processed sale's "undo" path is a real refund (stripeController.createRefund /
 * disputeController.updateDisputeStatus / adminController.bulkRefundPurchases all
 * correctly reset Item.status to AVAILABLE as part of refunding the linked Purchase).
 * BYOR sales have NO Purchase record at all -- that is the entire point of the feature,
 * FindA.Sale never processes the payment -- so there was nothing for a refund flow to
 * hook into, and the item was permanently stuck SOLD. This endpoint is BYOR's own
 * undo path, scoped tightly so it can never be used to reverse a real paid sale:
 *
 * - Ownership check identical to markItemSoldOffPlatform.
 * - Only fires when item.status === 'SOLD' AND item.lastSoldVia === 'OFF_PLATFORM_MANUAL'
 *   -- an item sold via Stripe checkout, POS, eBay, etc. has a different lastSoldVia
 *   value (or a real Purchase row) and this endpoint refuses it outright, directing
 *   the organizer to the real refund flow instead.
 * - Only fires when the OffPlatformSale row has NOT yet been invoiced (invoiceId is
 *   null) -- billing/invoicing isn't built yet so this is always true today, but the
 *   guard is here now so a future invoiced sale can't be silently un-billed by this
 *   endpoint once byorFeeCalculator.ts ships.
 * - Reverts Item.status to AVAILABLE and clears lastSoldVia, and DELETES the
 *   OffPlatformSale row (safe -- nothing references it yet) so the organizer's own
 *   off-platform-sales log and this-period usage count both correct themselves
 *   immediately, in one transaction.
 * - Deliberately does NOT attempt to re-list the item on eBay/Shopify/Facebook --
 *   undoing a manual "mark sold" should not silently recreate a closed listing on an
 *   external marketplace on the organizer's behalf. If they want it back on those
 *   channels, they re-list manually, same as any other AVAILABLE item.
 */
export const undoItemSoldOffPlatform = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const hasOrganizerRole = req.user.roles?.includes('ORGANIZER') || req.user.role === 'ORGANIZER';
    if (!hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        lastSoldVia: true,
        sale: {
          select: {
            organizer: { select: { userId: true } },
          },
        },
      },
    });

    if (!item || !item.sale) {
      return res.status(404).json({ message: 'Item not found' });
    }
    if (item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }

    if (item.status !== 'SOLD' || item.lastSoldVia !== 'OFF_PLATFORM_MANUAL') {
      return res.status(409).json({
        message:
          'This item was not marked sold off-platform, so it cannot be undone here. ' +
          'If it was sold through FindA.Sale checkout, POS, or a marketplace, use a refund instead.',
      });
    }

    const offPlatformSale = await prisma.offPlatformSale.findFirst({
      where: { itemId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, invoiceId: true },
    });

    if (offPlatformSale?.invoiceId) {
      return res.status(409).json({
        message: 'This sale has already been included in a bill and cannot be undone here. Contact support.',
      });
    }

    const updatedItem = await prisma.$transaction(async (tx) => {
      const updated = await tx.item.update({
        where: { id },
        data: { status: 'AVAILABLE', lastSoldVia: null, ...organizerEditStampAlways() }, // B6: organizer undo of their own sold mark
        select: { id: true, status: true },
      });
      if (offPlatformSale) {
        await tx.offPlatformSale.delete({ where: { id: offPlatformSale.id } });
      }
      return updated;
    });

    res.json({ ok: true, item: updatedItem });
  } catch (error) {
    console.error('Error undoing off-platform sale:', error);
    res.status(500).json({ message: 'Server error while undoing this off-platform sale' });
  }
};

/**
 * POST /api/items/:id/reopen-ebay-cancelled-sale
 *
 * eBay sync hardening (2026-10-01). An item marked SOLD by the eBay sold sync (lastSoldVia 'EBAY')
 * whose eBay order was later CANCELED or FULLY_REFUNDED is stuck SOLD: commitItemSale blocks every
 * transition away from SOLD and undoItemSoldOffPlatform only allows OFF_PLATFORM_MANUAL. This is the
 * narrow door for the eBay case. Auth/ownership mirror undoItemSoldOffPlatform (organizer role, sale
 * organizer's userId) plus the item's own organizerId for sale-less inventory items imported from eBay.
 *
 * Allowed only when lastSoldVia is 'EBAY' AND every recorded eBay order for the item is verifiably
 * cancelled / refunded per eBay (read live from eBay, not trusted from our DB) AND the item's eBay
 * listing (or a relisted live one under its FAS-<itemId> SKU) is live. Otherwise 409 with the reason.
 * The EbaySoldEvent ledger rows are kept, no sold notification is fired. See ebaySaleReopenService.ts.
 */
export const reopenEbayCancelledSale = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const hasOrganizerRole = req.user.roles?.includes('ORGANIZER') || req.user.role === 'ORGANIZER';
    if (!hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        organizerId: true,
        sale: { select: { organizerId: true, organizer: { select: { userId: true } } } },
      },
    });
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    let ownerOrganizerId: string | null = null;
    if (item.sale) {
      if (item.sale.organizer.userId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. Not your item.' });
      }
      ownerOrganizerId = item.sale.organizerId;
    } else {
      const callerOrganizer = await prisma.organizer.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (!callerOrganizer || !item.organizerId || callerOrganizer.id !== item.organizerId) {
        return res.status(403).json({ message: 'Access denied. Not your item.' });
      }
      ownerOrganizerId = callerOrganizer.id;
    }

    const accessToken = await refreshEbayAccessToken(ownerOrganizerId);
    if (!accessToken) {
      return res.status(409).json({
        message: 'Your eBay account is not connected or its connection expired, so the cancelled sale cannot be verified. Reconnect eBay and try again.',
      });
    }

    const result = await reopenEbayCancelledSaleService(id, {
      source: 'organizer',
      organizerId: ownerOrganizerId,
      actorUserId: req.user.id,
      accessToken,
    });

    if (!result.ok) {
      const status = result.code === 'NOT_FOUND' ? 404 : 409;
      return res.status(status).json({ message: result.message, code: result.code });
    }

    return res.json({ ok: true, itemId: result.itemId, adoptedListingId: result.adoptedListingId });
  } catch (error) {
    console.error('Error reopening eBay-cancelled sale:', error);
    res.status(500).json({ message: 'Server error while reopening this item' });
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
          // B6: a dimension-only fill from a VOICE capture is an organizer action and stamps; AUTO never stamps.
          await tx.item.update({
            where: { id: item.id },
            data: { ...dimensionUpdate, ...(source === 'VOICE' ? organizerEditStampAlways() : {}) },
          });
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
          ...organizerEditStampAlways(),
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
      include: { sale: { include: { organizer: { select: { id: true, userId: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Ownership: via the sale when there is one. Inventory items imported from eBay have saleId = null
    // (previously `item.sale!` threw on them and the delete 500'd) -- those are owned via item.organizerId.
    let ownerOrganizerId: string | null = item.sale?.organizer.id ?? null;
    if (!item.sale || item.sale.organizer.userId !== req.user.id) {
      const callerOrganizer =
        !item.sale && item.organizerId
          ? await prisma.organizer.findUnique({ where: { userId: req.user.id }, select: { id: true } })
          : null;
      if (!callerOrganizer || callerOrganizer.id !== item.organizerId) {
        return res.status(403).json({ message: 'Access denied. Not your sale.' });
      }
      ownerOrganizerId = callerOrganizer.id;
    }

    // ADR-136 Addendum B (#659): a lot with cards out on a hold or in a hub cart cannot be deleted from under them.
    try {
      if ((await findBulkLotItemIds(prisma as any, [id], isBulkLotsEnabled())).has(id) && (await lotDeleteBlocker(prisma as any, id, isBulkLotsEnabled()))) {
        return res.status(409).json({ message: LOT_INVARIANT_MESSAGES.BULK_LOT_BUSY, code: 'BULK_LOT_BUSY' });
      }
    } catch (lotErr) {
      return res.status(503).json({ message: LOT_INVARIANT_MESSAGES.BULK_CHECK_FAILED, code: 'BULK_CHECK_FAILED' });
    }

    // ADR item-delete-cross-marketplace-removal (2026-09-28) + eBay sync hardening (2026-10-01):
    // withdraw the item from eBay / Discogs / Reverb (self-guarding no-ops when never listed) and
    // snapshot still-live extension-platform listings into PendingListingRemoval BEFORE the Item row
    // is hard-deleted. This logic now lives in services/itemDeletionService.ts so the bulk delete and
    // the stale-draft cleanup run the exact same path. Never throws.
    const deletionSnapshot = await prepareItemForDeletion(id, { organizerId: ownerOrganizerId });

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

    // Unpublish/remove the item from Shopify (if cross-listed) before deleting it
    // locally — must run before the cascade delete removes the ShopifyListing row.
    // Never throws/blocks: removeItemFromShopify swallows its own errors internally.
    await removeItemFromShopify(id);

    await prisma.item.delete({
      where: { id }
    });

    // Audit row (never throws into the delete path).
    await recordItemDeletion(deletionSnapshot, 'single_delete', req.user.id);

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
      include: { sale: { include: { organizer: { select: OWNER_ORGANIZER_SELECT } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // B1: default-deny owner resolution (works for inventory items with no sale). Bidder names are revealed only
    // when the requester resolves as the owner; everyone else, including anonymous callers, gets anonymized labels.
    const isOrganizer = (await resolveItemOwnerOrganizer(item, req.user?.id)) !== null;

    // Saleless (inventory) items are private to their owner: bids are never listed for anyone else, anonymized or not.
    // Same 404 as a missing item so nothing reveals that the item exists. Sale items keep the public anonymized list.
    if (!item.sale && !isOrganizer) {
      return res.status(404).json({ message: 'Item not found' });
    }

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

    // B1 (shopper path): bidding only exists on sale items. An inventory item (saleId null) has no sale to bid in.
    const sale = item.sale;
    if (!sale) {
      return res.status(404).json({ message: 'This item is not available for bidding.' });
    }

    // S1072 Finding #4: collusion/wash-trade guard — identity-grade device/card fingerprint match
    try {
      await assertCheckoutAllowed({
        buyerUserId: req.user.id,
        saleId: sale.id,
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
    if (sale.status !== 'PUBLISHED') {
      return res.status(403).json({ message: 'This sale is not currently available for bidding.' });
    }

    // Reject bids on auctions that have already closed
    if (item.auctionClosed) {
      return res.status(400).json({ message: 'This auction has closed.' });
    }

    // 2026-08-08 (shipped-batch verification, roadmap #609 knock-on): auctionClosed only flips
    // true once the cron/manual-close atomic claim has actually run (can lag up to ~5 min behind
    // real end time now that the old page-view lazy-close write is removed). Enforce the real
    // deadline directly here so a bid can never be accepted after auctionEndTime has passed,
    // independent of whether auctionClosed has been set yet.
    if (item.auctionEndTime && new Date(item.auctionEndTime) <= new Date()) {
      return res.status(400).json({ message: 'This auction has ended.' });
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

    // Fire webhooks for bid placed (a sale is guaranteed here: the no-sale case returned 404 above)
    fireWebhooks(sale.organizer.userId, 'bid.placed', {
      itemId: item.id,
      saleId: sale.id,
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
      sale.organizer.userId,
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
        'OPERATIONAL',
        // S1195 (2026-08-08, notification-gap dispatch): OUTBID is time-critical --
        // the shopper needs to know fast enough to place a counter-bid before the
        // auction closes. In-app-only notification was previously the only option
        // (services/notificationService.ts had no email capability at all).
        true,
        `You were outbid on ${item.title}`
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
      include: { sale: { select: { sourceName: true, organizer: { select: { isUnmanagedListing: true, ...OWNER_ORGANIZER_SELECT } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Guard: reject actions on unmanaged listings
    if (item.sale?.sourceName != null && item.sale?.organizer?.isUnmanagedListing) {
      return res.status(403).json({
        message: 'This listing is not yet claimed by an organizer. Try one of our verified organizer sales.',
        code: 'UNMANAGED_LISTING'
      });
    }

    // B1: default-deny owner resolution; the quota below is charged to the resolved organizer (sale or inventory).
    const owner = await resolveItemOwnerOrganizer(item, req.user.id);
    if (!owner) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }

    const firstPhotoUrl = item.photoUrls?.[0];
    if (!firstPhotoUrl) {
      return res.json({ suggestedTags: [] });
    }

    // Security: AI Tags Quota Enforcement (P0)
    const organizerId = owner.id;
    const tier = owner.subscriptionTier || 'SIMPLE';
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
        // SSRF guard: photoUrls can come from imports/scrapers, so only fetch allowlisted https hosts
        // (Cloudinary + SAFE_FETCH_ALLOWED_HOSTS) with redirects disabled.
        if (!isSafeFetchUrl(firstPhotoUrl)) {
          throw new Error('photo URL is not an allowed https image host');
        }
        const imageResponse = await axios.get(firstPhotoUrl, {
          ...SAFE_FETCH_AXIOS_OPTIONS,
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

// B1: returns the item plus the resolved owner organizer, or null when the item is missing or the caller is not
// its owner (default deny; works for sale items and for inventory items with no sale).
const getItemForOrganizer = async (id: string, userId: string) => {
  const item = await prisma.item.findUnique({
    where: { id },
    include: { sale: { include: { organizer: { select: OWNER_ORGANIZER_SELECT } } } },
  });
  if (!item) return null;
  const owner = await resolveItemOwnerOrganizer(item, userId);
  if (!owner) return null;
  return { item, owner };
};

// Imported-only eBay items: a real photo add/remove/reorder sets ebayContentDirtyAt (same flag as updateItem) so the enrich pass
// does not restore eBay's photos. Spread into the item.update data; {} for every other item.
const importedPhotoEditMark = (item: { ebayListingId?: string | null; ebayOfferId?: string | null; photoUrls?: string[] | null }, nextPhotoUrls: string[]) =>
  importedOnlyEditNeedsDirtyMark(item, { photoUrls: nextPhotoUrls }) ? { ebayContentDirtyAt: new Date() } : {};

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
    const found = await getItemForOrganizer(id, req.user.id);
    if (!found) return res.status(404).json({ message: 'Item not found or access denied' });
    const { item, owner } = found;

    // Feature #75: Check photo limit before adding. The tier comes from the resolved owner organizer, so sale items
    // and inventory items (no sale) are both handled without a separate sale lookup.
    // Determine tier: use PRO tier limits for ala carte sales even if organizer is SIMPLE
    let effectiveTier = owner.subscriptionTier;
    if (item.sale?.purchaseModel === 'ALA_CARTE') {
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
      data: { photoUrls: [...item.photoUrls, url], ...organizerEditStampAlways(), ...importedPhotoEditMark(item, [...item.photoUrls, url]) },
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
    const found = await getItemForOrganizer(id, req.user.id);
    if (!found) return res.status(404).json({ message: 'Item not found or access denied' });
    const { item } = found;
    if (idx < 0 || idx >= item.photoUrls.length) {
      return res.status(400).json({ message: 'Photo index out of range' });
    }
    const removedUrl = item.photoUrls[idx];
    const updated = await prisma.item.update({
      where: { id },
      data: { photoUrls: item.photoUrls.filter((_, i) => i !== idx), ...organizerEditStampAlways(), ...importedPhotoEditMark(item, item.photoUrls.filter((_, i) => i !== idx)) },
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
    const found = await getItemForOrganizer(id, req.user.id);
    if (!found) return res.status(404).json({ message: 'Item not found or access denied' });
    const { item } = found;
    const existing = new Set(item.photoUrls);
    const allValid = photoUrls.every((u: any) => typeof u === 'string' && existing.has(u));
    if (!allValid || photoUrls.length !== item.photoUrls.length) {
      return res.status(400).json({ message: 'Invalid photoUrls. Can only reorder existing photos.' });
    }
    const updated = await prisma.item.update({
      where: { id },
      data: { photoUrls, ...organizerEditStampAlways(), ...importedPhotoEditMark(item, photoUrls) },
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
        organizerId: true,
        sale: {
          select: {
            organizer: {
              select: OWNER_ORGANIZER_SELECT
            }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Auth: only the organizer who owns the sale can poll this item's draft status
    const owner = await resolveItemOwnerOrganizer(item, req.user?.id);
    if (!owner) {
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

// Phase 2B: Rapidfire Mode — Publish logic shared by the single-item endpoint (POST /items/:itemId/publish) and
// the bulk 'draftStatus' = PUBLISHED operation (POST /items/bulk). One code path: ownership, draftStatus gate, card
// price guard, optimistic lock, rarity assignment, Legendary early access, webhooks, auto-fanout, eBay comps and
// marketplace auto-post enqueue all live here. Never publish an item any other way.
export type PublishItemInput = {
  title?: any;
  price?: any;
  category?: any;
  condition?: any;
  optimisticLockVersion?: number;
};
export type PublishItemResult =
  | { ok: true; item: any; dryRun?: false }
  | { ok: true; dryRun: true; item?: undefined }
  | { ok: false; status: number; message: string; code?: string };

export async function publishItemForUser(
  user: { id: string; organizerId?: string | null },
  itemId: string,
  input: PublishItemInput = {},
  opts: { dryRun?: boolean } = {}
): Promise<PublishItemResult> {
    const { title, price, category, condition, optimisticLockVersion } = input;

    // Fetch current item state
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        saleId: true,
        draftStatus: true,
        optimisticLockVersion: true,
        category: true,
        tags: true,
        price: true, // ADR-134 D3 (B2): needed for the card no-price guard below
        card: { select: { id: true } }, // ADR-134 D3 (B2): marks a card item
        organizerId: true, // B1: inventory items (saleId null) resolve their owner through this
        sale: {
          select: {
            organizer: {
              select: OWNER_ORGANIZER_SELECT
            }
          }
        }
      }
    });

    if (!item) {
      return { ok: false, status: 404, message: 'Item not found' };
    }

    // Auth: only the organizer who owns the item can publish it (sale owner, or inventory owner when there is no sale)
    const owner = await resolveItemOwnerOrganizer(item, user.id);
    if (!owner) {
      return { ok: false, status: 403, message: item.saleId ? 'Access denied. Not your sale.' : 'Access denied. Not your item.' };
    }

    // B2 blocker: reject if already published or in an unexpected state
    if (item.draftStatus !== 'PENDING_REVIEW' && item.draftStatus !== 'DRAFT') {
      return {
        ok: false,
        status: 400,
        message: item.draftStatus === 'PUBLISHED'
          ? 'Item is already published.'
          : 'Item not ready. Smart tagging still in progress.',
      };
    }

    // ADR-134 D3 FIX (B2, orchestrator decision 2026-10-03): refuse to publish a CARD item (one with an
    // ItemCard row) that has no price. The eBay push path defaults a missing price to $0.99
    // (ebayController.ts), so a priceless card could otherwise go live at a price the seller never chose.
    // Effective price = the price in this request when one is sent, else the stored price.
    if (item.card) {
      const effectivePrice = price !== undefined
        ? (price !== null && price !== '' ? parseFloat(price) : null)
        : (item.price !== null && item.price !== undefined ? Number(item.price) : null);
      if (effectivePrice === null || Number.isNaN(effectivePrice)) {
        return { ok: false, status: 400, message: 'Add a price before publishing this card.', code: 'CARD_PRICE_REQUIRED' };
      }
    }

    // B5 blocker: optimistic lock check — prevent concurrent edits
    if (optimisticLockVersion !== undefined && optimisticLockVersion !== item.optimisticLockVersion) {
      return { ok: false, status: 409, message: 'Item was updated. Refresh and try again.' };
    }

    // Bulk dry run: every validation above passed, nothing is written.
    if (opts.dryRun) {
      return { ok: true, dryRun: true };
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
    // P0 fix: keep ebayShippingClassification in sync when category changes at publish time
    // (tags aren't part of this endpoint's body, so reuse the item's current tags).
    if (category !== undefined) { updateData.ebayShippingClassification = classifyEbayShipping(category, item.tags); }
    if (condition !== undefined) {
      // Same vocabulary rule as createItem and updateItem: a recognized value is stored canonical, an empty value clears
      // it, and anything else is ignored (never stored verbatim, never a 400).
      const publishCondition = coerceConditionInput(condition, 'publishItem');
      if (publishCondition.write) { updateData.condition = publishCondition.value; publishEditedFields.push('condition'); }
    }
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

    // B5 (2026-10-04): a draft-born row still carries the schema default rarity (COMMON) because the draft path never
    // assigned one. Assign it from the effective price now, BEFORE the LEGENDARY early-access check below. Rows that
    // already hold an assigned rarity are left alone (no bulk repair).
    let effectiveRarity: ItemRarity | undefined = fullItem?.rarity;
    if (fullItem && fullItem.rarity === ItemRarity.COMMON) {
      const publishPrice = price !== undefined
        ? (price !== null && price !== '' ? parseFloat(price) : null)
        : (item.price !== null && item.price !== undefined ? Number(item.price) : null);
      const assignedRarity = assignRarity(publishPrice !== null && !Number.isNaN(publishPrice) ? publishPrice : null);
      if (assignedRarity !== fullItem.rarity) {
        updateData.rarity = assignedRarity;
        effectiveRarity = assignedRarity;
      }
    }

    if (fullItem && effectiveRarity === ItemRarity.LEGENDARY) {
      const now = new Date();
      const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours in ms
      updateData.earlyAccessUntil = sixHoursLater;
    }

    // Update item with new state
    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: { ...updateData, ...organizerEditStampAlways() },
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
    fireWebhooks(user.id, 'item.published', {
      itemId: updatedItem.id,
      saleId: updatedItem.saleId,
      title: updatedItem.title,
      status: updatedItem.draftStatus
    }).catch(err => console.error('Webhook fire error:', err));

    // ADR-DRAFT approve-to-autolist-fanout (Architect Handoff 2026-09-17, section B): fire the
    // API-tier (Discogs/Reverb) auto-fanout dispatcher, non-blocking, same style as fireWebhooks
    // above. Deliberately NOT hooked into the generic item-update endpoint's draftStatus write
    // path (~line 1777) -- under-triggering is safer than over-triggering for a feature with
    // restricted-item safety implications; that is a deliberate scoping choice, not an oversight.
    // Re-fetches the full Item row (dispatchApiTierAutoFanout's signature takes the full Prisma
    // `Item` type, and this endpoint's own `updatedItem` select above is intentionally narrow --
    // never widened just to satisfy this call) and uses the item's own denormalized
    // `organizerId` (Item.organizerId, kept in sync with sale.organizerId) as the dispatcher's
    // `organizerId` argument -- NOT req.user.id/userId, which is what the connectors underneath
    // (createDiscogsListing/createReverbListing) actually key their MarketplaceAccount lookups on.
    prisma.item.findUnique({ where: { id: updatedItem.id } })
      .then((fullItem) => {
        if (fullItem?.organizerId) {
          dispatchApiTierAutoFanout(fullItem.organizerId, fullItem).catch((err) =>
            console.error('Auto-fanout dispatch error:', err)
          );
        }
      })
      .catch((err) => console.error('Auto-fanout item refetch error:', err));

    // ADR-069 Phase 2: Queue async eBay comps fetch (non-blocking)
    enqueueFetchEbayComps(updatedItem.id);

    // ADR-083: Queue Marketplace auto-post job if the organizer opted in (non-blocking)
    enqueueMarketplacePostJob(updatedItem.id).catch((err) => console.warn('Marketplace poster enqueue error:', err));

    // P2-3: Invalidate command center cache after item publish (status change)
    if (user.organizerId) {
      invalidateCommandCenterCache(user.organizerId).catch((err) =>
        console.warn('Failed to invalidate command center cache:', err)
      );
    }

    return { ok: true, item: updatedItem };
}

export const publishItem = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { itemId } = req.params;
    const result = await publishItemForUser(
      { id: req.user.id, organizerId: req.user.organizer?.id ?? null },
      itemId,
      req.body || {}
    );
    if (!result.ok) {
      return res.status(result.status).json(result.code ? { message: result.message, code: result.code } : { message: result.message });
    }
    res.json(result.item);
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
        saleId: true,
        organizerId: true,
        sale: {
          select: {
            organizer: {
              select: OWNER_ORGANIZER_SELECT
            }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Auth: only the item's owner can hold analysis (B1: sale owner or inventory owner, default deny)
    const owner = await resolveItemOwnerOrganizer(item, req.user.id);
    if (!owner) {
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
      select: { id: true, draftStatus: true, saleId: true, organizerId: true, sale: { select: { organizer: { select: OWNER_ORGANIZER_SELECT } } } }
    });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    const owner = await resolveItemOwnerOrganizer(item, req.user.id); // B1: default deny, sale or inventory owner
    if (!owner) return res.status(403).json({ message: 'Access denied.' });
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
        listingType: { not: 'CONSIGNOR_TAG' }, // consignor price-tag sales are not inventory
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
        lastEditedAt: true, // 2026-10-04: organizer-edit stamp (organizer-only endpoint)
        // Sprint 1: Listing Health Score + AI tag suggestions
        tags: true,
        // Status chip data — distinguish Draft / Published / On eBay
        status: true,
        ebayListingId: true,
        ebayOfferId: true, // S725: surfaces "Pending Publish" state in organizer UI
        listedOnEbayAt: true,
        ebayNeedsReview: true, // S791: #295 fix — badge persists across page loads
        // Add Items collapsed-row multi-channel status (2026-09-14)
        discogsListingId: true,
        discogsMatchStatus: true, // ADR-132: "Discogs: needs your pick" badge on the sale items list
        reverbListingId: true,
        shopifyListing: { select: { id: true } },
        // Feature #91: Auto-Markdown (P3: Fix 2)
        priceBeforeMarkdown: true,
        markdownApplied: true,
        // 2026-10-08: Add Items expanded row must round-trip these. Without them the row defaulted
        // 'Units available' to 1 and a Save wrote stockTotal=1 back over the real value. All are
        // Int/Float/Boolean/String columns (no Prisma Decimal), so they are JSON-safe as selected.
        stockTotal: true,
        stockSold: true, // server-owned; display only (stockTotal can never be saved below it)
        costBasis: true,
        consignorId: true,
        consignor: { select: { id: true, name: true } }, // display name for the row; Consignor has no displayName column
        excludeFromMarkdown: true, // organizer opt-out from both markdown crons
        originalPrice: true, // price anchor markdown/discretion logic uses (read-only display)
        markdownTierApplied: true, // 0 none, 1 Day-2 tier, 2 Day-3+ tier (read-only display)
        // Phase 2b: Legendary early access (P2: Fix 1)
        isLegendary: true,
        legendaryPublishedAt: true,
        tagColor: true, // Feature #310: Color-tagged discount rules
        // eBay push card + editState shipping fields — required for review page
        // S-SIZE-WEIGHT-CEILING-2026-09-27: aiPackageWeightOz added alongside the four fields
        // above so this page's Add-Items collapsed-row ELIGIBLE/PUBLISHED dots (computed via
        // itemChannelStatusService.ts -> checkEligibility) agree with the real gate the
        // extension queue endpoints enforce -- without it, an item whose ONLY weight signal is
        // an AI estimate (no organizer-confirmed packageWeightOz) would show ELIGIBLE here while
        // actually being excluded from the Vinted/Poshmark/Mercari queue.
        aiPackageWeightOz: true,
        packageWeightOz: true,
        packageLengthIn: true,
        packageWidthIn: true,
        packageHeightIn: true,
        ebayShippingOverride: true,
        ebayFulfillmentPolicyOverrideId: true,
        // eBay product identifiers — required for review page Brand/MPN/UPC inputs
        brand: true,
        mpn: true,
        fccId: true,
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
        // Trading card record (null for non-cards): lets the review screen ask the card condition scale
        // (NM/LP/MP/HP/DMG) instead of the generic S/A/B/C/D grade. Condition fields only, no lockedFields/dedupKey.
        card: { select: { game: true, conditionCode: true, grader: true, grade: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });

    // Feature #310: Pre-fetch active discount rules for this workspace
    let activeRules: Array<{ tagColor: string; discountPercent: number; activeFrom: Date | null; activeTo: Date | null }> = [];
    const workspace = await prisma.organizerWorkspace.findFirst({
      where: { owner: { userId: req.user.id } },
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

    // Add Items collapsed-row multi-channel status (2026-09-14) -- exactly 2 extra
    // queries total regardless of item count: one organizer-scoped lookup for
    // channel-connection flags, one batched MarketplaceListingJob query for this
    // page's items. See ADR-2026-09-14-add-items-multichannel-status-aggregation.md.
    const channelStatusOrganizer = await prisma.organizer.findUnique({
      where: { id: sale.organizerId },
      select: {
        ebayConnection: { select: { id: true } },
        shopifyEnabled: true,
        subscriptionTier: true,
        // ADDENDUM 2026-09-14: widened from DISCOGS-only to both official-API-tier platforms --
        // Prisma can't select the same relation key (marketplaceAccounts) twice under one
        // parent select with two different `where` filters, so both flags are derived below
        // from this single combined query instead. ADR-135 D4.6 (2026-10-03): ETSY joins the same query.
        marketplaceAccounts: {
          where: { platform: { in: ['DISCOGS', 'REVERB', 'ETSY'] }, status: 'ACTIVE' },
          select: { id: true, platform: true },
        },
      },
    });

    const itemIds = items.map(i => i.id);

    // Organizer-wide: which extension platforms has this organizer EVER posted to
    // (any status) -- used only to decide whether to show a dot for that channel
    // at all, not whether any specific item is published on it.
    const organizerJobPlatforms = await prisma.marketplaceListingJob.findMany({
      where: { item: { sale: { organizerId: sale.organizerId } }, platform: { in: [...EXTENSION_PLATFORMS] } },
      distinct: ['platform'],
      select: { platform: true },
    });
    const extensionPlatformsUsed: ExtensionPlatformsUsed = {
      facebook: organizerJobPlatforms.some(j => j.platform === 'FACEBOOK'),
      craigslist: organizerJobPlatforms.some(j => j.platform === 'CRAIGSLIST'),
      gumtreeAu: organizerJobPlatforms.some(j => j.platform === 'GUMTREE_AU'),
      grailed: organizerJobPlatforms.some(j => j.platform === 'GRAILED'),
      poshmark: organizerJobPlatforms.some(j => j.platform === 'POSHMARK'),
      mercari: organizerJobPlatforms.some(j => j.platform === 'MERCARI'),
      vinted: organizerJobPlatforms.some(j => j.platform === 'VINTED'),
    };

    // This page's items only: which are currently POSTED per platform.
    // BUG FIX 2026-09-22 (S-EXT-REMOVAL-SKIP-ENDS-LISTING, consistency pass): this used to treat
    // ANY POSTED row ever as "published now", so an item whose listing was later removed
    // (REMOVE/REMOVED) still showed a green channel dot. Now uses the same newest-row-per-
    // item+platform-wins rule as extensionController's getExtensionItems/getPendingRemovals:
    // published only if the newest row is POST/POSTED, with REMOVE/SKIPPED rows (failed removal
    // attempts -- the listing is still live) excluded from the newest-row pick.
    const pagePostedJobs = await prisma.marketplaceListingJob.findMany({
      where: { itemId: { in: itemIds }, platform: { in: [...EXTENSION_PLATFORMS] } },
      select: { itemId: true, platform: true, action: true, status: true, createdAt: true },
    });
    // U3 (2026-10-04): the newest-row-wins rule now lives in itemMarketplaceStatusService, shared with
    // GET /items/:id/marketplace-status. Same rule, same result as the inline code it replaced.
    const publishedExtensionPlatformsByItemId: PublishedExtensionPlatformsByItemId = listedExtensionPlatformsByItemId(pagePostedJobs);

    // ADR-135 D4.6: Etsy dot inputs. Only when this organizer has an active Etsy account (everyone else keeps exactly the
    // queries and inputs they had before). ONE organizer-scoped EtsyListing query for the page's item ids, plus one
    // ItemCard query for the release year (the card's own year decides Etsy age eligibility). Best-effort: a failure here
    // only hides the Etsy dot, it never fails the Add Items list.
    const hasActiveEtsyAccount = channelStatusOrganizer?.marketplaceAccounts.some(a => a.platform === 'ETSY') ?? false;
    let channelStatusItems: unknown[] = items;
    if (hasActiveEtsyAccount && itemIds.length > 0) {
      try {
        const [etsyRows, cardRows] = await Promise.all([
          prisma.etsyListing.findMany({
            where: { itemId: { in: itemIds }, organizerId: sale.organizerId },
            select: { itemId: true, state: true, whenMade: true, isSupply: true },
          }),
          prisma.itemCard.findMany({
            where: { itemId: { in: itemIds } },
            select: { itemId: true, releaseYear: true },
          }),
        ]);
        const etsyByItemId = new Map(etsyRows.map(r => [r.itemId, r] as const));
        const releaseYearByItemId = new Map(cardRows.map(r => [r.itemId, r.releaseYear] as const));
        channelStatusItems = items.map(i => {
          const etsyRow = etsyByItemId.get(i.id);
          return {
            ...i,
            etsyListingState: etsyRow?.state ?? null,
            etsyWhenMade: etsyRow?.whenMade ?? null,
            etsyIsCraftSupply: etsyRow ? etsyRow.isSupply : null,
            releaseYear: releaseYearByItemId.get(i.id) ?? null,
          };
        });
      } catch (etsyErr) {
        console.warn('[Add Items] Etsy channel status inputs failed to load (Etsy dot hidden for this page):', (etsyErr as Error).message);
      }
    }

    const channelStatusByItemId = channelStatusOrganizer
      ? computeChannelStatusForItems(
          channelStatusItems as unknown as ChannelStatusItemInput[],
          {
            hasEbayConnection: channelStatusOrganizer.ebayConnection != null,
            shopifyEnabled: channelStatusOrganizer.shopifyEnabled,
            subscriptionTier: channelStatusOrganizer.subscriptionTier,
            hasActiveDiscogsAccount: channelStatusOrganizer.marketplaceAccounts.some(a => a.platform === 'DISCOGS'),
            hasActiveReverbAccount: channelStatusOrganizer.marketplaceAccounts.some(a => a.platform === 'REVERB'),
            hasActiveEtsyAccount,
          },
          extensionPlatformsUsed,
          publishedExtensionPlatformsByItemId
        )
      : {};

    // U1 (2026-10-04): ONE batched query for the whole page (never per item): unacknowledged FAILED or PARTIAL eBay
    // pushes per item, scoped to this sale's organizer. Drives the warning badge on the list row.
    const failedPushCounts = await getFailedPushCountsByItemId(itemIds, sale.organizerId);

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
      // Add Items collapsed-row multi-channel status (2026-09-14)
      channelStatus: channelStatusByItemId[item.id] ?? null,
      // U1 (2026-10-04): failed, unacknowledged eBay push attempts for this item (0 = no badge).
      marketplacePushFailedCount: failedPushCounts.get(item.id) ?? 0,
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

    // Generate QR code pointing to item page. utm_source=qr_item marks the visit as QR-originated so
    // the item page can offer the location-verified scan (components/ItemQrScanPrompt.tsx).
    const qrContent = `${process.env.FRONTEND_URL || 'https://finda.sale'}/items/${itemId}?utm_source=qr_item`;

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
    // Strict numeric parsing (2026-09-29): only plain finite decimals in range are accepted; '12abc',
    // exponents, arrays and NaN/Infinity all read as "no coordinate" (LOCATION_REQUIRED below).
    const latitude = parseLatitude(req.query.latitude);
    const longitude = parseLongitude(req.query.longitude);
    // Optional GPS accuracy in meters reported by the browser; widens the geofence a little so a real
    // shopper standing in the driveway is not rejected because of a noisy fix (capped to 100m).
    const accuracyMeters = parseAccuracyMeters(req.query.accuracy);

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
          select: {
            id: true, lat: true, lng: true, status: true, deletedAt: true, startDate: true, endDate: true,
            organizer: { select: { timezone: true } },
          },
        },
      },
    });

    // Only items of a live (PUBLISHED, not deleted) sale can be scanned for XP. A DRAFT/ENDED/deleted sale
    // answers exactly like a missing item so scans cannot probe unpublished inventory.
    if (!item || !item.sale || item.sale.status !== 'PUBLISHED' || item.sale.deletedAt) {
      res.status(404).json({ message: 'Item not found.' });
      return;
    }

    // Geofence (#317): when the sale has coordinates, the scan must carry valid ones and they must be
    // within 100m of the sale (plus the browser-reported GPS accuracy, capped at 100m). Previously a
    // request that simply omitted lat/lng skipped the check entirely, which made the geofence optional.
    // A sale WITHOUT coordinates cannot be geofenced. That used to fail OPEN (XP awarded to anyone anywhere);
    // it now fails closed: the scan is acknowledged but no XP or badge is awarded.
    if (item.sale.lat === null || item.sale.lng === null) {
      res.status(200).json({
        message: 'QR scan recorded. This sale has no verified location yet, so no XP was awarded.',
        xpAwarded: 0,
        scanAndSplitTriggered: false,
      });
      return;
    }
    // Anti-spoof guard (2026-09-29): sale active window in the sale timezone, per user+sale and per IP+sale rate
    // limits, haversine radius (QR_SCAN_MAX_RADIUS_M, default 500m, plus GPS accuracy capped at 100m) and an
    // impossible-speed check against the user's previous accepted scan. A rejection is logged with its reason
    // ([qrScan] rejected ...) and awards nothing. The response keeps the { error, message, code } shape.
    const guard = await checkQrScan({
      kind: 'item',
      userId,
      ip: req.ip,
      lat: latitude,
      lng: longitude,
      accuracyMeters,
      sale: {
        id: item.sale.id,
        lat: item.sale.lat,
        lng: item.sale.lng,
        startDate: item.sale.startDate,
        endDate: item.sale.endDate,
        timeZone: item.sale.organizer?.timezone ?? null,
      },
    });
    if (!guard.ok) {
      res.status(guard.status).json(qrScanRejectionBody(guard));
      return;
    }

    // Import awardXp and cap check here to avoid circular dependency
    const { awardXp, checkDailyXpCap, computeTreasureHuntScanXp } = await import('../services/xpService');

    // Dedupe-then-award must be ATOMIC (2026-09-29): the old findFirst-then-awardXp let N parallel requests all
    // pass the "already scanned today" check and each collect XP. PointsTransaction has no unique key for
    // (user, item, day), so the check + award run under a per-(user, item, day) Postgres advisory lock held for
    // the whole transaction: a second request blocks on the lock, then re-checks and sees the committed
    // TREASURE_HUNT_SCAN row awardXp wrote (awardXp commits on its own connection before the lock is released).
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const scanLockKey = buildQrScanLockKey(userId, itemId, today);

    const scanOutcome = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scanLockKey}))`;

        // Check if user has already scanned this item today (prevent duplicate scans)
        const alreadyScannedToday = await tx.pointsTransaction.findFirst({
          where: { userId, type: 'TREASURE_HUNT_SCAN', itemId, createdAt: { gte: today } },
          select: { id: true },
        });
        if (alreadyScannedToday) return { kind: 'duplicate' as const };

        // Get user's current rank for XP multiplier calculation
        const scanUser = await tx.user.findUnique({ where: { id: userId }, select: { explorerRank: true } });
        if (!scanUser) return { kind: 'no_user' as const };

        // Shared helper: rank multiplier + Hunt Pass +10% bonus (fetches Hunt Pass status fresh)
        const multipliedXp = await computeTreasureHuntScanXp(userId, scanUser.explorerRank);

        // Check daily cap for TREASURE_HUNT_SCAN XP
        const dailyRemaining = await checkDailyXpCap(userId, 'TREASURE_HUNT_SCAN');
        const xpToAward = Math.min(multipliedXp, dailyRemaining);
        if (xpToAward === 0) return { kind: 'capped' as const };

        // Award XP (respecting daily cap; rank + Hunt Pass multiplier already applied above)
        const awarded = await awardXp(userId, 'TREASURE_HUNT_SCAN', xpToAward, { itemId, preMultipliedHuntPassXp: true });
        return { kind: 'awarded' as const, xpResult: awarded };
      },
      { maxWait: 10000, timeout: 30000 }
    );

    if (scanOutcome.kind === 'duplicate') {
      res.status(200).json({
        message: 'Item already scanned today.',
        guildXp: (await prisma.user.findUnique({ where: { id: userId }, select: { guildXp: true } }))?.guildXp,
      });
      return;
    }
    if (scanOutcome.kind === 'no_user') {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    if (scanOutcome.kind === 'capped') {
      res.status(200).json({
        message: 'Daily item scan XP cap reached. Try again tomorrow.',
        guildXp: (await prisma.user.findUnique({ where: { id: userId }, select: { guildXp: true } }))?.guildXp,
      });
      return;
    }
    const xpResult = scanOutcome.xpResult;

    // Sale Passport decision (2026-09-29): a geofenced item-QR scan deliberately awards NO Sale Passport
    // stamp. ADR-sale-passport-2026-09-29 defines ATTEND_SALE / First Steps / Weekend Warrior / Road
    // Tripper as a pure function of SaleCheckin rows (saleController.checkInToSale), and nowhere counts
    // an item-QR scan as attendance. Awarding ATTEND_SALE here would only bump the legacy counter without
    // a SaleCheckin row and would diverge from the derived passport. Revisit only if the ADR is amended.

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
      include: { sale: { include: { organizer: { select: OWNER_ORGANIZER_SELECT } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // B1: default-deny owner resolution first, then the sale-bound check (auctions only exist inside a sale)
    const owner = await resolveItemOwnerOrganizer(item, req.user.id);
    if (!owner) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    if (!item.saleId) {
      return res.status(400).json({ message: 'Auctions are only available for items in a sale.' });
    }

    if (item.listingType !== 'AUCTION') {
      return res.status(400).json({ message: 'Item is not an auction' });
    }

    if (item.auctionClosed) {
      return res.status(400).json({ message: 'Auction already closed' });
    }

    // Call the shared close logic. It now enforces the SAME reserve-price rule as the
    // auction-closing cron (utils/auctionRules.evaluateAuctionReserve) — before 2026-08-17 this
    // manual path had no reserve check at all, so this button could award and charge a lot
    // below the organizer's own reserve. The result is reported back rather than swallowed: an
    // organizer who just protected their reserve needs to be told the lot did NOT sell, not
    // handed a generic "closed successfully".
    const result = await closeAuction(itemId);

    if (result.outcome === 'RESERVE_NOT_MET') {
      const bid = result.highestBidAmount ?? 0;
      const reserve = result.reservePrice ?? 0;
      return res.json({
        outcome: 'RESERVE_NOT_MET',
        sold: false,
        highestBid: bid,
        reservePrice: reserve,
        message: `Auction closed without a sale. The highest bid was $${bid.toFixed(2)}, below your reserve price of $${reserve.toFixed(2)}. Nobody was charged.`,
      });
    }

    if (result.outcome === 'NO_BIDS') {
      return res.json({
        outcome: 'NO_BIDS',
        sold: false,
        message: 'Auction closed with no bids.',
      });
    }

    if (result.outcome === 'ALREADY_CLOSED') {
      return res.status(400).json({ outcome: 'ALREADY_CLOSED', sold: false, message: 'Auction already closed' });
    }

    if (result.outcome === 'SOLD') {
      const bid = result.highestBidAmount ?? 0;
      return res.json({
        outcome: 'SOLD',
        sold: true,
        highestBid: bid,
        message: `Auction closed. Winning bid $${bid.toFixed(2)}. A payment link has been sent to the winner.`,
      });
    }

    // NOT_FOUND / NOT_AN_AUCTION are already screened above; anything left is ERROR, which
    // closeAuction logs and swallows by design.
    return res.status(500).json({ outcome: result.outcome, sold: false, message: 'Failed to close auction' });
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
          in: ['RARE', 'LEGENDARY']
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
          in: ['RARE', 'LEGENDARY']
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

    // Verify organizer ownership (B1: default-deny owner resolution; works for inventory items too)
    const owner = await resolveItemOwnerOrganizer(item, authReq.user.id);
    if (!owner) {
      return res.status(403).json({ message: 'You do not own this item' });
    }

    // Organizer Special spends XP against a sale, so an inventory item (no sale) cannot take one.
    if (!item.saleId) {
      return res.status(400).json({ message: 'Organizer Special needs a sale. Add this item to a sale first.' });
    }
    const discountSaleId: string = item.saleId;

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
    // The no-sale case returned 400 above, so discountSaleId is always a real sale id here
    const spendSuccess = await spendXp(authReq.user.id, xpToSpend, 'ORGANIZER_ITEM_DISCOUNT', {
      saleId: discountSaleId,
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
        ...organizerEditStampAlways(), // B6: organizer action
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
      include: { sale: { include: { organizer: { select: OWNER_ORGANIZER_SELECT } } } },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Verify organizer ownership (B1: default-deny owner resolution; works for inventory items too)
    const owner = await resolveItemOwnerOrganizer(item, authReq.user.id);
    if (!owner) {
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
        ...organizerEditStampAlways(), // B6: organizer action
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
      include: { sale: { include: { organizer: { select: OWNER_ORGANIZER_SELECT } } } },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Verify organizer ownership (B1: default-deny owner resolution; works for inventory items too)
    const owner = await resolveItemOwnerOrganizer(item, authReq.user.id);
    if (!owner) {
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
// GET /api/items/sitemap: machine-readable list of publicly viewable item ids (id + updatedAt).
// Public, no auth. This is a DATA endpoint for partners and tooling. It is NOT wired into any sitemap:
// item pages (/items/[id]) are deliberately noindex until they move to ISR, so item URLs must not be
// advertised to crawlers (see pages/server-sitemap.xml.tsx, the note above `fields`, S1070/S1071).
// Do not add these ids to sitemap.xml or server-sitemap.xml until that ISR decision is reversed.
//
// Visibility matches the public sale page (getSale for an anonymous viewer):
//  - item: PUBLIC_ITEM_FILTER (isActive, not GRACE_LOCKED, draftStatus PUBLISHED)
//  - sale: PUBLISHED, not soft-deleted, not an inventory container, past its early-access window
//    (anonymous viewers are rank INITIATE, which has no early access, so publishedAt must be null or <= now)
// Query: ?limit= (default 5000, max 10000), ?cursor=<item id> from the previous page's nextCursor.
// Order is updatedAt desc, id desc (stable). Response: { items: [{ id, updatedAt }], nextCursor: string | null }.
export const getSitemapItems = async (req: Request, res: Response) => {
  try {
    // Visibility rules and pagination live in services/publicItemIndexService.ts (unit tested).
    const { items, nextCursor } = await listPublicItemIds(parseSitemapPaging(req.query));

    // Ids change rarely relative to how often partners poll; let the CDN absorb repeat reads.
    res.set('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=120');
    res.set('X-Robots-Tag', 'noindex');
    res.json({ items, nextCursor });
  } catch (error) {
    console.error('[getSitemapItems] Error:', error);
    res.status(500).json({ message: 'Server error fetching sitemap items' });
  }
};

// Package-estimation isolation ADR (2026-08-05): read-only, non-persisting endpoints
// that expose computeEffectivePackageWeight's cascade result to the frontend's
// "Get AI estimate" buttons (edit-item, review.tsx, PostSaleEbayPanel). Neither handler
// below ever calls prisma.item.update -- only the organizer's own explicit PUT
// /items/:id save (with packageConfirmedByOrganizer: true) may persist a resolved
// weight/dims value into the organizer-facing fields.

// GET /api/items/:id/package-estimate — single item, organizer-owned only.
export const getPackageEstimateHandler = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    // Ownership pattern mirrors updateItem/reanalyzeItemForOrganizer.
    const item = await prisma.item.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: OWNER_ORGANIZER_SELECT } } } },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    // B1: default-deny owner resolution; inventory owners (no sale) now succeed instead of getting a 403.
    const owner = await resolveItemOwnerOrganizer(item, req.user.id);
    if (!owner) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }

    const resolved = await computeEffectivePackageWeight({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      ebayCategoryId: item.ebayCategoryId,
      ebayShippingOverride: item.ebayShippingOverride,
      packageConfirmedByOrganizer: item.packageConfirmedByOrganizer,
      packageWeightOz: item.packageWeightOz,
      packageLengthIn: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
      packageWidthIn: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
      packageHeightIn: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
      packageType: item.packageType,
      aiPackageWeightOz: item.aiPackageWeightOz,
      aiPackageDimsJson: item.aiPackageDimsJson,
      aiPackageConfidence: item.aiPackageConfidence != null ? Number(item.aiPackageConfidence) : null,
    });

    if (!resolved) {
      // No estimate available -- e.g. LOCAL_PICKUP_ONLY item, or the item already has a
      // real (organizer-confirmed or measured) weight. A valid, expected outcome, not a
      // failure -- respond 200, not an error.
      return res.status(200).json({
        weightOz: null,
        dims: null,
        packageType: null,
        confidence: null,
        source: null,
        reason: 'not-applicable',
      });
    }

    // computeEffectivePackageWeight's return shape does not carry a confidence number
    // (its AI-fallback tier does not track one either) -- confidence is null here rather
    // than fabricated. Provenance is still available via `source`.
    return res.status(200).json({
      weightOz: resolved.weightOz,
      dims: { length: resolved.lengthIn, width: resolved.widthIn, height: resolved.heightIn },
      packageType: resolved.packageType,
      confidence: null,
      source: resolved.source,
    });
  } catch (error) {
    console.error('[getPackageEstimateHandler] Error:', error);
    res.status(500).json({ message: 'Server error computing package estimate' });
  }
};

// POST /api/items/package-estimates — batch, for review.tsx's multi-item "Get AI
// estimate" buttons (avoids N sequential single-item requests). Capped at 100 IDs per
// request to bound the per-request computation; items not found or not owned by the
// requesting organizer are silently skipped rather than erroring the whole batch.
const PACKAGE_ESTIMATE_BATCH_MAX = 100;

export const getPackageEstimatesBatchHandler = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { itemIds } = req.body as { itemIds?: unknown };
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'itemIds (a non-empty array of item IDs) is required.' });
    }
    if (itemIds.length > PACKAGE_ESTIMATE_BATCH_MAX) {
      return res.status(400).json({
        message: `Too many item IDs -- ${itemIds.length} sent, ${PACKAGE_ESTIMATE_BATCH_MAX} max per request.`,
      });
    }
    const idsToUse = itemIds.filter((i): i is string => typeof i === 'string' && i.length > 0);
    if (idsToUse.length === 0) {
      return res.status(400).json({ message: 'itemIds must contain at least one non-empty string ID.' });
    }

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Ownership-scoped in the query itself -- any ID not belonging to this organizer's
    // sales (or not found at all) is simply absent from `items`, so it's skipped below
    // rather than erroring the whole batch.
    const items = await prisma.item.findMany({
      where: { id: { in: idsToUse }, sale: { organizerId: organizer.id } },
      select: {
        id: true, title: true, description: true, category: true, ebayCategoryId: true,
        ebayShippingOverride: true, packageConfirmedByOrganizer: true, packageWeightOz: true,
        packageLengthIn: true, packageWidthIn: true, packageHeightIn: true, packageType: true,
        aiPackageWeightOz: true, aiPackageDimsJson: true, aiPackageConfidence: true,
      },
    });

    const estimates: Array<{
      itemId: string;
      weightOz: number;
      dims: { length: number | null; width: number | null; height: number | null };
      packageType: string | null;
      confidence: null;
      source: string;
    }> = [];

    for (const item of items) {
      const resolved = await computeEffectivePackageWeight({
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        ebayCategoryId: item.ebayCategoryId,
        ebayShippingOverride: item.ebayShippingOverride,
        packageConfirmedByOrganizer: item.packageConfirmedByOrganizer,
        packageWeightOz: item.packageWeightOz,
        packageLengthIn: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
        packageWidthIn: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
        packageHeightIn: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
        packageType: item.packageType,
        aiPackageWeightOz: item.aiPackageWeightOz,
        aiPackageDimsJson: item.aiPackageDimsJson,
        aiPackageConfidence: item.aiPackageConfidence != null ? Number(item.aiPackageConfidence) : null,
      });
      // Not-applicable (pickup-only, or already has a real weight) -- omit rather than
      // padding the array with a null placeholder, so the frontend just iterates what
      // came back.
      if (!resolved) continue;
      estimates.push({
        itemId: item.id,
        weightOz: resolved.weightOz,
        dims: { length: resolved.lengthIn, width: resolved.widthIn, height: resolved.heightIn },
        packageType: resolved.packageType,
        confidence: null,
        source: resolved.source,
      });
    }

    return res.status(200).json({ estimates });
  } catch (error) {
    console.error('[getPackageEstimatesBatchHandler] Error:', error);
    res.status(500).json({ message: 'Server error computing package estimates' });
  }
};

// GET /api/items/:id/suggested-shipping-price — ADR-104 Sec3: native FindA.Sale
// checkout suggested shipping price. Read-only, non-persisting (never writes
// Item.shippingPrice) -- the organizer sees the suggestion and types/accepts the
// final number themselves (ADR-104 Sec3 Contract: "Suggested, not locked"). Mirrors
// getPackageEstimateHandler's auth/ownership pattern immediately above. Accepts
// optional weightOz/lengthIn/widthIn/heightIn/packageType query overrides so the
// frontend can price the organizer's CURRENT unsaved form values (edit-item keeps
// package fields in local formData until Save), falling back to the item's last
// persisted package fields when no override is given.
export const getSuggestedShippingPriceHandler = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    // Ownership pattern mirrors getPackageEstimateHandler/updateItem.
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        packageWeightOz: true,
        packageLengthIn: true,
        packageWidthIn: true,
        packageHeightIn: true,
        packageType: true,
        ebayCategoryId: true,
        category: true,
        price: true,
        saleId: true,
        organizerId: true,
        sale: {
          select: {
            zip: true,
            organizer: {
              select: OWNER_ORGANIZER_SELECT,
            },
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    // B1: default-deny owner resolution; inventory owners (no sale) now succeed instead of getting a 403.
    const owner = await resolveItemOwnerOrganizer(item, req.user.id);
    if (!owner) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }
    // An inventory item has no sale zip, so its origin is the owner's saved location. Without one there is nothing to price from.
    if (!item.sale && (owner.lat == null || owner.lng == null)) {
      return res.status(400).json({
        code: 'NEEDS_ORIGIN',
        message: 'A saved business location is needed to suggest a shipping price for an item that is not in a sale.',
      });
    }

    const q = req.query as Record<string, string | undefined>;
    const weightOzOverride = q.weightOz != null ? parseInt(q.weightOz, 10) : undefined;
    const lengthInOverride = q.lengthIn != null ? parseFloat(q.lengthIn) : undefined;
    const widthInOverride = q.widthIn != null ? parseFloat(q.widthIn) : undefined;
    const heightInOverride = q.heightIn != null ? parseFloat(q.heightIn) : undefined;
    const packageTypeOverride = q.packageType != null && q.packageType !== '' ? q.packageType : undefined;
    // Preview/applied lockstep (2026-08-16): priceUsd + categoryId are the two
    // package-independent inputs to suggestNativeShippingPrice (both gate
    // evaluateStandardEnvelope -- ebayRateEstimateService.ts:1091-1096). updateItem's
    // ADR-106 auto-set branch prices off the PATCH body's effPrice/effEbayCategoryId,
    // i.e. the organizer's CURRENT unsaved values; without these overrides this preview
    // fell back to the LAST PERSISTED price/category and could disagree with what Save
    // writes by DOLLARS (envelope $1.36 vs parcel $5.24 at the carrier level), not cents.
    // Sent by edit-item/[id].tsx's suggestion effect alongside weightOz/dims/packageType.
    const priceUsdOverride = q.priceUsd != null ? parseFloat(q.priceUsd) : undefined;
    const categoryIdOverride = q.categoryId != null && q.categoryId !== '' ? q.categoryId : undefined;

    const weightOz =
      weightOzOverride != null && !isNaN(weightOzOverride) ? weightOzOverride : item.packageWeightOz;
    const lengthIn =
      lengthInOverride != null && !isNaN(lengthInOverride)
        ? lengthInOverride
        : item.packageLengthIn != null
        ? Number(item.packageLengthIn)
        : null;
    const widthIn =
      widthInOverride != null && !isNaN(widthInOverride)
        ? widthInOverride
        : item.packageWidthIn != null
        ? Number(item.packageWidthIn)
        : null;
    const heightIn =
      heightInOverride != null && !isNaN(heightInOverride)
        ? heightInOverride
        : item.packageHeightIn != null
        ? Number(item.packageHeightIn)
        : null;
    const packageType = packageTypeOverride ?? item.packageType ?? null;

    if (weightOz == null || weightOz <= 0) {
      return res.status(400).json({
        code: 'NEEDS_PACKAGE_DETAILS',
        message: 'A package weight is required to suggest a shipping price.',
      });
    }

    try {
      const suggestion = await suggestNativeShippingPrice({
        weightOz,
        dims: { length: lengthIn, width: widthIn, height: heightIn },
        packageType,
        origin: {
          zip: item.sale?.zip ?? null,
          lat: owner.lat,
          lng: owner.lng,
        },
        subscriptionTier: owner.subscriptionTier as any,
        categoryId: categoryIdOverride ?? item.ebayCategoryId ?? null,
        // No query-param override for category name exists yet (the edit-item form
        // never sends one -- only categoryId changes independently of it), so this
        // preview always reflects the item's last-PERSISTED category, same as every
        // other field here before its own override was added.
        category: item.category ?? null,
        priceUsd:
          priceUsdOverride != null && !isNaN(priceUsdOverride)
            ? priceUsdOverride
            : item.price ?? null,
      });
      return res.status(200).json(suggestion);
    } catch (err) {
      if (err instanceof NativeShippingHardBlockError) {
        return res.status(400).json({
          code: 'PACKAGE_EXCEEDS_CARRIER_LIMITS',
          message: err.message,
        });
      }
      throw err;
    }
  } catch (error) {
    console.error('[getSuggestedShippingPriceHandler] Error:', error);
    res.status(500).json({ message: 'Server error computing suggested shipping price' });
  }
};

// ADR-115 Phase 3 (2026-09-05) -- one fixed representative far-distance US metro address per
// origin region. Not a picker: Patrick's call was "probably a far one," so this is a simple
// two-branch lookup, not a real destination (there is no buyer yet at listing time -- see
// claude_docs/ux-spotchecks/order-fulfillment-and-shipping-price-validation-2026-09-05.md).
// Shippo's rate API needs a full address shape, not just a zip, hence street1/city/state below.
const WEST_COAST_MOUNTAIN_ORIGIN_STATES = new Set([
  'CA', 'OR', 'WA', 'NV', 'AZ', 'UT', 'ID', 'MT', 'WY', 'CO', 'NM', 'AK', 'HI',
]);
const EAST_COAST_TEST_DESTINATION = { name: 'Live Rate Check', street1: '1 Main St', city: 'New York', state: 'NY', zip: '10001', country: 'US' };
const WEST_COAST_TEST_DESTINATION = { name: 'Live Rate Check', street1: '1 Main St', city: 'Los Angeles', state: 'CA', zip: '90001', country: 'US' };

/**
 * GET /api/items/:id/live-shipping-check
 * ADR-115 Phase 3 -- Finding 2 fix (Part B). The edit-item page's shipping-price suggestion
 * has never come from a live Shippo quote (see the UX handoff doc above) -- this endpoint
 * calls the SAME getShippingRates() step shippingLabelService.ts already uses for real label
 * purchases (confirmed this session to be the free rate-shopping step, separate from the
 * paid label-purchase step), using the sale's real origin plus one fixed representative
 * far-distance destination. Ownership pattern mirrors getSuggestedShippingPriceHandler above.
 */
export const getLiveShippingRateCheckHandler = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        packageWeightOz: true,
        packageLengthIn: true,
        packageWidthIn: true,
        packageHeightIn: true,
        saleId: true,
        organizerId: true,
        sale: {
          select: {
            address: true,
            city: true,
            state: true,
            zip: true,
            organizer: { select: { ...OWNER_ORGANIZER_SELECT, businessName: true } },
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    // B1: default-deny owner resolution first (an inventory owner is authorised, not rejected as a stranger).
    const owner = await resolveItemOwnerOrganizer(item, req.user.id);
    if (!owner) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }
    // The ship-from address comes from the sale. An inventory item has no sale, so there is no address to rate from.
    if (!item.sale) {
      return res.status(400).json({ message: 'Live rate checks need a sale address. This item is not part of a sale.' });
    }
    if (!item.sale.address || !item.sale.city || !item.sale.state || !item.sale.zip) {
      return res.status(400).json({ message: 'Your sale needs a full address before checking a real rate.' });
    }

    const weightOz = item.packageWeightOz ?? 16;
    const lengthIn = item.packageLengthIn != null ? Number(item.packageLengthIn) : 10;
    const widthIn = item.packageWidthIn != null ? Number(item.packageWidthIn) : 8;
    const heightIn = item.packageHeightIn != null ? Number(item.packageHeightIn) : 4;

    const addressFrom = {
      name: item.sale.organizer.businessName || 'FindA.Sale organizer',
      street1: item.sale.address,
      city: item.sale.city,
      state: item.sale.state,
      zip: item.sale.zip,
      country: 'US',
    };
    const addressTo = WEST_COAST_MOUNTAIN_ORIGIN_STATES.has(item.sale.state.toUpperCase())
      ? EAST_COAST_TEST_DESTINATION
      : WEST_COAST_TEST_DESTINATION;

    const rates = await getShippingRates(addressFrom, addressTo, { lengthIn, widthIn, heightIn, weightOz });
    if (rates.length === 0) {
      return res.status(502).json({ message: 'Shippo returned no live rates to check against right now.' });
    }
    const cheapest = rates.reduce((min, r) => (r.amountCents < min.amountCents ? r : min), rates[0]);

    res.json({
      carrier: cheapest.provider,
      serviceName: cheapest.serviceName,
      amountCents: cheapest.amountCents,
      destinationLabel: addressTo.city + ', ' + addressTo.state,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getLiveShippingRateCheckHandler] Error:', error);
    res.status(500).json({ message: 'Server error checking a live shipping rate' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Physical Markdown Alert List (2026-09-25, Patrick): a running staff-facing list of
// items the SYSTEM auto-marked down (markdownCron.ts / markdownCycleCron.ts, which set
// Item.markdownApplied = true and write an ItemPriceHistory row) so a real person can
// physically re-tag/re-sticker that item on the shelf with its new price. See
// Item.markdownPhysicallyAppliedAt in schema.prisma for the tracking field and its reset
// rule on a later markdown stage.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/items/markdown-retag-queue — organizer-wide (all of this organizer's sales),
// paginated, newest-marked-down-first. Mirrors getPackageEstimatesBatchHandler's
// organizer-resolution/ownership pattern above.
export const getMarkdownRetagQueue = async (req: AuthRequest, res: Response) => {
  try {
    // 2026-09-29: organizer resolved by requireRetagAccess (owner at any tier, or TEAMS staff with permission).
    const acting = (req as ActingOrganizerRequest).actingOrganizer;
    if (!acting) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.', code: 'NOT_ORGANIZER' });
    }
    const organizer = { id: acting.organizerId };

    const { page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string) || 50));

    // status/deletedAt (2026-09-29): a marked-down item that has since SOLD or been deleted no
    // longer has a shelf tag to change, so it must not linger on the staff list.
    const where = {
      organizerId: organizer.id,
      markdownApplied: true,
      markdownPhysicallyAppliedAt: null,
      status: { in: ['AVAILABLE', 'RESERVED'] },
      deletedAt: null,
    };

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        select: {
          id: true,
          title: true,
          sku: true,
          price: true,
          priceBeforeMarkdown: true,
          photoUrls: true,
          saleId: true,
          sale: { select: { title: true } },
          updatedAt: true,
          markdownStepIndexApplied: true,
          markdownTierApplied: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.item.count({ where }),
    ]);
    const stickerCtx = await loadStickerContext(organizer.id);

    res.json({
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        sku: i.sku,
        price: i.price,
        priceBeforeMarkdown: i.priceBeforeMarkdown,
        stickerPct: resolveStickerPct(i, stickerCtx),
        discountPct: actualDiscountPct(i.price, i.priceBeforeMarkdown),
        photoUrl: i.photoUrls?.[0] || null,
        saleId: i.saleId,
        saleTitle: i.sale?.title || null,
        markedDownAt: i.updatedAt,
      })),
      total,
      page: pageNum,
      limit: limitNum,
      hasMore: pageNum * limitNum < total,
    });
  } catch (error) {
    console.error('[getMarkdownRetagQueue] Error:', error);
    res.status(500).json({ message: 'Server error loading markdown re-tag queue' });
  }
};

// POST /api/items/:id/mark-retagged — single-item "I physically re-tagged this" action.
export const markItemRetagged = async (req: AuthRequest, res: Response) => {
  try {
    // 2026-09-29: organizer resolved by requireRetagAccess (owner at any tier, or TEAMS staff with permission).
    const acting = (req as ActingOrganizerRequest).actingOrganizer;
    if (!acting) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.', code: 'NOT_ORGANIZER' });
    }
    const organizer = { id: acting.organizerId };

    const { id } = req.params;
    const item = await prisma.item.findUnique({ where: { id }, select: { id: true, organizerId: true } });
    if (!item || item.organizerId !== organizer.id) {
      return res.status(404).json({ message: 'Item not found' });
    }

    await prisma.item.update({
      where: { id },
      data: { markdownPhysicallyAppliedAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[markItemRetagged] Error:', error);
    res.status(500).json({ message: 'Server error marking item as re-tagged' });
  }
};

// POST /api/items/mark-retagged/bulk — "mark all on this page as done". Capped and
// silently-skip-unowned, same pattern as getPackageEstimatesBatchHandler above.
const MARK_RETAGGED_BULK_MAX = 200;

export const markItemsRetaggedBulk = async (req: AuthRequest, res: Response) => {
  try {
    // 2026-09-29: organizer resolved by requireRetagAccess (owner at any tier, or TEAMS staff with permission).
    const acting = (req as ActingOrganizerRequest).actingOrganizer;
    if (!acting) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.', code: 'NOT_ORGANIZER' });
    }
    const organizer = { id: acting.organizerId };

    const { itemIds } = req.body as { itemIds?: unknown };
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'itemIds (a non-empty array of item IDs) is required.' });
    }
    if (itemIds.length > MARK_RETAGGED_BULK_MAX) {
      return res.status(400).json({
        message: `Too many item IDs -- ${itemIds.length} sent, ${MARK_RETAGGED_BULK_MAX} max per request.`,
      });
    }
    const idsToUse = itemIds.filter((i): i is string => typeof i === 'string' && i.length > 0);
    if (idsToUse.length === 0) {
      return res.status(400).json({ message: 'itemIds must contain at least one non-empty string ID.' });
    }

    // Ownership-scoped in the update itself -- any ID not belonging to this organizer is
    // simply not touched, same as getPackageEstimatesBatchHandler's skip-silently pattern.
    const result = await prisma.item.updateMany({
      where: { id: { in: idsToUse }, organizerId: organizer.id },
      data: { markdownPhysicallyAppliedAt: new Date() },
    });

    res.json({ success: true, updated: result.count });
  } catch (error) {
    console.error('[markItemsRetaggedBulk] Error:', error);
    res.status(500).json({ message: 'Server error marking items as re-tagged' });
  }
};

// GET /api/items/markdown-active — EVERY item of this organizer that is currently discounted by
// the markdown system (whether or not staff have re-tagged it yet), so staff always have a
// "what is on sale right now" list. Grouped/sorted by sticker % (deepest first). Capped at 2000.
export const getMarkdownActiveList = async (req: AuthRequest, res: Response) => {
  try {
    // 2026-09-29: organizer resolved by requireRetagAccess (owner at any tier, or TEAMS staff with permission).
    const acting = (req as ActingOrganizerRequest).actingOrganizer;
    if (!acting) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.', code: 'NOT_ORGANIZER' });
    }
    const organizer = { id: acting.organizerId };

    const rows = await prisma.item.findMany({
      where: {
        organizerId: organizer.id,
        markdownApplied: true,
        status: { in: ['AVAILABLE', 'RESERVED'] },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        sku: true,
        price: true,
        priceBeforeMarkdown: true,
        photoUrls: true,
        saleId: true,
        sale: { select: { title: true } },
        updatedAt: true,
        markdownStepIndexApplied: true,
        markdownTierApplied: true,
        markdownPhysicallyAppliedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 2000,
    });
    const stickerCtx = await loadStickerContext(organizer.id);

    const items = rows
      .map((i) => ({
        id: i.id,
        title: i.title,
        sku: i.sku,
        price: i.price,
        priceBeforeMarkdown: i.priceBeforeMarkdown,
        stickerPct: resolveStickerPct(i, stickerCtx),
        discountPct: actualDiscountPct(i.price, i.priceBeforeMarkdown),
        photoUrl: i.photoUrls?.[0] || null,
        saleId: i.saleId,
        saleTitle: i.sale?.title || null,
        markedDownAt: i.updatedAt,
        needsRetag: i.markdownPhysicallyAppliedAt == null,
      }))
      .sort((a, b) => (b.stickerPct ?? 0) - (a.stickerPct ?? 0) || a.title.localeCompare(b.title));

    const countsByPct: Record<string, number> = {};
    for (const i of items) {
      const k = String(i.stickerPct ?? 0);
      countsByPct[k] = (countsByPct[k] ?? 0) + 1;
    }

    res.json({ items, total: items.length, countsByPct });
  } catch (error) {
    console.error('[getMarkdownActiveList] Error:', error);
    res.status(500).json({ message: 'Server error loading discounted items' });
  }
};
