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

import React, { useState, useRef, useEffect } from 'react';
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
import ModeToggle from '../../../components/camera/ModeToggle';
import CaptureButton from '../../../components/camera/CaptureButton';
import RapidCarousel from '../../../components/camera/RapidCarousel';
import PreviewModal from '../../../components/camera/PreviewModal';
import { useUploadQueue } from '../../../hooks/useUploadQueue';
import { useVoiceInput } from '../../../hooks/useVoiceInput';
import BulkConfirmModal from '../../../components/BulkConfirmModal';
import BulkPhotoModal from '../../../components/BulkPhotoModal';
import BulkTagModal from '../../../components/BulkTagModal';
import BulkActionDropdown from '../../../components/BulkActionDropdown';
import BulkCategoryModal from '../../../components/BulkCategoryModal';
import BulkStatusModal from '../../../components/BulkStatusModal';
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

async function checkImageQuality(blob: Blob): Promise<{ isDark: boolean; avgBrightness: number }> {
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
      const avg = total / (sampleSize * sampleSize);
      resolve({ isDark: avg < 40, avgBrightness: avg });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ isDark: false, avgBrightness: 128 });
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

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor'];

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
  // If draftStatus is already set, use it
  if (item.draftStatus) return item.draftStatus;
  // Fallback logic: compute from item completeness
  const hasMissingCritical = !item.photoUrls?.length || item.price == null;
  if (hasMissingCritical) return 'DRAFT';
  return 'PENDING_REVIEW';
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
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);

  // Rapidfire Mode state
  const [captureMode, setCaptureMode] = useState<'rapidfire' | 'regular'>('rapidfire');
  const [rapidItems, setRapidItems] = useState<RapidItem[]>([]);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [carouselCollapsed, setCarouselCollapsed] = useState(true);
  const [aiPaused, setAiPaused] = useState(false);
  const [addingToItemId, setAddingToItemId] = useState<string | null>(null);
  const { queue, enqueue, uploadingCount } = useUploadQueue(saleId as string);

  // Phase 3: Quality control state
  const [showRetakeToast, setShowRetakeToast] = useState(false);
  const [retakeToastTimeout, setRetakeToastTimeout] = useState<NodeJS.Timeout | null>(null);
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [pendingFaceBlob, setPendingFaceBlob] = useState<Blob | null>(null);
  const [pendingFaceUpload, setPendingFaceUpload] = useState<{
    blob: Blob;
    previewUrl: string;
    tempId: string;
  } | null>(null);

  // Phase 3-5: Bulk Operations Toolkit state
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkConfirmData, setBulkConfirmData] = useState<{
    operation: string;
    value?: any;
  } | null>(null);
  const [bulkPhotoModalOpen, setBulkPhotoModalOpen] = useState(false);
  const [bulkTagModalOpen, setBulkTagModalOpen] = useState(false);
  const [bulkCategoryModalOpen, setBulkCategoryModalOpen] = useState(false);
  const [bulkStatusModalOpen, setBulkStatusModalOpen] = useState(false);
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
    mutationFn: async (payload: { itemIds: string[]; operation: string; value?: any }) => {
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

  const handleCameraComplete = async (photos: { blob: Blob; previewUrl: string }[]) => {
    setCameraOpen(false);
    if (photos.length === 0) return;

    setCameraAnalyzing(true);
    try {
      // Upload first photo and get AI analysis
      const formData = new FormData();
      formData.append('photo', photos[0].blob, 'camera-capture.jpg');

      const response = await api.post('/upload/analyze-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const ai = response.data;

      // Upload all photos to get Cloudinary URLs
      const photoFormData = new FormData();
      photos.forEach((p, i) => {
        photoFormData.append('photos', p.blob, `capture-${i}.jpg`);
      });

      const uploadRes = await api.post('/upload/sale-photos', photoFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const uploadedUrls: string[] = (uploadRes.data?.urls || uploadRes.data || []);

      // Pre-fill manual form with AI results
      setFormData({
        ...emptyForm,
        title: ai.title || '',
        description: ai.description || '',
        category: normalizeToArray(ai.category, CATEGORIES),
        condition: normalizeToArray(ai.condition, CONDITIONS),
        price: ai.suggestedPrice ? String(ai.suggestedPrice) : '',
        photoUrls: uploadedUrls,
      });

      // Switch to manual tab so organizer can review & submit
      setActiveTab('manual');
      showToast(`AI identified: "${ai.title || 'item'}". Review and save below.`, 'success');
    } catch (err: any) {
      console.error('Camera AI analysis error:', err);
      showToast('Photo captured but AI analysis failed. You can add details manually.', 'error');

      // Still upload photos even if AI fails
      try {
        const photoFormData = new FormData();
        photos.forEach((p, i) => {
          photoFormData.append('photos', p.blob, `capture-${i}.jpg`);
        });
        const uploadRes = await api.post('/upload/sale-photos', photoFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const uploadedUrls: string[] = (uploadRes.data?.urls || uploadRes.data || []);
        setFormData((prev) => ({ ...prev, photoUrls: uploadedUrls }));
      } catch {
        // Photo upload also failed — user can still add manually
      }

      setActiveTab('manual');
    } finally {
      setCameraAnalyzing(false);
      // Clean up blob URLs
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    }
  };

  // Rapidfire mode handler — each photo POSTs to /upload/rapidfire, creates a DRAFT item
  // Phase 3: Pipeline: enhance → crop → quality check → face detect → upload
  // Phase 5: If addingToItemId is set, append photo to that item instead of creating new
  // Uses optimistic UI: temp entry added immediately, replaced with real itemId on success
  const handleRapidCameraComplete = async (photos: { blob: Blob; previewUrl: string }[]) => {
    setCameraOpen(false);
    if (photos.length === 0) return;

    // Snapshot and reset add-mode so next capture goes to new item
    const appendToItemId = addingToItemId;
    if (appendToItemId) setAddingToItemId(null);

    for (const photo of photos) {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Optimistic: show thumbnail in carousel immediately (skip for append-mode — no new item)
      if (!appendToItemId) {
        setRapidItems((prev) => [
          ...prev,
          { id: tempId, thumbnailUrl: photo.previewUrl, draftStatus: 'DRAFT' },
        ]);
      }

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

        // 3. Check quality
        const quality = await checkImageQuality(processedBlob);
        if (quality.isDark) {
          // Show retake toast
          setShowRetakeToast(true);
          if (retakeToastTimeout) clearTimeout(retakeToastTimeout);
          const timeout = setTimeout(() => setShowRetakeToast(false), 4000);
          setRetakeToastTimeout(timeout);
        }

        // 4. Face detection
        const hasFace = await detectFace(processedBlob);
        if (hasFace) {
          // Show face modal and pause upload
          setShowFaceModal(true);
          setPendingFaceUpload({
            blob: processedBlob,
            previewUrl: photo.previewUrl,
            tempId,
          });
          return; // Wait for modal response
        }

        // 5. Upload
        if (appendToItemId) {
          // Phase 5: Append photo to existing item
          // Upload photo via sale-photos (returns URL array)
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
            // Update local state to append photo
            setRapidItems((prev) =>
              prev.map((item) =>
                item.id === appendToItemId
                  ? { ...item, photoUrls: [...(item.photoUrls || []), urls[0]] }
                  : item
              )
            );
          }
          // No temp entry was added in append-mode, nothing to clean up
        } else {
          // Normal: create new item
          const fd = new FormData();
          fd.append('image', processedBlob, 'rapidfire.jpg');
          fd.append('saleId', saleId as string);
          fd.append('autoEnhanced', autoEnhanced ? 'true' : 'false');

          const res = await api.post('/upload/rapidfire', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          const { itemId } = res.data;

          // Swap temp id for real DB item id and set autoEnhanced flag
          setRapidItems((prev) =>
            prev.map((item) =>
              item.id === tempId
                ? { ...item, id: itemId, draftStatus: 'DRAFT', photoUrls: [photo.previewUrl], autoEnhanced }
                : item
            )
          );

          // Invalidate caches for item lists and draft counts
          queryClient.invalidateQueries({ queryKey: ['items', saleId] });
          queryClient.invalidateQueries({ queryKey: ['draft-items', saleId] });
        }
      } catch (err: any) {
        console.error('[rapidfire] Upload failed:', err);
        setRapidItems((prev) =>
          prev.map((item) =>
            item.id === tempId ? { ...item, aiError: 'Upload failed' } : item
          )
        );
        showToast('One photo failed to upload. Try again.', 'error');
      }
    }
  };

  // Face modal handlers
  const handleFaceUploadAnyway = async () => {
    if (!pendingFaceUpload) return;
    setShowFaceModal(false);
    try {
      const fd = new FormData();
      fd.append('image', pendingFaceUpload.blob, 'rapidfire.jpg');
      fd.append('saleId', saleId as string);
      fd.append('faceDetected', 'true');

      const res = await api.post('/upload/rapidfire', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { itemId } = res.data;
      setRapidItems((prev) =>
        prev.map((item) =>
          item.id === pendingFaceUpload.tempId
            ? { ...item, id: itemId, draftStatus: 'DRAFT', photoUrls: [pendingFaceUpload.previewUrl] }
            : item
        )
      );
      queryClient.invalidateQueries({ queryKey: ['items', saleId] });
    } catch (err: any) {
      console.error('[rapidfire] Face upload failed:', err);
      setRapidItems((prev) =>
        prev.map((item) =>
          item.id === pendingFaceUpload.tempId
            ? { ...item, aiError: 'Upload failed' }
            : item
        )
      );
      showToast('Photo upload failed', 'error');
    } finally {
      setPendingFaceUpload(null);
    }
  };

  const handleFaceRetake = () => {
    setShowFaceModal(false);
    // Remove the temp item from carousel
    if (pendingFaceUpload) {
      setRapidItems((prev) =>
        prev.filter((item) => item.id !== pendingFaceUpload.tempId)
      );
    }
    setPendingFaceUpload(null);
  };

  const handleRetake = () => {
    setShowRetakeToast(false);
    // Toast dismissed; photo stays in carousel for organizer to accept or delete
  };

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

  // Polling for draft status updates
  useEffect(() => {
    const draftItems = rapidItems.filter(
      (i) => i.draftStatus === 'DRAFT' && !i.aiError
    );
    if (draftItems.length === 0 || aiPaused) return;

    const interval = setInterval(async () => {
      for (const item of draftItems) {
        try {
          const res = await api.get(`/items/${item.id}/draft-status`);
          const data = res.data;
          if (data.draftStatus !== 'DRAFT') {
            setRapidItems((prev) =>
              prev.map((i) => (i.id === item.id ? { ...i, ...data } : i))
            );
          }
        } catch (e) {
          // Silent error
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
                {tab === 'camera' ? 'Camera (AI)' : tab === 'batch' ? 'Batch Upload' : 'Manual Entry'}
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-8">
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-6">Add Item Manually</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!formData.title.trim()) {
                    showToast('Title is required', 'error');
                    return;
                  }
                  createMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Title *</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                        placeholder="Item title"
                      />
                      {voiceSupported && user?.organizerTier === 'PRO' && (
                        <button
                          type="button"
                          onClick={handleVoiceToggle}
                          disabled={voiceLoading}
                          className={`px-3 py-2 rounded-lg text-xl font-semibold transition-all ${
                            isListening
                              ? 'bg-red-600 text-white animate-pulse ring-2 ring-red-400'
                              : 'bg-warm-200 text-warm-900 dark:text-warm-100 hover:bg-warm-300'
                          } disabled:opacity-50`}
                          title="Record item description"
                          aria-label={isListening ? 'Stop recording' : 'Start recording'}
                        >
                          🎤
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">Select a category</option>
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Condition</label>
                    <select
                      value={formData.condition}
                      onChange={(e) => handleConditionChange(e.target.value)}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">Select condition</option>
                      {CONDITIONS.map((cond) => (
                        <option key={cond} value={cond}>
                          {cond}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">💡 PRO organizers: Use pricing insights to research comparable sales. Create the item first, then view suggestions below.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Rarity Badge</label>
                    <select
                      value={formData.rarity}
                      onChange={(e) => setFormData({ ...formData, rarity: e.target.value })}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                      {RARITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Listing Type</label>
                    <select
                      value={formData.listingType}
                      onChange={(e) => setFormData({ ...formData, listingType: e.target.value })}
                      className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="FIXED">Fixed Price</option>
                      <option value="AUCTION">Auction</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                    placeholder="Item description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Tags</label>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {formData.tags.map((tag) => (
                          <span key={tag} className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
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
                        className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <VoiceTagButton
                      onExtraction={(result) => {
                        const newTags = result.tags.filter((t) => !formData.tags.includes(t));
                        if (newTags.length > 0) {
                          setFormData({ ...formData, tags: [...formData.tags, ...newTags] });
                        }
                      }}
                      className="px-3 py-2 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Photos</label>
                  {formData.photoUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {formData.photoUrls.map((url, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100">
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
                    </div>
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
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={photoUploading}
                    className="w-full bg-warm-50 dark:bg-gray-900 border-2 border-dashed border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg p-6 text-center hover:border-amber-400 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {photoUploading ? (
                      <span className="text-warm-600 dark:text-warm-400 text-sm">Uploading...</span>
                    ) : (
                      <>
                        <svg className="w-8 h-8 mx-auto text-warm-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16v-8m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.572 5.095H19.5a4.5 4.5 0 01-4.5 4.5H9a4.5 4.5 0 01-2.25-.615z" />
                        </svg>
                        <span className="text-warm-600 dark:text-warm-400 text-sm">Click to upload photos</span>
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Item'}
                </button>
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
            <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-8 transition-all duration-300 overflow-hidden ${
              items.length > 0 ? 'max-h-60' : 'max-h-screen'
            }`}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100">
                  {items.length > 0 ? '📷 Add More Photos' : 'Capture with Camera'}
                </h2>
                {items.length === 0 && <ModeToggle mode={captureMode} onChange={setCaptureMode} />}
              </div>

              {captureMode === 'rapidfire' ? (
                <div className="space-y-6">
                  <p className="text-warm-600 dark:text-warm-400">
                    Rapidly capture multiple items. Photos upload and analyze in the background.
                  </p>

                  <div className="flex justify-center">
                    <CaptureButton
                      onCapture={() => setCameraOpen(true)}
                      state={cameraOpen ? 'capturing' : 'ready'}
                    />
                  </div>

                  {/* RapidCarousel - only shown when there are items or mode is rapidfire */}
                  {rapidItems.length > 0 && (
                    <RapidCarousel
                      items={rapidItems}
                      onThumbnailTap={(id) => setPreviewItemId(id)}
                      onDeleteRequest={handleDeleteDraft}
                      onAddPhotoToItem={(id) => {
                        setAddingToItemId((prev) => (prev === id ? null : id));
                        setCameraOpen(true);
                      }}
                      collapsed={carouselCollapsed}
                      onToggleCollapse={() => setCarouselCollapsed(!carouselCollapsed)}
                      aiPaused={aiPaused}
                      onTogglePause={() => setAiPaused(!aiPaused)}
                      addingToItemId={addingToItemId}
                      enhancedCount={rapidItems.filter((i) => i.autoEnhanced).length}
                    />
                  )}

                  {/* Review & Publish button */}
                  {rapidItems.some((i) => i.draftStatus === 'PENDING_REVIEW') && (
                    <button
                      onClick={() =>
                        router.push(`/organizer/add-items/${saleId}/review`)
                      }
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                      Review & Publish ({rapidItems.filter((i) => i.draftStatus === 'PENDING_REVIEW').length} ready)
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  {cameraAnalyzing ? (
                    <div className="text-center py-12">
                      <div className="inline-block w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mb-4" />
                      <p className="text-warm-700 dark:text-warm-300 font-medium">Analyzing photo with AI...</p>
                      <p className="text-warm-500 dark:text-warm-400 text-sm mt-1">This may take a few seconds</p>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-warm-600 dark:text-warm-400 mb-4">
                        Take a photo of an item. AI will identify it and pre-fill the details for you to review.
                      </p>
                      <button
                        onClick={() => setCameraOpen(true)}
                        className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2 2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Open Camera
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Phase 3: Retake toast */}
          {showRetakeToast && (
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-3 rounded-xl flex items-center gap-3 shadow-lg z-50">
              <span className="text-sm">Image looks dark — retake?</span>
              <button onClick={handleRetake} className="text-amber-400 text-sm font-medium">
                Keep
              </button>
              <button onClick={handleRetake} className="text-gray-400 text-sm">
                ✕
              </button>
            </div>
          )}

          {/* Phase 3: Face detection modal */}
          {showFaceModal && (
            <div className="fixed inset-0 bg-black/60 flex items-end z-50">
              <div className="bg-white dark:bg-gray-800 rounded-t-2xl p-6 w-full">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Privacy check</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  This photo may contain a person. Upload anyway?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleFaceUploadAnyway}
                    className="flex-1 bg-gray-900 text-white py-3 rounded-xl text-sm font-medium"
                  >
                    Upload anyway
                  </button>
                  <button
                    onClick={handleFaceRetake}
                    className="flex-1 bg-gray-100 text-gray-900 dark:text-gray-100 py-3 rounded-xl text-sm font-medium"
                  >
                    Retake
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* RapidCapture fullscreen overlay */}
          {cameraOpen && (
            <RapidCapture
              onComplete={captureMode === 'rapidfire' ? handleRapidCameraComplete : handleCameraComplete}
              onCancel={() => setCameraOpen(false)}
              maxPhotos={captureMode === 'rapidfire' ? 20 : 5}
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
                    Review & Publish &rarr;
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

                    {/* More Actions dropdown - styled for sticky toolbar */}
                    <div className="relative inline-block">
                      <button
                        className="text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                        disabled={bulkUpdateMutation.isPending}
                        onClick={() => {
                          const button = document.activeElement as HTMLButtonElement;
                          const rect = button.getBoundingClientRect();
                          const availableSpace = window.innerHeight - rect.bottom;
                          // Note: dropdown items style themselves; this just controls visibility
                        }}
                      >
                        ⋮ More Actions
                      </button>
                    </div>

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

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left w-12">
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
                          title="Select all items"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900 dark:text-warm-100 w-20">Photo</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900 dark:text-warm-100">Title</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900 dark:text-warm-100 w-32">Category</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900 dark:text-warm-100 w-20">Price</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900 dark:text-warm-100 w-20">Photos</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900 dark:text-warm-100 w-28">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900 dark:text-warm-100 w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200">
                    {items.map((item: any) => {
                      const draftStatus = computeDraftStatus(item);
                      const photoCount = item.photoUrls?.length || 0;
                      const statusColors = {
                        'DRAFT': 'bg-gray-100 text-gray-700',
                        'PENDING_REVIEW': 'bg-amber-100 text-amber-700',
                        'PUBLISHED': 'bg-green-100 text-green-700',
                      };
                      return (
                        <tr key={item.id} className={`hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 transition-colors ${selectedItems.has(item.id) ? 'bg-blue-50' : ''}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedItems.has(item.id)}
                              onChange={(e) => {
                                const newSet = new Set(selectedItems);
                                if (e.target.checked) newSet.add(item.id);
                                else newSet.delete(item.id);
                                setSelectedItems(newSet);
                              }}
                              className="rounded cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3">
                            {item.photoUrls && item.photoUrls.length > 0 ? (
                              <img
                                src={item.photoUrls[0]}
                                alt={item.title}
                                className="w-16 h-16 object-cover rounded border border-warm-200 dark:border-gray-700"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-16 h-16 bg-gray-200 rounded border border-warm-200 dark:border-gray-700 flex items-center justify-center text-gray-400 text-2xl">
                                📷
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">
                            <span title={item.title} className="block truncate text-amber-700">
                              {item.title}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-warm-600 dark:text-warm-400">
                            <span className="inline-block bg-warm-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                              {formatCategory(item.category)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-warm-900 dark:text-warm-100 font-semibold">
                            ${item.price ?? item.auctionStartPrice ?? '\u2014'}
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-warm-600 dark:text-warm-400">
                            {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex gap-2 flex-wrap items-center">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                item.status === 'AVAILABLE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                item.status === 'SOLD' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                item.status === 'RESERVED' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                                'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                              }`}>
                                {item.status}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex gap-2">
                              <Link
                                href={`/organizer/edit-item/${item.id}`}
                                className="text-amber-700 hover:text-amber-900 font-medium text-xs px-2 py-1 rounded hover:bg-amber-50 dark:bg-amber-900/20"
                              >
                                Edit
                              </Link>
                              {deleteConfirmId === item.id ? (
                                <span className="flex items-center gap-1">
                                  <button
                                    onClick={() => deleteMutation.mutate(item.id)}
                                    disabled={deleteMutation.isPending}
                                    className="text-red-600 hover:text-red-700 dark:text-red-300 font-medium text-xs px-1 disabled:opacity-50"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="text-warm-600 dark:text-warm-400 hover:text-warm-700 dark:text-warm-300 font-medium text-xs px-1"
                                  >
                                    No
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirmId(item.id)}
                                  className="text-red-600 hover:text-red-700 dark:text-red-300 font-medium text-xs px-2 py-1 rounded hover:bg-red-50 dark:bg-red-900/20"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
            try {
              await api.patch(`/items/${previewItemId}`, edits);
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
    </>
  );
};

export default AddItemsDetailPage;
