import React, { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';

interface CrawlerStats {
  total: number;
  byBot: Record<string, number>;
  recentVisits: unknown[];
}

interface ClaimListingBannerProps {
  saleId: string;
  cityName: string;
  citySlug?: string;
  organizerId: string;
  isUnmanagedListing: boolean;
}

const ClaimListingBanner: React.FC<ClaimListingBannerProps> = ({ saleId, cityName, citySlug, organizerId, isUnmanagedListing }) => {
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

  // Only render the claim UI for unmanaged (scraped) listings
  if (!isUnmanagedListing) return null;

  // Hide only if we successfully fetched and total is exactly 0
  if (!loading && stats !== null && stats.total === 0) return null;

  const handleClaim = (provider: 'google' | 'facebook') => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('claimOrganizerId', organizerId);
    }
    signIn(provider);
  };

  const totalLabel = loading || stats === null
    ? 'Smart search assistants have visited'
    : `${stats.total} smart search assistant visit${stats.total === 1 ? '' : 's'}`;

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
            <span>📋</span>
            <span>{totalLabel}</span>
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
            This listing has been seen by search assistants. Claim it to manage your sale, update details, and connect with shoppers.
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
        <div className="flex gap-2">
          <button
            onClick={() => handleClaim('google')}
            className="flex-1 text-xs bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Claim with Google
          </button>
          <button
            onClick={() => handleClaim('facebook')}
            className="flex-1 text-xs bg-[#1877F2] hover:bg-[#166FE5] text-white px-3 py-2 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Claim with Facebook
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClaimListingBanner;
