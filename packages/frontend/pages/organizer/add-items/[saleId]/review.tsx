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

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../../components/Skeleton';
import NearMissNudge from '../../../../components/NearMissNudge'; // Feature 61
import ItemPhotoManager from '../../../../components/ItemPhotoManager'; // Phase 16
import PriceSuggestion from '../../../../components/PriceSuggestion'; // CD2 Phase 3
import { CURATED_TAGS } from '../../../../../shared/src'; // Sprint 1: Listing Factory tag vocabulary

type AspectRatio = '4:3' | '1:1' | '16:9';

interface ItemEditState {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  conditionGrade?: string; // #64: S | A | B | C | D
  quantity: number;
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
}

const CATEGORIES = [
  'Furniture',
  'Jewelry',
  'Art & Decor',
  'Clothing',
  'Kitchenware',
  'Tools & Hardware',
  'Collectibles',
  'Electronics',
  'Books & Media',
  'Other',
];

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
    const ar = opts.aspectRatio.replace(':', '_');
    transforms.push(`ar_${ar},c_fill`);
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

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [editStates, setEditStates] = useState<Map<string, ItemEditState>>(new Map());
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [showBuyerPreview, setShowBuyerPreview] = useState(router.query.preview === 'true');

  // Auto-enable buyer preview on mount if preview=true in query
  useEffect(() => {
    if (router.query.preview === 'true') {
      setShowBuyerPreview(true);
    }
  }, [router.query.preview]);

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['items', saleId, 'review'],
    queryFn: async () => {
      if (!saleId) return [];
      // Fetch all published items for the sale so organizers can review
      // items regardless of how they were created (Manual, Batch, CSV,
      // or Rapidfire). Uses the same endpoint as the add-items table.
      const response = await api.get(`/items?saleId=${saleId}`);
      return (response.data || []) as Item[];
    },
    enabled: !!saleId,
  });

  const updateItemMutation = useMutation({
    mutationFn: async (payload: {
      itemId: string;
      updates: Partial<Item>;
    }) => {
      return await api.patch(`/items/${payload.itemId}`, payload.updates);
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

  const getEditState = (item: Item): ItemEditState => {
    if (!editStates.has(item.id)) {
      editStates.set(item.id, {
        title: item.title,
        description: item.description ?? '',
        price: item.price ?? 0,
        category: item.category ?? '',
        condition: item.condition ?? '',
        conditionGrade: item.conditionGrade ?? undefined, // #64
        quantity: item.quantity ?? 1,
        aspectRatio: '4:3',
        brightness: 50,
        contrast: 50,
        backgroundRemoved: item.backgroundRemoved,
        autoEnhanced: item.autoEnhanced,
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
        quantity: editState.quantity,
        backgroundRemoved: editState.backgroundRemoved,
        tags: editState.tags, // Sprint 1: Save tags
      },
    });
    showToast('Item saved', 'success');
  };

  const handlePublishItem = async (item: Item) => {
    const newStatus = item.draftStatus === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    await updateItemMutation.mutateAsync({
      itemId: item.id,
      updates: { draftStatus: newStatus } as any,
    });
    showToast(newStatus === 'PUBLISHED' ? 'Item published' : 'Item unpublished', 'success');
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
              &larr; Back to Capture
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
                            src={buildCloudinaryUrl(item.photoUrls[0], {
                              aspectRatio: '4:3',
                              backgroundRemoved: item.backgroundRemoved,
                            })}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="p-3">
                        <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm truncate">
                          {item.title}
                        </p>
                        <p className="text-amber-700 font-bold text-sm mt-1">
                          {item.price != null ? `$${item.price.toFixed(2)}` : 'No price'}
                        </p>
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
                          onClick={() => setSelectedItems(new Set())}
                          className="px-3 py-1 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 text-warm-700 dark:text-warm-300 text-sm rounded hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    <div className="space-y-3">
                      {items.map((item) => {
                      const conf = confidenceLabel(item.aiConfidence, item.isAiTagged);
                      return (
                        <div
                          key={item.id}
                          className={`bg-white dark:bg-gray-800 border rounded-lg overflow-hidden ${confidenceBorderClass(item.aiConfidence, item.isAiTagged)}`}
                        >
                          {/* Collapsed row — always visible */}
                          <div
                            className="p-4 flex items-center gap-4 cursor-pointer hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900"
                            onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                          >
                            <input
                              type="checkbox"
                              checked={selectedItems.has(item.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                const next = new Set(selectedItems);
                                if (e.target.checked) next.add(item.id);
                                else next.delete(item.id);
                                setSelectedItems(next);
                              }}
                              className="w-4 h-4 rounded border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 text-amber-600 focus:ring-amber-500"
                              onClick={(e) => e.stopPropagation()}
                            />
                            {item.photoUrls[0] && (
                              <img src={item.photoUrls[0]} alt={item.title} className="w-16 h-16 object-cover rounded flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-warm-900 dark:text-warm-100 truncate">{item.title}</p>
                              <p className="text-sm text-warm-600 dark:text-warm-400">
                                {item.price != null ? `$${item.price.toFixed(2)}` : 'No price'}{' · '}{item.category || 'Uncategorized'}
                              </p>
                              {/* Sprint 1: Health score bar */}
                              {item.healthScore && (
                                <div className="mt-2">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          item.healthScore.grade === 'clear' ? 'bg-green-400' :
                                          item.healthScore.grade === 'nudge' ? 'bg-amber-400' : 'bg-red-400'
                                        }`}
                                        style={{ width: `${item.healthScore.score}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs font-medium ${
                                      item.healthScore.grade === 'clear' ? 'text-green-600' :
                                      item.healthScore.grade === 'nudge' ? 'text-amber-600' : 'text-red-600'
                                    }`}>
                                      {item.healthScore.score}
                                    </span>
                                  </div>
                                  {item.healthScore.grade === 'blocked' && (
                                    <p className="text-xs text-red-500 mt-1">Add a photo and title to publish</p>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <div className={`text-xs font-semibold ${conf.color}`}>
                                {conf.text}{item.isAiTagged && item.aiConfidence != null ? ` (${Math.round(item.aiConfidence * 100)}%)` : ''}
                              </div>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                item.draftStatus === 'PUBLISHED'
                                  ? 'bg-green-100 text-green-700'
                                  : item.draftStatus === 'PENDING_REVIEW'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-warm-100 dark:bg-gray-700 text-warm-600'
                              }`}>
                                {item.draftStatus === 'PUBLISHED' ? 'Published' : item.draftStatus === 'PENDING_REVIEW' ? 'Pending' : 'Draft'}
                              </span>
                              <span className="text-warm-400 text-sm">{expandedItemId === item.id ? '▲' : '▼'}</span>
                            </div>
                          </div>

                          {/* Expanded edit panel */}
                          {expandedItemId === item.id && (() => {
                            const editState = getEditState(item);
                            return (
                              <div className="border-t border-warm-200 dark:border-gray-700 p-4 bg-warm-50 dark:bg-gray-900 space-y-4">

                                {/* Photos */}
                                <div>
                                  <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-2">Photos</label>
                                  <ItemPhotoManager
                                    itemId={item.id}
                                    initialPhotos={item.photoUrls || []}
                                  />
                                </div>

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
                                  <div className="mt-2">
                                    <PriceSuggestion
                                      title={editState.title}
                                      category={editState.category}
                                      condition={editState.condition}
                                      onApplyPrice={(price) => handleEditChange(item.id, 'price', price)}
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
                                      <option value="LIKE_NEW">Like New</option>
                                      <option value="GOOD">Good</option>
                                      <option value="FAIR">Fair</option>
                                      <option value="POOR">Poor</option>
                                    </select>
                                  </div>
                                </div>

                                {/* #64: Condition Grade Picker */}
                                <div className="mt-3">
                                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                    Condition Grade
                                    {item.suggestedConditionGrade && (
                                      <span className="ml-2 text-xs text-indigo-500 font-normal">AI suggests: {item.suggestedConditionGrade}</span>
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

                                {/* Sprint 1: Tag Picker */}
                                <div className="mt-3">
                                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Tags</label>

                                  {/* AI suggested chips */}
                                  {item.suggestedTags && item.suggestedTags.length > 0 && (
                                    <div className="mb-2">
                                      <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">AI suggested:</span>
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

                                  {/* Curated tag grid — show top 20 visible, scrollable */}
                                  <div className="grid grid-cols-3 gap-1 mb-2 max-h-32 overflow-y-auto pb-1">
                                    {(CURATED_TAGS as readonly string[]).slice(0, 20).map(tag => (
                                      <button
                                        key={tag}
                                        onClick={() => handleAddTag(item.id, tag)}
                                        className={`text-xs px-2 py-1 rounded border truncate transition-colors
                                          ${(getEditState(item).tags || item.tags || []).includes(tag)
                                            ? 'bg-indigo-100 border-indigo-400 text-indigo-700 font-medium'
                                            : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-indigo-300'
                                          }`}
                                      >
                                        {tag}
                                      </button>
                                    ))}
                                  </div>

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
                                      className={`px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-50 ${
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
      </main>
    </>
  );
};

export default ReviewPage;