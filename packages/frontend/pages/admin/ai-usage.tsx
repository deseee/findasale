import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import api from '../../lib/api';

interface SubsystemBase {
  enabled: boolean;
  status: string;
}

interface WebDetectionUsage extends SubsystemBase {
  monthKey: string;
  callsThisMonth: number;
  estimatedCost: number;
  ceiling: number;
  costPercentage: number;
  dailyCapRemaining: number;
}

interface EbayImageSearchUsage extends SubsystemBase {
  callsToday: number;
  dailyCap: number;
  dailyCapRemaining: number;
}

interface GroundingUsage extends SubsystemBase {
  textEnabled: boolean;
  visualEnabled: boolean;
  rolloutPct: number;
  monthKey: string;
  estimatedCost: number;
  ceiling: number;
  costPercentage: number;
  dailyCap: number;
  dailyCapRemaining: number;
}

interface AIUsage {
  monthKey: string;
  tokensUsed: number;
  estimatedCost: number;
  ceiling: number;
  costPercentage: number;
  status: string;
  webDetection: WebDetectionUsage;
  ebayImageSearch: EbayImageSearchUsage;
  grounding: GroundingUsage;
}

const isBadStatus = (status: string) => status === 'EXCEEDED' || status === 'CAP_REACHED';

const statusBadgeClass = (status: string) =>
  isBadStatus(status)
    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';

const barColorClass = (pct: number) => {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 75) return 'bg-amber-500';
  return 'bg-green-500';
};

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(pct, 100));
  return (
    <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
      <div
        className={`h-full rounded-full ${barColorClass(pct)}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function EnabledPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
        enabled
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
      }`}
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}

export default function AIUsagePage() {
  const router = useRouter();
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/ai-usage')
      .then(res => setUsage(res.data))
      .catch(err => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          router.push('/login');
        } else {
          setError('Failed to load AI usage data');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <>
      <Head>
        <title>AI Spend — Admin | FindA.Sale</title>
      </Head>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <a
            href="/admin"
            className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
          >
            ← Admin
          </a>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          AI Spend Dashboard
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
          {loading
            ? 'Loading…'
            : usage
            ? `Month: ${usage.monthKey} — read-only view of AI cost across 4 subsystems.`
            : ''}
        </p>

        {error && <p className="text-red-500 mb-4">{error}</p>}

        {!loading && usage && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Base AI cost (Claude / Vision tagging) */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Base AI Cost (Tagging)
                </h3>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(usage.status)}`}>
                  {usage.status}
                </span>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                ${usage.estimatedCost.toFixed(2)}
                <span className="text-base font-normal text-gray-500 dark:text-gray-400"> / ${usage.ceiling} ceiling</span>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {usage.tokensUsed.toLocaleString()} tokens used this month
              </p>
              <ProgressBar pct={usage.costPercentage} />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">
                {usage.costPercentage.toFixed(1)}% of ceiling
              </p>
            </div>

            {/* Web Detection */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Google Vision Web Detection
                </h3>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(usage.webDetection.status)}`}>
                  {usage.webDetection.status}
                </span>
              </div>
              <div className="mb-3">
                <EnabledPill enabled={usage.webDetection.enabled} />
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                ${usage.webDetection.estimatedCost.toFixed(2)}
                <span className="text-base font-normal text-gray-500 dark:text-gray-400"> / ${usage.webDetection.ceiling} ceiling</span>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {usage.webDetection.callsThisMonth.toLocaleString()} calls this month · {usage.webDetection.dailyCapRemaining} daily cap remaining
              </p>
              <ProgressBar pct={usage.webDetection.costPercentage} />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">
                {usage.webDetection.costPercentage.toFixed(1)}% of ceiling
              </p>
            </div>

            {/* eBay searchByImage */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  eBay searchByImage
                </h3>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(usage.ebayImageSearch.status)}`}>
                  {usage.ebayImageSearch.status}
                </span>
              </div>
              <div className="mb-3">
                <EnabledPill enabled={usage.ebayImageSearch.enabled} />
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                {usage.ebayImageSearch.callsToday.toLocaleString()}
                <span className="text-base font-normal text-gray-500 dark:text-gray-400"> / {usage.ebayImageSearch.dailyCap} daily cap</span>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {usage.ebayImageSearch.dailyCapRemaining} calls remaining today · free quota, no $ ceiling
              </p>
              <ProgressBar
                pct={
                  usage.ebayImageSearch.dailyCap > 0
                    ? ((usage.ebayImageSearch.dailyCap - usage.ebayImageSearch.dailyCapRemaining) / usage.ebayImageSearch.dailyCap) * 100
                    : 0
                }
              />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">
                {usage.ebayImageSearch.dailyCap > 0
                  ? (((usage.ebayImageSearch.dailyCap - usage.ebayImageSearch.dailyCapRemaining) / usage.ebayImageSearch.dailyCap) * 100).toFixed(1)
                  : '0.0'}% of daily cap used
              </p>
            </div>

            {/* Grounded identity pipeline */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Grounded Identity Pipeline
                </h3>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(usage.grounding.status)}`}>
                  {usage.grounding.status}
                </span>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                <EnabledPill enabled={usage.grounding.enabled} />
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  usage.grounding.textEnabled
                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  Text: {usage.grounding.textEnabled ? 'On' : 'Off'}
                </span>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  usage.grounding.visualEnabled
                    ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  Visual: {usage.grounding.visualEnabled ? 'On' : 'Off'}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                Rollout: <span className="font-bold">{usage.grounding.rolloutPct}%</span> of eligible traffic
              </p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                ${usage.grounding.estimatedCost.toFixed(2)}
                <span className="text-base font-normal text-gray-500 dark:text-gray-400"> / ${usage.grounding.ceiling} ceiling</span>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {usage.grounding.dailyCapRemaining} / {usage.grounding.dailyCap} daily cap remaining
              </p>
              <ProgressBar pct={usage.grounding.costPercentage} />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">
                {usage.grounding.costPercentage.toFixed(1)}% of ceiling
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
