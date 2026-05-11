/**
 * Smart Review Queue (Brief D — Session 5 redesign)
 *
 * Organizer reviews AI-suggested fields for PENDING_REVIEW items before publishing.
 * Design tokens from fs-shared.jsx / FS_TONES light palette.
 *
 * KEY RULE: aiSuggestedPrice (sourced from ItemCompLookup via PriceSuggestion component)
 * is NEVER pre-filled into the price input. It is shown ONLY as placeholder text.
 * Organizer must type their own price. This prevents the recurring auto-fill bug.
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

// Tag grouping — classify tags into display buckets for the review UI
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
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
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
  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  // Smart Review Queue UI state
  const [priceInputs, setPriceInputs] = useState<Map<string, string>>(new Map());
  const [priceErrors, setPriceErrors] = useState<Set<string>>(new Set());
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [showApproveAllModal, setShowApproveAllModal] = useState(false);
  const [showDiscardAllModal, setShowDiscardAllModal] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const [addTagInputs, setAddTagInputs] = useState<Map<string, string>>(new Map());

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
      return await Promise.all(itemIds.map((id) => api.delete(`/items/${id}`)));
    },
    onSuccess: (_data, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      setSelectedItems(new Set());
      if (itemIds.length === 1 && expandedItemId === itemIds[0]) setExpandedItemId(null);
      showToast(`${itemIds.length} item${itemIds.length !== 1 ? 's' : ''} deleted`, 'success');
    },
    onError: () => showToast('Failed to delete item(s)', 'error'),
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
      const results = response.data.results || [];
      let successCount = 0;
      results.forEach((result: any) => {
        if (result.status === 'success') {
          successCount++;
        } else {
          const errorMsg = result.error?.includes('NOT_CONNECTED')
            ? 'eBay not connected'
            : result.error?.includes('POLICIES')
            ? 'eBay policies not configured'
            : result.error || 'Failed to push item';
          showToast(`Item ${result.itemId}: ${errorMsg}`, 'error');
        }
      });
      if (successCount > 0) {
        showToast(`${successCount} item${successCount !== 1 ? 's' : ''} pushed to eBay`, 'success');
      }
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      setEbayPushItems({});
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to push items to eBay';
      showToast(msg, 'error');
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
      // Use category as-is from eBay (already normalized from API)
      const normalizedCategory = item.category ?? '';

      // Normalize condition to match standard values: NEW, USED, REFURBISHED, PARTS_OR_REPAIR
      let normalizedCondition = '';
      if (item.condition) {
        const condUpper = item.condition.toUpperCase().trim().replace(/\s+/g, '_');
        const validConditions = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'];
        if (validConditions.includes(condUpper)) {
          normalizedCondition = condUpper;
        } else {
          // Map legacy values
          const legacyMap: Record<string, string> = {
            LIKE_NEW: 'NEW', EXCELLENT: 'NEW',
            GOOD: 'USED', FAIR: 'USED', POOR: 'PARTS_OR_REPAIR',
          };
          normalizedCondition = legacyMap[condUpper] || '';
        }
      }

      editStates.set(item.id, {
        title: item.title,
        description: item.description ?? '',
        price: item.price ?? 0,
        category: normalizedCategory,
        condition: normalizedCondition,
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
      });
      setEditStates(new Map(editStates));
    }
    return editStates.get(item.id)!;
  };

  const handleEditChange = (itemId: string, field: string, value: any) => {
    const state = getEditState(items.find((i) => i.id === itemId)!);
    const updated = { ...state, [field]: value };
    editStates.set(itemId, updated);
    setEditStates(new Map(editStates));
  };

  const handleSaveItem = async (item: Item) => {
    const editState = getEditState(item);
    await updateItemMutation.mutateAsync({
      itemId: item.id,
      updates: {
        title: editState.title,
        description: editState.description,
        price: editState.price,
        category: editState.category,
        condition: editState.condition,
        conditionGrade: editState.conditionGrade, // #64: Persist condition grade on save
        quantity: editState.quantity,
        listingType: editState.listingType,
        reverseDailyDrop: editState.reverseDailyDrop,
        reverseFloorPrice: editState.reverseFloorPrice,
        backgroundRemoved: editState.backgroundRemoved,
        tags: editState.tags, // Sprint 1: Save tags
        // Bug 6: persist shipping dimensions
        packageWeightOz: editState.packageWeightOz ?? null,
        packageLengthIn: editState.packageLengthIn ?? null,
        packageWidthIn: editState.packageWidthIn ?? null,
        packageHeightIn: editState.packageHeightIn ?? null,
      },
    });
    showToast('Item saved', 'success');
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
        // Publish: use dedicated publish endpoint
        await api.post(`/items/${item.id}/publish`);
        queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
        showToast('Item published!', 'success');

        // If eBay push is enabled for this item, push it to eBay
        if (ebayPushItems[item.id] && ebayConnected && tier !== 'SIMPLE') {
          ebayPushMutation.mutate([item.id]);
        }
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update item';
      showToast(message, 'error');
    }
  };

  const handleBulkPrice = () => {
    if (!bulkPrice) return;
    bulkUpdateMutation.mutate({
      itemIds: Array.from(selectedItems),
      operation: 'price',
      value: parseFloat(bulkPrice),
    });
  };

  const handleBulkCategory = (payload: { l1CategoryName: string; leafCategoryId: string; leafCategoryName: string }) => {
    bulkUpdateMutation.mutate({
      itemIds: Array.from(selectedItems),
      operation: 'category',
      value: payload.l1CategoryName,
    });
    // Also update ebayCategoryId and ebayCategoryName for all selected items
    bulkUpdateMutation.mutate({
      itemIds: Array.from(selectedItems),
      operation: 'ebayCategoryId',
      value: payload.leafCategoryId,
    });
    bulkUpdateMutation.mutate({
      itemIds: Array.from(selectedItems),
      operation: 'ebayCategoryName',
      value: payload.leafCategoryName,
    });
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

  // Condition-adjusted pricing: when grade changes, re-fetch a price suggestion silently
  const handleConditionGradeChange = async (item: Item, grade: string) => {
    handleEditChange(item.id, 'conditionGrade', grade);

    const editState = getEditState(item);
    const title = editState.title || item.title;
    const category = editState.category || item.category || '';
    const condition = editState.condition || item.condition || '';
    if (!title || !category) return; // need at minimum title + category

    try {
      setRefreshingPriceItemId(item.id);
      // Map grade to human-readable condition for the prompt context
      const gradeLabels: Record<string, string> = { S: 'like new', A: 'excellent', B: 'good', C: 'fair', D: 'poor' };
      const gradeCondition = gradeLabels[grade] || condition;
      const response = await api.post('/items/ai/price-suggest', {
        title,
        category,
        condition: gradeCondition,
      });
      if (response.data?.suggested) {
        handleEditChange(item.id, 'price', response.data.suggested);
      }
    } catch {
      // Best-effort — silent failure, keep existing price
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

  /** Approve a single item. Blocks if price is empty. */
  const handleApproveItem = async (item: Item) => {
    const priceStr = getPriceInput(item.id);
    const priceVal = parseFloat(priceStr);
    if (!priceStr.trim() || isNaN(priceVal) || priceVal <= 0) {
      setPriceErrors(prev => new Set(prev).add(item.id));
      return;
    }
    // Save price + tags then publish
    const editState = getEditState(item);
    try {
      await updateItemMutation.mutateAsync({
        itemId: item.id,
        updates: {
          price: priceVal,
          title: editState.title,
          category: editState.category,
          condition: editState.condition,
          conditionGrade: editState.conditionGrade,
          tags: editState.tags,
        },
      });
      await api.post(`/items/${item.id}/publish`);
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
      setApprovedIds(prev => new Set(prev).add(item.id));
      showToast('Item published!', 'success');
    } catch (err: any) {
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
      const editState = getEditState(item);
      try {
        await updateItemMutation.mutateAsync({
          itemId: item.id,
          updates: {
            price: priceVal,
            title: editState.title,
            category: editState.category,
            condition: editState.condition,
            conditionGrade: editState.conditionGrade,
            tags: editState.tags,
          },
        });
        await api.post(`/items/${item.id}/publish`);
        setApprovedIds(prev => new Set(prev).add(item.id));
      } catch {
        // silent per-item — overall toast shown below
      }
    }
    queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
    if (toApprove.length > 0) {
      showToast(`${toApprove.length} item${toApprove.length !== 1 ? 's' : ''} published!`, 'success');
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

  // ── Rarity badge colors (light palette) ────────────────────────────────────
  const rarityColors: Record<string, { bg: string; fg: string }> = {
    COMMON:    { bg: 'rgba(20,18,14,0.05)',    fg: 'rgba(26,24,20,0.62)' },
    UNCOMMON:  { bg: 'rgba(63,122,75,0.10)',   fg: '#3F7A4B' },
    RARE:      { bg: 'rgba(58,110,180,0.12)',  fg: '#3A6EB4' },
    LEGENDARY: { bg: 'rgba(200,85,43,0.10)',   fg: '#C8552B' },
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
                Each item will go live with the values currently shown — Smart's title,
                category, condition, your price, and tags. You can edit any item later
                from the manager.
              </p>
              {/* Validation note */}
              {pendingItems.some(i => {
                const p = getPriceInput(i.id);
                return !p.trim() || isNaN(parseFloat(p)) || parseFloat(p) <= 0;
              }) && (
                <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  Items without a price will be skipped — approve only priced items.
                </div>
              )}
            </div>
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <button
                onClick={() => setShowApproveAllModal(false)}
                className="px-4 py-2 rounded-lg border border-black/18 text-sm font-medium text-[#1A1814] hover:bg-black/5 transition-colors"
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
                className="px-4 py-2 rounded-lg border border-black/18 text-sm font-medium text-[#1A1814] hover:bg-black/5 transition-colors"
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
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.4)] dark:text-[#B8B8BA] mb-1">
                Item Manager · Smart Review
              </p>
              <h1
                className="text-3xl font-semibold tracking-tight text-[#1A1814] dark:text-[#F5F5F0]"
                style={{ fontFamily: 'Inter Tight, sans-serif', letterSpacing: '-0.02em' }}
              >
                {itemsLoading
                  ? 'Loading queue…'
                  : queueEmpty
                  ? `All ${totalCount} items are live`
                  : `Review ${pendingItems.length} item${pendingItems.length !== 1 ? 's' : ''} before they go live`}
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
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
                className="px-3 py-2 rounded-lg border border-black/18 text-sm font-medium text-[rgba(26,24,20,0.62)] hover:bg-black/5 transition-colors"
              >
                ← Back
              </Link>
            </div>
          </div>

          {/* ── Sticky bulk actions bar ── */}
          {!itemsLoading && !queueEmpty && (
            <div className="sticky top-4 z-10 mb-5">
              <div
                className="bg-[#FBF8F2] dark:bg-[#2C2C2E] rounded-xl border border-black/10 dark:border-[#3A3A3C] px-4 py-3 flex items-center justify-between gap-4 shadow-sm"
              >
                {/* Left: count + progress */}
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(200,85,43,0.10)', color: '#C8552B' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1A1814] dark:text-[#F5F5F0]">{pendingItems.length} pending review</p>
                    <p className="text-xs text-[rgba(26,24,20,0.62)] dark:text-[#B8B8BA]">{publishedCount} of {totalCount} published</p>
                  </div>
                  {/* Progress bar */}
                  <div className="hidden sm:block w-36">
                    <div className="h-1.5 rounded-full bg-black/6 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#3F7A4B] transition-all"
                        style={{ width: totalCount > 0 ? `${(publishedCount / totalCount) * 100}%` : '0%' }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] font-mono tracking-wide text-[rgba(26,24,20,0.4)]">
                      {totalCount > 0 ? Math.round((publishedCount / totalCount) * 100) : 0}% published
                    </p>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setShowDiscardAllModal(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-[rgba(26,24,20,0.62)] hover:bg-black/6 border border-transparent hover:border-black/10 transition-colors"
                  >
                    Discard all
                  </button>
                  <Link
                    href={`/organizer/label-composer/${saleId}`}
                    className="hidden sm:block px-3 py-1.5 rounded-lg text-xs font-medium text-[rgba(26,24,20,0.62)] hover:bg-black/6 border border-black/18 transition-colors"
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
                    href={`/sale/${saleId}`}
                    className="px-4 py-2 rounded-lg bg-[#C8552B] text-white text-sm font-semibold hover:bg-[#b04825] transition-colors"
                  >
                    View sale →
                  </Link>
                  <Link
                    href={`/organizer/add-items/${saleId}`}
                    className="px-4 py-2 rounded-lg border border-black/18 text-sm font-medium text-[#1A1814] hover:bg-black/5 transition-colors"
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
              <p className="text-[rgba(26,24,20,0.62)] mb-4">No items in this sale yet.</p>
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
                const currentTags = editState.tags || item.tags || [];
                const rarityKey = item.rarity && rarityColors[item.rarity] ? item.rarity : 'COMMON';

                return (
                  <div
                    key={item.id}
                    ref={(el) => { if (el) itemRefs.current.set(item.id, el); }}
                    className="relative bg-[#FBF8F2] dark:bg-[#2C2C2E] rounded-xl border border-black/10 dark:border-[#3A3A3C] overflow-hidden"
                    style={{ boxShadow: '0 1px 3px rgba(20,18,14,0.06)' }}
                  >
                    {/* Review stripe — amber, persists until approved */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                      style={{ background: hasError ? '#C04A2B' : '#A87420' }}
                    />

                    <div className="pl-5 pr-5 pt-5 pb-5">
                      {/* Smart chip row */}
                      <div className="flex items-center justify-between mb-4">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono tracking-widest uppercase"
                          style={{ background: 'rgba(200,85,43,0.10)', color: '#C8552B' }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                          </svg>
                          Smart
                        </span>
                        {item.isAiTagged && item.aiConfidence != null && (
                          <span className="text-[10px] font-mono tracking-wide text-[rgba(26,24,20,0.4)]">
                            {Math.round(item.aiConfidence * 100)}% confidence
                          </span>
                        )}
                      </div>

                      {/* Desktop layout: photo | fields | price rail — stacks on mobile */}
                      <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">

                        {/* Thumbnail — full width on mobile, fixed width on sm+ */}
                        <div className="flex-shrink-0 w-full sm:w-32">
                          <div className="flex sm:block gap-3 items-start">
                          <button
                            type="button"
                            onClick={() => item.photoUrls[0] && setZoomedPhoto(item.photoUrls[0])}
                            className="block w-24 sm:w-full aspect-square rounded-lg overflow-hidden border border-black/10 bg-[rgba(20,18,14,0.04)] focus:outline-none flex-shrink-0"
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
                            <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.4)] mb-1">
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
                              {/* Category — shows the category set during the camera/photo flow */}
                              <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.4)] mb-1">
                                Category
                              </label>
                              {(editState.category || item.category) ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-mono border bg-warm-200 text-warm-800 border-warm-300 dark:bg-[#3A3A3C] dark:text-[#F5F5F0] dark:border-[#3A3A3C] mb-2">
                                  {editState.category || item.category}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-mono border bg-warm-100 text-[rgba(26,24,20,0.4)] border-warm-200 dark:bg-[#2C2C2E] dark:text-[#B8B8BA] dark:border-[#3A3A3C] mb-2">
                                  Not set
                                </span>
                              )}
                              {/* eBay Category — separate taxonomy picker */}
                              <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.4)] mb-1">
                                eBay Category
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
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.4)] mb-1">
                                Condition <span className="text-[#C8552B]">· Smart</span>
                              </label>
                              {/* Segmented control */}
                              <div className="inline-flex w-full bg-[rgba(20,18,14,0.05)] p-0.5 rounded-lg border border-black/10">
                                {conditionOptions.map(opt => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleEditChange(item.id, 'condition', opt.value)}
                                    className={`flex-1 py-1.5 text-xs font-mono rounded-md transition-all ${
                                      editState.condition === opt.value
                                        ? 'bg-white text-[#1A1814] font-semibold shadow-sm'
                                        : 'text-[rgba(26,24,20,0.62)] hover:text-[#1A1814]'
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Tags row */}
                          <div>
                            <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.4)] mb-1.5">
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
                                className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-[rgba(20,18,14,0.05)] text-[rgba(26,24,20,0.62)] border border-transparent focus:outline-none focus:border-[rgba(26,24,20,0.2)] placeholder-[rgba(26,24,20,0.4)]"
                                style={{ width: '5rem' }}
                              />
                            </div>
                          </div>

                          {/* Rarity picker */}
                          <div>
                            <label className="block text-[10px] font-mono tracking-widest uppercase text-[rgba(26,24,20,0.4)] mb-1.5">
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
                                    className="flex-1 py-1.5 text-center rounded-lg text-[10px] font-mono tracking-wide transition-all border"
                                    style={{
                                      background: sel ? rc.bg : 'transparent',
                                      color: sel ? rc.fg : 'rgba(26,24,20,0.4)',
                                      borderColor: sel ? 'transparent' : 'rgba(20,18,14,0.10)',
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

                        {/* Right rail: price + actions — full width on mobile, fixed on sm+ */}
                        <div className="w-full sm:flex-shrink-0 sm:w-52 flex flex-col gap-3">

                          {/* ── PRICE FIELD — Critical rule: never pre-fill aiSuggestedPrice ── */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className={`text-[10px] font-mono tracking-widest uppercase ${hasError ? 'text-[#C04A2B]' : 'text-[rgba(26,24,20,0.4)]'}`}>
                                Your price{hasError ? ' · Required' : ''}
                              </label>
                              {/* aiSuggestedPrice reference — display only from PriceSuggestion */}
                            </div>
                            {/* PriceSuggestion shows the Smart reference price (read-only) */}
                            <div className="mb-1.5">
                              <PriceSuggestion
                                title={getEditState(item).title}
                                category={getEditState(item).category}
                                condition={getEditState(item).condition}
                                onApplyPrice={(price) => setPriceInput(item.id, String(price))}
                              />
                            </div>
                            {/* Price input — starts empty, organizer must type */}
                            <div
                              className="flex items-center gap-1 px-3 py-2.5 rounded-lg border-2 bg-white dark:bg-[#3A3A3C] transition-colors"
                              style={{ borderColor: hasError ? '#C04A2B' : 'rgba(20,18,14,0.18)' }}
                            >
                              <span
                                className="text-xl font-medium dark:text-[#B8B8BA]"
                                style={{ fontFamily: 'Inter Tight, sans-serif', color: 'rgba(26,24,20,0.4)' }}
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
                                Suggestion above is a reference. Type your price.
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
                            <Link
                              href={`/organizer/edit-item/${item.id}`}
                              className="w-full py-2 rounded-lg border border-black/18 text-sm font-medium text-[rgba(26,24,20,0.62)] hover:bg-black/5 transition-colors text-center"
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
                          </div>
                        </div>
                      </div>

                      {/* Expanded detail panel — toggle */}
                      <div className="mt-4 pt-4 border-t border-black/8">
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(item.id)}
                          className="text-xs font-medium text-[rgba(26,24,20,0.5)] hover:text-[#1A1814] transition-colors flex items-center gap-1"
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
                              <label className="block text-xs font-medium text-[rgba(26,24,20,0.62)] mb-1">Description</label>
                              <textarea
                                rows={3}
                                value={editState.description}
                                onChange={(e) => handleEditChange(item.id, 'description', e.target.value)}
                                className="w-full border border-black/18 dark:border-[#3A3A3C] bg-white dark:bg-[#3A3A3C] rounded-lg px-3 py-2 text-sm text-[#1A1814] dark:text-[#F5F5F0] focus:outline-none focus:ring-2 focus:ring-[#C8552B]/40"
                              />
                            </div>

                            {/* Condition grade */}
                            <div>
                              <label className="text-xs font-medium text-[rgba(26,24,20,0.62)] mb-1 block">
                                Condition Grade
                                {item.suggestedConditionGrade && (
                                  <span className="ml-2 text-[#C8552B] font-normal">Auto-suggests: {item.suggestedConditionGrade}</span>
                                )}
                              </label>
                              <div className="flex gap-2">
                                {(['S','A','B','C','D'] as const).map(grade => {
                                  const gradeLabels: Record<string, string> = { S:'Like New', A:'Excellent', B:'Good', C:'Fair', D:'Poor' };
                                  const current = editState.conditionGrade ?? item.conditionGrade;
                                  return (
                                    <button key={grade} onClick={() => handleConditionGradeChange(item, grade)}
                                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${current === grade ? 'bg-[#C8552B] text-white border-[#C8552B]' : 'bg-white text-[rgba(26,24,20,0.62)] border-black/18 hover:border-[#C8552B]'}`}
                                      title={gradeLabels[grade]}>
                                      {grade}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Listing type */}
                            <div>
                              <label className="text-xs font-medium text-[rgba(26,24,20,0.62)] mb-1 block">Listing Type</label>
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
                                  <label className="text-xs font-medium text-[rgba(26,24,20,0.62)] mb-1 block">Daily drop ($)</label>
                                  <input type="number" min="0" step="0.01"
                                    value={(editState.reverseDailyDrop || 0) / 100}
                                    onChange={(e) => handleEditChange(item.id, 'reverseDailyDrop', Math.round(parseFloat(e.target.value || '0') * 100))}
                                    placeholder="0.00" aria-label="Daily drop"
                                    className="w-full border border-black/18 dark:border-[#3A3A3C] bg-white dark:bg-[#3A3A3C] text-[#1A1814] dark:text-[#F5F5F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8552B]/40" />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-[rgba(26,24,20,0.62)] mb-1 block">Floor price ($)</label>
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

                            {/* eBay push toggle + shipping fields */}
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
                                {/* Shipping weight & dimensions (used by eBay push to select fulfillment policy) */}
                                <div>
                                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">
                                    Shipping details <span className="font-normal text-blue-500">(required for eBay)</span>
                                  </p>
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
                                        onChange={(e) => handleEditChange(item.id, 'packageWeightOz', e.target.value ? Number(e.target.value) : u