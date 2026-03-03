import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Skeleton from '../../components/Skeleton';

interface AffiliateLink {
  id: string;
  saleId: string;
  clicks: number;
  createdAt: string;
  sale: {
    title: string;
    startDate: string;
    endDate: string;
  };
}

interface Sale {
  id: string;
  title: string;
  city: string;
  state: string;
  startDate: string;
  endDate: string;
}

interface CreatorStats {
  totalLinks: number;
  totalClicks: number;
}

const CreatorDashboard = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [generateSaleId, setGenerateSaleId] = useState('');
  const [saleSearch, setSaleSearch] = useState('');

  const isCreator = user?.role === 'CREATOR' || user?.role === 'ADMIN';

  // Fetch creator's affiliate links (CREATOR only)
  const { data: affiliateLinks = [], isLoading: linksLoading } = useQuery({
    queryKey: ['affiliate-links'],
    queryFn: async () => {
      const response = await api.get('/affiliate/links');
      return response.data as AffiliateLink[];
    },
    enabled: !!user && isCreator,
  });

  // Fetch creator stats (CREATOR only)
  const { data: stats, isLoading: statsLoading } = useQuery<CreatorStats>({
    queryKey: ['creator-stats'],
    queryFn: async () => {
      const response = await api.get('/affiliate/stats');
      return response.data;
    },
    enabled: !!user && isCreator,
  });

  // Fetch recent published sales for link generation
  const { data: recentSales = [] } = useQuery({
    queryKey: ['recent-sales-for-creator'],
    queryFn: async () => {
      const response = await api.get('/sales');
      const sales = response.data.sales ?? response.data;
      return (Array.isArray(sales) ? sales : []) as Sale[];
    },
    enabled: !!user && isCreator,
  });

  // Generate affiliate link mutation
  const generateMutation = useMutation({
    mutationFn: async (saleId: string) => {
      const response = await api.post('/affiliate/generate', { saleId });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['affiliate-links'] });
      queryClient.invalidateQueries({ queryKey: ['creator-stats'] });
      setGenerateSaleId('');
      setSaleSearch('');
      if (data.link) {
        navigator.clipboard.writeText(data.link).catch(() => {});
        showToast('Link generated and copied to clipboard!', 'success');
      } else {
        showToast('Affiliate link generated!', 'success');
      }
    },
    onError: () => {
      showToast('Failed to generate link. Make sure the sale exists.', 'error');
    },
  });

  const copyToClipboard = (text: string, label = 'Link') => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`${label} copied to clipboard!`, 'success');
    }).catch(() => {
      showToast('Could not copy — please copy manually.', 'error');
    });
  };

  const [origin, setOrigin] = React.useState('https://finda.sale');
  React.useEffect(() => { setOrigin(window.location.origin); }, []);

  const referralLink = user?.referralCode
    ? `${origin}/register?ref=${user.referralCode}`
    : null;

  const affiliateLinkUrl = (linkId: string) => `${origin}/affiliate/${linkId}`;

  const filteredSales = recentSales.filter(s =>
    saleSearch === '' ||
    s.title.toLowerCase().includes(saleSearch.toLowerCase()) ||
    (s.city && s.city.toLowerCase().includes(saleSearch.toLowerCase()))
  );

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please log in to view your creator dashboard.</p>
          <Link href="/login?redirect=/creator/dashboard" className="bg-blue-600 text-white px-4 py-2 rounded">
            Log In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Creator Dashboard - FindA.Sale</title>
        <meta name="description" content="Manage your referral links, track affiliate clicks, and grow your earnings on FindA.Sale." />
        <meta name="robots" content="noindex" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Creator Dashboard</h1>
          <p className="text-gray-600 mt-1">Share sales, earn referrals, track your impact.</p>
        </div>

        {/* Referral Link — available to all users */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 mb-8 text-white">
          <h2 className="text-xl font-bold mb-1">Your Referral Link</h2>
          <p className="text-blue-100 text-sm mb-4">
            Share this link. When someone registers through it, you both get credit.
          </p>
          {referralLink ? (
            <div className="flex items-center gap-3 flex-wrap">
              <code className="bg-white/20 rounded px-3 py-2 text-sm flex-1 truncate font-mono min-w-0">
                {referralLink}
              </code>
              <button
                onClick={() => copyToClipboard(referralLink, 'Referral link')}
                className="bg-white text-blue-600 font-bold px-4 py-2 rounded hover:bg-blue-50 transition-colors whitespace-nowrap flex-shrink-0"
              >
                Copy
              </button>
            </div>
          ) : (
            <p className="text-blue-100 text-sm">Referral code not available — try logging out and back in.</p>
          )}
        </div>

        {/* Stats Row — CREATOR only */}
        {isCreator && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {statsLoading ? (
              <>
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </>
            ) : (
              <>
                <div className="bg-white rounded-lg shadow-md p-6">
                  <p className="text-sm text-gray-500 mb-1">Affiliate Links</p>
                  <p className="text-3xl font-bold text-blue-600">{stats?.totalLinks ?? 0}</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6">
                  <p className="text-sm text-gray-500 mb-1">Total Clicks</p>
                  <p className="text-3xl font-bold text-green-600">{stats?.totalClicks ?? 0}</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6">
                  <p className="text-sm text-gray-500 mb-1">Avg Clicks / Link</p>
                  <p className="text-3xl font-bold text-purple-600">
                    {stats?.totalLinks
                      ? ((stats.totalClicks ?? 0) / stats.totalLinks).toFixed(1)
                      : '—'}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Affiliate Links + Generate — CREATOR only */}
        {isCreator ? (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Affiliate Links</h2>

            {/* Generate new link inline */}
            <div className="border rounded-lg p-4 bg-gray-50 mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">Generate a link for a sale</h3>
              <input
                type="text"
                placeholder="Search sales by name or city…"
                value={saleSearch}
                onChange={e => { setSaleSearch(e.target.value); setGenerateSaleId(''); }}
                className="border border-gray-300 rounded px-3 py-2 text-sm w-full text-gray-900 mb-2"
              />
              {saleSearch.length > 1 && filteredSales.length > 0 && (
                <ul className="border rounded bg-white shadow-sm max-h-48 overflow-y-auto mb-2">
                  {filteredSales.slice(0, 8).map(sale => (
                    <li key={sale.id}>
                      <button
                        onClick={() => {
                          setGenerateSaleId(sale.id);
                          setSaleSearch(sale.title);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors ${
                          generateSaleId === sale.id ? 'bg-blue-100 font-medium text-blue-800' : 'text-gray-800'
                        }`}
                      >
                        {sale.title}
                        <span className="text-gray-500 ml-2 text-xs">
                          {sale.city}, {sale.state} · {format(new Date(sale.startDate), 'MMM d')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {saleSearch.length > 1 && filteredSales.length === 0 && (
                <p className="text-sm text-gray-500 mb-2">No matching sales found.</p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => generateSaleId && generateMutation.mutate(generateSaleId)}
                  disabled={!generateSaleId || generateMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generateMutation.isPending ? 'Generating…' : 'Generate & Copy Link'}
                </button>
                {(generateSaleId || saleSearch) && (
                  <button
                    onClick={() => { setGenerateSaleId(''); setSaleSearch(''); }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Links table */}
            {linksLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : affiliateLinks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="mb-1">No affiliate links yet.</p>
                <p className="text-sm">Search for a sale above and generate your first link to start tracking clicks.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dates</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Clicks</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {affiliateLinks.map(link => (
                      <tr key={link.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          <Link href={`/sales/${link.saleId}`} className="hover:underline text-blue-600">
                            {link.sale.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {format(new Date(link.sale.startDate), 'MMM d')} –{' '}
                          {format(new Date(link.sale.endDate), 'MMM d, yyyy')}
                        </td>
                        <td className="px-4 py-3 text-sm text-center font-semibold text-gray-900">
                          {link.clicks}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => copyToClipboard(affiliateLinkUrl(link.id), 'Affiliate link')}
                            className="text-blue-600 hover:text-blue-800 font-medium mr-4"
                          >
                            Copy Link
                          </button>
                          <Link
                            href={`/sales/${link.saleId}`}
                            className="text-gray-500 hover:text-gray-700"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View Sale
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Non-CREATOR: explain the program */
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Become a Creator</h2>
            <p className="text-gray-600 mb-6">
              Creators get access to affiliate links, click tracking, and conversion dashboards.
              Share your referral link above to get started — reach out to us at{' '}
              <a href="mailto:hello@finda.sale" className="text-blue-600 hover:underline">
                hello@finda.sale
              </a>{' '}
              to upgrade your account.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { icon: '🔗', title: 'Trackable Links', desc: 'Generate unique affiliate links for any sale. Every click is counted.' },
                { icon: '📊', title: 'Click Analytics', desc: 'See total clicks per link and overall performance at a glance.' },
                { icon: '💸', title: 'Referral Earnings', desc: 'Earn credit when people you refer sign up and make purchases.' },
              ].map(item => (
                <div key={item.title} className="border rounded-lg p-4 bg-gray-50">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <h3 className="font-semibold text-gray-800 mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How referrals work */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">How referrals work</h2>
          <ol className="space-y-4 text-gray-700">
            <li className="flex gap-3">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">1</span>
              <span>Copy your referral link above and share it in social posts, emails, or anywhere online.</span>
            </li>
            <li className="flex gap-3">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">2</span>
              <span>When someone registers using your link, they're tracked as your referral automatically.</span>
            </li>
            <li className="flex gap-3">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">3</span>
              <span>Referral earnings and credit redemption are coming soon. Your referrals are already being tracked.</span>
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
};

export default CreatorDashboard;
