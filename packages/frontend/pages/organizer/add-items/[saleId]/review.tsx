/**
 * Publishing Page (Review & Publish)
 *
 * Phase 4: Publishing page for Rapidfire items
 * - Fetch items with draftStatus IN ['DRAFT', 'PENDING_REVIEW']
 * - AI confidence color tinting (green/amber/red borders)
 * - Per-item expanded editor (brightness, contrast, aspect ratio, background removal, metadata)
 * - Batch toolbar (select, bulk price, bulk category, bulk BG removal)
 * - Buyer preview mode (light-mode grid)
 * - Publish all button
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
import { CURATED_TAGS } from '../../../../../shared/src'; // Sprint 1: Listing Factory tag vocabulary
import RapidCapture, { RapidItem } from '../../../../components/RapidCapture';
import { CATEGORIES, CONDITIONS, CONDITION_LABELS, CONDITION_MAP, formatCondition } from '../../../../lib/itemConstants';

type AspectRatio = '4:3' | '1:1' | '16:9';

interface ItemEditState {
  title: string;
  description: string;
  price: number;
  category: string;
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
  tags?: string[];
  suggestedTags?: string[];
  suggestedConditionGrade?: string; // #64: AI-suggested condition grade
  healthScore?: HealthScore;
  priceBeforeMarkdown?: number; // Feature #91: Auto-Markdown
  markdownApplied?: boolean; // Feature #91: Auto-Markdown
  createdAt?: string;
  ebayListingId?: string; // eBay listing ID if pushed
  saleId?: string; // Sale ID for eBay push
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
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [inlineCameraOpen, setInlineCameraOpen] = useState(false);
  const [inlineCaptureMode, setInlineCaptureMode] = useState<'rapidfire' | 'regular'>('regular');
  const [inlineCaptureItemId, setInlineCaptureItemId] = useState<string | null>(null);
  const [inlineCaptureItem, setInlineCaptureItem] = useState<Item | null>(null);
  const [inlineRapidItems, setInlineRapidItems] = useState<RapidItem[]>([]);
  const [ebayPushItems, setEbayPushItems] = useState<ItemEbayPushState>({});

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

  const updateItemMutation = useMutation({
    mutationFn: async (payload: {
      itemId: string;
      updates: Partial<Item>;
    }) => {
      return await api.put(`/items/${payload.itemId}`, payload.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] });
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
      router.push(`/organizer/add-items/${saleId}`);
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
      return api.post(`/organizer/sales/${saleId}/ebay-push`, {
        itemIds,
      });
    },
    onSuccess: (response) => {
      const results = response.data.results || [];
      let successCount = 0;
      results.forEach((result: any) => {
        if (result.success) {
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
      // Normalize category: match against CATEGORIES array case-insensitively
      let normalizedCategory = item.category ?? '';
      if (normalizedCategory) {
        const match = CATEGORIES.find(cat => cat.toLowerCase() === normalizedCategory.toLowerCase());
        normalizedCategory = match || normalizedCategory; // Use exact match if found, else keep original
      }

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

  const handleBulkCategory = (category: string) => {
    bulkUpdateMutation.mutate({
      itemIds: Array.from(selectedItems),
      operation: 'category',
      value: category,
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
  };

  const handleAddCustomTag = (itemId: string, tag: string) => {
    const trimmed = tag.trim().toLowerCase().replace(/\s+/g, '-');
    if (!trimmed) return;
    handleAddTag(itemId, trimmed);
  };

  const previewItems = showBuyerPreview
    ? items
    : items;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Review & Publish - FindA.Sale</title>
      </Head>

      <main className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8 flex items-center justify-between">
            <Link
              href={`/organizer/add-items/${saleId}`}
              className="text-amber-700 hover:text-amber-800 text-sm font-medium inline-flex items-center gap-1"
            >
              &larr; Back to + Items
            </Link>
            <button
              onClick={() => setShowBuyerPreview(true)}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 font-medium text-sm"
            >
              👁 Buyer Preview
            </button>
          </div>

          {showBuyerPreview ? (
            <>
              <div className="mb-6">
                <button
                  onClick={() => setShowBuyerPreview(false)}
                  className="px-4 py-2 bg-white dark:bg-gray-800 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 font-medium text-sm"
                >
                  Back to Editing
                </button>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-8">
                <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">
                  Preview only
                </div>
                <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">Buyer Preview</h2>

                <div className="grid grid-cols-2 gap-4">
                  {previewItems.map((item) => (
                    <div key={item.id} className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="aspect-square bg-warm-100 dark:bg-gray-700 overflow-hidden">
                        {item.photoUrls[0] && (
                          <img
                            key={item.photoUrls[0]}
                            src={buildCloudinaryUrl(item.photoUrls[0], {
                              aspectRatio: '4:3',
                              backgroundRemoved: item.backgroundRemoved,
                            })}
                            alt={item.title}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer-when-downgrade"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"%3E%3Crect width="400" height="400" fill="%23f3f4f6"/%3E%3Ctext x="50%25" y="50%25" font-size="120" text-anchor="middle" dy=".3em" fill="%23d1d5db"%3E📷%3C/text%3E%3C/svg%3E';
                            }}
                          />
                        )}
                      </div>
                      <div className="p-3">
                        <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm truncate">
                          {item.title}
                        </p>
                        <div className="text-amber-700 font-bold text-sm mt-1 flex items-center gap-1">
                          {item.price != null ? (
                            item.markdownApplied && item.priceBeforeMarkdown ? (
                              <>
                                <span className="line-through text-gray-400 dark:text-gray-500 text-xs">
                                  ${item.priceBeforeMarkdown.toFixed(2)}
                                </span>
                                <span className="text-green-600 dark:text-green-400">
                                  ${item.price.toFixed(2)}
                                </span>
                              </>
                            ) : (
                              `$${item.price.toFixed(2)}`
                            )
                          ) : (
                            'No price'
                          )}
                        </div>
                        <p className="text-warm-600 dark:text-warm-400 text-xs mt-1">{item.category || 'Uncategorized'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-8">
                <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Review & Publish</h1>
                <p className="text-warm-600 dark:text-warm-400 mb-4">
                  {items.length} item{items.length !== 1 ? 's' : ''} in this sale.
                  {items.filter((i) => i.draftStatus !== 'PUBLISHED').length > 0 && (
                    <span className="ml-1 text-amber-600 font-medium">
                      {items.filter((i) => i.draftStatus !== 'PUBLISHED').length} unpublished.
                    </span>
                  )}
                </p>

                {/* Sprint 1: Aggregate health bar */}
                {items.length > 0 && (() => {
                  const clearCount = items.filter(i => i.healthScore?.grade === 'clear').length;
                  const blockedCount = items.filter(i => i.healthScore?.grade === 'blocked').length;
                  return (
                    <div className="mb-4 p-3 bg-warm-50 dark:bg-gray-900 rounded-lg border border-warm-200 dark:border-gray-700">
                      <div className="text-sm text-warm-700 dark:text-warm-300">
                        <span className="font-medium">{clearCount}/{items.length} items ready to publish</span>
                        {blockedCount > 0 && <span className="ml-2 text-red-600 font-medium">{blockedCount} blocked</span>}
                      </div>
                    </div>
                  );
                })()}

                {/* Feature 61: Near-Miss Nudge — encourage completing the listing */}
                <NearMissNudge
                  current={items.filter((i: any) => i.photoUrls?.length > 0 && i.price > 0).length}
                  target={items.length}
                  reward="a fully photo'd & priced listing"
                  unit="item"
                />

                {/* Only show Publish All if there are unpublished items */}
                {!itemsLoading && items.filter((i) => i.draftStatus !== 'PUBLISHED').length > 0 && (
                  <button
                    onClick={() => {
                      const unpublishedIds = items.filter((i) => i.draftStatus !== 'PUBLISHED').map((i) => i.id);
                      publishMutation.mutate(unpublishedIds);
                    }}
                    disabled={publishMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50 mb-6"
                  >
                    {publishMutation.isPending ? 'Publishing...' : `Publish All (${items.filter((i) => i.draftStatus !== 'PUBLISHED').length} unpublished)`}
                  </button>
                )}

                {itemsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-center py-12 text-warm-600 dark:text-warm-400">
                    <p>No items in this sale yet.</p>
                  </div>
                ) : (
                  <>
                    {/* Select All Header */}
                    <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-3 mb-3 flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedItems.size === items.length && items.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedItems(new Set(items.map((i) => i.id)));
                          } else {
                            setSelectedItems(new Set());
                          }
                        }}
                        className="w-4 h-4 rounded border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <span className="text-sm font-medium text-warm-700 dark:text-warm-300">
                        {selectedItems.size === 0
                          ? `Select all ${items.length} item${items.length !== 1 ? 's' : ''}`
                          : `${selectedItems.size} item${selectedItems.size !== 1 ? 's' : ''} selected`}
                      </span>
                    </div>

                    {selectedItems.size > 0 && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-3 mb-3 flex flex-wrap items-center gap-3">
                        <span className="text-sm font-medium text-amber-800">{selectedItems.size} selected</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Bulk price..."
                            value={bulkPrice}
                            onChange={(e) => setBulkPrice(e.target.value)}
                            className="border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded px-2 py-1 text-sm w-28"
                          />
                          <button
                            onClick={handleBulkPrice}
                            disabled={!bulkPrice || bulkUpdateMutation.isPending}
                            className="px-3 py-1 bg-amber-600 text-white text-sm rounded disabled:opacity-50"
                          >
                            Set Price
                          </button>
                        </div>
                        <select
                          value={bulkCategory}
                          onChange={(e) => { setBulkCategory(e.target.value); handleBulkCategory(e.target.value); }}
                          className="border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded px-2 py-1 text-sm"
                        >
                          <option value="">Bulk category...</option>
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete ${selectedItems.size} item${selectedItems.size !== 1 ? 's' : ''}? This cannot be undone.`)) {
                              deleteMutation.mutate(Array.from(selectedItems));
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded disabled:opacity-50"
                        >
                          {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                        </button>
                        <button
                          onClick={() => setSelectedItems(new Set())}
                          className="px-3 py-1 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 text-warm-700 dark:text-warm-300 text-sm rounded hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    {/* Column headers removed — status line on each card replaces the old header row */}
                    {items.length > 0 && (
                      <div className="flex items-center gap-2 mb-3">
                        {(['name', 'price', 'status', 'date'] as const).map((option) => (
                          <button
                            key={option}
                            onClick={() => {
                              if (sortBy === option) {
                                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortBy(option);
                                setSortOrder('desc');
                              }
                            }}
                            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                              sortBy === option
                                ? 'bg-amber-500 text-white'
                                : 'bg-white dark:bg-gray-800 text-warm-700 dark:text-warm-300 border border-warm-300 dark:border-gray-700 hover:bg-warm-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            {option.charAt(0).toUpperCase() + option.slice(1)}
                            {sortBy === option && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="space-y-3">
                      {getSortedItems(items).map((item) => {
                      const conf = confidenceLabel(item.aiConfidence, item.isAiTagged);
                      return (
                        <div
                          key={item.id}
                          ref={(el) => { if (el) itemRefs.current.set(item.id, el); }}
                          className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg overflow-hidden"
                        >
                          {/* Collapsed row — always visible */}
                          <div
                            className={`p-3 sm:p-4 flex items-start gap-3 sm:gap-4 cursor-pointer hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 border-l-4 ${
                              item.healthScore?.grade === 'clear' ? 'border-green-500' :
                              item.healthScore?.grade === 'nudge' ? 'border-amber-500' :
                              item.healthScore?.grade === 'blocked' ? 'border-red-500' :
                              'border-warm-300 dark:border-gray-600'
                            }`}
                            onClick={() => handleToggleExpand(item.id)}
                          >
                            {/* Left column: checkbox + arrow + delete (narrow, stacked) */}
                            <div className="flex flex-col items-center justify-start gap-1 flex-shrink-0 pt-1">
                              <input
                                type="checkbox"
                                checked={selectedItems.has(item.id)}
                                disabled={item.healthScore?.grade === 'blocked'}
                                title={item.healthScore?.grade === 'blocked' ? 'This item must be reviewed before publishing' : undefined}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const next = new Set(selectedItems);
                                  if (e.target.checked) next.add(item.id);
                                  else next.delete(item.id);
                                  setSelectedItems(next);
                                }}
                                className={`w-4 h-4 rounded border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 text-amber-600 focus:ring-amber-500 ${item.healthScore?.grade === 'blocked' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className="text-warm-400 text-xs">{expandedItemId === item.id ? '▲' : '▼'}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Delete "${item.title || 'this item'}"? This cannot be undone.`)) {
                                    deleteMutation.mutate([item.id]);
                                  }
                                }}
                                disabled={deleteMutation.isPending}
                                className="sm:hidden text-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 p-0.5 mt-1"
                                aria-label="Delete item"
                              >
                                🗑️
                              </button>
                            </div>

                            {/* Photo with mobile status badge below */}
                            <div className="flex-shrink-0 w-14 sm:w-16 flex flex-col items-stretch">
                              {item.photoUrls[0] ? (
                                <img
                                  key={item.photoUrls[0]}
                                  src={item.photoUrls[0]}
                                  alt={item.title}
                                  className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded"
                                  referrerPolicy="no-referrer-when-downgrade"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" fill="%23e5e7eb"/%3E%3Ctext x="50%25" y="50%25" font-size="24" text-anchor="middle" dy=".3em" fill="%239ca3af"%3E📷%3C/text%3E%3C/svg%3E';
                                  }}
                                />
                              ) : (
                                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xl sm:text-2xl">📷</div>
                              )}
                              {/* Status badge — mobile only, sits below thumbnail */}
                              <span className={`sm:hidden text-center text-[10px] font-bold py-0.5 rounded-b ${
                                item.draftStatus === 'PUBLISHED' ? 'bg-green-500/80 text-white' :
                                item.draftStatus === 'PENDING_REVIEW' ? 'bg-amber-500/80 text-white' :
                                'bg-gray-500/80 text-white'
                              }`}>
                                {item.draftStatus === 'PUBLISHED' ? 'Live' : item.draftStatus === 'PENDING_REVIEW' ? 'Pending' : 'Draft'}
                              </span>
                            </div>

                            {/* Main content area: title, price, category, health bar */}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm sm:text-base line-clamp-2 sm:line-clamp-1">{item.title}</p>
                              <p className="text-xs sm:text-sm text-warm-600 dark:text-warm-400 flex items-center gap-1 flex-wrap">
                                {item.price != null ? (
                                  item.markdownApplied && item.priceBeforeMarkdown ? (
                                    <>
                                      <span className="line-through text-gray-400 dark:text-gray-500 text-xs">
                                        ${item.priceBeforeMarkdown.toFixed(2)}
                                      </span>
                                      <span className="text-green-600 dark:text-green-400">
                                        ${item.price.toFixed(2)}
                                      </span>
                                    </>
                                  ) : (
                                    <span>${item.price.toFixed(2)}</span>
                                  )
                                ) : (
                                  <span className="text-red-500 dark:text-red-400">No price set</span>
                                )}
                                <span>·</span>
                                <span className="truncate">{item.category || 'Uncategorized'}</span>
                              </p>
                              {/* Status line — compact, single row */}
                              {item.healthScore && (
                                <p className={`mt-1 text-xs font-semibold flex items-center gap-1 ${
                                  item.healthScore.grade === 'clear'
                                    ? 'text-green-600 dark:text-green-400'
                                    : item.healthScore.grade === 'nudge'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-red-600 dark:text-red-400'
                                }`}>
                                  <span>●</span>
                                  <span>
                                    {item.healthScore.grade === 'clear' ? 'Ready to Publish' :
                                     item.healthScore.grade === 'nudge' ? 'Needs Review' :
                                     'Cannot Publish'}
                                  </span>
                                </p>
                              )}
                            </div>

                            {/* Right column: actions + metadata (hidden on mobile, visible on sm+) */}
                            <div className="hidden sm:flex items-center gap-1 sm:gap-3 flex-shrink-0">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                item.draftStatus === 'PUBLISHED'
                                  ? 'bg-green-100 text-green-700'
                                  : item.draftStatus === 'PENDING_REVIEW'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-warm-100 dark:bg-gray-700 text-warm-600'
                              }`}>
                                {item.draftStatus === 'PUBLISHED' ? 'Published' : item.draftStatus === 'PENDING_REVIEW' ? 'Pending' : 'Draft'}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Delete "${item.title || 'this item'}"? This cannot be undone.`)) {
                                    deleteMutation.mutate([item.id]);
                                  }
                                }}
                                disabled={deleteMutation.isPending}
                                className="text-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 p-1"
                                aria-label="Delete item"
                              >
                                🗑️
                              </button>
                            </div>

                            {/* Mobile delete moved to left column above */}
                          </div>

                          {/* Expanded edit panel */}
                          {expandedItemId === item.id && (() => {
                            const editState = getEditState(item);
                            return (
                              <div className="border-t border-warm-200 dark:border-gray-700 p-4 bg-warm-50 dark:bg-gray-900 space-y-4">

                                {/* Photos */}
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
                                        <button
                                          type="button"
                                          title="Upload files"
                                          onClick={() => ((window as any)[`uploadInput_${item.id}`] as any)?.click()}
                                          className="w-7 h-7 flex items-center justify-center bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-800 text-sm"
                                        >
                                          📁
                                        </button>
                                        <button
                                          type="button"
                                          title="Camera"
                                          onClick={() => { setInlineCaptureMode('regular'); setInlineCaptureItemId(item.id); setInlineCaptureItem(item); setInlineRapidItems([{ id: item.id, thumbnailUrl: item.photoUrls?.[0], draftStatus: 'PENDING_REVIEW', title: item.title, photoUrls: item.photoUrls || [] }]); setInlineCameraOpen(true); }}
                                          className="w-7 h-7 flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 text-sm"
                                        >
                                          📷
                                        </button>
                                        <button
                                          type="button"
                                          title="Rapidfire"
                                          onClick={() => { setInlineCaptureMode('rapidfire'); setInlineCaptureItemId(item.id); setInlineCaptureItem(item); setInlineRapidItems([{ id: item.id, thumbnailUrl: item.photoUrls?.[0], draftStatus: 'PENDING_REVIEW', title: item.title, photoUrls: item.photoUrls || [] }]); setInlineCameraOpen(true); }}
                                          className="w-7 h-7 flex items-center justify-center bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800 text-sm"
                                        >
                                          ⚡
                                        </button>
                                      </div>
                                    }
                                  />
                                </div>

                                {/* Health Status Section */}
                                {item.healthScore && (() => {
                                  const hs = item.healthScore;

                                  // Determine what's ready (at max value)
                                  const readyItems = [];
                                  if (hs.breakdown.photo === 40) readyItems.push(`${item.photoUrls.length} good photos ✓`);
                                  if (hs.breakdown.photo > 0 && hs.breakdown.photo < 40) readyItems.push(`${item.photoUrls.length} photos ✓`);
                                  if (hs.breakdown.title === 20) readyItems.push('Clear title ✓');
                                  if (hs.breakdown.description === 20) readyItems.push('Full description ✓');
                                  if (hs.breakdown.tags === 15) readyItems.push('3+ tags ✓');
                                  if (hs.breakdown.price === 5) readyItems.push('Price set ✓');
                                  if (hs.breakdown.category === 5) readyItems.push('Category selected ✓');
                                  if (hs.breakdown.conditionGrade === 5) readyItems.push('Condition graded ✓');

                                  // Determine what must be fixed (at 0 value, only if blocked)
                                  const mustFix = [];
                                  if (hs.grade === 'blocked') {
                                    if (hs.breakdown.photo === 0) mustFix.push('Add at least one photo');
                                    if (hs.breakdown.title === 0) mustFix.push('Add a title to your item');
                                    if (hs.breakdown.price === 0) mustFix.push('Set a price');
                                    if (hs.breakdown.category === 0) mustFix.push('Select a category');
                                    if (hs.breakdown.conditionGrade === 0) mustFix.push('Grade the condition');
                                  }

                                  // Determine improvements (not at max, only if nudge)
                                  const improvements = [];
                                  if (hs.grade === 'nudge') {
                                    if (hs.breakdown.photo < 40 && hs.breakdown.photo > 0) improvements.push(`Add more photos (have ${item.photoUrls.length})`);
                                    if (hs.breakdown.photo === 0) improvements.push('Add at least one photo');
                                    if (hs.breakdown.title < 20 && hs.breakdown.title > 0) improvements.push('Make title longer (15+ chars)');
                                    if (hs.breakdown.title === 0) improvements.push('Add a title');
                                    if (hs.breakdown.description < 20 && hs.breakdown.description > 0) improvements.push('Add more details (50+ chars)');
                                    if (hs.breakdown.description === 0) improvements.push('Add a description');
                                    if (hs.breakdown.tags < 15 && hs.breakdown.tags > 0) improvements.push(`Add more tags (have ${(item.tags?.length) || 0})`);
                                    if (hs.breakdown.tags === 0) improvements.push('Add tags');
                                    if (hs.breakdown.price === 0) improvements.push('Set a price');
                                    if ((hs.breakdown.category ?? 0) < 5 && (hs.breakdown.category ?? 0) > 0) improvements.push('Choose a more specific category');
                                    if ((hs.breakdown.category ?? 0) === 0) improvements.push('Select a category');
                                    if ((hs.breakdown.conditionGrade ?? 0) < 5 && (hs.breakdown.conditionGrade ?? 0) > 0) improvements.push('Grade the condition more completely');
                                    if (hs.breakdown.conditionGrade === 0) improvements.push('Grade the condition');
                                  }

                                  return (
                                    <div className="border border-warm-200 dark:border-gray-700 rounded-md p-3 bg-white dark:bg-gray-800">
                                      <h4 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-3">Health Status</h4>

                                      {/* What's Ready */}
                                      {readyItems.length > 0 && (
                                        <div className="mb-3">
                                          <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1.5">What's Ready</p>
                                          <ul className="space-y-0.5">
                                            {readyItems.map((item, i) => (
                                              <li key={i} className="text-xs text-warm-700 dark:text-warm-300">{item}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}

                                      {/* Must Fix (only if blocked) */}
                                      {hs.grade === 'blocked' && mustFix.length > 0 && (
                                        <div className="mb-3 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1.5">
                                          <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Must Fix</p>
                                          <ul className="space-y-0.5">
                                            {mustFix.map((item, i) => (
                                              <li key={i} className="text-xs text-red-700 dark:text-red-300">⚠️ {item}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}

                                      {/* Improvements (only if nudge) */}
                                      {hs.grade === 'nudge' && improvements.length > 0 && (
                                        <div className="mb-3 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1.5">
                                          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Improvements</p>
                                          <ul className="space-y-0.5">
                                            {improvements.map((item, i) => (
                                              <li key={i} className="text-xs text-amber-700 dark:text-amber-300">→ {item}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}

                                      {/* Optional (always show) */}
                                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5">
                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Optional</p>
                                        <ul className="space-y-0.5">
                                          <li className="text-xs text-gray-600 dark:text-gray-300">• Add tags (helps discovery)</li>
                                          <li className="text-xs text-gray-600 dark:text-gray-300">• Add condition details (builds trust)</li>
                                        </ul>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* AI Confidence — show only if AI-tagged */}
                                {item.isAiTagged && item.aiConfidence != null && (
                                  <div className="text-xs text-warm-600 dark:text-warm-400 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                                    {Math.round(item.aiConfidence * 100)}% confidence in auto suggested fields. Review and adjust as needed.
                                  </div>
                                )}

                                {/* Title */}
                                <div>
                                  <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Title</label>
                                  <input
                                    type="text"
                                    value={editState.title}
                                    onChange={(e) => handleEditChange(item.id, 'title', e.target.value)}
                                    className="w-full border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  />
                                </div>

                                {/* Description */}
                                <div>
                                  <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Description</label>
                                  <textarea
                                    rows={3}
                                    value={editState.description}
                                    onChange={(e) => handleEditChange(item.id, 'description', e.target.value)}
                                    className="w-full border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  />
                                </div>

                                {/* Price */}
                                <div>
                                  <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Price ($)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editState.price}
                                    onChange={(e) => handleEditChange(item.id, 'price', parseFloat(e.target.value) || 0)}
                                    className="w-full border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  />
                                  <div className="mt-3">
                                    <PriceResearchPanel
                                      itemId={item.id}
                                      itemTitle={editState.title}
                                      itemDescription={editState.description}
                                      category={editState.category}
                                      condition={editState.condition}
                                      currentPrice={editState.price}
                                      photoUrls={item.photoUrls}
                                      collapsed={true}
                                      onPriceSelect={(price) => handleEditChange(item.id, 'price', price)}
                                    />
                                  </div>
                                </div>

                                {/* Category + Condition */}
                                <div className="flex gap-3">
                                  <div className="flex-1">
                                    <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Category</label>
                                    <select
                                      value={editState.category}
                                      onChange={(e) => handleEditChange(item.id, 'category', e.target.value)}
                                      className="w-full border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    >
                                      <option value="">Select category...</option>
                                      {CATEGORIES.map((cat) => (
                                        <option key={cat} value={cat}>{cat}</option>
                                      ))}
                                      {editState.category && !(CATEGORIES as readonly string[]).includes(editState.category) && (
                                        <option key={editState.category} value={editState.category}>{editState.category}</option>
                                      )}
                                    </select>
                                  </div>
                                  <div className="flex-1">
                                    <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Condition</label>
                                    <select
                                      value={editState.condition}
                                      onChange={(e) => handleEditChange(item.id, 'condition', e.target.value)}
                                      className="w-full border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    >
                                      <option value="">Select condition...</option>
                                      <option value="NEW">New</option>
                                      <option value="USED">Used</option>
                                      <option value="REFURBISHED">Refurbished</option>
                                      <option value="PARTS_OR_REPAIR">Parts or Repair</option>
                                    </select>
                                  </div>
                                </div>

                                {/* #64: Condition Grade Picker */}
                                <div className="mt-3">
                                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                    Condition Grade
                                    {item.suggestedConditionGrade && (
                                      <span className="ml-2 text-xs text-indigo-500 font-normal">Auto-suggests: {item.suggestedConditionGrade}</span>
                                    )}
                                  </label>
                                  <div className="flex gap-2">
                                    {(['S','A','B','C','D'] as const).map(grade => {
                                      const labels: Record<string, string> = { S:'Like New', A:'Excellent', B:'Good', C:'Fair', D:'Poor' };
                                      const current = editState.conditionGrade ?? item.conditionGrade;
                                      return (
                                        <button
                                          key={grade}
                                          onClick={() => handleEditChange(item.id, 'conditionGrade', grade)}
                                          className={`flex-1 py-1.5 text-xs font-bold rounded border transition-colors ${current === grade ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}
                                          title={labels[grade]}
                                        >
                                          {grade}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="text-xs text-gray-400 mt-0.5">
                                    {(['S','A','B','C','D'] as const).map(g => {
                                      const labels: Record<string, string> = { S:'Like new', A:'Excellent', B:'Good', C:'Fair', D:'Poor' };
                                      return `${g}=${labels[g]}`;
                                    }).join(' · ')}
                                  </div>
                                </div>

                                {/* Listing Type Dropdown */}
                                <div className="mt-3">
                                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                    Listing Type
                                  </label>
                                  <select
                                    value={editState.listingType}
                                    onChange={(e) => handleEditChange(item.id, 'listingType', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  >
                                    <option value="FIXED">Fixed Price</option>
                                    <option value="AUCTION">Auction</option>
                                    <option value="REVERSE_AUCTION">Reverse Auction</option>
                                  </select>
                                </div>

                                {/* Reverse Auction Sub-fields */}
                                {editState.listingType === 'REVERSE_AUCTION' && (
                                  <div className="mt-3 space-y-2">
                                    <div>
                                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                        Daily drop ($)
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={(editState.reverseDailyDrop || 0) / 100}
                                        onChange={(e) => {
                                          const cents = Math.round(parseFloat(e.target.value || '0') * 100);
                                          handleEditChange(item.id, 'reverseDailyDrop', cents);
                                        }}
                                        placeholder="0.00"
                                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                        Floor price ($)
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={(editState.reverseFloorPrice || 0) / 100}
                                        onChange={(e) => {
                                          const cents = Math.round(parseFloat(e.target.value || '0') * 100);
                                          handleEditChange(item.id, 'reverseFloorPrice', cents);
                                        }}
                                        placeholder="0.00"
                                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Sprint 1: Tag Picker */}
                                <div className="mt-3">
                                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Tags</label>

                                  {/* AI suggested chips */}
                                  {item.suggestedTags && item.suggestedTags.length > 0 && (
                                    <div className="mb-2">
                                      <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Suggested:</span>
                                      {item.suggestedTags.map(tag => (
                                        <button
                                          key={tag}
                                          onClick={() => handleAddTag(item.id, tag)}
                                          className={`inline-flex items-center mr-1 mb-1 px-2 py-0.5 rounded-full text-xs border transition-colors
                                            ${(getEditState(item).tags || item.tags || []).includes(tag)
                                              ? 'bg-indigo-100 border-indigo-400 text-indigo-700'
                                              : 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 text-gray-600 dark:text-gray-400 hover:border-indigo-300'
                                            }`}
                                        >
                                          <span className="mr-1 text-indigo-500 font-bold">AI</span>{tag}
                                        </button>
                                      ))}
                                    </div>
                                  )}

                                  {/* BUG 4 FIX: Removed curated tag list (AI already suggests tags) */}
                                  {/* Custom tag input */}
                                  <input
                                    type="text"
                                    placeholder="Add a custom tag..."
                                    className="w-full border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded px-2 py-1 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleAddCustomTag(item.id, (e.target as HTMLInputElement).value);
                                        (e.target as HTMLInputElement).value = '';
                                      }
                                    }}
                                  />

                                  {/* Current tags display */}
                                  <div className="flex flex-wrap gap-1">
                                    {(getEditState(item).tags || item.tags || []).map(tag => (
                                      <span key={tag} className="inline-flex items-center bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                                        {tag}
                                        <button
                                          onClick={() => handleRemoveTag(item.id, tag)}
                                          className="ml-1 text-indigo-400 hover:text-indigo-700 font-bold"
                                        >
                                          ×
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {/* Quantity */}
                                <div className="w-32">
                                  <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Quantity</label>
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={editState.quantity}
                                    onChange={(e) => handleEditChange(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-full border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  />
                                </div>

                                {/* eBay Push Toggle — only show if eBay connected and not SIMPLE tier */}
                                {ebayConnected && tier !== 'SIMPLE' && (
                                  <div className="flex items-center gap-2 py-2 px-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                                    <input
                                      type="checkbox"
                                      id={`ebay-push-${item.id}`}
                                      checked={ebayPushItems[item.id] ?? false}
                                      onChange={(e) => {
                                        setEbayPushItems((prev) => ({
                                          ...prev,
                                          [item.id]: e.target.checked,
                                        }));
                                      }}
                                      className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                                    />
                                    <label
                                      htmlFor={`ebay-push-${item.id}`}
                                      className="text-sm font-medium text-blue-700 dark:text-blue-300 cursor-pointer"
                                    >
                                      Also push to eBay
                                    </label>
                                  </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center justify-between pt-1 border-t border-warm-200 dark:border-gray-700">
                                  <div className="flex items-center gap-3">
                                    <Link
                                      href={`/organizer/edit-item/${item.id}`}
                                      className="text-sm text-amber-700 hover:text-amber-800 font-medium underline"
                                    >
                                      Full Edit Page →
                                    </Link>
                                    <button
                                      onClick={() => handlePublishItem(item)}
                                      disabled={updateItemMutation.isPending || item.healthScore?.grade === 'blocked'}
                                      title={item.healthScore?.grade === 'blocked' ? 'This item must be reviewed before publishing' : ''}
                                      className={`px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                                        item.draftStatus === 'PUBLISHED'
                                          ? 'bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300 hover:bg-warm-200'
                                          : 'bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400'
                                      }`}
                                    >
                                      {item.draftStatus === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => handleSaveItem(item)}
                                    disabled={updateItemMutation.isPending}
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                                  >
                                    {updateItemMutation.isPending ? 'Saving...' : 'Save Changes'}
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {inlineCameraOpen && inlineCaptureItemId ? (
          <RapidCapture
            rapidItems={inlineRapidItems}
            addingToItemId={inlineCaptureItemId}
            mode={inlineCaptureMode}
            onModeChange={setInlineCaptureMode}
            onPhotoCapture={inlineCaptureMode === 'rapidfire' ? handleInlineCameraCapture : undefined}
            onAnalyze={inlineCaptureMode === 'regular' ? handleInlineCameraAnalyze : undefined}
            onComplete={() => { setInlineCameraOpen(false); queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] }); }}
            onCancel={() => { setInlineCameraOpen(false); queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] }); }}
            onAddToItem={() => {}}
            onThumbnailTap={() => {}}
            onNavigateToReview={() => { setInlineCameraOpen(false); queryClient.invalidateQueries({ queryKey: ['items', saleId, 'review'] }); }}
            readyCount={0}
            isAnalyzing={false}
          />
        ) : null}
      </main>
    </>
  );
};

export default ReviewPage;