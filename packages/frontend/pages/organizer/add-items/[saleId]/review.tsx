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

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../../components/Skeleton';
import NearMissNudge from '../../../../components/NearMissNudge'; // Feature 61

type AspectRatio = '4:3' | '1:1' | '16:9';

interface ItemEditState {
  title: string;
  price: number;
  category: string;
  aspectRatio: AspectRatio;
  brightness: number;
  contrast: number;
  backgroundRemoved: boolean;
  autoEnhanced: boolean;
}

interface Item {
  id: string;
  title: string;
  price: number;
  category: string;
  photoUrls: string[];
  aiConfidence: number;
  backgroundRemoved: boolean;
  autoEnhanced: boolean;
  draftStatus: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED';
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

function confidenceBorderClass(score: number): string {
  if (score >= 0.8) return 'border-l-4 border-green-500';
  if (score >= 0.55) return 'border-l-4 border-amber-400';
  return 'border-l-4 border-red-500';
}

function confidenceLabel(score: number): { text: string; color: string } {
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
  const [showBuyerPreview, setShowBuyerPreview] = useState(false);

  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['items', saleId, 'draft'],
    queryFn: async () => {
      if (!saleId) return [];
      // Use the organizer-only /items/drafts endpoint which correctly filters
      // for draftStatus IN ['DRAFT', 'PENDING_REVIEW']. GET /items uses
      // PUBLIC_ITEM_FILTER (draftStatus='PUBLISHED') and ignores query params.
      const response = await api.get(`/items/drafts?saleId=${saleId}`);
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
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'draft'] });
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
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'draft'] });
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
      queryClient.invalidateQueries({ queryKey: ['items', saleId, 'draft'] });
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
        price: item.price,
        category: item.category,
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
        price: editState.price,
        category: editState.category,
        backgroundRemoved: editState.backgroundRemoved,
      },
    });
    showToast('Item saved', 'success');
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

  const previewItems = showBuyerPreview
    ? items.filter((i) => i.draftStatus === 'PENDING_REVIEW')
    : items;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white py-8">
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

      <main className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8">
            <Link
              href={`/organizer/add-items/${saleId}`}
              className="text-amber-700 hover:text-amber-800 text-sm font-medium inline-flex items-center gap-1"
            >
              &larr; Back to Capture
            </Link>
          </div>

          {showBuyerPreview ? (
            <>
              <div className="mb-6">
                <button
                  onClick={() => setShowBuyerPreview(false)}
                  className="px-4 py-2 bg-white border border-warm-300 rounded-lg text-warm-700 hover:bg-warm-50 font-medium text-sm"
                >
                  Back to Editing
                </button>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-warm-200 p-6 mb-8">
                <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">
                  Preview only
                </div>
                <h2 className="text-2xl font-bold text-warm-900 mb-6">Buyer Preview</h2>

                <div className="grid grid-cols-2 gap-4">
                  {previewItems.map((item) => (
                    <div key={item.id} className="bg-white border border-warm-200 rounded-lg overflow-hidden">
                      <div className="aspect-square bg-warm-100 overflow-hidden">
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
                        <p className="font-semibold text-warm-900 text-sm truncate">
                          {item.title}
                        </p>
                        <p className="text-amber-700 font-bold text-sm mt-1">
                          ${item.price.toFixed(2)}
                        </p>
                        <p className="text-warm-600 text-xs mt-1">{item.category}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white rounded-lg shadow-sm border border-warm-200 p-6 mb-8">
                <h1 className="text-3xl font-bold text-warm-900 mb-2">Review & Publish</h1>
                <p className="text-warm-600 mb-4">
                  {items.length} item{items.length !== 1 ? 's' : ''} ready for publication.
                </p>

                {/* Feature 61: Near-Miss Nudge — encourage completing the listing */}
                <NearMissNudge
                  current={items.filter((i: any) => i.photoUrls?.length > 0 && i.price > 0).length}
                  target={items.length}
                  reward="a fully photo'd & priced listing"
                  unit="item"
                />

                {!itemsLoading && items.length > 0 && (
                  <button
                    onClick={handlePublishAll}
                    disabled={publishMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50 mb-6"
                  >
                    {publishMutation.isPending ? 'Publishing...' : `Publish All (${items.length})`}
                  </button>
                )}

                {itemsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-center py-12 text-warm-600">
                    <p>No items ready for publication.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => {
                      const conf = confidenceLabel(item.aiConfidence);
                      return (
                        <div
                          key={item.id}
                          className={`bg-white border rounded-lg overflow-hidden p-4 flex items-center gap-4 ${confidenceBorderClass(item.aiConfidence)}`}
                        >
                          {item.photoUrls[0] && (
                            <img
                              src={item.photoUrls[0]}
                              alt={item.title}
                              className="w-16 h-16 object-cover rounded"
                            />
                          )}
                          <div className="flex-1">
                            <p className="font-semibold text-warm-900">{item.title}</p>
                            <p className="text-sm text-warm-600">
                              ${item.price.toFixed(2)} · {item.category}
                            </p>
                          </div>
                          <div className={`text-xs font-semibold ${conf.color}`}>
                            {conf.text} ({Math.round(item.aiConfidence * 100)}%)
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
