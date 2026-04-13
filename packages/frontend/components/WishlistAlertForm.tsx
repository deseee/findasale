/**
 * Feature #32: Wishlist Alert Form Component
 *
 * Modal form to create/edit wishlist alerts with:
 * - Alert name (text input)
 * - Keywords (multi-tag style text input)
 * - Categories (checkboxes)
 * - Price range (number inputs)
 * - Radius slider (1-50 miles)
 *
 * Sage green (#8FB897) submit button
 */

import React, { useState, useEffect } from 'react';
import { useCreateAlert, useUpdateAlert } from '@/hooks/useWishlistAlerts';

interface WishlistAlertFormProps {
  isOpen: boolean;
  onClose: () => void;
  alertId?: string;
  initialData?: {
    name: string;
    q?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    radiusMiles?: number;
    lat?: number;
    lng?: number;
    tags?: string[];
  };
}

const CATEGORIES = ['furniture', 'decor', 'vintage', 'textiles', 'collectibles', 'art', 'antiques', 'jewelry', 'books', 'tools', 'electronics', 'clothing', 'home', 'other'];

export default function WishlistAlertForm({ isOpen, onClose, alertId, initialData }: WishlistAlertFormProps) {
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [radius, setRadius] = useState(50);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();

  // Initialize form with existing data
  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setKeywords(initialData.q || '');
      setSelectedCategories(initialData.category ? [initialData.category] : []);
      setMinPrice(initialData.minPrice?.toString() || '');
      setMaxPrice(initialData.maxPrice?.toString() || '');
      setRadius(initialData.radiusMiles || 50);
      setTags(initialData.tags || []);
    } else {
      setName('');
      setKeywords('');
      setSelectedCategories([]);
      setMinPrice('');
      setMaxPrice('');
      setRadius(50);
      setTags([]);
    }
  }, [initialData, isOpen]);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleToggleCategory = (category: string) => {
    setSelectedCategories(
      selectedCategories.includes(category)
        ? selectedCategories.filter((c) => c !== category)
        : [category] // Single category for now
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      name,
      q: keywords || undefined,
      category: selectedCategories[0] || undefined,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      radiusMiles: radius,
      tags: tags.length > 0 ? tags : undefined,
    };

    try {
      if (alertId) {
        await updateAlert.mutateAsync({ id: alertId, ...input });
      } else {
        await createAlert.mutateAsync(input);
      }
      onClose();
    } catch (error) {
      console.error('Error saving alert:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative w-full max-w-lg rounded-lg bg-white p-8 shadow-lg">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>

        <h2 className="mb-6 text-2xl font-bold text-gray-900">
          {alertId ? 'Edit Alert' : 'Create Wishlist Alert'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Alert Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Alert Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Mid-Century Furniture Under $200"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#8fb897]"
              required
            />
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Keywords (Search Terms)
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g., sofa, vintage, oak"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#8fb897]"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add a tag and press Enter"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#8fb897]"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-4 py-2 rounded-lg bg-[#8fb897] text-white font-medium hover:bg-[#7ba680]"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-2 bg-[#f0fdf4] text-[#166534] px-3 py-1 rounded-full text-sm"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-xs font-bold hover:text-red-600"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <div className="grid grid-cols-3 gap-3">
              {CATEGORIES.map((cat) => (
                <label key={cat} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(cat)}
                    onChange={() => handleToggleCategory(cat)}
                    className="rounded border-gray-300 text-[#8fb897] focus:ring-[#8fb897]"
                  />
                  <span className="text-sm text-gray-700 capitalize">{cat}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Min Price ($)
              </label>
              <input
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#8fb897]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Price ($)
              </label>
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="999999"
                min="0"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#8fb897]"
              />
            </div>
          </div>

          {/* Radius Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Radius: {radius} miles
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#8fb897]"
            />
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createAlert.isPending || updateAlert.isPending}
              className="flex-1 rounded-lg bg-[#8fb897] text-white px-4 py-2 font-medium hover:bg-[#7ba680] disabled:opacity-50"
            >
              {createAlert.isPending || updateAlert.isPending
                ? 'Saving...'
                : alertId ? 'Update Alert' : 'Create Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
