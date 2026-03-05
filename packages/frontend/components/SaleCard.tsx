import React, { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { getOptimizedUrl, getLqipUrl } from '../lib/imageUtils';
import Skeleton from './Skeleton';
import TierBadge from './TierBadge'; // Phase 22

interface Sale {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  photoUrls: string[];
  organizer: {
    id: string;
    businessName: string;
    reputationTier?: string; // Phase 22
  };
  status?: string;
  isAuctionSale?: boolean;
  tags?: string[];
  favoriteCount?: number;
}

interface SaleCardProps {
  sale: Sale;
}

const SaleCard: React.FC<SaleCardProps> = ({ sale }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const formatSaleDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'TBA';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'TBA';
      return format(date, 'MMM d');
    } catch {
      return 'TBA';
    }
  };

  const isHappeningToday = (): boolean => {
    if (!sale.startDate || !sale.endDate) return false;
    try {
      const now = new Date();
      const start = new Date(sale.startDate);
      const end = new Date(sale.endDate);
      return start <= now && now <= end;
    } catch {
      return false;
    }
  };

  const hasPhoto = sale.photoUrls && sale.photoUrls.length > 0;
  const photoUrl = hasPhoto ? sale.photoUrls[0] : null;
  const lqipUrl = photoUrl ? getLqipUrl(photoUrl) : null;
  const optimizedUrl = photoUrl ? getOptimizedUrl(photoUrl) : null;
  const showToday = isHappeningToday();

  return (
    <div className="card overflow-hidden hover:shadow-card-hover transition-shadow flex flex-col">
      {/* ── Image area (60% visual weight) — 1:1 square ── */}
      <Link href={`/sales/${sale.id}`} className="block relative aspect-square bg-warm-200 overflow-hidden">
        {/* Tier 1: LQIP blurred background (loads instantly) */}
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

        {/* Tier 2: Skeleton pulse (shown until main image loads) */}
        {!imgLoaded && !imgError && (
          <Skeleton className="absolute inset-0 rounded-none bg-warm-200/60" />
        )}

        {/* Tier 3: Main lazy WebP image (fades in on load) */}
        {photoUrl && !imgError ? (
          <img
            src={optimizedUrl!}
            alt={sale.title}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (!photoUrl || imgError) ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="/images/placeholder.svg"
              alt=""
              className="w-12 h-12 opacity-25"
              aria-hidden="true"
            />
          </div>
        ) : null}

        {/* Badge overlays — top-left corner */}
        <div className="absolute top-2 left-2 flex gap-1">
          {sale.isAuctionSale && (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-600 text-white shadow">
              AUCTION
            </span>
          )}
          {showToday && (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-600 text-white shadow">
              TODAY
            </span>
          )}
        </div>
      </Link>

      {/* ── Content area (40% visual weight) ── */}
      <div className="flex flex-col flex-1 p-3">
        <Link href={`/sales/${sale.id}`} className="flex-1">
          <h3 className="font-semibold text-sm text-warm-900 leading-snug line-clamp-1 mb-1">
            {sale.title}
          </h3>
          <p className="text-xs text-warm-500">
            {formatSaleDate(sale.startDate)} – {formatSaleDate(sale.endDate)}&nbsp;·&nbsp;{sale.city}, {sale.state}
          </p>
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1 min-w-0">
            <Link
              href={`/organizers/${sale.organizer.id}`}
              className="text-xs font-medium text-amber-600 hover:underline line-clamp-1"
            >
              {sale.organizer.businessName}
            </Link>
            {sale.organizer.reputationTier && (
              <TierBadge tier={sale.organizer.reputationTier} />
            )}
          </div>
          {typeof sale.favoriteCount === 'number' && sale.favoriteCount > 0 && (
            <span className="text-xs text-warm-400 flex-shrink-0 ml-1">
              ♥ {sale.favoriteCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaleCard;
