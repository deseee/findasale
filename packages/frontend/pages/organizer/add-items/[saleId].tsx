/**
 * Add Items Detail Page
 *
 * Actual importer:
 * - CSV upload modal
 * - Manual item entry form
 * - Batch AI upload (CD2 Phase 2)
 * - Item list with edit/delete/bulk actions
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

// Helper function for Bug 2: normalize AI data values to array
const normalizeToArray = (value: string | undefined, arr: string[]): string => {
  if (!value) return '';
  const lowerValue = value.toLowerCase();
  const match = arr.find(item => item.toLowerCase() === lowerValue);
  return match || '';
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

  // Manual entry form state
  const [formData, setFormData] = useState({
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
  });

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<Blob | null>(null);
  const [capturedImageURL, setCapturedImageURL] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Manual photo upload state (Bug 1)
  const [manualPhotoFile, setManualPhotoFile] = useState<File | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Camera photo pre-fill state (Bug 2)
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);
  const [autoCreate, setAutoCreate] = useState(false);

  // Form validation error state
  const [formError, setFormError] = useState('');

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Create item mutation
  const createItemMutation = useMutation({
    mutationFn: (itemData: any) => api.post('/items', itemData),
    onSuccess: () => {
      showToast('Item added successfully!', 'success');
      setFormData({
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
      });
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

  // Fetch items for this sale
  const { data: items, isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['sale-items', saleId],
    queryFn: async () => {
      const response = await api.get(`/items?saleId=${saleId}`);
      return response.data;
    },
    enabled: !!saleId,
  });

  // Delete item mutation
  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/items/${itemId}`),
    onSuccess: () => {
      showToast('Item deleted', 'success');
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

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      showToast('Failed to access camera. Check permissions.', 'error');
      console.error('Camera error:', err);
    }
  };

  // Attach camera stream once the <video> element is in the DOM
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        canvasRef.current.toBlob((blob) => {
          if (blob) {
            setCapturedImage(blob);
            setCapturedImageURL(URL.createObjectURL(blob));
            stopCamera();
            showToast('Photo captured! Upload it with an item.', 'success');
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const clearCapture = () => {
    setCapturedImage(null);
    if (capturedImageURL) {
      URL.revokeObjectURL(capturedImageURL);
    }
    setCapturedImageURL(null);
  };

  const uploadCapturedPhoto = async () => {
    if (!capturedImage) {
      showToast('No photo to upload', 'error');
      return;
    }
    try {
      setIsUploadingPhoto(true);
      const uploadFormData = new FormData();
      uploadFormData.append('photos', capturedImage, 'camera-capture.jpg');
      const response = await api.post('/upload/rapid-batch', uploadFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Bug 2: Extract cloudinaryUrl and ai data from response
      const result = response.data.results[0];
      if (result && result.cloudinaryUrl) {
        setPendingPhotoUrl(result.cloudinaryUrl);

        // If autoCreate is enabled and AI data exists, create item directly
        if (autoCreate && result.ai) {
          const aiData = {
            title: result.ai.title || '',
            description: result.ai.description || '',
            category: normalizeToArray(result.ai.category, CATEGORIES),
            condition: normalizeToArray(result.ai.condition, CONDITIONS),
            price: result.ai.suggestedPrice?.toString() || '',
            photoUrl: result.cloudinaryUrl,
          };

          // Call createItem mutation directly with AI data + photo
          createItemMutation.mutate({
            ...aiData,
            saleId: saleId as string,
            quantity: 1,
          });

          clearCapture();
          showToast('Item created!', 'success');
        } else {
          // Existing behavior: pre-fill form and switch to manual tab
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

          // Clear capture and switch to manual tab
          clearCapture();
          setActiveTab('manual');
          showToast('Photo analyzed! Review the details below and save.', 'success');
        }
      }
    } catch (error) {
      showToast('Failed to upload photo', 'error');
      console.error('Upload error:', error);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value, 10) : value,
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(formData.price) || 0;
    if (!formData.title.trim() || price < 0 || formData.quantity < 1) {
      showToast('Please fill in required fields correctly', 'error');
      return;
    }

    // B1: Validate based on listingType
    if (formData.listingType === 'AUCTION' && !formData.startingBid) {
      setFormError('Starting bid is required for auction items');
      return;
    }

    if (formData.listingType === 'FIXED' && !formData.price) {
      setFormError('Price is required for fixed-price items');
      return;
    }

    if (formData.listingType === 'REVERSE_AUCTION' && !formData.price) {
      setFormError('Original price is required for reverse auction items');
      return;
    }

    if (formData.listingType === 'REVERSE_AUCTION' && !formData.reverseDailyDrop) {
      setFormError('Daily drop amount is required for reverse auction items');
      return;
    }

    if (formData.listingType === 'REVERSE_AUCTION' && !formData.reverseFloorPrice) {
      setFormError('Floor price is required for reverse auction items');
      return;
    }

    // Bug 1 + Bug 2: Handle photo upload
    if (manualPhotoFile) {
      setIsUploadingPhoto(true);
      try {
        const uploadFormData = new FormData();
        uploadFormData.append('photos', manualPhotoFile, manualPhotoFile.name);
        const uploadResponse = await api.post('/upload/rapid-batch', uploadFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const cloudinaryUrl = uploadResponse.data.results[0]?.cloudinaryUrl;
        if (cloudinaryUrl) {
          // Manual photo upload takes priority over pending camera photo
          setPendingPhotoUrl(cloudinaryUrl);
        }
      } catch (error) {
        setIsUploadingPhoto(false);
        showToast('Failed to upload photo', 'error');
        console.error('Photo upload error:', error);
        return;
      }
    }

    const payload: any = {
      saleId,
      title: formData.title,
      description: formData.description || '',
      category: formData.category || null,
      condition: formData.condition || null,
      quantity: parseInt(formData.quantity, 10) || 1,
      // B1: Send listingType
      listingType: formData.listingType,
    };

    // Set price or auction fields based on listingType
    if (formData.listingType === 'AUCTION') {
      payload.auctionStartPrice = parseFloat(formData.startingBid);
      if (formData.reservePrice) {
        payload.auctionReservePrice = parseFloat(formData.reservePrice);
      }
    } else {
      createItemMutation.mutate({
        ...formData,
        saleId: saleId as string,
        photoUrl: pendingPhotoUrl || undefined,
      });
    }

    // Bug 2: Include photo from camera or manual upload
    if (manualPhotoFile && pendingPhotoUrl) {
      // Manual file upload takes priority
      payload.photoUrls = [pendingPhotoUrl];
    } else if (pendingPhotoUrl) {
      payload.photoUrls = [pendingPhotoUrl];
    }

    createItemMutation.mutate(payload);

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

                {/* Price */}
                <div>
                  <label className="block text-sm font-medium text-warm-900 mb-1">
                    Price <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-2.5 text-warm-600">$</span>
                    <input
                      type="number"
                      name="price"
                      value={formData.price}
                      onChange={handleFormChange}
                      min="1"
                      step="1"
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      disabled={createItemMutation.isPending || isUploadingPhoto}
                    />
                  </div>
                </div>

                {/* Auction Fields - Conditional */}
                {formData.listingType === 'AUCTION' && (
                  <>
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
                          className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          disabled={createItemMutation.isPending || isUploadingPhoto}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-warm-900 mb-1">
                        Reserve Price (optional)
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-2.5 text-warm-600">$</span>
                        <input
                          type="number"
                          name="reservePrice"
                          value={formData.reservePrice}
                          onChange={handleFormChange}
                          min="1"
                          step="1"
                          className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          disabled={createItemMutation.isPending || isUploadingPhoto}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Reverse Auction Fields - Conditional */}
                {formData.listingType === 'REVERSE_AUCTION' && (
                  <>
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
                          className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                          className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          disabled={createItemMutation.isPending || isUploadingPhoto}
                        />
                      </div>
                    </div>
                  </>
                )}

                  {/* Bug 1: Photo Upload Field */}
                  <div>
                    <label className="block text-sm font-medium text-warm-900 mb-1">
                      Photo (optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setManualPhotoFile(file);
                      }}
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      disabled={createItemMutation.isPending || isUploadingPhoto}
                    />
                    {manualPhotoFile && (
                      <p className="text-xs text-warm-600 mt-1">Selected: {manualPhotoFile.name}</p>
                    )}
                  </div>

                  {/* Submit Buttons */}
                  <div className="pt-4 flex gap-3">
                    <button
                      type="submit"
                      disabled={createItemMutation.isPending || isUploadingPhoto}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                      {isUploadingPhoto ? 'Uploading...' : createItemMutation.isPending ? 'Adding...' : 'Add Item'}
                    </button>
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
                      {CONDITIONS.map((cond) => (
                        <option key={cond} value={cond}>{cond}</option>
                      ))}
                    </select>
                  </div>
                </div>

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

                {/* Photo Upload */}
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

                {/* Submit */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={createItemMutation.isPending || isUploadingPhoto}
                    className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
                  >
                    {isUploadingPhoto ? 'Uploading...' : createItemMutation.isPending ? 'Adding...' : 'Add Item'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Camera Tab */}
        {activeTab === 'camera' && (
          <div className="mb-8">
            <div className="bg-white border border-warm-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-warm-900 mb-4">Capture Item Photo</h2>

              {!cameraActive && !capturedImageURL && (
                <>
                  {/* Auto-create toggle */}
                  <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoCreate}
                        onChange={(e) => setAutoCreate(e.target.checked)}
                        className="w-5 h-5 rounded accent-amber-600"
                      />
                      <div>
                        <span className="block font-medium text-warm-900">⚡ Auto-create item after analysis</span>
                        <span className="block text-sm text-warm-600 mt-0.5">Skip the review form — item is saved immediately using AI suggestions</span>
                      </div>
                    </label>
                  </div>

                {!cameraActive && !capturedImageURL && (
                  <>
                    {/* Auto-create toggle */}
                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoCreate}
                          onChange={(e) => setAutoCreate(e.target.checked)}
                          className="w-5 h-5 rounded accent-amber-600"
                        />
                        <div className="flex-1">
                          <span className="block font-medium text-warm-900">⚡ Auto-create item after analysis</span>
                          <span className="block text-sm text-warm-600 mt-1">Skip the review form — item is saved immediately using AI suggestions</span>
                        </div>
                      </label>
                    </div>

                    <button
                      onClick={startCamera}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-lg mb-4"
                    >
                      📷 Start Camera
                    </button>
                  </>
                )}

                {cameraActive && (
                  <div className="space-y-4">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full rounded-lg bg-black"
                      style={{ maxHeight: '400px', objectFit: 'cover' }}
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={capturePhoto}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
                      >
                        ✅ Capture
                      </button>
                      <button
                        onClick={stopCamera}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg"
                      >
                        ✕ Close Camera
                      </button>
                    </div>
                  </div>
                )}

                {capturedImageURL && (
                  <div className="space-y-4">
                    <div className="relative rounded-lg overflow-hidden bg-warm-100">
                      <img
                        src={capturedImageURL}
                        alt="Captured"
                        className="w-full"
                        style={{ maxHeight: '400px', objectFit: 'cover' }}
                      />
                    </div>
                    <p className="text-sm text-warm-600">
                      Photo captured! Upload it below to analyze with AI.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={uploadCapturedPhoto}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"
                      >
                        🚀 Upload & Analyze
                      </button>
                      <button
                        onClick={clearCapture}
                        className="flex-1 bg-warm-300 hover:bg-warm-400 text-warm-900 font-bold py-2 px-4 rounded-lg"
                      >
                        🔄 Retake
                      </button>
                    </div>
                  </div>
                )}

                {/* Hidden canvas for photo capture */}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </div>
            </div>
          )}

          {/* Batch Upload Tab (CD2 Phase 2) */}
          {activeTab === 'batch' && (
            <div className="mb-8">
              {/* B2: AI tagging first-use disclosure */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-900">
                ✨ We can auto-suggest categories, tags, and descriptions for your items — it's a quick way to get started. Just review what we suggest before you publish. You're always in control of what shows on your listings, and you can edit or remove anything.
              </div>
              <SmartInventoryUpload
                saleId={String(saleId)}
                onComplete={() => {
                  refetchItems();
                }}
              />
            </div>
          )}

          {/* Items List */}
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-warm-900 mb-4">
              {items?.length || 0} Item{items?.length !== 1 ? 's' : ''}
              {selectedItems.size > 0 && (
                <span className="ml-2 text-base font-normal text-amber-600">({selectedItems.size} selected)</span>
              )}

              {cameraActive && (
                <div className="space-y-4">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full rounded-lg bg-black"
                    style={{ maxHeight: '400px', objectFit: 'cover' }}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={capturePhoto}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
                    >
                      ✅ Capture
                    </button>
                    <button
                      onClick={stopCamera}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg"
                    >
                      ✕ Close Camera
                    </button>
                  </div>
                </div>
              )}

              {capturedImageURL && (
                <div className="space-y-4">
                  <img
                    src={capturedImageURL}
                    alt="Captured"
                    className="w-full rounded-lg"
                    style={{ maxHeight: '400px', objectFit: 'cover' }}
                  />
                  <p className="text-sm text-warm-600">
                    Photo captured! Upload it below to analyze with AI.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={uploadCapturedPhoto}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"
                    >
                      🚀 Upload &amp; Analyze
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

              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
          </div>
        )}

        {/* Batch Upload Tab */}
        {activeTab === 'batch' && (
          <div className="mb-8">
            <SmartInventoryUpload saleId={saleId as string} />
          </div>
        )}

        {/* CSV Modal */}
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

        {/* Item List */}
        {itemsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : items && items.length > 0 ? (
          <div className="bg-white rounded-lg overflow-hidden border border-warm-200">
            <div className="p-4 border-b border-warm-200 flex items-center justify-between">
              <h2 className="font-semibold text-warm-900">{items.length} Items</h2>
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
                            if (e.target.checked) {
                              newSet.add(item.id);
                            } else {
                              newSet.delete(item.id);
                            }
                            setSelectedItems(newSet);
                          }}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-warm-900 font-medium">{item.title}</td>
                      <td className="px-4 py-3 text-sm text-warm-600">{item.category}</td>
                      <td className="px-4 py-3 text-sm text-warm-900 font-semibold">${item.price}</td>
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
                      <td className="px-4 py-3 text-sm space-x-2">
                        <Link href={`/organizer/items/${item.id}`}>
                          <a className="text-amber-600 hover:text-amber-700 font-medium">Edit</a>
                        </Link>
                        <button
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                        >
                          Delete
                        </button>
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
                          setBulkPrice('');
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
            <p className="text-warm-600 text-lg">No items added yet. Use the tabs above to get started.</p>
          </div>
        )}
      </main>
    </>
  );
};

export default AddItemsDetailPage;
