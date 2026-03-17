import React from 'react';
import { UGCPhoto } from '../hooks/useUGCPhotos';

interface UGCPhotoGalleryProps {
  photos: UGCPhoto[];
  onLike?: (photoId: number) => void;
  onUnlike?: (photoId: number) => void;
  loading?: boolean;
}

export default function UGCPhotoGallery({
  photos,
  onLike,
  onUnlike,
  loading = false,
}: UGCPhotoGalleryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-gray-200 rounded-lg h-64 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!photos || photos.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <p className="text-gray-500 text-lg">No photos yet</p>
        <p className="text-gray-400 text-sm mt-1">
          Be the first to tag your find and share it with the community!
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {photos.map((photo) => (
        <div
          key={photo.id}
          className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow"
        >
          {/* Photo Image */}
          <div className="relative w-full h-48 bg-gray-200 overflow-hidden">
            <img
              src={photo.photoUrl}
              alt={photo.caption || 'UGC Photo'}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Caption */}
            {photo.caption && (
              <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                {photo.caption}
              </p>
            )}

            {/* Tags */}
            {photo.tags && photo.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {photo.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-block bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full"
                    style={{ backgroundColor: '#e0f2f1', color: '#00695c' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Like Button */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  if (onLike) onLike(photo.id);
                }}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-500 transition-colors"
              >
                <span>❤️</span>
                <span>{photo.likesCount}</span>
              </button>

              {/* Attribution */}
              <p className="text-xs text-gray-400">
                Tagged by {photo.user?.name || 'Anonymous'}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
