/**
 * Promote Page — S522 Share & Promote Overhaul
 *
 * Full page redesign (no modal). Sections:
 * 1. Hero "Sale Identity"
 * 2. Quick Share (8 platform tiles)
 * 3. Listing Exports
 * 4. Print & Flyer
 * 5. Share Card (theme selector + download)
 * 6. How to Use (collapsible)
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import api from '../../../lib/api';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';

interface Item {
  id: string;
  title: string;
  price: number | null;
  photoUrl?: string;
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
  saleType?: string;
  organizer: {
    userId: string;
    phone: string;
    email: string;
  };
}

interface ShareCardTheme {
  id: string;
  name: string;
  icon: string;
  xpRequired: number;
}

const SHARE_CARD_THEMES: ShareCardTheme[] = [
  { id: 'classic', name: 'Classic', icon: '✨', xpRequired: 0 },
  { id: 'vintage', name: 'Vintage', icon: '📷', xpRequired: 500 },
  { id: 'bold', name: 'Bold', icon: '⚡', xpRequired: 1500 },
  { id: 'branded', name: 'Branded', icon: '🎨', xpRequired: 2500 },
  { id: 'photo-fullbleed', name: 'Photo', icon: '🖼️', xpRequired: 1000 },
  { id: 'haul', name: 'Haul', icon: '🛍️', xpRequired: 500 },
];

interface PlatformTileProps {
  icon: string;
  name: string;
  onCopy: () => Promise<void>;
  loading: boolean;
}

const PlatformTile: React.FC<PlatformTileProps> = ({ icon, name, onCopy, loading }) => {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 transition min-h-[160px] ${
        copied
          ? 'bg-green-50 dark:bg-green-900 border-green-500'
          : 'bg-white dark:bg-gray-800 border-warm-200 dark:border-gray-700 hover:border-amber-600 dark:hover:border-amber-500'
      }`}
    >
      <div className="text-4xl mb-3">{icon}</div>
      <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm mb-3">{name}</p>
      <p className={`text-xs font-medium transition ${copied ? 'text-green-600' : 'text-amber-600'}`}>
        {copied ? '✓ Copied!' : 'Copy Post'}
      </p>
    </button>
  );
};

export default function PromotePage(): JSX.Element {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [itemCount, setItemCount] = useState(0);

  // Share card state
  const [selectedTheme, setSelectedTheme] = useState('classic');
  const [selectedFormat, setSelectedFormat] = useState('square');
  const [shareCardBlobUrl, setShareCardBlobUrl] = useState<string | null>(null);
  const [shareCardLoading, setShareCardLoading] = useState(false);

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

  // Fetch share card image as blob URL with proper session credentials
  useEffect(() => {
    if (!saleId || !sale) return;
    let cancelled = false;

    setShareCardLoading(true);
    setShareCardBlobUrl(null);

    const url = `/api/share-card?saleId=${saleId}&theme=${selectedTheme}&format=${selectedFormat}&type=sale`;

    fetch(url, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Share card fetch failed: ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (!cancelled) {
          const blobUrl = URL.createObjectURL(blob);
          setShareCardBlobUrl(blobUrl);
        }
      })
      .catch((err) => {
        console.error('Share card preview error:', err);
      })
      .finally(() => {
        if (!cancelled) setShareCardLoading(false);
      });

    return () => {
      cancelled = true;
      if (shareCardBlobUrl) URL.revokeObjectURL(shareCardBlobUrl);
    };
  }, [saleId, sale, selectedTheme, selectedFormat]);

  // Loading state
  if (authLoading || saleLoading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="h-12 w-64 mb-4 animate-pulse bg-warm-200 dark:bg-gray-700 rounded" />
          <div className="h-6 w-96 mb-8 animate-pulse bg-warm-200 dark:bg-gray-700 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 w-full animate-pulse bg-warm-200 dark:bg-gray-700 rounded" />
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

  // Template strings from SharePromoteModal
  const getSaleTypeLabel = (saleType?: string): string => {
    const labels: Record<string, string> = {
      ESTATE: 'estate sale',
      YARD: 'yard sale',
      AUCTION: 'auction',
      FLEA_MARKET: 'flea market',
      CONSIGNMENT: 'consignment sale',
      CHARITY: 'charity sale',
      BUSINESS_CORPORATE: 'corporate sale',
    };
    return labels[saleType || ''] || 'sale';
  };

  const getHashtagsForSaleType = (saleType?: string): string => {
    const hashtagMap: Record<string, string> = {
      ESTATE: '#estatesale #garagesale #findasale',
      YARD: '#yardsale #garagesale #findasale',
      AUCTION: '#auction #estatesale #findasale',
      FLEA_MARKET: '#fleamarket #yardsale #findasale',
      CONSIGNMENT: '#consignment #thrifting #findasale',
      CHARITY: '#charity #yardsale #findasale',
      BUSINESS_CORPORATE: '#corporate #businesssale #findasale',
    };
    return hashtagMap[saleType ?? ''] || '#garagesale #yardsale #estatesale #findasale';
  };

  const generateTemplates = () => {
    if (!sale) return {};

    const startDate = format(parseISO(sale.startDate), 'MMM d');
    const endDate = format(parseISO(sale.endDate), 'MMM d, yyyy');
    const fullStartDate = format(parseISO(sale.startDate), 'EEEE, MMM d, yyyy');
    const fullEndDate = format(parseISO(sale.endDate), 'EEEE, MMM d, yyyy');
    const address = `${sale.address}, ${sale.city}, ${sale.state} ${sale.zip}`;
    const saleTypeLabel = getSaleTypeLabel(sale.saleType);

    return {
      facebook: `🏷️ ${sale.title}\n\nFind amazing deals on quality items! ${itemCount ? `We have ${itemCount}+ items` : 'Great selection of items available'}.\n\n📍 ${address}\n📅 ${startDate} - ${endDate}\n\n#LocalSales ${getHashtagsForSaleType(sale.saleType)} #Bargains #ShoppingLocal\n\nDon't miss out! Visit us today.`,

      instagram: `🏷️ ${sale.title}\n\nFind amazing deals on quality items! ${itemCount ? `We have ${itemCount}+ items` : 'Great selection of items available'}.\n\n📍 ${address}\n📅 ${startDate} - ${endDate}\n\n#LocalSales ${getHashtagsForSaleType(sale.saleType)} #Bargains #ShoppingLocal`,

      nextdoor: `Neighbors — ${sale.title} this ${startDate} - ${endDate} at ${address}\n\n${saleTypeLabel.charAt(0).toUpperCase() + saleTypeLabel.slice(1)} open to the public. Items include furniture, household goods, collectibles, and more. Early arrival recommended.\n\nFull item list at finda.sale — search "${sale.city}"\n\nHope to see some familiar faces!`,

      threads: `Running a ${saleTypeLabel} this weekend in ${sale.city} — ${sale.title}\n\nLots of ${sale.title} items: furniture, vintage pieces, collectibles, and more. Everything must go.\n\n📍 ${address} · ${startDate} - ${endDate}\nBrowse the inventory at finda.sale`,

      email: `SUBJECT: You're invited to ${sale.title} — Limited time sale!\n\n---\n\nHello Friend,\n\nI'm excited to invite you to our upcoming sale:\n\n${sale.title}\n\nWhen:\n${fullStartDate} through ${fullEndDate}\n[Your Hours]\n\nWhere:\n${address}\n\nWhat to expect:\n${itemCount ? `Over ${itemCount} quality items` : 'A wide selection of quality items'} at unbeatable prices. Whether you're looking for treasures or everyday finds, we have something for everyone!\n\n${sale.description ? `About this sale: ${sale.description}\n\n` : ''}Why shop with us?\n• Quality merchandise\n• Competitive pricing\n• First-come, first-served items\n• Friendly staff\n\nWe look forward to seeing you there!\n\nBest regards,\n[Your Name]`,

      pinterest: `${sale.title} — ${saleTypeLabel.charAt(0).toUpperCase() + saleTypeLabel.slice(1)} in ${sale.city}\n\nDiscover unique vintage furniture, antiques, collectibles, and one-of-a-kind finds at this ${sale.city} ${saleTypeLabel}. Browse curated items from ${startDate} - ${endDate}. Shop in person or browse the full inventory online at FindA.Sale.\n\n📍 ${address}\n🗓️ ${startDate} - ${endDate}\n\n${getHashtagsForSaleType(sale.saleType)}\n\nFind more ${saleTypeLabel}s near you → finda.sale`,

      tiktok: `${saleTypeLabel.charAt(0).toUpperCase() + saleTypeLabel.slice(1)} haul alert 🏷️ ${sale.title} in ${sale.city} — furniture, collectibles, vintage finds and more\n\n📍 ${address}\n🗓️ ${startDate} - ${endDate}\n🔗 Link in bio → finda.sale\n\n${getHashtagsForSaleType(sale.saleType)} #thrifting #vintagefinds #${sale.city.toLowerCase().replace(/\s/g, '')}thrift #secondhand #thrifthaul`,

      flyer: `✨ ${sale.title.toUpperCase()} ✨\n\nDATE: ${fullStartDate} – ${fullEndDate}\nTIME: [Your Hours]\nLOCATION: ${address}\n\nHIGHLIGHTS:\n• ${itemCount ? `${itemCount}+ quality items` : 'Wide selection of items'}\n• Quality merchandise\n• Unbeatable prices\n• First come, first served\n${sale.description ? `• ${sale.description.substring(0, 60)}...` : ''}\n\n👉 DON'T MISS THIS OPPORTUNITY!\n\nDIRECTIONS: ${sale.city}, ${sale.state}\nQuestions? [Your Phone] | [Your Email]`,

      whatsapp: `Check out ${sale.title}! ${startDate}–${endDate} at ${address}. Browse items at: ${typeof window !== 'undefined' ? window.location.origin : 'https://finda.sale'}/sales/${sale.id}`,
    };
  };

  const templates = generateTemplates();

  // Copy handlers for each platform
  const makeCopyHandler = (text: string, successMsg: string) => async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMsg, 'success');
    } catch {
      showToast('Failed to copy', 'error');
    }
  };

  // Export handlers
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

  const handleWhatsAppShare = async () => {
    const isMobile = /iPhone|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.open(`https://wa.me/?text=${encodeURIComponent(templates.whatsapp || '')}`, '_blank');
    } else {
      try {
        await navigator.clipboard.writeText(templates.whatsapp || '');
        showToast('Link copied! Paste it into WhatsApp on your phone.', 'success');
      } catch {
        showToast('Failed to copy', 'error');
      }
    }
  };

  const handleShareCardDownload = async () => {
    const url = `/api/share-card?saleId=${saleId}&theme=${selectedTheme}&format=${selectedFormat}&type=sale`;
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error(`Download failed: ${r.status}`);
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `finda-sale-share-card-${selectedTheme}-${selectedFormat}.png`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      showToast('Share card downloaded!', 'success');
    } catch (err) {
      console.error('Share card download error:', err);
      showToast('Failed to download share card', 'error');
    }
  };

  const handleShareCardCopy = async () => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://finda.sale'}/api/share-card?saleId=${saleId}&theme=${selectedTheme}&format=${selectedFormat}&type=sale`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Share card URL copied!', 'success');
    } catch {
      showToast('Failed to copy', 'error');
    }
  };

  return (
    <>
      <Head>
        <title>Launch Your Sale — FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto px-4 py-8">
          {/* Back link */}
          <Link
            href="/organizer/dashboard"
            className="text-amber-600 hover:underline font-medium mb-6 inline-block"
          >
            ← Back to Dashboard
          </Link>

          {/* SECTION 1: Hero "Sale Identity" */}
          <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-lg p-8 mb-12">
            <h1 className="text-4xl font-bold mb-3">{sale?.title}</h1>
            <div className="flex flex-col gap-2 text-amber-50 mb-6">
              {sale && (
                <>
                  <p>
                    📅{' '}
                    {format(parseISO(sale.startDate), 'MMM d')} –{' '}
                    {format(parseISO(sale.endDate), 'MMM d, yyyy')}
                  </p>
                  <p>
                    📍 {sale.address}, {sale.city}, {sale.state} {sale.zip}
                  </p>
                  {itemCount > 0 && (
                    <p>
                      <span className="bg-amber-500 text-amber-900 px-3 py-1 rounded-full inline-block">
                        {itemCount} items ready to share
                      </span>
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Sale link copy */}
            {sale && (
              <div className="flex gap-3">
                <input
                  type="text"
                  readOnly
                  value={`finda.sale/sales/${sale.id}`}
                  className="flex-1 bg-amber-50 text-amber-900 px-4 py-2 rounded-lg font-mono text-sm"
                />
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${typeof window !== 'undefined' ? window.location.origin : 'https://finda.sale'}/sales/${sale.id}`
                      );
                      showToast('Sale link copied!', 'success');
                    } catch {
                      showToast('Failed to copy', 'error');
                    }
                  }}
                  className="bg-amber-500 hover:bg-amber-400 text-amber-900 px-6 py-2 rounded-lg font-medium transition whitespace-nowrap"
                >
                  Copy Link
                </button>
              </div>
            )}
          </div>

          {/* SECTION 2: Quick Share */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Quick Share</h2>
            <p className="text-warm-700 dark:text-warm-300 mb-6">
              Tap to copy a ready-to-post message for each platform
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <PlatformTile
                icon="👥"
                name="Facebook"
                onCopy={makeCopyHandler(templates.facebook || '', 'Copied! Paste on Facebook.')}
                loading={loading}
              />
              <PlatformTile
                icon="📷"
                name="Instagram"
                onCopy={makeCopyHandler(templates.instagram || '', 'Copied! Paste on Instagram.')}
                loading={loading}
              />
              <PlatformTile
                icon="🏡"
                name="Nextdoor"
                onCopy={makeCopyHandler(templates.nextdoor || '', 'Copied! Open Nextdoor to paste.')}
                loading={loading}
              />
              <PlatformTile
                icon="💬"
                name="Threads"
                onCopy={makeCopyHandler(templates.threads || '', 'Copied! Paste on Threads.')}
                loading={loading}
              />
              <PlatformTile
                icon="🟢"
                name="WhatsApp"
                onCopy={handleWhatsAppShare}
                loading={loading}
              />
              <PlatformTile
                icon="📌"
                name="Pinterest"
                onCopy={makeCopyHandler(templates.pinterest || '', 'Copied! Paste on Pinterest.')}
                loading={loading}
              />
              <PlatformTile
                icon="🎬"
                name="TikTok"
                onCopy={makeCopyHandler(templates.tiktok || '', 'Copied! Paste on TikTok.')}
                loading={loading}
              />
              <PlatformTile
                icon="📧"
                name="Email"
                onCopy={makeCopyHandler(templates.email || '', 'Copied! Paste in your email.')}
                loading={loading}
              />
            </div>
          </div>

          {/* SECTION 3: Listing Exports */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">List on Other Sites</h2>
            <p className="text-warm-700 dark:text-warm-300 mb-6">
              Export your inventory to reach buyers on listing platforms
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                <div className="text-4xl mb-3">📋</div>
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">EstateSales.NET</h3>
                <p className="text-warm-700 dark:text-warm-300 text-sm mb-4">
                  CSV spreadsheet for dedicated estate sale hunters
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={downloadEstatesalesCSV}
                    disabled={loading}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white py-2 px-3 rounded-lg font-medium transition text-sm"
                  >
                    Download
                  </button>
                  <button
                    onClick={copyEstatesalesCSV}
                    disabled={loading}
                    className="flex-1 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 disabled:bg-warm-200 text-warm-900 dark:text-warm-100 py-2 px-3 rounded-lg font-medium transition text-sm"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                <div className="text-4xl mb-3">👥</div>
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">Facebook Marketplace</h3>
                <p className="text-warm-700 dark:text-warm-300 text-sm mb-4">
                  Your item data formatted for Facebook Marketplace
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={downloadFacebookJSON}
                    disabled={loading}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white py-2 px-3 rounded-lg font-medium transition text-sm"
                  >
                    Download
                  </button>
                  <button
                    onClick={copyFacebookJSON}
                    disabled={loading}
                    className="flex-1 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 disabled:bg-warm-200 text-warm-900 dark:text-warm-100 py-2 px-3 rounded-lg font-medium transition text-sm"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                <div className="text-4xl mb-3">🏠</div>
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">Craigslist</h3>
                <p className="text-warm-700 dark:text-warm-300 text-sm mb-4">
                  Plain text for household goods and local shoppers
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={downloadCraigslistText}
                    disabled={loading}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white py-2 px-3 rounded-lg font-medium transition text-sm"
                  >
                    Download
                  </button>
                  <button
                    onClick={copyCraigslistText}
                    disabled={loading}
                    className="flex-1 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 disabled:bg-warm-200 text-warm-900 dark:text-warm-100 py-2 px-3 rounded-lg font-medium transition text-sm"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 4: Print & Flyer */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Print & Flyer</h2>
            <p className="text-warm-700 dark:text-warm-300 mb-6">
              Ready-to-paste text for printed flyers or bulletin board posts
            </p>

            <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
              <button
                onClick={makeCopyHandler(templates.flyer || '', 'Flyer text copied!')}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 px-4 rounded-lg font-medium transition"
              >
                📄 Copy Flyer Text
              </button>
              <details className="mt-4">
                <summary className="text-sm font-semibold text-warm-700 dark:text-warm-400 cursor-pointer">
                  How to print
                </summary>
                <ol className="list-decimal list-inside text-sm text-warm-600 dark:text-warm-400 mt-3 space-y-1">
                  <li>Click "Copy Flyer Text" above</li>
                  <li>Paste into a document (Word, Google Docs) or design tool</li>
                  <li>Format, add your logo, and print</li>
                </ol>
              </details>
            </div>
          </div>

          {/* SECTION 5: Share Card */}
          {user && user.guildXp !== undefined && (
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Share Card</h2>
              <p className="text-warm-700 dark:text-warm-300 mb-6">
                Download a ready-to-post image for social media
              </p>

              <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                {/* Theme selector */}
                <div className="mb-6">
                  <p className="text-sm font-semibold text-warm-700 dark:text-warm-400 mb-3">Choose Theme</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {SHARE_CARD_THEMES.map((theme) => {
                      const isLocked = theme.xpRequired > (user?.guildXp || 0);
                      const isSelected = selectedTheme === theme.id;
                      return (
                        <button
                          key={theme.id}
                          onClick={() => !isLocked && setSelectedTheme(theme.id)}
                          disabled={isLocked}
                          className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition ${
                            isSelected
                              ? 'border-amber-600 bg-amber-50 dark:bg-amber-900'
                              : isLocked
                              ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 opacity-50 cursor-not-allowed'
                              : 'border-warm-200 dark:border-gray-700 hover:border-amber-600'
                          }`}
                        >
                          <span className="text-2xl mb-1">{theme.icon}</span>
                          <p className="text-xs font-semibold text-warm-900 dark:text-warm-100">
                            {theme.name}
                          </p>
                          {isLocked && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                              {theme.xpRequired} XP
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Format selector */}
                <div className="mb-6">
                  <p className="text-sm font-semibold text-warm-700 dark:text-warm-400 mb-3">Choose Format</p>
                  <div className="flex gap-2 flex-wrap">
                    {['square', 'story', 'landscape', 'flyer'].map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setSelectedFormat(fmt)}
                        className={`px-4 py-2 rounded-lg font-medium transition text-sm ${
                          selectedFormat === fmt
                            ? 'bg-amber-600 text-white'
                            : 'bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-warm-100 hover:bg-warm-200'
                        }`}
                      >
                        {fmt.charAt(0).toUpperCase() + fmt.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                {sale && (
                  <div className="mb-6 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-xs text-warm-600 dark:text-warm-400 mb-3">Preview</p>
                    {shareCardLoading && (
                      <div className="w-full max-w-xs h-48 rounded-lg bg-warm-200 dark:bg-gray-600 animate-pulse" />
                    )}
                    {shareCardBlobUrl && (
                      <img
                        src={shareCardBlobUrl}
                        alt="Share card preview"
                        className="w-full max-w-xs rounded-lg"
                      />
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleShareCardDownload}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-3 px-4 rounded-lg font-medium transition"
                  >
                    ⬇️ Download Image
                  </button>
                  <button
                    onClick={handleShareCardCopy}
                    className="flex-1 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 text-warm-900 dark:text-warm-100 py-3 px-4 rounded-lg font-medium transition"
                  >
                    Copy Link Instead
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 6: How to Use */}
          <details className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
            <summary className="cursor-pointer font-semibold text-warm-900 dark:text-warm-100 text-lg">
              How to use these exports
            </summary>

            <div className="space-y-6 text-sm text-warm-600 dark:text-warm-400 mt-4">
              <div>
                <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">📋 EstateSales.NET</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click "Download" to save the CSV file</li>
                  <li>Go to EstateSales.NET and log in</li>
                  <li>Find "Upload Inventory" or "Bulk Import"</li>
                  <li>Select the CSV file and upload</li>
                  <li>Review and publish your items</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">👥 Facebook Marketplace</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click "Download" to save the item data file</li>
                  <li>Open Facebook Marketplace on Facebook.com or the app</li>
                  <li>Click "Create" → "List an item"</li>
                  <li>Use the item details in the file to fill in each listing manually</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-2">🏠 Craigslist</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click "Download" or "Copy" to get your text</li>
                  <li>Go to Craigslist.org → "Post to Classifieds"</li>
                  <li>Select your category</li>
                  <li>Paste the text into the description field</li>
                </ol>
              </div>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
