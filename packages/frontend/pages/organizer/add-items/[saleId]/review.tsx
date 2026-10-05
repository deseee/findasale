/**
 * Smart Review Queue (Brief D: Session 5 redesign)
 *
 * Organizer reviews AI-suggested fields for PENDING_REVIEW items before publishing.
 * Design tokens from fs-shared.jsx / FS_TONES light palette.
 *
 * KEY RULE: aiSuggestedPrice (sourced from ItemCompLookup via PriceSuggestion component)
 * is NEVER pre-filled into the price input. It is shown ONLY as placeholder text.
 * Organizer must type their own price. This prevents the recurring auto-fill bug.
 *
 * 2026-10-03: "tap to apply" (Patrick-approved) does NOT relax that rule. A suggestion is
 * only ever applied when the organizer taps "Use $X" (PriceSuggestion card, or the
 * suggestedPrices prompt under the price field after a Condition Grade click). Clicking
 * a Condition Grade never writes the price; it only offers a suggestion.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import { useEbayConnection } from '../../../../lib/useEbayConnection';
import { useOrganizerTier } from '../../../../hooks/useOrganizerTier';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../../components/Skeleton';
import NearMissNudge from '../../../../components/NearMissNudge'; // Feature 61
import ItemPhotoManager from '../../../../components/ItemPhotoManager'; // Phase 16
import PriceSuggestion from '../../../../components/PriceSuggestion'; // CD2 Phase 3
import PriceResearchPanel from '../../../../components/PriceResearchPanel';
import PricingSignalBanners from '../../../../components/PricingSignalBanners';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { CURATED_TAGS } from '../../../../../shared/src'; // Sprint 1: Listing Factory tag vocabulary
import RapidCapture, { RapidItem } from '../../../../components/RapidCapture';
import EbayCategoryPicker from '../../../../components/EbayCategoryPicker';
import { CATEGORIES, CONDITIONS, CONDITION_LABELS, CONDITION_MAP, formatCondition } from '../../../../lib/itemConstants';
import { decodeHtmlEntities } from '../../../../utils/textUtils';
import { computeItemReadiness } from '../../../../lib/itemReadiness';
import { normalizeCondition as normalizeConditionValue } from '../../../../lib/conditionModel';
import ItemFormSheet from '../../../../components/itemForm/ItemFormSheet';
import CardConditionConfirm from '../../../../components/cardRecord/CardConditionConfirm'; // trading card condition (NM/LP/MP/HP/DMG), one-tap confirm
import {
  createAutosaveController,
  buildAutosavePayload,
  autosaveStatusText,
  isAutosaveField,
  type AutosaveController,
  type AutosaveStatus,
} from '../../../../lib/reviewAutosave';
import {
  mergeEditStateFromServer,
  typedPriceDiffersFromSaved,
} from '../../../../lib/reviewSheetSync';
import { gradePickerFor } from '../../../../lib/reviewGradePicker';
import {
  buildGradeEstimateBody,
  parseGradeEstimate,
  gradeSuggestionLine,
  type GradeSuggestion,
} from '../../../../lib/gradeSuggestion';
import {
  reseedPriceInputs,
  bulkPriceWrittenIds,
  bulkPriceSkippedMessage,
  typedPriceForReadiness,
} from '../../../../lib/reviewPriceInputs';
import {
  planBulkCategoryOps,
  bulkCategoryFailureMessage,
  bulkCategoryPartialItemsMessage,
  type BulkCategoryOperation,
} from '../../../../lib/reviewBulkCategory';
import {
  toggleSelection,
  selectAllVisible,
  pruneSelection,
  allVisibleSelected,
  selectedCountText,
  itemsCountText,
  parseBulkPriceInput,
  bulkPriceButtonText,
  bulkCategoryButtonText,
} from '../../../../lib/reviewSelection';

type AspectRatio = '4:3' | '1:1' | '16:9';

interface ItemEditState {
  title: string;
  description: string;
  price: number;
  category: string;
  ebayCategoryId?: string;
  ebayCategoryName?: string;
  condition: string;
  conditionGrade?: string; // #64: S | A | B | C | D
  quantity: number;
  listingType: string; // FIXED | AUCTION | REVERSE_AUCTION
  reverseDailyDrop?: number; // cents per day for REVERSE_AUCTION
  reverseFloorPrice?: number; // minimum price in cents for REVERSE_AUCTION
  aspectRatio: AspectRatio;
  brightness: number;
  contrast: number;
  backgroundRemoved: boolean;
  autoEnhanced: boolean;
  tags?: string[];
  // Bug 6: eBay shipping fields
  packageWeightOz?: number;
  packageLengthIn?: number;
  packageWidthIn?: number;
  packageHeightIn?: number;
  ebayShippingOverride?: string | null;
  // eBay product identifiers
  brand?: string;
  mpn?: string;
  upc?: string;
}

interface HealthBreakdown {
  photo: number;
  title: number;
  description: number;
  tags: number;
  price: number;
  conditionGrade?: number; // #64
  category?: number;
}

interface HealthScore {
  score: number;
  grade: 'blocked' | 'nudge' | 'clear';
  breakdown: HealthBreakdown;
}

interface Item {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  category: string | null;
  ebayCategoryId?: string | null;
  ebayCategoryName?: string | null;
  condition: string | null;
  conditionGrade?: string | null; // #64: S | A | B | C | D
  card?: { game?: string | null; conditionCode?: string | null; grader?: string | null; grade?: string | null } | null; // trading card record (null for non-cards)
  quantity: number;
  listingType?: string; // FIXED | AUCTION | REVERSE_AUCTION
  reverseDailyDrop?: number | null; // cents per day for REVERSE_AUCTION
  reverseFloorPrice?: number | null; // minimum price in cents for REVERSE_AUCTION
  photoUrls: string[];
  aiConfidence: number | null;
  isAiTagged: boolean;
  backgroundRemoved: boolean;
  autoEnhanced: boolean;
  draftStatus: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED';
  rarity?: 'COMMON' | 'UNCOMMON' | 'RARE' | 'LEGENDARY';
  tags?: string[];
  suggestedTags?: string[];
  suggestedConditionGrade?: string; // #64: AI-suggested condition grade
  healthScore?: HealthScore;
  priceBeforeMarkdown?: number; // Feature #91: Auto-Markdown
  markdownApplied?: boolean; // Feature #91: Auto-Markdown
  createdAt?: string;
  ebayListingId?: string; // eBay listing ID if pushed
  saleId?: string; // Sale ID for eBay push
  isLegendary?: boolean; // Organizer marks item as Legendary
  // Bug 6: eBay shipping fields (from schema)
  packageWeightOz?: number | null;
  packageLengthIn?: number | null;
  packageWidthIn?: number | null;
  packageHeightIn?: number | null;
  ebayShippingOverride?: string | null;
  // Whether the organizer has confirmed a real (non-estimated) weight: required by
  // validateItemForEbayPublish before a shippable item can push to eBay.
  packageConfirmedByOrganizer?: boolean | null;
  packageEstimateSource?: string | null;
  photos?: { url: string }[];
  // eBay product identifiers
  brand?: string | null;
  mpn?: string | null;
  upc?: string | null;
  // Feature #565: Grounded-identity provenance (display-only, never auto-applied to title)
  groundedIdentity?: string | null;
  groundedConfidence?: number | null;
  groundedSource?: string | null;
}

// Track which items should be pushed to eBay
interface ItemEbayPushState {
  [itemId: string]: boolean;
}


function buildCloudinaryUrl(
  url: string,
  opts: {
    aspectRatio?: AspectRatio;
    backgroundRemoved?: boolean;
    brightness?: number;
    contrast?: number;
  }
): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  const transforms: string[] = [];

  if (opts.aspectRatio) {
    transforms.push(`ar_${opts.aspectRatio},c_fill`);
  }

  if (opts.backgroundRemoved) {
    transforms.push('b_remove');
  }

  if (opts.brightness !== undefined && opts.brightness !== 50) {
    const val = Math.round((opts.brightness - 50) * 1.5);
    transforms.push(`e_brightness:${val}`);
  }

  if (opts.contrast !== undefined && opts.contrast !== 50) {
    const val = Math.round((opts.contrast - 50) * 1.5);
    transforms.push(`e_contrast:${val}`);
  }

  if (transforms.length === 0) return url;
  return url.replace('/upload/', `/upload/${transforms.join(',')}/`);
}

// Tag grouping: classify tags into display buckets for the review UI
const TAG_GROUP_KEYWORDS: Record<string, string[]> = {
  Material: ['brass', 'cast iron', 'iron', 'oak', 'walnut', 'silver', 'gold', 'copper', 'bronze', 'glass', 'ceramic', 'porcelain', 'leather', 'wool', 'linen', 'cotton', 'chrome', 'aluminum', 'wood', 'stone', 'marble', 'velvet', 'enamel', 'tin', 'pewter'],
  Era: ['mid-century', 'victorian', 'art deco', 'art nouveau', '1940s', '1950s', '1960s', '1970s', '1980s', 'antique', 'vintage', 'retro', 'edwardian', 'georgian', 'colonial', 'craftsman'],
  Brand: ['mccoy', 'pyrex', 'fiestaware', 'depression glass', 'wedgwood', 'royal doulton', 'hummel', 'occupied japan', 'corning', 'fostoria', 'hall china', 'universal', 'anchor hocking'],
  Style: ['farmhouse', 'industrial', 'bohemian', 'minimalist', 'rustic', 'arts and crafts', 'art craft', 'hand-painted', 'hand painted', 'hand made', 'handmade', 'homemade', 'set of'],
};

function groupTagsByType(tags: string[]): { group: string; tags: string[] }[] {
  const groups: Record<string, string[]> = {};
  const ungrouped: string[] = [];
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    let placed = false;
    for (const [group, keywords] of Object.entries(TAG_GROUP_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) {
        if (!groups[group]) groups[group] = [];
        groups[group].push(tag);
        placed = true;
        break;
      }
    }
    if (!placed) ungrouped.push(tag);
  }
  const result = Object.entries(groups).map(([group, tags]) => ({ group, tags }));
  if (ungrouped.length > 0) result.push({ group: 'Other', tags: ungrouped });
  return result;
}

function confidenceBorderClass(score: number | null | undefined, isAiTagged?: boolean): string {
  if (!isAiTagged || score == null) return 'border-l-4 border-warm-200';
  if (score >= 0.8) return 'border-l-4 border-green-500';
  if (score >= 0.55) return 'border-l-4 border-amber-400';
  return 'border-l-4 border-red-500';
}

function confidenceLabel(score: number | null | undefined, isAiTagged?: boolean): { text: string; color: string } {
  if (!isAiTagged || score == null) return { text: 'Manual', color: 'text-warm-500' };
  if (score >= 0.8) return { text: 'Good', color: 'text-green-600' };
  if (score >= 0.55) return { text: 'Review', color: 'text-amber-600' };
  return { text: 'Low', color: 'text-red-600' };
}

/**
 * The card's initial edit state for an item. Used when a card is first shown and again after the All details
 * sheet saves (merged with any unsaved card edits, see lib/reviewSheetSync.ts).
 * Condition is read through lib/conditionModel.ts (NEW, USED, REFURBISHED, PARTS_OR_REPAIR; a legacy value such
 * as LIKE_NEW or GOOD reads as USED; blank when unrecognized). The stored grade is kept as is, including a legacy S.
 */
function buildEditStateFromItem(item: Item): ItemEditState {
  return {
    title: item.title,
    description: item.description ?? '',
    price: item.price ?? 0,
    // Use category as-is from eBay (already normalized from API)
    category: item.category ?? '',
    ebayCategoryId: item.ebayCategoryId ?? undefined,
    ebayCategoryName: item.ebayCategoryName ?? undefined,
    condition: normalizeConditionValue(item.condition).condition ?? '',
    conditionGrade: item.conditionGrade ?? undefined, // #64
    quantity: item.quantity ?? 1,
    listingType: item.listingType ?? 'FIXED',
    reverseDailyDrop: item.reverseDailyDrop ?? undefined,
    reverseFloorPrice: item.reverseFloorPrice ?? undefined,
    aspectRatio: '4:3',
    brightness: 50,
    contrast: 50,
    backgroundRemoved: item.backgroundRemoved,
    autoEnhanced: item.autoEnhanced,
    tags: item.tags || [], // BUG 1 FIX: Initialize tags to preserve them on save
    // Bug 6: seed eBay shipping fields from DB
    packageWeightOz: item.packageWeightOz ?? undefined,
    packageLengthIn: item.packageLengthIn ?? undefined,
    packageWidthIn: item.packageWidthIn ?? undefined,
    packageHeightIn: item.packageHeightIn ?? undefined,
    ebayShippingOverride: item.ebayShippingOverride ?? null,
    // eBay product identifiers: seed from DB (default to '')
    brand: item.brand ?? '',
    mpn: item.mpn ?? '',
    upc: item.upc ?? '',
  };
}

const ReviewPage = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected: ebayConnected } = useEbayConnection();
  const { tier } = useOrganizerTier();

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [editStates, setEditStates] = useState<Map<string, ItemEditState>>(new Map());
  // Tracks which items have had their package weight field edited directly on this
  // page. eBay publish blocks a shippable item whose weight is only an AI/category
  // estimate, and the only way out is the organizer confirming a REAL weight. Saving
  // an untouched, prefilled estimate must NOT count as confirming it, so we only mark
  // an item's weight as organizer-touched when the weight field itself is edited here
  // (mirrors edit-item/[id].tsx's weightTouched boolean, scoped per-item since this
  // page reviews many items at once).
  const [weightTouched, setWeightTouched] = useState<Set<string>>(new Set());
  // Per-item loading state for the "Get AI estimate" button
  // (ADR-ai-package-estimation-isolation-2026-08-05).
  const [packageEstimateLoadingIds, setPackageEstimateLoadingIds] = useState<Set<string>>(new Set());

  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  // Bulk bar UI (selection checkboxes): which inline panel is open, the category the picker returned, and
  // whether a bulk category run is sending (the in-flight ref below is the re-entry guard; this state only
  // disables the controls while it runs).
  const [bulkMode, setBulkMode] = useState<'price' | 'category' | null>(null);
  const [bulkCategoryPick, setBulkCategoryPick] = useState<{ l1CategoryName: string; leafCategoryId: string; leafCategoryName: string } | null>(null);
  const [bulkPickerKey, setBulkPickerKey] = useState(0);
  const [bulkCategoryBusy, setBulkCategoryBusy] = useState(false);
  const [showBuyerPreview, setShowBuyerPreview] = useState(router.query.preview === 'true');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'status' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [inlineCameraOpen, setInlineCameraOpen] = useState(false);
  const [inlineCaptureMode, setInlineCaptureMode] = useState<'rapidfire' | 'regular'>('regular');
  const [inlineCaptureItemId, setInlineCaptureItemId] = useState<string | null>(null);
  const [inlineCaptureItem, setInlineCaptureItem] = useState<Item | null>(null);
  const [inlineRapidItems, setInlineRapidItems] = useState<RapidItem[]>([]);
  const [ebayPushItems, setEbayPushItems] = useState<ItemEbayPushState>({});
  // Within-session tag suppression: track how many times a suggested tag has been removed
  const [removedTagCounts, setRemovedTagCounts] = useState<Map<string, number>>(new Map());
  // Condition-adjusted pricing: track which item is currently refreshing its price
  const [refreshingPriceItemId, setRefreshingPriceItemId] = useState<string | null>(null);
  // 2026-10-03: a Condition Grade click only OFFERS a new price (dollars, per item). It is
  // never written to the price field/editState; the organizer taps "Use $X" to apply it.
  // Wave 3 (B3): the entry also carries the estimate's range and the grade-factor disclosure line.
  const [suggestedPrices, setSuggestedPrices] = useState<Map<string, GradeSuggestion>>(new Map());
  // Latest grade-click request id per item, so a slow response for an older grade
  // can't surface a suggestion that describes the wrong grade.
  const gradeSuggestRequestRef = useRef<Map<string, number>>(new Map());
  // Guards handleBulkCategory: its operations run one after another, so a second run must not start
  // while the first is still sending.
  const bulkCategoryInFlightRef = useRef(false);
  // "All details" sheet host: the item whose shared form sheet is open (null = closed).
  const [sheetItemId, setSheetItemId] = useState<string | null>(null);
  // Draft autosave (Wave 3 round 2). Latest-value refs let the controller's save read current state without
  // being recreated; the controller itself is created once.
  const editStatesRef = useRef(editStates);
  editStatesRef.current = editStates;
  const weightTouchedRef = useRef(weightTouched);
  weightTouchedRef.current = weightTouched;
  const [autosaveStatuses, setAutosaveStatuses] = useState<Map<string, AutosaveStatus>>(new Map());
  const autosaveRef = useRef<AutosaveController | null>(null);
  if (autosaveRef.current === null) {
    autosaveRef.current = createAutosaveController({
      // Draft save only: PUT /items/:id with the dirty card fields. buildAutosavePayload never includes price,
      // draftStatus, status or skipMarketplaceSync, so this can neither publish nor change the price.
      save: async (itemId, keys) => {
        const st = editStatesRef.current.get(itemId);
        if (!st) return;
        const payload = buildAutosavePayload(st, keys, weightTouchedRef.current.has(itemId));
        if (Object.keys(payload).length === 0) return;
        await api.put(`/items/${itemId}`, payload);
      },
      onStatus: (itemId, status) =>
        setAutosaveStatuses((prev) => {
          const next = new Map(prev);
          if (status === 'idle') next.delete(itemId);
          else next.set(itemId, status);
          return next;
        }),
    });
  }
  const autosave = autosaveRef.current;
  // Unmount: drop every pending autosave timer and edit.
  useEffect(() => () => autosave.cancelAll(), [autosave]);
  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  // Smart Review Queue UI state
  const [priceInputs, setPriceInputs] = useState<Map<string, string>>(new Map());
  const priceInputsRef = useRef(priceInputs);
  priceInputsRef.current = priceInputs;
  const [priceErrors, setPriceErrors] = useState<Set<string>>(new Set());
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [showApproveAllModal, setShowApproveAllModal] = useState(false);
  const [showDiscardAllModal, setShowDiscardAllModal] = useState(false);
  // Re-analyze: per-card loading + inline error state for the "Re-run Smart tagging" control
  const [reanalyzingIds, setReanalyzingIds] = useState<Set<string>>(new Set());
  const [reanalyzeErrors, setReanalyzeErrors] = useState<Map<string, string>>(new Map());
  // 2026-08-26 fix: bumped after a successful re-analyze so PriceSuggestion (rendered
  // below, keyed off this via autoRefreshToken) knows the item's title/category/condition
  // just changed and fetches a fresh price suggestion instead of showing a stale one --
  // or none at all, which is what organizers were reporting ("no new pricing from the engine").
  const [priceRefreshTokens, setPriceRefreshTokens] = useState<Map<string, number>>(new Map());
  // Feature #565: grounded-identity provenance returned by the last reanalyze call for
  // each item, so the card updates in place before the background query refetch lands.
  const [groundedOverrides, setGroundedOverrides] = useState<Map<string, { groundedIdentity: string | null; groundedConfidence: number | null; groundedSource: string | null }>>(new Map());
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const [addTagInputs, setAddTagInputs] = useState<Map<string, string>>(new Map());

  // Dark mode detection for rarity colors (inline style can't use Tailwind dark: variants)
  // MUST be here (before any early returns) to satisfy React hooks ordering rules
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const checkDark = () => setIsDark(document.documentElement.classList.contains('dark'));
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Auto-enable buyer preview on mount if preview=true in query
  useEffect(() => {
    if (router.query.preview === 'true') {
      setShowBuyerPreview(true);
    }
  }, [router.query.preview]);

  // P1-A: Validate saleId on route ready (fixes static export empty query issue)
  useEffect(() => {
    if (router.isReady && !saleId) {
      router.replace('/organizer/dashboard');
    }
  }, [router.isReady, saleId, router]);

  // Bug 3 fix: Seed priceInputs from item.price when items first load.
  // Only seeds items that don't already have an organizer-typed value.
  // This ensures a price from the camera session (saved to DB) appears pre-filled.
  const seededItemIds = useRef<Set<string>>(new Set());
  const handleItemsLoaded = useCallback((loadedItems: Item[]) => {
    setPriceInputs(prev => {
      const next = new Map(prev);
      for (const item of loadedItems) {
        if (!seededItemIds.current.has(item.id) && item.price != null && item.price > 0) {
          const existing = next.get(item.id);
          if (!existing) {
            next.set(item.id, String(item.price));
          }
          seededItemIds.current.add(item.id);
        }
      }
      return next;
    });
  }, []);

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['items', saleId, 'review'],
    queryFn: async () => {
      if (!saleId) return [];
      // Fetch draft/pending review items for this sale
      const response = await api.get(`/items/drafts?saleId=${saleId}&limit=500`);
      return (response.data || []) as Item[];
    },
    enabled: !!saleId,
    refetchOnMount: 'always',
  });

  // Bug 3 fix: seed price inputs whenever items array changes
  useEffect(() => {
    if (items.length > 0) handleItemsLoaded(items);
  }, [items, handleItemsLoaded]);

  // Sync dimension fields from fresh server data into already-initialized editStates.
  // getEditState only initialises once: a voice note that saves packageWeightOz etc.
  // triggers a query refetch, but the cached editState keeps stale (empty) values
  // unless we merge the new server values here.
  React.useEffect(() => {
    let changed = false;
    items.forEach((item: Item) => {
      if (!editStates.has(item.id)) return;
      const existing = editStates.get(item.id)!;
      const serverW = item.packageWeightOz ?? undefined;
      const serverL = item.packageLengthIn ?? undefined;
      const serverWi = item.packageWidthIn ?? undefined;
      const serverH = item.packageHeightIn ?? undefined;
      if (
        existing.packageWeightOz !== serverW ||
        existing.packageLengthIn !== serverL ||
        existing.packageWidthIn !== serverWi ||
        existing.packageHeightIn !== serverH
      ) {
        editStates.set(item.id, {
          ...existing,
          packageWeightOz: serverW,
          packageLengthIn: serverL,
          packageWidthIn: serverWi,
          packageHeightIn: serverH,
        });
        changed = true;
      }
    });
    if (changed) setEditStates(new Map(editStates));
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

    const updateItemMutation = useMutation({
    mutationFn: async (payload: {
      itemId: string;
      updates: Partial<Item>;
    }) => {
      return await api.put(`/items/${payload.itemId}`, payload.updates);
    },
    onSuccess: () => {
      // Explicitly use the current saleId from router to ensure proper query invalidation
      if (saleId) {
        queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      }
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update item';
      showToast(message, 'error');
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (payload: {
      itemIds: string[];
      operation: string;
      value?: any;
    }) => {
      return await api.post(`/items/bulk`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      setSelectedItems(new Set());
      setBulkPrice('');
      setBulkCategory('');
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update items';
      showToast(message, 'error');
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return await api.post(`/items/bulk`, {
        itemIds,
        operation: 'draftStatus',
        value: 'PUBLISHED',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      showToast('Items published successfully!', 'success');
      // Fire eBay push for any published items that had the push toggle checked
      const ebayIds = items.map(i => i.id).filter(id => ebayPushItems[id]);
      if (ebayIds.length > 0 && ebayConnected && tier !== 'SIMPLE') {
        ebayPushMutation.mutate(ebayIds);
      }
      // Auto-reopen camera for batch workflow: pass query params to signal intent
      router.push(`/organizer/add-items/${saleId}?openCamera=1&captureMode=rapidfire`);
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to publish items';
      showToast(message, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      // A deleted item must not be autosaved afterwards (it would 404 and retry).
      itemIds.forEach((id) => autosave.hold(id));
      return await Promise.all(itemIds.map((id) => api.delete(`/items/${id}`)));
    },
    onSuccess: (_data, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      setSelectedItems(new Set());
      if (itemIds.length === 1 && expandedItemId === itemIds[0]) setExpandedItemId(null);
      showToast(`${itemIds.length} item${itemIds.length !== 1 ? 's' : ''} deleted`, 'success');
    },
    onError: (_error, itemIds) => {
      itemIds.forEach((id) => autosave.release(id));
      showToast('Failed to delete item(s)', 'error');
    },
  });

  // eBay push mutation
  const ebayPushMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      if (!saleId) throw new Error('Sale ID not found');
      return api.post(`/ebay/organizer/sales/${saleId}/ebay-push`, {
        itemIds,
      });
    },
    onSuccess: (response) => {
      const results: any[] = response.data?.results || [];
      let successCount = 0;
      let errorCount = 0;
      results.forEach((result: any) => {
        if (result.status === 'success') {
          successCount++;
          // Warn if item is still a draft on FindA.Sale after eBay push
          if (result.warning === 'DRAFT_ON_FINDASALE') {
            showToast('Item pushed to eBay but is still a draft on FindA.Sale. Shoppers won\'t see it until you approve it.', 'info');
          }
        } else {
          errorCount++;
          // result.message is what the backend pre-publish guards populate
          // (price / weight / ISBN blocks). Falling back to result.error alone
          // swallowed those and showed a generic "Failed to push item".
          const errorMsg = result.error?.includes('NOT_CONNECTED')
            ? 'eBay not connected'
            : result.error?.includes('POLICIES')
            ? 'eBay policies not configured'
            : result.message || result.error || 'Failed to push item';
          showToast(`Item ${result.itemId}: ${errorMsg}`, 'error');
        }
      });
      if (successCount > 0) {
        showToast(`${successCount} item${successCount !== 1 ? 's' : ''} pushed to eBay`, 'success');
      } else if (results.length === 0 && errorCount === 0) {
        // API succeeded but returned no results array: treat as full success
        showToast('Item pushed to eBay', 'success');
      }
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      setEbayPushItems({});
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'eBay push failed';
      showToast(message, 'error');
    },
  });

  // Item card refs for scroll-to-top on expand
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleToggleExpand = useCallback((itemId: string) => {
    const next = expandedItemId === itemId ? null : itemId;
    setExpandedItemId(next);
    if (next) {
      // Small delay so the card re-renders expanded before we scroll
      setTimeout(() => {
        const el = itemRefs.current.get(next);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [expandedItemId]);

  const handlePhotoUpload = async (itemId: string, files: FileList | null, mode: 'upload' | 'camera') => {
    if (!files || files.length === 0) return;

    try {
      let currentPhotos: string[] = [];
      const targetItem = items.find((i) => i.id === itemId);
      if (!targetItem) return;
      currentPhotos = [...(targetItem.photoUrls || [])];

      for (const file of Array.from(files)) {
        // Step 1: Upload to Cloudinary
        const formData = new FormData();
        formData.append('photo', file);
        const uploadRes = await api.post('/upload/item-photo', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const url: string = uploadRes.data.url;

        // Step 2: Append URL to item's photoUrls
        const addRes = await api.post(`/items/${itemId}/photos`, { url });
        currentPhotos = addRes.data.photoUrls;
      }

      // Refetch items to reflect new photos
      await queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      showToast(`${mode === 'camera' ? 'Camera' : 'Photo'} uploaded successfully`, 'success');
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      const message = serverMsg ? `Upload failed: ${serverMsg}` : 'Photo upload failed. Please try again.';
      showToast(message, 'error');
    }
  };

  const handleInlineCameraCapture = async (photo: { blob: Blob; previewUrl: string }) => {
    if (!inlineCaptureItemId || !saleId) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // Add temp thumbnail immediately so the strip updates
    setInlineRapidItems(prev => [...prev, { id: tempId, thumbnailUrl: photo.previewUrl, draftStatus: 'DRAFT' }]);
    try {
      const fd = new FormData();
      fd.append('photos', photo.blob, 'capture.jpg');
      fd.append('saleId', String(saleId));
      const res = await api.post('/upload/sale-photos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const urls: string[] = res.data?.urls || [];
      if (urls[0]) {
        await api.post(`/items/${inlineCaptureItemId}/photos`, { url: urls[0] });
        // Remove temp entry, update target item's photoUrls
        setInlineRapidItems(prev =>
          prev.filter(i => i.id !== tempId).map(i =>
            i.id === inlineCaptureItemId ? { ...i, photoUrls: [...(i.photoUrls || []), urls[0]] } : i
          )
        );
        queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      }
    } catch (err: any) {
      setInlineRapidItems(prev => prev.filter(i => i.id !== tempId));
      showToast('Photo upload failed', 'error');
    }
  };

  const handleInlineCameraAnalyze = async (photos: { blob: Blob; previewUrl: string }[]) => {
    for (const photo of photos) await handleInlineCameraCapture(photo);
    setInlineCameraOpen(false);
    // Explicit post-close refetch so thumbnails update without a page refresh
    queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
  };

  // Intercept mobile swipe-back so it closes the inline camera instead of navigating away
  useEffect(() => {
    if (!inlineCameraOpen) return;
    const closedByBack = { current: false };
    window.history.pushState({ inlineCameraOpen: true }, '');
    const handlePopState = () => {
      closedByBack.current = true;
      setInlineCameraOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!closedByBack.current) window.history.back();
    };
  }, [inlineCameraOpen]);

  const getSortedItems = useCallback((itemsToSort: Item[]) => {
    return [...itemsToSort].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase());
          break;
        case 'price':
          comparison = (Number(a.price) || 0) - (Number(b.price) || 0);
          break;
        case 'status': {
          const statusOrder: Record<string, number> = { DRAFT: 0, PENDING_REVIEW: 1, PUBLISHED: 2 };
          comparison = (statusOrder[a.draftStatus || ''] ?? 0) - (statusOrder[b.draftStatus || ''] ?? 0);
          break;
        }
        case 'date':
        default:
          comparison = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [sortBy, sortOrder]);

  // Selection follows the queue: a card that was approved, published or discarded can no longer be selected.
  useEffect(() => {
    const pendingIdList = items
      .filter((i) => i.draftStatus !== 'PUBLISHED' && !approvedIds.has(i.id))
      .map((i) => i.id);
    setSelectedItems((prev) => pruneSelection(prev, pendingIdList) as Set<string>);
  }, [items, approvedIds]);

  // An empty selection closes the bulk panels and forgets the picked category (also runs after a bulk
  // action completes, because the handlers clear the selection).
  useEffect(() => {
    if (selectedItems.size === 0) {
      setBulkMode(null);
      setBulkCategoryPick(null);
      setBulkPickerKey((k) => k + 1);
    }
  }, [selectedItems]);

  // Auth + saleId guards (MUST be after all hooks to respect Rules of Hooks)
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  if (!saleId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-warm-400">Loading...</div>
      </div>
    );
  }

  const getEditState = (item: Item): ItemEditState => {
    if (!editStates.has(item.id)) {
      editStates.set(item.id, buildEditStateFromItem(item));
      setEditStates(new Map(editStates));
    }
    return editStates.get(item.id)!;
  };

  const handleEditChange = (itemId: string, field: string, value: any) => {
    const state = getEditState(items.find((i) => i.id === itemId)!);
    const updated = { ...state, [field]: value };
    editStates.set(itemId, updated);
    setEditStates(new Map(editStates));
    // Draft autosave: the fields the card edits (never price) are saved 800 ms after the last change.
    if (isAutosaveField(field)) autosave.touch(itemId, field);
    // Organizer edited the weight field itself on this page: record it so the save
    // payloads below can send packageConfirmedByOrganizer. Never set for the other 3
    // package fields (length/width/height): only the weight box drives eBay's
    // publish-block guard, matching edit-item/[id].tsx's weightTouched exactly.
    if (field === 'packageWeightOz') {
      setWeightTouched((prev) => {
        const next = new Set(prev);
        next.add(itemId);
        return next;
      });
    }
  };

  /**
   * "Get AI estimate" (ADR-ai-package-estimation-isolation-2026-08-05, corrected
   * S-QA-2026-08-06): explicit, opt-in fetch of the AI/estimate-cascade weight+dims
   * guess for a single item. Only fills this item's editable weight/dims fields:
   * never auto-confirms. Does NOT set weightTouched itself: a click here alone (with
   * no further edit) must never cause Save to persist packageConfirmedByOrganizer.
   * The organizer must still separately edit the weight field (handleEditChange,
   * above) before Save will confirm: mirrors edit-item/[id].tsx exactly.
   */
  const handleGetPackageEstimate = async (item: Item) => {
    if (packageEstimateLoadingIds.has(item.id)) return;
    setPackageEstimateLoadingIds((prev) => new Set(prev).add(item.id));
    try {
      const res = await api.get(`/items/${item.id}/package-estimate`);
      const result = res.data;
      if (result?.reason === 'not-applicable' || result?.weightOz == null) {
        showToast('No estimate available for this item.', 'info');
        return;
      }
      const state = getEditState(item);
      const updated: ItemEditState = {
        ...state,
        packageWeightOz: Math.round(result.weightOz),
        packageLengthIn: result.dims?.length != null ? result.dims.length : state.packageLengthIn,
        packageWidthIn: result.dims?.width != null ? result.dims.width : state.packageWidthIn,
        packageHeightIn: result.dims?.height != null ? result.dims.height : state.packageHeightIn,
      };
      editStates.set(item.id, updated);
      setEditStates(new Map(editStates));
      // Do NOT setWeightTouched here: filling the fields is not confirming them.
      // The organizer must edit the weight field (handleEditChange) to confirm.
      showToast('Estimate filled in. Edit the weight field to confirm.', 'success');
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to get estimate. Try again.';
      showToast(message, 'error');
    } finally {
      setPackageEstimateLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  /**
   * Re-analyze: re-run the Smart tagging pipeline on the item's ALREADY-STORED photos
   * (no re-upload) and refresh the suggested fields in place. Price is never touched.
   * Overwrites title/description/category/condition/tags: the confirm dialog in
   * requestReanalyze() warns the organizer first so manual edits aren't lost silently.
   */
  const handleReanalyze = async (item: Item, opts: { forceGrounding?: boolean } = {}) => {
    if (reanalyzingIds.has(item.id)) return;

    setReanalyzeErrors((prev) => {
      const next = new Map(prev);
      next.delete(item.id);
      return next;
    });
    setReanalyzingIds((prev) => new Set(prev).add(item.id));

    try {
      const res = await api.post(`/items/${item.id}/reanalyze`, { forceGrounding: opts.forceGrounding === true });
      const updated = res.data?.item;

      if (updated) {
        // Update the visible card fields in place from the fresh suggestions.
        const state = getEditState(item);
        const normalizeCondition = (c: string | null | undefined): string =>
          normalizeConditionValue(c).condition ?? state.condition;
        const next: ItemEditState = {
          ...state,
          title: updated.title ?? state.title,
          description: updated.description ?? state.description,
          category: updated.category ?? state.category,
          condition: normalizeCondition(updated.condition),
          conditionGrade: updated.conditionGrade ?? state.conditionGrade,
          tags: Array.isArray(updated.tags) ? updated.tags : state.tags,
          ebayCategoryId: updated.ebayCategoryId ?? state.ebayCategoryId,
          ebayCategoryName: updated.ebayCategoryName ?? state.ebayCategoryName,
          brand: updated.brand ?? state.brand,
          mpn: updated.mpn ?? state.mpn,
          upc: updated.upc ?? state.upc,
          // Price is intentionally NOT changed: organizer pricing always wins.
        };
        editStates.set(item.id, next);
        setEditStates(new Map(editStates));
      }

      // Feature #565: capture grounded-identity provenance from this response so the
      // card can show it immediately, without waiting on the invalidate/refetch below.
      // Display-only - never written into the title/description edit state.
      setGroundedOverrides((prev) => {
        const next = new Map(prev);
        next.set(item.id, {
          groundedIdentity: updated?.groundedIdentity ?? null,
          groundedConfidence: updated?.groundedConfidence ?? null,
          groundedSource: updated?.groundedSource ?? null,
        });
        return next;
      });

      // Pull fresh server values (confidence chip, persisted fields) into the cache.
      if (saleId) {
        await queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      }
      // Trigger PriceSuggestion's auto-refresh (see autoRefreshToken prop below) --
      // title/category/condition may have just changed, so any prior suggestion is stale.
      setPriceRefreshTokens((prev) => new Map(prev).set(item.id, (prev.get(item.id) ?? 0) + 1));
      showToast('Suggestions refreshed from your photos.', 'success');
    } catch (err: any) {
      const code = err?.response?.data?.code;
      let message = err?.response?.data?.message || 'Re-analyze failed. Try again.';
      if (code === 'AI_QUOTA_EXCEEDED') {
        message = err?.response?.data?.message || 'Monthly re-analyze limit reached.';
      } else if (code === 'NO_PHOTOS') {
        message = 'Add a photo before re-analyzing.';
      } else if (code === 'AI_UNAVAILABLE') {
        message = 'Smart tagging is temporarily unavailable. Try again shortly.';
      } else if (code === 'PHOTO_DOWNLOAD_FAILED') {
        message = "We couldn't load this item's photos. Try again in a moment.";
      }
      setReanalyzeErrors((prev) => new Map(prev).set(item.id, message));
    } finally {
      setReanalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  /**
   * Gate the re-analyze behind a confirm so the organizer knows the current
   * suggested title/description/category/condition/tags will be refreshed.
   * Their typed price is preserved either way.
   */
  const requestReanalyze = (item: Item, opts: { forceGrounding?: boolean } = {}) => {
    if (reanalyzingIds.has(item.id)) return;
    const forceGrounding = opts.forceGrounding === true;
    setConfirmState({
      open: true,
      title: forceGrounding ? 'Look up this item\u2019s exact identity?' : 'Re-run Smart tagging?',
      message: forceGrounding
        ? 'This re-runs identity lookup from this item\u2019s photos even if it was already identified, and refreshes the suggested title, description, category, condition, and tags. Any edits you made to those fields will be replaced. Your price is kept. We\u2019ll check for an updated price suggestion below, but it\u2019s never applied automatically.'
        : 'This refreshes the suggested title, description, category, condition, and tags from this item\u2019s photos. Any edits you made to those fields will be replaced. Your price is kept. We\u2019ll check for an updated price suggestion below, but it\u2019s never applied automatically.',
      onConfirm: () => {
        setConfirmState((s) => ({ ...s, open: false }));
        handleReanalyze(item, { forceGrounding });
      },
    });
  };

  const handlePublishItem = async (item: Item) => {
    try {
      if (item.draftStatus === 'PUBLISHED') {
        // Unpublish: use generic update endpoint (draftStatus now accepted)
        await updateItemMutation.mutateAsync({
          itemId: item.id,
          updates: { draftStatus: 'DRAFT' } as any,
        });
        showToast('Item unpublished', 'success');
      } else {
        // Publish: use dedicated publish endpoint. Finish any autosave first and freeze the card.
        await autosave.flush(item.id);
        autosave.hold(item.id);
        await api.post(`/items/${item.id}/publish`);
        queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
        showToast('Item published!', 'success');

        // If eBay push is enabled for this item, flush the current price first,
        // then push. This ensures that a price typed in the review queue (priceInputs)
        // but not yet saved reaches eBay rather than the stale DB value.
        if (ebayPushItems[item.id] && ebayConnected && tier !== 'SIMPLE') {
          const currentPriceStr = priceInputs.get(item.id);
          const currentPriceVal = currentPriceStr ? parseFloat(currentPriceStr) : NaN;
          if (!isNaN(currentPriceVal) && currentPriceVal > 0 && currentPriceVal !== item.price) {
            try {
              await api.put(`/items/${item.id}`, { price: currentPriceVal });
            } catch {
              // best-effort price flush; proceed with push regardless
            }
          }
          ebayPushMutation.mutate([item.id]);
        }
      }
    } catch (error: any) {
      autosave.release(item.id);
      const message = error.response?.data?.message || 'Failed to update item';
      showToast(message, 'error');
    }
  };

  const handleBulkPrice = () => {
    if (!bulkPrice) return;
    const itemIds = Array.from(selectedItems);
    // Same rounding the backend applies (two decimals, never negative), so the re-seeded inputs match
    // the saved price exactly.
    const parsed = parseFloat(bulkPrice);
    const finalPrice = Number.isFinite(parsed) ? Math.max(0, parseFloat(parsed.toFixed(2))) : NaN;
    bulkUpdateMutation.mutate(
      {
        itemIds,
        operation: 'price',
        value: parseFloat(bulkPrice),
      },
      {
        onSuccess: (response) => {
          if (!Number.isFinite(finalPrice)) return;
          // priceInputs is seeded once per item (handleItemsLoaded), so a refetch does not refresh it.
          // Re-seed the items the backend really wrote, or a later Approve would send the old seeded
          // price and overwrite this bulk price. Items the backend skipped (eBay minimum) keep theirs.
          const writtenIds = bulkPriceWrittenIds(response?.data, response?.status, itemIds);
          if (writtenIds.length > 0) {
            setPriceInputs((prev) => reseedPriceInputs(prev, writtenIds, finalPrice));
            setPriceErrors((prev) => {
              const next = new Set(prev);
              writtenIds.forEach((id) => next.delete(id));
              return next;
            });
            // Keep the card's edit state in step (the research panel reads editState.price).
            let editStatesChanged = false;
            writtenIds.forEach((id) => {
              const existing = editStates.get(id);
              if (existing) {
                editStates.set(id, { ...existing, price: finalPrice });
                editStatesChanged = true;
              }
            });
            if (editStatesChanged) setEditStates(new Map(editStates));
          }
          const skippedMessage = bulkPriceSkippedMessage(response?.data);
          if (skippedMessage) showToast(skippedMessage, 'info');
        },
      }
    );
  };

  /**
   * Bulk category. The picker gives an eBay L1 name, a leaf id and a leaf name, which are three separate
   * /items/bulk operations (the `category` operation alone never sets the eBay leaf id or name). They are
   * sent one after another, never as concurrent mutate() calls on one mutation object, and the first
   * failure stops the run and says exactly what was and was not applied.
   * `category` goes first: its backend whitelist (short lowercase list) can reject an eBay L1 name such as
   * "Home & Garden" before anything is written, which leaves every field untouched.
   */
  const handleBulkCategory = async (payload: { l1CategoryName: string; leafCategoryId: string; leafCategoryName: string }) => {
    const itemIds = Array.from(selectedItems);
    const ops = planBulkCategoryOps(payload);
    if (itemIds.length === 0 || ops.length === 0) {
      showToast('Select items and pick a category first.', 'error');
      return;
    }
    if (bulkCategoryInFlightRef.current) return;
    bulkCategoryInFlightRef.current = true;
    const allOps: BulkCategoryOperation[] = ops.map((o) => o.operation);
    const applied: BulkCategoryOperation[] = [];
    let partialItemsMessage: string | null = null;
    let updatedCount = itemIds.length;
    try {
      for (const op of ops) {
        try {
          const response = await api.post('/items/bulk', {
            itemIds,
            operation: op.operation,
            value: op.value,
          });
          applied.push(op.operation);
          if (op.operation === allOps[0]) {
            const succeeded = response?.data?.succeeded;
            if (Array.isArray(succeeded)) updatedCount = succeeded.length;
            partialItemsMessage = bulkCategoryPartialItemsMessage(response?.data, updatedCount);
          }
        } catch (err: any) {
          showToast(
            bulkCategoryFailureMessage(op.operation, applied, allOps, err?.response?.data?.message),
            'error'
          );
          return;
        }
      }
      setSelectedItems(new Set());
      setBulkCategory('');
      if (partialItemsMessage) {
        showToast(partialItemsMessage, 'info');
      } else {
        showToast(`Category updated for ${updatedCount} item${updatedCount !== 1 ? 's' : ''}.`, 'success');
      }
    } finally {
      bulkCategoryInFlightRef.current = false;
      // Refetch even after a failure: an earlier step may already have been written.
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
    }
  };

  // Bulk bar: the category picker only collects the choice; this runs the existing handleBulkCategory with it.
  const bulkBusy = bulkUpdateMutation.isPending || bulkCategoryBusy;
  const runBulkCategory = async () => {
    if (!bulkCategoryPick || bulkBusy) return;
    setBulkCategoryBusy(true);
    try {
      await handleBulkCategory(bulkCategoryPick);
    } finally {
      setBulkCategoryBusy(false);
    }
  };

  const handleBulkBGRemoval = () => {
    bulkUpdateMutation.mutate({
      itemIds: Array.from(selectedItems),
      operation: 'backgroundRemoved',
      value: true,
    });
  };

  const handlePublishAll = () => {
    const ids = items.map((i) => i.id);
    if (ids.length === 0) {
      showToast('No items to publish', 'error');
      return;
    }
    publishMutation.mutate(ids);
  };

  // Sprint 1: Tag handler functions
  const handleAddTag = (itemId: string, tag: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const state = getEditState(item);
    const current = state.tags || [];

    // Max 6 tags total (5 curated + 1 custom)
    if (current.includes(tag) || current.length >= 6) return;

    handleEditChange(itemId, 'tags', [...current, tag]);
  };

  const handleRemoveTag = (itemId: string, tag: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const state = getEditState(item);
    const current = state.tags || [];
    handleEditChange(itemId, 'tags', current.filter((t) => t !== tag));

    // Within-session learning: track how many times this tag has been removed from suggested list
    const isSuggested = (item.suggestedTags || []).includes(tag);
    if (isSuggested) {
      setRemovedTagCounts(prev => {
        const next = new Map(prev);
        next.set(tag, (next.get(tag) ?? 0) + 1);
        return next;
      });
    }
  };

  // Condition-adjusted pricing: when grade changes, re-fetch a price suggestion silently.
  // 2026-10-03: this NEVER writes the price (organizer-set values always win). The result
  // is stored in suggestedPrices and shown as a "Use $X" prompt under the price field.
  const handleConditionGradeChange = async (item: Item, grade: string) => {
    handleEditChange(item.id, 'conditionGrade', grade);

    const reqId = (gradeSuggestRequestRef.current.get(item.id) ?? 0) + 1;
    gradeSuggestRequestRef.current.set(item.id, reqId);
    // A new grade makes any earlier suggestion stale (it described the previous grade).
    clearSuggestedPrice(item.id);

    const editState = getEditState(item);
    const title = editState.title || item.title;
    const category = editState.category || item.category || '';
    const condition = editState.condition || item.condition || '';
    if (!title || !category) return; // need at minimum title + category

    try {
      setRefreshingPriceItemId(item.id);
      // Wave 3 (B3): send the item's REAL condition (normalized in lib/conditionModel.ts) and the clicked
      // grade as conditionGrade. This used to send a grade label ("excellent", "fair") as the condition.
      // persist:false makes this a what-if estimate: it must not overwrite the saved estimate, and nothing
      // below writes the price either. Amounts come back in cents; FLOOR confidence (no real comps) yields
      // no suggestion rather than a bare $0.49.
      const response = await api.post(
        '/pricing/estimate',
        buildGradeEstimateBody({
          itemId: item.id,
          title,
          category,
          condition,
          grade,
          photoUrls: item.photoUrls,
        })
      );
      const suggestion = parseGradeEstimate(response.data);
      // Only the latest grade click may surface a suggestion. Whether it differs from the price field is
      // checked at render time (against what the organizer has typed).
      if (suggestion && gradeSuggestRequestRef.current.get(item.id) === reqId) {
        setSuggestedPrices((prev) => new Map(prev).set(item.id, suggestion));
      }
    } catch {
      // Best-effort: silent failure, keep existing price
    } finally {
      setRefreshingPriceItemId(null);
    }
  };

  const handleAddCustomTag = (itemId: string, tag: string) => {
    const trimmed = tag.trim().toLowerCase().replace(/\s+/g, '-');
    if (!trimmed) return;
    handleAddTag(itemId, trimmed);
  };

  // ── Smart Review Queue helpers ──────────────────────────────────────────────

  /** Get the organizer-typed price string for an item (never falls back to AI). */
  const getPriceInput = (itemId: string): string => priceInputs.get(itemId) ?? '';

  /** Set the organizer-typed price for an item. Clears any error state. */
  const setPriceInput = (itemId: string, value: string) => {
    setPriceInputs(prev => new Map(prev).set(itemId, value));
    if (value.trim()) {
      setPriceErrors(prev => { const next = new Set(prev); next.delete(itemId); return next; });
    }
  };

  /** Drop any pending "Use $X" suggestion for an item (dismiss, apply, or new grade click). */
  const clearSuggestedPrice = (itemId: string) => {
    setSuggestedPrices((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  };

  /** Organizer tapped "Use $X": the ONLY place a grade-click suggestion reaches the price. */
  const applySuggestedPrice = (item: Item, price: number) => {
    setPriceInput(item.id, String(price));
    handleEditChange(item.id, 'price', price); // keep editState in step with the field
    clearSuggestedPrice(item.id);
    showToast(`Price set to $${price.toFixed(2)}`, 'success');
  };

  /**
   * "All details": open the shared item form sheet for one card. Pending inline edits are saved first so the
   * sheet loads the latest values.
   */
  const openItemSheet = async (item: Item) => {
    await autosave.flush(item.id);
    setSheetItemId(item.id);
  };

  /**
   * After the sheet saved or closed: refetch the review items and refresh this card from the server item, without
   * overwriting anything the organizer typed on the card and has not saved. Fields with unsaved inline edits
   * keep their value; the typed price is replaced only when it still equals the previously saved price.
   */
  const syncCardFromServer = async (itemId: string) => {
    const key = ['items', saleId, 'review'];
    const before = (queryClient.getQueryData<Item[]>(key) ?? []).find((i) => i.id === itemId);
    const typedBefore = priceInputsRef.current.get(itemId);
    try {
      await queryClient.refetchQueries({ queryKey: key });
    } catch {
      return; // the card keeps what it has; the next refetch picks the sheet's changes up
    }
    const fresh = (queryClient.getQueryData<Item[]>(key) ?? []).find((i) => i.id === itemId);
    if (!fresh) return;
    const dirty = autosave.dirtyKeys(itemId);
    const merged = mergeEditStateFromServer(
      buildEditStateFromItem(fresh),
      editStatesRef.current.get(itemId),
      dirty
    );
    editStatesRef.current.set(itemId, merged);
    setEditStates(new Map(editStatesRef.current));
    if (!dirty.includes('packageWeightOz')) {
      setWeightTouched((prev) => {
        if (!prev.has(itemId)) return prev;
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
    // The saved price (typed price field) follows the server only when the organizer has not typed a different one.
    if (!typedPriceDiffersFromSaved(typedBefore, before?.price)) {
      setPriceInputs((prev) => reseedPriceInputs(prev, [itemId], Number(fresh.price ?? 0)));
      setPriceErrors((prev) => {
        if (!prev.has(itemId)) return prev;
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
    clearSuggestedPrice(itemId);
  };

  /** Approve a single item. Blocks if price is empty. */
  const handleApproveItem = async (item: Item) => {
    const priceStr = getPriceInput(item.id);
    const priceVal = parseFloat(priceStr);
    if (!priceStr.trim() || isNaN(priceVal) || priceVal <= 0) {
      setPriceErrors(prev => new Set(prev).add(item.id));
      return;
    }
    // Save price + tags then publish.
    // An autosave may be in flight or waiting: let it finish (and save what is pending) first, then freeze the
    // card so no autosave can fire once publishing has started.
    await autosave.flush(item.id);
    autosave.hold(item.id);
    const editState = getEditState(item);
    try {
      await updateItemMutation.mutateAsync({
        itemId: item.id,
        updates: {
          price: priceVal,
          title: editState.title,
          description: editState.description,
          category: editState.category,
          condition: editState.condition,
          conditionGrade: editState.conditionGrade,
          tags: editState.tags,
          // Package weight/dims themselves are gated behind weightTouched (2026-09-14):
          // an unreviewed AI/SEED suggestion sitting in editState must not silently persist
          // to these organizer-facing columns on an unrelated save. Omitted entirely when
          // untouched, so the backend leaves the existing DB values alone.
          ...(weightTouched.has(item.id)
            ? {
                packageWeightOz: editState.packageWeightOz ?? null,
                packageLengthIn: editState.packageLengthIn ?? null,
                packageWidthIn: editState.packageWidthIn ?? null,
                packageHeightIn: editState.packageHeightIn ?? null,
              }
            : {}),
          // Same confirm-on-real-edit rule as handleApproveItem.
          ...(weightTouched.has(item.id) && editState.packageWeightOz != null
            ? { packageConfirmedByOrganizer: true, packageEstimateSource: 'ORGANIZER' }
            : {}),
          ebayShippingOverride: editState.ebayShippingOverride ?? null,
        },
      });
      await api.post(`/items/${item.id}/publish`);
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      setApprovedIds(prev => new Set(prev).add(item.id));
      showToast('Item published!', 'success');
      // Fire eBay push if the organizer checked the push toggle for this item
      if (ebayPushItems[item.id] && ebayConnected && tier !== 'SIMPLE') {
        ebayPushMutation.mutate([item.id]);
      }
    } catch (err: any) {
      autosave.release(item.id);
      showToast(err?.response?.data?.message || 'Failed to publish', 'error');
    }
  };

  /** Approve all items that have prices set. Flag items without prices. */
  const handleApproveAll = async () => {
    setShowApproveAllModal(false);
    const pending = items.filter(i => i.draftStatus !== 'PUBLISHED' && !approvedIds.has(i.id));
    const unpriced: string[] = [];
    const toApprove: Item[] = [];
    for (const item of pending) {
      const priceStr = getPriceInput(item.id);
      const priceVal = parseFloat(priceStr);
      if (!priceStr.trim() || isNaN(priceVal) || priceVal <= 0) {
        unpriced.push(item.id);
      } else {
        toApprove.push(item);
      }
    }
    if (unpriced.length > 0) {
      setPriceErrors(new Set(unpriced));
      if (toApprove.length === 0) {
        showToast(`${unpriced.length} item${unpriced.length !== 1 ? 's' : ''} need a price before publishing.`, 'error');
        return;
      }
      showToast(`Publishing ${toApprove.length} priced items. ${unpriced.length} item${unpriced.length !== 1 ? 's' : ''} need a price.`, 'info');
    }
    // Save prices and publish priced items
    for (const item of toApprove) {
      const priceStr = getPriceInput(item.id);
      const priceVal = parseFloat(priceStr);
      // Same rule as handleApproveItem: finish any autosave first, then freeze this card.
      await autosave.flush(item.id);
      autosave.hold(item.id);
      const editState = getEditState(item);
      try {
        await updateItemMutation.mutateAsync({
          itemId: item.id,
          updates: {
            price: priceVal,
            title: editState.title,
            description: editState.description,
            category: editState.category,
            condition: editState.condition,
            conditionGrade: editState.conditionGrade,
            tags: editState.tags,
            // Package weight/dims themselves are gated behind weightTouched (2026-09-14):
            // an unreviewed AI/SEED suggestion sitting in editState must not silently persist
            // to these organizer-facing columns on an unrelated save. Omitted entirely when
            // untouched, so the backend leaves the existing DB values alone.
            ...(weightTouched.has(item.id)
              ? {
                  packageWeightOz: editState.packageWeightOz ?? null,
                  packageLengthIn: editState.packageLengthIn ?? null,
                  packageWidthIn: editState.packageWidthIn ?? null,
                  packageHeightIn: editState.packageHeightIn ?? null,
                }
              : {}),
            // Same confirm-on-real-edit rule as handleApproveItem.
            ...(weightTouched.has(item.id) && editState.packageWeightOz != null
              ? { packageConfirmedByOrganizer: true, packageEstimateSource: 'ORGANIZER' }
              : {}),
            ebayShippingOverride: editState.ebayShippingOverride ?? null,
          },
        });
        await api.post(`/items/${item.id}/publish`);
        setApprovedIds(prev => new Set(prev).add(item.id));
      } catch {
        // silent per-item: overall toast shown below
        autosave.release(item.id);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
    if (toApprove.length > 0) {
      showToast(`${toApprove.length} item${toApprove.length !== 1 ? 's' : ''} published!`, 'success');
    }
    // Fire eBay push for any approved items that had the push toggle checked
    const ebayIds = toApprove.map(i => i.id).filter(id => ebayPushItems[id]);
    if (ebayIds.length > 0 && ebayConnected && tier !== 'SIMPLE') {
      ebayPushMutation.mutate(ebayIds);
    }
  };

  /** Discard all pending items (delete). */
  const handleDiscardAll = () => {
    setShowDiscardAllModal(false);
    const pendingIds = items
      .filter(i => i.draftStatus !== 'PUBLISHED' && !approvedIds.has(i.id))
      .map(i => i.id);
    if (pendingIds.length === 0) return;
    deleteMutation.mutate(pendingIds);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F4EFE7] dark:bg-[#1C1C1E] py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // ── Derived counts ──────────────────────────────────────────────────────────
  const pendingItems = items.filter(i => i.draftStatus !== 'PUBLISHED' && !approvedIds.has(i.id));
  const publishedCount = items.filter(i => i.draftStatus === 'PUBLISHED').length + approvedIds.size;
  const totalCount = items.length;
  const queueEmpty = pendingItems.length === 0 && totalCount > 0;
  const pendingIds = pendingItems.map((i) => i.id);
  const selectedCount = pendingIds.filter((id) => selectedItems.has(id)).length;
  const bulkPriceValue = parseBulkPriceInput(bulkPrice);

  // ── Rarity badge colors (light + dark palette) ──────────────────────────────
  const rarityColors: Record<string, { bg: string; fg: string; darkBg: string; darkFg: string }> = {
    COMMON:    { bg: 'rgba(20,18,14,0.05)',   fg: 'rgba(26,24,20,0.62)',  darkBg: 'rgba(245,245,240,0.08)', darkFg: '#D0D0CC' },
    UNCOMMON:  { bg: 'rgba(63,122,75,0.10)',  fg: '#3F7A4B',              darkBg: 'rgba(63,122,75,0.20)',   darkFg: '#6BCF7F' },
    RARE:      { bg: 'rgba(58,110,180,0.12)', fg: '#3A6EB4',              darkBg: 'rgba(58,110,180,0.22)',  darkFg: '#7EB0F0' },
    LEGENDARY: { bg: 'rgba(200,85,43,0.10)',  fg: '#C8552B',              darkBg: 'rgba(200,85,43,0.18)',   darkFg: '#E8775A' },
  };

  const conditionOptions = [
    { value: 'NEW',           label: 'New' },
    { value: 'USED',          label: 'Used' },
    { value: 'REFURBISHED',   label: 'Refurb' },
    { value: 'PARTS_OR_REPAIR', label: 'Parts' },
  ];

  return (
    <>
      <Head>
        <title>Smart Review Queue - FindA.Sale</title>
      </Head>

      {/* All details: shared item form sheet (stays open after Save; the card refreshes from the server) */}
      <ItemFormSheet
        open={sheetItemId !== null}
        itemId={sheetItemId ?? ''}
        onClose={() => {
          const id = sheetItemId;
          setSheetItemId(null);
          if (id) void syncCardFromServer(id);
        }}
        onSaved={() => {
          if (sheetItemId) void syncCardFromServer(sheetItemId);
        }}
      />

      {/* Photo zoom overlay */}
      {zoomedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setZoomedPhoto(null)}
        >
          <img
            src={zoomedPhoto}
            alt="Photo zoom"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}

      {/* Approve-all confirmation modal */}
      {showApproveAllModal && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#FBF8F2] dark:bg-[#2C2C2E] rounded-2xl border border-black/10 dark:border-[#3A3A3C] shadow-2xl overflow-hidden">
            <div className="p-7">
              <p className="text-[10px] font-mono tracking-widest uppercase text-[#C8552B] mb-2">Confirm publish</p>
              <h2 className="text-xl font-semibold tracking-tight text-[#1A1814] dark:text-[#F5F5F0] mb-2">
                Publish items to this sale?
              </h2>
              <p className="text-sm text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] leading-relaxed">
                Each item will go live with the values currently shown. Smart's title,
                category, condition, your price, and tags. You can edit any item later
                from the manager.
              </p>
              {/* Validation note */}
              {pendingItems.some(i => {
                const p = getPriceInput(i.id);
                return !p.trim() || isNaN(parseFloat(p)) || parseFloat(p) <= 0;
              }) && (
                <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  Items without a price will be skipped. Approve only priced items.
                </div>
              )}
            </div>
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <button
                onClick={() => setShowApproveAllModal(false)}
                className="px-4 py-2 rounded-lg border border-black/18 dark:border-[#3A3A3C] text-sm font-medium text-[#1A1814] dark:text-[#F5F5F0] hover:bg-black/5 dark:hover:bg-[#3A3A3C] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveAll}
                className="px-4 py-2 rounded-lg bg-[#C8552B] text-white text-sm font-semibold hover:bg-[#b04825] transition-colors"
              >
                Publish priced items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard-all confirmation modal */}
      {showDiscardAllModal && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#FBF8F2] dark:bg-[#2C2C2E] rounded-2xl border border-black/10 dark:border-[#3A3A3C] shadow-2xl overflow-hidden">
            <div className="p-7">
              <p className="text-[10px] font-mono tracking-widest uppercase text-red-600 mb-2">Destructive action</p>
              <h2 className="text-xl font-semibold tracking-tight text-[#1A1814] dark:text-[#F5F5F0] mb-2">
                Discard {pendingItems.length} item{pendingItems.length !== 1 ? 's' : ''}?
              </h2>
              <p className="text-sm text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] leading-relaxed">
                This permanently removes these items and their photos. This cannot be undone.
              </p>
            </div>
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <button
                onClick={() => setShowDiscardAllModal(false)}
                className="px-4 py-2 rounded-lg border border-black/18 dark:border-[#3A3A3C] text-sm font-medium text-[#1A1814] dark:text-[#F5F5F0] hover:bg-black/5 dark:hover:bg-[#3A3A3C] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscardAll}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? 'Discarding…' : 'Discard all'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="min-h-screen bg-[#F4EFE7] dark:bg-[#1C1C1E]" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-20 pt-8">

          {/* ── Page header ── */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.4)] dark:text-[#B8B8BA] mb-1">
                Item Manager · Smart Review
              </p>
              <h1
                className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1A1814] dark:text-[#F5F5F0]"
                style={{ fontFamily: 'Inter Tight, sans-serif', letterSpacing: '-0.02em' }}
              >
                {itemsLoading
                  ? 'Loading queue…'
                  : queueEmpty
                  ? `All ${totalCount} items are live`
                  : `Review ${pendingItems.length} item${pendingItems.length !== 1 ? 's' : ''} before they go live`}
              </h1>
              {!itemsLoading && pendingItems.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedItems(selectAllVisible(pendingIds))}
                    disabled={bulkBusy || allVisibleSelected(selectedItems, pendingIds)}
                    className="px-3 py-1.5 rounded-lg border border-black/18 dark:border-[#3A3A3C] text-xs font-medium text-[#1A1814] dark:text-[#F5F5F0] hover:bg-black/5 dark:hover:bg-[#3A3A3C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Select all ({pendingItems.length})
                  </button>
                  {selectedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedItems(new Set())}
                      disabled={bulkBusy}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] hover:bg-black/6 dark:hover:bg-[#3A3A3C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 sm:flex-shrink-0">
              {saleId && (
                <Link
                  href={`/sales/${saleId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 text-sm text-[#C8552B] hover:underline transition-colors"
                >
                  View live sale →
                </Link>
              )}
              <Link
                href={`/organizer/add-items/${saleId}`}
                className="px-3 py-2 rounded-lg border border-black/18 dark:border-[#3A3A3C] text-sm font-medium text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] hover:bg-black/5 dark:hover:bg-[#3A3A3C] transition-colors"
              >
                ← Back
              </Link>
            </div>
          </div>

          {/* ── Sticky bulk actions bar ── */}
          {!itemsLoading && !queueEmpty && (
            <div className="sticky top-4 z-10 mb-5">
              <div
                className="bg-[#FBF8F2] dark:bg-[#2C2C2E] rounded-xl border border-black/10 dark:border-[#3A3A3C] px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm"
              >
                {/* Left: count + progress */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(200,85,43,0.10)', color: '#C8552B' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1A1814] dark:text-[#F5F5F0] whitespace-nowrap">{pendingItems.length} pending review</p>
                    <p className="text-xs text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] whitespace-nowrap">{publishedCount} of {totalCount} published</p>
                  </div>
                  {/* Progress bar: hidden on very small screens */}
                  <div className="hidden sm:block w-28">
                    <div className="h-1.5 rounded-full bg-black/6 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#3F7A4B] transition-all"
                        style={{ width: totalCount > 0 ? `${(publishedCount / totalCount) * 100}%` : '0%' }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] font-mono tracking-wide text-[rgba(26,24,20,0.4)] dark:text-[#B8B8BA]">
                      {totalCount > 0 ? Math.round((publishedCount / totalCount) * 100) : 0}% published
                    </p>
                  </div>
                </div>

                {/* Right: actions: flex-shrink-0 keeps them together */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setShowDiscardAllModal(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] hover:bg-black/6 dark:hover:bg-[#3A3A3C] border border-transparent hover:border-black/10 dark:hover:border-[#3A3A3C] transition-colors"
                  >
                    Discard all
                  </button>
                  <Link
                    href={`/organizer/label-composer/${saleId}`}
                    className="hidden sm:block px-3 py-1.5 rounded-lg text-xs font-medium text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] hover:bg-black/6 dark:hover:bg-[#3A3A3C] border border-black/18 dark:border-[#3A3A3C] transition-colors"
                  >
                    Print labels
                  </Link>
                  <button
                    onClick={() => setShowApproveAllModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-[#C8552B] text-white text-xs font-semibold hover:bg-[#b04825] transition-colors"
                  >
                    Approve all
                  </button>
                </div>
              </div>

              {/* Selection bulk bar: appears when at least one card is selected. Never publishes anything. */}
              {selectedCount > 0 && (
                <div
                  role="region"
                  aria-label="Bulk actions for selected items"
                  className="mt-2 bg-[#FBF8F2] dark:bg-[#2C2C2E] rounded-xl border border-[#C8552B]/40 px-4 py-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p aria-live="polite" className="text-sm font-semibold text-[#1A1814] dark:text-[#F5F5F0] whitespace-nowrap">
                      {selectedCountText(selectedCount)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedItems(new Set())}
                      disabled={bulkBusy}
                      className="px-2 py-1 rounded-lg text-xs font-medium text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] hover:bg-black/6 dark:hover:bg-[#3A3A3C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Clear
                    </button>
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => setBulkMode((m) => (m === 'price' ? null : 'price'))}
                        disabled={bulkBusy}
                        aria-expanded={bulkMode === 'price'}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                          bulkMode === 'price'
                            ? 'border-[#C8552B] text-[#C8552B] bg-[#C8552B]/5'
                            : 'border-black/18 dark:border-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] hover:bg-black/5 dark:hover:bg-[#3A3A3C]'
                        }`}
                      >
                        Set price
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkMode((m) => (m === 'category' ? null : 'category'))}
                        disabled={bulkBusy}
                        aria-expanded={bulkMode === 'category'}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                          bulkMode === 'category'
                            ? 'border-[#C8552B] text-[#C8552B] bg-[#C8552B]/5'
                            : 'border-black/18 dark:border-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] hover:bg-black/5 dark:hover:bg-[#3A3A3C]'
                        }`}
                      >
                        Set category
                      </button>
                    </div>
                  </div>

                  {bulkMode === 'price' && (
                    <form
                      className="mt-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (bulkPriceValue !== null && !bulkBusy) handleBulkPrice();
                      }}
                    >
                      <label htmlFor="bulk-price-input" className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.6)] dark:text-[#B8B8BA] mb-1">
                        New price for {itemsCountText(selectedCount)}
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-32">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(26,24,20,0.5)] dark:text-[#B8B8BA]" aria-hidden="true">$</span>
                          <input
                            id="bulk-price-input"
                            type="number"
                            inputMode="decimal"
                            min="0.01"
                            step="0.01"
                            value={bulkPrice}
                            onChange={(e) => setBulkPrice(e.target.value)}
                            disabled={bulkBusy}
                            placeholder="0.00"
                            className="w-full pl-7 pr-3 py-2 rounded-lg border border-black/18 dark:border-[#3A3A3C] bg-white dark:bg-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#C8552B]/40 disabled:opacity-50"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={bulkPriceValue === null || bulkBusy}
                          className="px-3 py-2 rounded-lg bg-[#C8552B] text-white text-xs font-semibold hover:bg-[#b04825] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {bulkUpdateMutation.isPending ? 'Applying…' : bulkPriceButtonText(bulkPriceValue, selectedCount)}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA]">
                        Saves this price on every selected item. Nothing is published. Items already listed on eBay cannot go below $0.99; those are skipped and you will see a note.
                      </p>
                    </form>
                  )}

                  {bulkMode === 'category' && (
                    <div className="mt-3">
                      <p className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.6)] dark:text-[#B8B8BA] mb-1">
                        New category for {itemsCountText(selectedCount)}
                      </p>
                      <div className={`flex flex-wrap items-start gap-2 ${bulkBusy ? 'pointer-events-none opacity-50' : ''}`} aria-busy={bulkBusy}>
                        <div className="flex-1 min-w-[12rem]">
                          <EbayCategoryPicker
                            key={bulkPickerKey}
                            value={bulkCategory}
                            onChange={({ l1CategoryName, leafCategoryId, leafCategoryName }) => {
                              setBulkCategory(l1CategoryName);
                              setBulkCategoryPick(
                                l1CategoryName || leafCategoryId || leafCategoryName
                                  ? { l1CategoryName, leafCategoryId, leafCategoryName }
                                  : null
                              );
                            }}
                            label=""
                            placeholder="Search eBay categories…"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={runBulkCategory}
                          disabled={!bulkCategoryPick || bulkBusy}
                          className="px-3 py-2 rounded-lg bg-[#C8552B] text-white text-xs font-semibold hover:bg-[#b04825] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {bulkCategoryBusy ? 'Applying…' : bulkCategoryButtonText(selectedCount)}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA]">
                        Sets the category and the eBay category on every selected item. Nothing is published.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Loading state ── */}
          {itemsLoading && (
            <div className="space-y-4">
              {[1, 2, 3].map(n => (
                <Skeleton key={n} className="h-56 w-full rounded-xl" />
              ))}
            </div>
          )}

          {/* ── Empty / success state ── */}
          {!itemsLoading && queueEmpty && (
            <div className="mt-8 flex justify-center">
              <div className="w-full max-w-lg bg-[#FBF8F2] dark:bg-[#2C2C2E] rounded-2xl border border-black/10 dark:border-[#3A3A3C] p-12 text-center">
                <div
                  className="w-14 h-14 rounded-full inline-flex items-center justify-center mb-6"
                  style={{ background: 'rgba(63,122,75,0.12)', color: '#3F7A4B' }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l4 4 10-10" />
                  </svg>
                </div>
                <p className="text-[10px] font-mono tracking-widest uppercase text-[#3F7A4B] mb-2">Queue clear</p>
                <h2
                  className="text-2xl font-semibold tracking-tight text-[#1A1814] dark:text-[#F5F5F0] mb-3"
                  style={{ fontFamily: 'Inter Tight, sans-serif', letterSpacing: '-0.02em' }}
                >
                  All {totalCount} items are live
                </h2>
                <p className="text-sm text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] mb-8 leading-relaxed">
                  Smart-tagged items appear in saved-search alerts within the hour.
                  You can edit any item from the manager.
                </p>
                <div className="flex gap-3 justify-center">
                  <Link
                    href={`/sales/${saleId}`}
                    className="px-4 py-2 rounded-lg bg-[#C8552B] text-white text-sm font-semibold hover:bg-[#b04825] transition-colors"
                  >
                    View sale →
                  </Link>
                  <Link
                    href={`/organizer/add-items/${saleId}`}
                    className="px-4 py-2 rounded-lg border border-black/18 dark:border-[#3A3A3C] text-sm font-medium text-[#1A1814] dark:text-[#F5F5F0] hover:bg-black/5 dark:hover:bg-[#3A3A3C] transition-colors"
                  >
                    Open item manager
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* ── No items at all ── */}
          {!itemsLoading && items.length === 0 && (
            <div className="mt-12 text-center">
              <p className="text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] mb-4">No items in this sale yet.</p>
              <Link
                href={`/organizer/add-items/${saleId}`}
                className="text-sm text-[#C8552B] font-medium hover:underline"
              >
                ← Add items
              </Link>
            </div>
          )}

          {/* ── Review cards ── */}
          {!itemsLoading && pendingItems.length > 0 && (
            <div className="space-y-4">
              {pendingItems.map((item) => {
                const editState = getEditState(item);
                const priceStr = getPriceInput(item.id);
                const hasError = priceErrors.has(item.id);
                // Grade-click suggestion prompt: shown only while it differs from the price field.
                const gradeSuggestion = suggestedPrices.get(item.id);
                const suggestedChipPrice = gradeSuggestion?.price;
                const typedPriceVal = parseFloat(priceStr);
                const showSuggestedChip =
                  suggestedChipPrice != null &&
                  (isNaN(typedPriceVal) || Math.abs(typedPriceVal - suggestedChipPrice) >= 0.005);
                const currentTags = editState.tags || item.tags || [];
                const rarityKey = item.rarity && rarityColors[item.rarity] ? item.rarity : 'COMMON';
                const readiness = computeItemReadiness(item, editState, typedPriceForReadiness(priceInputs, item.id), ebayConnected);
                const readinessBorderColor = {
                  red: '#ef4444',
                  yellow: '#facc15',
                  green: '#22c55e',
                  blue: '#3b82f6',
                }[readiness];

                return (
                  <div
                    key={item.id}
                    ref={(el) => { if (el) itemRefs.current.set(item.id, el); }}
                    className={`relative bg-[#FBF8F2] dark:bg-[#2C2C2E] rounded-xl border border-black/10 dark:border-[#3A3A3C] border-l-4 overflow-hidden${selectedItems.has(item.id) ? ' ring-2 ring-[#C8552B]/50' : ''}`}
                    style={{ boxShadow: '0 1px 3px rgba(20,18,14,0.06)', borderLeftColor: readinessBorderColor }}
                  >

                    <div className="pl-5 pr-5 pt-5 pb-5">
                      {/* Smart chip row */}
                      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-2 min-h-[40px] pr-1 cursor-pointer select-none text-[11px] font-medium text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA]">
                            <input
                              type="checkbox"
                              checked={selectedItems.has(item.id)}
                              disabled={bulkBusy}
                              onChange={() => setSelectedItems((prev) => toggleSelection(prev, item.id))}
                              aria-label={`Select ${editState.title?.trim() || item.title || 'item'}`}
                              className="h-5 w-5 rounded border-black/30 accent-[#C8552B] focus:outline-none focus:ring-2 focus:ring-[#C8552B]/40"
                            />
                            Select
                          </label>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono tracking-widest uppercase"
                          style={{ background: 'rgba(200,85,43,0.10)', color: '#C8552B' }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                          </svg>
                          Smart
                        </span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3">
                          {item.isAiTagged && item.aiConfidence != null && (
                            <span className="text-[10px] font-mono tracking-wide text-[rgba(26,24,20,0.4)] dark:text-[#B8B8BA]">
                              {Math.round(item.aiConfidence * 100)}% confidence
                            </span>
                          )}
                          {/* Re-analyze: re-run Smart tagging on this item's stored photos (no re-upload) */}
                          <button
                            type="button"
                            onClick={() => requestReanalyze(item)}
                            disabled={reanalyzingIds.has(item.id) || item.photoUrls.length === 0}
                            title={item.photoUrls.length === 0 ? 'Add a photo to re-analyze' : 'Re-run Smart tagging on this item\u2019s photos'}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-black/12 dark:border-[#3A3A3C] text-[11px] font-medium text-[rgba(26,24,20,0.62)] dark:text-[#F5F5F0] hover:bg-black/5 dark:hover:bg-[#3A3A3C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            aria-label="Re-analyze item"
                          >
                            {reanalyzingIds.has(item.id) ? (
                              <>
                                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                Re-analyzing
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M23 4v6h-6" />
                                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                </svg>
                                Re-analyze
                              </>
                            )}
                          </button>
                          {/* Feature #565: "Identify precisely" - same reanalyze flow (one API call),
                              distinct label/icon so organizers understand it targets grounded-identity
                              lookup specifically. Hidden once the item already has photos disabled. */}
                          <button
                            type="button"
                            onClick={() => requestReanalyze(item, { forceGrounding: true })}
                            disabled={reanalyzingIds.has(item.id) || item.photoUrls.length === 0}
                            title={item.photoUrls.length === 0 ? 'Add a photo to identify precisely' : 'Look up this item\u2019s exact identity from its photos and markings'}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[#C8552B]/30 dark:border-[#C8552B]/40 text-[11px] font-medium text-[#C8552B] dark:text-[#E08A5F] hover:bg-[#C8552B]/5 dark:hover:bg-[#C8552B]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            aria-label="Identify item precisely"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="11" cy="11" r="7" />
                              <line x1="16.65" y1="16.65" x2="21" y2="21" />
                            </svg>
                            Identify precisely
                          </button>
                        </div>
                      </div>
                      {(() => {
                        const groundedOverride = groundedOverrides.get(item.id);
                        const groundedIdentity = groundedOverride ? groundedOverride.groundedIdentity : item.groundedIdentity;
                        const groundedConfidence = groundedOverride ? groundedOverride.groundedConfidence : item.groundedConfidence;
                        const groundedSource = groundedOverride ? groundedOverride.groundedSource : item.groundedSource;
                        if (!groundedIdentity) return null;
                        const sourceLabels: Record<string, string> = {
                          'text-grounded': 'Identified from text/markings',
                          'visual-consensus': 'Identified from photo match (high confidence)',
                          'visual-single': 'Identified from photo match',
                        };
                        const sourceLabel = (groundedSource && sourceLabels[groundedSource]) || 'Identified from photos';
                        const confidencePct = typeof groundedConfidence === 'number' ? Math.round(groundedConfidence * 100) : null;
                        return (
                          <div className="-mt-2 mb-3 flex items-start gap-1.5 text-[11px] text-[rgba(26,24,20,0.55)] dark:text-[#B8B8BA]">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px flex-shrink-0" aria-hidden="true">
                              <circle cx="11" cy="11" r="7" />
                              <line x1="16.65" y1="16.65" x2="21" y2="21" />
                            </svg>
                            <span>
                              <span className="font-medium text-[rgba(26,24,20,0.7)] dark:text-[#F5F5F0]">{groundedIdentity}</span>
                              {confidencePct !== null && <span> &middot; {confidencePct}% confidence</span>}
                              <span> &middot; {sourceLabel}</span>
                            </span>
                          </div>
                        );
                      })()}
                      {reanalyzeErrors.has(item.id) && (
                        <div className="-mt-2 mb-3 flex items-start gap-1.5 text-[11px] text-red-500 dark:text-red-400" role="alert">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px flex-shrink-0" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <span>{reanalyzeErrors.get(item.id)}</span>
                        </div>
                      )}

                      {/* Desktop layout: photo | fields | price rail: stacks on mobile */}
                      <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">

                        {/* Thumbnail: full width on mobile, fixed width on sm+ */}
                        <div className="flex-shrink-0 w-full sm:w-32">
                          <div className="flex sm:block gap-3 items-start">
                          <button
                            type="button"
                            onClick={() => item.photoUrls[0] && setZoomedPhoto(item.photoUrls[0])}
                            className="block w-24 sm:w-full aspect-square rounded-lg overflow-hidden border border-black/10 dark:border-[#3A3A3C] bg-[rgba(20,18,14,0.04)] dark:bg-[#3A3A3C] focus:outline-none flex-shrink-0"
                            title="Tap to zoom"
                          >
                            {item.photoUrls[0] ? (
                              <img
                                src={item.photoUrls[0]}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer-when-downgrade"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" fill="%23e5e7eb"/%3E%3Ctext x="50%25" y="50%25" font-size="24" text-anchor="middle" dy=".3em" fill="%239ca3af"%3E📷%3C/text%3E%3C/svg%3E';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-2xl text-[rgba(26,24,20,0.3)]">📷</div>
                            )}
                          </button>
                          <p className="mt-1 text-center text-[10px] font-mono text-[rgba(26,24,20,0.4)] dark:text-[#B8B8BA]">
                            {item.photoUrls.length} photo{item.photoUrls.length !== 1 ? 's' : ''}
                          </p>
                          </div>{/* end mobile flex wrapper */}
                        </div>

                        {/* Main fields */}
                        <div className="flex-1 min-w-0 space-y-3">

                          {/* Title */}
                          <div>
                            <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.6)] dark:text-[#B8B8BA] mb-1">
                              Title <span className="text-[#C8552B]">· Smart</span>
                            </label>
                            <input
                              type="text"
                              value={editState.title}
                              onChange={(e) => handleEditChange(item.id, 'title', e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-black/18 dark:border-[#3A3A3C] bg-white dark:bg-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#C8552B]/40"
                              style={{ fontFamily: 'Inter Tight, sans-serif' }}
                            />
                          </div>

                          {/* Category + Condition row */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.4)] dark:text-[#B8B8BA] mb-1">
                                Category
                              </label>
                              <EbayCategoryPicker
                                value={editState.category}
                                ebayCategoryName={editState.ebayCategoryName || item.ebayCategoryName || undefined}
                                onChange={({ leafCategoryName, leafCategoryId, l1CategoryName }) => {
                                  handleEditChange(item.id, 'category', l1CategoryName);
                                  handleEditChange(item.id, 'ebayCategoryId', leafCategoryId);
                                  handleEditChange(item.id, 'ebayCategoryName', leafCategoryName);
                                }}
                                label=""
                                placeholder="Select category…"
                                defaultSearch={(!editState.ebayCategoryName && !item.ebayCategoryName) ? (editState.category || item.category || undefined) : undefined}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.6)] dark:text-[#B8B8BA] mb-1">
                                Condition <span className="text-[#C8552B]">· Smart</span>
                              </label>
                              {/* Segmented control */}
                              <div className="inline-flex w-full bg-[rgba(20,18,14,0.05)] dark:bg-[#1C1C1E] p-0.5 rounded-lg border border-black/10 dark:border-[#3A3A3C]">
                                {conditionOptions.map(opt => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleEditChange(item.id, 'condition', opt.value)}
                                    className={`flex-1 py-1.5 text-xs font-mono rounded-md transition-all ${
                                      editState.condition === opt.value
                                        ? 'bg-white dark:bg-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] font-semibold shadow-sm'
                                        : 'text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] hover:text-[#1A1814] dark:hover:text-[#F5F5F0]'
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Brand / MPN / UPC row: eBay product identifiers */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.6)] dark:text-[#B8B8BA] mb-1">
                                Brand <span className="text-[#C8552B]">· eBay</span>
                              </label>
                              <input
                                type="text"
                                value={editState.brand ?? ''}
                                onChange={(e) => handleEditChange(item.id, 'brand', e.target.value)}
                                placeholder="e.g. Pyrex"
                                className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-white dark:bg-[#1C1C1E] text-[#1A1814] dark:text-[#F5F5F0] border border-black/10 dark:border-[#3A3A3C] focus:outline-none focus:border-[rgba(26,24,20,0.3)] dark:focus:border-[#B8B8BA] placeholder-[rgba(26,24,20,0.4)] dark:placeholder-[#B8B8BA]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.4)] dark:text-[#B8B8BA] mb-1">
                                MPN <span className="text-[rgba(26,24,20,0.35)] dark:text-[#8A8A8C]">· optional</span>
                              </label>
                              <input
                                type="text"
                                value={editState.mpn ?? ''}
                                onChange={(e) => handleEditChange(item.id, 'mpn', e.target.value)}
                                placeholder="Mfr part #"
                                className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-white dark:bg-[#1C1C1E] text-[#1A1814] dark:text-[#F5F5F0] border border-black/10 dark:border-[#3A3A3C] focus:outline-none focus:border-[rgba(26,24,20,0.3)] dark:focus:border-[#B8B8BA] placeholder-[rgba(26,24,20,0.4)] dark:placeholder-[#B8B8BA]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.4)] dark:text-[#B8B8BA] mb-1">
                                UPC <span className="text-[rgba(26,24,20,0.35)] dark:text-[#8A8A8C]">· optional</span>
                              </label>
                              <input
                                type="text"
                                value={editState.upc ?? ''}
                                onChange={(e) => handleEditChange(item.id, 'upc', e.target.value)}
                                placeholder="Barcode"
                                className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-white dark:bg-[#1C1C1E] text-[#1A1814] dark:text-[#F5F5F0] border border-black/10 dark:border-[#3A3A3C] focus:outline-none focus:border-[rgba(26,24,20,0.3)] dark:focus:border-[#B8B8BA] placeholder-[rgba(26,24,20,0.4)] dark:placeholder-[#B8B8BA]"
                              />
                            </div>
                          </div>

                          {/* Tags row */}
                          <div>
                            <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.6)] dark:text-[#B8B8BA] mb-1.5">
                              Search tags <span className="text-[#C8552B]">· Smart</span>
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {currentTags.map(tag => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-[11px] font-mono"
                                  style={{ background: 'rgba(200,85,43,0.10)', color: '#C8552B' }}
                                >
                                  {tag}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTag(item.id, tag)}
                                    className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[rgba(200,85,43,0.2)] transition-colors"
                                  >
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                      <path d="M6 6l12 12M18 6l-12 12" />
                                    </svg>
                                  </button>
                                </span>
                              ))}
                              {/* Add tag inline */}
                              <input
                                type="text"
                                value={addTagInputs.get(item.id) ?? ''}
                                onChange={(e) => setAddTagInputs(prev => new Map(prev).set(item.id, e.target.value))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleAddCustomTag(item.id, addTagInputs.get(item.id) ?? '');
                                    setAddTagInputs(prev => new Map(prev).set(item.id, ''));
                                  }
                                }}
                                placeholder="+ tag"
                                className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-[rgba(20,18,14,0.05)] dark:bg-[#3A3A3C] text-[rgba(26,24,20,0.62)] dark:text-[#F5F5F0] border border-transparent focus:outline-none focus:border-[rgba(26,24,20,0.2)] dark:focus:border-[#B8B8BA] placeholder-[rgba(26,24,20,0.4)] dark:placeholder-[#B8B8BA]"
                                style={{ width: '5rem' }}
                              />
                            </div>
                          </div>

                          {/* Rarity picker */}
                          <div>
                            <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.6)] dark:text-[#B8B8BA] mb-1.5">
                              Rarity <span className="text-[#C8552B]">· Smart</span>
                            </label>
                            <div className="flex gap-1.5">
                              {(['COMMON', 'UNCOMMON', 'RARE', 'LEGENDARY'] as const).map(r => {
                                const rc = rarityColors[r];
                                const sel = rarityKey === r;
                                return (
                                  <button
                                    key={r}
                                    type="button"
                                    onClick={() => updateItemMutation.mutate({ itemId: item.id, updates: { rarity: r } as any })}
                                    className={`flex-1 py-1.5 text-center rounded-lg text-[10px] font-mono tracking-wide transition-all border ${!sel ? 'text-[rgba(26,24,20,0.5)] dark:text-[#B8B8BA] border-black/10 dark:border-[#3A3A3C]' : ''}`}
                                    style={{
                                      background: sel ? (isDark ? rc.darkBg : rc.bg) : 'transparent',
                                      color: sel ? (isDark ? rc.darkFg : rc.fg) : undefined,
                                      borderColor: sel ? 'transparent' : undefined,
                                      fontWeight: sel ? 700 : 500,
                                    }}
                                  >
                                    {r.slice(0, 4)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Right rail: price + actions: full width on mobile, fixed on sm+ */}
                        <div className="w-full sm:flex-shrink-0 sm:w-52 flex flex-col gap-3">

                          {/* ── PRICE FIELD: Critical rule: never pre-fill aiSuggestedPrice ── */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className={`text-[10px] font-mono tracking-widest uppercase ${hasError ? 'text-[#C04A2B]' : 'text-[rgba(26,24,20,0.4)] dark:text-[#B8B8BA]'}`}>
                                Your price{hasError ? ' · Required' : ''}
                              </label>
                              {/* aiSuggestedPrice reference: display only from PriceSuggestion */}
                            </div>
                            {/* PriceSuggestion shows the Smart reference price (read-only) */}
                            <div className="mb-1.5">
                              <PriceSuggestion
                                itemId={item.id}
                                title={getEditState(item).title}
                                category={getEditState(item).category}
                                condition={getEditState(item).condition}
                                conditionGrade={getEditState(item).conditionGrade}
                                photoUrls={item.photoUrls}
                                currentPrice={item.price ?? undefined}
                                autoRefreshToken={priceRefreshTokens.get(item.id)}
                                onApplyPrice={(price) => setPriceInput(item.id, String(price))}
                              />
                            </div>
                            {/* Price input: starts empty, organizer must type */}
                            <div
                              className="flex items-center gap-1 px-3 py-2.5 rounded-lg border-2 bg-white dark:bg-[#3A3A3C] transition-colors"
                              style={{ borderColor: hasError ? '#C04A2B' : 'rgba(20,18,14,0.18)' }}
                            >
                              <span
                                className="text-xl font-medium text-[rgba(26,24,20,0.4)] dark:text-[#B8B8BA]"
                                style={{ fontFamily: 'Inter Tight, sans-serif' }}
                              >
                                $
                              </span>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={priceStr}
                                onChange={(e) => setPriceInput(item.id, e.target.value)}
                                placeholder="0.00"
                                aria-label="Your price"
                                className="flex-1 min-w-0 bg-transparent text-xl font-semibold text-[#1A1814] dark:text-[#F5F5F0] focus:outline-none placeholder-[rgba(26,24,20,0.25)] dark:placeholder-[#B8B8BA]"
                                style={{ fontFamily: 'Inter Tight, sans-serif' }}
                              />
                            </div>
                            {showSuggestedChip && gradeSuggestion && suggestedChipPrice != null && (
                              <div
                                role="status"
                                className="mt-1.5 p-2.5 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 space-y-2"
                              >
                                <p className="text-xs text-amber-800 dark:text-amber-200">
                                  {gradeSuggestionLine(gradeSuggestion)}
                                </p>
                                {gradeSuggestion.disclosure && (
                                  <p className="text-[11px] text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA]">
                                    {gradeSuggestion.disclosure}
                                  </p>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => applySuggestedPrice(item, suggestedChipPrice)}
                                    className="flex-1 min-h-[44px] px-3 rounded-lg bg-[#4A7C59] hover:bg-[#3d654a] dark:bg-[#4A7C59] dark:hover:bg-[#3d654a] text-white text-xs font-semibold transition-colors"
                                  >
                                    {`Use $${suggestedChipPrice.toFixed(2)}`}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => clearSuggestedPrice(item.id)}
                                    className="min-h-[44px] px-3 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-warm-800 dark:text-warm-200 text-xs font-medium transition-colors"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              </div>
                            )}
                            {hasError && (
                              <p className="mt-1 text-xs text-[#C04A2B] flex items-center gap-1">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                  <circle cx="12" cy="12" r="9" /><path d="M12 8v.01M11 12h1v5h1" />
                                </svg>
                                Set a price before publishing
                              </p>
                            )}
                            {!priceStr && !hasError && (
                              <p className="mt-1 text-[11px] text-[rgba(26,24,20,0.4)] dark:text-[#B8B8BA] italic">
                                Tap Use on a suggestion, or type your price.
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col gap-2 mt-auto">
                            <button
                              type="button"
                              onClick={() => handleApproveItem(item)}
                              disabled={updateItemMutation.isPending}
                              className="w-full py-2.5 rounded-lg bg-[#C8552B] text-white text-sm font-semibold hover:bg-[#b04825] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12l4 4 10-10" />
                              </svg>
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => openItemSheet(item)}
                              aria-haspopup="dialog"
                              className="w-full min-h-[44px] py-2 rounded-lg border border-black/18 dark:border-[#3A3A3C] text-sm font-medium text-[rgba(26,24,20,0.62)] dark:text-[#F5F5F0] hover:bg-black/5 dark:hover:bg-[#3A3A3C] transition-colors"
                            >
                              All details
                            </button>
                            <Link
                              href={`/organizer/edit-item/${item.id}`}
                              className="w-full py-2 rounded-lg border border-black/18 dark:border-[#3A3A3C] text-sm font-medium text-[rgba(26,24,20,0.62)] dark:text-[#F5F5F0] hover:bg-black/5 dark:hover:bg-[#3A3A3C] transition-colors text-center"
                            >
                              Edit more
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmState({
                                  open: true,
                                  title: 'Delete Item',
                                  message: `Delete "${item.title || 'this item'}"? This cannot be undone.`,
                                  onConfirm: () => {
                                    deleteMutation.mutate([item.id]);
                                    setConfirmState(s => ({ ...s, open: false }));
                                  },
                                });
                              }}
                              disabled={deleteMutation.isPending}
                              className="w-full py-1.5 text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                            >
                              Discard
                            </button>
                            {/* Draft autosave status: quiet, announced politely, no toasts */}
                            <p
                              role="status"
                              aria-live="polite"
                              className="min-h-[16px] text-[11px] text-center text-[rgba(26,24,20,0.5)] dark:text-[#B8B8BA]"
                            >
                              {autosaveStatusText(autosaveStatuses.get(item.id) ?? 'idle')}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Expanded detail panel: toggle */}
                      <div className="mt-4 pt-4 border-t border-black/8">
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(item.id)}
                          className="text-xs font-medium text-[rgba(26,24,20,0.5)] dark:text-[#B8B8BA] hover:text-[#1A1814] dark:hover:text-[#F5F5F0] transition-colors flex items-center gap-1"
                        >
                          {expandedItemId === item.id ? '▲ Less details' : '▼ More details (description, condition grade, listing type)'}
                        </button>

                        {expandedItemId === item.id && (
                          <div className="mt-4 space-y-4">
                            {/* Photos manager */}
                            <div>
                              <input
                                ref={(ref) => {
                                  if (ref && !(window as any)[`uploadInput_${item.id}`]) {
                                    (window as any)[`uploadInput_${item.id}`] = ref;
                                  }
                                }}
                                type="file"
                                accept="image/*"
                                multiple
                                hidden
                                onChange={(e) => handlePhotoUpload(item.id, e.target.files, 'upload')}
                              />
                              <ItemPhotoManager
                                itemId={item.id}
                                initialPhotos={item.photoUrls || []}
                                headerActions={
                                  <div className="flex gap-1">
                                    <button type="button" title="Upload files" onClick={() => ((window as any)[`uploadInput_${item.id}`] as any)?.click()}
                                      className="w-7 h-7 flex items-center justify-center bg-amber-100 text-amber-700 rounded hover:bg-amber-200 text-sm">📁</button>
                                    <button type="button" title="Camera" onClick={() => { setInlineCaptureMode('regular'); setInlineCaptureItemId(item.id); setInlineCaptureItem(item); setInlineRapidItems([{ id: item.id, thumbnailUrl: item.photoUrls?.[0], draftStatus: 'PENDING_REVIEW', title: item.title, photoUrls: item.photoUrls || [] }]); setInlineCameraOpen(true); }}
                                      className="w-7 h-7 flex items-center justify-center bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm">📷</button>
                                    <button type="button" title="Rapidfire" onClick={() => { setInlineCaptureMode('rapidfire'); setInlineCaptureItemId(item.id); setInlineCaptureItem(item); setInlineRapidItems([{ id: item.id, thumbnailUrl: item.photoUrls?.[0], draftStatus: 'PENDING_REVIEW', title: item.title, photoUrls: item.photoUrls || [] }]); setInlineCameraOpen(true); }}
                                      className="w-7 h-7 flex items-center justify-center bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-sm">⚡</button>
                                  </div>
                                }
                              />
                            </div>

                            {/* Description */}
                            <div>
                              <label className="block text-xs font-medium text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] mb-1">Description</label>
                              <textarea
                                rows={3}
                                value={editState.description}
                                onChange={(e) => handleEditChange(item.id, 'description', e.target.value)}
                                className="w-full border border-black/18 dark:border-[#3A3A3C] bg-white dark:bg-[#3A3A3C] rounded-lg px-3 py-2 text-sm text-[#1A1814] dark:text-[#F5F5F0] focus:outline-none focus:ring-2 focus:ring-[#C8552B]/40"
                              />
                            </div>

                            {/* Package weight & dimensions (2026-08-13, moved here per Patrick: general item data, not eBay-only -- also used for eBay fulfillment-policy selection) */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                                  Shipping details <span className="font-normal text-blue-500">(required for eBay)</span>
                                </p>
                                {item.packageConfirmedByOrganizer !== true && (
                                  <button
                                    type="button"
                                    onClick={() => handleGetPackageEstimate(item)}
                                    disabled={packageEstimateLoadingIds.has(item.id)}
                                    className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {packageEstimateLoadingIds.has(item.id) ? 'Getting estimate…' : 'Get Smart estimate'}
                                  </button>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-mono uppercase text-blue-600 dark:text-blue-400 mb-1">Weight (oz)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    placeholder="e.g. 16"
                                    aria-label="Package weight in ounces"
                                    value={editState.packageWeightOz ?? ''}
                                    onChange={(e) => handleEditChange(item.id, 'packageWeightOz', e.target.value ? Number(e.target.value) : undefined)}
                                    className="w-full border border-blue-200 dark:border-blue-700 bg-white dark:bg-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-mono uppercase text-blue-600 dark:text-blue-400 mb-1">Length (in)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    placeholder="e.g. 12"
                                    aria-label="Package length in inches"
                                    value={editState.packageLengthIn ?? ''}
                                    onChange={(e) => handleEditChange(item.id, 'packageLengthIn', e.target.value ? Number(e.target.value) : undefined)}
                                    className="w-full border border-blue-200 dark:border-blue-700 bg-white dark:bg-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-mono uppercase text-blue-600 dark:text-blue-400 mb-1">Width (in)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    placeholder="e.g. 8"
                                    aria-label="Package width in inches"
                                    value={editState.packageWidthIn ?? ''}
                                    onChange={(e) => handleEditChange(item.id, 'packageWidthIn', e.target.value ? Number(e.target.value) : undefined)}
                                    className="w-full border border-blue-200 dark:border-blue-700 bg-white dark:bg-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-mono uppercase text-blue-600 dark:text-blue-400 mb-1">Height (in)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    placeholder="e.g. 4"
                                    aria-label="Package height in inches"
                                    value={editState.packageHeightIn ?? ''}
                                    onChange={(e) => handleEditChange(item.id, 'packageHeightIn', e.target.value ? Number(e.target.value) : undefined)}
                                    className="w-full border border-blue-200 dark:border-blue-700 bg-white dark:bg-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Condition grade: A to D for used goods only; S shows as "S (legacy)" only on an item that has it */}
                            {(() => {
                              const current = editState.conditionGrade ?? item.conditionGrade;
                              const picker = gradePickerFor(editState.condition || item.condition, current);
                              // A trading card is graded on the card scale (NM/LP/MP/HP/DMG), not A to D.
                              if (item.card) return <CardConditionConfirm itemId={item.id} />;
                              if (!picker.show) return null;
                              return (
                                <div>
                                  <label className="text-xs font-medium text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] mb-1 block">
                                    Condition Grade
                                    {item.suggestedConditionGrade && (
                                      <span className="ml-2 text-[#C8552B] font-normal">Auto-suggests: {item.suggestedConditionGrade}</span>
                                    )}
                                  </label>
                                  <div className="flex gap-2">
                                    {picker.options.map((opt) => (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => handleConditionGradeChange(item, opt.value)}
                                        className={`flex-1 min-h-[44px] py-1.5 px-1 text-xs font-bold rounded-lg border transition-colors ${current === opt.value ? 'bg-[#C8552B] text-white border-[#C8552B]' : 'bg-white dark:bg-[#3A3A3C] text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] border-black/18 dark:border-[#3A3A3C] hover:border-[#C8552B]'}`}
                                        title={opt.title}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Listing type */}
                            <div>
                              <label className="text-xs font-medium text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] mb-1 block">Listing Type</label>
                              <select
                                value={editState.listingType}
                                onChange={(e) => handleEditChange(item.id, 'listingType', e.target.value)}
                                className="w-full px-3 py-2 border border-black/18 dark:border-[#3A3A3C] bg-white dark:bg-[#3A3A3C] rounded-lg text-sm text-[#1A1814] dark:text-[#F5F5F0] focus:outline-none focus:ring-2 focus:ring-[#C8552B]/40"
                              >
                                <option value="FIXED">Fixed Price</option>
                                <option value="AUCTION">Auction</option>
                                <option value="REVERSE_AUCTION">Reverse Auction</option>
                              </select>
                            </div>

                            {editState.listingType === 'REVERSE_AUCTION' && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs font-medium text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] mb-1 block">Daily drop ($)</label>
                                  <input type="number" min="0" step="0.01"
                                    value={(editState.reverseDailyDrop || 0) / 100}
                                    onChange={(e) => handleEditChange(item.id, 'reverseDailyDrop', Math.round(parseFloat(e.target.value || '0') * 100))}
                                    placeholder="0.00" aria-label="Daily drop"
                                    className="w-full border border-black/18 dark:border-[#3A3A3C] bg-white dark:bg-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8552B]/40" />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA] mb-1 block">Floor price ($)</label>
                                  <input type="number" min="0" step="0.01"
                                    value={(editState.reverseFloorPrice || 0) / 100}
                                    onChange={(e) => handleEditChange(item.id, 'reverseFloorPrice', Math.round(parseFloat(e.target.value || '0') * 100))}
                                    placeholder="0.00" aria-label="Floor price"
                                    className="w-full border border-black/18 dark:border-[#3A3A3C] bg-white dark:bg-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8552B]/40" />
                                </div>
                              </div>
                            )}

                            {/* Price research panel */}
                            <div>
                              <PriceResearchPanel
                                itemId={item.id}
                                itemTitle={editState.title}
                                itemDescription={editState.description}
                                category={editState.category}
                                condition={editState.condition}
                                currentPrice={editState.price}
                                photoUrls={item.photoUrls}
                                collapsed={true}
                                onPriceSelect={(price) => {
                                  // Research panel sets editor price, NOT the queue price input
                                  // Organizer still must type into the queue price field to approve
                                  handleEditChange(item.id, 'price', price);
                                  setPriceInput(item.id, String(price));
                                }}
                              />
                              <div className="mt-2">
                                <PricingSignalBanners itemId={item.id} currentPrice={editState.price} />
                              </div>
                            </div>

                            {/* eBay push toggle (weight/dims moved above, under Description -- see 2026-08-13 comment) */}
                            {ebayConnected && tier !== 'SIMPLE' && (
                              <div className="space-y-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                                <div className="flex items-center gap-2">
                                  <input type="checkbox" id={`ebay-push-${item.id}`}
                                    checked={ebayPushItems[item.id] ?? false}
                                    onChange={(e) => setEbayPushItems(prev => ({ ...prev, [item.id]: e.target.checked }))}
                                    className="h-4 w-4 rounded border-gray-300 accent-blue-600" />
                                  <label htmlFor={`ebay-push-${item.id}`} className="text-sm font-medium text-blue-700 dark:text-blue-300 cursor-pointer">
                                    Also push to eBay
                                  </label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`local-pickup-${item.id}`}
                                    checked={getEditState(item).ebayShippingOverride === 'LOCAL_PICKUP_ONLY'}
                                    onChange={(e) => {
                                      handleEditChange(item.id, 'ebayShippingOverride', e.target.checked ? 'LOCAL_PICKUP_ONLY' : null);
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                                  />
                                  <label htmlFor={`local-pickup-${item.id}`} className="text-sm text-blue-700 dark:text-blue-300 cursor-pointer">
                                    Local pickup only (skip eBay shipping)
                                  </label>
                                </div>
                              </div>
                            )}

                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Inline camera overlay ── */}
          {inlineCameraOpen && (
            <RapidCapture
              mode={inlineCaptureMode}
              onModeChange={setInlineCaptureMode}
              rapidItems={inlineRapidItems}
              addingToItemId={inlineCaptureItemId}
              onAddToItem={(itemId) => setInlineCaptureItemId(itemId)}
              onThumbnailTap={(itemId) => setInlineCaptureItemId(itemId)}
              onNavigateToReview={() => setInlineCameraOpen(false)}
              readyCount={0}
              onPhotoCapture={handleInlineCameraCapture}
              onAnalyze={handleInlineCameraAnalyze}
              onComplete={(photos) => {
                photos.forEach((p) => handleInlineCameraCapture(p));
                setInlineCameraOpen(false);
              }}
              onCancel={() => setInlineCameraOpen(false)}
            />
          )}

        </div>
      </main>

      {/* ── Confirm dialog ── */}
      <ConfirmDialog
        isOpen={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />
    </>
  );
};

export default ReviewPage;
