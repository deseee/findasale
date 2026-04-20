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
import SharePromoteModal from '../../../components/SharePromoteModal';

interface Item {
  id: string;
  title: string;
  price: number | null;
}

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
    <div className="border border-warm-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">{title}</h3>
      <p className="text-warm-700 dark:text-warm-300 text-sm mb-6 leading-relaxed">{description}</p>
      <div className="flex gap-3">
        <button
          onClick={onClick}
          disabled={loading}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
            loading
              ? 'bg-warm-300 text-warm-700 dark:text-warm-300 cursor-not-allowed'
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
              ? 'bg-warm-200 text-warm-700 dark:text-warm-300 cursor-not-allowed'
              : 'bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-warm-100 hover:bg-warm-200'
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
  const [showShareModal, setShowShareModal] = useState(false);
  // Redirect if not authenticated or not an organizer
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
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

  // Fetch published items
  const { data: itemsData = [] } = useQuery({
    queryKey: ['sale-items', saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const response = await api.get(`/items/drafts?saleId=${saleId}`);
      return response.data as Item[];
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
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
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
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center max-w-md">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">Sale not found</h1>
          <p className="text-warm-700 dark:text-warm-300 mb-6">
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
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center max-w-md">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">
            You don't have access to this sale
          </h1>
          <p className="text-warm-700 dark:text-warm-300 mb-6">Only the sale organizer can export.</p>
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

      // Handle specific error codes
      if (response.status === 429) {
        try {
          const errorData = await response.json();
          showToast(errorData.message || 'Too many requests — please wait before exporting again', 'error');
        } catch {
          showToast('Too many requests — please wait before exporting again', 'error');
        }
        return;
      }

      if (!response.ok) {
        try {
          const errorData = await response.json();
          showToast(errorData.message || 'Export failed', 'error');
        } catch {
          showToast('Export failed', 'error');
        }
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      showToast('File downloaded! Check your downloads folder.', 'success');
    } catch (error) {
      console.error('Download error:', error);
      showToast('Failed to download file', 'error');
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

      // Handle specific error codes
      if (response.status === 429) {
        try {
          const errorData = await response.json();
          showToast(errorData.message || 'Too many requests — please wait before exporting again', 'error');
        } catch {
          showToast('Too many requests — please wait before exporting again', 'error');
        }
        return;
      }

      if (!response.ok) {
        try {
          const errorData = await response.json();
          showToast(errorData.message || 'Export failed', 'error');
        } catch {
          showToast('Export failed', 'error');
        }
        return;
      }

      const text = await response.text();
      await navigator.clipboard.writeText(text);
      showToast(successMessage, 'success');
    } catch (error) {
      console.error('Clipboard copy error:', error);
      showToast('Failed to copy to clipboard', 'error');
    } finally {
      setLoading(false);
    }
  };

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  // Nextdoor post text (inline, no modal needed)
  const nextdoorText = sale
    ? `Neighbors — ${sale.title} this ${new Date(sale.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(sale.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${sale.address}, ${sale.city}, ${sale.state} ${sale.zip}

Open to the public. ${itemCount > 0 ? `${itemCount}+ items` : 'Items'} include furniture, household goods, collectibles, and more. Early arrival recommended.

Full item list at finda.sale — search "${sale.city}"

Hope to see some familiar faces!`
    : '';

  const copyNextdoorPost = async () => {
    try {
      await navigator.clipboard.writeText(nextdoorText);
      showToast('Copied! Open Nextdoor and paste in your neighborhood feed.', 'success');
    } catch {
      showToast('Failed to copy', 'error');
    }
  };

  // WhatsApp share
  const whatsappMessage = sale
    ? `Check out ${sale.title}! ${new Date(sale.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${new Date(sale.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${sale.address}, ${sale.city}. Browse items at: ${typeof window !== 'undefined' ? window.location.origin : 'https://finda.sale'}/sales/${sale.id}`
    : '';

  const handleWhatsAppShare = async () => {
    const isMobile = /iPhone|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.open(`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`, '_blank');
    } else {
      try {
        await navigator.clipboard.writeText(whatsappMessage);
        showToast('Link copied! Paste it into WhatsApp on your phone.', 'success');
      } catch {
        showToast('Failed to copy', 'error');
      }
    }
  };

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

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Back link */}
          <Link
            href="/organizer/dashboard"
            className="text-amber-600 hover:underline font-medium mb-4 inline-block"
          >
            ← Back to Dashboard
          </Link>

          {/* Page header */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Share Your Sale</h1>
              <p className="text-warm-700 dark:text-warm-300 text-lg">
                Export your items to reach more buyers on platforms they already use
              </p>
            </div>
            <button
              onClick={() => setShowShareModal(true)}
              className="ml-4 bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-lg transition whitespace-nowrap"
            >
              📢 Share & Promote
            </button>
          </div>

          {/* Info card */}
          {itemCount > 0 && (
            <div className="bg-warm-50 dark:bg-gray-900 border border-warm-200 dark:border-gray-700 rounded-lg p-6 mb-8">
              <div className="flex items-start gap-4">
                <div className="text-2xl">📦</div>
                <div className="flex-1">
                  <p className="text-warm-900 dark:text-warm-100 font-semibold">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'} will be exported
                  </p>
                  <p className="text-warm-700 dark:text-warm-300 text-sm mt-2">
                    💧 All photos will include a FindA.Sale watermark
                  </p>
                  <p className="text-warm-700 dark:text-warm-300 text-sm">
                    ℹ️ Watermarks protect your inventory from unauthorized copying
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Export cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
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
              description="Your item data formatted for Facebook Marketplace. Download the file, then open Facebook Marketplace and create listings using the details inside."
              buttonText="Download Data"
              secondaryButtonText="Copy Item Data"
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

            <ExportCard
              icon="🏡"
              title="Nextdoor"
              description="Share with neighbors directly. Copy a ready-to-paste post for your local Nextdoor feed."
              buttonText="Copy Post"
              secondaryButtonText="Open Nextdoor"
              onClick={copyNextdoorPost}
              onSecondary={async () => {
                await copyNextdoorPost();
                window.open('https://nextdoor.com/news_feed/', '_blank');
              }}
              loading={false}
            />
          </div>

          {/* WhatsApp quick-share */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg px-6 py-4 mb-12">
            <div className="flex items-center gap-3">
              <span className="text-2xl">💬</span>
              <div>
                <p className="font-semibold text-warm-900 dark:text-warm-100">Share via WhatsApp</p>
                <p className="text-sm text-warm-700 dark:text-warm-300">Send your sale link to buyers and regulars</p>
              </div>
            </div>
            <button
              onClick={handleWhatsAppShare}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition whitespace-nowrap"
            >
              Share on WhatsApp
            </button>
          </div>

          {/* Help section */}
          <details className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6 mb-8 lg:mb-0 lg:block">
            <summary className="cursor-pointer font-semibold text-warm-900 dark:text-warm-100 text-lg mb-4 lg:mb-6">
              How to use these exports
            </summary>

            <div className="space-y-6 text-sm text-warm-600 dark:text-warm-400">
              <div>
                <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">📋 EstateSales.NET</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click "Export & Download" to save the CSV file</li>
                  <li>Go to EstateSales.NET and log in</li>
                  <li>Find "Upload Inventory" or "Bulk Import"</li>
                  <li>Select the CSV file and upload</li>
                  <li>Review and publish your items</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">👥 Facebook Marketplace</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click "Download Data" to save the item data file</li>
                  <li>Open Facebook Marketplace on Facebook.com or the app</li>
                  <li>Click "Create" → "List an item"</li>
                  <li>Use the item details in the file to fill in each listing manually</li>
                  <li>Your watermarked photo URLs are included in the file</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">🏠 Craigslist</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click "Export & Download" or "Copy to Clipboard"</li>
                  <li>Go to Craigslist.org → "Post to Classifieds"</li>
                  <li>Select your category (e.g., "Household Items")</li>
                  <li>Paste the text into the description field</li>
                  <li>Add any additional details and post</li>
                </ol>
              </div>

              <div className="bg-warm-50 dark:bg-gray-900 border border-warm-200 dark:border-gray-700 rounded p-4">
                <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">💡 Pro Tips</h4>
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

      {/* Share & Promote Modal */}
      {sale && (
        <SharePromoteModal
          sale={{
            id: sale.id,
            title: sale.title,
            description: sale.description,
            address: sale.address,
            city: sale.city,
            state: sale.state,
            zip: sale.zip,
            startDate: sale.startDate,
            endDate: sale.endDate,
          }}
          itemCount={itemCount}
          items={itemsData}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
}
