/**
 * Promote Page — Sprint 2
 *
 * Organizer-facing page to download/copy export formats for a specific sale.
 * Allows exporting to EstateSales.NET, Facebook Marketplace, and Craigslist.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import api from '../../../lib/api';
import Link from 'next/link';
import Skeleton from '../../../components/Skeleton';

interface Sale {
  id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  startDate: string;
  endDate: string;
  organizer: {
    userId: string;
    phone: string;
    email: string;
  };
}

interface ExportCardProps {
  title: string;
  description: string;
  icon: string;
  buttonText: string;
  secondaryButtonText: string;
  onClick: () => Promise<void>;
  onSecondary: () => Promise<void>;
  loading: boolean;
}

const ExportCard: React.FC<ExportCardProps> = ({
  title,
  description,
  icon,
  buttonText,
  secondaryButtonText,
  onClick,
  onSecondary,
  loading,
}) => {
  return (
    <div className="border border-warm-200 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-warm-900 mb-2">{title}</h3>
      <p className="text-warm-700 text-sm mb-6 leading-relaxed">{description}</p>
      <div className="flex gap-3">
        <button
          onClick={onClick}
          disabled={loading}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
            loading
              ? 'bg-warm-300 text-warm-700 cursor-not-allowed'
              : 'bg-amber-600 text-white hover:bg-amber-700'
          }`}
        >
          {loading ? 'Processing...' : buttonText}
        </button>
        <button
          onClick={onSecondary}
          disabled={loading}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
            loading
              ? 'bg-warm-200 text-warm-700 cursor-not-allowed'
              : 'bg-warm-100 text-warm-900 hover:bg-warm-200'
          }`}
        >
          {loading ? 'Processing...' : secondaryButtonText}
        </button>
      </div>
    </div>
  );
};

export default function PromotePage(): JSX.Element {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [itemCount, setItemCount] = useState(0);

  // Redirect if not authenticated or not an organizer
  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return <></>;
  }

  // Fetch sale to verify ownership and get details
  const { data: sale, isLoading: saleLoading, isError } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      if (!saleId) return null;
      const response = await api.get(`/sales/${saleId}`);
      return response.data as Sale;
    },
    enabled: !!saleId && !!user,
  });

  // Fetch published item count
  const { data: itemsData } = useQuery({
    queryKey: ['sale-items', saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const response = await api.get(`/items?saleId=${saleId}`);
      return response.data;
    },
    enabled: !!saleId && !!user,
  });

  React.useEffect(() => {
    if (itemsData) {
      setItemCount(itemsData.length);
    }
  }, [itemsData]);

  // Loading state
  if (authLoading || saleLoading) {
    return (
      <div className="min-h-screen bg-warm-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Skeleton className="h-12 w-64 mb-4" />
          <Skeleton className="h-6 w-96 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error states
  if (isError || !sale) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 text-center max-w-md">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold text-warm-900 mb-2">Sale not found</h1>
          <p className="text-warm-700 mb-6">
            This sale may have been deleted or moved. Check your dashboard for active sales.
          </p>
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline font-medium">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Check authorization
  if (sale.organizer.userId !== user?.id) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 text-center max-w-md">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-warm-900 mb-2">
            You don't have access to this sale
          </h1>
          <p className="text-warm-700 mb-6">Only the sale organizer can export.</p>
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline font-medium">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Download handlers using fetch with proper authorization
  const downloadFile = async (endpoint: string, filename: string) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      showToast('File downloaded! Check your downloads folder.', 'success');
    } catch (error) {
      showToast('Failed to download file', 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (endpoint: string, successMessage: string) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      if (!response.ok) throw new Error('Export failed');
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      showToast(successMessage, 'success');
    } catch (error) {
      showToast('Failed to copy to clipboard', 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  const downloadEstatesalesCSV = () =>
    downloadFile(`${apiBase}/export/${saleId}/estatesales-csv`, `sale-${saleId}-estatesales.csv`);

  const copyEstatesalesCSV = () =>
    copyToClipboard(
      `${apiBase}/export/${saleId}/estatesales-csv`,
      'CSV copied to clipboard! Ready to paste into EstateSales.NET'
    );

  const downloadFacebookJSON = () =>
    downloadFile(`${apiBase}/export/${saleId}/facebook-json`, `sale-${saleId}-facebook.json`);

  const copyFacebookJSON = () =>
    copyToClipboard(
      `${apiBase}/export/${saleId}/facebook-json`,
      'JSON copied to clipboard! Ready to paste into Facebook Marketplace'
    );

  const downloadCraigslistText = () =>
    downloadFile(`${apiBase}/export/${saleId}/craigslist-text`, `sale-${saleId}-craigslist.txt`);

  const copyCraigslistText = () =>
    copyToClipboard(
      `${apiBase}/export/${saleId}/craigslist-text`,
      'Text copied to clipboard! Ready to paste into Craigslist'
    );

  return (
    <>
      <Head>
        <title>Share Your Sale — FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Back link */}
          <Link
            href="/organizer/dashboard"
            className="text-amber-600 hover:underline font-medium mb-4 inline-block"
          >
            ← Back to Dashboard
          </Link>

          {/* Page header */}
          <h1 className="text-4xl font-bold text-warm-900 mb-2">Share Your Sale</h1>
          <p className="text-warm-700 text-lg mb-8">
            Export your items to reach more buyers on platforms they already use
          </p>

          {/* Info card */}
          {itemCount > 0 && (
            <div className="bg-warm-50 border border-warm-200 rounded-lg p-6 mb-8">
              <div className="flex items-start gap-4">
                <div className="text-2xl">📦</div>
                <div className="flex-1">
                  <p className="text-warm-900 font-semibold">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'} will be exported
                  </p>
                  <p className="text-warm-700 text-sm mt-2">
                    💧 All photos will include a FindA.Sale watermark
                  </p>
                  <p className="text-warm-700 text-sm">
                    ℹ️ Watermarks protect your inventory from unauthorized copying
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Export cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <ExportCard
              icon="📋"
              title="EstateSales.NET"
              description="For dedicated vintage & estate hunters. CSV spreadsheet — download and upload to EstateSales.NET"
              buttonText="Export & Download"
              secondaryButtonText="Copy to Clipboard"
              onClick={downloadEstatesalesCSV}
              onSecondary={copyEstatesalesCSV}
              loading={loading}
            />

            <ExportCard
              icon="👥"
              title="Facebook Marketplace"
              description="Reach millions of local buyers. JSON data — copy and paste into Facebook Marketplace"
              buttonText="Export & Download"
              secondaryButtonText="Copy to Clipboard"
              onClick={downloadFacebookJSON}
              onSecondary={copyFacebookJSON}
              loading={loading}
            />

            <ExportCard
              icon="🏠"
              title="Craigslist"
              description="For household goods and local shoppers. Plain text — copy and paste directly into Craigslist listings"
              buttonText="Export & Download"
              secondaryButtonText="Copy to Clipboard"
              onClick={downloadCraigslistText}
              onSecondary={copyCraigslistText}
              loading={loading}
            />
          </div>

          {/* Help section */}
          <details className="bg-white border border-warm-200 rounded-lg p-6 mb-8 lg:mb-0 lg:block">
            <summary className="cursor-pointer font-semibold text-warm-900 text-lg mb-4 lg:mb-6">
              How to use these exports
            </summary>

            <div className="space-y-6 text-sm text-warm-600">
              <div>
                <h4 className="font-semibold text-warm-900 mb-2">📋 EstateSales.NET</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click "Export & Download" to save the CSV file</li>
                  <li>Go to EstateSales.NET and log in</li>
                  <li>Find "Upload Inventory" or "Bulk Import"</li>
                  <li>Select the CSV file and upload</li>
                  <li>Review and publish your items</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-warm-900 mb-2">👥 Facebook Marketplace</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click "Export & Download" to save the JSON file</li>
                  <li>Go to Facebook Marketplace (on Facebook.com or Facebook app)</li>
                  <li>Click "Create" → "List an item"</li>
                  <li>
                    You'll need to manually create listings, but the data is ready to copy/paste
                  </li>
                  <li>Photos are already included and watermarked</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-warm-900 mb-2">🏠 Craigslist</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click "Export & Download" or "Copy to Clipboard"</li>
                  <li>Go to Craigslist.org → "Post to Classifieds"</li>
                  <li>Select your category (e.g., "Household Items")</li>
                  <li>Paste the text into the description field</li>
                  <li>Add any additional details and post</li>
                </ol>
              </div>

              <div className="bg-warm-50 border border-warm-200 rounded p-4">
                <h4 className="font-semibold text-warm-900 mb-2">💡 Pro Tips</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>Always download/copy both the listings AND the photo URLs</li>
                  <li>Watermarked photos protect your inventory — don't remove them</li>
                  <li>Some platforms require you to host photos separately; FindA.Sale photos are already public</li>
                  <li>If you update items on FindA.Sale, re-export to keep platforms in sync</li>
                </ul>
              </div>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
