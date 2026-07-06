/**
 * /organizer/platforms — Platform Metrics Page
 *
 * Section 1: Coverage Score Hero (ring + animated counter)
 * Section 2: Platform Cards (eBay, Google, Facebook, Shopify) 2×2 grid
 * Section 3: eBay Queue Mode Panel
 * Section 4: Unlisted Inventory table
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Skeleton from '../../components/Skeleton';
import PlatformGapPanel from '../../components/PlatformGapPanel';

// ── Types ──────────────────────────────────────────────────────────────────

interface EbayStats {
  connected: boolean;
  listed: number;
  limit: number;
  limitSource: 'ESTIMATED' | 'KNOWN';
  overLimit: boolean;
  utilizationPct: number;
  storeDetected: boolean;
  queueMode: boolean;
  queueRotation: boolean;
  queued: number;
  activeSlots: number;
  freeSlots: number;
  warningLevel: 'ok' | 'warning' | 'critical' | 'over';
  liveCountAvailable: boolean;
  storeUrl: string | null;
}

interface GoogleStats {
  connected: boolean;
  listed: number;
  limit: null;
  eligible: number;
  ineligible: number;
  ineligibilityBreakdown: {
    noPhoto: number;
    noPrice: number;
    auctionType: number;
    notPublished: number;
    saleNotPublished: number;
  };
}

interface FacebookStats {
  connected: boolean;
  listed: number;
  limit: null;
  note: 'EXPORT_ONLY';
  storeUrl: string | null;
}

interface ShopifyStats {
  connected: boolean;
  listed: number;
  limit: null;
  storeUrl: string | null;
}

interface PlatformStatsResponse {
  organizerId: string;
  computedAt: string;
  coverageScore: number;
  ebay: EbayStats;
  googleMerchant: GoogleStats;
  facebook: FacebookStats;
  shopify: ShopifyStats;
  totals: {
    totalAvailableItems: number;
    totalListedAnywhere: number;
    totalUnlisted: number;
    totalVisibleOnSite: number;
  };
}

interface GapItem {
  id: string;
  title: string;
  primaryPhotoUrl: string | null;
  price: number | null;
  saleId: string | null;
  saleTitle: string | null;
  listingType: string;
  ebayQueuedAt: string | null;
  ineligibilityReasons?: string[];
}

interface PlatformGapResponse {
  platform: string;
  totalNotListed: number;
  page: number;
  pageSize: number;
  items: GapItem[];
}

type GapPlatform = 'ebay' | 'google' | 'facebook' | 'shopify';

// ── Coverage ring SVG ─────────────────────────────────────────────────────

function CoverageRing({ score }: { score: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color =
    score >= 80 ? '#87A878' : score >= 50 ? '#f59e0b' : '#f97316';
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="mx-auto" aria-hidden="true">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" className="dark:stroke-gray-700" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        transform="rotate(-90 70 70)"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x="70" y="65" textAnchor="middle" className="fill-warm-900 dark:fill-warm-100" fontSize="28" fontWeight="bold" fill="currentColor">
        {score}
      </text>
      <text x="70" y="85" textAnchor="middle" fontSize="11" fill="#6b7280">
        out of 100
      </text>
    </svg>
  );
}

// ── eBay limit bar ────────────────────────────────────────────────────────

function EbayLimitBar({ listed, limit, warningLevel }: { listed: number; limit: number; warningLevel: string }) {
  const pct = Math.min((listed / limit) * 100, 100);
  const barColor =
    warningLevel === 'ok' ? 'bg-green-500'
    : warningLevel === 'warning' ? 'bg-yellow-500'
    : 'bg-red-500';
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-warm-500 dark:text-warm-400 mb-1">
        <span>{listed} used</span>
        <span>{limit} limit</span>
      </div>
      <div className="h-2 bg-warm-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function PlatformsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [gapPanel, setGapPanel] = useState<{ platform: GapPlatform; googleFilter?: string } | null>(null);

  // Unlisted inventory pagination
  const [unlistedPage, setUnlistedPage] = useState(1);
  const [unlistedItems, setUnlistedItems] = useState<GapItem[]>([]);
  const [unlistedTotal, setUnlistedTotal] = useState(0);
  const [unlistedInit, setUnlistedInit] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStatsResponse>({
    queryKey: ['platform-stats'],
    queryFn: async () => {
      const res = await api.get('/organizers/me/platform-stats');
      return res.data as PlatformStatsResponse;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: !!user?.id,
  });

  // Unlisted inventory (ebay gap as primary)
  const { isFetching: unlistedFetching, data: unlistedData } = useQuery<PlatformGapResponse>({
    queryKey: ['platform-gap-unlisted', unlistedPage],
    queryFn: async () => {
      const res = await api.get(`/organizers/me/platform-gap?platform=ebay&page=${unlistedPage}`);
      return res.data as PlatformGapResponse;
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!unlistedData) return;
    setUnlistedTotal(unlistedData.totalNotListed);
    if (unlistedPage === 1) {
      setUnlistedItems(unlistedData.items);
    } else {
      setUnlistedItems((prev: GapItem[]) => [...prev, ...unlistedData.items]);
    }
    setUnlistedInit(true);
  }, [unlistedData, unlistedPage]);

  // Queue settings mutation
  const queueSettingsMutation = useMutation({
    mutationFn: (body: { ebayQueueMode?: boolean; ebayQueueRotation?: boolean }) =>
      api.patch('/organizers/me/ebay-queue-settings', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
    },
  });

  const addToQueueMutation = useMutation({
    mutationFn: (itemIds: string[]) =>
      api.post('/organizers/me/ebay-queue', { itemIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
      queryClient.invalidateQueries({ queryKey: ['platform-gap-unlisted'] });
    },
  });

  // Auth guard
  if (!authLoading && (!user || !(user.roles?.includes('ORGANIZER') || user.role === 'ORGANIZER' || user.role === 'ADMIN'))) {
    router.push('/access-denied');
    return null;
  }

  const isLoading = authLoading || statsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
        <div className="max-w-5xl mx-auto px-4 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  const ebay = stats?.ebay;
  const google = stats?.googleMerchant;
  const facebook = stats?.facebook;
  const shopify = stats?.shopify;

  return (
    <>
      <Head>
        <title>Platform Reach &mdash; FindA.Sale</title>
      </Head>

      {/* Gap Panel */}
      {gapPanel && (
        <PlatformGapPanel
          platform={gapPanel.platform}
          organizerId={user?.id ?? ''}
          ebayQueueMode={ebay?.queueMode}
          googleFilter={gapPanel.googleFilter}
          onClose={() => setGapPanel(null)}
        />
      )}

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
        <div className="max-w-5xl mx-auto px-4 space-y-8">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-warm-500 dark:text-warm-400">
            <Link href="/organizer/dashboard" className="hover:text-[#87A878] transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-warm-900 dark:text-warm-100 font-medium">Platform Reach</span>
          </nav>

          {/* ─── Section 1: Coverage Score Hero ─────────────────────────── */}
          <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-xl p-8 text-center">
            <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-1">
              Inventory Coverage Score
            </h1>
            <p className="text-sm text-warm-500 dark:text-warm-400 mb-6">
              {stats
                ? `${stats.totals.totalListedAnywhere} of ${stats.totals.totalAvailableItems} available items are listed on at least one platform`
                : 'Loading…'}
            </p>
            {stats && <CoverageRing score={stats.coverageScore} />}
          </div>

          {/* ─── Section 2: Platform Cards ─────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* eBay Card */}
            <div className={`bg-white dark:bg-gray-800 border rounded-xl p-5 ${ebay?.connected ? 'border-warm-200 dark:border-gray-700' : 'border-warm-100 dark:border-gray-800 opacity-75'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">&#x1F6D2;</span>
                  <span className="font-semibold text-warm-900 dark:text-warm-100">eBay</span>
                </div>
                {!ebay?.connected && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-warm-100 dark:bg-gray-700 text-warm-500">
                    Not connected
                  </span>
                )}
              </div>

              {ebay?.connected ? (
                <>
                  <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">
                    {ebay.listed}
                  </p>
                  <p className="text-xs text-warm-500 dark:text-warm-400">items listed</p>

                  <EbayLimitBar listed={ebay.listed} limit={ebay.limit} warningLevel={ebay.warningLevel} />

                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                    {ebay.listed} / {ebay.storeDetected ? `${ebay.limit}+ (store)` : `${ebay.limit} free listings`} used
                    {ebay.limitSource === 'ESTIMATED' && ' (estimated)'}
                  </p>

                  {ebay.warningLevel === 'warning' && (
                    <div className="mt-2 px-2 py-1 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-xs text-yellow-800 dark:text-yellow-200">
                      80% used &mdash; {ebay.freeSlots} free slots left
                    </div>
                  )}
                  {(ebay.warningLevel === 'critical' || ebay.warningLevel === 'over') && (
                    <div className="mt-2 px-2 py-1 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
                      Limit reached &mdash; paying $0.35 per new listing
                    </div>
                  )}

                  {ebay.queueMode && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#87A878]/10 text-[#6b8f5e] dark:text-[#a8c49a] border border-[#87A878]/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#87A878]" />
                      Queue Mode ON &mdash; {ebay.queued} items waiting
                    </div>
                  )}
                  {!ebay.queueMode && ebay.listed > 200 && (
                    <button
                      onClick={() => queueSettingsMutation.mutate({ ebayQueueMode: true })}
                      disabled={queueSettingsMutation.isPending}
                      className="mt-3 w-full py-1.5 text-xs font-medium rounded-lg bg-[#87A878] hover:bg-[#6b8f5e] text-white transition-colors disabled:opacity-50"
                    >
                      Enable Queue Mode
                    </button>
                  )}

                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    {ebay.storeUrl && (
                      <a
                        href={ebay.storeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[#6b8f5e] dark:text-[#a8c49a] hover:text-[#87A878] transition-colors"
                      >
                        View my eBay Store &#x2197;
                      </a>
                    )}
                    <button
                      onClick={() => setGapPanel({ platform: 'ebay' })}
                      className="text-xs font-medium text-[#6b8f5e] dark:text-[#a8c49a] hover:text-[#87A878] transition-colors"
                    >
                      View {stats?.totals.totalUnlisted ?? 0} not listed &rarr;
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-warm-500 dark:text-warm-400">Connect your eBay account to start listing.</p>
                  <Link href="/organizer/settings" className="mt-2 inline-block text-xs font-medium text-[#6b8f5e] dark:text-[#a8c49a] hover:text-[#87A878]">
                    Connect eBay &rarr;
                  </Link>
                </div>
              )}
            </div>

            {/* Google Merchant Card */}
            <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">&#x1F6CD;&#xFE0F;</span>
                <span className="font-semibold text-warm-900 dark:text-warm-100">Google Merchant</span>
              </div>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">
                {google?.listed ?? 0}
              </p>
              <p className="text-xs text-warm-500 dark:text-warm-400">items eligible</p>

              {google && google.ineligible > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs font-medium text-warm-700 dark:text-warm-300">
                    {google.ineligible} ineligible
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {google.ineligibilityBreakdown.noPhoto > 0 && (
                      <button
                        onClick={() => setGapPanel({ platform: 'google', googleFilter: 'noPhoto' })}
                        className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 transition-colors"
                      >
                        {google.ineligibilityBreakdown.noPhoto} no photo
                      </button>
                    )}
                    {google.ineligibilityBreakdown.noPrice > 0 && (
                      <button
                        onClick={() => setGapPanel({ platform: 'google', googleFilter: 'noPrice' })}
                        className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 transition-colors"
                      >
                        {google.ineligibilityBreakdown.noPrice} no price
                      </button>
                    )}
                    {google.ineligibilityBreakdown.auctionType > 0 && (
                      <button
                        onClick={() => setGapPanel({ platform: 'google', googleFilter: 'auctionType' })}
                        className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 transition-colors"
                      >
                        {google.ineligibilityBreakdown.auctionType} auction
                      </button>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => setGapPanel({ platform: 'google' })}
                className="mt-3 text-xs font-medium text-[#6b8f5e] dark:text-[#a8c49a] hover:text-[#87A878] transition-colors"
              >
                View ineligible items &rarr;
              </button>
            </div>

            {/* Facebook Card */}
            <div className={`bg-white dark:bg-gray-800 border rounded-xl p-5 ${facebook?.connected ? 'border-warm-200 dark:border-gray-700' : 'border-warm-100 dark:border-gray-800 opacity-75'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">&#x1F4D8;</span>
                  <span className="font-semibold text-warm-900 dark:text-warm-100">Facebook</span>
                </div>
                {facebook?.connected ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                    Connected
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-warm-100 dark:bg-gray-700 text-warm-500">
                    Not connected
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">
                {facebook?.listed ?? 0}
              </p>
              <p className="text-xs text-warm-500 dark:text-warm-400">items exported to Facebook</p>
              <p className="text-xs text-warm-400 dark:text-warm-500 mt-2">
                {facebook?.connected
                  ? 'Updates when you export from your sale'
                  : 'Connect your Facebook Page in settings'}
              </p>
              {!facebook?.connected && (
                <Link href="/organizer/settings" className="mt-2 inline-block text-xs font-medium text-[#6b8f5e] dark:text-[#a8c49a] hover:text-[#87A878]">
                  Connect Facebook &rarr;
                </Link>
              )}
              {facebook?.connected && facebook.storeUrl && (
                <a
                  href={facebook.storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-[#6b8f5e] dark:text-[#a8c49a] hover:text-[#87A878] transition-colors"
                >
                  View Facebook Page &#x2197;
                </a>
              )}
            </div>

            {/* Shopify Card */}
            <div className={`bg-white dark:bg-gray-800 border rounded-xl p-5 ${shopify?.connected ? 'border-warm-200 dark:border-gray-700' : 'border-warm-100 dark:border-gray-800 opacity-75'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">&#x1F7E9;</span>
                  <span className="font-semibold text-warm-900 dark:text-warm-100">Shopify</span>
                  <span className="text-xs px-1.5 py-0.5 rounded font-semibold bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 uppercase tracking-wide">
                    TEAMS
                  </span>
                </div>
                {!shopify?.connected && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-warm-100 dark:bg-gray-700 text-warm-500">
                    Not connected
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">
                {shopify?.listed ?? 0}
              </p>
              <p className="text-xs text-warm-500 dark:text-warm-400">items listed</p>
              {!shopify?.connected && (
                <p className="text-xs text-warm-400 dark:text-warm-500 mt-2">
                  Shopify available on the TEAMS plan
                </p>
              )}
              {shopify?.connected && shopify.storeUrl && (
                <a
                  href={shopify.storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-[#6b8f5e] dark:text-[#a8c49a] hover:text-[#87A878] transition-colors"
                >
                  View my Shopify Store &#x2197;
                </a>
              )}
            </div>
          </div>

          {/* ─── Section 3: eBay Queue Mode Panel ──────────────────────── */}
          {ebay?.connected && (
            <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-warm-900 dark:text-warm-100">
                  eBay Listing Queue
                </h2>
                {/* Queue Mode toggle */}
                <button
                  onClick={() => queueSettingsMutation.mutate({ ebayQueueMode: !ebay.queueMode })}
                  disabled={queueSettingsMutation.isPending}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                    ebay.queueMode ? 'bg-[#87A878]' : 'bg-warm-200 dark:bg-gray-600'
                  }`}
                  aria-label="Toggle Queue Mode"
                  role="switch"
                  aria-checked={ebay.queueMode}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                      ebay.queueMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {!ebay.queueMode ? (
                /* Queue Mode OFF */
                <div className="space-y-4">
                  <p className="text-sm text-warm-600 dark:text-warm-400 leading-relaxed">
                    Queue Mode automatically manages your {ebay.limit} free eBay listing slots. When you hit the limit, new items wait in line. When a slot opens (item sells or listing rotates out), the next item in queue goes live automatically &mdash; no fees, no manual work.
                  </p>
                  <button
                    onClick={() => queueSettingsMutation.mutate({ ebayQueueMode: true })}
                    disabled={queueSettingsMutation.isPending}
                    className="px-5 py-2.5 rounded-lg bg-[#87A878] hover:bg-[#6b8f5e] text-white font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    Enable Queue Mode
                  </button>
                </div>
              ) : (
                /* Queue Mode ON */
                <div className="space-y-5">
                  {/* Stats row */}
                  <div className="flex flex-wrap gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{ebay.activeSlots}</p>
                      <p className="text-xs text-warm-500">active slots</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{ebay.queued}</p>
                      <p className="text-xs text-warm-500">queued</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{ebay.freeSlots}</p>
                      <p className="text-xs text-warm-500">free slots</p>
                    </div>
                  </div>

                  {/* Rotation toggle */}
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-100 dark:border-gray-600">
                    <button
                      onClick={() => queueSettingsMutation.mutate({ ebayQueueRotation: !ebay.queueRotation })}
                      disabled={queueSettingsMutation.isPending}
                      className={`relative flex-shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors mt-0.5 focus:outline-none disabled:opacity-50 ${
                        ebay.queueRotation ? 'bg-[#87A878]' : 'bg-warm-300 dark:bg-gray-500'
                      }`}
                      role="switch"
                      aria-checked={ebay.queueRotation}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${
                          ebay.queueRotation ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                    <div>
                      <p className="text-sm font-medium text-warm-900 dark:text-warm-100">
                        Auto-rotate oldest listings
                      </p>
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-0.5">
                        When all slots are full, cycle out your longest-unsold listings to give new items a chance. Rotates up to 10% of slots per cycle.
                      </p>
                    </div>
                  </div>

                  {/* Queue list placeholder / empty states */}
                  {ebay.queued === 0 && ebay.freeSlots > 0 && (
                    <div className="text-center py-8 text-warm-500 dark:text-warm-400">
                      <p className="text-sm">
                        You have <strong className="text-warm-900 dark:text-warm-100">{ebay.freeSlots}</strong> free listing slots.
                        Items you push to eBay go live immediately.
                      </p>
                    </div>
                  )}
                  {ebay.queued === 0 && ebay.freeSlots === 0 && (
                    <div className="text-center py-8 text-warm-500 dark:text-warm-400">
                      <p className="text-sm">
                        All slots are in use. Add items to the queue and they&apos;ll go live when a slot opens.
                      </p>
                    </div>
                  )}
                  {ebay.queued > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-3">
                        Items waiting in queue
                      </p>
                      <button
                        onClick={() => setGapPanel({ platform: 'ebay' })}
                        className="text-sm font-medium text-[#6b8f5e] dark:text-[#a8c49a] hover:text-[#87A878] transition-colors"
                      >
                        View all {ebay.queued} queued items &rarr;
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Section 4: Unlisted Inventory ─────────────────────────── */}
          {stats && stats.totals.totalUnlisted > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-xl p-6">
              <h2 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-1">
                Invisible Inventory &mdash; {stats.totals.totalUnlisted} items earning nothing online
              </h2>
              <p className="text-sm text-warm-500 dark:text-warm-400 mb-4">
                These items are not listed on any external platform.
              </p>

              {!unlistedInit ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="w-14 h-14 rounded-lg flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {unlistedItems.map((item: GapItem) => (
                    <div
                      key={item.id}
                      className="flex gap-3 p-3 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-100 dark:border-gray-600"
                    >
                      {/* Thumbnail */}
                      <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-warm-200 dark:bg-gray-600">
                        {item.primaryPhotoUrl ? (
                          <img
                            src={item.primaryPhotoUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-warm-400 text-xs">
                            No photo
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-warm-900 dark:text-warm-100 truncate">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.price != null && (
                            <span className="text-xs text-warm-600 dark:text-warm-400">
                              ${item.price.toFixed(2)}
                            </span>
                          )}
                          {item.saleTitle && (
                            <span className="text-xs text-warm-500 truncate max-w-[160px]">
                              {item.saleTitle}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quick actions */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {ebay?.connected && (
                          <button
                            onClick={() => addToQueueMutation.mutate([item.id])}
                            disabled={addToQueueMutation.isPending || !ebay.queueMode}
                            className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                              ebay.queueMode
                                ? 'bg-[#87A878] hover:bg-[#6b8f5e] text-white'
                                : 'bg-warm-200 dark:bg-gray-600 text-warm-400 cursor-not-allowed'
                            }`}
                            title={ebay.queueMode ? 'Add to eBay queue' : 'Enable Queue Mode to add items'}
                          >
                            {ebay.queueMode ? 'Queue' : 'eBay off'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Load More */}
                  {unlistedItems.length < unlistedTotal && (
                    <button
                      onClick={() => setUnlistedPage((p: number) => p + 1)}
                      disabled={unlistedFetching}
                      className="w-full py-3 text-sm font-medium text-[#6b8f5e] dark:text-[#a8c49a] hover:text-[#87A878] border border-[#a8c49a] dark:border-[#6b8f5e] rounded-lg hover:bg-[#87A878]/5 transition-colors disabled:opacity-50"
                    >
                      {unlistedFetching ? 'Loading...' : `Load More (${unlistedTotal - unlistedItems.length} remaining)`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
