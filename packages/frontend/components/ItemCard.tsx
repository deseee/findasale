import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getOptimizedUrl, getLqipUrl } from '../lib/imageUtils';
import Skeleton from './Skeleton';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import RarityBadge from './RarityBadge';
import FavoriteButton from './FavoriteButton';

// Unified item type supporting multiple surfaces
export interface UnifiedItemCardItem {
  // Mandatory fields
  id: string;
  title: string;

  // Common optional fields
  photoUrls?: string[];  // Array of URLs; first is primary
  photoUrl?: string;     // Legacy single-photo field
  price?: number;
  currentBid?: number;
  status?: 'ACTIVE' | 'SOLD' | 'PENDING' | 'RESERVED' | string;
  rarity?: string | null;
  isAiTagged?: boolean;

  // Sale context
  sale?: {
    id: string;
    title: string;
    city?: string;
    state?: string;
  };
  businessName?: string;

  // Detail context
  description?: string;
  category?: string;
  condition?: string;
  auctionEndTime?: string;

  // Trending context
  _count?: {
    favorites?: number;
  };
  rankingIndex?: number;

  // AI confidence (not displayed)
  aiConfidence?: number;
}

// Legacy Item interface (deprecated, kept for backward compatibility)
interface Item {
  id: string;
  title: string;
  description: string;
  estimatedValue: number;
  currentBid: number;
  status: string;
  auctionEndTime?: string;
  photoUrl?: string;
  isAiTagged?: boolean;
  rarity?: string | null;
}

export interface ItemCardProps {
  item: UnifiedItemCardItem | Item;
  variant?: 'default' | 'compact' | 'detailed';
  showImage?: boolean;
  showTitle?: boolean;
  showPrice?: boolean;
  showCategory?: boolean;
  showCondition?: boolean;
  showSaleInfo?: boolean;
  showCountdown?: boolean;
  showStatus?: boolean;
  showRarity?: boolean;
  showAiTagged?: boolean;
  showFavoriteButton?: boolean;
  showFavoriteCount?: boolean;
  showRankingBadge?: boolean;
  imageHeight?: 'square' | 'fixed-h48' | 'fixed-h32';
  imageOptimization?: 'advanced' | 'basic' | 'none';
  className?: string;
  onClick?: () => void;
}

const ItemCard: React.FC<ItemCardProps> = ({
  item,
  variant = 'default',
  showImage = true,
  showTitle = true,
  showPrice = true,
  showCategory = false,
  showCondition = false,
  showSaleInfo = false,
  showCountdown = false,
  showStatus = true,
  showRarity = true,
  showAiTagged = true,
  showFavoriteButton = true,
  showFavoriteCount = false,
  showRankingBadge = false,
  imageHeight = 'square',
  imageOptimization = 'advanced',
  className = '',
  onClick,
}) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const { isLowBandwidth } = useNetworkQuality();

  // Resolve primary photo URL (photoUrls array takes precedence, fallback to photoUrl)
  const primaryPhotoUrl = ((item as any).photoUrls?.[0]) || (item as any).photoUrl || null;

  // Calculate image URLs based on optimization mode
  let lqipUrl_calc: string | null = null;
  let optimizedUrl: string | null = null;

  if (primaryPhotoUrl) {
    if (imageOptimization === 'advanced') {
      lqipUrl_calc = getLqipUrl(primaryPhotoUrl);
      const imageQuality = isLowBandwidth ? 40 : 75;
      optimizedUrl = getOptimizedUrl(primaryPhotoUrl, imageQuality);
    } else if (imageOptimization === 'basic') {
      optimizedUrl = primaryPhotoUrl;
    }
    // 'none' mode: no URL processing
  }

  // Reset image loading state when the photo URL changes
  // This ensures new images load even if the component instance is reused
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [optimizedUrl]);

  const getCountdownText = (): string => {
    if (!item.auctionEndTime) return '';
    const endTime = new Date(item.auctionEndTime).getTime();
    const now = Date.now();
    const diff = endTime - now;
    if (diff <= 0) return 'Ended';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  const formatPrice = (price: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);

  const getStatusBadge = (): { label: string; className: string } | null => {
    if (!showStatus || !item.status) return null;
    switch (item.status) {
      case 'SOLD':     return { label: 'SOLD',    className: 'bg-warm-700 text-white' };
      case 'PENDING':  return { label: 'PENDING', className: 'bg-yellow-500 text-white' };
      case 'ACTIVE':   return { label: 'ACTIVE',  className: 'bg-green-600 text-white' };
      case 'RESERVED': return { label: 'ON HOLD', className: 'bg-amber-500 text-white' };
      default:         return null;
    }
  };

  const shouldShowRankingBadge = showRankingBadge && (item as any).rankingIndex !== undefined && (item as any).rankingIndex < 3;
  const shouldShowFavoriteCount = showFavoriteCount && (item as any)._count?.favorites !== undefined;
  const lqipUrl = lqipUrl_calc;
  const badge = getStatusBadge();
  const countdown = showCountdown ? getCountdownText() : '';

  // Get image height class
  const imageHeightClass = imageHeight === 'fixed-h48' ? 'h-48' : imageHeight === 'fixed-h32' ? 'h-32' : 'aspect-square';

  // Get content padding and spacing based on variant
  const contentPaddingClass = variant === 'detailed' ? 'p-4 space-y-2' : 'p-3 space-y-1';
  const titleClampClass = variant === 'compact' ? 'line-clamp-2' : 'line-clamp-1';

  // Handle click
  const handleClick = () => {
    if (onClick) onClick();
  };

  // Get link href (default or custom)
  const linkHref = `/items/${item.id}`;

  // Format price (support both price and currentBid)
  const displayPrice = (item as any).price ?? item.currentBid;

  const cardContent = (
    <div className={`card overflow-hidden hover:shadow-card-hover transition-shadow flex flex-col ${className}`}>
      {/* ── Image area ── */}
      {showImage && (
        <div className={`relative ${imageHeightClass} bg-warm-200 dark:bg-gray-700 overflow-hidden ${variant === 'compact' ? 'group-hover:scale-105 transition-transform duration-300' : ''}`}>
          {/* Tier 1: LQIP blurred background (advanced optimization only) */}
          {lqipUrl && !imgError && imageOptimization === 'advanced' && (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${lqipUrl})`,
                filter: 'blur(8px)',
                transform: 'scale(1.05)',
              }}
              aria-hidden="true"
            />
          )}

          {/* Tier 2: Skeleton pulse */}
          {!imgLoaded && !imgError && (
            <Skeleton className="absolute inset-0 rounded-none bg-warm-200/60 dark:bg-gray-600/60" />
          )}

          {/* Tier 3: Main lazy image */}
          {primaryPhotoUrl && !imgError ? (
            <img
              key={optimizedUrl || primaryPhotoUrl}
              src={optimizedUrl || primaryPhotoUrl}
              alt={item.title}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                imgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-warm-400 dark:text-gray-500 text-xs">No image</span>
            </div>
          )}

          {/* Status badge — top-left */}
          {badge && (
            <span
              className={`absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-bold shadow ${badge.className}`}
            >
              {badge.label}
            </span>
          )}

          {/* Ranking badge (top 3 trending) — top-left alternative */}
          {shouldShowRankingBadge && (
            <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">
              🔥 Hot
            </span>
          )}

          {/* Favorite count badge — top-right (trending) */}
          {shouldShowFavoriteCount && (
            <div className="absolute top-2 right-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-xs font-semibold px-2 py-0.5 rounded-full text-warm-700 dark:text-amber-400 shadow">
              ❤️ {item._count?.favorites}
            </div>
          )}

          {/* Rarity badge — top-right overlay */}
          {showRarity && item.rarity && item.rarity !== 'COMMON' && !shouldShowFavoriteCount && (
            <div className="absolute top-2 right-2">
              <RarityBadge rarity={item.rarity} size="sm" />
            </div>
          )}

          {/* Favorite button — top-right overlay (when not showing favorite count) */}
          {showFavoriteButton && !shouldShowFavoriteCount && (
            <div className="absolute top-2 right-2">
              <FavoriteButton itemId={item.id} variant="icon" size="md" />
            </div>
          )}

          {/* Favorite button — overlay when showing favorite count (trending layout) */}
          {showFavoriteButton && shouldShowFavoriteCount && (
            <div className="absolute bottom-2 right-2">
              <FavoriteButton itemId={item.id} variant="icon" size="md" />
            </div>
          )}

          {/* AI tagging disclosure badge — bottom-right */}
          {showAiTagged && item.isAiTagged && (
            <span
              className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-semibold leading-none"
              title="This tag was auto-suggested by our system. Check it before listing — you know your items best."
            >
              AI
            </span>
          )}
        </div>
      )}

      {/* ── Content area ── */}
      <div className={`flex flex-col flex-1 ${contentPaddingClass}`}>
        {showTitle && (
          <h3 className={`font-semibold text-sm text-warm-900 dark:text-gray-100 leading-snug ${titleClampClass}`}>
            {item.title}
          </h3>
        )}

        {/* Category badge (if enabled) */}
        {showCategory && item.category && (
          <span className="inline-block bg-warm-100 dark:bg-gray-700 text-warm-800 dark:text-warm-200 text-xs px-2 py-1 rounded-full w-fit">
            {item.category}
          </span>
        )}

        {/* Condition badge (if enabled) */}
        {showCondition && item.condition && (
          <span className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded-full w-fit">
            {item.condition}
          </span>
        )}

        {/* Sale info (if enabled) */}
        {showSaleInfo && item.sale && (
          <p className="text-xs text-warm-500 dark:text-gray-400 truncate">
            {item.sale.title}
            {item.sale.city && item.sale.state && ` • ${item.sale.city}, ${item.sale.state}`}
          </p>
        )}

        {/* Organizer name (if enabled) */}
        {showSaleInfo && item.businessName && !item.sale && (
          <p className="text-xs text-warm-500 dark:text-gray-400 truncate">{item.businessName}</p>
        )}

        {/* Price and countdown — flex with auto spacing */}
        {(showPrice || showCountdown) && (
          <div className="flex items-center justify-between mt-auto">
            {showPrice && displayPrice !== undefined && (
              <span className="text-base font-bold text-warm-900 dark:text-gray-100">
                {formatPrice(displayPrice)}
              </span>
            )}
            {showCountdown && countdown && (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{countdown}</span>
            )}
          </div>
        )}

        {/* Description (detailed variant only) */}
        {variant === 'detailed' && showPrice && item.description && (
          <p className="text-sm text-warm-600 dark:text-gray-400 line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
    </div>
  );

  // Conditionally wrap in Link if not using custom onClick
  if (onClick) {
    return (
      <div onClick={handleClick} role="button" tabIndex={0} className="cursor-pointer">
        {cardContent}
      </div>
    );
  }

  return (
    <Link href={linkHref}>
      <div>{cardContent}</div>
    </Link>
  );
};

export default ItemCard;
