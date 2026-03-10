/**
 * Add Items Detail Page
 *
 * Tabs:
 * - Manual Entry: standard form + photo upload
 * - Camera (AI — one item): capture → AI pre-fill → review or auto-create
 * - Batch (AI — multiple): SmartInventoryUpload for bulk photo processing
 * - CSV: modal trigger
 *
 * Session 128 fixes:
 * - Full file rewrite to resolve session 127 merge conflict residue
 * - Camera: fullscreen overlay on mobile, flash/torch toggle
 * - Batch vs Camera tab labels distinguish use cases
 * - Item list: title is a Link to edit-item page (click-to-edit)
 * - Native confirm replaced with toast-based delete confirmation
 * - Duplicate JSX blocks and orphaned JSX-in-JS removed
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

type ActiveTab = 'manual' | 'batch' | 'camera';

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

const normalizeToArray = (value: string | undefined, arr: string[]): string => {
  if (!value) return '';
  const lowerValue = value.toLowerCase();
  const match = arr.find(item => item.toLowerCase() === lowerValue);
  return match || '';
};

const emptyForm = {
  title: '',
  description: '',
  category: '',
  condition: '',
  price: '',
  quantity: 1,
  listingType: 'FIXED',
  startingBid: '',
  reservePrice: '',
  reverseDailyDrop: '',
  reverseFloorPrice: '',
};

const AddItemsDetailPage = () => {
  const router = useRouter();
  const { saleId, method } = router.query;
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [showCSVModal, setShowCSVModal] = useState(method === 'csv');
  const [activeTab, setActiveTab] = useState<ActiveTab>('manual');

  // Bulk edit state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Manual entry form state
  const [formData, setFormData] = useState(emptyForm);
  const [manualPhotoFile, setManualPhotoFile] = useState<File | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [formError, setFormError] = useState('');

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFullscreen, setCameraFullscreen] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [capturedImageURL, setCapturedImageURL] = useState<string | null>(null);
  const [capturedImageBlob, setCapturedImageBlob] = useState<Blob | null>(null);
  const [autoCreate, setAutoCreate] = useState(false);
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imageCaptureRef = useRef<any>(null);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Attach stream to video element when camera activates
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive, cameraFullscreen]);

  // Fetch items for this sale
  const { data: items, isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['sale-items', saleId],
    queryFn: async () => {
      const response = await api.get(`/items?saleId=${saleId}`);
      return response.data;
    },
    enabled: !!saleId,
  });

  // Create item mutation
  const createItemMutation = useMutation({
    mutationFn: (itemData: any) => api.post('/items', itemData),
    onSuccess: () => {
      showToast('Item added successfully!', 'success');
      setFormData(emptyForm);
      setManualPhotoFile(null);
      setPendingPhotoUrl(null);
      setFormError('');
      queryClient.invalidateQueries({ queryKey: ['sale-items', saleId] });
      refetchItems?.();
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to add item';
      showToast(message, 'error');
    },
  });

  // Delete item mutation
  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/items/${itemId}`),
    onSuccess: () => {
      showToast('Item deleted', 'success');
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['sale-items', saleId] });
    },
    onError: () => showToast('Failed to delete item', 'error'),
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: (payload: { itemIds: string[]; operation: string; value: any }) =>
      api.post('/items/bulk', payload),
    onSuccess: (_, variables) => {
      const op = variables.operation;
      const count = variables.itemIds.length;
      const message =
        op === 'isActive' && variables.value === false
          ? `Hidden ${count} item${count !== 1 ? 's' : ''}`
          : op === 'isActive' && variables.value === true
            ? `Unhidden ${count} item${count !== 1 ? 's' : ''}`
            : op === 'price'
              ? `Updated price for ${count} item${count !== 1 ? 's' : ''}`
              : 'Bulk update completed';
      showToast(message, 'success');
      setSelectedItems(new Set());
      setBulkPrice('');
      queryClient.invalidateQueries({ queryKey: ['sale-items', saleId] });
    },
    onError: () => showToast('Bulk update failed', 'error'),
  });

  // ─── Camera helpers ───────────────────────────────────────────────────────

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;

      // Check torch support
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as any;
      if (capabilities?.torch) {
        setFlashSupported(true);
        if ('ImageCapture' in window) {
          imageCaptureRef.current = new (window as any).ImageCapture(track);
        }
      }

      setCameraActive(true);
      setCameraFullscreen(true);
    } catch (err) {
      showToast('Failed to access camera. Check permissions.', 'error');
      console.error('Camera error:', err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraFullscreen(false);
    setFlashOn(false);
    setFlashSupported(false);
    imageCaptureRef.current = null;
  };

  const toggleFlash = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const newState = !flashOn;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: newState }] });
      setFlashOn(newState);
    } catch {
      showToast('Flash not supported on this device', 'error');
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        canvasRef.current.toBlob((blob) => {
          if (blob) {
            setCapturedImageBlob(blob);
            setCapturedImageURL(URL.createObjectURL(blob));
            stopCamera();
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const clearCapture = () => {
    setCapturedImageBlob(null);
    if (capturedImageURL) URL.revokeObjectURL(capturedImageURL);
    setCapturedImageURL(null);
  };

  const uploadCapturedPhoto = async () => {
    if (!capturedImageBlob) {
      showToast('No photo to upload', 'error');
      return;
    }
    try {
      setIsUploadingPhoto(true);
      const uploadFormData = new FormData();
      uploadFormData.append('photos', capturedImageBlob, 'camera-capture.jpg');
      const response = await api.post('/upload/rapid-batch', uploadFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const result = response.data.results[0];
      if (!result?.cloudinaryUrl) {
        showToast('Upload failed — no URL returned', 'error');
        return;
      }

      setPendingPhotoUrl(result.cloudinaryUrl);

      if (autoCreate && result.ai) {
        createItemMutation.mutate({
          title: result.ai.title || '',
          description: result.ai.description || '',
          category: normalizeToArray(result.ai.category, CATEGORIES),
          condition: normalizeToArray(result.ai.condition, CONDITIONS),
          price: result.ai.suggestedPrice?.toString() || '',
          photoUrl: result.cloudinaryUrl,
          saleId: saleId as string,
          quantity: 1,
          listingType: 'FIXED',
        });
        clearCapture();
        showToast('Item created from AI analysis!', 'success');
      } else {
        if (result.ai) {
          setFormData(prev => ({
            ...prev,
            title: result.ai.title || '',
            description: result.ai.description || '',
            category: normalizeToArray(result.ai.category, CATEGORIES),
            condition: normalizeToArray(result.ai.condition, CONDITIONS),
            price: result.ai.suggestedPrice?.toString() || '',
          }));
        }
        clearCapture();
        setActiveTab('manual');
        showToast('Photo analyzed! Review the details below and save.', 'success');
      }
    } catch (error) {
      showToast('Failed to upload photo', 'error');
      console.error('Upload error:', error);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // ─── Form handlers ────────────────────────────────────────────────────────

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value, 10) : value,
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const price = parseFloat(formData.price) || 0;
    if (!formData.title.trim()) {
      setFormError('Title is required');
      return;
    }
    if (formData.listingType === 'AUCTION' && !formData.startingBid) {
      setFormError('Starting bid is required for auction items');
      return;
    }
    if (formData.listingType === 'FIXED' && !formData.price) {
      setFormError('Price is required');
      return;
    }
    if (formData.listingType === 'REVERSE_AUCTION') {
      if (!formData.price) { setFormError('Original price is required'); return; }
      if (!formData.reverseDailyDrop) { setFormError('Daily drop amount is required'); return; }
      if (!formData.reverseFloorPrice) { setFormError('Floor price is required'); return; }
    }

    let photoUrl = pendingPhotoUrl || undefined;

    if (manualPhotoFile) {
      setIsUploadingPhoto(true);
      try {
        const uploadFormData = new FormData();
        uploadFormData.append('photos', manualPhotoFile, manualPhotoFile.name);
        const uploadResponse = await api.post('/upload/rapid-batch', uploadFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        photoUrl = uploadResponse.data.results[0]?.cloudinaryUrl || photoUrl;
      } catch {
        setIsUploadingPhoto(false);
        showToast('Failed to upload photo', 'error');
        return;
      } finally {
        setIsUploadingPhoto(false);
      }
    }

    const payload: any = {
      saleId,
      title: formData.title,
      description: formData.description || '',
      category: formData.category || null,
      condition: formData.condition || null,
      quantity: parseInt(String(formData.quantity), 10) || 1,
      listingType: formData.listingType,
    };

    if (photoUrl) payload.photoUrls = [photoUrl];

    if (formData.listingType === 'AUCTION') {
      payload.auctionStartPrice = parseFloat(formData.startingBid);
      if (formData.reservePrice) payload.auctionReservePrice = parseFloat(formData.reservePrice);
    } else if (formData.listingType === 'REVERSE_AUCTION') {
      payload.price = price;
      payload.reverseDailyDrop = parseFloat(formData.reverseDailyDrop);
      payload.reverseFloorPrice = parseFloat(formData.reverseFloorPrice);
    } else {
      payload.price = price;
    }

    createItemMutation.mutate(payload);
  };

  // ─── Auth guard ───────────────────────────────────────────────────────────

  if (!isLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <Skeleton className="h-12 w-64" />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Head>
        <title>Add Items - FindA.Sale</title>
      </Head>

      {/* Camera fullscreen overlay */}
      {cameraFullscreen && cameraActive && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="flex-1 w-full object-cover"
          />
          <div className="p-4 flex gap-3 bg-black bg-opacity-80">
            {flashSupported && (
              <button
                onClick={toggleFlash}
                className={`flex-none px-4 py-3 rounded-lg font-bold text-sm ${
                  flashOn
                    ? 'bg-yellow-400 text-black'
                    : 'bg-warm-700 text-white'
                }`}
              >
                {flashOn ? '⚡ Flash On' : '⚡ Flash Off'}
              </button>
            )}
            <button
              onClick={capturePhoto}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg"
            >
              ✅ Capture
            </button>
            <button
              onClick={stopCamera}
              className="flex-none bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg"
            >
              ✕
            </button>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      )}

      <main className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Link href="/organizer/dashboard" className="text-amber-600 hover:text-amber-700 font-medium">
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-warm-900">Add Items</h1>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 mb-6 bg-white border border-warm-200 rounded-lg p-1">
            {[
              { key: 'manual', label: 'Manual Entry' },
              { key: 'camera', label: '📷 Camera (AI — 1 item)' },
              { key: 'batch', label: '🤖 Batch (AI — multiple)' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as ActiveTab)}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-amber-600 text-white'
                    : 'text-warm-700 hover:bg-warm-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              onClick={() => setShowCSVModal(true)}
              className="flex-none py-2 px-3 rounded-md text-sm font-medium text-warm-700 hover:bg-warm-100 transition-colors"
            >
              📄 CSV
            </button>
          </div>

          {/* ── Manual Entry Tab ── */}
          {activeTab === 'manual' && (
            <div className="bg-white border border-warm-200 rounded-lg p-6 mb-8">
              <h2 className="text-xl font-semibold text-warm-900 mb-4">Add Item</h2>

              {pendingPhotoUrl && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
                  <img src={pendingPhotoUrl} alt="Pre-filled" className="w-16 h-16 object-cover rounded" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-warm-900">Photo ready from camera</p>
                    <button
                      onClick={() => setPendingPhotoUrl(null)}
                      className="text-xs text-red-600 hover:underline mt-1"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-warm-900 mb-1">
                    Title <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleFormChange}
                    placeholder="Item name"
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    disabled={createItemMutation.isPending || isUploadingPhoto}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-warm-900 mb-1">Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleFormChange}
                    rows={3}
                    placeholder="Optional description"
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                    disabled={createItemMutation.isPending || isUploadingPhoto}
                  />
                </div>

                {/* Category + Condition row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-900 mb-1">Category</label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      disabled={createItemMutation.isPending || isUploadingPhoto}
                    >
                      <option value="">Select category...</option>
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-900 mb-1">Condition</label>
                    <select
                      name="condition"
                      value={formData.condition}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      disabled={createItemMutation.isPending || isUploadingPhoto}
                    >
                      <option value="">Select condition...</option>
                      {CONDITIONS.map(cond => (
                        <option key={cond} value={cond}>{cond}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Listing Type */}
                <div>
                  <label className="block text-sm font-medium text-warm-900 mb-1">
                    Listing Type <span className="text-red-600">*</span>
                  </label>
                  <select
                    name="listingType"
                    value={formData.listingType}
                    onChange={handleFormChange}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    disabled={createItemMutation.isPending || isUploadingPhoto}
                  >
                    <option value="FIXED">Fixed Price</option>
                    <option value="AUCTION">Auction</option>
                    <option value="REVERSE_AUCTION">Reverse Auction</option>
                  </select>
                </div>

                {/* Price (FIXED / REVERSE_AUCTION) */}
                {(formData.listingType === 'FIXED' || formData.listingType === 'REVERSE_AUCTION') && (
                  <div>
                    <label className="block text-sm font-medium text-warm-900 mb-1">
                      {formData.listingType === 'REVERSE_AUCTION' ? 'Original Price' : 'Price'}{' '}
                      <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-2.5 text-warm-600">$</span>
                      <input
                        type="number"
                        name="price"
                        value={formData.price}
                        onChange={handleFormChange}
                        min="0"
                        step="0.01"
                        className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        disabled={createItemMutation.isPending || isUploadingPhoto}
                      />
                    </div>
                  </div>
                )}

                {/* Auction fields */}
                {formData.listingType === 'AUCTION' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-warm-900 mb-1">
                        Starting Bid <span className="text-red-600">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-2.5 text-warm-600">$</span>
                        <input
                          type="number"
                          name="startingBid"
                          value={formData.startingBid}
                          onChange={handleFormChange}
                          min="1"
                          step="1"
                          className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          disabled={createItemMutation.isPending || isUploadingPhoto}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-warm-900 mb-1">Reserve Price</label>
                      <div className="relative">
                        <span className="absolute left-4 top-2.5 text-warm-600">$</span>
                        <input
                          type="number"
                          name="reservePrice"
                          value={formData.reservePrice}
                          onChange={handleFormChange}
                          min="1"
                          step="1"
                          className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          disabled={createItemMutation.isPending || isUploadingPhoto}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Reverse Auction fields */}
                {formData.listingType === 'REVERSE_AUCTION' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-warm-900 mb-1">
                        Daily Drop <span className="text-red-600">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-2.5 text-warm-600">$</span>
                        <input
                          type="number"
                          name="reverseDailyDrop"
                          value={formData.reverseDailyDrop}
                          onChange={handleFormChange}
                          min="1"
                          step="1"
                          className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          disabled={createItemMutation.isPending || isUploadingPhoto}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-warm-900 mb-1">
                        Floor Price <span className="text-red-600">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-2.5 text-warm-600">$</span>
                        <input
                          type="number"
                          name="reverseFloorPrice"
                          value={formData.reverseFloorPrice}
                          onChange={handleFormChange}
                          min="1"
                          step="1"
                          className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          disabled={createItemMutation.isPending || isUploadingPhoto}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium text-warm-900 mb-1">Quantity</label>
                  <input
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleFormChange}
                    min="1"
                    step="1"
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    disabled={createItemMutation.isPending || isUploadingPhoto}
                  />
                </div>

                {/* Photo upload */}
                <div>
                  <label className="block text-sm font-medium text-warm-900 mb-1">Photo (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setManualPhotoFile(e.target.files?.[0] || null)}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm text-warm-600"
                    disabled={createItemMutation.isPending || isUploadingPhoto}
                  />
                  {manualPhotoFile && (
                    <p className="text-xs text-warm-600 mt-1">Selected: {manualPhotoFile.name}</p>
                  )}
                </div>

                {formError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {formError}
                  </p>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={createItemMutation.isPending || isUploadingPhoto}
                    className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
                  >
                    {isUploadingPhoto ? 'Uploading photo...' : createItemMutation.isPending ? 'Adding...' : 'Add Item'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── Camera Tab ── */}
          {activeTab === 'camera' && (
            <div className="bg-white border border-warm-200 rounded-lg p-6 mb-8">
              <h2 className="text-xl font-semibold text-warm-900 mb-1">Capture Item Photo</h2>
              <p className="text-sm text-warm-600 mb-4">
                Take a photo and AI will pre-fill the form — best for one item at a time.
                For many items, use the Batch tab.
              </p>

              {!capturedImageURL ? (
                <>
                  {/* AI tagging disclosure */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-900">
                    ✨ AI will suggest a title, category, and price from your photo. Always review before saving.
                  </div>

                  {/* Auto-create toggle */}
                  <div className="mb-4 p-4 bg-warm-50 border border-warm-200 rounded-lg">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoCreate}
                        onChange={(e) => setAutoCreate(e.target.checked)}
                        className="w-5 h-5 rounded accent-amber-600"
                      />
                      <div>
                        <span className="block font-medium text-warm-900">⚡ Auto-create after analysis</span>
                        <span className="block text-sm text-warm-600 mt-0.5">
                          Skip the review form — item is saved immediately using AI suggestions
                        </span>
                      </div>
                    </label>
                  </div>

                  <button
                    onClick={startCamera}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-lg"
                  >
                    📷 Start Camera
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg overflow-hidden bg-warm-100">
                    <img
                      src={capturedImageURL}
                      alt="Captured"
                      className="w-full"
                      style={{ maxHeight: '400px', objectFit: 'cover' }}
                    />
                  </div>
                  <p className="text-sm text-warm-600">
                    Photo captured. Upload to analyze with AI{autoCreate ? ' and auto-create' : ''}.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={uploadCapturedPhoto}
                      disabled={isUploadingPhoto}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg"
                    >
                      {isUploadingPhoto ? 'Analyzing...' : '🚀 Upload & Analyze'}
                    </button>
                    <button
                      onClick={clearCapture}
                      className="flex-1 bg-warm-200 hover:bg-warm-300 text-warm-900 font-bold py-2 px-4 rounded-lg"
                    >
                      🔄 Retake
                    </button>
                  </div>
                </div>
              )}

              {/* Hidden canvas for capture */}
              {!cameraFullscreen && <canvas ref={canvasRef} style={{ display: 'none' }} />}
            </div>
          )}

          {/* ── Batch Tab ── */}
          {activeTab === 'batch' && (
            <div className="mb-8">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-900">
                ✨ Upload multiple photos at once — AI auto-suggests categories, tags, and descriptions.
                Review what we suggest before publishing. You're always in control.
              </div>
              <SmartInventoryUpload
                saleId={String(saleId)}
                onComplete={() => { refetchItems(); }}
              />
            </div>
          )}

          {/* ── CSV Modal ── */}
          {showCSVModal && (
            <CSVImportModal
              saleId={saleId as string}
              isOpen={showCSVModal}
              onClose={() => setShowCSVModal(false)}
              onImportComplete={() => {
                setShowCSVModal(false);
                refetchItems();
              }}
            />
          )}

          {/* ── Items List ── */}
          {itemsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : items && items.length > 0 ? (
            <div className="bg-white rounded-lg overflow-hidden border border-warm-200">
              <div className="p-4 border-b border-warm-200 flex items-center justify-between">
                <h2 className="font-semibold text-warm-900">
                  {items.length} Item{items.length !== 1 ? 's' : ''}
                  {selectedItems.size > 0 && (
                    <span className="ml-2 text-sm font-normal text-amber-600">
                      ({selectedItems.size} selected)
                    </span>
                  )}
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-warm-50 border-b border-warm-200">
                    <tr>
                      <th className="px-4 py-3 text-left">
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
                          className="rounded"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Title</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Category</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Price</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Qty</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-warm-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200">
                    {items.map((item: any) => (
                      <tr key={item.id} className="hover:bg-warm-50 transition-colors">
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
                            className="rounded"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          <Link
                            href={`/organizer/edit-item/${item.id}`}
                            className="text-amber-700 hover:text-amber-900 hover:underline"
                          >
                            {item.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-warm-600">{item.category || '—'}</td>
                        <td className="px-4 py-3 text-sm text-warm-900 font-semibold">
                          ${item.price ?? item.auctionStartPrice ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-warm-600">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              item.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {item.isActive ? 'Active' : 'Hidden'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {deleteConfirmId === item.id ? (
                            <span className="flex items-center gap-2">
                              <span className="text-xs text-warm-700">Delete?</span>
                              <button
                                onClick={() => deleteMutation.mutate(item.id)}
                                disabled={deleteMutation.isPending}
                                className="text-red-600 hover:text-red-700 font-medium text-xs disabled:opacity-50"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="text-warm-600 hover:text-warm-700 font-medium text-xs"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(item.id)}
                              className="text-red-600 hover:text-red-700 font-medium"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bulk Actions */}
              {selectedItems.size > 0 && (
                <div className="bg-amber-50 border-t border-amber-200 p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm font-semibold text-warm-900">
                      {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                    </span>
                    <button
                      onClick={() =>
                        bulkUpdateMutation.mutate({
                          itemIds: Array.from(selectedItems),
                          operation: 'isActive',
                          value: false,
                        })
                      }
                      disabled={bulkUpdateMutation.isPending}
                      className="text-sm font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50"
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
                      className="text-sm font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50"
                    >
                      Show
                    </button>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        value={bulkPrice}
                        onChange={(e) => setBulkPrice(e.target.value)}
                        placeholder="New price"
                        step="0.01"
                        className="w-28 px-3 py-1 border border-amber-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        onClick={() => {
                          if (bulkPrice) {
                            bulkUpdateMutation.mutate({
                              itemIds: Array.from(selectedItems),
                              operation: 'price',
                              value: parseFloat(bulkPrice),
                            });
                          }
                        }}
                        disabled={bulkUpdateMutation.isPending || !bulkPrice}
                        className="text-sm font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50"
                      >
                        Update Price
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-lg border border-warm-200">
              <p className="text-warm-600 text-lg">No items yet. Use the tabs above to get started.</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default AddItemsDetailPage;
