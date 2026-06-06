import React, { useState, useEffect } from 'react';
import Link from 'next/link';

import { Lock } from 'lucide-react';
import { getOptimizedUrl, getLqipUrl, getSaleImageUrl } from '../lib/imageUtils';
import { formatUnlockTime } from '../lib/rankEarlyAccess';
import Skeleton from './Skeleton';
import TierBadge from './TierBadge'; // Phase 22
import ReputationBadge from './ReputationBadge'; // Feature #71
import VerifiedBadge from './VerifiedBadge'; // Feature #16
import BoostBadge from './BoostBadge'; // Phase 2b: Boost badges
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import SaleTypeBadge from './SaleTypeBadge'; // Brief F: Sale type badge system

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
    reputationScore?: number; // Feature #71
    reputationIsNew?: boolean; // Feature #71
    verificationStatus?: string; // Feature #16
  };
  status?: string;
  isAuctionSale?: boolean;
  isLive?: boolean;
  isSold?: boolean;
  isFlashDeal?: boolean;
  tags?: string[];
  favoriteCount?: number;
  maxOrganizerDiscount?: number; // D-XP-003: Max organizer discount across items
  hasMarkdownItems?: boolean; // Bug #251: any items have auto-markdown applied
  saleType?: string; // Brief F: ESTATE | YARD | AUCTION | FLEA_MARKET | RETAIL
  boost?: { // Phase 2b: Boost badge
    boostType: string;
    expiresAt: string;
    status: string;
  };
  // Rank-Based Early Access
  locked?: boolean;
  minutesUntilUnlock?: number;
  sourceName?: string; // P2: Disclosure label for scraped sales
  scrapedMetadata?: Record<string, unknown> | null; // P3: scraped enrichment (e.g. dateApproximate)
}

interface BadgeConfig {
  label: string;
  classes: string;
  pulse?: boolean;
}

interface SaleCardProps {
  sale: Sale;
  priority?: boolean;
}

const SaleCard: React.FC<SaleCardProps> = ({ sale, priority = false }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showToday, setShowToday] = useState(false); // false on SSR; computed client-side to avoid hydration mismatch
  const { isLowBandwidth } = useNetworkQuality();

  // L-004 edge: treat empty-string / whitespace-only photo URLs as "no photo".
  // Scraped sales can ship photoUrls[0] === "" or "   ", which previously rendered
  // an <img> with an empty/whitespace src — a blank dark rectangle instead of the
  // branded placeholder. Trim and require real content before using the URL.
  const rawPhotoUrl =
    sale.photoUrls && sale.photoUrls.length > 0 ? sale.photoUrls[0] : null;
  const photoUrl =
    typeof rawPhotoUrl === 'string' && rawPhotoUrl.trim().length > 0
      ? rawPhotoUrl
      : null;
  const lqipUrl = photoUrl ? getLqipUrl(photoUrl) : null;
  const imageQuality = isLowBandwidth ? 40 : 75;
  // getSaleImageUrl handles both Cloudinary optimization AND scraped CDN proxying
  const optimizedUrl = photoUrl ? getSaleImageUrl(photoUrl, imageQuality) : null;
  // Render the <img> only when we have a usable URL AND it hasn't errored.
  const hasPhoto = !!photoUrl && !!optimizedUrl && optimizedUrl.trim().length > 0 && !imgError;

  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [optimizedUrl]);

  // Compute "happening today" client-side only to avoid SSR/CSR date mismatch (hydration #418)
  useEffect(() => {
    if (!sale.startDate || !sale.endDate) return;
    try {
      const now = new Date();
      const start = new Date(sale.startDate);
      const end = new Date(sale.endDate);
      setShowToday(start <= now && now <= end);
    } catch {
      setShowToday(false);
    }
  }, [sale.startDate, sale.endDate]);

  const formatSaleDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'TBA';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'TBA';
      // Use UTC values to match SSR output and prevent React hydration mismatch #418/#425.
      // format(date, 'MMM d') from date-fns uses local timezone on the client but UTC on
      // the server, producing different strings and triggering hydration errors on every SaleCard.
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
    } catch {
      return 'TBA';
    }
  };

  const getStatusBadge = (): BadgeConfig | null => {
    if (sale.isSold) return { label: 'SOLD', classes: 'bg-warm-700 text-white' };
    if (sale.isLive) return { label: 'LIVE', pulse: true, classes: 'bg-green-600 text-white' };
    if (sale.isFlashDeal) return { label: 'FLASH', classes: 'bg-amber-600 text-white' };
    if (sale.isAuctionSale) return { label: 'AUCTION', classes: 'bg-amber-600 text-white' };
    if (showToday) return { label: 'TODAY', classes: 'bg-green-600 text-white' };
    return null;
  };

  const getOrganizerSpecialBadge = (): BadgeConfig | null => {
    if (sale.isSold) return null;
    if (sale.maxOrganizerDiscount && sale.maxOrganizerDiscount > 0) {
      return {
        label: `$${sale.maxOrganizerDiscount.toFixed(2)} off`,
        classes: 'bg-sage-600 dark:bg-sage-700 text-white'
      };
    }
    return null;
  };

  const statusBadge = getStatusBadge();
  const organizerSpecialBadge = getOrganizerSpecialBadge();
  const badge: BadgeConfig | null = organizerSpecialBadge || statusBadge;
  const showMarkdownBadge = sale.hasMarkdownItems && !sale.isSold;

  return (
    <div className="bg-white dark:bg-gray-800 overflow-hidden hover:shadow-card-hover dark:hover:shadow-lg transition-all duration-300 hover:scale-105 flex flex-col h-full rounded-lg border border-warm-200 dark:border-gray-700">
      <Link href={`/sales/${sale.id}`} className="block relative aspect-video bg-warm-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
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

        {!imgLoaded && !imgError && (
          <Skeleton className="absolute inset-0 rounded-none bg-warm-200/60 dark:bg-gray-600/60" />
        )}

        {hasPhoto ? (
          <img
            key={optimizedUrl}
            src={optimizedUrl!}
            alt={sale.title}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            loading={priority ? 'eager' : 'lazy'}
          />
        ) : (
          // Branded no-photo placeholder — tinted tile + FindA.Sale pin (L-004 audit 2026-05-30)
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-warm-100 to-warm-200 dark:from-gray-700 dark:to-gray-800">
            <svg
              className="w-10 h-10 text-amber-500/70 dark:text-amber-400/70"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              {/* FindA.Sale pin + star */}
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <path
                d="M12 5.5l1.12 2.27 2.5.36-1.81 1.77.43 2.49L12 11.22l-2.24 1.17.43-2.49L8.38 8.13l2.5-.36L12 5.5z"
                fill="#ffffff"
              />
            </svg>
            <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500 dark:text-gray-400">
              FindA.Sale
            </span>
          </div>
        )}

        {(badge || showMarkdownBadge) && (
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {badge && (
              <span className={`flex items-center gap-1 px-2.5 py-1 rounded text-sm font-bold ${badge.classes} shadow`}>
                {badge.pulse && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                {badge.label}
              </span>
            )}
            {showMarkdownBadge && (
              <span className="px-2.5 py-1 rounded text-sm font-bold bg-red-600 text-white shadow">
                Sale
              </span>
            )}
          </div>
        )}

        {sale.boost && sale.boost.status === 'ACTIVE' && (
          <div className="absolute top-2 right-2">
            <BoostBadge boostType={sale.boost.boostType} size="sm" />
          </div>
        )}

        {/* Brief F: Sale type badge — bottom-left of photo (shows when no lock badge) */}
        {sale.saleType && !sale.locked && (
          <div className="absolute bottom-2 left-2">
            <SaleTypeBadge saleType={sale.saleType} size="sm" theme="dark" />
          </div>
        )}

        {/* Rank-Based Early Access: Lock badge — corner only, never covers photo */}
        {sale.locked && sale.minutesUntilUnlock !== undefined && (
          <div className="absolute bottom-2 left-2">
            <span className="flex items-center gap-1 px-2 py-1 rounded bg-black/60 backdrop-blur-sm text-white text-xs font-semibold">
              <Lock className="w-3 h-3" />
              {sale.minutesUntilUnlock > 0
                ? `Unlocks in ${formatUnlockTime(sale.minutesUntilUnlock)}`
                : 'Early access'}
            </span>
          </div>
        )}
      </Link>

      <div className="flex flex-col flex-1 p-4 bg-white dark:bg-gray-800">
        <Link href={`/sales/${sale.id}`} className="flex-1 block mb-3">
          <h3 className="font-heading font-bold text-base text-warm-900 dark:text-gray-100 leading-snug line-clamp-2 mb-2">
            {sale.title}
          </h3>
          <p className="text-xs text-warm-600 dark:text-gray-400">
            {formatSaleDate(sale.startDate)} – {formatSaleDate(sale.endDate)}&nbsp;·&nbsp;{sale.city}, {sale.state}
          </p>
          {(sale.scrapedMetadata as { dateApproximate?: boolean } | null | undefined)?.dateApproximate === true && (
            <p className="text-[11px] text-warm-500 dark:text-gray-500 mt-0.5">
              Dates approximate
            </p>
          )}
        </Link>

        <div className="pt-3 border-t border-warm-200 dark:border-gray-700 flex flex-col gap-2">
          <Link href={`/organizers/${sale.organizer.id}`} className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline line-clamp-1 flex-1">
              {sale.organizer.businessName}
            </span>
            <VerifiedBadge status={sale.organizer.verificationStatus} size="sm" />
          </Link>

          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-1">
              {sale.organizer.reputationTier && (
                <TierBadge tier={sale.organizer.reputationTier} />
              )}
              {typeof sale.organizer.reputationScore === 'number' && (
                <ReputationBadge
                  score={sale.organizer.reputationScore}
                  isNew={sale.organizer.reputationIsNew}
                  size="small"
                />
              )}
            </div>
            {typeof sale.favoriteCount === 'number' && sale.favoriteCount > 0 && (
              <span className="text-xs text-warm-500 dark:text-gray-400 flex-shrink-0">
                ♥ {sale.favoriteCount}
              </span>
            )}
          </div>

          {sale.sourceName && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 border-t border-warm-100 dark:border-gray-700 pt-2">
              Sourced from public records · details may vary
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaleCard;
