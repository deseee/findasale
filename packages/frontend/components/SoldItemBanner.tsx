import React from 'react';
import Link from 'next/link';

interface SoldItemBannerProps {
  saleId: string;
  saleTitle: string;
  saleEndDate: string | null;
  soldAt: string | null;
  saleCity: string | null;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? 's' : ''}`;
}

const SoldItemBanner: React.FC<SoldItemBannerProps> = ({
  saleId,
  saleTitle,
  saleEndDate,
  soldAt,
  saleCity,
}) => {
  const saleStillActive = saleEndDate ? new Date(saleEndDate) > new Date() : false;

  const ctaHref = saleStillActive
    ? `/sales/${saleId}`
    : `/sales${saleCity ? `?city=${encodeURIComponent(saleCity)}` : ''}`;

  const ctaLabel = saleStillActive
    ? `See what's left at ${saleTitle} →`
    : 'Browse more active sales →';

  return (
    <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
      <p className="text-lg font-bold text-amber-900 dark:text-amber-200">Already sold.</p>
      <p className="text-sm text-amber-800 dark:text-amber-300">
        {soldAt
          ? `This one sold ${relativeTime(soldAt)} ago — good taste.`
          : 'This item has already sold.'}
      </p>
      <Link href={ctaHref}>
        <a className="block w-full text-center mt-3 py-2 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors">
          {ctaLabel}
        </a>
      </Link>
    </div>
  );
};

export default SoldItemBanner;
