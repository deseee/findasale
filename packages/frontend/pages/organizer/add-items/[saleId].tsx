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
    price: '',
    category: '',
    condition: '',
    quantity: '1',
    // B1: Consolidated listing type selector (single source of truth)
    listingType: 'FIXED',
    startingBid: '',
    reservePrice: '',
    reverseDailyDrop: '',
    reverseFloorPrice: '',
  });

  const [formError, setFormError] = useState('');

  // Webcam capture state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<Blob | null>(null);
  const [capturedImageURL, setCapturedImageURL] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Manual photo upload state (Bug 1)
  const [manualPhotoFile, setManualPhotoFile] = useState<File | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Camera photo pre-fill state (Bug 2)
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);
  const [hasAiData, setHasAiData] = useState(false);

  // Form ref for "Save Now" button (Bug 2)
  const formRef = useRef<HTMLFormElement>(null);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      // Set active first so the <video> element renders, then attach stream via useEffect
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
      const uploadFormData = new FormData();
      uploadFormData.append('photos', capturedImage, 'camera-capture.jpg');
      const response = await api.post('/upload/rapid-batch', uploadFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Bug 2: Extract cloudinaryUrl and ai data from response
      const result = response.data.results[0];
      if (result && result.cloudinaryUrl) {
        setPendingPhotoUrl(result.cloudinaryUrl);

        // Pre-fill form with AI data if available
        if (result.ai) {
          setHasAiData(true);
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
    } catch (error) {
      showToast('Failed to upload photo', 'error');
      console.error('Upload error:', error);
    }
  };

  if (!isLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const { data: items, isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['sale-items', saleId],
    queryFn: async () => {
      const response = await api.get(`/items?saleId=${saleId}`);
      return response.data;
    },
    enabled: !!saleId,
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/items/${itemId}`),
    onSuccess: () => {
      showToast('Item deleted', 'success');
      queryClient.invalidateQueries({ queryKey: ['sale-items', saleId] });
    },
    onError: () => showToast('Failed to delete item', 'error'),
  });

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
          ? `Shown ${count} item${count !== 1 ? 's' : ''}`
          : op === 'price'
          ? `Price updated for ${count} item${count !== 1 ? 's' : ''}`
          : '';
      if (message) showToast(message, 'success');
      setSelectedItems(new Set());
      setBulkPrice('');
      queryClient.invalidateQueries({ queryKey: ['sale-items', saleId] });
    },
    onError: () => showToast('Bulk update failed', 'error'),
  });

  const handleToggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.size === (items?.length ?? 0) && items?.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set((items || []).map((item: any) => item.id)));
    }
  };

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/items', data);
      return response.data;
    },
    onSuccess: () => {
      showToast('Item added! Add another or go back to manage items.', 'success');
      // Clear form
      setFormData({
        title: '',
        description: '',
        price: '',
        category: '',
        condition: '',
        quantity: '1',
        listingType: 'FIXED',
        startingBid: '',
        reservePrice: '',
        reverseDailyDrop: '',
        reverseFloorPrice: '',
      });
      setFormError('');
      // Bug 1: Clear manual photo state
      setManualPhotoFile(null);
      setIsUploadingPhoto(false);
      // Bug 2: Clear camera photo state
      setPendingPhotoUrl(null);
      setHasAiData(false);
      queryClient.invalidateQueries({ queryKey: ['sale-items', saleId] });
    },
    onError: (error: any) => {
      const message = error.validationMessage || error.response?.data?.message || 'Failed to add item';
      setFormError(message);
      showToast(message, 'error');
      setIsUploadingPhoto(false);
    },
  });

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target as any;
    if (type === 'checkbox') {
      setFormData((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
    setFormError('');
  };

  const handleSubmitManualItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.title.trim()) {
      setFormError('Title is required');
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
    } else if (formData.listingType === 'REVERSE_AUCTION') {
      payload.price = parseFloat(formData.price);
      payload.reverseAuction = true;
      payload.reverseDailyDrop = Math.round(parseFloat(formData.reverseDailyDrop) * 100); // convert dollars to cents
      payload.reverseFloorPrice = Math.round(parseFloat(formData.reverseFloorPrice) * 100); // convert dollars to cents
      payload.reverseStartDate = new Date().toISOString(); // start immediately
    } else {
      // FIXED pricing
      payload.price = parseFloat(formData.price);
    }

    // Bug 2: Include photo from camera or manual upload
    if (manualPhotoFile && pendingPhotoUrl) {
      // Manual file upload takes priority
      payload.photoUrls = [pendingPhotoUrl];
    } else if (pendingPhotoUrl) {
      payload.photoUrls = [pendingPhotoUrl];
    }

    createItemMutation.mutate(payload);
  };

  if (isLoading || !saleId) {
    return (
      <div className="min-h-screen bg-white py-8">
        <div className="max-w-4xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <Skeleton className="h-12 w-96 mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Add Items - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link href="/organizer/add-items" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to import
          </Link>

          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-warm-900">Add Items</h1>
            <div className="flex gap-2">
              {/* Phase 32: Export inventory as CSV */}
              {items && items.length > 0 && (
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL || ''}/api/organizers/me/export/items/${saleId}`}
                  download
                  className="bg-warm-200 hover:bg-warm-300 text-warm-900 font-bold py-2 px-4 rounded-lg text-sm"
                  onClick={(e) => {
                    // Use api instance (handles auth) with blob responseType for CSV download
                    e.preventDefault();
                    api.get(`/organizers/me/export/items/${saleId}`, { responseType: 'blob' })
                      .then((res) => {
                        const url = URL.createObjectURL(res.data as Blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `items_${saleId}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      })
                      .catch(() => showToast('Export failed. Please try again.', 'error'));
                  }}
                >
                  Export CSV
                </a>
              )}
              <button
                onClick={() => setShowCSVModal(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Import CSV
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-8 border-b border-warm-200">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('manual')}
                className={`pb-4 px-2 font-medium transition-colors ${
                  activeTab === 'manual'
                    ? 'text-amber-600 border-b-2 border-amber-600'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                ✏️ Manual Entry
              </button>
              <button
                onClick={() => setActiveTab('camera')}
                className={`pb-4 px-2 font-medium transition-colors ${
                  activeTab === 'camera'
                    ? 'text-amber-600 border-b-2 border-amber-600'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                📷 Use Camera
              </button>
              <button
                onClick={() => setActiveTab('batch')}
                className={`pb-4 px-2 font-medium transition-colors ${
                  activeTab === 'batch'
                    ? 'text-amber-600 border-b-2 border-amber-600'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                📦 Batch Upload (AI)
              </button>
            </div>
          </div>

          {/* Manual Entry Tab */}
          {activeTab === 'manual' && (
            <div className="mb-8">
              <div className="bg-warm-50 border border-warm-200 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-warm-900 mb-6">Add Single Item</h2>

                {/* Bug 2: Pending photo banner */}
                {pendingPhotoUrl && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                    <span className="text-sm text-amber-800">📷 Photo attached from camera — ready to save</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingPhotoUrl(null);
                        setHasAiData(false);
                      }}
                      className="text-xs text-amber-600 underline"
                    >
                      Remove
                    </button>
                  </div>
                )}

                {formError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
                    {formError}
                  </div>
                )}

                <form ref={formRef} onSubmit={handleSubmitManualItem} className="space-y-4">
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
                      maxLength={100}
                      placeholder="e.g., Vintage Oak Dining Table"
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      disabled={createItemMutation.isPending || isUploadingPhoto}
                    />
                    <p className="text-xs text-warm-600 mt-1">
                      {formData.title.length}/100 characters
                    </p>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-warm-900 mb-1">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleFormChange}
                      maxLength={500}
                      rows={3}
                      placeholder="Add any details about the item..."
                      className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      disabled={createItemMutation.isPending || isUploadingPhoto}
                    />
                    <p className="text-xs text-warm-600 mt-1">
                      {formData.description.length}/500 characters
                    </p>
                  </div>

                  {/* Listing Type Selector */}
                  <div className="space-y-4">
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
                        <option value="AUCTION">Auction / Bidding</option>
                        <option value="REVERSE_AUCTION">Reverse Auction (Price Drops Daily)</option>
                      </select>
                    </div>

                    {/* Price Fields by Listing Type */}
                    <div className="grid grid-cols-2 gap-4">
                      {formData.listingType === 'FIXED' && (
                        <>
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
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                                disabled={createItemMutation.isPending || isUploadingPhoto}
                              />
                            </div>
                          </div>
                          <div />
                        </>
                      )}

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
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                                disabled={createItemMutation.isPending || isUploadingPhoto}
                              />
                            </div>
                            <p className="text-xs text-warm-600 mt-1">Bid must meet or exceed this to win</p>
                          </div>
                        </>
                      )}

                      {formData.listingType === 'REVERSE_AUCTION' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-warm-900 mb-1">
                              Starting Price <span className="text-red-600">*</span>
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
                                placeholder="0.00"
                                className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                                disabled={createItemMutation.isPending || isUploadingPhoto}
                              />
                            </div>
                          </div>
                          <div />
                        </>
                      )}
                    </div>

                    {/* Reverse Auction Controls */}
                    {formData.listingType === 'REVERSE_AUCTION' && (
                      <div className="bg-amber-50 border-l-4 border-amber-600 p-4 rounded space-y-4">
                        <div className="text-sm font-medium text-amber-900">
                          ⬇️ Daily Price Drop Settings
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-warm-900 mb-1">
                              Drop per day <span className="text-red-600">*</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-4 top-2.5 text-warm-600">$</span>
                              <input
                                type="number"
                                name="reverseDailyDrop"
                                value={formData.reverseDailyDrop}
                                onChange={handleFormChange}
                                min="0"
                                step="0.01"
                                placeholder="5.00"
                                className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                                disabled={createItemMutation.isPending || isUploadingPhoto}
                              />
                            </div>
                            <p className="text-xs text-warm-600 mt-1">e.g., $5 per day</p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-warm-900 mb-1">
                              Floor price <span className="text-red-600">*</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-4 top-2.5 text-warm-600">$</span>
                              <input
                                type="number"
                                name="reverseFloorPrice"
                                value={formData.reverseFloorPrice}
                                onChange={handleFormChange}
                                min="0"
                                step="0.01"
                                placeholder="10.00"
                                className="w-full pl-7 pr-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                                disabled={createItemMutation.isPending || isUploadingPhoto}
                              />
                            </div>
                            <p className="text-xs text-warm-600 mt-1">Won't drop below this</p>
                          </div>
                        </div>

                        <p className="text-xs text-amber-700">
                          Price updates automatically every day at 6:00 AM UTC. Shoppers who favorited this item will get notifications when the price drops.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Category & Condition */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-warm-900 mb-1">
                        Category
                      </label>
                      <select
                        name="category"
                        value={formData.category}
                        onChange={handleFormChange}
                        className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        disabled={createItemMutation.isPending || isUploadingPhoto}
                      >
                        <option value="">Select category...</option>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-warm-900 mb-1">
                        Condition
                      </label>
                      <select
                        name="condition"
                        value={formData.condition}
                        onChange={handleFormChange}
                        className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        disabled={createItemMutation.isPending || isUploadingPhoto}
                      >
                        <option value="">Select condition...</option>
                        {CONDITIONS.map((cond) => (
                          <option key={cond} value={cond}>
                            {cond}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="block text-sm font-medium text-warm-900 mb-1">
                      Quantity
                    </label>
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

                    {/* Bug 2: Save Now button (only show when AI data is available) */}
                    {pendingPhotoUrl && hasAiData && (
                      <button
                        type="button"
                        onClick={() => {
                          if (formRef.current) {
                            formRef.current.requestSubmit();
                          }
                        }}
                        disabled={createItemMutation.isPending || isUploadingPhoto}
                        className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed border border-amber-600 text-amber-700 font-bold py-3 px-4 rounded-lg transition-colors"
                      >
                        ⚡ Save Now
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Camera Tab */}
          {activeTab === 'camera' && (
            <div className="mb-8">
              <div className="bg-warm-50 border border-warm-200 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-warm-900 mb-4">Capture Item Photo</h2>

                {!cameraActive && !capturedImageURL && (
                  <button
                    onClick={startCamera}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-lg mb-4"
                  >
                    📷 Start Camera
                  </button>
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
            </h2>

            {/* Bulk Action Toolbar — visible when items are selected */}
            {selectedItems.size > 0 && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex flex-wrap gap-3 items-center">
                  {/* Hide Selected */}
                  <button
                    onClick={() => {
                      bulkUpdateMutation.mutate({
                        itemIds: Array.from(selectedItems),
                        operation: 'isActive',
                        value: false,
                      });
                    }}
                    disabled={bulkUpdateMutation.isPending}
                    className="bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg text-sm"
                  >
                    {bulkUpdateMutation.isPending ? 'Updating...' : 'Hide Selected'}
                  </button>

                  {/* Show Selected */}
                  <button
                    onClick={() => {
                      bulkUpdateMutation.mutate({
                        itemIds: Array.from(selectedItems),
                        operation: 'isActive',
                        value: true,
                      });
                    }}
                    disabled={bulkUpdateMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg text-sm"
                  >
                    {bulkUpdateMutation.isPending ? 'Updating...' : 'Show Selected'}
                  </button>

                  {/* Set Price */}
                  <div className="flex gap-2 items-center">
                    <span className="text-sm font-medium text-warm-900">Set Price:</span>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-warm-600 text-sm">$</span>
                      <input
                        type="number"
                        value={bulkPrice}
                        onChange={(e) => setBulkPrice(e.target.value)}
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="pl-7 pr-3 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm w-24"
                        disabled={bulkUpdateMutation.isPending}
                      />
                    </div>
                    <button
                      onClick={() => {
                        const price = parseFloat(bulkPrice);
                        if (isNaN(price) || price < 0) {
                          showToast('Enter a valid price', 'error');
                          return;
                        }
                        bulkUpdateMutation.mutate({
                          itemIds: Array.from(selectedItems),
                          operation: 'price',
                          value: price,
                        });
                      }}
                      disabled={bulkUpdateMutation.isPending || !bulkPrice}
                      className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg text-sm"
                    >
                      Apply
                    </button>
                  </div>

                  {/* Clear selection */}
                  <button
                    onClick={() => setSelectedItems(new Set())}
                    className="text-sm text-warm-500 hover:text-warm-900 underline ml-auto"
                  >
                    Clear selection
                  </button>
                </div>
              </div>
            )}

            {itemsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : items && items.length > 0 ? (
              <div className="space-y-4">
                {/* Select All header */}
                <div className="flex items-center gap-3 px-4 py-2 bg-warm-100 rounded-lg border border-warm-200">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === items.length && items.length > 0}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedItems.size > 0 && selectedItems.size < items.length;
                    }}
                    onChange={handleSelectAll}
                    className="w-5 h-5 cursor-pointer accent-amber-600"
                  />
                  <span className="text-sm font-medium text-warm-900 select-none">
                    {selectedItems.size === items.length && items.length > 0 ? 'Deselect All' : 'Select All'}
                  </span>
                </div>

                {items.map((item: any) => (
                  <div
                    key={item.id}
                    className={`card p-4 flex justify-between items-center transition-colors ${
                      selectedItems.has(item.id) ? 'bg-amber-50 border-amber-300' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => handleToggleItemSelection(item.id)}
                        className="w-5 h-5 cursor-pointer accent-amber-600 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-warm-900">{item.title}</h3>
                          {item.isActive === false && (
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Hidden</span>
                          )}
                          {item.reverseAuction && (
                            <span className="text-xs text-amber-600">⬇️ Daily drop</span>
                          )}
                        </div>
                        <p className="text-sm text-warm-600 truncate">{item.description}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4 flex-shrink-0">
                      <Link
                        href={`/organizer/edit-item/${item.id}`}
                        className="text-amber-600 hover:underline text-sm"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${item.title}"?`)) {
                            deleteMutation.mutate(item.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="text-red-600 hover:underline text-sm disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-warm-600 text-center py-8">No items added yet. Use the batch upload, manual entry, or import button above to get started.</p>
            )}
          </div>
        </div>
      </div>

      <CSVImportModal
        isOpen={showCSVModal}
        onClose={() => setShowCSVModal(false)}
        saleId={String(saleId)}
        onImportComplete={() => {
          setShowCSVModal(false);
          refetchItems();
        }}
      />
    </>
  );
};

export default AddItemsDetailPage;
