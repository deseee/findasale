/**
 * ADR-073: Directory Scraper — Admin Dashboard
 * Manages scraper sources, triggers runs, views statistics
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';

interface Source {
  name: string;
  allowed: boolean;
  baseUrl: string;
  lastRun?: string;
  status?: string;
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

export default function ScraperAdminPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [sources, setSources] = useState<Source[]>([]);
  const [runs, setRuns] = useState<ScrapeRun[]>([]);
  const [sales, setSales] = useState<ScrapedSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState('EstateSalesNet');
  const [selectedMetro, setSelectedMetro] = useState('Grand Rapids, MI');
  const [triggering, setTriggering] = useState(false);

  // Check admin status
  useEffect(() => {
    if (!user?.roles?.includes('ADMIN')) {
      window.location.href = '/';
      return;
    }
  }, [user]);

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

      setSources(sourcesData);
      setRuns(runsData.runs);
      setSales(salesData.sales);
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
    return <div className="p-8">Loading scraper dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-8">Directory Scraper Management</h1>

      {/* Sources Status Section */}
      <div className="bg-white rounded-lg shadow mb-8 p-6">
        <h2 className="text-2xl font-semibold mb-4">Sources</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3">Source</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Last Run</th>
              <th className="text-left p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.name} className="border-b hover:bg-gray-50">
                <td className="p-3">{source.name}</td>
                <td className="p-3">
                  <span
                    className={`px-3 py-1 rounded text-sm ${
                      source.allowed
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {source.allowed ? 'Allowed' : 'Blocked'}
                  </span>
                </td>
                <td className="p-3">
                  {source.lastRun ? new Date(source.lastRun).toLocaleString() : 'Never'}
                </td>
                <td className="p-3">
                  {source.allowed && (
                    <button
                      onClick={() => handleTakedown(source.name)}
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
      <div className="bg-white rounded-lg shadow mb-8 p-6">
        <h2 className="text-2xl font-semibold mb-4">Trigger Scrape</h2>
        <div className="flex gap-4 mb-4">
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="px-4 py-2 border rounded"
          >
            {sources.filter((s) => s.allowed).map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={selectedMetro}
            onChange={(e) => setSelectedMetro(e.target.value)}
            className="px-4 py-2 border rounded flex-1"
            placeholder="Metro (e.g., Grand Rapids, MI)"
          />
          <button
            onClick={handleTriggerScrape}
            disabled={triggering}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {triggering ? 'Triggering...' : 'Trigger'}
          </button>
        </div>
      </div>

      {/* Recent Runs Section */}
      <div className="bg-white rounded-lg shadow mb-8 p-6">
        <h2 className="text-2xl font-semibold mb-4">Recent Scrape Runs</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3">Source</th>
              <th className="text-left p-3">Metro</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Created</th>
              <th className="text-right p-3">Updated</th>
              <th className="text-right p-3">Skipped</th>
              <th className="text-right p-3">Failed</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-b hover:bg-gray-50">
                <td className="p-3">{run.source}</td>
                <td className="p-3">{run.metro}</td>
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
                <td className="text-right p-3">{run.itemsCreated}</td>
                <td className="text-right p-3">{run.itemsUpdated}</td>
                <td className="text-right p-3">{run.itemsSkipped}</td>
                <td className="text-right p-3 text-red-600">{run.itemsFailed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scraped Sales Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold mb-4">Scraped Sales Overview</h2>
        <p className="text-gray-600 mb-4">Showing {sales.length} recent scraped listings</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3">Title</th>
              <th className="text-left p-3">Source</th>
              <th className="text-left p-3">Organizer</th>
              <th className="text-left p-3">Claimed</th>
              <th className="text-left p-3">Email Sent</th>
            </tr>
          </thead>
          <tbody>
            {sales.slice(0, 10).map((sale) => (
              <tr key={sale.id} className="border-b hover:bg-gray-50">
                <td className="p-3 truncate">{sale.title}</td>
                <td className="p-3 text-sm">{sale.sourceName}</td>
                <td className="p-3">
                  <span className={sale.organizer.isClaimed ? 'text-green-600' : 'text-gray-500'}>
                    {sale.organizer.name}
                  </span>
                </td>
                <td className="p-3">
                  {sale.organizer.isClaimed ? (
                    <span className="text-green-600 font-semibold">✓ Claimed</span>
                  ) : (
                    <span className="text-gray-500">Unclaimed</span>
                  )}
                </td>
                <td className="p-3">
                  {sale.claimEmails[0] ? (
                    <span className={sale.claimEmails[0].claimed ? 'text-green-600' : 'text-yellow-600'}>
                      {sale.claimEmails[0].claimed ? 'Claimed' : 'Sent'}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not sent</span>
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
