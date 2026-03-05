import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getFullUrl } from '../lib/imageUtils';

interface PhotoLightboxProps {
  /** Array of original photo URLs */
  photos: string[];
  /** Index of the photo to show on mount */
  initialIndex?: number;
  /** Called when the user dismisses the lightbox */
  onClose: () => void;
}

/**
 * Phase 18 — Photo preview lightbox.
 *
 * Features:
 *  - Full-screen backdrop; click outside image to close
 *  - Prev / Next arrows (hidden for single-photo sets)
 *  - Keyboard: Escape = close, ArrowLeft/Right = navigate
 *  - Touch swipe (≥50px horizontal delta triggers navigate)
 *  - Dot indicators for ≤10 photos; numeric counter for all sets
 *  - Uses getFullUrl (1600w WebP) for Cloudinary images; falls back to original
 *  - Locks body scroll while open
 */
const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  photos,
  initialIndex = 0,
  onClose,
}) => {
  const [index, setIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);

  const prev = useCallback(() => {
    setIndex(i => (i - 1 + photos.length) % photos.length);
  }, [photos.length]);

  const next = useCallback(() => {
    setIndex(i => (i + 1) % photos.length);
  }, [photos.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, prev, next]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      delta > 0 ? prev() : next();
    }
    touchStartX.current = null;
  };

  const photoUrl = getFullUrl(photos[index]) || photos[index];
  const multiple = photos.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/92"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      {/* ── Image container ── */}
      <div
        className="relative max-w-5xl w-full mx-4 flex items-center justify-center"
        onClick={e => e.stopPropagation()}
      >
        <img
          key={photoUrl}
          src={photoUrl}
          alt={`Photo ${index + 1} of ${photos.length}`}
          className="max-h-[85vh] max-w-full object-contain rounded shadow-2xl"
          draggable={false}
        />
      </div>

      {/* ── Close button ── */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/80 rounded-full p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
        aria-label="Close photo viewer"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* ── Prev arrow ── */}
      {multiple && (
        <button
          onClick={e => { e.stopPropagation(); prev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/80 rounded-full p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
          aria-label="Previous photo"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* ── Next arrow ── */}
      {multiple && (
        <button
          onClick={e => { e.stopPropagation(); next(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/80 rounded-full p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
          aria-label="Next photo"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* ── Counter ── */}
      {multiple && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full select-none">
          {index + 1} / {photos.length}
        </div>
      )}

      {/* ── Dot indicators (≤10 photos) ── */}
      {multiple && photos.length <= 10 && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-2">
          {photos.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setIndex(i); }}
              className={`w-2 h-2 rounded-full transition-colors focus:outline-none ${
                i === index ? 'bg-white' : 'bg-white/40 hover:bg-white/70'
              }`}
              aria-label={`Go to photo ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PhotoLightbox;
