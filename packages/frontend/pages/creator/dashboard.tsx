/**
 * Creator Dashboard (rewritten 2026-09-29 on the real Creator Program API).
 *
 * Numbers come from GET /api/affiliate/creator/dashboard (real clicks, purchases, commission by state).
 * Links are created with POST /api/affiliate/generate. Settings are saved with PATCH
 * /api/affiliate/creator/settings. Payout onboarding reuses the Square organizer endpoints.
 * Nothing here pays anyone: commissions are reviewed and paid by FindA.Sale (see /creator/terms).
 */

import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { CREATOR_PROGRAM_DISPLAY, formatCents } from '../../lib/creatorProgram';

type CommissionState = 'PENDING' | 'APPROVED' | 'PAID' | 'REVERSED';

interface CreatorProfile {
  code: string;
  displayName: string | null;
  status: string;
  notifyOnCommission: boolean;
  notifyWeeklySummary: boolean;
}

interface CreatorMe {
  joined: boolean;
  active: boolean;
  suspended: boolean;
  profile: CreatorProfile | null;
}

interface DashboardLink {
  id: string;
  saleId: string;
  url: string;
  clicks: number;
  conversions: number;
  commissionCents: number;
  createdAt: string;
  sale: { title: string; city: string | null; state: string | null } | null;
}

interface DashboardData {
  totals: {
    clicks: number;
    clicksLast30Days: number;
    links: number;
    conversions: number;
    grossSalesCents: number;
    commissionPendingCents: number;
    commissionApprovedCents: number;
    commissionPaidCents: number;
    commissionReversedCents: number;
  };
  links: DashboardLink[];
  recentConversions: Array<{
    id: string;
    saleTitle: string | null;
    purchaseAmountCents: number;
    commissionCents: number;
    state: CommissionState;
    createdAt: string;
    eligibleAt: string;
  }>;
  program: { commissionRatePercent: number; holdDays: number; termsVersion: string };
  profile: CreatorProfile | null;
}

interface PromotableSale {
  id: string;
  title: string;
  city: string | null;
  state: string | null;
  startDate: string | null;
  isOngoing: boolean;
}

interface SquareOrganizerStatus {
  squareOnboarded: boolean;
}

const SQUARE_ONBOARDING_FAILED_MESSAGE = "Couldn't start Square onboarding. Please try again.";

const STATE_STYLES: Record<CommissionState, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  REVERSED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

const STATE_LABELS: Record<CommissionState, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  PAID: 'Paid',
  REVERSED: 'Reversed',
};

const card = 'p-5 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-100 dark:border-gray-700';
const label = 'text-warm-600 dark:text-warm-400 text-sm font-medium';
const bigNumber = 'text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2';

const placeLine = (s: { city: string | null; state: string | null } | null) =>
  s ? [s.city, s.state].filter(Boolean).join(', ') : '';

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', text);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="text-sm bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded whitespace-nowrap"
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
};

const CreatorDashboard = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');

  // Link creation
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<{ url: string; title: string } | null>(null);

  // Settings
  const [displayName, setDisplayName] = useState('');
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!authLoading && !user) router.replace(`/login?redirect=${encodeURIComponent('/creator/dashboard')}`);
  }, [authLoading, user, router]);

  const meQuery = useQuery({
    queryKey: ['creator-me', user?.id],
    queryFn: async () => (await api.get('/affiliate/creator/me')).data as CreatorMe,
    enabled: !!user?.id,
  });
  const isActive = !!meQuery.data?.active;

  const dashQuery = useQuery({
    queryKey: ['creator-dashboard', user?.id],
    queryFn: async () => (await api.get('/affiliate/creator/dashboard')).data as DashboardData,
    enabled: !!user?.id && isActive,
  });

  const salesQuery = useQuery({
    queryKey: ['creator-promotable', debouncedSearch],
    queryFn: async () =>
      (await api.get('/affiliate/creator/promotable-sales', { params: { q: debouncedSearch || undefined, limit: 8 } }))
        .data.sales as PromotableSale[],
    enabled: !!user?.id && isActive,
  });

  const squareQuery = useQuery({
    queryKey: ['square-organizer-status', user?.id],
    queryFn: async () => (await api.get('/square-connect/organizer/status')).data as SquareOrganizerStatus,
    enabled: !!user?.id && isActive && activeTab === 'settings',
  });

  useEffect(() => {
    if (meQuery.data?.profile) setDisplayName(meQuery.data.profile.displayName ?? '');
  }, [meQuery.data?.profile]);

  const createLink = useMutation({
    mutationFn: async (sale: PromotableSale) => {
      const res = await api.post('/affiliate/generate', { saleId: sale.id });
      return { url: res.data.link as string, title: sale.title };
    },
    onSuccess: (result) => {
      setLinkError(null);
      setJustCreated(result);
      queryClient.invalidateQueries({ queryKey: ['creator-dashboard'] });
    },
    onError: (err: any) => {
      setJustCreated(null);
      setLinkError(err?.response?.data?.message || 'Could not create that link. Please try again.');
    },
  });

  const saveSettings = useMutation({
    mutationFn: async (patch: Partial<Pick<CreatorProfile, 'displayName' | 'notifyOnCommission' | 'notifyWeeklySummary'>>) =>
      (await api.patch('/affiliate/creator/settings', patch)).data,
    onSuccess: () => {
      setSettingsMessage('Saved.');
      queryClient.invalidateQueries({ queryKey: ['creator-me'] });
      queryClient.invalidateQueries({ queryKey: ['creator-dashboard'] });
    },
    onError: (err: any) => setSettingsMessage(err?.response?.data?.message || 'Could not save. Please try again.'),
  });

  const handleConnectSquare = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const response = await api.post('/square-connect/organizer/onboard');
      if (response.data?.onboardingUrl) {
        window.location.href = response.data.onboardingUrl;
        return;
      }
      if (response.data?.alreadyOnboarded) {
        squareQuery.refetch();
        return;
      }
      setConnectError(SQUARE_ONBOARDING_FAILED_MESSAGE);
    } catch (err: any) {
      setConnectError(err?.response?.data?.message || SQUARE_ONBOARDING_FAILED_MESSAGE);
    } finally {
      setConnecting(false);
    }
  };

  if (authLoading || !user || meQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <p className="text-warm-600 dark:text-warm-400" role="status">Loading...</p>
      </div>
    );
  }

  // Not a creator yet: point to the opt-in instead of bouncing to login.
  if (!isActive) {
    return (
      <>
        <Head>
          <title>Creator Dashboard | FindA.Sale</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center px-4">
          <div className={`${card} max-w-md w-full text-center`}>
            <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              {meQuery.data?.suspended ? 'Creator access suspended' : 'Join the Creator Program'}
            </h1>
            <p className="text-warm-700 dark:text-warm-300 mb-5">
              {meQuery.data?.suspended
                ? 'Contact support@finda.sale for details.'
                : 'Share links to public sales and earn a commission when shoppers you send buy something.'}
            </p>
            {!meQuery.data?.suspended && (
              <Link
                href="/creator/join"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-6 rounded-lg"
              >
                Learn more and join
              </Link>
            )}
          </div>
        </div>
      </>
    );
  }

  const dash = dashQuery.data;
  const rate = dash?.program.commissionRatePercent ?? CREATOR_PROGRAM_DISPLAY.COMMISSION_RATE_PERCENT;
  const holdDays = dash?.program.holdDays ?? CREATOR_PROGRAM_DISPLAY.HOLD_DAYS;
  const profile = meQuery.data?.profile ?? dash?.profile ?? null;

  return (
    <>
      <Head>
        <title>Creator Dashboard | FindA.Sale</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-1">Creator Dashboard</h1>
          <p className="text-warm-600 dark:text-warm-400 mb-6">
            Share sales, track results, and see what you have earned.{' '}
            <Link href="/creator/terms" className="text-amber-700 dark:text-amber-400 underline">
              Program terms
            </Link>
          </p>

          <div className="flex gap-4 mb-8 border-b border-warm-200 dark:border-gray-700" role="tablist">
            {(['overview', 'settings'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 font-medium capitalize ${
                  activeTab === tab
                    ? 'border-b-2 border-amber-600 text-amber-700 dark:text-amber-400'
                    : 'text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div>
              {dashQuery.isError && (
                <div className="p-5 mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-800 dark:text-red-200 mb-3">Failed to load your dashboard.</p>
                  <button
                    onClick={() => dashQuery.refetch()}
                    className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                  >
                    Retry
                  </button>
                </div>
              )}

              {dashQuery.isLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={`${card} animate-pulse`}>
                      <div className="h-4 bg-warm-200 dark:bg-gray-700 rounded w-1/2 mb-2" />
                      <div className="h-8 bg-warm-200 dark:bg-gray-700 rounded" />
                    </div>
                  ))}
                </div>
              ) : dash ? (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div className={card}>
                      <p className={label}>Clicks</p>
                      <p className={bigNumber}>{dash.totals.clicks.toLocaleString()}</p>
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                        {dash.totals.clicksLast30Days.toLocaleString()} in the last 30 days
                      </p>
                    </div>
                    <div className={card}>
                      <p className={label}>Purchases</p>
                      <p className={bigNumber}>{dash.totals.conversions.toLocaleString()}</p>
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                        {formatCents(dash.totals.grossSalesCents)} in sales
                      </p>
                    </div>
                    <div className={card}>
                      <p className={label}>Pending</p>
                      <p className={bigNumber}>{formatCents(dash.totals.commissionPendingCents)}</p>
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Held {holdDays} days</p>
                    </div>
                    <div className={card}>
                      <p className={label}>Approved</p>
                      <p className={bigNumber}>{formatCents(dash.totals.commissionApprovedCents)}</p>
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                        {formatCents(dash.totals.commissionPaidCents)} paid so far
                      </p>
                    </div>
                  </div>
                  {dash.totals.commissionReversedCents > 0 && (
                    <p className="text-xs text-warm-500 dark:text-warm-400 mb-4">
                      {formatCents(dash.totals.commissionReversedCents)} reversed because of refunds or disputes.
                    </p>
                  )}
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-8 text-sm text-warm-800 dark:text-warm-200">
                    You earn {rate}% of the platform fee on each purchase from your links. Commissions are held{' '}
                    {holdDays} days, then reviewed and paid by FindA.Sale. Your creator code is{' '}
                    <span className="font-mono font-semibold">{profile?.code}</span>.
                  </div>
                </>
              ) : null}

              {/* Create a link */}
              <div className={`${card} mb-8`}>
                <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-1">Create a link</h2>
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
                  Pick a public sale, get a link, and share it. Tell your audience it is an affiliate link.
                </p>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sales by title, city, or state"
                  aria-label="Search sales"
                  className="w-full rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-warm-900 dark:text-warm-100 px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {justCreated && (
                  <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                      Link ready for {justCreated.title}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <code className="text-xs break-all text-green-900 dark:text-green-100 flex-1">{justCreated.url}</code>
                      <CopyButton text={justCreated.url} />
                    </div>
                  </div>
                )}
                {linkError && (
                  <p className="mb-4 text-sm text-red-700 dark:text-red-300" role="alert">
                    {linkError}
                  </p>
                )}
                {salesQuery.isLoading ? (
                  <p className="text-sm text-warm-600 dark:text-warm-400">Loading sales...</p>
                ) : salesQuery.data && salesQuery.data.length > 0 ? (
                  <ul className="divide-y divide-warm-100 dark:divide-gray-700">
                    {salesQuery.data.map((sale) => (
                      <li key={sale.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-warm-900 dark:text-warm-100 truncate">{sale.title}</p>
                          <p className="text-xs text-warm-500 dark:text-warm-400">
                            {placeLine(sale)}
                            {sale.startDate ? ` · ${new Date(sale.startDate).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => createLink.mutate(sale)}
                          disabled={createLink.isPending}
                          className="text-sm border border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 px-3 py-1.5 rounded disabled:opacity-60 whitespace-nowrap self-start sm:self-auto"
                        >
                          Get link
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-warm-600 dark:text-warm-400">
                    {debouncedSearch
                      ? 'No upcoming or live public sales match that search.'
                      : 'No upcoming or live public sales are available to promote right now. Check back soon.'}
                  </p>
                )}
              </div>

              {/* Your links */}
              <div className={`${card} mb-8`}>
                <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Your links</h2>
                {dash && dash.links.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead>
                        <tr className="border-b border-warm-200 dark:border-gray-700 text-left">
                          <th className="py-2 text-warm-600 dark:text-warm-400 font-medium">Sale</th>
                          <th className="py-2 text-right text-warm-600 dark:text-warm-400 font-medium">Clicks</th>
                          <th className="py-2 text-right text-warm-600 dark:text-warm-400 font-medium">Purchases</th>
                          <th className="py-2 text-right text-warm-600 dark:text-warm-400 font-medium">Earned</th>
                          <th className="py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {dash.links.map((l) => (
                          <tr key={l.id} className="border-b border-warm-100 dark:border-gray-700">
                            <td className="py-3 text-warm-900 dark:text-warm-100">
                              <Link href={`/sales/${l.saleId}`} className="hover:underline">
                                {l.sale?.title ?? 'Sale'}
                              </Link>
                              <span className="block text-xs text-warm-500 dark:text-warm-400">{placeLine(l.sale)}</span>
                            </td>
                            <td className="py-3 text-right text-warm-800 dark:text-warm-200">{l.clicks}</td>
                            <td className="py-3 text-right text-warm-800 dark:text-warm-200">{l.conversions}</td>
                            <td className="py-3 text-right text-warm-800 dark:text-warm-200">{formatCents(l.commissionCents)}</td>
                            <td className="py-3 text-right">
                              <CopyButton text={l.url} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-warm-600 dark:text-warm-400 text-center py-6">
                    {dashQuery.isLoading ? 'Loading...' : 'No links yet. Create your first one above.'}
                  </p>
                )}
              </div>

              {/* Commission activity */}
              <div className={card}>
                <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Recent commissions</h2>
                {dash && dash.recentConversions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[520px]">
                      <thead>
                        <tr className="border-b border-warm-200 dark:border-gray-700 text-left">
                          <th className="py-2 text-warm-600 dark:text-warm-400 font-medium">Date</th>
                          <th className="py-2 text-warm-600 dark:text-warm-400 font-medium">Sale</th>
                          <th className="py-2 text-right text-warm-600 dark:text-warm-400 font-medium">Purchase</th>
                          <th className="py-2 text-right text-warm-600 dark:text-warm-400 font-medium">Commission</th>
                          <th className="py-2 text-right text-warm-600 dark:text-warm-400 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dash.recentConversions.map((c) => (
                          <tr key={c.id} className="border-b border-warm-100 dark:border-gray-700">
                            <td className="py-3 text-warm-600 dark:text-warm-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                            <td className="py-3 text-warm-900 dark:text-warm-100">{c.saleTitle ?? 'Sale'}</td>
                            <td className="py-3 text-right text-warm-800 dark:text-warm-200">{formatCents(c.purchaseAmountCents)}</td>
                            <td className="py-3 text-right text-warm-800 dark:text-warm-200">{formatCents(c.commissionCents)}</td>
                            <td className="py-3 text-right">
                              <span className={`inline-block text-xs font-semibold px-2 py-1 rounded ${STATE_STYLES[c.state]}`}>
                                {STATE_LABELS[c.state]}
                              </span>
                              {c.state === 'PENDING' && (
                                <span className="block text-xs text-warm-500 dark:text-warm-400 mt-1">
                                  Approved {new Date(c.eligibleAt).toLocaleDateString()}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-warm-600 dark:text-warm-400 text-center py-6">
                    No commissions yet. They appear here when someone buys through one of your links.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className={card}>
                <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Profile</h2>
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-3">
                  Creator code: <span className="font-mono font-semibold text-warm-900 dark:text-warm-100">{profile?.code}</span>
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSettingsMessage(null);
                    saveSettings.mutate({ displayName: displayName.trim() });
                  }}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <input
                    type="text"
                    value={displayName}
                    maxLength={60}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Display name"
                    aria-label="Display name"
                    className="flex-1 rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-warm-900 dark:text-warm-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={saveSettings.isPending}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-5 rounded-lg disabled:opacity-60"
                  >
                    Save
                  </button>
                </form>
                {settingsMessage && (
                  <p className="text-sm text-warm-700 dark:text-warm-300 mt-3" role="status">
                    {settingsMessage}
                  </p>
                )}
              </div>

              <div className={card}>
                <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Notifications</h2>
                <div className="space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!profile?.notifyOnCommission}
                      onChange={(e) => {
                        setSettingsMessage(null);
                        saveSettings.mutate({ notifyOnCommission: e.target.checked });
                      }}
                      className="mt-1 w-4 h-4 rounded border-warm-300 dark:border-gray-600 text-amber-600"
                    />
                    <span>
                      <span className="block font-medium text-warm-900 dark:text-warm-100">New commissions</span>
                      <span className="block text-xs text-warm-600 dark:text-warm-400">
                        Get notified when a purchase from your link earns a commission
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!profile?.notifyWeeklySummary}
                      onChange={(e) => {
                        setSettingsMessage(null);
                        saveSettings.mutate({ notifyWeeklySummary: e.target.checked });
                      }}
                      className="mt-1 w-4 h-4 rounded border-warm-300 dark:border-gray-600 text-amber-600"
                    />
                    <span>
                      <span className="block font-medium text-warm-900 dark:text-warm-100">Weekly summary</span>
                      <span className="block text-xs text-warm-600 dark:text-warm-400">
                        A Monday digest of clicks, purchases, and commissions
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className={card}>
                <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Payouts</h2>
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
                  Approved commissions are reviewed and paid by FindA.Sale. Connecting Square now means we can pay you
                  without asking for details later.
                </p>
                {squareQuery.isLoading ? (
                  <p className="text-sm text-warm-600 dark:text-warm-400">Checking Square status...</p>
                ) : squareQuery.data?.squareOnboarded ? (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-4">
                    <p className="text-green-800 dark:text-green-200 font-semibold">Square connected</p>
                  </div>
                ) : (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-4">
                    <p className="text-yellow-800 dark:text-yellow-200 font-semibold mb-3">Payout account not connected</p>
                    <button
                      onClick={handleConnectSquare}
                      disabled={connecting}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-6 rounded transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {connecting ? 'Connecting...' : 'Connect Square'}
                    </button>
                    {connectError && <p className="text-yellow-800 dark:text-yellow-200 text-sm mt-3">{connectError}</p>}
                  </div>
                )}
                {squareQuery.isError && (
                  <p className="text-sm text-red-700 dark:text-red-300 mt-3">
                    Could not check Square status.{' '}
                    <button onClick={() => squareQuery.refetch()} className="underline">
                      Retry
                    </button>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CreatorDashboard;
