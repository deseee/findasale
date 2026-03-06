import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getFullUrl, getThumbnailUrl } from '../lib/imageUtils';

interface SaleTourGalleryProps {
  photos: string[];           // array of photo URLs
  saleTitle: string;
  isOpen: boolean;
  onClose: () => void;
  initialIndex?: number;      // default 0
}

/**
 * SaleTourGallery — Immersive photo tour of a sale.
 *
 * Features:
 *  - Full-screen overlay modal (fixed, z-50, black background)
 *  - Left/right arrow navigation (buttons + keyboard ArrowLeft/ArrowRight)
 *  - Swipe support via touch events (touchstart/touchend, threshold 50px)
 *  - Photo counter "3 / 12" top-right
 *  - Escape key closes the modal
 *  - Thumbnail filmstrip at bottom (scrollable row, click to jump to photo)
 *  - "📷 Sale Tour" badge top-left
 *  - Smooth CSS transition between photos (opacity fade, 200ms)
 *  - Locks body scroll while open
 */
const SaleTourGallery: React.FC<SaleTourGalleryProps> = ({
  photos,
  saleTitle,
  isOpen,
  onClose,
  initialIndex = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  // Sync currentIndex with initialIndex prop changes
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const prev = useCallback(() => {
    setCurrentIndex(i => (i - 1 + photos.length) % photos.length);
  }, [photos.length]);

  const next = useCallback(() => {
    setCurrentIndex(i => (i + 1) % photos.length);
  }, [photos.length]);

  const goToPhoto = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, prev, next]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

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

  // Auto-scroll filmstrip to show current photo
  useEffect(() => {
    if (!filmstripRef.current) return;
    const current = filmstripRef.current.querySelector(
      `[data-index="${currentIndex}"]`
    ) as HTMLElement;
    if (current) {
      current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [currentIndex]);

  if (!isOpen || photos.length === 0) {
    return null;
  }

  const currentPhotoUrl = getFullUrl(photos[currentIndex]) || photos[currentIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label={`Sale tour: ${saleTitle}`}
    >
      {/* ── Top badge and counter ── */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        {/* Tour badge */}
        <div className="text-white text-sm font-semibold bg-black/60 px-3 py-1 rounded-full flex items-center gap-2">
          <span>📷</span>
          <span>Sale Tour</span>
        </div>

        {/* Photo counter */}
        <div className="text-white text-sm bg-black/60 px-3 py-1 rounded-full">
          {currentIndex + 1} / {photos.length}
        </div>
      </div>

      {/* ── Close button ── */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white bg-black/60 hover:bg-black/80 rounded-full p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 z-10"
        aria-label="Close tour"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* ── Main image container ── */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className="relative w-full h-full flex items-center justify-center"
          onClick={e => e.stopPropagation()}
        >
          <img
            key={currentPhotoUrl}
            src={currentPhotoUrl}
            alt={`Photo ${currentIndex + 1} of ${photos.length} - ${saleTitle}`}
            className="max-h-full max-w-full object-contain transition-opacity duration-200 rounded-lg shadow-2xl"
            draggable={false}
          />
        </div>
      </div>

      {/* ── Navigation arrows ── */}
      {photos.length > 1 && (
        <>
          {/* Prev arrow */}
          <button
            onClick={e => { e.stopPropagation(); prev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white bg-black/60 hover:bg-black/80 rounded-full p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 z-10"
            aria-label="Previous photo"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          {/* Next arrow */}
          <button
            onClick={e => { e.stopPropagation(); next(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white bg-black/60 hover:bg-black/80 rounded-full p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 z-10"
            aria-label="Next photo"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </>
      )}

      {/* ── Filmstrip thumbnail row ── */}
      {photos.length > 1 && (
        <div className="bg-black/80 border-t border-white/10 px-4 py-3 overflow-x-auto">
          <div
            ref={filmstripRef}
            className="flex gap-3 justify-center min-w-full"
          >
            {photos.map((url, idx) => (
              <button
                key={idx}
                data-index={idx}
                onClick={() => goToPhoto(idx)}
                className={`flex-shrink-0 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 rounded ${
                  idx === currentIndex
                    ? 'ring-2 ring-amber-600 opacity-100'
                    : 'opacity-60 hover:opacity-80'
                }`}
                aria-label={`View photo ${idx + 1}`}
                aria-pressed={idx === currentIndex}
              >
                <img
                  src={getThumbnailUrl(url) || url}
                  alt={`Thumbnail ${idx + 1}`}
                  className="h-16 w-16 object-cover rounded"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SaleTourGallery;
