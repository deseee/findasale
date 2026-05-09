/**
 * Scrape Pool Analytics Dashboard
 * Displays statistics about scraped (unmanaged) listings and enrichment coverage
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';

interface ScrapePoolStats {
  totalScrapedOrgs: number;
  tierDistribution: {
    COLD: number;
    WARM: number;
    HOT: number;
    ENTERPRISE: number;
  };
  leadScoreStats: {
    min: number;
    max: number;
    avg: number;
    median: number;
  };
  enrichmentCoverage: {
    withEmail: number;
    geocoded: number;
    licensed: number;
    googlePlaced: number;
  };
  outreachStatus: {
    contacted: number;
    opened: number;
    bounced: number;
  };
  lastScrapeRuns: Record<string, string>;
  recentAdditions: Array<{
    id: string;
    businessName: string;
    address: string;
    leadTier: string;
    leadScore: number | null;
    scrapedEmail: string | null;
    directoryMostRecentSource: string | null;
    createdAt: string;
  }>;
}

export default function ScrapePoolDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [stats, setStats] = useState<ScrapePoolStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Check admin status
  useEffect(() => {
    if (!authLoading && user?.role !== 'ADMIN') {
      window.location.href = '/';
      return;
    }
  }, [user, authLoading]);

  // Load stats
  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/scrape-pool-stats');
      if (!res.ok) throw new Error('Failed to load stats');

      const data: ScrapePoolStats = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load scrape pool stats:', error);
      showToast('Failed to load stats', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return <div className="p-8 dark:text-white">Loading scrape pool dashboard...</div>;
  }

  const tierLabels = ['COLD', 'WARM', 'HOT', 'ENTERPRISE'];
  const tierColors = {
    COLD: '#6B7280',
    WARM: '#F59E0B',
    HOT: '#EF4444',
    ENTERPRISE: '#8B5CF6',
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <h1 className="text-3xl font-bold mb-2 dark:text-white">Scrape Pool Dashboard</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Analytics for unmanaged (scraped) listings</p>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Total Scraped Orgs</h3>
          <p className="text-3xl font-bold dark:text-white">{stats.totalScrapedOrgs.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Avg Lead Score</h3>
          <p className="text-3xl font-bold dark:text-white">{stats.leadScoreStats.avg.toFixed(1)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Range: {stats.leadScoreStats.min} – {stats.leadScoreStats.max}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">With Email</h3>
          <p className="text-3xl font-bold dark:text-white">{stats.enrichmentCoverage.withEmail}%</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Geocoded</h3>
          <p className="text-3xl font-bold dark:text-white">{stats.enrichmentCoverage.geocoded}%</p>
        </div>
      </div>

      {/* Tier Distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 dark:text-white">Lead Tier Distribution</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {tierLabels.map((tier) => (
            <div key={tier} className="text-center">
              <div
                className="w-full h-32 rounded flex items-end justify-center overflow-hidden mb-2"
                style={{ backgroundColor: tierColors[tier as keyof typeof tierColors] + '20' }}
              >
                <div
                  className="w-full"
                  style={{
                    height: `${
                      Math.max(...tierLabels.map((t) => stats.tierDistribution[t as keyof typeof stats.tierDistribution]))
                        ? (stats.tierDistribution[tier as keyof typeof stats.tierDistribution] /
                            Math.max(...tierLabels.map((t) => stats.tierDistribution[t as keyof typeof stats.tierDistribution]))) *
                          100
                        : 0
                    }%`,
                    backgroundColor: tierColors[tier as keyof typeof tierColors],
                  }}
                />
              </div>
              <p className="font-semibold dark:text-white">{tier}</p>
              <p className="text-2xl font-bold dark:text-white">
                {stats.tierDistribution[tier as keyof typeof stats.tierDistribution]}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Enrichment Coverage */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 dark:text-white">Enrichment Coverage</h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium dark:text-white">Email Available</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{stats.enrichmentCoverage.withEmail}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full"
                style={{ width: `${stats.enrichmentCoverage.withEmail}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium dark:text-white">Geocoded (Lat/Lng)</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{stats.enrichmentCoverage.geocoded}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{ width: `${stats.enrichmentCoverage.geocoded}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium dark:text-white">State Licensed</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{stats.enrichmentCoverage.licensed}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full"
                style={{ width: `${stats.enrichmentCoverage.licensed}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium dark:text-white">Google PlaceId</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{stats.enrichmentCoverage.googlePlaced}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-orange-500 h-2 rounded-full"
                style={{ width: `${stats.enrichmentCoverage.googlePlaced}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Outreach Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 dark:text-white">Outreach Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border-l-4 border-blue-500 pl-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Contacted (SENT)</p>
            <p className="text-2xl font-bold dark:text-white">{stats.outreachStatus.contacted.toLocaleString()}</p>
          </div>
          <div className="border-l-4 border-green-500 pl-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Opened</p>
            <p className="text-2xl font-bold dark:text-white">{stats.outreachStatus.opened.toLocaleString()}</p>
          </div>
          <div className="border-l-4 border-red-500 pl-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Bounced</p>
            <p className="text-2xl font-bold dark:text-white">{stats.outreachStatus.bounced.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Last Scrape Runs */}
      {Object.keys(stats.lastScrapeRuns).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4 dark:text-white">Last Scrape Runs by Source</h2>
          <div className="space-y-2">
            {Object.entries(stats.lastScrapeRuns).map(([source, timestamp]) => (
              <div key={source} className="flex justify-between text-sm p-2 border-b dark:border-gray-700">
                <span className="font-medium dark:text-white">{source}</span>
                <span className="text-gray-600 dark:text-gray-400">{new Date(timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Additions Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 dark:text-white">Recent Additions (Last 50)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b dark:border-gray-700">
              <tr>
                <th className="text-left p-3 font-semibold dark:text-white">Business Name</th>
                <th className="text-left p-3 font-semibold dark:text-white">City</th>
                <th className="text-left p-3 font-semibold dark:text-white">Tier</th>
                <th className="text-left p-3 font-semibold dark:text-white">Score</th>
                <th className="text-left p-3 font-semibold dark:text-white">Email</th>
                <th className="text-left p-3 font-semibold dark:text-white">Source</th>
                <th className="text-left p-3 font-semibold dark:text-white">Added</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentAdditions.map((org) => (
                <tr key={org.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="p-3 dark:text-white">{org.businessName}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">{org.address}</td>
                  <td className="p-3">
                    <span
                      className="px-2 py-1 rounded text-xs font-semibold text-white"
                      style={{ backgroundColor: tierColors[org.leadTier as keyof typeof tierColors] || '#999' }}
                    >
                      {org.leadTier}
                    </span>
                  </td>
                  <td className="p-3 dark:text-white">{org.leadScore !== null ? org.leadScore : '—'}</td>
                  <td className="p-3 text-xs text-gray-600 dark:text-gray-400">
                    {org.scrapedEmail ? (
                      <a href={`mailto:${org.scrapedEmail}`} className="text-blue-500 hover:underline">
                        {org.scrapedEmail.substring(0, 20)}...
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">{org.directoryMostRecentSource || '—'}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">{new Date(org.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.recentAdditions.length === 0 && (
            <p className="p-6 text-center text-gray-600 dark:text-gray-400">No recent additions</p>
          )}
        </div>
      </div>
    </div>
  );
}
