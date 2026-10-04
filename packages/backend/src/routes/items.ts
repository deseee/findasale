import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  getItemById,
  getItemForEdit,
  getItemMarketplaceStatusHandler, // 2026-10-04 (U3)
  acknowledgeItemMarketplacePush, // 2026-10-04 (U1)
  repushItemToEbay, // 2026-10-04 (U1)
  releaseEbayHold, // 2026-10-04 (U2)
  getItemsBySaleId,
  createItem,
  updateItem,
  markItemSoldOffPlatform,
  undoItemSoldOffPlatform,
  reopenEbayCancelledSale, // eBay sync hardening (2026-10-01)
  appendDescription,
  deleteItem,
  getBids,
  placeBid,
  importItemsFromCSV,
  bulkImportCSV,
  analyzeItemTags,
  addItemPhoto,
  removeItemPhoto,
  reorderItemPhotos,
  getItemDraftStatus,
  getDraftItemsBySaleId,
  publishItem,
  holdAnalysis,
  releaseAnalysis,
  getInspirationItems,
  getQrCode,
  recordQrScan,
  closeAuctionEndpoint,
  getRareFindsItems,
  applyOrganizerDiscount,
  removeOrganizerDiscount,
  getItemEbayComps,
  getCompSummary,
  getSimilarItems,
  getSitemapItems,
  getPackageEstimateHandler,
  getPackageEstimatesBatchHandler,
  getSuggestedShippingPriceHandler,
  getLiveShippingRateCheckHandler,
  getMarkdownRetagQueue,
  getMarkdownActiveList,
  markItemRetagged,
  markItemsRetaggedBulk,
} from '../controllers/itemController';
import { getComps, endEbayListingIfExists } from '../controllers/ebayController'; // Feature #229: eBay price comps; endEbayListingIfExists for withdraw-on-SOLD
import { markShopifyItemSold } from '../services/shopifyService';
import { withdrawDiscogsListingIfExists } from '../services/marketplace/discogsListingConnector';
import { prepareItemForDeletion, recordItemDeletion, type ItemDeletionSnapshot } from '../services/itemDeletionService'; // eBay sync hardening (2026-10-01): shared withdraw+snapshot+audit for bulk delete
import { withdrawReverbListingIfExists } from '../services/marketplace/reverbConnector'; // 2026-09-23: withdraw Reverb listing on SOLD, beside Discogs
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { organizerEditStampAlways } from '../utils/organizerEdit'; // item editor unification (B6): organizer bulk edits stamp Item.lastEditedAt
import { resolveItemOwnerOrganizer, type ItemOwnerInput, type OrganizerLookupClient } from '../utils/itemOwner'; // item editor unification (B1): default-deny owner resolution that also covers saleless inventory items
import { classifyEbayShipping } from '../utils/ebayShippingClassifier'; // P0 fix: ebayShippingClassification was never written anywhere
import { requireTier } from '../middleware/requireTier'; // #65: Tier gating for batch operations
import { requireRetagAccess } from '../utils/actingOrganizer'; // 2026-09-29: Markdown Re-tag routes serve owner (any tier) + TEAMS staff
import { accountAgeGate } from '../middleware/accountAgeGate'; // #93: Account age gate
import { bidRateLimiter } from '../middleware/bidRateLimiter'; // #95: Bidding velocity limits
import { itemEndpointLimiter, bulkItemsLimiter, ebayRepushLimiter } from '../middleware/rateLimiter'; // #111: Bot rate limiting, P0-S3: Bulk operations rate limiting
import { getSingleItemLabel } from '../controllers/labelController'; // W2
import { reanalyzeItemForOrganizer } from '../controllers/reanalyzeController'; // Re-analyze: re-run Smart tagging on stored photos
import { searchItemsHandler, getItemCategoriesHandler } from '../controllers/searchController'; // Sprint 4a
import { getItemValuation, generateItemValuation } from '../controllers/valuationController'; // Feature #30: AI Item Valuation
import { normalizeBulkCategoryValue } from '../utils/bulkCategory';

// Bulk operations validation schemas
const bulkItemsSchema = z.object({
  itemIds: z.array(z.string()).min(1, 'itemIds must be a non-empty array'),
  operation: z.string().min(1, 'operation is required'),
  value: z.any().optional(),
  dryRun: z.boolean().optional(),
});

const bulkPhotosSchema = z.object({
  itemIds: z.array(z.string()).min(1, 'itemIds must be a non-empty array'),
  operation: z.enum(['add', 'remove'], { errorMap: () => ({ message: 'operation must be "add" or "remove"' }) }),
  photoUrls: z.array(z.string()).min(1, 'photoUrls must be a non-empty array'),
  dryRun: z.boolean().optional(),
});

// Item editor unification (B1, 2026-10-04): default-deny per-item ownership for the bulk routes.
// The old check was `i.sale!.organizer.userId !== userId`, which throws a TypeError (500) for a saleless
// inventory item (sale is null) and so could never serve inventory items. This resolves every item through
// resolveItemOwnerOrganizer (sale items: sale.organizer must be the caller; inventory items: Organizer
// looked up by item.organizerId AND userId; anything unresolvable is NOT owned). Inventory lookups are cached
// per organizerId so a large bulk request makes at most one lookup per distinct organizer. A database error
// propagates to the route's catch block (500); it is never treated as ownership.
async function findUnownedItems<T extends ItemOwnerInput>(
  items: T[],
  userId: string,
  client: OrganizerLookupClient,
): Promise<T[]> {
  const inventoryOwnership = new Map<string, boolean>();
  const unowned: T[] = [];
  for (const item of items) {
    const isInventoryItem = !item.sale && !item.saleId && typeof item.organizerId === 'string' && item.organizerId.length > 0;
    if (isInventoryItem) {
      const key = item.organizerId as string;
      let owned = inventoryOwnership.get(key);
      if (owned === undefined) {
        owned = (await resolveItemOwnerOrganizer(item, userId, client)) !== null;
        inventoryOwnership.set(key, owned);
      }
      if (!owned) unowned.push(item);
      continue;
    }
    if ((await resolveItemOwnerOrganizer(item, userId, client)) === null) unowned.push(item);
  }
  return unowned;
}

// Bulk eBay category fields (review page sends category, ebayCategoryId and ebayCategoryName as three operations).
// Trimmed, length-limited and character-limited strings; the id is a numeric eBay leaf category id (1 to 10 digits),
// the name is free text without control characters.
function validateEbayCategoryBulkValue(
  operation: string,
  value: unknown,
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== 'string') {
    return { ok: false, message: `${operation} value must be a non-empty string.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: `${operation} value must be a non-empty string.` };
  }
  if (operation === 'ebayCategoryId') {
    // eBay leaf category ids are numeric, so anything but 1 to 10 digits is rejected.
    if (!/^\d{1,10}$/.test(trimmed)) {
      return { ok: false, message: 'ebayCategoryId must be 1 to 10 digits.' };
    }
  } else {
    // eslint-disable-next-line no-control-regex
    if (trimmed.length > 200 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      return { ok: false, message: 'ebayCategoryName must be 1 to 200 characters with no control characters.' };
    }
  }
  return { ok: true, value: trimmed };
}

// eBay rejects listings priced under $0.99, so a bulk price write must never push an eBay-listed item below it.
// Non-eBay items are unaffected. Callers pass the already-rounded new price.
const EBAY_MIN_PRICE = 0.99;
const EBAY_MIN_PRICE_REASON = 'eBay minimum price is $0.99';
function belowEbayFloor(
  item: { ebayOfferId?: string | null; ebayListingId?: string | null },
  newPrice: number,
): boolean {
  return !!(item.ebayOfferId || item.ebayListingId) && newPrice < EBAY_MIN_PRICE;
}

const highValueSchema = z.object({
  isHighValue: z.boolean().optional(),
  threshold: z.number().optional(),
});
// P2 #10: CURATED_TAGS — single source of truth (shared package not yet wired into backend tsconfig rootDir)
// NOTE: Once shared is properly set up as a workspace dep with path aliases, import from '@findasale/shared'
const CURATED_TAGS = [
  'mid-century-modern','art-deco','victorian','craftsman','industrial','farmhouse','bohemian',
  'danish-modern','scandinavian','atomic-age','hollywood-regency','arts-and-crafts','colonial',
  'transitional','contemporary','walnut','oak','teak','brass','cast-iron','wicker','leather',
  'ceramic','glass','chrome','hand-painted','signed','original','limited-edition','first-edition',
  'handmade','restored','vintage-1950s','vintage-1960s','vintage-1970s','collectible','antique',
  'sterling-silver','costume-jewelry','fine-art','folk-art','architectural-salvage','garden-decor',
  'holiday-decor','musical',
] as const;

const router = Router();
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_CSV_TYPES = ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain']

const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max per image
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Accepted: ${ALLOWED_IMAGE_TYPES.join(', ')}`))
    }
  },
})

const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max for CSV
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_CSV_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Accepted: ${ALLOWED_CSV_TYPES.join(', ')}`))
    }
  },
})

// #111: Apply item endpoint rate limiter to all GET operations
router.use(itemEndpointLimiter);

// SEO sitemap — MUST be before /:id to avoid param capture
// GET /api/items/sitemap: public data endpoint (published items in public sales, cursor paginated, cached).
// NOT a crawler sitemap: item pages stay noindex until ISR, so never link this into sitemap.xml. See getSitemapItems.
router.get('/sitemap', getSitemapItems);

// Sprint 4a: FTS search endpoints — MUST be declared before /:id to avoid param capture
router.get('/search', searchItemsHandler);           // GET /api/items/search?q=...
router.get('/categories', getItemCategoriesHandler); // GET /api/items/categories
router.get('/inspiration', getInspirationItems);     // GET /api/items/inspiration — Feature #78
router.get('/rare-finds', authenticate, getRareFindsItems); // GET /api/items/rare-finds — Hunt Pass exclusive

// Phase 2B: Rapidfire Mode — Organizer-only draft items for review page
// Must be before /:id to prevent 'drafts' being captured as an item ID
router.get('/drafts', authenticate, getDraftItemsBySaleId); // GET /api/items/drafts?saleId=...

// Phase 2B: Rapidfire Mode draft status polling + publish endpoints
// Declared before /:id to prevent param capture
router.get('/:itemId/draft-status', authenticate, getItemDraftStatus);
router.post('/:itemId/publish', authenticate, publishItem);
router.post('/:id/hold-analysis', authenticate, holdAnalysis);
router.post('/:id/release-analysis', authenticate, releaseAnalysis);

// Feature #229: eBay price comps
// Declared before /:id to prevent param capture
router.post('/:id/comps', authenticate, getComps);

// D-XP-003: Organizer-funded item discounts
// Declared before /:id to prevent param capture
router.post('/:itemId/organizer-discount', authenticate, applyOrganizerDiscount);
router.delete('/:itemId/organizer-discount', authenticate, removeOrganizerDiscount);

// Feature #338: Multi-source pricing comp summary
// Declared before /:id to prevent param capture
router.get('/:id/comp-summary', authenticate, getCompSummary);

// BUG 4: Similar items recommendation
// Declared before /:id to prevent param capture
router.get('/:id/similar', getSimilarItems);

// Phase 1: Batch Operations Toolkit — Status-safe validation + dry-run + tags operation
// Declared before /:id to prevent 'bulk' being captured as an item ID.
// Frontend (add-items.tsx) uses this for delete / status / category / price_adjust / isActive / price / tags.
// All operations verify organizer ownership + status-safe constraints before mutating.
// #65 Sprint 2: Gated to SIMPLE tier (paid) — publishing is a basic need for all organizers
// P0-S3: Apply bulk rate limiter (10 ops/hour per user)
router.post('/bulk', authenticate, requireTier('SIMPLE'), bulkItemsLimiter, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const hasOrganizerRole = authReq.user?.roles?.includes('ORGANIZER') || authReq.user?.role === 'ORGANIZER';
    if (!authReq.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const validatedData = bulkItemsSchema.parse(req.body);
    const { itemIds, operation, value, dryRun } = validatedData;

    const { prisma } = await import('../index');

    // Verify every item belongs to a sale owned by the requesting organizer.
    // Fetching all fields needed for status-safe validation.
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        status: true,
        price: true,
        category: true,
        tags: true,
        photoUrls: true,
        saleId: true,
        // Feature #309/#70 follow-up (2026-09-24): bulk consignor-attribution operation needs
        // both -- vendorBoothId to skip items already attributed to a vendor booth (mutually
        // exclusive per the schema's own comment on Item.vendorBoothId), consignorId only for
        // symmetry/debuggability (not currently branched on).
        consignorId: true,
        vendorBoothId: true,
        // Item editor unification (B1/B6 knock-on): organizerId resolves inventory (saleless) ownership;
        // ebayListingId/ebayOfferId pick the eBay-listed subset for bulk price writes.
        organizerId: true,
        ebayListingId: true,
        ebayOfferId: true,
        sale: { select: { organizer: { select: { id: true, userId: true, subscriptionTier: true, lat: true, lng: true } } } },
      },
    });

    // Default-deny ownership for EVERY returned item, sale items and saleless inventory items alike.
    const unauthorised = await findUnownedItems(items, authReq.user.id, prisma);
    if (unauthorised.length > 0) {
      // P0 Fix 1: Hide item existence — return 404 instead of 403 to prevent auth bypass
      return res.status(404).json({ message: 'One or more items not found.' });
    }

    // P2 Bug 4: User-friendly error message mapping for internal statuses
    const statusFriendlyNames: Record<string, string> = {
      PENDING_REVIEW: 'Item is pending review. You can modify it after review completes.',
      PUBLISHED: 'Item is published. Unpublish it first to make this change.',
      AVAILABLE: 'Item is available. Hold or reserve it before this action.',
      SOLD: 'Item has been sold and cannot be modified.',
      RESERVED: 'Item has been reserved. Release the hold first.',
      DRAFT: 'Item is a draft.',
    };

    // Status-safe operation matrix — per spec
    const statusSafeMatrix: Record<string, string[]> = {
      delete: ['AVAILABLE', 'DRAFT'],
      status: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED'],
      category: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
      ebayCategoryId: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
      ebayCategoryName: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
      price: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED'],
      price_adjust: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED'],
      isActive: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
      backgroundRemoved: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
      draftStatus: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
      tags: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
      // Feature #309/#70 follow-up (2026-09-24): consignor attribution should happen before a
      // sale, not be rewritten after the fact once payout math may already have run against
      // the old (or no) consignor -- SOLD is deliberately excluded, same reasoning as price/status.
      consignor: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'RESERVED'],
    };

    const safeStatuses = statusSafeMatrix[operation];
    const succeeded: string[] = [];
    const failed: Array<{ itemId: string; reason: string }> = [];
    const confirmedIds: string[] = [];
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    // Validate status-safe operations
    if (safeStatuses) {
      for (const item of items) {
        if (!safeStatuses.includes(item.status)) {
          const friendlyMsg = statusFriendlyNames[item.status] || `Status is ${item.status}`;
          failed.push({
            itemId: item.id,
            reason: friendlyMsg,
          });
        } else {
          confirmedIds.push(item.id);
        }
      }
    } else {
      confirmedIds.push(...items.map((i) => i.id));
    }

    // If all validation errors (no items passed validation), return 400
    if (confirmedIds.length === 0) {
      return res.status(400).json({
        message: `Cannot ${operation}: status constraints violated for all item(s)`,
        succeeded: [],
        failed,
      });
    }

    const confirmedItems = items.filter((i) => confirmedIds.includes(i.id));

    // Feature #309/#70 follow-up (2026-09-24): resolve + validate the target consignor once,
    // up front, so both the dry-run and mutation branches of the 'consignor' operation below
    // can reuse it. TEAMS-gated and scoped to this organizer's own workspace, same pattern as
    // itemController.ts's createItem/updateItem consignor resolution.
    let matchedConsignor: { id: string } | null = null;
    if (operation === 'consignor') {
      const rawConsignorId = value && typeof value === 'object' ? (value as any).consignorId : undefined;
      if (!rawConsignorId || typeof rawConsignorId !== 'string') {
        return res.status(400).json({ message: 'consignor operation requires { consignorId: string }' });
      }
      const organizerForConsignor = await prisma.organizer.findUnique({
        where: { userId: authReq.user.id },
        select: { id: true, subscriptionTier: true },
      });
      if (!organizerForConsignor || organizerForConsignor.subscriptionTier !== 'TEAMS') {
        return res.status(403).json({ message: 'TEAMS subscription required to attach a consignor.' });
      }
      const consignorWorkspace = await prisma.organizerWorkspace.findFirst({
        where: { ownerId: organizerForConsignor.id },
      });
      matchedConsignor = consignorWorkspace
        ? await prisma.consignor.findFirst({
            where: { id: rawConsignorId, workspaceId: consignorWorkspace.id },
            select: { id: true },
          })
        : null;
      if (!matchedConsignor) {
        return res.status(404).json({ message: 'Consignor not found.' });
      }
    }

    // Dry-run mode: query without mutating
    if (dryRun) {
      switch (operation) {
        case 'delete': {
          return res.json({
            message: 'Dry run: no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'delete',
          });
        }

        case 'status': {
          const allowed = ['AVAILABLE', 'SOLD', 'RESERVED'];
          if (!value || !allowed.includes(value as string)) {
            return res.status(400).json({ message: `status value must be one of: ${allowed.join(', ')}` });
          }
          for (const item of confirmedItems) {
            oldValues[item.id] = item.status;
            newValues[item.id] = value as string;
          }
          return res.json({
            message: 'Dry run: no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'status',
            oldValues,
            newValues,
          });
        }

        case 'category': {
          const checkedCategory = normalizeBulkCategoryValue(value);
          if (!checkedCategory.ok) {
            return res.status(400).json({ message: checkedCategory.message });
          }
          for (const item of confirmedItems) {
            oldValues[item.id] = item.status; // dry-run shows what field would change
            newValues[item.id] = checkedCategory.value;
          }
          return res.json({
            message: 'Dry run: no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'category',
            oldValues,
            newValues,
          });
        }

        case 'ebayCategoryId':
        case 'ebayCategoryName': {
          const checked = validateEbayCategoryBulkValue(operation, value);
          if (!checked.ok) {
            return res.status(400).json({ message: checked.message });
          }
          for (const item of confirmedItems) {
            newValues[item.id] = checked.value;
          }
          return res.json({
            message: 'Dry run: no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation,
            oldValues,
            newValues,
          });
        }

        case 'price_adjust': {
          const pct = typeof value === 'number' ? value : parseFloat(value as string);
          if (isNaN(pct) || pct === 0) {
            return res.status(400).json({ message: 'price_adjust value must be a non-zero number (percent).' });
          }
          const multiplier = 1 + pct / 100;
          const dryAdjustSkipped: Array<{ itemId: string; reason: string }> = [];
          for (const item of confirmedItems) {
            if (item.price !== null) {
              const dryNewPrice = Math.max(0, parseFloat((item.price * multiplier).toFixed(2)));
              if (belowEbayFloor(item, dryNewPrice)) {
                dryAdjustSkipped.push({ itemId: item.id, reason: EBAY_MIN_PRICE_REASON });
                continue;
              }
              oldValues[item.id] = item.price;
              newValues[item.id] = dryNewPrice;
            }
          }
          const dryAdjustSkippedIds = new Set(dryAdjustSkipped.map((s) => s.itemId));
          const dryAdjustAffected = confirmedIds.filter((id) => !dryAdjustSkippedIds.has(id));
          return res.json({
            message: 'Dry run: no changes applied',
            count: dryAdjustAffected.length,
            affectedIds: dryAdjustAffected,
            wouldChange: Object.keys(oldValues).length > 0,
            operation: 'price_adjust',
            oldValues,
            newValues,
            ...(dryAdjustSkipped.length > 0 && { skipped: dryAdjustSkipped }),
          });
        }

        case 'price': {
          const price = typeof value === 'number' ? value : parseFloat(value as string);
          if (isNaN(price) || price < 0) {
            return res.status(400).json({ message: 'price value must be a non-negative number.' });
          }
          const dryFinalPrice = Math.max(0, parseFloat(price.toFixed(2)));
          const dryPriceSkipped: Array<{ itemId: string; reason: string }> = [];
          const dryPriceAffected: string[] = [];
          for (const item of confirmedItems) {
            if (belowEbayFloor(item, dryFinalPrice)) {
              dryPriceSkipped.push({ itemId: item.id, reason: EBAY_MIN_PRICE_REASON });
              continue;
            }
            dryPriceAffected.push(item.id);
            oldValues[item.id] = item.price;
            newValues[item.id] = dryFinalPrice;
          }
          return res.json({
            message: 'Dry run: no changes applied',
            count: dryPriceAffected.length,
            affectedIds: dryPriceAffected,
            wouldChange: dryPriceAffected.length > 0,
            operation: 'price',
            oldValues,
            newValues,
            ...(dryPriceSkipped.length > 0 && { skipped: dryPriceSkipped }),
          });
        }

        case 'isActive': {
          const isActive = typeof value === 'boolean' ? value : value === 'true' || value === true;
          for (const item of confirmedItems) {
            oldValues[item.id] = false; // assume was hidden
            newValues[item.id] = isActive;
          }
          return res.json({
            message: 'Dry run: no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'isActive',
            oldValues,
            newValues,
          });
        }

        case 'backgroundRemoved': {
          const bgRemoved = typeof value === 'boolean' ? value : value === 'true' || value === true;
          for (const item of confirmedItems) {
            oldValues[item.id] = false;
            newValues[item.id] = bgRemoved;
          }
          return res.json({
            message: 'Dry run: no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'backgroundRemoved',
            oldValues,
            newValues,
          });
        }

        case 'draftStatus': {
          const allowed = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED'];
          if (!value || !allowed.includes(value as string)) {
            return res.status(400).json({ message: `draftStatus value must be one of: ${allowed.join(', ')}` });
          }
          return res.json({
            message: 'Dry run: no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'draftStatus',
          });
        }

        case 'tags': {
          if (!value || typeof value !== 'object' || !('action' in value) || !('tags' in value)) {
            return res.status(400).json({ message: 'tags operation requires { action: "add"|"remove", tags: string[] }' });
          }
          const { action, tags: tagList } = value as { action: string; tags: string[] };
          if (!Array.isArray(tagList) || !['add', 'remove'].includes(action)) {
            return res.status(400).json({ message: 'Invalid tags operation. Action must be "add" or "remove".' });
          }
          return res.json({
            message: 'Dry run: no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'tags',
            details: { action, tagsCount: tagList.length },
          });
        }

        case 'consignor': {
          const eligible = confirmedItems.filter((i) => !i.vendorBoothId);
          const skippedForVendorBooth = confirmedItems
            .filter((i) => !!i.vendorBoothId)
            .map((i) => ({ itemId: i.id, reason: 'Item is attributed to a vendor booth and cannot also be attached to a consignor.' }));
          for (const item of eligible) {
            oldValues[item.id] = item.consignorId;
            newValues[item.id] = matchedConsignor!.id;
          }
          return res.json({
            message: 'Dry run: no changes applied',
            count: eligible.length,
            affectedIds: eligible.map((i) => i.id),
            wouldChange: eligible.length > 0,
            operation: 'consignor',
            oldValues,
            newValues,
            ...(skippedForVendorBooth.length > 0 && { skipped: skippedForVendorBooth }),
          });
        }

        default:
          return res.status(400).json({ message: `Unknown operation: ${operation}` });
      }
    }

    // Actual mutations
    switch (operation) {
      case 'delete': {
        // eBay sync hardening (2026-10-01): bulk delete used to deleteMany with NO marketplace withdraw,
        // orphaning live eBay listings. Run the same per-item withdraw + PendingListingRemoval snapshot
        // the single delete uses (services/itemDeletionService.ts), in small parallel chunks, then
        // write one ItemDeletionLog row per item. Response shape is unchanged.
        const deletionSnapshots: ItemDeletionSnapshot[] = [];
        const DELETE_PREP_CHUNK = 5;
        for (let i = 0; i < confirmedItems.length; i += DELETE_PREP_CHUNK) {
          const chunk = confirmedItems.slice(i, i + DELETE_PREP_CHUNK);
          const chunkSnapshots = await Promise.all(
            chunk.map((it) => prepareItemForDeletion(it.id, { organizerId: it.sale?.organizer.id ?? it.organizerId ?? null }))
          );
          deletionSnapshots.push(...chunkSnapshots);
        }
        succeeded.push(...confirmedIds);
        await prisma.item.deleteMany({ where: { id: { in: confirmedIds } } });
        for (const snap of deletionSnapshots) {
          await recordItemDeletion(snap, 'bulk_delete', authReq.user.id);
        }
        const deleteStatus = failed.length > 0 ? 207 : 200;
        return res.status(deleteStatus).json({
          message: `Deleted ${confirmedIds.length} item(s).`,
          succeeded,
          failed,
          operation: 'delete',
        });
      }

      case 'status': {
        const allowed = ['AVAILABLE', 'SOLD', 'RESERVED'];
        if (!value || !allowed.includes(value as string)) {
          return res.status(400).json({ message: `status value must be one of: ${allowed.join(', ')}` });
        }
        succeeded.push(...confirmedIds);
        for (const item of confirmedItems) {
          oldValues[item.id] = item.status;
          newValues[item.id] = value as string;
        }
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { status: value as string, ...organizerEditStampAlways() },
        });

        // Withdraw from eBay for any items that were AVAILABLE → SOLD and have an eBay offer (fire-and-forget)
        if (value === 'SOLD') {
          for (const item of confirmedItems) {
            // 2026-09-23: no longer gated on ebayOfferId. endEbayListingIfExists self-guards and
            // also recovers a live listing whose ebayOfferId went stale (SKU lookup, then the
            // Trading API EndFixedPriceItem fallback on ebayListingId). The old gate skipped
            // exactly those items, the same stale-offer case S1157 fixed on the single-item path.
            endEbayListingIfExists(item.id).catch(err =>
              console.warn(`[eBay] bulk SOLD withdraw failed for item ${item.id}:`, err.message)
            );
            markShopifyItemSold(item.id).catch(err =>
              console.warn(`[Shopify] bulk SOLD mark failed for item ${item.id}:`, err.message)
            );
            withdrawDiscogsListingIfExists(item.id).catch(err =>
              console.warn(`[Discogs] bulk SOLD withdraw failed for item ${item.id}:`, err.message)
            );
            withdrawReverbListingIfExists(item.id).catch(err =>
              console.warn(`[Reverb] bulk SOLD withdraw failed for item ${item.id}:`, err.message)
            );
            notifyFacebookExportedItemSold(item.id).catch(err =>
              console.warn(`[FB Nudge] failed for item ${item.id}:`, err.message)
            );
          }
        }

        const statusCode = failed.length > 0 ? 207 : 200;
        return res.status(statusCode).json({
          message: `Updated status to ${value} for ${confirmedIds.length} item(s).`,
          succeeded,
          failed,
          operation: 'status',
        });
      }

      case 'category': {
        // Accepts legacy lowercase names (canonicalized) and eBay L1 names from the Review picker (casing kept).
        const checkedCategory = normalizeBulkCategoryValue(value);
        if (!checkedCategory.ok) {
          return res.status(400).json({ message: checkedCategory.message });
        }
        const category = checkedCategory.value;
        succeeded.push(...confirmedIds);
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { category, ...organizerEditStampAlways() },
        });
        const catStatus = failed.length > 0 ? 207 : 200;
        return res.status(catStatus).json({
          message: `Updated category for ${confirmedIds.length} item(s).`,
          succeeded,
          failed,
          operation: 'category',
        });
      }

      // Item editor unification (review defect #3): the review page's bulk category picker also sends the
      // chosen eBay leaf category as ebayCategoryId and ebayCategoryName operations. They were unhandled
      // (400 Unknown operation). Authorized ids only (confirmedIds), validated, trimmed, stamped.
      case 'ebayCategoryId':
      case 'ebayCategoryName': {
        const checked = validateEbayCategoryBulkValue(operation, value);
        if (!checked.ok) {
          return res.status(400).json({ message: checked.message });
        }
        succeeded.push(...confirmedIds);
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data:
            operation === 'ebayCategoryId'
              ? { ebayCategoryId: checked.value, ...organizerEditStampAlways() }
              : { ebayCategoryName: checked.value, ...organizerEditStampAlways() },
        });
        const ebayCatStatus = failed.length > 0 ? 207 : 200;
        return res.status(ebayCatStatus).json({
          message: `Updated ${operation === 'ebayCategoryId' ? 'eBay category' : 'eBay category name'} for ${confirmedIds.length} item(s).`,
          succeeded,
          failed,
          operation,
        });
      }

      case 'consignor': {
        const eligible = confirmedItems.filter((i) => !i.vendorBoothId);
        const skipped = confirmedItems
          .filter((i) => !!i.vendorBoothId)
          .map((i) => ({ itemId: i.id, reason: 'Item is attributed to a vendor booth and cannot also be attached to a consignor.' }));
        succeeded.push(...eligible.map((i) => i.id));
        for (const item of eligible) {
          oldValues[item.id] = item.consignorId;
          newValues[item.id] = matchedConsignor!.id;
        }
        if (eligible.length > 0) {
          await prisma.item.updateMany({
            where: { id: { in: eligible.map((i) => i.id) } },
            data: { consignorId: matchedConsignor!.id, ...organizerEditStampAlways() },
          });
        }
        const consignorStatus = (failed.length > 0 || skipped.length > 0) ? 207 : 200;
        return res.status(consignorStatus).json({
          message: `Attached ${eligible.length} item(s) to this consignor.`,
          succeeded,
          failed,
          operation: 'consignor',
          ...(skipped.length > 0 && { skipped }),
        });
      }

      case 'price_adjust': {
        const pct = typeof value === 'number' ? value : parseFloat(value as string);
        if (isNaN(pct) || pct === 0) {
          return res.status(400).json({ message: 'price_adjust value must be a non-zero number (percent).' });
        }
        const multiplier = 1 + pct / 100;

        const validItems = confirmedItems.filter((i) => i.price !== null);
        const skipped: Array<{ itemId: string; reason: string }> = confirmedItems
          .filter((i) => i.price === null)
          .map((i) => ({ itemId: i.id, reason: 'price not set' }));

        // eBay price floor: an eBay-listed item whose new price would be under $0.99 is not written, it is
        // reported in `skipped` (the add-items page already toasts the first skip reason).
        const adjustWritable: typeof validItems = [];
        for (const i of validItems) {
          const candidatePrice = Math.max(0, parseFloat((i.price! * multiplier).toFixed(2)));
          if (belowEbayFloor(i, candidatePrice)) {
            skipped.push({ itemId: i.id, reason: EBAY_MIN_PRICE_REASON });
          } else {
            adjustWritable.push(i);
          }
        }

        succeeded.push(...adjustWritable.map(i => i.id));
        // Item editor unification (B6 knock-on): a bulk price write must carry priceUpdatedAt (the provenance
        // stamp ebayListingSyncCron's pull-sync clobber guard reads) and, for eBay-listed items whose price
        // really changed, ebaySyncState PENDING, mirroring itemController.updateItem on a real price change.
        const adjustNow = new Date();
        const adjustChangedEbayIds: string[] = [];
        const updates = adjustWritable.map((i) => {
          const newPrice = Math.max(0, parseFloat((i.price! * multiplier).toFixed(2)));
          const priceChanged = Math.abs(newPrice - i.price!) >= 0.005;
          if (priceChanged && (i.ebayOfferId || i.ebayListingId)) adjustChangedEbayIds.push(i.id);
          oldValues[i.id] = i.price;
          newValues[i.id] = newPrice;
          return prisma.item.update({
            where: { id: i.id },
            data: {
              price: newPrice,
              ...(priceChanged ? { priceUpdatedAt: adjustNow } : {}),
              ...organizerEditStampAlways(adjustNow),
            },
          });
        });
        await Promise.all(updates);
        if (adjustChangedEbayIds.length > 0) {
          await prisma.item.updateMany({
            where: { id: { in: adjustChangedEbayIds } },
            data: { ebaySyncState: 'PENDING', ebaySyncAttempts: 0, ebaySyncFailureReason: null },
          });
        }
        const adjStatus = (failed.length > 0 || skipped.length > 0) ? 207 : 200;
        return res.status(adjStatus).json({
          message: `Adjusted prices for ${updates.length} item(s) by ${pct}%.`,
          succeeded,
          failed,
          operation: 'price_adjust',
          ...(skipped.length > 0 && { skipped }),
        });
      }

      case 'isActive': {
        const isActive = typeof value === 'boolean' ? value : value === 'true' || value === true;
        succeeded.push(...confirmedIds);
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { isActive, ...organizerEditStampAlways() },
        });
        const action = isActive ? 'activated' : 'hidden';
        const activeStatus = failed.length > 0 ? 207 : 200;
        return res.status(activeStatus).json({
          message: `${action.charAt(0).toUpperCase() + action.slice(1)} ${confirmedIds.length} item(s).`,
          succeeded,
          failed,
          operation: 'isActive',
        });
      }

      case 'price': {
        const price = typeof value === 'number' ? value : parseFloat(value as string);
        if (isNaN(price) || price < 0) {
          return res.status(400).json({ message: 'price value must be a non-negative number.' });
        }
        const finalPrice = Math.max(0, parseFloat(price.toFixed(2)));
        // eBay price floor: eBay-listed items that would drop under $0.99 are not written, they are reported in
        // `skipped`. Everything below works on the writable subset only.
        const priceSkipped: Array<{ itemId: string; reason: string }> = [];
        const priceWritable = confirmedItems.filter((i) => {
          if (belowEbayFloor(i, finalPrice)) {
            priceSkipped.push({ itemId: i.id, reason: EBAY_MIN_PRICE_REASON });
            return false;
          }
          return true;
        });
        const priceWritableIds = priceWritable.map((i) => i.id);
        succeeded.push(...priceWritableIds);
        for (const item of priceWritable) {
          oldValues[item.id] = item.price;
          newValues[item.id] = finalPrice;
        }
        // Item editor unification (B6 knock-on): priceUpdatedAt only for items whose price really changes
        // (a same-price bulk set must not reset the provenance stamp), PENDING only for the eBay-listed
        // subset of those, via a second updateMany scoped to the already-authorized ids.
        const priceNow = new Date();
        const changedPriceIds = priceWritable
          .filter((i) => i.price === null || Math.abs(i.price - finalPrice) >= 0.005)
          .map((i) => i.id);
        const unchangedPriceIds = priceWritableIds.filter((id) => !changedPriceIds.includes(id));
        if (changedPriceIds.length > 0) {
          await prisma.item.updateMany({
            where: { id: { in: changedPriceIds } },
            data: { price: finalPrice, priceUpdatedAt: priceNow, ...organizerEditStampAlways(priceNow) },
          });
        }
        if (unchangedPriceIds.length > 0) {
          await prisma.item.updateMany({
            where: { id: { in: unchangedPriceIds } },
            data: { price: finalPrice, ...organizerEditStampAlways(priceNow) },
          });
        }
        const changedEbayPriceIds = priceWritable
          .filter((i) => changedPriceIds.includes(i.id) && (i.ebayOfferId || i.ebayListingId))
          .map((i) => i.id);
        if (changedEbayPriceIds.length > 0) {
          await prisma.item.updateMany({
            where: { id: { in: changedEbayPriceIds } },
            data: { ebaySyncState: 'PENDING', ebaySyncAttempts: 0, ebaySyncFailureReason: null },
          });
        }
        const priceStatus = (failed.length > 0 || priceSkipped.length > 0) ? 207 : 200;
        return res.status(priceStatus).json({
          message: `Updated price to $${finalPrice.toFixed(2)} for ${priceWritableIds.length} item(s).`,
          succeeded,
          failed,
          operation: 'price',
          ...(priceSkipped.length > 0 && { skipped: priceSkipped }),
        });
      }

      case 'backgroundRemoved': {
        const bgRemoved = typeof value === 'boolean' ? value : value === 'true' || value === true;
        succeeded.push(...confirmedIds);
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { backgroundRemoved: bgRemoved, ...organizerEditStampAlways() },
        });
        const action = bgRemoved ? 'applied background removal to' : 'removed background removal from';
        const bgStatus = failed.length > 0 ? 207 : 200;
        return res.status(bgStatus).json({
          message: `${action} ${confirmedIds.length} item(s).`,
          succeeded,
          failed,
          operation: 'backgroundRemoved',
        });
      }

      case 'draftStatus': {
        const allowed = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED'];
        if (!value || !allowed.includes(value as string)) {
          return res.status(400).json({ message: `draftStatus value must be one of: ${allowed.join(', ')}` });
        }
        succeeded.push(...confirmedIds);
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { draftStatus: value as string, ...organizerEditStampAlways() },
        });
        const dsStatus = failed.length > 0 ? 207 : 200;
        return res.status(dsStatus).json({
          message: `Updated draftStatus to ${value} for ${confirmedIds.length} item(s).`,
          succeeded,
          failed,
          operation: 'draftStatus',
        });
      }

      case 'tags': {
        // Phase 1: Bulk tag operations (add/remove)
        if (!value || typeof value !== 'object' || !('action' in value) || !('tags' in value)) {
          return res.status(400).json({ message: 'tags operation requires { action: "add"|"remove", tags: string[] }' });
        }
        const { action, tags: tagList } = value as { action: string; tags: string[] };
        if (!Array.isArray(tagList) || !['add', 'remove'].includes(action)) {
          return res.status(400).json({ message: 'Invalid tags operation. Action must be "add" or "remove".' });
        }

        // P2 #10: Use shared CURATED_TAGS from tagVocabulary
        const invalidTags = tagList.filter((t) => !CURATED_TAGS.includes(t.toLowerCase() as any));
        if (invalidTags.length > 0) {
          return res.status(400).json({
            message: `Invalid tag(s): ${invalidTags.join(', ')}. Use only curated tags.`,
          });
        }

        // Normalize tags to lowercase
        const normalizedTags = tagList.map((t) => t.toLowerCase());

        // Apply tags operation
        succeeded.push(...confirmedIds);
        for (const item of confirmedItems) {
          let updatedTags = [...item.tags];
          if (action === 'add') {
            for (const tag of normalizedTags) {
              if (!updatedTags.includes(tag)) {
                updatedTags.push(tag);
              }
            }
          } else {
            // remove
            updatedTags = updatedTags.filter((t) => !normalizedTags.includes(t));
          }
          oldValues[item.id] = item.tags;
          newValues[item.id] = updatedTags;
          await prisma.item.update({
            where: { id: item.id },
            data: {
              tags: updatedTags,
              // P0 fix: keep ebayShippingClassification in sync whenever bulk tag ops change tags.
              ebayShippingClassification: classifyEbayShipping(item.category, updatedTags),
              ...organizerEditStampAlways(),
            },
          });
        }

        const tagsStatus = failed.length > 0 ? 207 : 200;
        return res.status(tagsStatus).json({
          message: `${action === 'add' ? 'Added' : 'Removed'} tags for ${confirmedIds.length} item(s).`,
          succeeded,
          failed,
          operation: 'tags',
        });
      }

      default:
        return res.status(400).json({ message: `Unknown operation: ${operation}` });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Bulk item operation error:', error);
    res.status(500).json({ message: 'Server error during bulk operation.' });
  }
});

// Phase 2: Batch Photos API — add/remove photos across multiple items
router.post('/bulk/photos', authenticate, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const hasOrganizerRole = authReq.user?.roles?.includes('ORGANIZER') || authReq.user?.role === 'ORGANIZER';
    if (!authReq.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const validatedData = bulkPhotosSchema.parse(req.body);
    const { itemIds, operation, photoUrls, dryRun } = validatedData;

    // Phase 2 constraints per spec
    if (itemIds.length > 50) {
      return res.status(400).json({ message: 'Max 50 items per request.' });
    }
    if (photoUrls.length > 5) {
      return res.status(400).json({ message: 'Max 5 photos per request.' });
    }

    if (!['add', 'remove'].includes(operation)) {
      return res.status(400).json({ message: 'operation must be "add" or "remove".' });
    }

    const { prisma } = await import('../index');

    // Verify ownership
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        photoUrls: true,
        saleId: true,
        organizerId: true,
        sale: { select: { organizer: { select: { id: true, userId: true, subscriptionTier: true, lat: true, lng: true } } } },
      },
    });

    // Default-deny ownership for every returned item (sale and saleless inventory items), see findUnownedItems.
    const unauthorised = await findUnownedItems(items, authReq.user.id, prisma);
    if (unauthorised.length > 0) {
      // P0 Fix 1: Hide item existence — return 404 instead of 403 to prevent auth bypass
      return res.status(404).json({ message: 'One or more items not found.' });
    }

    // Dry-run mode
    if (dryRun) {
      return res.json({
        message: 'Dry run: no changes applied',
        count: items.length,
        affectedIds: items.map((i) => i.id),
        wouldChange: true,
        operation,
        photosCount: photoUrls.length,
      });
    }

    // P1-D: Apply mutations and track skipped items
    const confirmedIds: string[] = [];
    const skipped: Array<{ itemId: string; reason: string }> = [];
    let updatedCount = 0;

    if (operation === 'add') {
      for (const item of items) {
        // Check max 5 photos per item constraint
        const currentCount = item.photoUrls.length;
        const newPhotos = photoUrls.filter((url) => !item.photoUrls.includes(url));

        if (currentCount + newPhotos.length > 5) {
          skipped.push({
            itemId: item.id,
            reason: 'would_exceed_photo_limit'
          });
          continue; // Skip items that would exceed 5 photos
        }

        if (newPhotos.length > 0) {
          await prisma.item.update({
            where: { id: item.id },
            data: {
              photoUrls: [...item.photoUrls, ...newPhotos],
              ...organizerEditStampAlways(),
            },
          });
          confirmedIds.push(item.id);
          updatedCount++;
        }
      }
      const photoStatus = (skipped.length > 0 || confirmedIds.length === 0) ? 207 : 200;
      return res.status(photoStatus).json({
        message: `Added photo(s) to ${updatedCount} item(s)`,
        succeeded: confirmedIds,
        updated: updatedCount,
        operation: 'add',
        ...(skipped.length > 0 && { skipped }),
      });
    } else {
      // remove
      for (const item of items) {
        const filtered = item.photoUrls.filter((url) => !photoUrls.includes(url));
        if (filtered.length !== item.photoUrls.length) {
          // At least one URL was removed
          await prisma.item.update({
            where: { id: item.id },
            data: {
              photoUrls: filtered,
              ...organizerEditStampAlways(),
            },
          });
          confirmedIds.push(item.id);
          updatedCount++;
        }
      }
      return res.status(skipped.length > 0 ? 207 : 200).json({
        message: `Removed photo(s) from ${updatedCount} item(s)`,
        succeeded: confirmedIds,
        updated: updatedCount,
        operation: 'remove',
        ...(skipped.length > 0 && { skipped }),
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Bulk photos operation error:', error);
    res.status(500).json({ message: 'Server error during bulk photos operation.' });
  }
});

// BUG 3 FIX: Label route must come BEFORE generic /:id route to avoid being shadowed
// W2: Label PDF
router.get('/:id/label', authenticate, getSingleItemLabel);

// S-IDOR-edit-item fix: organizer-only, strict-ownership fetch for the edit-item page.
// Must stay separate from the generic GET /:id below (which is intentionally public/
// permissive for the shopper-facing item page) — see getItemForEdit for full rationale.
router.get('/:id/edit', authenticate, getItemForEdit);

// Item editor unification Wave 2 (2026-10-04): marketplace status and eBay push controls. Each is a two-segment path
// (/:id/<name>), so none can be shadowed by the single-segment GET/PUT '/:id' routes below; they sit here, beside
// /:id/edit and before them, to keep every item-scoped route in one place. Owner-resolved inside the handlers
// (404 for a missing or not-yours item), inventory items included.
router.get('/:id/marketplace-status', authenticate, getItemMarketplaceStatusHandler); // U3: per-platform listing status + last eBay push outcome
router.post('/:id/marketplace-push/ack', authenticate, acknowledgeItemMarketplacePush); // U1: dismiss the caller's own failed eBay push rows (clears the list badge)
router.post('/:id/ebay-repush', authenticate, ebayRepushLimiter, repushItemToEbay); // U1/U2: explicit "Update eBay now" (REPUSH) or retry ({ retry: true })
router.post('/:id/ebay-hold/release', authenticate, releaseEbayHold); // U2: "Resume syncing", clears the eBay hold without pushing

// Physical Markdown Alert List (2026-09-25): must be registered BEFORE the generic
// GET '/:id' route immediately below, or Express would treat "markdown-retag-queue" as
// an :id value and shadow this route (same ordering hazard the /:id/label comment above
// already flags for this file).
// 2026-09-29 (Patrick D3/D6): the Re-tag list is FREE for the organizer at every tier (the free-tier
// 50%/75% markdownCron feeds it). Staff (team members) may use it only while the owner is on TEAMS and
// only with the mark_retagged permission (view_inventory also lets them read the two lists).
// requireRetagAccess resolves the acting organizer and attaches req.actingOrganizer.
router.get('/markdown-retag-queue', authenticate, requireRetagAccess('view'), getMarkdownRetagQueue);
router.get('/markdown-active', authenticate, requireRetagAccess('view'), getMarkdownActiveList);
router.post('/mark-retagged/bulk', authenticate, requireRetagAccess('mark'), markItemsRetaggedBulk);
router.post('/:id/mark-retagged', authenticate, requireRetagAccess('mark'), markItemRetagged);

router.get('/:id', optionalAuthenticate, getItemById);
router.get('/', getItemsBySaleId);
router.post('/', authenticate, uploadImages.array('images', 5), createItem);
router.put('/:id', authenticate, updateItem);
router.post('/:id/mark-sold-off-platform', authenticate, markItemSoldOffPlatform); // BYOR (2026-09-06): mark a plain AVAILABLE item sold using the organizer's own payment method
router.post('/:id/reopen-ebay-cancelled-sale', authenticate, reopenEbayCancelledSale); // eBay sync hardening (2026-10-01): reopen an item whose eBay sale was cancelled/refunded (verified against eBay; 409 otherwise)
router.post('/:id/undo-sold-off-platform', authenticate, undoItemSoldOffPlatform); // BYOR (2026-09-07): undo a mark-sold-off-platform action, scoped to un-invoiced OFF_PLATFORM_MANUAL items only
// Item Description Authoring Contract (2026-05-12): voice + auto append with merge
router.post('/:id/description/append', authenticate, appendDescription);
router.delete('/:id', authenticate, deleteItem);
router.get('/:id/bids', optionalAuthenticate, getBids);
router.post('/:id/bids', authenticate, bidRateLimiter, accountAgeGate, placeBid);
router.get('/:id/ebay-comps', getItemEbayComps);
router.post('/:id/analyze', authenticate, analyzeItemTags);
// Re-analyze: organizer re-runs the Smart tagging pipeline on the item's stored photos (no re-upload), updates suggested fields in place
router.post('/:id/reanalyze', authenticate, reanalyzeItemForOrganizer);
// Package-estimation isolation ADR (2026-08-05): read-only, non-persisting package
// weight/dims estimate endpoints backing the "Get AI estimate" buttons on edit-item
// and review.tsx. Never write packageWeightOz/dims to the Item row.
router.get('/:id/package-estimate', authenticate, getPackageEstimateHandler);
router.post('/package-estimates', authenticate, getPackageEstimatesBatchHandler);
router.get('/:id/suggested-shipping-price', authenticate, getSuggestedShippingPriceHandler); // ADR-104 Sec3: native-checkout suggested shipping price
router.get('/:id/live-shipping-check', authenticate, getLiveShippingRateCheckHandler); // ADR-115 Phase 3: one real Shippo quote to sanity-check the estimate above
router.post('/:itemId/close-auction', authenticate, closeAuctionEndpoint);

// Phase 16: Photo management
router.post('/:id/photos', authenticate, addItemPhoto);
router.delete('/:id/photos/:photoIndex', authenticate, removeItemPhoto);
router.patch('/:id/photos/reorder', authenticate, reorderItemPhotos);

// CSV import endpoint (legacy — kept for backward compat)
// P0-S3: Apply bulk rate limiter (10 ops/hour per user) to CSV import
router.post('/:saleId/import-items', authenticate, bulkItemsLimiter, uploadCsv.single('csv'), importItemsFromCSV);

// Feature #395: Bulk Import Tool (Phase 1) — two-step preview+confirm with column mapping
// POST /api/items/:saleId/bulk-import           → preview (first 5 rows + detected column mapping)
// POST /api/items/:saleId/bulk-import?confirm=true → actual import (createMany, draftStatus=DRAFT, max 200)
router.post('/:saleId/bulk-import', authenticate, bulkItemsLimiter, uploadCsv.single('file'), bulkImportCSV);

// CD2 Phase 3 route retired 2026-08-24 -- superseded by POST /api/pricing/estimate
// (packages/backend/src/routes/pricing.ts), which both frontend call sites now use.
// The category-only/SOLD/take-5 comp query that lived here moved into
// services/pricingEngine/adapters/findasaleInternal.ts as a proper weighted tier-2
// pricing source instead of being duplicated. suggestPrice() in cloudAIService.ts is
// UNCHANGED and still used directly by jobs/processRapidDraft.ts's synchronous photo-scan
// refinement step -- do not remove that function or its import there.

// Feature #30: AI Item Valuation endpoints
// GET /api/items/:itemId/valuation — Get valuation for an item (PRO gated)
router.get('/:itemId/valuation', authenticate, requireTier('PRO'), getItemValuation);

// POST /api/items/:itemId/valuation/generate — Generate fresh valuation (PRO gated)
router.post('/:itemId/valuation/generate', authenticate, requireTier('PRO'), generateItemValuation);

// Feature #85: Treasure Hunt QR endpoints
// GET /api/items/:itemId/qr — Generate QR code for item (increments qrScanCount)
router.get('/:itemId/qr', getQrCode);

// GET /api/items/:itemId/qr/scan — Record QR scan and award badge + XP (authenticated)
router.get('/:itemId/qr/scan', authenticate, recordQrScan);

// Feature #228: High-Value Item Tracker
// PATCH /api/items/:itemId/high-value — toggle high-value flag
// Feature #371: Updated to handle auto-flag locking and source tracking
router.patch('/:itemId/high-value', authenticate, async (req: AuthRequest, res) => {
  try {
    const { itemId } = req.params;
    const validatedData = highValueSchema.parse(req.body);
    const { isHighValue, threshold } = validatedData;

    // Verify organizer owns this item
    const item = await prisma.item.findFirst({
      where: { id: itemId, sale: { organizer: { userId: req.user?.id } } },
      select: { id: true, isHighValue: true, highValueSource: true },
    });
    if (!item) return res.status(404).json({ message: 'Item not found or access denied.' });

    const updateData: any = {
      isHighValue: isHighValue ?? false,
      highValueThreshold: threshold != null ? threshold : undefined,
    };

    // Feature #371: Handle manual override logic
    if (isHighValue === false) {
      // Organizer said "no" — lock it to prevent auto-flagging
      updateData.isHighValueLocked = true;
      updateData.highValueSource = 'MANUAL';
      updateData.highValueFlaggedAt = null;
    } else if (isHighValue === true) {
      // Organizer manually flagged it
      updateData.highValueSource = 'MANUAL';
      updateData.highValueFlaggedAt = new Date();
      updateData.isHighValueLocked = false;
    }

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: updateData,
      select: {
        id: true,
        isHighValue: true,
        highValueThreshold: true,
        highValueSource: true,
        highValueFlaggedAt: true,
        isHighValueLocked: true,
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('high-value toggle error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
