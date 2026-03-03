import React, { useState, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';

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

  const { data: sale, isLoading: saleLoading } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      if (!saleId) throw new Error('No sale ID provided');
      const response = await api.get(`/sales/${saleId}`);
      return response.data as Sale;
    },
    enabled: !!saleId,
  });

  // ── AI Photo Scan ──────────────────────────────────────────────────────────

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

  // ── Item photos (additional) ───────────────────────────────────────────────

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

  // ── Form ───────────────────────────────────────────────────────────────────

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setPhotoFiles([]);
    setPhotoPreviews([]);
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
      // 1. Upload photos
      let uploadedPhotoUrls: string[] = [];
      if (photoFiles.length > 0) {
        const uploadForm = new FormData();
        photoFiles.forEach((f) => uploadForm.append('photos', f));
        const uploadRes = await api.post('/upload/sale-photos', uploadForm, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploadedPhotoUrls = uploadRes.data.urls;
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
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Add Items - FindA.Sale</title>
        <meta name="description" content="Add items to your sale" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Add Items to &ldquo;{sale?.title}&rdquo;</h1>
          <Link
            href="/organizer/dashboard"
            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 max-w-3xl mx-auto">

          {/* ── AI Photo Scan ─────────────────────────────────────────── */}
          <div className="mb-8">
            <p className="text-sm font-semibold text-gray-700 mb-2">
              ✨ AI Photo Scan{' '}
              <span className="font-normal text-gray-400">— snap a photo to auto-fill the form</span>
            </p>

            {!aiPreview ? (
              <div
                className="border-2 border-dashed border-indigo-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                onClick={() => aiInputRef.current?.click()}
              >
                <div className="text-4xl mb-2">📷</div>
                <p className="text-sm font-medium text-indigo-700">Tap to scan an item photo</p>
                <p className="text-xs text-gray-400 mt-1">AI will fill in title, description, category, condition &amp; price</p>
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
                />
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
                    className="mt-2 text-xs text-gray-500 hover:text-red-600 underline"
                  >
                    Clear scan
                  </button>
                </div>
              </div>
            )}
          </div>

          <hr className="border-gray-200 mb-6" />

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
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                Item Title
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                placeholder="e.g. Victorian Wooden Secretary Desk"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isAuctionItem" className="ml-2 block text-sm text-gray-900">
                This is an auction item
              </label>
            </div>

            {!formData.isAuctionItem ? (
              <div>
                <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  placeholder="0.00"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="auctionStartPrice" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label htmlFor="bidIncrement" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    placeholder="1.00"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="auctionEndTime" className="block text-sm font-medium text-gray-700 mb-1">
                    Auction End Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    id="auctionEndTime"
                    name="auctionEndTime"
                    value={formData.auctionEndTime}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="SOLD">Sold</option>
                  <option value="RESERVED">Reserved</option>
                  <option value="AUCTION_ENDED">Auction Ended</option>
                </select>
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
                <label htmlFor="condition" className="block text-sm font-medium text-gray-700 mb-1">
                  Condition
                </label>
                <select
                  id="condition"
                  name="condition"
                  value={formData.condition}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Photos{' '}
                <span className="text-gray-400 font-normal">(up to 5 total)</span>
              </label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-500">Click to upload more photos</p>
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
                      <img src={src} alt={`Item photo preview ${i + 1}`} className="w-full h-16 object-cover rounded border border-gray-200" />
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
                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading || aiAnalyzing}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
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
