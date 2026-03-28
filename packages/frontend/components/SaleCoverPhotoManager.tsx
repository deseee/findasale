/**
 * SaleCoverPhotoManager
 *
 * Organizer-facing component for managing a single cover photo on a sale:
 * - Upload a new cover photo
 * - View current cover photo (if set)
 * - Remove the cover photo
 * - Max 5MB file size
 *
 * Simpler than ItemPhotoManager — handles only a single photo (no reordering).
 */

import React, { useState, useRef } from 'react';
import api from '../lib/api';
import { getThumbnailUrl } from '../lib/imageUtils';

interface SaleCoverPhotoManagerProps {
  saleId: string;
  initialPhotoUrl?: string;
  onPhotoChange?: (url: string | undefined) => void;
}

const SaleCoverPhotoManager: React.FC<SaleCoverPhotoManagerProps> = ({
  saleId,
  initialPhotoUrl,
  onPhotoChange,
}) => {
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(initialPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE_MB = 5;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];

    // Client-side file size validation
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`Photo must be under ${MAX_FILE_SIZE_MB}MB. ${file.name} is too large.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setError('');
    try {
      // Step 1: Upload to Cloudinary via the existing upload endpoint
      const formData = new FormData();
      formData.append('photo', file);
      const uploadRes = await api.post('/upload/item-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url: string = uploadRes.data.url;

      // Step 2: Update the sale with the new cover photo URL
      // We store the cover photo as the first (and only) element in photoUrls array
      await api.put(`/sales/${saleId}`, { photoUrls: [url] });

      setPhotoUrl(url);
      onPhotoChange?.(url);
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      setError(serverMsg ? `Upload failed: ${serverMsg}` : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setError('');
    try {
      // Clear photoUrls by sending empty array
      await api.put(`/sales/${saleId}`, { photoUrls: [] });
      setPhotoUrl(undefined);
      onPhotoChange?.(undefined);
    } catch {
      setError('Failed to remove photo. Please try again.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <label className="block text-sm font-medium text-warm-700 dark:text-gray-300">
          Sale Cover Photo
        </label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-sm bg-amber-600 hover:bg-amber-700 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          {uploading ? 'Uploading…' : (photoUrl ? 'Change Photo' : '+ Upload Photo')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {error && (
        <p className="text-red-500 text-sm mb-3">{error}</p>
      )}

      {photoUrl ? (
        <div className="relative group rounded-lg overflow-hidden border border-warm-200 dark:border-gray-600 max-w-sm">
          <img
            src={getThumbnailUrl(photoUrl) || photoUrl}
            alt="Sale cover photo"
            className="w-full aspect-video object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
            aria-label="Remove cover photo"
          >
            ×
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          className="border-2 border-dashed border-warm-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-amber-400 dark:hover:border-amber-500 transition-colors max-w-sm"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        >
          <p className="text-warm-500 dark:text-gray-400 text-sm">Click to upload a cover photo</p>
          <p className="text-xs text-warm-400 dark:text-gray-500 mt-1">JPG, PNG, WebP • Max 5MB</p>
        </div>
      )}

      <p className="text-xs text-warm-400 dark:text-gray-500 mt-2">
        This photo is displayed as the sale thumbnail on shopping pages and search results.
      </p>
    </div>
  );
};

export default SaleCoverPhotoManager;
