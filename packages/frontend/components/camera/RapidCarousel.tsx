/**
 * RapidCarousel — Phase 3B thumbnail strip
 *
 * Horizontal scrollable strip showing thumbnails of captured/analyzed items.
 * Each thumbnail displays:
 * - 60×60px photo preview
 * - Status badge (uploading/analyzing/done/error)
 * - AI title and category
 *
 * Status logic:
 * - No URL yet → 📷 gray uploading
 * - Has URL, DRAFT, no error → ◐ amber analyzing
 * - Has URL, DRAFT, has error → ⚠ red error
 * - PENDING_REVIEW → ✓ green done
 *
 * Interactions:
 * - Tap thumbnail → onThumbnailTap(itemId)
 * - Long-hold 500ms → onDeleteRequest(itemId)
 * - Toggle collapse/expand on left
 * - Pause/resume AI on left
 * - Real-time count label below
 */

import React, { useState, useRef } from 'react';

export interface RapidCarouselItem {
  id: string;
  thumbnailUrl?: string;
  draftStatus: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED';
  title?: string;
  category?: string;
  aiError?: string;
  photoUrls?: string[];
  autoEnhanced?: boolean;
}

export interface RapidCarouselProps {
  items: RapidCarouselItem[];
  onThumbnailTap: (itemId: string) => void;
  onDeleteRequest: (itemId: string) => void;
  onAddPhotoToItem?: (itemId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  aiPaused?: boolean;
  onTogglePause?: () => void;
  addingToItemId?: string | null;
  enhancedCount?: number;
}

const RapidCarousel: React.FC<RapidCarouselProps> = ({
  items,
  onThumbnailTap,
  onDeleteRequest,
  onAddPhotoToItem,
  collapsed = false,
  onToggleCollapse,
  aiPaused = false,
  onTogglePause,
  addingToItemId = null,
  enhancedCount = 0,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseDown = (itemId: string) => {
    setPressedId(itemId);
    pressTimerRef.current = setTimeout(() => {
      onDeleteRequest(itemId);
      setPressedId(null);
    }, 500);
  };

  const handleMouseUp = (itemId: string) => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (pressedId === itemId) {
      onThumbnailTap(itemId);
      setPressedId(null);
    }
  };

  const handleMouseLeave = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setPressedId(null);
  };

  // Count statuses
  const uploading = items.filter((i) => !i.thumbnailUrl).length;
  const analyzing = items.filter(
    (i) =>
      i.thumbnailUrl &&
      i.draftStatus === 'DRAFT' &&
      !i.aiError
  ).length;
  const ready = items.filter(
    (i) => i.draftStatus === 'PENDING_REVIEW'
  ).length;
  const errors = items.filter(
    (i) =>
      i.thumbnailUrl &&
      i.draftStatus === 'DRAFT' &&
      i.aiError
  ).length;

  // Get status icon and color for a single item
  const getStatusIcon = (item: RapidCarouselItem) => {
    if (!item.thumbnailUrl) {
      return { icon: '📷', bgColor: 'bg-gray-200', ring: '' };
    }
    if (item.draftStatus === 'DRAFT' && !item.aiError) {
      return { icon: '◐', bgColor: 'bg-amber-100', ring: 'ring-2 ring-amber-400 animate-spin' };
    }
    if (item.draftStatus === 'DRAFT' && item.aiError) {
      return { icon: '⚠', bgColor: 'bg-red-100', ring: 'ring-2 ring-red-400' };
    }
    return { icon: '✓', bgColor: 'bg-green-100', ring: 'ring-2 ring-green-400' };
  };

  if (collapsed) {
    return (
      <div className="bg-white border-b border-warm-200 p-2 flex items-center justify-between">
        <button
          onClick={onToggleCollapse}
          className="px-2 py-1 text-warm-600 hover:text-warm-900 text-sm font-medium"
          title="Expand carousel"
        >
          [━]
        </button>
        <span className="text-xs text-warm-600">
          {items.length} photo{items.length !== 1 ? 's' : ''} ·{' '}
          {ready} ready
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white border-b border-warm-200">
      <div className="flex items-center gap-2 p-2 border-b border-warm-100">
        <button
          onClick={onToggleCollapse}
          className="px-2 py-1 text-warm-600 hover:text-warm-900 text-sm font-medium"
          title="Collapse carousel"
        >
          [━]
        </button>

        <button
          onClick={onTogglePause}
          className="px-2 py-1 text-warm-600 hover:text-warm-900 text-sm font-medium"
          title={aiPaused ? 'Resume AI analysis' : 'Pause AI analysis'}
        >
          {aiPaused ? '[▶]' : '[⏸]'}
        </button>

        <span className="text-xs text-warm-600 flex-1">
          {items.length} photo{items.length !== 1 ? 's' : ''} ·{' '}
          {ready} ready ·{' '}
          {analyzing} analyzing
          {uploading > 0 && `· ${uploading} uploading`}
          {errors > 0 && `· ${errors} error${errors !== 1 ? 's' : ''}`}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto p-3 snap-x snap-mandatory"
        style={{ scrollBehavior: 'smooth' }}
      >
        {items.map((item) => {
          const { icon, bgColor, ring } = getStatusIcon(item);
          return (
            <div
              key={item.id}
              onMouseDown={() => handleMouseDown(item.id)}
              onMouseUp={() => handleMouseUp(item.id)}
              onMouseLeave={handleMouseLeave}
              onTouchStart={() => handleMouseDown(item.id)}
              onTouchEnd={() => handleMouseUp(item.id)}
              className="flex-shrink-0 snap-center relative group cursor-pointer"
              title={item.title || 'Item'}
            >
              {/* Thumbnail container */}
              <div className={`relative w-20 h-20 rounded-lg overflow-hidden border border-warm-300 bg-warm-50 transition-all ${
                addingToItemId === item.id ? 'ring-2 ring-amber-400' : ''
              }`}>
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title || 'Item'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <span className="text-2xl">📷</span>
                  </div>
                )}

                {/* Status badge */}
                <div
                  className={`absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${bgColor} ${ring}`}
                >
                  {icon}
                </div>

                {/* Photo count badge "×N" */}
                {item.photoUrls && item.photoUrls.length > 1 && (
                  <span className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-full z-10">
                    ×{item.photoUrls.length}
                  </span>
                )}

                {/* Auto-enhance badge (only when autoEnhanced is true) */}
                {item.autoEnhanced && (
                  <span className="absolute top-1 left-1 text-xs z-10">✨</span>
                )}

                {/* "+" button for adding photos to item */}
                {item.thumbnailUrl && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddPhotoToItem?.(item.id);
                    }}
                    className={`absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold z-10 ${
                      addingToItemId === item.id
                        ? 'bg-amber-500 ring-2 ring-amber-300'
                        : 'bg-gray-800/80'
                    }`}
                    title="Add more photos to this item"
                  >
                    {addingToItemId === item.id ? '×' : '+'}
                  </button>
                )}
              </div>

              {/* Title & Category */}
              <div className="mt-1 text-left">
                <p className="text-10px font-medium text-warm-900 truncate w-20 leading-tight">
                  {item.title || '—'}
                </p>
                <p className="text-9px text-warm-500 truncate w-20">
                  {item.category || ''}
                </p>
              </div>

              {/* Hover delete hint */}
              {item.thumbnailUrl && (
                <div className="absolute inset-0 rounded-lg bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all flex items-center justify-center hidden group-hover:flex">
                  <span className="text-xs text-white font-bold">Hold 500ms to delete</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Phase 5: Enhanced count footer */}
      {enhancedCount > 0 && (
        <div className="border-t border-warm-100 px-3 py-2 bg-warm-50">
          <p className="text-center text-xs text-gray-500">
            {enhancedCount} auto-enhanced ✨
          </p>
        </div>
      )}
    </div>
  );
};

export default RapidCarousel;