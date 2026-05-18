import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface CrawlerStats {
  total: number;
  byBot: Record<string, number>;
  recentVisits: unknown[];
}

interface ClaimListingBannerProps {
  saleId: string;
  cityName: string;
  citySlug?: string;
}

const ClaimListingBanner: React.FC<ClaimListingBannerProps> = ({ saleId, cityName, citySlug }) => {
  const [stats, setStats] = useState<CrawlerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
    fetch(`${apiBase}/crawler-stats/sale/${saleId}`)
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json() as Promise<CrawlerStats>;
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => {
        // Fail silently — show banner in default state
        setLoading(false);
      });
  }, [saleId]);

  // Hide only if we successfully fetched and total is exactly 0
  if (!loading && stats !== null && stats.total === 0) return null;

  const claimHref = citySlug ? `/claim?city=${citySlug}` : '/claim';
  const totalLabel = loading
    ? 'AI crawlers have visited'
    : `${stats!.total} AI crawler visit${stats!.total === 1 ? '' : 's'}`;

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
            <span>🤖</span>
            <span>{totalLabel}</span>
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
            This listing has been seen by AI search assistants. Claim it to manage your sale, update details, and appear in AI-generated results.
          </p>
          {!loading && stats && Object.keys(stats.byBot).length > 0 && (
            <p className="text-[10px] text-amber-700/70 dark:text-amber-400/60 mt-1.5">
              {Object.entries(stats.byBot)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([bot, count]) => `${bot}: ${count}`)
                .join(' · ')}
            </p>
          )}
        </div>
        <Link
          href={claimHref}
          className="flex-shrink-0 text-xs bg-amber-600 dark:bg-amber-700 hover:bg-amber-700 dark:hover:bg-amber-600 text-white px-3 py-2 rounded-lg font-medium transition-colors whitespace-nowrap"
        >
          Claim this listing →
        </Link>
      </div>
    </div>
  );
};

export default ClaimListingBanner;
