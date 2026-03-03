import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';

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

// Map tagger category prefixes to form select values
const TAGGER_CATEGORY_MAP: Record<string, string> = {
  furniture:    'furniture',
  styles:       'vintage',
  materials:    'other',
  jewelry:      'jewelry',
  art:          'art',
  collectibles: 'collectibles',
  lighting:     'decor',
  textiles:     'textiles',
};

function bestCategoryFromTags(tags: string[]): string {
  for (const tag of tags) {
    const prefix = tag.split(':')[0]?.trim().toLowerCase();
    if (prefix && TAGGER_CATEGORY_MAP[prefix]) return TAGGER_CATEGORY_MAP[prefix];
  }
  return '';
}

// Helper to safely parse date for datetime-local input
const formatDateForInput = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
};

// Helper function to convert datetime-local value to ISO string
const toISOStringFromDatetimeLocal = (value: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    console.error('Invalid date value:', value);
    return undefined;
  }
  return date.toISOString();
};

const EditItemPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [formData, setFormData] = useState<ItemFormData>({
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
  });
  const [photoUrls, setPhotoUrls] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // AI tag suggestion state
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');

  // Fetch item data
  const { data: item, isLoading } = useQuery({
    queryKey: ['item', id],
    queryFn: async () => {
      if (!id) throw new Error('No item ID provided');
      const response = await api.get(`/items/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Populate form when item data is loaded
  useEffect(() => {
    if (item) {
      setFormData({
        title: item.title,
        description: item.description || '',
        price: item.price ? item.price.toString() : '',
        auctionStartPrice: item.auctionStartPrice ? item.auctionStartPrice.toString() : '',
        bidIncrement: item.bidIncrement ? item.bidIncrement.toString() : '1',
        auctionEndTime: formatDateForInput(item.auctionEndTime),
        status: item.status,
        isAuctionItem: !!item.auctionStartPrice,
        category: item.category || '',
        condition: item.condition || '',
      });
      setPhotoUrls(item.photoUrls && item.photoUrls.length > 0 ? item.photoUrls : ['']);
    }
  }, [item]);

  const handlePhotoUrlChange = (index: number, value: string) => {
    const newPhotoUrls = [...photoUrls];
    newPhotoUrls[index] = value;
    setPhotoUrls(newPhotoUrls);
  };

  const addPhotoUrlField = () => {
    setPhotoUrls([...photoUrls, '']);
  };

  const removePhotoUrlField = (index: number) => {
    if (photoUrls.length > 1) {
      const newPhotoUrls = photoUrls.filter((_, i) => i !== index);
      setPhotoUrls(newPhotoUrls);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({
      ...prev,
      [name]: val
    }));
    // Clear suggestions if category is manually set
    if (name === 'category') setSuggestedTags([]);
  };

  const handleAnalyzeTags = async () => {
    if (!id) return;
    setAnalyzing(true);
    setAnalyzeError('');
    setSuggestedTags([]);
    try {
      const response = await api.post(`/items/${id}/analyze`);
      const tags: string[] = response.data?.suggestedTags ?? [];
      if (tags.length > 0) {
        setSuggestedTags(tags);
      } else {
        setAnalyzeError('No tags found for this photo. Try adding a clearer image.');
      }
    } catch {
      setAnalyzeError('AI tagging unavailable right now. You can set the category manually.');
    } finally {
      setAnalyzing(false);
    }
  };

  const acceptSuggestedCategory = () => {
    const category = bestCategoryFromTags(suggestedTags);
    if (category) {
      setFormData(prev => ({ ...prev, category }));
    }
    setSuggestedTags([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const itemData: Record<string, any> = {
        title: formData.title,
        description: formData.description,
        status: formData.status,
        category: formData.category || null,
        condition: formData.condition || null,
        photoUrls: photoUrls.filter(url => url.trim() !== ''),
      };

      if (formData.isAuctionItem) {
        if (formData.auctionStartPrice) {
          itemData.auctionStartPrice = parseFloat(formData.auctionStartPrice);
        }
        if (formData.bidIncrement) {
          itemData.bidIncrement = parseFloat(formData.bidIncrement);
        }
        const isoDate = toISOStringFromDatetimeLocal(formData.auctionEndTime);
        if (isoDate) {
          itemData.auctionEndTime = isoDate;
        }
      } else {
        if (formData.price) {
          itemData.price = parseFloat(formData.price);
        }
      }

      Object.keys(itemData).forEach(key => {
        if (itemData[key] === undefined || itemData[key] === null) {
          delete itemData[key];
        }
      });

      const response = await api.put(`/items/${id}`, itemData);

      setSuccess('Item updated successfully!');

      setTimeout(() => {
        router.push(`/sales/${response.data.saleId}`);
      }, 1500);
    } catch (err: any) {
      console.error('Error updating item:', err);
      setError(err.response?.data?.message || 'Failed to update item. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const hasPhotos = photoUrls.some(u => u.trim() !== '');
  const bestCategory = bestCategoryFromTags(suggestedTags);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading item details...</div>;
  if (!item && id) return <div className="min-h-screen flex items-center justify-center">Item not found</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Edit Item - FindA.Sale</title>
        <meta name="description" content="Edit your item" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Edit Item</h1>
          <Link
            href={item ? `/sales/${item.saleId}` : '/organizer/dashboard'}
            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
          >
            Back to Sale
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 max-w-3xl mx-auto">
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

          {/* AI Tag Suggestion Banner */}
          {suggestedTags.length > 0 && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-4 mb-6">
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-semibold text-blue-800">
                  ✨ AI-suggested tags
                </p>
                <button
                  type="button"
                  onClick={() => setSuggestedTags([])}
                  className="text-blue-400 hover:text-blue-600 text-xs ml-4"
                >
                  Dismiss
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {suggestedTags.map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {bestCategory && (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-blue-700">
                    Best match: <strong className="capitalize">{bestCategory}</strong>
                  </p>
                  <button
                    type="button"
                    onClick={acceptSuggestedCategory}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium py-1 px-3 rounded"
                  >
                    Apply category
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestedTags([])}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    Skip
                  </button>
                </div>
              )}
            </div>
          )}

          {analyzeError && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 mb-4">
              <p className="text-xs text-yellow-700">{analyzeError}</p>
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
                  Category (Optional)
                  {hasPhotos && !formData.category && (
                    <button
                      type="button"
                      onClick={handleAnalyzeTags}
                      disabled={analyzing}
                      className="ml-2 text-xs text-blue-600 hover:text-blue-800 font-normal underline disabled:opacity-50"
                    >
                      {analyzing ? 'Analyzing…' : '✨ AI suggest'}
                    </button>
                  )}
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="">Select a category...</option>
                  <option value="furniture">Furniture</option>
                  <option value="decor">Decor & Home</option>
                  <option value="vintage">Vintage & Antiques</option>
                  <option value="textiles">Textiles & Clothing</option>
                  <option value="collectibles">Collectibles</option>
                  <option value="art">Art & Prints</option>
                  <option value="jewelry">Jewelry & Accessories</option>
                  <option value="books">Books & Media</option>
                  <option value="tools">Tools & Hardware</option>
                  <option value="electronics">Electronics</option>
                  <option value="sports">Sports & Outdoor</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="condition" className="block text-sm font-medium text-gray-700 mb-1">
                  Condition (Optional)
                </label>
                <select
                  id="condition"
                  name="condition"
                  value={formData.condition}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="">Select condition...</option>
                  <option value="mint">Mint / New</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor / For Parts</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Photo URLs
              </label>
              {photoUrls.map((url, index) => (
                <div key={index} className="flex mb-2">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => handlePhotoUrlChange(index, e.target.value)}
                    className="flex-grow px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    placeholder="https://example.com/photo.jpg"
                  />
                  {photoUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePhotoUrlField(index)}
                      className="bg-red-500 hover:bg-red-600 text-white px-3 rounded-r-md"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addPhotoUrlField}
                className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                + Add another photo URL
              </button>
            </div>

            <div className="flex justify-end space-x-4 pt-4">
              <Link
                href={item ? `/sales/${item.saleId}` : '/organizer/dashboard'}
                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update Item'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default EditItemPage;
