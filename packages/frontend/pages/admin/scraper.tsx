/**
 * ADR-073: Directory Scraper — Admin Dashboard
 * Manages scraper sources, triggers runs, views statistics
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';

interface Source {
  source: string;
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: string;
  recentJobCount?: number;
  recentItemsCreated?: number;
}

interface ScrapeRun {
  id: number;
  source: string;
  metro: string;
  status: string;
  itemsFound: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  itemsFailed: number;
  startedAt: string;
  completedAt?: string;
}

interface ScrapedSale {
  id: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  organizer: { name: string; isClaimed: boolean };
  claimEmails: Array<{ sentAt: string; claimed: boolean }>;
}

function getCsrfToken(): string {
  return document.cookie
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('csrf-token='))
    ?.split('=')[1] ?? '';
}

export default function ScraperAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [sources, setSources] = useState<Source[]>([]);
  const [runs, setRuns] = useState<ScrapeRun[]>([]);
  const [sales, setSales] = useState<ScrapedSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState('EstateSalesNet');
  const [selectedMetro, setSelectedMetro] = useState('grand-rapids-mi');
  const [triggering, setTriggering] = useState(false);

  // Check admin status — wait for auth to resolve before redirecting
  useEffect(() => {
    if (!authLoading && user?.role !== 'ADMIN') {
      window.location.href = '/';
      return;
    }
  }, [user, authLoading]);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sourcesRes, runsRes, salesRes] = await Promise.all([
        fetch('/api/admin/scraper/sources'),
        fetch('/api/admin/scraper/runs?limit=20'),
        fetch('/api/admin/scraper/sales?limit=20'),
      ]);

      if (!sourcesRes.ok || !runsRes.ok || !salesRes.ok) throw new Error('Failed to load data');

      const sourcesData = await sourcesRes.json();
      const runsData = await runsRes.json();
      const salesData = await salesRes.json();

      setSources(sourcesData.sources ?? []);
      setRuns(runsData.jobs ?? []);
      setSales(salesData.sales ?? []);
    } catch (error) {
      console.error('Failed to load scraper data:', error);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerScrape = async () => {
    try {
      setTriggering(true);
      const res = await fetch('/api/admin/scraper/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ source: selectedSource, metro: selectedMetro }),
      });

      if (!res.ok) throw new Error('Failed to trigger scrape');

      showToast(`Scrape triggered for ${selectedSource} in ${selectedMetro}`, 'success');
      setTriggering(false);

      // Refresh data
      setTimeout(loadData, 2000);
    } catch (error) {
      console.error('Failed to trigger scrape:', error);
      showToast('Failed to trigger scrape', 'error');
      setTriggering(false);
    }
  };

  const handleTakedown = async (source: string) => {
    if (!confirm(`Are you sure you want to disable ${source} and hide all its listings?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/scraper/takedown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ source }),
      });

      if (!res.ok) throw new Error('Takedown failed');

      const data = await res.json();
      showToast(`${data.count} listings from ${source} have been disabled`, 'success');
      loadData();
    } catch (error) {
      console.error('Takedown failed:', error);
      showToast('Takedown failed', 'error');
    }
  };

  if (loading) {
    return <div className="p-8 dark:text-white">Loading scraper dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <h1 className="text-3xl font-bold mb-8 dark:text-white">Directory Scraper Management</h1>

      {/* Sources Status Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8 p-6">
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">Sources</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b dark:border-gray-700">
              <th className="text-left p-3 dark:text-white">Source</th>
              <th className="text-left p-3 dark:text-white">Status</th>
              <th className="text-left p-3 dark:text-white">Last Run</th>
              <th className="text-left p-3 dark:text-white">Action</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.source} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="p-3 dark:text-white">{source.source}</td>
                <td className="p-3">
                  <span
                    className={`px-3 py-1 rounded text-sm ${
                      source.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {source.enabled ? 'Allowed' : 'Blocked'}
                  </span>
                </td>
                <td className="p-3 dark:text-white">
                  {source.lastRunAt ? new Date(source.lastRunAt).toLocaleString() : 'Never'}
                </td>
                <td className="p-3">
                  {source.enabled && (
                    <button
                      onClick={() => handleTakedown(source.source)}
                      className="text-red-600 hover:text-red-800 font-semibold"
                    >
                      Emergency Takedown
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Trigger Scrape Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8 p-6">
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">Trigger Scrape</h2>
        <div className="flex gap-4 mb-4">
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="px-4 py-2 border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
          >
            {(sources.length > 0 ? sources : [{ source: 'EstateSalesNet' }, { source: 'GarageSaleFinder' }]).map((s) => (
              <option key={s.source} value={s.source}>
                {s.source}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={selectedMetro}
            onChange={(e) => setSelectedMetro(e.target.value)}
            className="px-4 py-2 border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white flex-1"
            placeholder="Metro slug (e.g., grand-rapids-mi)"
            aria-label="Metro slug (e.g., grand-rapids-mi)" />
          <button
            onClick={handleTriggerScrape}
            disabled={triggering}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {triggering ? 'Triggering...' : 'Trigger'}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">Metro format: kebab-slug-state (e.g. grand-rapids-mi, chicago-il, new-york-ny)</p>
      </div>

      {/* Recent Runs Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8 p-6">
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">Recent Scrape Runs</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b dark:border-gray-700">
              <th className="text-left p-3 dark:text-white">Source</th>
              <th className="text-left p-3 dark:text-white">Metro</th>
              <th className="text-left p-3 dark:text-white">Status</th>
              <th className="text-right p-3 dark:text-white">Created</th>
              <th className="text-right p-3 dark:text-white">Updated</th>
              <th className="text-right p-3 dark:text-white">Skipped</th>
              <th className="text-right p-3 dark:text-white">Failed</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="p-3 dark:text-white">{run.source}</td>
                <td className="p-3 dark:text-white">{run.metro}</td>
                <td className="p-3">
                  <span
                    className={`px-3 py-1 rounded text-sm ${
                      run.status === 'SUCCESS'
                        ? 'bg-green-100 text-green-800'
                        : run.status === 'FAILED'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {run.status}
                  </span>
                </td>
                <td className="text-right p-3 dark:text-white">{run.itemsCreated}</td>
                <td className="text-right p-3 dark:text-white">{run.itemsUpdated}</td>
                <td className="text-right p-3 dark:text-white">{run.itemsSkipped}</td>
                <td className="text-right p-3 text-red-600 dark:text-red-400">{run.itemsFailed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scraped Sales Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">Scraped Sales Overview</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">Showing {sales.length} recent scraped listings</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b dark:border-gray-700">
              <th className="text-left p-3 dark:text-white">Title</th>
              <th className="text-left p-3 dark:text-white">Source</th>
              <th className="text-left p-3 dark:text-white">Organizer</th>
              <th className="text-left p-3 dark:text-white">Claimed</th>
              <th className="text-left p-3 dark:text-white">Email Sent</th>
            </tr>
          </thead>
          <tbody>
            {sales.slice(0, 10).map((sale) => (
              <tr key={sale.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="p-3 truncate dark:text-white">{sale.title}</td>
                <td className="p-3 text-sm dark:text-white">{sale.sourceName}</td>
                <td className="p-3">
                  <span className={sale.organizer.isClaimed ? 'text-green-600' : 'text-gray-500 dark:text-gray-400'}>
                    {sale.organizer.name}
                  </span>
                </td>
                <td className="p-3">
                  {sale.organizer.isClaimed ? (
                    <span className="text-green-600 font-semibold">✓ Claimed</span>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">Unclaimed</span>
                  )}
                </td>
                <td className="p-3">
                  {sale.claimEmails?.[0] ? (
                    <span className={sale.claimEmails[0].claimed ? 'text-green-600' : 'text-yellow-600'}>
                      {sale.claimEmails[0].claimed ? 'Claimed' : 'Sent'}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">Not sent</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
