/**
 * Edit Item Page
 *
 * Allows organizers to:
 * - Update item title, description, photos
 * - Change pricing or auction settings
 * - Update status (active, sold, etc.)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import { useEbayConnection } from '../../../lib/useEbayConnection';
import { useOrganizerTier } from '../../../hooks/useOrganizerTier';
import ItemPhotoManager from '../../../components/ItemPhotoManager'; // Phase 16
import PriceSuggestion from '../../../components/PriceSuggestion'; // CD2 Phase 3
import PriceResearchPanel from '../../../components/PriceResearchPanel';
import PricingSignalBanners from '../../../components/PricingSignalBanners';
import ItemPriceHistoryChart from '../../../components/ItemPriceHistoryChart';
import LocationSelector from '../../../components/LocationSelector';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../components/Skeleton';
import { CURATED_TAGS } from '../../../../shared/src'; // Sprint 1: Listing Factory tag vocabulary
import RapidCapture, { RapidItem } from '../../../components/RapidCapture';
import EbayCategoryPicker from '../../../components/EbayCategoryPicker';
import EncyclopediaInlineTip from '../../../components/EncyclopediaInlineTip';
import EbayCompTiles from '../../../components/EbayCompTiles';
import VoiceTagButton from '../../../components/VoiceTagButton';
import ConfirmDialog from '../../../components/ConfirmDialog';

const EditItemPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected: ebayConnected } = useEbayConnection();
  const { tier } = useOrganizerTier();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    quantity: 1,
    category: '',
    ebayCategoryId: '',
    ebayCategoryName: '',
    condition: '',
    conditionGrade: '',
    tags: [] as string[],
    status: 'AVAILABLE',
    listingType: 'FIXED',
    auctionEndTime: '',
    qrEmbedEnabled: true,
    isLegendary: false,
    tagColor: '',
    // Feature #311: Multi-Location Inventory View
    locationId: null as string | null,
  });

  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handlePrintLabel = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/items/${id}/label`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const win = window.open(url, '_blank');
      // Revoke after a short delay to allow the browser to load it
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (!win) showToast('Allow pop-ups to view the label', 'error');
    } catch {
      showToast('Failed to generate label', 'error');
    }
  };
  const [inlineCameraOpen, setInlineCameraOpen] = useState(false);
  const [inlineCaptureMode, setInlineCaptureMode] = useState<'rapidfire' | 'regular'>('regular');
  const [inlineRapidItems, setInlineRapidItems] = useState<RapidItem[]>([]);

  // D-XP-003: Organizer discount modal
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [pendingXpToSpend, setPendingXpToSpend] = useState<number | null>(null);

  // Confirm dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const openDiscountModal = (xpToSpend: number) => {
    setPendingXpToSpend(xpToSpend);
    setDiscountModalOpen(true);
  };

  // eBay push state
  const [ebayPushPending, setEbayPushPending] = useState(false);

  // eBay push mutation
  const ebayPushMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!item?.saleId) throw new Error('Sale ID not found');
      return api.post(`/ebay/organizer/sales/${item.saleId}/ebay-push`, {
        itemIds: [itemId],
      });
    },
    onSuccess: (response) => {
      const results = response.data.results || [];
      const result = results[0];
      if (result?.status === 'success') {
        showToast('Item listed on eBay', 'success');
        queryClient.invalidateQueries({ queryKey: ['item', id] });
      } else {
        const errorMsg = result?.code?.includes('NOT_CONNECTED')
          ? 'eBay not connected'
          : (result?.code?.includes('POLICIES') || result?.code?.includes('POLICY'))
          ? 'eBay policies not configured'
          : result?.message || 'Failed to push item';
        showToast(errorMsg, 'error');
      }
      setEbayPushPending(false);
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to push item to eBay';
      showToast(msg, 'error');
      setEbayPushPending(false);
    },
  });

  const handlePushToEbay = () => {
    if (!ebayConnected) {
      showToast('Connect eBay in Settings first', 'error');
      return;
    }
    if (tier === 'SIMPLE') {
      showToast('eBay selling requires PRO or TEAMS tier', 'error');
      return;
    }
    setEbayPushPending(true);
    ebayPushMutation.mutate(String(id));
  };

  const handlePhotoUpload = async (files: FileList | null, mode: 'upload' | 'camera') => {
    if (!files || files.length === 0 || !id) return;

    try {
      for (const file of Array.from(files)) {
        // Step 1: Upload to Cloudinary
        const formData = new FormData();
        formData.append('photo', file);
        const uploadRes = await api.post('/upload/item-photo', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const url: string = uploadRes.data.url;

        // Step 2: Append URL to item's photoUrls
        await api.post(`/items/${id}/photos`, { url });
      }

      // Refetch item to reflect new photos
      await queryClient.invalidateQueries({ queryKey: ['item', id] });
      showToast(`${mode === 'camera' ? 'Camera' : 'Photo'} uploaded successfully`, 'success');

      // Reset file inputs
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      const message = serverMsg ? `Upload failed: ${serverMsg}` : 'Photo upload failed. Please try again.';
      showToast(message, 'error');
    }
  };

  const handleInlineCameraCapture = async (photo: { blob: Blob; previewUrl: string }) => {
    if (!id || !item) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setInlineRapidItems(prev => [...prev, { id: tempId, thumbnailUrl: photo.previewUrl, draftStatus: 'DRAFT' }]);
    try {
      const fd = new FormData();
      fd.append('photos', photo.blob, 'capture.jpg');
      if (item.saleId) fd.append('saleId', item.saleId);
      const res = await api.post('/upload/sale-photos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const urls: string[] = res.data?.urls || [];
      if (urls[0]) {
        await api.post(`/items/${id}/photos`, { url: urls[0] });
        setInlineRapidItems(prev =>
          prev.filter(i => i.id !== tempId).map(i =>
            i.id === String(id) ? { ...i, photoUrls: [...(i.photoUrls || []), urls[0]] } : i
          )
        );
        queryClient.invalidateQueries({ queryKey: ['item', id] });
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
    queryClient.invalidateQueries({ queryKey: ['item', id] });
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

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const { data: item, isLoading } = useQuery({
    queryKey: ['item', id],
    queryFn: async () => {
      const response = await api.get(`/items/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (item) {
      // Normalize category to Title Case (e.g. "tools" → "Tools") so the
      // select value matches the option values defined in the form.
      // If category is missing, use empty string (will show placeholder)
      let normalizedCategory = '';
      if (item.category && typeof item.category === 'string') {
        const rawCat = item.category.trim();
        if (rawCat) {
          // Handle various formats: "tools", "Tools", "TOOLS", "vintage" → "Tools", "Vintage"
          // Split on space, title-case each word, then join
          normalizedCategory = rawCat
            .split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        }
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
          normalizedCondition = legacyMap[condUpper] || 'USED';
        }
      }

      setFormData({
        title: item.title || '',
        description: item.description || '',
        price: item.price ? item.price.toString() : '',
        quantity: item.quantity ?? 1,
        category: normalizedCategory,
        ebayCategoryId: item.ebayCategoryId || '',
        ebayCategoryName: item.ebayCategoryName || '',
        condition: normalizedCondition,
        conditionGrade: item.conditionGrade || '',
        tags: item.tags || [],
        status: item.status || 'AVAILABLE',
        listingType: item.listingType || 'FIXED',
        auctionEndTime: item.auctionEndTime ? new Date(item.auctionEndTime).toISOString().slice(0, 16) : '',
        qrEmbedEnabled: item.qrEmbedEnabled !== false,
        isLegendary: item.isLegendary === true,
        tagColor: item.tagColor || '',
        // Feature #311: Multi-Location Inventory View
        locationId: item.locationId || null,
      });
    }
  }, [item]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return await api.put(`/items/${id}`, formData);
    },
    onSuccess: () => {
      showToast('Item updated', 'success');
      router.push(`/organizer/dashboard`);
    },
    onError: (error: any) => {
      const status = error.response?.status;
      let message = 'Failed to update item';
      if (status === 400) {
        message = error.response?.data?.message || 'Validation error: please check your input';
      } else if (status === 401) {
        message = 'You are not authorized to update this item';
      } else if (status === 404) {
        message = 'Item not found';
      } else if (status === 500) {
        message = 'Server error: please try again later';
      } else {
        message = error.response?.data?.message || message;
      }
      showToast(message, 'error');
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/items/${id}/publish`);
    },
    onSuccess: () => {
      showToast('Item published!', 'success');
      // Refetch the item to update UI with new draftStatus
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to publish item';
      showToast(message, 'error');
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async () => {
      return await api.put(`/items/${id}`, { draftStatus: 'DRAFT' });
    },
    onSuccess: () => {
      showToast('Item unpublished', 'success');
      // Refetch the item to update UI with new draftStatus
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to unpublish item';
      showToast(message, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await api.delete(`/items/${id}`);
    },
    onSuccess: () => {
      showToast('Item deleted', 'success');
      const saleId = item?.saleId;
      if (saleId) {
        router.push(`/organizer/add-items/${saleId}`);
      } else {
        router.push('/organizer/dashboard');
      }
    },
    onError: () => {
      showToast('Failed to delete item', 'error');
    },
  });

  // D-XP-003: Apply organizer discount
  const applyDiscountMutation = useMutation({
    mutationFn: async (xpToSpend: number) => {
      return await api.post(`/items/${id}/organizer-discount`, { xpToSpend });
    },
    onSuccess: (data: any) => {
      showToast('Organizer Special applied!', 'success');
      setDiscountModalOpen(false);
      setPendingXpToSpend(null);
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to apply discount';
      showToast(message, 'error');
    },
  });

  // D-XP-003: Remove organizer discount
  const removeDiscountMutation = useMutation({
    mutationFn: async () => {
      return await api.delete(`/items/${id}/organizer-discount`);
    },
    onSuccess: () => {
      showToast('Discount removed (XP was permanently burned)', 'success');
      queryClient.invalidateQueries({ queryKey: ['item', id] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to remove discount';
      showToast(message, 'error');
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-24" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>
          <div className="text-center py-16">
            <p className="text-warm-600 dark:text-warm-400 text-lg">Item not found or you don&apos;t have permission to edit it.</p>
          </div>
        </div>
      </div>
    );
  }

  const handlePublishItem = async () => {
    try {
      if (item.draftStatus === 'PUBLISHED') {
        // Unpublish
        await unpublishMutation.mutateAsync();
      } else {
        // Publish
        await publishMutation.mutateAsync();
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update item status';
      showToast(message, 'error');
    }
  };


  return (
    <>
      <Head>
        <title>Edit Item - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white dark:bg-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium inline-block">
              Back to dashboard
            </Link>
          </div>

          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Edit Item</h1>
            {id && (
              <button
                type="button"
                onClick={handlePrintLabel}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                🏷️ Print Label
              </button>
            )}
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (!formData.title.trim()) {
              showToast('Title is required', 'error');
              return;
            }
            updateMutation.mutate();
          }} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <EbayCategoryPicker
              value={formData.category}
              ebayCategoryName={formData.ebayCategoryName}
              onChange={({ leafCategoryName, leafCategoryId, l1CategoryName }) =>
                setFormData({
                  ...formData,
                  category: l1CategoryName,
                  ebayCategoryId: leafCategoryId,
                  ebayCategoryName: leafCategoryName,
                })
              }
              label="Category"
              placeholder="Search and select an eBay category..."
            />

            {/* Feature #311: Multi-Location Inventory View */}
            <LocationSelector
              value={formData.locationId}
              onChange={(locationId) => setFormData({ ...formData, locationId })}
              label="Location"
              placeholder="Select a location (optional)"
            />

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Condition
              </label>
              <select
                value={formData.condition}
                onChange={(e) =>
                  setFormData({ ...formData, condition: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Select condition</option>
                <option value="NEW">New</option>
                <option value="USED">Used</option>
                <option value="REFURBISHED">Refurbished</option>
                <option value="PARTS_OR_REPAIR">Parts or Repair</option>
              </select>
            </div>

            {/* #64: Condition Grade Picker */}
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Condition Grade
              </label>
              <div className="flex gap-2">
                {(['S','A','B','C','D'] as const).map(grade => {
                  const labels: Record<string, string> = { S:'Like New', A:'Excellent', B:'Good', C:'Fair', D:'Poor' };
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => setFormData({ ...formData, conditionGrade: grade })}
                      className={`flex-1 py-1.5 text-xs font-bold rounded border transition-colors ${formData.conditionGrade === grade ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}
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
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Tags</label>

              {/* BUG 4 FIX: Removed curated tag list (AI already suggests tags) */}
              {/* Custom tag input + Voice-to-Tag button */}
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Add a custom tag..."
                  className="flex-1 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value && !formData.tags.includes(value)) {
                        setFormData({ ...formData, tags: [...formData.tags, value] });
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
                <VoiceTagButton
                  onExtraction={(result) => {
                    // Append extracted tags to the existing tags array, avoiding duplicates
                    const newTags = result.tags.filter(tag => !formData.tags.includes(tag));
                    if (newTags.length > 0) {
                      setFormData({ ...formData, tags: [...formData.tags, ...newTags] });
                    }
                  }}
                  className="flex-shrink-0"
                />
              </div>

              {/* Current tags display */}
              <div className="flex flex-wrap gap-1">
                {formData.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center bg-indigo-50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-xs px-2 py-0.5 rounded-full">
                    {tag}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) })}
                      className="ml-1 text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Feature #310: Tag Color for discount rules */}
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Tag Color
              </label>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <input
                    type="text"
                    value={formData.tagColor}
                    onChange={(e) =>
                      setFormData({ ...formData, tagColor: e.target.value })
                    }
                    placeholder="e.g., #EF4444 or red"
                    className="w-full border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                    Used for color-coded discount rules
                  </p>
                </div>
                {formData.tagColor && (
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-warm-300 dark:border-gray-500 flex-shrink-0"
                    style={{ backgroundColor: formData.tagColor }}
                    title="Color preview"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Price
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) =>
                  setFormData({ ...formData, price: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />

              {/* Encyclopedia Inline Tip — price guidance from Encyclopedia */}
              <EncyclopediaInlineTip
                category={formData.category}
                tags={formData.tags}
                title={formData.title}
              />
              {/* eBay Comp Tiles — comparable sales reference */}
              {id && <EbayCompTiles itemId={id as string} />}

              {/* Request Appraisal CTA */}
              <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-700">
                <Link
                  href="/organizer/appraisals?open=true"
                  className="w-full inline-block text-center bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Request Appraisal for This Item
                </Link>
              </div>

              {/* Price Research Panel — consolidated pricing tools */}
              <div className="mt-3">
                {id && (
                  <PriceResearchPanel
                    itemId={id as string}
                    itemTitle={formData.title}
                    itemDescription={formData.description}
                    category={formData.category}
                    condition={formData.condition}
                    currentPrice={formData.price ? parseFloat(formData.price) : undefined}
                    photoUrls={item?.photoUrls}
                    collapsed={false}
                    onPriceSelect={(price) =>
                      setFormData({
                        ...formData,
                        price: price.toString(),
                      })
                    }
                  />
                )}
              </div>

              {/* Price History Chart */}
              {id && <ItemPriceHistoryChart itemId={id as string} currentPrice={formData.price ? parseFloat(formData.price) : undefined} />}

              {/* Pricing Signals: Sleeper patterns & brand premiums */}
              {id && <PricingSignalBanners itemId={id as string} currentPrice={formData.price ? parseFloat(formData.price) : undefined} />}
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={formData.quantity}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: Math.max(1, parseInt(e.target.value) || 1) })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="AVAILABLE">Available</option>
                <option value="SOLD">Sold</option>
                <option value="UNAVAILABLE">Unavailable</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                Listing Type
              </label>
              <select
                value={formData.listingType}
                onChange={(e) =>
                  setFormData({ ...formData, listingType: e.target.value })
                }
                className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="FIXED">Fixed Price</option>
                <option value="AUCTION">Auction</option>
                <option value="REVERSE_AUCTION">Reverse Auction</option>
              </select>
            </div>

            {/* Auction End Time - show only for auction items */}
            {(formData.listingType === 'AUCTION' || formData.listingType === 'REVERSE_AUCTION') && (
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                  Auction End Time
                </label>
                <input
                  type="datetime-local"
                  value={formData.auctionEndTime}
                  onChange={(e) => setFormData({ ...formData, auctionEndTime: e.target.value })}
                  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Default: night before sale starts at 8:00 PM
                </p>
              </div>
            )}

                        {/* Phase 16: Photo management */}
            {item && (
              <div>
                {/* Hidden file input for upload-files button */}
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => handlePhotoUpload(e.target.files, 'upload')}
                />
                <ItemPhotoManager
                  itemId={String(id)}
                  initialPhotos={item.photoUrls || []}
                  headerActions={
                    <div className="flex gap-1">
                      <button
                        type="button"
                        title="Upload files"
                        onClick={() => uploadInputRef.current?.click()}
                        className="w-8 h-8 flex items-center justify-center bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800 text-base"
                      >
                        📁
                      </button>
                      <button
                        type="button"
                        title="Camera"
                        onClick={() => {
                          setInlineRapidItems(item ? [{ id: String(id), thumbnailUrl: item.photoUrls?.[0], draftStatus: 'PENDING_REVIEW', title: item.title, photoUrls: item.photoUrls }] : []);
                          setInlineCaptureMode('regular');
                          setInlineCameraOpen(true);
                        }}
                        className="w-8 h-8 flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 text-base"
                      >
                        📷
                      </button>
                      <button
                        type="button"
                        title="Rapidfire"
                        onClick={() => {
                          setInlineRapidItems(item ? [{ id: String(id), thumbnailUrl: item.photoUrls?.[0], draftStatus: 'PENDING_REVIEW', title: item.title, photoUrls: item.photoUrls }] : []);
                          setInlineCaptureMode('rapidfire');
                          setInlineCameraOpen(true);
                        }}
                        className="w-8 h-8 flex items-center justify-center bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800 text-base"
                      >
                        ⚡
                      </button>
                    </div>
                  }
                />
              </div>
            )}

            {/* Feature #136: QR Code Auto-Embedding toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="qrEmbedEnabled"
                checked={formData.qrEmbedEnabled}
                onChange={(e) => setFormData({ ...formData, qrEmbedEnabled: e.target.checked })}
                className="w-4 h-4 text-amber-600 bg-white border-warm-300 rounded focus:ring-2 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="qrEmbedEnabled" className="text-sm font-medium text-warm-700 dark:text-warm-300 cursor-pointer">
                Embed QR code in exported photos
              </label>
              <p className="text-xs text-warm-500 dark:text-warm-400">
                QR codes link to this item&apos;s page on FindA.Sale
              </p>
            </div>

            {/* Legendary suggestion banner (shows when price >= $75 and not already legendary) */}
            {parseFloat(formData.price) >= 75 && !formData.isLegendary && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">⭐</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      This item is priced at ${parseFloat(formData.price).toFixed(2)} — consider marking it Legendary to give Hunt Pass holders early access.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isLegendary: true })}
                    className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-bold py-1 px-3 rounded text-sm transition-colors"
                  >
                    Mark as Legendary
                  </button>
                </div>
              </div>
            )}

            {/* Mark as Legendary toggle */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="isLegendary"
                  checked={formData.isLegendary}
                  onChange={(e) => setFormData({ ...formData, isLegendary: e.target.checked })}
                  className="w-4 h-4 text-amber-600 bg-white border-warm-300 rounded focus:ring-2 focus:ring-amber-500 cursor-pointer mt-1"
                />
                <div className="flex-1">
                  <label htmlFor="isLegendary" className="text-sm font-bold text-amber-900 dark:text-amber-100 cursor-pointer block">
                    Mark as Legendary
                  </label>
                  <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                    Legendary items are shown early to high-rank shoppers (Sage+) and Hunt Pass subscribers for 4–12 hours before regular release.
                  </p>
                </div>
              </div>
            </div>

            {/* D-XP-003: Organizer Special Section */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100">Organizer Special</h3>
                {item.organizerDiscountAmount && item.organizerDiscountAmount > 0 && (
                  <span className="inline-block bg-amber-600 text-white text-xs font-bold px-2 py-1 rounded">
                    ${parseFloat(item.organizerDiscountAmount.toString()).toFixed(2)} off
                  </span>
                )}
              </div>

              {item.organizerDiscountAmount && item.organizerDiscountAmount > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-warm-600 dark:text-warm-300">
                    This item currently has an Organizer Special discount applied for ${parseFloat(item.organizerDiscountAmount.toString()).toFixed(2)} off.
                  </p>
                  <button
                    type="button"
                    onClick={() => removeDiscountMutation.mutate()}
                    disabled={removeDiscountMutation.isPending}
                    className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {removeDiscountMutation.isPending ? 'Removing...' : 'Remove Discount'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-warm-600 dark:text-warm-300">
                    Spend XP to create a shopper-facing discount on this item. No stacking with shopper coupons.
                  </p>
                  <p className="text-xs text-warm-500 dark:text-warm-400">
                    Your XP Balance: <span className="font-semibold">{user?.guildXp || 0} XP</span>
                  </p>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-warm-700 dark:text-warm-300">
                      Select Discount Amount
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openDiscountModal(200)}
                        disabled={!user || (user.guildXp || 0) < 200}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        $2 off (200 XP)
                      </button>
                      <button
                        type="button"
                        onClick={() => openDiscountModal(400)}
                        disabled={!user || (user.guildXp || 0) < 400}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        $4 off (400 XP)
                      </button>
                      <button
                        type="button"
                        onClick={() => openDiscountModal(500)}
                        disabled={!user || (user.guildXp || 0) < 500}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        $5 off (500 XP)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>

              <button
                type="button"
                disabled={publishMutation.isPending || unpublishMutation.isPending}
                onClick={handlePublishItem}
                className={`flex-1 font-bold py-2 px-4 rounded-lg disabled:opacity-50 ${
                  item.draftStatus === 'PUBLISHED'
                    ? 'bg-gray-500 hover:bg-gray-600 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {publishMutation.isPending || unpublishMutation.isPending
                  ? 'Updating...'
                  : item.draftStatus === 'PUBLISHED'
                    ? 'Unpublish'
                    : 'Publish'}
              </button>
            </div>

            {/* eBay Push Section */}
            {tier !== 'SIMPLE' && (
              <div className="pt-4 border-t border-warm-200 dark:border-gray-700">
                {item?.ebayListingId ? (
                  <a
                    href={`https://www.ebay.com/itm/${item.ebayListingId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    View on eBay
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handlePushToEbay}
                    disabled={ebayPushPending || !ebayConnected}
                    title={!ebayConnected ? 'Connect eBay in Settings first' : ''}
                    className={`w-full font-bold py-2 px-4 rounded-lg transition-colors ${
                      ebayConnected
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    } disabled:opacity-50`}
                  >
                    {ebayPushPending ? 'Pushing to eBay...' : '📤 Push to eBay'}
                  </button>
                )}
              </div>
            )}

            {/* Danger zone */}
            <div className="pt-4 border-t border-warm-200 dark:border-gray-700">
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteConfirmOpen(true)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? 'Deleting…' : '🗑️ Delete Item'}
              </button>
            </div>
          </form>

          {/* D-XP-003: Discount Confirmation Modal */}
          {discountModalOpen && pendingXpToSpend && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 max-w-sm mx-4">
                <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                  Confirm Organizer Special
                </h2>
                <p className="text-sm text-warm-600 dark:text-warm-300 mb-4">
                  Spend <span className="font-semibold">{pendingXpToSpend} XP</span> to apply a ${(pendingXpToSpend / 200) * 2} discount to this item?
                </p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mb-6">
                  XP is permanently burned. Shoppers will see "Organizer Special" at checkout. This discount cannot stack with shopper coupons.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountModalOpen(false);
                      setPendingXpToSpend(null);
                    }}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-warm-900 font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      applyDiscountMutation.mutate(pendingXpToSpend);
                    }}
                    disabled={applyDiscountMutation.isPending}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {applyDiscountMutation.isPending ? 'Applying...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {inlineCameraOpen ? (
            <RapidCapture
              rapidItems={inlineRapidItems}
              addingToItemId={String(id)}
              mode={inlineCaptureMode}
              onModeChange={setInlineCaptureMode}
              onPhotoCapture={inlineCaptureMode === 'rapidfire' ? handleInlineCameraCapture : undefined}
              onAnalyze={inlineCaptureMode === 'regular' ? handleInlineCameraAnalyze : undefined}
              onComplete={() => { setInlineCameraOpen(false); queryClient.invalidateQueries({ queryKey: ['item', id] }); }}
              onCancel={() => { setInlineCameraOpen(false); queryClient.invalidateQueries({ queryKey: ['item', id] }); }}
              onAddToItem={() => {}}
              onThumbnailTap={() => {}}
              onNavigateToReview={() => setInlineCameraOpen(false)}
              readyCount={0}
              isAnalyzing={false}
            />
          ) : null}

          <ConfirmDialog
            isOpen={deleteConfirmOpen}
            title="Delete Item"
            message={`Delete "${item?.title || 'this item'}"? This cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={() => {
              setDeleteConfirmOpen(false);
              deleteMutation.mutate();
            }}
            onCancel={() => setDeleteConfirmOpen(false)}
            variant="danger"
          />
        </div>
      </div>
    </>
  );
};

export default EditItemPage;