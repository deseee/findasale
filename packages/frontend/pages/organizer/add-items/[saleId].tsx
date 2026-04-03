/**
 * Add Items Detail Page
 *
 * Tabs:
 * - Manual Entry: standard form + photo upload
 * - Camera (AI — one item): capture → AI pre-fill → review or auto-create
 * - Batch (AI — multiple): SmartInventoryUpload for bulk photo processing
 * - CSV: modal trigger
 *
 * Phase 3 additions (Camera Workflow v2):
 * - autoEnhanceImage: Canvas brightness+saturation correction (non-blocking)
 * - cropTo4x3: Center crop to 4:3 aspect ratio
 * - checkImageQuality: Detect dark images for retake toast
 * - detectFace: Stub for TensorFlow.js COCO-SSD (on-device privacy)
 * - Rapidfire pipeline: capture → enhance → crop → quality check → face detect → upload
 * - Retake toast for dark images
 * - Face detection modal before upload
 * - Pre-capture quality hint on viewfinder
 *
 * Session 132 fixes:
 * - Removed Qty column from item list (quantity not in Prisma schema)
 * - Removed Quantity input from manual entry form
 * - Fixed bulk update URL: /items/bulk (was /items/bulk-update — silent 404)
 * - Restored Camera tab: wired RapidCapture with AI analysis flow
 * - Camera: capture → upload → AI analyze → pre-fill manual form → review
 * - maxPhotos=5 per camera session (one-item-at-a-time flow)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import CSVImportModal from '../../../components/CSVImportModal';
import SmartInventoryUpload from '../../../components/SmartInventoryUpload';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';
import Skeleton from '../../../components/Skeleton';
import RapidCapture from '../../../components/RapidCapture';
import PreviewModal from '../../../components/camera/PreviewModal';
import { useUploadQueue } from '../../../hooks/useUploadQueue';
import { useVoiceInput } from '../../../hooks/useVoiceInput';
import BulkConfirmModal from '../../../components/BulkConfirmModal';
import BulkPhotoModal from '../../../components/BulkPhotoModal';
import BulkTagModal from '../../../components/BulkTagModal';
import BulkActionDropdown from '../../../components/BulkActionDropdown';
import BulkCategoryModal from '../../../components/BulkCategoryModal';
import BulkStatusModal from '../../../components/BulkStatusModal';
import BulkPriceModal from '../../../components/BulkPriceModal';
import BulkOperationErrorModal from '../../../components/BulkOperationErrorModal';
import ValuationWidget from '../../../components/ValuationWidget';
import VoiceTagButton from '../../../components/VoiceTagButton'; // Feature #42: Voice-to-Tag

/**
 * Phase 3: On-Device Image Processing Utilities
 */

async function autoEnhanceImage(blob: Blob): Promise<{ blob: Blob; enhanced: boolean }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const offscreen = document.createElement('canvas');
        offscreen.width = img.width;
        offscreen.height = img.height;
        const octx = offscreen.getContext('2d')!;
        octx.filter = 'brightness(1.15) saturate(1.1)';
        octx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        offscreen.toBlob((enhanced) => {
          resolve({ blob: enhanced || blob, enhanced: !!enhanced });
        }, 'image/jpeg', 0.92);
      } catch {
        URL.revokeObjectURL(url);
        resolve({ blob, enhanced: false });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ blob, enhanced: false });
    };
    img.src = url;
  });
}

async function cropTo4x3(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        const targetRatio = 4 / 3;
        const srcRatio = img.width / img.height;
        let sx = 0,
          sy = 0,
          sw = img.width,
          sh = img.height;
        if (srcRatio > targetRatio) {
          sw = Math.floor(img.height * targetRatio);
          sx = Math.floor((img.width - sw) / 2);
        } else {
          sh = Math.floor(img.width / targetRatio);
          sy = Math.floor((img.height - sh) / 2);
        }
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        URL.revokeObjectURL(url);
        canvas.toBlob((cropped) => resolve(cropped || blob), 'image/jpeg', 0.92);
      } catch {
        URL.revokeObjectURL(url);
        resolve(blob);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}

type LightingTier = 1 | 2 | 3;

interface ImageQualityResult {
  tier: LightingTier;
  avgBrightness: number; // 0-100 normalized
  reason: 'good' | 'soft' | 'overexposed' | 'dark';
}

async function checkImageQuality(blob: Blob): Promise<ImageQualityResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const sampleSize = 64;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
      URL.revokeObjectURL(url);
      const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        total += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      }
      const avgRaw = total / (sampleSize * sampleSize);
      // Normalize 0-255 to 0-100
      const avgNormalized = (avgRaw / 255) * 100;

      // Determine tier and reason
      let tier: LightingTier = 1;
      let reason: 'good' | 'soft' | 'overexposed' | 'dark' = 'good';

      if (avgNormalized < 15) {
        tier = 3;
        reason = 'dark';
      } else if (avgNormalized > 97) {
        tier = 2;
        reason = 'overexposed';
      } else if (avgNormalized >= 15 && avgNormalized < 25) {
        tier = 2;
        reason = 'soft';
      } else {
        tier = 1;
        reason = 'good';
      }

      resolve({ tier, avgBrightness: avgNormalized, reason });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ tier: 1, avgBrightness: 50, reason: 'good' });
    };
    img.src = url;
  });
}

// TODO: Implement face detection with @tensorflow-models/coco-ssd
// Patrick: run `pnpm add @tensorflow/tfjs @tensorflow-models/coco-ssd` in packages/frontend
// then replace this stub with real detection
async function detectFace(_blob: Blob): Promise<boolean> {
  return false;
}

type ActiveTab = 'camera' | 'batch' | 'manual';

interface RapidItem {
  id: string;
  thumbnailUrl?: string;
  draftStatus: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED';
  title?: string;
  category?: string;
  aiError?: string;
  photoUrls?: string[];
  autoEnhanced?: boolean;
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

const CONDITIONS = ['New', 'Used', 'Refurbished', 'Parts or Repair'];

// Feature #57: Rarity tiers — empty string means auto-assign from price
const RARITY_OPTIONS = [
  { value: '', label: 'Auto-assign from price' },
  { value: 'COMMON', label: 'Common' },
  { value: 'UNCOMMON', label: 'Uncommon' },
  { value: 'RARE', label: 'Rare' },
  { value: 'ULTRA_RARE', label: 'Ultra Rare' },
  { value: 'LEGENDARY', label: 'Legendary' },
];

const normalizeToArray = (value: string | undefined, arr: string[]): string => {
  if (!value) return '';
  const lowerValue = value.toLowerCase();
  const match = arr.find(item => item.toLowerCase() === lowerValue);
  return match || '';
};

const formatCategory = (category: string | null | undefined): string => {
  if (!category) return '\u2014';
  return category
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const computeDraftStatus = (item: any): 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' => {
  // Use draftStatus from database as source of truth
  // This field is now returned from GET /api/items?saleId=...
  if (item.draftStatus === 'DRAFT' || item.draftStatus === 'PENDING_REVIEW' || item.draftStatus === 'PUBLISHED') {
    return item.draftStatus;
  }
  // Fallback for items created locally before first save (e.g., temp-* IDs during rapidfire)
  return 'DRAFT';
};

const emptyForm = {
  title: '',
  description: '',
  category: '',
  condition: '',
  price: '',
  quantity: 1,
  listingType: 'FIXED',
  rarity: '', // Feature #57: Rarity — empty means auto-assign from price
  startingBid: '',
  reservePrice: '',
  reverseDailyDrop: '',
  reverseFloorPrice: '',
  shippingAvailable: false,
  shippingPrice: '',
  tags: [] as string[], // Feature #42: Voice-to-tag support
  photoUrls: [] as string[],
};

const AddItemsDetailPage = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const inMutationFlight = useRef<boolean>(false);

  // Feature #42: Voice-to-tag input
  const { isSupported: voiceSupported, isListening, transcript, startListening, stopListening } = useVoiceInput();
  const [voiceLoading, setVoiceLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('camera');
  const [formData, setFormData] = useState(emptyForm);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkPrice, setBulkPrice] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraAnalyzing, setCameraAnalyzing] = useState(false);
  const [regularAnalyzing, setRegularAnalyzing] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);

  // Rapidfire Mode state
  const [captureMode, setCaptureMode] = useState<'rapidfire' | 'regular'>('rapidfire');
  const [rapidItems, setRapidItems] = useState<RapidItem[]>([]);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [aiPaused, setAiPaused] = useState(false);
  const [addingToItemId, setAddingToItemId] = useState<string | null>(null);
  // Ref to track current append target — avoids stale closure in async processAndUploadRapidPhoto
  // This ref is read at upload time, not capture time, so it always has the latest value
  const addingToItemIdRef = useRef<string | null>(null);
  const { queue, enqueue, uploadingCount } = useUploadQueue(saleId as string);

  // Phase 3.5: Tiered lighting quality system state
  const [qualityModalOpen, setQualityModalOpen] = useState(false);
  const [qualityResult, setQualityResult] = useState<ImageQualityResult | null>(null);
  const [pendingQualityBlob, setPendingQualityBlob] = useState<Blob | null>(null);
  const [pendingQualityTempId, setPendingQualityTempId] = useState<string | null>(null);
  const [pendingQualityAppendId, setPendingQualityAppendId] = useState<string | null>(null);

  // Face detection modal state
  const [faceDetectionOpen, setFaceDetectionOpen] = useState(false);
  const [pendingFaceBlob, setPendingFaceBlob] = useState<Blob | null>(null);
  const [pendingFaceTempId, setPendingFaceTempId] = useState<string | null>(null);
  const [pendingFaceAppendId, setPendingFaceAppendId] = useState<string | null>(null);

  // Phase 3-5: Bulk Operations Toolkit state
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkConfirmData, setBulkConfirmData] = useState<{
    operation: string;
    value?: any;
  } | null>(null);
  const [bulkPhotoModalOpen, setBulkPhotoModalOpen] = useState(false);

  // Expandable item cards (like review & publish page)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [itemEditState, setItemEditState] = useState<Record<string, { title: string; price: string; category: string; condition: string; description: string }>>({});

  const getItemEditState = useCallback((item: any) => {
    return itemEditState[item.id] || {
      title: item.title || '',
      price: item.price != null ? item.price.toString() : '',
      category: item.category || '',
      condition: item.condition || '',
      description: item.description || '',
    };
  }, [itemEditState]);

  const handleInlineItemSave = useCallback(async (itemId: string) => {
    const state = itemEditState[itemId];
    if (!state) return;
    try {
      await api.put(`/items/${itemId}`, {
        title: state.title,
        price: state.price ? parseFloat(state.price) : undefined,
        category: state.category,
        condition: state.condition,
        description: state.description,
      });
      showToast('Item saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
      setExpandedItemId(null);
    } catch {
      showToast('Failed to save item', 'error');
    }
  }, [itemEditState, saleId, queryClient, showToast]);

  // Feature #244: eBay CSV export state
  const [ebayExportOpen, setEbayExportOpen] = useState(false);
  const [ebayPhotoMode, setEbayPhotoMode] = useState<'watermarked' | 'clean'>('watermarked');
  const [ebayExporting, setEbayExporting] = useState(false);
  const [bulkTagModalOpen, setBulkTagModalOpen] = useState(false);
  const [bulkCategoryModalOpen, setBulkCategoryModalOpen] = useState(false);
  const [bulkStatusModalOpen, setBulkStatusModalOpen] = useState(false);
  const [bulkPriceModalOpen, setBulkPriceModalOpen] = useState(false);
  const [bulkErrorModalOpen, setBulkErrorModalOpen] = useState(false);
  const [bulkErrorData, setBulkErrorData] = useState<{
    title: string;
    message: string;
    errors?: Array<{ itemId: string; reason: string }>;
    itemCount?: number;
  } | null>(null);

  // CRITICAL: All hooks must be called unconditionally at top of component (before any early returns)
  // React hooks rule: call hooks in the same order on every render
  const { data: sale } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      if (!saleId) return null;
      const response = await api.get(`/sales/${saleId}`);
      return response.data || null;
    },
    enabled: !!saleId,
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['items', saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const response = await api.get(`/items?saleId=${saleId}`);
      return response.data || [];
    },
    enabled: !!saleId && !inMutationFlight.current,
  });

  // P1-A: Validate saleId on route ready
  useEffect(() => {
    if (router.isReady && !saleId) {
      router.replace('/organizer/dashboard');
    }
  }, [router.isReady, saleId, router]);

  // Early returns after all hooks
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // P1-A: Loading guard — don't render if saleId is falsy
  if (!saleId) {
    return null;
  }

  const publishedCount = items.filter((i: any) => computeDraftStatus(i) === 'PUBLISHED').length;
  const unpublishedCount = items.filter((i: any) => computeDraftStatus(i) !== 'PUBLISHED').length;
  const draftCount = items.filter((i: any) => computeDraftStatus(i) === 'DRAFT').length;

  const createMutation = useMutation({
    mutationFn: async () => {
      const photoUrls = formData.photoUrls;
      return await api.post(
        `/items`,
        { ...formData, saleId, photoUrls },
        { headers: { 'Content-Type': 'application/json' } }
      );
    },
    onMutate: () => { inMutationFlight.current = true; },
    onSuccess: () => {
      showToast('Item created successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
      setFormData(emptyForm);
      setBulkPrice('');
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message || 'Failed to create item';
      showToast(message, 'error');
    },
    onSettled: () => { inMutationFlight.current = false; },
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await api.delete(`/items/${itemId}`);
    },
    onMutate: () => { inMutationFlight.current = true; },
    onSuccess: () => {
      showToast('Item deleted', 'success');
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message || 'Failed to delete item';
      showToast(message, 'error');
    },
    onSettled: () => { inMutationFlight.current = false; },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (payload: { itemIds: string[]; operation: string; value?: any; priceType?: string }) => {
      return await api.post(`/items/bulk`, payload);
    },
    onMutate: () => { inMutationFlight.current = true; },
    onSuccess: (response: any) => {
      const succeeded = response.data.succeeded || [];
      const failed = response.data.failed || [];
      const skipped = response.data.skipped || []; // P1-B: Handle skipped items from backend
      const count = response.data.count || succeeded.length || selectedItems.size;
      const operation = bulkConfirmData?.operation || 'update';
      const operationLabel = {
        delete: 'Deleted',
        isActive: 'Updated visibility for',
        price: 'Updated price for',
        category: 'Updated category for',
        status: 'Updated status for',
        tags: 'Updated tags for',
      }[operation] || 'Updated';

      // P1-B: Show warning toast if items were skipped
      if (skipped.length > 0) {
        const skipReasons = skipped.map((s: { reason?: string }) => s.reason).filter(Boolean);
        const skipMessage = skipReasons.length > 0 ? ` — ${skipReasons[0]}` : '';
        showToast(`${skipped.length} item(s) skipped${skipMessage}`, 'warning');
      }

      // Check for partial failures (207 response with failed items)
      if (failed.length > 0) {
        const toastMessage = `${succeeded.length}/${count + failed.length} items updated — ${failed.length} skipped`;
        showToast(toastMessage, 'warning');

        setBulkErrorData({
          title: 'Partial Success',
          message: `${succeeded.length} item(s) updated successfully, ${failed.length} could not be updated.`,
          errors: failed,
          itemCount: failed.length,
        });
        setBulkErrorModalOpen(true);
      } else if (succeeded.length > 0) {
        // All requested items succeeded (no failures, though may have been skipped)
        showToast(`${operationLabel} ${succeeded.length} item${succeeded.length !== 1 ? 's' : ''}`, 'success');
      }

      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
      setSelectedItems(new Set());
      setBulkPrice('');
      setBulkConfirmOpen(false);
      setBulkConfirmData(null);

      // Show error modal if there were per-item errors (backward compat)
      if (response.data.errors && response.data.errors.length > 0) {
        setBulkErrorData({
          title: 'Some items skipped',
          message: `${response.data.errors.length} item(s) could not be updated due to status restrictions`,
          errors: response.data.errors,
          itemCount: response.data.errors.length,
        });
        setBulkErrorModalOpen(true);
      }
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message || 'Failed to update items';
      showToast(message, 'error');

      // Show detailed error if available
      if (error.response?.data?.errors && error.response.data.errors.length > 0) {
        setBulkErrorData({
          title: 'Operation Failed',
          message,
          errors: error.response.data.errors,
          itemCount: error.response.data.errors.length,
        });
        setBulkErrorModalOpen(true);
      }
    },
    onSettled: () => { inMutationFlight.current = false; },
  });

  const handlePhotoUpload = (urls: string[]) => {
    setFormData((prev) => ({
      ...prev,
      photoUrls: [...prev.photoUrls, ...urls],
    }));
  };

  const handleRemovePhoto = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      photoUrls: prev.photoUrls.filter((_, i) => i !== index),
    }));
  };

  // Phase 3-5: Bulk operations handlers
  const handleBulkOperation = (operation: string, value?: any) => {
    if (operation === 'delete') {
      setBulkDeleteCount(selectedItems.size);
      setBulkConfirmData({ operation, value });
      setBulkDeleteConfirm(true);
    } else {
      setBulkConfirmData({ operation, value });
      setBulkConfirmOpen(true);
    }
  };

  const handleApplyBulkOperation = async () => {
    if (!bulkConfirmData) return;
    bulkUpdateMutation.mutate({
      itemIds: Array.from(selectedItems),
      operation: bulkConfirmData.operation,
      value: bulkConfirmData.value,
    });
  };

  const handleBulkPhotos = async (operation: 'add' | 'remove', photoUrls: string[]) => {
    try {
      const response = await api.post('/items/bulk/photos', {
        itemIds: Array.from(selectedItems),
        operation,
        photoUrls,
      });
      showToast(
        `${operation === 'add' ? 'Added' : 'Removed'} photos for ${response.data.count} item${response.data.count !== 1 ? 's' : ''}`,
        'success'
      );
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
      setSelectedItems(new Set());
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to update photos';
      showToast(message, 'error');
    }
  };

  const handleBulkTags = async (operation: 'add' | 'remove', tags: string[]) => {
    bulkUpdateMutation.mutate({
      itemIds: Array.from(selectedItems),
      operation: 'tags',
      value: { tags, action: operation },
    });
  };

  const handleBulkCategory = async (category: string) => {
    bulkUpdateMutation.mutate({
      itemIds: Array.from(selectedItems),
      operation: 'category',
      value: category,
    });
  };

  const handleBulkStatus = async (status: string) => {
    bulkUpdateMutation.mutate({
      itemIds: Array.from(selectedItems),
      operation: 'status',
      value: status,
    });
  };

  const handleBulkPrice = async (priceType: 'fixed' | 'discount', value: number) => {
    bulkUpdateMutation.mutate({
      itemIds: Array.from(selectedItems),
      operation: 'price',
      priceType,
      value,
    });
    setBulkPriceModalOpen(false);
  };

  const handleEbayExport = async () => {
    try {
      setEbayExporting(true);
      const response = await api.get(`/sales/${saleId}/ebay-export?photoMode=${ebayPhotoMode}`, {
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ebay-export-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast('CSV ready. Upload to eBay Seller Hub → Bulk Listings.', 'success');
      setEbayExportOpen(false);
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to export to eBay';
      showToast(message, 'error');
    } finally {
      setEbayExporting(false);
    }
  };

  // Regular mode: fire off background pipeline same as rapidfire
  // RapidCapture already reset its photos state before calling this
  const handleRegularAnalyze = (capturedPhotos: { blob: Blob; previewUrl: string }[]) => {
    if (capturedPhotos.length === 0) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Add cover thumbnail to carousel immediately — collapses to left of shutter
    setRapidItems((prev) => [
      ...prev,
      { id: tempId, thumbnailUrl: capturedPhotos[0].previewUrl, draftStatus: 'DRAFT' },
    ]);

    // Non-blocking background pipeline (same as rapidfire)
    // Additional photos (2–5) are appended to the item after it's created
    processAndUploadRapidPhoto(
      capturedPhotos[0],
      tempId,
      null,
      capturedPhotos.length > 1 ? capturedPhotos.slice(1) : undefined
    );
  };

  // Background upload handler for rapidfire photos — called async from onPhotoCapture
  // Processes one photo: enhance → crop → quality check → face detect → upload
  // On success: swaps temp ID with real itemId
  // Does NOT block the camera; runs in background
  const processAndUploadRapidPhoto = async (
    photo: { blob: Blob; previewUrl: string },
    tempId: string,
    appendToItemId: string | null,
    additionalPhotos?: { blob: Blob; previewUrl: string }[]
  ): Promise<void> => {
    try {
      // Phase 3: On-device processing pipeline
      let processedBlob = photo.blob;
      let autoEnhanced = false;

      // 1. Auto-enhance (non-blocking)
      const enhanced = await autoEnhanceImage(photo.blob);
      processedBlob = enhanced.blob;
      autoEnhanced = enhanced.enhanced;

      // 2. Crop to 4:3
      processedBlob = await cropTo4x3(processedBlob);

      // 3. Check quality with tiered system
      const quality = await checkImageQuality(processedBlob);
      setQualityResult(quality);
      setPendingQualityBlob(processedBlob);

      // Handle tiered quality response
      if (quality.tier === 3) {
        // Tier 3: Show modal overlay inside camera, don't close camera
        // Store context for resuming upload after user decision
        setPendingQualityTempId(tempId);
        setPendingQualityAppendId(appendToItemId);
        setQualityModalOpen(true);
        return; // Stop processing, wait for user action
      } else if (quality.tier === 2) {
        // Tier 2: Show overlay inside camera, auto-continue upload
        // Store context for user decision
        setPendingQualityTempId(tempId);
        setPendingQualityAppendId(appendToItemId);
        setQualityModalOpen(true);
        return; // Wait for user to decide (Use Anyway or Retake)
      }
      // Tier 1: No warning, proceed to upload

      // 4. Face detection
      const hasFace = await detectFace(processedBlob);
      if (hasFace) {
        // Face detected — show modal overlay inside camera
        setPendingFaceBlob(processedBlob);
        setPendingFaceTempId(tempId);
        setPendingFaceAppendId(appendToItemId);
        setFaceDetectionOpen(true);
        return; // Stop processing, wait for user decision
      }

      // 5. Upload
      if (appendToItemId) {
        // Append photo to existing item
        const fd = new FormData();
        fd.append('photos', processedBlob, 'rapidfire.jpg');
        fd.append('saleId', saleId as string);
        const uploadRes = await api.post('/upload/sale-photos', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const urls: string[] = uploadRes.data?.urls || uploadRes.data || [];
        if (urls[0]) {
          // Append URL to existing item
          await api.post(`/items/${appendToItemId}/photos`, { url: urls[0] });
          // Update target item's photo count and remove the orphan temp entry
          setRapidItems((prev) =>
            prev
              .filter((item) => item.id !== tempId)
              .map((item) =>
                item.id === appendToItemId
                  ? { ...item, photoUrls: [...(item.photoUrls || []), urls[0]] }
                  : item
              )
          );
        }
      } else {
        // Create new item
        const fd = new FormData();
        fd.append('image', processedBlob, 'rapidfire.jpg');
        fd.append('saleId', saleId as string);
        fd.append('autoEnhanced', autoEnhanced ? 'true' : 'false');

        const res = await api.post('/upload/rapidfire', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const { itemId, photoUrl } = res.data;

        // Swap temp id for real DB item id
        setRapidItems((prev) =>
          prev.map((item) =>
            item.id === tempId
              ? { ...item, id: itemId, draftStatus: 'DRAFT', thumbnailUrl: photo.previewUrl, photoUrls: photoUrl ? [photoUrl] : [photo.previewUrl], autoEnhanced }
              : item
          )
        );

        // If user tapped + on this item while it was still temp-, update the ref to the real ID
        if (addingToItemIdRef.current === tempId) {
          addingToItemIdRef.current = itemId;
          setAddingToItemId(itemId);
          // Hold the backend 4.5s AI debounce — user is adding more photos
          api.post(`/items/${itemId}/hold-analysis`).catch(() => {}); // fire-and-forget
        }

        // Invalidate caches for item lists
        queryClient.invalidateQueries({ queryKey: ['items', saleId] });

        // Poll for AI completion
        pollForAI(itemId);

        // Upload additional photos (regular mode multi-photo items)
        if (additionalPhotos && additionalPhotos.length > 0) {
          for (const addPhoto of additionalPhotos) {
            try {
              const fd = new FormData();
              fd.append('photos', addPhoto.blob, 'regular-capture.jpg');
              fd.append('saleId', saleId as string);
              const uploadRes = await api.post('/upload/sale-photos', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
              const urls: string[] = uploadRes.data?.urls || uploadRes.data || [];
              if (urls[0]) {
                await api.post(`/items/${itemId}/photos`, { url: urls[0] });
              }
            } catch (addErr) {
              console.error('[regular] Additional photo upload failed:', addErr);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[rapidfire] Background upload failed:', err);

      // Determine error message based on error type
      let errorMessage = 'Upload failed';
      if (err.response?.status === 429) {
        const retryAfter = err.response.headers['retry-after'];
        const retryAfterSecs = retryAfter ? parseInt(retryAfter, 10) : 60;
        errorMessage = `Rate limited. Please wait ${retryAfterSecs}s before trying`;
      }

      setRapidItems((prev) =>
        prev.map((item) =>
          item.id === tempId ? { ...item, aiError: errorMessage } : item
        )
      );
      showToast(`Photo failed: ${errorMessage}`, 'error');
    }
  };

  // Rapidfire mode handler — simplified after S305 refactor
  // Background uploads now happen in onPhotoCapture as photos are captured
  // This handler just closes the camera when user taps "Done"
  const handleRapidCameraComplete = async (photos: { blob: Blob; previewUrl: string }[]) => {
    // Release AI hold for the current item if we're in add-mode when camera closes
    if (addingToItemIdRef.current && !addingToItemIdRef.current.startsWith('temp-')) {
      api.post(`/items/${addingToItemIdRef.current}/release-analysis`).catch(() => {});
    }
    setAddingToItemId(null);
    addingToItemIdRef.current = null;

    // Close camera — uploads already happened in background via onPhotoCapture
    setCameraOpen(false);
  };

  // Quality modal handlers
  const handleQualityRetake = () => {
    setQualityModalOpen(false);
    // Remove the bad temp item from carousel so the user starts fresh
    if (pendingQualityTempId) {
      setRapidItems((prev) => prev.filter((item) => item.id !== pendingQualityTempId));
    }
    setPendingQualityBlob(null);
    setPendingQualityTempId(null);
    setPendingQualityAppendId(null);
    // Camera remains open for retake
  };

  const handleQualityUsePhoto = async () => {
    // User chose to use photo despite Tier 2 warning
    // Continue upload with the pending blob
    setQualityModalOpen(false);

    if (!pendingQualityBlob || !pendingQualityTempId) {
      console.error('Missing quality context for resuming upload');
      return;
    }

    try {
      // Resume upload from phase 4 (face detection and beyond)
      const hasFace = await detectFace(pendingQualityBlob);

      // 5. Upload
      if (pendingQualityAppendId) {
        // Append photo to existing item
        const fd = new FormData();
        fd.append('photos', pendingQualityBlob, 'rapidfire.jpg');
        fd.append('saleId', saleId as string);
        const uploadRes = await api.post('/upload/sale-photos', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const urls: string[] = uploadRes.data?.urls || uploadRes.data || [];
        if (urls[0]) {
          await api.post(`/items/${pendingQualityAppendId}/photos`, { url: urls[0] });
          setRapidItems((prev) =>
            prev.map((item) =>
              item.id === pendingQualityAppendId
                ? { ...item, photoUrls: [...(item.photoUrls || []), urls[0]] }
                : item
            )
          );
        }
      } else {
        // Create new item
        const fd = new FormData();
        fd.append('image', pendingQualityBlob, 'rapidfire.jpg');
        fd.append('saleId', saleId as string);
        fd.append('autoEnhanced', 'false');

        const res = await api.post('/upload/rapidfire', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const { itemId, photoUrl } = res.data;

        // Swap temp id for real DB item id
        setRapidItems((prev) =>
          prev.map((item) =>
            item.id === pendingQualityTempId
              ? { ...item, id: itemId, draftStatus: 'DRAFT', photoUrls: photoUrl ? [photoUrl] : [] }
              : item
          )
        );

        queryClient.invalidateQueries({ queryKey: ['items', saleId] });
        pollForAI(itemId);
      }
    } catch (err: any) {
      console.error('[quality] Resume upload failed:', err);
      showToast('Upload failed. Please try again.', 'error');
    } finally {
      setPendingQualityBlob(null);
      setPendingQualityTempId(null);
      setPendingQualityAppendId(null);
    }
  };

  const handleQualitySkipItem = () => {
    setQualityModalOpen(false);
    setPendingQualityBlob(null);
    setPendingQualityTempId(null);
    setPendingQualityAppendId(null);

    // Remove the temp item from carousel since user skipped it
    if (pendingQualityTempId) {
      setRapidItems((prev) => prev.filter((item) => item.id !== pendingQualityTempId));
    }
    // Camera remains open for next capture
  };

  // Face detection modal handlers
  const handleFaceDetectionRetake = () => {
    setFaceDetectionOpen(false);
    setPendingFaceBlob(null);
    setPendingFaceTempId(null);
    setPendingFaceAppendId(null);
    // Camera remains open for retake
  };

  const handleFaceDetectionUploadAnyway = async () => {
    // User chose to upload despite face detection warning
    setFaceDetectionOpen(false);

    if (!pendingFaceBlob || !pendingFaceTempId) {
      console.error('Missing face detection context for resuming upload');
      return;
    }

    try {
      // Resume upload from phase 5 (face detection passed)
      // 5. Upload
      if (pendingFaceAppendId) {
        // Append photo to existing item
        const fd = new FormData();
        fd.append('photos', pendingFaceBlob, 'rapidfire.jpg');
        fd.append('saleId', saleId as string);
        const uploadRes = await api.post('/upload/sale-photos', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const urls: string[] = uploadRes.data?.urls || uploadRes.data || [];
        if (urls[0]) {
          await api.post(`/items/${pendingFaceAppendId}/photos`, { url: urls[0] });
          setRapidItems((prev) =>
            prev.map((item) =>
              item.id === pendingFaceAppendId
                ? { ...item, photoUrls: [...(item.photoUrls || []), urls[0]] }
                : item
            )
          );
        }
      } else {
        // Create new item
        const fd = new FormData();
        fd.append('image', pendingFaceBlob, 'rapidfire.jpg');
        fd.append('saleId', saleId as string);
        fd.append('autoEnhanced', 'false');

        const res = await api.post('/upload/rapidfire', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const { itemId, photoUrl } = res.data;

        // Swap temp id for real DB item id
        setRapidItems((prev) =>
          prev.map((item) =>
            item.id === pendingFaceTempId
              ? { ...item, id: itemId, draftStatus: 'DRAFT', photoUrls: photoUrl ? [photoUrl] : [] }
              : item
          )
        );

        queryClient.invalidateQueries({ queryKey: ['items', saleId] });
        pollForAI(itemId);
      }
    } catch (err: any) {
      console.error('[face detection] Resume upload failed:', err);
      showToast('Upload failed. Please try again.', 'error');
    } finally {
      setPendingFaceBlob(null);
      setPendingFaceTempId(null);
      setPendingFaceAppendId(null);
    }
  };

  const showShotGuidance = (shotNumber: number) => {
    const messages = [
      'Great first shot! This will be your listing photo. Want to add a back view or maker\'s mark?',
      'Two down! Look for any maker\'s marks or labels — these are the most valuable shots.',
      'You\'ve got the minimum! Want to add a detail or damage photo, or are you ready to review?',
      'Four photos — almost complete. Any damage to be honest about? Or scale reference?',
      '⭐ Five photos is excellent! Ready to review and tag?',
    ];
    const msg = messages[Math.min(shotNumber - 1, messages.length - 1)] || messages[messages.length - 1];
    showToast(msg, 'info');
  };

  // Poll for AI draft analysis completion (draftStatus: DRAFT → PENDING_REVIEW)
  const pollForAI = (itemId: string) => {
    let attempts = 0;
    const maxAttempts = 10; // 30 seconds (3s * 10)

    const poll = setInterval(async () => {
      attempts++;
      try {
        const res = await api.get(`/items/${itemId}`);
        const item = res.data;

        // Success: AI identified the item
        if (item.draftStatus === 'PENDING_REVIEW' && item.title) {
          clearInterval(poll);
          setRapidItems((prev) =>
            prev.map((i) =>
              i.id === itemId
                ? { ...i, draftStatus: 'PENDING_REVIEW', title: item.title, category: item.category }
                : i
            )
          );
          showToast(`Tagged: "${item.title}"`, 'success');
          return;
        }

        // Error: AI failed (aiErrorLog is set)
        if (item.aiErrorLog && Array.isArray(item.aiErrorLog) && item.aiErrorLog.length > 0) {
          clearInterval(poll);
          setRapidItems((prev) =>
            prev.map((i) =>
              i.id === itemId ? { ...i, aiError: 'AI analysis failed — fill in manually' } : i
            )
          );
          return;
        }

        // Timeout: After 30s, stop polling but don't error
        if (attempts >= maxAttempts) {
          clearInterval(poll);
          // Don't show error — just stop polling. User can manually review.
          // The item is still in DRAFT, carousel shows amber badge.
          return;
        }
      } catch (e) {
        // Network error during poll — continue polling, don't fail
        console.warn('[pollForAI] Network error, continuing:', e);
      }
    }, 3000); // Poll every 3 seconds
  };

  // Face modal handlers
  const handleCategoryChange = (newCategory: string) => {
    setFormData((prev) => ({
      ...prev,
      category: normalizeToArray(newCategory, CATEGORIES),
    }));
  };

  const handleConditionChange = (newCondition: string) => {
    setFormData((prev) => ({
      ...prev,
      condition: normalizeToArray(newCondition, CONDITIONS),
    }));
  };

  const handleVoiceExtract = async () => {
    if (!transcript.trim()) {
      showToast('No speech detected. Try again.', 'error');
      return;
    }

    setVoiceLoading(true);
    try {
      const response = await api.post('/voice/extract', { transcript });
      const { name, category, estimatedPrice } = response.data;

      setFormData((prev) => ({
        ...prev,
        title: name || prev.title,
        category: category || prev.category,
        price: estimatedPrice ? estimatedPrice.toString() : prev.price,
      }));

      showToast(`Heard: "${transcript}"`, 'success');
    } catch (error) {
      console.error('[voice] Error extracting data:', error);
      showToast('Failed to process voice input', 'error');
    } finally {
      setVoiceLoading(false);
    }
  };

  const handleVoiceToggle = async () => {
    if (isListening) {
      await stopListening();
      // Auto-extract after a short delay to let speech recognition finalize
      setTimeout(handleVoiceExtract, 500);
    } else {
      await startListening();
    }
  };

  const handleDeleteDraft = async (itemId: string) => {
    setRapidItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // Validate saleId on mount and when router is ready
  useEffect(() => {
    if (!router.isReady) return;

    const saleIdParam = router.query.saleId;
    if (!saleIdParam || typeof saleIdParam !== 'string' || saleIdParam.trim() === '') {
      showToast('Sale not found', 'error');
      router.replace('/organizer/dashboard');
    }
  }, [router.isReady, router.query.saleId, router, showToast]);

  // Refetch items when returning from edit-item page (ensures sort order is fresh)
  useEffect(() => {
    const handleFocus = () => {
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [saleId, queryClient]);

  // Polling for draft status updates
  useEffect(() => {
    const draftItems = rapidItems.filter(
      (i) => i.draftStatus === 'DRAFT' && !i.aiError && !i.id.startsWith('temp-')
    );
    if (draftItems.length === 0 || aiPaused) return;

    let retries = 0;
    const MAX_RETRIES = 10;

    const interval = setInterval(async () => {
      for (const item of draftItems) {
        try {
          const res = await api.get(`/items/${item.id}/draft-status`);
          const data = res.data;
          if (data.draftStatus !== 'DRAFT') {
            setRapidItems((prev) =>
              prev.map((i) =>
                i.id !== item.id ? i :
                { ...i, ...data, thumbnailUrl: i.thumbnailUrl || data.thumbnailUrl }
              )
            );
          }
        } catch (e) {
          // If 404, stop retrying after MAX_RETRIES (item may have been deleted)
          if ((e as any).response?.status === 404) {
            retries++;
            if (retries >= MAX_RETRIES) {
              clearInterval(interval);
              return;
            }
          }
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [rapidItems, aiPaused]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{sale?.name ? `Add Items to ${sale.name}` : 'Add Items'} - FindA.Sale</title>
      </Head>

      <main className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8">
            <Link
              href={`/organizer/dashboard`}
              className="text-amber-700 hover:text-amber-800 text-sm font-medium inline-flex items-center gap-1"
            >
              &larr; Back to dashboard
            </Link>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-1">
              Add Items{sale?.name ? ` to: ${sale.name}` : ''}
            </h1>
            <p className="text-warm-600 dark:text-warm-400 mb-1">
              {items.length > 0 && (
                <>
                  {items.length} item{items.length !== 1 ? 's' : ''} {' '}
                  {publishedCount > 0 && `• ${publishedCount} published`}
                  {draftCount > 0 && `• ${draftCount} draft`}
                </>
              )}
              {items.length === 0 && (
                'Add items to your sale using manual entry, camera capture, batch upload, or CSV import.'
              )}
            </p>
          </div>

          {/* Tab Navigation — ordered by primary workflow */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {(['camera', 'batch', 'manual'] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setFormData(emptyForm);
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-amber-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-warm-700 dark:text-warm-300 border border-warm-300 dark:border-gray-600 hover:border-amber-400'
                }`}
              >
                {tab === 'camera' ? 'Camera' : tab === 'batch' ? 'Batch Upload' : 'Manual Entry'}
              </button>
            ))}
            <button
              onClick={() => setCsvModalOpen(true)}
              className="px-4 py-2 rounded-lg font-medium bg-white dark:bg-gray-800 text-warm-700 dark:text-warm-300 border border-warm-300 dark:border-gray-600 hover:border-amber-400 transition-all"
            >
              CSV Import
            </button>
          </div>

          {/* Manual Entry Tab */}
          {activeTab === 'manual' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-hidden mb-8">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!formData.title.trim()) {
                    showToast('Title is required', 'error');
                    return;
                  }
                  createMutation.mutate();
                }}
              >
                {/* Photo strip — top, like a card thumbnail */}
                <div className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700 p-4">
                  {formData.photoUrls.length > 0 ? (
                    <div className="flex gap-2 flex-wrap">
                      {formData.photoUrls.map((url, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-warm-200 dark:border-gray-700">
                          <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(i)}
                            className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                            aria-label={`Remove photo ${i + 1}`}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoUploading}
                        className="w-20 h-20 rounded-lg border-2 border-dashed border-warm-300 dark:border-gray-600 flex items-center justify-center text-warm-400 dark:text-gray-500 hover:border-amber-400 transition-colors disabled:opacity-50 text-2xl"
                      >
                        {photoUploading ? '⏳' : '+'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoUploading}
                      className="w-full border-2 border-dashed border-warm-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-amber-400 transition-colors disabled:opacity-50"
                    >
                      {photoUploading ? (
                        <span className="text-warm-500 dark:text-warm-400 text-sm">Uploading...</span>
                      ) : (
                        <span className="text-warm-500 dark:text-warm-400 text-sm">📷 Add photos</span>
                      )}
                    </button>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files || files.length === 0) return;
                      setPhotoUploading(true);
                      try {
                        const uploadData = new FormData();
                        Array.from(files).forEach((f) => uploadData.append('photos', f));
                        const res = await api.post('/upload/sale-photos', uploadData, {
                          headers: { 'Content-Type': 'multipart/form-data' },
                        });
                        const urls: string[] = res.data?.urls || res.data || [];
                        handlePhotoUpload(urls);
                        showToast(`${urls.length} photo${urls.length !== 1 ? 's' : ''} uploaded`, 'success');
                      } catch {
                        showToast('Photo upload failed', 'error');
                      } finally {
                        setPhotoUploading(false);
                        if (photoInputRef.current) photoInputRef.current.value = '';
                      }
                    }}
                  />
                </div>

                {/* Core fields — compact 2-col grid */}
                <div className="px-4 py-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Title *</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="flex-1 px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded focus:ring-1 focus:ring-amber-500 text-sm"
                        placeholder="Item title"
                        autoFocus
                      />
                      {voiceSupported && user?.organizerTier === 'PRO' && (
                        <button
                          type="button"
                          onClick={handleVoiceToggle}
                          disabled={voiceLoading}
                          className={`px-3 py-1.5 rounded text-sm font-semibold transition-all ${
                            isListening
                              ? 'bg-red-600 text-white animate-pulse ring-2 ring-red-400'
                              : 'bg-warm-200 text-warm-900 dark:text-warm-100 hover:bg-warm-300'
                          } disabled:opacity-50`}
                          aria-label={isListening ? 'Stop recording' : 'Start recording'}
                        >
                          🎤
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Price</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded focus:ring-1 focus:ring-amber-500 text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Category</label>
                      <select
                        value={formData.category}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded focus:ring-1 focus:ring-amber-500 text-sm"
                      >
                        <option value="">Category</option>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Condition</label>
                      <select
                        value={formData.condition}
                        onChange={(e) => handleConditionChange(e.target.value)}
                        className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded focus:ring-1 focus:ring-amber-500 text-sm"
                      >
                        <option value="">Condition</option>
                        {CONDITIONS.map((cond) => (
                          <option key={cond} value={cond}>{cond}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Listing Type</label>
                      <select
                        value={formData.listingType}
                        onChange={(e) => setFormData({ ...formData, listingType: e.target.value })}
                        className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded focus:ring-1 focus:ring-amber-500 text-sm"
                      >
                        <option value="FIXED">Fixed Price</option>
                        <option value="AUCTION">Auction</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded focus:ring-1 focus:ring-amber-500 text-sm"
                      placeholder="Item description (optional)"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Tags</label>
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        {formData.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {formData.tags.map((tag) => (
                              <span key={tag} className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded-full text-xs flex items-center gap-1">
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) })}
                                  className="text-amber-600 hover:text-amber-900 font-bold"
                                  aria-label={`Remove tag ${tag}`}
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <input
                          type="text"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const value = (e.target as HTMLInputElement).value.trim();
                              if (value && !formData.tags.includes(value)) {
                                setFormData({ ...formData, tags: [...formData.tags, value] });
                                (e.target as HTMLInputElement).value = '';
                              }
                            }
                          }}
                          placeholder="Add tags (press Enter)"
                          className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded focus:ring-1 focus:ring-amber-500 text-sm"
                        />
                      </div>
                      <VoiceTagButton
                        onExtraction={(result) => {
                          const newTags = result.tags.filter((t) => !formData.tags.includes(t));
                          if (newTags.length > 0) {
                            setFormData({ ...formData, tags: [...formData.tags, ...newTags] });
                          }
                        }}
                        className="px-2 py-1.5 rounded text-sm"
                      />
                    </div>
                  </div>

                  {/* Rarity — less prominent */}
                  <div>
                    <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Rarity Badge</label>
                    <select
                      value={formData.rarity}
                      onChange={(e) => setFormData({ ...formData, rarity: e.target.value })}
                      className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded focus:ring-1 focus:ring-amber-500 text-sm"
                    >
                      {RARITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Action bar */}
                <div className="px-4 py-3 bg-warm-50 dark:bg-gray-900 border-t border-warm-200 dark:border-gray-700 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg disabled:opacity-50 text-sm transition-colors"
                  >
                    {createMutation.isPending ? 'Saving...' : 'Save Item'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(emptyForm)}
                    className="px-4 py-2 text-warm-500 dark:text-warm-400 text-sm rounded hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Clear
                  </button>
                  <p className="ml-auto text-xs text-warm-400 dark:text-warm-500">Items save directly — no review needed</p>
                </div>
              </form>
            </div>
          )}

          {/* Batch Upload Tab */}
          {activeTab === 'batch' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-8">
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-6">Batch Upload Photos</h2>
              <SmartInventoryUpload
                saleId={saleId as string}
                onComplete={() => {
                  queryClient.invalidateQueries({ queryKey: ['items', saleId] });
                }}
              />
            </div>
          )}

          {/* Camera Tab */}
          {activeTab === 'camera' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-8">
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-6">
                {items.length > 0 ? '📷 Add More Photos' : 'Capture with Camera'}
              </h2>

              <div className="space-y-5">
                {/* Open Camera button — always at top */}
                <div className="flex justify-center">
                  <button
                    onClick={() => setCameraOpen(true)}
                    className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-8 rounded-lg transition-colors text-lg"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2 2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Open Camera
                  </button>
                </div>

                {/* Mode descriptions */}
                <div className="text-sm text-warm-500 dark:text-warm-400 space-y-2 border-t border-warm-100 dark:border-gray-700 pt-4">
                  <p><span className="font-semibold text-warm-700 dark:text-warm-300">Rapidfire Mode:</span> Rapidly capture multiple items. 1 Photo = 1 Item. Photos upload and analyze in the background. Tap + on the thumbnail to add more photos to that item.</p>
                  <p><span className="font-semibold text-warm-700 dark:text-warm-300">Regular Mode:</span> Take and retake up to 5 photos of a single item. Once happy, click the analyze button and the photo(s) will begin to analyze in the background. Start taking photos of the next item.</p>
                </div>

                {/* Review & Publish button when items are ready */}
                {rapidItems.some((i) => i.draftStatus === 'PENDING_REVIEW') && (
                  <button
                    onClick={() => router.push(`/organizer/add-items/${saleId}/review`)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                  >
                    Review & Publish ({rapidItems.filter((i) => i.draftStatus === 'PENDING_REVIEW').length} ready)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Quality overlays are now rendered inside RapidCapture via qualityOverlay prop */}

          {/* RapidCapture fullscreen overlay */}
          {cameraOpen && (
            <RapidCapture
              onComplete={handleRapidCameraComplete}
              onCancel={() => {
                // If user closes camera while in add-mode, release the hold so AI can run
                if (addingToItemIdRef.current && !addingToItemIdRef.current.startsWith('temp-')) {
                  api.post(`/items/${addingToItemIdRef.current}/release-analysis`).catch(() => {});
                }
                setAddingToItemId(null);
                addingToItemIdRef.current = null;
                setCameraOpen(false);
              }}
              maxPhotos={captureMode === 'rapidfire' ? 20 : 5}
              mode={captureMode}
              onModeChange={setCaptureMode}
              rapidItems={rapidItems}
              addingToItemId={addingToItemId}
              onAddToItem={(id) => {
                if (addingToItemId === id) {
                  // Exiting add-mode — release the AI hold so backend restarts 4.5s debounce
                  if (!id.startsWith('temp-')) {
                    api.post(`/items/${id}/release-analysis`).catch(() => {});
                  }
                  setAddingToItemId(null);
                  addingToItemIdRef.current = null;
                } else {
                  // Entering add-mode — hold AI if we already have a real ID
                  if (!id.startsWith('temp-')) {
                    api.post(`/items/${id}/hold-analysis`).catch(() => {});
                  }
                  // If still temp-, the hold will be called when real ID arrives (see processAndUploadRapidPhoto above)
                  setAddingToItemId(id);
                  addingToItemIdRef.current = id;
                }
              }}
              onThumbnailTap={(id) => {
                // BUG 4 FIX: Keep camera open, open preview modal on top
                setPreviewItemId(id);
              }}
              onNavigateToReview={() => {
                setCameraOpen(false);
                router.push(`/organizer/add-items/${saleId}/review`);
              }}
              readyCount={rapidItems.filter((i) => i.draftStatus === 'PENDING_REVIEW').length}
              onPhotoCapture={(photo) => {
                const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                // Add temp entry to carousel immediately for live preview
                setRapidItems((prev) => [
                  ...prev,
                  { id: tempId, thumbnailUrl: photo.previewUrl, draftStatus: 'DRAFT' },
                ]);
                // Start background upload pipeline (non-blocking)
                // Read from ref instead of state to avoid stale closure after AI analysis completes
                processAndUploadRapidPhoto(photo, tempId, addingToItemIdRef.current);
              }}
              onEnhanceAll={() => {
                // BUG 6 FIX: Show placeholder since no backend endpoint exists yet
                showToast('Enhancement coming soon', 'info');
              }}
              onAnalyze={captureMode === 'regular' ? handleRegularAnalyze : undefined}
              isAnalyzing={regularAnalyzing}
              qualityOverlay={
                qualityModalOpen && qualityResult
                  ? {
                      tier: qualityResult.tier as 2 | 3,
                      onUsePhoto: handleQualityUsePhoto,
                      onRetake: handleQualityRetake,
                      onSkip: handleQualitySkipItem,
                    }
                  : null
              }
              faceDetectionOverlay={
                faceDetectionOpen && pendingFaceBlob
                  ? {
                      onUploadAnyway: handleFaceDetectionUploadAnyway,
                      onRetake: handleFaceDetectionRetake,
                      pendingPhoto: {
                        blob: pendingFaceBlob,
                        previewUrl: URL.createObjectURL(pendingFaceBlob),
                      },
                    }
                  : null
              }
            />
          )}

          {/* Items List */}
          {itemsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : items && items.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-warm-200 dark:border-gray-700">
              <div className="p-4 border-b border-warm-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="font-semibold text-warm-900 dark:text-warm-100">
                  {items.length} Item{items.length !== 1 ? 's' : ''}
                  {selectedItems.size > 0 && (
                    <span className="ml-2 text-sm font-normal text-amber-600">
                      ({selectedItems.size} selected)
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEbayExportOpen(true)}
                    className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline px-3 py-1.5 border border-blue-300 rounded-lg hover:bg-blue-50"
                  >
                    📦 Export to eBay
                  </button>
                  <Link
                    href={`/organizer/add-items/${saleId}/review?preview=true`}
                    className="text-sm font-medium text-warm-700 dark:text-warm-300 hover:text-warm-900 dark:text-warm-100 hover:underline px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900"
                  >
                    👁 Buyer Preview
                  </Link>
                  <Link
                    href={`/organizer/add-items/${saleId}/review`}
                    className="text-sm font-medium text-amber-700 hover:text-amber-900 hover:underline"
                  >
                    Review & Publish{unpublishedCount > 0 ? ` (${unpublishedCount})` : ''} &rarr;
                  </Link>
                </div>
              </div>

              {/* Sticky Top Toolbar — positioned ABOVE table for proper sticky behavior */}
              {selectedItems.size > 0 && (
                <div className="sticky top-0 z-30 bg-amber-600 text-white border-b border-amber-700 p-4 shadow-md">
                  <div className="flex items-center gap-3 flex-wrap">
                    <input
                      type="checkbox"
                      checked={selectedItems.size === items.length && items.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedItems(new Set(items.map((i: any) => i.id)));
                        } else {
                          setSelectedItems(new Set());
                        }
                      }}
                      className="rounded cursor-pointer"
                    />
                    <span className="text-sm font-semibold">
                      {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                    </span>

                    {/* Primary actions */}
                    <button
                      onClick={() =>
                        bulkUpdateMutation.mutate({
                          itemIds: Array.from(selectedItems),
                          operation: 'isActive',
                          value: false,
                        })
                      }
                      disabled={bulkUpdateMutation.isPending}
                      className="text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                    >
                      Hide
                    </button>
                    <button
                      onClick={() =>
                        bulkUpdateMutation.mutate({
                          itemIds: Array.from(selectedItems),
                          operation: 'isActive',
                          value: true,
                        })
                      }
                      disabled={bulkUpdateMutation.isPending}
                      className="text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                    >
                      Show
                    </button>
                    <div className="flex gap-1 items-center">
                      <input
                        type="number"
                        value={bulkPrice}
                        onChange={(e) => setBulkPrice(e.target.value)}
                        placeholder="Price"
                        step="0.01"
                        className="w-24 px-2 py-1 border border-white rounded text-xs focus:outline-none focus:ring-2 focus:ring-white bg-amber-700 text-white placeholder-amber-200"
                      />
                      <button
                        onClick={() => {
                          if (bulkPrice) {
                            handleBulkOperation('price', parseFloat(bulkPrice));
                          }
                        }}
                        disabled={bulkUpdateMutation.isPending || !bulkPrice}
                        className="text-xs font-semibold text-amber-600 bg-white dark:bg-gray-800 hover:bg-amber-50 dark:bg-amber-900/20 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                      >
                        Set Price
                      </button>
                    </div>

                    {/* Print Labels button */}
                    <button
                      onClick={() => {
                        if (saleId) {
                          window.open(`/organizer/print-kit/${saleId}`, '_blank');
                        }
                      }}
                      className="text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                    >
                      🖨️ Print Kit
                    </button>

                    {/* More Actions Dropdown */}
                    <BulkActionDropdown
                      onSetCategory={() => setBulkCategoryModalOpen(true)}
                      onSetStatus={() => setBulkStatusModalOpen(true)}
                      onManageTags={() => setBulkTagModalOpen(true)}
                      onManagePhotos={() => setBulkPhotoModalOpen(true)}
                      onSetPrice={() => setBulkPriceModalOpen(true)}
                      disabled={bulkUpdateMutation.isPending}
                    />

                    {/* Delete button */}
                    <div className="ml-auto">
                      <button
                        onClick={() => handleBulkOperation('delete')}
                        disabled={bulkUpdateMutation.isPending}
                        className="text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                      >
                        Delete Selected
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Card-based expandable items list */}
              <div className="divide-y divide-warm-100 dark:divide-gray-700">
                {items.map((item: any) => {
                  const draftStatus = computeDraftStatus(item);
                  const isExpanded = expandedItemId === item.id;
                  const editState = getItemEditState(item);
                  return (
                    <div key={item.id} className="bg-white dark:bg-gray-800">
                      {/* Collapsed row */}
                      <div
                        className={`px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors ${selectedItems.has(item.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}
                        onClick={() => {
                          setExpandedItemId(isExpanded ? null : item.id);
                          if (!isExpanded && !itemEditState[item.id]) {
                            setItemEditState((prev) => ({ ...prev, [item.id]: {
                              title: item.title || '',
                              price: item.price != null ? item.price.toString() : '',
                              category: item.category || '',
                              condition: item.condition || '',
                              description: item.description || '',
                            }}));
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            const newSet = new Set(selectedItems);
                            if (e.target.checked) newSet.add(item.id);
                            else newSet.delete(item.id);
                            setSelectedItems(newSet);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded cursor-pointer flex-shrink-0"
                        />
                        {/* Thumbnail — links to public item page */}
                        <a
                          href={`/items/${item.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-shrink-0"
                        >
                          {item.photoUrls && item.photoUrls.length > 0 ? (
                            <img
                              src={item.photoUrls[0]}
                              alt={item.title}
                              className="w-14 h-14 object-cover rounded border border-warm-200 dark:border-gray-700 hover:ring-2 hover:ring-amber-400"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-14 h-14 bg-gray-200 dark:bg-gray-700 rounded border border-warm-200 dark:border-gray-700 flex items-center justify-center text-gray-400 text-xl">📷</div>
                          )}
                        </a>
                        {/* Title — links to edit-item page */}
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/organizer/edit-item/${item.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold text-amber-700 hover:underline truncate inline-block max-w-full text-sm"
                          >
                            {item.title || 'Untitled'}
                          </Link>
                          <p className="text-xs text-warm-500 dark:text-warm-400 truncate">
                            {item.price != null ? `$${item.price}` : 'No price'} · {formatCategory(item.category) || 'Uncategorized'}
                          </p>
                        </div>
                        {/* Status badge */}
                        <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full hidden sm:inline-block ${
                          draftStatus === 'PUBLISHED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                          draftStatus === 'PENDING_REVIEW' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                          'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {draftStatus === 'PUBLISHED' ? 'Live' : draftStatus === 'PENDING_REVIEW' ? 'Ready' : 'Draft'}
                        </span>
                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete "${item.title || 'this item'}"? This cannot be undone.`)) {
                              deleteMutation.mutate(item.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors disabled:opacity-50 p-1"
                          aria-label="Delete item"
                        >
                          🗑️
                        </button>
                        <span className="text-warm-400 text-sm flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                      </div>

                      {/* Expanded edit panel */}
                      {isExpanded && (
                        <div className="border-t border-warm-100 dark:border-gray-700 px-4 py-4 bg-warm-50 dark:bg-gray-900 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Title</label>
                              <input
                                type="text"
                                value={editState.title}
                                onChange={(e) => setItemEditState((prev) => ({ ...prev, [item.id]: { ...editState, title: e.target.value } }))}
                                className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-sm focus:ring-1 focus:ring-amber-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Price</label>
                              <input
                                type="number"
                                step="0.01"
                                value={editState.price}
                                onChange={(e) => setItemEditState((prev) => ({ ...prev, [item.id]: { ...editState, price: e.target.value } }))}
                                className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-sm focus:ring-1 focus:ring-amber-500"
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Category</label>
                              <select
                                value={editState.category}
                                onChange={(e) => setItemEditState((prev) => ({ ...prev, [item.id]: { ...editState, category: e.target.value } }))}
                                className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-sm focus:ring-1 focus:ring-amber-500"
                              >
                                <option value="">Select category</option>
                                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Condition</label>
                              <select
                                value={editState.condition}
                                onChange={(e) => setItemEditState((prev) => ({ ...prev, [item.id]: { ...editState, condition: e.target.value } }))}
                                className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-sm focus:ring-1 focus:ring-amber-500"
                              >
                                <option value="">Select condition</option>
                                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">Description</label>
                            <textarea
                              value={editState.description}
                              onChange={(e) => setItemEditState((prev) => ({ ...prev, [item.id]: { ...editState, description: e.target.value } }))}
                              rows={2}
                              className="w-full px-3 py-1.5 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-sm focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleInlineItemSave(item.id)}
                              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded transition-colors"
                            >
                              Save
                            </button>
                            <Link
                              href={`/organizer/edit-item/${item.id}`}
                              className="px-4 py-1.5 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 text-sm font-semibold rounded hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              Full Edit ↗
                            </Link>
                            <button
                              type="button"
                              onClick={() => setExpandedItemId(null)}
                              className="px-4 py-1.5 text-warm-500 dark:text-warm-400 text-sm rounded hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700">
              <p className="text-warm-600 dark:text-warm-400 text-lg">No items yet. Use the tabs above to get started.</p>
            </div>
          )}
        </div>
      </main>

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={csvModalOpen}
        saleId={saleId as string}
        onClose={() => setCsvModalOpen(false)}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['items', saleId] });
          setCsvModalOpen(false);
        }}
      />

      {/* Preview Modal for Rapidfire Items */}
      {previewItemId && (
        <PreviewModal
          isOpen={true}
          item={rapidItems.find((i) => i.id === previewItemId) || { id: previewItemId, draftStatus: 'DRAFT' }}
          onClose={() => setPreviewItemId(null)}
          onSave={async (edits) => {
            // Guard: if item ID is still temporary (temp-*), wait for real ID
            const previewItem = rapidItems.find((i) => i.id === previewItemId);
            if (!previewItem || previewItem.id.startsWith('temp-')) {
              showToast('Item is still uploading. Please wait...', 'warning');
              throw new Error('Item not ready');
            }
            try {
              await api.put(`/items/${previewItemId}`, edits);
              setRapidItems((prev) =>
                prev.map((i) =>
                  i.id === previewItemId
                    ? { ...i, ...edits }
                    : i
                )
              );
              showToast('Item updated', 'success');
            } catch (error: any) {
              const message =
                error.response?.data?.message || 'Failed to save item';
              showToast(message, 'error');
              throw error;
            }
          }}
          onDelete={handleDeleteDraft}
          onRetake={() => setPreviewItemId(null)}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md">
            <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-3">Delete {bulkDeleteCount} item{bulkDeleteCount !== 1 ? 's' : ''}?</h3>
            <p className="text-warm-600 dark:text-warm-400 text-sm mb-6">
              This action cannot be undone. All selected items will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg text-warm-700 dark:text-warm-300 font-medium hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleApplyBulkOperation();
                  setBulkDeleteConfirm(false);
                }}
                disabled={bulkUpdateMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {bulkUpdateMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 3-5: Bulk Operations Modals */}
      <BulkConfirmModal
        isOpen={bulkConfirmOpen}
        operation={bulkConfirmData?.operation || ''}
        affectedCount={selectedItems.size}
        sampleItems={items
          .filter((i: any) => selectedItems.has(i.id))
          .slice(0, 3)
          .map((i: any) => ({ id: i.id, title: i.title }))}
        onCancel={() => {
          setBulkConfirmOpen(false);
          setBulkConfirmData(null);
        }}
        onApply={handleApplyBulkOperation}
        loading={bulkUpdateMutation.isPending}
      />

      <BulkPhotoModal
        isOpen={bulkPhotoModalOpen}
        selectedCount={selectedItems.size}
        onClose={() => setBulkPhotoModalOpen(false)}
        onApply={handleBulkPhotos}
        loading={bulkUpdateMutation.isPending}
      />

      <BulkTagModal
        isOpen={bulkTagModalOpen}
        selectedCount={selectedItems.size}
        onClose={() => setBulkTagModalOpen(false)}
        onApply={handleBulkTags}
        loading={bulkUpdateMutation.isPending}
      />

      <BulkCategoryModal
        isOpen={bulkCategoryModalOpen}
        selectedCount={selectedItems.size}
        categories={items.length > 0 ? Array.from(new Set(items.map((i: any) => i.category).filter(Boolean))) : []}
        onClose={() => setBulkCategoryModalOpen(false)}
        onApply={handleBulkCategory}
        loading={bulkUpdateMutation.isPending}
      />

      <BulkStatusModal
        isOpen={bulkStatusModalOpen}
        selectedCount={selectedItems.size}
        onClose={() => setBulkStatusModalOpen(false)}
        onApply={handleBulkStatus}
        loading={bulkUpdateMutation.isPending}
      />

      <BulkPriceModal
        isOpen={bulkPriceModalOpen}
        selectedCount={selectedItems.size}
        onClose={() => setBulkPriceModalOpen(false)}
        onConfirm={handleBulkPrice}
        loading={bulkUpdateMutation.isPending}
      />

      <BulkOperationErrorModal
        isOpen={bulkErrorModalOpen}
        title={bulkErrorData?.title || 'Error'}
        message={bulkErrorData?.message || ''}
        errors={bulkErrorData?.errors}
        itemCount={bulkErrorData?.itemCount}
        onClose={() => {
          setBulkErrorModalOpen(false);
          setBulkErrorData(null);
        }}
      />

      {/* Feature #244: eBay CSV Export Modal */}
      {ebayExportOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md">
            <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-3">Export to eBay</h3>
            <p className="text-warm-600 dark:text-warm-400 text-sm mb-4">
              Export {items.filter((i: any) => i.status === 'AVAILABLE').length} available items as eBay CSV
            </p>

            <div className="mb-4 space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="photoMode"
                  value="watermarked"
                  checked={ebayPhotoMode === 'watermarked'}
                  onChange={() => setEbayPhotoMode('watermarked')}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-warm-700 dark:text-warm-300">
                  Include FindA.Sale watermark (recommended)
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="photoMode"
                  value="clean"
                  checked={ebayPhotoMode === 'clean'}
                  onChange={() => setEbayPhotoMode('clean')}
                  className="w-4 h-4"
                  disabled={true}
                />
                <span className="text-sm font-medium text-warm-700 dark:text-warm-300">
                  Remove watermark
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  PRO only
                </span>
              </label>
            </div>

            <p className="text-xs text-warm-500 dark:text-warm-400 mb-6">
              Upload this CSV to eBay Seller Hub → Listings → Bulk Create
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setEbayExportOpen(false)}
                className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg text-warm-700 dark:text-warm-300 font-medium hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEbayExport}
                disabled={ebayExporting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {ebayExporting ? 'Generating...' : 'Download CSV'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AddItemsDetailPage;
