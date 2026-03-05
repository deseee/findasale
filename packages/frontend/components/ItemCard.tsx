import React, { useState } from 'react';
import Link from 'next/link';
import { getOptimizedUrl, getLqipUrl } from '../lib/imageUtils';
import Skeleton from './Skeleton';

interface Item {
  id: string;
  title: string;
  description: string;
  estimatedValue: number;
  currentBid: number;
  status: string;
  auctionEndTime?: string;
  photoUrl?: string;
}

interface ItemCardProps {
  item: Item;
}

const ItemCard: React.FC<ItemCardProps> = ({ item }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

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
    switch (item.status) {
      case 'SOLD':    return { label: 'SOLD',    className: 'bg-warm-700 text-white' };
      case 'PENDING': return { label: 'PENDING', className: 'bg-yellow-500 text-white' };
      case 'ACTIVE':  return { label: 'ACTIVE',  className: 'bg-green-600 text-white' };
      default:        return null;
    }
  };

  const lqipUrl = item.photoUrl ? getLqipUrl(item.photoUrl) : null;
  const optimizedUrl = item.photoUrl ? getOptimizedUrl(item.photoUrl) : null;
  const badge = getStatusBadge();
  const countdown = getCountdownText();

  return (
    <Link href={`/items/${item.id}`}>
      <div className="card overflow-hidden hover:shadow-card-hover transition-shadow flex flex-col">
        {/* ── Image area (60% visual weight) — 1:1 square ── */}
        <div className="relative aspect-square bg-warm-200 overflow-hidden">
          {/* Tier 1: LQIP blurred background */}
          {lqipUrl && !imgError && (
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
            <Skeleton className="absolute inset-0 rounded-none bg-warm-200/60" />
          )}

          {/* Tier 3: Main lazy WebP image */}
          {item.photoUrl && !imgError ? (
            <img
              src={optimizedUrl!}
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
              <span className="text-warm-400 text-xs">No image</span>
            </div>
          )}

          {/* Status badge overlay — top-left */}
          {badge && (
            <span
              className={`absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-bold shadow ${badge.className}`}
            >
              {badge.label}
            </span>
          )}
        </div>

        {/* ── Content area (40% visual weight) ── */}
        <div className="flex flex-col flex-1 p-3">
          <h3 className="font-semibold text-sm text-warm-900 leading-snug line-clamp-1 mb-2">
            {item.title}
          </h3>
          <div className="flex items-center justify-between mt-auto">
            <span className="text-base font-bold text-warm-900">
              {formatPrice(item.currentBid)}
            </span>
            {countdown && (
              <span className="text-xs font-semibold text-amber-600">{countdown}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ItemCard;
