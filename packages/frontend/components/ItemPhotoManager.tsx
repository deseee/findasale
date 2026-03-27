/**
 * ItemPhotoManager — Phase 16: Advanced photo pipeline
 *
 * Organizer-facing component for managing photos on an item:
 * - Upload new photos (via /api/upload/item-photo → /api/items/:id/photos)
 * - Remove individual photos
 * - Reorder photos (first = cover photo shown on item cards)
 */

import React, { useState, useRef } from 'react';
import api from '../lib/api';
import { getThumbnailUrl } from '../lib/imageUtils';

interface ItemPhotoManagerProps {
  itemId: string;
  initialPhotos: string[];
  onPhotosChange?: (photos: string[]) => void;
}

const ItemPhotoManager: React.FC<ItemPhotoManagerProps> = ({
  itemId,
  initialPhotos,
  onPhotosChange,
}) => {
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncPhotos = (newPhotos: string[]) => {
    setPhotos(newPhotos);
    onPhotosChange?.(newPhotos);
  };

  const MAX_FILE_SIZE_MB = 5;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Client-side file size validation
    const oversized = Array.from(files).filter((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized.length > 0) {
      setError(`Photos must be under ${MAX_FILE_SIZE_MB}MB. ${oversized.map((f) => f.name).join(', ')} ${oversized.length === 1 ? 'is' : 'are'} too large.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setError('');
    try {
      let currentPhotos = photos;
      for (const file of Array.from(files)) {
        // Step 1: Upload to Cloudinary via the existing upload endpoint
        const formData = new FormData();
        // Field name must match upload.single('photo') on POST /api/upload/item-photo.
        // 'image' caused Multer "Unexpected field" error — backend expects 'photo'.
        formData.append('photo', file);
        const uploadRes = await api.post('/upload/item-photo', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const url: string = uploadRes.data.url;

        // Step 2: Append URL to the item's photoUrls array
        const addRes = await api.post(`/items/${itemId}/photos`, { url });
        currentPhotos = addRes.data.photoUrls;
      }
      syncPhotos(currentPhotos);
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      setError(serverMsg ? `Upload failed: ${serverMsg}` : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-uploaded if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (index: number) => {
    setError('');
    try {
      const res = await api.delete(`/items/${itemId}/photos/${index}`);
      syncPhotos(res.data.photoUrls);
    } catch {
      setError('Failed to remove photo. Please try again.');
    }
  };

  const handleMove = async (index: number, direction: 'prev' | 'next') => {
    const swapIdx = direction === 'prev' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= photos.length) return;
    setError('');
    try {
      const newPhotos = [...photos];
      [newPhotos[index], newPhotos[swapIdx]] = [newPhotos[swapIdx], newPhotos[index]];
      const res = await api.patch(`/items/${itemId}/photos/reorder`, { photoUrls: newPhotos });
      syncPhotos(res.data.photoUrls);
    } catch {
      setError('Failed to reorder photos. Please try again.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium text-warm-700">
          Photos <span className="text-warm-400 font-normal">({photos.length})</span>
        </label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-sm bg-amber-600 hover:bg-amber-700 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          {uploading ? 'Uploading\u2026' : '+ Add Photos'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {error && (
        <p className="text-red-500 text-sm mb-3">{error}</p>
      )}

      {photos.length === 0 ? (
        <div
          role="button"
          tabIndex={0}
          className="border-2 border-dashed border-warm-300 rounded-lg p-8 text-center cursor-pointer hover:border-amber-400 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        >
          <p className="text-warm-500 text-sm">No photos yet \u2014 click to upload</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((url, i) => (
            <div key={`${url}-${i}`} className="relative group rounded-lg overflow-hidden border border-warm-200">
              <img
                src={getThumbnailUrl(url) || url}
                alt={`Item photo ${i + 1}`}
                className="w-full aspect-square object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />

              {/* Cover badge on first photo */}
              {i === 0 && (
                <span className="absolute top-1 left-1 bg-amber-600 text-white text-xs px-1.5 py-0.5 rounded font-semibold pointer-events-none">
                  Cover
                </span>
              )}

              {/* Delete button — top-right, shows on hover */}
              <button
                type="button"
                onClick={() => handleDelete(i)}
                className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                aria-label={`Remove photo ${i + 1}`}
              >
                ×
              </button>

              {/* Reorder arrows \u2014 bottom, shows on hover */}
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => handleMove(i, 'prev')}
                    className="bg-black/60 hover:bg-black/80 text-white rounded w-6 h-6 flex items-center justify-center text-xs focus:opacity-100"
                    aria-label="Move photo left"
                  >
                    \u2190
                  </button>
                )}
                {i < photos.length - 1 && (
                  <button
                    type="button"
                    onClick={() => handleMove(i, 'next')}
                    className="bg-black/60 hover:bg-black/80 text-white rounded w-6 h-6 flex items-center justify-center text-xs focus:opacity-100"
                    aria-label="Move photo right"
                  >
                    \u2192
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-warm-400 mt-2">
        First photo is the cover shown on item cards. Hover a photo to reorder or delete.
      </p>
    </div>
  );
};

export default ItemPhotoManager;
