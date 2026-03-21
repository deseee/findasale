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

interface SocialTemplate {
  text: string;
  hashtags: string[];
  charCount: number;
  overLimit: boolean;
  platformLimit: number;
  photoUrl: string | null;
}

export default function PromotePage(): JSX.Element {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [itemCount, setItemCount] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [selectedTone, setSelectedTone] = useState<'casual' | 'professional' | 'friendly'>('casual');
  const [selectedPlatform, setSelectedPlatform] = useState<'instagram' | 'facebook'>('instagram');
  const [socialTemplate, setSocialTemplate] = useState<SocialTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

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
      const response = await api.get(`/items?saleId=${saleId}`);
      return response.data as Item[];
    },
    enabled: !!saleId && !!user,
  });

  React.useEffect(() => {
    if (itemsData) {
      setItemCount(itemsData.length);
      // Auto-select first item if not yet selected
      if (!selectedItemId && itemsData.length > 0) {
        setSelectedItemId(itemsData[0].id);
      }
    }
  }, [itemsData, selectedItemId]);

  // Fetch social template when item, tone, or platform changes
  React.useEffect(() => {
    const fetchTemplate = async () => {
      if (!selectedItemId) return;
      try {
        setLoadingTemplate(true);
        const response = await api.get(
          `/social/${selectedItemId}/template?tone=${selectedTone}&platform=${selectedPlatform}`
        );
        setSocialTemplate(response.data as SocialTemplate);
      } catch (error) {
        console.error('Failed to fetch social template:', error);
        setSocialTemplate(null);
        showToast('Failed to generate social template', 'error');
      } finally {
        setLoadingTemplate(false);
      }
    };

    if (selectedItemId && selectedTone && selectedPlatform) {
      fetchTemplate();
    }
  }, [selectedItemId, selectedTone, selectedPlatform, showToast]);

  // Copy full post (text + hashtags) to clipboard
  const copyFullPost = async () => {
    if (!socialTemplate) return;
    try {
      const fullPost = `${socialTemplate.text}\n\n${socialTemplate.hashtags.join(' ')}`;
      await navigator.clipboard.writeText(fullPost);
      showToast('Post copied to clipboard!', 'success');
    } catch (error) {
      console.error('Failed to copy:', error);
      showToast('Failed to copy to clipboard', 'error');
    }
  };

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
          <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Share Your Sale</h1>
          <p className="text-warm-700 dark:text-warm-300 text-lg mb-8">
            Export your items to reach more buyers on platforms they already use
          </p>

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

          {/* Social Template Section */}
          <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6 mb-12">
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-6">Create Social Posts</h2>

            {/* Item Picker */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">Select Item</label>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="w-full border border-warm-200 dark:border-gray-700 rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-amber-600"
              >
                <option value="">Choose an item...</option>
                {itemsData.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} {item.price ? `— $${item.price}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedItemId && (
              <>
                {/* Tone Selector */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-3">Tone</label>
                  <div className="flex gap-3">
                    {(['casual', 'professional', 'friendly'] as const).map((tone) => (
                      <button
                        key={tone}
                        onClick={() => setSelectedTone(tone)}
                        className={`px-4 py-2 rounded-full font-medium transition ${
                          selectedTone === tone
                            ? 'bg-amber-600 text-white'
                            : 'bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-warm-100 hover:bg-warm-200'
                        }`}
                      >
                        {tone.charAt(0).toUpperCase() + tone.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Platform Selector */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-3">Platform</label>
                  <div className="flex gap-3">
                    {(['instagram', 'facebook'] as const).map((platform) => (
                      <button
                        key={platform}
                        onClick={() => setSelectedPlatform(platform)}
                        className={`px-4 py-2 rounded-full font-medium transition ${
                          selectedPlatform === platform
                            ? 'bg-amber-600 text-white'
                            : 'bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-warm-100 hover:bg-warm-200'
                        }`}
                      >
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Social Template Preview */}
                {loadingTemplate ? (
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : socialTemplate ? (
                  <div className="bg-warm-50 dark:bg-gray-900 border border-warm-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
                    {/* Preview Image */}
                    {socialTemplate.photoUrl && (
                      <div className="mb-4">
                        <img
                          src={socialTemplate.photoUrl}
                          alt="Item preview"
                          className="w-full max-w-xs rounded-lg object-cover max-h-48"
                        />
                      </div>
                    )}

                    {/* Post Text */}
                    <div>
                      <p className="text-sm font-semibold text-warm-700 dark:text-warm-300 mb-2">Post Text</p>
                      <p className="text-warm-900 dark:text-warm-100 leading-relaxed whitespace-pre-wrap">{socialTemplate.text}</p>
                    </div>

                    {/* Hashtags */}
                    <div>
                      <p className="text-sm font-semibold text-warm-700 dark:text-warm-300 mb-2">Hashtags</p>
                      <div className="flex flex-wrap gap-2">
                        {socialTemplate.hashtags.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => {
                              navigator.clipboard.writeText(tag);
                              showToast(`${tag} copied!`, 'success');
                            }}
                            className="bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-warm-100 px-3 py-1 rounded-full text-sm hover:bg-warm-200 dark:hover:bg-gray-600 transition cursor-pointer"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Character Count */}
                    <div className="flex items-center justify-between pt-4 border-t border-warm-200 dark:border-gray-700">
                      <div>
                        <p className="text-sm text-warm-700 dark:text-warm-300">
                          Characters: <span className={socialTemplate.overLimit ? 'text-red-600 font-semibold' : 'text-warm-900 dark:text-warm-100 font-semibold'}>
                            {socialTemplate.charCount} / {socialTemplate.platformLimit}
                          </span>
                        </p>
                        {socialTemplate.overLimit && (
                          <p className="text-xs text-red-600 mt-1">⚠️ Post exceeds platform limit</p>
                        )}
                      </div>
                      <button
                        onClick={copyFullPost}
                        className="bg-amber-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-amber-700 transition"
                      >
                        Copy Full Post
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
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
    </>
  );
}
