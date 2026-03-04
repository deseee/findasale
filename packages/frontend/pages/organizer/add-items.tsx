import React, { useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import RapidCapture from '../../components/RapidCapture';

interface Sale {
  id: string;
  title: string;
}

interface ItemFormData {
  title: string;
  description: string;
  price: string;
  auctionStartPrice: string;
  bidIncrement: string;
  auctionEndTime: string;
  status: string;
  isAuctionItem: boolean;
  category: string;
  condition: string;
}

interface AIAnalysis {
  title: string;
  description: string;
  category: string;
  condition: string;
  suggestedPrice: number | null;
}

const EMPTY_FORM: ItemFormData = {
  title: '',
  description: '',
  price: '',
  auctionStartPrice: '',
  bidIncrement: '',
  auctionEndTime: '',
  status: 'AVAILABLE',
  isAuctionItem: false,
  category: '',
  condition: '',
};

const AddItemsPage = () => {
  const router = useRouter();
  const { saleId } = router.query;

  const [formData, setFormData] = useState<ItemFormData>(EMPTY_FORM);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  // AI photo scan state
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const [aiError, setAiError] = useState('');
  const aiInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Rapid Capture state ────────────────────────────────────────────────────────────
  const [showRapidCapture, setShowRapidCapture] = useState(false);

  interface BatchItem {
    id: string;
    blob: Blob;
    previewUrl: string;
    status: 'queued' | 'uploading' | 'analyzing' | 'done' | 'error';
    aiResult?: AIAnalysis;
    cloudinaryUrl?: string;
    error?: string;
  }
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Handle photos returned from RapidCapture
  const handleRapidCaptureComplete = useCallback(
    (photos: { blob: Blob; previewUrl: string }[]) => {
      setShowRapidCapture(false);

      // Create batch queue entries
      const items: BatchItem[] = photos.map((p, i) => ({
        id: `batch-${Date.now()}-${i}`,
        blob: p.blob,
        previewUrl: p.previewUrl,
        status: 'queued' as const,
      }));

      setBatchQueue(items);

      // Kick off background processing
      processBatch(items);
    },
    [saleId]
  );

  // Background batch processor — single /rapid-batch call for all photos
  const processBatch = async (items: BatchItem[]) => {
    setBatchProcessing(true);

    // Mark all as uploading
    setBatchQueue((prev) =>
      prev.map((q) => ({ ...q, status: 'uploading' as const }))
    );

    try {
      // Build FormData with all blobs
      const formData = new FormData();
      items.forEach((item, i) => {
        formData.append('photos', item.blob, `capture-${i + 1}.jpg`);
      });

      // Single batch call — Cloudinary upload + AI analysis server-side
      const res = await api.post('/upload/rapid-batch', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: items.length * 45000 + 30000, // generous timeout
      });

      const results: { index: number; cloudinaryUrl: string | null; ai: AIAnalysis | null; error?: string }[] =
        res.data.results || [];

      // Map results back to batch items
      setBatchQueue((prev) =>
        prev.map((q, i) => {
          const result = results.find((r) => r.index === i);
          if (!result) return { ...q, status: 'error' as const, error: 'No result returned' };
          if (result.error) return { ...q, status: 'error' as const, error: result.error };
          return {
            ...q,
            status: 'done' as const,
            cloudinaryUrl: result.cloudinaryUrl || undefined,
            aiResult: result.ai || undefined,
          };
        })
      );
    } catch (err: any) {
      // If the batch call itself fails, fall back to sequential processing
      const msg = err.response?.data?.error || err.message || 'Batch processing failed';
      console.error('Rapid batch failed, falling back to sequential:', msg);
      await processSequential(items);
    }

    setBatchProcessing(false);
  };

  // Fallback: sequential processing if batch endpoint is unavailable
  const processSequential = async (items: BatchItem[]) => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      setBatchQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading' as const } : q))
      );

      try {
        const uploadForm = new FormData();
        uploadForm.append('photos', item.blob, `capture-${i + 1}.jpg`);
        const uploadRes = await api.post('/upload/sale-photos', uploadForm, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const cloudinaryUrl = uploadRes.data.urls?.[0] || '';

        setBatchQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: 'analyzing' as const, cloudinaryUrl } : q
          )
        );

        const aiForm = new FormData();
        aiForm.append('photo', item.blob, `capture-${i + 1}.jpg`);
        const aiRes = await api.post<AIAnalysis>('/upload/analyze-photo', aiForm, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 45000,
        });

        setBatchQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: 'done' as const, aiResult: aiRes.data } : q
          )
        );
      } catch (err: any) {
        const msg = err.response?.data?.error || err.message || 'Processing failed';
        setBatchQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'error' as const, error: msg } : q))
        );
      }
    }
  };

  // Pre-uploaded Cloudinary URLs from batch (skip re-upload on submit)
  const [preUploadedUrls, setPreUploadedUrls] = useState<string[]>([]);

  // Use a batch item to pre-fill the form (one-click item creation)
  const useBatchItem = (item: BatchItem) => {
    if (!item.aiResult) return;

    setFormData({
      ...EMPTY_FORM,
      title: item.aiResult.title || '',
      description: item.aiResult.description || '',
      category: item.aiResult.category?.toLowerCase() || '',
      condition: item.aiResult.condition?.toLowerCase() || '',
      price: item.aiResult.suggestedPrice != null ? String(item.aiResult.suggestedPrice) : '',
    });

    // Set the photo
    if (item.cloudinaryUrl) {
      setPreUploadedUrls([item.cloudinaryUrl]);
      setPhotoFiles([]);
      setPhotoPreviews([item.previewUrl]);
    }

    // Clear the AI scan state since we're using batch
    clearAiScan();

    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Remove a batch item
  const removeBatchItem = (id: string) => {
    setBatchQueue((prev) => {
      const item = prev.find((q) => q.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((q) => q.id !== id);
    });
  };

  const { data: sale, isLoading: saleLoading } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      if (!saleId) throw new Error('No sale ID provided');
      const response = await api.get(`/sales/${saleId}`);
      return response.data as Sale;
    },
    enabled: !!saleId,
  });

  // ── AI Photo Scan ──────────────────────────────────────────────────────────────────

  const handleAiPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiFile(file);
    setAiPreview(URL.createObjectURL(file));
    setAiDone(false);
    setAiError('');

    setAiAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await api.post<AIAnalysis>('/upload/analyze-photo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const ai = res.data;

      // Pre-fill form — only overwrite blank fields so manual edits survive a re-scan
      setFormData(prev => ({
        ...prev,
        title:       prev.title       || ai.title,
        description: prev.description || ai.description,
        category:    prev.category    || ai.category,
        condition:   prev.condition   || ai.condition,
        price:       prev.price       || (ai.suggestedPrice != null ? String(ai.suggestedPrice) : ''),
      }));

      // Also add the AI scan photo to the item photo list
      setPhotoFiles(prev => (prev.length < 5 ? [file, ...prev] : prev));
      setPhotoPreviews(prev => {
        const url = URL.createObjectURL(file);
        return prev.length < 5 ? [url, ...prev] : prev;
      });

      setAiDone(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'AI analysis failed — fill in the form manually.';
      setAiError(msg);
    } finally {
      setAiAnalyzing(false);
    }
  };

  const clearAiScan = () => {
    if (aiPreview) URL.revokeObjectURL(aiPreview);
    setAiFile(null);
    setAiPreview(null);
    setAiDone(false);
    setAiError('');
    if (aiInputRef.current) aiInputRef.current.value = '';
  };

  // ── Item photos (additional) ─────────────────────────────────────────────────────────

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + photoFiles.length > 5) {
      setError('Maximum 5 photos per item');
      return;
    }
    const newPreviews = files.map((f) => URL.createObjectURL(f));
    setPhotoFiles((prev) => [...prev, ...files]);
    setPhotoPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removePhoto = (index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  // ── Form ─────────────────────────────────────────────────────────────────────────

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setPhotoFiles([]);
    setPhotoPreviews([]);
    setPreUploadedUrls([]);
    clearAiScan();
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. Upload photos (skip if pre-uploaded from batch queue)
      let uploadedPhotoUrls: string[] = [...preUploadedUrls];
      if (photoFiles.length > 0) {
        const uploadForm = new FormData();
        photoFiles.forEach((f) => uploadForm.append('photos', f));
        const uploadRes = await api.post('/upload/sale-photos', uploadForm, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploadedPhotoUrls = [...uploadedPhotoUrls, ...uploadRes.data.urls];
      }

      // 2. Create item
      const itemData: any = {
        saleId: saleId as string,
        title: formData.title,
        description: formData.description,
        status: formData.status,
        category: formData.category || null,
        condition: formData.condition || null,
        photoUrls: uploadedPhotoUrls,
      };

      if (formData.isAuctionItem) {
        itemData.auctionStartPrice = parseFloat(formData.auctionStartPrice) || 0;
        itemData.bidIncrement = parseFloat(formData.bidIncrement) || 1;
        itemData.auctionEndTime = formData.auctionEndTime || null;
      } else {
        itemData.price = parseFloat(formData.price) || 0;
      }

      await api.post('/items', itemData);

      setSuccess('Item added!');
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create item. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (saleLoading) return <div className="min-h-screen flex items-center justify-center">Loading sale details...</div>;
  if (!sale && saleId) return <div className="min-h-screen flex items-center justify-center">Sale not found</div>;

  return (
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>Add Items - FindA.Sale</title>
        <meta name="description" content="Add items to your sale" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-warm-900">Add Items to &ldquo;{sale?.title}&rdquo;</h1>
          <Link
            href="/organizer/dashboard"
            className="bg-warm-500 hover:bg-warm-600 text-white font-bold py-2 px-4 rounded"
          >
            Back to Dashboard
          </Link>
        </div>

        {/* ── Rapid Capture Overlay ──────────────────────────────── */}
        {showRapidCapture && (
          <RapidCapture
            onComplete={handleRapidCaptureComplete}
            onCancel={() => setShowRapidCapture(false)}
            maxPhotos={20}
          />
        )}

        {/* ── Batch Processing Queue ─────────────────────────────── */}
        {batchQueue.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 max-w-3xl mx-auto mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-warm-900">
                Rapid Capture Queue
                {batchProcessing && (
                  <span className="ml-2 text-sm font-normal text-warm-500">Processing...</span>
                )}
              </h2>
              <span className="text-sm text-warm-500">
                {batchQueue.filter((q) => q.status === 'done').length} / {batchQueue.length} ready
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {batchQueue.map((item) => (
                <div
                  key={item.id}
                  className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                    item.status === 'done'
                      ? 'border-green-400 cursor-pointer hover:border-green-500'
                      : item.status === 'error'
                        ? 'border-red-400'
                        : 'border-warm-200'
                  }`}
                  onClick={() => item.status === 'done' && useBatchItem(item)}
                >
                  <img
                    src={item.previewUrl}
                    alt="Captured item"
                    className="w-full h-24 object-cover"
                  />
                  {/* Status overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    {item.status === 'uploading' && (
                      <div className="bg-black/60 rounded-full px-2 py-1">
                        <span className="text-white text-xs">Uploading...</span>
                      </div>
                    )}
                    {item.status === 'analyzing' && (
                      <div className="bg-black/60 rounded-full px-2 py-1">
                        <span className="text-white text-xs flex items-center gap-1">
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          AI...
                        </span>
                      </div>
                    )}
                    {item.status === 'done' && (
                      <div className="bg-green-600/80 rounded-full px-2 py-1">
                        <span className="text-white text-xs font-medium">✓ Tap to use</span>
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div className="bg-red-600/80 rounded-full px-2 py-1">
                        <span className="text-white text-xs">Failed</span>
                      </div>
                    )}
                  </div>
                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeBatchItem(item.id); }}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                  {/* AI result preview */}
                  {item.status === 'done' && item.aiResult && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                      <p className="text-white text-[10px] truncate">{item.aiResult.title}</p>
                      {item.aiResult.suggestedPrice != null && (
                        <p className="text-amber-400 text-[10px] font-bold">
                          ${item.aiResult.suggestedPrice.toFixed(2)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-warm-400">
              Tap a green card to pre-fill the form below. AI fills title, description, category, condition &amp; price.
            </p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 max-w-3xl mx-auto">

          {/* ── Rapid Capture Button ────────────────────────────────── */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowRapidCapture(true)}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 text-white font-bold text-lg shadow-md hover:shadow-lg transition-shadow flex items-center justify-center gap-3"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              Rapid Capture — Photograph Items Fast
            </button>
            <p className="text-center text-xs text-warm-400 mt-2">
              Opens full-screen camera. Snap up to 20 items, AI fills details in background.
            </p>
          </div>

          <hr className="border-warm-200 mb-6" />

          {/* ── AI Photo Scan ───────────────────────────────────────── */}
          <div className="mb-8">
            <p className="text-sm font-semibold text-warm-700 mb-2">
              ✨ AI Photo Scan{' '}
              <span className="font-normal text-warm-400">— snap a photo to auto-fill the form</span>
            </p>

            {!aiPreview ? (
              <div
                className="border-2 border-dashed border-indigo-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                onClick={() => aiInputRef.current?.click()}
              >
                <div className="text-4xl mb-2">📷</div>
                <p className="text-sm font-medium text-indigo-700">Tap to scan an item photo</p>
                <p className="text-xs text-warm-400 mt-1">AI will fill in title, description, category, condition &amp; price</p>
                <input
                  ref={aiInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleAiPhotoSelect}
                />
              </div>
            ) : (
              <div className="flex items-start gap-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50">
                <img
                  src={aiPreview}
                  alt="AI scan"
                  className="w-20 h-20 object-cover rounded-lg border border-indigo-200 flex-shrink-0"
                 loading="lazy"/>
                <div className="flex-1 min-w-0">
                  {aiAnalyzing && (
                    <div className="flex items-center gap-2 text-indigo-700 text-sm font-medium">
                      <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Analyzing with qwen3-vl…
                    </div>
                  )}
                  {aiDone && (
                    <p className="text-sm font-medium text-green-700">
                      ✅ Form pre-filled — review and edit before saving
                    </p>
                  )}
                  {aiError && (
                    <p className="text-sm text-red-600">{aiError}</p>
                  )}
                  <button
                    type="button"
                    onClick={clearAiScan}
                    className="mt-2 text-xs text-warm-500 hover:text-red-600 underline"
                  >
                    Clear scan
                  </button>
                </div>
              </div>
            )}
          </div>

          <hr className="border-warm-200 mb-6" />

          {error && (
            <div className="rounded-md bg-red-50 p-4 mb-6">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 p-4 mb-6">
              <div className="text-sm text-green-700">{success}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-warm-700 mb-1">
                Item Title
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-warm-900 bg-white"
                placeholder="e.g. Victorian Wooden Secretary Desk"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-warm-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-warm-900 bg-white"
                placeholder="Describe the item, condition, special features, etc."
              />
            </div>

            <div className="flex items-center mb-4">
              <input
                id="isAuctionItem"
                name="isAuctionItem"
                type="checkbox"
                checked={formData.isAuctionItem}
                onChange={handleChange}
                className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-warm-300 rounded"
              />
              <label htmlFor="isAuctionItem" className="ml-2 block text-sm text-warm-900">
                This is an auction item
              </label>
            </div>

            {!formData.isAuctionItem ? (
              <div>
                <label htmlFor="price" className="block text-sm font-medium text-warm-700 mb-1">
                  Price ($)
                </label>
                <input
                  type="number"
                  id="price"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-warm-900 bg-white"
                  placeholder="0.00"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="auctionStartPrice" className="block text-sm font-medium text-warm-700 mb-1">
                    Starting Price ($)
                  </label>
                  <input
                    type="number"
                    id="auctionStartPrice"
                    name="auctionStartPrice"
                    value={formData.auctionStartPrice}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-warm-900 bg-white"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label htmlFor="bidIncrement" className="block text-sm font-medium text-warm-700 mb-1">
                    Bid Increment ($)
                  </label>
                  <input
                    type="number"
                    id="bidIncrement"
                    name="bidIncrement"
                    value={formData.bidIncrement}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-warm-900 bg-white"
                    placeholder="1.00"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="auctionEndTime" className="block text-sm font-medium text-warm-700 mb-1">
                    Auction End Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    id="auctionEndTime"
                    name="auctionEndTime"
                    value={formData.auctionEndTime}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-warm-900 bg-white"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-warm-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-warm-900 bg-white"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="SOLD">Sold</option>
                  <option value="RESERVED">Reserved</option>
                  <option value="AUCTION_ENDED">Auction Ended</option>
                </select>
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-warm-700 mb-1">
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-warm-900 bg-white"
                >
                  <option value="">Select category…</option>
                  <option value="furniture">Furniture</option>
                  <option value="decor">Decor &amp; Home</option>
                  <option value="vintage">Vintage &amp; Antiques</option>
                  <option value="textiles">Textiles &amp; Clothing</option>
                  <option value="collectibles">Collectibles</option>
                  <option value="art">Art &amp; Prints</option>
                  <option value="jewelry">Jewelry &amp; Accessories</option>
                  <option value="books">Books &amp; Media</option>
                  <option value="tools">Tools &amp; Hardware</option>
                  <option value="electronics">Electronics</option>
                  <option value="sports">Sports &amp; Outdoor</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="condition" className="block text-sm font-medium text-warm-700 mb-1">
                  Condition
                </label>
                <select
                  id="condition"
                  name="condition"
                  value={formData.condition}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-warm-900 bg-white"
                >
                  <option value="">Select condition…</option>
                  <option value="mint">Mint / New</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor / For Parts</option>
                </select>
              </div>
            </div>

            {/* Additional photos */}
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                Additional Photos{' '}
                <span className="text-warm-400 font-normal">(up to 5 total)</span>
              </label>
              <div
                className="border-2 border-dashed border-warm-300 rounded-lg p-5 text-center cursor-pointer hover:border-amber-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-warm-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-warm-500">Click to upload more photos</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
              {photoPreviews.length > 0 && (
                <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {photoPreviews.map((src, i) => (
                    <div key={i} className="relative group">
                      <img src={src} alt={`Item photo preview ${i + 1}`} className="w-full h-16 object-cover rounded border border-warm-200"  loading="lazy"/>
                      {i === 0 && aiFile && photoFiles[0] === aiFile && (
                        <span className="absolute bottom-0.5 left-0.5 bg-indigo-600 text-white text-xs px-1 rounded">AI</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-4 pt-4">
              <Link
                href="/organizer/dashboard"
                className="bg-warm-500 hover:bg-warm-600 text-white font-bold py-2 px-4 rounded"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading || aiAnalyzing}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {loading ? 'Adding…' : 'Add Item'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default AddItemsPage;
